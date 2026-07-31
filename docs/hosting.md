# Hosting

Where each piece runs, and why — the concrete decision behind
[roadmap.md](./roadmap.md) Epic 1. Written for a hobby project: cheap and predictable
beats cheapest-on-paper, and nothing here is worth scaling past until there's real
revenue to justify it.

## The stack

| Piece | Host | Cost | Why |
| --- | --- | --- | --- |
| Backend (API + Telegram bot + scheduler, one container) | **Railway**, Hobby plan | $5/mo flat (includes $5 usage credit) | Needs a long-lived process (Telegram polling, 10-min cron) — see [design/backend-data-architecture.md](./design/backend-data-architecture.md) for why that rules out serverless. Simpler DX than Fly, and cheaper in practice: Fly's advertised cheapest machine is ~$2/mo, but real small apps land $8-25/mo once RAM, egress, and restarts are accounted for. Railway's flat $5 is a realistic floor, not a teaser price. |
| Frontend (Next.js dashboard) | **Vercel** | Free tier, likely sufficient at this scale | Already the plan — SSR fixes the blank-until-JS problem noted in the README. |
| Database | **Supabase** (Postgres only) | Free tier, likely sufficient at this scale | Used purely as hosted Postgres — no PostgREST, Auth, or Edge Functions. See [design/backend-data-architecture.md](./design/backend-data-architecture.md) for the full reasoning. |

No separate cache service — dropped Redis entirely. The backend is one persistent
process, so the short-TTL Yahoo Finance caches live in-process memory (a plain `Map` or
`lru-cache`), and the tiered-access quota counters live in Postgres alongside everything
else durable. See [design/backend-data-architecture.md](./design/backend-data-architecture.md)
for the reasoning — Redis earns its keep with multiple processes sharing state, which
this stack deliberately doesn't have.

Realistic total to start: **~$5/mo**, assuming Vercel/Supabase stay within their free
tiers — which is likely at hobby scale (a handful of users, one bot, one dashboard).

## Database: why Supabase over Railway's own Postgres

Railway offers a managed Postgres plugin too, which would sit on the same network as the
backend — no cross-provider hop at all. Worth naming why that's not the pick:

- **It isn't free.** Railway Postgres draws from the same $5 Hobby credit already paying
  for the backend container (storage at ~$0.25/GB/mo plus CPU/RAM/network on top), so
  adding it there means splitting one $5 pool across two things — real overage sooner,
  not a second free allowance. Supabase's free tier (500MB DB storage, 500MB RAM,
  unlimited API requests, no credit card, commercial use allowed) is a genuinely
  separate $0 resource. Given the actual priority — as free as possible until there's
  real ARR, across several parallel side projects — that's the deciding factor, not
  architectural tidiness.
- **The one free-tier gotcha**: Supabase pauses a free project after 7 days with zero API
  activity (data retained, needs a manual resume, and it emails a warning first). Doesn't
  bite here — the snapshot cron and bot commands hit the database constantly. Worth
  knowing if a *future* side project's Supabase DB sits untouched for a week, and worth
  noting the free tier caps out at **2 active projects**, so a third parallel hobby
  project wanting its own free Supabase DB will need to pause one of the others or pay.
- **Latency cost of not colocating is small.** Railway runs its own bare-metal network
  (Railway Metal — US, EU/Amsterdam, Southeast Asia); Supabase runs on AWS. Genuinely two
  networks, no way around a real hop. But with matched regions and a persistent pooled
  connection (the backend is one long-lived process, so it holds a connection pool
  instead of reconnecting per request — see
  [design/backend-data-architecture.md](./design/backend-data-architecture.md)), that hop
  is single-digit-to-low-tens-of-ms. Combined with the one-query-per-interaction design,
  that's imperceptible in a chat reply — nowhere near the compounding, multiply-by-five
  latency nihongo-go actually had. "Relatively good, not rust-maxxing" latency, which is
  the actual bar, not "as low as physically possible."

## Why not the alternatives

