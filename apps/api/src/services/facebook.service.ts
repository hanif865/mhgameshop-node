import { createHash } from 'crypto';
import { redis } from '../config/redis';
import { gs } from '../utils/settings';
import { logger } from '../utils/logger';

/**
 * Facebook Conversions API (CAPI) — সার্ভার-সাইড ইভেন্ট।
 *
 * ব্রাউজার Pixel (fbevents.js) একা iOS/অ্যাডব্লক/কুকি-লসে অনেক ইভেন্ট হারায়।
 * এখান থেকে সার্ভার সরাসরি Facebook-এ ইভেন্ট পাঠায় — একই `event_id` দিলে
 * Facebook ব্রাউজার+সার্ভার dedup করে, তাই ডাবল-কাউন্ট হয় না, ম্যাচ-কোয়ালিটি
 * বাড়ে। পুরোটা fire-and-forget: config না থাকলে/কল ব্যর্থ হলেও অর্ডার-ফ্লো
 * কখনো ব্লক বা ভাঙে না।
 *
 * Config সব DB settings-এ: fb_pixel_enabled / fb_pixel_id /
 * fb_capi_access_token (সার্ভার-অনলি সিক্রেট) / fb_test_event_code (ঐচ্ছিক)।
 */

const GRAPH_VERSION = 'v19.0';
const CURRENCY = 'BDT';
const FBCTX_TTL_SECONDS = 60 * 60 * 24; // অর্ডার তৈরি → পেমেন্ট ফেরত, ২৪ঘণ্টা যথেষ্ট

/** অর্ডার তৈরির সময় (POST /api/orders) ধরা ম্যাচ-সিগন্যাল — Redis-এ ক্ষণস্থায়ী। */
export interface FbTracking {
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null; // _fbp কুকি
  fbc?: string | null; // _fbc কুকি
  eventSourceUrl?: string | null;
}

interface CapiUserData {
  email?: string | null;
  phone?: string | null;
  externalId?: string | number | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

interface CapiEvent {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string | null;
  userData: CapiUserData;
  customData?: Record<string, unknown>;
}

/** Meta যেভাবে চায়: trim + lowercase → SHA-256 hex। PII কখনো প্লেইনে পাঠাই না। */
function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * ফোন নরমালাইজ — শুধু ডিজিট, দেশ-কোডসহ (Meta-র নিয়ম)। BD লোকাল "01…" (১১ ডিজিট)
 * হলে সামনে "880" বসাই যাতে ম্যাচ-কোয়ালিটি বাড়ে; আগে থেকেই কোড থাকলে অক্ষত।
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `880${digits.slice(1)}`;
  return digits;
}

/** raw ইউজার-ডেটা → Meta user_data (em/ph/external_id হ্যাশ, বাকিগুলো plain)। */
function buildUserData(u: CapiUserData): Record<string, unknown> {
  const ud: Record<string, unknown> = {};
  if (u.email) ud.em = [sha256(u.email)];
  if (u.phone) {
    const ph = normalizePhone(u.phone);
    if (ph) ud.ph = [sha256(ph)];
  }
  if (u.externalId !== null && u.externalId !== undefined && String(u.externalId) !== '') {
    ud.external_id = [sha256(String(u.externalId))];
  }
  if (u.clientIp) ud.client_ip_address = u.clientIp;
  if (u.clientUserAgent) ud.client_user_agent = u.clientUserAgent;
  if (u.fbp) ud.fbp = u.fbp;
  if (u.fbc) ud.fbc = u.fbc;
  return ud;
}

/**
 * একটি CAPI ইভেন্ট পাঠায়। disabled/config খালি হলে no-op। পুরোটা try/catch —
 * কল ব্যর্থ হলেও কলার কখনো throw পায় না।
 */
