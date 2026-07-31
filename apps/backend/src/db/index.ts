import { Pool } from 'pg';
import { createLogger } from '../logger';

const log = createLogger('db');

let pool: Pool | null = null;

export function getDb(url: string): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: url });
    pool.on('error', (err) => log.error(`pool error: ${err.message}`));
    log.info('connected');
  }

  return pool;
}

export async function disconnectDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export { runMigrations } from './migrate';
