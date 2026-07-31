import type { Pool } from 'pg';
import { createLogger } from '../logger';
import { MIGRATIONS } from './migrations';

const log = createLogger('db:migrate');

/** Applies any migration not yet recorded in `schema_migrations`, in order, each in its own transaction. */
export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await pool.query<{ id: string }>('SELECT id FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
      await client.query('COMMIT');
      log.info(`applied migration ${migration.id}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${migration.id} failed: ${err}`);
    } finally {
      client.release();
    }
  }
}
