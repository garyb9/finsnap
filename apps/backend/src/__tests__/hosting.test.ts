/**
 * Everything here guards one property: the optional pieces are genuinely
 * optional. A missing Telegram token or API token must degrade one feature, not
 * stop the service from starting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { loadConfig, TelegramMode, type Config } from '../config';
import { REDIS_KEYS } from '../constants';
import { requireToken } from '../output/web/auth';
import { RedisStorage } from '../storage/redisStore';
import { SnapStore } from '../storage/snapStore';
import { ReportStore } from '../storage/reportStore';
import type { StoragePort } from '../storage/types';
import type { DailyReport } from '../report/types';
import type { FinSnap } from '../snapshot/types';

const savedEnv = { ...process.env };

function clearOptionalEnv(): void {
  for (const key of [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHANNEL_ID',
    'TELEGRAM_MODE',
    'TELEGRAM_WEBHOOK_URL',
    'TELEGRAM_WEBHOOK_SECRET',
    'API_TOKEN',
  ]) {
    delete process.env[key];
  }
}

describe('config without optional credentials', () => {
  beforeEach(clearOptionalEnv);
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('loads with no Telegram token at all', () => {
    // The regression this guards: the token used to be `z.string().min(1)`, so
    // the whole service refused to start without a bot.
    expect(() => loadConfig()).not.toThrow();
  });

  it('reports Telegram as disabled when credentials are absent', () => {
    expect(loadConfig().telegramEnabled).toBe(false);
  });

  it('treats a token with no channel as disabled', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token';
    expect(loadConfig().telegramEnabled).toBe(false);
  });

  it('treats a channel with no token as disabled', () => {
    process.env.TELEGRAM_CHANNEL_ID = '@channel';
    expect(loadConfig().telegramEnabled).toBe(false);
  });

  it('enables Telegram only when both halves are present', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token';
    process.env.TELEGRAM_CHANNEL_ID = '@channel';
    expect(loadConfig().telegramEnabled).toBe(true);
  });

  it('defaults to polling mode', () => {
    expect(loadConfig().telegramMode).toBe(TelegramMode.Polling);
  });

  it('accepts webhook mode', () => {
    process.env.TELEGRAM_MODE = 'webhook';
    expect(loadConfig().telegramMode).toBe(TelegramMode.Webhook);
  });

  it('rejects an unrecognized Telegram mode instead of guessing', () => {
    process.env.TELEGRAM_MODE = 'carrier-pigeon';
    expect(() => loadConfig()).toThrow(/telegramMode/);
  });

  it('leaves auth disabled when no API token is set', () => {
    expect(loadConfig().authEnabled).toBe(false);
  });

  it('enables auth as soon as a token is set', () => {
    process.env.API_TOKEN = 'secret';
    expect(loadConfig().authEnabled).toBe(true);
  });
});

describe('requireToken', () => {
  function appWith(config: Partial<Config>) {
    const app = new Hono();
    app.on('POST', ['/sync'], requireToken(config as Config));
    app.post('/sync', (c) => c.json({ ok: true }));
    app.get('/sync', (c) => c.json({ read: true }));
    return app;
  }

  const post = (app: Hono, headers: Record<string, string> = {}) =>
    app.fetch(new Request('http://local/sync', { method: 'POST', headers }));

  it('lets everything through when no token is configured', async () => {
    const res = await post(appWith({ authEnabled: false }));
    expect(res.status).toBe(200);
  });

  it('rejects a request with no header when a token is configured', async () => {
    const res = await post(appWith({ authEnabled: true, apiToken: 'secret' }));
    expect(res.status).toBe(401);
  });

  it('rejects the wrong token', async () => {
    const app = appWith({ authEnabled: true, apiToken: 'secret' });
    const res = await post(app, { authorization: 'Bearer wrong!' });
    expect(res.status).toBe(401);
  });

  it('rejects a token of the right length but wrong content', async () => {
    // Guards the length short-circuit in the comparison from being the only
    // check that ever runs.
    const app = appWith({ authEnabled: true, apiToken: 'secret' });
    const res = await post(app, { authorization: 'Bearer sekret' });
    expect(res.status).toBe(401);
  });

  it('rejects a bare token without the Bearer prefix', async () => {
    const app = appWith({ authEnabled: true, apiToken: 'secret' });
    const res = await post(app, { authorization: 'secret' });
    expect(res.status).toBe(401);
  });

  it('accepts the right token', async () => {
    const app = appWith({ authEnabled: true, apiToken: 'secret' });
    const res = await post(app, { authorization: 'Bearer secret' });
    expect(res.status).toBe(200);
  });

  it('leaves reads open even when auth is on', async () => {
    // The dashboard polls GET /sync anonymously; locking it would break the
    // progress panel for a viewer who has no token.
    const app = appWith({ authEnabled: true, apiToken: 'secret' });
    const res = await app.fetch(new Request('http://local/sync'));
    expect(res.status).toBe(200);
  });
});

describe('storage port', () => {
  /** Minimal in-memory adapter — proves the port is implementable without Redis. */
  class MemoryStorage implements StoragePort {
    values = new Map<string, string>();
    lists = new Map<string, string[]>();

    async get(key: string) {
      return this.values.get(key) ?? null;
    }
    async set(key: string, value: string) {
      this.values.set(key, value);
    }
    async listPush(key: string, value: string) {
      this.lists.set(key, [value, ...(this.lists.get(key) ?? [])]);
    }
    async listRange(key: string, limit: number) {
      return (this.lists.get(key) ?? []).slice(0, limit);
    }
    async listTrim(key: string, max: number) {
      this.lists.set(key, (this.lists.get(key) ?? []).slice(0, max));
    }
    async listLength(key: string) {
      return (this.lists.get(key) ?? []).length;
    }
  }

  const snap = { id: 'snap-1', timestamp: '2026-07-29T00:00:00Z' } as FinSnap;
  const report = {
    id: 'rep-1',
    date: '2026-07-28',
    generatedAt: '2026-07-29T08:00:00Z',
  } as DailyReport;

  it('round-trips a snap through a non-Redis adapter', async () => {
    const store = new SnapStore(new MemoryStorage());
    await store.saveSnap(snap);

    expect((await store.getLatest())?.id).toBe('snap-1');
    expect((await store.getById('snap-1'))?.id).toBe('snap-1');
    expect(await store.count()).toBe(1);
  });

  it('round-trips a report and its history', async () => {
    const store = new ReportStore(new MemoryStorage());
    await store.save(report);

    expect((await store.getLatest())?.id).toBe('rep-1');
    expect((await store.getByDate('2026-07-28'))?.id).toBe('rep-1');
    expect(await store.getHistory()).toEqual([
      { id: 'rep-1', date: '2026-07-28', generatedAt: '2026-07-29T08:00:00Z' },
    ]);
  });

  it('returns null rather than throwing on unparseable stored data', async () => {
    const storage = new MemoryStorage();
    const store = new SnapStore(storage);
    await store.saveSnap(snap);
    storage.values.set(REDIS_KEYS.snapLatest, '{ not json');

    expect(await store.getLatest()).toBeNull();
  });

  it('skips a corrupt history entry instead of losing the whole list', async () => {
    const storage = new MemoryStorage();
    const store = new ReportStore(storage);
    await store.save(report);
    await storage.listPush(REDIS_KEYS.reportHistory, 'not json');

    expect(await store.getHistory()).toHaveLength(1);
  });

  it('propagates write failures — a lost report must not be silent', async () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, 'set').mockRejectedValue(new Error('disk full'));

    await expect(new ReportStore(storage).save(report)).rejects.toThrow('disk full');
  });
});

