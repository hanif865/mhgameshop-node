import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { apiGet } from '@/lib/api';
import type { SettingsMap } from '@/lib/settings';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { FloatWidget } from '@/components/layout/FloatWidget';
import { PWAInstall } from '@/components/PWAInstall';

export const metadata: Metadata = {
  title: 'MH Game Shop — Game Top Up',
  description: 'Fast & reliable game top-up, vouchers and subscriptions.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#16a34a',
};

async function getSettings(): Promise<SettingsMap> {
  const res = await apiGet<SettingsMap>('/api/settings', 300);
  return res.success && res.data ? res.data : {};
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
