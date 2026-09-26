# Regime-Aware Strategy Callout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each asset in the daily report an independently-derived regime read (trending vs. choppy, from a new ADX indicator) and, when one strategy family clearly dominates today's long positions, a plain-language note explaining the pairing.

**Architecture:** A new `adx()` indicator alongside the existing `atr()`; a new `report/regime.ts` module of pure functions (`computeRegime`, `dominantFamily`, `buildRegimeNote`) with no I/O; one integration point in `report/builder.ts`'s existing `buildAsset()` note-building flow, following the exact pattern already used for the options-insight note.

**Tech Stack:** TypeScript, Vitest, existing `backtest/indicators` and `report/*` modules.

## Global Constraints

- ADX ≥ 25 reads as `trending`, below it as `choppy` — Wilder's own threshold, single cutoff, no middle band.
- Purely explanatory: must not read into or write to `edgeScore` or `opportunityScore` anywhere.
- Daily report only. No live-snapshot (hourly) version, no leaderboard/regime breakdown, no cron/scheduler changes — scheduler is a disabled feature in this environment.
- `NaN`/undefined during warm-up or ambiguous cases means "no opinion" — omit the field/note, never guess.
- Reuse existing logic, don't duplicate it: `voteWeight()` from `report/consensus.ts` for vote-worthiness, `FAMILY_GUIDE[kind].label` from `constants/guide.ts` for family display names, `pickBand(BANDWIDTH_BANDS, ...)` from `constants/display.ts` for the volatility label (already computed once, shared between the existing `bollinger.widthLabel` field and the new regime note).
- Spec: `docs/superpowers/specs/2026-08-09-regime-aware-strategy-callout-design.md`. Backlog entry: `docs/ideas-backlog.md` #1.

---

## Task 1: ADX indicator

**Files:**
- Modify: `apps/backend/src/backtest/indicators/volatility.ts`
- Test: `apps/backend/src/__tests__/indicators.test.ts`

**Interfaces:**
- Consumes: `trueRange(bars: Bar[]): number[]` (already exported from `volatility.ts`), `Bar` type from `../../collectors/types`.
- Produces: `adx(bars: Bar[], period = 14): number[]` — exported from `volatility.ts`, and therefore from the `backtest/indicators` barrel (`indicators/index.ts` already does `export * from './volatility'`). Same-length output as `bars`, `NaN` through warm-up, values in `[0, 100]` once defined.

- [ ] **Step 1: Write the failing tests**

Add to `apps/backend/src/__tests__/indicators.test.ts` (near the existing `describe('atr', ...)` block — check the top of the file for its existing imports from `../backtest/indicators` and add `adx` to that import list, and `barsFromCloses`/`risingCloses`/`oscillatingCloses` are already imported from `./helpers/bars`):

```ts
describe('adx', () => {
  it('stays NaN through warm-up (2 * period - 1 bars)', () => {
    const values = adx(barsFromCloses(risingCloses(60)), 14);
    expect(values.slice(0, 27).every(Number.isNaN)).toBe(true);
    expect(Number.isFinite(values.at(-1))).toBe(true);
  });

  it('reads higher on a steadily trending series than a choppy one', () => {
    const trending = adx(barsFromCloses(risingCloses(120, 100, 1)), 14);
    const choppy = adx(barsFromCloses(oscillatingCloses(120, 100, 2, 10)), 14);
    expect(trending.at(-1)!).toBeGreaterThan(25);
    expect(trending.at(-1)!).toBeGreaterThan(choppy.at(-1)!);
  });

  it('returns all-NaN when there are not enough bars', () => {
    const values = adx(barsFromCloses(risingCloses(20)), 14);
    expect(values.every(Number.isNaN)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn workspace @monorepo/backend test indicators.test.ts`
Expected: FAIL — `adx` is not exported from `../backtest/indicators`.

- [ ] **Step 3: Implement `adx()`**

Add to `apps/backend/src/backtest/indicators/volatility.ts`, after the existing `atr()` function:

