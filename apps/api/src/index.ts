import http from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import { env } from './config/env';
import { prisma } from './config/database';
import { connectRedis } from './config/redis';
import { initSocket } from './config/socket';
import { logger } from './utils/logger';
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler, notFound } from './middleware/error';
import { configurePassport, passport } from './config/passport';
import { ensureSpinTable } from './services/spin.service';

import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import depositRoutes from './routes/deposits';
import webhookRoutes from './routes/webhook';
import userRoutes from './routes/user';
import uidCheckerRoutes from './routes/uid-checker';
import adminRoutes from './routes/admin';
import publicRoutes from './routes/public';
import botRoutes from './routes/bot';

const app = express();

app.set('trust proxy', 1);

// ---- Security & parsing ----
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: [env.WEB_URL, env.ADMIN_URL],
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---- Passport (Google OAuth, stateless) ----
configurePassport();
app.use(passport.initialize());

// Serve uploaded files (product/slider images) — Phase 3 writes here.
app.use('/storage', express.static('public/storage'));

// ---- Health check ----
app.get('/api/health', async (_req, res) => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  res.json({ success: true, data: { status: 'ok', db, uptime: process.uptime() } });
});

// ---- API routes ----
app.use('/api', generalLimiter);
app.use('/api', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/webhook', webhookRoutes);
// Also served at root so the licensed domain (mhgameshop.com/uddoktapay*) can
// reach them via the Caddy proxy.
app.use('/', webhookRoutes);
app.use('/api/user', userRoutes);
app.use('/api/uid-checker', uidCheckerRoutes);
app.use('/api/admin', adminRoutes);
// Telegram top-up bot (server-to-server, X-Bot-Key auth)
app.use('/api/bot', botRoutes);

// ---- 404 + error handling ----
app.use(notFound);
app.use(errorHandler);

// ---- Boot ----
async function bootstrap() {
  await connectRedis();
  await ensureSpinTable().catch((e) => logger.error('spin table ensure failed: ' + e.message));

  const server = http.createServer(app);
  initSocket(server); // attach Socket.io

  server.listen(env.PORT, () => {
    logger.info(`🚀 API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Force-exit if not closed within 10s.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) =>
    logger.error(`Unhandled rejection: ${String(reason)}`),
  );
  process.on('uncaughtException', (err) => logger.error(`Uncaught exception: ${err.stack}`));
}

bootstrap().catch((err) => {
  logger.error(`Failed to start API: ${err.stack || err}`);
  process.exit(1);
});

export { app };
