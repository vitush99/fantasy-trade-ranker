import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { auth, db } from '@myfirebase';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import SubmitPanel from '@components/ui/SubmitPanel';
import { getMergedPlayerMap, PlayerInfo } from '@utils/playerUtlis';
import FastImage from 'react-native-fast-image';

const TRADES_CACHE_KEY = '@cached_my_trades';

type Trade = {
  id: string;
  sideA: string[];
  sideB: string[];
  timestamp: Timestamp;
  settings: {
    qb: string;
    te: string;
    teams: number;
    start: number;
    ppr: number;
    passTD: number;
  };
};

export default function TradesScreen() {
  const router = useRouter();
  const [flatListData, setFlatListData] = useState<any[]>([]);
  const [votes, setVotes] = useState<Record<string, { sideA: number; sideB: number }>>({});
  const [voteToggles, setVoteToggles] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitVisible, setSubmitVisible] = useState(false);
  const [playerMap, setPlayerMap] = useState<Record<string, PlayerInfo>>({});

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

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const fetchTrades = async () => {
    setRefreshing(true);
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const myTradesSnapshot = await getDocs(collection(db, 'users', uid, 'myTrades'));
    const tradeIds = myTradesSnapshot.docs.map((doc) => doc.id);

    const [tradeDocs, voteDocs] = await Promise.all([
      Promise.all(tradeIds.map((id) => getDoc(doc(db, 'trades', id)))),
      Promise.all(tradeIds.map((id) => getDoc(doc(db, 'tradeVotes', id)))),
    ]);

    const tradesWithDetails: Trade[] = [];
    const votesMap: Record<string, { sideA: number; sideB: number }> = {};

    tradeDocs.forEach((snap, i) => {
      if (snap.exists()) tradesWithDetails.push({ ...(snap.data() as Trade), id: tradeIds[i] });
    });
    voteDocs.forEach((snap, i) => {
      if (snap.exists()) votesMap[tradeIds[i]] = snap.data() as any;
    });

    setVotes(votesMap);

    // Group -> Flatten
    const grouped: Record<string, any[]> = {};
    for (const t of tradesWithDetails) {
      const dateStr = formatDate(t.timestamp.toDate());
      (grouped[dateStr] ||= []).push(t);
    }
    const flattened: any[] = [];
    Object.entries(grouped)
      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
      .forEach(([date, trades]) => {
        trades.sort((a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime());
        flattened.push({ type: 'header', date });
        flattened.push(...trades.map((t) => ({ ...t, type: 'trade' })));
      });

    setFlatListData(flattened);
    setIsLoading(false);
    setRefreshing(false);
    try { await AsyncStorage.setItem(TRADES_CACHE_KEY, JSON.stringify(flattened)); } catch {}
  };

  useEffect(() => {
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(TRADES_CACHE_KEY);
        if (cached) setFlatListData(JSON.parse(cached));
      } catch {}
      try {
        setPlayerMap(await getMergedPlayerMap());
      } catch {}
      fetchTrades();
    })();
  }, []);

  /* ---------- UI helpers ---------- */

  const PlayerCell = ({ name }: { name?: string }) => {
    if (!name) return <View style={styles.emptyCell} />;

    const info = playerMap[name] ?? { position: 'PICK', team: 'N/A', headshotUrl: '' };
    const isPick = info.position === 'PICK' || name.toLowerCase().includes('pick');
    const [first = '', ...rest] = name.split(' ');
    const shortName = isPick ? name : rest.length ? `${first[0]}. ${rest.join(' ')}` : name;

    return (
      <View style={styles.playerItem}>
        {/* always reserve headshot space to keep rows aligned */}
        <View style={styles.headshot}>
          {!isPick && info.headshotUrl ? (
            <FastImage source={{ uri: info.headshotUrl }} style={styles.headshotImage} resizeMode={FastImage.resizeMode.cover} />
          ) : (
            <View style={styles.headshotPlaceholder} />
          )}
        </View>
        <View style={{ flexDirection: 'column' }}>
          <Text style={styles.playerName}>{shortName}</Text>
          <Text style={{ fontSize: 13, color: getPositionColor(info.position) }}>
            {info.position} — {info.team}
          </Text>
        </View>
      </View>
    );
  };

  const PairedGrid = ({ sideA, sideB }: { sideA: string[]; sideB: string[] }) => {
    const rows = Math.max(sideA.length, sideB.length);
    const a = sideA, b = sideB;

    return (
      <View style={styles.grid}>
        {/* Header row */}
        <View style={styles.gridHeaderRow}>
          <Text style={styles.gridHeaderText}>RECEIVES</Text>
          <Text style={styles.gridHeaderText}>SENDS</Text>
        </View>

        {/* Player rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <View key={`row-${i}`} style={styles.gridRow}>
            <View style={[styles.gridCell, styles.cellLeft]}>
              <PlayerCell name={a[i]} />
            </View>
            <View style={[styles.gridCell, styles.cellRight]}>
              <PlayerCell name={b[i]} />
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderTrade = ({ item }: { item: any }) => {
    if (item.type === 'header') {
      return (
        <Text style={styles.dateHeader}>
          {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
      );
    }

    const vote = votes[item.id];
    const total = (vote?.sideA || 0) + (vote?.sideB || 0);
    const percentA = total ? Math.round((vote!.sideA / total) * 100) : null;
    const isRaw = voteToggles[item.id] || false;

    return (
      <View style={styles.card}>
        {/* Two-column aligned grid */}
        <PairedGrid sideA={item.sideA} sideB={item.sideB} />

        {/* Settings line */}
        <Text style={styles.metaBar}>
          {item.settings.qb} | {item.settings.te} | {item.settings.teams} Teams | Start {item.settings.start} | {item.settings.passTD}pt PassTD | {item.settings.ppr} PPR
        </Text>

        {/* Vote bar */}
        {percentA !== null ? (
          <TouchableOpacity
            onPress={() => setVoteToggles((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
            activeOpacity={0.8}
          >
            <View style={styles.voteBarContainer}>
              <Text style={styles.votePercent}>{isRaw ? vote!.sideA : `${percentA}%`}</Text>
              <View style={styles.voteBar}>
                <View style={[styles.sideA, { flex: percentA }]} />
                <View style={[styles.sideB, { flex: 100 - percentA }]} />
              </View>
              <Text style={styles.votePercent}>{isRaw ? vote!.sideB : `${100 - percentA}%`}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <Text style={styles.noVotes}>No votes yet</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>My Submitted Trades</Text>

      {isLoading ? (
        <View className="center" style={styles.center}>
          <ActivityIndicator size="large" color="#007aff" />
        </View>
      ) : flatListData.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyMessage}>No trades yet</Text>
          <Text style={styles.emptySubText}>Submit your first trade to get community feedback!</Text>
        </View>
      ) : (
        <FlatList
          data={flatListData}
          keyExtractor={(item, index) =>
            item.type === 'header' ? `header-${item.date}` : item.id || `item-${index}`
          }
          renderItem={renderTrade}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshing={refreshing}
          onRefresh={fetchTrades}
        />
      )}

      <View style={styles.floatingSubmitWrapper}>
        <TouchableOpacity style={styles.floatingSubmit} onPress={() => setSubmitVisible(true)}>
          <Text style={styles.floatingSubmitText}>Submit a Trade</Text>
        </TouchableOpacity>
      </View>

      <SubmitPanel visible={submitVisible} onClose={() => setSubmitVisible(false)} />
    </SafeAreaView>
  );
}

/* --------------------------- Styles --------------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, backgroundColor: '#fff' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },

  header: {
    fontSize: 24, fontWeight: '600', color: '#222',
    marginTop: 10, marginBottom: 10, textAlign: 'center',
  },

  dateHeader: {
    fontSize: 14, fontWeight: '700', color: '#8a8a8a',
    marginTop: 16, marginBottom: 6, marginLeft: 10, letterSpacing: 0.3,
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

  /* Grid layout */
  grid: { width: '100%' },
  gridHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  gridHeaderText: {
    fontWeight: '600',
    color: '#555',
    flex: 1,                       
    textAlign: 'center',              
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start', // top align rows
    marginVertical: 3,
  },
  gridCell: { flex: 1 },
  cellLeft: { paddingRight: 8 },
  cellRight: { paddingLeft: 8 },

  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  playerName: { fontSize: 15, color: '#222', marginVertical: 2, textAlign: 'left' },

  // Always reserve headshot space for alignment
  headshot: { width: 32, height: 32, borderRadius: 12, marginRight: 8, overflow: 'hidden' },
  headshotImage: { width: '100%', height: '100%', borderRadius: 12 },
  headshotPlaceholder: { width: 32, height: 32, borderRadius: 12, backgroundColor: 'transparent' },

  metaBar: { marginTop: 8, fontSize: 12, color: '#777', textAlign: 'center' },

  noVotes: { marginTop: 4, fontSize: 13, color: '#999', textAlign: 'center', fontStyle: 'italic' },

  voteBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginHorizontal: 4,
  },
  voteBar: {
    flex: 1, height: 8, borderRadius: 4, flexDirection: 'row',
    overflow: 'hidden', backgroundColor: '#ddd', marginHorizontal: 6,
  },
  votePercent: { width: 36, textAlign: 'center', fontSize: 13, color: '#555' },
  sideA: { backgroundColor: '#4a90e2' },
  sideB: { backgroundColor: '#f5a623' },

  emptyMessage: { fontSize: 18, fontWeight: '600', color: '#444', marginBottom: 6, textAlign: 'center' },
  emptySubText: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 24 },

  floatingSubmitWrapper: {
    position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center', justifyContent: 'center',
  },
  floatingSubmit: {
    backgroundColor: '#1f7033',
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  floatingSubmitText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // legacy styles kept for reference / compatibility
  tradeRow: { flexDirection: 'row', alignItems: 'flex-start' },
});
