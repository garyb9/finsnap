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
