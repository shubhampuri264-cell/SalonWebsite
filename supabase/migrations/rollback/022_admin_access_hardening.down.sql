-- Rollback for 022: restore the owner's direct database policies and the
-- email-based is_owner_admin().
--
-- WARNING -- side effects of running this:
--   * Re-opens finding M2 of .claude/audit-2026-11-22-admin-access.md: the
--     owner's browser token can again write every table directly through
--     Supabase's REST API, bypassing the admin API.
--   * Leaves app_metadata.role = 'owner' on the owner's account. That is
--     harmless on its own; the application decides whether it is used. To
--     go back to email-based admin checks, ROLL BACK THE APP DEPLOY instead --
--     this file is not needed for that.
--
-- Run via: supabase db query --linked -f <this file>, or the SQL Editor.

BEGIN;

-- The deployed app needs this while it checks the owner's authenticator;
-- dropping it makes every admin request fail. Roll the app back first.
DROP FUNCTION IF EXISTS public.admin_session_assurance(UUID);

CREATE OR REPLACE FUNCTION public.is_owner_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    auth.role() = 'authenticated'
    AND lower(coalesce(auth.jwt()->>'email', '')) = lower('sumipuri34@gmail.com');
$$;

CREATE POLICY "Owner can manage appointments" ON public.appointments
  FOR ALL USING (public.is_owner_admin()) WITH CHECK (public.is_owner_admin());
CREATE POLICY "Owner can manage blocked_slots" ON public.blocked_slots
  FOR ALL USING (public.is_owner_admin()) WITH CHECK (public.is_owner_admin());
CREATE POLICY "Owner can manage services" ON public.services
  FOR ALL USING (public.is_owner_admin()) WITH CHECK (public.is_owner_admin());
CREATE POLICY "Owner can manage stylists" ON public.stylists
  FOR ALL USING (public.is_owner_admin()) WITH CHECK (public.is_owner_admin());
CREATE POLICY "Owner can manage stylist services" ON public.stylist_services
  FOR ALL USING (public.is_owner_admin()) WITH CHECK (public.is_owner_admin());
CREATE POLICY "Owner can manage promotions" ON public.promotions
  FOR ALL USING (public.is_owner_admin()) WITH CHECK (public.is_owner_admin());
CREATE POLICY "Owner can read migrations_applied" ON public.migrations_applied
  FOR SELECT USING (public.is_owner_admin());

DO $$
BEGIN
  IF to_regclass('public.migrations_applied') IS NOT NULL THEN
    DELETE FROM public.migrations_applied WHERE filename = '022_admin_access_hardening.sql';
  END IF;
END $$;

COMMIT;

-- Verification (expect 7):
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'Owner can%';
