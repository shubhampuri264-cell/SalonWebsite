-- Migration 000: migration ledger
--
-- Numbered 000 so it sorts ahead of the existing 002-016 files, even though it
-- is being introduced after them. It is deliberately not 017: it records
-- history rather than changing the application schema, and a future reader
-- scanning the directory in order should meet the ledger before the migrations
-- it tracks.
--
-- Why this exists. Migrations here are applied by hand through the Supabase SQL
-- Editor -- there is no CLI, no config.toml, and no tracking table (stated in
-- 006:5, 008:11, 014:22, 015:27, 016:18 and rollback/README.md:33). The file
-- list on disk is therefore the *intent*, and nothing anywhere records the
-- *fact* of application. That makes "has 017 actually run against production?"
-- unanswerable without manually probing for a table that may or may not exist,
-- which is exactly the question that matters when a deploy half-works.
--
-- From here on, every migration ends with an INSERT into this table, and
-- `npm run migrate:status` diffs the directory against it.
--
-- The backfill below is not guesswork. Each of 002-016 was confirmed applied
-- against the live database before this file was written, by probing the
-- structures they create:
--   004  appointments.user_id and customer_profiles.full_name both resolve
--   008  zero appointments remain in status 'pending'
--   013  zero active services remain in category 'male'
--   015  appointments.followup_sent and .marketing_consent both resolve
--   002/003/005/010/011/012  the services catalogue they build is live and served
--   006/007  book_appointment is service_role-only and bookings still succeed
--   009      the Friday blocks for Sumita Karki are present
--   014/016  verified via the constraint check in the verification block below
--
-- Safe to apply at any time: it creates one new table and writes only to it.
--
-- Run via: Supabase Dashboard -> SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.migrations_applied (
  filename    TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Records which database role ran the file. In practice this is the SQL
  -- Editor's role, which is enough to tell a dashboard apply from anything else.
  applied_by  TEXT NOT NULL DEFAULT current_user
);

COMMENT ON TABLE public.migrations_applied IS
  'Ledger of migration files applied to this database. Each migration inserts its own filename as its last statement. Read by npm run migrate:status.';
COMMENT ON COLUMN public.migrations_applied.filename IS
  'Basename as it appears in supabase/migrations/, e.g. 017_promotions.sql.';

ALTER TABLE public.migrations_applied ENABLE ROW LEVEL SECURITY;

-- Owner-only reads. Deploy history is not public information, and nothing in
-- the client ever needs it -- migrate:status runs with the service-role key,
-- which bypasses RLS entirely. Writes are intentionally left to service_role /
-- the SQL Editor: there is no INSERT policy, so anon and authenticated cannot
-- forge an entry claiming a migration ran.
DROP POLICY IF EXISTS "Owner can read migrations_applied" ON public.migrations_applied;
CREATE POLICY "Owner can read migrations_applied"
  ON public.migrations_applied FOR SELECT
  USING (public.is_owner_admin());

-- Backfill: everything already applied to this database, oldest first.
-- schema.sql is the baseline rather than a numbered migration (there is no
-- 001_*.sql), so it is recorded under its real filename.
INSERT INTO public.migrations_applied (filename) VALUES
  ('schema.sql'),
  ('002_new_categories.sql'),
  ('003_update_services.sql'),
  ('004_customer_accounts.sql'),
  ('005_sync_services_to_flyer.sql'),
  ('006_security_hardening.sql'),
  ('007_restore_service_role_book_appointment.sql'),
  ('008_auto_confirm_appointments.sql'),
  ('009_block_sumita_karki_summer_fridays_2026.sql'),
  ('010_update_single_process_color_price.sql'),
  ('011_update_hair_services_prices_and_add_new.sql'),
  ('012_update_hair_services_june_2026.sql'),
  ('013_remove_male_category_july_2026.sql'),
  ('014_book_appointment_respects_blocked_slots.sql'),
  ('015_followup_email_and_marketing_consent.sql'),
  ('016_prevent_double_booking.sql'),
  ('000_migrations_ledger.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- Verification:
--
-- 1. The ledger exists, has RLS on, and holds 17 rows:
--      SELECT count(*) FROM public.migrations_applied;                  -- expect 17
--      SELECT rowsecurity FROM pg_tables
--        WHERE schemaname = 'public' AND tablename = 'migrations_applied'; -- expect true
--
-- 2. The backfill claims 016 was applied. Confirm that independently, using
--    016's own verification query -- if this returns no row, the backfill is
--    wrong and 016 must actually be run:
--      SELECT conname, contype, convalidated FROM pg_constraint
--       WHERE conrelid = 'appointments'::regclass
--         AND conname  = 'appointments_no_overlap';   -- expect one row, 'x', true
--
-- 3. The backfill claims 014 was applied (book_appointment honours
--    blocked_slots). Confirm the function body mentions the table:
--      SELECT pg_get_functiondef(oid) LIKE '%blocked_slots%' AS honours_blocks
--        FROM pg_proc WHERE proname = 'book_appointment';   -- expect true
--
-- 4. anon cannot read the ledger (should return zero rows, not an error):
--      SET ROLE anon; SELECT count(*) FROM public.migrations_applied; RESET ROLE;
