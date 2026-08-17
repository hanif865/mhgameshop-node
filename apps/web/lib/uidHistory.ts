'use client';

/**
 * অন-ডিভাইস UID (Player ID) মেমরি।
 *
 * লগইন-করা ইউজারদের আগের আইডি সার্ভারে সেভ থাকে (saved-accounts), কিন্তু গেস্ট
 * অবস্থায় কিছু মনে থাকে না — এবং ফোনের নেটিভ কিবোর্ড এই ফিল্ডে কিছু সাজেস্ট করে না
 * (ইনপুট নেটিভ form-submit নয়)। তাই শেষ কয়েকটা Player ID localStorage-এ রেখে
 * চেকআউটের ইনপুটে <datalist> সাজেশন হিসেবে দেখাই — গেস্ট/লগইন উভয়েই কাজ করে।
 *
 * নিরাপত্তা: শুধু player_id রাখা হয় — password/সিক্রেট কাস্টম ফিল্ড কখনোই নয়।
 * গেম ভেদে UID আলাদা হলেও datalist prefix-match করে, তাই একটাই global তালিকা রাখি।
 */
const KEY = 'mhgs:uid-history';
const MAX = 5;

export function readUidHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// নতুন UID সবার উপরে বসাই (dedup), সর্বোচ্চ MAX রাখি; হালনাগাদ তালিকা ফেরাই।
export function rememberUid(uid: string): string[] {
  const id = uid.trim();
  if (typeof window === 'undefined' || !id) return readUidHistory();
  const next = [id, ...readUidHistory().filter((x) => x !== id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* কোটা পূর্ণ / প্রাইভেট মোড — চুপচাপ উপেক্ষা */
  }
  return next;
}
