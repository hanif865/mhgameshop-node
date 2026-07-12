'use client';

import { useState } from 'react';
import { MessageCircle, Send, Facebook, Phone, X } from 'lucide-react';
import clsx from 'clsx';
import { useSettings } from '@/lib/settings';

export function FloatWidget() {
  const { get } = useSettings();
  const [open, setOpen] = useState(false);

  const whatsapp = get('whatsapp_number');
  const telegram = get('telegram_url');
  const messenger = get('messenger_url');
  const facebook = get('facebook_url');

  const links = [
    whatsapp && {
      href: `https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`,
      icon: Phone,
      color: 'bg-green-500',
      label: 'WhatsApp',
    },
    telegram && { href: telegram, icon: Send, color: 'bg-sky-500', label: 'Telegram' },
    messenger && { href: messenger, icon: MessageCircle, color: 'bg-blue-500', label: 'Messenger' },
    facebook && { href: facebook, icon: Facebook, color: 'bg-blue-700', label: 'Facebook' },
  ].filter(Boolean) as { href: string; icon: any; color: string; label: string }[];

  if (links.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-3 md:bottom-6">
      <div
        className={clsx(
          'flex flex-col items-end gap-3 transition-all',
          open ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
        )}
      >
        {links.map(({ href, icon: Icon, color, label }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={clsx('grid h-11 w-11 place-items-center rounded-full text-white shadow-lg', color)}
            aria-label={label}
          >
            <Icon size={20} />
          </a>
        ))}
      </div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-xl transition hover:bg-primary-dark"
        aria-label="Contact"
      >
        {open ? <X /> : <Phone />}
      </button>
    </div>
  );
}
