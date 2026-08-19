'use client';

import { useEffect, useRef } from 'react';
import { apiGet } from '@/lib/api';
import { fbTrack } from '@/lib/fbpixel';

/**
 * ইনস্ট্যান্ট-পে (গেটওয়ে) অর্ডারের পর ইউজার সাইট ছেড়ে ফিরে আসে
 * `/user/orders?status=success&fb_purchase=<orderId>`-এ। সার্ভার CAPI Purchase
 * আগেই গেছে; এখানে ব্রাউজার Purchase একই event_id (`purchase_order_<id>`)-তে
 * ফায়ার করি — Facebook দুটোকে dedup করে (ডাবল-কাউন্ট হয় না)। /user/* এর সব
 * ফেরত-পেজের জন্য একটাই মাউন্ট (user/layout)।
 */
export function FbPurchaseOnReturn() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('fb_purchase');
    if (!orderId) return;
    fired.current = true;

    apiGet<any>(`/api/orders/${orderId}`)
      .then((res) => {
        const order = res.data;
        if (order) {
          fbTrack(
            'Purchase',
            {
              value: Number(order.amount ?? 0),
              currency: 'BDT',
              content_type: 'product',
              content_ids: [String(order.productId ?? order.product?.id ?? '')],
              content_name:
                order.variation?.title ??
                order.comboPackage?.title ??
                order.product?.title ??
                'Order',
            },
            `purchase_order_${orderId}`,
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        // param সরিয়ে দিই — রিফ্রেশে যেন আবার ফায়ার না হয় (dedup-ও থাকল, দুই স্তর)।
        params.delete('fb_purchase');
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      });
  }, []);

  return null;
}
