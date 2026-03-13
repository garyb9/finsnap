import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type Redis from 'ioredis';
import type { OptionsData } from '../collectors/types';

// Mock fetch globally before imports
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after stubbing globals (via dynamic import in beforeAll)
let fetchOptionsData: (ticker: string, redis: Redis) => Promise<OptionsData | null>;

beforeAll(async () => {
  const module = await import('../collectors/options');
  fetchOptionsData = module.fetchOptionsData;
});

// Minimal mock Redis — typed to satisfy the Redis interface used by fetchOptionsData
function makeMockRedis(cachedValue: string | null = null): Pick<Redis, 'get' | 'set'> {
  return {
    get: vi.fn().mockResolvedValue(cachedValue),
    set: vi.fn().mockResolvedValue('OK'),
  };
}

// Yahoo Finance options API response shape
function makeYahooResponse(expirationDates: number[] = []) {
  return {
    optionChain: {
      result: [
        {
          underlyingSymbol: 'IBIT',
          expirationDates,
          quote: { regularMarketPrice: 55.25 },
          options: [
            {
              expirationDate: expirationDates[0] ?? 1_745_539_200,
              calls: [
                { strike: 50, volume: 1000, openInterest: 5000 },
                { strike: 55, volume: 2500, openInterest: 8000 },
                { strike: 60, volume: 300, openInterest: 1500 },
              ],
              puts: [
                { strike: 50, volume: 800, openInterest: 3000 },
                { strike: 55, volume: 1200, openInterest: 4500 },
              ],
            },
          ],
        },
      ],
    },
  };
}

describe('fetchOptionsData', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns OptionsData with correct structure on success', async () => {
    const expTs = 1_745_539_200; // 2025-04-25 in unix
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeYahooResponse([expTs]),
    });

    const redis = makeMockRedis(null);
    const result = await fetchOptionsData('IBIT', redis as unknown as Redis);

    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('IBIT');
    expect(result!.price).toBe(55.25);
    expect(result!.chains).toHaveLength(1);
    expect(result!.chains[0].calls).toHaveLength(3);
    expect(result!.chains[0].puts).toHaveLength(2);
    expect(result!.chains[0].calls[0].strike).toBe(50);
    expect(result!.chains[0].calls[0].volume).toBe(1000);
  });

  it('returns cached data from Redis if available', async () => {
    const cached = JSON.stringify({
      ticker: 'IBIT',
      price: 54.0,
      chains: [],
      fetchedAt: Date.now(),
    });

    const redis = makeMockRedis(cached);
    const result = await fetchOptionsData('IBIT', redis as unknown as Redis);

    // Should NOT call fetch since cached
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result!.ticker).toBe('IBIT');
    expect(result!.price).toBe(54.0);
  });

  it('returns null when fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const redis = makeMockRedis(null);
    const result = await fetchOptionsData('BADTICKER', redis as unknown as Redis);

    expect(result).toBeNull();
  });

  it('normalizes missing volume/OI to 0', async () => {
    const expTs = 1_745_539_200;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        optionChain: {
          result: [
            {
              expirationDates: [expTs],
              quote: { regularMarketPrice: 10 },
              options: [
                {
                  expirationDate: expTs,
                  calls: [{ strike: 10 }], // no volume or OI
                  puts: [],
                },
              ],
            },
          ],
        },
      }),
    });

    const redis = makeMockRedis(null);
    const result = await fetchOptionsData('TEST', redis as unknown as Redis);

    expect(result!.chains[0].calls[0].volume).toBe(0);
    expect(result!.chains[0].calls[0].openInterest).toBe(0);
  });
});
