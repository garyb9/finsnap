import type { Bar } from '../../collectors/types';
import { closes, ema, macd, sma, supertrend } from '../indicators';
import { StrategyKind, type StrategyDef } from '../types';
import { defined, whenTrue } from './helpers';

/** Long while the fast SMA is above the slow SMA — the classic golden cross. */
export function smaCross(fast: number, slow: number): StrategyDef {
  return {
    id: `sma_cross_${fast}_${slow}`,
    name: `SMA Cross ${fast}/${slow}`,
    kind: StrategyKind.Trend,
    description: `Long while the ${fast}-bar simple average is above the ${slow}-bar average.`,
    params: { fast, slow },
    warmup: slow,
    signals(bars: Bar[]) {
      const price = closes(bars);
      const fastMa = sma(price, fast);
      const slowMa = sma(price, slow);
      return whenTrue(bars.length, (i) => defined(fastMa[i], slowMa[i]) && fastMa[i] > slowMa[i]);
    },
  };
}

/** Long while the fast EMA is above the slow EMA. Faster to react than SMA. */
export function emaCross(fast: number, slow: number): StrategyDef {
  return {
    id: `ema_cross_${fast}_${slow}`,
    name: `EMA Cross ${fast}/${slow}`,
    kind: StrategyKind.Trend,
    description: `Long while the ${fast}-bar exponential average is above the ${slow}-bar average.`,
    params: { fast, slow },
    warmup: slow,
    signals(bars: Bar[]) {
      const price = closes(bars);
      const fastEma = ema(price, fast);
      const slowEma = ema(price, slow);
      return whenTrue(
        bars.length,
        (i) => defined(fastEma[i], slowEma[i]) && fastEma[i] > slowEma[i]
      );
    },
  };
}

/**
 * Long while price is above its own long moving average. The simplest possible
 * trend filter, and historically one of the hardest to beat on drawdown.
 */
export function priceAboveSma(period: number): StrategyDef {
  return {
    id: `price_above_sma_${period}`,
    name: `Price > SMA${period}`,
    kind: StrategyKind.Trend,
    description: `Long while the close is above its ${period}-bar simple average.`,
    params: { period },
    warmup: period,
    signals(bars: Bar[]) {
      const price = closes(bars);
      const ma = sma(price, period);
      return whenTrue(bars.length, (i) => defined(ma[i]) && price[i] > ma[i]);
    },
  };
}

/** Long while the MACD line is above its signal line. */
export function macdCross(fast: number, slow: number, signalPeriod: number): StrategyDef {
  return {
    id: `macd_${fast}_${slow}_${signalPeriod}`,
    name: `MACD ${fast}/${slow}/${signalPeriod}`,
    kind: StrategyKind.Trend,
    description: `Long while the MACD line is above its ${signalPeriod}-bar signal line.`,
    params: { fast, slow, signal: signalPeriod },
    warmup: slow + signalPeriod,
    signals(bars: Bar[]) {
      const { macd: line, signal } = macd(closes(bars), fast, slow, signalPeriod);
      return whenTrue(bars.length, (i) => defined(line[i], signal[i]) && line[i] > signal[i]);
    },
  };
}

/** Long while the Supertrend ATR band sits below price. */
export function supertrendFollow(period: number, multiplier: number): StrategyDef {
  return {
    id: `supertrend_${period}_${multiplier}`,
    name: `Supertrend ${period}/${multiplier}x`,
    kind: StrategyKind.Trend,
    description: `Long while price holds above the ${multiplier}x ATR(${period}) Supertrend band.`,
    params: { period, multiplier },
    warmup: period * 2,
    signals(bars: Bar[]) {
      const { direction } = supertrend(bars, period, multiplier);
      return whenTrue(bars.length, (i) => defined(direction[i]) && direction[i] > 0);
    },
  };
}
