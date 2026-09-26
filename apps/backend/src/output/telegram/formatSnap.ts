import { BANDWIDTH_BANDS, COLUMN, PERCENT_B_BANDS, TSMOM_BANDS } from '../../constants';
import { fmtCompact, fmtPct, fmtPrice, padEnd, pickBand, preBlock } from '../../lib/format';
import type { AssetSnap, FinSnap } from '../../snapshot/types';

export function tsmomDot(score: number): string {
  return pickBand(TSMOM_BANDS, score).dot;
}

function bandwidthLabel(bandwidth: number): string {
  return pickBand(BANDWIDTH_BANDS, bandwidth).label;
}

function percentBLabel(percentB: number): string {
  return pickBand(PERCENT_B_BANDS, percentB).label;
}

/** Nearest-expiry options positioning, appended to an asset block. */
function optionsLines(asset: AssetSnap): string[] {
  const expiry = asset.options?.expirations[0];
  if (!expiry) return [];

  const lines = [
    `  Options ${expiry.date}  P/C ${expiry.pcRatio.toFixed(2)}  ` +
      `C vol ${fmtCompact(expiry.calls.totalVolume)}  P vol ${fmtCompact(expiry.puts.totalVolume)}`,
  ];

  const insight = expiry.insight;
  if (insight && insight.label !== 'balanced' && insight.label !== 'thin') {
    lines.push(
      `    ↳ ${insight.dominantSide} wall $${insight.wallStrike.toFixed(2)} ` +
        `(${fmtPct(insight.distanceToSpotPct)})`
    );
  }

  return lines;
}

/** Multi-timeframe price structure for one asset. */
export function formatAssetBlock(asset: AssetSnap): string[] {
  const daily =
    asset.timeframes.find((tf) => tf.timeframe === 'D') ??
    asset.timeframes[asset.timeframes.length - 1];
  if (!daily) return [];

  const timeframeLine = asset.timeframes
    .map((tf) => `${tf.timeframe} ${fmtPct(tf.changePct)}`)
    .join(' | ');

  const bb = daily.bollinger;

  return [
    `${asset.label} $${fmtPrice(asset.currentPrice)}  ` +
      `${tsmomDot(asset.tsmom.score)} TSMOM ${asset.tsmom.score} ${asset.tsmom.label}`,
    `  ${timeframeLine}`,
    `  EMA20 $${fmtPrice(daily.ema20)} (${daily.ema20Trajectory})  ` +
      `EMA50 $${fmtPrice(daily.ema50)} (${daily.ema50Trajectory})`,
    `  ${daily.emaCrossLabel} · RSI ${daily.rsi14.toFixed(0)}`,
    `  BB σ2 $${fmtPrice(bb.std2.lower)}–$${fmtPrice(bb.std2.upper)}  ` +
      `BW ${bb.bandwidth.toFixed(1)}% (${bandwidthLabel(bb.bandwidth)})  ` +
      `%B ${bb.percentB.toFixed(2)} (${percentBLabel(bb.percentB)})`,
    ...optionsLines(asset),
  ];
}

/**
 * Render a live snapshot as Telegram messages: a market header, then one
 * message per asset so the payload stays under the size cap as the universe
 * grows.
 */
export function formatSnap(snap: FinSnap): string[] {
  const assets = Object.values(snap.assets);
  if (assets.length === 0) return ['<b>FinSnap</b> — no asset data available'];

  const header = [
    `FinSnap — ${new Date(snap.timestamp).toUTCString()}`,
    `Breadth ${snap.market.breadth}% bullish · avg TSMOM ${snap.market.avgTsmom} · ` +
      `${snap.market.assetsTracked} assets`,
    '',
    ...assets.map(
      (a) =>
        `${tsmomDot(a.tsmom.score)} ${padEnd(a.label, COLUMN.label)} ` +
        `$${fmtPrice(a.currentPrice)}  ${fmtPct(a.changePct, 2)}`
    ),
  ];

  const messages = [`<b>FinSnap</b>\n${preBlock(header)}`];

  for (const asset of assets) {
    const block = formatAssetBlock(asset);
    if (block.length > 0) messages.push(preBlock(block));
  }

  return messages;
}
