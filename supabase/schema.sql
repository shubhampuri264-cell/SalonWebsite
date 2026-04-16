-- ============================================================
-- Icon Studio – Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- 1. TABLES

CREATE TABLE IF NOT EXISTS stylists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  bio        TEXT,
  specialties TEXT[] DEFAULT '{}',
  years_exp  INTEGER DEFAULT 0,
  image_url  TEXT,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL CHECK (category IN ('hair', 'threading')),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  price_min   NUMERIC(8,2) NOT NULL,
  price_max   NUMERIC(8,2),
  duration_min INTEGER NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS appointments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id         UUID NOT NULL REFERENCES stylists(id),
  service_id         UUID NOT NULL REFERENCES services(id),
  client_name        TEXT NOT NULL,
  client_email       TEXT NOT NULL,
  client_phone       TEXT NOT NULL,
  appointment_date   DATE NOT NULL,
  appointment_time   TIME NOT NULL,
  duration_min       INTEGER NOT NULL,
  notes              TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
  cancellation_token UUID UNIQUE DEFAULT gen_random_uuid(),
  reminder_sent      BOOLEAN DEFAULT FALSE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocked_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id   UUID NOT NULL REFERENCES stylists(id),
  blocked_date DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. INDEXES

CREATE INDEX IF NOT EXISTS idx_appointments_stylist_date
  ON appointments(stylist_id, appointment_date);

CREATE INDEX IF NOT EXISTS idx_appointments_date
  ON appointments(appointment_date);

CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON appointments(status);

CREATE INDEX IF NOT EXISTS idx_appointments_cancel_token
  ON appointments(cancellation_token);

CREATE INDEX IF NOT EXISTS idx_blocked_slots_stylist_date
  ON blocked_slots(stylist_id, blocked_date);

-- 3. ROW LEVEL SECURITY

ALTER TABLE stylists ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;

-- Helper: owner admin check
-- IMPORTANT: Replace 'YOUR_OWNER_EMAIL@example.com' with your actual Supabase login email
-- before running this schema. This email is used by Row Level Security policies
-- to grant the owner full CRUD access to stylists and services.
-- Keep this value private — do NOT commit your real email to version control.
CREATE OR REPLACE FUNCTION public.is_owner_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    auth.role() = 'authenticated'
    AND lower(coalesce(auth.jwt()->>'email', '')) = lower('YOUR_OWNER_EMAIL@example.com');
$$;

-- Drop old permissive policies before applying locked-down ones
DROP POLICY IF EXISTS "Authenticated users can manage stylists" ON stylists;
DROP POLICY IF EXISTS "Authenticated users can manage services" ON services;
DROP POLICY IF EXISTS "Authenticated users can manage appointments" ON appointments;
DROP POLICY IF EXISTS "Authenticated users can manage blocked_slots" ON blocked_slots;

-- Stylists: public read (active only), owner-only full CRUD
DROP POLICY IF EXISTS "Public can read active stylists" ON stylists;
CREATE POLICY "Public can read active stylists"
  ON stylists FOR SELECT
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Owner can manage stylists" ON stylists;
CREATE POLICY "Owner can manage stylists"
  ON stylists FOR ALL
  USING (public.is_owner_admin())
  WITH CHECK (public.is_owner_admin());

-- Services: public read (active only), owner-only full CRUD
DROP POLICY IF EXISTS "Public can read active services" ON services;
CREATE POLICY "Public can read active services"
  ON services FOR SELECT
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Owner can manage services" ON services;
CREATE POLICY "Owner can manage services"
  ON services FOR ALL
  USING (public.is_owner_admin())
  WITH CHECK (public.is_owner_admin());

-- Appointments: owner-only direct access (API uses service role key server-side)
DROP POLICY IF EXISTS "Owner can manage appointments" ON appointments;
CREATE POLICY "Owner can manage appointments"
  ON appointments FOR ALL
  USING (public.is_owner_admin())
  WITH CHECK (public.is_owner_admin());

-- Blocked slots: owner-only direct access
DROP POLICY IF EXISTS "Owner can manage blocked_slots" ON blocked_slots;
CREATE POLICY "Owner can manage blocked_slots"
  ON blocked_slots FOR ALL
  USING (public.is_owner_admin())
  WITH CHECK (public.is_owner_admin());

-- 4. ATOMIC BOOKING RPC
-- Prevents double-booking via interval overlap check + row lock

CREATE OR REPLACE FUNCTION book_appointment(
  p_stylist_id       UUID,
  p_service_id       UUID,
  p_client_name      TEXT,
  p_client_email     TEXT,
  p_client_phone     TEXT,
  p_appointment_date DATE,
  p_appointment_time TIME,
  p_duration_min     INTEGER,
  p_notes            TEXT,
  p_cancellation_token UUID
)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appointment  appointments;
  v_conflict_count INTEGER;
BEGIN
  -- Check for overlapping appointments (with row-level lock for concurrency safety)
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
    stylist_id,
    service_id,
    client_name,
    client_email,
    client_phone,
    appointment_date,
    appointment_time,
    duration_min,
    notes,
    status,
    cancellation_token
  ) VALUES (
    p_stylist_id,
    p_service_id,
    p_client_name,
    p_client_email,
    p_client_phone,
    p_appointment_date,
    p_appointment_time,
    p_duration_min,
    p_notes,
    'pending',
    p_cancellation_token
  ) RETURNING * INTO v_appointment;

  RETURN v_appointment;
END;
$$;

-- 5. STORAGE BUCKETS
-- Run in Supabase Storage UI or via SQL:

INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-images', 'staff-images', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery-images', 'gallery-images', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Public read staff-images" ON storage.objects;
CREATE POLICY "Public read staff-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'staff-images');

DROP POLICY IF EXISTS "Authenticated upload staff-images" ON storage.objects;
CREATE POLICY "Authenticated upload staff-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'staff-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public read gallery-images" ON storage.objects;
CREATE POLICY "Public read gallery-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gallery-images');

DROP POLICY IF EXISTS "Authenticated upload gallery-images" ON storage.objects;
CREATE POLICY "Authenticated upload gallery-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'gallery-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated delete gallery-images" ON storage.objects;
CREATE POLICY "Authenticated delete gallery-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'gallery-images' AND auth.role() = 'authenticated');
