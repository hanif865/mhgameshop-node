import type { Response } from 'express';

/**
 * Uniform API envelope: { success, message?, data?, errors? }.
 * Every route should return through these helpers.
 */

export function ok<T>(res: Response, data?: T, message?: string, status = 200) {
  return res.status(status).json({ success: true, message, data });
}

export function created<T>(res: Response, data?: T, message = 'Created') {
  return ok(res, data, message, 201);
}

export function paginated<T>(
  res: Response,
  items: T[],
  meta: { page: number; perPage: number; total: number },
) {
  return res.status(200).json({
    success: true,
    data: {
      items,
      page: meta.page,
      perPage: meta.perPage,
      total: meta.total,
      totalPages: Math.max(1, Math.ceil(meta.total / meta.perPage)),
    },
  });
}

export function fail(
  res: Response,
  message: string,
  status = 400,
  errors?: Record<string, string[]>,
) {
  return res.status(status).json({ success: false, message, errors });
}

/** Parse ?page / ?perPage query params into safe skip/take values. */
export function parsePagination(query: Record<string, unknown>, defaultPerPage = 20) {
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.perPage) || defaultPerPage));
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}
