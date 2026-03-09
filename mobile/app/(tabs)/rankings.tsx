import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@myfirebase';
import { fetchPlayerMap, PlayerInfo } from '@/data/dataloader';
import type { Player } from '@engine';
import FastImage from 'react-native-fast-image';

const ALL_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'Picks'] as const;

const RANKINGS_CACHE_KEYS = {
  sf_public: '@cached_rankings_base_sf',
  '1qb_public': '@cached_rankings_base_1qb',
  sf_personal: '@cached_rankings_personal_sf',
  '1qb_personal': '@cached_rankings_personal_1qb',
};
const UI_CACHE = {
  showPersonal: '@rankings_ui_showPersonal',
  isSuperflex: '@rankings_ui_isSuperflex',
  search: '@rankings_ui_search',
  positions: '@rankings_ui_positions',
};

const rankingsCache: Record<string, Player[]> = {};

/** Debounce hook (no extra deps) */
function useDebounced<T>(value: T, delay = 220) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export default function RankingsScreen() {
  const [isSuperflex, setIsSuperflex] = useState(true);
  const [format, setFormat] = useState<'sf' | '1qb'>('sf');
  const [showPersonal, setShowPersonal] = useState(true);
  const [baseRankings, setBaseRankings] = useState<Player[]>([]);
  const [personalizedRankings, setPersonalizedRankings] = useState<Player[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [positions, setPositions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [playerMap, setPlayerMap] = useState<Record<string, PlayerInfo>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { setFormat(isSuperflex ? 'sf' : '1qb'); }, [isSuperflex]);

  // restore UI state on mount
  useEffect(() => {
    (async () => {
      const [sp, sf, s, pos] = await Promise.all([
        AsyncStorage.getItem(UI_CACHE.showPersonal),
        AsyncStorage.getItem(UI_CACHE.isSuperflex),
        AsyncStorage.getItem(UI_CACHE.search),
        AsyncStorage.getItem(UI_CACHE.positions),
      ]);
      if (sp !== null) setShowPersonal(sp === 'true');
      if (sf !== null) setIsSuperflex(sf === 'true');
      if (s !== null) setSearch(s);
      if (pos) setPositions(JSON.parse(pos));
    })();
  }, []);

  // persist UI state
  useEffect(() => { AsyncStorage.setItem(UI_CACHE.showPersonal, String(showPersonal)); }, [showPersonal]);
  useEffect(() => { AsyncStorage.setItem(UI_CACHE.isSuperflex, String(isSuperflex)); }, [isSuperflex]);
  useEffect(() => { AsyncStorage.setItem(UI_CACHE.search, search); }, [search]);
  useEffect(() => { AsyncStorage.setItem(UI_CACHE.positions, JSON.stringify(positions)); }, [positions]);

  const preloadAllVariants = useCallback(async () => {
    const auth = getAuth();
    const uid = auth.currentUser?.uid;

    const fetchAndCache = async (key: string, path: any) => {
      // warm from cache for instant paint
      const cached = await AsyncStorage.getItem(key);
      if (cached) rankingsCache[key] = JSON.parse(cached);

      const snap = await getDoc(path);
      const players = snap.exists() ? (snap.data() as any).players ?? [] : [];
      rankingsCache[key] = players;
      await AsyncStorage.setItem(key, JSON.stringify(players));

      // grab updatedAt when reading the public doc for this format
      if (key.endsWith('_public') && snap.exists()) {
        const ts = (snap.data() as any).updatedAt as Timestamp | undefined;
        setLastUpdated(ts ? ts.toDate() : null);
      }
    };

    const tasks = [
      fetchAndCache(RANKINGS_CACHE_KEYS['sf_public'], doc(db, 'rankings', 'sf')),
      fetchAndCache(RANKINGS_CACHE_KEYS['1qb_public'], doc(db, 'rankings', '1qb')),
    ];

    if (uid) {
      tasks.push(
        fetchAndCache(RANKINGS_CACHE_KEYS['sf_personal'], doc(db, 'users', uid, 'rankings', 'sf')),
        fetchAndCache(RANKINGS_CACHE_KEYS['1qb_personal'], doc(db, 'users', uid, 'rankings', '1qb')),
      );
    }

    await Promise.all(tasks);
  }, []);

  const load = useCallback(async () => {
    let spinnerTimeout: ReturnType<typeof setTimeout> | null = null;
    spinnerTimeout = setTimeout(() => setIsLoading(true), 300);

    const pmap = await fetchPlayerMap();
    setPlayerMap(pmap);

    await preloadAllVariants();

    const augment = (players: Player[]): Player[] =>
      players.map((p) => ({ ...p, headshotUrl: pmap[p.name]?.headshotUrl ?? '' }));

    const baseKey = RANKINGS_CACHE_KEYS[`${format}_public`];
    const personalKey = RANKINGS_CACHE_KEYS[`${format}_personal`];
    setBaseRankings(augment(rankingsCache[baseKey] ?? []));
    setPersonalizedRankings(augment(rankingsCache[personalKey] ?? []));

    if (spinnerTimeout) clearTimeout(spinnerTimeout);
    setIsLoading(false);
  }, [format, preloadAllVariants]);

  useEffect(() => { load(); }, [load, showPersonal]);

  // manual refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await preloadAllVariants();
    await load();
    setRefreshing(false);
  }, [preloadAllVariants, load]);

  // flip-to-refresh when another screen asks us to
  useFocusEffect(
    useCallback(() => {
      const checkForRefresh = async () => {
        const should = await AsyncStorage.getItem('@rankings_should_refresh');
        if (should === 'true') {
          await onRefresh();
          await AsyncStorage.setItem('@rankings_should_refresh', 'false');
        }
      };
      checkForRefresh();
    }, [onRefresh])
  );

  const applyFilters = useCallback((list: Player[], preserveOriginalOrder = false) => {
    const filtered = list.filter((player) => {
      const matchesSearch = player.name.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesPosition =
        positions.length === 0 ||
        positions.includes(player.position.toUpperCase()) ||
        (player.position.toUpperCase() === 'PICK' && positions.includes('Picks'));
      return matchesSearch && matchesPosition;
    });
    return preserveOriginalOrder ? filtered : [...filtered].sort((a, b) => a.rank - b.rank);
  }, [debouncedSearch, positions]);

  const filteredBase = useMemo(() => applyFilters(baseRankings), [baseRankings, applyFilters]);
  const filteredPersonal = useMemo(
    () => applyFilters(personalizedRankings, true),
    [personalizedRankings, applyFilters]
  );

  // position chips helpers
  const togglePosition = (pos: string) => {
    setPositions((prev) => prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]);
  };
  const setAll = () => setPositions(ALL_POSITIONS.slice() as unknown as string[]);
  const setNone = () => setPositions([]);

  const data = showPersonal ? filteredPersonal : filteredBase;

  const getItemLayout = useCallback((_: any, index: number) => {
    // approx row height for fast scrolling
    const ROW_H = 64;
    return { length: ROW_H, offset: ROW_H * index, index };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top toggle */}
      <View style={styles.toggleWrapper}>
        <View style={styles.toggleContainer}>
          <TogglePill label="My Rankings" active={showPersonal} onPress={() => setShowPersonal(true)} />
          <TogglePill label="Public Rankings" active={!showPersonal} onPress={() => setShowPersonal(false)} />
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <TextInput
          placeholder="Search player"
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filters + SF */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {ALL_POSITIONS.map((pos) => {
            const selected = positions.includes(pos);
            return (
              <TouchableOpacity key={pos} onPress={() => togglePosition(pos)} style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{pos}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.sfToggleContainer}>
          <Text style={styles.sfToggleLabel}>Superflex</Text>
          <TouchableOpacity
            accessibilityRole="switch"
            accessibilityState={{ checked: isSuperflex }}
            style={[styles.sfToggleWrapper, isSuperflex ? styles.sfOn : styles.sfOff]}
            onPress={() => setIsSuperflex((prev) => !prev)}
          >
            <Text style={[styles.sfToggleText, isSuperflex && styles.sfToggleTextOn]}>
              {isSuperflex ? 'On' : 'Off'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Last updated */}
      {lastUpdated && (
        <Text style={styles.updatedAt}>
          Last updated {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(lastUpdated)}
        </Text>
      )}

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#007aff" /></View>
      ) : (
        <>
          {showPersonal && filteredPersonal.length === 0 && (
            <Text style={styles.tip}>Swipe on some trades to generate your personalized rankings!</Text>
          )}
          <FlatList
            data={data}
            keyExtractor={(item) => `${item.rank}-${item.name}`}
            renderItem={({ item }) => {
              const isPersonal = showPersonal;

              // “delta chip” vs public
              let deltaEl: React.ReactNode = <DeltaChip kind="flat" amount={0} />;
              if (isPersonal) {
                const baseIdx = filteredBase.findIndex((p) => p.name === item.name);
                const personalIdx = filteredPersonal.findIndex((p) => p.name === item.name);
                if (baseIdx !== -1 && personalIdx !== -1) {
                  const diff = baseIdx - personalIdx; // positive = moved up
                  deltaEl =
                    diff > 0 ? <DeltaChip kind="up" amount={diff} /> :
                    diff < 0 ? <DeltaChip kind="down" amount={-diff} /> :
                    <DeltaChip kind="flat" amount={0} />;
                }
              }

              // rank numbering
              const displayedRank = isPersonal
                ? personalizedRankings.findIndex((p) => p.name === item.name) + 1
                : item.rank;

              return (
                <View style={styles.itemRow}>
                  {item.headshotUrl ? (
                    <FastImage
                      source={{ uri: item.headshotUrl, cache: FastImage.cacheControl.immutable, priority: FastImage.priority.normal }}
                      style={styles.headshot}
                      resizeMode={FastImage.resizeMode.cover}
                    />
                  ) : (
                    <View style={styles.headshotPlaceholder} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {displayedRank}. {item.name} ({item.position} – {item.team}) {deltaEl}
                    </Text>
                    <Text style={styles.subtext}>
                      Age: {item.age} | Value: {isPersonal ? Math.round(item.adjustedValue ?? item.value) : item.value}
                    </Text>
                  </View>
                </View>
              );
            }}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={8}
            removeClippedSubviews
            getItemLayout={getItemLayout}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        </>
      )}
    </SafeAreaView>
  );
}

/* ========== Small UI bits ========== */

function TogglePill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.toggleButton, active && styles.toggleSelected]} onPress={onPress}>
      <Text style={[styles.toggleText, active && styles.toggleTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function QuickChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, styles.quickChip]}>
      <Text style={styles.chipText}>{label}</Text>
    </TouchableOpacity>
  );
}

