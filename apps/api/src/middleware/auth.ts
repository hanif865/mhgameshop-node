import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { fail } from '../utils/response';

export interface JwtPayload {
  sub: number; // user id
  role: string;
}

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
    }
  }
}

/** Extract a JWT from the httpOnly cookie or Authorization: Bearer header. */
function extractToken(req: Request): string | null {
  const cookieToken = (req.cookies?.token as string) || null;
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });
}

/** Require a valid, logged-in user. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return fail(res, 'Unauthenticated.', 401);

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, role: true, status: true },
    });
    if (!user) return fail(res, 'Unauthenticated.', 401);
    if (user.status !== 1) return fail(res, 'Account is disabled.', 403);

    req.userId = user.id;
    req.userRole = user.role;
    next();
  } catch {
    return fail(res, 'Invalid or expired token.', 401);
  }
}

/** Require an authenticated admin (used by all /api/admin routes). */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (req.userRole !== 'admin') {
      return fail(res, 'Admin access required.', 403);
    }
    next();
  });
}

/** Attach user if a valid token is present, but never blocks the request. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.userId = decoded.sub;
    req.userRole = decoded.role;
  } catch {
    /* ignore invalid token */
  }
  next();
}
