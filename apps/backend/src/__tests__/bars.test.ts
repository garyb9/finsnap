import { describe, it, expect } from 'vitest';
import { packSeries, unpackSeries, parseChart } from '../collectors/bars';
import { BarInterval } from '../collectors/types';
import { resampleCalendar, resampleFixed } from '../analyzers/resample';
import { barsFromCloses, risingCloses, toSeries, T0 } from './helpers/bars';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Minimal Yahoo chart payload builder. */
function makeChart(options: {
  timestamps: number[];
  open: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close: (number | null)[];
  volume?: (number | null)[];
  adjclose?: (number | null)[];
}) {
  return {
    timestamp: options.timestamps,
    indicators: {
      quote: [
        {
          open: options.open,
          high: options.high ?? options.open,
          low: options.low ?? options.close,
          close: options.close,
          volume: options.volume ?? options.close.map(() => 1000),
        },
      ],
      ...(options.adjclose ? { adjclose: [{ adjclose: options.adjclose }] } : {}),
    },
  };
}

describe('packSeries / unpackSeries', () => {
  it('round-trips a series without loss', () => {
    const series = toSeries(barsFromCloses(risingCloses(50)));
    const restored = unpackSeries(packSeries(series));

    expect(restored.symbol).toBe(series.symbol);
    expect(restored.interval).toBe(series.interval);
    expect(restored.bars).toEqual(series.bars);
  });

  it('serializes smaller than the object form', () => {
    const series = toSeries(barsFromCloses(risingCloses(500)));
    const packed = JSON.stringify(packSeries(series)).length;
    const raw = JSON.stringify(series).length;

    expect(packed).toBeLessThan(raw);
  });

  it('handles an empty series', () => {
    const series = toSeries([]);
    expect(unpackSeries(packSeries(series)).bars).toEqual([]);
  });
});

describe('parseChart', () => {
  const timestamps = [1_600_000_000, 1_600_086_400, 1_600_172_800];

  it('converts seconds to milliseconds', () => {
    const bars = parseChart(
      'TEST',
      BarInterval.Daily,
      makeChart({ timestamps, open: [10, 11, 12], close: [11, 12, 13] })
    );
    expect(bars[0].time).toBe(timestamps[0] * 1000);
  });

  it('drops rows with a null close rather than interpolating', () => {
    // A synthetic bar would become a tradeable price in the backtest.
    const bars = parseChart(
      'TEST',
      BarInterval.Daily,
      makeChart({ timestamps, open: [10, 11, 12], close: [11, null, 13] })
    );

    expect(bars).toHaveLength(2);
    expect(bars.map((b) => b.close)).toEqual([11, 13]);
  });

  it('drops rows with a null open', () => {
    const bars = parseChart(
      'TEST',
      BarInterval.Daily,
      makeChart({ timestamps, open: [10, null, 12], close: [11, 12, 13] })
    );
    expect(bars).toHaveLength(2);
  });

  it('rescales OHLC onto the adjusted-close basis', () => {
    // A 2:1 split halves adjusted close; raw OHLC must be scaled to match so
    // the split does not read as a -50% overnight gap.
    const bars = parseChart(
      'TEST',
      BarInterval.Daily,
      makeChart({
        timestamps,
        open: [100, 100, 100],
        close: [100, 100, 100],
        adjclose: [50, 50, 100],
      })
    );

    expect(bars[0].close).toBeCloseTo(50);
    expect(bars[0].open).toBeCloseTo(50);
    expect(bars[2].close).toBeCloseTo(100);
  });

  it('leaves prices untouched when no adjusted close is present', () => {
    const bars = parseChart(
      'TEST',
      BarInterval.Daily,
      makeChart({ timestamps, open: [10, 11, 12], close: [11, 12, 13] })
    );
    expect(bars.map((b) => b.close)).toEqual([11, 12, 13]);
  });

  it('collapses a repeated trailing timestamp, keeping the fresher copy', () => {
    const bars = parseChart(
      'TEST',
      BarInterval.Daily,
      makeChart({
        timestamps: [timestamps[0], timestamps[1], timestamps[1]],
        open: [10, 11, 11],
        close: [11, 12, 99],
      })
    );

    expect(bars).toHaveLength(2);
    expect(bars[1].close).toBe(99);
  });

  it('returns an empty array for a payload with no data', () => {
    expect(parseChart('TEST', BarInterval.Daily, {})).toEqual([]);
    expect(parseChart('TEST', BarInterval.Daily, { timestamp: [], indicators: {} })).toEqual([]);
  });

  it('rejects non-positive closes', () => {
    const bars = parseChart(
      'TEST',
      BarInterval.Daily,
      makeChart({ timestamps, open: [10, 11, 12], close: [11, 0, 13] })
    );
    expect(bars).toHaveLength(2);
  });
});

describe('resampleFixed', () => {
  it('builds 4H candles out of hourly bars', () => {
    const hourly = barsFromCloses([1, 2, 3, 4, 5, 6, 7, 8], HOUR_MS);
    const fourHour = resampleFixed(hourly, 4 * HOUR_MS);

    expect(fourHour).toHaveLength(2);
    expect(fourHour[0].open).toBe(hourly[0].open);
    expect(fourHour[0].close).toBe(hourly[3].close);
  });

  it('takes the extreme high and low of the group', () => {
    const hourly = barsFromCloses([10, 20, 5, 15], HOUR_MS);
    const [candle] = resampleFixed(hourly, 4 * HOUR_MS);

    expect(candle.high).toBe(Math.max(...hourly.map((b) => b.high)));
    expect(candle.low).toBe(Math.min(...hourly.map((b) => b.low)));
  });

  it('sums volume across the group', () => {
    const hourly = barsFromCloses([1, 2, 3, 4], HOUR_MS);
    const [candle] = resampleFixed(hourly, 4 * HOUR_MS);
    expect(candle.volume).toBe(hourly.reduce((s, b) => s + b.volume, 0));
  });

  it('returns nothing for an empty input', () => {
    expect(resampleFixed([], HOUR_MS)).toEqual([]);
  });
});

describe('resampleCalendar', () => {
  it('groups daily bars into weeks', () => {
    const daily = barsFromCloses(risingCloses(28), DAY_MS);
    const weekly = resampleCalendar(daily, 'week');

    expect(weekly.length).toBeGreaterThanOrEqual(4);
    expect(weekly.length).toBeLessThanOrEqual(6);
    expect(weekly.at(-1)!.close).toBe(daily.at(-1)!.close);
  });

  it('groups daily bars into months', () => {
    // 90 days from 2020-01-01 reaches Mar 30 — Jan/Feb/Mar, a leap year.
    const daily = barsFromCloses(risingCloses(90), DAY_MS);
    const monthly = resampleCalendar(daily, 'month');

    expect(monthly).toHaveLength(3);
    expect(monthly[0].time).toBe(T0);
  });

  it('buckets on UTC boundaries, independent of the host timezone', () => {
    // 2020-01-01 is a Wednesday; the week containing it starts Sunday Dec 29.
    const daily = barsFromCloses(risingCloses(14), DAY_MS);
    const weekly = resampleCalendar(daily, 'week');

    expect(weekly[0].time).toBe(T0);
    expect(new Date(weekly[1].time).getUTCDay()).toBe(0);
  });

  it('preserves first open and last close within a group', () => {
    const daily = barsFromCloses(risingCloses(31), DAY_MS);
    const [january] = resampleCalendar(daily, 'month');

    expect(january.open).toBe(daily[0].open);
    expect(january.close).toBe(daily[30].close);
  });
});
