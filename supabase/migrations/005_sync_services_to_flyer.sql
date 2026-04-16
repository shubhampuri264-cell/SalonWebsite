-- Migration 005: Sync services with flyer prices and add Male category
-- Run AFTER migrations 001–004.

-- ---------------------------------------------------------------
-- 1. Add 'male' to the category CHECK constraint
-- ---------------------------------------------------------------

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_category_check;

ALTER TABLE services
  ADD CONSTRAINT services_category_check
  CHECK (category IN ('hair', 'threading', 'facial', 'waxing', 'special_treatment', 'male'));

-- ---------------------------------------------------------------
-- 2. Fix is_owner_admin search_path (resolves Supabase security lint)
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_owner_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    auth.role() = 'authenticated'
    AND lower(coalesce(auth.jwt()->>'email', '')) = lower('sumipuri34@gmail.com');
$$;

-- ---------------------------------------------------------------
-- 3. Deactivate ALL currently active services
--    (non-flyer services stay in DB but are hidden from public)
-- ---------------------------------------------------------------

UPDATE services SET is_active = FALSE;

-- ---------------------------------------------------------------
-- 4. Reactivate & update services whose names already match flyer
-- ---------------------------------------------------------------

-- Threading
UPDATE services SET price_min = 35, price_max = NULL, is_active = TRUE WHERE name = 'Full Face & Neck';

-- Facial
UPDATE services SET price_min = 35, price_max = NULL, is_active = TRUE WHERE name = 'Express Facial';
UPDATE services SET price_min = 70, price_max = NULL, is_active = TRUE WHERE name = 'Deep Cleansing Facial';
UPDATE services SET price_min = 20, price_max = NULL, is_active = TRUE WHERE name = 'Facial Bleach';

-- Special Treatment
UPDATE services SET price_min = 35, price_max = NULL, is_active = TRUE WHERE name = 'Eyelashes - Cluster';
UPDATE services SET price_min = 70, price_max = NULL, is_active = TRUE WHERE name = 'Eyelashes - Individual';
UPDATE services SET price_min = 15, price_max = NULL, is_active = TRUE WHERE name = 'Eyebrow Tinting';
-- Rename and update "Lash Lifting + Tint" → "Lash Lifting & Tint"
UPDATE services SET name = 'Lash Lifting & Tint', price_min = 70, price_max = NULL, is_active = TRUE WHERE name = 'Lash Lifting + Tint';

-- ---------------------------------------------------------------
-- 5. INSERT all flyer services (ON CONFLICT DO NOTHING = safe to re-run)
-- ---------------------------------------------------------------

-- THREADING SERVICES
INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('threading', 'Eyebrows',      'Eyebrow threading',            8,  NULL, 15, TRUE),
  ('threading', 'Upper Lip',     'Upper lip threading',          6,  NULL, 10, TRUE),
  ('threading', 'Lower Lip',     'Lower lip threading',          5,  NULL, 10, TRUE),
  ('threading', 'Chin',          'Chin threading',               7,  NULL, 10, TRUE),
  ('threading', 'Forehead',      'Forehead threading',           7,  NULL, 10, TRUE),
  ('threading', 'Neck',          'Neck threading',              10,  NULL, 10, TRUE),
  ('threading', 'Full Sides',    'Full sides threading',        12,  NULL, 15, TRUE),
  ('threading', 'Cheeks',        'Cheeks threading',             7,  NULL, 15, TRUE),
  ('threading', 'Ears',          'Ear threading',               12,  NULL, 10, TRUE),
  ('threading', 'Full Face',     'Full face threading',         30,  NULL, 30, TRUE)
ON CONFLICT (name) DO NOTHING;

