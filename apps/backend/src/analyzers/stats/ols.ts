import { mean } from '../../lib/math';

/** Simple bivariate regression: y = alpha + beta * x + residual. */
export interface OlsResult {
  alpha: number;
  beta: number;
  residuals: number[];
}

/**
 * Closed-form bivariate OLS — no matrix solve needed for one regressor.
 * Used both for the Engle-Granger spread regression (price on price) and the
 * OU AR(1) fit (level on its own lag), which is why it lives separately from
 * {@link multiRegress} rather than being that function's k=1 special case.
 */
export function regress(y: number[], x: number[]): OlsResult {
  const n = y.length;
  if (n !== x.length || n < 2) {
    throw new Error(`regress: need paired series of length >= 2, got ${n}/${x.length}`);
  }

  const mx = mean(x);
  const my = mean(y);
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    cov += dx * (y[i] - my);
    varX += dx * dx;
  }

  const beta = varX === 0 ? 0 : cov / varX;
  const alpha = my - beta * mx;
  const residuals = y.map((v, i) => v - alpha - beta * x[i]);

  return { alpha, beta, residuals };
}

export interface MultiRegressResult {
  coeffs: number[];
  residuals: number[];
  /** Standard error per coefficient, same order as `coeffs`. */
  standardErrors: number[];
}

/**
 * Multiple linear regression via the normal equations, solved with
 * Gauss-Jordan elimination.
 *
 * Only the ADF test needs more than one regressor (a lagged level plus a
 * handful of lagged differences), and only ever a handful of columns, so a
 * general — if unoptimized — matrix solve is simpler than hand-deriving a
 * closed form per lag count.
 */
export function multiRegress(y: number[], columns: number[][]): MultiRegressResult {
  const n = y.length;
  const k = columns.length;
  if (k === 0 || columns.some((c) => c.length !== n)) {
    throw new Error('multiRegress: every column must have the same length as y');
  }

  // X'X (k x k) and X'y (k).
  const xtx: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const xty = new Array(k).fill(0);

  for (let row = 0; row < k; row++) {
    for (let col = 0; col < k; col++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += columns[row][i] * columns[col][i];
      xtx[row][col] = sum;
    }
    let sum = 0;
    for (let i = 0; i < n; i++) sum += columns[row][i] * y[i];
    xty[row] = sum;
  }

  const inverse = invert(xtx);
  const coeffs = inverse.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0));

  const residuals = new Array(n);
  for (let i = 0; i < n; i++) {
    let fitted = 0;
    for (let j = 0; j < k; j++) fitted += coeffs[j] * columns[j][i];
    residuals[i] = y[i] - fitted;
  }

  const dof = n - k;
  const rss = residuals.reduce((s, r) => s + r * r, 0);
  const sigma2 = dof > 0 ? rss / dof : 0;
  const standardErrors = inverse.map((row, j) => Math.sqrt(Math.max(sigma2 * row[j], 0)));

  return { coeffs, residuals, standardErrors };
}

/** Gauss-Jordan matrix inverse, via an [A|I] augmented elimination. */
function invert(a: number[][]): number[][] {
  const n = a.length;
  const aug = a.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting — the raw diagonal entry can be arbitrarily small
    // even when the system is well-posed, which blows up the divide below.
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivotRow][col])) pivotRow = r;
    }
    [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) {
      throw new Error('multiRegress: singular matrix (columns are linearly dependent)');
    }
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) aug[r][j] -= factor * aug[col][j];
    }
  }

  return aug.map((row) => row.slice(n));
}
