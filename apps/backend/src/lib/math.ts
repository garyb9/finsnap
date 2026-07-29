export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Squash an unbounded difference into [-1, 1].
 *
 * `scale` sets where the curve is steepest — a difference of `scale` maps to
 * about 0.76, so scoring stays sensitive around typical values while extreme
 * outliers saturate instead of dominating.
 */
export function squash(value: number, scale: number): number {
  if (!Number.isFinite(value) || scale === 0) return 0;
  return Math.tanh(value / scale);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sample standard deviation (n-1) — the correct basis for a Sharpe ratio. */
export function sampleStdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function round(value: number, digits = 1): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
