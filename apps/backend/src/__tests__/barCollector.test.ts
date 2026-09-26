import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { Bar } from '../collectors/types';
import { BarInterval } from '../constants/enums';
import type { BarsStore } from '../storage/barsStore';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

let BarCollector: typeof import('../collectors/bars').BarCollector;

beforeAll(async () => {
  ({ BarCollector } = await import('../collectors/bars'));
});

const DAY_MS = 24 * 60 * 60 * 1000;

function chartResponse(times: number[], closes: number[]) {
  return {
    chart: {
      result: [
        {
          meta: { dataGranularity: '1d' },
          timestamp: times.map((t) => Math.floor(t / 1000)),
          indicators: {
            quote: [
              {
                open: closes,
                high: closes,
                low: closes,
                close: closes,
                volume: closes.map(() => 1000),
              },
            ],
          },
        },
      ],
    },
  };
}

/** Queues one chart response per successive chart request; the last queued one repeats. */
function installFetchMock(batches: { times: number[]; closes: number[] }[]) {
  let call = 0;
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('fc.yahoo.com')) {
      return { ok: true, headers: { getSetCookie: () => ['session=abc; Path=/'] } };
    }
    if (url.includes('getcrumb')) {
      return { ok: true, text: async () => 'test-crumb' };
    }
    const batch = batches[Math.min(call, batches.length - 1)];
    call++;
    return { ok: true, json: async () => chartResponse(batch.times, batch.closes) };
  });
}

function chartUrls(): string[] {
  return mockFetch.mock.calls
    .map(([url]: [string]) => url)
    .filter((url) => url.includes('/chart/'));
}

/** In-memory double for BarsStore — mirrors upsert-with-retention semantics closely enough to test against. */
function makeBarsStore() {
  const raw = new Map<string, Bar[]>();

  const getBars = vi.fn(
    async (symbol: string, interval: BarInterval) => raw.get(`${symbol}:${interval}`) ?? []
  );

  const upsertBars = vi.fn(
    async (symbol: string, interval: BarInterval, bars: Bar[], retentionCutoffMs?: number) => {
      const key = `${symbol}:${interval}`;
      const merged = new Map((raw.get(key) ?? []).map((b) => [b.time, b] as const));
      for (const b of bars) merged.set(b.time, b);
      let out = Array.from(merged.values()).sort((a, b) => a.time - b.time);
      if (retentionCutoffMs != null) out = out.filter((b) => b.time >= retentionCutoffMs);
      raw.set(key, out);
    }
  );

  return { barsStore: { getBars, upsertBars } as unknown as BarsStore, getBars, upsertBars, raw };
}

