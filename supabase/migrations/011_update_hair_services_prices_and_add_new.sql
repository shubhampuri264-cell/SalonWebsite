-- Migration 011: Update hair service prices and add new services
-- Prices sourced from owner's updated price list (June 2026).

-- ---------------------------------------------------------------
-- 1. Update existing hair service prices
-- ---------------------------------------------------------------

UPDATE services SET price_min = 100, price_max = 200 WHERE name = 'Hair Botox';
UPDATE services SET price_min = 50,  price_max = 70  WHERE name = 'Shampoo, Cut and Style';
UPDATE services SET price_min = 40,  price_max = 50  WHERE name = 'Color Gloss';
UPDATE services SET price_min = 100, price_max = 250 WHERE name = 'Highlights';
UPDATE services SET price_min = 200, price_max = 300 WHERE name = 'Balayage';

-- ---------------------------------------------------------------
-- 2. Add new hair services
-- ---------------------------------------------------------------

INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('hair', 'Baldy',      'Buzz cut / very short cut.',              40,   50,  30, TRUE),
  ('hair', 'Hair Wash',  'Hair wash service.',                      10, NULL,  15, TRUE)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. Add man haircut under male category
-- ---------------------------------------------------------------

INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES
  ('male', 'Man Haircut', 'Haircut for men.', 40, NULL, 30, TRUE)
ON CONFLICT (name) DO NOTHING;
