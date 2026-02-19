import type { Request, Response, NextFunction } from 'express';

const windowMs = 60_000;
const maxRequests = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

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
