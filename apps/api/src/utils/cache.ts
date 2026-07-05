import { redis } from '../config/redis';
import { logger } from './logger';

/**
 * Small Redis cache helper. Degrades gracefully to the source function when
 * Redis is unavailable, so caching is always optional.
 */
export async function remember<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    /* redis down — fall through to loader */
  }

  const value = await loader();

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* ignore cache write failure */
  }
  return value;
}

/** Invalidate one or more cache keys (or a prefix pattern ending in "*"). */
export async function forget(...keys: string[]): Promise<void> {
  try {
    for (const key of keys) {
      if (key.endsWith('*')) {
        const found = await redis.keys(key);
        if (found.length) await redis.del(...found);
      } else {
        await redis.del(key);
      }
    }
  } catch (e) {
    logger.warn(`Cache forget failed: ${(e as Error).message}`);
  }
}

export const CACHE_KEYS = {
  products: 'mhgs:cache:products',
  sliders: 'mhgs:cache:sliders',
} as const;

/** Invalidate catalog caches after an admin mutation. */
export async function clearCatalogCache(): Promise<void> {
  await forget(CACHE_KEYS.products, CACHE_KEYS.sliders);
}
