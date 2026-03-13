import { describe, it, expect } from 'vitest';
import {
  analyzeWhales,
  analyzeGas,
  analyzeVolume,
  computeNetworkStress,
} from '../analyzers/onchain';
import { weightedMean, weightedStd, analyzeOptionsChain } from '../analyzers/options';
import type { CollectorState } from '../collectors/types';
import type { OptionsData } from '../collectors/types';

// Helper to build a minimal CollectorState
function makeState(overrides: Partial<CollectorState> = {}): CollectorState {
  return {
    blocks: [],
    startTime: 0,
    endTime: 0,
    chainId: 1,
    ...overrides,
  };
}

// --- Weighted math ---

describe('weightedMean', () => {
  it('returns 0 for empty weights', () => {
    expect(weightedMean([10, 20], [0, 0])).toBe(0);
  });

  it('computes correct weighted mean', () => {
    // mean = (10*1 + 20*3) / (1+3) = 70/4 = 17.5
    expect(weightedMean([10, 20], [1, 3])).toBeCloseTo(17.5);
  });

  it('equal weights give arithmetic mean', () => {
    expect(weightedMean([5, 15], [1, 1])).toBeCloseTo(10);
  });
});

describe('weightedStd', () => {
  it('returns 0 for empty weights', () => {
    expect(weightedStd([10, 20], [0, 0], 15)).toBe(0);
  });

  it('computes correct weighted std', () => {
    // mean=17.5, variance = (1*(10-17.5)^2 + 3*(20-17.5)^2) / 4 = (56.25 + 18.75)/4 = 18.75
    const mean = 17.5;
    const std = weightedStd([10, 20], [1, 3], mean);
    expect(std).toBeCloseTo(Math.sqrt(18.75));
  });

  it('is 0 when all values are equal', () => {
    expect(weightedStd([5, 5, 5], [1, 2, 3], 5)).toBeCloseTo(0);
  });
});

// --- On-chain analyzers ---

describe('analyzeWhales (empty state)', () => {
  it('returns zeros for empty blocks', () => {
    const result = analyzeWhales(makeState());
    expect(result.totalWhaleTransfers).toBe(0);
    expect(result.whaleEnergy).toBe(0);
    expect(result.largestTransfer).toBeNull();
  });
});

describe('analyzeWhales (with transfers)', () => {
  it('computes energy and total volume', () => {
    const now = Math.floor(Date.now() / 1000);
    const state = makeState({
      blocks: [
        {
          number: 1n,
          timestamp: now - 300,
          baseFeeGwei: 20,
          gasUsed: 15_000_000n,
          gasLimit: 30_000_000n,
          transactionCount: 200,
          totalValueEth: 5000,
          whaleTransfers: [
            {
              hash: '0xabc',
              from: '0xA',
              to: '0xB',
              valueEth: 200,
              blockNumber: 1n,
              timestamp: now - 300,
            },
            {
              hash: '0xdef',
              from: '0xC',
              to: '0xD',
              valueEth: 350,
              blockNumber: 1n,
              timestamp: now - 300,
            },
          ],
        },
      ],
      startTime: now - 3600,
      endTime: now,
    });

    const result = analyzeWhales(state);
    expect(result.totalWhaleTransfers).toBe(2);
    expect(result.totalWhaleVolumeEth).toBeCloseTo(550);
    expect(result.whaleEnergy).toBeGreaterThanOrEqual(0);
    expect(result.whaleEnergy).toBeLessThanOrEqual(100);
    expect(result.largestTransfer?.valueEth).toBe(350);
  });
});

