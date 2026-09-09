-- Migration 019: September 2026 hair menu.
--
-- Two changes the owner asked for, both inside the hair category:
--
--   1. "Hair Cut and Color" is retired in favour of "Cut and Style", also
--      priced on consultation. This is a retire + insert, NOT a rename: the two
--      are different services, and a rename would silently convert anyone
--      already booked for a cut and colour into a cut and style.
--   2. "Man/Children Haircut" splits into "Man Hair Cut" and "Children
--      Haircut", both $40 / 30 min. This one IS a rename plus an insert. Price
--      and duration are unchanged, so an existing booking still reads
--      correctly, and the rename keeps the id -- which keeps both the
--      appointments FK and the stylist_services row from migration 018.
--
-- Closing times moved in the same release (Mon-Sat 19:30, Sun 18:00), but hours
-- are not in the database -- see api/_lib/businessHours.ts. The comments in
-- migrations 014 and 016 that reason from "hours close at 20:00" still hold: an
-- earlier close only widens the margin before the midnight TIME wrap.
--
-- Idempotent. `name` is UNIQUE and is the only stable identifier across
-- environments (ids are random UUIDs), so every statement is guarded by name and
-- the file can be re-run.

BEGIN;

-- 1. Retire Hair Cut and Color.
--
--    appointments.service_id is a NOT NULL FK with no ON DELETE clause, so a
--    referenced row cannot be deleted; it is deactivated instead, and the
--    existing appointment still resolves to a service. Same two-step migration
--    013 used to remove the male category.
--
--    A delete cascades to stylist_services (ON DELETE CASCADE); a deactivation
--    leaves that row behind, which is harmless -- the service is off the menu.
DELETE FROM services
WHERE name = 'Hair Cut and Color'
  AND id NOT IN (SELECT service_id FROM appointments);

UPDATE services SET is_active = FALSE WHERE name = 'Hair Cut and Color';

-- 2. Cut and Style. price_min = 0 with price_max NULL is the established
--    sentinel for "quote on consultation" (migration 013); ServiceCard.tsx and
--    Iris's priceLabel() both already render it as such.
INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES ('hair', 'Cut and Style', 'Cut and style. Consultation required.', 0, NULL, 60, TRUE)
ON CONFLICT (name) DO NOTHING;

-- 3. Split the combined haircut. NOT EXISTS guards the UNIQUE constraint on a
--    re-run, the same shape migration 013 used for its renames.
UPDATE services
   SET name = 'Man Hair Cut', description = 'Haircut for men.'
 WHERE name = 'Man/Children Haircut'
   AND NOT EXISTS (SELECT 1 FROM services WHERE name = 'Man Hair Cut');

INSERT INTO services (category, name, description, price_min, price_max, duration_min, is_active)
VALUES ('hair', 'Children Haircut', 'Haircut for children.', 40, NULL, 30, TRUE)
ON CONFLICT (name) DO NOTHING;

-- 4. Eligibility backfill. NOT optional: migration 018 spells out that a service
--    with no stylist_services row is bookable with NOBODY -- it appears on the
--    menu and then offers an empty stylist list. Sumita Karki performs the whole
--    hair category, so this is 018's own INSERT ... SELECT, which picks up both
--    Cut and Style and Children Haircut.
DO $$
DECLARE
  v_sumita UUID;
BEGIN
  SELECT id INTO v_sumita FROM stylists WHERE name = 'Sumita Karki';

  -- Fail loudly rather than quietly inserting nothing: a no-op here ships two
  -- services no customer can book.
  IF v_sumita IS NULL THEN
    RAISE EXCEPTION 'Stylist "Sumita Karki" not found in stylists table';
  END IF;

  INSERT INTO public.stylist_services (stylist_id, service_id)
  SELECT v_sumita, s.id FROM services s WHERE s.category = 'hair'
  ON CONFLICT DO NOTHING;
END $$;

DO $$
BEGIN
  IF to_regclass('public.migrations_applied') IS NOT NULL THEN
    INSERT INTO public.migrations_applied (filename) VALUES ('019_hair_menu_sept_2026.sql')
    ON CONFLICT (filename) DO NOTHING;
  ELSE
    RAISE NOTICE 'migrations_applied not found -- skipping ledger entry. Apply 000_migrations_ledger.sql, then re-run this file to record it.';
  END IF;
END $$;

COMMIT;

-- Verification:
--
--   The hair menu:
--     SELECT name, price_min, price_max, duration_min, is_active
--       FROM services WHERE category = 'hair' ORDER BY name;
--     (expect: Children Haircut 40/NULL/30, Cut and Style 0/NULL/60,
--      Man Hair Cut 40/NULL/30; no 'Man/Children Haircut'; 'Hair Cut and Color'
--      either absent or is_active = false)
--
--   THE ONE THAT MATTERS -- any active service nobody can perform (see 018):
--     SELECT s.category, s.name
--       FROM services s
--      WHERE s.is_active
--        AND NOT EXISTS (
--          SELECT 1 FROM stylist_services ss
--            JOIN stylists st ON st.id = ss.stylist_id
--           WHERE ss.service_id = s.id AND st.is_active
--        )
--      ORDER BY s.category, s.name;
--     (expect: 0 rows)
--
--   Sumita's service count moves from 12 to 13 (12 hair + Hot Oil Hair Massage),
--   or to 14 if 'Hair Cut and Color' was deactivated rather than deleted and so
--   kept its eligibility row.
