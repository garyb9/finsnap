import type { OptionsSkewInsight } from '../analyzers/types';
import type { AssetSize } from '../collectors/quote';
import type { AssetClass } from '../config';
import type { StrategyReport } from '../backtest/types';
import { BarInterval, SignalAction, Verdict } from '../constants/enums';

export { Verdict };

export interface Consensus {
  /** 0-100: edge-weighted share of strategies currently positioned long */
  score: number;
  verdict: Verdict;
  /** Summed edge weight of strategies holding a long */
  longWeight: number;
  /** Summed edge weight of strategies sitting in cash */
  flatWeight: number;
  /** How many of `votingCount` are currently positioned long */
  longCount: number;
  /**
   * Every non-benchmark strategy. This is the denominator of `longCount`, and
   * it is deliberately not the same population the score is computed from —
   * see `qualifiedCount`.
   */
  votingCount: number;
  /**
   * Strategies that actually carry weight in the score, i.e. whose edge clears
   * `MIN_VOTING_EDGE`.
   *
   * Without this the head count and the score look contradictory: an asset can
   * read "6/19 long" and still score 33, because thirteen of those nineteen
   * have no demonstrated edge and contribute nothing. The count is unweighted;
   * the score is weighted. Both are true and they measure different things.
   */
  qualifiedCount: number;
  /** How many of `qualifiedCount` are long */
  qualifiedLongCount: number;
  /** Strategies that flipped long on the last completed bar */
  freshEntries: number;
  /** Strategies that flipped flat on the last completed bar */
  freshExits: number;
}

/** Compact options context attached to the report for equity tickers. */
export interface OptionsContext {
  nearestExpiry: string;
  pcRatio: number;
  insight?: OptionsSkewInsight;
}

export interface AssetOpportunity {
  symbol: string;
  label: string;
  assetClass: AssetClass;
  description?: string;
  lastClose: number;
  lastChangePct: number;
  /** Market cap for crypto, net assets for funds. Absent when unavailable. */
  size?: AssetSize;
  /** Last completed bar analyzed — the report never reasons past this */
  lastBarTime: number;
  historyStart: number;
  barsAnalyzed: number;
  consensus: Consensus;
  /** Daily-bar strategy reports, best opportunity first */
  daily: StrategyReport[];
  /** Hourly-bar strategy reports, when enough intraday history exists */
  intraday: StrategyReport[];
  tsmom?: { score: number; label: string };
  momentum?: number;
  /**
   * Daily Bollinger read — where price sits in the envelope, and how wide the
   * envelope is. Carried alongside `tsmom` because the dashboard shows a trend
   * score and a momentum score with no volatility context between them, while
   * the same numbers were already being computed for `/technicals`.
   */
  bollinger?: { bandwidth: number; percentB: number; widthLabel: string; positionLabel: string };
  options?: OptionsContext;
  /** Plain-English observations worth surfacing */
  notes: string[];
}

/** A single actionable line: one strategy firing on one asset. */
export interface Opportunity {
  symbol: string;
  label: string;
  strategyId: string;
  strategyName: string;
  interval: BarInterval.Daily | BarInterval.Hourly;
  action: SignalAction.Enter | SignalAction.Exit;
  opportunityScore: number;
  edgeScore: number;
  entryPrice: number;
  rationale: string;
}

export interface DailyReport {
  id: string;
  /** Trading date the report covers — the last completed session */
  date: string;
  generatedAt: string;
  version: '1.0';
  execution: {
    initialCapital: number;
    feeBps: number;
    slippageBps: number;
  };
  assets: AssetOpportunity[];
  /** Fresh entries and exits across the whole universe, strongest first */
  topOpportunities: Opportunity[];
  summary: {
    assetsAnalyzed: number;
    strategiesRun: number;
    backtestsRun: number;
    freshEntries: number;
    freshExits: number;
    /** Mean consensus score across the universe — a crude breadth read */
    avgConsensus: number;
    bullishAssets: number;
    bearishAssets: number;
  };
}

export interface ReportMeta {
  id: string;
  date: string;
  generatedAt: string;
}
