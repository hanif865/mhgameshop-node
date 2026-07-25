import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/database';
import { env, isProd } from '../config/env';
import { passport } from '../config/passport';
import { signToken, requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../middleware/error';
import { authLimiter } from '../middleware/rateLimiter';
import { ok, created } from '../utils/response';
import { attachReferrer } from '../services/referral.service';

const router = Router();

const COOKIE_NAME = 'token';
// secure cookies require HTTPS; over plain HTTP (IP-only) set COOKIE_SECURE=false.
const COOKIE_SECURE = env.COOKIE_SECURE ?? isProd;
function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SECURE ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function publicUser(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
    balance: u.balance,
    role: u.role,
  };
}

// ---- Register ----
const registerSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  // রেফার কোড (ঐচ্ছিক) — ভুল হলেও রেজিস্ট্রেশন আটকাবে না
  ref: z.string().trim().max(32).optional(),
});

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password, ref } = registerSchema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new HttpError(409, 'Email is already registered.');

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role: 'user' },
    });

    // রেফার কোড থাকলে রেফারার বসাই (ভেতরে নিজেই এরর সামলায়)
    await attachReferrer(user.id, ref);

    const token = signToken({ sub: user.id, role: user.role });
    setAuthCookie(res, token);
    return created(res, { user: publicUser(user), token }, 'Registration successful.');
  }),
);

// ---- Login ----
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) throw new HttpError(401, 'Invalid credentials.');
    if (user.status !== 1) throw new HttpError(403, 'Account is disabled.');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new HttpError(401, 'Invalid credentials.');

    const token = signToken({ sub: user.id, role: user.role });
    setAuthCookie(res, token);
    return ok(res, { user: publicUser(user), token }, 'Login successful.');
  }),
);

// ---- Google OAuth ----
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${env.WEB_URL}/auth/login?error=google`,
  }),
  (req, res) => {
    const u = req.user as { id: number; role: string; isNew?: boolean };
    const token = signToken({ sub: u.id, role: u.role });
    setAuthCookie(res, token);
    // Hand the token to the web app so NextAuth can persist it too.
    const newParam = u.isNew ? '&new=1' : '';
    res.redirect(`${env.WEB_URL}/auth/callback?token=${token}${newParam}`);
  },
);

// ---- Logout ----
router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  return ok(res, null, 'Logged out.');
});

// ---- Me ----
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) throw new HttpError(404, 'User not found.');
    return ok(res, { user: publicUser(user) });
  }),
);

export default router;
