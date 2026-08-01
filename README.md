# FinSnap

Price-action snapshots and multi-strategy backtests across the market, its sectors and
the macro instruments that move them.

FinSnap answers one question every morning: **is today a good entry?** It runs every
strategy in its registry across every lookback window, weights each strategy by whether
it has ever actually beaten buy-and-hold, and reduces the result to a short list of what
fired today plus one verdict per asset.

Not advice. A reproducible read on what the rules say, with the evidence attached.

## What It Does

### Daily report — the actionable output

Runs before the open, analyzes through the **last completed session**, and produces:

- **Today's orders** — every fresh entry and exit, ranked by the strength of the rule
  behind it. Signals from strategies that have never beaten holding are excluded.
- **Per-asset verdict** — an edge-weighted vote across all strategies, from
  `strong_buy` to `avoid`.
- **Per-strategy detail** — how each rule performed over every window, versus
  buy-and-hold, with drawdown and trade count.

### Live snapshot

A separate, faster job: where each asset stands right now across 5M / 1H / 4H / D / W / M
— EMA structure, Bollinger position, RSI, a blended TSMOM score — plus options
positioning for the tickers that have chains.

### Field guide

Every ticker, strategy and metric has a plain-English entry served from `GET /guide` and
rendered at `/guide` on the dashboard. Strategy names and asset rows in the report link
straight to their anchor, so "what is XLB and why does this rule work" is one click from
the number that raised the question.

The wording lives in the backend (`constants/assets.ts`, `constants/guide.ts`) rather
than in the frontend, so the web page, the API and Telegram all describe things the same
way, and the explanation sits beside the code that produces the numbers.

## Universe

23 assets, chosen so a breadth reading means something: the broad market, **all eleven**
of its sectors, and the macro instruments that usually explain why the sectors are
moving.

| Group          | Symbols                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Market indices | `SPY` S&P 500 · `QQQ` Nasdaq 100 · `DIA` Dow 30 · `IWM` Russell 2000                                                                                                                                             |
| Sectors        | `XLK` Technology · `XLF` Financials · `XLE` Energy · `XLV` Health Care · `XLI` Industrials · `XLY` Discretionary · `XLP` Staples · `XLU` Utilities · `XLB` Materials · `XLRE` Real Estate · `XLC` Communications |
| Crypto         | `BTC-USD` Bitcoin · `IBIT` spot bitcoin ETF                                                                                                                                                                      |
| Commodities    | `GLD` Gold · `SLV` Silver · `USO` WTI crude · `UNG` Natural gas                                                                                                                                                  |
| Currency       | `UUP` US dollar index                                                                                                                                                                                            |
| Bonds          | `TLT` 20+ year Treasuries                                                                                                                                                                                        |

Two of these carry a caveat the guide states explicitly: **`USO` and `UNG` hold futures,
not the commodity.** They roll near-month contracts, so over long windows their return is
dominated by roll cost rather than by the price of oil or gas. Judge them on the short
windows.

## The Two Scores

Conflating "does this rule work?" with "should I act today?" is the usual way a backtest
becomes misleading, so they are scored separately.

**`edgeScore` (0-100)** — does this rule have a durable edge on this asset? Blends, across
every window: excess CAGR over buy-and-hold, Sharpe difference, and drawdown improvement.
Then two corrections:

- _Consistency_ — beating the benchmark in 8 of 10 windows counts for more than one
  lucky window.
- _Sample size_ — an edge measured over five trades is not an edge, so thin records
  shrink back toward the neutral 50.

**`opportunityScore` (0-100)** — is _today_ an attractive moment to act on that rule?
Takes the edge and modulates it by what the strategy is actually saying:

| Action     | Meaning                                 | Effect on score                           |
| ---------- | --------------------------------------- | ----------------------------------------- |
| `enter`    | Flipped long — the strategy's own entry | Full edge, and then some                  |
| `hold`     | Already long                            | Discounted, decaying as the position ages |
| `exit`     | Flipped flat                            | Inverts the edge                          |
| `stay_out` | Flat and staying flat                   | Inverts, more mildly                      |

A rule with a real edge telling you to stay out is evidence _against_ buying. A rule with
no edge saying anything lands near neutral.

## Consensus

