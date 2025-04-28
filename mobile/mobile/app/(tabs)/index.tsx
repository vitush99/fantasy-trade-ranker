import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Swiper from 'react-native-deck-swiper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { fetchTrades } from '@/data/dataLoader';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const STORAGE_KEY = '@swipe_history';
const FILTER_KEY = '@selected_filters';

export default function SwipeScreen() {
  const [filteredTrades, setFilteredTrades] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function applyFilters(trades: any[], filters: any, swipedHistory: any[]) {
    const swipedSet = new Set(swipedHistory.map((t) => `${t.trade}`));

    return trades.filter((trade) => {
      const s = trade.settings;

      const qbMatch = !filters.qb || filters.qb.includes(s.qb);
      const teMatch = !filters.te || filters.te.includes(s.te);
      const passTDMatch = !filters.passTD || filters.passTD.includes(String(s.passTD));
      const pprMatch =
        !filters.ppr ||
        filters.ppr.includes(typeof s.ppr === 'string' ? s.ppr : String(s.ppr));
      const startersMatch =
        !filters.starters || filters.starters.length === 0 || filters.starters.includes(s.start);
      const teamsMatch =
        !filters.teams || filters.teams.length === 0 || filters.teams.includes(s.teams);

      const tradeString = `${trade.sideA.join(' + ')} → ${trade.sideB.join(' + ')}`;
      const notSwiped = !swipedSet.has(tradeString);

      return qbMatch && teMatch && passTDMatch && pprMatch && startersMatch && teamsMatch && notSwiped;
    });
  }

  useFocusEffect(
    React.useCallback(() => {
      const loadTrades = async () => {
        try {
          setIsLoading(true);
          setError(null);

          const data = await fetchTrades();
          const storedFilters = await AsyncStorage.getItem(FILTER_KEY);
          const filters = storedFilters ? JSON.parse(storedFilters) : null;
          const historyRaw = await AsyncStorage.getItem(STORAGE_KEY);
          const swipeHistory = historyRaw ? JSON.parse(historyRaw) : [];

          const filtered = filters
            ? applyFilters(data, filters, swipeHistory)
            : data;

          setFilteredTrades(filtered);
          setCurrentIndex(0);
        } catch (err) {
          console.error('🔥 Error loading trades:', err);
          setError('Failed to load trades. Please check your internet connection.');
        } finally {
          setIsLoading(false);
        }
      };

      loadTrades();
    }, [])
  );

  const handleSwipe = async (cardIndex: number, direction: string) => {
    const trade = filteredTrades[cardIndex];
    const result = {
      trade: `${trade.sideA.join(' + ')} → ${trade.sideB.join(' + ')}`,
      choice: direction === 'right' ? 'Side B' : 'Side A',
      timestamp: new Date().toISOString(),
      settings: trade.settings,
    };

    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    const currentHistory = existing ? JSON.parse(existing) : [];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...currentHistory, result]));
    setCurrentIndex((prev) => prev + 1);
  };

  const allSwiped = currentIndex >= filteredTrades.length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.swiperWrapper}>
        <TouchableOpacity
          style={styles.floatingFilterButton}
          onPress={() => router.push('/screen/Filters')}
        >
          <Ionicons name="options-outline" size={22} color="#007aff" />
        </TouchableOpacity>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#007aff" />
            <Text style={styles.loadingText}>Loading trades...</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => router.push('/screen/Filters')}>
              <Text style={styles.retryButton}>Change Filters</Text>
            </TouchableOpacity>
          </View>
        ) : filteredTrades.length === 0 || allSwiped ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>🎉 No more trades!</Text>
            <Text style={styles.emptySubText}>Try changing your filters to see more.</Text>

            <TouchableOpacity style={styles.refreshButton} onPress={() => router.push('/screen/Filters')}>
              <Text style={styles.refreshButtonText}>Refresh Filters</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Swiper
            cards={filteredTrades}
            renderCard={(card) => (
              <View style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.column}>
                    {card.sideA.map((item: string, idx: number) => (
                      <Text key={`a-${idx}`} style={styles.itemText}>{item}</Text>
                    ))}
                  </View>
                  <View style={styles.column}>
                    {card.sideB.map((item: string, idx: number) => (
                      <Text key={`b-${idx}`} style={styles.itemText}>{item}</Text>
                    ))}
                  </View>
                </View>
                <View style={styles.settings}>
                  <Text style={styles.settingsText}>
                    {card.settings.qb} | {card.settings.te} | {card.settings.teams} Teams | Start {card.settings.start} | {card.settings.passTD}pt PassTD | {card.settings.ppr} PPR
                  </Text>
                </View>
              </View>
            )}
            onSwipedLeft={(index) => handleSwipe(index, 'left')}
            onSwipedRight={(index) => handleSwipe(index, 'right')}
            backgroundColor="transparent"
            cardIndex={0}
            stackSize={3}
            disableTopSwipe
            disableBottomSwipe
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  swiperWrapper: { flex: 1, justifyContent: 'center' },
  card: {
    flex: 0.7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f9f9f9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  column: {
    flex: 1,
    paddingHorizontal: 10,
  },
  itemText: {
    color: '#222',
    fontSize: 18,
    marginBottom: 4,
    textAlign: 'center',
  },
  settings: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 10,
    marginTop: 10,
  },
  settingsText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  floatingFilterButton: {
    position: 'absolute',
    top: 10,
    right: 30,
    zIndex: 10,
    backgroundColor: '#e0e0e0',
    padding: 10,
    borderRadius: 5,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptySubText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#555',
    marginTop: 10,
  },
  errorText: {
    fontSize: 16,
    color: 'crimson',
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    color: '#007aff',
    fontSize: 16,
    fontWeight: '600',
  },
  refreshButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007aff',
  },
  refreshButtonText: {
    color: '#007aff',
    fontSize: 16,
    fontWeight: '600',
  },
});
