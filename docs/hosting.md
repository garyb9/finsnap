# Hosting

Where each piece runs, and why — the concrete decision behind
[roadmap.md](./roadmap.md) Epic 1. Written for a hobby project, run alongside several
other side projects: **$0-5/mo baseline beats cheapest-on-paper**, and nothing here is
worth scaling past until there's real revenue to justify it.

## The stack

| Piece                                                   | Host                         | Cost       |
| ------------------------------------------------------- | ---------------------------- | ---------- |
| Backend (API + Telegram bot + scheduler, one container) | **Railway**, Hobby plan      | $5/mo flat |
| Frontend (Next.js dashboard)                            | **Vercel**                   | Free tier  |
| Database                                                | **Supabase** (Postgres only) | Free tier  |

No separate cache service — Redis was evaluated, dropped, and the code has caught up:
`ioredis` is gone from the backend. The backend is one persistent process, so the
short-TTL Yahoo Finance caches live in in-process memory, and everything durable (bar
history, the options-chain archive, snap/report storage, the searched-ticker registry, and
eventually the tiered-access quota counters) lives in Postgres. See
[design/backend-data-architecture.md](./design/backend-data-architecture.md#no-redis--implemented).

Realistic total to start: **~$5/mo**.

## Backend host comparison

Everything here was checked against the same requirement:
[design/backend-data-architecture.md](./design/backend-data-architecture.md) rules out
serverless because FinSnap needs a process that stays alive continuously — Telegram
polling holds an open connection, and the hourly snapshot cron needs somewhere to
tick. Anything invocation-based (serverless functions, edge compute) fails this
regardless of how good its free tier looks, unless Telegram is rebuilt around webhook
mode and the batch job is decomposed to fit an execution-time budget — both real,
avoidable rewrites.

| Host                                        | Cost                                                                                                   | Always-on?                                                                                    | Fits our shape?                                          | Verdict                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Railway**                                 | $5/mo flat (Hobby, $5 usage credit included)                                                           | Yes                                                                                           | Yes — deploys the existing Dockerfile unchanged          | **Picked.** Cheaper in practice than Fly once real usage is counted, easiest DX, zero rewrite.                                                                                                                                                                                                                                                                                                                       |
| **Coolify + Hetzner**                       | ~$6/mo for a VPS (e.g. Hetzner CCX13) that can run several apps at once                                | Yes                                                                                           | Yes — same Docker container, just self-managed           | **Genuine alternative, not a downgrade.** One box reportedly runs 8 apps/2 DBs/3 services comfortably. Cost is a wash against Railway for FinSnap _alone_, but wins as soon as a second side project shares the box — Railway's $5/mo is per project, this isn't. Trade: you own VPS-level OS upkeep; Coolify itself handles git-push deploys and automatic Let's Encrypt SSL, which is what a bare VPS was missing. |
| Fly.io                                      | ~$2/mo advertised, $8-25/mo realistic                                                                  | Yes                                                                                           | Yes                                                      | No free tier for new orgs since Oct 2024; more infra control than needed here.                                                                                                                                                                                                                                                                                                                                       |
| Render (free tier)                          | $0                                                                                                     | **No** — spins down after 15 min idle                                                         | No                                                       | Kills Telegram polling and the cron loop outright. Paid always-on tier isn't meaningfully cheaper than Railway.                                                                                                                                                                                                                                                                                                      |
| Koyeb                                       | Free tier closed to new signups (Feb 2026, acquired by Mistral AI, pivoted to AI-inference/enterprise) | Even when available: **No** — scale-to-zero after 1hr idle, non-negotiable                    | No                                                       | Dead end for a new user regardless of fit.                                                                                                                                                                                                                                                                                                                                                                           |
| Oracle Cloud "Always Free"                  | $0, genuinely indefinite on paper                                                                      | Yes, in theory                                                                                | Yes, in theory                                           | Consistently reviewed as unreliable in practice — capacity often unavailable despite being "listed" free, real risk of reclamation/account termination, and it's a raw VM (own TLS/patching/deploy pipeline). Undercuts the uptime story in the go-to-market doc to save $5/mo.                                                                                                                                      |
| Bare VPS (Hetzner/DigitalOcean, no Coolify) | ~$4.50/mo+                                                                                             | Yes                                                                                           | Yes                                                      | Cheapest raw compute, but no built-in health checks, restarts, or deploy pipeline — this is exactly what Coolify adds on top for a couple dollars more.                                                                                                                                                                                                                                                              |
| AWS/GCP/Azure (ECS/Cloud Run/etc.)          | Variable, generally more                                                                               | Depends on config                                                                             | Reintroduces the serverless-vs-persistent split-brain    | Overkill for a solo hobby project's first deploy.                                                                                                                                                                                                                                                                                                                                                                    |
| Cloudflare Workers                          | $0 (100K req/day, 10ms CPU/invocation free; 30s CPU cap even paid)                                     | **No** — no persistent process at all, isolates get evicted                                   | No                                                       | Most restrictive option evaluated. `pg` needs a new connection per request (Hyperdrive/PgBouncer required to avoid exhausting Postgres). Cloudflare's own docs steer long-running work toward Workflows/Queues, not a single script — more re-architecture than Convex, for a tighter compute ceiling.                                                                                                               |
| Convex                                      | $0 (1M calls/mo, 0.5GB storage) then $25/developer/mo                                                  | **No** — but its Node actions get a real 10-min/512MB budget, generous relative to the others | Partial — webhook mode works, batch job fits comfortably | Not a backend "host" — it's a different platform. Its own reactive document store + TypeScript query builder, not Postgres; adopting it means porting the existing collectors/analyzers/backtest code into its query/mutation/action separation (mutations can't fetch, actions can't write directly) for no functional gain FinSnap needs (no realtime requirement). Real one-time porting cost, not a hidden bill. |

**Open fork, not fully closed**: Railway is the default for now (already deploys the
existing Dockerfile with zero changes). Coolify + Hetzner is the one option here that
could genuinely beat it on cost — specifically once a second parallel side project needs
hosting too, since the VPS cost is shared rather than per-project. Worth revisiting the
moment there's a second project to host.

## Database comparison

| Provider                                             | Cost                                                                                                                                     | Free-tier gotcha                                                                     | Verdict                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase**                                         | $0 (500MB DB, 500MB RAM, unlimited API requests, no card, commercial use allowed)                                                        | Pauses after **7 days** of zero API activity (emails a warning first, data retained) | **Picked.** The 7-day threshold never triggers here — the snapshot cron and bot hit the DB constantly. Caps at 2 active free projects account-wide, worth watching as more side projects spin up.                                         |
| Railway Postgres                                     | Not free — draws from the same $5 Hobby credit as the backend (~$0.25/GB/mo storage + CPU/RAM/network), or $10-40/mo as a sized instance | N/A                                                                                  | Would sit on the same network as the backend (no cross-provider hop), but costs real money and competes with the backend's own credit rather than adding a second free allowance. Not worth it for a latency win of a few ms — see below. |
| Neon (serverless Postgres)                           | $0 (0.5GB storage, 100 compute-hrs/mo)                                                                                                   | Autosuspends after **5 minutes** of inactivity                                       | **Worse fit than Supabase specifically for our cadence.** The snapshot cron runs hourly — far longer than Neon's 5-minute suspend window — so the DB would cold-start (500ms-1s) on every cron cycle. Not a lateral option here.          |
| Convex (as a DB, if the whole platform were adopted) | $0 then $25/developer/mo                                                                                                                 | N/A                                                                                  | Only relevant if adopting Convex wholesale — see backend table. Not a drop-in Postgres replacement.                                                                                                                                       |

**Cross-provider latency (Railway ↔ Supabase)**: real but small. Railway runs its own
bare-metal network (Railway Metal — US/EU-Amsterdam/Southeast Asia); Supabase runs on
AWS — genuinely two networks, no way around some hop. With matched regions and a
persistent pooled connection (the backend is one long-lived process, so it holds a
connection pool instead of reconnecting per request), that hop lands
single-digit-to-low-tens-of-ms — imperceptible given the one-query-per-interaction design
in [design/backend-data-architecture.md](./design/backend-data-architecture.md). The bar
was "relatively good, not rust-maxxing," not "as low as physically possible," and this
clears it without paying to colocate.

## Frontend comparison

| Host             | Cost                               | Commercial use on free tier?                                                                                              | Next.js support                                                                           | Verdict                                                                                                       |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Vercel**       | Free tier                          | Nominally personal/non-commercial (Hobby plan) — worth verifying before the tiered-access mechanic starts taking payments | Native — Vercel built Next.js, most seamless SSR/ISR                                      | **Picked, for now.** Best integration quality; the ToS point is the one thing to re-check before monetizing.  |
| Netlify          | Free tier, ~100GB bandwidth        | **Explicitly allowed**                                                                                                    | Adapter-based, generally solid but not first-party                                        | Clean fallback if Vercel's commercial-use terms turn out to be a real restriction.                            |
| Cloudflare Pages | Free tier, **unlimited bandwidth** | Allowed                                                                                                                   | Adapter-based (`@cloudflare/next-on-pages`), some rougher edges on newer Next.js features | Best free-tier bandwidth of the three; worth it if bandwidth ever becomes the binding constraint, not before. |

## Redis: dropped

Evaluated for the options/price caches and the tiered-access quota counters, then cut
entirely. The backend is one persistent process — in-process memory covers the caches,
Postgres covers the durable counters — so there's no multi-process state to share, which
is the only thing Redis would actually be buying here. Full reasoning in
[design/backend-data-architecture.md](./design/backend-data-architecture.md#no-redis).

## Deploy: our own CI, not the platform's convenience path

Railway (like Fly) offers a "connect your GitHub repo, auto-deploy on push" flow. Not
using it — deploys go through our own pipeline instead, so nothing ships without
passing checks first:

- **Backend**: fill in the existing empty deploy job in `.github/workflows/backend.yml`
  to run `yarn ci` (build + lint + test), then call Railway's CLI/GitHub Action (or API)
  to deploy only on success. Gated, not automatic-on-push.
- **Frontend**: keep Vercel's native Git integration as-is — a Next.js build has less
  that can go wrong silently, and Vercel's own preview-deploy-per-PR flow is a genuine
  benefit worth keeping rather than routing around.

## Open decisions

1. **Railway vs. Coolify + Hetzner** for the backend — Railway is the default; revisit
   once a second side project needs hosting, since that's when Coolify's shared-box
   economics start winning on cost.
2. Region alignment — pick the Railway (or Hetzner) region close to whatever region the
   Supabase project is created in, to keep the DB round-trip short. Not load-bearing
   given the one-query-per-command design, just a nice-to-have.
3. Revisit Redis if the backend ever needs more than one instance — not expected before
   real revenue justifies scaling past hobby size.
4. Verify Vercel's current Hobby-tier commercial-use terms before the tiered-access
   mechanic starts taking payments — switch the frontend to Netlify if it's a real
   restriction.
