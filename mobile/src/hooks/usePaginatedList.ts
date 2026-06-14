import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaginatedResult } from '@/types/api';

type FetchPageFn<T> = (
  cursor: string | undefined,
  limit: number,
) => Promise<PaginatedResult<T>>;

type UsePaginatedListOptions = {
  limit?: number;
  enabled?: boolean;
};

export function usePaginatedList<T>(
  fetchPage: FetchPageFn<T>,
  options: UsePaginatedListOptions = {},
) {
  const { limit = 20, enabled = true } = options;
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const loadPage = useCallback(
    async (mode: 'initial' | 'more' | 'refresh') => {
      if (!enabled) return;
      const isRefresh = mode === 'refresh';
      const isMore = mode === 'more';
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);
      try {
        const page = await fetchRef.current(isMore ? cursor ?? undefined : undefined, limit);
        setItems((prev) => (isMore ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
        setHasNextPage(page.hasNextPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [cursor, enabled, limit],
  );

  useEffect(() => {
    if (enabled) {
      void loadPage('initial');
    }
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => loadPage('refresh'), [loadPage]);
  const loadMore = useCallback(() => {
    if (!hasNextPage || isLoading) return;
    return loadPage('more');
  }, [hasNextPage, isLoading, loadPage]);

  return {
    items,
    isLoading,
    isRefreshing,
    hasNextPage,
    error,
    refresh,
    loadMore,
    retry: () => loadPage('initial'),
  };
}
