import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection.
 *
 * The auth JWT is an httpOnly cookie set by the API on its own domain, so it is
 * NOT readable here (Next middleware only sees cookies on the web domain). The
 * authoritative guard therefore lives client-side in app/user/layout.tsx, which
 * checks the session and redirects unauthenticated users to /auth/login.
 *
 * This middleware is kept as the single place to add same-domain checks / edge
 * redirects later (e.g. if you move to a same-domain cookie or NextAuth).
 */
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/user/:path*'],
};
