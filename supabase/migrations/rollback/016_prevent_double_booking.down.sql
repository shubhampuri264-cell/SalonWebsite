-- Rollback for 016: drop the double-booking backstop.
--
-- WARNING -- side effects of running this:
--   * Two concurrent bookings for the same stylist and slot can both succeed
--     again. Nothing in the database or the application prevents it: the RPC's
--     FOR UPDATE locks zero rows when the slot is free, and READ COMMITTED
--     takes no gap lock. This is a real, reachable data-corruption path, not a
--     theoretical one.
--   * Restores migration 014's function body exactly. Any migration numbered
--     above 016 that also replaced book_appointment will be reverted with it --
--     check for later definitions before running.
--
-- btree_gist is left installed. Dropping an extension other objects may depend
-- on is riskier than leaving an unused one in place.
--
-- Run via: Supabase Dashboard -> SQL Editor.

BEGIN;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap;

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
  v_requested_end TIME;
BEGIN
  v_requested_end := p_appointment_time + make_interval(mins => p_duration_min);

  PERFORM 1
  FROM appointments
  WHERE stylist_id = p_stylist_id
    AND appointment_date = p_appointment_date
    AND status NOT IN ('cancelled')
    AND appointment_time < v_requested_end
    AND (appointment_time + make_interval(mins => duration_min)) > p_appointment_time
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
  FROM blocked_slots
  WHERE stylist_id = p_stylist_id
    AND blocked_date = p_appointment_date
    AND start_time < v_requested_end
    AND end_time > p_appointment_time;

  IF FOUND THEN
    RAISE EXCEPTION 'SLOT_BLOCKED' USING ERRCODE = 'P0001';
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
--   SELECT count(*) FROM pg_constraint
--   WHERE conrelid = 'appointments'::regclass AND conname = 'appointments_no_overlap';
--   (expect: 0)
