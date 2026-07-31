# Go-to-Market

## Who actually pays for this

Not the retail day-trader Telegram crowd — that market is saturated with black-box
"signal" scams, and buyers there don't check methodology, so honesty isn't an advantage
in that room. The better fit is **technical / quant-curious retail traders and
developers** who want a systematic edge without building the backtest engine themselves.
That's the audience that reads "no-lookahead execution" and "annualization inferred from
timestamps, not assumed" and concludes these people know what they're doing.

## What it gives that others charge for

| Tool people pay for today                                             | What FinSnap already does instead                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| TradingView Premium (~$15-60/mo) — alerts, Pine backtests                | Backtest engine + live multi-timeframe read, no Pine script required                   |
| Portfolio123 / Composer (~$30-200/mo) — systematic strategy backtesting  | Full engine: 20 strategies × 10 windows × 23 assets, one line to add a new strategy     |
| Seeking Alpha Quant / Zacks Rank (~$200+/yr) — proprietary black-box scores | `edgeScore` / `opportunityScore`, fully documented, not a black box                  |
| Generic Telegram "signal" services (~$50-300/mo)                        | Same delivery channel, but with backtest evidence behind every call, not vibes         |

The genuine differentiator: it **shows its work**. It separates "does this rule have a
durable edge" from "should I act today," corrects for sample size and consistency, and
documents the exact bug classes (lookahead bias, granularity substitution) that make most
backtests lie. Almost nothing at this price point is this transparent about its own
methodology.

## Mobile-first is the second moat

Every product in the competitive audit below is a dashboard you have to log into —
TrendSpider, VectorVest, Danelfin, Tickeron, Composer. That's a crowded lane. FinSnap
already has a dashboard too, but the deliberate bet is that the *primary* product is the
Telegram bot: text a ticker, get a verdict, no tab left open, no session to remember. That
pairs naturally with the honesty moat rather than competing with it — a ten-second mobile
check only earns trust if the number behind it is the same rigorous one the dashboard
would have shown, which is exactly what the tiered-access design commits to (see
[design/tiered-access.md](../design/tiered-access.md)): identical answer quality at every
tier, free or paid, mobile or web.

## Competitive honesty audit

Researched six more products/categories in the space specifically for how they handle
transparency, verification, and the incentives around both. A pattern shows up: the
opacity isn't an oversight, it's load-bearing for the business model.

| Product | Claim | What's actually opaque or unverified |
| --- | --- | --- |
| **Danelfin** | "Transparent AI" — shows a Technical/Fundamental/Sentiment score breakdown per stock | The scoring *model itself* — 900+ indicators, 10,000+ features — is undisclosed. "Transparent" describes the UI attribution, not the methodology. A dashboard on top of a black box is still a black box. |
| **Tickeron** | 230+ "AI Robots," 68-83% win rates, up to 125-313% annualized returns advertised | Numbers are self-reported with no independent verification or raw trade log. Trustpilot sits at 3.4/5 with users specifically calling results fraudulent and support dismissive on cancellation. |
| **VectorVest** | Decades-old proprietary "VST rating," implies a durable edge from tenure alone | ComplaintsBoard/SmartCustomer ratings sit around 1.0-2.2/5; users report top-rated picks performing no better than random chance, and laggy signals that catch a move after it's already over. Cancellation reportedly requires a phone call or a written letter — friction as a retention strategy. |
| **Composer.trade** | Publishes its own guide, *"How to Avoid Overfit Investment Strategies"* | The best-behaved product found. Acknowledges overfitting as a real risk in writing — but leaves avoiding it as reader homework; the platform itself runs no automated sensitivity/robustness check on a user's strategy. |
| **TrendSpider** | Variance testing flags whether a backtest's return came from a few outsized wins vs. a real edge | Also a strong actor — this is a genuine anti-overfitting feature, not just a warning label. But it's a DIY workbench: $39-79+/mo buys the tool, and the user still builds and judges the strategy themselves. It has no house view and publishes no track record of its own. |
| **Telegram signal channels generally** | "Insider" or "guaranteed" signals | The scam-recognition guides all converge on the same advice: *demand a public, third-party-verified track record, like a MyFXBook link, before paying.* That's the bar the entire category fails to clear — and the one thing worth building deliberately (see below). |

