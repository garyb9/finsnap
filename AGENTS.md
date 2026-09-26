# AGENTS.md

Working notes for contributors and AI agents. The [README](./README.md) is the human
front door — what FinSnap is and how to run it. This file is the map: engine internals,
scoring math, repo conventions, and what was and was not carried over from the Python
predecessor. Read this before changing code.

## What FinSnap is

A systematic signal engine over a fixed 23-asset universe. It fetches daily/intraday bars
and option chains from Yahoo Finance, backtests a registry of conventional strategies with
no-lookahead execution, scores each strategy for edge and each asset for today's
opportunity, and publishes the result as a daily report, a live snapshot, a JSON API, a
Telegram bot, and a Next.js dashboard.

**Two output cadences:**

- **Daily report** — batch job, runs before the open over the last completed session,
  exits. This is the actionable artifact: today's entries/exits and a per-asset verdict.
- **Live snapshot** — faster job, multi-timeframe read on where each asset stands now.

**Context, never signal:** options positioning and (proposed) SEC filing data are shown
for context but never feed `edgeScore`, `opportunityScore`, or any strategy. Keep that
line intact unless a design doc says otherwise.

## Repo layout

```text
finsnap/
├── apps/
│   ├── backend/
│   │   └── src/
│   │       ├── backtest/         engine · metrics · windows · opportunity · runner
│   │       │   ├── indicators/   movingAverages · oscillators · bands · volatility · volume
│   │       │   └── strategies/   trend · meanReversion · breakout · momentum · volume · tsmom · registry
│   │       ├── collectors/       bars/ (chart · pack) · options · quote · binance · coingecko · yahooSession
│   │       ├── analyzers/        price · tsmom · options · correlation · resample
│   │       ├── report/           builder · consensus · regime · leaderboard · compact · format/
│   │       ├── snapshot/         builder · types
│   │       ├── constants/        enums · assets · guide · backtest · cache · display · time · yahoo
│   │       ├── sync/             runner · tracker (manual refresh + live progress)
│   │       ├── lib/              math · dates · format · async · memoCache
│   │       ├── output/
│   │       │   ├── web/routes/   root · health · snap · report · strategies · guide · sync · correlation · universe · telegram
│   │       │   └── telegram/     commands · formatSnap
│   │       ├── storage/          types (port) · postgresStorage · barsStore · optionsStore · snap · report · searchedTicker
│   │       ├── universe/         tracked-symbol registry · ticker validation · searched-ticker lifecycle
│   │       ├── db/               pool · migration runner · embedded migrations
│   │       └── scheduler/        cron (snap + report) + failure alerting
│   └── frontend/                 Next.js — dashboard · technicals · strategies · options · guide
├── docs/                         roadmap · hosting · design/ · marketing/ · ideas/ · superpowers/
└── docker-compose.yml            backend + frontend + Postgres
```

## Commands

```bash
yarn install              # install everything (Yarn 1 workspaces)
yarn dev                  # both apps (needs Postgres reachable — see below)
yarn dev:local            # starts Postgres in Docker, then yarn dev
yarn db / yarn db:stop    # Postgres on its own

yarn format               # prettier --write across the workspace
yarn lint                 # turbo run lint
yarn lint:fix             # eslint --fix
yarn build                # turbo run build
yarn test                 # turbo run test (vitest)

yarn prep                 # format + lint:fix + build  (the autofixing pass)
yarn ci                   # yarn prep && yarn test     (what GitHub Actions enforces)
```

`yarn ci` is the local mirror of the two workflows. Run it before pushing.

**Postgres for host development:** `DATABASE_URL` defaults to
`postgres://postgres:postgres@localhost:5432/finsnap`. `docker-compose.yml` overrides the
host with `postgres` for the container network. `yarn db` gives you the localhost one.

**No `.env` is required.** Telegram and `API_TOKEN` are optional; Compose supplies the DB
URL. Copy `apps/backend/.env.example` only to change something.

## Conventions

- **Yarn 1 workspaces + Turborepo.** Package tasks live in each workspace
  `package.json`; the root scripts fan out with `turbo run`.
- **Prettier is enforced in CI** (`npx prettier --check .` in the backend workflow). If you
  touch `README.md` or anything under `docs/`, run `yarn format` — markdown tables are
  reformatted and the check fails on drift.
- **No comments unless they explain _why_.** The codebase is deliberately comment-light;
  comments carry non-obvious reasoning, not narration.
- **Types at the edge.** Collectors parse external JSON into typed shapes in
  `collectors/types.ts`; analyzers consume those, never raw responses. Validate, then
  store the small typed thing.
- **Pure analyzers.** `analyzers/` and `backtest/` take data in and return data out — no
  network, no storage. Tests run against fixtures, never live network.
