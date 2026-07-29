/**
 * Cross-asset price correlation.
 *
 * Correlation is computed on daily *returns*, never raw price levels — two
 * assets that both trended up for a year would score close to 1.0 on price
 * alone regardless of how differently they actually moved day to day, which
 * is the classic spurious-correlation trap. Returns strip the trend out and
 * leave the thing a reader actually means by "these move together".
 */

import type { Bar } from '../collectors/types';
import { AssetCategory } from '../constants/enums';
import { DAY_MS } from '../constants/time';
import { isoDate } from '../lib/format';
import { clamp, mean, round } from '../lib/math';

export interface CorrelationSeries {
  symbol: string;
  label: string;
  category: AssetCategory;
  bars: Bar[];
}

export interface CorrelationNode {
  symbol: string;
  label: string;
  category: AssetCategory;
}

export interface CorrelationEdge {
  a: string;
  b: string;
  r: number;
  /** Number of paired daily returns the correlation was computed from */
  sample: number;
}

export interface CorrelationWindow {
  id: string;
  label: string;
  /** Calendar days back from the most recent bar; null means all history */
  days: number | null;
}

export interface CorrelationMatrix {
  generatedAt: string;
  window: CorrelationWindow;
  /** Row/column order — the same order the grid and every edge reference */
  nodes: CorrelationNode[];
  /** nodes.length × nodes.length, diagonal is always 1 */
  grid: number[][];
  /** Every pair once (a before b), strongest absolute correlation first */
  edges: CorrelationEdge[];
}

export const CORRELATION_WINDOWS: CorrelationWindow[] = [
  { id: '3m', label: '3 months', days: 91 },
  { id: '6m', label: '6 months', days: 182 },
  { id: '1y', label: '1 year', days: 365 },
  { id: '2y', label: '2 years', days: 730 },
  { id: 'max', label: 'Max history', days: null },
];

export const DEFAULT_CORRELATION_WINDOW = '1y';

/** Below this many paired observations a correlation is too noisy to trust. */
const MIN_SAMPLE = 20;

function pearson(x: number[], y: number[]): number {
  if (x.length < 2) return 0;

  const mx = mean(x);
  const my = mean(y);
  let cov = 0;
  let vx = 0;
  let vy = 0;

  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }

  if (vx === 0 || vy === 0) return 0;
  return clamp(cov / Math.sqrt(vx * vy), -1, 1);
}

/** Close price keyed by calendar day, trimmed to the window and de-duplicated. */
function closesByDate(bars: Bar[], cutoff: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const bar of bars) {
    if (bar.time < cutoff) continue;
    out.set(isoDate(bar.time), bar.close);
  }
  return out;
}

/**
 * Daily returns on the dates two assets both have a close for.
 *
 * Intersecting per pair rather than across the whole universe up front — a
 * 24/7 crypto series would otherwise drag every equity pair down to only the
 * weekday closes, when equity-to-equity pairs could have used the weekend
 * dates equities never had anyway. Pairwise keeps each pair's own maximum
 * overlap.
 */
function pairedReturns(a: Map<string, number>, b: Map<string, number>): [number[], number[]] {
  const dates = [...a.keys()].filter((d) => b.has(d)).sort();
  const xs: number[] = [];
  const ys: number[] = [];

  for (let i = 1; i < dates.length; i++) {
    const prevA = a.get(dates[i - 1])!;
    const curA = a.get(dates[i])!;
    const prevB = b.get(dates[i - 1])!;
    const curB = b.get(dates[i])!;
    if (prevA <= 0 || prevB <= 0) continue;
    xs.push(curA / prevA - 1);
    ys.push(curB / prevB - 1);
  }

  return [xs, ys];
}

/** Broad category first, then alphabetical — clusters related assets so a circular or grid layout reads in blocks. */
const CATEGORY_ORDER: AssetCategory[] = [
  AssetCategory.Crypto,
  AssetCategory.EquityIndex,
  AssetCategory.Sector,
  AssetCategory.Stock,
  AssetCategory.Commodity,
  AssetCategory.Currency,
  AssetCategory.Bond,
];

function sortNodes(series: CorrelationSeries[]): CorrelationSeries[] {
  return [...series].sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return a.label.localeCompare(b.label);
  });
}

export function buildCorrelationMatrix(
  series: CorrelationSeries[],
  window: CorrelationWindow
): CorrelationMatrix {
  const ordered = sortNodes(series.filter((s) => s.bars.length > 0));
  const lastTime = Math.max(0, ...ordered.map((s) => s.bars[s.bars.length - 1]?.time ?? 0));
  const cutoff = window.days === null ? -Infinity : lastTime - window.days * DAY_MS;

  const closes = ordered.map((s) => closesByDate(s.bars, cutoff));
  const n = ordered.length;
  const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const edges: CorrelationEdge[] = [];

  for (let i = 0; i < n; i++) {
    grid[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const [xs, ys] = pairedReturns(closes[i], closes[j]);
      const r = xs.length >= MIN_SAMPLE ? round(pearson(xs, ys), 3) : 0;
      grid[i][j] = r;
      grid[j][i] = r;
      edges.push({ a: ordered[i].label, b: ordered[j].label, r, sample: xs.length });
    }
  }

  edges.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  return {
    generatedAt: new Date().toISOString(),
    window,
    nodes: ordered.map((s) => ({ symbol: s.symbol, label: s.label, category: s.category })),
    grid,
    edges,
  };
}
