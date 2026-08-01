import { multiRegress } from './ols';

export interface AdfResult {
  /** t-statistic on the lagged-level coefficient — more negative means stronger evidence against a unit root. */
  tStat: number;
  criticalValues: { '1%': number; '5%': number; '10%': number };
  /** Linear interpolation against the tabulated critical values below — see the note on that table. */
  pValue: number;
  /** True when `tStat` is more negative than the 5% critical value. */
  stationary: boolean;
}

/**
 * MacKinnon's approximate asymptotic critical values for the ADF test with
 * an intercept and no trend (the case used throughout this module — a
 * cointegrating spread has no reason to carry a deterministic trend once its
 * mean is already being estimated). Transcribed from MacKinnon (2010),
 * table 2. `statsmodels` computes an exact p-value from a response-surface
 * regression against sample size; reproducing that here would need a much
 * larger coefficient table for a precision this project doesn't act on —
 * pair selection only ever asks "is this below 5%", so tabulated quantiles
 * interpolated linearly in t-space are enough to answer that, with a
 * best-effort p-value alongside it for display.
 */
const CRITICAL_VALUES = { '1%': -3.43, '5%': -2.86, '10%': -2.57 };

/** Coarse (t, p) quantile ladder for the p-value interpolation, same source as above. */
const QUANTILE_LADDER: Array<[number, number]> = [
  [-3.9, 0.001],
  [-3.43, 0.01],
  [-3.12, 0.025],
  [-2.86, 0.05],
  [-2.57, 0.1],
  [-2.2, 0.25],
  [-1.6, 0.5],
  [-0.8, 0.75],
  [0.0, 0.9],
  [1.0, 0.99],
];

function interpolatePValue(tStat: number): number {
  if (!Number.isFinite(tStat)) return 1;
  if (tStat <= QUANTILE_LADDER[0][0]) return QUANTILE_LADDER[0][1];
  const last = QUANTILE_LADDER[QUANTILE_LADDER.length - 1];
  if (tStat >= last[0]) return last[1];

  for (let i = 1; i < QUANTILE_LADDER.length; i++) {
    const [tHi, pHi] = QUANTILE_LADDER[i];
    if (tStat <= tHi) {
      const [tLo, pLo] = QUANTILE_LADDER[i - 1];
      const frac = (tStat - tLo) / (tHi - tLo);
      return pLo + frac * (pHi - pLo);
    }
  }
  return 1;
}

/**
 * Augmented Dickey-Fuller test for a unit root in `series`.
 *
 * Regresses Δy_t on the lagged level y_{t-1}, an intercept, and `lags`
 * lagged difference terms — the same shape as `statsmodels.adfuller(series,
 * maxlag=lags, autolag=None)`. The null hypothesis is "series has a unit
 * root" (is a random walk, not mean-reverting); rejecting it — a
 * sufficiently negative `tStat` — is what "stationary" means here.
 *
 * `lags = 1` mirrors the article's `maxlag=1` and is a reasonable default
 * for daily-bar spreads: enough to absorb first-order autocorrelation in
 * the differenced series without the regression demanding much more history
 * than the level test itself needs.
 */
export function augmentedDickeyFuller(series: number[], lags = 1): AdfResult {
  const n = series.length;
  const minObs = lags + 4;

  if (n < minObs) {
    return { tStat: NaN, criticalValues: CRITICAL_VALUES, pValue: 1, stationary: false };
  }

  const responses: number[] = [];
  const levelCol: number[] = [];
  const interceptCol: number[] = [];
  const lagCols: number[][] = Array.from({ length: lags }, () => []);

  for (let t = lags + 1; t < n; t++) {
    responses.push(series[t] - series[t - 1]);
    levelCol.push(series[t - 1]);
    interceptCol.push(1);
    for (let l = 1; l <= lags; l++) {
      lagCols[l - 1].push(series[t - l] - series[t - l - 1]);
    }
  }

  const columns = [levelCol, interceptCol, ...lagCols];
  const { coeffs, standardErrors } = multiRegress(responses, columns);

  const gamma = coeffs[0];
  const se = standardErrors[0];
  const tStat = se > 0 ? gamma / se : NaN;

  return {
    tStat,
    criticalValues: CRITICAL_VALUES,
    pValue: interpolatePValue(tStat),
    stationary: Number.isFinite(tStat) && tStat < CRITICAL_VALUES['5%'],
  };
}
