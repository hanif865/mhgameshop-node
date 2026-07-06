import type { MetadataRoute } from 'next';
import { apiGet } from '@/lib/api';
import { imageUrl } from '@/lib/config';
import type { SettingsMap } from '@/lib/settings';

// Runtime-generated so the PWA icon reflects the logo uploaded in admin settings.
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const res = await apiGet<SettingsMap>('/api/settings', 300);
  const s = res.success && res.data ? res.data : {};
  const name = s.site_name || 'MH Game Shop';
  const iconSrc = s.pwa_icon || s.site_logo;

  const icons: MetadataRoute.Manifest['icons'] = iconSrc
    ? [
        { src: imageUrl(iconSrc), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: imageUrl(iconSrc), sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: imageUrl(iconSrc), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ]
    : [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }];

  return {
    name,
    short_name: name,
    description: s.site_description || 'Game top-up, vouchers and subscriptions.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1220',
    theme_color: '#16a34a',
    icons,
  };
}
