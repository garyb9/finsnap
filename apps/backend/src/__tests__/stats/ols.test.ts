import { describe, expect, it } from 'vitest';
import { multiRegress, regress } from '../../analyzers/stats/ols';

describe('regress', () => {
  it('recovers the exact slope and intercept from noiseless linear data', () => {
    const x = [0, 1, 2, 3, 4, 5];
    const y = x.map((v) => 2 + 3 * v);

    const { alpha, beta, residuals } = regress(y, x);

    expect(alpha).toBeCloseTo(2, 8);
    expect(beta).toBeCloseTo(3, 8);
    for (const r of residuals) expect(r).toBeCloseTo(0, 8);
  });

  it('returns beta 0 when x has no variance', () => {
    const { beta } = regress([1, 2, 3], [5, 5, 5]);
    expect(beta).toBe(0);
  });
});

describe('multiRegress', () => {
  it('agrees with the bivariate regress on an intercept + single-slope design', () => {
    const x = [1, 2, 3, 4, 5, 6, 7];
    const y = x.map((v) => -1 + 0.5 * v + (v % 2 === 0 ? 0.1 : -0.1));

    const bivariate = regress(y, x);
    const multi = multiRegress(
      y,
      [x, x.map(() => 1)] // [slope column, intercept column]
    );

    expect(multi.coeffs[0]).toBeCloseTo(bivariate.beta, 6);
    expect(multi.coeffs[1]).toBeCloseTo(bivariate.alpha, 6);
  });

  it('recovers known coefficients from a noiseless multi-column design', () => {
    // y = 1*x1 + 2*x2 + 3 (intercept)
    const x1 = [1, 2, 3, 4, 5, 6];
    const x2 = [2, 1, 4, 3, 6, 5];
    const intercept = x1.map(() => 1);
    const y = x1.map((v, i) => 1 * v + 2 * x2[i] + 3);

    const { coeffs, residuals } = multiRegress(y, [x1, x2, intercept]);

    expect(coeffs[0]).toBeCloseTo(1, 6);
    expect(coeffs[1]).toBeCloseTo(2, 6);
    expect(coeffs[2]).toBeCloseTo(3, 6);
    for (const r of residuals) expect(r).toBeCloseTo(0, 6);
  });

  it('throws on a singular design (linearly dependent columns)', () => {
    const x = [1, 2, 3, 4, 5];
    expect(() => multiRegress(x, [x, x.map((v) => v * 2)])).toThrow();
  });
});
