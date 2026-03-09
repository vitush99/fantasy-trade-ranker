// app/data/dataLoader.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  documentId,
  type DocumentData,
  type Query,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@myfirebase';

/* =========================================================
 *  PLAYER META + RANKINGS (unchanged from your version)
 * =======================================================*/
export type PlayerInfo = {
  headshotUrl: string;
  position: string;
  team: string;
};

export async function fetchRankings(format: 'sf' | '1qb'): Promise<any> {
  const docRef = doc(db, 'rankings', format);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) {
    throw new Error(`No ranking data found for format: ${format}`);
  }
  return snapshot.data().players;
}

// 24h player metadata cache (GCS)
const PLAYER_CACHE_KEY = '@cached_player_map';
const PLAYER_CACHE_TIMESTAMP_KEY = '@cached_player_map_timestamp';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchPlayerMap(): Promise<Record<string, PlayerInfo>> {
  const now = Date.now();
  const cached = await AsyncStorage.getItem(PLAYER_CACHE_KEY);
  const cachedTime = await AsyncStorage.getItem(PLAYER_CACHE_TIMESTAMP_KEY);

  if (cached && cachedTime && now - parseInt(cachedTime) < CACHE_TTL_MS) {
    return JSON.parse(cached);
  }

  const url = 'https://storage.googleapis.com/fantasy-trade-ranker/data/players.json';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch player metadata: ${response.statusText}`);

  const data = await response.json();
  await AsyncStorage.setItem(PLAYER_CACHE_KEY, JSON.stringify(data));
  await AsyncStorage.setItem(PLAYER_CACHE_TIMESTAMP_KEY, now.toString());
  return data;
}

export async function clearPlayerMapCache() {
  await AsyncStorage.removeItem(PLAYER_CACHE_KEY);
  await AsyncStorage.removeItem(PLAYER_CACHE_TIMESTAMP_KEY);
}

/* =========================================================
 *  TYPES FOR SERVER-SIDE FILTERING + PAGINATION
 * =======================================================*/
export type QBFormat = 'SF' | '1QB';
export type TEPremium = 'none' | 'TE+' | 'TE++' | 'TE+++';
export type PPR = 0 | 0.5 | 1;
export type PassTD = 4 | 5 | 6;
export type TeamCount = 8 | 10 | 12 | 14 | 16;

// Firestore-side request filters
export type TradeFilters = {
  qb?: QBFormat[];
  te?: TEPremium[];
  ppr?: PPR[];
  passTD?: PassTD[];
  teams?: TeamCount[];
  start?: number[];          // starters
};

export type PageOpts = {
  pageSize?: number;
  orderField?: 'lastVote' | 'createdAt' | 'timestamp';
  orderDir?: 'desc' | 'asc';
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
};

// Minimal trade shape we read from Firestore
export type TradeDocMin = {
  id: string;
  submittedBy?: string;
  isUserSubmission?: boolean;
  settings?: {
    qb?: QBFormat | string;
    te?: TEPremium | string;
    ppr?: number;
    passTD?: number;
    teams?: number;
    start?: number;
  };
  sideA?: string[];
  sideB?: string[];
  lastVote?: any;     // Firestore timestamp or missing
  timestamp?: any;    // Firestore timestamp or missing
  createdAt?: any;    // Firestore timestamp or missing
};

/* =========================================================
 *  FILTER → QUERY CONSTRAINTS
 * =======================================================*/
function buildConstraintsFromFilters(filters: TradeFilters): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (filters.qb && filters.qb.length)           c.push(where('settings.qb', 'in', filters.qb));
  if (filters.te && filters.te.length)           c.push(where('settings.te', 'in', filters.te));
  if (filters.ppr && filters.ppr.length)         c.push(where('settings.ppr', 'in', filters.ppr));
  if (filters.passTD && filters.passTD.length)   c.push(where('settings.passTD', 'in', filters.passTD));
  if (filters.teams && filters.teams.length)     c.push(where('settings.teams', 'in', filters.teams));
  if (filters.start && filters.start.length)     c.push(where('settings.start', 'in', filters.start));
  return c;
}

/* =========================================================
 *  PAGED FETCH — WITH:
 *   - robust order fallbacks
 *   - cursor field checks (no invalid-argument errors)
 *   - user-submissions prioritized on page 1
 * =======================================================*/
type OrderField = 'lastVote' | 'timestamp' | 'createdAt' | '__name__';

function orderByConstraint(field: OrderField, dir: 'asc' | 'desc'): QueryConstraint {
  return field === '__name__' ? orderBy(documentId(), dir) : orderBy(field, dir);
}

// Safe check that the cursor contains the order field we want to use
function cursorHasField(cursor: QueryDocumentSnapshot<DocumentData> | null, field: OrderField) {
  if (!cursor || field === '__name__') return true;
  try {
    return cursor.get(field) !== undefined;
  } catch {
    return false;
  }
}

// Executes ONE page query with a chosen order field.
async function runPage(
  col: ReturnType<typeof collection>,
  filters: TradeFilters,
  chosen: OrderField,
  dir: 'asc' | 'desc',
  pageSize: number,
  cursor: QueryDocumentSnapshot<DocumentData> | null
): Promise<QuerySnapshot<DocumentData>> {
  const constraints: QueryConstraint[] = [
    ...buildConstraintsFromFilters(filters),
    orderByConstraint(chosen, dir),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize),
  ];
  const q: Query<DocumentData> = query(col, ...constraints);
  return await getDocs(q);
}

/**
 * Fetch page with stable fallbacks AND keep user-submitted trades first on page 1.
 */
export async function fetchFilteredTradesPage(
  filters: TradeFilters,
  opts: PageOpts = {},
  currentUserId?: string
): Promise<{ trades: TradeDocMin[]; nextCursor: QueryDocumentSnapshot<DocumentData> | null }> {
  const colRef = collection(db, 'trades');
  const pageSize = opts.pageSize ?? 25;
  const dir = (opts.orderDir ?? 'desc') as 'asc' | 'desc';
  const cursor = opts.cursor ?? null;

  // Candidate orders (we'll skip any that the cursor cannot support)
  const preferred: OrderField[] = [opts.orderField ?? 'lastVote', 'timestamp', 'createdAt', '__name__'];

  // =========================
  // Page 1: put user trades first (stable partition)
  // =========================
  if (!cursor) {
    try {
      console.log('[dataLoader] page1: user-submitted partition → has currentUser?', !!currentUserId);

      // (A) user submissions (excluding current user if provided)
      const userFilters: TradeFilters = { ...filters };
      const userSnap = await runPage(colRef, { ...userFilters }, preferred[0], dir, pageSize, null)
        .catch(() => null);

      let userTrades: TradeDocMin[] = [];
      if (userSnap && !userSnap.empty) {
        userTrades = userSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) } as TradeDocMin))
          .filter(t => t.isUserSubmission)
          .filter(t => (currentUserId ? t.submittedBy !== currentUserId : true));
      }

      // (B) general pool (regardless of isUserSubmission), then place non-user-submitted after A
      // choose a workable order respecting cursor rules (here no cursor)
      let mainSnap: QuerySnapshot<DocumentData> | null = null;
      let used: OrderField | null = null;
      for (const f of preferred) {
        try {
          console.log('[dataLoader] page1 main: trying orderBy', f);
          mainSnap = await runPage(colRef, filters, f, dir, pageSize, null);
          used = f;
          break;
        } catch (err) {
          console.log(`[dataLoader] page1 main: orderBy ${f} failed`, err);
        }
      }

      if (!mainSnap || mainSnap.empty) {
        console.log('[dataLoader] page1 main: empty after all orders; returning only A (userTrades)');
        const nextCursor = userSnap?.docs?.length ? userSnap.docs[userSnap.docs.length - 1] : null;
        return { trades: userTrades, nextCursor };
      }

      let mainTrades = mainSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as TradeDocMin));

      // Exclude current user's docs from the main pool too
      if (currentUserId) {
        mainTrades = mainTrades.filter(t => t.submittedBy !== currentUserId);
      }

      // Merge with user-first priority and dedupe by id
      const merged: TradeDocMin[] = [];
      const seen = new Set<string>();
      for (const t of userTrades) {
        if (!seen.has(t.id)) { merged.push(t); seen.add(t.id); }
      }
      for (const t of mainTrades) {
        if (!seen.has(t.id)) { merged.push(t); seen.add(t.id); }
      }

      // page cursor from the *main* query (more stable for next page)
      const nextCursor = mainSnap.docs.length ? mainSnap.docs[mainSnap.docs.length - 1] : null;

      console.log('[dataLoader] page1 merged', {
        userFirstCount: userTrades.length,
        mainCount: mainTrades.length,
        mergedCount: merged.length,
        usedOrder: used,
        nextCursor: !!nextCursor,
      });

      // Cap to pageSize for the UI pager
      return { trades: merged.slice(0, pageSize), nextCursor };
    } catch (err) {
      console.log('[dataLoader] page1 partition failed → falling back to generic pager', err);
      // fall through to generic pager below
    }
  }

  // =========================
  // Generic pager (page ≥ 2, or fallback)
  // =========================
  let snap: QuerySnapshot<DocumentData> | null = null;
  let chosenOrder: OrderField | null = null;

  for (const f of preferred) {
    if (!cursorHasField(cursor, f)) {
      console.log('[dataLoader] skipping order (cursor missing field):', f);
      continue;
    }
    try {
      console.log('[dataLoader] trying orderBy:', f, { orderDir: dir, hasCursor: !!cursor });
      snap = await runPage(colRef, filters, f, dir, pageSize, cursor);
      chosenOrder = f;
      break;
    } catch (err) {
      console.log(`[dataLoader] orderBy failed for ${f} → trying next.`, err);
    }
  }

  if (!snap || snap.empty) {
    console.log('[dataLoader] no results for all order fields; returning empty page');
    return { trades: [], nextCursor: null };
  }

  let trades: TradeDocMin[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as TradeDocMin));
  if (currentUserId) {
    trades = trades.filter(t => t.submittedBy !== currentUserId);
  }

  const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
  console.log('[dataLoader] fetched page', {
    chosenOrder,
    count: trades.length,
    nextCursor: !!nextCursor,
  });

  return { trades, nextCursor };
}
