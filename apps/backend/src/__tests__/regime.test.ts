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
    expect(computeRegime(bars)?.trend).toBe('choppy');
    expect(dominantFamily(strategies)).toBeUndefined();
  });
});
