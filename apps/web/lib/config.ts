export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/** Build a full URL for an image path stored by the API (e.g. "products/x.png"). */
export function imageUrl(path?: string | null): string {
  if (!path) return '/placeholder.svg';
  if (path.startsWith('http')) return path;
  return `${API_URL}/storage/${path.replace(/^\/+/, '')}`;
}
