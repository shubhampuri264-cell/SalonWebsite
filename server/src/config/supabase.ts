import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Anon client — respects Row Level Security
// Use for public read operations (stylists, services)
export const supabaseAnon = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY
);

// Service role client — bypasses Row Level Security
// Use for all appointment operations and admin actions
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
