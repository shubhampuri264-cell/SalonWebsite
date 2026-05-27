import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { verifyAdminAuth } from '../lib/auth';
import { enforceRateLimit } from '../lib/ratelimit';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const getQuerySchema = z.object({
  stylist_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const createSchema = z.object({
  stylist_id: z.string().uuid(),
  blocked_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)'),
  start_time: z.string().regex(TIME_REGEX, 'Invalid time (HH:MM)'),
  end_time: z.string().regex(TIME_REGEX, 'Invalid time (HH:MM)'),
  reason: z.string().max(200).optional(),
}).refine((d) => d.start_time < d.end_time, {
  message: 'start_time must be before end_time',
  path: ['end_time'],
});

const idQuerySchema = z.object({
  id: z.string().uuid('Invalid blocked slot id'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await enforceRateLimit(req, res, 'admin'))) return;
  if (!await verifyAdminAuth(req.headers.authorization)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const parsed = getQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
  }
  const { stylist_id, date } = parsed.data;

  let query = supabaseAdmin
    .from('blocked_slots')
    .select('*')
    .order('blocked_date', { ascending: false });

  if (stylist_id) query = query.eq('stylist_id', stylist_id);
  if (date) query = query.eq('blocked_date', date);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }
  const { stylist_id, blocked_date, start_time, end_time, reason } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('blocked_slots')
    .insert({ stylist_id, blocked_date, start_time, end_time, reason: reason ?? null })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const parsed = idQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid blocked slot id', details: parsed.error.flatten() });
  }

  const { error } = await supabaseAdmin
    .from('blocked_slots')
    .delete()
    .eq('id', parsed.data.id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).end();
}