Each strategy's vote is weighted by its edge; below an edge of 45 it gets no vote at all,
so twenty mediocre rules cannot outvote three good ones on headcount. Buy & hold is
excluded — it is long by construction and would put a permanent thumb on the scale.

The result is shrunk toward neutral when little total edge is voting. An asset where
nothing works reports `neutral`, not a maximum-conviction `avoid`.

| Verdict      | Consensus score |
| ------------ | --------------- |
| `strong_buy` | ≥ 72            |
| `accumulate` | ≥ 58            |
| `neutral`    | ≥ 42            |
| `reduce`     | ≥ 28            |
| `avoid`      | < 28            |

## Backtest Methodology

**Execution.** A signal computed at the close of bar `i` is filled at the **open of bar
`i+1`**, with slippage and fees on the fill. Bar 0 is always flat. This one-bar shift is
what keeps results free of lookahead — and it is why the pre-market report is honest: it
reads yesterday's close and acts at today's open.

**Warm-up.** Indicators return `NaN` until they are defined, and strategies treat `NaN` as
"no opinion" and stay flat. Signals are computed once over full history and then _sliced_
per window, so a 1-month window can still evaluate a 200-day moving average correctly.

**Benchmark.** Every window is compared against buy-and-hold over the identical span.
"Beating" it requires winning on return _and_ not taking more drawdown to get there.

**Annualization is inferred from timestamps, not assumed.** Yahoo silently downgrades
granularity on some requests — a `range=max&interval=1d` call for SPY returns _monthly_
candles, 403 bars for 33 years. Taking bars-per-year on faith turned a 12% CAGR into 924%.
Elapsed wall-clock time between the first and last bar cannot lie, so it drives the
annualization, and a granularity substitution is logged loudly.

**Costs.** Fees and slippage default to 5 bps each per fill. A buy is sized to leave room
for its own fee, so a fully invested position never runs on margin.

## Lookback Windows

Daily backtests run over `max`, `20y`, `10y`, `5y`, `3y`, `2y`, `1y`, `6mo`, `3mo`, `1mo`.
Hourly backtests use a shorter set, capped by Yahoo's ~730-day intraday retention.

Windows that resolve to the same span as full history are dropped as duplicates — which is
what stops a young ticker like IBIT from reporting identical `10y`, `5y` and `max` rows.

Mid-horizon windows dominate the edge score on purpose: two decades may describe a regime
that no longer exists, one month is mostly noise, and three to five years is long enough
to contain a real drawdown while staying relevant.

## Strategy Registry

Twenty configurations across five families:

| Family         | Strategies                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Benchmark      | Buy & Hold                                                                                                                                 |
| Trend          | SMA Cross 50/200 · SMA Cross 20/100 · EMA Cross 12/26 · EMA Cross 20/50 · Price > SMA200 · Price > SMA50 · MACD 12/26/9 · Supertrend 10/3× |
| Momentum       | Absolute Momentum 252 · Absolute Momentum 90 · RSI Trend 14                                                                                |
| Breakout       | Donchian 20/10 · Donchian 55/20 · Chandelier 20/14/3× · Bollinger Breakout 20/2σ                                                           |
| Mean reversion | RSI Reversion 14 · RSI Reversion 2 · Bollinger Reversion 20/2σ · Z-Score Reversion 20                                                      |

Parameters are deliberately conventional rather than optimized. Tuned values would score
better in the backtest and mean less out of sample.

### TSMOM, and holding it to account

FinSnap reports a live TSMOM score per asset — a 0-100 trend reading blended across 5m,
1H, 4H, D and W. That number was never validated: nothing checked whether acting on it
would have made money.

`tsmom_55` and `tsmom_50` fix that by trading the score, so the backtest judges it like
any other rule. The version in the registry is deliberately **single-timeframe**: intraday
history reaches back two years at best, so a multi-timeframe form could not be tested over
the windows that matter. It applies the same five components with the same weights to one
series, which on daily bars is the daily-only TSMOM.

So the backtest answers "does this scoring approach have an edge here", not "is the live
number exactly right". They are named separately because they are not the same thing.

### Adding a strategy

One line in `apps/backend/src/backtest/strategies/index.ts`:

```ts
export const STRATEGIES: StrategyDef[] = [
  // …
  emaCross(9, 21),
];
```

