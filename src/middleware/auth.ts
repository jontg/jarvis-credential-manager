import type { Request, Response, NextFunction } from 'express';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: 'API_KEY not configured' });
    return;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== apiKey) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
