'use client';

import { Megaphone } from 'lucide-react';
import { useSettings } from '@/lib/settings';

export function NoticeBar() {
  const { get, bool } = useSettings();
  if (!bool('enable_notice')) return null;

  const content = get('notice_content') || get('notice_title');
  if (!content) return null;

  return (
    <div
      className="flex items-center gap-3 overflow-hidden px-4 py-2 text-sm font-medium"
      style={{
        background: get('notice_background_color', '#16a34a'),
        color: get('notice_font_color', '#ffffff'),
      }}
    >
      <Megaphone size={16} className="shrink-0" />
      <div className="overflow-hidden">
        <div className="animate-marquee">{content}</div>
      </div>
    </div>
  );
}
