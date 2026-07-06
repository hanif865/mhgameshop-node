import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { apiGet } from '@/lib/api';
import { imageUrl } from '@/lib/config';
import type { SettingsMap } from '@/lib/settings';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { FloatWidget } from '@/components/layout/FloatWidget';
import { PWAInstall } from '@/components/PWAInstall';

export const viewport: Viewport = {
  themeColor: '#16a34a',
};

async function getSettings(): Promise<SettingsMap> {
  const res = await apiGet<SettingsMap>('/api/settings', 300);
  return res.success && res.data ? res.data : {};
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const name = s.site_name || 'MH Game Shop';
  const favicon = s.site_favicon || s.site_logo;
  return {
    title: s.site_title || `${name} — Game Top Up`,
    description: s.site_description || 'Fast & reliable game top-up, vouchers and subscriptions.',
    icons: favicon ? { icon: imageUrl(favicon) } : undefined,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers settings={settings}>
          <Navbar />
          <main className="min-h-[70vh] pb-16 md:pb-0">{children}</main>
          <Footer />
          <MobileBottomNav />
          <FloatWidget />
          <PWAInstall />
        </Providers>
      </body>
    </html>
  );
}
