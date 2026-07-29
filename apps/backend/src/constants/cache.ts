import { BarInterval } from './enums';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Bar cache lifetimes. Daily bars only change at the session close, so they can
 * be held for hours; intraday has to stay fresh enough for the live snap.
 */
export const BAR_CACHE_TTL_SECONDS: Record<BarInterval, number> = {
  [BarInterval.FiveMinute]: 5 * MINUTE,
  [BarInterval.Hourly]: 30 * MINUTE,
  [BarInterval.Daily]: 6 * HOUR,
};

export const OPTIONS_CACHE_TTL_SECONDS = 5 * MINUTE;
export const YAHOO_CRUMB_TTL_SECONDS = 23 * HOUR;

// --- Snapshot storage ---
export const SNAP_TTL_SECONDS = DAY;
export const SNAP_LATEST_TTL_SECONDS = 2 * HOUR;
export const SNAP_HISTORY_MAX = 100;

// --- Report storage ---
export const REPORT_TTL_SECONDS = 90 * DAY;
/** Long enough to survive a three-day weekend without going empty. */
export const REPORT_LATEST_TTL_SECONDS = 3 * DAY;
export const REPORT_HISTORY_MAX = 180;

// --- Redis key prefixes ---
export const REDIS_KEYS = {
  bars: 'finsnap:bars',
  options: 'finsnap:options',
  yahooCrumb: 'finsnap:yahoo:crumb',
  snap: 'snap',
  snapLatest: 'snap:latest',
  snapHistory: 'snap:history',
  report: 'report',
  reportLatest: 'report:latest',
  reportDate: 'report:date',
  reportHistory: 'report:history',
} as const;
