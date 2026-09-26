import type { MiddlewareHandler } from 'hono';
import type { Config } from '../../config';
import { createLogger } from '../../logger';

const log = createLogger('web:auth');

/** Header carrying the bearer token on mutating requests. */
const AUTH_HEADER = 'authorization';
const BEARER = 'Bearer ';

/**
 * Guard for the endpoints that trigger work.
 *
 * Off by default. `API_TOKEN` unset leaves everything open, which is what local
 * development and `docker compose up` want — turning auth on unconditionally
 * would break both for no benefit while the service is not reachable from
 * anywhere.
 *
 * Set the token for any deployment with a public URL. `POST /sync` starts a
 * multi-minute fetch of the whole universe; leaving that open is a cost problem
 * and a fast route to being rate-limited by the upstream data source.
 */
export function requireToken(config: Config): MiddlewareHandler {
  if (!config.authEnabled) {
    log.warn('API_TOKEN not set — trigger endpoints are unauthenticated');
    return async (_c, next) => next();
  }

  log.info('trigger endpoints require a bearer token');

  return async (c, next) => {
    const header = c.req.header(AUTH_HEADER) ?? '';
    const provided = header.startsWith(BEARER) ? header.slice(BEARER.length) : '';

    if (!timingSafeEqual(provided, config.apiToken!)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    return next();
  };
}

/**
 * Compare without leaking length or position through timing.
 *
 * `===` on secrets short-circuits at the first differing byte, which over many
 * requests reveals the token a character at a time. The cost of doing it
 * properly is negligible.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
