-- Migration 012: Hair services update (June 2026)
-- Changes: Blowdry price, remove Hair Wash, Conditioner price,
--          add Keratin Treatment, replace Man Haircut with Man/Children Haircut in hair category.

-- Update Blowdry price: $45-60 -> $40-50
UPDATE services SET price_min = 40, price_max = 50 WHERE name = 'Blowdry';

-- Delete Hair Wash
DELETE FROM services WHERE name = 'Hair Wash';

-- Update Conditioner Treatments: $35 -> $30
UPDATE services SET price_min = 30, price_max = NULL WHERE name = 'Conditioner Treatments';

-- Add Keratin Treatment under hair category
INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES ('hair', 'Keratin Treatment', 'Smoothing keratin treatment.', 250, 350, 90, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Remove Man Haircut from male category
DELETE FROM services WHERE name = 'Man Haircut';

-- Add Man/Children Haircut under hair category
INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES ('hair', 'Man/Children Haircut', 'Haircut for men and children.', 40, NULL, 30, TRUE)
ON CONFLICT (name) DO NOTHING;