Build it with an existing factory, or write a new one in `trend.ts`, `meanReversion.ts` or
`breakout.ts`. Everything downstream — backtests across every window, today's signal,
scoring, the report, the API and the UI — picks it up automatically.

A strategy is a pure function from bars to target exposure per bar:

```ts
export function priceAboveSma(period: number): StrategyDef {
  return {
    id: `price_above_sma_${period}`,
    name: `Price > SMA${period}`,
    kind: StrategyKind.Trend,
    description: `Long while the close is above its ${period}-bar simple average.`,
    params: { period },
    warmup: period,
    signals(bars) {
      const price = closes(bars);
      const ma = sma(price, period);
      return whenTrue(bars.length, (i) => defined(ma[i]) && price[i] > ma[i]);
    },
  };
}
```

### Adding an asset

Extend `CRYPTO_SYMBOLS` or `EQUITY_SYMBOLS` with any Yahoo Finance symbol. The report
picks it up on the next run; unknown symbols fall back to a neutral entry rather than
breaking.

To give it a proper description in the field guide, add an entry to
`src/constants/assets.ts`:

```ts
NVDA: {
  name: 'NVIDIA Corporation',
  shortName: 'NVIDIA',
  category: AssetCategory.Stock,
  blurb: 'Designs the accelerators most AI training runs on ...',
  caveat: 'Optional — something non-obvious about how to read its backtest.',
},
```

A test fails if a symbol in the default universe has no entry, which is the failure mode
worth guarding: shipping a ticker to the guide page with nothing next to it.

## Architecture

```text
[Collectors]                    Yahoo Finance — OHLCV bars (1d / 1h / 5m) + options chains
       |                        Postgres-backed, incremental sync
       v
[Backtest]                      indicators -> strategies -> engine -> metrics -> windows
       |                        next-bar-open execution, per-window benchmark
       v
[Scoring]                       edgeScore + opportunityScore + consensus
       |
       v
[Report / Snapshot]             DailyReport (settled) · FinSnap (live)
       |
       v
[Outputs]                       Hono API · Telegram · Next.js dashboard
```

```text
finsnap/
├── apps/
│   ├── backend/
│   │   └── src/
│   │       ├── backtest/         engine · metrics · windows · opportunity · runner
│   │       │   ├── indicators/   movingAverages · oscillators · bands · volatility
│   │       │   └── strategies/   trend · meanReversion · breakout · tsmom · registry
│   │       ├── collectors/       bars/ (chart · pack) · options · yahooSession
│   │       ├── analyzers/        price · tsmom · options · resample
│   │       ├── report/           builder · consensus · compact · format/
│   │       ├── snapshot/         builder · types
│   │       ├── constants/        enums · assets · guide · backtest · cache · display
│   │       ├── sync/             runner · tracker (manual refresh + live progress)
│   │       ├── lib/              format · math · async
│   │       ├── output/
│   │       │   ├── web/routes/   root · health · snap · report · strategies · guide · sync
│   │       │   └── telegram/     commands · formatSnap
│   │       ├── storage/          types (port) · postgresStorage · barsStore · optionsStore · stores
│   │       └── scheduler/        cron (snap + report)
│   └── frontend/                 Next.js — dashboard · technicals · options · guide
└── docker-compose.yml            backend + frontend + Postgres
```

## API

| Method | Path                      | Description                                              |
| ------ | ------------------------- | -------------------------------------------------------- |
| `GET`  | `/`                       | Service info + endpoint map                              |
| `GET`  | `/health`                 | Health check, last snap and report                       |
| `GET`  | `/report`                 | Latest daily report (compact)                            |
| `GET`  | `/report?detail=full`     | Full report — every strategy, every window               |
| `GET`  | `/report?strategies=N`    | Compact report with N strategies per asset               |
| `GET`  | `/report/opportunities`   | Today's fired entries and exits                          |
| `GET`  | `/report/asset/:label`    | Full backtest detail for one asset                       |
| `GET`  | `/report/date/:date`      | Report for a trading date (`YYYY-MM-DD`)                 |
| `GET`  | `/reports?limit=N`        | Report history metadata                                  |
| `POST` | `/report/trigger`         | Rebuild the daily report now                             |
| `GET`  | `/snap`                   | Latest live snapshot                                     |
| `GET`  | `/snap/:label`            | Live snapshot for one asset                              |
| `GET`  | `/snaps?limit=N`          | Snapshot history                                         |
| `POST` | `/snap/trigger`           | Trigger a fresh snapshot                                 |
| `GET`  | `/strategies`             | Strategy registry, windows and universe                  |
| `GET`  | `/strategies/leaderboard` | Which rule beats buy & hold, pooled across every asset   |
| `GET`  | `/guide`                  | Field guide — assets, strategy families, metrics, method |
| `POST` | `/sync`                   | Refresh every asset, then rebuild snapshot and report    |
| `GET`  | `/sync`                   | Progress of the current or last sync                     |

