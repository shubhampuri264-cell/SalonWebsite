import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

interface SupabaseJwtPayload {
  sub: string;
  role: string;
  email: string;
  aud: string;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: SupabaseJwtPayload;
    }
  }
}

/**
 * Verifies that the request carries a valid Supabase JWT.
 * Sets req.user on success.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.SUPABASE_JWT_SECRET) as SupabaseJwtPayload;

    if (payload.role !== 'authenticated') {
      res.status(403).json({ error: 'Insufficient privileges' });
      return;
    }

    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Restricts access to the salon owner only.
 * Must be used AFTER requireAuth (relies on req.user being set).
 * Prevents customers (who also have role='authenticated') from
 * reaching admin endpoints.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (req.user.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}
