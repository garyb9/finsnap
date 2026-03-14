// --- On-chain types (ported from soul-bot) ---

export interface WhaleTransfer {
  hash: string;
  from: string;
  to: string;
  valueEth: number;
  blockNumber: bigint;
  timestamp: number;
}

export interface BlockData {
  number: bigint;
  timestamp: number;
  baseFeeGwei: number;
  gasUsed: bigint;
  gasLimit: bigint;
  transactionCount: number;
  totalValueEth: number;
  whaleTransfers: WhaleTransfer[];
}

/** Rolling window of collected on-chain data */
export interface CollectorState {
  blocks: BlockData[];
  startTime: number;
  endTime: number;
  chainId: number;
}

/** Any data source implements this interface */
export interface Collector {
  readonly name: string;
  readonly blockCount: number;
  start(): Promise<void>;
  stop(): void;
  backfill(count: number): Promise<void>;
  drain(windowMs: number): CollectorState;
}

// --- Price data types (asset-agnostic, ETH/BTC/etc) ---

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface VolumePoint {
  timestamp: number;
  volume: number;
}

export interface AssetPriceHistory {
  prices: PricePoint[];
  volumes: VolumePoint[];
}

export interface AssetPriceDataSet {
  /** 5-min granularity, last 24h — covers 5M / 1H / 4H / D timeframes */
  day1: AssetPriceHistory | null;
  /** Hourly granularity, last 7d — covers W timeframe */
  day7: AssetPriceHistory | null;
  /** Hourly granularity, last 30d — covers M timeframe */
  day30: AssetPriceHistory | null;
}

export interface AssetPriceCachedBucket {
  fetchedAt: number;
  data: AssetPriceHistory;
}

// Backwards-compatible ETH-specific aliases
export type EthPriceHistory = AssetPriceHistory;
export type EthPriceDataSet = AssetPriceDataSet;
export type EthPriceCachedBucket = AssetPriceCachedBucket;

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
