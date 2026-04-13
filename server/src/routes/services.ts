import { Router } from 'express';
import { supabaseAnon } from '../config/supabase';
import type { Service, ServiceCategory } from '@luxe/shared';

export const servicesRouter = Router();

servicesRouter.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAnon
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('name');

    if (error) throw error;

    // Group by category
    const grouped = (data as Service[]).reduce<Record<ServiceCategory, Service[]>>(
      (acc, service) => {
        const cat = service.category as ServiceCategory;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(service);
        return acc;
      },
      {} as Record<ServiceCategory, Service[]>
    );

    res.json(grouped);
  } catch (err) {
    next(err);
  }
});
