import type { SignalAction } from '../../backtest/types';
import { ACTION_LABEL, COLUMN } from '../../constants';
import { fmtPct, padEnd, padStart } from '../../lib/format';
import type { CompactStrategy } from '../compact';

/**
 * Two lines per strategy: what it says today, and the one window result that
 * justifies listening to it. Both numbers are shown against buy-and-hold —
 * a 14% CAGR means nothing until you know holding returned 19%.
 */
export function formatStrategyLines(strategy: CompactStrategy): string[] {
  const action = ACTION_LABEL[strategy.action as SignalAction] ?? strategy.action;

  const lines = [
    `  ${padEnd(action, COLUMN.action)} ${padEnd(strategy.name, COLUMN.strategyName)} ` +
      `edge ${padStart(String(strategy.edgeScore), COLUMN.score)} ` +
      `opp ${padStart(String(strategy.opportunityScore), COLUMN.score)}`,
  ];

  const h = strategy.headline;
  if (h) {
    lines.push(
      `         ${h.label}: ${fmtPct(h.cagrPct)} CAGR vs ${fmtPct(h.benchmarkCagrPct)} hold · ` +
        `DD ${h.maxDrawdownPct.toFixed(0)}% vs ${h.benchmarkMaxDrawdownPct.toFixed(0)}% · ` +
        `${h.numTrades} trades`
    );
  }

  return lines;
}
