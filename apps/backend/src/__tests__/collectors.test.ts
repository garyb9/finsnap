import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { OptionsData } from '../collectors/types';
import type { OptionsStore } from '../storage/optionsStore';

// Mock fetch globally before imports
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after stubbing globals (via dynamic import in beforeAll)
let fetchOptionsData: (ticker: string, optionsStore: OptionsStore) => Promise<OptionsData | null>;

beforeAll(async () => {
  const module = await import('../collectors/options');
  fetchOptionsData = module.fetchOptionsData;
});

function makeOptionsStore(): { store: OptionsStore; upsertSnapshot: ReturnType<typeof vi.fn> } {
  const upsertSnapshot = vi.fn().mockResolvedValue(undefined);
  return { store: { upsertSnapshot } as unknown as OptionsStore, upsertSnapshot };
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

  it('returns OptionsData with correct structure on success, and archives a snapshot', async () => {
    const expTs = 1_745_539_200; // 2025-04-25 in unix
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeYahooResponse([expTs]),
    });

    const { store, upsertSnapshot } = makeOptionsStore();
    const result = await fetchOptionsData('IBIT-FRESH', store);

    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('IBIT-FRESH');
    expect(result!.price).toBe(55.25);
    expect(result!.chains).toHaveLength(1);
    expect(result!.chains[0].calls).toHaveLength(3);
    expect(result!.chains[0].puts).toHaveLength(2);
    expect(result!.chains[0].calls[0].strike).toBe(50);
    expect(result!.chains[0].calls[0].volume).toBe(1000);

    // A real fetch archives a daily snapshot of what it just fetched.
    expect(upsertSnapshot).toHaveBeenCalledTimes(1);
    expect(upsertSnapshot).toHaveBeenCalledWith(result);
  });

  it('serves a second call from the in-process cache, with no network call and no re-archive', async () => {
    const expTs = 1_745_539_200;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeYahooResponse([expTs]),
    });

    const { store, upsertSnapshot } = makeOptionsStore();
    const first = await fetchOptionsData('IBIT-CACHED', store);

    mockFetch.mockReset();
    upsertSnapshot.mockClear();

    const second = await fetchOptionsData('IBIT-CACHED', store);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(upsertSnapshot).not.toHaveBeenCalled();
    expect(second).toEqual(first);
  });

  it('returns null when fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const { store } = makeOptionsStore();
    const result = await fetchOptionsData('BADTICKER', store);

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

    const { store } = makeOptionsStore();
    const result = await fetchOptionsData('TEST', store);

    expect(result!.chains[0].calls[0].volume).toBe(0);
    expect(result!.chains[0].calls[0].openInterest).toBe(0);
  });
});
