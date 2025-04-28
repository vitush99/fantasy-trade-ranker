import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-root-toast';
import type { StoredSwipe } from '@engine';

const STORAGE_KEY = '@swipe_history';
const RANKINGS_KEY = '@personalized_rankings';

export default function SwipeHistoryScreen() {
  const [history, setHistory] = useState<{ [date: string]: any[] }>({});

  useFocusEffect(
    useCallback(() => {
      const loadHistory = async () => {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        if (data) {
          const parsed = JSON.parse(data);
          const sorted = parsed.sort((a: StoredSwipe, b: StoredSwipe) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          const grouped: { [date: string]: any[] } = {};
          for (const item of sorted) {
            const dateKey = new Date(item.timestamp).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(item);
          }
          setHistory(grouped);
        } else {
          setHistory({});
        }
      };
      loadHistory();
    }, [])
  );

  const showToast = (message: string) => {
    Toast.show(message, {
      duration: Toast.durations.SHORT,
      position: Toast.positions.BOTTOM,
    });
  };

  const clearHistory = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(RANKINGS_KEY);
    await AsyncStorage.setItem('@rankings_should_refresh', 'true');
    setHistory({});
    showToast('🧹 Swipe history cleared');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Swipe History</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {Object.entries(history).map(([date, swipes]) => (
          <View key={date}>
            <Text style={styles.dateLabel}>{date}</Text>
            {swipes.map((item, idx) => (
              <View key={`${item.timestamp}-${idx}`} style={styles.card}>
                <Text style={styles.metaText}>
                  {new Date(item.timestamp).toLocaleTimeString()}
                </Text>
                <Text style={styles.cardText}>
                  {item.choice} — {item.trade}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Floating clear button */}
      <View style={styles.floatingClearWrapper}>
        <TouchableOpacity style={styles.floatingClear} onPress={clearHistory}>
          <Text style={styles.floatingClearText}>Clear Swipe History</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: '600',
    color: '#222',
    marginTop: 10,
    marginBottom: 10,
    textAlign: 'center',
  },
  dateLabel: {
    color: '#555',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#f5f5f5',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardText: {
    color: '#222',
    fontSize: 15,
  },
  metaText: {
    fontSize: 12,
    color: '#777',
    marginBottom: 6,
  },
  floatingClearWrapper: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingClear: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  floatingClearText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

