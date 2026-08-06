-- Rollback for 018: drop stylist -> service eligibility.
--
-- WARNING -- side effects of running this:
--   * Every stylist becomes bookable for every service again, including
--     pairings the salon does not offer.
--   * DEPLOY THE APPLICATION ROLLBACK FIRST. The running code reads
--     stylist_services on every stylist lookup, availability check and booking;
--     against a database without the table those queries error, which takes
--     booking down entirely rather than merely loosening it. Loosened is
--     recoverable, down is not.
--   * Sazana Aryal's displayed `specialties` are restored to the pre-018
--     threading-only list, which understates what she actually does.
--
-- Run via: Supabase Dashboard -> SQL Editor.

BEGIN;

DROP TABLE IF EXISTS public.stylist_services;

UPDATE stylists
   SET specialties = ARRAY[
         'Eyebrow Threading',
         'Facial Threading',
         'Upper Lip Threading',
         'Full Face Threading'
       ]
 WHERE name = 'Sazana Aryal';

DO $$
BEGIN
  IF to_regclass('public.migrations_applied') IS NOT NULL THEN
    DELETE FROM public.migrations_applied WHERE filename = '018_stylist_services.sql';
  END IF;
END $$;

COMMIT;

-- Verification:
--   SELECT to_regclass('public.stylist_services');
--   (expect: NULL)
