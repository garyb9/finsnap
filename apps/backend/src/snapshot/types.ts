import type { AssetSize } from '../collectors/quote';
import type { OptionsExpirationAnalysis, TimeframeAnalysis, TsmomSignal } from '../analyzers/types';
import type { AssetClass } from '../config';

export interface AssetSnap {
  /** Yahoo symbol — BTC-USD, SPY, ... */
  symbol: string;
  /** Display label — BTC, SPY, ... */
  label: string;
  assetClass: AssetClass;
  description?: string;
  currentPrice: number;
  /** Change across the most recent completed daily bar */
  changePct: number;
  /** Market cap for crypto, net assets for funds. Absent when unavailable. */
  size?: AssetSize;
  timeframes: TimeframeAnalysis[];
  tsmom: { score: number; label: string };
  /** 0-100 bullish-structure share across timeframes */
  momentum: number;
  /** Present for tickers with an options chain */
  options?: {
    price: number;
    expirations: OptionsExpirationAnalysis[];
  };
}

export interface FinSnap {
  id: string;
  timestamp: string;
  version: '2.0';
  /** Keyed by display label — BTC, SPY, ... */
  assets: Record<string, AssetSnap>;
  market: {
    /** Percentage of tracked assets with bullish EMA structure on the daily */
    breadth: number;
    /** Mean TSMOM score across tracked assets */
    avgTsmom: number;
    assetsTracked: number;
  };
}

export interface SnapMeta {
  id: string;
  timestamp: string;
}

export type { TsmomSignal };
