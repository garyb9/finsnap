import type { AssetCategory } from './enums';

export type CorrelationWindow = {
  id: string;
  label: string;
  days: number | null;
};

export type CorrelationNode = {
  symbol: string;
  label: string;
  category: AssetCategory;
};

export type CorrelationEdge = {
  a: string;
  b: string;
  r: number;
  sample: number;
};

export type CorrelationMatrix = {
  generatedAt: string;
  window: CorrelationWindow;
  /** Row/column order — matches `grid` and every edge reference */
  nodes: CorrelationNode[];
  /** nodes.length × nodes.length, diagonal is always 1 */
  grid: number[][];
  edges: CorrelationEdge[];
};
