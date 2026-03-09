import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

const FILTER_KEY = '@selected_filters';

const ALL_QB = ['SF', '1QB'] as const;
const ALL_TE = ['none', 'TE+', 'TE++', 'TE+++'] as const;
const ALL_PASS_TD = ['4', '5', '6'] as const;
const ALL_PPR = ['0', '0.5', '1', 'Tiered'] as const;
const ALL_TEAMS = [8, 10, 12, 14, 16] as const;
const ALL_STARTERS = [8, 9, 10, 11, 12] as const;

type Filters = {
  qb: ('SF' | '1QB')[];
  te: string[];
  passTD: string[];
  ppr: string[];
  teams: number[];
  starters: number[];
};

const screenW = Dimensions.get('window').width;

export default function FiltersPanel({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  // ✅ defaults: ALL EMPTY (no constraints)
  const [qb, setQb] = useState<('SF' | '1QB')[]>([]);
  const [ppr, setPpr] = useState<string[]>([]);
  const [passTD, setPassTD] = useState<string[]>([]);
  const [te, setTe] = useState<string[]>([]);
  const [teams, setTeams] = useState<number[]>([]);
  const [starters, setStarters] = useState<number[]>([]);

  // slide-in
  const translateX = useSharedValue(screenW);
  const backdropOpacity = useSharedValue(0);

  // Load saved filters exactly as saved; do not auto-select QB
  useEffect(() => {
    const loadFilters = async () => {
      const stored = await AsyncStorage.getItem(FILTER_KEY);
      if (stored) {
        const parsed: Filters = JSON.parse(stored);
        setQb((parsed.qb ?? []) as ('SF' | '1QB')[]);
        setTe(parsed.te ?? []);
        setPassTD(parsed.passTD ?? []);
        setPpr(parsed.ppr ?? []);
        setTeams(parsed.teams ?? []);
        setStarters(parsed.starters ?? []);
      }
    };
    loadFilters();
  }, []);

  useEffect(() => {
    if (visible) {
      translateX.value = withTiming(0, { duration: 320 });
      backdropOpacity.value = withTiming(0.5, { duration: 320 });
    } else {
      translateX.value = withTiming(screenW, { duration: 260 });
      backdropOpacity.value = withTiming(0, { duration: 220 });
    }
  }, [visible]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const currentFilters = (): Filters => ({
    qb,
    te,
    passTD,
    ppr,
    teams,
    starters,
  });

  const save = async (partial?: Partial<Filters>) => {
    const next = { ...currentFilters(), ...(partial ?? {}) } as Filters;
    await AsyncStorage.setItem(FILTER_KEY, JSON.stringify(next));
  };

  // generic chip toggler — no auto-reselect when empty
  const toggleChip = <T,>(
    value: T,
    selected: T[],
    setter: (v: T[]) => void,
    key: keyof Filters
  ) => {
    const updated = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];

    setter(updated);
    save({ [key]: updated } as Partial<Filters>);
  };

  // presets (unchanged)
  const applyPreset = (preset: 'sf_12_1ppr' | 'oneqb_12_half' | 'sf_14_teplus') => {
    if (preset === 'sf_12_1ppr') {
      setQb(['SF']); setTeams([12]); setPpr(['1']); setPassTD([]); setTe([]); setStarters([]);
      save({ qb: ['SF'], teams: [12], ppr: ['1'], passTD: [], te: [], starters: [] });
    } else if (preset === 'oneqb_12_half') {
      setQb(['1QB']); setTeams([12]); setPpr(['0.5']); setPassTD([]); setTe([]); setStarters([]);
      save({ qb: ['1QB'], teams: [12], ppr: ['0.5'], passTD: [], te: [], starters: [] });
    } else if (preset === 'sf_14_teplus') {
      setQb(['SF']); setTeams([14]); setPpr(['1']); setTe(['TE+']); setPassTD([]); setStarters([]);
      save({ qb: ['SF'], teams: [14], ppr: ['1'], te: ['TE+'], passTD: [], starters: [] });
    }
  };

  // ✅ Reset = all empty
  const resetAll = async () => {
    const EMPTY: Filters = { qb: [], te: [], passTD: [], ppr: [], teams: [], starters: [] };
    setQb([]); setTe([]); setPassTD([]); setPpr([]); setTeams([]); setStarters([]);
    await AsyncStorage.setItem(FILTER_KEY, JSON.stringify(EMPTY));
    onClose();
  };

  // options typed as ReadonlyArray<T> so const tuples work without casts
  const renderChips = <T,>(
    options: ReadonlyArray<T>,
    selected: T[],
    onToggle: (val: T) => void
  ) => (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const s = selected.includes(option as T);
        return (
          <Pressable
            key={String(option)}
            onPress={() => onToggle(option as T)}
            style={({ pressed }) => [
              styles.chip,
              s && styles.chipSelected,
              pressed && styles.chipPressed,
            ]}
          >
            <Text style={[styles.chipText, s && styles.chipTextSelected]}>
              {String(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <>
      {visible && (
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </Pressable>
      )}

      <Animated.View style={[styles.panel, panelStyle]}>
        <SafeAreaView style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Filters</Text>
          </View>

          {/* Presets */}
          <View style={styles.presetsRow}>
            <Text style={styles.presetLabel}>Presets</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
              <Pressable onPress={() => applyPreset('sf_12_1ppr')} style={({ pressed }) => [styles.presetChip, pressed && styles.chipPressed]}>
                <Text style={styles.presetText}>SF • 12T • 1 PPR</Text>
              </Pressable>
              <Pressable onPress={() => applyPreset('oneqb_12_half')} style={({ pressed }) => [styles.presetChip, pressed && styles.chipPressed]}>
                <Text style={styles.presetText}>1QB • 12T • 0.5 PPR</Text>
              </Pressable>
              <Pressable onPress={() => applyPreset('sf_14_teplus')} style={({ pressed }) => [styles.presetChip, pressed && styles.chipPressed]}>
                <Text style={styles.presetText}>SF • 14T • TE+</Text>
              </Pressable>
            </ScrollView>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* QB format */}
            <View style={styles.filterSection}>
              <Text style={styles.heading}>QB Format</Text>
              {renderChips(ALL_QB, qb, (v) => toggleChip(v, qb, setQb, 'qb'))}
            </View>

            {/* PPR */}
            <View style={styles.filterSection}>
              <Text style={styles.heading}>PPR</Text>
              {renderChips(ALL_PPR, ppr, (v) => toggleChip(v, ppr, setPpr, 'ppr'))}
            </View>

            {/* Teams */}
            <View style={styles.filterSection}>
              <Text style={styles.heading}>Teams</Text>
              {renderChips(ALL_TEAMS, teams, (v) => toggleChip(v, teams, setTeams, 'teams'))}
            </View>

            {/* Starters */}
            <View style={styles.filterSection}>
              <Text style={styles.heading}>Starters</Text>
              {renderChips(ALL_STARTERS, starters, (v) => toggleChip(v, starters, setStarters, 'starters'))}
            </View>

            {/* Pass TD */}
            <View style={styles.filterSection}>
              <Text style={styles.heading}>Pass TD Points</Text>
              {renderChips(ALL_PASS_TD, passTD, (v) => toggleChip(v, passTD, setPassTD, 'passTD'))}
            </View>

            {/* TE Premium */}
            <View style={styles.filterSection}>
              <Text style={styles.heading}>TE Premium</Text>
              {renderChips(ALL_TE, te, (v) => toggleChip(v, te, setTe, 'te'))}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable style={styles.applyButton} onPress={onClose}>
              <Text style={styles.buttonText}>Apply Filters</Text>
            </Pressable>
            <Pressable style={styles.resetButton} onPress={resetAll}>
              <Text style={styles.buttonText}>Reset Filters</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'black' },
  panel: {
    position: 'absolute',
    top: 0, bottom: 0, right: 0, left: 0,
    backgroundColor: '#fdfdfd',
    zIndex: 1000,
    paddingTop: Platform.select({ ios: 6, android: 0 }),
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 10,
  },
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 6,
  },
  closeButton: { position: 'absolute', left: 16, top: 12, padding: 6 },
  closeButtonText: { fontSize: 22, color: '#000' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#000' },

  presetsRow: { paddingHorizontal: 16, paddingBottom: 6 },
  presetLabel: { fontSize: 13, color: '#555', marginBottom: 6, fontWeight: '600' },
  presetChip: {
    backgroundColor: '#eef2ff',
    borderColor: '#c7d2fe',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
  },
  presetText: { color: '#2563eb', fontWeight: '600', fontSize: 12 },

  scrollContent: { paddingBottom: 150 },
  filterSection: { paddingHorizontal: 16, marginBottom: 10 },
  heading: { fontWeight: '600', fontSize: 16, marginBottom: 6 },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    columnGap: 8,
    alignItems: 'center',
    paddingVertical: 2,
  },
  chip: {
    backgroundColor: '#eee',
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 58,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipSelected: { backgroundColor: '#d1e7ff', borderColor: '#0077ff' },
  chipPressed: { opacity: 0.7 },
  chipText: { fontSize: 13.5, color: '#333' },
  chipTextSelected: { fontWeight: '700', color: '#0056b3' },

  helperText: { marginTop: 6, color: '#777', fontSize: 12 },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    gap: 10,
  },
  applyButton: {
    backgroundColor: '#0077ff',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  resetButton: {
    backgroundColor: '#e74c3c',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
