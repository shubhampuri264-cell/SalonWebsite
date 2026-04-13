-- Migration 004: Customer accounts
-- Adds optional user tracking to appointments and a customer profiles table.

-- 1. Add optional user_id to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id);

-- 2. Customer profiles table (one row per Supabase auth user who registers as a customer)
CREATE TABLE IF NOT EXISTS customer_profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  phone      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;

-- Customers can read and write their own profile
DROP POLICY IF EXISTS "customers_own_profile" ON customer_profiles;
CREATE POLICY "customers_own_profile"
  ON customer_profiles
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3. Allow customers to read their own appointments
DROP POLICY IF EXISTS "customers_own_appointments" ON appointments;
CREATE POLICY "customers_own_appointments"
  ON appointments FOR SELECT
  USING (auth.uid() = user_id);

-- 4. Update the atomic booking RPC to accept an optional user_id
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
AS $$
DECLARE
  v_appointment      appointments;
  v_conflict_count   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_conflict_count
  FROM appointments
  WHERE stylist_id = p_stylist_id
    AND appointment_date = p_appointment_date
    AND status NOT IN ('cancelled')
    AND (
      appointment_time < (p_appointment_time + make_interval(mins => p_duration_min))
      AND (appointment_time + make_interval(mins => duration_min)) > p_appointment_time
    )
  FOR UPDATE;

  IF v_conflict_count > 0 THEN
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
