import type { WhaleTransfer } from '../collectors/types';

// --- On-chain analyzer output types (ported from soul-bot) ---

export interface WhaleAnalysis {
  totalWhaleTransfers: number;
  totalWhaleVolumeEth: number;
  largestTransfer: WhaleTransfer | null;
  uniqueWhaleAddresses: number;
  /** 0-100: how active whales are relative to baseline */
  whaleEnergy: number;
  topWhales: { address: string; totalEth: number; txCount: number }[];
}

export interface GasAnalysis {
  avgBaseFeeGwei: number;
  minBaseFeeGwei: number;
  maxBaseFeeGwei: number;
  medianBaseFeeGwei: number;
  avgUtilization: number;
  /** 0-100: network congestion score */
  networkStress: number;
  trend: 'rising' | 'falling' | 'stable';
}

export interface VolumeAnalysis {
  totalVolumeEth: number;
  avgVolumePerBlock: number;
  totalTransactions: number;
  avgTxPerBlock: number;
  peakBlockVolume: { blockNumber: bigint; volumeEth: number };
  character: 'quiet' | 'steady' | 'active' | 'surging' | 'explosive';
  /** 0-100 intensity score */
  intensity: number;
}

// --- Options analyzer output types ---

export interface OptionsLegStats {
  totalVolume: number;
  totalOI: number;
  weightedMeanStrike: number;
  weightedStdStrike: number;
}

export interface OptionsExpirationAnalysis {
  date: string;
  pcRatio: number;
  calls: OptionsLegStats;
  puts: OptionsLegStats;
}

export interface OptionsAnalysis {
  ticker: string;
  expirations: OptionsExpirationAnalysis[];
}
