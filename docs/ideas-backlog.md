# Ideas Backlog

Feature ideas and fixes surfaced during brainstorming sessions, not yet sequenced into
[roadmap.md](./roadmap.md). Roadmap owns the path to a sellable product (hosting,
monetization, multi-tenancy); this file owns everything else — engine, scoring, risk,
and dashboard ideas that stand on their own regardless of that path.

Status: `idea` (not yet designed) · `in design` (spec being written) · `spec'd` (design
doc exists, not yet planned/built) · `built` (shipped, kept here for history).

## Engine & scoring

1. **Regime-aware strategy callout** — _built_. Classifies each asset's current regime
   (trending / choppy, from a new ADX indicator) and, when one strategy family clearly
   dominates today's votes by edge-weighted conviction, appends a note explaining the
   pairing, e.g. "Breakout rules lead today's vote — trending (ADX 31), wide bands."
   Purely explanatory — does not touch `edgeScore` / `opportunityScore`. Spec:
   `docs/superpowers/specs/2026-08-09-regime-aware-strategy-callout-design.md`. Plan:
   `docs/superpowers/plans/2026-08-09-regime-aware-strategy-callout.md`. Follow-up not
   included: the frontend's hand-maintained TS mirror types (`report.ts`,
   `assetReport.ts`) don't yet declare the new `regime` field — the note itself already
   renders today via the existing generic notes path, but a future trend badge would
   need those types updated first.

2. **Edge stability over time (walk-forward)** — _idea_. Instead of one static edge
   score over fixed windows, compute a rolling edge score and show whether a rule's
   edge is improving or decaying recently vs. its long-run average. Tests whether the
   README's "deliberately conventional, not optimized" parameters are still earning
   their keep.

3. **Backtest the consensus vote itself** — _idea_. The report already computes an
   edge-weighted vote across strategies (`report/consensus.ts`); treat that vote as its
   own `StrategyDef` and backtest it like any other rule, to see whether "listen to the
   crowd" actually beats the best individual strategy. Architecturally tricky: a
   `StrategyDef.signals()` is currently a pure function of `bars` alone, while the
   consensus vote is computed *from* other strategies' results — needs that circularity
   resolved before this is buildable.

4. **Options skew as a validated signal, not just context** — _idea, blocked_.
   `analyzers/options.ts` deliberately stops at "context, never a signal." A
   contrarian put/call-skew strategy, backtested and edge-scored like everything else,
   would either earn options a real signal role or validate the existing caution — but
   **the options-chain archive only retains 30 days** (see roadmap.md, Epic 0), so this
   can't be backtested across the standard `1mo`-`max` windows the way every other
   strategy is. Needs rescoping — e.g. a forward-only strategy that accumulates
   evidence over time, the same way live TSMOM was flagged as unvalidated before
   `tsmom_55`/`tsmom_50` — before it's designable.

5. **Realistic flat/minimum per-trade fee model** — _idea_. `runBacktest`
   (`backtest/engine.ts`) already charges `feeBps`/`slippageBps` on every fill for
   every strategy including buy & hold, uniformly — so costs are not currently
   missing. But it's a pure proportional (bps-of-notional) model, not the flat/minimum
   per-ticket cost real brokers charge (e.g. IBKR's per-share rate with a minimum).
   That likely understates the real cost gap between low-turnover strategies (buy &
   hold: one trade) and high-turnover ones (RSI Reversion 2, Bollinger Reversion:
   dozens of trades), especially at the $10,000 default `BACKTEST_CAPITAL` where a flat
   fee doesn't scale down with trade size the way bps does. A correctness fix more than
   a new feature — fits the project's "receipts, not vibes" ethos.

## Risk & alerting

6. **Stop-distance watch** — _idea_. The in-progress chandelier/ATR stop machinery
   (this branch: `StrategyDef.stops()`, `engine.ts`) knows the live stop level for any
   held position. Surface "how far is price from invalidating this trade" in the
   dashboard and as a Telegram command — a natural precursor to roadmap Epic 6's
   alerting.

7. **Day-over-day report diff** — _idea_. A compact digest of what changed since
   yesterday's stored report (new entries/exits, verdict flips), instead of re-reading
   the whole report to spot what's new. Cheap: report history is already stored
   (`GET /reports`).

## Dashboard

8. **"Correlated peers" on the guide page** — _idea_. `analyzers/correlation.ts`
   already computes the full cross-asset correlation matrix for the Correlation tab.
   Surface each asset's top 2-3 correlated peers directly on its `/guide` entry — near
   -zero new computation, adds discoverability.
