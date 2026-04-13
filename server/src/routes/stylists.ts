import { Router } from 'express';
import { supabaseAnon } from '../config/supabase';

export const stylistsRouter = Router();

stylistsRouter.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAnon
      .from('stylists')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});
