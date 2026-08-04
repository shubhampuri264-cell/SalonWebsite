-- Migration 016: make double-booking impossible at the database level
--
-- Background: migration 014's header claims its FOR UPDATE closes the
-- check-then-insert race. It does not, and the claim has been corrected in
-- that file. `PERFORM 1 FROM appointments ... FOR UPDATE` locks only the rows
-- it returns; when the slot is free that is zero rows and therefore zero
-- locks. Under READ COMMITTED there is no gap lock, so two concurrent
-- transactions both see FOUND = false and both INSERT. No unique or exclusion
-- constraint existed to stop them, so the salon ends up with two customers
-- booked onto one stylist at one time and no error anywhere.
--
-- This migration adds the missing backstop and teaches book_appointment to
-- report a constraint hit as the SLOT_TAKEN the callers already handle.
--
-- Self-contained: the function body below includes migration 014's
-- blocked_slots guard, so applying this works whether or not 014 has been run.
--
-- Run via: Supabase Dashboard -> SQL Editor.

BEGIN;

-- Needed for `stylist_id WITH =` in a GiST exclusion constraint: core GiST has
-- no equality operator class for uuid.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Preflight. ADD CONSTRAINT validates existing rows, so if the table already
-- holds an overlapping pair the ALTER fails with a generic message that does
-- not say which rows. Fail early with a count and a pointer instead.
DO $$
DECLARE
  v_conflicts INTEGER;
BEGIN
  SELECT count(*) INTO v_conflicts
  FROM appointments a
  JOIN appointments b
    ON a.id < b.id
   AND a.stylist_id = b.stylist_id
   AND a.appointment_date = b.appointment_date
   AND a.status <> 'cancelled'
   AND b.status <> 'cancelled'
   AND a.appointment_time < b.appointment_time + make_interval(mins => b.duration_min)
   AND b.appointment_time < a.appointment_time + make_interval(mins => a.duration_min);

  IF v_conflicts > 0 THEN
    RAISE EXCEPTION
      'Cannot add appointments_no_overlap: % overlapping pair(s) already exist. List them with the query in this migration''s footer, cancel or move the losers, then re-run.',
      v_conflicts;
  END IF;
END $$;

-- The real fix. Half-open ranges, so 10:00-11:00 and 11:00-12:00 do not
-- collide. Built on (date + time) timestamps rather than TIME arithmetic, so
-- unlike the RPC's `p_appointment_time + interval` this does not wrap at
-- midnight — a service that runs past 00:00 is compared correctly.
--
-- Partial on status: cancelled appointments free their slot, matching
-- `.neq('status', 'cancelled')` in api/appointments.ts and api/availability.ts.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    stylist_id WITH =,
    tsrange(
      (appointment_date + appointment_time),
      (appointment_date + appointment_time + make_interval(mins => duration_min))
    ) WITH &&
  )
  WHERE (status <> 'cancelled');

-- Re-declare book_appointment so a constraint hit surfaces as SLOT_TAKEN.
-- Without this the losing transaction of a race returns raw SQLSTATE 23P01,
-- which api/appointments.ts does not recognise and reports to the customer as
-- a 500 "Booking failed" — an alarming message for what is really "someone
-- beat you to it, pick another time".
--
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
  -- hours close at 20:00 and api/_lib/businessHours.ts rejects any booking
  -- whose end runs past close, so the wrap is unreachable. The exclusion
  -- constraint above is midnight-safe regardless.
  v_requested_end := p_appointment_time + make_interval(mins => p_duration_min);

  -- 1. Existing appointments. Advisory only: this is the fast, friendly path
  --    that turns the common case into a clean SLOT_TAKEN. It does NOT close
  --    the race (see the header) — appointments_no_overlap does.
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

EXCEPTION
  -- Only 23P01 is caught here. The SLOT_TAKEN / SLOT_BLOCKED raises above use
  -- P0001 (raise_exception) and pass through untouched.
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = 'P0001';
END;
$$;

COMMIT;

-- Verification:
--
-- 1. Constraint is present and validated:
--    SELECT conname, contype, convalidated
--    FROM pg_constraint WHERE conrelid = 'appointments'::regclass
--      AND conname = 'appointments_no_overlap';
--    (expect: one row, contype = 'x', convalidated = true)
--
-- 2. The constraint actually bites. Against any confirmed appointment, a
--    direct overlapping INSERT for the same stylist must fail with 23P01:
--    INSERT INTO appointments (stylist_id, service_id, client_name,
--      client_email, client_phone, appointment_date, appointment_time,
--      duration_min, status, cancellation_token)
--    SELECT stylist_id, service_id, 'Overlap Test', 'test@example.com',
--      '0000000', appointment_date, appointment_time, duration_min,
--      'confirmed', gen_random_uuid()
--    FROM appointments WHERE status <> 'cancelled' LIMIT 1;
--    (expect: ERROR conflicting key value violates exclusion constraint)
--
-- 3. Cancelling frees the slot — the partial WHERE is doing its job:
--    the same INSERT must succeed once the original row is set to 'cancelled'.
--
-- 4. service_role grant survived CREATE OR REPLACE:
--    SELECT has_function_privilege('service_role', p.oid, 'EXECUTE')
--    FROM pg_proc p WHERE p.proname = 'book_appointment';
--    (expect: true -- booking is broken if this is false)
--
-- If the preflight above aborted, list the offending pairs with:
--   SELECT a.id AS keep_id, b.id AS conflict_id, a.stylist_id,
--          a.appointment_date, a.appointment_time, a.duration_min,
--          b.appointment_time, b.duration_min
--   FROM appointments a
--   JOIN appointments b
--     ON a.id < b.id
--    AND a.stylist_id = b.stylist_id
--    AND a.appointment_date = b.appointment_date
--    AND a.status <> 'cancelled' AND b.status <> 'cancelled'
--    AND a.appointment_time < b.appointment_time + make_interval(mins => b.duration_min)
--    AND b.appointment_time < a.appointment_time + make_interval(mins => a.duration_min)
--   ORDER BY a.appointment_date, a.appointment_time;
