import type { Bar } from '../collectors/types';
import { DAY_MS } from '../constants';

/** Merge a run of bars into one: first open, max high, min low, last close. */
function aggregate(group: Bar[]): Bar {
  return {
    time: group[0].time,
    open: group[0].open,
    high: Math.max(...group.map((b) => b.high)),
    low: Math.min(...group.map((b) => b.low)),
    close: group[group.length - 1].close,
    volume: group.reduce((sum, b) => sum + b.volume, 0),
  };
}

function groupBy(bars: Bar[], keyOf: (bar: Bar) => number): Bar[] {
  if (bars.length === 0) return [];

  const out: Bar[] = [];
  let currentKey = keyOf(bars[0]);
  let group: Bar[] = [];

  for (const bar of bars) {
    const key = keyOf(bar);
    if (key !== currentKey && group.length > 0) {
      out.push(aggregate(group));
      group = [];
      currentKey = key;
    }
    group.push(bar);
  }

  if (group.length > 0) out.push(aggregate(group));
  return out;
}

/**
 * Calendar boundaries in UTC.
 *
 * Deliberately not date-fns's `startOfWeek` / `startOfMonth`, which resolve in
 * the host's local timezone — that would make weekly and monthly candles depend
 * on where the container happens to run, and shift silently across daylight
 * saving. Bar timestamps are UTC, so the buckets are too.
 */
function startOfUtcMonth(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function startOfUtcYear(ms: number): number {
  return Date.UTC(new Date(ms).getUTCFullYear(), 0, 1);
}

/** Weeks start Sunday, matching the common charting convention. */
function startOfUtcWeek(ms: number): number {
  const date = new Date(ms);
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return dayStart - date.getUTCDay() * DAY_MS;
}

/**
 * Resample onto a fixed-width grid — used to build 4H candles from hourly bars.
 * Buckets are anchored to the epoch so they stay stable across fetches.
 */
export function resampleFixed(bars: Bar[], bucketMs: number): Bar[] {
  return groupBy(bars, (bar) => Math.floor(bar.time / bucketMs) * bucketMs);
}

/**
 * Resample onto calendar boundaries. Weeks and months are not a fixed number of
 * milliseconds, so a fixed grid would drift and straddle boundaries.
 */
export function resampleCalendar(bars: Bar[], unit: 'week' | 'month' | 'year'): Bar[] {
  const boundary =
    unit === 'week' ? startOfUtcWeek : unit === 'month' ? startOfUtcMonth : startOfUtcYear;
  return groupBy(bars, (bar) => boundary(bar.time));
}