- **Storage goes through the port.** Durable state uses `StoragePort`
  (`storage/types.ts`); `PostgresStorage` is the only adapter. Domain stores wrap it.
- **Tests are Vitest**, in `apps/backend/src/__tests__/`. Live-network tests live under
  `__tests__/integration/` and are skipped unless `INTEGRATION=true`.

## Architecture

```text
[Collectors]   Yahoo OHLCV bars (1d/1h/5m) + options chains + quote, Postgres-backed, incremental sync
      │
      ▼
[Backtest]     indicators → strategies → engine → metrics → windows   (next-bar-open execution)
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

## Backtest methodology

- **Execution.** A signal computed at the close of bar `i` fills at the **open of bar
  `i+1`**, with slippage and fees on the fill. Bar 0 is always flat. This one-bar shift is
  what keeps results free of lookahead — and why the pre-market report is honest: it reads
  yesterday's close and acts at today's open.
- **Warm-up.** Indicators return `NaN` until defined; strategies treat `NaN` as "no
  opinion" and stay flat. Signals are computed once over full history and then _sliced_
  per window, so a 1-month window still evaluates a 200-day average correctly.
- **Benchmark.** Every window is compared to buy-and-hold over the identical span.
  "Beating" it requires winning on return **and** not taking more drawdown.
- **Annualization is inferred from timestamps, not assumed.** Yahoo silently downgrades
  granularity on some requests — `range=max&interval=1d` for SPY returns _monthly_ candles,
  403 bars for 33 years. Elapsed wall-clock between first and last bar drives the
  annualization, and a granularity substitution is logged loudly.
- **Costs.** Fees and slippage default to 5 bps each per fill. A buy is sized to leave room
  for its own fee, so a fully invested position never runs on margin.

## Lookback windows

Daily: `max`, `20y`, `10y`, `5y`, `3y`, `2y`, `1y`, `6mo`, `3mo`, `1mo`. Hourly uses a
shorter set, capped by Yahoo's ~730-day intraday retention.

Windows that resolve to the same span as full history are dropped as duplicates — this is
what stops a young ticker like IBIT reporting identical `10y`/`5y`/`max` rows.

Mid-horizon windows dominate the edge score on purpose: two decades may describe a regime
that no longer exists, one month is mostly noise, and three to five years contains a real
drawdown while staying relevant.

## Scoring math

### edgeScore (0–100) — does this rule have a durable edge on this asset?

Blends, across every window: excess CAGR over buy-and-hold, Sharpe difference, and
drawdown improvement. Then two corrections:

- **Consistency** — beating the benchmark in 8 of 10 windows counts for more than one lucky
  window. (`report/` + `backtest/opportunity.ts`.)
- **Sample size** — an edge measured over five trades is not an edge, so thin records
  shrink back toward the neutral 50.

### opportunityScore (0–100) — is today an attractive moment to act on that rule?

Takes the edge and modulates it by what the strategy is saying:

| Action     | Meaning               | Effect on score                           |
| ---------- | --------------------- | ----------------------------------------- |
| `enter`    | Flipped long          | Full edge, and then some                  |
| `hold`     | Already long          | Discounted, decaying as the position ages |
| `exit`     | Flipped flat          | Inverts the edge                          |
| `stay_out` | Flat and staying flat | Inverts, more mildly                      |

A rule with a real edge telling you to stay out is evidence _against_ buying. A rule with
no edge saying anything lands near neutral. See `backtest/opportunity.ts`.

### Consensus

Each strategy's vote is weighted by its edge; below an edge of `MIN_VOTING_EDGE` (45) it
gets **no vote**, so twenty mediocre rules cannot outvote three good ones on headcount.
Buy & hold is excluded — it is long by construction. The result is shrunk toward neutral
when little total edge is voting.

| Verdict      | Consensus score |
| ------------ | --------------- |
| `strong_buy` | ≥ 72            |
| `accumulate` | ≥ 58            |
| `neutral`    | ≥ 42            |
| `reduce`     | ≥ 28            |
| `avoid`      | < 28            |

### Regime note

`report/regime.ts` classifies the current regime (trending / choppy, via ADX) and, when
one strategy family clearly dominates today's edge-weighted votes, appends an explanatory
note. Purely explanatory — it does not touch the two scores.

## Strategy registry

Twenty configurations across five families, in `apps/backend/src/backtest/strategies/`:

| Family         | Strategies                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Benchmark      | Buy & Hold                                                                                                               |
| Trend          | SMA Cross 50/200 · SMA 20/100 · EMA 12/26 · EMA 20/50 · Price > SMA200 · Price > SMA50 · MACD 12/26/9 · Supertrend 10/3× |
| Momentum       | Absolute Momentum 252 · Absolute Momentum 90 · RSI Trend 14 · vol-targeted momentum                                      |
| Breakout       | Donchian 20/10 · Donchian 55/20 · Chandelier 20/14/3× · Bollinger Breakout 20/2σ · volatility-squeeze breakout (×2)      |
| Mean reversion | RSI Reversion 14 · RSI Reversion 2 · Bollinger Reversion 20/2σ & 20/3σ · Z-Score Reversion 20 · IBS · n-day-low          |
| Volume         | OBV/ADL/CMF trend · MFI reversion · volume-confirmed breakout                                                            |

Parameters are deliberately conventional rather than optimized. Tuned values would score
better in the backtest and mean less out of sample.

### Adding a strategy

One line in `apps/backend/src/backtest/strategies/index.ts`:

```ts
export const STRATEGIES: StrategyDef[] = [
  // …
  emaCross(9, 21),
];
```

Build it with an existing factory or write a new one alongside. Everything downstream —
backtests across every window, today's signal, scoring, the report, the API and the UI —
picks it up automatically. A strategy is a pure function from bars to target exposure per
bar:

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

Extend `CRYPTO_SYMBOLS` or `EQUITY_SYMBOLS` with any Yahoo symbol. The report picks it up
next run; unknown symbols fall back to a neutral entry. To give it a proper field-guide
entry, add to `src/constants/assets.ts`:

```ts
NVDA: {
  name: 'NVIDIA Corporation',
  shortName: 'NVIDIA',
  category: AssetCategory.Stock,
  blurb: 'Designs the accelerators most AI training runs on ...',
  caveat: 'Optional — something non-obvious about how to read its backtest.',
},
```

A test fails if a default-universe symbol has no entry — the guard against shipping a
ticker to the guide page with nothing next to it.

## Options positioning (context, never signal)

Per expiry:

- `pcRatio = putVolume / callVolume`
- `skewScore = 0.5 * (ln(volRatio) + ln(oiRatio))` — `>0` put-heavy, `<0` call-heavy
- `weightedMeanStrike = Σ(strike·volume) / Σ(volume)`, with its dispersion
- Wall inference from the dominant side, and its distance from spot

Labels: `put_stack` / `call_stack` (strong directional skew), `soft_put` / `soft_call`
(mild lean near spot), `balanced`, `thin` (low liquidity, de-emphasized).

`buildStrikeProfile(data)` (`analyzers/options.ts`) additionally sums every contract
sharing a strike across all expiries, producing `calls` / `puts` / `combined` rows sorted
ascending by strike — the per-strike distribution the per-expiry stats throw away.

## General-purpose statistics

`lib/math.ts` holds the shared primitives: `clamp`, `squash` (tanh), `mean`,
`sampleStdev` (n−1), `populationStdev` (n), `percentile`, `covariance`, `pearson`,
`skew`, `kurtosis`, `ols` (simple linear regression → `{slope, intercept, r2, n}`), and
`round`. Reach for these before writing a local copy — `analyzers/correlation.ts` uses the
shared `pearson`, and `analyzers/options.ts` uses `weightedMean`/`weightedStd` for strikes.

`lib/dates.ts` separates strict ISO handling (`isIsoDate`, `parseIsoDate` — for API params
and stored keys) from lenient parsing (`toEpochMs`, `isDate` — for data arriving from
outside). Lenient parsing normalizes to UTC midnight so a date-only string means the same
instant regardless of host timezone.

## API surface

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

The three `POST` endpoints that start work — `/sync`, `/report/trigger`, `/snap/trigger` —
sit behind a bearer token when `API_TOKEN` is set, and are open when it is not. Reads stay
open either way.

## Configuration (`apps/backend/.env`)

| Variable                  | Default                                              | Description                                                        |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `APP_PORT`                | `4000`                                               | API server port                                                    |
| `DATABASE_URL`            | `postgres://postgres:postgres@postgres:5432/finsnap` | Postgres connection URL                                            |
| `TELEGRAM_BOT_TOKEN`      | —                                                    | Bot token. **Optional** — blank disables delivery                  |
| `TELEGRAM_CHANNEL_ID`     | —                                                    | Channel to publish to. Optional, same as above                     |
| `TELEGRAM_OPS_CHANNEL_ID` | —                                                    | Channel pinged when the scheduled snap/report cron fails. Optional |
| `TELEGRAM_MODE`           | `polling`                                            | `polling` \| `webhook` \| `off`                                    |
| `TELEGRAM_WEBHOOK_URL`    | —                                                    | Public base URL, webhook mode only                                 |
| `TELEGRAM_WEBHOOK_SECRET` | —                                                    | Secret Telegram echoes back, webhook mode only                     |
| `API_TOKEN`               | —                                                    | Bearer token for the trigger endpoints. Unset = open               |
| `CRYPTO_SYMBOLS`          | `BTC-USD`                                            | Crypto symbols, 365 periods/year                                   |
| `EQUITY_SYMBOLS`          | 22 symbols — see README Universe                     | Equity symbols, 252 periods/year                                   |
| `OPTIONS_SYMBOLS`         | 12 symbols — the liquid subset                       | Subset to pull options chains for                                  |
| `BACKTEST_CAPITAL`        | `10000`                                              | Starting capital per backtest                                      |
| `BACKTEST_FEE_BPS`        | `5`                                                  | Fee per fill, basis points                                         |
| `BACKTEST_SLIPPAGE_BPS`   | `5`                                                  | Slippage per fill, basis points                                    |
| `SNAP_CRON`               | `0 * * * *`                                          | Live snapshot schedule                                             |
| `REPORT_CRON`             | `0 8 * * 1-5`                                        | Daily report schedule                                              |
| `REPORT_TIMEZONE`         | `America/New_York`                                   | Timezone the report cron resolves in                               |
| `LOG_LEVEL`               | `info`                                               | Winston log level                                                  |