describe('RedisStorage', () => {
  it('translates the port onto Redis commands', async () => {
    const redis = {
      get: vi.fn().mockResolvedValue('value'),
      set: vi.fn().mockResolvedValue('OK'),
      lpush: vi.fn().mockResolvedValue(1),
      lrange: vi.fn().mockResolvedValue(['a']),
      ltrim: vi.fn().mockResolvedValue('OK'),
      llen: vi.fn().mockResolvedValue(3),
    };
    const storage = new RedisStorage(redis as never);

    expect(await storage.get('k')).toBe('value');
    await storage.set('k', 'v', 60);
    expect(redis.set).toHaveBeenCalledWith('k', 'v', 'EX', 60);

    // The port counts entries; Redis wants an inclusive end index.
    await storage.listRange('l', 10);
    expect(redis.lrange).toHaveBeenCalledWith('l', 0, 9);
    await storage.listTrim('l', 10);
    expect(redis.ltrim).toHaveBeenCalledWith('l', 0, 9);
  });

  it('degrades reads to null/empty when Redis is unreachable', async () => {
    const redis = {
      get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      lrange: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      llen: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const storage = new RedisStorage(redis as never);

    expect(await storage.get('k')).toBeNull();
    expect(await storage.listRange('l', 5)).toEqual([]);
    expect(await storage.listLength('l')).toBe(0);
  });
});