function DeltaChip({ kind, amount }: { kind: 'up' | 'down' | 'flat'; amount: number }) {
  if (kind === 'up') return <Text style={styles.deltaUp}>▲ +{amount}</Text>;
  if (kind === 'down') return <Text style={styles.deltaDown}>▼ -{amount}</Text>;
  return <Text style={styles.deltaFlat}>—</Text>;
}

/* ========== Styles ========== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  toggleWrapper: { paddingHorizontal: 20, paddingTop: 10 },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    padding: 6,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 7,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 2,
    borderRadius: 999,
    alignItems: 'center',
  },
  toggleSelected: { backgroundColor: '#d1e7ff' },
  toggleText: { fontSize: 13, color: '#333' },
  toggleTextSelected: { fontWeight: '600', color: '#0056b3' },

  searchWrapper: { paddingHorizontal: 20, marginBottom: 8 },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  chipRow: { flexDirection: 'row', flexGrow: 1, marginRight: 2 },
  chip: {
    backgroundColor: '#eee',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  quickChip: { backgroundColor: '#f2f2f2' },
  chipSelected: {
    backgroundColor: '#d1e7ff',
    borderColor: '#0077ff',
    borderWidth: 1,
  },
  chipText: { fontSize: 13, color: '#333' },
  chipTextSelected: { fontWeight: '600', color: '#0056b3' },

  sfToggleContainer: { flexDirection: 'row', alignItems: 'center' },
  sfToggleLabel: { fontSize: 13, marginRight: 6, color: '#333', fontWeight: '500' },
  sfToggleWrapper: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sfOn: { backgroundColor: '#d1e7ff' },
  sfOff: { backgroundColor: '#f8d7da' },
  sfToggleText: { fontSize: 13, fontWeight: '600', color: '#333' },
  sfToggleTextOn: { color: '#0056b3' },

  updatedAt: {
    textAlign: 'center',
    color: '#777',
    fontSize: 12,
    marginBottom: 4,
  },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tip: { textAlign: 'center', color: '#888', marginTop: 8, marginBottom: 4 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fdfdfd',
  },
  headshot: { width: 32, height: 32, borderRadius: 12, marginRight: 12 },
  headshotPlaceholder: { width: 32, height: 32, borderRadius: 12, marginRight: 12, backgroundColor: 'transparent' },

  name: { color: '#111', fontSize: 16, fontWeight: '500' },
  subtext: { color: '#555', fontSize: 12, marginTop: 4 },

  deltaUp: {
    backgroundColor: '#e8f7ee',
    color: '#2e7d32',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    marginLeft: 6,
    fontSize: 15,
    fontWeight: '700',
  },
  deltaDown: {
    backgroundColor: '#fdecea',
    color: '#d32f2f',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    marginLeft: 6,
    fontSize: 15,
    fontWeight: '700',
  },
  deltaFlat: {

  },
});
