// app/(tabs)/swipe-history.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import {
  collection,
  DocumentData,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  doc,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FastImage from 'react-native-fast-image';
import { db } from '@myfirebase';
import { getMergedPlayerMap, PlayerInfo } from '@utils/playerUtlis';

// NEW: social helpers + components
import { pageFollowing, pageFollowers } from '@utils/social';
import FollowButton from '@components/profile/FollowButton';
import SearchHeader from '@components/profile/SearchHeader';

// NEW: Header gear → Settings
import { useRouter, useNavigation } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

/* ───────────────────────────────── TYPES ───────────────────────────────── */
type Swipe = {
  id: string;
  sideA?: string[];
  sideB?: string[];
  trade?: string; // legacy "A + A2 → B + B2"
  choice: 'Side A' | 'Side B';
  settings: { qb: string; te: string; teams: number; start: number; passTD: number; ppr: number };
  votes?: { sideA: number; sideB: number }; // optional; if present we show VoteBar
  timestamp: any; // Firestore Timestamp
};

type TabKey = 'swipes' | 'following' | 'followers';

type MiniUser = {
  uid: string;
  username?: string;
  displayName?: string;
  photoURL?: string;
  followedAt?: any;
};

/* ─────────────────────────────── HOOK: SWIPES ───────────────────────────── */
function useMySwipes(pageSize = 40) {
  const uid = getAuth().currentUser?.uid;
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  const cacheKey = uid ? `cache:my-swipes:${uid}` : '';

  useEffect(() => {
    (async () => {
      if (!cacheKey) return;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) setSwipes(JSON.parse(cached));
    })();
  }, [cacheKey]);

  const baseQuery = useMemo(() => {
    if (!uid) return null;
    return query(collection(db, 'users', uid, 'swipes'), orderBy('timestamp', 'desc'), limit(pageSize));
  }, [uid, pageSize]);

  useEffect(() => {
    if (!baseQuery) return;
    setLoading(true);
    const unsub = onSnapshot(
      baseQuery,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Swipe[];
        setSwipes(rows);
        lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
        setEndReached(snap.empty || snap.size < pageSize);
        if (cacheKey) AsyncStorage.setItem(cacheKey, JSON.stringify(rows)).catch(() => {});
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [baseQuery, cacheKey, pageSize]);

  const loadMore = useCallback(async () => {
    if (endReached || !uid || !lastDocRef.current) return;
    const q = query(
      collection(db, 'users', uid, 'swipes'),
      orderBy('timestamp', 'desc'),
      startAfter(lastDocRef.current),
      limit(pageSize),
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      setEndReached(true);
      return;
    }
    lastDocRef.current = snap.docs[snap.docs.length - 1];
    const more = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Swipe[];
    setSwipes((prev) => {
      const merged = [...prev, ...more];
      if (cacheKey) AsyncStorage.setItem(cacheKey, JSON.stringify(merged)).catch(() => {});
      return merged;
    });
  }, [endReached, uid, pageSize, cacheKey]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  return { swipes, loading, refreshing, refresh, loadMore, endReached };
}

/* ─────────────────────────────── USER STATS ────────────────────────────── */
function useUserStats(uid?: string) {
  const [stats, setStats] = useState<{ followers: number; following: number }>({ followers: 0, following: 0 });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), (s) => {
      const st = (s.data()?.stats as any) || {};
      setStats({ followers: st.followers || 0, following: st.following || 0 });
    });
  }, [uid]);
  return stats;
}

/* ───────────────────────────────── UTILITIES ────────────────────────────── */
function normalizeTradeLists(item: Swipe): [string[], string[]] {
  if (item.sideA && item.sideB) return [item.sideA, item.sideB];
  const trade = item.trade ?? '';
  const [sideA = '', sideB = ''] = trade.split(' → ');
  const split = (s: string) => (s ? s.split(/ \+ |, /).map((x) => x.trim()).filter(Boolean) : []);
  return [split(sideA), split(sideB)];
}

