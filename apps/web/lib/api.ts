import { API_URL } from './config';

/**
 * Server components run inside the container and should reach the API over the
 * internal docker network (fast, no public DNS / TLS hairpin). The browser must
 * use the public URL. INTERNAL_API_URL is a runtime env on the web container.
 */
function baseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || API_URL;
  }
  return API_URL;
}

export interface ApiResult<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
  // pagination fields (when paginated)
  [key: string]: unknown;
}

interface FetchOptions extends RequestInit {
  /** Disable Next.js caching (default: no-store for dynamic data). */
  revalidate?: number;
}

/**
 * Universal fetch wrapper. Sends cookies (credentials) so the API's httpOnly
 * JWT is included on every request. Works in both server and client components.
 */
export async function api<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<ApiResult<T>> {
  const { revalidate, headers, ...rest } = options;

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {}),
      },
      ...(revalidate !== undefined
        ? { next: { revalidate } }
        : { cache: 'no-store' as RequestCache }),
      ...rest,
    });
  } catch {
    // Network error (e.g. API unreachable during build or downtime).
    return { success: false, message: 'Network error — please try again.' };
  }

  let json: ApiResult<T>;
  try {
    json = (await res.json()) as ApiResult<T>;
  } catch {
    json = { success: false, message: 'Invalid server response.' };
  }
  return json;
}

export const apiGet = <T = unknown>(path: string, revalidate?: number) =>
  api<T>(path, { method: 'GET', revalidate });

export const apiPost = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

export const apiPut = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });

/** Multipart upload (image) — do not set Content-Type, let the browser set it. */
export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    credentials: 'include',
    body: form,
  });
  return (await res.json()) as ApiResult<T>;
}
