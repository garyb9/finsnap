import type { Bar, BarSeries, PackedBarSeries } from '../types';

/**
 * Columnar packing for storage. Roughly 40% smaller serialized than an array of
 * objects, which matters when a single max-history daily series is thousands of
 * bars and every symbol keeps one.
 */
export function packSeries(series: BarSeries): PackedBarSeries {
  return {
    symbol: series.symbol,
    interval: series.interval,
    fetchedAt: series.fetchedAt,
    t: series.bars.map((b) => b.time),
    o: series.bars.map((b) => b.open),
    h: series.bars.map((b) => b.high),
    l: series.bars.map((b) => b.low),
    c: series.bars.map((b) => b.close),
    v: series.bars.map((b) => b.volume),
  };
}

export function unpackSeries(packed: PackedBarSeries): BarSeries {
  const bars: Bar[] = packed.t.map((time, i) => ({
    time,
    open: packed.o[i],
    high: packed.h[i],
    low: packed.l[i],
    close: packed.c[i],
    volume: packed.v[i],
  }));

  return {
    symbol: packed.symbol,
    interval: packed.interval,
    bars,
    fetchedAt: packed.fetchedAt,
  };
}
