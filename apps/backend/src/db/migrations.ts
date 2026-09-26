import type { Migration } from './types';

/** Embedded as strings, not loose `.sql` files — the Docker runner stage only copies `dist`. */
export const MIGRATIONS: Migration[] = [
  {
    id: '0001_bars',
    sql: `
      -- One table for every interval (5m/1h/1d). Weekly/monthly/yearly are
      -- never stored here; they're resampled from daily bars at read time.
      CREATE TABLE bars (
        symbol    text NOT NULL,
        interval  text NOT NULL,
        time      bigint NOT NULL,
        open      double precision NOT NULL,
        high      double precision NOT NULL,
        low       double precision NOT NULL,
        close     double precision NOT NULL,
        volume    double precision NOT NULL,
        PRIMARY KEY (symbol, interval, time)
      );
      CREATE INDEX bars_symbol_interval_time_idx ON bars (symbol, interval, time DESC);
    `,
  },
  {
    id: '0002_option_snapshots',
    sql: `
      -- One row per contract per ticker per day; snapshot_date (not the fetch
      -- timestamp) is part of the key so same-day fetches overwrite, not add.
      CREATE TABLE option_snapshots (
        ticker            text NOT NULL,
        expiration        date NOT NULL,
        side              text NOT NULL,
        strike            double precision NOT NULL,
        snapshot_date     date NOT NULL,
        volume            integer NOT NULL,
        open_interest     integer NOT NULL,
        underlying_price  double precision NOT NULL,
        fetched_at        timestamptz NOT NULL,
        PRIMARY KEY (ticker, expiration, side, strike, snapshot_date)
      );
      CREATE INDEX option_snapshots_ticker_date_idx ON option_snapshots (ticker, snapshot_date DESC);
    `,
  },
  {
    id: '0003_kv_storage',
    sql: `
      -- Generic backing for StoragePort (snap/report storage).
      CREATE TABLE kv_entries (
        key         text PRIMARY KEY,
        value       text NOT NULL,
        expires_at  timestamptz NOT NULL
      );
      CREATE TABLE kv_list_entries (
        id          bigserial PRIMARY KEY,
        key         text NOT NULL,
        value       text NOT NULL
      );
      CREATE INDEX kv_list_entries_key_id_idx ON kv_list_entries (key, id DESC);
    `,
  },
  {
    id: '0004_searched_tickers',
    sql: `
      -- Replaces the Redis-backed registry so a user-searched ticker still
      -- survives a restart/redeploy.
      CREATE TABLE searched_tickers (
        symbol      text PRIMARY KEY,
        spec        jsonb NOT NULL,
        expires_at  timestamptz NOT NULL
      );
    `,
  },
];
