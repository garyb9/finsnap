import { BarInterval } from '../collectors/types';

export { BarInterval };

/** Where a sync run is in its overall sequence. */
export enum SyncPhase {
  /** Pulling bars and option chains for every symbol — the slow, networked part */
  Fetching = 'fetching',
  /** Rebuilding the live snapshot off the now-warm cache */
  Snapshot = 'snapshot',
  /** Re-running every backtest and rebuilding the daily report */
  Report = 'report',
  Done = 'done',
}

export enum SyncState {
  Idle = 'idle',
  Running = 'running',
  Done = 'done',
  Failed = 'failed',
}

/** Where one symbol is in its own fetch. */
export enum SyncStage {
  Queued = 'queued',
  Bars = 'bars',
  Options = 'options',
  Done = 'done',
  /** Reached the end but had nothing usable — e.g. no history from the source */
  Empty = 'empty',
  Failed = 'failed',
}

/** One network round trip, kept so the UI can show where the time went. */
export interface FetchRecord {
  interval: BarInterval;
  /** True when the cache answered and no request left the process */
  cached: boolean;
  bars: number;
  ms: number;
  ok: boolean;
}

export interface SyncStep {
  symbol: string;
  label: string;
  stage: SyncStage;
  fetches: FetchRecord[];
  /** When this symbol's fetch began, so a client can show live elapsed time while it's still running */
  startedAt: string | null;
  /** Wall-clock time on this symbol, once finished */
  ms: number | null;
  error?: string;
}

/**
 * What `GET /sync` returns before a sync has ever run.
 *
 * Same shape as a real job so the client has one type to handle rather than a
 * job-or-null union it would have to narrow at every use.
 */
export function idleJob(): SyncJob {
  return {
    id: '',
    state: SyncState.Idle,
    phase: SyncPhase.Done,
    startedAt: '',
    finishedAt: null,
    elapsedMs: 0,
    current: null,
    completed: 0,
    total: 0,
    steps: [],
  };
}

export interface SyncJob {
  id: string;
  state: SyncState;
  phase: SyncPhase;
  startedAt: string;
  finishedAt: string | null;
  elapsedMs: number;
  /** Symbol currently being worked on, if any */
  current: string | null;
  completed: number;
  total: number;
  steps: SyncStep[];
  error?: string;
}
