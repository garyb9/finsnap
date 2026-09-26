import { describe, expect, it } from 'vitest';
import {
  clamp,
  covariance,
  kurtosis,
  mean,
  ols,
  pearson,
  percentile,
  populationStdev,
  round,
  sampleStdev,
  skew,
} from '../lib/math';

describe('percentile', () => {
  const values = [4, 1, 3, 2, 5];

  it('returns the median at p=0.5', () => {
    expect(percentile(values, 0.5)).toBe(3);
  });

  it('returns the extremes at p=0 and p=1', () => {
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 1)).toBe(5);
  });

  it('interpolates between ranks', () => {
    // Sorted [1,2,3,4,5]; rank at p=0.4 is 1.6, so a 40/60 blend of 2 and 3.
    expect(percentile(values, 0.4)).toBeCloseTo(2.6, 10);
  });

  it('clamps p outside [0, 1]', () => {
    expect(percentile(values, -3)).toBe(1);
    expect(percentile(values, 99)).toBe(5);
  });

  it('handles degenerate input', () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([7], 0.9)).toBe(7);
  });
});

describe('populationStdev', () => {
  it('uses the population (n) divisor', () => {
    // Values 2,4,4,4,5,5,7,9: population std is exactly 2.
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(populationStdev(values)).toBeCloseTo(2, 10);
    // ...and it differs from the sample (n-1) figure on the same data.
    expect(sampleStdev(values)).toBeGreaterThan(populationStdev(values));
  });

  it('accepts an explicit mean', () => {
    expect(populationStdev([1, 2, 3], 2)).toBeCloseTo(populationStdev([1, 2, 3]), 10);
  });

  it('returns 0 for empty input', () => {
    expect(populationStdev([])).toBe(0);
  });
});

describe('covariance', () => {
  it('is positive for co-moving series', () => {
    expect(covariance([1, 2, 3, 4], [2, 4, 6, 8])).toBeGreaterThan(0);
  });

  it('is negative for opposing series', () => {
    expect(covariance([1, 2, 3, 4], [8, 6, 4, 2])).toBeLessThan(0);
  });

  it('returns 0 for too few points', () => {
    expect(covariance([1], [2])).toBe(0);
  });
});

describe('pearson', () => {
  it('is 1 for a perfect positive linear relationship', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
  });

  it('is -1 for a perfect negative relationship', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it('returns 0 when one series is flat', () => {
    expect(pearson([1, 2, 3], [5, 5, 5])).toBe(0);
  });

  it('returns 0 for too few points', () => {
    expect(pearson([1], [2])).toBe(0);
  });

  it('uses the shorter length when they differ', () => {
    // The first three pairs are a perfect line; the extra y value is ignored.
    expect(pearson([1, 2, 3], [2, 4, 6, 999])).toBeCloseTo(1, 10);
  });
});

describe('skew', () => {
  it('is ~0 for a symmetric sample', () => {
    expect(skew([1, 2, 3, 4, 5])).toBeCloseTo(0, 10);
  });

  it('is positive when the right tail is longer', () => {
    expect(skew([1, 1, 1, 2, 10])).toBeGreaterThan(0);
  });

  it('is negative when the left tail is longer', () => {
    expect(skew([-10, 2, 3, 3, 3])).toBeLessThan(0);
  });

  it('returns 0 for flat or too-short input', () => {
    expect(skew([5, 5, 5, 5])).toBe(0);
    expect(skew([1, 2])).toBe(0);
  });
});

describe('kurtosis', () => {
  it('is negative for a flat-topped sample', () => {
    // A uniform ramp is platykurtic — lighter tails than a normal.
    expect(kurtosis([1, 2, 3, 4, 5])).toBeLessThan(0);
  });

  it('is positive for a fat-tailed sample', () => {
    // A single far outlier against a tight body.
    expect(kurtosis([0, 0, 0, 0, 0, 20])).toBeGreaterThan(0);
  });

  it('returns 0 for flat or too-short input', () => {
    expect(kurtosis([5, 5, 5, 5])).toBe(0);
    expect(kurtosis([1, 2, 3])).toBe(0);
  });
});

describe('ols', () => {
  it('recovers slope and intercept of a line', () => {
    const fit = ols([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
    expect(fit.n).toBe(4);
  });

  it('reports a low r2 for uncorrelated data', () => {
    const fit = ols([1, 2, 3, 4], [5, 2, 8, 1]);
    expect(fit.r2).toBeLessThan(0.5);
  });

  it('returns a flat fit when x has no variance', () => {
    const fit = ols([2, 2, 2, 2], [1, 2, 3, 4]);
    expect(fit.slope).toBe(0);
    expect(fit.intercept).toBeCloseTo(2.5, 10);
    expect(fit.r2).toBe(0);
  });

  it('handles too few points', () => {
    const fit = ols([1], [2]);
    expect(fit).toEqual({ slope: 0, intercept: 0, r2: 0, n: 1 });
  });
});

describe('existing primitives remain intact', () => {
  it('clamp, mean and round behave as before', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(mean([1, 2, 3])).toBe(2);
    expect(round(1.2345, 2)).toBe(1.23);
  });
});
