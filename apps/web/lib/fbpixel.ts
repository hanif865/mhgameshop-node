'use client';

/**
 * ব্রাউজার Pixel-এর নিরাপদ হেল্পার। fbevents.js লোড না হলে/অ্যাডব্লক থাকলে
 * চুপচাপ no-op — কখনো থ্রো করে না। eventId দিলে Facebook ব্রাউজার+সার্ভার
 * (CAPI) dedup করে, তাই একই ইভেন্ট দুই দিক থেকে গেলেও একবারই গোনা হয়।
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function fbTrack(
  event: string,
  data?: Record<string, unknown>,
  eventId?: string,
): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  try {
    if (eventId) window.fbq('track', event, data ?? {}, { eventID: eventId });
    else window.fbq('track', event, data ?? {});
  } catch {
    /* pixel এখনো রেডি নয় — উপেক্ষা */
  }
}

/** _fbp / _fbc কুকি পড়ি — অর্ডার POST-এ পাঠালে সার্ভার CAPI ম্যাচ-কোয়ালিটি বাড়ে। */
export function getFbCookies(): { fbp?: string; fbc?: string } {
  if (typeof document === 'undefined') return {};
  const read = (name: string): string | undefined => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : undefined;
  };
  const fbp = read('_fbp');
  const fbc = read('_fbc');
  return { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) };
}
