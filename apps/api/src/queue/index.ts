import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * BullMQ auto-topup queue. Order fulfilment enqueues a job here so the provider
 * call happens off the request thread, with retries and rate limiting handled
 * by the worker (src/queue/worker.ts).
 */
export const QUEUE_NAME = 'auto-topup';

// BullMQ requires maxRetriesPerRequest = null.
export const queueConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

let queue: Queue | null = null;

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: queueConnection });
  }
  return queue;
}

/**
 * Enqueue an auto-topup job. Returns true if it was queued, false if Redis is
 * unreachable (caller then falls back to running inline).
 */
export async function enqueueAutoTopup(orderId: number): Promise<boolean> {
  try {
    await getQueue().add(
      'process',
      { orderId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    return true;
  } catch (e) {
    logger.warn(`Auto-topup queue unavailable, running inline: ${(e as Error).message}`);
    return false;
  }
}
