-- Rollback for 014: remove the blocked_slots guard from book_appointment.
--
-- WARNING -- side effects of running this:
--   * Bookings can once again be confirmed on stylists the owner has blocked
--     for vacation or breaks, IF the application-layer check is also bypassed.
--   * Restores the exact migration-008 function body. Any migration numbered
--     above 014 that also replaced book_appointment will be reverted with it --
--     check for later definitions before running.
--
-- The application layer (api/appointments.ts, server/src/services/bookingService.ts)
-- checks blocked_slots independently, so this rollback alone does not reopen the
-- bug for traffic going through those endpoints -- it only reopens the narrow
-- check-then-insert race. Rolling the code back too reopens it fully.
--
-- Run via: Supabase Dashboard -> SQL Editor.

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
    'confirmed', p_cancellation_token, p_user_id
  ) RETURNING * INTO v_appointment;

  RETURN v_appointment;
END;
$$;

COMMIT;

-- Verification:
--   SELECT prosrc LIKE '%SLOT_BLOCKED%' AS has_guard
--   FROM pg_proc WHERE proname = 'book_appointment';
--   (expect: false)
--
--   SELECT has_function_privilege('service_role', p.oid, 'EXECUTE')
--   FROM pg_proc p WHERE p.proname = 'book_appointment';
--   (expect: true)
