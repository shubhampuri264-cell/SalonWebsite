-- Migration 008: Auto-confirm appointments on creation
--
-- The salon has no separate "owner approves the booking" step — every booked
-- slot is effectively confirmed the moment it lands in the table. Showing
-- "Pending" to the customer just causes confusion ("did I actually get the
-- slot?"). This migration:
--   1. Backfills every existing 'pending' appointment to 'confirmed'.
--   2. Updates the book_appointment RPC so new bookings insert as 'confirmed'
--      directly.
--
-- Run via: Supabase Dashboard → SQL Editor.

BEGIN;

-- 1. Backfill existing pending rows
UPDATE appointments
SET status = 'confirmed'
WHERE status = 'pending';

-- 2. Recreate book_appointment with 'confirmed' as the default insert status.
--    Keeps the migration-004 signature (with p_user_id) and the migration-006
--    search_path pin. CREATE OR REPLACE preserves existing EXECUTE grants
--    (service_role from migration 007).
CREATE OR REPLACE FUNCTION book_appointment(
  p_stylist_id         UUID,
  p_service_id         UUID,
  p_client_name        TEXT,
  p_client_email       TEXT,
  p_client_phone       TEXT,
  p_appointment_date   DATE,
  p_appointment_time   TIME,
  p_duration_min       INTEGER,
  p_notes              TEXT,
  p_cancellation_token UUID,
  p_user_id            UUID DEFAULT NULL
)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_appointment appointments;
BEGIN
  PERFORM 1
  FROM appointments
  WHERE stylist_id = p_stylist_id
    AND appointment_date = p_appointment_date
    AND status NOT IN ('cancelled')
    AND (
      appointment_time < (p_appointment_time + make_interval(mins => p_duration_min))
      AND (appointment_time + make_interval(mins => duration_min)) > p_appointment_time
    )
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO appointments (
    stylist_id, service_id, client_name, client_email, client_phone,
    appointment_date, appointment_time, duration_min, notes,
    status, cancellation_token, user_id
  ) VALUES (
    p_stylist_id, p_service_id, p_client_name, p_client_email, p_client_phone,
    p_appointment_date, p_appointment_time, p_duration_min, p_notes,
    'confirmed', p_cancellation_token, p_user_id
  ) RETURNING * INTO v_appointment;

  RETURN v_appointment;
END;
$$;

COMMIT;

-- Verification:
-- SELECT status, COUNT(*) FROM appointments GROUP BY status;
-- (Should show 0 rows with status='pending' after running)
