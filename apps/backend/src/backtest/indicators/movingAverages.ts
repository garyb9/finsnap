import type { Bar } from '../../collectors/types';

export function closes(bars: Bar[]): number[] {
  return bars.map((b) => b.close);
}

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;

  const k = 2 / (period + 1);
  // Seed with the SMA of the first `period` values, the conventional warm-up.
  let prev = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Rolling population standard deviation. */
export function stdev(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 1) return out;

  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    const mean = window.reduce((s, v) => s + v, 0) / period;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

/** Rate of change over `period` bars, as a percentage. */
export function roc(values: number[], period: number): number[] {
  return values.map((v, i) => {
    if (i < period) return NaN;
    const base = values[i - period];
    return base > 0 ? ((v - base) / base) * 100 : NaN;
  });
}

/** Rolling maximum over the prior `period` bars, excluding the current bar. */
export function rollingMax(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    let hi = -Infinity;
    for (let j = i - period; j < i; j++) if (values[j] > hi) hi = values[j];
    out[i] = hi;
  }
  return out;
}
