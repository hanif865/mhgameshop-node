import { API_URL } from './config';

export interface ApiResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
  [key: string]: unknown;
}

// Server-side rendering reaches the API over the internal docker network;
// the browser uses the public URL.
function baseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || API_URL;
  }
  return API_URL;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      cache: 'no-store',
      ...options,
    });
  } catch {
    return { success: false, message: 'Network error — please try again.' };
  }
  try {
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { success: false, message: 'Invalid server response.' };
  }
}

export const apiGet = <T = unknown>(path: string) => request<T>(path, { method: 'GET' });
export const apiPost = <T = unknown>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
export const apiPut = <T = unknown>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
export const apiDelete = <T = unknown>(path: string) => request<T>(path, { method: 'DELETE' });

export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    credentials: 'include',
    body: form,
  });
  return (await res.json()) as ApiResult<T>;
}

/** Extract paginated payload {items,page,totalPages,total} regardless of nesting. */
export function pageData<T>(res: ApiResult): { items: T[]; page: number; totalPages: number; total: number } {
  const d = (res.data ?? res) as any;
  return {
    items: d?.items ?? [],
    page: d?.page ?? 1,
    totalPages: d?.totalPages ?? 1,
    total: d?.total ?? 0,
  };
}