export async function sendCapiEvent(event: CapiEvent): Promise<void> {
  try {
    const s = await gs();
    if (!s.bool('fb_pixel_enabled')) return;

    const pixelId = s.str('fb_pixel_id').trim();
    const token = s.str('fb_capi_access_token').trim();
    if (!pixelId || !token) return;

    const testCode = s.str('fb_test_event_code').trim();

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: event.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: event.eventId,
          action_source: 'website',
          ...(event.eventSourceUrl ? { event_source_url: event.eventSourceUrl } : {}),
          user_data: buildUserData(event.userData),
          ...(event.customData ? { custom_data: event.customData } : {}),
        },
      ],
      ...(testCode ? { test_event_code: testCode } : {}),
    };

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn(`FB CAPI ${event.eventName} failed (${res.status}): ${text.slice(0, 300)}`);
    } else {
      logger.debug(`✓ FB CAPI ${event.eventName} sent (event_id=${event.eventId})`);
    }
  } catch (e) {
    logger.warn(`FB CAPI ${event.eventName} error: ${(e as Error).message}`);
  }
}

/** অর্ডার তৈরির সময়ের ম্যাচ-সিগন্যাল Redis-এ রাখি (গেটওয়ে ফেরার পথে ব্যবহারের জন্য)। */
export async function storeFbContext(
  orderId: number,
  tracking: FbTracking | null | undefined,
): Promise<void> {
  if (!tracking) return;
  try {
    await redis.set(`mhgs:fbctx:${orderId}`, JSON.stringify(tracking), 'EX', FBCTX_TTL_SECONDS);
  } catch {
    /* Redis optional — ম্যাচ-সিগন্যাল ছাড়াও CAPI email/id দিয়ে কাজ করবে */
  }
}

async function readFbContext(orderId: number): Promise<FbTracking> {
  try {
    const raw = await redis.get(`mhgs:fbctx:${orderId}`);
    if (raw) return JSON.parse(raw) as FbTracking;
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * প্রতিটি সফল পেইড অর্ডারে Purchase (Model A) — wallet বা instant-pay, সব
 * প্রোডাক্ট-টাইপে। value = অর্ডারের টাকা, currency = BDT। event_id ব্রাউজার
 * Purchase-এর সাথে হুবহু মেলে (`purchase_order_<id>`) → Facebook dedup করে।
 *
 * loadOrder-এর রিলেশনসহ order অবজেক্ট নেয় (circular import এড়াতে সরাসরি অবজেক্ট
 * পাস করা হয়, এখান থেকে order.service ইমপোর্ট করি না)।
 */
export async function firePurchaseForOrder(order: any): Promise<void> {
  if (!order) return;
  const ctx = await readFbContext(order.id);
  const contentName =
    order.variation?.title ?? order.comboPackage?.title ?? order.product?.title ?? 'Order';

  await sendCapiEvent({
    eventName: 'Purchase',
    eventId: `purchase_order_${order.id}`,
    eventSourceUrl: ctx.eventSourceUrl,
    userData: {
      email: order.user?.email,
      phone: order.user?.phone,
      externalId: order.userId,
      clientIp: ctx.clientIp,
      clientUserAgent: ctx.userAgent,
      fbp: ctx.fbp,
      fbc: ctx.fbc,
    },
    customData: {
      value: Number(order.amount),
      currency: CURRENCY,
      content_type: 'product',
      content_ids: [String(order.productId)],
      content_name: contentName,
    },
  });
}

/**
 * ওয়ালেট ডিপোজিট → আলাদা কাস্টম ইভেন্ট `AddFunds` (Purchase নয়)। Model A অনুযায়ী
 * ওয়ালেট-ফান্ডেড অর্ডারে Purchase আলাদা করে ফায়ার হয়, তাই ডিপোজিটকে Purchase
 * ধরলে ডাবল-কাউন্ট হত — সেটা এড়াতে এটা আলাদা সিগন্যাল। gateway/webhook context,
 * তাই fbp/fbc নেই; em + external_id দিয়ে ম্যাচ।
 */
export async function fireAddFundsForDeposit(deposit: any): Promise<void> {
  if (!deposit) return;
  await sendCapiEvent({
    eventName: 'AddFunds',
    eventId: `addfunds_deposit_${deposit.id}`,
    userData: {
      email: deposit.user?.email,
      phone: deposit.user?.phone,
      externalId: deposit.userId,
    },
    customData: {
      value: Number(deposit.amount),
      currency: CURRENCY,
    },
  });
}
