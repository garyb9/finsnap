/**
 * Plain-English reference material for the report.
 *
 * The dashboard is dense on purpose — it is a decision surface, not a lesson —
 * but every number on it is meaningless without knowing what it measures and
 * how it can lie. That explanation lives here rather than in the frontend so
 * one wording serves the web page, the API and the Telegram bot, and so it sits
 * beside the code that produces the numbers.
 */

import { MetricId, StrategyKind } from './enums';

// ── Strategy families ───────────────────────────────────────────────────────

export interface FamilyGuide {
  label: string;
  /** The bet in one sentence */
  premise: string;
  /** The market condition that pays it */
  worksWhen: string;
  /** The market condition that punishes it */
  failsWhen: string;
}

export const FAMILY_GUIDE: Record<StrategyKind, FamilyGuide> = {
  [StrategyKind.Benchmark]: {
    label: 'Benchmark',
    premise: 'Buy on day one and never sell. Not a strategy — the bar every other rule must clear.',
    worksWhen:
      'The asset rises over the window. Over long horizons in broad equity indices, that is most of the time, which is why beating this is harder than it looks.',
    failsWhen:
      'You care about the path as well as the destination. Holding through a 55% drawdown and holding through a 15% one produce the same final number and are not the same experience.',
  },
  [StrategyKind.Trend]: {
    label: 'Trend following',
    premise:
      'Assume a move already underway continues. Stay long while a fast average sits above a slow one, or while price sits above its own average; step aside when it does not.',
    worksWhen:
      'Prices move in sustained directional runs. The real payoff is rarely extra return — it is getting out partway through a long decline, which is where most of the drawdown improvement comes from.',
    failsWhen:
      'The market chops sideways. Every wobble across the average triggers a round trip, and fees plus slippage grind the account down through a series of small losing trades.',
  },
  [StrategyKind.Momentum]: {
    label: 'Momentum',
    premise:
      'Hold the asset only while its own trailing return is positive. A trend filter measured on the price itself rather than on an average of it.',
    worksWhen:
      'A drawdown builds gradually. The rule goes flat early and stays flat, which is the single most reliable published defence against a long bear market.',
    failsWhen:
      'A crash is fast and V-shaped. The lookback turns negative near the bottom, and the rule is in cash for the recovery.',
  },
  [StrategyKind.Breakout]: {
    label: 'Breakout',
    premise:
      'Buy strength: a close above the highest price of the last N bars, exit on a break of the recent low or a trailing stop.',
    worksWhen:
      'New highs attract more buying, so a few very large winners more than pay for a long tail of small losses. Expect a low win rate — that is the design, not a fault.',
    failsWhen:
      'Breakouts reverse immediately. In a range-bound market this buys every local top and sells every local bottom.',
  },
  [StrategyKind.MeanReversion]: {
    label: 'Mean reversion',
    premise:
      'The opposite bet: buy weakness, on the assumption that price stretched far from its recent average snaps back to it.',
    worksWhen:
      'The asset oscillates around a stable level. Win rates are high and holding periods short.',
    failsWhen:
      'A real decline begins. The rule buys the whole way down and has no mechanism that admits it is wrong — this is where the worst single trades in the report come from.',
  },
};

// ── Metrics ─────────────────────────────────────────────────────────────────

export interface MetricGuide {
  id: MetricId;
  label: string;
  /** One line, suitable for a tooltip */
  short: string;
  /** A paragraph — what it measures and what it hides */
  detail: string;
  /** How to read a value you are looking at */
  reading: string;
}

