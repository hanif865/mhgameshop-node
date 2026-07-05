'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type SettingsMap = Record<string, string | null>;

const SettingsContext = createContext<SettingsMap>({});

export function SettingsProvider({
  value,
  children,
}: {
  value: SettingsMap;
  children: ReactNode;
}) {
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const map = useContext(SettingsContext);
  return {
    get: (key: string, fallback = '') => map[key] ?? fallback,
    bool: (key: string) => ['1', 'true', 'on', 'yes'].includes(String(map[key]).toLowerCase()),
    all: map,
  };
}
