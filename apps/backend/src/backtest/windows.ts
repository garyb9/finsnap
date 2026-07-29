import type { Bar } from '../collectors/types';
import { DAY_MS, MIN_WINDOW_BARS } from '../constants';
import type { Signal, WindowSpec } from './types';

export { DAILY_WINDOWS, INTRADAY_WINDOWS, MIN_WINDOW_BARS } from '../constants';

export interface WindowSlice {
  spec: WindowSpec;
  bars: Bar[];
  signals: Signal[];
}

/**
 * Slice bars and their pre-computed signals into named lookback windows.
 *
 * Signals are sliced alongside the bars rather than recomputed, so indicators
 * keep the warm-up they earned from the full history — a 1-month window can
 * still evaluate a 200-day moving average correctly.
 *
 * Windows that resolve to the same span as full history are dropped as
 * duplicates, which is what keeps a young ticker like IBIT from reporting
 * identical "10y", "5y" and "max" rows.
 */
export function buildWindows(bars: Bar[], signals: Signal[], specs: WindowSpec[]): WindowSlice[] {
  if (bars.length === 0) return [];

  const lastTime = bars[bars.length - 1].time;
  const slices: WindowSlice[] = [];
  const seenLengths = new Set<number>();

  for (const spec of specs) {
    const startIndex = findStartIndex(bars, spec, lastTime);
    if (startIndex < 0) continue;

    const windowBars = bars.slice(startIndex);
    if (windowBars.length < MIN_WINDOW_BARS) continue;
    if (seenLengths.has(windowBars.length)) continue;

    seenLengths.add(windowBars.length);
    slices.push({ spec, bars: windowBars, signals: signals.slice(startIndex) });
  }

  return slices;
}

/** First bar index inside the window, or -1 when the window has no coverage. */
function findStartIndex(bars: Bar[], spec: WindowSpec, lastTime: number): number {
  if (spec.days === null) return 0;
  const cutoff = lastTime - spec.days * DAY_MS;
  return bars.findIndex((bar) => bar.time >= cutoff);
}
