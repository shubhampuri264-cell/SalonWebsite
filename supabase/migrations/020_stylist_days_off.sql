-- Migration 020: weekly days off per stylist. Sumita Karki is off on Fridays.
--
-- The owner asked for Fridays to stop being bookable with Sumita, with no end
-- date. Sazana Aryal still works Fridays, and the salon's opening hours do not
-- change, so this is a property of the stylist rather than of the calendar --
-- BUSINESS_HOURS (api/_lib/businessHours.ts) stays as it is.
--
-- Why a column and not blocked_slots rows. Migration 009 blocked the summer
-- Fridays one row per date, which works for a fixed stretch but not for "every
-- Friday from now on": the 180-day booking horizon keeps moving, so the rows
-- would have to be topped up forever, and the booking calendar cannot grey out a
-- day it only learns is blocked after asking for its times.
--
-- Values are English weekday names ('Friday'), the same strings dayOfWeek()
-- returns in api/_lib/businessHours.ts and supabase/functions/chat/dates.ts, so
-- the check is a plain array lookup on both sides.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT READS IT. The availability check,
-- the booking write path and Iris all select stylists.days_off by name; against
-- a database without the column those queries error and online booking stops.
-- The column is additive with a default, so the code currently in production
-- is unaffected by it.
--
-- Idempotent: safe to re-run.
--
-- Run via: Supabase Dashboard -> SQL Editor.

BEGIN;

ALTER TABLE public.stylists
  ADD COLUMN IF NOT EXISTS days_off TEXT[] NOT NULL DEFAULT '{}';

-- A typo such as 'friday' or 'Fri' would match nothing and silently leave the
-- day bookable, so only the exact names the application compares against are
-- accepted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.stylists'::regclass
       AND conname  = 'stylists_days_off_valid'
  ) THEN
    ALTER TABLE public.stylists
      ADD CONSTRAINT stylists_days_off_valid CHECK (
        days_off <@ ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::TEXT[]
      );
  END IF;
END $$;

COMMENT ON COLUMN public.stylists.days_off IS
  'Weekdays this stylist is never bookable, as English names (e.g. {Friday}). Applies every week; one-off absences belong in blocked_slots.';

DO $$
BEGIN
  -- Fail loudly rather than quietly updating nothing: a no-op here leaves
  -- Fridays bookable while the release notes say they are not.
  IF NOT EXISTS (SELECT 1 FROM stylists WHERE name = 'Sumita Karki') THEN
    RAISE EXCEPTION 'Stylist "Sumita Karki" not found in stylists table';
  END IF;

  UPDATE stylists SET days_off = ARRAY['Friday'] WHERE name = 'Sumita Karki';
END $$;

DO $$
BEGIN
  IF to_regclass('public.migrations_applied') IS NOT NULL THEN
    INSERT INTO public.migrations_applied (filename) VALUES ('020_stylist_days_off.sql')
    ON CONFLICT (filename) DO NOTHING;
  ELSE
    RAISE NOTICE 'migrations_applied not found -- skipping ledger entry. Apply 000_migrations_ledger.sql, then re-run this file to record it.';
  END IF;
END $$;

COMMIT;

-- Verification:
--
--   SELECT name, days_off FROM stylists ORDER BY name;
--   (expect: Sazana Aryal {}, Sumita Karki {Friday})
--
--   Bookings this does NOT touch -- existing Friday appointments with Sumita
--   stay booked. List them so the owner can contact or move each one:
--     SELECT a.appointment_date, a.appointment_time, a.client_name, a.client_phone
--       FROM appointments a
--       JOIN stylists s ON s.id = a.stylist_id
--      WHERE s.name = 'Sumita Karki'
--        AND a.status <> 'cancelled'
--        AND a.appointment_date >= CURRENT_DATE
--        AND EXTRACT(ISODOW FROM a.appointment_date) = 5
--      ORDER BY a.appointment_date, a.appointment_time;
