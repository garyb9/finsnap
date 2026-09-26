import type { Bar } from '../../collectors/types';
import { TSMOM_COMPONENT_WEIGHTS } from '../../constants';
import { clamp } from '../../lib/math';
import { bollinger, closes, ema, roc } from '../indicators';
import { StrategyKind, type StrategyDef } from '../types';
import { whenTrue } from './helpers';

/**
 * The TSMOM score, rebuilt so it can be backtested.
 *
 * FinSnap already reports a live TSMOM number, but that number has never been
 * held to account: it blends five timeframes into a 0-100 reading and nothing
 * ever checked whether acting on it would have made money. This strategy exists
 * to answer that, by trading the score and letting the engine judge it like any
 * other rule.
 *
 * It is deliberately NOT the same computation as `analyzers/tsmom.ts`, and the
 * difference matters:
 *
 *   - The live score blends 5m, 1H, 4H, D and W. Intraday history from the data
 *     source reaches back two years at best, so a multi-timeframe version could
 *     not be tested over the windows that matter.
 *   - This version applies the same five components, with the same weights, to
 *     a single series. On daily bars it is the daily-only TSMOM.
 *
 * So the backtest answers "does this scoring approach have an edge on this
 * asset", not "is the number on the dashboard exactly right". Treating the two
 * as interchangeable would be the mistake; naming it separately is the fix.
 */

const NEUTRAL = 50;

/** Percent move that counts as a full-strength directional signal. */
const FULL_MOVE_PCT = 3;
/** Bars over which the directional component is measured. */
const DIRECTIONAL_LOOKBACK = 5;
/** Bars back used to decide whether an average is rising or falling. */
const TRAJECTORY_LOOKBACK = 5;
/** Short and long horizons for the acceleration comparison. */
const FAST_LOOKBACK = 10;
const SLOW_LOOKBACK = 60;

const FAST_EMA = 20;
const SLOW_EMA = 50;
const BB_PERIOD = 20;
const BB_MULT = 2;
const TIGHT_BANDWIDTH = 2;
const SQUEEZE_BONUS = 5;

/** Warm-up is set by the slowest input, not the average of them. */
const WARMUP = SLOW_LOOKBACK + SLOW_EMA;

/** Maps a signal in [-1, 1] onto the 0-100 scale the score is expressed in. */
function toScore(signal: number): number {
  return NEUTRAL + clamp(signal, -1, 1) * NEUTRAL;
}

/** Mirrors the analyzer: is the short move outrunning the long one, or fading? */
function accelerationScore(fast: number, slow: number): number {
  if (!Number.isFinite(fast) || !Number.isFinite(slow)) return NEUTRAL;

  if (fast > 0 && slow > 0) return fast >= slow ? 80 : 65;
  if (fast < 0 && slow < 0) return fast <= slow ? 20 : 35;
  return fast > 0 ? 60 : 40;
}

/**
 * The per-bar TSMOM score for one series.
 *
 * Exported for the tests, which check it against the properties the score
 * claims to have rather than against a golden number.
 */
export function tsmomScores(bars: Bar[]): number[] {
  const price = closes(bars);
  const fastEma = ema(price, FAST_EMA);
  const slowEma = ema(price, SLOW_EMA);
  const bands = bollinger(price, BB_PERIOD, BB_MULT);
  const directionalRoc = roc(price, DIRECTIONAL_LOOKBACK);
  const fastRoc = roc(price, FAST_LOOKBACK);
  const slowRoc = roc(price, SLOW_LOOKBACK);

  const w = TSMOM_COMPONENT_WEIGHTS;

  return bars.map((_, i) => {
    if (i < WARMUP) return NaN;

    const directional = toScore(directionalRoc[i] / FULL_MOVE_PCT);
    const structure = toScore(fastEma[i] > slowEma[i] ? 1 : -1);

    const fastRising = fastEma[i] > fastEma[i - TRAJECTORY_LOOKBACK] ? 1 : -1;
    const slowRising = slowEma[i] > slowEma[i - TRAJECTORY_LOOKBACK] ? 1 : -1;
    const trajectory = toScore(fastRising * 0.6 + slowRising * 0.4);

    const acceleration = accelerationScore(fastRoc[i], slowRoc[i]);

    const upper = bands.upper[i];
    const lower = bands.lower[i];
    const width = upper - lower;
    const percentB = width > 0 ? (price[i] - lower) / width : 0.5;
    const bandwidth = bands.middle[i] > 0 ? (width / bands.middle[i]) * 100 : 0;
    const rising = directionalRoc[i] > 0;

    let confirmation = rising ? NEUTRAL + (percentB - 0.5) * 40 : NEUTRAL - (0.5 - percentB) * 40;
    if (bandwidth < TIGHT_BANDWIDTH) confirmation += rising ? SQUEEZE_BONUS : -SQUEEZE_BONUS;
    confirmation = clamp(confirmation, 0, 100);

    return clamp(
      directional * w.directional +
        structure * w.emaStructure +
        trajectory * w.emaTrajectory +
        acceleration * w.acceleration +
        confirmation * w.bbConfirmation,
      0,
      100
    );
  });
}

/** Long while the TSMOM score holds above `threshold`. */
export function tsmomTrend(threshold: number): StrategyDef {
  return {
    id: `tsmom_${threshold}`,
    name: `TSMOM Score (>${threshold})`,
    kind: StrategyKind.Momentum,
    description:
      `Long while the blended TSMOM score — direction, EMA structure, EMA slope, ` +
      `acceleration and Bollinger position — holds above ${threshold}. This is the ` +
      `single-timeframe form of the score shown live on each asset, so the backtest ` +
      `says whether that reading is worth acting on.`,
    params: { threshold },
    warmup: WARMUP,
    signals(bars: Bar[]) {
      const scores = tsmomScores(bars);
      return whenTrue(bars.length, (i) => Number.isFinite(scores[i]) && scores[i] > threshold);
    },
  };
}
