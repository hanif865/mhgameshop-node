import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Shared Redis connection. Used for caching (products/settings) and, from
 * Phase 6, as the BullMQ backend. `maxRetriesPerRequest: null` keeps it
 * compatible with BullMQ while still working for plain cache reads.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

redis.on('error', (err) => logger.error(`Redis error: ${err.message}`));
redis.on('connect', () => logger.info('✓ Redis connected'));

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (err) {
    logger.warn(`Redis unavailable (caching disabled): ${(err as Error).message}`);
  }
}

export default redis;
