'use client';

import Link from 'next/link';
import { Gamepad2, Send, Facebook, Youtube, Instagram, Phone, Clock } from 'lucide-react';
import { useSettings } from '@/lib/settings';
import { imageUrl } from '@/lib/config';

export function Footer() {
  const { get } = useSettings();

  const socials = [
    { url: get('facebook_url'), icon: Facebook, label: 'Facebook' },
    { url: get('telegram_url'), icon: Send, label: 'Telegram' },
    { url: get('youtube_url'), icon: Youtube, label: 'YouTube' },
    { url: get('instagram_url'), icon: Instagram, label: 'Instagram' },
    {
      url: get('whatsapp_number') ? `https://wa.me/${get('whatsapp_number').replace(/[^0-9]/g, '')}` : '',
      icon: Phone,
      label: 'WhatsApp',
    },
  ].filter((s) => s.url);

  return (
    <footer className="mt-12 bg-gradient-to-br from-primary-dark via-primary to-emerald-700 pb-24 pt-10 text-white md:pb-10">
      <div className="container-page grid gap-8 md:grid-cols-3">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-2 text-lg font-extrabold">
            {get('site_logo') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl(get('site_logo'))}
                alt=""
                className="h-10 w-auto rounded-lg bg-white/90 p-1 object-contain"
              />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15">
                <Gamepad2 size={20} />
              </span>
            )}
            {!get('site_logo') && get('site_name', 'MH Game Shop')}
          </div>
          <p className="mt-3 max-w-xs text-sm text-white/80">
            {get('site_description', 'Fast & reliable game top-up, vouchers and subscriptions.')}
          </p>

          {socials.length > 0 && (
            <div className="mt-4 flex gap-2">
              {socials.map(({ url, icon: Icon, label }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white transition hover:bg-gold"
                >
                  <Icon size={17} />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 font-bold">
            <span className="h-4 w-1 rounded-full bg-gold" /> Quick Links
          </h4>
          <ul className="space-y-2 text-sm text-white/80">
            <li><Link href="/" className="hover:text-gold">Home</Link></li>
            <li><Link href="/user/orders" className="hover:text-gold">My Orders</Link></li>
            <li><Link href="/user/codes" className="hover:text-gold">My Codes</Link></li>
            <li><Link href="/user/add-funds" className="hover:text-gold">Add Funds</Link></li>
          </ul>
        </div>

        {/* Support */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 font-bold">
            <span className="h-4 w-1 rounded-full bg-gold" /> Support
          </h4>
          <p className="flex items-center gap-2 text-sm text-white/80">
            <Clock size={15} className="text-gold" />
            {get('support_time', '24 Hours Open')}
          </p>
        </div>
      </div>

      <div className="container-page mt-8 flex flex-col items-center justify-between gap-2 border-t border-white/15 pt-6 text-xs text-white/70 sm:flex-row">
        <p>© {new Date().getFullYear()} {get('site_name', 'MH Game Shop')}. All rights reserved.</p>
        <p>
          Developed by{' '}
          <a
            href="https://netliverse.com/"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-white transition hover:text-gold"
          >
            Netliverse
          </a>
        </p>
      </div>
    </footer>
  );
}
