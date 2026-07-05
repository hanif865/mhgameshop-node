// Shared UI primitives used by web + admin. Fleshed out in Phases 4/5.
// Brand tokens live here so both Next.js apps stay visually consistent.

export const theme = {
  primary: '#16a34a',
  primaryDark: '#15803d',
  gold: '#ca8a04',
  background: '#f0f4ff',
} as const;

export type StatusTone = 'success' | 'warning' | 'info' | 'danger' | 'muted';

export const orderStatusTone: Record<string, StatusTone> = {
  completed: 'success',
  processing: 'info',
  autoprocessing: 'info',
  pending: 'warning',
  hold: 'warning',
  cancelled: 'danger',
};
