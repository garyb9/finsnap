import type { OptionsSkewInsight } from './finsnap';
import type {
  AssetClass,
  BarInterval,
  SignalAction,
  SizeKind,
  StrategyKind,
  Verdict,
  WindowId,
} from './enums';

/**
 * How big an instrument is. `kind` matters: an ETF has no meaningful market
 * cap, so funds report assets under management instead.
 */
export type AssetSize = {
  value: number;
  kind: SizeKind;
};

export type Consensus = {
  score: number;
  verdict: Verdict;
  longWeight: number;
  flatWeight: number;
  longCount: number;
  /** Every non-benchmark strategy — the denominator of `longCount` */
  votingCount: number;
  /** Strategies whose edge clears the bar to carry weight in the score */
  qualifiedCount: number;
  qualifiedLongCount: number;
  freshEntries: number;
  freshExits: number;
};

/** The headline window result, already reduced to what the UI shows. */
export type CompactWindow = {
  window: WindowId;
  label: string;
  /** Wall-clock years the window covered — the label is only approximate */
  years: number;
  cagrPct: number;
  benchmarkCagrPct: number;
  maxDrawdownPct: number;
  benchmarkMaxDrawdownPct: number;
  sharpe: number;
  numTrades: number;
  winRatePct: number;
  beatsBenchmark: boolean;
};

/** One cell of the edge strip: did this rule beat holding over this window? */
export type WindowMark = {
  window: WindowId;
  beatsBenchmark: boolean;
  excessCagrPct: number;
};

export type CompactStrategy = {
  id: string;
  name: string;
  kind: StrategyKind;
  action: SignalAction;
  barsInState: number;
  opportunityScore: number;
  edgeScore: number;
  headline: CompactWindow | null;
  marks: WindowMark[];
  rationale: string;
};

export type OptionsContext = {
  nearestExpiry: string;
  pcRatio: number;
  insight?: OptionsSkewInsight;
};

export type CompactAsset = {
  symbol: string;
  label: string;
  assetClass: AssetClass;
  lastClose: number;
  lastChangePct: number;
  /** Market cap for crypto, net assets for funds. Absent when unavailable. */
  size?: AssetSize;
  consensus: Consensus;
  tsmom?: { score: number; label: string };
  momentum?: number;
  options?: OptionsContext;
  notes: string[];
  top: CompactStrategy[];
};

export type Opportunity = {
  symbol: string;
  label: string;
  strategyId: string;
  strategyName: string;
  interval: BarInterval;
  action: SignalAction.Enter | SignalAction.Exit;
  opportunityScore: number;
  edgeScore: number;
  entryPrice: number;
  rationale: string;
};

export type ReportSummary = {
  assetsAnalyzed: number;
  strategiesRun: number;
  backtestsRun: number;
  freshEntries: number;
  freshExits: number;
  avgConsensus: number;
  bullishAssets: number;
  bearishAssets: number;
};

export type CompactReport = {
  id: string;
  date: string;
  generatedAt: string;
  summary: ReportSummary;
  topOpportunities: Opportunity[];
  assets: CompactAsset[];
};
