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
          const sorted = parsed.sort((a, b) =>
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


  const clearHistory = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(RANKINGS_KEY);
    await AsyncStorage.setItem('@rankings_should_refresh', 'true');
    setHistory({});
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
      <View style={styles.floatingBar}>
        <TouchableOpacity style={styles.clearBtn} onPress={clearHistory}>
          <Text style={styles.clearText}>Clear Swipe History</Text>
        </TouchableOpacity>
      </View>
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
    backgroundColor: '#111',
    paddingHorizontal: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginTop: 10,
    marginBottom: 10,
    textAlign: 'center',
  },
  dateLabel: {
    color: '#bbb',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#222',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  cardText: {
    color: '#fff',
    fontSize: 15,
  },
  metaText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
  },
  floatingBar: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: '#333',
    borderRadius: 30,
    paddingVertical: 10,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  clearBtn: {
    alignItems: 'center',
  },
  clearText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  floatingClearWrapper: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  floatingClear: {
    backgroundColor: '#444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  
  floatingClearText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
});
