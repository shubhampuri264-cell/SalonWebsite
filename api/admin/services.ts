import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase';
import { verifyAdminAuth } from '../lib/auth';
import { enforceRateLimit } from '../lib/ratelimit';

const SERVICE_CATEGORIES = ['hair', 'threading', 'facial', 'waxing', 'special_treatment', 'male'] as const;

const createSchema = z.object({
  category: z.enum(SERVICE_CATEGORIES),
  name: z.string().trim().min(2).max(100),
  description: z.string().max(500).nullable().optional(),
  price_min: z.number().positive(),
  price_max: z.number().positive().nullable().optional(),
  duration_min: z.number().int().positive(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  price_min: z.number().positive().optional(),
  price_max: z.number().positive().nullable().optional(),
  duration_min: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: 'At least one field is required',
});

const idQuerySchema = z.object({
  id: z.string().uuid('Invalid service id'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await enforceRateLimit(req, res, 'admin'))) return;
  if (!await verifyAdminAuth(req.headers.authorization)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') return handleGet(res);
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(res: VercelResponse) {
  const { data, error } = await supabaseAdmin
    .from('services')
    .select('*')
    .order('category')
    .order('name');

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }
  const { category, name, description, price_min, price_max, duration_min } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('services')
    .insert({
      category,
      name,
      description: description ?? null,
      price_min,
      price_max: price_max ?? null,
      duration_min,
      is_active: true,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
}

async function handlePatch(req: VercelRequest, res: VercelResponse) {
  const idParsed = idQuerySchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'Invalid service id', details: idParsed.error.flatten() });
  }
  const bodyParsed = updateSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: bodyParsed.error.flatten() });
  }

  const { data, error } = await supabaseAdmin
    .from('services')
    .update(bodyParsed.data)
    .eq('id', idParsed.data.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Service not found' });
  return res.json(data);
}
