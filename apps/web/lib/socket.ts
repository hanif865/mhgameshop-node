'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from './config';

export interface OrderStatusEvent {
  id: number;
  status: string;
  voucherCode: string | null;
  deliveryMessage: string | null;
}

/**
 * Subscribe to live order-status updates for the logged-in user. The API
 * authenticates the socket via the httpOnly cookie (sent with credentials),
 * so no token needs to be passed here.
 */
export function useOrderSocket(onUpdate: (e: OrderStatusEvent) => void) {
  const cb = useRef(onUpdate);
  cb.current = onUpdate;

  useEffect(() => {
    const socket: Socket = io(API_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socket.on('order:status', (e: OrderStatusEvent) => cb.current(e));
    return () => {
      socket.disconnect();
    };
  }, []);
}
