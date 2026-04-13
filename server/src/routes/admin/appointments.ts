import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

export const adminAppointmentsRouter = Router();

// GET /api/admin/appointments
adminAppointmentsRouter.get('/', async (req, res, next) => {
  try {
    const { date, status, stylist_id } = req.query;

    let query = supabaseAdmin
      .from('appointments')
      .select(`
        *,
        services:service_id (name, category),
        stylists:stylist_id (name)
      `)
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true });

    if (date) query = query.eq('appointment_date', date as string);
    if (status) query = query.eq('status', status as string);
    if (stylist_id) query = query.eq('stylist_id', stylist_id as string);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  status: z
    .enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show'])
    .optional(),
  notes: z.string().max(500).optional(),
});

// PATCH /api/admin/appointments/:id
adminAppointmentsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .update(parsed.data)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/appointments/:id
adminAppointmentsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('appointments')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
