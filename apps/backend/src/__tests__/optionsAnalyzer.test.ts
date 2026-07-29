import { describe, it, expect } from 'vitest';
import { weightedMean, weightedStd, analyzeOptionsChain } from '../analyzers/options';
import type { OptionsData } from '../collectors/types';

describe('weightedMean', () => {
  it('returns 0 for empty weights', () => {
    expect(weightedMean([10, 20], [0, 0])).toBe(0);
  });

  it('computes a correct weighted mean', () => {
    // (10*1 + 20*3) / 4 = 17.5
    expect(weightedMean([10, 20], [1, 3])).toBeCloseTo(17.5);
  });

  it('reduces to the arithmetic mean under equal weights', () => {
    expect(weightedMean([5, 15], [1, 1])).toBeCloseTo(10);
  });
});

describe('weightedStd', () => {
  it('returns 0 for empty weights', () => {
    expect(weightedStd([10, 20], [0, 0], 15)).toBe(0);
  });

  it('computes a correct weighted standard deviation', () => {
    // variance = (1*(10-17.5)² + 3*(20-17.5)²) / 4 = 18.75
    expect(weightedStd([10, 20], [1, 3], 17.5)).toBeCloseTo(Math.sqrt(18.75));
  });

  it('is 0 when all values are equal', () => {
    expect(weightedStd([5, 5, 5], [1, 2, 3], 5)).toBeCloseTo(0);
  });
});

describe('analyzeOptionsChain', () => {
  const data: OptionsData = {
    ticker: 'IBIT',
    price: 50,
    fetchedAt: Date.now(),
    chains: [
      {
        expiration: '2026-04-17',
        calls: [
          { strike: 48, volume: 1000, openInterest: 5000 },
          { strike: 50, volume: 2000, openInterest: 8000 },
          { strike: 52, volume: 500, openInterest: 2000 },
        ],
        puts: [
          { strike: 48, volume: 800, openInterest: 4000 },
          { strike: 50, volume: 1200, openInterest: 6000 },
        ],
      },
    ],
  };

  it('computes the weighted mean strike for calls', () => {
    const [expiry] = analyzeOptionsChain(data).expirations;

    // (48*1000 + 50*2000 + 52*500) / 3500 ≈ 49.71
    expect(expiry.calls.weightedMeanStrike).toBeCloseTo(49.71, 1);
    expect(expiry.calls.totalVolume).toBe(3500);
    expect(expiry.calls.totalOI).toBe(15000);
  });

  it('computes the put/call ratio', () => {
    // 2000 put volume / 3500 call volume ≈ 0.571
    expect(analyzeOptionsChain(data).expirations[0].pcRatio).toBeCloseTo(0.571, 2);
  });

  it('carries the ticker through', () => {
    expect(analyzeOptionsChain(data).ticker).toBe('IBIT');
  });

  it('attaches a skew insight', () => {
    const [expiry] = analyzeOptionsChain(data).expirations;

    expect(expiry.insight).toBeDefined();
    expect(['calls', 'puts', 'none']).toContain(expiry.insight!.dominantSide);
  });

  it('leans call-heavy when calls dominate both volume and OI', () => {
    const insight = analyzeOptionsChain(data).expirations[0].insight!;
    expect(insight.skewScore).toBeLessThan(0);
  });

  it('handles zero volume without dividing by zero', () => {
    const empty: OptionsData = {
      ticker: 'TEST',
      price: 100,
      fetchedAt: Date.now(),
      chains: [
        {
          expiration: '2026-05-01',
          calls: [{ strike: 100, volume: 0, openInterest: 0 }],
          puts: [],
        },
      ],
    };

    const [expiry] = analyzeOptionsChain(empty).expirations;
    expect(expiry.calls.weightedMeanStrike).toBe(0);
    expect(expiry.pcRatio).toBe(0);
  });

  it('handles a chain with no expirations', () => {
    const bare: OptionsData = { ticker: 'TEST', price: 10, fetchedAt: Date.now(), chains: [] };
    expect(analyzeOptionsChain(bare).expirations).toEqual([]);
  });
});
