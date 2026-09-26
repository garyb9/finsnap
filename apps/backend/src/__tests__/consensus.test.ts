import { describe, it, expect } from 'vitest';
import { buildNotes, computeConsensus, voteWeight } from '../report/consensus';
import { SignalAction, StrategyKind, type StrategyReport } from '../backtest/types';
import { Verdict } from '../report/types';

function makeReport(
  id: string,
  edgeScore: number,
  action: SignalAction,
  kind: StrategyKind = StrategyKind.Trend
): StrategyReport {
  const target = action === SignalAction.Enter || action === SignalAction.Hold ? 1 : 0;

  return {
    strategyId: id,
    name: id,
    kind,
    description: '',
    params: {},
    signal: {
      action,
      target,
      previous: action === SignalAction.Enter ? 0 : action === SignalAction.Exit ? 1 : target,
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

describe('voteWeight', () => {
  it('gives no vote below the minimum edge', () => {
    expect(voteWeight(40)).toBe(0);
    expect(voteWeight(45)).toBe(0);
  });

  it('scales up to a full vote at a perfect edge', () => {
    expect(voteWeight(100)).toBeCloseTo(1);
  });

  it('is monotonic in edge score', () => {
    expect(voteWeight(80)).toBeGreaterThan(voteWeight(60));
  });
});

describe('computeConsensus', () => {
  it('returns neutral when nothing has an edge', () => {
    const consensus = computeConsensus([
      makeReport('a', 40, SignalAction.Hold),
      makeReport('b', 30, SignalAction.StayOut),
    ]);

    expect(consensus.score).toBe(50);
    expect(consensus.verdict).toBe(Verdict.Neutral);
  });

  it('excludes buy-and-hold from the vote', () => {
    // The benchmark is long by construction; counting it would bias every asset.
    const consensus = computeConsensus([
      makeReport('buy_and_hold', 90, SignalAction.Hold, StrategyKind.Benchmark),
      makeReport('a', 80, SignalAction.StayOut),
    ]);

    expect(consensus.votingCount).toBe(1);
    expect(consensus.longCount).toBe(0);
    expect(consensus.score).toBeLessThan(50);
  });

  it('shrinks toward neutral when barely any edge is voting', () => {
    // Every rule is flat, but none has a demonstrated edge — that is "no
    // opinion", not a maximum-conviction sell.
    const noEdge = computeConsensus([
      makeReport('a', 47, SignalAction.StayOut),
      makeReport('b', 46, SignalAction.StayOut),
    ]);
    expect(noEdge.score).toBeGreaterThan(45);
    expect(noEdge.verdict).toBe(Verdict.Neutral);

    // The same unanimous split, backed by real edge, is allowed to be extreme.
    const strongEdge = computeConsensus([
      makeReport('a', 95, SignalAction.StayOut),
      makeReport('b', 92, SignalAction.StayOut),
      makeReport('c', 90, SignalAction.StayOut),
    ]);
    expect(strongEdge.score).toBeLessThan(10);
    expect(strongEdge.verdict).toBe(Verdict.Avoid);
  });

  it('weights strong strategies above weak ones', () => {
    // One high-edge long should outweigh two barely-qualifying flats.
    const consensus = computeConsensus([
      makeReport('strong', 95, SignalAction.Hold),
      makeReport('weak1', 50, SignalAction.StayOut),
      makeReport('weak2', 50, SignalAction.StayOut),
    ]);

    expect(consensus.score).toBeGreaterThan(60);
  });

  it('counts fresh entries and exits', () => {
    const consensus = computeConsensus([
      makeReport('a', 70, SignalAction.Enter),
      makeReport('b', 70, SignalAction.Enter),
      makeReport('c', 70, SignalAction.Exit),
      makeReport('d', 70, SignalAction.Hold),
    ]);

    expect(consensus.freshEntries).toBe(2);
    expect(consensus.freshExits).toBe(1);
    expect(consensus.longCount).toBe(3);
  });

  it('reaches strong_buy when the good rules are all long', () => {
    const consensus = computeConsensus([
      makeReport('a', 90, SignalAction.Hold),
      makeReport('b', 85, SignalAction.Enter),
      makeReport('c', 80, SignalAction.Hold),
    ]);

    expect(consensus.verdict).toBe(Verdict.StrongBuy);
    expect(consensus.score).toBeGreaterThanOrEqual(72);
  });

  it('reaches avoid when the good rules are all flat', () => {
    const consensus = computeConsensus([
      makeReport('a', 90, SignalAction.StayOut),
      makeReport('b', 85, SignalAction.Exit),
    ]);

    expect(consensus.verdict).toBe(Verdict.Avoid);
  });

  it('handles an empty strategy list', () => {
    const consensus = computeConsensus([]);
    expect(consensus.score).toBe(50);
    expect(consensus.votingCount).toBe(0);
  });
});

describe('buildNotes', () => {
  it('reports fresh entries with the strongest names first', () => {
    const strategies = [
      makeReport('weakEntry', 60, SignalAction.Enter),
      makeReport('strongEntry', 90, SignalAction.Enter),
    ];
    const notes = buildNotes(strategies, computeConsensus(strategies));

    expect(notes.join(' ')).toContain('flipped long');
    expect(notes.join(' ')).toContain('strongEntry');
  });

  it('flags when the highest-edge strategies dissent from the broad vote', () => {
    // Many mediocre longs, but the two best rules are both flat.
    const strategies = [
      makeReport('best1', 90, SignalAction.StayOut),
      makeReport('best2', 88, SignalAction.StayOut),
      ...Array.from({ length: 8 }, (_, i) => makeReport(`mid${i}`, 62, SignalAction.Hold)),
    ];

    const notes = buildNotes(strategies, computeConsensus(strategies));
    expect(notes.some((n) => n.includes('disagree'))).toBe(true);
  });

  it('warns when nothing has a demonstrated edge', () => {
    const strategies = [
      makeReport('a', 48, SignalAction.Hold),
      makeReport('b', 51, SignalAction.StayOut),
    ];
    const notes = buildNotes(strategies, computeConsensus(strategies));

    expect(notes.some((n) => n.includes('low conviction'))).toBe(true);
  });

  it('stays quiet on an uneventful, high-conviction asset', () => {
    const strategies = [
      makeReport('a', 80, SignalAction.Hold),
      makeReport('b', 78, SignalAction.Hold),
    ];
    expect(buildNotes(strategies, computeConsensus(strategies))).toEqual([]);
  });
});
