import { regress } from './ols';

export interface OuParams {
  /** Mean reversion speed. */
  theta: number;
  /** Long-run mean the spread reverts to. */
  mu: number;
  /** Diffusion — noise in the path back to `mu`. */
  sigma: number;
  /** ln(2) / theta, in the same units as one step of `series` (days, for daily bars). */
  halfLife: number;
  /** sigma / sqrt(2*theta) — typical size of a spread deviation at steady state. */
  equilibriumStd: number;
}

/**
 * Fit an Ornstein-Uhlenbeck process to a spread series:
 * `dX_t = theta * (mu - X_t) dt + sigma dW_t`.
 *
 * The discrete-time OU process is exactly an AR(1) — `X_t = a + b * X_{t-1}
 * + noise` — so every parameter falls out of one OLS regression of the
 * series on its own one-step lag, with `theta = (1 - b) / dt`,
 * `mu = a / (theta * dt)`, `sigma = stdev(residuals) / sqrt(dt)`.
 *
 * `dt = 1` (one bar per step) is the only case this project needs — every
 * spread here is built from daily bars, so `halfLife` comes out in days
 * directly.
 */
export function fitOuProcess(series: number[], dt = 1): OuParams {
  const n = series.length;
  if (n < 3) {
    return { theta: 0, mu: 0, sigma: 0, halfLife: Infinity, equilibriumStd: Infinity };
  }

  const lagged = series.slice(0, -1);
  const current = series.slice(1);
  const { alpha, beta, residuals } = regress(current, lagged);

  const theta = Math.max((1 - beta) / dt, 1e-10);
  const mu = alpha / (theta * dt);

  const residMean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
  const residVariance =
    residuals.reduce((s, v) => s + (v - residMean) ** 2, 0) / Math.max(residuals.length - 1, 1);
  const sigma = Math.sqrt(residVariance) / Math.sqrt(dt);

  const halfLife = Math.log(2) / theta;
  const equilibriumStd = theta > 1e-10 ? sigma / Math.sqrt(2 * theta) : Infinity;

  return { theta, mu, sigma, halfLife, equilibriumStd };
}

/** The article's practical daily-data range — fast enough to survive costs, slow enough not to burn capital waiting. */
export const TRADEABLE_HALF_LIFE_DAYS = { min: 5, max: 60 };

export function isTradeable(params: OuParams): boolean {
  return (
    Number.isFinite(params.halfLife) &&
    params.halfLife >= TRADEABLE_HALF_LIFE_DAYS.min &&
    params.halfLife <= TRADEABLE_HALF_LIFE_DAYS.max
  );
}
