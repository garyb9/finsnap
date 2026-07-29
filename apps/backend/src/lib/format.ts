/**
 * Text-formatting primitives shared by every renderer (Telegram, report text,
 * log lines). Kept in one place so a price never appears with three different
 * decimal conventions depending on which module printed it.
 */

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Prices above five figures drop decimals — cents on BTC are just noise. */
export function fmtPrice(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 10_000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return value.toFixed(2);
}

export function fmtPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function fmtNum(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** 12_400 → "12.4K". Used for option volume and open interest. */
export function fmtCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

export function padEnd(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

export function padStart(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Wrap fixed-width text in a Telegram <pre> block. */
export function preBlock(lines: string[]): string {
  return `<pre>${escapeHtml(lines.join('\n'))}</pre>`;
}

/**
 * Pick the first band whose `min` the value clears. Bands must be ordered
 * highest-first and end with a `-Infinity` catch-all.
 */
export function pickBand<T extends { min: number }>(bands: readonly T[], value: number): T {
  return bands.find((b) => value >= b.min) ?? bands[bands.length - 1];
}
