# FinSnap

A financial data collector and repackager that pulls from multiple sources — on-chain Ethereum activity and options chains — normalizes everything into a clean snapshot JSON, and delivers it via a web API and Telegram bot.

Not analysis. Not trading. A **snap** of the market's current state, on demand or on schedule.

---

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

---

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

---

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
          "puts":  { "totalVolume": 2520, "totalOI":  9000, "weightedMeanStrike": 53.2, "weightedStdStrike": 1.8 }
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
  }
}
```

---

## API Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/health` | Health check + last snap metadata |
| `GET` | `/snap` | Latest full snapshot |
| `GET` | `/snap/onchain` | On-chain block only |
| `GET` | `/snap/equities/:ticker` | Options data for a ticker |
| `GET` | `/snaps?limit=N` | Snapshot history (default 10, max 50) |
| `POST` | `/snap/trigger` | Manually trigger a fresh snapshot |

## Telegram Bot Commands

| Command | Description |
| ------- | ----------- |
| `/snap` | Full snapshot summary |
| `/snap eth` | On-chain block only |
| `/snap $IBIT` | Options data for a ticker |

---

## Repository Layout

```
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

---

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

---

## Environment Variables (`apps/backend/.env`)

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `APP_PORT` | `4000` | API server port |
| `ETH_RPC_URL` | `https://eth.llamarpc.com` | Ethereum RPC endpoint |
| `WHALE_THRESHOLD_ETH` | `100` | Minimum ETH to flag as whale transfer |
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token (required) |
| `TELEGRAM_CHANNEL_ID` | — | Channel/group ID to push snaps to (required) |
| `WATCHED_TICKERS` | `IBIT` | Comma-separated options tickers |
| `SNAP_CRON` | `*/10 * * * *` | Cron schedule for automatic snaps |
| `LOG_LEVEL` | `info` | Winston log level |

---

## Tech Stack

- **Runtime**: Node.js 22, TypeScript
- **Web API**: Hono + @hono/node-server
- **Telegram**: Telegraf
- **On-chain**: viem (Ethereum mainnet)
- **Storage**: Redis (ioredis)
- **Scheduler**: node-cron
- **Frontend**: Next.js 15, styled-components
- **Monorepo**: Turborepo + Yarn workspaces

---

## Requirements

- Node >= 22.0.0
- Yarn >= 1.22.0
- Docker + Docker Compose (for Redis + full stack)
