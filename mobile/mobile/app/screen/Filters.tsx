import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, Button, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const FILTER_KEY = '@selected_filters';

const ALL_QB = ['SF', '1QB'];
const ALL_TE = ['none', 'TE+', 'TE++', 'TE+++'];
const ALL_PASS_TD = ['4', '5', '6'];
const ALL_PPR = ['0', '0.5', '1', 'Tiered'];
const ALL_TEAMS = [8, 10, 12, 14, 16];
const ALL_STARTERS = [8, 9, 10, 11, 12];

export default function FiltersScreen() {
  const router = useRouter();

  const [qb, setQb] = useState<string[]>(ALL_QB);
  const [te, setTe] = useState<string[]>(ALL_TE);
  const [passTD, setPassTD] = useState<string[]>(ALL_PASS_TD);
  const [ppr, setPpr] = useState<string[]>(ALL_PPR);
  const [teams, setTeams] = useState<number[]>([]);
  const [starters, setStarters] = useState<number[]>([]);

  useEffect(() => {
    const loadFilters = async () => {
      const stored = await AsyncStorage.getItem(FILTER_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setQb(parsed.qb || ALL_QB);
        setTe(parsed.te || ALL_TE);
        setPassTD(parsed.passTD || ALL_PASS_TD);
        setPpr(parsed.ppr || ALL_PPR);
        setTeams(parsed.teams || []);
        setStarters(parsed.starters || []);
      }
    };
    loadFilters();
  }, []);

  const saveFilters = async (filters: any) => {
    await AsyncStorage.setItem(FILTER_KEY, JSON.stringify(filters));
  };

  const toggleMultiSelect = (value: any, selected: any[], setter: (v: any[]) => void, key: string) => {
    let updated = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];

    if (updated.length === 0) {
      if (key === 'qb') updated = ['SF'];
      if (key === 'te') updated = ['none'];
      if (key === 'passTD') updated = ['4'];
      if (key === 'ppr') updated = ['1'];
    }

    setter(updated);

    const current = {
      qb: key === 'qb' ? updated : qb,
      te: key === 'te' ? updated : te,
      passTD: key === 'passTD' ? updated : passTD,
      ppr: key === 'ppr' ? updated : ppr,
      teams: key === 'teams' ? updated : teams,
      starters: key === 'starters' ? updated : starters,
    };

    saveFilters(current);
  };

  const resetFilters = async () => {
    const defaultFilters = {
      qb: ALL_QB,
      te: ALL_TE,
      passTD: ALL_PASS_TD,
      ppr: ALL_PPR,
      teams: [],
      starters: [],
    };
    await AsyncStorage.setItem(FILTER_KEY, JSON.stringify(defaultFilters));
    router.back();
  };

  const renderChips = (options: any[], selected: any[], onToggle: (val: any) => void) => (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const selectedMatch = selected.includes(option);
        return (
          <Pressable
            key={option}
            onPress={() => onToggle(option)}
            style={({ pressed }) => [
              styles.chip,
              selectedMatch && styles.chipSelected,
              pressed && styles.chipPressed,
            ]}
          >
            <Text
              style={[styles.chipText, selectedMatch && styles.chipTextSelected]}
            >
              {String(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Filters</Text>
      </View>

      <ScrollView>
        <View style={styles.filterSection}>
          <Text style={styles.heading}>QB Format</Text>
          {renderChips(ALL_QB, qb, (val) => toggleMultiSelect(val, qb, setQb, 'qb'))}
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.heading}>TE Premium</Text>
          {renderChips(ALL_TE, te, (val) => toggleMultiSelect(val, te, setTe, 'te'))}
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.heading}>Pass TD Points</Text>
          {renderChips(ALL_PASS_TD, passTD, (val) => toggleMultiSelect(val, passTD, setPassTD, 'passTD'))}
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.heading}>PPR</Text>
          {renderChips(ALL_PPR, ppr, (val) => toggleMultiSelect(val, ppr, setPpr, 'ppr'))}
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.heading}>Teams</Text>
          {renderChips(ALL_TEAMS, teams, (val) => toggleMultiSelect(val, teams, setTeams, 'teams'))}
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.heading}>Starters</Text>
          {renderChips(ALL_STARTERS, starters, (val) => toggleMultiSelect(val, starters, setStarters, 'starters'))}
        </View>

        <View style={styles.resetWrapper}>
          <Button title="Reset Filters" color="crimson" onPress={resetFilters} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 10,
  },
  closeButton: {
    position: 'absolute',
    left: 20,
    top: 16,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#000',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },

  filterSection: {
    paddingHorizontal: 20,
    marginBottom: 7,
  },

  heading: {
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 4,
    marginTop: 5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 5,
  },
  chip: {
    backgroundColor: '#eee',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 10,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: '#d1e7ff',
    borderColor: '#0077ff',
    borderWidth: 1,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    fontSize: 14,
    color: '#333',
  },
  chipTextSelected: {
    fontWeight: 'bold',
    color: '#0056b3',
  },

  resetWrapper: {
    marginTop: 30,
    alignItems: 'center',
  },
});
