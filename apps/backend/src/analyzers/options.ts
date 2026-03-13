import type { OptionsData } from '../collectors/types';
import type { OptionsAnalysis, OptionsLegStats } from './types';

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
    };
  });

  return { ticker: data.ticker, expirations };
}
