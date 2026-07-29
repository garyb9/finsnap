import type { Bar } from '../../collectors/types';
import { atr, closes, donchian, roc } from '../indicators';
import { StrategyKind, type Signal, type StrategyDef } from '../types';
import { defined, stateMachine, whenTrue } from './helpers';

/** Turtle-style channel breakout: buy new highs, exit on new lows. */
export function donchianBreakout(entryPeriod: number, exitPeriod: number): StrategyDef {
  return {
    id: `donchian_${entryPeriod}_${exitPeriod}`,
    name: `Donchian Breakout ${entryPeriod}/${exitPeriod}`,
    kind: StrategyKind.Breakout,
    description: `Buy a close above the ${entryPeriod}-bar high, exit below the ${exitPeriod}-bar low.`,
    params: { entryPeriod, exitPeriod },
    warmup: Math.max(entryPeriod, exitPeriod) + 1,
    signals(bars: Bar[]) {
      const price = closes(bars);
      const entryChannel = donchian(bars, entryPeriod);
      const exitChannel = donchian(bars, exitPeriod);
      return stateMachine(
        bars.length,
        (i) => defined(entryChannel.upper[i]) && price[i] > entryChannel.upper[i],
        (i) => defined(exitChannel.lower[i]) && price[i] < exitChannel.lower[i]
      );
    },
  };
}

/**
 * Absolute (time-series) momentum: hold the asset while its own trailing return
 * is positive, otherwise sit in cash. The single most robust published rule for
 * cutting drawdown, and the closest cousin to FinSnap's live TSMOM score.
 */
export function absoluteMomentum(lookback: number): StrategyDef {
  return {
    id: `abs_momentum_${lookback}`,
    name: `Absolute Momentum ${lookback}`,
    kind: StrategyKind.Momentum,
    description: `Long while the trailing ${lookback}-bar return is positive.`,
    params: { lookback },
    warmup: lookback + 1,
    signals(bars: Bar[]) {
      const momentum = roc(closes(bars), lookback);
      return whenTrue(bars.length, (i) => defined(momentum[i]) && momentum[i] > 0);
    },
  };
}

/**
 * Chandelier exit: enter on a channel breakout, then trail a stop `multiplier`
 * ATRs below the highest close reached since entry. Unlike the other rules this
 * one is path-dependent — the exit level depends on where the trade has already
 * been — so it needs an explicit loop rather than a vectorized comparison.
 */
export function chandelierTrend(
  entryPeriod: number,
  atrPeriod: number,
  multiplier: number
): StrategyDef {
  return {
    id: `chandelier_${entryPeriod}_${atrPeriod}_${multiplier}`,
    name: `Chandelier Trend ${entryPeriod}/${multiplier}x ATR`,
    kind: StrategyKind.Breakout,
    description:
      `Buy a close above the ${entryPeriod}-bar high, then trail a stop ` +
      `${multiplier}× ATR(${atrPeriod}) below the highest close since entry.`,
    params: { entryPeriod, atrPeriod, multiplier },
    warmup: Math.max(entryPeriod, atrPeriod * 2) + 1,
    signals(bars: Bar[]) {
      const price = closes(bars);
      const channel = donchian(bars, entryPeriod);
      const atrValues = atr(bars, atrPeriod);

      const signals = new Array<Signal>(bars.length).fill(0);
      let position = 0;
      let highestClose = -Infinity;

      for (let i = 0; i < bars.length; i++) {
        if (position === 0) {
          if (defined(channel.upper[i], atrValues[i]) && price[i] > channel.upper[i]) {
            position = 1;
            highestClose = price[i];
          }
        } else {
          if (price[i] > highestClose) highestClose = price[i];
          const stop = highestClose - multiplier * atrValues[i];
          if (defined(stop) && price[i] < stop) {
            position = 0;
            highestClose = -Infinity;
          }
        }
        signals[i] = position;
      }

      return signals;
    },
  };
}
