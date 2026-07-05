import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@mhgs/database';
import { logger } from '../utils/logger';
import { isProd } from '../config/env';

/** Throwable error carrying an HTTP status. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (msg: string, errors?: Record<string, string[]>) =>
  new HttpError(400, msg, errors);
export const notFoundError = (msg = 'Not found.') => new HttpError(404, msg);
export const unauthorized = (msg = 'Unauthenticated.') => new HttpError(401, msg);
export const forbidden = (msg = 'Forbidden.') => new HttpError(403, msg);

/** Wrap an async route handler so thrown/rejected errors reach errorHandler. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/** 404 for unmatched routes. */
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: 'Route not found.' });
}

/** Central error handler — normalizes every error into the API envelope. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  // Zod validation errors -> 422 with field map
  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const issue of err.errors) {
      const path = issue.path.join('.') || '_';
      (errors[path] ??= []).push(issue.message);
    }
    return res.status(422).json({ success: false, message: 'Validation failed.', errors });
  }

  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json({ success: false, message: err.message, errors: err.errors });
  }

  // Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'Duplicate entry.' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }
  }

  const message = err instanceof Error ? err.message : 'Internal server error.';
  logger.error(err instanceof Error ? err.stack || message : String(err));

  return res.status(500).json({
    success: false,
    message: isProd ? 'Internal server error.' : message,
  });
}
