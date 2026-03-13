import Redis from 'ioredis';
import { createLogger } from './logger';

const log = createLogger('redis');

let client: Redis | null = null;

export function getRedis(url: string): Redis {
  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 500, 5000);
        log.warn(`reconnecting (attempt ${times}, next in ${delay}ms)...`);
        return delay;
      },
    });

    client.on('connect', () => log.info('connected'));
    client.on('error', (err) => log.error(`connection error: ${err.message}`));
  }

  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
