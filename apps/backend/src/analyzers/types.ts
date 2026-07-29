import {
  CrossLabel,
  OptionsSide,
  OptionsSkewLabel,
  Timeframe,
  Trajectory,
} from '../constants/enums';

export { CrossLabel, OptionsSide, OptionsSkewLabel, Timeframe, Trajectory };

// --- Price analysis types ---

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
  /** Change across the most recent completed bar of this timeframe */
  changePct: number;
  volume: number;
  sma20: number;
  stdDev20: number;
  bollinger: BollingerBands;
  ema20: number;
  ema50: number;
  ema20AboveEma50: boolean;
  emaCrossLabel: CrossLabel;
  ema20Trajectory: Trajectory;
  ema50Trajectory: Trajectory;
  /** Wilder RSI(14) on this timeframe */
  rsi14: number;
}

export interface AssetAnalysis {
  currentPrice: number;
  timeframes: TimeframeAnalysis[];
  marketMomentum: number;
}

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

// --- Options analyzer output types ---

export interface OptionsSkewInsight {
  /** High-level label for how options are stacking at this expiry */
  label: OptionsSkewLabel;
  /**
   * Symmetric skew score around 0.
   * > 0 → put-heavy, < 0 → call-heavy, 0 ≈ balanced.
   */
  skewScore: number;
  /** Which side is dominant when there is a clear skew */
  dominantSide: OptionsSide;
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
