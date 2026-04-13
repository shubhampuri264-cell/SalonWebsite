import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../lib/supabase';
import { verifyAdminAuth } from '../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { stylist_id, date } = req.query;

  let query = supabaseAdmin
    .from('blocked_slots')
    .select('*')
    .order('blocked_date', { ascending: false });

  if (stylist_id) query = query.eq('stylist_id', stylist_id as string);
  if (date) query = query.eq('blocked_date', date as string);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const { stylist_id, blocked_date, start_time, end_time, reason } = req.body ?? {};

  if (!stylist_id || !blocked_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { data, error } = await supabaseAdmin
    .from('blocked_slots')
    .insert({ stylist_id, blocked_date, start_time, end_time, reason: reason ?? null })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'Missing blocked slot id' });

  const { error } = await supabaseAdmin
    .from('blocked_slots')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).end();
}
