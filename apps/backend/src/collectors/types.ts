import { BarInterval } from '../constants/enums';

// --- OHLCV bar types ---

export { BarInterval };

export interface Bar {
  /** Bar open time, unix ms */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BarSeries {
  symbol: string;
  interval: BarInterval;
  bars: Bar[];
  /** Unix ms when the series was fetched */
  fetchedAt: number;
}

/**
 * Columnar form used for Redis storage — roughly 40% smaller than an array of
 * objects once serialized, which matters for max-history daily series.
 */
export interface PackedBarSeries {
  symbol: string;
  interval: BarInterval;
  fetchedAt: number;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

/** All intervals for one symbol. Any interval may be null if the fetch failed. */
export interface SymbolBars {
  symbol: string;
  intraday5m: BarSeries | null;
  hourly: BarSeries | null;
  daily: BarSeries | null;
}

// --- Options types ---

export interface OptionsContract {
  strike: number;
  volume: number;
  openInterest: number;
}

export interface OptionsChain {
  /** ISO date string YYYY-MM-DD */
  expiration: string;
  calls: OptionsContract[];
  puts: OptionsContract[];
}

export interface OptionsData {
  ticker: string;
  /** Human-readable name (from Yahoo Finance or fallback) */
  description?: string;
  /** Current underlying price */
  price: number;
  chains: OptionsChain[];
  /** Unix ms when data was fetched */
  fetchedAt: number;
}
