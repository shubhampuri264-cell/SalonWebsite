-- Rollback for 020: drop weekly stylist days off.
--
-- WARNING -- side effects of running this:
--   * Sumita Karki becomes bookable on Fridays again.
--   * DEPLOY THE APPLICATION ROLLBACK FIRST. The running code selects
--     stylists.days_off on every availability check, booking and Iris catalogue
--     load; against a database without the column those queries error, which
--     takes booking down entirely. To make Fridays bookable again without any
--     deploy, clear the value instead -- it loses nothing:
--       UPDATE stylists SET days_off = '{}' WHERE name = 'Sumita Karki';
--
-- Run via: Supabase Dashboard -> SQL Editor.

BEGIN;

ALTER TABLE public.stylists DROP CONSTRAINT IF EXISTS stylists_days_off_valid;
ALTER TABLE public.stylists DROP COLUMN IF EXISTS days_off;

DO $$
BEGIN
  IF to_regclass('public.migrations_applied') IS NOT NULL THEN
    DELETE FROM public.migrations_applied WHERE filename = '020_stylist_days_off.sql';
  END IF;
END $$;

COMMIT;

-- Verification:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'stylists' AND column_name = 'days_off';
--   (expect: 0 rows)
