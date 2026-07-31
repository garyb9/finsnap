# Design: Tiered Access (Free / Metered / Paid)

Companion to [../roadmap.md](../roadmap.md) Epic 2/3 and
[../marketing/go-to-market.md](../marketing/go-to-market.md)'s mobile-first and honesty-moat
sections. Covers the backend entitlement model, the Telegram bot flow, and how the same
lock eventually reaches the dashboard.

**Rule that overrides every other decision in this doc**: quality never varies by tier.
Free and paid users asking about the same symbol on the same day get the identical
`edgeScore` / `opportunityScore` / verdict. Only the *count* of what you can ask is gated.
This is the honesty moat applied to the pricing mechanic itself — the moment a free
answer is worse than a paid one, FinSnap is doing what the scam-recognition guides warn
about, just in the other direction.

## 1. Access tiers

| Tier | Scope | Limit |
| --- | --- | --- |
| **Public broadcast** | The daily "today's orders" channel post | Unmetered, always free — this is the public track record, it cannot be paywalled without breaking the honesty moat |
| **Free-featured universe** | On-demand `/snap` / `/report` lookups on the broad, low-specificity symbols | Unlimited |
| **Metered universe** | On-demand lookups on any other symbol (individual stocks, and macro/commodity/crypto names) | Capped, two axes — see below |
| **Subscriber** | Any symbol, any command | Unlimited |

**Proposed free-featured set** (flagged assumption — confirm before building): the 4
market indices + 11 sector ETFs already defined in the README's Universe table (`SPY`,
`QQQ`, `DIA`, `IWM`, `XLK`, `XLF`, `XLE`, `XLV`, `XLI`, `XLY`, `XLP`, `XLU`, `XLB`, `XLRE`,
`XLC` — 15 symbols). This isn't an arbitrary new list: it's the same "breadth" grouping
the product already uses, so there's one definition of "the broad market" to maintain,
not two. Crypto, commodities, currency, and bonds (`BTC-USD`, `IBIT`, `GLD`, `SLV`, `USO`,
`UNG`, `UUP`, `TLT`) fall into the metered universe, alongside any individual stock added
later under Epic 6.

**Metering has two independent axes**, both flagged assumptions to confirm — the two
numbers mentioned (3/day, and 3-5) read as two different limits, not one:

1. **Daily quota**: 3 free lookups per day across the metered universe, resetting at UTC
   midnight (or `REPORT_TIMEZONE`). Recurring, not one-time — a lifetime cap converts once
   or churns; a daily cap keeps people opening the bot repeatedly, which is more
   conversion surface, not less.
2. **Per-symbol cumulative cap**: once a specific metered symbol has been looked up 3-5
   times *total* by a user (independent of the daily quota resetting), that symbol locks
   for that user until they subscribe. This is deliberate: the user who keeps checking one
   name is the one with intent, and hitting a wall specifically on the name they're
   engaged with is a sharper upsell moment than a generic daily wall.

A user can therefore exhaust the per-symbol cap on one stock while the daily quota still
has room for a different one — both axes apply.

## 2. Identity & entitlement model

Start with **Telegram user ID as the only identity**, no separate account system:

- Matches the mobile-first bet — zero signup friction, the bot already knows who's
  talking to it.
- Telegram Stars payments are already scoped to a Telegram user, so entitlement and
  billing share one identity for free.
- Defers the harder problem (below) until the dashboard actually needs it.

```ts
interface Entitlement {
  telegramUserId: string;
  subscriptionStatus: 'free' | 'active' | 'past_due';
  subscriptionProvider?: 'stars' | 'stripe';  // whichever last set subscriptionStatus
  subscriptionExpiresAt?: string;
  dailyMeteredCount: number;
  dailyResetAt: string;              // next UTC/REPORT_TIMEZONE midnight
  perSymbolCounts: Record<string, number>;  // metered-universe symbols only
}
```

Storage: Redis for the hot daily counter (natural TTL, matches the existing cache
patterns in `storage/`), Postgres for `subscriptionStatus` and `perSymbolCounts` once the
Epic 0 Postgres adapter lands — cumulative counts and billing state need to survive a
Redis flush; the daily counter doesn't.

## 3. Backend: one shared entitlement service

A single service — not duplicated logic in the bot and the web routes — that both
surfaces call:

```
canServe(telegramUserId, symbol) -> { allowed: true }
                                   | { allowed: false, reason: 'daily_quota' | 'symbol_cap', upsell: ... }
recordUsage(telegramUserId, symbol) -> void
```

`output/telegram/commands.ts` calls this before answering `/snap SYMBOL` or
`/report SYMBOL`. Any future dashboard gating (Epic 4) calls the same service instead of
re-implementing the caps — this is the thing that keeps "same quality, same rules, every
surface" true by construction rather than by discipline.

## 4. Telegram bot flow

1. User sends `/snap NVDA`.
2. Bot resolves whether `NVDA` is free-featured or metered.
3. If metered: call `canServe`. If allowed, answer normally and `recordUsage`. If not,
   send the same-quality teaser this user already saw before (never a degraded one) plus
   an upgrade prompt:
   > You've checked NVDA 5 times — subscribe to keep tracking it, or try a free symbol:
   > SPY, XLK, XLF...
