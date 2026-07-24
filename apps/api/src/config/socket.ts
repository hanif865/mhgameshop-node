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
      // লগইন করা নেই — অতিথি (ভিজিটর) হিসেবে গুনি। কোনো রুমে ঢোকে না,
      // তাই অর্ডার/ব্যালান্সের কোনো ডেটা পায় না, শুধু গণনায় আসে।
      socket.join('guests');
      broadcastOnline();
      socket.on('disconnect', () => setImmediate(broadcastOnline));
      return;
    }

    socket.join(`user:${payload.sub}`);
    if (payload.role === 'admin') socket.join('admins');
    logger.debug(`Socket connected: user ${payload.sub} (${payload.role})`);

    // অনলাইন সংখ্যা বদলাল — অ্যাডমিনদের জানাই
    broadcastOnline();
    socket.on('disconnect', () => {
      // disconnect হ্যান্ডলারে রুম ছাড়ার পর গুনতে হয়, তাই এক টিক পরে
      setImmediate(broadcastOnline);
    });
  });

  logger.info('✓ Socket.io initialized');
  return io;
}

export function getIO(): IOServer | null {
  return io;
}

/**
 * এখন কতজন ইউজার অনলাইন। প্রতিটা লগইন করা ক্লায়েন্ট `user:{id}` রুমে
 * থাকে, তাই আলাদা রুম গুনলেই আলাদা ইউজার পাওয়া যায় (একজনের একাধিক
 * ট্যাব খোলা থাকলেও একবারই গোনা হয়)।
 */
export function onlineUsers(): { count: number; userIds: number[] } {
  if (!io) return { count: 0, userIds: [] };
  const userIds: number[] = [];
  for (const [room] of io.sockets.adapter.rooms) {
    if (!room.startsWith('user:')) continue;
    const id = Number(room.slice(5));
    if (Number.isInteger(id)) userIds.push(id);
  }
  return { count: userIds.length, userIds };
}

/** লগইন ছাড়া কতজন সাইটে আছে (অতিথি/ভিজিটর)। */
export function onlineGuests(): number {
  if (!io) return 0;
  return io.sockets.adapter.rooms.get('guests')?.size ?? 0;
}

/** অ্যাডমিনদের লাইভ অনলাইন সংখ্যা পাঠাই। */
export function broadcastOnline(): void {
  if (!io) return;
  io.to('admins').emit('users:online', { count: onlineUsers().count, guests: onlineGuests() });
}
