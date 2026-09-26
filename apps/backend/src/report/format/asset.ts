import { COLUMN, VERDICT_DOT, VERDICT_LABEL } from '../../constants';
import { fmtPct, fmtPrice, isoDate, padEnd, padStart, preBlock } from '../../lib/format';
import { compactAsset, type CompactAsset } from '../compact';
import type { AssetOpportunity } from '../types';
import { formatStrategyLines } from './strategy';

/** One asset's row in the summary table: price, verdict, and how the vote split. */
export function formatAssetSummaryLines(asset: CompactAsset): string[] {
  const { consensus } = asset;

  const lines = [
    `${VERDICT_DOT[consensus.verdict]} ${padEnd(asset.label, COLUMN.label)} ` +
      `$${padStart(fmtPrice(asset.lastClose), COLUMN.price)}  ` +
      `${padStart(fmtPct(asset.lastChangePct), COLUMN.changePct)}  ` +
      `${padEnd(VERDICT_LABEL[consensus.verdict], COLUMN.verdict)} ${consensus.score}/100`,
    `   ${consensus.longCount}/${consensus.votingCount} strategies long` +
      (asset.tsmom ? ` · TSMOM ${asset.tsmom.score} ${asset.tsmom.label}` : ''),
  ];

  const activity: string[] = [];
  if (consensus.freshEntries > 0) activity.push(`${consensus.freshEntries} entered`);
  if (consensus.freshExits > 0) activity.push(`${consensus.freshExits} exited`);
  if (activity.length > 0) lines.push(`   ${activity.join(' · ')}`);

  return lines;
}

/** Detail block shown for assets that fired a signal or reached a strong verdict. */
export function formatAssetDetailLines(asset: CompactAsset): string[] {
  const lines = [
    `${asset.label} $${fmtPrice(asset.lastClose)} ${fmtPct(asset.lastChangePct)} — ` +
      `${VERDICT_LABEL[asset.consensus.verdict]} ${asset.consensus.score}/100`,
    '',
  ];

  for (const strategy of asset.top) lines.push(...formatStrategyLines(strategy));

  if (asset.notes.length > 0) {
    lines.push('', ...asset.notes.map((n) => `· ${n}`));
  }

  return lines;
}

/** Full detail for one asset — backs the `/report <ticker>` command. */
export function formatAssetDetail(asset: AssetOpportunity, topN = 10): string {
  const compact = compactAsset(asset, topN);
  const { consensus } = asset;

  const lines: string[] = [
    `${asset.label} — ${asset.symbol}`,
    `$${fmtPrice(asset.lastClose)} ${fmtPct(asset.lastChangePct)} · ` +
      `${VERDICT_LABEL[consensus.verdict]} ${consensus.score}/100`,
    `${consensus.longCount}/${consensus.votingCount} strategies long · ` +
      `${asset.barsAnalyzed.toLocaleString()} bars since ${isoDate(asset.historyStart)}`,
    '',
  ];

  for (const strategy of compact.top) lines.push(...formatStrategyLines(strategy));

  if (asset.options) {
    lines.push(
      '',
      `Options ${asset.options.nearestExpiry} · P/C ${asset.options.pcRatio.toFixed(2)}` +
        (asset.options.insight ? ` · ${asset.options.insight.label}` : '')
    );
  }

  if (asset.notes.length > 0) {
    lines.push('', ...asset.notes.map((n) => `· ${n}`));
  }

  return preBlock(lines);
}
