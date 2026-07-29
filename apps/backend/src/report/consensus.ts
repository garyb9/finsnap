import { SignalAction, StrategyKind, type StrategyReport } from '../backtest/types';
import {
  HIGH_CONVICTION_EDGE,
  MIN_CONFIDENT_VOTE_WEIGHT,
  MIN_VOTING_EDGE,
  VERDICT_THRESHOLDS,
} from '../constants';
import { pickBand } from '../lib/format';
import { clamp } from '../lib/math';
import type { Consensus, Verdict } from './types';

/** Consensus and the strongest-strategies check may differ by this much before it is called out. */
const DISAGREEMENT_THRESHOLD = 25;

const NEUTRAL_SCORE = 50;

/**
 * A strategy's say in the vote, from its historical edge.
 *
 * Below `MIN_VOTING_EDGE` a strategy has no demonstrated advantage over simply
 * holding, so it gets no vote at all rather than a small one — otherwise twenty
 * mediocre rules would outvote three good ones purely on headcount.
 */
export function voteWeight(edgeScore: number): number {
  return Math.max(0, (edgeScore - MIN_VOTING_EDGE) / (100 - MIN_VOTING_EDGE));
}

function toVerdict(score: number): Verdict {
  return pickBand(VERDICT_THRESHOLDS, score).verdict;
}

/**
 * Combine every strategy's current position into one edge-weighted view.
 *
 * Buy & hold is excluded: it is always long by construction, so counting its
 * vote would put a permanent thumb on the bullish side of every asset.
 */
export function computeConsensus(strategies: StrategyReport[]): Consensus {
  const voters = strategies.filter((s) => s.kind !== StrategyKind.Benchmark);

  let longWeight = 0;
  let flatWeight = 0;
  let longCount = 0;
  let freshEntries = 0;
  let freshExits = 0;

  for (const s of voters) {
    const weight = voteWeight(s.edgeScore);
    if (s.signal.target > 0) {
      longWeight += weight;
      longCount++;
    } else {
      flatWeight += weight;
    }
    if (s.signal.action === SignalAction.Enter) freshEntries++;
    if (s.signal.action === SignalAction.Exit) freshExits++;
  }

  const totalWeight = longWeight + flatWeight;

  // With no weighted voters the honest answer is "no opinion", not "bearish" —
  // and with barely any weight it is still mostly no opinion, so the raw split
  // is shrunk toward neutral in proportion to how much edge is actually voting.
  const rawScore = totalWeight > 0 ? (longWeight / totalWeight) * 100 : NEUTRAL_SCORE;
  const confidence = clamp(totalWeight / MIN_CONFIDENT_VOTE_WEIGHT, 0, 1);
  const score = NEUTRAL_SCORE + (rawScore - NEUTRAL_SCORE) * confidence;

  return {
    score: Math.round(score),
    verdict: toVerdict(score),
    longWeight: Number(longWeight.toFixed(3)),
    flatWeight: Number(flatWeight.toFixed(3)),
    longCount,
    votingCount: voters.length,
    freshEntries,
    freshExits,
  };
}

/** Observations worth calling out above the raw numbers. */
export function buildNotes(strategies: StrategyReport[], consensus: Consensus): string[] {
  const notes: string[] = [];
  const voters = strategies.filter((s) => s.kind !== StrategyKind.Benchmark);

  if (consensus.freshEntries > 0) {
    const names = voters
      .filter((s) => s.signal.action === SignalAction.Enter)
      .sort((a, b) => b.edgeScore - a.edgeScore)
      .slice(0, 3)
      .map((s) => s.name);
    notes.push(
      `${consensus.freshEntries} ${consensus.freshEntries === 1 ? 'strategy' : 'strategies'} ` +
        `flipped long at the last close (${names.join(', ')})`
    );
  }

  if (consensus.freshExits > 0) {
    const names = voters
      .filter((s) => s.signal.action === SignalAction.Exit)
      .sort((a, b) => b.edgeScore - a.edgeScore)
      .slice(0, 3)
      .map((s) => s.name);
    notes.push(`${consensus.freshExits} exited (${names.join(', ')})`);
  }

  // Where the strategies that actually have an edge disagree with the crowd,
  // say so — a 60% consensus built from weak rules is worth less than a 40%
  // one where the strongest rules are the dissenters.
  const strong = voters.filter((s) => s.edgeScore >= HIGH_CONVICTION_EDGE);
  if (strong.length >= 2) {
    const strongLong = strong.filter((s) => s.signal.target > 0).length;
    const share = (strongLong / strong.length) * 100;
    if (Math.abs(share - consensus.score) > DISAGREEMENT_THRESHOLD) {
      notes.push(
        `highest-edge strategies (${strongLong}/${strong.length} long) disagree with the broad vote`
      );
    }
  }

  const noEdge = voters.every((s) => s.edgeScore < HIGH_CONVICTION_EDGE - 10);
  if (noEdge && voters.length > 0) {
    notes.push('no strategy shows a clear edge on this asset — treat signals as low conviction');
  }

  return notes;
}