function sectionByDate(items: Swipe[]) {
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const today = new Date();
  const yday = new Date(Date.now() - 86400000);
  const isSame = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  const buckets: Record<string, Swipe[]> = {};
  for (const it of items) {
    const d = it.timestamp?.toDate ? it.timestamp.toDate() : new Date(it.timestamp);
    const key = isSame(d, today) ? 'Today' : isSame(d, yday) ? 'Yesterday' : fmt.format(d);
    (buckets[key] ||= []).push(it);
  }
  return Object.entries(buckets).map(([title, data]) => ({ title, data }));
}

const getPositionColor = (pos: string) => {
  const map: Record<string, string> = {
    QB: '#1E90FF',
    RB: '#28a745',
    WR: '#8e44ad',
    TE: '#e67e22',
    PICK: '#666',
  };
  return map[pos?.toUpperCase?.() ?? ''] ?? '#444';
};

/* ─────────────────────────────── VOTE BAR ──────────────────────────────── */
function VoteBar({ sideA, sideB }: { sideA: number; sideB: number }) {
  const total = (sideA || 0) + (sideB || 0);
  if (!total) return <Text style={styles.noVotes}>No votes yet</Text>;
  const percentA = Math.round(((sideA || 0) / total) * 100);

  return (
    <View style={styles.voteBarContainer}>
      <Text style={styles.votePercent}>{percentA}%</Text>
      <View style={styles.voteBar}>
        <View style={[styles.sideA, { flex: percentA }]} />
        <View style={[styles.sideB, { flex: 100 - percentA }]} />
      </View>
      <Text style={styles.votePercent}>{100 - percentA}%</Text>
    </View>
  );
}

