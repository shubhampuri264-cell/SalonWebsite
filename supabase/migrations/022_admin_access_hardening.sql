-- Migration 022: admin access hardening
--
-- Audit: .claude/audit-2026-11-22-admin-access.md (findings M1, M2).
--
-- 1. Marks the owner's account with app_metadata.role = 'owner'.
--    The admin API (api/_lib/auth.ts checkAdmin) now trusts this role, plus a
--    two-step-verified session, instead of the email address. Anyone can open
--    an account here and emails are not verified ("Confirm email" is off), so
--    an email match was only safe while the owner's account existed. Users
--    cannot write app_metadata; only the service role or SQL can.
--
-- 2. Removes the owner's direct database powers.
--    Every admin screen goes through /api/admin/*, which uses the service role
--    and does its own validation, rate limiting and "bookings are never
--    deleted" rule. The "Owner can manage ..." policies only let the owner's
--    *browser token* write every table through Supabase's public REST API --
--    nothing in the app uses that, but a stolen token could (e.g. hard-delete
--    all bookings). Dropped here.
--
--    is_owner_admin() is redefined to always return false rather than
--    dropped: the storage policies on the two (empty, unused) image buckets
--    reference it, and editing storage.objects policies needs the storage
--    schema owner. A false function neutralises them all the same.
--
-- 3. Adds admin_session_assurance(session_id): how a session was verified
--    (aal, and WHICH authenticator). The API admits the owner only when her
--    session was verified with the one authenticator approved for her
--    (app_metadata.owner_factor_id, set by supabase/admin/approve-owner-
--    authenticator.sql once she has set it up in person). Without the pin,
--    anyone holding her password could add their own authenticator app and
--    reach aal2. Callable by the service role only.
--
-- ORDER: apply this BEFORE deploying the app version that checks the owner
-- role. The other way round locks the owner out (every admin request is
-- refused until the role exists). The currently deployed code never used the
-- dropped policies and checks the email, which this does not touch, so
-- applying it first is safe.
--
-- Rollback: rollback/022_admin_access_hardening.down.sql
-- Run via: supabase db query --linked -f <this file>, or the SQL Editor.

BEGIN;

-- 1. Owner role -------------------------------------------------------------
--
-- Applied to production 2026-11-22. The owner's login address is not kept in
-- this public repo: to run this on a fresh project, replace both
-- REPLACE_WITH_OWNER_LOGIN_EMAIL below first. Run unedited, it matches no
-- account (the placeholder is not a valid email) and stops, changing nothing.

DO $$
DECLARE
  v_updated INTEGER;
  v_other_owners INTEGER;
BEGIN
  UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "owner"}'::jsonb
   WHERE lower(email) = lower('REPLACE_WITH_OWNER_LOGIN_EMAIL');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Exactly one account, or stop: zero would lock the owner out after the
  -- deploy; more than one cannot happen (emails are unique) but is not
  -- something to paper over.
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 owner account, updated %', v_updated;
  END IF;

  SELECT count(*) INTO v_other_owners
    FROM auth.users
   WHERE raw_app_meta_data->>'role' = 'owner'
     AND lower(email) <> lower('REPLACE_WITH_OWNER_LOGIN_EMAIL');
  IF v_other_owners > 0 THEN
    RAISE EXCEPTION '% other account(s) carry the owner role; investigate before continuing', v_other_owners;
  END IF;
END $$;

-- 2. Owner database powers ----------------------------------------------------

DROP POLICY IF EXISTS "Owner can manage appointments"     ON public.appointments;
DROP POLICY IF EXISTS "Owner can manage blocked_slots"    ON public.blocked_slots;
DROP POLICY IF EXISTS "Owner can manage services"         ON public.services;
DROP POLICY IF EXISTS "Owner can manage stylists"         ON public.stylists;
DROP POLICY IF EXISTS "Owner can manage stylist services" ON public.stylist_services;
DROP POLICY IF EXISTS "Owner can manage promotions"       ON public.promotions;
DROP POLICY IF EXISTS "Owner can read migrations_applied" ON public.migrations_applied;

CREATE OR REPLACE FUNCTION public.is_owner_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  -- Retired by migration 022. Admin access is decided by the API
  -- (api/_lib/auth.ts), never by a browser token against the database.
  -- Kept only because storage policies still reference it.
  SELECT false;
$$;

-- 3. Session assurance lookup ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_session_assurance(p_session_id UUID)
RETURNS TABLE (user_id UUID, aal TEXT, factor_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, pg_temp
AS $$
  SELECT s.user_id, s.aal::text, s.factor_id
    FROM auth.sessions s
   WHERE s.id = p_session_id;
$$;

-- Same grant pattern as book_appointment (007): service role only. Supabase
-- grants EXECUTE on new public functions to anon and authenticated by
-- default, which would let any visitor probe session details.
REVOKE ALL ON FUNCTION public.admin_session_assurance(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_session_assurance(UUID) TO service_role;

DO $$
BEGIN
  IF to_regclass('public.migrations_applied') IS NOT NULL THEN
    INSERT INTO public.migrations_applied (filename) VALUES ('022_admin_access_hardening.sql')
    ON CONFLICT (filename) DO NOTHING;
  ELSE
    RAISE NOTICE 'migrations_applied not found -- skipping ledger entry. Apply 000_migrations_ledger.sql, then re-run this file to record it.';
  END IF;
END $$;

COMMIT;

-- Verification (expect: 1 / 0 / false / false,false,true):
--   SELECT count(*) FROM auth.users WHERE raw_app_meta_data->>'role' = 'owner';
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'Owner can%';
--   SELECT public.is_owner_admin();
--   SELECT has_function_privilege('anon', 'public.admin_session_assurance(uuid)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.admin_session_assurance(uuid)', 'EXECUTE'),
--          has_function_privilege('service_role', 'public.admin_session_assurance(uuid)', 'EXECUTE');
--   Only storage.objects rows should still mention is_owner_admin (now always false):
--   SELECT schemaname, tablename, policyname FROM pg_policies
--    WHERE qual ILIKE '%is_owner_admin%' OR with_check ILIKE '%is_owner_admin%';