describe('BarCollector', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetches full available history on the first-ever sync for a symbol/interval', async () => {
    installFetchMock([{ times: [0, DAY_MS, 2 * DAY_MS], closes: [100, 101, 102] }]);
    const { barsStore, upsertBars } = makeBarsStore();
    const events: Array<{ cached: boolean; ok: boolean }> = [];
    const collector = new BarCollector(barsStore, (e) => events.push(e));

    const series = await collector.fetchSeries('AAA-FIRST', BarInterval.Daily);

    expect(series?.bars).toHaveLength(3);
    expect(chartUrls()[0]).toContain('period1=0');
    expect(upsertBars).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ cached: false, ok: true });
  });

  it('serves a throttled second call from the store, with no Yahoo request', async () => {
    installFetchMock([{ times: [0, DAY_MS], closes: [100, 101] }]);
    const { barsStore } = makeBarsStore();
    const collector = new BarCollector(barsStore);

    await collector.fetchSeries('AAA-THROTTLE', BarInterval.Daily);
    const afterFirst = chartUrls().length;

    const second = await collector.fetchSeries('AAA-THROTTLE', BarInterval.Daily);

    expect(chartUrls().length).toBe(afterFirst);
    expect(second?.bars).toHaveLength(2);
  });

  it('force bypasses the throttle but requests only the delta since the last stored bar', async () => {
    // Bars 30 days apart so the 5-day overlap buffer stays clearly positive and distinct from period1=0.
    installFetchMock([
      { times: [0, 30 * DAY_MS, 60 * DAY_MS], closes: [100, 101, 102] },
      // Realistic: a period1=55d request returns everything Yahoo has from 55d
      // onward, including a fresh copy of the existing 60d bar.
      { times: [60 * DAY_MS, 65 * DAY_MS], closes: [102, 103] },
    ]);
    const { barsStore } = makeBarsStore();
    const collector = new BarCollector(barsStore);

    await collector.fetchSeries('AAA-FORCE', BarInterval.Daily);
    const series = await collector.fetchSeries('AAA-FORCE', BarInterval.Daily, { force: true });

    const secondUrl = chartUrls()[1];
    const period1 = Number(new URL(secondUrl).searchParams.get('period1'));
    // since = lastBarTime(60d) - overlap(5d) = 55d, in seconds.
    expect(period1).toBe((55 * DAY_MS) / 1000);
    expect(series?.bars.map((b) => b.time)).toEqual([0, 30 * DAY_MS, 60 * DAY_MS, 65 * DAY_MS]);
  });

  it('supersedes rather than duplicates a bar revised inside the overlap window', async () => {
    installFetchMock([
      { times: [0, 30 * DAY_MS, 60 * DAY_MS], closes: [100, 101, 102] },
      // Re-fetch of the overlap window: revises the 60d close and adds two new bars.
      { times: [55 * DAY_MS, 60 * DAY_MS, 90 * DAY_MS], closes: [102.5, 999, 103] },
    ]);
    const { barsStore } = makeBarsStore();
    const collector = new BarCollector(barsStore);

    await collector.fetchSeries('AAA-OVERLAP', BarInterval.Daily);
    const series = await collector.fetchSeries('AAA-OVERLAP', BarInterval.Daily, { force: true });

    expect(series?.bars.map((b) => b.time)).toEqual([
      0,
      30 * DAY_MS,
      55 * DAY_MS,
      60 * DAY_MS,
      90 * DAY_MS,
    ]);
    expect(series?.bars.find((b) => b.time === 60 * DAY_MS)?.close).toBe(999);
  });

  it('passes a retention cutoff to the store for intraday intervals, but not for daily', async () => {
    const { barsStore, upsertBars } = makeBarsStore();
    const collector = new BarCollector(barsStore);

    installFetchMock([{ times: [Date.now() - DAY_MS], closes: [50] }]);
    await collector.fetchSeries('AAA-CUTOFF-DAILY', BarInterval.Daily);
    expect(upsertBars.mock.calls[0][3]).toBeUndefined();

    installFetchMock([{ times: [Date.now() - DAY_MS], closes: [50] }]);
    await collector.fetchSeries('AAA-CUTOFF-HOURLY', BarInterval.Hourly);
    expect(upsertBars.mock.calls[1][3]).toEqual(expect.any(Number));
  });

  it('actually removes rows past the retention window from the store', async () => {
    const { barsStore, raw } = makeBarsStore();
    const now = Date.now();
    const oldTime = now - 800 * DAY_MS;
    raw.set('AAA-PRUNE:1h', [{ time: oldTime, open: 1, high: 1, low: 1, close: 1, volume: 1 }]);

    // Realistic full-range response: still includes the old bar (unchanged)
    // plus a new recent one, exactly like Yahoo would for a period1 this old.
    installFetchMock([{ times: [oldTime, now - DAY_MS], closes: [1, 50] }]);
    const collector = new BarCollector(barsStore);

    await collector.fetchSeries('AAA-PRUNE', BarInterval.Hourly, { force: true });

    // Hourly retention is 730 days — an 800-day-old bar falls outside it, even
    // though Yahoo still happily served it back.
    const stored = await barsStore.getBars('AAA-PRUNE', BarInterval.Hourly);
    expect(stored.some((b) => b.time === oldTime)).toBe(false);
  });

  it('falls back to stored history when the Yahoo fetch fails, rather than returning nothing', async () => {
    const { barsStore, raw } = makeBarsStore();
    raw.set('AAA-FALLBACK:1d', [{ time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 }]);

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('fc.yahoo.com')) return { ok: true, headers: { getSetCookie: () => [] } };
      if (url.includes('getcrumb')) return { ok: true, text: async () => 'crumb' };
      return { ok: false, status: 500 };
    });

    const events: Array<{ cached: boolean; ok: boolean }> = [];
    const collector = new BarCollector(barsStore, (e) => events.push(e));

    const series = await collector.fetchSeries('AAA-FALLBACK', BarInterval.Daily, { force: true });

    expect(series?.bars).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ cached: true, ok: true });
  });

  it('returns null when there is no stored history and the fetch fails', async () => {
    const { barsStore } = makeBarsStore();

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('fc.yahoo.com')) return { ok: true, headers: { getSetCookie: () => [] } };
      if (url.includes('getcrumb')) return { ok: true, text: async () => 'crumb' };
      return { ok: false, status: 500 };
    });

    const collector = new BarCollector(barsStore);
    const series = await collector.fetchSeries('AAA-EMPTY', BarInterval.Daily, { force: true });

    expect(series).toBeNull();
  });
});
