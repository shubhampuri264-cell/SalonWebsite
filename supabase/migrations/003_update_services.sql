-- Migration 003: Update threading prices and insert new services
-- Run AFTER migration 002.

-- ---------------------------------------------------------------
-- 1. UPDATE existing threading services to new prices
-- ---------------------------------------------------------------

UPDATE services SET price_min = 8,  price_max = NULL, duration_min = 15 WHERE name = 'Eyebrow Threading';
UPDATE services SET price_min = 5,  price_max = NULL, duration_min = 10 WHERE name = 'Upper Lip Threading';
UPDATE services SET price_min = 7,  price_max = NULL, duration_min = 10 WHERE name = 'Chin Threading';

-- Rename "Full Face Threading" → "Full Face & Neck" and update price
UPDATE services
  SET name = 'Full Face & Neck', price_min = 35, price_max = NULL, duration_min = 30
  WHERE name = 'Full Face Threading';

-- ---------------------------------------------------------------
-- 2. INSERT new threading / waxing services (under 'threading')
-- ---------------------------------------------------------------

INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('threading', 'Nose Threading',        'Nose hair threading',             10, NULL, 10, TRUE),
  ('threading', 'Face Threading',        'Full face threading',             12, NULL, 15, TRUE),
  ('threading', 'Cheeks Threading',      'Cheeks threading',                10, NULL, 15, TRUE),
  ('threading', 'Forehead Threading',    'Forehead threading',              10, NULL, 10, TRUE),
  ('threading', 'Ears Threading',        'Ear threading',                   10, NULL, 10, TRUE),
  ('threading', 'Half Arms Wax',         'Half arms waxing service',        30, NULL, 30, TRUE),
  ('threading', 'Full Arms Wax',         'Full arms waxing service',        40, NULL, 45, TRUE),
  ('threading', 'Small Brazilian Wax',   'Small Brazilian wax',             45, NULL, 30, TRUE),
  ('threading', 'Half Brazilian Wax',    'Half Brazilian wax',              50, NULL, 45, TRUE),
  ('threading', 'Full Brazilian Wax',    'Full Brazilian wax',              55, NULL, 60, TRUE),
  ('threading', 'Sugar Wax',             'Full body sugar wax treatment',   50, NULL, 45, TRUE),
  ('threading', 'CBD Wax',               'CBD-infused wax treatment',       50, NULL, 45, TRUE)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. INSERT facial services
-- ---------------------------------------------------------------

INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('facial', 'Express Facial',                   'Quick refreshing facial treatment',                        55,  NULL, 45, TRUE),
  ('facial', 'Hydrafacial Treatment',             'Hydrating facial with deep cleanse and moisture boost',    65,  NULL, 60, TRUE),
  ('facial', 'Anti-Aging Facial',                 'Facial targeting fine lines and skin rejuvenation',        85,  NULL, 75, TRUE),
  ('facial', 'Deep Cleansing Facial',             'Deep pore cleanse and purifying facial',                   70,  NULL, 60, TRUE),
  ('facial', 'Gold Facial',                       '24k gold-infused luxury facial',                           80,  NULL, 75, TRUE),
  ('facial', 'Diamond Facial',                    'Diamond-tip microdermabrasion facial',                     90,  NULL, 75, TRUE),
  ('facial', 'Rejuvenating Pearl Layer Facial',   'Pearl layer peel for bright, renewed skin',                80,  NULL, 75, TRUE),
  ('facial', 'Facial Bleach',                     'Skin brightening facial bleach treatment',                 25,  NULL, 30, TRUE)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. INSERT special keratreatment services
-- ---------------------------------------------------------------

INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('special_treatment', 'Eyelashes - Classic',           'Classic full set eyelash extensions',                   25, NULL, 30, TRUE),
  ('special_treatment', 'Eyelashes - Cluster',           'Cluster eyelash extensions for a fuller look',          35, NULL, 45, TRUE),
  ('special_treatment', 'Eyelashes - Individual',        'Individual lash extension application',                 40, NULL, 60, TRUE),
  ('special_treatment', 'Eyebrow Mapping & Tattoo',      'Precision eyebrow mapping and semi-permanent tattoo (30 min)', 22, NULL, 30, TRUE),
  ('special_treatment', 'Eyebrow Tinting',               'Eyebrow tinting for defined, fuller brows',             24, NULL, 20, TRUE),
  ('special_treatment', 'Lash Lifting + Tint',           'Lash lift with tinting for curled, darkened lashes',    80, NULL, 60, TRUE),
  ('special_treatment', 'Eyebrow Lamination',            'Eyebrow lamination for sleek, groomed brows',           65, NULL, 60, TRUE)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------
-- 5. INSERT wax special services
-- ---------------------------------------------------------------

INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('waxing', 'Back Wax',   'Full back waxing service',   12, NULL, 30, TRUE),
  ('waxing', 'Chest Wax',  'Full chest waxing service',  40, NULL, 30, TRUE),
  ('waxing', 'Neck Wax',   'Neck waxing service',        40, NULL, 20, TRUE)
ON CONFLICT (name) DO NOTHING;
