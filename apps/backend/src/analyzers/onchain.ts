import type { CollectorState } from '../collectors/types';
import type { WhaleAnalysis, GasAnalysis, VolumeAnalysis } from './types';

// --- Whale analyzer ---

const BASELINE_WHALES_PER_HOUR = 5;

export function analyzeWhales(state: CollectorState): WhaleAnalysis {
  const allWhales = state.blocks.flatMap((b) => b.whaleTransfers);

  if (allWhales.length === 0) {
    return {
      totalWhaleTransfers: 0,
      totalWhaleVolumeEth: 0,
      largestTransfer: null,
      uniqueWhaleAddresses: 0,
      whaleEnergy: 0,
      topWhales: [],
    };
  }

  const totalVolume = allWhales.reduce((sum, w) => sum + w.valueEth, 0);
  const largest = allWhales.reduce((max, w) => (w.valueEth > max.valueEth ? w : max), allWhales[0]);

  const addressMap = new Map<string, { totalEth: number; txCount: number }>();
  for (const w of allWhales) {
    for (const addr of [w.from, w.to]) {
      const existing = addressMap.get(addr) ?? { totalEth: 0, txCount: 0 };
      existing.totalEth += w.valueEth;
      existing.txCount += 1;
      addressMap.set(addr, existing);
    }
  }

  const topWhales = [...addressMap.entries()]
    .map(([address, stats]) => ({ address, ...stats }))
    .sort((a, b) => b.totalEth - a.totalEth)
    .slice(0, 10);

  const windowHours = Math.max((state.endTime - state.startTime) / 3600, 1);
  const whalesPerHour = allWhales.length / windowHours;
  const rawEnergy = (whalesPerHour / BASELINE_WHALES_PER_HOUR) * 50;
  const whaleEnergy = Math.min(100, Math.max(0, rawEnergy));

  return {
    totalWhaleTransfers: allWhales.length,
    totalWhaleVolumeEth: totalVolume,
    largestTransfer: largest,
    uniqueWhaleAddresses: addressMap.size,
    whaleEnergy,
    topWhales,
  };
}

// --- Gas analyzer ---

const STRESS_BASELINE_GWEI = 30;
const STRESS_HIGH_GWEI = 150;

export function analyzeGas(state: CollectorState): GasAnalysis {
  const { blocks } = state;

  if (blocks.length === 0) {
    return {
      avgBaseFeeGwei: 0,
      minBaseFeeGwei: 0,
      maxBaseFeeGwei: 0,
      medianBaseFeeGwei: 0,
      avgUtilization: 0,
      networkStress: 0,
      trend: 'stable',
    };
  }

  const fees = blocks.map((b) => b.baseFeeGwei);
  const sorted = [...fees].sort((a, b) => a - b);

  const avg = fees.reduce((s, f) => s + f, 0) / fees.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];

  const utilizations = blocks
    .filter((b) => b.gasLimit > 0n)
    .map((b) => Number((b.gasUsed * 10000n) / b.gasLimit) / 100);
  const avgUtilization =
    utilizations.length > 0 ? utilizations.reduce((s, u) => s + u, 0) / utilizations.length : 0;

  const stressRaw =
    ((avg - STRESS_BASELINE_GWEI) / (STRESS_HIGH_GWEI - STRESS_BASELINE_GWEI)) * 100;
  const networkStress = Math.min(100, Math.max(0, stressRaw));

  const midpoint = Math.floor(fees.length / 2);
  const firstHalf = fees.slice(0, midpoint);
  const secondHalf = fees.slice(midpoint);
  const firstAvg =
    firstHalf.length > 0 ? firstHalf.reduce((s, f) => s + f, 0) / firstHalf.length : 0;
  const secondAvg =
    secondHalf.length > 0 ? secondHalf.reduce((s, f) => s + f, 0) / secondHalf.length : 0;
  const changePct = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

  let trend: 'rising' | 'falling' | 'stable' = 'stable';
  if (changePct > 10) trend = 'rising';
  else if (changePct < -10) trend = 'falling';

  return {
    avgBaseFeeGwei: avg,
    minBaseFeeGwei: min,
    maxBaseFeeGwei: max,
    medianBaseFeeGwei: median,
    avgUtilization,
    networkStress,
    trend,
  };
}

// --- Volume analyzer ---

const BASELINE_ETH_PER_BLOCK = 500;

export function analyzeVolume(state: CollectorState): VolumeAnalysis {
  const { blocks } = state;

  if (blocks.length === 0) {
    return {
      totalVolumeEth: 0,
      avgVolumePerBlock: 0,
      totalTransactions: 0,
      avgTxPerBlock: 0,
      peakBlockVolume: { blockNumber: 0n, volumeEth: 0 },
      character: 'quiet',
      intensity: 0,
    };
  }

  const totalVolumeEth = blocks.reduce((s, b) => s + b.totalValueEth, 0);
  const totalTransactions = blocks.reduce((s, b) => s + b.transactionCount, 0);
  const avgVolumePerBlock = totalVolumeEth / blocks.length;
  const avgTxPerBlock = totalTransactions / blocks.length;

  const peak = blocks.reduce(
    (max, b) =>
      b.totalValueEth > max.volumeEth ? { blockNumber: b.number, volumeEth: b.totalValueEth } : max,
    { blockNumber: blocks[0].number, volumeEth: blocks[0].totalValueEth }
  );

  const ratio = avgVolumePerBlock / BASELINE_ETH_PER_BLOCK;
  const intensity = Math.min(100, Math.max(0, ratio * 50));

  let character: VolumeAnalysis['character'];
  if (ratio < 0.3) character = 'quiet';
  else if (ratio < 0.7) character = 'steady';
  else if (ratio < 1.5) character = 'active';
  else if (ratio < 3.0) character = 'surging';
  else character = 'explosive';

  return {
    totalVolumeEth,
    avgVolumePerBlock,
    totalTransactions,
    avgTxPerBlock,
    peakBlockVolume: peak,
    character,
    intensity,
  };
}

// --- Composite network stress ---

export function computeNetworkStress(
  gas: GasAnalysis,
  whale: WhaleAnalysis,
  volume: VolumeAnalysis
): number {
  const raw = gas.networkStress * 0.5 + whale.whaleEnergy * 0.3 + volume.intensity * 0.2;
  return Math.min(100, Math.max(0, Math.round(raw)));
}
