# Design: Backend & Data Architecture (Postgres/Supabase Path)

Companion to [../roadmap.md](../roadmap.md) Epic 0 (Postgres adapter) and
[tiered-access.md](./tiered-access.md) (the one place this project genuinely needs a
stored procedure). Written after reviewing `nihongo-go` — a sibling Telegram bot project
that hit real latency and duplication problems — specifically to avoid repeating them
here, and to explain *why* FinSnap's shape avoids their root cause rather than just
asserting it will.

## Lessons from nihongo-go

Two distinct problems, worth separating because they have different fixes:

**1. Two runtimes needing database access.** nihongo-go runs a Node worker (`src/`,
Telegraf + `pg` + TypeORM) and Supabase Edge Functions (`supabase/functions/`, Deno +
`@supabase/supabase-js`) side by side, because the scheduled send and the webhook wanted
serverless economics independent of the Node worker. Nearly every piece of interactive
logic needed a second implementation for Edge. The last two months of that project's
history are largely the retrofit: a `.types.ts` interface plus a `.node.ts` implementation
(and a matching `*Edge.ts` one under `supabase/functions/_shared/`) per repository,
migrated one feature at a time — `Migrate X onto the shared DB boundary`,
`Consolidate src/** vs supabase/functions/** boundary`, `dedupe remaining Edge
duplication`. The interface-per-repository shape it landed on is fine. What made it
expensive was building it *after* the duplication already existed, across ten-plus
features, instead of choosing one runtime up front.

**2. Per-interaction logic needing multiple dependent round trips.** Drill card
selection, neighbor navigation, and ordinal lookups each had real data dependencies (look
up the current row, then query next/prev, then handle wrap-around, then a separate
ordinal count). The commit introducing `get_jlpt_kanji_neighbor` etc. states the fix
explicitly: it folds "up to 5 sequential round trips today" into one RPC per navigation
kind. That's the right fix for genuinely dependent lookups. But the migration
(`20260706110000_drill_neighbor_rpcs.sql`) contains four ~70-line functions — one per
content type (kanji/vocab/grammar/study) — each hand-duplicating the same lookup and
wrap-around logic. That's what happens when RPC consolidation is a reactive latency patch
applied per-feature under pressure, rather than a shape decided in advance: the fix is
correct, but it multiplies once per content type instead of being written once.

Neither problem is specific to Deno or to Supabase. Both come from the same source: doing
per-request assembly of state that could have been assembled once, ahead of time.

## Why FinSnap's shape avoids both, structurally

- **No second runtime is needed.** FinSnap already requires a long-lived Node process —
  the hourly live-snapshot cron and Telegram polling both need one (see the README's
  Telegram section: polling "needs a process that stays alive"). That removes the entire
  economic argument for Edge Functions. There is nothing to keep in parity because there
  is only one implementation, ever.
- **The expensive computation is already off the request path.** The daily/bi-daily batch
  job runs every strategy across every window for every asset once, and that *is* "one
  calc per stock" — the data point every user's lookup reads from. A Telegram command
  doesn't recompute or reassemble anything; it fetches one precomputed row. nihongo-go's
  per-request logic was itself the multi-step thing (pick, check, navigate); FinSnap's
  per-request logic is "read the thing the batch job already finished."

Because of this, "one query per interaction" is true by construction, not something to
engineer under latency pressure later.

## Recommended architecture

### Runtime: no Deno, no Supabase Edge Functions

Use Supabase for exactly one thing: hosted Postgres. Connect to it directly from the
existing Hono backend using `pg` or `postgres.js` — **not** `@supabase/supabase-js`. That
client normally talks to PostgREST (an HTTP layer in front of Postgres), which exists for
browser and RLS-scoped contexts. A trusted backend server doesn't need it and shouldn't
pay for the extra hop. One runtime (the Node backend that already exists), one client
library, one implementation of every query.

If a genuinely serverless piece is wanted later for cost reasons, keep it paper-thin —
forward the request to the main backend's API rather than reimplementing logic in a
second runtime. Don't repeat the two-implementation-per-feature pattern.

### Data model: denormalized precomputed documents, not reassembled rows

The batch job writes one row per `(ticker, computed_at)`, holding the full report as
JSONB:

```sql
CREATE TABLE ticker_snapshots (
  ticker        text NOT NULL,
  computed_at   timestamptz NOT NULL,
  report        jsonb NOT NULL,       -- same shape the API already serves
  PRIMARY KEY (ticker, computed_at)
);
CREATE INDEX ON ticker_snapshots (ticker, computed_at DESC);
```

`/report TICKER` and `/snap TICKER` become:

```sql
SELECT report FROM ticker_snapshots
WHERE ticker = $1
ORDER BY computed_at DESC
LIMIT 1;
```

One query, no joins, no stored procedure — because the assembly work already happened
once, in the batch job, not per request. This is the direct antidote to nihongo-go's
drill-card/ordinal/neighbor pattern, where read-time state was spread across normalized
rows that then needed sequential fetch-then-fetch-again logic to reassemble.

A future watchlist read (multiple tickers for one user, Epic 3) stays a single query too:

