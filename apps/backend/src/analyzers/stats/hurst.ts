/**
 * Hurst exponent via the lagged-variance method: for a range of lags, take
 * the standard deviation of `series[lag:] - series[:-lag]`, then fit
 * `log(std) = H * log(lag) + c`. A mean-reverting series' lagged
 * differences grow slower than a random walk's, so `H < 0.5`; a trending
 * series' grow faster, `H > 0.5`; a true random walk gives `H ~= 0.5`.
 *
 * This is a confirmation check alongside Engle-Granger/ADF, not a
 * standalone selection criterion — the OU half-life already answers "how
 * fast", this answers "does the spread's own scaling behavior agree that
 * it reverts at all".
 */
export function hurstExponent(series: number[], maxLag = 100): number {
  const n = series.length;
  const cappedMaxLag = Math.min(maxLag, Math.floor(n / 2));
  if (cappedMaxLag < 3) return 0.5;

  const logLags: number[] = [];
  const logTau: number[] = [];

  for (let lag = 2; lag < cappedMaxLag; lag++) {
    const diffs: number[] = [];
    for (let i = lag; i < n; i++) diffs.push(series[i] - series[i - lag]);

    const m = diffs.reduce((s, v) => s + v, 0) / diffs.length;
    const variance = diffs.reduce((s, v) => s + (v - m) ** 2, 0) / diffs.length;
    const std = Math.max(Math.sqrt(variance), 1e-10);

    logLags.push(Math.log(lag));
    logTau.push(Math.log(std));
  }

  // Slope of a simple linear fit of logTau on logLags.
  const n2 = logLags.length;
  const mx = logLags.reduce((s, v) => s + v, 0) / n2;
  const my = logTau.reduce((s, v) => s + v, 0) / n2;
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n2; i++) {
    const dx = logLags[i] - mx;
    cov += dx * (logTau[i] - my);
    varX += dx * dx;
  }

  return varX === 0 ? 0.5 : cov / varX;
}