describe('analyzeGas', () => {
  it('returns zeros for empty blocks', () => {
    const result = analyzeGas(makeState());
    expect(result.avgBaseFeeGwei).toBe(0);
    expect(result.networkStress).toBe(0);
    expect(result.trend).toBe('stable');
  });

  it('computes gas metrics correctly', () => {
    const state = makeState({
      blocks: [
        {
          number: 1n,
          timestamp: 1000,
          baseFeeGwei: 20,
          gasUsed: 15_000_000n,
          gasLimit: 30_000_000n,
          transactionCount: 100,
          totalValueEth: 100,
          whaleTransfers: [],
        },
        {
          number: 2n,
          timestamp: 1012,
          baseFeeGwei: 40,
          gasUsed: 20_000_000n,
          gasLimit: 30_000_000n,
          transactionCount: 150,
          totalValueEth: 200,
          whaleTransfers: [],
        },
      ],
    });
    const result = analyzeGas(state);
    expect(result.avgBaseFeeGwei).toBeCloseTo(30);
    expect(result.minBaseFeeGwei).toBe(20);
    expect(result.maxBaseFeeGwei).toBe(40);
    expect(result.networkStress).toBeGreaterThanOrEqual(0);
    expect(result.networkStress).toBeLessThanOrEqual(100);
  });
});

describe('analyzeVolume', () => {
  it('returns zeros for empty blocks', () => {
    const result = analyzeVolume(makeState());
    expect(result.totalVolumeEth).toBe(0);
    expect(result.intensity).toBe(0);
  });

  it('computes character and intensity', () => {
    const state = makeState({
      blocks: [
        {
          number: 1n,
          timestamp: 1000,
          baseFeeGwei: 20,
          gasUsed: 15_000_000n,
          gasLimit: 30_000_000n,
          transactionCount: 200,
          totalValueEth: 100,
          whaleTransfers: [],
        },
        {
          number: 2n,
          timestamp: 1012,
          baseFeeGwei: 20,
          gasUsed: 15_000_000n,
          gasLimit: 30_000_000n,
          transactionCount: 200,
          totalValueEth: 100,
          whaleTransfers: [],
        },
      ],
    });
    const result = analyzeVolume(state);
    expect(result.totalVolumeEth).toBeCloseTo(200);
    expect(result.totalTransactions).toBe(400);
    expect(result.intensity).toBeGreaterThanOrEqual(0);
    expect(result.intensity).toBeLessThanOrEqual(100);
  });
});

describe('computeNetworkStress', () => {
  it('returns value in 0-100 range', () => {
    const gas = { ...analyzeGas(makeState()), networkStress: 50 };
    const whale = { ...analyzeWhales(makeState()), whaleEnergy: 80 };
    const volume = { ...analyzeVolume(makeState()), intensity: 30 };

    const stress = computeNetworkStress(gas, whale, volume);
    expect(stress).toBeGreaterThanOrEqual(0);
    expect(stress).toBeLessThanOrEqual(100);
    // 50*0.5 + 80*0.3 + 30*0.2 = 25 + 24 + 6 = 55
    expect(stress).toBeCloseTo(55, 0);
  });
});

// --- Options analyzer ---

describe('analyzeOptionsChain', () => {
  const mockData: OptionsData = {
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

  it('computes correct weighted mean for calls', () => {
    const result = analyzeOptionsChain(mockData);
    expect(result.ticker).toBe('IBIT');
    expect(result.expirations).toHaveLength(1);

    const exp = result.expirations[0];
    expect(exp.date).toBe('2026-04-17');

    // Weighted mean calls: (48*1000 + 50*2000 + 52*500) / 3500 = (48000+100000+26000)/3500 = 174000/3500 ≈ 49.71
    expect(exp.calls.weightedMeanStrike).toBeCloseTo(49.71, 1);
    expect(exp.calls.totalVolume).toBe(3500);
    expect(exp.calls.totalOI).toBe(15000);
  });

  it('computes correct put/call ratio', () => {
    const result = analyzeOptionsChain(mockData);
    const exp = result.expirations[0];
    // puts vol = 2000, calls vol = 3500 → ratio ≈ 0.571
    expect(exp.pcRatio).toBeCloseTo(0.571, 2);
  });

  it('handles zero volume (no divide-by-zero)', () => {
    const data: OptionsData = {
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
    const result = analyzeOptionsChain(data);
    expect(result.expirations[0].calls.weightedMeanStrike).toBe(0);
    expect(result.expirations[0].pcRatio).toBe(0);
  });
});
