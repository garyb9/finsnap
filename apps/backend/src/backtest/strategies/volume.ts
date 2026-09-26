import type { Bar } from '../../collectors/types';
import { adl, closes, cmf, donchian, mfi, obv, sma, zscore } from '../indicators';
import { StrategyKind, type StrategyDef } from '../types';
import { defined, stateMachine, whenTrue } from './helpers';

/**
 * Strategies built on `bar.volume` — untouched by every other rule in this
 * engine. Grouped in one file because they share the same volume-flow
 * indicators rather than because they share a `StrategyKind`; `meanReversion.ts`
 * already does the same thing for `rsiTrend`.
 */

/** Long while On-Balance Volume holds above its own `period`-bar average. */
export function obvTrend(period: number): StrategyDef {
  return {
    id: `obv_trend_${period}`,
    name: `OBV Trend ${period}`,
    kind: StrategyKind.Trend,
    description: `Long while On-Balance Volume holds above its own ${period}-bar average.`,
    params: { period },
    warmup: period + 1,
    signals(bars: Bar[]) {
      const line = obv(bars);
      const average = sma(line, period);
      return whenTrue(bars.length, (i) => defined(line[i], average[i]) && line[i] > average[i]);
    },
  };
}

/** Long while the Accumulation/Distribution Line holds above its own `period`-bar average. */
export function adlTrend(period: number): StrategyDef {
  return {
    id: `adl_trend_${period}`,
    name: `A/D Line Trend ${period}`,
    kind: StrategyKind.Trend,
    description:
      `Long while the Accumulation/Distribution Line — volume weighted by where the close ` +
      `sits in its own day's range — holds above its own ${period}-bar average.`,
    params: { period },
    warmup: period + 1,
    signals(bars: Bar[]) {
      const line = adl(bars);
      const average = sma(line, period);
      return whenTrue(bars.length, (i) => defined(line[i], average[i]) && line[i] > average[i]);
    },
  };
}

/** Long while Chaikin Money Flow — buying vs. selling pressure over `period` bars — holds above `threshold`. */
export function cmfTrend(period: number, threshold: number): StrategyDef {
  return {
    id: `cmf_trend_${period}_${threshold}`,
    name: `CMF Trend ${period} (>${threshold})`,
    kind: StrategyKind.Momentum,
    description: `Long while Chaikin Money Flow(${period}) holds above ${threshold}.`,
    params: { period, threshold },
    warmup: period,
    signals(bars: Bar[]) {
      const flow = cmf(bars, period);
      return whenTrue(bars.length, (i) => defined(flow[i]) && flow[i] > threshold);
    },
  };
}

/** Buy oversold, sell overbought on the Money Flow Index — RSI with volume folded in. */
export function mfiReversion(period: number, oversold: number, overbought: number): StrategyDef {
  return {
    id: `mfi_reversion_${period}_${oversold}_${overbought}`,
    name: `MFI Reversion ${period} (${oversold}/${overbought})`,
    kind: StrategyKind.MeanReversion,
    description: `Buy when the Money Flow Index(${period}) drops below ${oversold}, sell when it rises above ${overbought}.`,
    params: { period, oversold, overbought },
    warmup: period * 2,
    signals(bars: Bar[]) {
      const flow = mfi(bars, period);
      return stateMachine(
        bars.length,
        (i) => defined(flow[i]) && flow[i] < oversold,
        (i) => defined(flow[i]) && flow[i] > overbought
      );
    },
  };
}

/**
 * The same Donchian breakout as `breakout.ts`, gated on entry by a volume
 * z-score: a close above the channel high only counts if it came on
 * above-average volume. The exit is left ungated — requiring confirmation to
 * get out as well as in would turn a risk control into another filter to
 * second-guess.
 */
export function volumeConfirmedBreakout(
  entryPeriod: number,
  exitPeriod: number,
  volPeriod: number,
  volZThreshold: number
): StrategyDef {
  return {
    id: `donchian_vol_confirmed_${entryPeriod}_${exitPeriod}_${volPeriod}_${volZThreshold}`,
    name: `Volume-Confirmed Breakout ${entryPeriod}/${exitPeriod}`,
    kind: StrategyKind.Breakout,
    description:
      `Buy a close above the ${entryPeriod}-bar high only when volume is at least ` +
      `${volZThreshold}σ above its ${volPeriod}-bar average; exit below the ${exitPeriod}-bar low.`,
    params: { entryPeriod, exitPeriod, volPeriod, volZThreshold },
    warmup: Math.max(entryPeriod, exitPeriod, volPeriod) + 1,
    signals(bars: Bar[]) {
      const price = closes(bars);
      const entryChannel = donchian(bars, entryPeriod);
      const exitChannel = donchian(bars, exitPeriod);
      const volumeZ = zscore(
        bars.map((b) => b.volume),
        volPeriod
      );
      return stateMachine(
        bars.length,
        (i) =>
          defined(entryChannel.upper[i], volumeZ[i]) &&
          price[i] > entryChannel.upper[i] &&
          volumeZ[i] > volZThreshold,
        (i) => defined(exitChannel.lower[i]) && price[i] < exitChannel.lower[i]
      );
    },
  };
}
