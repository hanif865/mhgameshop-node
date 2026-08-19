'use client';

import Script from 'next/script';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSettings } from '@/lib/settings';
import { fbTrack } from '@/lib/fbpixel';

/**
 * Facebook browser Pixel (fbevents.js)। admin Settings-এ enabled + Pixel ID
 * থাকলেই লোড হয়; নইলে কিছুই রেন্ডার করে না। প্রথম PageView inline base script-এ,
 * পরের SPA রুট-বদলে usePathname effect থেকে — সার্ভার CAPI-র সাথে event_id
 * দিয়ে dedup হয় (এখানে PageView-এ dedup লাগে না, তবে Purchase ইত্যাদিতে লাগে)।
 */
export function FacebookPixel() {
  const { bool, get } = useSettings();
  const enabled = bool('fb_pixel_enabled');
  const pixelId = get('fb_pixel_id').trim();
  const pathname = usePathname();
  const firstRun = useRef(true);

  // রুট বদলালে নতুন PageView। প্রথম লোডেরটা inline script করে বলে প্রথম রান স্কিপ
  // করি — নইলে ডাবল-কাউন্ট হত।
  useEffect(() => {
    if (!enabled || !pixelId) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    fbTrack('PageView');
  }, [pathname, enabled, pixelId]);

  if (!enabled || !pixelId) return null;

  return (
    <>
      <Script id="fb-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');
fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
