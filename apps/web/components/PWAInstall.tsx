'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Register the service worker.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (!localStorage.getItem('pwa-dismissed')) setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setShow(false);
    setDeferred(null);
  }

  function dismiss() {
    localStorage.setItem('pwa-dismissed', '1');
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-2xl border border-primary/20 bg-white p-4 shadow-card md:bottom-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white">
          <Download size={20} />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-800">Install the app</p>
          <p className="text-xs text-slate-500">Faster access, works offline.</p>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-slate-400">
          <X size={18} />
        </button>
      </div>
      <button onClick={install} className="btn-primary mt-3 w-full py-2">
        Install
      </button>
    </div>
  );
}
