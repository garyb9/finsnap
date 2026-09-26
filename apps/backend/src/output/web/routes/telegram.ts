import { TELEGRAM_WEBHOOK_PATH } from '../../telegram';
import type { RouteRegistrar } from '../types';

/** Header Telegram echoes the configured secret back in. */
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/**
 * Webhook endpoint for `TELEGRAM_MODE=webhook`.
 *
 * Always registered, and inert unless the bot is actually running in webhook
 * mode — that way the route table does not change shape with configuration,
 * and a stale webhook registration pointing here gets an honest 404 rather
 * than a silent 200.
 *
 * Telegram retries on non-2xx, so a rejected update must be genuinely rejected
 * and a processed one must return 200 even if a handler inside it failed.
 */
export const registerTelegramRoutes: RouteRegistrar = (app, { telegram }) => {
  app.post(TELEGRAM_WEBHOOK_PATH, async (c) => {
    if (!telegram.verifyWebhookSecret(c.req.header(SECRET_HEADER))) {
      return c.json({ error: 'forbidden' }, 403);
    }

    let update: unknown;
    try {
      update = await c.req.json();
    } catch {
      return c.json({ error: 'invalid payload' }, 400);
    }

    const handled = await telegram.handleUpdate(update);
    if (!handled) return c.json({ error: 'webhook mode not enabled' }, 404);

    return c.body(null, 200);
  });
};
