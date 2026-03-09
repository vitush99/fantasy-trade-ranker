// hooks/useFilteredTrades.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { fetchFilteredTradesPage } from '@data/dataloader';
import type { PageOpts } from '@data/dataloader';
import type { TradeFilters } from '@appTypes/trades';

type UseFilteredTradesOpts = {
  pageSize?: number;
  orderField?: PageOpts['orderField'];
  orderDir?: PageOpts['orderDir'];
  currentUserId?: string;
};

export function useFilteredTrades(filters: TradeFilters, opts: UseFilteredTradesOpts = {}) {
  const { pageSize = 25, orderField, orderDir = 'desc', currentUserId } = opts;

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);

  // handy to prevent overlapping requests
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // stable filters stringify (so useCallback deps are stable)
  const stableFilters = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  // ---------- helpers ----------
  const log = (...args: any[]) => console.log('[useFilteredTrades]', ...args);

  const loadFirst = useCallback(async () => {
    if (inFlightRef.current) {
      log('loadFirst() skipped: already in-flight');
      return;
    }
    inFlightRef.current = true;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setItems([]);
    setCursor(null);
    setHasMore(true);

    log('loadFirst() start', {
      filters: JSON.parse(stableFilters),
      pageSize,
      orderField,
      orderDir,
      currentUserId,
    });

    try {
      const { trades, nextCursor } = await fetchFilteredTradesPage(
        JSON.parse(stableFilters),
        { pageSize, orderField, orderDir, cursor: null },
        currentUserId
      );

      log('loadFirst() fetched', { batchSize: trades.length, nextCursor: Boolean(nextCursor) });

      setItems(trades);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
    } catch (err) {
      log('loadFirst() ERROR', err);
      // If Firestore throws due to invalid/empty `in` constraints, surface that clearly
      setHasMore(false);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
      log('loadFirst() done', { items: items.length }); // items here is stale in closure; next effect logs will show real count
    }
  }, [stableFilters, pageSize, orderField, orderDir, currentUserId]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !cursor) {
      log('loadMore() skipped', { loading, hasMore, hasCursor: Boolean(cursor) });
      return;
    }
    if (inFlightRef.current) {
      log('loadMore() skipped: already in-flight');
      return;
    }
    inFlightRef.current = true;
    setLoading(true);

    log('loadMore() start', {
      filters: JSON.parse(stableFilters),
      pageSize,
      orderField,
      orderDir,
      hasCursor: Boolean(cursor),
    });

    try {
      const { trades, nextCursor } = await fetchFilteredTradesPage(
        JSON.parse(stableFilters),
        { pageSize, orderField, orderDir, cursor },
        currentUserId
      );

      log('loadMore() fetched', { batchSize: trades.length, nextCursor: Boolean(nextCursor) });

      setItems(prev => {
        const merged = [...prev, ...trades];
        log('loadMore() merged total', merged.length);
        return merged;
      });
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
    } catch (err) {
      log('loadMore() ERROR', err);
      // back off on errors to avoid loops
      setHasMore(false);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
      log('loadMore() done');
    }
  }, [loading, hasMore, cursor, stableFilters, pageSize, orderField, orderDir, currentUserId]);

  // ---------- effects ----------
  useEffect(() => {
    log('effect:init-or-filters-changed → calling loadFirst()');
    loadFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFirst]);

  // surface state transitions
  useEffect(() => {
    log('state', {
      items: items.length,
      loading,
      hasMore,
      hasCursor: Boolean(cursor),
    });
  }, [items.length, loading, hasMore, cursor]);

  return { items, loading, hasMore, loadMore, reload: loadFirst };
}
