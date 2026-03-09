// hooks/useTradesCache.ts
import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  documentId,
  type QueryDocumentSnapshot,
  type CollectionReference,
} from 'firebase/firestore';
import { db } from '@myfirebase';

/* ============ Types ============ */

export type Settings = {
  qb?: 'SF' | '1QB' | string;
  te?: 'none' | 'TE+' | 'TE++' | 'TE+++' | string;
  ppr?: number | string;
  passTD?: number | string;
  teams?: number | string;
  start?: number | string;
};

export type TradeDoc = {
  id?: string;
  submittedBy?: string;          
  isUserSubmission?: boolean;
  timestamp?: { toMillis?: () => number } | null;
  settings?: Settings;
  sideA?: string[];
  sideB?: string[];
};

export type Trade = Required<Pick<TradeDoc, 'id'>> & Omit<TradeDoc, 'id'>;

export type FilterState = {
  format?: Array<'SF' | '1QB'>;
  tePremium?: Array<'none' | 'TE+' | 'TE++' | 'TE+++'>;
  ppr?: Array<0 | 0.5 | 1>;
  passTD?: Array<4 | 5 | 6>;
  teamCount?: Array<8 | 10 | 12 | 14 | 16>;
  starters?: number[];
};

/* ============ Helpers ============ */

const STORAGE_KEY = 'trades_cache_v1';
const MAX_DOCS = 5000;

