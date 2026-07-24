'use client';

import { usePresence } from '@/lib/socket';

/**
 * সাইট খোলা থাকলে একটা socket সংযোগ ধরে রাখে, যাতে অ্যাডমিন ড্যাশবোর্ডে
 * "কে অনলাইন / কত ভিজিটর" দেখা যায়। কিছু রেন্ডার করে না।
 */
export function Presence() {
  usePresence();
  return null;
}
