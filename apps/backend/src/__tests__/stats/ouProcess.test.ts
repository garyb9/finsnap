import { describe, expect, it } from 'vitest';
import {
  fitOuProcess,
  isTradeable,
  TRADEABLE_HALF_LIFE_DAYS,
} from '../../analyzers/stats/ouProcess';
import { simulateOu } from './helpers';

describe('fitOuProcess', () => {
  it('recovers theta, mu and halfLife from a series simulated with known parameters', () => {
    const theta = 0.1; // half-life = ln(2)/0.1 ~= 6.9 days
    const mu = 50;
    const sigma = 2;
    const series = simulateOu(3000, 5, theta, mu, sigma);

    const fit = fitOuProcess(series);

    expect(fit.theta).toBeCloseTo(theta, 1);
    expect(fit.mu).toBeGreaterThan(mu - 3);
    expect(fit.mu).toBeLessThan(mu + 3);
    expect(fit.halfLife).toBeCloseTo(Math.log(2) / theta, 0);
  });

  it('reports an infinite half-life when there is not enough history to fit', () => {
    const fit = fitOuProcess([10, 11]);
    expect(fit.halfLife).toBe(Infinity);
  });
});

describe('isTradeable', () => {
  it('accepts a half-life inside the 5-60 day range', () => {
    expect(isTradeable({ theta: 1, mu: 0, sigma: 1, halfLife: 20, equilibriumStd: 1 })).toBe(true);
  });

  it('rejects a half-life outside the range', () => {
    expect(
      isTradeable({
        theta: 1,
        mu: 0,
        sigma: 1,
        halfLife: TRADEABLE_HALF_LIFE_DAYS.min - 1,
        equilibriumStd: 1,
      })
    ).toBe(false);
    expect(
      isTradeable({
        theta: 1,
        mu: 0,
        sigma: 1,
        halfLife: TRADEABLE_HALF_LIFE_DAYS.max + 1,
        equilibriumStd: 1,
      })
    ).toBe(false);
  });

  it('rejects a non-finite half-life', () => {
    expect(
      isTradeable({ theta: 0, mu: 0, sigma: 0, halfLife: Infinity, equilibriumStd: Infinity })
    ).toBe(false);
  });
});
