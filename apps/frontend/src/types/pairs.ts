import type { PairRegimeStatus, SpreadDirection, WindowId } from './enums';

export type CompactPairWindow = {
  window: WindowId;
  label: string;
  sharpe: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  numTrades: number;
};

export type CompactPair = {
  pairId: string;
  legA: string;
  legB: string;
  rationale: string;
  hedgeRatio: number;
  halfLifeDays: number;
  pValue: number;
  regimeStatus: PairRegimeStatus;
  direction: SpreadDirection;
  currentZ: number;
  barsInState: number;
  headline: CompactPairWindow | null;
};

export type PairsResponse = {
  id: string;
  date: string;
  candidatesScanned: number;
  pairs: CompactPair[];
};
