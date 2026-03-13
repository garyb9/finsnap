import type { OptionsExpirationAnalysis } from '../analyzers/types';

/** JSON-serializable whale transfer (blockNumber as number, not bigint) */
export interface SnapWhaleTransfer {
  hash: string;
  from: string;
  to: string;
  valueEth: number;
  blockNumber: number;
  timestamp: number;
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
}

export interface SnapMeta {
  id: string;
  timestamp: string;
}
