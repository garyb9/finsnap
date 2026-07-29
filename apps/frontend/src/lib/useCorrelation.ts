import { useEffect, useState } from 'react';
import { fetchCorrelation } from './api';
import type { CorrelationMatrix } from '../types/correlation';

/**
 * Fetches the correlation matrix for one lookback window.
 *
 * Kept out of `DataProvider`: every other value there is fetched once and
 * shared because no page controls it, but the window here is a choice the
 * reader makes on this one tab, so it is fetched locally and refetched only
 * when that choice changes.
 */
export function useCorrelation(windowId: string) {
  const [matrix, setMatrix] = useState<CorrelationMatrix | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchCorrelation(windowId).then((next) => {
      if (cancelled) return;
      if (next) setMatrix(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [windowId]);

  return { matrix, loading };
}
