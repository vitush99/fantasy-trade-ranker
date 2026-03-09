import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Swiper from 'react-native-deck-swiper';
import * as Haptics from 'expo-haptics';
import FastImage from 'react-native-fast-image';

import { savePersonalizedRankingsToFirestore } from '@utils/savePersonalizedRankings';
import { getAuth } from 'firebase/auth';
import { doc, setDoc, collection, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '@myfirebase';

import FiltersPanel from '@components/ui/FiltersPanel';
import CommentsPanel from '@components/ui/CommentsPanel';

import { usePlayerMeta } from '@hooks/usePlayerMeta';
import { useFilteredTrades } from '@hooks/useFilteredTrades';
import type { TradeFilters as FireFilters } from '@appTypes/trades';

const { width } = Dimensions.get('window');
const STORAGE_KEY = '@swipe_history';
const FILTER_KEY = '@selected_filters';

const DEFAULT_FILTERS = {
  qb: [],
  te: [],
  passTD: [],
  ppr: [],
  starters: [],
  teams: [],
};

const BATCH_THRESHOLD = 5;

/* ---------------- helpers ---------------- */
function debounce<T extends (...args: any[]) => void>(func: T, delay: number) {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}

// ---------- filter mapping helpers ----------
type HookFilterState = {
  format?: Array<'SF' | '1QB'>;
  tePremium?: Array<'none' | 'TE+' | 'TE++' | 'TE+++'>;
  ppr?: Array<0 | 0.5 | 1>;
  passTD?: Array<4 | 5 | 6>;
  teamCount?: Array<8 | 10 | 12 | 14 | 16>;
  starters?: number[];
};


const mapTe = (x: string): 'none' | 'TE+' | 'TE++' | 'TE+++' =>
  (x || '').toLowerCase() === 'none' ? 'none' : (x as 'TE+' | 'TE++' | 'TE+++');

const parseFloatLoose = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : undefined;
};

const parseIntLoose = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  const m = String(v).match(/-?\d+/);
  if (!m) return undefined;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : undefined;
};

function toHookFilters(f: any): HookFilterState {
  const pprVals = (f.ppr || [])
    .map(parseFloatLoose)
    .filter((x: number | undefined): x is 0 | 0.5 | 1 => x === 0 || x === 0.5 || x === 1);

  const tdVals = (f.passTD || [])
    .map(parseIntLoose)
    .filter((x: number | undefined): x is 4 | 5 | 6 => x === 4 || x === 5 || x === 6);

  const teamVals = (f.teams || [])
    .map(parseIntLoose)
    .filter((x: number | undefined): x is 8 | 10 | 12 | 14 | 16 => [8, 10, 12, 14, 16].includes(x as any));

  const starterVals = (f.starters || [])
    .map(parseIntLoose)
    .filter((x: number | undefined): x is number => typeof x === 'number');

  return {
    format: (f.qb || []).map((x: string) => (x === '1QB' ? '1QB' : 'SF')),
    tePremium: (f.te || []).map(mapTe),
    ppr: pprVals,
    passTD: tdVals,
    teamCount: teamVals,
    starters: starterVals,
  };
}

export async function getSafeFilters(): Promise<any> {
  try {
    const stored = await AsyncStorage.getItem(FILTER_KEY);
    if (stored) {
      return JSON.parse(stored);
    } else {
      await AsyncStorage.setItem(FILTER_KEY, JSON.stringify(DEFAULT_FILTERS));
      return DEFAULT_FILTERS;
    }
  } catch (err) {
    console.error('Failed to load filters:', err);
    return DEFAULT_FILTERS;
  }
}

