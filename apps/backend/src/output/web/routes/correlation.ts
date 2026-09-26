import { createLogger } from '../../../logger';
import { wait } from '../../../lib/async';
import { YAHOO_CALL_DELAY_MS } from '../../../constants';
import { BarCollector } from '../../../collectors/bars';
import type { BarsStore } from '../../../storage/barsStore';
import { BarInterval, type BarSeries } from '../../../collectors/types';
import { dropIncompleteBar } from '../../../backtest/runner';
import {
  buildCorrelationMatrix,
  CORRELATION_WINDOWS,
  DEFAULT_CORRELATION_WINDOW,
  type CorrelationSeries,
} from '../../../analyzers/correlation';
import type { RouteRegistrar } from '../types';

const log = createLogger('web:correlation');

/**
 * Fetch one interval for the whole universe, sequentially.
 *
 * `fetchUniverse` on `BarCollector` pulls all three intervals per symbol,
 * which is more than this route needs. A network fetch only happens when a
 * symbol's cache is cold or stale, so the artificial spacing between calls
 * only fires then too — on the common case, where the scheduler already
 * warmed every symbol's daily cache, this loop is back-to-back cache reads.
 */
async function fetchDailyUniverse(
  barsStore: BarsStore,
  symbols: string[]
): Promise<Map<string, BarSeries>> {
  let lastWasNetwork = false;
  const collector = new BarCollector(barsStore, (event) => {
    lastWasNetwork = !event.cached;
  });

  const out = new Map<string, BarSeries>();

  for (const [i, symbol] of symbols.entries()) {
    if (i > 0 && lastWasNetwork) await wait(YAHOO_CALL_DELAY_MS);
    lastWasNetwork = false;

    const series = await collector.fetchSeries(symbol, BarInterval.Daily);
    if (series) out.set(symbol, series);
  }

  return out;
}

/** Cross-asset price correlation, built from the same daily bars the backtests run on. */
export const registerCorrelationRoutes: RouteRegistrar = (app, { config, barsStore }) => {
  app.get('/correlation', async (c) => {
    const requested = c.req.query('window') ?? DEFAULT_CORRELATION_WINDOW;
    const window =
      CORRELATION_WINDOWS.find((w) => w.id === requested) ??
      CORRELATION_WINDOWS.find((w) => w.id === DEFAULT_CORRELATION_WINDOW)!;

    try {
      const bars = await fetchDailyUniverse(
        barsStore,
        config.universe.map((s) => s.symbol)
      );

      const series: CorrelationSeries[] = config.universe
        .map((spec) => {
          const daily = bars.get(spec.symbol);
          if (!daily) return null;
          return {
            symbol: spec.symbol,
            label: spec.label,
            category: spec.category,
            bars: dropIncompleteBar(daily).bars,
          };
        })
        .filter((s): s is CorrelationSeries => s !== null);

      if (series.length === 0) {
        return c.json({ error: 'No bar history available yet' }, 404);
      }

      return c.json(buildCorrelationMatrix(series, window));
    } catch (err) {
      log.error(`correlation build failed: ${err}`);
      return c.json({ error: 'Correlation build failed' }, 500);
    }
  });
};
