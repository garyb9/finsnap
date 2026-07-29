/**
 * Time-Series Momentum (TSMOM) — a live read on trend strength across
 * timeframes. Output: 0-100 (>50 = bullish continuation, <50 = bearish).
 *
 * This is the discretionary cousin of the `abs_momentum` backtest strategy:
 * same underlying idea, but blended across timeframes and reported as a score
 * rather than a position.
 */

import { createLogger } from '../logger';
import { TSMOM_COMPONENT_WEIGHTS, TSMOM_LABELS, TSMOM_TIMEFRAME_WEIGHTS } from '../constants';
import { clamp } from '../lib/math';
import { pickBand } from '../lib/format';
import { Timeframe, Trajectory } from '../constants/enums';
import type { TimeframeAnalysis, TsmomSignal } from './types';

const log = createLogger('tsmom');

const EVAL_TIMEFRAMES: Timeframe[] = [
  Timeframe.M5,
  Timeframe.H1,
  Timeframe.H4,
  Timeframe.D,
  Timeframe.W,
];

const NEUTRAL = 50;

/** Percent move that counts as a full-strength directional signal. */
const FULL_MOVE_PCT = 3;

/** Bollinger bandwidth below which a squeeze bonus applies. */
const TIGHT_BANDWIDTH = 2;
const SQUEEZE_BONUS = 5;

const NEUTRAL_SIGNAL: TsmomSignal = {
  score: NEUTRAL,
  label: 'no data',
  components: {
    directional: NEUTRAL,
    emaStructure: NEUTRAL,
    emaTrajectory: NEUTRAL,
    acceleration: NEUTRAL,
    bbConfirmation: NEUTRAL,
  },
};

function weightOf(timeframe: Timeframe): number {
  return TSMOM_TIMEFRAME_WEIGHTS[timeframe] ?? 1;
}

/** Weighted average of a per-timeframe signal in [-1, 1], mapped onto 0-100. */
function weightedScore(
  timeframes: TimeframeAnalysis[],
  signalOf: (tf: TimeframeAnalysis) => number
): number {
  let sum = 0;
  let total = 0;

  for (const tf of timeframes) {
    const weight = weightOf(tf.timeframe);
    sum += signalOf(tf) * weight;
    total += weight;
  }

  return total > 0 ? NEUTRAL + (sum / total) * NEUTRAL : NEUTRAL;
}

/** Is the short-horizon move outrunning the long-horizon one, or fading? */
function accelerationScore(timeframes: TimeframeAnalysis[]): number {
  if (timeframes.length < 2) return NEUTRAL;

  const short = timeframes[0].changePct;
  const long = timeframes[timeframes.length - 1].changePct;

  if (short > 0 && long > 0) return short >= long ? 80 : 65;
  if (short < 0 && long < 0) return short <= long ? 20 : 35;
  return short > 0 ? 60 : 40;
}

/** Does the Bollinger position confirm the direction of the move? */
function bollingerConfirmation(primary: TimeframeAnalysis): number {
  const { percentB, bandwidth } = primary.bollinger;
  const rising = primary.changePct > 0;

  let score = rising ? NEUTRAL + (percentB - 0.5) * 40 : NEUTRAL - (0.5 - percentB) * 40;

  if (bandwidth < TIGHT_BANDWIDTH) score += rising ? SQUEEZE_BONUS : -SQUEEZE_BONUS;

  return clamp(score, 0, 100);
}

function trajectorySignal(label: Trajectory): number {
  if (label === Trajectory.Rising) return 1;
  if (label === Trajectory.Falling) return -1;
  return 0;
}

export function analyzeTsmom(timeframes: TimeframeAnalysis[], assetLabel: string): TsmomSignal {
  const evaluated = timeframes.filter((tf) => EVAL_TIMEFRAMES.includes(tf.timeframe));
  if (evaluated.length === 0) return NEUTRAL_SIGNAL;

  const directional = weightedScore(evaluated, (tf) => clamp(tf.changePct / FULL_MOVE_PCT, -1, 1));
  const emaStructure = weightedScore(evaluated, (tf) => (tf.ema20AboveEma50 ? 1 : -1));
  const emaTrajectory = weightedScore(
    evaluated,
    (tf) => trajectorySignal(tf.ema20Trajectory) * 0.6 + trajectorySignal(tf.ema50Trajectory) * 0.4
  );
  const acceleration = accelerationScore(evaluated);
  const bbConfirmation = bollingerConfirmation(evaluated[evaluated.length - 1]);

  const w = TSMOM_COMPONENT_WEIGHTS;
  const score = Math.round(
    clamp(
      directional * w.directional +
        emaStructure * w.emaStructure +
        emaTrajectory * w.emaTrajectory +
        acceleration * w.acceleration +
        bbConfirmation * w.bbConfirmation,
      0,
      100
    )
  );

  const label = pickBand(TSMOM_LABELS, score).label;
  log.info(`${assetLabel} TSMOM: ${score} (${label})`);

  return {
    score,
    label,
    components: {
      directional: Math.round(directional),
      emaStructure: Math.round(emaStructure),
      emaTrajectory: Math.round(emaTrajectory),
      acceleration: Math.round(acceleration),
      bbConfirmation: Math.round(bbConfirmation),
    },
  };
}
