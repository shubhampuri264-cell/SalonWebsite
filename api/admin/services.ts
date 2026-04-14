import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../lib/supabase';
import { verifyAdminAuth } from '../lib/auth';

const SERVICE_CATEGORIES = ['hair', 'threading', 'facial', 'waxing', 'special_treatment', 'male'] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
  const { category, name, description, price_min, price_max, duration_min } = req.body ?? {};

  if (!category || !SERVICE_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Invalid or missing category' });
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  if (typeof price_min !== 'number' || price_min <= 0) {
    return res.status(400).json({ error: 'price_min must be a positive number' });
  }
  if (typeof duration_min !== 'number' || duration_min <= 0 || !Number.isInteger(duration_min)) {
    return res.status(400).json({ error: 'duration_min must be a positive integer' });
  }

  const { data, error } = await supabaseAdmin
    .from('services')
    .insert({
      category,
      name: name.trim(),
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
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'Missing service id' });

  const { name, description, price_min, price_max, duration_min, is_active } = req.body ?? {};

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (price_min !== undefined) updates.price_min = price_min;
  if (price_max !== undefined) updates.price_max = price_max;
  if (duration_min !== undefined) updates.duration_min = duration_min;
  if (is_active !== undefined) updates.is_active = is_active;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const { data, error } = await supabaseAdmin
    .from('services')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Service not found' });
  return res.json(data);
}
