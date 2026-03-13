import { describe, it, expect } from 'vitest';
import type { FinSnap } from '../snapshot/types';

// Minimal FinSnap for shape testing
function makeSnap(overrides: Partial<FinSnap> = {}): FinSnap {
  return {
    id: '01HZ000000000000000000000',
    timestamp: new Date().toISOString(),
    blockHeight: 21_000_000,
    version: '1.0',
    onChain: {
      whale: { count: 2, totalValueEth: 450, transfers: [], energyScore: 30 },
      gas: { averageGwei: 25.5, trend: 'stable', congestionScore: 15 },
      volume: { txCount: 2000, totalValueEth: 8000, intensityScore: 40 },
      networkStress: 25,
    },
    equities: {
      IBIT: {
        price: 55.25,
        expirations: [
          {
            date: '2026-04-17',
            pcRatio: 0.72,
            calls: {
              totalVolume: 3500,
              totalOI: 15000,
              weightedMeanStrike: 57.5,
              weightedStdStrike: 2.1,
            },
            puts: {
              totalVolume: 2520,
              totalOI: 9000,
              weightedMeanStrike: 53.2,
              weightedStdStrike: 1.8,
            },
          },
        ],
      },
    },
    signals: {
      networkStress: 25,
      whaleEnergy: 30,
      volumeIntensity: 40,
      gasCongestion: 15,
      overallSentiment: 28,
    },
    ...overrides,
  };
}

describe('FinSnap shape', () => {
  it('has all required top-level fields', () => {
    const snap = makeSnap();
    expect(snap).toHaveProperty('id');
    expect(snap).toHaveProperty('timestamp');
    expect(snap).toHaveProperty('blockHeight');
    expect(snap).toHaveProperty('version', '1.0');
    expect(snap).toHaveProperty('onChain');
    expect(snap).toHaveProperty('equities');
    expect(snap).toHaveProperty('signals');
  });

  it('signals overallSentiment is in 0-100 range', () => {
    const snap = makeSnap();
    expect(snap.signals.overallSentiment).toBeGreaterThanOrEqual(0);
    expect(snap.signals.overallSentiment).toBeLessThanOrEqual(100);
  });

  it('can be serialized to JSON without error (no BigInt)', () => {
    const snap = makeSnap();
    expect(() => JSON.stringify(snap)).not.toThrow();
  });

  it('has correct equities structure', () => {
    const snap = makeSnap();
    expect(snap.equities['IBIT']).toBeDefined();
    expect(snap.equities['IBIT'].price).toBe(55.25);
    expect(snap.equities['IBIT'].expirations).toHaveLength(1);
    expect(snap.equities['IBIT'].expirations[0]).toHaveProperty('pcRatio');
    expect(snap.equities['IBIT'].expirations[0]).toHaveProperty('calls');
    expect(snap.equities['IBIT'].expirations[0]).toHaveProperty('puts');
  });

  it('onChain scores are in 0-100 range', () => {
    const snap = makeSnap();
    expect(snap.onChain.whale.energyScore).toBeGreaterThanOrEqual(0);
    expect(snap.onChain.whale.energyScore).toBeLessThanOrEqual(100);
    expect(snap.onChain.gas.congestionScore).toBeGreaterThanOrEqual(0);
    expect(snap.onChain.gas.congestionScore).toBeLessThanOrEqual(100);
    expect(snap.onChain.volume.intensityScore).toBeGreaterThanOrEqual(0);
    expect(snap.onChain.volume.intensityScore).toBeLessThanOrEqual(100);
    expect(snap.onChain.networkStress).toBeGreaterThanOrEqual(0);
    expect(snap.onChain.networkStress).toBeLessThanOrEqual(100);
  });

  it('options leg stats are non-negative', () => {
    const snap = makeSnap();
    const exp = snap.equities['IBIT'].expirations[0];
    expect(exp.calls.totalVolume).toBeGreaterThanOrEqual(0);
    expect(exp.calls.totalOI).toBeGreaterThanOrEqual(0);
    expect(exp.calls.weightedMeanStrike).toBeGreaterThanOrEqual(0);
    expect(exp.puts.totalVolume).toBeGreaterThanOrEqual(0);
  });
});