/* ──────────────────────────────── SCREEN ───────────────────────────────── */
export default function SwipeHistoryScreen() {
  const uid = getAuth().currentUser?.uid;
  const user = getAuth().currentUser || undefined;
  const [activeTab, setActiveTab] = useState<TabKey>('swipes');

  // NEW: header gear → Settings
  const router = useRouter();
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,                   
      headerTitle: 'Profile',  
      headerRight: () => (
        <TouchableOpacity
          onPress={() => router.push('/screen/Settings')} // if your file is lowercase, use '/screen/settings'
          hitSlop={10}
          style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Ionicons name="settings-outline" size={22} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, router]);

  // swipes
  const { swipes, loading, refreshing, refresh, loadMore, endReached } = useMySwipes(40);
  const sections = useMemo(() => (activeTab === 'swipes' ? sectionByDate(swipes) : []), [activeTab, swipes]);

  // counts
  const stats = useUserStats(uid);

  // players map
  const [playerMap, setPlayerMap] = useState<Record<string, PlayerInfo>>({});
  useEffect(() => {
    (async () => setPlayerMap(await getMergedPlayerMap()))();
  }, []);

  // Following / Followers paging
  const [followingRows, setFollowingRows] = useState<MiniUser[]>([]);
  const [followingCursor, setFollowingCursor] = useState<any>(null);

  const [followerRows, setFollowerRows] = useState<MiniUser[]>([]);
  const [followerCursor, setFollowerCursor] = useState<any>(null);

  async function loadFollowing(first = false) {
    if (!uid) return;
    const res = await pageFollowing(uid, 25, first ? undefined : followingCursor);
    const next = res.items.map((it: any) => ({
      uid: it.uid || it.id,
      username: it.username,
      displayName: it.displayName,
      photoURL: it.photoURL,
      followedAt: it.followedAt,
    }));
    setFollowingRows((prev) => (first ? next : [...prev, ...next]));
    setFollowingCursor(res.cursor);
  }

  async function loadFollowers(first = false) {
    if (!uid) return;
    const res = await pageFollowers(uid, 25, first ? undefined : followerCursor);
    const next = res.items.map((it: any) => ({
      uid: it.uid,
      username: it.username,
      displayName: it.displayName,
      photoURL: it.photoURL,
      followedAt: it.followedAt,
    }));
    setFollowerRows((prev) => (first ? next : [...prev, ...next]));
    setFollowerCursor(res.cursor);
  }

  useEffect(() => {
    if (activeTab === 'following') loadFollowing(true);
    if (activeTab === 'followers') loadFollowers(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, uid]);

  const renderSide = (names: string[], sideKey: 'a' | 'b', chosen: boolean) => {
    return names.map((name, idx) => {
      const info = playerMap[name] ?? { position: 'PICK', team: 'N/A', headshotUrl: '' };
      const isPick = info.position === 'PICK' || name.toLowerCase().includes('pick');
      const [first = '', ...rest] = name.split(' ');
      const shortName = isPick ? name : rest.length ? `${first[0]}. ${rest.join(' ')}` : name;

      return (
        <View key={`${sideKey}-${idx}`} style={styles.playerItem}>
          {!isPick && (
            <View style={styles.headshot}>
              {info.headshotUrl ? (
                <FastImage source={{ uri: info.headshotUrl }} style={styles.headshotImage} resizeMode={FastImage.resizeMode.cover} />
              ) : (
                <View style={{ width: 32, height: 32, marginRight: 8 }} />
              )}
            </View>
          )}
          <View style={{ flexDirection: 'column' }}>
            <Text style={[styles.playerName, chosen && styles.playerNameChosen]}>{shortName}</Text>
            <Text style={{ fontSize: 13, color: getPositionColor(info.position) }}>
              {info.position} — {info.team}
            </Text>
          </View>
        </View>
      );
    });
  };

  const renderSwipeItem = ({ item }: { item: Swipe }) => {
    const [aList, bList] = normalizeTradeLists(item);
    const isSideAChosen = item.choice === 'Side A';

    return (
      <View style={styles.card}>
        <View style={styles.tradeRow}>
          <View style={[{ flex: 1, marginRight: 8 }, isSideAChosen && styles.chosenOutline]}>
            <View style={styles.sideHeaderRow}>
              <Text style={styles.sideHeaderLabel}>RECEIVES</Text>
              {isSideAChosen && <Text style={styles.yourPickBadge}>Your pick</Text>}
            </View>
            {renderSide(aList, 'a', isSideAChosen)}
          </View>

          <View style={[{ flex: 1, marginLeft: 8 }, !isSideAChosen && styles.chosenOutline]}>
            <View style={styles.sideHeaderRow}>
              <Text style={styles.sideHeaderLabel}>SENDS</Text>
              {!isSideAChosen && <Text style={styles.yourPickBadge}>Your pick</Text>}
            </View>
            <View style={{ opacity: isSideAChosen ? 0.82 : 1 }}>{renderSide(bList, 'b', !isSideAChosen)}</View>
          </View>
        </View>

        <Text style={styles.metaBar}>
          {item.settings.qb} | {item.settings.te} | {item.settings.teams} Teams | Start {item.settings.start} | {item.settings.passTD}pt PassTD | {item.settings.ppr} PPR
        </Text>

        {'votes' in item && item.votes ? (
          <VoteBar sideA={item.votes.sideA} sideB={item.votes.sideB} />
        ) : (
          <Text style={styles.noVotes}>No votes yet</Text>
        )}
      </View>
    );
  };

  /* ────────────────────────────── RENDER ──────────────────────────────── */
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={{ uri: user?.photoURL || 'https://via.placeholder.com/80' }} style={styles.avatar} />
        <Text style={styles.name}>{user?.displayName || 'User'}</Text>
        <View style={styles.statsRow}>
          <Text style={styles.stat}>Followers: {stats.followers}</Text>
          <Text style={styles.stat}>Following: {stats.following}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TabButton label="My Swipes" active={activeTab === 'swipes'} onPress={() => setActiveTab('swipes')} />
        <TabButton label="Following" active={activeTab === 'following'} onPress={() => setActiveTab('following')} />
        <TabButton label="Followers" active={activeTab === 'followers'} onPress={() => setActiveTab('followers')} />
      </View>

      {/* Content */}
      {activeTab === 'swipes' ? (
        // My Swipes
        loading && sections.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderSwipeItem}
            renderSectionHeader={({ section: { title } }) => <Text style={styles.sectionHeader}>{title}</Text>}
            onEndReachedThreshold={0.4}
            onEndReached={() => loadMore()}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
            ListFooterComponent={!endReached ? <ActivityIndicator style={{ padding: 16 }} /> : null}
            ListEmptyComponent={!loading ? <EmptySwipes /> : null}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )
      ) : activeTab === 'following' ? (
        // Following list + search
        <FlatList
          data={followingRows}
          keyExtractor={(item) => item.uid}
          ListHeaderComponent={
            <SearchHeader myFollowingIds={new Set(followingRows.map((r) => r.uid))} />
          }
          renderItem={({ item }) => (
            <View style={styles.followItem}>
              <Image source={{ uri: item.photoURL || undefined }} style={styles.followAvatar} />
              <Text style={styles.followName}>{item.displayName || item.username || 'User'}</Text>
              <View style={{ flex: 1 }} />
              <FollowButton targetUid={item.uid} initial />
            </View>
          )}
          onEndReached={() => followingCursor && loadFollowing(false)}
          onEndReachedThreshold={0.4}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />}
          ListEmptyComponent={<EmptyFollowing />}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      ) : (
        // Followers list + search
        <FlatList
          data={followerRows}
          keyExtractor={(item) => item.uid}
          ListHeaderComponent={<SearchHeader myFollowingIds={new Set()} />}
          renderItem={({ item }) => (
            <View style={styles.followItem}>
              <Image source={{ uri: item.photoURL || undefined }} style={styles.followAvatar} />
              <Text style={styles.followName}>{item.displayName || item.username || 'User'}</Text>
              <View style={{ flex: 1 }} />
              <FollowButton targetUid={item.uid} initial={false} />
            </View>
          )}
          onEndReached={() => followerCursor && loadFollowers(false)}
          onEndReachedThreshold={0.4}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />}
          ListEmptyComponent={<EmptyFollowers />}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </SafeAreaView>
  );
}