export const METRIC_GUIDE: MetricGuide[] = [
  {
    id: MetricId.EdgeScore,
    label: 'Edge score',
    short: 'How much evidence there is that this rule genuinely beats holding the asset.',
    detail:
      'Blends three things across every lookback window: how much the strategy returned above buy-and-hold, how much better its risk-adjusted return was, and how much shallower its worst drawdown was. It is then cut for inconsistency — a rule that wins over five years and loses over three is worth less than one that wins over both — and cut again when the trade count is too small to mean anything. 50 is the neutral point: it says the rule matched holding, not that it did nothing.',
    reading:
      'Above 65 is a strong, consistent edge. 55–65 is modest but real. Below 45 the rule has historically been worse than simply holding, and nothing it says today should be acted on.',
  },
  {
    id: MetricId.OpportunityScore,
    label: 'Opportunity score',
    short: 'How attractive it is to act on this rule today, as opposed to in general.',
    detail:
      'Takes the edge score and modulates it by what the rule is actually saying right now. A fresh entry carries the full edge. A position held for months carries less, because the good entry was months ago. An exit or a stay-out signal inverts it, since the rule is telling you the opposite. Two strategies can share an edge score and differ completely here.',
    reading:
      'Read it alongside the edge score, never instead of it. A high opportunity score on a rule with no edge is a coincidence of timing, which is exactly why the report ranks by edge and not by this.',
  },
  {
    id: MetricId.Consensus,
    label: 'Consensus',
    short: 'The share of strategies currently long, weighted by how much edge each one has earned.',
    detail:
      'Every strategy that clears a minimum edge threshold votes long or flat, and each vote is weighted by that edge. A rule with a long record of beating the market counts for more than one that has never worked. The result is then pulled toward 50 in proportion to how little total edge is voting — if almost nothing qualifies, the reading is honest about knowing nothing rather than reporting a landslide among two voters.',
    reading:
      '100 means every credible rule is long, 0 means every credible rule is in cash. Values near 50 mean either a genuine split or, more often, that this asset has no rule with a demonstrated edge.',
  },
  {
    id: MetricId.Verdict,
    label: 'Verdict',
    short: 'The consensus score expressed as a word.',
    detail:
      'A banding of the consensus number, nothing more. It exists so a glance down the list is readable. Strong Buy and Avoid are the extremes; Neutral covers both genuine disagreement and genuine ignorance.',
    reading:
      'Treat it as a summary of the strategies, not as advice. Open the asset row to see which rules produced it and how much history stands behind them.',
  },
  {
    id: MetricId.Breadth,
    label: 'Breadth',
    short: 'The average consensus across every asset in the report.',
    detail:
      'One number for the state of the whole watchlist. Because the universe spans indices, sectors, commodities, the dollar and bonds, a high reading means risk appetite is broad rather than concentrated in one corner.',
    reading:
      'Above 60 is a broadly constructive tape. Below 40 means most assets have their trend rules in cash. Compare it against its own recent range rather than against an absolute threshold.',
  },
  {
    id: MetricId.Cagr,
    label: 'CAGR',
    short: 'Compound annual growth rate — the smooth yearly rate that reproduces the total return.',
    detail:
      'Total return restated as a per-year figure so windows of different lengths can be compared. It is a summary of the endpoints and says nothing about the route: a strategy that doubled in one month and drifted for four years reports the same CAGR as one that gained steadily throughout.',
    reading:
      'Always read it next to the maximum drawdown. On its own it is the single most misleading number in the report.',
  },
  {
    id: MetricId.ExcessCagr,
    label: 'Excess CAGR',
    short: 'The strategy’s annual return minus buy-and-hold over the identical window.',
    detail:
      'The only return figure that means anything on its own, because it is measured against the alternative of doing nothing. Positive says the rule added return; negative says holding would have paid more. The edge strip in the report is a row of these, one cell per window.',
    reading:
      'A rule can post negative excess CAGR and still be worth having, if it cut the drawdown enough. That trade-off is what the edge score weighs.',
  },
  {
    id: MetricId.MaxDrawdown,
    label: 'Max drawdown',
    short: 'The largest peak-to-trough fall in account value during the window.',
    detail:
      'The worst stretch you would have had to sit through. This is the number that decides whether a strategy is actually followable — most abandoned strategies were profitable on paper and unbearable in practice. Reported as a negative percentage.',
    reading:
      'Compare it against the benchmark drawdown on the same row. Cutting a 55% fall to 30% is a bigger achievement than adding two points of annual return.',
  },
  {
    id: MetricId.Sharpe,
    label: 'Sharpe ratio',
    short: 'Return per unit of volatility.',
    detail:
      'Average return divided by its standard deviation, annualized. It treats upside and downside movement as equally undesirable, which is why a strategy with sharp gains can score worse than a duller one.',
    reading:
      'Above 1 is good, above 2 is rare and deserves suspicion of overfitting. Below 0.5 the returns are mostly noise.',
  },
  {
    id: MetricId.Sortino,
    label: 'Sortino ratio',
    short: 'Like Sharpe, but only downside movement counts as risk.',
    detail:
      'Divides return by the standard deviation of losing periods alone, on the reasonable view that no one minds upside volatility. Usually higher than Sharpe; the size of the gap tells you how asymmetric the return distribution is.',
    reading:
      'A Sortino far above the Sharpe means gains arrive in bursts and losses are shallow — the signature of a working trend rule.',
  },
  {
    id: MetricId.Calmar,
    label: 'Calmar ratio',
    short: 'Annual return divided by the worst drawdown — return per unit of pain.',
    detail:
      'The bluntest risk-adjusted measure and often the most useful, because both inputs are things you actually experience. Sensitive to the window: one bad month can halve it.',
    reading:
      'Above 1 means the strategy earned more per year than its worst fall. Below 0.5 is poor.',
  },
  {
    id: MetricId.WinRate,
    label: 'Win rate',
    short: 'The share of closed trades that made money.',
    detail:
      'Widely over-read. Win rate says nothing about how big the wins and losses were, and the two are usually inversely related: breakout rules win around a third of the time and make money from a handful of very large winners, while mean-reversion rules win most trades and occasionally give it all back.',
    reading:
      'Only meaningful alongside profit factor. A 70% win rate with a profit factor near 1 means the losses are much larger than the wins.',
  },
  {
    id: MetricId.ProfitFactor,
    label: 'Profit factor',
    short: 'Gross profit divided by gross loss.',
    detail:
      'How many dollars the winners produced for each dollar the losers cost. Unlike win rate it accounts for size, which makes it the better single measure of whether a rule has a real trading edge.',
    reading:
      'Above 1 is profitable, above 1.5 is solid, above 2.5 on a small trade count usually means the sample is too small to trust.',
  },
  {
    id: MetricId.Exposure,
    label: 'Exposure',
    short: 'The share of bars the strategy spent holding the asset rather than sitting in cash.',
    detail:
      'The context for every other number. A rule that matched buy-and-hold at 40% exposure was in the market less than half the time and took proportionally less risk to get there.',
    reading:
      'Low exposure with a competitive return is the strongest result a strategy can post. Exposure near 100% means it is buy-and-hold wearing a disguise.',
  },
  {
    id: MetricId.NumTrades,
    label: 'Trades',
    short: 'How many round trips the strategy completed in the window.',
    detail:
      'The sample size behind every other statistic. Results built on a handful of trades are anecdotes: the edge score explicitly discounts them for exactly this reason.',
    reading:
      'Under about 10 trades, treat the window as indicative only. High counts on short windows mean costs are eating the returns — check exposure and profit factor.',
  },
];

