import { BarInterval } from './enums';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How often a resync bothers checking Yahoo for new bars, per interval. */
export const BAR_SYNC_THROTTLE_SECONDS: Record<BarInterval, number> = {
  [BarInterval.FiveMinute]: 5 * MINUTE,
  [BarInterval.Hourly]: 30 * MINUTE,
  [BarInterval.Daily]: 6 * HOUR,
};

/** Postgres retention per interval, in days. Daily is omitted — kept forever. */
export const BAR_RETENTION_DAYS: Partial<Record<BarInterval, number>> = {
  [BarInterval.Hourly]: 730,
  [BarInterval.FiveMinute]: 60,
};

export const OPTIONS_CACHE_TTL_SECONDS = 5 * MINUTE;
/** Per-ticker retention for the options-chain daily snapshot archive. */
export const OPTION_SNAPSHOT_RETENTION_DAYS = 30;
export const YAHOO_CRUMB_TTL_SECONDS = 23 * HOUR;

/** How long a ticker pulled in by a user search stays in the tracked universe. */
export const SEARCHED_TICKER_TTL_SECONDS = DAY;

// --- Snapshot storage ---
export const SNAP_TTL_SECONDS = DAY;
export const SNAP_LATEST_TTL_SECONDS = 2 * HOUR;
export const SNAP_HISTORY_MAX = 100;

// --- Report storage ---
export const REPORT_TTL_SECONDS = 90 * DAY;
/** Long enough to survive a three-day weekend without going empty. */
export const REPORT_LATEST_TTL_SECONDS = 3 * DAY;
export const REPORT_HISTORY_MAX = 180;

/**
 * Market cap and fund size move slowly, and an hour-stale figure changes no
 * decision — so this is cached far longer than price data.
 */
export const QUOTE_CACHE_TTL_SECONDS = 6 * 60 * 60;

/** Key names used by `PostgresStorage` (kv_entries/kv_list_entries) for snap/report storage. */
export const STORAGE_KEYS = {
  snap: 'snap',
  snapLatest: 'snap:latest',
  snapHistory: 'snap:history',
  report: 'report',
  reportLatest: 'report:latest',
  reportDate: 'report:date',
  reportHistory: 'report:history',
} as const;
