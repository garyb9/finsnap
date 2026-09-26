import { ACTION_DOT, COLUMN } from '../../constants';
import { fmtPrice, padEnd } from '../../lib/format';
import type { Opportunity } from '../types';

/**
 * One fired signal, in three lines: what to do, at what price, and why the rule
 * is worth trusting. This is the part of the report that is actually actionable
 * — everything else is context for it.
 */
export function formatOpportunityLines(op: Opportunity): string[] {
  const timeframe = op.interval === '1h' ? ' [1h]' : '';

  return [
    `${ACTION_DOT[op.action]} ${padEnd(op.label, COLUMN.label)} ` +
      `${op.action.toUpperCase()}${timeframe}  ${op.strategyName}`,
    `   $${fmtPrice(op.entryPrice)} · edge ${op.edgeScore} · opp ${op.opportunityScore}`,
    `   ${op.rationale}`,
  ];
}

/** Compact two-line form used by the `/today` command. */
export function formatOpportunityCompact(op: Opportunity): string {
  return (
    `${ACTION_DOT[op.action]} ${padEnd(op.label, COLUMN.label)} ` +
    `${op.action.toUpperCase()} ${op.strategyName}\n` +
    `   $${fmtPrice(op.entryPrice)} · edge ${op.edgeScore} · opp ${op.opportunityScore}`
  );
}
