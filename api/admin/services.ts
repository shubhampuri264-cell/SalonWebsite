// Owner CRUD for the catalogue. Despite the filename this serves TWO
// resources — services and promotions — selected by ?resource=.
//
// The name is a wart, kept deliberately. Vercel's Hobby plan caps the project
// at 12 serverless functions and all 12 are in use (see api/cron/reminders.ts),
// so promotions could not have their own file. Renaming this to admin/catalog.ts
// would read better but would break the existing admin client URLs for no
// functional gain, so the filename stays and this comment explains it.
//
// ?resource defaults to 'services' precisely so every URL that existed before
// promotions were added keeps working unchanged.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { supabaseAdmin } from '../_lib/supabase';
import { verifyAdminAuth } from '../_lib/auth';
import { enforceRateLimit } from '../_lib/ratelimit';

const SERVICE_CATEGORIES = ['hair', 'threading', 'facial', 'waxing', 'special_treatment'] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  category: z.enum(SERVICE_CATEGORIES),
  name: z.string().trim().min(2).max(100),
  description: z.string().max(500).nullable().optional(),
  price_min: z.number().nonnegative(),
  price_max: z.number().positive().nullable().optional(),
  duration_min: z.number().int().positive(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  price_min: z.number().nonnegative().optional(),
  price_max: z.number().positive().nullable().optional(),
  duration_min: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: 'At least one field is required',
});

// Bounds mirror the CHECK constraints in migration 017 exactly. Duplicated on
// purpose: the database is the real guarantee, but catching it here turns a
// raw Postgres constraint-violation string into a message the owner can act on.
const promotionCreateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().max(500).nullable().optional(),
  offer_text: z.string().trim().min(2).max(200),
  starts_on: z.string().regex(DATE_RE, 'Invalid date (YYYY-MM-DD)').optional(),
  ends_on: z.string().regex(DATE_RE, 'Invalid date (YYYY-MM-DD)').nullable().optional(),
}).refine((d) => !d.starts_on || !d.ends_on || d.ends_on >= d.starts_on, {
  message: 'The end date cannot be before the start date',
  path: ['ends_on'],
});

const promotionUpdateSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  offer_text: z.string().trim().min(2).max(200).optional(),
  starts_on: z.string().regex(DATE_RE, 'Invalid date (YYYY-MM-DD)').optional(),
  ends_on: z.string().regex(DATE_RE, 'Invalid date (YYYY-MM-DD)').nullable().optional(),
  is_active: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: 'At least one field is required',
}).refine((d) => !d.starts_on || !d.ends_on || d.ends_on >= d.starts_on, {
  message: 'The end date cannot be before the start date',
  path: ['ends_on'],
});

const idQuerySchema = z.object({
  id: z.string().uuid('Invalid id'),
});

const resourceSchema = z.enum(['services', 'promotions']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await enforceRateLimit(req, res, 'admin'))) return;
  if (!await verifyAdminAuth(req.headers.authorization)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Absent means services — the pre-promotions behaviour, so old admin URLs
  // are unaffected.
  const parsedResource = resourceSchema.safeParse(req.query.resource ?? 'services');
  if (!parsedResource.success) {
    return res.status(400).json({ error: 'Unknown resource' });
  }

  if (parsedResource.data === 'promotions') {
    if (req.method === 'GET') return promotionsGet(res);
    if (req.method === 'POST') return promotionsPost(req, res);
    if (req.method === 'PATCH') return promotionsPatch(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
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
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }
  const { category, name, description, price_min, price_max, duration_min } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('services')
    .insert({
      category,
      name,
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
  const idParsed = idQuerySchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'Invalid service id', details: idParsed.error.flatten() });
  }
  const bodyParsed = updateSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: bodyParsed.error.flatten() });
  }

  const { data, error } = await supabaseAdmin
    .from('services')
    .update(bodyParsed.data)
    .eq('id', idParsed.data.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Service not found' });
  return res.json(data);
}

// --- promotions -------------------------------------------------------------
//
// No DELETE, matching services: offers are retired with is_active = FALSE
// rather than removed, so the wording of a past promotion stays recoverable if
// the owner wants to run it again.

async function promotionsGet(res: VercelResponse) {
  const { data, error } = await supabaseAdmin
    .from('promotions')
    .select('*')
    // Live offers first, then most recently scheduled — the order the owner
    // thinks in when opening the screen.
    .order('is_active', { ascending: false })
    .order('starts_on', { ascending: false });

  if (error) return res.status(500).json({ error: promotionsErrorMessage(error) });
  return res.json(data);
}

async function promotionsPost(req: VercelRequest, res: VercelResponse) {
  const parsed = promotionCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }
  const { title, description, offer_text, starts_on, ends_on } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('promotions')
    .insert({
      title,
      description: description ?? null,
      offer_text,
      // Let the column defaults apply when the owner leaves the dates blank:
      // starts_on defaults to today, ends_on to NULL (open-ended).
      ...(starts_on ? { starts_on } : {}),
      ...(ends_on !== undefined ? { ends_on } : {}),
      is_active: true,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: promotionsErrorMessage(error) });
  return res.status(201).json(data);
}

async function promotionsPatch(req: VercelRequest, res: VercelResponse) {
  const idParsed = idQuerySchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'Invalid promotion id', details: idParsed.error.flatten() });
  }
  const bodyParsed = promotionUpdateSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: bodyParsed.error.flatten() });
  }

  const { data, error } = await supabaseAdmin
    .from('promotions')
    .update(bodyParsed.data)
    .eq('id', idParsed.data.id)
    .select()
    .maybeSingle();

  if (error) return res.status(500).json({ error: promotionsErrorMessage(error) });
  if (!data) return res.status(404).json({ error: 'Promotion not found' });
  return res.json(data);
}

/**
 * Turns the one failure mode that is actually likely — migration 017 not
 * applied yet — into an instruction rather than a bare PostgREST code.
 */
function promotionsErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === 'PGRST205' || /relation .*promotions.* does not exist/i.test(error.message)) {
    return 'The promotions table does not exist yet. Apply supabase/migrations/017_promotions.sql via the Supabase SQL Editor.';
  }
  return error.message;
}
