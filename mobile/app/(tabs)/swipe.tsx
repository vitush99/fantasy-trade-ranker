import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import Swiper from 'react-native-deck-swiper';
import AsyncStorage from '@react-native-async-storage/async-storage';

const dummyTrades = [
  { id: 1, trade: 'Justin Jefferson + 2nd → Tyreek Hill + 1st' },
  { id: 2, trade: 'Bijan Robinson → Jahmyr Gibbs + 2nd' },
  { id: 3, trade: 'Drake London + 3rd → Jordan Addison' },
];

const STORAGE_KEY = '@swipe_history';

export default function SwipeScreen() {
  const [swipeHistory, setSwipeHistory] = useState<any[]>([]);

  useEffect(() => {
    // Load stored swipes on app open
    const loadSwipes = async () => {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        setSwipeHistory(JSON.parse(data));
        console.log("Loaded saved swipes:", JSON.parse(data));
      }
    };
    loadSwipes();
  }, []);

  const handleSwipe = async (cardIndex: number, direction: string) => {
    const chosenTrade = dummyTrades[cardIndex];
    const result = {
      trade: chosenTrade.trade,
      choice: direction === 'right' ? 'Side B' : 'Side A',
      timestamp: new Date().toISOString(),
    };

    const updatedHistory = [...swipeHistory, result];
    setSwipeHistory(updatedHistory);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
    console.log("Swipe saved:", result);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Swiper
        cards={dummyTrades}
        renderCard={(card) => (
          <View style={styles.card}>
            <Text style={styles.text}>{card.trade}</Text>
          </View>
        )}
        onSwipedLeft={(index) => handleSwipe(index, 'left')}
        onSwipedRight={(index) => handleSwipe(index, 'right')}
        backgroundColor="transparent"
        cardIndex={0}
        stackSize={3}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222',
    justifyContent: 'center',
  },
  card: {
    flex: 0.7,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    color: '#fff',
    fontSize: 22,
    textAlign: 'center',
  },
});
