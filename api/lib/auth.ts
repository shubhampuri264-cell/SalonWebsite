import { supabaseAdmin } from './supabase';

export async function verifyAdminAuth(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;

  const ownerEmail = (process.env.OWNER_EMAIL ?? '').trim().toLowerCase();
  if (!ownerEmail) return false;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
  if (error || !user) return false;

  return (user.email ?? '').trim().toLowerCase() === ownerEmail;
}
