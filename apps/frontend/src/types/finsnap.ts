export type BollingerBand = { upper: number; lower: number };

export type TimeframeAnalysis = {
  timeframe: string;
  changePct: number;
  ema20: number;
  ema50: number;
  ema20AboveEma50: boolean;
  ema20Trajectory: string;
  ema50Trajectory: string;
  emaCrossLabel: string;
  bollinger: {
    middle: number;
    std2: BollingerBand;
    std3: BollingerBand;
    bandwidth: number;
    percentB: number;
  };
};

export type AssetSnap = {
  currentPrice: number;
  timeframes: TimeframeAnalysis[];
  tsmom: { score: number; label: string };
};

export type OptionsLegStats = {
  totalVolume: number;
  totalOI: number;
  weightedMeanStrike: number;
  weightedStdStrike: number;
};

export type OptionsSkewInsight = {
  label: 'call_stack' | 'put_stack' | 'soft_call' | 'soft_put' | 'balanced' | 'thin';
  dominantSide: 'calls' | 'puts' | 'none';
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

export type FinSnap = {
  id: string;
  timestamp: string;
  blockHeight: number;
  version: string;
  onChain: {
    whale: { count: number; totalValueEth: number; energyScore: number };
    gas: { averageGwei: number; trend: string; congestionScore: number };
    volume: { txCount: number; totalValueEth: number; intensityScore: number };
    networkStress: number;
  };
  equities: Record<
    string,
    { price: number; description?: string; expirations: OptionsExpiration[] }
  >;
  signals: {
    networkStress: number;
    whaleEnergy: number;
    volumeIntensity: number;
    gasCongestion: number;
    overallSentiment: number;
  };
  eth?: AssetSnap;
  btc?: AssetSnap;
};