4. Upgrade prompt links a Telegram Stars invoice (`sendInvoice`, currency `XTR`,
   `subscription_period` set for recurring billing — see below).
5. On `successful_payment` / `BotSubscriptionUpdated`, mark `subscriptionStatus: 'active'`,
   `subscriptionProvider: 'stars'`, and clear caps. On a renewal failure or user
   cancellation, the same update flips it back.
6. `/status` reports current tier, daily quota remaining, and which symbols are locked.

## 5. Payment providers: Stars vs. Stripe

**Stars is the v1 provider, not a placeholder** — it's a strict subset of what's already
designed here (same Telegram-user-ID entitlement, no redirect), it supports real recurring
billing (Telegram's Bot API exposes subscription renewal/cancellation via
`BotSubscriptionUpdated`, not just one-off charges), and it's the only option Telegram/Apple
currently allow for a digital service rendered through Telegram's own in-chat payment UI —
Apple requires Stars specifically for digital goods/services on iOS, so this isn't a style
choice.

Stripe cannot sit behind Telegram's native `sendInvoice` for this product — that path is
reserved for physical goods. It can still be used, just outside Telegram's payment UI: the
bot sends a **Stripe Checkout link**, the user pays in a browser, and a Stripe webhook sets
`subscriptionStatus: 'active'`, `subscriptionProvider: 'stripe'` on the same entitlement
record. That's a deliberate, common pattern (external checkout, bot grants access) — not a
workaround.

| | Telegram Stars | Stripe (external link) |
| --- | --- | --- |
| Friction | Zero-redirect, native in-chat UI | One browser hop at purchase only |
| Recurring billing | Yes, native (`BotSubscriptionUpdated`) | Yes, native to Stripe |
| Required for | Digital goods/services via Telegram's own payment UI (iOS policy) | N/A — always optional, always external |
| Gives you | Nothing beyond pay/renew/cancel | Invoicing, coupons, tax handling, a real billing dashboard |
| When it's worth adding | Always (v1) | Once a paid dashboard (Epic 4) or non-Telegram billing needs exist |

Ship Stars only for Epic 2. Add Stripe later as a second provider once the dashboard has
its own paid tier — `subscriptionProvider` on the entitlement record is what keeps this a
one-line branch instead of a rewrite.

## 6. Reaching the dashboard (later — Epic 4)

Open question, not yet decided: **how does a dashboard visitor authenticate as the same
entitled user?**

| Option | Tradeoff |
| --- | --- |
| **Telegram Login Widget** (recommended default) | Reuses the exact identity already in the entitlement table — no account-linking problem, no second auth system. Only works for users who reach the dashboard already having used the bot, which fits the mobile-first sequencing anyway. |
| **Add Google / X OAuth** | Needed only if the dashboard should work for someone who's never touched the bot. Real cost: a second identity that has to be linked to the same `Entitlement` record, which is the part worth avoiding until there's clear demand for dashboard-only signups. |

Recommendation: ship dashboard gating with the Telegram Login Widget only. Revisit
Google/X once there's evidence people want the dashboard without ever opening the bot —
don't build account linking speculatively.

## 7. Strategy and ticker growth — guardrails, not selling points

Both roadmap axes ("we'll add more strategies," "we'll add more tickers") widen the free
and metered universes over time, but neither is the pitch by itself:

- **More strategies** improve the edge-weighted consensus behind an existing symbol's
  verdict. They are not marketed by count (see the Tickeron caution in the GTM doc — "230
  AI Robots" reads as padding once a user notices most have no edge). Every new strategy
  still goes through the same `edgeScore` sample-size/consistency shrinkage before it can
  move a verdict, so growth can't dilute the signal the way it visibly has for Tickeron.
- **More tickers** (individual stocks beyond the current 23-asset universe, Epic 6) need
  on-the-fly Yahoo fetch + a full backtest run before they can be looked up — not free
  computationally. Until that's cached/precomputed on a schedule, an arbitrary
  user-typed ticker is a real latency and Yahoo-rate-limit risk, not just a product
  decision. Worth load-testing before opening the metered universe to fully arbitrary
  symbols.

## 8. Open decisions to confirm before building

1. Exact free-featured list — proposed: the 4 indices + 11 sectors (15 symbols).
2. Daily metered quota — proposed: 3/day.
3. Per-symbol cumulative cap — proposed: 3-5, exact number TBD.
4. Price point in both Stars and USD (Stars pricing doesn't map 1:1 to a fixed USD price —
   confirm the current Stars-to-USD exchange rate before setting a number).
5. ~~Whether Stars subscriptions renew automatically~~ — resolved: yes, via
   `BotSubscriptionUpdated`, native renewal and cancellation, no manual re-subscribe flow
   needed.
6. Whether arbitrary user-typed tickers (outside the current 23) are in scope for v1 of
   this system, or deferred to Epic 6.
7. Whether to build the Stripe path at all before there's a paid dashboard tier to justify
   it, or launch Stars-only and revisit.
