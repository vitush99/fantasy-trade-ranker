import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Button,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { getPersonalizedRankings } from '@/ranking_engine';

export default function RankingsScreen() {
  const [format, setFormat] = useState<'sf' | '1qb'>('sf');
  const [showPersonal, setShowPersonal] = useState(false);
  const [baseRankings, setBaseRankings] = useState([]);
  const [personalizedRankings, setPersonalizedRankings] = useState([]);

  const getPublicUrl = (filename: string) =>
    `https://storage.googleapis.com/fantasy-trade-ranker/ktc_data/${filename}`;

  const loadRankings = async () => {
    try {
      const filename = format === 'sf' ? 'ktc_rankings_sf.json' : 'ktc_rankings_1qb.json';
      const url = getPublicUrl(filename);
      const response = await fetch(url);
      const base = await response.json();

      const swipeData = await AsyncStorage.getItem('@swipe_history');
      const swipes = swipeData ? JSON.parse(swipeData) : [];

      setBaseRankings(base);
      const personal = getPersonalizedRankings(base, swipes);
      setPersonalizedRankings(personal);
    } catch (err) {
      console.error('🔥 Error loading rankings:', err);
    }
  };

  useEffect(() => {
    loadRankings();
  }, [format, showPersonal]);

  useFocusEffect(
    useCallback(() => {
      const checkForRefresh = async () => {
        const shouldRefresh = await AsyncStorage.getItem('@rankings_should_refresh');
        if (shouldRefresh === 'true') {
          await loadRankings();
          await AsyncStorage.setItem('@rankings_should_refresh', 'false');
        }
      };
      checkForRefresh();
    }, [format])
  );

  const dataToRender = showPersonal ? personalizedRankings : baseRankings;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, format === 'sf' && styles.active]}
          onPress={() => setFormat('sf')}
        >
          <Text style={styles.toggleText}>Superflex</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, format === '1qb' && styles.active]}
          onPress={() => setFormat('1qb')}
        >
          <Text style={styles.toggleText}>1QB</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginVertical: 10, alignItems: 'center' }}>
        <Button
          title={showPersonal ? 'Show KTC Rankings' : 'Show My Rankings'}
          onPress={() => setShowPersonal(prev => !prev)}
        />
      </View>

      <FlatList
        data={dataToRender}
        keyExtractor={(item) => `${item.rank}-${item.name}`}
        renderItem={({ item, index }) => {
          const newRank = index + 1;
          const originalRank = item.rank;
          const diff = originalRank - newRank;

          return (
            <View style={styles.item}>
              <Text style={styles.name}>
                {newRank}. {item.name} ({item.position} - {item.team}){' '}
                {showPersonal && (
                  <Text style={getChangeStyle(originalRank, newRank)}>
                    {diff > 0 ? `🔼 +${diff}` : diff < 0 ? `🔽 ${diff}` : '➖'}
                  </Text>
                )}
              </Text>
              <Text style={styles.subtext}>
                Age: {item.age} | Value:{' '}
                {showPersonal ? Math.round(item.adjustedValue) : item.value}
              </Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const getChangeStyle = (originalRank: number, newRank: number) => {
  if (originalRank > newRank) return { color: 'lightgreen' };
  if (originalRank < newRank) return { color: 'salmon' };
  return { color: 'gray' };
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 10,
  },
  toggleButton: {
    padding: 10,
    marginHorizontal: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#888',
  },
  active: {
    backgroundColor: '#444',
  },
  toggleText: {
    color: '#fff',
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  name: {
    color: '#fff',
    fontSize: 16,
  },
  subtext: {
    color: '#aaa',
    fontSize: 12,
  },
});
