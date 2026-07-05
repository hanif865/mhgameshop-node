import type { ReactNode } from 'react';
import { AdminShell } from '@/components/AdminShell';

export default function PanelLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