Two products in that list (TrendSpider, Composer) are legitimately honest about the
overfitting problem — which matters, because the moat isn't "everyone else is lying."
It's narrower and stronger than that: **nobody in this set — honest or not — publishes a
timestamped forward track record of their own calls, shows losing strategies alongside
winning ones by default, or prices in trading costs without an opt-out.** That's the gap.

## The honesty moat

Treat "honest" as a set of product mechanisms someone can go check, not a tone of voice.
Anyone can write "we're transparent" — Danelfin already does, over an undisclosed model.
The moat only holds if each claim below is falsifiable by a stranger in under five
minutes, with no login.

### Already true, just not surfaced

These exist in the engine today and just need to be said out loud in public-facing copy:

- **The rulebook is not a score.** Every strategy is a named, described, inspectable
  function from bars to exposure (`backtest/strategies/`) — a stranger can read exactly
  what "Donchian 55/20" does, not just trust a number it produced. None of the six
  products above show their rule logic; they show an output.
- **Losers are shown, not filtered.** The Strategies leaderboard displays all 20
  strategies, including the ones that never beat buy-and-hold. Tickeron and VectorVest
  market win-rate headlines; nothing found in the research shows its losing configurations
  next to the winners by default.
- **Costs are in the number, not a toggle.** Fees and slippage (5 bps/fill) are baked into
  every backtest by default. VectorVest's specific complaint — ratings not surviving
  contact with real trading costs — is structurally the failure mode this prevents.
  Composer's overfitting guide is advice; this is enforced in code.
- **Sample-size and consistency corrections are automatic**, not a disclaimer. `edgeScore`
  shrinks back toward neutral when a result is thin or inconsistent across windows —
  Composer tells the user how to avoid overfitting by hand; this does it by default,
  every time, before the number is ever shown.
- **A bug in its own methodology is documented, not hidden.** The README states plainly
  that a naive annualization assumption once turned a 12% CAGR into 924%, and how it was
  caught. Publishing a mistake you found and fixed in yourself is a stronger trust signal
  than claiming there were never any — and it's the opposite of every "unverified 125-313%
  annualized" claim in the audit above.

### Worth building to close the gap

The one thing every competitor above lacks, and the one thing scam-recognition guides
tell buyers to demand:

- **A public, immutable, timestamped forward log.** Publish what the daily report said —
  entries, exits, verdicts — the morning it said it, before the outcome is known, on a
  channel nobody can quietly edit after the fact (a public Telegram channel, a signed
  commit, an append-only page). This is Epic 2/5 of the roadmap; it is also the entire
  honesty moat made concrete. Without it, "we show our work" is still just a claim.
- **A methodology changelog.** A running, dated list of corrections made to the scoring or
  backtest logic (the annualization fix is entry one), each with what was wrong and what
  changed. Turns "we found and fixed a bug" from a one-time README anecdote into an
  ongoing, checkable practice.
- **Raw trade-level export on request.** Anyone can pull the actual trade log behind an
  `edgeScore`, not just the summary metric. Removes the "self-reported, no raw log"
  problem that Tickeron gets called out for.
- **Self-serve cancellation, stated as a principle.** A direct, published counter-position
  to VectorVest's phone-or-letter cancellation — cheap to promise, costly for a
  black-box-and-lock-in competitor to copy without giving up the lock-in.
- **Explicit out-of-sample flagging.** When a strategy or asset is too new to have cleared
  warm-up across most windows (already a real constraint — see the IBIT `10y`/`5y`/`max`
  duplicate-window handling), say so on the card itself rather than silently shrinking the
  window set. TrendSpider does this as a manual variance test the user has to run; making
  it default and automatic goes one step further.

### What this earns, in marketing copy

Only claims that survive a stranger checking them:

- *"See every rule, including the ones that lose."* — true because of the leaderboard,
  not despite it.
- *"Every backtest already pays its own fees."* — true because costs are non-optional in
  the engine.
- *"We publish our mistakes."* — true because the changelog exists, not because it's
  asserted once in a README.
