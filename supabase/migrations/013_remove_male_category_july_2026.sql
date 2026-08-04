-- Migration 013: Remove male category, July 2026 price sheet
-- Changes: drop the "Man Hair / Children Haircut" section entirely,
--          apply the owner's updated prices, rename Express Facial -> Facial
--          and Shampoo, Cut and Style -> Wash and Cut, add Threading and
--          Hair Cut and Color (consultation required, price_min = 0).

-- 1. Remove the male category.
--    appointments.service_id is a NOT NULL FK with no ON DELETE clause, so only
--    unreferenced rows can be deleted; anything already booked is deactivated.
DELETE FROM services
WHERE category = 'male'
  AND id NOT IN (SELECT service_id FROM appointments);

UPDATE services SET is_active = FALSE WHERE category = 'male';

-- 2. Price sheet
UPDATE services SET price_min = 6,  price_max = NULL WHERE name = 'Upper Lip';
UPDATE services SET price_min = 7,  price_max = NULL WHERE name = 'Chin';
UPDATE services SET price_min = 15, price_max = NULL WHERE name = 'Eyebrow Tinting';
UPDATE services SET price_min = 15, price_max = NULL WHERE name = 'Under Arms';
UPDATE services SET price_min = 25, price_max = NULL, duration_min = 20 WHERE name = 'Hot Oil Hair Massage';
UPDATE services SET price_min = 30, price_max = NULL WHERE name = 'Semi Brazilian';
UPDATE services SET price_min = 40, price_max = NULL WHERE name = 'Full Brazilian';
UPDATE services SET price_min = 45, price_max = NULL WHERE name = 'Brazilian Painless CBD Wax';

-- 3. Renames. name is UNIQUE, so guard against a pre-existing target name.
--    Renaming (rather than delete + insert) preserves the id, so existing
--    appointments keep pointing at a valid service.
UPDATE services SET name = 'Facial', price_min = 35, price_max = NULL, is_active = TRUE
WHERE name = 'Express Facial'
  AND NOT EXISTS (SELECT 1 FROM services WHERE name = 'Facial');

UPDATE services SET name = 'Wash and Cut', price_min = 40, price_max = NULL
WHERE name = 'Shampoo, Cut and Style'
  AND NOT EXISTS (SELECT 1 FROM services WHERE name = 'Wash and Cut');

-- 4. New services. price_min = 0 is the sentinel for "quote on consultation".
INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES ('threading', 'Threading', 'General threading service.', 8, NULL, 15, TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES ('hair', 'Hair Cut and Color', 'Cut and color service. Consultation required.', 0, NULL, 120, TRUE)
ON CONFLICT (name) DO NOTHING;
