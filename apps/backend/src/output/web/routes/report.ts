import { compactReport } from '../../../report/compact';
import { createLogger } from '../../../logger';
import { assetKey, parseCount, parseLimit, wantsFullDetail } from '../helpers';
import type { RouteRegistrar } from '../types';

const log = createLogger('web:report');

const DEFAULT_STRATEGIES = 5;
const MAX_STRATEGIES = 30;
const DEFAULT_HISTORY = 30;
const MAX_HISTORY = 180;

/**
 * Daily report routes.
 *
 * The default payload is the compact projection. A full report carries every
 * strategy across every window — the right thing to store, the wrong thing to
 * send by default — so the unabridged form is opt-in via `?detail=full`.
 */
export const registerReportRoutes: RouteRegistrar = (app, { reportStore, scheduler }) => {
  app.get('/report', async (c) => {
    const report = await reportStore.getLatest();
    if (!report) return c.json({ error: 'No report generated yet' }, 404);
    if (wantsFullDetail(c)) return c.json(report);

    const topN = parseCount(c, 'strategies', DEFAULT_STRATEGIES, MAX_STRATEGIES);
    return c.json(compactReport(report, topN));
  });

  app.get('/report/opportunities', async (c) => {
    const report = await reportStore.getLatest();
    if (!report) return c.json({ error: 'No report generated yet' }, 404);

    return c.json({
      id: report.id,
      date: report.date,
      generatedAt: report.generatedAt,
      count: report.topOpportunities.length,
      opportunities: report.topOpportunities,
    });
  });

  app.get('/report/date/:date', async (c) => {
    const report = await reportStore.getByDate(c.req.param('date'));
    if (!report) return c.json({ error: 'No report for that date' }, 404);
    return c.json(wantsFullDetail(c) ? report : compactReport(report));
  });

  app.get('/report/asset/:label', async (c) => {
    const label = assetKey(c.req.param('label'));
    const report = await reportStore.getLatest();
    if (!report) return c.json({ error: 'No report generated yet' }, 404);

    const asset = report.assets.find((a) => a.label === label || a.symbol === label);
    if (!asset) return c.json({ error: `No report data for ${label}` }, 404);

    return c.json({ id: report.id, date: report.date, ...asset });
  });

  app.get('/reports', async (c) => {
    const history = await reportStore.getHistory(parseLimit(c, DEFAULT_HISTORY, MAX_HISTORY));
    return c.json({ count: history.length, reports: history });
  });

  app.post('/report/trigger', async (c) => {
    try {
      log.info('manual report triggered via API');
      return c.json(compactReport(await scheduler.runReport()));
    } catch (err) {
      log.error(`manual report failed: ${err}`);
      return c.json({ error: 'Report generation failed' }, 500);
    }
  });
};
