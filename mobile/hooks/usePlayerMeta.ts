import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import FastImage from 'react-native-fast-image';
import { db } from '@myfirebase';
import { fetchPlayerMap, type PlayerInfo } from '@/data/dataloader';

type MergedInfo = Record<string, PlayerInfo>;
type CacheShape = { version: number; updatedAt: number; data: MergedInfo };

const CACHE_VERSION = 1; // bump when schema/shape changes
const STORAGE_KEY = `@player_meta_cache_v${CACHE_VERSION}`;
const PRELOAD_COUNT = 30;
const SOFT_REFRESH_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

async function readCache(): Promise<CacheShape | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CacheShape) : null;
  } catch {
    return null;
  }
}
async function writeCache(data: MergedInfo) {
  try {
    const payload: CacheShape = { version: CACHE_VERSION, updatedAt: Date.now(), data };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export function usePlayerMeta() {
  const [meta, setMeta] = useState<MergedInfo>({});

  // One-time sources
  const rankingsRef = useRef<Map<string, { position: string; team: string }> | null>(null);
  const headsRef = useRef<Record<string, { headshotUrl: string }> | null>(null);

  // Guards
  const prefetchStartedRef = useRef(false);
  const cacheLoadedRef = useRef(false);
  const fullWarmupStartedRef = useRef(false);

  // ===== 1) Load cache at startup =====
  useEffect(() => {
    (async () => {
      if (cacheLoadedRef.current) return;
      const cached = await readCache();
      if (cached?.data) setMeta(cached.data);
      cacheLoadedRef.current = true;
    })();
  }, []);

  // ===== 2) Prefetch sources on mount (so ensureForNames is instant) =====
  useEffect(() => {
    if (prefetchStartedRef.current) return;
    prefetchStartedRef.current = true;
    (async () => {
      try {
        const [baseMap, snap] = await Promise.all([fetchPlayerMap(), getDoc(doc(db, 'rankings', 'sf'))]);
        headsRef.current = baseMap ?? {};
        const list = snap.exists() ? (snap.data() as any).players ?? [] : [];
        const m = new Map<string, { position: string; team: string }>();
        for (const p of list) m.set(p.name, { position: p.position ?? 'N/A', team: p.team ?? 'FA' });
        rankingsRef.current = m;
      } catch {
        // ignore; ensureForNames will lazily fetch if needed
      }
    })();
  }, []);

  // ===== 3) Public API: hydrate only names we need =====
  const ensureForNames = useCallback(
    async (names: string[]) => {
      if (!names?.length) return;

      // Serve immediately for what we already know + preload images
      const existingUrls = names
        .map((n) => meta[n]?.headshotUrl)
        .filter((u): u is string => !!u)
        .slice(0, PRELOAD_COUNT);
      if (existingUrls.length) {
        FastImage.preload(Array.from(new Set(existingUrls)).map((uri) => ({ uri, priority: FastImage.priority.high })));
      }

      // Compute missing names
      const missing = names.filter((n) => !!n && !meta[n]);
      if (!missing.length) return;

      // Make sure sources are ready (fetch if not)
      if (!headsRef.current || !rankingsRef.current) {
        try {
          const [baseMap, snap] = await Promise.all([
            headsRef.current ? Promise.resolve(headsRef.current) : fetchPlayerMap(),
            rankingsRef.current ? Promise.resolve(null) : getDoc(doc(db, 'rankings', 'sf')),
          ]);
          if (!headsRef.current) headsRef.current = (baseMap as any) ?? {};
          if (!rankingsRef.current && snap) {
            const list = snap.exists() ? (snap.data() as any).players ?? [] : [];
            const m = new Map<string, { position: string; team: string }>();
            for (const p of list) m.set(p.name, { position: p.position ?? 'N/A', team: p.team ?? 'FA' });
            rankingsRef.current = m;
          }
        } catch {
          return; // soft-fail; UI can render without meta
        }
      }

      const heads = headsRef.current!;
      const ranks = rankingsRef.current!;

      const subset: MergedInfo = {};
      for (const n of missing) {
        subset[n] = {
          headshotUrl: heads[n]?.headshotUrl ?? '',
          position: ranks.get(n)?.position ?? 'N/A',
          team: ranks.get(n)?.team ?? 'FA',
        };
      }

      if (Object.keys(subset).length) {
        setMeta((prev) => {
          const next = { ...prev, ...subset };
          writeCache(next).catch(() => {});
          return next;
        });

        // Preload just-learned headshots
        const urls = Object.values(subset)
          .map((x) => x.headshotUrl)
          .filter(Boolean)
          .slice(0, PRELOAD_COUNT);
        if (urls.length) {
          FastImage.preload(Array.from(new Set(urls)).map((uri) => ({ uri, priority: FastImage.priority.high })));
        }
      }
    },
    [meta]
  );

  // ===== 4) Background: warm the FULL map once, then persist =====
  const warmAllInBackground = useCallback(async () => {
    if (fullWarmupStartedRef.current) return;
    fullWarmupStartedRef.current = true;

    try {
      // If cache is fresh enough and large, skip
      const cached = await readCache();
      if (cached?.data && Object.keys(cached.data).length > 300 && Date.now() - cached.updatedAt < SOFT_REFRESH_MS) {
        return;
      }

      // Ensure sources
      if (!headsRef.current || !rankingsRef.current) {
        const [baseMap, snap] = await Promise.all([fetchPlayerMap(), getDoc(doc(db, 'rankings', 'sf'))]);
        headsRef.current = baseMap ?? {};
        const list = snap.exists() ? (snap.data() as any).players ?? [] : [];
        const m = new Map<string, { position: string; team: string }>();
        for (const p of list) m.set(p.name, { position: p.position ?? 'N/A', team: p.team ?? 'FA' });
        rankingsRef.current = m;
      }

      const heads = headsRef.current!;
      const ranks = rankingsRef.current!;
      const all: MergedInfo = {};

      // Build the full merged map
      for (const [name, metaObj] of Object.entries(heads)) {
        all[name] = {
          headshotUrl: metaObj?.headshotUrl ?? '',
          position: ranks.get(name)?.position ?? 'N/A',
          team: ranks.get(name)?.team ?? 'FA',
        };
      }

      // Save to state + cache
      setMeta((prev) => {
        const next = { ...all, ...prev }; // prefer fresh 'all'
        writeCache(next).catch(() => {});
        return next;
      });

      // Optional: preload a chunk (don’t go crazy)
      const preloadUrls = Object.values(all)
        .map((x) => x.headshotUrl)
        .filter(Boolean)
        .slice(0, 150);
      if (preloadUrls.length) {
        FastImage.preload(Array.from(new Set(preloadUrls)).map((uri) => ({ uri })));
      }
    } catch {
      // ignore
    }
  }, []);

  return { meta, ensureForNames, warmAllInBackground };
}
