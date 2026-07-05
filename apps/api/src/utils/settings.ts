import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from './logger';

/**
 * Node equivalent of Laravel's `gs()` helper.
 *
 * Laravel:  gs()->wallet, gs()->free_fire_server_url, gs()->enable_auto_topup
 * Node:     const s = await gs(); s.bool('wallet'); s.str('free_fire_server_url')
 *
 * Backed by the `settings` key-value table, cached in-process with a 5-min TTL
 * (and mirrored to Redis when available). Call `clearSettingsCache()` after an
 * admin settings update so changes take effect immediately.
 */

const CACHE_KEY = 'mhgs:settings';
const TTL_MS = 5 * 60 * 1000;

let memoryCache: { map: Record<string, string | null>; expiresAt: number } | null = null;

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

export class Settings {
  constructor(private readonly map: Record<string, string | null>) {}

  str(key: string, fallback = ''): string {
    const v = this.map[key];
    return v === null || v === undefined ? fallback : v;
  }

  bool(key: string, fallback = false): boolean {
    const v = this.map[key];
    if (v === null || v === undefined || v === '') return fallback;
    return TRUTHY.has(String(v).toLowerCase());
  }

  int(key: string, fallback = 0): number {
    const v = Number(this.map[key]);
    return Number.isFinite(v) ? v : fallback;
  }

  raw(): Record<string, string | null> {
    return { ...this.map };
  }
}

async function loadMap(): Promise<Record<string, string | null>> {
  const rows = await prisma.setting.findMany({ select: { key: true, value: true } });
  const map: Record<string, string | null> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

/** Get the settings accessor (cached). */
export async function gs(): Promise<Settings> {
  const now = Date.now();
  if (memoryCache && memoryCache.expiresAt > now) {
    return new Settings(memoryCache.map);
  }

  // Try Redis first, fall back to DB.
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      const map = JSON.parse(cached) as Record<string, string | null>;
      memoryCache = { map, expiresAt: now + TTL_MS };
      return new Settings(map);
    }
  } catch {
    /* Redis optional */
  }

  const map = await loadMap();
  memoryCache = { map, expiresAt: now + TTL_MS };
  redis.set(CACHE_KEY, JSON.stringify(map), 'PX', TTL_MS).catch(() => undefined);
  return new Settings(map);
}

/** Invalidate the settings cache (call after admin updates settings). */
export async function clearSettingsCache(): Promise<void> {
  memoryCache = null;
  try {
    await redis.del(CACHE_KEY);
  } catch {
    /* ignore */
  }
  logger.debug('Settings cache cleared');
}
