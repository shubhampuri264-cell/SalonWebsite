import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from './_lib/supabase';
import { stylistIdsForService } from './_lib/eligibility';

const querySchema = z.object({
  /**
   * When supplied, only stylists who perform this service are returned. The
   * booking wizard always sends it: an unfiltered list is what let a customer
   * book the threading specialist for a balayage.
   */
  service_id: z.string().uuid('Invalid service_id').optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
  }
  const { service_id } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('stylists')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) return res.status(500).json({ error: error.message });

  if (!service_id) return res.json(data ?? []);

  // is_active on the service too: migration 013 retires services by
  // deactivating them, and a stale page must not resolve a stylist for one.
  const { data: service } = await supabaseAdmin
    .from('services')
    .select('id')
    .eq('id', service_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!service) return res.status(404).json({ error: 'Service not found' });

  const eligibleIds = await stylistIdsForService(service_id);
  // Fail closed. An empty list would read as "nobody does this service" and is
  // indistinguishable from a genuine gap, so a failed lookup must not produce
  // one — the wizard would tell the customer to phone the salon over what is
  // really a transient database error.
  if (eligibleIds === null) {
    return res.status(503).json({ error: 'Could not load stylists. Please try again.' });
  }

  const allowed = new Set(eligibleIds);
  return res.json((data ?? []).filter((s) => allowed.has(s.id)));
}
