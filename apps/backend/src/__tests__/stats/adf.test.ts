import { describe, expect, it } from 'vitest';
import { augmentedDickeyFuller } from '../../analyzers/stats/adf';
import { randomWalk, simulateOu } from './helpers';

describe('augmentedDickeyFuller', () => {
  it('rejects the unit root for a strongly mean-reverting series', () => {
    // Fast reversion (theta well above the tradeable range) so the signal is
    // unambiguous rather than borderline.
    const series = simulateOu(1000, 1, 0.3, 100, 1);
    const result = augmentedDickeyFuller(series, 1);

    expect(result.stationary).toBe(true);
    expect(result.tStat).toBeLessThan(result.criticalValues['5%']);
  });

  it('does not reject the unit root for a random walk', () => {
    const series = randomWalk(1000, 2, 1);
    const result = augmentedDickeyFuller(series, 1);

    expect(result.stationary).toBe(false);
    expect(result.tStat).toBeGreaterThan(result.criticalValues['5%']);
  });

  it('returns a non-stationary result when there is not enough history', () => {
    const result = augmentedDickeyFuller([1, 2, 3], 1);
    expect(result.stationary).toBe(false);
    expect(Number.isNaN(result.tStat)).toBe(true);
  });
});
