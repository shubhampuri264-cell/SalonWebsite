import { supabaseAdmin } from './supabase';
import { envValue } from './env';

export async function verifyAdminAuth(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;

  // envValue, not process.env: a quoted OWNER_EMAIL in the Vercel dashboard
  // never matches the JWT email, and the owner is locked out of every admin
  // endpoint with an indistinguishable 401.
  const ownerEmail = (envValue('OWNER_EMAIL') ?? '').toLowerCase();
  if (!ownerEmail) return false;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
  if (error || !user) return false;

  return (user.email ?? '').trim().toLowerCase() === ownerEmail;
}
