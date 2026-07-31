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
