import { BarInterval, type Bar, type BarSeries } from '../../collectors/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch start for deterministic test timestamps: 2020-01-01T00:00:00Z. */
export const T0 = Date.UTC(2020, 0, 1);

/**
 * Build bars from a list of closes. Each bar opens at the previous close (or
 * its own close on the first bar), so a series is a continuous path with no
 * artificial overnight gaps.
 */
export function barsFromCloses(closes: number[], stepMs = DAY_MS): Bar[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    return {
      time: T0 + i * stepMs,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume: 1_000,
    };
  });
}

/** Build bars with explicit open/close pairs, for execution-price assertions. */
export function barsFromOhlc(
  rows: { open: number; close: number; high?: number; low?: number }[],
  stepMs = DAY_MS
): Bar[] {
  return rows.map((row, i) => ({
    time: T0 + i * stepMs,
    open: row.open,
    high: row.high ?? Math.max(row.open, row.close),
    low: row.low ?? Math.min(row.open, row.close),
    close: row.close,
    volume: 1_000,
  }));
}

export function toSeries(
  bars: Bar[],
  interval: BarInterval = BarInterval.Daily,
  symbol = 'TEST'
): BarSeries {
  return { symbol, interval, bars, fetchedAt: Date.now() };
}

/** A steadily rising series — trend strategies should be long throughout. */
export function risingCloses(count: number, start = 100, stepPct = 1): number[] {
  const out: number[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    out.push(price);
    price *= 1 + stepPct / 100;
  }
  return out;
}

/** Overrides volume on each bar, positionally — for tests that need it to vary. */
export function withVolume(bars: Bar[], volumes: number[]): Bar[] {
  return bars.map((b, i) => ({ ...b, volume: volumes[i] ?? b.volume }));
}

/** A deterministic oscillating series, for mean-reversion rules. */
export function oscillatingCloses(
  count: number,
  base = 100,
  amplitude = 10,
  period = 20
): number[] {
  return Array.from(
    { length: count },
    (_, i) => base + amplitude * Math.sin((2 * Math.PI * i) / period)
  );
}
