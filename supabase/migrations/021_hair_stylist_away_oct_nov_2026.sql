-- Migration 021: Sumita Karki (hair stylist) away Saturday 2026-10-31 to
-- Wednesday 2026-11-04 inclusive. Bookable again Thursday 2026-11-05.
--
-- One-off absences belong in blocked_slots (see migration 020), one row per
-- day. The rows block online booking on their own, with no deploy: they are
-- read by GET /api/availability, by findFreeStylists on the booking and
-- reschedule paths, and by the book_appointment RPC (migration 014). They also
-- show on the admin Block Slots page with their reason, so the owner can delete
-- a day there if plans change.
--
-- Each row runs 10:00-19:30, which covers opening hours on every day of the
-- week (Sunday closes at 18:00). A block covering a day's full opening hours is
-- what the website and Iris treat as a day away: they grey it out and show the
-- time-off note. A shorter block is only a busy stretch and says nothing.
--
-- Idempotent: safe to re-run.
--
-- Run via: Supabase Dashboard -> SQL Editor.

BEGIN;

DO $$
DECLARE
  v_stylist_id UUID;
BEGIN
  SELECT id INTO v_stylist_id FROM stylists WHERE name = 'Sumita Karki';
  -- Fail loudly rather than quietly inserting nothing: a no-op here leaves the
  -- days bookable while the website says they are not.
  IF v_stylist_id IS NULL THEN
    RAISE EXCEPTION 'Stylist "Sumita Karki" not found in stylists table';
  END IF;

  INSERT INTO blocked_slots (stylist_id, blocked_date, start_time, end_time, reason)
  SELECT v_stylist_id, d::date, '10:00'::time, '19:30'::time,
         'Hair stylist not available from Oct 31 till Nov 4'
  FROM generate_series('2026-10-31'::date, '2026-11-04'::date, '1 day') AS d
  WHERE NOT EXISTS (
    SELECT 1 FROM blocked_slots b
    WHERE b.stylist_id   = v_stylist_id
      AND b.blocked_date = d::date
      AND b.start_time   = '10:00'::time
      AND b.end_time     = '19:30'::time
  );
END $$;

DO $$
BEGIN
  IF to_regclass('public.migrations_applied') IS NOT NULL THEN
    INSERT INTO public.migrations_applied (filename) VALUES ('021_hair_stylist_away_oct_nov_2026.sql')
    ON CONFLICT (filename) DO NOTHING;
  ELSE
    RAISE NOTICE 'migrations_applied not found -- skipping ledger entry. Apply 000_migrations_ledger.sql, then re-run this file to record it.';
  END IF;
END $$;

COMMIT;

-- Verification:
--
--   SELECT b.blocked_date, b.start_time, b.end_time, b.reason
--     FROM blocked_slots b
--     JOIN stylists s ON s.id = b.stylist_id
--    WHERE s.name = 'Sumita Karki'
--      AND b.blocked_date BETWEEN '2026-10-31' AND '2026-11-04'
--    ORDER BY b.blocked_date;
--   (expect: 5 rows, 2026-10-31 through 2026-11-04, 10:00-19:30)
--
--   Bookings this does NOT touch -- appointments already made with Sumita in
--   the window stay booked. List them so the owner can contact or move each one:
--     SELECT a.appointment_date, a.appointment_time, a.client_name, a.client_phone
--       FROM appointments a
--       JOIN stylists s ON s.id = a.stylist_id
--      WHERE s.name = 'Sumita Karki'
--        AND a.status <> 'cancelled'
--        AND a.appointment_date BETWEEN '2026-10-31' AND '2026-11-04'
--      ORDER BY a.appointment_date, a.appointment_time;
