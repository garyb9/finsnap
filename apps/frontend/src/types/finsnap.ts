import type {
  AssetClass,
  CrossLabel,
  OptionsSide,
  OptionsSkewLabel,
  SizeKind,
  Timeframe,
  Trajectory,
} from './enums';

/** Market cap for crypto, net assets for funds. */
export type AssetSize = {
  value: number;
  kind: SizeKind;
};

export type BollingerBand = { upper: number; lower: number };

export type TimeframeAnalysis = {
  timeframe: Timeframe;
  open: number;
  close: number;
  high: number;
  low: number;
  changePct: number;
  volume: number;
  sma20: number;
  stdDev20: number;
  ema20: number;
  ema50: number;
  ema20AboveEma50: boolean;
  ema20Trajectory: Trajectory;
  ema50Trajectory: Trajectory;
  emaCrossLabel: CrossLabel;
  rsi14: number;
  bollinger: {
    middle: number;
    std2: BollingerBand;
    std3: BollingerBand;
    bandwidth: number;
    percentB: number;
  };
};

export type OptionsLegStats = {
  totalVolume: number;
  totalOI: number;
  weightedMeanStrike: number;
  weightedStdStrike: number;
};

export type OptionsSkewInsight = {
  label: OptionsSkewLabel;
  dominantSide: OptionsSide;
  skewScore: number;
  wallStrike: number;
  distanceToSpotPct: number;
  nearSpotCluster: boolean;
  note?: string;
};

export type OptionsExpiration = {
  date: string;
  pcRatio: number;
  calls: OptionsLegStats;
  puts: OptionsLegStats;
  insight?: OptionsSkewInsight;
};

export type AssetSnap = {
  symbol: string;
  label: string;
  assetClass: AssetClass;
  /** True for a ticker pulled in by a user search rather than configured at boot */
  searched: boolean;
  description?: string;
  currentPrice: number;
  changePct: number;
  size?: AssetSize;
  timeframes: TimeframeAnalysis[];
  tsmom: { score: number; label: string };
  momentum: number;
  options?: {
    price: number;
    expirations: OptionsExpiration[];
  };
};

export type FinSnap = {
  id: string;
  timestamp: string;
  version: string;
  /** Keyed by display label — BTC, SPY, … */
  assets: Record<string, AssetSnap>;
  market: {
    breadth: number;
    avgTsmom: number;
    assetsTracked: number;
  };
};
