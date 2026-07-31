/**
 * Integration tests — hit real Yahoo Finance + run real calcs.
 *
 * Skipped by default. Run with:
 *   INTEGRATION=true yarn vitest run src/__tests__/integration/
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { fetchOptionsData } from '../../collectors/options';
import { analyzeOptionsChain } from '../../analyzers/options';
import type { OptionsStore } from '../../storage/optionsStore';

const INTEGRATION = process.env.INTEGRATION === 'true';

// No-op archive store — these tests only care about the fetch/analysis path.
const noopOptionsStore = { upsertSnapshot: async () => {} } as unknown as OptionsStore;

describe.skipIf(!INTEGRATION)('options integration — Yahoo Finance fetch', () => {
  const TICKER = 'IBIT';
  let rawData: Awaited<ReturnType<typeof fetchOptionsData>>;

  beforeAll(async () => {
    rawData = await fetchOptionsData(TICKER, noopOptionsStore);
  }, 60_000); // generous timeout for real HTTP

  it('fetches options data successfully', () => {
    expect(rawData).not.toBeNull();
    expect(rawData!.ticker).toBe(TICKER);
    expect(rawData!.price).toBeGreaterThan(0);
    expect(rawData!.chains.length).toBeGreaterThan(0);
  });

  it('returns multiple expiration chains', () => {
    expect(rawData!.chains.length).toBeGreaterThanOrEqual(3);
  });

  it('each chain has calls and puts with valid strikes', () => {
    for (const chain of rawData!.chains) {
      expect(chain.expiration).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(chain.calls.length).toBeGreaterThan(0);
      expect(chain.puts.length).toBeGreaterThan(0);
      for (const c of chain.calls) {
        expect(c.strike).toBeGreaterThan(0);
        expect(c.volume).toBeGreaterThanOrEqual(0);
        expect(c.openInterest).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('attaches a description (Yahoo longName or fallback)', () => {
    expect(rawData!.description).toBeTruthy();
  });
});

describe.skipIf(!INTEGRATION)('options integration — analysis calcs', () => {
  const TICKER = 'IBIT';
  let rawData: Awaited<ReturnType<typeof fetchOptionsData>>;

  beforeAll(async () => {
    rawData = await fetchOptionsData(TICKER, noopOptionsStore);
  }, 60_000);

  it('analyzeOptionsChain returns valid analysis shape', () => {
    expect(rawData).not.toBeNull();
    const analysis = analyzeOptionsChain(rawData!);
    expect(analysis.ticker).toBe(TICKER);
    expect(analysis.expirations.length).toBeGreaterThan(0);
  });

  it('each expiration has valid stats', () => {
    const analysis = analyzeOptionsChain(rawData!);
    for (const exp of analysis.expirations) {
      expect(exp.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(exp.pcRatio).toBeGreaterThanOrEqual(0);
      expect(exp.calls.totalVolume).toBeGreaterThanOrEqual(0);
      expect(exp.calls.weightedMeanStrike).toBeGreaterThan(0);
      expect(exp.puts.totalVolume).toBeGreaterThanOrEqual(0);
    }
  });

  it('insight labels are valid enum values', () => {
    const VALID_LABELS = ['call_stack', 'put_stack', 'soft_call', 'soft_put', 'balanced', 'thin'];
    const analysis = analyzeOptionsChain(rawData!);
    for (const exp of analysis.expirations) {
      if (exp.insight) {
        expect(VALID_LABELS).toContain(exp.insight.label);
        expect(exp.insight.skewScore).toBeTypeOf('number');
        expect(exp.insight.wallStrike).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('soft walls fire for mid-range skew scores', () => {
    const analysis = analyzeOptionsChain(rawData!);
    // Just verify soft labels are possible and well-formed if they appear
    const softExps = analysis.expirations.filter(
      (e) => e.insight?.label === 'soft_call' || e.insight?.label === 'soft_put'
    );
    for (const exp of softExps) {
      expect(Math.abs(exp.insight!.skewScore)).toBeGreaterThanOrEqual(0.08);
      expect(exp.insight!.wallStrike).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!INTEGRATION)('options integration — multiple tickers', () => {
  const TICKERS = ['SPY', 'QQQ', 'GLD'];

  for (const ticker of TICKERS) {
    it(`fetches and analyses ${ticker}`, async () => {
      const data = await fetchOptionsData(ticker, noopOptionsStore);
      expect(data).not.toBeNull();
      expect(data!.price).toBeGreaterThan(0);
      expect(data!.chains.length).toBeGreaterThan(0);

      const analysis = analyzeOptionsChain(data!);
      expect(analysis.ticker).toBe(ticker);
      expect(analysis.expirations.length).toBeGreaterThan(0);
    }, 60_000);
  }
});
