import { CANDIDATE_PAIRS } from '../../../constants/pairs';
import { compactPair } from '../../../report/compact';
import type { RouteRegistrar } from '../types';

/** Reads off the latest report's `pairs` field — the same precomputed-document pattern `/report` follows, nothing recomputed per request. */
export const registerPairsRoutes: RouteRegistrar = (app, { reportStore }) => {
  app.get('/pairs', async (c) => {
    const report = await reportStore.getLatest();
    if (!report) return c.json({ error: 'No report generated yet' }, 404);

    return c.json({
      id: report.id,
      date: report.date,
      candidatesScanned: report.summary.pairsScanned,
      pairs: report.pairs.map(compactPair),
    });
  });

  /** What's on the candidate shortlist, independent of whether it currently passes cointegration. */
  app.get('/pairs/candidates', (c) =>
    c.json({ count: CANDIDATE_PAIRS.length, candidates: CANDIDATE_PAIRS })
  );

  // Two path segments rather than one `pairId` param — "GLD/SLV" as a single
  // segment would collide with the URL's own path separator.
  app.get('/pairs/:legA/:legB', async (c) => {
    const legA = c.req.param('legA').toUpperCase();
    const legB = c.req.param('legB').toUpperCase();
    const report = await reportStore.getLatest();
    if (!report) return c.json({ error: 'No report generated yet' }, 404);

    const pair = report.pairs.find(
      (p) => (p.legA === legA && p.legB === legB) || (p.legA === legB && p.legB === legA)
    );
    if (!pair) return c.json({ error: `No monitored pair matches ${legA}/${legB}` }, 404);

    return c.json({ id: report.id, date: report.date, ...pair });
  });
};
