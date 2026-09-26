import type { BarInterval } from './enums';

export enum SyncPhase {
  Fetching = 'fetching',
  Snapshot = 'snapshot',
  Report = 'report',
  Done = 'done',
}

export enum SyncState {
  Idle = 'idle',
  Running = 'running',
  Done = 'done',
  Failed = 'failed',
}

export enum SyncStage {
  Queued = 'queued',
  Bars = 'bars',
  Options = 'options',
  Done = 'done',
  Empty = 'empty',
  Failed = 'failed',
}

export type FetchRecord = {
  interval: BarInterval;
  /** True when the cache answered and no request left the server */
  cached: boolean;
  bars: number;
  ms: number;
  ok: boolean;
};

export type SyncStep = {
  symbol: string;
  label: string;
  stage: SyncStage;
  fetches: FetchRecord[];
  /** When this symbol's fetch began, so the UI can show live elapsed time while it's still running */
  startedAt: string | null;
  ms: number | null;
  error?: string;
};

export type SyncJob = {
  id: string;
  state: SyncState;
  phase: SyncPhase;
  startedAt: string;
  finishedAt: string | null;
  elapsedMs: number;
  current: string | null;
  completed: number;
  total: number;
  steps: SyncStep[];
  error?: string;
};
