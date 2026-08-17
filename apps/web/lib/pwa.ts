'use client';

import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA ইনস্টলের জন্য শেয়ার্ড স্টোর।
 *
 * `beforeinstallprompt` ইভেন্টটা পেজে একবারই ফায়ার হয় — সেটা এখানে module-scope-এ
 * ধরে রাখি, যাতে গ্লোবাল ইনস্টল-ব্যানার (PWAInstall) এবং হোমের "ইনস্টল করুন" বাটন —
 * দুই জায়গা থেকেই একই deferred ইভেন্ট ব্যবহার করা যায়। আলাদা আলাদা listener রাখলে
 * একটা prompt() করার পর অন্যটা করলে ব্রাউজার এরর দেয় (prompt একবারই চলে); শেয়ার্ড
 * স্টোরে prompt-এর পর deferred সাফ হয় ও দুই UI-ই আপডেট হয়।
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // ডিফল্ট mini-infobar থামিয়ে ইভেন্টটা নিজেরা ধরে রাখি।
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export type InstallState = 'ready' | 'installed' | 'none';

// useSyncExternalStore-এর জন্য স্টেবল primitive snapshot (tearing/hydration-নিরাপদ)।
function getSnapshot(): InstallState {
  if (deferredPrompt) return 'ready';
  if (installed) return 'installed';
  return 'none';
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'none');
}

// নেটিভ ইনস্টল ডায়ালগ দেখাই। deferred না থাকলে 'unavailable' ফেরায়।
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null; // ইভেন্ট একবারই ব্যবহারযোগ্য
  emit();
  return outcome;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}