The compact report is the default because a full one carries every strategy across every
window — right to store, wrong to send by default.

The three `POST` endpoints that start work — `/sync`, `/report/trigger`, `/snap/trigger` —
sit behind a bearer token when `API_TOKEN` is set, and are open when it is not. Reads stay
open either way, including `GET /sync`, which the dashboard polls anonymously.

## Dashboard

Five tabs, because they answer different questions:

| Tab            | What it is                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| **Dashboard**  | The daily report — today's orders and one verdict per asset. The thing you act on.    |
| **Technicals** | The live multi-timeframe read for every asset, as one sortable table. Not backtested. |
| **Strategies** | Which rule actually has an edge, pooled across the whole universe — see below.        |
| **Options**    | Positioning by expiry for the liquid tickers. Context, never a signal.                |
| **Guide**      | What every ticker, rule and number means.                                             |

The verdicts table sorts on any column — click once for descending, again for ascending, a
third time to return to the report's own ranking — and filters by search or instrument
class. Columns cover market size, class, trend, momentum, how many strategies are long,
the best-evidenced rule, a modelled return, and today's entries and exits.

**Capital and the Return column.** Set a capital figure above the table and the Return
column shows what that money would have become under each asset's best-evidenced rule
over its headline window, next to what simply holding would have produced. It compounds
the annualized rate over the window's actual elapsed years rather than its label, because
"5 years" is approximate and `max` has no fixed length. It is a hypothetical built on past
results — fees and slippage are already in the backtest, tax is not.

**On "6/19 long"**: the count spans every non-benchmark strategy, while the score is
edge-weighted — only rules that clear `MIN_VOTING_EDGE` move it. An asset can therefore
read 6/19 long and still score 33, because thirteen of those nineteen have no demonstrated
edge and contribute nothing. Both numbers are true and they measure different things; the
expanded row states how many of the total it is showing and how many actually carry weight.

**Size** is market cap for crypto and net assets for funds. Yahoo returns no market cap for
an ETF, and that is correct rather than a gap — a fund creates and redeems shares on
demand, so price × shares says nothing about how big it is.

### Strategy Leaderboard

The daily report answers "how did this rule do on this asset". The **Strategies** tab
answers the question one level up: pooled across all 23 assets, which rule actually beats
buy-and-hold, at which horizon.

Every strategy gets a row; every lookback window (`1mo` through `max`) gets a column. Each
cell is a win rate — the share of assets where the rule beat buying that asset at the start
of the window and holding it, on both return and drawdown. A ★ marks the rule that wins a
horizon outright, and a callout row surfaces the single best rule per horizon plus the one
with the best pooled win rate overall. A rule only qualifies as a horizon's leader once it
ran on at least half the universe — otherwise a strategy that only cleared warm-up on one
or two young tickers could "win" on a sample of one.

This is a reduction of numbers the daily report already computed, not a new backtest —
`GET /strategies/leaderboard` builds it from the latest stored report.

## Manual Sync

The dashboard has a **Sync** button, docked top-right. It runs three phases in order:

1. **Fetching** — pull fresh bars (1d / 1h / 5m) and option chains for all 23 symbols.
2. **Snapshot** — rebuild the live view off the now-warm cache.
3. **Report** — re-run every backtest and rebuild the daily report.

Only phase one touches the network, so it is the only one reported symbol by symbol —
which is also the only phase where watching a spinner tells you anything. The panel shows
which symbol is in flight, how many bars came back, how much was served from cache, and
the network time per symbol. A full run is roughly two and a half minutes, most of it
spent paging option chains.

