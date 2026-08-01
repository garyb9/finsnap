import type { Bar } from '../../collectors/types';

/**
 * Where the close sits within the bar's own high-low range, scaled to
 * [-1, 1]: +1 at the high (all buying pressure), -1 at the low (all selling
 * pressure), 0 at the midpoint or on a bar with no range at all. Shared by
 * every indicator below that weights volume by where the bar closed, rather
 * than just the sign of the day's change.
 */
function moneyFlowMultiplier(bar: Bar): number {
  const range = bar.high - bar.low;
  return range > 0 ? ((bar.close - bar.low) - (bar.high - bar.close)) / range : 0;
}

/**
 * On-Balance Volume: a running total of volume, added on an up close and
 * subtracted on a down close. The cruder of the volume-flow measures here —
 * it only looks at the sign of the day's change, not where the close landed
 * within the bar, so a wide-range bar that closes near its open still counts
 * as a full-volume vote one way or the other.
 */
export function obv(bars: Bar[]): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  if (bars.length === 0) return out;

  out[0] = 0;
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    const direction = bars[i].close > prevClose ? 1 : bars[i].close < prevClose ? -1 : 0;
    out[i] = out[i - 1] + direction * bars[i].volume;
  }
  return out;
}

/**
 * Accumulation/Distribution Line: a running total of money flow volume —
 * volume weighted by where the close sits in the bar's range, rather than
 * OBV's all-or-nothing sign. Chaikin built this specifically to fix cases OBV
 * gets wrong, so the two are deliberately kept as separate indicators rather
 * than one with a "mode" flag.
 */
export function adl(bars: Bar[]): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  let running = 0;
  for (let i = 0; i < bars.length; i++) {
    running += moneyFlowMultiplier(bars[i]) * bars[i].volume;
    out[i] = running;
  }
  return out;
}

/** Chaikin Money Flow: money flow volume as a fraction of total volume over `period` bars, in [-1, 1]. */
export function cmf(bars: Bar[], period: number): number[] {
  const out = new Array<number>(bars.length).fill(NaN);

  for (let i = period - 1; i < bars.length; i++) {
    let flow = 0;
    let vol = 0;
    for (let j = i - period + 1; j <= i; j++) {
      flow += moneyFlowMultiplier(bars[j]) * bars[j].volume;
      vol += bars[j].volume;
    }
    out[i] = vol > 0 ? flow / vol : NaN;
  }
  return out;
}

/** Money Flow Index: RSI computed on typical-price money flow instead of raw price change. */
export function mfi(bars: Bar[], period: number): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  if (bars.length <= period) return out;

  const typical = bars.map((b) => (b.high + b.low + b.close) / 3);
  const rawFlow = typical.map((tp, i) => tp * bars[i].volume);

  for (let i = period; i < bars.length; i++) {
    let positive = 0;
    let negative = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (typical[j] > typical[j - 1]) positive += rawFlow[j];
      else if (typical[j] < typical[j - 1]) negative += rawFlow[j];
    }
    out[i] = negative > 0 ? 100 - 100 / (1 + positive / negative) : 100;
  }
  return out;
}
