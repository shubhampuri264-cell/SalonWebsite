import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { supabaseAdmin } from '../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = extractUserId(req.headers.authorization);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select(`
      id,
      appointment_date,
      appointment_time,
      duration_min,
      status,
      notes,
      services:service_id (name, category),
      stylists:stylist_id (name)
    `)
    .eq('user_id', userId)
    .order('appointment_date', { ascending: false })
    .order('appointment_time', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data ?? []);
}

function extractUserId(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const decoded = jwt.verify(
      authHeader.slice(7),
      process.env.SUPABASE_JWT_SECRET!
    ) as JwtPayload;

    return decoded.role === 'authenticated' ? String(decoded.sub) : null;
  } catch {
    return null;
  }
}
