import { ema } from './movingAverages';

/**
 * Wilder's RSI (smoothed), not the simple-average variant.
 *
 * The simple rolling-mean version reacts far more sharply and makes RSI
 * strategies look more active than they are in practice — which would inflate
 * both trade counts and apparent edge in the backtest.
 */
export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum -= delta;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

export interface MacdSeries {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const line = fastEma.map((f, i) => f - slowEma[i]);

  // The signal EMA is seeded from the first bar where the MACD line exists;
  // running it over the raw array would let warm-up NaNs poison the series.
  const firstValid = line.findIndex((v) => Number.isFinite(v));
  const signal = new Array<number>(values.length).fill(NaN);

  if (firstValid >= 0) {
    const tailSignal = ema(line.slice(firstValid), signalPeriod);
    for (let i = 0; i < tailSignal.length; i++) signal[firstValid + i] = tailSignal[i];
  }

  return { macd: line, signal, histogram: line.map((v, i) => v - signal[i]) };
}