`POST /sync` returns `202` immediately and `409` if a run is already in flight; the
client polls `GET /sync`. Progress is in-memory and single-slot: it exists for a person
watching a page, nothing downstream reads it, and it does not survive a restart.

## Telegram

Entirely optional. With no `TELEGRAM_BOT_TOKEN` the bot is inert — publishing is skipped
with a warning and everything else (API, dashboard, schedulers, backtests) runs unchanged.
Telegram is one output, not the product.

Two modes:

- **`polling`** (default) holds an open connection and needs a process that stays alive.
  Right for Docker, Fly or Railway; impossible in a serverless function.
- **`webhook`** registers `POST /telegram/webhook` with Telegram so updates arrive over
  HTTP. Needs `TELEGRAM_WEBHOOK_URL`; set `TELEGRAM_WEBHOOK_SECRET` so the endpoint can
  reject anything not from Telegram.

| Command       | Description                      |
| ------------- | -------------------------------- |
| `/today`      | Just the fired signals           |
| `/report`     | Full daily report                |
| `/report BTC` | One asset's strategies in detail |
| `/snap`       | Live multi-timeframe snapshot    |
| `/snap SPY`   | One asset's live structure       |

## Options Positioning

Carried over as context, not signal. Per expiry:

- `pcRatio = putVolume / callVolume`
- `skewScore = 0.5 * (ln(volRatio) + ln(oiRatio))` — `>0` put-heavy, `<0` call-heavy
- `weightedMeanStrike = sum(strike * volume) / sum(volume)`, with its dispersion
- Wall inference from the dominant side, and its distance from spot

Labels: `put_stack` / `call_stack` (strong directional skew), `soft_put` / `soft_call`
(mild lean near spot), `balanced`, `thin` (low liquidity, de-emphasized).

## Getting Started

```bash
yarn install
docker compose up --build
```

That is the whole setup. **No `.env` is required** — Telegram and `API_TOKEN` are
optional, and Compose supplies the database URL itself. Copy `apps/backend/.env.example`
to `apps/backend/.env` only when you want to change something.

### Running on the host instead

`yarn dev` needs a Postgres it can reach on `localhost`, which the Compose service provides:

```bash
yarn dev:local     # starts Postgres in Docker, then runs both apps
```

Or in two steps — `yarn db` then `yarn dev`. Stop it with `yarn db:stop`.

The `DATABASE_URL` default is `postgres://postgres:postgres@localhost:5432/finsnap` for
exactly this case; docker-compose overrides it with
`postgres://postgres:postgres@postgres:5432/finsnap`, which only resolves inside its own
network.

- **API**: `http://localhost:4000`
- **Dashboard**: `http://localhost:3000`

On a cold start the backend builds a snapshot and a report in the background, so the API
answers immediately while data is still arriving.

### Without Docker

```bash
# Requires a running Postgres
yarn workspace @monorepo/backend dev
yarn workspace @monorepo/frontend dev
```

### Tests

```bash
yarn test
```

## Configuration

`apps/backend/.env`

