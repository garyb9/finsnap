import { useEffect, useState } from 'react';
import { fetchPairs } from './api';
import type { PairsResponse } from '../types/pairs';

/** Fetches the latest cointegrated-pairs snapshot once on mount — no per-page choice to refetch on, unlike the correlation window. */
export function usePairs() {
  const [data, setData] = useState<PairsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchPairs().then((next) => {
      if (cancelled) return;
      if (next) setData(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading };
}
