'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from './config';

/**
 * Admin realtime: live pending-orders count and order-updated events.
 * The socket authenticates via the admin's httpOnly cookie.
 */
export function useAdminSocket(handlers: {
  onPending?: (count: number) => void;
  onOrderUpdated?: (e: { id: number; status: string }) => void;
  onOnline?: (e: { count: number; guests: number }) => void;
}) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const socket: Socket = io(API_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socket.on('orders:pending', (e: { count: number }) => ref.current.onPending?.(e.count));
    socket.on('order:updated', (e: { id: number; status: string }) =>
      ref.current.onOrderUpdated?.(e),
    );
    socket.on('users:online', (e: { count: number; guests: number }) => ref.current.onOnline?.(e));
    return () => {
      socket.disconnect();
    };
  }, []);
}
