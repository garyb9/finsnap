import { preBlock } from '../../lib/format';
import { compactAsset, type CompactAsset } from '../compact';
import type { DailyReport } from '../types';
import { formatAssetDetailLines, formatAssetSummaryLines } from './asset';
import { formatOpportunityLines } from './opportunity';

const NO_ACTIONS = 'No fresh entries or exits from strategies with an edge.';

function buildHeaderLines(report: DailyReport): string[] {
  const { summary } = report;

  const lines = [
    `FinSnap Daily — ${report.date}`,
    `${summary.assetsAnalyzed} assets · ${summary.strategiesRun} strategy runs · ` +
      `${summary.backtestsRun.toLocaleString()} backtests`,
    `Breadth ${summary.avgConsensus}/100 · ` +
      `${summary.bullishAssets} bullish · ${summary.bearishAssets} bearish`,
    '',
    '— Today’s Actions —',
  ];

  if (report.topOpportunities.length === 0) {
    lines.push(NO_ACTIONS);
    return lines;
  }

  for (const op of report.topOpportunities) lines.push(...formatOpportunityLines(op));
  return lines;
}

/**
 * An asset earns its own detail block only if it did something — fired a
 * signal, or landed at one of the conviction extremes. A quiet session should
 * produce a short message, not the same wall of text with different numbers.
 */
function isNoteworthy(asset: CompactAsset): boolean {
  const { consensus } = asset;
  return (
    consensus.freshEntries > 0 ||
    consensus.freshExits > 0 ||
    consensus.verdict === 'strong_buy' ||
    consensus.verdict === 'avoid'
  );
}

/**
 * Render the daily report as Telegram-ready HTML messages: a headline with the
 * day's actions, a table of every asset, then detail for the ones that moved.
 *
 * Splitting across messages keeps each one under Telegram's 4096-character cap
 * however far the universe grows.
 */
export function formatDailyReport(report: DailyReport): string[] {
  const assets = report.assets.map((a) => compactAsset(a));

  const messages = [`<b>FinSnap Daily</b>\n${preBlock(buildHeaderLines(report))}`];

  const table = ['— Assets —'];
  for (const asset of assets) table.push(...formatAssetSummaryLines(asset));
  messages.push(preBlock(table));

  for (const asset of assets.filter(isNoteworthy)) {
    messages.push(preBlock(formatAssetDetailLines(asset)));
  }

  return messages;
}
