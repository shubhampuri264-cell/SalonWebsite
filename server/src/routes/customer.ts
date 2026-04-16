import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';

export const customerRouter = Router();

// GET /api/customer/appointments — returns appointments linked to the logged-in customer
customerRouter.get('/appointments', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.sub;

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .select(`
        id,
        appointment_date,
        appointment_time,
        duration_min,
        status,
        notes,
        services:service_id (name, category),
        stylists:stylist_id (name)
      `)
      .eq('user_id', userId)
      .order('appointment_date', { ascending: false })
      .order('appointment_time', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});
