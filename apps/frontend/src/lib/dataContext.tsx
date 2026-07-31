import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchGuide, fetchReport, fetchSnap, fetchStrategyLeaderboard } from './api';
import { useSync } from './useSync';
import { SyncState } from '../types/sync';
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
  /** Re-fetch snap, report and leaderboard right away, without waiting for the next poll. */
  refresh: () => Promise<void>;
}

const EMPTY: FinSnapData = {
  snap: null,
  report: null,
  guide: null,
  leaderboard: null,
  loading: true,
  stale: false,
  lastFetched: null,
  refresh: async () => {},
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
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const loadSnap = useCallback(async () => {
    const next = await fetchSnap();
    if (!mounted.current) return;
    if (next) setSnap(next);
    setLastFetched(new Date());
  }, []);

  const loadReport = useCallback(async () => {
    const next = await fetchReport();
    if (mounted.current && next) setReport(next);
  }, []);

  // Derives from the same report build, so it changes on the same cadence.
  const loadLeaderboard = useCallback(async () => {
    const next = await fetchStrategyLeaderboard();
    if (mounted.current && next) setLeaderboard(next);
  }, []);

  // Static for the lifetime of the server, so fetched once rather than polled.
  const loadGuide = useCallback(async () => {
    const next = await fetchGuide();
    if (mounted.current && next) setGuide(next);
  }, []);

  /**
   * Re-fetch everything but the guide right away, bypassing the poll cadence.
   *
   * Exposed so a one-off action that just changed server state — searching a
   * ticker into the universe, most notably — can show its own result without
   * waiting out a 60s or 5-minute timer.
   */
  const refresh = useCallback(async () => {
    await Promise.all([loadSnap(), loadReport(), loadLeaderboard()]);
  }, [loadSnap, loadReport, loadLeaderboard]);

  useEffect(() => {
    Promise.all([loadSnap(), loadReport(), loadLeaderboard(), loadGuide()]).finally(() => {
      if (mounted.current) setLoading(false);
    });

    const snapTimer = setInterval(loadSnap, SNAP_POLL_MS);
    const reportTimer = setInterval(loadReport, REPORT_POLL_MS);
    const leaderboardTimer = setInterval(loadLeaderboard, REPORT_POLL_MS);

    return () => {
      clearInterval(snapTimer);
      clearInterval(reportTimer);
      clearInterval(leaderboardTimer);
    };
  }, [loadSnap, loadReport, loadLeaderboard, loadGuide]);

  // Keeps the "x ago" labels ticking without refetching.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // A sync can be triggered from elsewhere — the sync panel, or a ticker
  // search pulling a new symbol into the universe — and either way the poll
  // cadence above shouldn't be the only thing standing between "the job
  // finished" and the dashboard showing it.
  const { job: syncJob } = useSync();
  const wasSyncing = useRef(false);
  useEffect(() => {
    const running = syncJob?.state === SyncState.Running;
    if (wasSyncing.current && !running) void refresh();
    wasSyncing.current = running;
  }, [syncJob, refresh]);

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
        refresh,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useFinSnapData(): FinSnapData {
  return useContext(DataContext);
}
