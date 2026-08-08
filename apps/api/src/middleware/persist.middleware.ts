import type { NextFunction, Request, Response } from 'express';
import {
  db,
  flushMemoryToPrisma,
  isPrismaPersistenceEnabled
} from '@mc-admin/db';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * After a successful mutating API request, write the in-memory snapshot to Prisma.
 * Failures are logged but do not rewrite the HTTP response (request already finished).
 */
export function prismaWriteThroughMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isPrismaPersistenceEnabled() || !MUTATING.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const previous = res.end.bind(res);
  res.end = ((...args: Parameters<Response['end']>) => {
    const result = previous(...args);
    if (res.statusCode < 400) {
      void flushMemoryToPrisma(db).catch((err: unknown) => {
        console.error('[apps/api] Prisma write-through flush failed:', err);
      });
    }
    return result;
  }) as Response['end'];

  next();
}
