import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import {
  collectionGroup,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@myfirebase';
import FastImage from 'react-native-fast-image';
import { getMergedPlayerMap, PlayerInfo } from '@utils/playerUtlis';

export default function TrendingScreen() {
  const [trades, setTrades] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playerMap, setPlayerMap] = useState<Record<string, PlayerInfo>>({});
  const [noRecentVotes, setNoRecentVotes] = useState(false);

  const loadTrendingData = async () => {
    setRefreshing(true);
    try {
      const [snapshot, enrichedMap] = await Promise.all([
        getDocs(query(collectionGroup(db, 'meta'), orderBy('totalVotes', 'desc'))),
        getMergedPlayerMap(),
      ]);

      const enriched: any[] = [];
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

      for (const snap of snapshot.docs) {
        const meta = snap.data();
        const lastVote = meta.lastVote?.toMillis?.() ?? 0;
        if (lastVote < threeDaysAgo) continue;

        const tradeId = snap.ref.parent.parent?.id;
        if (!tradeId) continue;

        const tradeSnap = await getDoc(doc(db, 'trades', tradeId));
        if (tradeSnap.exists()) {
          enriched.push({
            id: tradeId,
            ...tradeSnap.data(),
            votes: meta,
            type: 'swipe',
          });
        }
      }

      setNoRecentVotes(enriched.length === 0);
      setTrades(enriched);
      setPlayerMap(enrichedMap);
    } catch (err) {
      console.error('Failed to load trending data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTrendingData();
  }, []);

  const getPositionColor = (pos: string) => {
    const map: Record<string, string> = {
      QB: '#1E90FF',
      RB: '#28a745',
      WR: '#8e44ad',
      TE: '#e67e22',
      PICK: '#666',
    };
    return map[pos.toUpperCase()] ?? '#444';
  };

  const renderSide = (side: string[], sideKey: 'a' | 'b') => {
    return side.map((name, idx) => {
      const info = playerMap[name] ?? { position: 'PICK', team: 'N/A', headshotUrl: '' };
      const isPick = info.position === 'PICK' || name.toLowerCase().includes('pick');
      const [first = '', ...rest] = name.split(' ');
      const shortName = rest.length ? `${first[0]}. ${rest.join(' ')}` : name;

      return (
        <View key={`${sideKey}-${idx}`} style={styles.playerItem}>
          {!isPick && (
            <View style={styles.headshot}>
              {info.headshotUrl ? (
                <FastImage
                  source={{ uri: info.headshotUrl }}
                  style={styles.headshotImage}
                  resizeMode={FastImage.resizeMode.cover}
                />
              ) : (
                <View style={{ width: 32, height: 32, marginRight: 8 }} />
              )}
            </View>
          )}
          <View style={{ flexDirection: 'column' }}>
            <Text style={styles.playerName}>{isPick ? name : shortName}</Text>
            <Text style={{ fontSize: 13, color: getPositionColor(info.position) }}>
              {info.position} — {info.team}
            </Text>
          </View>
        </View>
      );
    });
  };

  const renderItem = ({ item }: { item: any }) => {
    const sideA = item.votes?.sideA ?? 0;
    const sideB = item.votes?.sideB ?? 0;
    const total = sideA + sideB;
    const percentA = total > 0 ? Math.round((sideA / total) * 100) : 0;

    return (
      <View style={styles.card}>
        <View style={styles.tradeRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={{ fontWeight: '600', color: '#555', marginBottom: 8 }}>RECEIVES</Text>
            {renderSide(item.sideA, 'a')}
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontWeight: '600', color: '#555', marginBottom: 8 }}>SENDS</Text>
            {renderSide(item.sideB, 'b')}
          </View>
        </View>

        <Text style={styles.metaBar}>
          {item.settings.qb} | {item.settings.te} | {item.settings.teams} Teams | Start {item.settings.start} | {item.settings.passTD}pt PassTD | {item.settings.ppr} PPR
        </Text>

        {total > 0 ? (
          <View style={styles.voteBarContainer}>
            <Text style={styles.votePercent}>{percentA}%</Text>
            <View style={styles.voteBar}>
              <View style={[styles.sideA, { flex: percentA }]} />
              <View style={[styles.sideB, { flex: 100 - percentA }]} />
            </View>
            <Text style={styles.votePercent}>{100 - percentA}%</Text>
          </View>
        ) : (
          <Text style={styles.noVotes}>No votes yet</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Trending</Text>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007aff" />
        </View>
      ) : noRecentVotes ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 16, color: '#777', textAlign: 'center' }}>
            No trending trades in the past 3 days.
          </Text>
        </View>
      ) : (
        <FlatList
          data={trades}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshing={refreshing}
          onRefresh={loadTrendingData}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    fontSize: 24,
    fontWeight: '600',
    color: '#222',
    marginTop: 10,
    marginBottom: 10,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fefefe',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    width: '100%',
  },
  playerName: {
    fontSize: 15,
    color: '#222',
    marginVertical: 2,
    textAlign: 'left',
  },
  headshot: {
    width: 32,
    height: 32,
    borderRadius: 12,
    marginRight: 8,
    overflow: 'hidden',
  },
  headshotImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  metaBar: {
    marginTop: 8,
    fontSize: 12,
    color: '#777',
    textAlign: 'center',
  },
  noVotes: {
    marginTop: 4,
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  voteBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginHorizontal: 4,
  },
  voteBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: '#ddd',
    marginHorizontal: 6,
  },
  votePercent: {
    width: 36,
    textAlign: 'center',
    fontSize: 13,
    color: '#555',
  },
  sideA: {
    backgroundColor: '#4a90e2',
  },
  sideB: {
    backgroundColor: '#f5a623',
  },
});
