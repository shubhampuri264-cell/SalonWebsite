import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

export const adminServicesRouter = Router();

const SERVICE_CATEGORIES = ['hair', 'threading', 'facial', 'waxing', 'special_treatment'] as const;

// GET /api/admin/services — list all services including inactive
adminServicesRouter.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('services')
      .select('*')
      .order('category')
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  category: z.enum(SERVICE_CATEGORIES),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  price_min: z.number().positive(),
  price_max: z.number().positive().nullable().optional(),
  duration_min: z.number().int().positive(),
});

// POST /api/admin/services — create a new service
adminServicesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('services')
      .insert({ ...parsed.data, is_active: true })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  price_min: z.number().positive().optional(),
  price_max: z.number().positive().nullable().optional(),
  duration_min: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
});

// PATCH /api/admin/services/:id — update a service
adminServicesRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('services')
      .update(parsed.data)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});
