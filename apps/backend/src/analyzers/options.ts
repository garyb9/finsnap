import type { OptionsData } from '../collectors/types';
import { OptionsSide, OptionsSkewLabel } from '../constants/enums';
import type { OptionsAnalysis, OptionsLegStats, OptionsSkewInsight } from './types';

/** Weighted mean: sum(v[i] * w[i]) / sum(w[i]) */
export function weightedMean(values: number[], weights: number[]): number {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return 0;
  return values.reduce((s, v, i) => s + v * weights[i], 0) / totalWeight;
}

/** Weighted std: sqrt( sum(w[i] * (v[i]-mean)^2) / sum(w[i]) ) */
export function weightedStd(values: number[], weights: number[], mean: number): number {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return 0;
  const variance =
    values.reduce((s, v, i) => s + weights[i] * Math.pow(v - mean, 2), 0) / totalWeight;
  return Math.sqrt(variance);
}

function analyzeleg(
  contracts: { strike: number; volume: number; openInterest: number }[]
): OptionsLegStats {
  const totalVolume = contracts.reduce((s, c) => s + c.volume, 0);
  const totalOI = contracts.reduce((s, c) => s + c.openInterest, 0);

  const strikes = contracts.map((c) => c.strike);
  const volWeights = contracts.map((c) => c.volume);

  const weightedMeanStrike = weightedMean(strikes, volWeights);
  const weightedStdStrike = weightedStd(strikes, volWeights, weightedMeanStrike);

  return { totalVolume, totalOI, weightedMeanStrike, weightedStdStrike };
}

function computeSkewInsight(
  spotPrice: number,
  calls: OptionsLegStats,
  puts: OptionsLegStats
): OptionsSkewInsight {
  const eps = 1e-6;
  const totalVolume = calls.totalVolume + puts.totalVolume;
  const totalOi = calls.totalOI + puts.totalOI;

  // Very thin expiries are not meaningful for skew insight
  const THIN_NOTIONAL_THRESHOLD = 5_000;
  if (totalVolume + totalOi < THIN_NOTIONAL_THRESHOLD || spotPrice <= 0) {
    return {
      label: OptionsSkewLabel.Thin,
      skewScore: 0,
      dominantSide: OptionsSide.None,
      volRatio: 1,
      oiRatio: 1,
      wallStrike: 0,
      distanceToSpotAbs: 0,
      distanceToSpotPct: 0,
      nearSpotCluster: false,
      note: 'Low liquidity — expiry not meaningful',
    };
  }

  const volRatio = puts.totalVolume / (calls.totalVolume + eps);
  const oiRatio = puts.totalOI / (calls.totalOI + eps);

  // Combine volume + OI into a symmetric skew score
  const skewScore = 0.5 * (Math.log(Math.max(volRatio, eps)) + Math.log(Math.max(oiRatio, eps)));

  let dominantSide: OptionsSide = OptionsSide.None;
  if (skewScore > 0.05) dominantSide = OptionsSide.Puts;
  else if (skewScore < -0.05) dominantSide = OptionsSide.Calls;

  const dominantLeg = dominantSide === OptionsSide.Puts ? puts : calls;
  const wallStrike = dominantLeg.weightedMeanStrike;
  const distanceToSpotAbs = wallStrike - spotPrice;
  const distanceToSpotPct = (distanceToSpotAbs / spotPrice) * 100;

  const stdPct = (dominantLeg.weightedStdStrike / spotPrice) * 100;
  const withinStd = Math.abs(distanceToSpotAbs) <= dominantLeg.weightedStdStrike * 1.5;
  const nearSpotCluster = withinStd && stdPct <= 10;

  const PUT_DOM_THRESHOLD = 1.3;
  const CALL_DOM_THRESHOLD = 1 / PUT_DOM_THRESHOLD;

  let label: OptionsSkewLabel = OptionsSkewLabel.Balanced;
  let note: string | undefined;

  if (
    volRatio >= PUT_DOM_THRESHOLD &&
    oiRatio >= PUT_DOM_THRESHOLD &&
    dominantSide === OptionsSide.Puts
  ) {
    label = OptionsSkewLabel.PutStack;
    if (distanceToSpotAbs < 0 && Math.abs(distanceToSpotPct) <= 20) {
      note = 'Puts stacking below spot — potential dip zone';
    } else if (distanceToSpotAbs < 0) {
      note = 'Puts stacked further below spot';
    } else {
      note = 'Puts dominant but not clearly below spot';
    }
  } else if (
    volRatio <= CALL_DOM_THRESHOLD &&
    oiRatio <= CALL_DOM_THRESHOLD &&
    dominantSide === OptionsSide.Calls
  ) {
    label = OptionsSkewLabel.CallStack;
    if (distanceToSpotAbs > 0 && Math.abs(distanceToSpotPct) <= 20) {
      note = 'Calls stacking above spot — potential squeeze/ceiling';
    } else if (distanceToSpotAbs > 0) {
      note = 'Calls stacked further above spot';
    } else {
      note = 'Calls dominant but not clearly above spot';
    }
  } else if (
    dominantSide === OptionsSide.Puts &&
    skewScore >= 0.08 &&
    Math.abs(distanceToSpotPct) <= 12
  ) {
    label = OptionsSkewLabel.SoftPut;
    note = distanceToSpotAbs < 0 ? 'Mild put lean below spot' : 'Mild put lean near/above spot';
  } else if (
    dominantSide === OptionsSide.Calls &&
    skewScore <= -0.08 &&
    Math.abs(distanceToSpotPct) <= 12
  ) {
    label = OptionsSkewLabel.SoftCall;
    note = distanceToSpotAbs > 0 ? 'Mild call lean above spot' : 'Mild call lean near/below spot';
  } else {
    label = OptionsSkewLabel.Balanced;
    note = 'No strong skew between puts and calls';
  }

  return {
    label,
    skewScore,
    dominantSide,
    volRatio,
    oiRatio,
    wallStrike,
    distanceToSpotAbs,
    distanceToSpotPct,
    nearSpotCluster,
    note,
  };
}

export function analyzeOptionsChain(data: OptionsData): OptionsAnalysis {
  const expirations = data.chains.map((chain) => {
    const calls = analyzeleg(chain.calls);
    const puts = analyzeleg(chain.puts);
    const pcRatio = calls.totalVolume > 0 ? puts.totalVolume / calls.totalVolume : 0;

    return {
      date: chain.expiration,
      pcRatio: Math.round(pcRatio * 1000) / 1000,
      calls,
      puts,
      insight: computeSkewInsight(data.price, calls, puts),
    };
  });

  return { ticker: data.ticker, description: data.description, expirations };
}
