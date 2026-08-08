import { useCallback, useEffect, useState } from 'react';

/**
 * Persisted state backed by localStorage.
 *
 * Reads happen after mount, not during initial render: SSR has no
 * localStorage, so starting from `initialValue` on both server and first
 * client render keeps them in agreement. A returning user with a stored
 * value sees a one-frame correction right after hydration rather than a
 * server/client markup mismatch.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // Corrupt or inaccessible storage — fall back to initialValue silently.
    }
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = next instanceof Function ? next(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Storage full or unavailable — state still updates in memory.
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, set];
}
