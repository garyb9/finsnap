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
  /** Current underlying price */
  price: number;
  chains: OptionsChain[];
  /** Unix ms when data was fetched */
  fetchedAt: number;
}
