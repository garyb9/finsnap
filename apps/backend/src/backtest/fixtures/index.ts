import type { Bar } from '../../collectors/types';
import spyDaily from './spyDaily.json';

/**
 * Real market data frozen for the field guide's worked examples (and any test
 * that wants to run a strategy against something that actually happened,
 * rather than a synthetic ramp).
 *
 * Captured from a live FinSnap sync — not generated — and then trimmed and
 * committed so the walkthrough numbers on the guide page never change under a
 * reader, and so `yarn test` never depends on the network or on Redis having
 * anything in it.
 */
export const SPY_DAILY_SAMPLE: Bar[] = spyDaily.t.map((time, i) => ({
  time,
  open: spyDaily.o[i],
  high: spyDaily.h[i],
  low: spyDaily.l[i],
  close: spyDaily.c[i],
  volume: spyDaily.v[i],
}));

export const SPY_DAILY_SAMPLE_META = {
  symbol: spyDaily.symbol,
  startDate: new Date(spyDaily.t[0]).toISOString().slice(0, 10),
  endDate: new Date(spyDaily.t[spyDaily.t.length - 1]).toISOString().slice(0, 10),
  bars: spyDaily.t.length,
};