The report cron runs in an explicit timezone. Left to the container clock, "before the
open" silently becomes "during lunch" the first time the host region changes.

## CI and Dependabot

Two workflows, path-scoped so a frontend-only change does not re-run the backtests:

- `.github/workflows/backend.yml` — prettier check, lint, typecheck, test, build.
- `.github/workflows/frontend.yml` — lint, typecheck, build.

Each ends in a deliberately empty deploy job with notes on what fills it (see
`docs/hosting.md`). Dependabot was disabled on the archived `finsnap-orig`; version bumps
are applied deliberately in this repo.

## Hosting (summary — full detail in `docs/hosting.md`)

Frontend → Vercel · Database → Supabase (Postgres only) · Backend → one persistent
Railway container (Telegram polling + hourly snap cron need a long-lived process). The
pre-market report is a batch job and could run on GitHub Actions. **Yahoo Finance from a
datacenter IP is the real risk** — it already needs a session crumb and cloud egress is
throttled harder than a home connection.

## Origin & ported code

FinSnap supersedes **`stock-options-analysis-tools`** (2020–2026), a set of Python
utilities for stock/options/derivatives analysis. The Python tree is preserved in git
history at [`16a64da`](https://github.com/garyb9/finsnap/tree/16a64da); browse it there.

What was folded into the TypeScript codebase, and what was not:

| Legacy Python                   | Status in FinSnap                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Options weighted mean/std       | Ported — `analyzers/options.ts` (`weightedMean`, `weightedStd`)                                                           |
| Per-strike aggregation          | Ported (extended) — `buildStrikeProfile` sums across expiries; the legacy version was per-date                            |
| Generic statistics              | Ported (extended) — `lib/math.ts`: percentile, covariance, pearson, skew, kurtosis, OLS added alongside mean/stddev       |
| Lenient date parsing            | Ported — `lib/dates.ts` (`isDate`, `toEpochMs`), plus strict ISO helpers                                                  |
| SEC EDGAR filings               | **Not ported** — laid out as an idea in `docs/ideas/sec-analysis.md` (XBRL companyfacts, code-parses/agent-reviews split) |
| Finviz scraper (quote + news)   | **Deliberately skipped** — extra scrape surface for marginal value; revisit with a proper news source                     |
| TradeStation file ingestion     | **Skipped** — FinSnap is fully automated; no consumer for manual Excel/CSV                                                |
| Matplotlib/plotly plotting      | **Skipped** — the frontend owns visuals                                                                                   |
| Timer/memory print helpers      | **Skipped** — `logger.ts` + Winston cover it                                                                              |
| CSV loading, price correlations | **Superseded** — Postgres bars + `analyzers/correlation.ts` (on returns, not price levels)                                |

## Glossary

- `edgeScore` — 0-100 confidence that a rule has a durable edge on an asset.
- `opportunityScore` — 0-100 attractiveness of acting on that rule today.
- `consensus.score` — edge-weighted share of strategies currently long.
- `excessCagrPct` — strategy CAGR minus buy-and-hold CAGR, in percentage points.
- `beatsBenchmark` — beat buy-and-hold on return _and_ drawdown over that window.
- `barsInState` — how long a strategy has held its current exposure.
- `tsmom.score` — live trend-strength blend across timeframes.
- `bollinger.percentB` — price location in the ±2σ band (`0` lower edge, `1` upper).
