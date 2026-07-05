'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { SettingsProvider, type SettingsMap } from '@/lib/settings';
import { ToastProvider } from '@/components/ui/Toast';

export function Providers({
  settings,
  children,
}: {
  settings: SettingsMap;
  children: ReactNode;
}) {
  return (
    <SettingsProvider value={settings}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}
