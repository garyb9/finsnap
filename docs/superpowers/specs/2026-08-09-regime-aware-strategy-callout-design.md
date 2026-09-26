# Regime-Aware Strategy Callout

**Status:** Draft — pending user review
**Date:** 2026-08-09
**Backlog entry:** [ideas-backlog.md](../ideas-backlog.md) #1

## Context

FinSnap's Strategies tab and daily report rank rules by historical edge, but they don't
explain *why* a family is winning on a given asset right now. A reader sees "breakout
rules are leading XLE" without any independent signal confirming whether that's because
XLE is genuinely trending, or coincidence. This surfaced as one of several brainstormed
ideas (see the backlog) and was chosen to design first because it's self-contained,
doesn't touch the strategy interface, and fits the project's existing "explain the
number, don't just report it" pattern — the same instinct behind the field guide and the
`buildNotes` disagreement callouts in `report/consensus.ts`.

The goal: give each asset's daily report a short, independently-derived regime read
(trending vs. choppy, from trend strength — not from the strategies' own votes) and, when
one strategy family clearly dominates today's long positions, state the pairing plainly.
Purely explanatory — it must not influence `edgeScore` or `opportunityScore`. Feeding
regime into scoring would add a new tunable parameter with real overfitting risk to a
scoring system whose entire credibility rests on being conservative (see
`opportunity.ts`'s shrink-only sample-size correction) — a much bigger, separately-earned
change if ever pursued.

Scoped to the daily report only. No live-snapshot version, no leaderboard breakdown by
regime (both would need regime tagged on every historical bar across every window, not
just today — a materially larger project, left in the backlog as a possible follow-up).
No cron/scheduling changes — the scheduler is a disabled feature in this environment and
out of scope until it's turned back on.

## Architecture

```text
[daily bars] --> adx() ---------------------> computeRegime() --\
                                                                   >--> buildRegimeNote() --> notes[]
[dailyResult.strategies] --> dominantFamily() -------------------/
```

Three new pieces, each independently testable:

1. **`adx()`** — a new indicator, same shape as every other indicator in the codebase.
2. **`report/regime.ts`** — pure functions turning bars + strategy reports into a regime
   read and an optional note. No I/O, no state.
3. **One integration point in `report/builder.ts`** — wires the above into the existing
   `buildAsset()` note-building flow, following the exact pattern already used for the
   options-insight note.

## Components

### `adx(bars: Bar[], period = 14): number[]`

New function in `backtest/indicators/volatility.ts`, alongside `atr()` (shares its
`trueRange()` dependency and Wilder-smoothing style). Standard Wilder ADX:

- Directional movement (`+DM`/`-DM`) from high/low deltas.
- Wilder-smoothed `+DM`, `-DM`, and true range (same recursive smoothing already used by
  `atr()`).
- `+DI`/`-DI` from the smoothed values, `DX = 100 * |+DI - -DI| / (+DI + -DI)`.
- `ADX` = Wilder-smoothed `DX` over `period`.

Returns `NaN` through warm-up, same convention as every other indicator — strategies and
this feature alike already treat `NaN` as "no opinion."

### `report/regime.ts`

```ts
export interface Regime {
  trend: 'trending' | 'choppy';
  adx: number;
}

/** ADX >= 25 (Wilder's own threshold) reads as trending; below it, choppy. */
export function computeRegime(bars: Bar[]): Regime | undefined;

/**
 * The strategy family with the most conviction behind today's long positions.
 * Only counts strategies with a real vote (voteWeight(edgeScore) > 0, reusing
 * consensus.ts's MIN_VOTING_EDGE floor) that are currently long. Returns
 * undefined unless one family has >= 2 members and strictly more than the
 * runner-up — no ties, no single-strategy "families".
 */
export function dominantFamily(strategies: StrategyReport[]): StrategyKind | undefined;

/** e.g. "Breakout rules lead today's vote — trending (ADX 31), wide bands" */
export function buildRegimeNote(regime: Regime, kind: StrategyKind, volatilityLabel: string): string;
```

`buildRegimeNote` reuses `FAMILY_GUIDE[kind].label` from `constants/guide.ts` for the
family name rather than inventing a new label map. The note states both facts side by
side without asserting the pairing is causal or expected — a "choppy" regime with
mean-reversion leading is just as valid a note as a "trending" one with breakout leading;
the reader draws the conclusion, matching how every other report note in this codebase
sticks to stating what's true rather than editorializing.

### `report/builder.ts` integration

In `buildAsset()`, immediately after the existing options-insight note push
(`builder.ts:147-153`), same pattern — compute, and push a note only if there's something
to say:

```ts
const regime = computeRegime(daily);
const family = regime && dominantFamily(dailyResult.strategies);
if (regime && family) {
  notes.push(buildRegimeNote(regime, family, dailyFrame?.bollinger.widthLabel ?? 'unknown'));
}
```

The returned `AssetOpportunity` gains a `regime` field independent of whether a note
fired, so a reader (or the frontend, later) can see the regime read even on an asset
where no family clearly dominates:

```ts
// report/types.ts, AssetOpportunity
regime?: { trend: 'trending' | 'choppy'; adx: number };
```

Volatility is deliberately not duplicated onto `regime` — the existing
`bollinger.widthLabel` field already carries it; the note-builder just combines the two
rather than storing volatility twice on the same object.

### Frontend

No new component. `DailyReportCard.tsx` already renders `asset.notes` (line 1036) and
`asset.bollinger.widthLabel` (line 1018) inline, so the regime note appears there with no
frontend change required for the MVP. A small trend badge next to the existing width
label is a natural one-line follow-up, not part of this spec.

## Data Flow

1. `ReportBuilder.buildAsset()` already has `daily` (the bars backtests ran on) and
   `dailyResult.strategies` (this asset's `StrategyReport[]`, edge scores and today's
   signal already computed) in scope.
2. `computeRegime(daily)` runs `adx()` over the same daily bars, reads the last finite
   value. `undefined` during warm-up (new tickers, short history).
3. `dominantFamily(dailyResult.strategies)` groups already-computed strategy reports by
   `kind` — no new backtesting, just aggregation over data that exists.
4. If both resolve, one note is appended to the existing `notes` array via the same
   `notes.push(...)` call site already used for options insight — no new array, no new
   rendering path.
5. `regime` is attached to the `AssetOpportunity` return value alongside the existing
   fields.

## Error Handling

- **ADX warm-up (`NaN`):** `computeRegime` returns `undefined`; no note, no `regime`
  field on that asset. Same as how `bollinger` is already `undefined` when `dailyFrame`
  is missing.
- **No dominant family (mixed or empty votes):** `dominantFamily` returns `undefined`;
  regime is still attached (if defined) but no note fires. This is the common case, not
  an error — most days won't have one family running away with it.
- **Insufficient bars for ADX (`bars.length <= period`):** handled the same way `rsi()`
  and `atr()` already handle it — an all-`NaN` array, which `computeRegime` treats as
  warm-up.

## Testing

- **`indicators.test.ts`**: `adx()` against a known reference series (same fixture style
  already used for `rsi()`/`atr()` — a hand-checked or literature value), plus a warm-up
  length check.
- **New `regime.test.ts`** (mirrors `strategies.test.ts` conventions): `computeRegime`
  threshold behavior at the ADX=25 boundary; `dominantFamily` with synthetic
  `StrategyReport[]` fixtures covering a clear winner, a tie (expect `undefined`), a
  single-strategy "family" (expect `undefined`), and an all-flat set; `buildRegimeNote`
  output format.
- **`builder`/report integration**: one test asserting a regime note appears in `notes`
  when a family dominates a synthetic asset's strategies, and is absent when they're
  mixed or ADX is still warming up.

## Non-Goals (explicitly deferred)

- Feeding regime into `edgeScore`/`opportunityScore`.
- Live-snapshot (hourly) regime, only the daily report.
- Regime-segmented leaderboard win rates.
- Cron/scheduling wiring — disabled in this environment.
- New frontend badge component — the existing notes rendering covers the MVP.
