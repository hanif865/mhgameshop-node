import rateLimit from 'express-rate-limit';

const message = { success: false, message: 'Too many requests, please slow down.' };

/** General API limiter: 100 requests / minute / IP. */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

/** Auth (login/register) limiter: 5 / minute / IP. */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in a minute.' },
});

/** Order-placement limiter: 10 / minute / IP. */
export const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});
