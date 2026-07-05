'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiGet, apiPost } from './api';

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface AuthValue {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    const res = await apiGet<{ user: AdminUser }>('/api/auth/me');
    const u = res.success && res.data ? res.data.user : null;
    // Only admins may use this panel.
    setUser(u && u.role === 'admin' ? u : null);
    setLoading(false);
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function login(email: string, password: string) {
    const res = await apiPost<{ user: AdminUser }>('/api/auth/login', { email, password });
    if (!res.success || !res.data) throw new Error(res.message || 'Login failed.');
    if (res.data.user.role !== 'admin') throw new Error('You are not an administrator.');
    setUser(res.data.user);
  }

  async function logout() {
    await apiPost('/api/auth/logout');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
