'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiGet, apiPost } from './api';

export interface User {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  balance: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, ref?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const res = await apiGet<{ user: User }>('/api/auth/me');
    setUser(res.success && res.data ? res.data.user : null);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function login(email: string, password: string) {
    const res = await apiPost<{ user: User }>('/api/auth/login', { email, password });
    if (!res.success || !res.data) throw new Error(res.message || 'Login failed.');
    setUser(res.data.user);
  }

  async function register(name: string, email: string, password: string, ref?: string) {
    // ref থাকলে পাঠাই — রেফার কোড
    const res = await apiPost<{ user: User }>('/api/auth/register', { name, email, password, ...(ref ? { ref } : {}) });
    if (!res.success || !res.data) throw new Error(res.message || 'Registration failed.');
    setUser(res.data.user);
  }

  async function logout() {
    await apiPost('/api/auth/logout');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
