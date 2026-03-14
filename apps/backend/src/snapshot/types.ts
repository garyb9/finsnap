import type {
  OptionsExpirationAnalysis,
  TimeframeAnalysis,
  MoodDimension,
} from '../analyzers/types';

/** JSON-serializable whale transfer (blockNumber as number, not bigint) */
export interface SnapWhaleTransfer {
  hash: string;
  from: string;
  to: string;
  valueEth: number;
  blockNumber: number;
  timestamp: number;
}

export interface AssetSnap {
  currentPrice: number;
  timeframes: TimeframeAnalysis[];
  tsmom: { score: number; label: string };
}

export interface FinSnap {
  id: string;
  timestamp: string;
  blockHeight: number;
  version: '1.0';
  onChain: {
    whale: {
      count: number;
      totalValueEth: number;
      transfers: SnapWhaleTransfer[];
      energyScore: number;
    };
    gas: {
      averageGwei: number;
      trend: 'rising' | 'falling' | 'stable';
      congestionScore: number;
    };
    volume: {
      txCount: number;
      totalValueEth: number;
      intensityScore: number;
    };
    networkStress: number;
  };
  equities: Record<
    string,
    {
      price: number;
      description?: string;
      expirations: OptionsExpirationAnalysis[];
    }
  >;
  signals: {
    networkStress: number;
    whaleEnergy: number;
    volumeIntensity: number;
    gasCongestion: number;
    overallSentiment: number;
  };
  /** ETH price analysis — present when CoinGecko data is available */
  eth?: AssetSnap;
  /** BTC price analysis — present when CoinGecko data is available */
  btc?: AssetSnap;
  /** Market mood vector — present when price analysis is available */
  mood?: {
    fearGreed: MoodDimension;
    networkStress: MoodDimension;
    whaleEnergy: MoodDimension;
    volumeCharacter: MoodDimension;
    priceMomentum: MoodDimension;
    overallTone: MoodDimension;
  };
}

export interface SnapMeta {
  id: string;
  timestamp: string;
}
