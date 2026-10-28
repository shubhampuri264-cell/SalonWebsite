-- Rollback for 021: Sumita Karki bookable again 2026-10-31 to 2026-11-04.
--
-- Removes only the rows 021 inserted (matched on date, times and reason), so a
-- block the owner added by hand in the same window is left alone. Deleting a
-- single day from the admin Block Slots page does the same for that day.
--
-- No deploy is needed either way: the code reads whatever rows exist.
--
-- Run via: Supabase Dashboard -> SQL Editor.

BEGIN;

DELETE FROM blocked_slots b
 USING stylists s
 WHERE s.id = b.stylist_id
   AND s.name = 'Sumita Karki'
   AND b.blocked_date BETWEEN '2026-10-31' AND '2026-11-04'
   AND b.start_time = '10:00'::time
   AND b.end_time   = '19:30'::time
   AND b.reason     = 'Hair stylist not available from Oct 31 till Nov 4';

DO $$
BEGIN
  IF to_regclass('public.migrations_applied') IS NOT NULL THEN
    DELETE FROM public.migrations_applied WHERE filename = '021_hair_stylist_away_oct_nov_2026.sql';
  END IF;
END $$;

COMMIT;

-- Verification:
--   SELECT count(*) FROM blocked_slots b JOIN stylists s ON s.id = b.stylist_id
--    WHERE s.name = 'Sumita Karki' AND b.blocked_date BETWEEN '2026-10-31' AND '2026-11-04';
--   (expect: 0, unless the owner blocked part of a day by hand)