- *"Don't take our word for it — here's what we said this morning, before we knew if we
  were right."* — true only once the public forward log (above) exists. This is the
  single highest-leverage thing to ship before spending a dollar on marketing.

## What's missing (beyond infra — see [../roadmap.md](../roadmap.md) Epic 0/1)

1. **A track record.** See the honesty moat above — this is the single biggest gap and
   the highest-leverage thing to build before spending on marketing.
2. **A chosen audience.** Right now the product could pitch to retail traders, to
   quant/devs wanting the engine as infrastructure, or to a newsletter audience wanting a
   readable daily take — three different products, price points, and marketing channels.
   Serving all three at once dilutes the message. Pick one to launch with — the
   quant/dev audience is the cheapest to reach and the best match for the honesty angle.
3. **Legal exposure, not just a disclaimer.** Selling specific buy/sell/hold calls for
   money can trip the Investment Advisers Act's publisher's exclusion (which requires
   disinterested commentary of general circulation, not tailored calls), depending on
   how it's marketed and priced. Worth real review before charging money for it, not a
   README footnote.
4. **Positioning copy that doesn't exist yet.** The README is excellent but invisible to
   a buyer — none of this reasoning lives anywhere a prospective customer would see it.

## How to market it

- **Launch where the audience already values rigor**: Show HN, r/algotrading, r/quant.
  This crowd specifically appreciates the lookahead-bias and granularity-bug write-ups —
  that's free credibility no ad spend buys.
- **Build the track record in public**: a free Telegram channel or X/Twitter account
  posting only what fired each morning, timestamped, un-editable after the fact. This
  *is* the marketing — it's also Epic 2 of the roadmap, so it isn't extra work.
- **Turn the field guide into SEO**, since it's already unusually good, tying
  definitions to live numbers instead of static explainer content.
- **Write the competitive honesty audit up as content.** A post naming what Danelfin,
  Tickeron, VectorVest and Telegram signal channels don't show, next to what FinSnap does
  show, is a stronger pitch than any adjective — and the r/algotrading and Show HN
  audiences specifically reward receipts over claims.
- **Lead with "check it from your phone before the bell"**, not "systematic backtest
  engine" — the free-featured universe (broad indices/sectors, unlimited) is the hook,
  and the per-symbol metering is what a genuinely engaged user (someone tracking one name
  closely) runs into naturally, not a wall on day one.

Net: the honesty is the asset. The missing piece is proof and a chosen audience, not more
features.

## Sources

Competitor research pulled 2026-07-31:

- [Danelfin Review — WallStreetZen](https://www.wallstreetzen.com/blog/danelfin-review/)
- [Critical Review: Danelfin AI Stock Picker — AssetInsightsLab](https://assetinsightslab.com/reviews/critical-review-danelfin-ai-stock-picker)
- [Tickeron Review — WallStreetZen](https://www.wallstreetzen.com/blog/tickeron-review/)
- [Tickeron Reviews — Trustpilot](https://www.trustpilot.com/review/tickeron.com)
- [TrendSpider — Strategy Development and Backtesting Tools](https://trendspider.com/product/strategy-development-and-backtesting-tools/)
- [TrendSpider Review — StockBrokers.com](https://www.stockbrokers.com/review/tools/trendspider)
- [VectorVest Investors Reviews — ComplaintsBoard](https://www.complaintsboard.com/vectorvest-b143501)
- [VectorVest Reviews — SmartCustomer](https://www.smartcustomer.com/reviews/vectorvest.com)
- [How to Avoid Overfit Investment Strategies — Composer](https://www.composer.trade/learn/avoid-overfitting)
- [Composer Review — Wall Street Survivor](https://www.wallstreetsurvivor.com/composer-review/)
- [I Analyzed 20 Forex Signal Providers on Telegram — Medium](https://medium.com/the-investors-handbook/i-analyzed-20-forex-signal-providers-on-telegram-heres-whos-legit-9a846e7594d7)
- [Telegram Forex Signals: Are They Safe or a Scam? — Skyriss](https://www.skyriss.com/guides/telegram-forex-signals-are-they-safe)
