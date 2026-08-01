import { describe, expect, it } from 'vitest';
import { hurstExponent } from '../../analyzers/stats/hurst';
import { persistentWalk, randomWalk, simulateOu } from './helpers';

describe('hurstExponent', () => {
  it('scores a strongly mean-reverting series below 0.5', () => {
    const series = simulateOu(1000, 3, 0.3, 100, 1);
    expect(hurstExponent(series)).toBeLessThan(0.4);
  });

  it('scores a persistent series (positively autocorrelated returns) above 0.5', () => {
    const series = persistentWalk(1000, 6, 0.6);
    expect(hurstExponent(series)).toBeGreaterThan(0.5);
  });

  it('scores a random walk close to 0.5', () => {
    const series = randomWalk(2000, 4, 1);
    expect(hurstExponent(series)).toBeGreaterThan(0.35);
    expect(hurstExponent(series)).toBeLessThan(0.65);
  });
});
