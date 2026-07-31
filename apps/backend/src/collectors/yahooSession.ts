import { createLogger } from '../logger';
import {
  YAHOO_COOKIE_URL,
  YAHOO_CRUMB_TTL_SECONDS,
  YAHOO_CRUMB_URL,
  YAHOO_USER_AGENT,
} from '../constants';
import { MemoCache } from '../lib/memoCache';

const log = createLogger('yahoo-session');

export interface YahooSession {
  cookie: string;
  crumb: string;
  fetchedAt: number;
}

const cache = new MemoCache<YahooSession>();
const CACHE_KEY = 'session';

/** Node 18+ exposes getSetCookie(); fall back to the single-header form. */
function readCookies(response: Response): string {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] };
  const raw =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [response.headers.get('set-cookie') ?? ''].filter(Boolean);

  return raw
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

/**
 * Fetch + cache a Yahoo Finance session (consent cookie + crumb), valid ~24h.
 * Shared by the options-chain and bar collectors so only one handshake is paid.
 */
export async function getYahooSession(): Promise<YahooSession | null> {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  try {
    const consent = await fetch(YAHOO_COOKIE_URL, {
      headers: { 'User-Agent': YAHOO_USER_AGENT, Accept: '*/*' },
      redirect: 'follow',
    });
    const cookie = readCookies(consent);

    const crumbResponse = await fetch(YAHOO_CRUMB_URL, {
      headers: { 'User-Agent': YAHOO_USER_AGENT, Cookie: cookie, Accept: 'text/plain' },
    });

    if (!crumbResponse.ok) {
      log.warn(`crumb fetch failed: HTTP ${crumbResponse.status}`);
      return null;
    }

    const crumb = (await crumbResponse.text()).trim();
    if (!crumb || crumb.length < 3) {
      log.warn('received empty/invalid crumb');
      return null;
    }

    const session: YahooSession = { cookie, crumb, fetchedAt: Date.now() };
    cache.set(CACHE_KEY, session, YAHOO_CRUMB_TTL_SECONDS);

    log.info(`session acquired (crumb: ${crumb.slice(0, 6)}...)`);
    return session;
  } catch (err) {
    log.warn(`failed to acquire session: ${err}`);
    return null;
  }
}

/** Apply session cookie + crumb to a Yahoo request URL and headers. */
export function withSession(
  url: string,
  session: YahooSession | null
): { url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = {
    'User-Agent': YAHOO_USER_AGENT,
    Accept: 'application/json',
  };

  if (!session) return { url, headers };

  headers['Cookie'] = session.cookie;
  const separator = url.includes('?') ? '&' : '?';
  return { url: `${url}${separator}crumb=${encodeURIComponent(session.crumb)}`, headers };
}