/* ================= main ================= */
export default function SwipeScreen() {
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);

  const [inputText, setInputText] = useState('');
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useRef(debounce((text: string) => setSearchText(text), 250)).current;

  const { meta: mergedPlayerMap, ensureForNames, warmAllInBackground } = usePlayerMeta();
  const [hookFilters, setHookFilters] = useState<HookFilterState | undefined>(undefined);

  const router = useRouter();
  const swiperRef = useRef<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [outOfCards, setOutOfCards] = useState(false);
  const unsavedSwipeCount = useRef(0);

  // swipe glow
  const swipeX = useRef(new Animated.Value(0)).current;
  const glowOpacity = swipeX.interpolate({
    inputRange: [-200, -50, 0, 50, 200],
    outputRange: [0.6, 0.3, 0, 0.3, 0.6],
    extrapolate: 'clamp',
  });
  const glowColor = swipeX.interpolate({
    inputRange: [-150, 0, 150],
    outputRange: ['rgba(231,76,60,0.6)', 'transparent', 'rgba(39,174,96,0.6)'],
    extrapolate: 'clamp',
  });

  // read filters when screen focuses (and first mount)
  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        const f = await getSafeFilters();
        setHookFilters(toHookFilters(f));
      })();
    }, [])
  );

  useEffect(() => {
    (async () => {
      const f = await getSafeFilters();
      setHookFilters(toHookFilters(f));
    })();
  }, []);

  // map HookFilterState → Firestore TradeFilters for the hook
  const fireFilters: FireFilters | undefined = hookFilters
    ? {
        qb: hookFilters.format,
        te: hookFilters.tePremium,
        ppr: hookFilters.ppr,
        passTD: hookFilters.passTD,
        teams: hookFilters.teamCount,
        start: hookFilters.starters,
      }
    : undefined;

  // ✅ Firestore-filtered trades (warm from cache + server pagination)
  const {
    items,         // Trade[]
    loading,
    hasMore,
    loadMore,
  } = useFilteredTrades(fireFilters ?? {}, {
    pageSize: 25,
    orderField: 'lastVote',
    orderDir: 'desc',
    currentUserId: getAuth().currentUser?.uid ?? undefined,
  });

  const lowDeckInFlightRef = useRef(false);

  /* spinner derived from current items */
  const [displayedTrades, setDisplayedTrades] = useState<any[]>([]);
  const isFirstDeckEmpty = displayedTrades.length === 0;
  const shouldShowSpinner = loading && isFirstDeckEmpty;

  /* log state for debugging */
  useEffect(() => {
    console.log('[Swipe]', {
      displayed: displayedTrades.length,
      loading,
      hasMore,
      spinner: shouldShowSpinner,
      items: items.length,
    });
  }, [displayedTrades.length, loading, hasMore, shouldShowSpinner, items.length]);

  // Search + hide already swiped → derive display list from items
  useEffect(() => {
    (async () => {
      const historyRaw = await AsyncStorage.getItem(STORAGE_KEY);
      const swipedHistory = historyRaw ? JSON.parse(historyRaw) : [];
      const swipedSet = new Set(swipedHistory.map((t: any) => t.id));

      const filtered = (items || []).filter((trade: any) => {
        const notSwiped = !swipedSet.has(trade.id);
        const matchesSearch =
          searchText.trim() === '' ||
          [...(trade.sideA || []), ...(trade.sideB || [])].some((player: string) =>
            player.toLowerCase().includes(searchText.toLowerCase())
          );
        return notSwiped && matchesSearch;
      });

      console.log('[Swipe] items:', items.length, 'filteredAfterHistory+search:', filtered.length);

      setDisplayedTrades(filtered);
      setOutOfCards(filtered.length === 0);
      setCurrentIndex(0);
    })();
  }, [items, searchText]);

  // Hydrate player meta for the top of the deck + background warm
  useEffect(() => {
    const names: string[] = [];
    for (const t of displayedTrades.slice(0, 15)) {
      names.push(...(t.sideA || []), ...(t.sideB || []));
    }
    if (names.length) ensureForNames(Array.from(new Set(names)));

    const id = setTimeout(() => {
      warmAllInBackground();
    }, 450);
    return () => clearTimeout(id);
  }, [displayedTrades, ensureForNames, warmAllInBackground]);

  // Unified top-up: when deck is empty OR low, ask for more from server pager
  const topUpIfLow = useCallback(() => {
    if (!hasMore) return;
    if (displayedTrades.length >= 8 && displayedTrades.length !== 0) return;
    if (lowDeckInFlightRef.current) return;

    lowDeckInFlightRef.current = true;
    Promise.resolve(loadMore()).finally(() => {
      lowDeckInFlightRef.current = false;
    });
  }, [displayedTrades.length, hasMore, loadMore]);

  useEffect(() => {
    topUpIfLow();
  }, [displayedTrades.length, topUpIfLow]);

  /* Save rankings in small batches on blur */
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        if (unsavedSwipeCount.current > 0) {
          (async () => {
            const storedFilters = await AsyncStorage.getItem(FILTER_KEY);
            const f = storedFilters ? JSON.parse(storedFilters) : null;
            const format = f?.qb?.includes('1QB') && !f.qb.includes('SF') ? '1qb' : 'sf';
            savePersonalizedRankingsToFirestore(format);
            unsavedSwipeCount.current = 0;
          })();
        }
      };
    }, [])
  );

  // Reset deck immediately on filter change (server query will refetch)
  useEffect(() => {
    if (!hookFilters) return;
    setDisplayedTrades([]);
    setOutOfCards(false);
    setCurrentIndex(0);
  }, [hookFilters]);

  /* swipe handling (unchanged) */
  let isWritingCache = false;
  const appendSwipeToCache = async (newSwipe: any) => {
    while (isWritingCache) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    isWritingCache = true;
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: any[] = cached ? JSON.parse(cached) : [];
      const formatDate = (ts: Date) =>
        new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const swipeDate = formatDate(new Date(newSwipe.timestamp));
      const updated: any[] = [];
      let inserted = false;

      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (item.type === 'header' && item.date === swipeDate) {
          updated.push(item);
          updated.push({ ...newSwipe, type: 'swipe' });
          inserted = true;
          let j = i + 1;
          while (j < parsed.length && parsed[j].type === 'swipe') {
            updated.push(parsed[j]);
            j++;
          }
          i = j - 1;
        } else {
          updated.push(item);
        }
      }
      if (!inserted) {
        updated.unshift({ ...newSwipe, type: 'swipe' });
        updated.unshift({ type: 'header', date: swipeDate });
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } finally {
      isWritingCache = false;
    }
  };

  const handleSwipe = async (index: number, direction: 'Side A' | 'Side B') => {
    const trade = displayedTrades[index];
    if (!trade) return;

    const result = {
      id: trade.id,
      trade: `${(trade.sideA || []).join(' + ')} → ${(trade.sideB || []).join(' + ')}`,
      choice: direction,
      timestamp: new Date().toISOString(),
      settings: trade.settings,
    };

    await appendSwipeToCache(result);

    try {
      const user = getAuth().currentUser;
      if (!user) return;

      const swipesRef = doc(collection(db, 'users', user.uid, 'swipes'));
      await setDoc(swipesRef, result);

      const voteRef = doc(db, 'tradeVotes', trade.id);
      const metaRef = doc(db, 'trades', trade.id, 'meta', 'voteSummary');

      const voteUpdate = direction === 'Side A' ? { sideA: increment(1) } : { sideB: increment(1) };

      await Promise.all([
        setDoc(voteRef, voteUpdate, { merge: true }),
        setDoc(
          metaRef,
          { ...voteUpdate, totalVotes: increment(1), lastVote: serverTimestamp() },
          { merge: true }
        ),
      ]);

      unsavedSwipeCount.current += 1;
      if (unsavedSwipeCount.current >= BATCH_THRESHOLD) {
        const storedFilters = await AsyncStorage.getItem(FILTER_KEY);
        const f = storedFilters ? JSON.parse(storedFilters) : null;
        const format = f?.qb?.includes('1QB') && !f.qb.includes('SF') ? '1qb' : 'sf';
        savePersonalizedRankingsToFirestore(format);
        unsavedSwipeCount.current = 0;
      }
    } catch (err) {
      console.warn('Swipe save failed:', err);
    }
  };

  const getPositionColor = (pos: string) => {
    switch (pos) {
      case 'QB': return '#1E90FF';
      case 'RB': return '#28a745';
      case 'WR': return '#8e44ad';
      case 'TE': return '#e67e22';
      default: return '#666';
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <View style={styles.topBar}>
            <View style={styles.searchContainer}>
              <TextInput
                placeholder="Search player or pick"
                placeholderTextColor="#888"
                style={styles.searchInput}
                value={inputText}
                onChangeText={(text) => {
                  setInputText(text);
                  debouncedSearch(text);
                }}
              />
              {inputText.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setInputText('');
                    debouncedSearch('');
                  }}
                  style={styles.clearButton}
                >
                  <Ionicons name="close-circle" size={18} color="#888" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.filterButton} onPress={() => setFiltersVisible(true)}>
              <Ionicons name="options-outline" size={22} color="#007aff" />
            </TouchableOpacity>
          </View>

          <View style={styles.swiperWrapper}>
            {shouldShowSpinner ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color="#007aff" />
                <Text style={styles.loadingText}>Loading trades...</Text>
              </View>
            ) : outOfCards || displayedTrades.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>🎉 No more trades!</Text>
                <Text style={styles.emptySubText}>Try changing your filters to see more.</Text>
                <TouchableOpacity
                  style={styles.refreshButton}
                  onPress={() => setFiltersVisible(true)}
                >
                  <Text style={styles.refreshButtonText}>Refresh Filters</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Swiper
                ref={swiperRef}
                cards={displayedTrades}
                renderCard={(item: any) => {
                  if (!item) return null;
                  return (
                    <Animated.View
                      style={[styles.card, { shadowColor: glowColor as any, shadowOpacity: glowOpacity as any }]}
                    >
                      <View
                        style={{
                          backgroundColor: '#f9f9f9',
                          borderRadius: 12,
                          padding: 16,
                          shadowColor: '#000',
                          shadowOpacity: 0.05,
                          shadowRadius: 4,
                          shadowOffset: { width: 0, height: 2 },
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          {/* RECEIVES */}
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ fontWeight: '600', color: '#555', marginBottom: 8 }}>RECEIVES</Text>
                            {(item.sideA || []).map((player: string, i: number) => {
                              const info = mergedPlayerMap[player] ?? { headshotUrl: '', position: 'N/A', team: 'FA' };
                              const isPick =
                                info.position === 'PICK' ||
                                player.toLowerCase().includes('pick') ||
                                player.toLowerCase().includes('round');
                              const [first, ...rest] = player.split(' ');
                              const shortName = `${first?.[0] ?? ''}. ${rest.join(' ')}`;
                              return (
                                <View key={`a-${i}`} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                  {isPick ? (
                                    <Text style={{ fontSize: 15, fontWeight: '600' }}>{player}</Text>
                                  ) : (
                                    <>
                                      <FastImage
                                        source={{ uri: info.headshotUrl }}
                                        style={{ width: 36, height: 36, borderRadius: 18, marginRight: 8 }}
                                        resizeMode={FastImage.resizeMode.cover}
                                      />
                                      <View>
                                        <Text style={{ fontSize: 15, fontWeight: '600' }}>{shortName}</Text>
                                        <Text style={{ fontSize: 13, color: getPositionColor(info.position) }}>
                                          {info.position} — {info.team}
                                        </Text>
                                      </View>
                                    </>
                                  )}
                                </View>
                              );
                            })}
                          </View>

                          {/* SENDS */}
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={{ fontWeight: '600', color: '#555', marginBottom: 8 }}>SENDS</Text>
                            {(item.sideB || []).map((player: string, i: number) => {
                              const info = mergedPlayerMap[player] ?? { headshotUrl: '', position: 'N/A', team: 'FA' };
                              const isPick =
                                info.position === 'PICK' ||
                                player.toLowerCase().includes('pick') ||
                                player.toLowerCase().includes('round');
                              const [first, ...rest] = player.split(' ');
                              const shortName = `${first?.[0] ?? ''}. ${rest.join(' ')}`;
                              return (
                                <View key={`b-${i}`} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                  {isPick ? (
                                    <Text style={{ fontSize: 15, fontWeight: '600' }}>{player}</Text>
                                  ) : (
                                    <>
                                      <FastImage
                                        source={{ uri: info.headshotUrl }}
                                        style={{ width: 36, height: 36, borderRadius: 18, marginRight: 8 }}
                                        resizeMode={FastImage.resizeMode.cover}
                                      />
                                      <View>
                                        <Text style={{ fontSize: 15, fontWeight: '600' }}>{shortName}</Text>
                                        <Text style={{ fontSize: 13, color: getPositionColor(info.position) }}>
                                          {info.position} — {info.team}
                                        </Text>
                                      </View>
                                    </>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        </View>

                        <Text style={[styles.settingsText, { marginTop: 12, textAlign: 'center' }]}>
                          {item.settings?.qb} | {item.settings?.te} | {item.settings?.teams} Teams | Start {item.settings?.start} | {item.settings?.passTD}pt PassTD | {item.settings?.ppr} PPR
                        </Text>
                      </View>

                      {item.isUserSubmission && (
                        <Text
                          style={{
                            color: '#ff4500',
                            fontWeight: '600',
                            textAlign: 'center',
                            marginTop: 6,
                          }}
                        >
                          🔥 User Submitted Trade
                        </Text>
                      )}
                    </Animated.View>
                  );
                }}
                overlayLabels={{
                  left: {
                    title: 'REJECTED',
                    style: {
                      label: {
                        color: '#e74c3c',
                        fontSize: 40,
                        fontWeight: 'bold',
                        borderWidth: 4,
                        borderColor: '#e74c3c',
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 6,
                        opacity: 0.75,
                        transform: [{ rotate: '-12deg' }],
                        backgroundColor: 'transparent',
                      },
                      wrapper: {
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: -100,
                      },
                    },
                  },
                  right: {
                    title: 'ACCEPTED',
                    style: {
                      label: {
                        color: '#27ae60',
                        fontSize: 40,
                        fontWeight: 'bold',
                        borderWidth: 4,
                        borderColor: '#27ae60',
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 6,
                        opacity: 0.75,
                        transform: [{ rotate: '12deg' }],
                        backgroundColor: 'transparent',
                      },
                      wrapper: {
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: -100,
                      },
                    },
                  },
                }}
                animateOverlayLabelsOpacity
                onSwiping={(x) => swipeX.setValue(x)}
                onSwipedRight={(i) => {
                  swipeX.setValue(0);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  handleSwipe(i, 'Side A');
                  topUpIfLow(); // keep deck hot
                }}
                onSwipedLeft={(i) => {
                  swipeX.setValue(0);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  handleSwipe(i, 'Side B');
                  topUpIfLow();
                }}
                onSwipedAll={() => {
                  swipeX.setValue(0);
                  if (hasMore) {
                    loadMore();
                  } else {
                    setOutOfCards(true);
                  }
                }}
                onSwiped={(i) => {
                  setCurrentIndex(i + 1);
                  if (i + 5 >= displayedTrades.length) topUpIfLow();
                }}
                stackSize={3}
                backgroundColor="transparent"
                cardIndex={0}
                onTapCard={() => Keyboard.dismiss()}
              />
            )}
          </View>

          {/* swipe buttons */}
          <View style={styles.swipeButtonsContainer}>
            <TouchableOpacity
              style={[styles.swipeButton, { backgroundColor: '#f8d7da' }]}
              onPress={() => swiperRef.current?.swipeLeft()}
            >
              <Text style={styles.swipeButtonText}>❌</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.swipeButton, { backgroundColor: '#e2e3e5' }]}
              onPress={() => swiperRef.current?.swipeTop()}
            >
              <Text style={styles.swipeButtonText}>⏭</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.swipeButton, { backgroundColor: '#d4edda' }]}
              onPress={() => swiperRef.current?.swipeRight()}
            >
              <Text style={styles.swipeButtonText}>✅</Text>
            </TouchableOpacity>
          </View>

          {displayedTrades[currentIndex] && (
            <TouchableOpacity
              style={{
                position: 'absolute',
                bottom: 120,
                right: 44,
                backgroundColor: '#ffffffee',
                padding: 12,
                borderRadius: 28,
                elevation: 5,
              }}
              onPress={() => setCommentsVisible(true)}
            >
              <Text style={{ fontSize: 20 }}>💬</Text>
            </TouchableOpacity>
          )}
        </SafeAreaView>

        {/* Panels */}
        <FiltersPanel
          visible={filtersVisible}
          onClose={async () => {
            setFiltersVisible(false);
            await new Promise((r) => setTimeout(r, 50));
            const f = await getSafeFilters();
            const mapped = toHookFilters(f);
            console.log('[Filters -> hook]', f, '=>', mapped);
            setHookFilters(mapped);
          }}
        />
        <CommentsPanel
          visible={commentsVisible}
          onClose={() => setCommentsVisible(false)}
          tradeId={displayedTrades[currentIndex]?.id}
        />
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 30,
    paddingBottom: 8,
    backgroundColor: '#fff',
    zIndex: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#f1f1f1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    marginRight: 10,
  },
  filterButton: {
    padding: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
  },
  swiperWrapper: {
    flex: 1,
    paddingTop: 10,
    marginTop: -70,
  },
  card: {
    flex: 0.79,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    borderColor: '#ccc',
    borderWidth: 1,
    marginHorizontal: 10,
    marginVertical: 30,
  },
  settingsText: { textAlign: 'center', color: '#666', fontSize: 14, marginTop: 10 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, marginTop: 10 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  emptyText: { fontSize: 18, fontWeight: '600', marginBottom: 10 },
  emptySubText: { fontSize: 14, color: '#777' },
  refreshButton: { marginTop: 20, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#007aff' },
  refreshButtonText: { fontSize: 16, fontWeight: '600', color: '#007aff' },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f1f1',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  clearButton: { marginLeft: 6, padding: 4 },
  swipeButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  swipeButton: { borderRadius: 50, padding: 16 },
  swipeButtonText: { fontSize: 24 },
});
