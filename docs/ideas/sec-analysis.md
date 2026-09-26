# SEC EDGAR fundamentals — idea

Status: `idea` · Owner: none · Dependencies: none (self-contained collector + analyzer)

## Why

FinSnap is entirely price-action. Every input is an OHLCV bar or an options chain, and the
only "fundamental" figure anywhere is market cap / net assets pulled from Yahoo
(`collectors/quote.ts`). Nothing in the codebase touches a company's actual numbers.

The predecessor repo carried a small SEC module (`src/sec_analysis`, now in git history at
[`16a64da`](https://github.com/garyb9/finsnap/tree/16a64da)) that fetched 8-K / 10-K / 10-Q
filings for a ticker, parsed the filing XML, pulled the balance sheet / income statement /
cash flow tables, and dumped them to Excel. That is the seed of this idea: bring filing
_context_ into FinSnap's report and field guide, without turning FinSnap into a
fundamentals screener.

## The shape we want

A per-asset **filing panel** — not a new view, a small section wherever an asset is shown
in detail:

- recent filings by form type (8-K, 10-K, 10-Q) with filed date and a link,
- a handful of headline figures lifted from the latest 10-Q / 10-K — revenue, net income,
  total assets, cash — each with the period it covers,
- a one-line "most recent filing" note in the daily report and the field guide entry.

It stays **context, never signal** — the same posture as options positioning
(`## Options Positioning` in the README). Nothing here feeds `edgeScore`,
`opportunityScore`, or any strategy. If that ever changes it is a separate design doc.

## The part that needs thinking: don't feed EDGAR to an agent

The obvious wrong turn is "fetch the 10-K, hand the whole thing to an LLM, ask for the
highlights." Filings are enormous (10-Ks routinely exceed 100k tokens), mostly boilerplate,
and repeating that per asset per run is slow, expensive and non-reproducible.

The intended pipeline is **code parses, agent reviews**:

```
EDGAR full-text / submissions API
        │
        ▼
[collector]  ticker → CIK, filing index (form, period, filed date, URL)
        │     small, structured, cacheable — no document body
        ▼
[parser]     fetch one filing's primary document, pull the financial tables by shape
        │     deterministic, unit-tested, no model in the loop
        ▼
[extract]    a fixed set of line items → typed numbers + periods
        │
        ▼
[agent, optional]  reviews ONLY the extracted numbers + a short filing diff,
                   flags anomalies, never sees the raw document
```

So the agent's input is a **few hundred tokens of already-structured figures**, never the
filing. This mirrors how the rest of FinSnap treats external data: parse at the edge,
validate the type, store the small thing. `docs/design/backend-data-architecture.md` is the
relevant precedent.

### Two parsing strategies, in order

1. **XBRL company facts (preferred).** EDGAR's `companyfacts` API returns every reported
   concept as structured JSON — `us-gaap:Revenues`, `us-gaap:NetIncomeLoss`,
   `us-gaap:Assets`, etc., keyed by period. No HTML, no scraping, exact numbers. Coverage
   is complete for anything filed since ~2009. This should be the primary path and may
   make the legacy table-scraping unnecessary for most needs.
2. **Filing HTML tables (fallback).** The legacy `get_tables_to_dict` approach: pull the
   primary document, find `<table>` blocks whose caption matches "consolidated … balance
   sheet / income statement / cash flow", normalize `$`, commas and `(parentheses)` to
   negatives. Fussy and filing-specific; keep it only for old filings or non-XBRL filers,
   and expect to iterate on it with tests rather than trusting it blind.

### Politeness and caching

EDGAR is free and rate-limited. Build to the rules from the start:

- declare a `User-Agent` with a contact address (EDGAR requires it),
- **≤ 10 requests/second**, aggressive on-disk/DB caching (CIK maps and company facts
  barely change),
- store filings in Postgres behind a store shaped like the existing ones
  (`storage/*Store.ts`), with a retention policy,
- everything optional and off by default, like Telegram — a missing config disables the
  feature and the rest of FinSnap is unchanged.

## Open questions

1. **Line-item set.** Which handful of figures earn a place? Proposal: revenue, net income,
   diluted EPS, total assets, cash & equivalents, total debt — enough for a glance, not a
   financial model. Resist growing this without a consumer.
2. **Which assets.** Only single-name companies have filings; 21 of the 23 universe symbols
   are ETFs and crypto. The panel applies to `IBIT`-style trusts differently and to `SPY`
   not at all. Scope it to `AssetCategory.Stock` and show nothing otherwise.
3. **Freshness.** Filings arrive quarterly. A daily cron is wasteful; the pre-market report
   should read a cached snapshot and a weekly (or on-demand) job refreshes it.
4. **Agent role.** Is the optional "review the extracted numbers" step worth building at
   all, or does deterministic extraction cover it? Default to deterministic; treat the
   agent review as a stretch goal once the numbers are trustworthy.
5. **Storage vs. compute.** Persist extracted figures (queryable, historical) or re-derive
   from cached companyfacts on read? Persist — it matches every other store and keeps the
   report build fast.

## Explicit non-goals

- No fundamentals-based strategies or scoring.
- No full-document ingestion into any model.
- No balance-sheet workbench UI — this is a panel, not a view.
- No paid data provider; EDGAR is the source.

## Suggested first slice

`collectors/sec.ts` with `resolveCik(ticker)` and `fetchCompanyFacts(cik)`, a
`storage/secStore.ts`, and `analyzers/fundamentals.ts` that maps companyfacts to the fixed
line-item set above — all behind a config flag, all unit-tested against saved fixtures (no
live network in tests, matching `integration/`'s opt-in pattern). Filing HTML parsing is a
second slice, only if XBRL proves insufficient.
