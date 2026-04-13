import type { VercelRequest } from '@vercel/node';
import jwt, { type JwtPayload } from 'jsonwebtoken';

export function verifyAdminAuth(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;

  const adminEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!adminEmail) return false;

  try {
    const decoded = jwt.verify(
      auth.slice(7),
      process.env.SUPABASE_JWT_SECRET!
    ) as JwtPayload;

    const tokenEmail = String(decoded.email ?? '').trim().toLowerCase();
    return tokenEmail === adminEmail;
  } catch {
    return false;
  }
}

