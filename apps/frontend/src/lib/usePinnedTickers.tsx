import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useLocalStorage } from './useLocalStorage';

const STORAGE_KEY = 'finsnap:pinned-tickers';
const MAX_PINNED = 8;

interface PinnedTickersValue {
  pinned: string[];
  isPinned: (symbol: string) => boolean;
  toggle: (symbol: string) => void;
  maxPinned: number;
}

const PinnedTickersContext = createContext<PinnedTickersValue | null>(null);

/**
 * One shared source of truth, not one `useLocalStorage` instance per card —
 * each instance only syncs to storage on its own writes, so two cards
 * pinning in the same render pass would race and clobber each other.
 */
export function PinnedTickersProvider({ children }: { children: ReactNode }) {
  const [pinned, setPinned] = useLocalStorage<string[]>(STORAGE_KEY, []);

  const isPinned = useCallback((symbol: string) => pinned.includes(symbol), [pinned]);

  const toggle = useCallback(
    (symbol: string) => {
      setPinned((prev) => {
        if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
        if (prev.length >= MAX_PINNED) return prev;
        return [...prev, symbol];
      });
    },
    [setPinned]
  );

  return (
    <PinnedTickersContext.Provider value={{ pinned, isPinned, toggle, maxPinned: MAX_PINNED }}>
      {children}
    </PinnedTickersContext.Provider>
  );
}

export function usePinnedTickers(): PinnedTickersValue {
  const ctx = useContext(PinnedTickersContext);
  if (!ctx) throw new Error('usePinnedTickers must be used within a PinnedTickersProvider');
  return ctx;
}
