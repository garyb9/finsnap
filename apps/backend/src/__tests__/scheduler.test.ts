import { describe, it, expect, vi } from 'vitest';
import { SnapScheduler } from '../scheduler/cron';
import type { Config } from '../config';
import type { SnapBuilder } from '../snapshot/builder';
import type { ReportBuilder } from '../report/builder';
import type { SnapStore } from '../storage/snapStore';
import type { ReportStore } from '../storage/reportStore';
import type { TelegramOutput } from '../output/telegram';

function fakeConfig(): Config {
  return {
    snapCron: '0 * * * *',
    reportCron: '0 8 * * 1-5',
    reportTimezone: 'UTC',
  } as Config;
}

function fakeTelegram(): TelegramOutput {
  return {
    publishSnap: vi.fn(),
    publishReport: vi.fn(),
    publishAlert: vi.fn(),
  } as unknown as TelegramOutput;
}

describe('SnapScheduler scheduled-failure alerting', () => {
  it('alerts ops and swallows the error when a scheduled snap run fails', async () => {
    const telegram = fakeTelegram();
    const builder = { build: vi.fn().mockRejectedValue(new Error('yahoo down')) };
    const store = { getLatest: vi.fn(), saveSnap: vi.fn() };
    const scheduler = new SnapScheduler(
      fakeConfig(),
      builder as unknown as SnapBuilder,
      {} as ReportBuilder,
      store as unknown as SnapStore,
      {} as ReportStore,
      telegram
    );

    await expect(scheduler.runSnapScheduled()).resolves.toBeUndefined();
    expect(telegram.publishAlert).toHaveBeenCalledTimes(1);
    expect(telegram.publishAlert).toHaveBeenCalledWith(expect.stringContaining('snap'));
    expect(telegram.publishAlert).toHaveBeenCalledWith(expect.stringContaining('yahoo down'));
  });

  it('does not alert when the scheduled snap run succeeds', async () => {
    const telegram = fakeTelegram();
    const snap = { id: 'snap-1' };
    const builder = { build: vi.fn().mockResolvedValue(snap) };
    const store = { getLatest: vi.fn(), saveSnap: vi.fn().mockResolvedValue(undefined) };
    const scheduler = new SnapScheduler(
      fakeConfig(),
      builder as unknown as SnapBuilder,
      {} as ReportBuilder,
      store as unknown as SnapStore,
      {} as ReportStore,
      telegram
    );

    await scheduler.runSnapScheduled();
    expect(telegram.publishAlert).not.toHaveBeenCalled();
  });

  it('alerts ops and swallows the error when a scheduled report run fails', async () => {
    const telegram = fakeTelegram();
    const reportBuilder = { build: vi.fn().mockRejectedValue(new Error('db unreachable')) };
    const reportStore = { getLatest: vi.fn(), save: vi.fn() };
    const scheduler = new SnapScheduler(
      fakeConfig(),
      {} as SnapBuilder,
      reportBuilder as unknown as ReportBuilder,
      {} as SnapStore,
      reportStore as unknown as ReportStore,
      telegram
    );

    await expect(scheduler.runReportScheduled()).resolves.toBeUndefined();
    expect(telegram.publishAlert).toHaveBeenCalledTimes(1);
    expect(telegram.publishAlert).toHaveBeenCalledWith(expect.stringContaining('report'));
    expect(telegram.publishAlert).toHaveBeenCalledWith(expect.stringContaining('db unreachable'));
  });

  it('does not alert when the scheduled report run succeeds', async () => {
    const telegram = fakeTelegram();
    const report = { id: 'report-1' };
    const reportBuilder = { build: vi.fn().mockResolvedValue(report) };
    const reportStore = { getLatest: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
    const scheduler = new SnapScheduler(
      fakeConfig(),
      {} as SnapBuilder,
      reportBuilder as unknown as ReportBuilder,
      {} as SnapStore,
      reportStore as unknown as ReportStore,
      telegram
    );

    await scheduler.runReportScheduled();
    expect(telegram.publishAlert).not.toHaveBeenCalled();
  });
});