- **Fly.io** — no longer has a free tier for new orgs (killed October 2024). The
  advertised cheapest machine is misleading as a real cost signal; a real workload runs
  meaningfully more. More infra control than we need here.
- **Render / other free-tier PaaS** — free web services typically spin down on
  inactivity, which kills Telegram polling and the cron loop. Would need a paid
  always-on tier anyway, at which point it's not meaningfully cheaper than Railway.
- **Oracle Cloud "Always Free"** — genuinely free indefinitely on paper (Ampere A1 /
  AMD micro VMs), but consistently reviewed as unreliable in practice: regional
  capacity often unavailable despite being "listed" as free, real risk of resource
  reclamation or account termination with no support recourse, and it's a raw VM (you
  own TLS, patching, deploy pipeline, process supervision). Not worth it to save $5/mo
  on something that undercuts the uptime/trust story in
  [marketing/go-to-market.md](./marketing/go-to-market.md).
- **A bare VPS (Hetzner/DigitalOcean)** — cheapest raw compute per dollar, but no
  built-in health checks, restarts, or deploy pipeline. Worth revisiting only if cost
  becomes the binding constraint later, not for a first hosted deploy.
- **AWS/GCP/Azure proper** — overkill; reintroduces the serverless-vs-persistent
  split-brain this stack is deliberately avoiding.

## Also explored: Convex and Netlify

Both recommended by a friend, both worth a real look rather than a dismissal.

**Convex — not a fit for the backend, and not really a "host" for what we have.**
Convex bundles a database, serverless functions, cron, auth, and realtime subscriptions
into one TypeScript-native platform, and its free tier is genuinely generous (1M function
calls/mo, 0.5GB storage, 1GB files, crons and Node.js actions included, no card
required). But it's a different paradigm, not an alternative place to run the existing
app:

- It's its own reactive document-relational store with a TypeScript query builder — not
  SQL, not Postgres. Adopting it means rewriting the data layer in
  [design/backend-data-architecture.md](./design/backend-data-architecture.md)
  (`ticker_snapshots`, the quota-counter function) into Convex's model, not swapping a
  connection string.
- Its functions are still invocation-based, same category as Supabase Edge Functions —
  no persistent process for Telegram polling (would force webhook mode) and the same
  execution-time-budget question for a backtest compute cost that's explicitly planned to
  grow with more strategies.
- Where Convex actually shines — realtime subscriptions, live-updating collaborative
  UIs — isn't a need here. A Telegram lookup or a dashboard load is one request/response,
  not a live view multiple people are watching update in real time.

Worth remembering for a *different* future project (something realtime/collaborative by
nature), not this one.

**Netlify — a legitimate Vercel alternative for the frontend, with one concrete edge.**
Comparable free tier to Vercel (100GB bandwidth), and its Functions have the same
persistent-process limitation as Vercel's — so it's not a backend candidate any more than
Vercel was. The one real differentiator: **Netlify's free tier explicitly permits
commercial use; Vercel's Hobby tier is nominally personal/non-commercial**, which matters
once FinSnap is actually charging via the tiered-access mechanic. Worth checking Vercel's
current Hobby ToS specifically before monetizing rather than assuming it's fine — if it's
a real restriction, Netlify is a clean fallback. Sticking with Vercel for now regardless,
since it's Next.js's own platform and the SSR/ISR integration is generally more seamless
than Netlify's adapter-based support — but this is the one thing worth re-checking before
the tiered-access mechanic goes live, not before.

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

1. Region alignment — pick the Railway deploy region close to whatever region the
   Supabase project is created in, to keep the DB round-trip short (a nice-to-have per
   the backend-data-architecture doc, not load-bearing given the one-query-per-command
   design).
2. Revisit Redis if the backend ever needs more than one instance — not expected before
   real revenue justifies scaling past hobby size.
3. Verify Vercel's current Hobby-tier commercial-use terms before the tiered-access
   mechanic starts taking payments — switch the frontend to Netlify if it's a real
   restriction, since its free tier explicitly allows commercial use.
