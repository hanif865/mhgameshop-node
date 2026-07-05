import { Server as HttpServer } from 'http';
import { Server as IOServer, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Socket.io server. Clients authenticate with a JWT (handshake.auth.token or
 * cookie) and are placed into a `user:{id}` room; admins additionally join the
 * `admins` room. Rooms let us push order-status updates to the right client.
 */
let io: IOServer | null = null;

function verify(token?: string): { sub: number; role: string } | null {
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET) as { sub: number; role: string };
  } catch {
    return null;
  }
}

function parseCookie(cookie: string | undefined, name: string): string | undefined {
  if (!cookie) return undefined;
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function initSocket(server: HttpServer): IOServer {
  io = new IOServer(server, {
    cors: { origin: [env.WEB_URL, env.ADMIN_URL], credentials: true },
    path: '/socket.io',
  });

  io.on('connection', (socket: Socket) => {
    const token =
      (socket.handshake.auth?.token as string) ||
      parseCookie(socket.handshake.headers.cookie, 'token');
    const payload = verify(token);

    if (!payload) {
      socket.disconnect(true);
      return;
    }

    socket.join(`user:${payload.sub}`);
    if (payload.role === 'admin') socket.join('admins');
    logger.debug(`Socket connected: user ${payload.sub} (${payload.role})`);
  });

  logger.info('✓ Socket.io initialized');
  return io;
}

export function getIO(): IOServer | null {
  return io;
}
