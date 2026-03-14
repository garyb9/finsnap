# FinSnap

A financial data collector and repackager that pulls from multiple sources — on-chain Ethereum activity and options chains — normalizes everything into a clean snapshot JSON, and delivers it via a web API and Telegram bot.

Not analysis. Not trading. A **snap** of the market's current state, on demand or on schedule.

## What It Collects

### On-Chain (Ethereum)

- Whale transfers above a configurable threshold (default 100 ETH)
- Gas dynamics (average gwei, trend, congestion score)
- Block-level transaction volume and activity
- Derived signals: whale energy, network stress, volume intensity

### Equities / Options

- Options chains via Yahoo Finance — volume, open interest, strike distribution
- Weighted strike metrics (mean ± std) per expiration date
- Put/call volume ratio per expiration
- Starting ticker: **IBIT**

## How To Read Options Positioning (Skew + Walls)

In FinSnap, "option spread" means **put/call positioning spread** (how far flow and OI lean to one side), not bid/ask spread.

What is calculated per expiry:

- `pcRatio = putVolume / callVolume`
- `volRatio = puts.totalVolume / calls.totalVolume`
- `oiRatio = puts.totalOI / calls.totalOI`
- `skewScore = 0.5 * (ln(volRatio) + ln(oiRatio))`
  - `> 0` put-heavy, `< 0` call-heavy, near `0` balanced
- Weighted strike center + dispersion for each side:
  - `weightedMeanStrike = sum(strike * volume) / sum(volume)`
  - `weightedStdStrike = sqrt(sum(volume * (strike - mean)^2) / sum(volume))`
- Wall inference from dominant side:
  - `wallStrike` = weighted mean strike of the dominant leg
  - `distanceToSpotPct` = how far wall is from current spot
  - `nearSpotCluster` = dominant wall is relatively tight and close to spot

How labels map:

- `put_stack` / `call_stack`: stronger directional skew (both volume and OI ratios confirm)
- `soft_put` / `soft_call`: mild directional lean near spot
- `balanced`: no strong side
- `thin`: low-liquidity expiry (de-emphasized)

Why this is shown:

- It highlights where options positioning is concentrated by strike.
- It helps quickly see whether pressure clusters are near current price or far away.
- It adds context for potential support/resistance style zones without making trade calls.

## How To Read Price Structure (EMA20, EMA50, Bollinger)

FinSnap pairs trend structure (EMAs) with volatility context (Bollinger) so direction and regime can be read together.

### EMA20 / EMA50

- `EMA20` tracks short-term trend; `EMA50` tracks medium-term trend.
- Recursive EMA form:
  - `EMA_t = Price_t * k + EMA_(t-1) * (1-k)`, where `k = 2 / (period + 1)`
- Derived structure fields:
  - `ema20AboveEma50` (trend bias)
  - `ema20Trajectory` / `ema50Trajectory` (`rising`, `falling`, `flat`) from short lookback slope
  - `emaCrossLabel` (`bullish crossover`, `bearish crossover`, `converging`) from EMA spread

Why EMAs are shown:

- To separate short-vs-medium trend alignment from raw price change.
- To show whether momentum is strengthening, weakening, or flattening.

### Bollinger Bands (20-period)

- Middle line: 20-period SMA.
- Bands:
  - `std2`: middle ± `2 * stdDev20`
  - `std3`: middle ± `3 * stdDev20`
- Regime fields:
  - `bandwidth = ((std2.upper - std2.lower) / middle) * 100`
  - `percentB = (price - std2.lower) / (std2.upper - std2.lower)` (`0` lower band, `1` upper band)

Why Bollinger is shown:

- `bandwidth` helps identify compression (`tight`) vs expansion (`wide`) volatility regimes.
- `%B` helps locate price inside the current volatility envelope (lower half, mid, upper half).
- Together with EMAs, it prevents reading trend without volatility context.

## Core Flow

```text
[Collectors]
  ETH RPC block watcher (viem)
  Options chain fetcher (Yahoo Finance v7)
        |
[Analyzers]
  Whale / Gas / Volume → on-chain scores
  Weighted strike stats → options analysis
        |
[Snapshot Builder]
  Assembles FinSnap JSON — timestamped, versioned
        |
[Redis Storage]
  snap:latest  (2h TTL)
  snap:{id}    (24h TTL)
  snap:history (last 100 IDs)
        |
[Outputs]
  Web API (Hono)     → GET /snap, /snap/onchain, /snap/equities/:ticker
  Telegram bot       → /snap, /snap eth, /snap $IBIT
```

## The Snapshot Format

```jsonc
{
  "id": "01HZ...",
  "timestamp": "2026-03-13T22:00:00.000Z",
  "blockHeight": 21234567,
  "version": "1.0",
  "onChain": {
    "whale":  { "count": 3, "totalValueEth": 450, "energyScore": 35, "transfers": [...] },
    "gas":    { "averageGwei": 28.4, "trend": "stable", "congestionScore": 15 },
    "volume": { "txCount": 1820, "totalValueEth": 8200, "intensityScore": 42 },
    "networkStress": 22
  },
  "equities": {
    "IBIT": {
      "price": 55.25,
      "expirations": [
        {
          "date": "2026-04-17",
          "pcRatio": 0.72,
          "calls": { "totalVolume": 3500, "totalOI": 15000, "weightedMeanStrike": 57.5, "weightedStdStrike": 2.1 },
          "puts":  { "totalVolume": 2520, "totalOI":  9000, "weightedMeanStrike": 53.2, "weightedStdStrike": 1.8 },
          "insight": {
            "label": "put_stack",
            "skewScore": 0.34,
            "dominantSide": "puts",
            "volRatio": 1.38,
            "oiRatio": 1.42,
            "wallStrike": 53.2,
            "distanceToSpotPct": -3.7,
            "nearSpotCluster": true
          }
        }
      ]
    }
  },
  "signals": {
    "networkStress": 22,
    "whaleEnergy": 35,
    "volumeIntensity": 42,
    "gasCongestion": 15,
    "overallSentiment": 29
  },
  "eth": { "currentPrice": 3125.4, "timeframes": [...], "tsmom": { "score": 58, "label": "cautious bull" } },
  "btc": { "currentPrice": 68220.1, "timeframes": [...], "tsmom": { "score": 62, "label": "bull" } },
  "mood": { "fearGreed": { "value": 56, "label": "cautious" }, "...": "..." }
}
```

