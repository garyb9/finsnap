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

// --- Price analysis types (ported from soul-bot) ---

export type Timeframe = '5M' | '1H' | '4H' | 'D' | 'W' | 'M';

export interface BollingerBand {
  upper: number;
  lower: number;
}

export interface BollingerBands {
  middle: number;
  std2: BollingerBand;
  std3: BollingerBand;
  bandwidth: number;
  /** 0 = lower band, 1 = upper band */
  percentB: number;
}

export interface TimeframeAnalysis {
  timeframe: Timeframe;
  open: number;
  close: number;
  high: number;
  low: number;
  changePct: number;
  volumeUsd: number;
  sma20: number;
  stdDev20: number;
  bollinger: BollingerBands;
  ema20: number;
  ema50: number;
  ema20AboveEma50: boolean;
  emaCrossLabel: string;
  ema20Trajectory: string;
  ema50Trajectory: string;
}

export interface AssetAnalysis {
  currentPrice: number;
  timeframes: TimeframeAnalysis[];
  marketMomentum: number;
}

export type EthAnalysis = AssetAnalysis;

export interface TsmomSignal {
  score: number;
  label: string;
  components: {
    directional: number;
    emaStructure: number;
    emaTrajectory: number;
    acceleration: number;
    bbConfirmation: number;
  };
}

export interface MoodDimension {
  value: number;
  label: string;
}

export interface MoodVector {
  fearGreed: MoodDimension;
  networkStress: MoodDimension;
  whaleEnergy: MoodDimension;
  volumeCharacter: MoodDimension;
  priceMomentum: MoodDimension;
  overallTone: MoodDimension;
}

// --- Options analyzer output types ---

export type OptionsSkewLabel =
  | 'put_stack'
  | 'call_stack'
  | 'soft_put'
  | 'soft_call'
  | 'balanced'
  | 'thin';

export interface OptionsSkewInsight {
  /** High-level label for how options are stacking at this expiry */
  label: OptionsSkewLabel;
  /**
   * Symmetric skew score around 0.
   * > 0 → put-heavy, < 0 → call-heavy, 0 ≈ balanced.
   */
  skewScore: number;
  /** Which side is dominant when there is a clear skew */
  dominantSide: 'calls' | 'puts' | 'none';
  /** Puts/calls ratios (volume + OI) used to derive skewScore */
  volRatio: number;
  oiRatio: number;
  /** Location of the dominant wall relative to spot */
  wallStrike: number;
  distanceToSpotAbs: number;
  distanceToSpotPct: number;
  /** True when the dominant wall is relatively tight and close to spot */
  nearSpotCluster: boolean;
  /** Optional human-readable note for UIs / logs */
  note?: string;
}

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
  /** Optional per-expiry skew / wall insight */
  insight?: OptionsSkewInsight;
}

export interface OptionsAnalysis {
  ticker: string;
  description?: string;
  expirations: OptionsExpirationAnalysis[];
}
