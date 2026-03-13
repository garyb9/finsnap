import { createLogger } from '../logger';

const log = createLogger('coingecko');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const ETH_COIN_ID = 'ethereum';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 6_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string): Promise<unknown> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });

    if (res.ok) return res.json();

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
      log.warn(`rate limited, retrying in ${backoff / 1000}s...`);
      await wait(backoff);
      continue;
    }

    const body = await res.text();
    log.warn(`request failed (${res.status}): ${body} — skipping`);
    return null;
  }

  log.warn('max retries exceeded — skipping');
  return null;
}

/** Fetch current ETH price in USD using the simple price endpoint */
export async function fetchEthPrice(): Promise<number | null> {
  const url = `${COINGECKO_BASE}/simple/price?ids=${ETH_COIN_ID}&vs_currencies=usd`;
  const data = (await fetchWithRetry(url)) as Record<string, Record<string, number>> | null;
  if (!data) return null;
  return data?.[ETH_COIN_ID]?.usd ?? null;
}
