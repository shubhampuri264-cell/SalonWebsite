-- Migration 014: book_appointment must respect blocked_slots
--
-- Background: GET /api/availability has always hidden slots that overlap a
-- blocked_slots row, but the write path never checked them. book_appointment
-- guarded appointment-vs-appointment overlap only, so a booking aimed at a
-- stylist on vacation was accepted and confirmed.
--
-- The application layer (api/appointments.ts, server/src/services/bookingService.ts)
-- now checks blocked_slots before calling this RPC, which closes the bug on its
-- own. This migration moves the check inside the RPC as well, so a caller that
-- skips the application check still cannot book over a blocked slot.
--
-- CORRECTION: an earlier version of this header claimed the FOR UPDATE below
-- also closes the check-then-insert race. It does not. FOR UPDATE locks only
-- the rows the query returns, and when the slot is free that is zero rows, so
-- two concurrent bookings both see FOUND = false and both INSERT. Migration 016
-- adds the exclusion constraint that actually closes it.
--
-- Callers already map SLOT_BLOCKED to the same customer-facing 409 as
-- SLOT_TAKEN, so applying this migration needs no coordinated code deploy.
--
-- Run via: Supabase Dashboard -> SQL Editor.

BEGIN;

-- Keeps the migration-004 signature (p_user_id), the migration-006 search_path
-- pin, and the migration-008 'confirmed' insert status. CREATE OR REPLACE
-- preserves the service_role EXECUTE grant from migration 007.
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
  -- NOTE: TIME + INTERVAL wraps at midnight in Postgres, so this arithmetic is
  -- only correct while every booking ends on the same calendar day. Business
  -- hours close at 20:00 and the longest service is 120 min (ends 22:00), so
  -- the wrap is unreachable today. Extending hours past midnight would require
  -- moving these columns to TIMESTAMPTZ.
  v_requested_end := p_appointment_time + make_interval(mins => p_duration_min);

  -- 1. Existing appointments (unchanged from migration 008)
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

  -- 2. Owner-set blocked slots (vacation, breaks). Same half-open overlap rule.
  --    No FOR UPDATE: blocked_slots is written by the owner via the admin UI,
  --    never concurrently with a customer booking, and locking it here would
  --    serialise unrelated bookings behind admin edits.
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
--
-- 1. Confirm the guard exists in the deployed function body:
--    SELECT prosrc LIKE '%SLOT_BLOCKED%' AS has_guard
--    FROM pg_proc WHERE proname = 'book_appointment';
--    (expect: true)
--
-- 2. Confirm the service_role grant survived CREATE OR REPLACE:
--    SELECT has_function_privilege('service_role', p.oid, 'EXECUTE')
--    FROM pg_proc p WHERE p.proname = 'book_appointment';
--    (expect: true -- booking is broken if this is false)
--
-- 3. Against a real blocked row (migration 009 blocks Sumita Karki on summer
--    Fridays), a booking inside that window must now raise SLOT_BLOCKED
--    instead of inserting.
