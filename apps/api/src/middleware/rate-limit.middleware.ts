import { Response, NextFunction } from 'express';
import { RateLimiter } from '@mc-admin/analytics';
import { AuthenticatedRequest } from './auth.middleware';

/**
 * Wave C security — throttle destructive actions per user. Uses an in-memory
 * sliding window keyed by `${userId}:${name}`. Generous defaults so normal
 * operators are unaffected; abusive bursts get a 429.
 */
const limiters = new Map<string, RateLimiter>();

export function rateLimitDestructive(name: string, limit = 30, windowMs = 60_000) {
  if (!limiters.has(name)) {
    limiters.set(name, new RateLimiter(limit, windowMs));
  }
  const limiter = limiters.get(name)!;

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.userId || req.ip || 'anonymous';
    const decision = limiter.check(`${userId}:${name}`);
    if (!decision.allowed) {
      res.setHeader('Retry-After', Math.ceil(decision.retryAfterMs / 1000).toString());
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: `Too many ${name} actions. Retry in ${Math.ceil(decision.retryAfterMs / 1000)}s.`,
        retryAfterMs: decision.retryAfterMs
      });
    }
    next();
  };
}

/** Test helper — clears all rate-limit state between test cases. */
export function resetRateLimits(): void {
  for (const limiter of limiters.values()) {
    limiter.reset();
  }
}
