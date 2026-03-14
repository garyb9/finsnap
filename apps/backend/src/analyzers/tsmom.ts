/**
 * Time-Series Momentum (TSMOM) for assets (ETH, BTC, ...).
 * Ported from soul-bot. Output: 0-100 (>50 = bullish continuation, <50 = bearish).
 */

import { createLogger } from '../logger';
import type { TimeframeAnalysis, Timeframe, TsmomSignal } from './types';

const log = createLogger('tsmom');

const EVAL_TFS: Timeframe[] = ['5M', '1H', '4H', 'D', 'W'];

const TF_WEIGHTS: Record<Timeframe, number> = {
  '5M': 0.5,
  '1H': 1,
  '4H': 1.5,
  D: 2,
  W: 2.5,
  M: 3,
};

function tsmomLabel(score: number): string {
  if (score >= 75) return 'strong continuation';
  if (score >= 60) return 'continuation';
  if (score >= 45) return 'indecision';
  if (score >= 30) return 'fading';
  return 'reversal pressure';
}

function analyzeAssetTsmom(timeframes: TimeframeAnalysis[], assetLabel: string): TsmomSignal {
  const tfs = timeframes.filter((t): t is TimeframeAnalysis => EVAL_TFS.includes(t.timeframe));

  if (tfs.length === 0) {
    return {
      score: 50,
      label: 'no data',
      components: {
        directional: 50,
        emaStructure: 50,
        emaTrajectory: 50,
        acceleration: 50,
        bbConfirmation: 50,
      },
    };
  }

  // 1. Directional alignment (25%)
  let dirSum = 0,
    dirTotal = 0;
  for (const tf of tfs) {
    const w = TF_WEIGHTS[tf.timeframe] ?? 1;
    const signal = Math.max(-1, Math.min(1, tf.changePct / 3));
    dirSum += signal * w;
    dirTotal += w;
  }
  const directional = 50 + (dirSum / dirTotal) * 50;

  // 2. EMA structure (25%)
  let emaSum = 0,
    emaTotal = 0;
  for (const tf of tfs) {
    const w = TF_WEIGHTS[tf.timeframe] ?? 1;
    emaSum += (tf.ema20AboveEma50 ? 1 : -1) * w;
    emaTotal += w;
  }
  const emaStructure = 50 + (emaSum / emaTotal) * 50;

  // 3. EMA trajectory (20%)
  let trajSum = 0,
    trajTotal = 0;
  for (const tf of tfs) {
    const w = TF_WEIGHTS[tf.timeframe] ?? 1;
    const e20 = tf.ema20Trajectory === 'rising' ? 1 : tf.ema20Trajectory === 'falling' ? -1 : 0;
    const e50 = tf.ema50Trajectory === 'rising' ? 1 : tf.ema50Trajectory === 'falling' ? -1 : 0;
    trajSum += (e20 * 0.6 + e50 * 0.4) * w;
    trajTotal += w;
  }
  const emaTrajectory = 50 + (trajSum / trajTotal) * 50;

  // 4. Acceleration / exhaustion (15%)
  let acceleration = 50;
  if (tfs.length >= 2) {
    const shortRet = tfs[0].changePct;
    const longRet = tfs[tfs.length - 1].changePct;
    if (shortRet > 0 && longRet > 0) acceleration = shortRet >= longRet ? 80 : 65;
    else if (shortRet < 0 && longRet < 0) acceleration = shortRet <= longRet ? 20 : 35;
    else if (shortRet > 0 && longRet <= 0) acceleration = 60;
    else acceleration = 40;
  }

  // 5. BB confirmation (15%)
  const primaryTf = tfs[tfs.length - 1];
  const pctB = primaryTf.bollinger.percentB;
  const bw = primaryTf.bollinger.bandwidth;
  let bbConfirmation = 50;
  if (primaryTf.changePct > 0) {
    bbConfirmation = 50 + (pctB - 0.5) * 40;
    if (bw < 2) bbConfirmation += 5;
  } else {
    bbConfirmation = 50 - (0.5 - pctB) * 40;
    if (bw < 2) bbConfirmation -= 5;
  }
  bbConfirmation = Math.max(0, Math.min(100, bbConfirmation));

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        directional * 0.25 +
          emaStructure * 0.25 +
          emaTrajectory * 0.2 +
          acceleration * 0.15 +
          bbConfirmation * 0.15
      )
    )
  );

  const label = tsmomLabel(score);
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

export function analyzeEthTsmom(timeframes: TimeframeAnalysis[]): TsmomSignal {
  return analyzeAssetTsmom(timeframes, 'ETH');
}

export function analyzeBtcTsmom(timeframes: TimeframeAnalysis[]): TsmomSignal {
  return analyzeAssetTsmom(timeframes, 'BTC');
}
