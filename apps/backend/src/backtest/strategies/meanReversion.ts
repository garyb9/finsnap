import type { Bar } from '../../collectors/types';
import { bollinger, closes, rsi, zscore } from '../indicators';
import { StrategyKind, type StrategyDef } from '../types';
import { defined, stateMachine, whenTrue } from './helpers';

/** Buy oversold, sell overbought. The textbook RSI swing rule. */
export function rsiReversion(period: number, oversold: number, overbought: number): StrategyDef {
  return {
    id: `rsi_reversion_${period}_${oversold}_${overbought}`,
    name: `RSI Reversion ${period} (${oversold}/${overbought})`,
    kind: StrategyKind.MeanReversion,
    description: `Buy when RSI(${period}) drops below ${oversold}, sell when it rises above ${overbought}.`,
    params: { period, oversold, overbought },
    warmup: period * 2,
    signals(bars: Bar[]) {
      const r = rsi(closes(bars), period);
      return stateMachine(
        bars.length,
        (i) => defined(r[i]) && r[i] < oversold,
        (i) => defined(r[i]) && r[i] > overbought
      );
    },
  };
}

/**
 * Long while RSI is above its midline. Despite using the same indicator this is
 * a trend rule, not a reversion one — it is the mirror image of `rsiReversion`
 * and a useful check on which regime an asset actually rewards.
 */
export function rsiTrend(period: number, threshold: number): StrategyDef {
  return {
    id: `rsi_trend_${period}_${threshold}`,
    name: `RSI Trend ${period} (>${threshold})`,
    kind: StrategyKind.Momentum,
    description: `Long while RSI(${period}) holds above ${threshold}.`,
    params: { period, threshold },
    warmup: period * 2,
    signals(bars: Bar[]) {
      const r = rsi(closes(bars), period);
      return whenTrue(bars.length, (i) => defined(r[i]) && r[i] > threshold);
    },
  };
}

/** Buy the lower Bollinger band, sell the upper one. */
export function bollingerReversion(period: number, mult: number): StrategyDef {
  return {
    id: `bb_reversion_${period}_${mult}`,
    name: `Bollinger Reversion ${period}/${mult}σ`,
    kind: StrategyKind.MeanReversion,
    description: `Buy when the close touches the lower ${mult}σ band, sell at the upper band.`,
    params: { period, mult },
    warmup: period * 2,
    signals(bars: Bar[]) {
      const price = closes(bars);
      const bb = bollinger(price, period, mult);
      return stateMachine(
        bars.length,
        (i) => defined(bb.lower[i]) && price[i] <= bb.lower[i],
        (i) => defined(bb.upper[i]) && price[i] >= bb.upper[i]
      );
    },
  };
}

/**
 * The opposite trade: buy strength that breaks the upper band, exit back at the
 * middle. Band breaks tend to continue in trending assets and fail in
 * range-bound ones, so this and `bollingerReversion` rarely both work.
 */
export function bollingerBreakout(period: number, mult: number): StrategyDef {
  return {
    id: `bb_breakout_${period}_${mult}`,
    name: `Bollinger Breakout ${period}/${mult}σ`,
    kind: StrategyKind.Breakout,
    description: `Buy a close above the upper ${mult}σ band, exit back at the middle band.`,
    params: { period, mult },
    warmup: period * 2,
    signals(bars: Bar[]) {
      const price = closes(bars);
      const bb = bollinger(price, period, mult);
      return stateMachine(
        bars.length,
        (i) => defined(bb.upper[i]) && price[i] > bb.upper[i],
        (i) => defined(bb.middle[i]) && price[i] < bb.middle[i]
      );
    },
  };
}

/** Buy statistically cheap closes, exit once price returns to its mean. */
export function zscoreReversion(period: number, entryZ: number, exitZ: number): StrategyDef {
  return {
    id: `zscore_reversion_${period}_${entryZ}_${exitZ}`,
    name: `Z-Score Reversion ${period} (−${entryZ}σ)`,
    kind: StrategyKind.MeanReversion,
    description: `Buy when price sits ${entryZ}σ below its ${period}-bar mean, exit at ${exitZ}σ.`,
    params: { period, entryZ, exitZ },
    warmup: period * 2,
    signals(bars: Bar[]) {
      const z = zscore(closes(bars), period);
      return stateMachine(
        bars.length,
        (i) => defined(z[i]) && z[i] <= -entryZ,
        (i) => defined(z[i]) && z[i] >= exitZ
      );
    },
  };
}
