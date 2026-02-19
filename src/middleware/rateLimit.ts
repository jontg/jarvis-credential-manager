import type { Request, Response, NextFunction } from 'express';

const windowMs = 60_000;
const maxRequests = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) {
      hits.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

// Allow Node to exit without waiting for the timer
cleanupTimer.unref();

/** Stop the periodic cleanup (for graceful shutdown or tests). */
export function stopRateLimitCleanup(): void {
  clearInterval(cleanupTimer);
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  let entry = hits.get(ip);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    hits.set(ip, entry);
  }

  entry.count++;

  if (entry.count > maxRequests) {
    res.status(429).json({ error: 'Too many requests. Try again later.' });
    return;
  }

  next();
}
