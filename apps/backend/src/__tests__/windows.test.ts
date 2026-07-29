import { describe, it, expect } from 'vitest';
import {
  buildWindows,
  DAILY_WINDOWS,
  INTRADAY_WINDOWS,
  MIN_WINDOW_BARS,
} from '../backtest/windows';
import { WindowId, type WindowSpec } from '../backtest/types';
import { barsFromCloses, risingCloses } from './helpers/bars';

const SPECS: WindowSpec[] = [
  { id: WindowId.Max, label: 'Max history', days: null },
  { id: WindowId.Y1, label: '1 year', days: 365 },
  { id: WindowId.M3, label: '3 months', days: 91 },
];

describe('buildWindows', () => {
  it('returns nothing for an empty series', () => {
    expect(buildWindows([], [], SPECS)).toEqual([]);
  });

  it('slices signals alongside bars so warm-up is preserved', () => {
    const bars = barsFromCloses(risingCloses(800));
    const signals = bars.map((_, i) => (i % 2 === 0 ? 1 : 0));
    const slices = buildWindows(bars, signals, SPECS);

    for (const slice of slices) {
      expect(slice.signals).toHaveLength(slice.bars.length);
    }
  });

  it('preserves signal alignment after slicing', () => {
    const bars = barsFromCloses(risingCloses(800));
    // Mark each signal with its own index so misalignment is detectable.
    const signals = bars.map((_, i) => i);
    const slice = buildWindows(bars, signals, SPECS).find((s) => s.spec.id === WindowId.M3)!;

    const offset = bars.length - slice.bars.length;
    expect(slice.signals[0]).toBe(offset);
    expect(slice.bars[0].time).toBe(bars[offset].time);
  });

  it('orders windows longest first', () => {
    const bars = barsFromCloses(risingCloses(800));
    const slices = buildWindows(
      bars,
      bars.map(() => 0),
      SPECS
    );
    const lengths = slices.map((s) => s.bars.length);
    expect([...lengths].sort((a, b) => b - a)).toEqual(lengths);
  });

  it('drops windows that duplicate the full history', () => {
    // 200 bars of daily data cannot fill a 1-year window distinctly from max.
    const bars = barsFromCloses(risingCloses(200));
    const slices = buildWindows(
      bars,
      bars.map(() => 0),
      SPECS
    );
    const ids = slices.map((s) => s.spec.id);

    expect(ids).toContain(WindowId.Max);
    expect(ids).not.toContain(WindowId.Y1);
  });

  it('drops windows with too few bars to be meaningful', () => {
    const bars = barsFromCloses(risingCloses(800));
    // A 3-day window on daily bars can never clear the minimum bar count.
    const tiny: WindowSpec[] = [{ id: WindowId.M1, label: '3 days', days: 3 }];
    expect(
      buildWindows(
        bars,
        bars.map(() => 0),
        tiny
      )
    ).toEqual([]);
  });

  it('keeps the 1-month window, which is only ~21 sessions on equities', () => {
    const bars = barsFromCloses(risingCloses(3_000, 100, 0.05));
    const monthly = buildWindows(
      bars,
      bars.map(() => 0),
      [{ id: WindowId.M1, label: '1 month', days: 30 }]
    );
    expect(monthly).toHaveLength(1);
  });

  it('never returns a window below the minimum bar count', () => {
    const bars = barsFromCloses(risingCloses(3_000));
    const slices = buildWindows(
      bars,
      bars.map(() => 0),
      DAILY_WINDOWS
    );
    expect(slices.every((s) => s.bars.length >= MIN_WINDOW_BARS)).toBe(true);
  });

  it('yields several distinct windows given deep history', () => {
    // ~12 years of daily bars should populate most of the daily window set.
    const bars = barsFromCloses(risingCloses(3_000, 100, 0.05));
    const slices = buildWindows(
      bars,
      bars.map(() => 0),
      DAILY_WINDOWS
    );

    const ids = slices.map((s) => s.spec.id);
    expect(ids).toContain(WindowId.Max);
    expect(ids).toContain(WindowId.Y5);
    expect(ids).toContain(WindowId.Y1);
    expect(ids).toContain(WindowId.M1);
    // 20y exceeds the available history, so it collapses into max and is dropped.
    expect(ids).not.toContain(WindowId.Y20);
  });
});

describe('window definitions', () => {
  it('declares unique ids', () => {
    for (const specs of [DAILY_WINDOWS, INTRADAY_WINDOWS]) {
      const ids = specs.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('starts with the unbounded max window', () => {
    expect(DAILY_WINDOWS[0].days).toBeNull();
    expect(INTRADAY_WINDOWS[0].days).toBeNull();
  });

  it('orders bounded windows from longest to shortest', () => {
    const days = DAILY_WINDOWS.slice(1).map((s) => s.days!);
    expect([...days].sort((a, b) => b - a)).toEqual(days);
  });
});