/* ─────────────────────────────── UI HELPERS ────────────────────────────── */
function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tabButton, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptySwipes() {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>No swipes yet</Text>
      <Text style={styles.emptyBody}>Head to the Swipe tab to start voting on trades.</Text>
    </View>
  );
}

function EmptyFollowing() {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Not following anyone</Text>
      <Text style={styles.emptyBody}>Search for users and follow them to see their activity.</Text>
    </View>
  );
}

function EmptyFollowers() {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>No followers yet</Text>
      <Text style={styles.emptyBody}>When someone follows you, they’ll show up here.</Text>
    </View>
  );
}

/* ───────────────────────────────── STYLES ──────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#ccc' },
  name: { fontSize: 20, fontWeight: '600', marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  stat: { fontSize: 13, color: '#333' },

  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#d8eaff',
  },
  tabActive: { backgroundColor: '#d1e7ff' },
  tabText: { fontSize: 14, fontWeight: '500', color: '#0077ff' },
  tabTextActive: { color: '#0056b3' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
  },

  card: {
    backgroundColor: '#fefefe',
    padding: 16,
    borderRadius: 12,
    marginVertical: 6,
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

  sideHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sideHeaderLabel: { fontWeight: '600', color: '#555' },
  yourPickBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c7e1ff',
    backgroundColor: '#eaf3ff',
    color: '#0b65d8',
    fontSize: 11,
    overflow: 'hidden',
  },

  chosenOutline: {
    borderWidth: 1,
    borderColor: '#cfe7ff',
    borderRadius: 10,
    padding: 6,
  },

  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    width: '100%',
  },
  headshot: {
    width: 32,
    height: 32,
    borderRadius: 12,
    marginRight: 8,
    overflow: 'hidden',
  },
  headshotImage: { width: '100%', height: '100%', borderRadius: 12 },
  playerName: { fontSize: 15, color: '#222', marginVertical: 2, textAlign: 'left' },
  playerNameChosen: { fontWeight: '700' },

  metaBar: { marginTop: 4, fontSize: 12, color: '#777', textAlign: 'center' },

  noVotes: { marginTop: 6, fontSize: 13, color: '#999', textAlign: 'center', fontStyle: 'italic' },

  voteBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
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
  votePercent: { width: 36, textAlign: 'center', fontSize: 13, color: '#555' },
  sideA: { backgroundColor: '#4a90e2' },
  sideB: { backgroundColor: '#f5a623' },

  emptyWrap: { padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6, color: '#111' },
  emptyBody: { fontSize: 13, color: '#555', textAlign: 'center' },

  followItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  followAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#cbd5e1', marginRight: 12 },
  followName: { fontSize: 15, color: '#111' },
});
