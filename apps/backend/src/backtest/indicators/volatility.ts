import type { Bar } from '../../collectors/types';

/** True range per bar; the first bar uses high-low since there is no prior close. */
export function trueRange(bars: Bar[]): number[] {
  return bars.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const prevClose = bars[i - 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose)
    );
  });
}

/**
 * Exponentially-weighted moving standard deviation of a return series
 * (RiskMetrics-style), in the same units as the input returns — not
 * annualized. `lambda` closer to 1 remembers further back; 0.94 is the
 * RiskMetrics daily default. Deliberately a closed-form recursion rather than
 * a full GARCH(1,1) fit — the simplest estimator sufficient for scaling
 * position size, not a volatility-forecasting model in its own right.
 */
export function ewmaVolatility(returns: number[], lambda = 0.94): number[] {
  const out = new Array<number>(returns.length).fill(NaN);
  let variance = NaN;

  for (let i = 0; i < returns.length; i++) {
    const r = returns[i];
    if (!Number.isFinite(r)) continue;

    variance = Number.isFinite(variance) ? lambda * variance + (1 - lambda) * r * r : r * r;
    out[i] = Math.sqrt(variance);
  }

  return out;
}

/** Wilder-smoothed Average True Range. */
export function atr(bars: Bar[], period = 14): number[] {
  const tr = trueRange(bars);
  const out = new Array<number>(bars.length).fill(NaN);
  if (bars.length <= period) return out;

  let prev = tr.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;
  out[period] = prev;

  for (let i = period + 1; i < bars.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/**
 * Wilder's ADX(period) — trend strength, independent of direction. Built the
 * same way as `atr()` above: seeded from a plain average over the first
 * `period` bars, then Wilder-smoothed one bar at a time. ADX itself is a
 * second layer of the same smoothing applied to DX, so it only becomes
 * defined after `2 * period - 1` bars.
 */
export function adx(bars: Bar[], period = 14): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  if (bars.length <= period * 2 - 1) return out;

  const tr = trueRange(bars);
  const plusDM = new Array<number>(bars.length).fill(0);
  const minusDM = new Array<number>(bars.length).fill(0);

  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  let avgTR = tr.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;
  let avgPlusDM = plusDM.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;
  let avgMinusDM = minusDM.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;

  const dx = new Array<number>(bars.length).fill(NaN);
  const recordDx = (i: number) => {
    const plusDI = avgTR > 0 ? (avgPlusDM / avgTR) * 100 : 0;
    const minusDI = avgTR > 0 ? (avgMinusDM / avgTR) * 100 : 0;
    const sum = plusDI + minusDI;
    dx[i] = sum > 0 ? (Math.abs(plusDI - minusDI) / sum) * 100 : 0;
  };
  recordDx(period);

  for (let i = period + 1; i < bars.length; i++) {
    avgTR = (avgTR * (period - 1) + tr[i]) / period;
    avgPlusDM = (avgPlusDM * (period - 1) + plusDM[i]) / period;
    avgMinusDM = (avgMinusDM * (period - 1) + minusDM[i]) / period;
    recordDx(i);
  }

  // ADX is a Wilder-smoothed average of DX, seeded once a full `period` of DX
  // values exists — indices `period` through `2 * period - 1`.
  let avgDx = dx.slice(period, period * 2).reduce((s, v) => s + v, 0) / period;
  out[period * 2 - 1] = avgDx;

  for (let i = period * 2; i < bars.length; i++) {
    avgDx = (avgDx * (period - 1) + dx[i]) / period;
    out[i] = avgDx;
  }

  return out;
}

export interface SupertrendSeries {
  /** +1 while the trend is up, -1 while it is down */
  direction: number[];
  /** The active stop line — below price in an uptrend, above it in a downtrend */
  line: number[];
}

/**
 * Supertrend — ATR bands that ratchet in the direction of the trend.
 *
 * The bands only ever tighten toward price while the prior close stays on their
 * side; that ratchet is what turns a symmetric envelope into a trailing stop.
 */
export function supertrend(bars: Bar[], period = 10, multiplier = 3): SupertrendSeries {
  const atrValues = atr(bars, period);
  const direction = new Array<number>(bars.length).fill(NaN);
  const line = new Array<number>(bars.length).fill(NaN);

  let upperBand = NaN;
  let lowerBand = NaN;
  let trend = 1;

  for (let i = 0; i < bars.length; i++) {
    const a = atrValues[i];
    if (!Number.isFinite(a)) continue;

    const mid = (bars[i].high + bars[i].low) / 2;
    let basicUpper = mid + multiplier * a;
    let basicLower = mid - multiplier * a;

    if (Number.isFinite(upperBand) && !(basicUpper < upperBand || bars[i - 1].close > upperBand)) {
      basicUpper = upperBand;
    }
    if (Number.isFinite(lowerBand) && !(basicLower > lowerBand || bars[i - 1].close < lowerBand)) {
      basicLower = lowerBand;
    }

    upperBand = basicUpper;
    lowerBand = basicLower;

    if (bars[i].close > upperBand) trend = 1;
    else if (bars[i].close < lowerBand) trend = -1;

    direction[i] = trend;
    line[i] = trend === 1 ? lowerBand : upperBand;
  }

  return { direction, line };
}