-- WAXING SERVICES
INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('waxing', 'Eyebrow Wax',               'Eyebrow waxing',                    8,    NULL, 15,  TRUE),
  ('waxing', 'Chin Wax',                  'Chin waxing',                       7,    NULL, 10,  TRUE),
  ('waxing', 'Full Sides Wax',            'Full sides waxing',                12,    NULL, 15,  TRUE),
  ('waxing', 'Full Face Wax',             'Full face waxing',                 30,    NULL, 30,  TRUE),
  ('waxing', 'Full Face & Neck Wax',      'Full face and neck waxing',        35,    NULL, 45,  TRUE),
  ('waxing', 'Under Arms',                'Under arms waxing',                15,    NULL, 20,  TRUE),
  ('waxing', 'Half Arms',                 'Half arms waxing',                 15,    NULL, 30,  TRUE),
  ('waxing', 'Full Arms',                 'Full arms waxing',                 30,    NULL, 45,  TRUE),
  ('waxing', 'Half Legs',                 'Half legs waxing',                 20,    NULL, 30,  TRUE),
  ('waxing', 'Full Legs',                 'Full legs waxing',                 40,    NULL, 60,  TRUE),
  ('waxing', 'Bikini Line',               'Bikini line waxing',               30,    NULL, 30,  TRUE),
  ('waxing', 'Semi Brazilian',            'Semi Brazilian waxing',            35,    NULL, 45,  TRUE),
  ('waxing', 'Full Brazilian',            'Full Brazilian waxing',            40,    NULL, 60,  TRUE),
  ('waxing', 'Brazilian Painless CBD Wax','Brazilian painless CBD wax',       50,    NULL, 60,  TRUE),
  ('waxing', 'Full Front',                'Full front body waxing',           35,    NULL, 45,  TRUE),
  ('waxing', 'Full Back',                 'Full back waxing',                 40,    NULL, 45,  TRUE),
  ('waxing', 'Full Body',                 'Full body waxing',                150,    NULL, 120, TRUE)
ON CONFLICT (name) DO NOTHING;

-- FACIAL SERVICES (new — not in previous migrations)
INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('facial', 'Herbal Facial',                'Herbal facial treatment',                          60, NULL, 60, TRUE),
  ('facial', 'Anti-Acne Facial',             'Facial targeting acne and breakouts',              65, NULL, 60, TRUE),
  ('facial', 'Repechage Seaweed Facial',     'Repechage seaweed facial treatment',               80, NULL, 75, TRUE),
  ('facial', 'Repechage Four Layer Facial',  'Repechage signature four layer facial',            80, NULL, 75, TRUE)
ON CONFLICT (name) DO NOTHING;

-- SPECIAL TREATMENT SERVICES (new)
INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('special_treatment', 'Eyelashes - Mink',        'Mink lash extensions for a natural look',    125, NULL, 90, TRUE),
  ('special_treatment', 'Eyelash Tinting',         'Eyelash tinting for darker, defined lashes',  25, NULL, 30, TRUE),
  ('special_treatment', 'Hot Oil Hair Massage',    'Hot oil scalp and hair massage (20 min.)',     25, NULL, 20, TRUE),
  ('special_treatment', 'Eyebrow & Lamination',    'Eyebrow lamination for sleek, groomed brows', 80, NULL, 60, TRUE)
ON CONFLICT (name) DO NOTHING;

-- HAIR SERVICES
INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('hair', 'Shampoo, Cut and Style',        'Shampoo, precision cut and style. Price varies by hair length and texture.',  50, 80,  60, TRUE),
  ('hair', 'Blowdry',                       'Blowdry: volume, straight, or curls. Price varies by hair length.',           45, 60,  45, TRUE),
  ('hair', 'Balayage',                      'Half or full balayage. Price varies by hair length and texture.',            150, 350, 180, TRUE),
  ('hair', 'Highlights',                    'Partial, half or full highlights. Price varies by hair length.',             150, 300, 150, TRUE),
  ('hair', 'Single Process Color',          'Single process hair color application.',                                      80, NULL,  90, TRUE),
  ('hair', 'Color Gloss',                   'Color gloss treatment for shine and vibrancy.',                               50,  60,  45, TRUE),
  ('hair', 'Keratin Treatment',             'Smoothing keratin treatment. Price varies by hair length.',                  250, 350, 180, TRUE),
  ('hair', 'Hair Botox',                    'Hair botox deep conditioning treatment.',                                    150, 250, 120, TRUE),
  ('hair', 'Conditioner Treatments',        'Deep conditioning treatment.',                                                35, NULL,  30, TRUE)
ON CONFLICT (name) DO NOTHING;

-- MALE SERVICES
INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('male', 'Eyebrows Threading',    'Male eyebrow threading',           8,  NULL, 15, TRUE),
  ('male', 'Ear Wax or Thread',     'Ear waxing or threading',         12,  NULL, 10, TRUE),
  ('male', 'Back Wax',              'Full back waxing for men',        40,  NULL, 45, TRUE),
  ('male', 'Chest Wax',             'Full chest waxing for men',       40,  NULL, 45, TRUE),
  ('male', 'Nostril Wax',           'Nostril waxing',                  12,  NULL, 10, TRUE)
ON CONFLICT (name) DO NOTHING;
