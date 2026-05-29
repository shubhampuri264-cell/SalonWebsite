-- ROLLBACK for migration 008 (auto-confirm appointments on creation)
--
-- DATA LOSS WARNING: Migration 008 backfilled every 'pending' row to
-- 'confirmed'. There is no way to know which of the current 'confirmed' rows
-- were originally 'pending' before 008 ran, so this rollback CANNOT restore
-- that distinction. It only reverts the RPC behavior going forward.
--
-- What this undoes:
--   1. Recreates book_appointment so new inserts default to 'pending' again.
--      (Existing rows are left as 'confirmed' — not reversible.)
--
-- Apply via: Supabase Dashboard → SQL Editor.

BEGIN;

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
    'pending', p_cancellation_token, p_user_id
  ) RETURNING * INTO v_appointment;

  RETURN v_appointment;
END;
$$;

COMMIT;

-- Verification:
-- Create a test booking via the API and confirm its status is 'pending':
-- SELECT status FROM appointments ORDER BY created_at DESC LIMIT 1;
