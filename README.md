# FinSnap

**Daily price-action snapshots, regime-aware signals, and multi-strategy backtests across
the market, its sectors, and the macro instruments that move them.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](tsconfig.base.json)
[![Universe](https://img.shields.io/badge/universe-23%20assets-blue.svg)](#universe)
[![Backtests](https://img.shields.io/badge/output-backtest%20%2B%20live%20signals-purple.svg)](#how-it-works)

FinSnap answers one question every morning: **is today a good entry?** It runs every
strategy in its registry across every lookback window, weights each strategy by whether it
has ever actually beaten buy-and-hold, and reduces the result to a short list of what fired
today plus one verdict per asset.

It covers **23 assets** — the broad US market, all eleven sectors, and the macro
instruments (commodities, rates, the dollar, bitcoin) that usually explain why the sectors
are moving. Signals ship as a ranked daily report, a live multi-timeframe snapshot, a
Next.js dashboard, a JSON API, and a Telegram bot.

> Not advice. A reproducible read on what the rules say, with the evidence attached.

> **FinSnap is the successor to `stock-options-analysis-tools`.** The original Python
> utilities were folded into this project; see [Origin](#origin).

**Keywords:** quantitative trading · stock market analysis · options positioning ·
backtesting engine · technical indicators · regime detection · TSMOM · sector rotation ·
market breadth · TypeScript · Next.js · Telegram bot · financial data pipeline.

---

## What it does

**Daily report** — runs before the open, analyzes through the last completed session, and
produces:

- **Today's orders** — every fresh entry and exit, ranked by the strength of the rule
  behind it. Signals from strategies that have never beaten holding are excluded.
- **Per-asset verdict** — an edge-weighted vote across all strategies, from `strong_buy`
  to `avoid`.
- **Per-strategy detail** — how each rule performed over every window against buy-and-hold.

**Live snapshot** — a faster job: where each asset stands now across 5M / 1H / 4H / D / W / M
— EMA structure, Bollinger position, RSI, a blended TSMOM score — plus options positioning
for the tickers that have chains.

**Field guide** — every ticker, strategy and metric has a plain-English entry served from
`GET /guide` and rendered at `/guide`, so "what is XLB and why does this rule work" is one
click from the number that raised the question.

## Highlights

- **No-lookahead backtesting.** A signal at the close of bar `i` fills at the open of bar
  `i+1`, with fees and slippage. The pre-market report reads yesterday's close and acts at
  today's open — the same thing it would have done live.
- **Two separate scores.** "Does this rule work?" (`edgeScore`) is scored independently of
  "should I act today?" (`opportunityScore`), because conflating them is how a backtest
  becomes misleading.
- **Twenty strategies, five families.** Trend, momentum, breakout, mean-reversion and
  volume — conventional parameters, never optimized to the sample.
- **Context, not noise.** Correlation, regime, options positioning and the field guide
  explain the numbers without pretending to be signals.
- **Runs anywhere.** One `docker compose up` and you have the API, the dashboard and
  Postgres. Telegram is optional; nothing else changes without it.

## How it works

```text
[Collectors]   Yahoo OHLCV bars (1d / 1h / 5m) + options chains + quote, Postgres-backed
      │
      ▼
[Backtest]     indicators → strategies → engine → metrics → windows   (next-bar-open fills)
      │
      ▼
[Scoring]      edgeScore + opportunityScore + consensus (+ regime note)
      │
      ▼
[Report/Snap]  DailyReport (settled) · FinSnap (live)
      │
      ▼
[Outputs]      Hono API · Telegram · Next.js dashboard
```

Twenty configurations across five families, over a fixed universe. Full internals —
execution model, scoring math, the strategy registry, how to add a strategy or asset —
live in **[AGENTS.md](AGENTS.md)**.

## Dashboard

Five tabs, because they answer different questions:

| Tab            | What it is                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| **Dashboard**  | The daily report — today's orders and one verdict per asset. The thing you act on.    |
| **Technicals** | The live multi-timeframe read for every asset, as one sortable table. Not backtested. |
| **Strategies** | Which rule actually has an edge, pooled across the whole universe.                    |
| **Options**    | Positioning by expiry for the liquid tickers. Context, never a signal.                |
| **Guide**      | What every ticker, rule and number means.                                             |

## Universe

23 assets, chosen so a breadth reading means something: the broad market, **all eleven**
of its sectors, and the macro instruments that usually explain why the sectors are moving.

| Group          | Symbols                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Market indices | `SPY` S&P 500 · `QQQ` Nasdaq 100 · `DIA` Dow 30 · `IWM` Russell 2000                                                                                                                                             |
| Sectors        | `XLK` Technology · `XLF` Financials · `XLE` Energy · `XLV` Health Care · `XLI` Industrials · `XLY` Discretionary · `XLP` Staples · `XLU` Utilities · `XLB` Materials · `XLRE` Real Estate · `XLC` Communications |
| Crypto         | `BTC-USD` Bitcoin · `IBIT` spot bitcoin ETF                                                                                                                                                                      |
| Commodities    | `GLD` Gold · `SLV` Silver · `USO` WTI crude · `UNG` Natural gas                                                                                                                                                  |
| Currency       | `UUP` US dollar index                                                                                                                                                                                            |
| Bonds          | `TLT` 20+ year Treasuries                                                                                                                                                                                        |

`USO` and `UNG` hold futures, not the commodity, so over long windows their return is
dominated by roll cost. Judge them on the short windows.

## Quick start

```bash
yarn install
docker compose up --build
```

That is the whole setup. **No `.env` is required** — Telegram and `API_TOKEN` are optional,
and Compose supplies the database URL itself. Copy `apps/backend/.env.example` to
`apps/backend/.env` only when you want to change something.

- **API**: `http://localhost:4000`
- **Dashboard**: `http://localhost:3000`

On a cold start the backend builds a snapshot and a report in the background, so the API
answers immediately while data is still arriving.

### Running on the host instead

```bash
yarn dev:local     # starts Postgres in Docker, then runs both apps
```

Or in two steps — `yarn db` then `yarn dev`; stop it with `yarn db:stop`. Without Docker,
point `DATABASE_URL` at any Postgres and run the two workspaces directly:

```bash
yarn workspace @monorepo/backend dev
yarn workspace @monorepo/frontend dev
```

### Tests

```bash
yarn test    # vitest
yarn ci      # the full pipeline the workflows enforce: format + lint + build + test
```

## API

| Method | Path                      | Description                                              |
| ------ | ------------------------- | -------------------------------------------------------- |
| `GET`  | `/`                       | Service info + endpoint map                              |
| `GET`  | `/health`                 | Health check, last snap and report                       |
| `GET`  | `/report`                 | Latest daily report (compact)                            |
| `GET`  | `/report?detail=full`     | Full report — every strategy, every window               |
| `GET`  | `/report/opportunities`   | Today's fired entries and exits                          |
| `GET`  | `/report/asset/:label`    | Full backtest detail for one asset                       |
| `GET`  | `/report/date/:date`      | Report for a trading date (`YYYY-MM-DD`)                 |
| `GET`  | `/snap`                   | Latest live snapshot                                     |
| `GET`  | `/snap/:label`            | Live snapshot for one asset                              |
| `GET`  | `/strategies/leaderboard` | Which rule beats buy & hold, pooled across every asset   |
| `GET`  | `/guide`                  | Field guide — assets, strategy families, metrics, method |
| `POST` | `/sync`                   | Refresh every asset, then rebuild snapshot and report    |
| `GET`  | `/sync`                   | Progress of the current or last sync                     |

The three `POST` endpoints that start work sit behind a bearer token when `API_TOKEN` is
set, and are open when it is not. Reads stay open either way. The full endpoint list,
configuration and environment reference are in [AGENTS.md](AGENTS.md#api-surface).

## Telegram (optional)

With no `TELEGRAM_BOT_TOKEN` the bot is inert — publishing is skipped with a warning and
everything else runs unchanged. It supports `polling` (default) and `webhook` modes, and
answers `/today`, `/report [TICKER]`, and `/snap [TICKER]`.

## Tech stack

- **Runtime**: Node.js 22, TypeScript
- **API**: Hono
- **Data**: Yahoo Finance (bars + options chains)
- **Storage**: Postgres
- **Scheduler**: node-cron
- **Telegram**: Telegraf
- **Frontend**: Next.js 15, styled-components
- **Monorepo**: Turborepo + Yarn workspaces

## Requirements

- Node >= 22.0.0
- Yarn >= 1.22.0
- Docker + Docker Compose (for Postgres + full stack)

## Documentation

| Document                                                 | What is in it                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| **[AGENTS.md](AGENTS.md)**                               | Engine internals, scoring math, conventions, how to run CI — start here |
| [docs/roadmap.md](docs/roadmap.md)                       | Path from personal tool to sellable product, in six epics               |
| [docs/hosting.md](docs/hosting.md)                       | Where each piece runs and why (Railway · Vercel · Supabase)             |
| [docs/design/](docs/design/)                             | Backend data architecture, tiered access                                |
| [docs/ideas-backlog.md](docs/ideas-backlog.md)           | Unsequenced engine, risk and dashboard ideas                            |
| [docs/ideas/sec-analysis.md](docs/ideas/sec-analysis.md) | Proposed SEC EDGAR filing context (XBRL, code-parses/agent-reviews)     |
| [docs/marketing/](docs/marketing/)                       | Go-to-market thinking                                                   |

## Origin

FinSnap supersedes **`stock-options-analysis-tools`** (2020–2026), a set of Python
utilities for graphical and statistical analysis of the stock market, options, derivatives,
and finance. The Python tree is preserved in git history at
[`16a64da`](https://github.com/garyb9/finsnap/tree/16a64da).

The options statistics, per-strike aggregation and generic math were ported into the
TypeScript backend; SEC EDGAR support is laid out as a design idea; Finviz scraping and
manual file ingestion were deliberately left behind. The full port map is in
[AGENTS.md](AGENTS.md#origin--ported-code).

## License

[MIT](LICENSE) © GaryB. FinSnap is provided for research and educational use and is not
investment advice.
