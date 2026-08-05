import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_lib/supabase';
import { enforceRateLimit } from '../_lib/ratelimit';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(auth.slice(7));
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Per-user throttle on the customer dashboard fetch. Keyed by user.id (not IP)
  // so households / offices behind one NAT don't fight for budget.
  if (!(await enforceRateLimit(req, res, 'customer', `user:${user.id}`))) return;

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select(`
      id,
      appointment_date,
      appointment_time,
      duration_min,
      status,
      notes,
      cancellation_token,
      service_id,
      services:service_id (name, category),
      stylists:stylist_id (name)
    `)
    .eq('user_id', user.id)
    .order('appointment_date', { ascending: false })
    .order('appointment_time', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data ?? []);
}
