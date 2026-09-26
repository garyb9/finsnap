import type { Bar } from '../../collectors/types';
import { closes, ewmaVolatility, roc } from '../indicators';
import { StrategyKind, type StrategyDef } from '../types';
import { defined, volatilityScaled, whenTrue } from './helpers';

/**
 * Absolute momentum, sized down when realized volatility runs hot and back up
 * (capped at full exposure) when it's calmer than the target — the
 * volatility-driven risk-sizing idea behind hftbacktest's market-making
 * quotes, adapted to a long/flat swing signal instead of a two-sided quote.
 * `periodsPerYear` defaults to the equities daily convention used throughout
 * this codebase's own annualization (see `metrics.ts`); pass 252 regardless
 * of the bar interval unless targeting hourly bars specifically.
 */
export function volTargetedMomentum(
  lookback: number,
  targetVolPct: number,
  periodsPerYear = 252
): StrategyDef {
  return {
    id: `vol_targeted_momentum_${lookback}_${targetVolPct}`,
    name: `Vol-Targeted Momentum ${lookback} @ ${targetVolPct}%`,
    kind: StrategyKind.Momentum,
    description:
      `Long while the trailing ${lookback}-bar return is positive, sized to a ` +
      `${targetVolPct}% annualized volatility target.`,
    params: { lookback, targetVolPct, periodsPerYear },
    warmup: lookback + 1,
    signals(bars: Bar[]) {
      const price = closes(bars);
      const momentum = roc(price, lookback);
      const base = whenTrue(bars.length, (i) => defined(momentum[i]) && momentum[i] > 0);

      const dailyReturns = roc(price, 1).map((pct) => pct / 100);
      const realizedVolPct = ewmaVolatility(dailyReturns).map((v) =>
        Number.isFinite(v) ? v * Math.sqrt(periodsPerYear) * 100 : NaN
      );

      return volatilityScaled(base, realizedVolPct, targetVolPct);
    },
  };
}