## Signal Glossary

- `pcRatio`: put volume divided by call volume for an expiry.
- `skewScore`: symmetric put/call pressure score from volume + OI ratios (`>0` put-heavy, `<0` call-heavy).
- `wallStrike`: weighted strike center of the dominant options side.
- `nearSpotCluster`: dominant wall appears close and relatively tight around spot.
- `ema20AboveEma50`: short trend above/below medium trend.
- `ema20Trajectory` / `ema50Trajectory`: recent EMA slope state (`rising`, `falling`, `flat`).
- `bollinger.bandwidth`: relative width of ±2σ band (volatility regime proxy).
- `bollinger.percentB`: price location inside the ±2σ band (`0` lower edge, `1` upper edge).
- `tsmom.score`: trend-strength blend from directional change, EMA structure/trajectory, and BB confirmation.
- `signals.overallSentiment`: aggregated 0-100 market context score from on-chain components.

## API Endpoints

| Method | Path | Description |
|  | - | -- |
| `GET` | `/` | Service info + endpoint map |
| `GET` | `/health` | Health check + last snap metadata |
| `GET` | `/snap` | Latest full snapshot |
| `GET` | `/snap/:id` | Snapshot by ID |
| `GET` | `/snap/options-insight` | Per-ticker expiry list with `pcRatio` + `insight` |
| `GET` | `/snap/onchain` | On-chain block only |
| `GET` | `/snap/equities/:ticker` | Options data for a ticker |
| `GET` | `/snaps?limit=N` | Snapshot history (default 10, max 50) |
| `POST` | `/snap/trigger` | Manually trigger a fresh snapshot |

### API Response Notes

- `eth`, `btc`, and `mood` are optional and appear when price analysis data is available.
- `equities.<ticker>.description` is optional.
- `equities.<ticker>.expirations[].insight` is optional (can be missing for legacy/partial data).
- `/snap/options-insight` intentionally returns a compact subset: expiry date, `pcRatio`, and `insight`.

## Telegram Bot Commands

| Command | Description |
| - | -- |
| `/snap` | Full snapshot summary |
| `/snap eth` | On-chain block only |
| `/snap $IBIT` | Options data for a ticker |

## Repository Layout

```text
finsnap/
├── apps/
│   ├── backend/              # Hono API + collectors + analyzers + Telegram bot
│   │   └── src/
│   │       ├── collectors/   # evm.ts, options.ts, coingecko.ts, priceCache.ts
│   │       ├── analyzers/    # onchain.ts, options.ts
│   │       ├── snapshot/     # builder.ts, types.ts
│   │       ├── storage/      # snapStore.ts (Redis)
│   │       ├── scheduler/    # cron.ts (*/10 * * * *)
│   │       └── output/       # telegram.ts, web.ts
│   └── frontend/             # Next.js dashboard (polling /snap)
├── docker-compose.yml        # backend + frontend + Redis
└── package.json              # Yarn workspaces + Turborepo
```

## Getting Started

```bash
yarn install

cp apps/backend/.env.example apps/backend/.env
# Fill in TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID

docker compose up --build
```

- **API**: `http://localhost:4000`
- **Frontend**: `http://localhost:3000`

### Run locally without Docker

```bash
# Requires a running Redis instance
yarn workspace @monorepo/backend dev
yarn workspace @monorepo/frontend dev
```

## Environment Variables (`apps/backend/.env`)

| Variable | Default | Description |
| -- | - | -- |
| `APP_PORT` | `4000` | API server port |
| `ETH_RPC_URL` | `https://eth.llamarpc.com` | Ethereum RPC endpoint |
| `WHALE_THRESHOLD_ETH` | `100` | Minimum ETH to flag as whale transfer |
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token (required) |
| `TELEGRAM_CHANNEL_ID` | — | Channel/group ID to push snaps to (required) |
| `WATCHED_TICKERS` | `IBIT` | Comma-separated options tickers |
| `SNAP_CRON` | `*/10 * * * *` | Cron schedule for automatic snaps |
| `LOG_LEVEL` | `info` | Winston log level |

## Tech Stack

- **Runtime**: Node.js 22, TypeScript
- **Web API**: Hono + @hono/node-server
- **Telegram**: Telegraf
- **On-chain**: viem (Ethereum mainnet)
- **Storage**: Redis (ioredis)
- **Scheduler**: node-cron
- **Frontend**: Next.js 15, styled-components
- **Monorepo**: Turborepo + Yarn workspaces

## Requirements

- Node >= 22.0.0
- Yarn >= 1.22.0
- Docker + Docker Compose (for Redis + full stack)
