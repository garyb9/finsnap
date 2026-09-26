import type { Bar } from '../../collectors/types';
import { sma, stdev } from './movingAverages';

export interface BollingerSeries {
  middle: number[];
  upper: number[];
  lower: number[];
  /** Band width as a percentage of the middle band — a volatility regime proxy */
  bandwidth: number[];
  /** Position within the band: 0 = lower, 1 = upper */
  percentB: number[];
}

export function bollinger(values: number[], period = 20, mult = 2): BollingerSeries {
  const middle = sma(values, period);
  const sd = stdev(values, period);

  const upper = middle.map((m, i) => m + mult * sd[i]);
  const lower = middle.map((m, i) => m - mult * sd[i]);
  const bandwidth = middle.map((m, i) => (m > 0 ? ((upper[i] - lower[i]) / m) * 100 : NaN));
  const percentB = values.map((v, i) => {
    const span = upper[i] - lower[i];
    return span > 0 ? (v - lower[i]) / span : NaN;
  });

  return { middle, upper, lower, bandwidth, percentB };
}

export interface DonchianSeries {
  upper: number[];
  lower: number[];
}

/**
 * Donchian channel over the *prior* `period` bars, excluding the current one.
 *
 * Including the current bar's own high would make "close breaks above the
 * channel high" almost unreachable, since the bar sets the level it has to beat.
 */
export function donchian(bars: Bar[], period: number): DonchianSeries {
  const upper = new Array<number>(bars.length).fill(NaN);
  const lower = new Array<number>(bars.length).fill(NaN);

  for (let i = period; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period; j < i; j++) {
      if (bars[j].high > hi) hi = bars[j].high;
      if (bars[j].low < lo) lo = bars[j].low;
    }
    upper[i] = hi;
    lower[i] = lo;
  }

  return { upper, lower };
}

/** Rolling z-score of a series against its own moving average. */
export function zscore(values: number[], period: number): number[] {
  const mean = sma(values, period);
  const sd = stdev(values, period);
  return values.map((v, i) => (sd[i] > 0 ? (v - mean[i]) / sd[i] : NaN));
}