```ts
/**
 * Wilder's ADX(period) — trend strength, independent of direction. Built the
 * same way as `atr()` above: seeded from a plain average over the first
 * `period` bars, then Wilder-smoothed one bar at a time. ADX itself is a
 * second layer of the same smoothing applied to DX, so it only becomes
 * defined after `2 * period - 1` bars.
 */
export function adx(bars: Bar[], period = 14): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  if (bars.length <= period * 2) return out;

  const tr = trueRange(bars);
  const plusDM = new Array<number>(bars.length).fill(0);
  const minusDM = new Array<number>(bars.length).fill(0);

  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  let avgTR = tr.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;
  let avgPlusDM = plusDM.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;
  let avgMinusDM = minusDM.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;

  const dx = new Array<number>(bars.length).fill(NaN);
  const recordDx = (i: number) => {
    const plusDI = avgTR > 0 ? (avgPlusDM / avgTR) * 100 : 0;
    const minusDI = avgTR > 0 ? (avgMinusDM / avgTR) * 100 : 0;
    const sum = plusDI + minusDI;
    dx[i] = sum > 0 ? (Math.abs(plusDI - minusDI) / sum) * 100 : 0;
  };
  recordDx(period);

  for (let i = period + 1; i < bars.length; i++) {
    avgTR = (avgTR * (period - 1) + tr[i]) / period;
    avgPlusDM = (avgPlusDM * (period - 1) + plusDM[i]) / period;
    avgMinusDM = (avgMinusDM * (period - 1) + minusDM[i]) / period;
    recordDx(i);
  }

  // ADX is a Wilder-smoothed average of DX, seeded once a full `period` of DX
  // values exists — indices `period` through `2 * period - 1`.
  let avgDx = dx.slice(period, period * 2).reduce((s, v) => s + v, 0) / period;
  out[period * 2 - 1] = avgDx;

  for (let i = period * 2; i < bars.length; i++) {
    avgDx = (avgDx * (period - 1) + dx[i]) / period;
    out[i] = avgDx;
  }

  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn workspace @monorepo/backend test indicators.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and commit**

There is no dedicated `typecheck` script — `build` runs `tsc` and doubles as one.

Run: `yarn workspace @monorepo/backend build`
Expected: no errors.

```bash
git add apps/backend/src/backtest/indicators/volatility.ts apps/backend/src/__tests__/indicators.test.ts
git commit -m "feat: add Wilder ADX indicator"
```

---

## Task 2: Regime type and `report/regime.ts` module

**Files:**
- Modify: `apps/backend/src/report/types.ts`
- Create: `apps/backend/src/report/regime.ts`
- Test: `apps/backend/src/__tests__/regime.test.ts`

**Interfaces:**
- Consumes: `adx()` from Task 1 (`../backtest/indicators`); `voteWeight(edgeScore: number): number` from `./consensus`; `FAMILY_GUIDE` from `../constants/guide`; `StrategyKind`, `type StrategyReport` from `../backtest/types`; `Bar` from `../collectors/types`.
- Produces:
  - `Regime` interface in `report/types.ts`: `{ trend: 'trending' | 'choppy'; adx: number }`.
  - `computeRegime(bars: Bar[]): Regime | undefined`
  - `dominantFamily(strategies: StrategyReport[]): StrategyKind | undefined`
  - `buildRegimeNote(regime: Regime, kind: StrategyKind, volatilityLabel: string): string`
  - all exported from `report/regime.ts`, consumed by Task 3.

- [ ] **Step 1: Add the `Regime` type and the `regime` field on `AssetOpportunity`**

In `apps/backend/src/report/types.ts`, add near the other small report-domain interfaces (e.g. next to wherever `Consensus` is defined — check the file to place it consistently):

```ts
/** Independently-derived read of whether an asset is currently trending or choppy. */
export interface Regime {
  trend: 'trending' | 'choppy';
  adx: number;
}
```

Then add one field to the existing `AssetOpportunity` interface, directly below the existing `bollinger` field:

```ts
  bollinger?: { bandwidth: number; percentB: number; widthLabel: string; positionLabel: string };
  /** Independently-derived trend/choppy read — see `report/regime.ts`. Purely explanatory, never feeds edgeScore/opportunityScore. */
  regime?: Regime;
