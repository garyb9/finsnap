import type { AssetCategory, AssetClass, MetricId, StrategyKind, WindowId } from './enums';

export type GuideAsset = {
  symbol: string;
  label: string;
  /** Full instrument name — 'SPDR S&P 500 ETF Trust' */
  name: string;
  /** The handle a person would use — 'S&P 500', 'Gold', 'Materials' */
  shortName: string;
  category: AssetCategory;
  assetClass: AssetClass;
  /** One sentence on what you own and what moves it */
  blurb: string;
  /** Present only where something non-obvious changes how to read the backtest */
  caveat?: string;
  hasOptions: boolean;
};

export type GuideAssetGroup = {
  category: AssetCategory;
  label: string;
  symbols: string[];
};

export type GuideFamily = {
  kind: StrategyKind;
  label: string;
  premise: string;
  worksWhen: string;
  failsWhen: string;
};

export type GuideStrategy = {
  id: string;
  name: string;
  kind: StrategyKind;
  description: string;
  params: Record<string, number>;
  warmup: number;
};

export type GuideMetric = {
  id: MetricId;
  label: string;
  short: string;
  detail: string;
  reading: string;
};

export type GuideMethodNote = {
  title: string;
  body: string;
};

export type GuideWindow = {
  id: WindowId;
  label: string;
  days: number | null;
};

export type Guide = {
  assets: GuideAsset[];
  assetGroups: GuideAssetGroup[];
  families: GuideFamily[];
  strategies: GuideStrategy[];
  metrics: GuideMetric[];
  method: GuideMethodNote[];
  windows: { daily: GuideWindow[]; intraday: GuideWindow[] };
  execution: { initialCapital: number; feeBps: number; slippageBps: number };
};

/** Anchor ids, shared by the guide page and every link that targets it. */
export const assetAnchor = (symbol: string): string => `asset-${symbol}`;
export const strategyAnchor = (id: string): string => `strategy-${id}`;
export const metricAnchor = (id: MetricId | string): string => `metric-${id}`;
