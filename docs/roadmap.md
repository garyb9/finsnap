# Roadmap

FinSnap today: a solo-built systematic signal engine — 23-asset universe, 20 backtested
strategies with no-lookahead execution, edge/opportunity scoring, a daily report, a live
snapshot, options context, a Telegram bot, and a 5-tab Next.js dashboard. Not hosted.
Single-tenant — one hardcoded universe, one Telegram channel, no accounts, no billing.

This roadmap sequences the path from "well-engineered personal tool" to "sellable
product," in six epics. See [marketing/go-to-market.md](./marketing/go-to-market.md) for
who buys this, what's missing besides infra, and how to market it.

Sequencing logic: **0 → 1 → 2** gets to a sellable, hosted, low-risk product without
touching auth or billing at all. **3 / 4** (multi-tenancy, paid dashboard) only make sense
once Epic 2 proves people will pay.

## Epic 0 — Harden the core

Make it trustworthy before charging for it.

- ~~Postgres adapter for the existing storage port (`storage/types.ts`) — real, queryable
  history instead of Redis-only lists.~~ Done: bar history, the options-chain archive,
  snap/report storage and the searched-ticker registry all run on Postgres now; `ioredis`
  is gone. See [design/backend-data-architecture.md](./design/backend-data-architecture.md)
  for the runtime/data-model shape and why it avoids nihongo-go's latency and duplication
  issues.
- Data-provider resilience: paid provider fallback or a hardened Yahoo session. Yahoo
  Finance from a datacenter IP is the single most likely thing to break a hosted deploy.
- Cron failure alerting — the report/sync job fails silently today; ping an ops Telegram
  channel on failure.
- Replace the in-memory sync tracker, which breaks with more than one instance.

## Epic 1 — Ship it somewhere

Decided — see [hosting.md](./hosting.md) for the full comparison and reasoning:

- Backend → **Railway** (needs a long-lived process for Telegram polling + the
  hourly snapshot cron).
- Frontend → **Vercel**, move to SSR so the dashboard isn't blank until JS boots.
- Database → **Supabase**, Postgres only (see
  [design/backend-data-architecture.md](./design/backend-data-architecture.md)).
- Fill in the empty deploy jobs in `.github/workflows/backend.yml` /
  `.github/workflows/frontend.yml` — our own CI gate, not the platforms' auto-deploy.
- Domain, health-check monitoring, a status page.

## Epic 2 — Telegram as the product (revenue #1)

Mobile-first, deliberately: the dashboard already exists and so does everyone else's —
the bot is the thing you check from your phone in ten seconds before the open, no login,
no tab to keep open. See [design/tiered-access.md](./design/tiered-access.md) for the full
spec. Summary:

- Free public channel: unmetered, headline-only "today's orders" — this is also the
  public track record from the honesty moat, so it can never be paywalled.
- Free-featured universe: unlimited `/snap` / `/report` lookups on ~15 broad symbols
  (the 4 indices + 11 sectors — the same "breadth" set the README already defines).
- Metered lookups on anything outside that set (individual stocks, macro/commodity/crypto
  names): 3 free per day, plus a smaller cumulative cap (3-5) per specific symbol before
  that symbol locks — so watching one name closely is what triggers the upsell, not
  casual daily use.
- Same answer quality at every tier. The count is gated, never the substance — see the
  honesty-moat rule against teaser degradation.
- Pay via Telegram Stars (native, no redirect) to lift the caps.
- `/subscribe`, `/status` commands.
- More strategies and, eventually, more tickers widen the free-featured/metered universes
  over time — sold as coverage, not as a strategy count (see the Tickeron caution in the
  GTM doc: "230 AI robots" reads as padding, not depth).

## Epic 3 — Multi-tenancy

- Phase 1 (ships with Epic 2): lightweight entitlement keyed on Telegram user ID only —
  a usage counter and subscription flag, no account system. This is the metering engine
  Epic 2 needs, brought forward because the bot can't charge money without it.
- Phase 2: real accounts (Telegram-linked, or email/Google once the dashboard needs the
  same lock — see open question in the design doc on auth).
- Per-user watchlist (subset of the universe to start).
- Per-user alert preferences — which strategies/assets fire notifications.
- Personal API tokens.

## Epic 4 — Paid web dashboard

- Auth (Clerk/NextAuth), Stripe billing.
- Free tier: today's verdicts, delayed or asset-limited. Paid: full detail, leaderboard,
  capital calculator.
- Reuses Epic 3's accounts.

## Epic 5 — Growth

- Public `/guide` and leaderboard as SEO/trust content — the README's methodology section
  is already most of this copy.
- Publish historical accuracy openly. For this kind of product, the receipts are the
  marketing.
- Referral / trial mechanics.

## Epic 6 — Expansion (post-PMF only)

- User-added custom tickers beyond the 23-asset universe.
- Discord / email / webhook alerts.
- "Backtest your own strategy" as a feature.
- Paper-trading tie-in.