```

This step has no independent test — it's a type-only change, verified by Step 5's typecheck plus every subsequent step that uses `Regime`.

- [ ] **Step 2: Write the failing tests**

Create `apps/backend/src/__tests__/regime.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeRegime, dominantFamily, buildRegimeNote } from '../report/regime';
import { SignalAction, StrategyKind, type StrategyReport } from '../backtest/types';
import { barsFromCloses, oscillatingCloses, risingCloses } from './helpers/bars';

function makeReport(
  id: string,
  edgeScore: number,
  kind: StrategyKind,
  target: number
): StrategyReport {
  return {
    strategyId: id,
    name: id,
    kind,
    description: '',
    params: {},
    signal: {
      action: target > 0 ? SignalAction.Hold : SignalAction.StayOut,
      target,
      previous: target,
      barsInState: 5,
      lastClose: 100,
      lastBarTime: 0,
    },
    windows: [],
    edgeScore,
    opportunityScore: 50,
    rationale: '',
  };
}

describe('computeRegime', () => {
  it('reads trending on a steadily trending series', () => {
    const regime = computeRegime(barsFromCloses(risingCloses(120, 100, 1)));
    expect(regime?.trend).toBe('trending');
    expect(regime?.adx).toBeGreaterThanOrEqual(25);
  });

  it('returns undefined during ADX warm-up', () => {
    expect(computeRegime(barsFromCloses(risingCloses(20)))).toBeUndefined();
  });
});

describe('dominantFamily', () => {
  it('picks the family with the most long, edge-qualified votes', () => {
    const strategies = [
      makeReport('t1', 70, StrategyKind.Trend, 1),
      makeReport('t2', 65, StrategyKind.Trend, 1),
      makeReport('m1', 60, StrategyKind.MeanReversion, 1),
    ];
    expect(dominantFamily(strategies)).toBe(StrategyKind.Trend);
  });

  it('ignores strategies below the voting edge floor', () => {
    const strategies = [
      makeReport('t1', 40, StrategyKind.Trend, 1),
      makeReport('t2', 40, StrategyKind.Trend, 1),
    ];
    expect(dominantFamily(strategies)).toBeUndefined();
  });

  it('ignores strategies that are currently flat', () => {
    const strategies = [
      makeReport('t1', 70, StrategyKind.Trend, 0),
      makeReport('t2', 70, StrategyKind.Trend, 0),
    ];
    expect(dominantFamily(strategies)).toBeUndefined();
  });

  it('requires at least two members in the leading family', () => {
    const strategies = [makeReport('t1', 70, StrategyKind.Trend, 1)];
    expect(dominantFamily(strategies)).toBeUndefined();
  });

  it('returns undefined on a tie', () => {
    const strategies = [
      makeReport('t1', 70, StrategyKind.Trend, 1),
      makeReport('t2', 70, StrategyKind.Trend, 1),
      makeReport('m1', 70, StrategyKind.MeanReversion, 1),
      makeReport('m2', 70, StrategyKind.MeanReversion, 1),
    ];
    expect(dominantFamily(strategies)).toBeUndefined();
  });

  it('excludes the benchmark from consideration', () => {
    const strategies = [
      makeReport('bh', 90, StrategyKind.Benchmark, 1),
      makeReport('t1', 70, StrategyKind.Trend, 1),
      makeReport('t2', 65, StrategyKind.Trend, 1),
    ];
    expect(dominantFamily(strategies)).toBe(StrategyKind.Trend);
  });
});

describe('buildRegimeNote', () => {
  it('states the family, trend, and volatility plainly', () => {
    const note = buildRegimeNote({ trend: 'trending', adx: 31 }, StrategyKind.Breakout, 'wide');
    expect(note).toBe("Breakout rules lead today's vote — trending (ADX 31), wide bands");
  });
});

