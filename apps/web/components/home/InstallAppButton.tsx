'use client';

import { Download } from 'lucide-react';
import { useInstallState, promptInstall, isIOS, isStandalone } from '@/lib/pwa';
import { useSettings } from '@/lib/settings';
import { useToast } from '@/components/ui/Toast';

// হোমের CTA কার্ড — ক্লিকে PWA ("অ্যাপ") ইনস্টল করায়। ব্রাউজার/প্ল্যাটফর্ম ভেদে
// সঠিক আচরণ: Android/Chrome-Edge → নেটিভ প্রম্পট; iOS Safari → ম্যানুয়াল নির্দেশনা;
// ইতিমধ্যে ইনস্টল/standalone → জানায়; নইলে ব্রাউজার-মেনু হিন্ট।
export function InstallAppButton() {
  const state = useInstallState();
  const { get } = useSettings();
  const toast = useToast();

  // site_name সেটিংয়ে ট্রেইলিং স্পেস থাকতে পারে → trim করে ডাবল-স্পেস এড়াই।
  const appName = `${get('site_name', 'MH Game Shop').trim()} App`;

  async function handleClick() {
    if (state === 'ready') {
      const res = await promptInstall();
      if (res === 'accepted') toast.success('অ্যাপ ইনস্টল হচ্ছে…');
      else if (res === 'unavailable')
        toast.info('ব্রাউজার মেনু (⋮) থেকে "Install app" বেছে নিন');
      return;
    }
    if (state === 'installed' || isStandalone()) {
      toast.info('অ্যাপ ইতিমধ্যে ইনস্টল করা আছে ✓');
      return;
    }
    if (isIOS()) {
      toast.info('Safari-তে: Share → "Add to Home Screen" চাপুন');
      return;
    }
    toast.info('ইনস্টল করতে Chrome বা Edge ব্রাউজারে সাইটটি খুলুন');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-4 rounded-2xl bg-primary p-5 text-left text-white transition hover:bg-primary-dark"
    >
      <Download size={28} />
      <div>
        <p className="text-xs opacity-80">ইনস্টল করুন</p>
        <p className="text-lg font-bold">{appName}</p>
      </div>
    </button>
  );
}