function toNumber(x: unknown): number | undefined {
  if (x === undefined || x === null || x === '') return undefined;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeSettings(s?: Settings) {
  const qb = s?.qb === '1QB' || s?.qb === 'SF' ? (s.qb as 'SF' | '1QB') : undefined;

  const rawTe = (s?.te ?? '').toString();
  const te: 'none' | 'TE+' | 'TE++' | 'TE+++'
    = rawTe.toLowerCase() === 'none' ? 'none' : (rawTe.toUpperCase() as any);

  const ppr = toNumber(s?.ppr) as 0 | 0.5 | 1 | undefined;
  const passTD = toNumber(s?.passTD) as 4 | 5 | 6 | undefined;
  const teams = toNumber(s?.teams) as 8 | 10 | 12 | 14 | 16 | undefined;
  const starters = toNumber(s?.start);

  return { qb, te, ppr, passTD, teams, starters };
}

/* ============ Index + Cache ============ */

type FacetIndex = {
  format: { SF: Set<string>; QB1: Set<string> };
  te: { none: Set<string>; te1: Set<string>; te2: Set<string>; te3: Set<string> };
  ppr: { '0': Set<string>; '0.5': Set<string>; '1': Set<string> };
  passTD: { '4': Set<string>; '5': Set<string>; '6': Set<string> };
  teams: { '8': Set<string>; '10': Set<string>; '12': Set<string>; '14': Set<string>; '16': Set<string> };
  starters: Record<string, Set<string>>;
};

function emptyIndex(): FacetIndex {
  return {
    format: { SF: new Set(), QB1: new Set() },
    te: { none: new Set(), te1: new Set(), te2: new Set(), te3: new Set() },
    ppr: { '0': new Set(), '0.5': new Set(), '1': new Set() },
    passTD: { '4': new Set(), '5': new Set(), '6': new Set() },
    teams: { '8': new Set(), '10': new Set(), '12': new Set(), '14': new Set(), '16': new Set() },
    starters: {},
  };
}

type CacheState = {
  // core
  tradesById: Map<string, Trade>;
  sortedIdsByTs: string[];            // newest first
  idx: FacetIndex;
  // status
  ready: boolean;
  isFetching: boolean;
  hasMoreTs: boolean;
  hasMoreId: boolean;
  // cursors
  tsCursor: QueryDocumentSnapshot<TradeDoc> | null;
  idCursor: string | null;
  // misc
  total: number;
};

type Snapshot = Omit<CacheState, 'tradesById' | 'idx'> & {
  tradesById: Map<string, Trade>;
  idx: FacetIndex;
};

function asMillis(t?: Trade['timestamp']): number {
  return t?.toMillis?.() ?? 0;
}

function addToIndex(idx: FacetIndex, t: Trade) {
  if (!t.settings) return; // ← quick guard
  const s = normalizeSettings(t.settings);
  const id = t.id;
  
  if (s.qb === 'SF') idx.format.SF.add(id);
  else if (s.qb === '1QB') idx.format.QB1.add(id);

  if (s.te === 'none') idx.te.none.add(id);
  else if (s.te === 'TE+') idx.te.te1.add(id);
  else if (s.te === 'TE++') idx.te.te2.add(id);
  else if (s.te === 'TE+++') idx.te.te3.add(id);

  if (s.ppr !== undefined) idx.ppr[String(s.ppr) as '0' | '0.5' | '1'].add(id);
  if (s.passTD !== undefined) idx.passTD[String(s.passTD) as '4' | '5' | '6'].add(id);
  if (s.teams !== undefined) idx.teams[String(s.teams) as '8' | '10' | '12' | '14' | '16'].add(id);

  if (s.starters !== undefined) {
    const k = String(s.starters);
    if (!idx.starters[k]) idx.starters[k] = new Set();
    idx.starters[k].add(id);
  }
}

/* ============ Store (singleton) ============ */

class TradesCacheStore {
  private state: CacheState = {
    tradesById: new Map(),
    sortedIdsByTs: [],
    idx: emptyIndex(),
    ready: false,
    isFetching: false,
    hasMoreTs: true,
    hasMoreId: true,
    tsCursor: null,
    idCursor: null,
    total: 0,
  };

  private listeners = new Set<() => void>();
  private colRef = collection(db, 'trades') as CollectionReference<TradeDoc>;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getSnapshot = (): Snapshot => this.state;
  private emit = () => { for (const fn of this.listeners) fn(); };

  /** Initialize once at app start: load persisted cache, then hydrate from Firestore in the background */
  init = async (opts?: { sortDir?: 'desc' | 'asc' }) => {
    if (this.state.ready) return;

    // 1) load persisted
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const trades: Trade[] = JSON.parse(raw);
        // rebuild
        const tradesById = new Map(trades.map(t => [t.id, t]));
        const idx = emptyIndex();
        for (const t of trades) addToIndex(idx, t);
        const sortedIdsByTs = trades
          .slice()
          .sort((a, b) => (opts?.sortDir === 'asc' ? asMillis(a.timestamp) - asMillis(b.timestamp) : asMillis(b.timestamp) - asMillis(a.timestamp)))
          .map(t => t.id);

        this.state.tradesById = tradesById;
        this.state.idx = idx;
        this.state.sortedIdsByTs = sortedIdsByTs;
        this.state.total = tradesById.size;
      }
    } catch { /* ignore */ } finally {
      this.state.ready = true;
      this.emit();
    }

    // 2) warm from Firestore (timestamp then id)
    await this.fetchMoreTimestamp({ first: true, page: 200 }); // big first gulp
    // continue warming in background
    void this.warmUntilFull();
  };

  /** Keep fetching until ~MAX_DOCS or no more */
  private async warmUntilFull() {
    while (this.state.total < MAX_DOCS && (this.state.hasMoreTs || this.state.hasMoreId)) {
      if (this.state.hasMoreTs) await this.fetchMoreTimestamp({ page: 200 });
      else if (this.state.hasMoreId) await this.fetchMoreId({ page: 400 });
      // persist every few gulps
      if (this.state.total % 1000 < 500) {
        const persisted = Array.from(this.state.tradesById.values()).slice(0, MAX_DOCS);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => {});
      }
    }
    // final persist
    const persisted = Array.from(this.state.tradesById.values()).slice(0, MAX_DOCS);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => {});
  }

  private async fetchMoreTimestamp({ first = false, page = 300 }: { first?: boolean; page?: number }) {
    if (this.state.isFetching || !this.state.hasMoreTs) return;
    this.state.isFetching = true; this.emit();
    try {
      let snap;
      try {
        // Try ordering by timestamp (may throw if missing index / invalid for this dataset)
        const baseQ = query(this.colRef, orderBy('timestamp', 'desc'));
        const q = this.state.tsCursor
          ? query(baseQ, startAfter(this.state.tsCursor), limit(page))
          : query(baseQ, limit(page));
        snap = await getDocs(q);
      } catch (_) {
        // ignore and fall through to id fallback
        snap = undefined as any;
      }
  
      // If timestamp ordered page is empty or errored, fall back to documentId() (asc)
      if (!snap || (snap.empty && !this.state.sortedIdsByTs.length)) {
        const idBase = query(this.colRef, orderBy(documentId()));
        const idQ = this.state.idCursor
          ? query(idBase, startAfter(this.state.idCursor), limit(page))
          : query(idBase, limit(page));
        snap = await getDocs(idQ);
        if (!snap.empty) {
          this.state.idCursor = snap.docs[snap.docs.length - 1].id;
        }
      }
  
      if (snap.empty) { this.state.hasMoreTs = false; return; }
  
      // Only keep a ts cursor if we truly ordered by timestamp and docs have it
      if (snap.docs[0].data()?.timestamp) {
        this.state.tsCursor = snap.docs[snap.docs.length - 1];
      }
  
      this.mergeIncoming(
        snap.docs.map((d: QueryDocumentSnapshot<TradeDoc>) => 
          ({ id: d.id, ...(d.data() as TradeDoc) } as Trade)
        )
      );
    } finally {
      this.state.isFetching = false; this.emit();
    }
  }  

  private async fetchMoreId({ page = 600 }: { page?: number }) {
    if (this.state.isFetching || !this.state.hasMoreId) return;
    this.state.isFetching = true; this.emit();
    try {
      const idQ = query(this.colRef, orderBy(documentId()));
      const q = this.state.idCursor
        ? query(idQ, startAfter(this.state.idCursor), limit(page))
        : query(idQ, limit(page));
      const snap = await getDocs(q);
      if (snap.empty) { this.state.hasMoreId = false; return; }
      this.state.idCursor = snap.docs[snap.docs.length - 1].id;

      this.mergeIncoming(snap.docs.map(d => ({ id: d.id, ...(d.data() as TradeDoc) } as Trade)));
    } finally {
      this.state.isFetching = false; this.emit();
    }
  }

  private mergeIncoming(incoming: Trade[]) {
    const s = this.state;
    let mutated = false;

    for (const t of incoming) {
      if (!t.id) continue;
      if (!s.tradesById.has(t.id)) {
        s.tradesById.set(t.id, t);
        addToIndex(s.idx, t);
        mutated = true;
      } else {
        s.tradesById.set(t.id, t);
      }
    }

    if (mutated) {
      const all = Array.from(s.tradesById.values());
      // sort newest first
      s.sortedIdsByTs = all
        .sort((a, b) => asMillis(b.timestamp) - asMillis(a.timestamp))
        .slice(0, MAX_DOCS)
        .map(t => t.id);
      s.total = s.tradesById.size;
      // evict if over cap
      if (s.sortedIdsByTs.length > MAX_DOCS) {
        const keep = new Set(s.sortedIdsByTs);
        for (const id of s.tradesById.keys()) if (!keep.has(id)) s.tradesById.delete(id);
        // rebuild indexes (rare)
        s.idx = emptyIndex();
        for (const t of s.tradesById.values()) addToIndex(s.idx, t);
      }
    }
  }
}

const store = new TradesCacheStore();

/* ============ Public API ============ */

export function initTradesCache() {
  // fire and forget; component can call this once at startup
  void store.init();
}

export function useTradesCache() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return {
    ready: snapshot.ready,
    isFetching: snapshot.isFetching,
    total: snapshot.total,
    // data
    tradesById: snapshot.tradesById,
    sortedIdsByTs: snapshot.sortedIdsByTs,
    idx: snapshot.idx,
  };
}

// optional hook to kick init from a component
export function useTradesCacheInit() {
  useEffect(() => { initTradesCache(); }, []);
}
