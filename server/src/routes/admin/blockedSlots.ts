import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

export const blockedSlotsRouter = Router();

const createSchema = z.object({
  stylist_id: z.string().uuid(),
  blocked_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  reason: z.string().max(200).optional(),
});

// POST /api/admin/blocked-slots
blockedSlotsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('blocked_slots')
      .insert(parsed.data)
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/blocked-slots
blockedSlotsRouter.get('/', async (req, res, next) => {
  try {
    const { stylist_id, date } = req.query;

    let query = supabaseAdmin
      .from('blocked_slots')
      .select('*, stylists:stylist_id (name)')
      .order('blocked_date')
      .order('start_time');

    if (stylist_id) query = query.eq('stylist_id', stylist_id as string);
    if (date) query = query.eq('blocked_date', date as string);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/blocked-slots/:id
blockedSlotsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('blocked_slots')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
