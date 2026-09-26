import type { RouteRegistrar } from '../types';

/** Endpoint map returned from `/`, kept next to the routes it documents. */
const ENDPOINTS: Record<string, string> = {
  'GET /snap': 'Latest live snapshot',
  'GET /snap/:label': 'Live snapshot for one asset',
  'GET /snaps?limit=N': 'Snapshot history',
  'POST /snap/trigger': 'Trigger a fresh snapshot',
  'GET /report': 'Latest daily report (compact)',
  'GET /report?detail=full': 'Latest daily report with every window',
  'GET /report/date/:date': 'Report for a trading date (YYYY-MM-DD)',
  'GET /report/asset/:label': 'Full backtest detail for one asset',
  'GET /report/opportunities': "Today's fired entries and exits",
  'GET /reports?limit=N': 'Report history metadata',
  'POST /report/trigger': 'Rebuild the daily report now',
  'GET /strategies': 'Strategy registry, windows and universe',
  'GET /guide': 'Field guide — what each asset, strategy and metric means',
  'POST /sync': 'Refresh every asset, then rebuild the snapshot and report',
  'GET /sync': 'Progress of the current or last sync',
  'POST /universe/:symbol':
    'Search a ticker in — tracked for 24h, same as the rest of the universe',
  'POST /telegram/webhook': 'Telegram update sink (webhook mode only)',
  'GET /health': 'Health check',
};

export const registerRootRoutes: RouteRegistrar = (app) => {
  app.get('/', (c) =>
    c.json({
      name: 'FinSnap',
      description: 'Price-action snapshots and multi-strategy backtests for BTC and equities',
      endpoints: ENDPOINTS,
    })
  );
};
