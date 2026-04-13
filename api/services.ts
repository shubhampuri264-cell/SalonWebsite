import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { data, error } = await supabaseAdmin
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('name');

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}

