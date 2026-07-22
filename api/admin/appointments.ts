import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from '../_lib/supabase';
import { verifyAdminAuth } from '../_lib/auth';
import { enforceRateLimit } from '../_lib/ratelimit';
import { captureError } from '../_lib/sentry';

const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'] as const;

const getQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  stylist_id: z.string().uuid().optional(),
});

const patchSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  notes: z.string().max(500).optional(),
}).refine((d) => d.status !== undefined || d.notes !== undefined, {
  message: 'At least one of { status, notes } is required',
});

const idQuerySchema = z.object({
  id: z.string().uuid('Invalid appointment id'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await enforceRateLimit(req, res, 'admin'))) return;
  if (!await verifyAdminAuth(req.headers.authorization)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const parsed = getQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
  }
  const { date, status, stylist_id } = parsed.data;

  let query = supabaseAdmin
    .from('appointments')
    .select('*, services:service_id (name, category), stylists:stylist_id (name)')
    .order('appointment_date', { ascending: false })
    .order('appointment_time', { ascending: true });

  if (date) query = query.eq('appointment_date', date);
  if (status) query = query.eq('status', status);
  if (stylist_id) query = query.eq('stylist_id', stylist_id);

  const { data, error } = await query;
  if (error) {
    await captureError(error, {
      fingerprint: 'api:admin:appointments:list',
      tags: { endpoint: 'GET /api/admin/appointments' },
    });
    return res.status(500).json({ error: error.message });
  }
  return res.json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  const idParsed = idQuerySchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'Invalid appointment id', details: idParsed.error.flatten() });
  }
  const bodyParsed = patchSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: bodyParsed.error.flatten() });
  }

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update(bodyParsed.data)
    .eq('id', idParsed.data.id)
    .select()
    .single();

  if (error) {
    await captureError(error, {
      fingerprint: 'api:admin:appointments:update',
      tags: { endpoint: 'PATCH /api/admin/appointments' },
      extra: { appointment_id: idParsed.data.id },
    });
    return res.status(500).json({ error: error.message });
  }
  if (!data) return res.status(404).json({ error: 'Appointment not found' });
  return res.json(data);
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const parsed = idQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid appointment id', details: parsed.error.flatten() });
  }

  const { error } = await supabaseAdmin
    .from('appointments')
    .delete()
    .eq('id', parsed.data.id);

  if (error) {
    await captureError(error, {
      fingerprint: 'api:admin:appointments:delete',
      tags: { endpoint: 'DELETE /api/admin/appointments' },
      extra: { appointment_id: parsed.data.id },
    });
    return res.status(500).json({ error: error.message });
  }
  return res.status(204).end();
}