// ── Method ──────────────────────────────────────────────────────────────────

export interface MethodNote {
  title: string;
  body: string;
}

/** How the backtest is run, and the specific ways it avoids flattering itself. */
export const METHOD_NOTES: MethodNote[] = [
  {
    title: 'Signals are read at the close and filled at the next open',
    body: 'A rule that triggers on today’s closing price is executed at tomorrow’s opening price, never at the close it was computed from. This is the difference between a backtest and a fantasy: filling at the same bar that generated the signal quietly assumes you knew the closing price before it happened, and that single assumption is responsible for most backtests that cannot be reproduced live.',
  },
  {
    title: 'Every fill pays a fee and gives up slippage',
    body: 'Costs are charged on both sides of every trade, and a buy is sized so its own fee fits inside the available cash rather than silently borrowing. Strategies that trade often are penalised accordingly — which is the point, since ignoring costs is what makes high-frequency rules look profitable on paper.',
  },
  {
    title: 'Indicators warm up on data outside the window',
    body: 'A 200-day average needs 200 days before it means anything. Signals are computed once across the full history and then sliced to each window, so a one-year backtest starts with an average that is already valid instead of one built from a fortnight of data.',
  },
  {
    title: 'Only long or flat',
    body: 'Every strategy is either fully in the asset or entirely in cash. There is no shorting and no leverage, so a rule can only ever add value by being out of the market at the right times.',
  },
  {
    title: 'The in-progress bar is discarded',
    body: 'Today’s candle is still forming and its close is not yet a fact. The report analyses through the last completed bar, which is what makes a pre-market run genuinely reflect "as of yesterday’s close".',
  },
  {
    title: 'Parameters are conventional, not optimised',
    body: '50/200-day crossovers, RSI(14), 20-day channels. Searching for the best-performing parameters on this same history would produce better backtest numbers and worse live results, so it is not done.',
  },
];
