import { AssetCategory } from '../types/enums';
import type { CorrelationEdge, CorrelationNode } from '../types/correlation';

/**
 * Geometry and category styling for the correlation tab.
 *
 * The heatmap reads the grid directly — no layout math needed. The network
 * view is the one that needs a position per node, and with no charting or
 * force-layout library in the app, a circle is the layout that needs none:
 * evenly spaced points in a fixed order read cleanly with plain trigonometry,
 * where a force simulation would need a library and a settle time.
 */

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  [AssetCategory.Crypto]: 'Crypto',
  [AssetCategory.EquityIndex]: 'Equity index',
  [AssetCategory.Sector]: 'Sector',
  [AssetCategory.Stock]: 'Stock',
  [AssetCategory.Commodity]: 'Commodity',
  [AssetCategory.Currency]: 'Currency',
  [AssetCategory.Bond]: 'Bond',
};

/**
 * Identity colour per category — distinct from the app's semantic colours
 * (success/warning/danger), which the correlation sign already uses. Every
 * node also carries a text label, so these never have to carry meaning alone.
 */
export const CATEGORY_COLOR: Record<AssetCategory, string> = {
  [AssetCategory.Crypto]: '#f2a65a',
  [AssetCategory.EquityIndex]: '#2ec2ae',
  [AssetCategory.Sector]: '#8b7cf6',
  [AssetCategory.Stock]: '#5aa9e6',
  [AssetCategory.Commodity]: '#e8c547',
  [AssetCategory.Currency]: '#9aa7ab',
  [AssetCategory.Bond]: '#f28fb0',
};

/** +0.87 / -0.42 / 0.00 — always signed, so the eye never has to infer direction from a bare number. */
export function fmtR(r: number): string {
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}`;
}

/** Mirrors the backend's `CORRELATION_WINDOWS` — kept in sync by hand, the same way `types/enums.ts` mirrors the backend's enums. */
export const CORRELATION_WINDOWS: { id: string; label: string }[] = [
  { id: '3m', label: '3 months' },
  { id: '6m', label: '6 months' },
  { id: '1y', label: '1 year' },
  { id: '2y', label: '2 years' },
  { id: 'max', label: 'Max history' },
];

export const DEFAULT_CORRELATION_WINDOW = '1y';

export type NodePosition = { label: string; category: AssetCategory; x: number; y: number };

/** Nodes placed evenly around a circle, in the order the server already sorted them (by category, then label). */
export function circleLayout(nodes: CorrelationNode[], radius: number): NodePosition[] {
  const n = nodes.length;
  return nodes.map((node, i) => {
    // Starts at the top (-90°) and goes clockwise, so the first node lands
    // straight up rather than at 3 o'clock.
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      label: node.label,
      category: node.category,
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    };
  });
}

/** Edges at or above the strength threshold, strongest first — what the network view actually draws. */
export function edgesAboveThreshold(edges: CorrelationEdge[], minAbsR: number): CorrelationEdge[] {
  return edges.filter((e) => Math.abs(e.r) >= minAbsR);
}

/** How many pairs the universe has in total — the denominator behind "N of M shown". */
export function pairCount(nodeCount: number): number {
  return (nodeCount * (nodeCount - 1)) / 2;
}
