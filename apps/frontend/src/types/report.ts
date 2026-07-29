import type { OptionsSkewInsight } from './finsnap';
import type {
  AssetClass,
  BarInterval,
  SignalAction,
  StrategyKind,
  Verdict,
  WindowId,
} from './enums';

export type Consensus = {
  score: number;
  verdict: Verdict;
  longWeight: number;
  flatWeight: number;
  longCount: number;
  votingCount: number;
  freshEntries: number;
  freshExits: number;
};

/** The headline window result, already reduced to what the UI shows. */
export type CompactWindow = {
  window: WindowId;
  label: string;
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
