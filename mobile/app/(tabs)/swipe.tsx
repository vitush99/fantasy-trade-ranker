import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import Swiper from 'react-native-deck-swiper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import tradesData from '@assets/data/ktc_trades.json'; // ✅ Your real data

const STORAGE_KEY = '@swipe_history';

export default function SwipeScreen() {
  const [trades, setTrades] = useState<any[]>([]);
  const [swipeHistory, setSwipeHistory] = useState<any[]>([]);

  useEffect(() => {
    setTrades(tradesData); // ✅ Load KTC trades
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
    const trade = trades[cardIndex];
    const result = {
      trade: `${trade.sideA.join(" + ")} → ${trade.sideB.join(" + ")}`,
      choice: direction === 'right' ? 'Side B' : 'Side A',
      timestamp: new Date().toISOString(),
      settings: trade.settings,
    };

    const updatedHistory = [...swipeHistory, result];
    setSwipeHistory(updatedHistory);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
    console.log("Swipe saved:", result);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Swiper
        cards={trades}
        renderCard={(card) => (
          <View style={styles.card}>
            {card ? (
              <>
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
              </>
            ) : (
              <Text style={styles.text}>No trade</Text>
            )}
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
    color: '#fff',
    fontSize: 18,
    marginBottom: 4,
    textAlign: 'center',
  },
  settings: {
    borderTopWidth: 1,
    borderTopColor: '#555',
    paddingTop: 10,
    marginTop: 10,
  },
  settingsText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
  },  
});
