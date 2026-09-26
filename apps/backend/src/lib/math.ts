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

/**
 * Population standard deviation about a supplied mean (n divisor).
 *
 * Distinct from `sampleStdev`: this is the dispersion of the values in hand,
 * not an estimate of a wider population, and it is what a weighted-strike
 * spread or a Bollinger band actually wants.
 */
export function populationStdev(values: number[], m = mean(values)): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Linear-interpolated percentile of an unsorted sample. `p` is a fraction in
 * [0, 1] (0.5 = median). Empty input returns 0; a single value is its own
 * every percentile.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = clamp(p, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const weight = rank - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

/** Sample covariance (n-1), the numerator of a correlation before normalizing. */
export function covariance(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (x[i] - mx) * (y[i] - my);
  return sum / (n - 1);
}

/**
 * Pearson correlation of two equal-length samples, clamped to [-1, 1].
 *
 * Returns 0 for fewer than two paired values or when either series has no
 * variance — a flat series correlates with nothing, not with everything.
 */
export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return 0;
  return clamp(cov / Math.sqrt(vx * vy), -1, 1);
}

/**
 * Sample skewness (third standardized moment, n-1 basis).
 *
 * Positive means the right tail is longer — a handful of large up moves — and
 * negative the mirror. Needs at least three observations; returns 0 otherwise.
 */
export function skew(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const m = mean(values);
  const sd = sampleStdev(values);
  if (sd === 0) return 0;
  const sum = values.reduce((acc, v) => acc + ((v - m) / sd) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * sum;
}

/**
 * Excess sample kurtosis (fourth standardized moment minus 3, n-1 basis).
 *
 * 0 matches a normal distribution; positive means fatter tails than normal.
 * Needs at least four observations; returns 0 otherwise.
 */
export function kurtosis(values: number[]): number {
  const n = values.length;
  if (n < 4) return 0;
  const m = mean(values);
  const sd = sampleStdev(values);
  if (sd === 0) return 0;
  const sum = values.reduce((acc, v) => acc + ((v - m) / sd) ** 4, 0);
  const a = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
  const b = (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
  return a * sum - b;
}

export interface OlsFit {
  slope: number;
  intercept: number;
  /** Coefficient of determination in [0, 1]. */
  r2: number;
  /** Number of paired observations the fit used. */
  n: number;
}

/**
 * Ordinary least squares fit of `y` on `x`. Assumes `y = slope * x + intercept`.
 *
 * Used for edge decay (score versus time) and beta-style sensitivity. Returns
 * a zero fit for degenerate input — fewer than two points, or an `x` with no
 * variance.
 */
export function ols(x: number[], y: number[]): OlsFit {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { slope: 0, intercept: 0, r2: 0, n };

  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    sxx += dx * dx;
    sxy += dx * (y[i] - my);
  }
  if (sxx === 0) return { slope: 0, intercept: my, r2: 0, n };

  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r = pearson(x, y);
  return { slope, intercept, r2: r * r, n };
}
