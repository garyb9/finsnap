import { createLogger } from '../logger';
import {
  STORAGE_KEYS,
  REPORT_HISTORY_MAX,
  REPORT_LATEST_TTL_SECONDS,
  REPORT_TTL_SECONDS,
} from '../constants';
import type { DailyReport, ReportMeta } from '../report/types';
import type { StoragePort } from './types';

const log = createLogger('report-store');

/**
 * Persistence for daily reports.
 *
 * Written against `StoragePort`, not against Redis, so moving reports to
 * Postgres is a new adapter rather than a rewrite of this class.
 */
export class ReportStore {
  constructor(private storage: StoragePort) {}

  async save(report: DailyReport): Promise<void> {
    const json = JSON.stringify(report);
    const meta: ReportMeta = {
      id: report.id,
      date: report.date,
      generatedAt: report.generatedAt,
    };

    try {
      await this.storage.set(`${STORAGE_KEYS.report}:${report.id}`, json, REPORT_TTL_SECONDS);
      // Also keyed by trading date, so a session can be looked up directly.
      await this.storage.set(`${STORAGE_KEYS.reportDate}:${report.date}`, json, REPORT_TTL_SECONDS);
      await this.storage.set(STORAGE_KEYS.reportLatest, json, REPORT_LATEST_TTL_SECONDS);
      await this.storage.listPush(STORAGE_KEYS.reportHistory, JSON.stringify(meta));
      await this.storage.listTrim(STORAGE_KEYS.reportHistory, REPORT_HISTORY_MAX);
      log.info(`saved report ${report.id} (${report.date})`);
    } catch (err) {
      log.error(`failed to save report ${report.id}: ${err}`);
      throw err;
    }
  }

  async getLatest(): Promise<DailyReport | null> {
    return this.read(STORAGE_KEYS.reportLatest);
  }

  async getById(id: string): Promise<DailyReport | null> {
    return this.read(`${STORAGE_KEYS.report}:${id}`);
  }

  async getByDate(date: string): Promise<DailyReport | null> {
    return this.read(`${STORAGE_KEYS.reportDate}:${date}`);
  }

  async getHistory(limit = 30): Promise<ReportMeta[]> {
    const raw = await this.storage.listRange(STORAGE_KEYS.reportHistory, limit);
    return raw.flatMap((entry) => {
      try {
        return [JSON.parse(entry) as ReportMeta];
      } catch {
        // One corrupt entry should cost that entry, not the whole history.
        log.warn('skipping unparseable report history entry');
        return [];
      }
    });
  }

  private async read(key: string): Promise<DailyReport | null> {
    const raw = await this.storage.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as DailyReport;
    } catch (err) {
      log.warn(`failed to parse report at ${key}: ${err}`);
      return null;
    }
  }
}