describe('composed end to end', () => {
  it('produces a note when a trending regime pairs with a dominant family', () => {
    const bars = barsFromCloses(risingCloses(120, 100, 1));
    const strategies = [
      makeReport('brk1', 70, StrategyKind.Breakout, 1),
      makeReport('brk2', 65, StrategyKind.Breakout, 1),
      makeReport('mr1', 55, StrategyKind.MeanReversion, 0),
    ];

    const regime = computeRegime(bars);
    const family = regime && dominantFamily(strategies);
    expect(regime).toBeDefined();
    expect(family).toBe(StrategyKind.Breakout);

    const note = regime && family && buildRegimeNote(regime, family, 'wide');
    expect(note).toContain('Breakout');
    expect(note).toContain('trending');
  });

  it('produces no family and no note on a mixed, unresolved vote', () => {
    const bars = barsFromCloses(oscillatingCloses(120, 100, 2, 10));
    const strategies = [
      makeReport('a', 70, StrategyKind.Trend, 1),
      makeReport('b', 70, StrategyKind.MeanReversion, 1),
    ];
    expect(dominantFamily(strategies)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn workspace @monorepo/backend test regime.test.ts`
Expected: FAIL — `../report/regime` does not exist.

- [ ] **Step 4: Implement `report/regime.ts`**

Create `apps/backend/src/report/regime.ts`:

```ts
import type { Bar } from '../collectors/types';
import { adx } from '../backtest/indicators';
import { StrategyKind, type StrategyReport } from '../backtest/types';
import { FAMILY_GUIDE } from '../constants/guide';
import { voteWeight } from './consensus';
import type { Regime } from './types';

const ADX_PERIOD = 14;
const TRENDING_THRESHOLD = 25;
/** A "dominant" family needs at least this many qualifying, long strategies. */
const MIN_FAMILY_SIZE = 2;

/**
 * Trend-strength read for an asset, independent of what any strategy is
 * saying — so a strategy family that happens to be winning can be checked
 * against it rather than explained by it circularly.
 */
export function computeRegime(bars: Bar[]): Regime | undefined {
  const values = adx(bars, ADX_PERIOD);
  const last = values.at(-1);
  if (last === undefined || !Number.isFinite(last)) return undefined;

  return { trend: last >= TRENDING_THRESHOLD ? 'trending' : 'choppy', adx: Math.round(last) };
}

/**
 * The strategy family with the most conviction behind today's long
 * positions — only strategies with a real vote (see `voteWeight` in
 * `consensus.ts`) that are currently long. `undefined` unless one family
 * has at least `MIN_FAMILY_SIZE` members and strictly more than the
 * runner-up, so a single strategy or a tie never reads as "dominant."
 */
export function dominantFamily(strategies: StrategyReport[]): StrategyKind | undefined {
  const counts = new Map<StrategyKind, number>();

  for (const s of strategies) {
    if (s.kind === StrategyKind.Benchmark) continue;
    if (voteWeight(s.edgeScore) <= 0) continue;
    if (s.signal.target <= 0) continue;
    counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const runnerUpCount = sorted[1]?.[1] ?? 0;

  if (!top || top[1] < MIN_FAMILY_SIZE || top[1] <= runnerUpCount) return undefined;
  return top[0];
}

/**
 * States the regime and the leading family side by side without asserting
 * the pairing is expected — a choppy regime with mean-reversion leading is
 * just as valid a note as a trending one with breakout leading.
 */
export function buildRegimeNote(regime: Regime, kind: StrategyKind, volatilityLabel: string): string {
  return (
    `${FAMILY_GUIDE[kind].label} rules lead today's vote — ` +
    `${regime.trend} (ADX ${regime.adx}), ${volatilityLabel} bands`
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn workspace @monorepo/backend test regime.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck and commit**

```bash
git add apps/backend/src/report/types.ts apps/backend/src/report/regime.ts apps/backend/src/__tests__/regime.test.ts
git commit -m "feat: add regime classification and dominant-family note builder"
```

---

## Task 3: Wire into the daily report

**Files:**
- Modify: `apps/backend/src/report/builder.ts`
- Modify: `apps/backend/src/report/compact.ts`
- Test: `apps/backend/src/__tests__/report.test.ts`

**Interfaces:**
- Consumes: `computeRegime`, `dominantFamily`, `buildRegimeNote` from `./regime` (Task 2); existing `AssetOpportunity.regime?: Regime` field (Task 2).
- Produces: `AssetOpportunity.regime` populated on every asset in `DailyReport`; a regime note appended to `AssetOpportunity.notes` when applicable; `CompactAsset.regime` passed through unchanged (same pattern as the existing `tsmom`/`momentum` passthrough).

- [ ] **Step 1: Write the failing test for compact passthrough**

In `apps/backend/src/__tests__/report.test.ts`, inside the existing `describe('compactAsset', ...)` block (near the existing `it('drops bollinger when the asset has none', ...)`-style test around line 213), add:

```ts
  it('passes regime through unchanged', () => {
    const asset = makeAsset({ regime: { trend: 'trending', adx: 31 } });
    expect(compactAsset(asset).regime).toEqual({ trend: 'trending', adx: 31 });
  });

  it('has no regime when the asset has none', () => {
    expect(compactAsset(makeAsset()).regime).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @monorepo/backend test report.test.ts`
Expected: FAIL — `CompactAsset` has no `regime` property (TypeScript error) or the assertion fails.

- [ ] **Step 3: Add `regime` to `CompactAsset`**

In `apps/backend/src/report/compact.ts`, add one field to the `CompactAsset` interface, directly below the existing `bollinger` field:

```ts
  bollinger?: AssetOpportunity['bollinger'];
  regime?: AssetOpportunity['regime'];
```

And one line in `compactAsset()`, directly below the existing `bollinger:` mapping (after its closing `}),`):

```ts
    options: asset.options,
    regime: asset.regime,
    notes: asset.notes,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @monorepo/backend test report.test.ts`
Expected: PASS

- [ ] **Step 5: Wire regime computation into `buildAsset()`**

In `apps/backend/src/report/builder.ts`:

Add to the existing import from `./regime` — it doesn't exist yet, so add a new import line near the other `report/*` imports (alongside `import { buildNotes, computeConsensus } from './consensus';`):

```ts
import { buildRegimeNote, computeRegime, dominantFamily } from './regime';
```

In `buildAsset()`, the existing code around the options-insight note and the `bollinger` field in the return statement currently reads:

```ts
    const options = spec.hasOptions ? await this.buildOptionsContext(spec) : undefined;
    if (options?.insight && options.insight.label !== 'balanced') {
      const { dominantSide, wallStrike, distanceToSpotPct } = options.insight;
      notes.push(
        `options ${dominantSide} stacking near $${wallStrike.toFixed(2)} ` +
          `(${fmtPct(distanceToSpotPct)} vs spot)`
      );
    }

    return {
      symbol: spec.symbol,
      label: spec.label,
      assetClass: spec.assetClass,
      category: spec.category,
      lastClose: dailyResult.lastClose,
      lastChangePct: dailyResult.lastChangePct,
      size,
      lastBarTime: dailyResult.lastBarTime,
      historyStart: dailyResult.historyStart,
      barsAnalyzed: dailyResult.barsAnalyzed,
      consensus,
      daily: dailyResult.strategies,
      intraday: intradayResult?.strategies ?? [],
      tsmom: { score: tsmom.score, label: tsmom.label },
      momentum: analysis.marketMomentum,
      bollinger: dailyFrame && {
        bandwidth: dailyFrame.bollinger.bandwidth,
        percentB: dailyFrame.bollinger.percentB,
        widthLabel: pickBand(BANDWIDTH_BANDS, dailyFrame.bollinger.bandwidth).label,
        positionLabel: pickBand(PERCENT_B_BANDS, dailyFrame.bollinger.percentB).label,
      },
      options,
      notes,
    };
```

Replace it with (the only changes: a `widthLabel` variable pulled out so it's computed once instead of inline, a regime block before `return`, and `regime` added to the returned object):

```ts
    const options = spec.hasOptions ? await this.buildOptionsContext(spec) : undefined;
    if (options?.insight && options.insight.label !== 'balanced') {
      const { dominantSide, wallStrike, distanceToSpotPct } = options.insight;
      notes.push(
        `options ${dominantSide} stacking near $${wallStrike.toFixed(2)} ` +
          `(${fmtPct(distanceToSpotPct)} vs spot)`
      );
    }

    const widthLabel = dailyFrame && pickBand(BANDWIDTH_BANDS, dailyFrame.bollinger.bandwidth).label;

    const regime = computeRegime(daily);
    const family = regime && dominantFamily(dailyResult.strategies);
    if (regime && family && widthLabel) {
      notes.push(buildRegimeNote(regime, family, widthLabel));
    }

    return {
      symbol: spec.symbol,
      label: spec.label,
      assetClass: spec.assetClass,
      category: spec.category,
      lastClose: dailyResult.lastClose,
      lastChangePct: dailyResult.lastChangePct,
      size,
      lastBarTime: dailyResult.lastBarTime,
      historyStart: dailyResult.historyStart,
      barsAnalyzed: dailyResult.barsAnalyzed,
      consensus,
      daily: dailyResult.strategies,
      intraday: intradayResult?.strategies ?? [],
      tsmom: { score: tsmom.score, label: tsmom.label },
      momentum: analysis.marketMomentum,
      bollinger: dailyFrame && {
        bandwidth: dailyFrame.bollinger.bandwidth,
        percentB: dailyFrame.bollinger.percentB,
        widthLabel,
        positionLabel: pickBand(PERCENT_B_BANDS, dailyFrame.bollinger.percentB).label,
      },
      options,
      regime,
      notes,
    };
```

Note: `daily` (the bars variable, already in scope from earlier in `buildAsset()` — `const daily = dropIncompleteBar(symbolBars.daily);`) is what `computeRegime` runs on, the same bars the backtests themselves ran on.

There is no existing unit-test file for `ReportBuilder` (it requires live `BarsStore`/`OptionsStore`/network mocking that no current test sets up) — don't add one as part of this task. Correctness of the wiring is covered by: the type system (the `AssetOpportunity` return object must satisfy its interface), Task 2's tests on the regime functions in isolation, and this task's compact-passthrough test.

- [ ] **Step 6: Typecheck and run the full test suite**

Run: `yarn workspace @monorepo/backend build`
Expected: no errors.

Run: `yarn workspace @monorepo/backend test`
Expected: all tests PASS, including the pre-existing suite (confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/report/builder.ts apps/backend/src/report/compact.ts apps/backend/src/__tests__/report.test.ts
git commit -m "feat: surface regime-aware strategy callout in the daily report"
```

---

## Self-Review

**Spec coverage:**
- New `adx()` indicator → Task 1.
- `computeRegime`, `dominantFamily`, `buildRegimeNote`, `Regime` type → Task 2.
- Builder integration, `regime` field on `AssetOpportunity`, note pushed via the existing pattern → Task 3, Step 5.
- Compact-report passthrough (needed so the note/field survive into the default report the frontend and Telegram actually consume — confirmed by reading `compact.ts` and `report/format/asset.ts` during planning: `notes` already renders generically in both, so the note text needs no further wiring; `regime` itself needed one explicit passthrough line, added in Task 3) → Task 3, Steps 1-4.
- No scoring impact, no live-snapshot/leaderboard/cron changes → not touched anywhere in this plan, consistent with the spec's non-goals.
- Testing section of the spec (indicator tests, regime module tests, integration check) → Tasks 1-3's test steps; the "integration" check is satisfied by Task 2's `describe('composed end to end', ...)` block (computeRegime + dominantFamily + buildRegimeNote composed together) rather than a `ReportBuilder`-level test, since no such test harness exists in this codebase today (see Task 3, Step 5 note) — a deliberate, smaller-scope substitution of the spec's suggested test shape, not a gap in coverage.

**Placeholder scan:** none — every step has real code or an exact command.

**Type consistency:** `Regime` (Task 2, `report/types.ts`) used identically in `regime.ts`, `builder.ts`, and `compact.ts`. `computeRegime`/`dominantFamily`/`buildRegimeNote` signatures match between their Task 2 definition and every call site in Task 3. `StrategyKind` imported consistently from `backtest/types` throughout.
