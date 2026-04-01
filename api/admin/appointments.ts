import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../lib/supabase';
import jwt from 'jsonwebtoken';

function verifyAuth(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  try {
    jwt.verify(auth.slice(7), process.env.SUPABASE_JWT_SECRET!);
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { date, status, stylist_id } = req.query;

  let query = supabaseAdmin
    .from('appointments')
    .select('*, services:service_id (name, category), stylists:stylist_id (name)')
    .order('appointment_date', { ascending: false })
    .order('appointment_time', { ascending: true });

  if (date) query = query.eq('appointment_date', date as string);
  if (status) query = query.eq('status', status as string);
  if (stylist_id) query = query.eq('stylist_id', stylist_id as string);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  // URL: /api/admin/appointments?id=xxx
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'Missing appointment id' });

  const { status } = req.body ?? {};
  if (!status) return res.status(400).json({ error: 'Missing status' });

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'Missing appointment id' });

  const { error } = await supabaseAdmin
    .from('appointments')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).end();
}