| Variable                  | Default                                              | Description                                          |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `APP_PORT`                | `4000`                                               | API server port                                      |
| `DATABASE_URL`            | `postgres://postgres:postgres@postgres:5432/finsnap` | Postgres connection URL                              |
| `TELEGRAM_BOT_TOKEN`      | —                                                    | Bot token. **Optional** — blank disables delivery    |
| `TELEGRAM_CHANNEL_ID`     | —                                                    | Channel to publish to. Optional, same as above       |
| `TELEGRAM_MODE`           | `polling`                                            | `polling` \| `webhook` \| `off`                      |
| `TELEGRAM_WEBHOOK_URL`    | —                                                    | Public base URL, webhook mode only                   |
| `TELEGRAM_WEBHOOK_SECRET` | —                                                    | Secret Telegram echoes back, webhook mode only       |
| `API_TOKEN`               | —                                                    | Bearer token for the trigger endpoints. Unset = open |
| `CRYPTO_SYMBOLS`          | `BTC-USD`                                            | Crypto symbols, 365 periods/year                     |
| `EQUITY_SYMBOLS`          | 22 symbols — see [Universe](#universe)               | Equity symbols, 252 periods/year                     |
| `OPTIONS_SYMBOLS`         | 12 symbols — the liquid subset                       | Subset to pull options chains for                    |
| `BACKTEST_CAPITAL`        | `10000`                                              | Starting capital per backtest                        |
| `BACKTEST_FEE_BPS`        | `5`                                                  | Fee per fill, basis points                           |
| `BACKTEST_SLIPPAGE_BPS`   | `5`                                                  | Slippage per fill, basis points                      |
| `SNAP_CRON`               | `0 * * * *`                                          | Live snapshot schedule                               |
| `REPORT_CRON`             | `0 8 * * 1-5`                                        | Daily report schedule                                |
| `REPORT_TIMEZONE`         | `America/New_York`                                   | Timezone the report cron resolves in                 |
| `LOG_LEVEL`               | `info`                                               | Winston log level                                    |

The report cron runs in an explicit timezone. Left to the container clock, "before the
open" silently becomes "during lunch" the first time the host region changes.

## Glossary

- `edgeScore` — 0-100 confidence that a rule has a durable edge on an asset.
- `opportunityScore` — 0-100 attractiveness of acting on that rule today.
- `consensus.score` — edge-weighted share of strategies currently long.
- `excessCagrPct` — strategy CAGR minus buy-and-hold CAGR, in percentage points.
- `beatsBenchmark` — beat buy-and-hold on return _and_ drawdown over that window.
- `barsInState` — how long a strategy has held its current exposure.
- `tsmom.score` — live trend-strength blend across timeframes (the discretionary cousin
  of the `abs_momentum` strategy).
- `bollinger.percentB` — price location in the ±2σ band (`0` lower edge, `1` upper).

## Hosting

Not deployed yet. The groundwork is in place; the decisions are not made.

The daily report is a **batch job**, not a service — it runs once per weekday for about
two and a half minutes and exits. That shape does not need an always-on server:

| Piece             | Target               | Status                                                                                       |
| ----------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| Frontend          | Vercel               | CI job stubbed in `.github/workflows/frontend.yml`                                           |
| Database          | Supabase (Postgres)  | Adapter + migrations in place — bars, options archive, snap/report storage, searched tickers |
| Pre-market report | Scheduled runner     | Undecided — see below                                                                        |
| Live snaps + bot  | Long-lived container | Only works with a persistent process                                                         |

**Supabase hosts the database only, not the backend.** It is Postgres plus Deno Edge
Functions, not a Node app host, and `node-cron` becomes `pg_cron` there. The backend
itself runs as one persistent Node container (Railway — see `docs/hosting.md`) with a
direct `pg` connection to Supabase's Postgres; there is no separate cache service to run
alongside it, since durable state lives in Postgres and short-TTL caches live in the
backend's own process memory.

The open question is where the scheduled job runs. GitHub Actions is free with a six-hour
limit and fits the pre-market batch exactly. A small Fly/Railway container is the
zero-rewrite option and is the only one that keeps the hourly snap cron and the
interactive Telegram bot working as they do today.

### What is already prepared

- **Storage port** (`storage/types.ts`) — six operations Postgres can express. The
  snap/report stores are written against it; `PostgresStorage` is the (only) adapter.
- **Postgres adapter + migrations** for bars (incremental sync, per-interval retention),
  the options-chain daily archive (30-day retention), snap/report storage, and the
  searched-ticker registry — all four run through the same small migration runner.
- **Telegram is optional and has a webhook mode** — a missing token no longer stops the
  service, and serverless has a path that does not require polling.
- **Optional bearer auth** on the endpoints that start work, so a public URL is not an
  open invitation to trigger full-universe fetches.
- **Two CI workflows** that lint, typecheck, test and build, each ending in a deploy job
  left deliberately empty with notes on what fills it.

### Still missing

- The sync progress tracker is in-memory and single-instance — meaningless once there is
  more than one instance, or none.
- The frontend fetches on the client, so a hosted page is blank until JS boots. Moving to
  server-side rendering against Supabase would fix that and remove a network hop.
- **Yahoo Finance from a datacenter IP is the real risk.** It already needs a session
  crumb, and cloud egress is throttled far harder than a home connection. This is the
  thing most likely to break a hosted deployment, and it argues for budgeting a paid data
  provider before committing.

## Tech Stack

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
