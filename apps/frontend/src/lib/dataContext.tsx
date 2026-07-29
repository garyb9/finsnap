import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchGuide, fetchReport, fetchSnap, fetchStrategyLeaderboard } from './api';
import type { FinSnap } from '../types/finsnap';
import type { Guide } from '../types/guide';
import type { StrategyLeaderboard } from '../types/leaderboard';
import type { CompactReport } from '../types/report';

const SNAP_POLL_MS = 60_000;
const REPORT_POLL_MS = 5 * 60_000;
const SNAP_STALE_MS = 15 * 60_000;

interface FinSnapData {
  snap: FinSnap | null;
  report: CompactReport | null;
  guide: Guide | null;
  /** Cross-asset strategy standings — derives from the report, so it polls on the same cadence */
  leaderboard: StrategyLeaderboard | null;
  loading: boolean;
  /** True when the newest snapshot is old enough to distrust */
  stale: boolean;
  lastFetched: Date | null;
}

const EMPTY: FinSnapData = {
  snap: null,
  report: null,
  guide: null,
  leaderboard: null,
  loading: true,
  stale: false,
  lastFetched: null,
};

const DataContext = createContext<FinSnapData>(EMPTY);

/**
 * Fetches the snapshot, report and guide once for the whole app.
 *
 * Lifted out of the dashboard when the pages were split: four tabs each doing
 * their own polling would multiply the request rate by four and make every tab
 * switch re-fetch data the app already had. Living above the router also means
 * a poll in flight survives navigation.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<FinSnap | null>(null);
  const [report, setReport] = useState<CompactReport | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [leaderboard, setLeaderboard] = useState<StrategyLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadSnap = async () => {
      const next = await fetchSnap();
      if (cancelled) return;
      if (next) setSnap(next);
      setLastFetched(new Date());
    };

    const loadReport = async () => {
      const next = await fetchReport();
      if (!cancelled && next) setReport(next);
    };

    // Derives from the same report build, so it changes on the same cadence.
    const loadLeaderboard = async () => {
      const next = await fetchStrategyLeaderboard();
      if (!cancelled && next) setLeaderboard(next);
    };

    // Static for the lifetime of the server, so fetched once rather than polled.
    const loadGuide = async () => {
      const next = await fetchGuide();
      if (!cancelled && next) setGuide(next);
    };

    Promise.all([loadSnap(), loadReport(), loadLeaderboard(), loadGuide()]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    const snapTimer = setInterval(loadSnap, SNAP_POLL_MS);
    const reportTimer = setInterval(loadReport, REPORT_POLL_MS);
    const leaderboardTimer = setInterval(loadLeaderboard, REPORT_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(snapTimer);
      clearInterval(reportTimer);
      clearInterval(leaderboardTimer);
    };
  }, []);

  // Keeps the "x ago" labels ticking without refetching.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const age = snap ? Date.now() - new Date(snap.timestamp).getTime() : Infinity;

  return (
    <DataContext.Provider
      value={{
        snap,
        report,
        guide,
        leaderboard,
        loading,
        stale: snap !== null && age > SNAP_STALE_MS,
        lastFetched,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useFinSnapData(): FinSnapData {
  return useContext(DataContext);
}