```sql
SELECT DISTINCT ON (ticker) ticker, report
FROM ticker_snapshots
WHERE ticker = ANY($1::text[])
ORDER BY ticker, computed_at DESC;
```

Batch by array parameter, never loop per-ticker in application code — that loop is the
general shape of the N+1 problem, regardless of runtime.

### RPC discipline: one per atomic invariant, not one per feature

Reach for an actual Postgres function only when a real read-modify-write race exists.
FinSnap has exactly one such case today — the entitlement/quota counters in
[tiered-access.md](./tiered-access.md):

```sql
CREATE FUNCTION check_and_increment_quota(p_telegram_user_id text, p_symbol text)
RETURNS quota_result
LANGUAGE plpgsql AS $$ ... $$;
```

One function, one invariant (the counter must not race under concurrent requests from
the same user). If a second, unrelated concern shows up later, it gets its own function —
never folded into this one to save a round trip. That's the specific mistake to avoid:
nihongo-go's neighbor RPCs were correct in isolation but got duplicated per content type
instead of written as one parameterized function; the failure mode to watch for here is
the mirror image — cramming unrelated concerns into one RPC because it's already open.

### Migrations

Plain numbered `.sql` files plus a small runner that tracks applied migrations in a table
— the pattern nihongo-go already uses (`nihongo_schema_migrations`) is fine and worth
reusing as-is. No need for Supabase CLI-specific tooling (`supabase db push`, function
deploys) since there's no Edge Function to deploy alongside the schema.

### Storage growth: real, but not urgent

A JSONB report per `(ticker, day)` is a few KB. Even a few hundred tickers over several
years of daily snapshots stays in low-single-digit GB — comfortably inside an entry-tier
managed Postgres plan. The lever that matters, when it eventually does, is retention:
keep full per-strategy/per-window detail for a rolling recent window (say 90 days) and
compact older rows into the same reduced shape the API already uses as its "compact"
report — the README already draws this exact distinction for response payload size
("right to store, wrong to send by default"); the same reduction applies to long-term
storage once history is long enough to matter.

### No Redis — implemented

The backend is one persistent process (the whole reason serverless was ruled out above),
so there's no separate cache service:

- The short-TTL Yahoo Finance caches (session/crumb, quote sizes, the live 5-minute
  options-chain read, the Binance/CoinGecko cross-checks) live in **in-process memory** —
  `src/lib/memoCache.ts`, a plain `Map` with a manual expiry timestamp. Redis's advantage
  over this is letting multiple processes share a cache, which doesn't apply to a single
  hobby-scale container. The one cost: an in-process cache empties on every deploy/restart,
  so the next request after a deploy re-fetches from Yahoo once. Minor, not a correctness
  issue.
- Bar history (`bars` table, `src/storage/barsStore.ts`) is durable in Postgres, fetched
  incrementally rather than re-downloaded on every check — daily kept forever, intraday
  bounded to Yahoo's own serving window. This is the one piece that isn't just a cache:
  closed candles never change, so storing them once and only fetching the delta is a real
  win beyond what Redis's TTL model ever offered.
- The options-chain daily archive (`option_snapshots`, `src/storage/optionsStore.ts`,
  30-day retention) and the searched-ticker registry (`searched_tickers`,
  `src/storage/searchedTickerStore.ts`) are Postgres too — both need to survive a restart,
  which in-process memory can't provide.
- Snap/report storage runs through `PostgresStorage` (`src/storage/postgresStorage.ts`),
  the `StoragePort` adapter this doc anticipated — `SnapStore`/`ReportStore` needed no
  changes.
- The quota counters described below still land in Postgres, via
  `check_and_increment_quota` — one store for everything durable, rather than splitting
  durable state (subscription status) from ephemeral state (daily count) across two
  systems that then need to be kept consistent.

Revisit if the backend ever needs more than one instance — not expected before there's
real revenue to justify scaling past hobby size.

### Hosting locality

Colocating Postgres with the compute (same provider/region as wherever Epic 1 lands the
backend — Fly/Railway) shaves round-trip time further. Worth doing when convenient, but
not load-bearing: because every interaction is designed to be one query, cross-provider
network latency (usually 20-80ms to a well-connected managed Postgres) is a minor
constant, not the compounding, multiply-by-five problem nihongo-go had. Don't let this
decide the provider; let migration convenience and familiarity (Supabase, from
nihongo-go) decide it instead.

## Summary

| | nihongo-go's path | FinSnap's path |
| --- | --- | --- |
| Runtime | Node worker + Deno Edge Functions, retrofitted shared boundary | Node only, always |
| Client | `pg` (Node) + `@supabase/supabase-js` (Edge) | `pg`/`postgres.js` only, direct to Postgres |
| Per-request shape | Multi-step dependent lookups (pick, check, navigate) | Single indexed read of a precomputed document |
| RPCs | Reactive consolidation, duplicated per content type | One per genuine atomic invariant (quota counter), from the start |
| Compute cost driver | Per-request logic | Batch job, decoupled from request path |
| Long-term bottleneck | Latency (fixed reactively) | Storage (addressed via retention, not urgently) |
