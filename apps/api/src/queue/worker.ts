import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { QUEUE_NAME } from './index';
import { loadOrder, runAutoTopup, cancelAndRefundAutoTopup } from '../services/order.service';
import {
  ensureLikeSubscriptionsTable,
  runDueLikeSubscriptions,
} from '../services/like-subscription.service';

/**
 * Auto-topup worker. Run as a separate process:  npm run worker  (dev)
 *
 * - Processes one job at a time with a rate limit (1 job / second) to avoid
 *   hammering the provider.
 * - Retries up to 3 times (configured on the job); on final failure the order
 *   is cancelled and the customer refunded.
 */
const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job<{ orderId: number }>) => {
    const { orderId } = job.data;
    const order = await loadOrder(orderId);
    if (!order) {
      logger.warn(`Worker: order ${orderId} not found`);
      return;
    }
    await runAutoTopup(order);
  },
  {
    connection,
    concurrency: 1,
    limiter: { max: 1, duration: 1000 }, // 1 job/sec
  },
);

worker.on('completed', (job) => {
  logger.info(`✓ Auto-topup job ${job.id} completed (order ${job.data.orderId})`);
});

worker.on('failed', async (job, err) => {
  if (!job) return;
  logger.error(`✗ Auto-topup job ${job.id} failed: ${err.message}`);
  // Final attempt exhausted → cancel & refund.
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
    logger.warn(`Auto-topup exhausted retries for order ${job.data.orderId} — refunding`);
    await cancelAndRefundAutoTopup(job.data.orderId).catch((e) =>
      logger.error(`Refund failed: ${e.message}`),
    );
  }
});

logger.info('🛠  Auto-topup worker started');

// ---------------------------------------------------------------------------
// Auto-like subscription scheduler (মাসিক/সাপ্তাহিক প্যাকেজ)।
// প্রতি ১০ মিনিটে due (next_run_at <= now) সাবস্ক্রিপশনের আজকের লাইক পাঠায়।
// ফিক্সড ডেলিভারি-টাইম হওয়ায় ঠিক মিনিটে না চললেও সমস্যা নেই — টিক পরে ধরে ফেলে।
// ---------------------------------------------------------------------------
const LIKE_SUB_TICK_MS = 10 * 60 * 1000;

async function likeSubTick() {
  try {
    await runDueLikeSubscriptions();
  } catch (e) {
    logger.error(`LikeSub scheduler tick failed: ${(e as Error).message}`);
  }
}

let likeSubTimer: NodeJS.Timeout | undefined;
ensureLikeSubscriptionsTable()
  .then(() => {
    // বুটের একটু পরে প্রথম টিক (down-time এ miss হওয়া ডেলিভারি ধরতে), তারপর প্রতি ১০ মিনিটে।
    setTimeout(likeSubTick, 15_000);
    likeSubTimer = setInterval(likeSubTick, LIKE_SUB_TICK_MS);
    logger.info('🗓️  Like-subscription scheduler started (every 10m)');
  })
  .catch((e) => logger.error('like_subscriptions ensure failed: ' + e.message));

process.on('SIGTERM', async () => {
  if (likeSubTimer) clearInterval(likeSubTimer);
  await worker.close();
  process.exit(0);
});
