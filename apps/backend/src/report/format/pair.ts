import { PairRegimeStatus, SpreadDirection } from '../../backtest/pairsTypes';
import type { PairReport } from '../../backtest/pairsTypes';
import { fmtPct, padEnd, padStart } from '../../lib/format';
import type { CompactPair } from '../compact';

const REGIME_LABEL: Record<PairRegimeStatus, string> = {
  [PairRegimeStatus.Active]: 'ACTIVE',
  [PairRegimeStatus.Warning]: 'WARNING',
  [PairRegimeStatus.Halted]: 'HALTED',
};

const DIRECTION_LABEL: Record<SpreadDirection, string> = {
  [SpreadDirection.LongSpread]: 'long spread',
  [SpreadDirection.ShortSpread]: 'short spread',
  [SpreadDirection.Flat]: 'flat',
};

/** One line per pair: status, direction, where the spread sits, and the number driving the size. */
export function formatPairLines(pair: CompactPair): string[] {
  const lines = [
    `  ${padEnd(REGIME_LABEL[pair.regimeStatus], 8)} ${padEnd(pair.pairId, 10)} ` +
      `${padEnd(DIRECTION_LABEL[pair.direction], 12)} z ${padStart(pair.currentZ.toFixed(2), 6)} ` +
      `half-life ${pair.halfLifeDays.toFixed(0)}d`,
  ];

  if (pair.headline) {
    const h = pair.headline;
    lines.push(
      `           ${h.label}: ${fmtPct(h.totalReturnPct)} return · Sharpe ${h.sharpe.toFixed(2)} · ` +
        `DD ${h.maxDrawdownPct.toFixed(0)}% · ${h.numTrades} trades`
    );
  }

  return lines;
}

/** Full detail for one pair — every backtested window, not just the headline. */
export function formatPairDetailLines(pair: PairReport): string[] {
  const lines = [
    `${pair.pairId} — ${REGIME_LABEL[pair.regimeStatus]}`,
    pair.rationale,
    '',
    `hedge ratio (beta) ${pair.hedgeRatio.toFixed(3)} · half-life ${pair.halfLifeDays.toFixed(1)}d · ` +
      `Engle-Granger p ${pair.pValue.toFixed(4)} · Hurst ${pair.hurst.toFixed(2)}`,
    `today: ${DIRECTION_LABEL[pair.signal.direction]} · z ${pair.signal.currentZ.toFixed(2)} · ` +
      `${pair.signal.barsInState} bars in state`,
    '',
  ];

  for (const w of pair.windows) {
    lines.push(
      `  ${padEnd(w.label, 10)} ${fmtPct(w.stats.totalReturnPct)} return · ` +
        `Sharpe ${w.stats.sharpe.toFixed(2)} · DD ${w.stats.maxDrawdownPct.toFixed(0)}% · ` +
        `${w.stats.numTrades} trades`
    );
  }

  return lines;
}

/** Every monitored pair, cointegrated ones with an active/warning regime first. */
export function formatPairsSection(pairs: CompactPair[]): string[] {
  if (pairs.length === 0) return [];

  const ordered = [...pairs].sort((a, b) => {
    const rank = {
      [PairRegimeStatus.Active]: 0,
      [PairRegimeStatus.Warning]: 1,
      [PairRegimeStatus.Halted]: 2,
    };
    return rank[a.regimeStatus] - rank[b.regimeStatus];
  });

  const lines = ['— Pairs —'];
  for (const pair of ordered) lines.push(...formatPairLines(pair));
  return lines;
}
