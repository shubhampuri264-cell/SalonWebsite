-- Migration 006: Security hardening
-- Addresses Supabase linter findings + audit findings.
-- Run AFTER migrations 001–005.
--
-- Apply via: Supabase Dashboard → SQL Editor → paste this file → Run.
-- Runs as a single transaction; rolls back atomically on error.

BEGIN;

-- ---------------------------------------------------------------
-- 1. Revoke direct RPC access to book_appointment
-- ---------------------------------------------------------------
-- LINT: 0028 anon_security_definer_function_executable
-- LINT: 0029 authenticated_security_definer_function_executable
--
-- Without this, anyone (logged in or not) can POST to
-- /rest/v1/rpc/book_appointment and bypass the server's zod validation,
-- rate limit, and email confirmation. The server uses the service-role
-- key which always bypasses these grants, so real bookings still work.
--
-- Loops over all overloads in case both the 10-param (pre-004) and
-- 11-param (post-004) signatures exist.

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT oid::regprocedure
    FROM pg_proc
    WHERE proname = 'book_appointment'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- 2. Pin search_path on every SECURITY DEFINER function
-- ---------------------------------------------------------------
-- LINT: 0011 function_search_path_mutable
--
-- Pins to (public, pg_temp) so a malicious user cannot shadow
-- referenced objects (e.g. auth.role()) by putting their own schema
-- earlier on the search_path.

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT oid::regprocedure
    FROM pg_proc
    WHERE proname = 'book_appointment'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
  END LOOP;
END $$;

ALTER FUNCTION public.is_owner_admin()
  SET search_path = public, pg_temp;

-- ---------------------------------------------------------------
-- 3. Drop broad SELECT policies on public storage buckets
-- ---------------------------------------------------------------
-- LINT: 0025 public_bucket_allows_listing
--
-- Public buckets already serve files via direct URL (no SELECT needed).
-- The broad SELECT policy was letting anyone *list* every file in the
-- bucket, which is more than needed for a public CDN.

DROP POLICY IF EXISTS "Public read staff-images"   ON storage.objects;
DROP POLICY IF EXISTS "Public read gallery-images" ON storage.objects;

-- ---------------------------------------------------------------
-- 4. Restrict storage uploads / deletes to the salon owner only
-- ---------------------------------------------------------------
-- AUDIT M2: previously any signed-in customer could upload to these
-- buckets and spam them with junk (you pay for storage).

DROP POLICY IF EXISTS "Authenticated upload staff-images"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload gallery-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete gallery-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete staff-images"   ON storage.objects;

CREATE POLICY "Owner upload staff-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'staff-images' AND public.is_owner_admin());

CREATE POLICY "Owner upload gallery-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'gallery-images' AND public.is_owner_admin());

CREATE POLICY "Owner delete staff-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'staff-images' AND public.is_owner_admin());

CREATE POLICY "Owner delete gallery-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'gallery-images' AND public.is_owner_admin());

COMMIT;

-- ---------------------------------------------------------------
-- Verification queries (run separately, after committing):
-- ---------------------------------------------------------------
-- 1. Confirm anon/authenticated cannot call book_appointment:
--    SELECT grantee, privilege_type
--    FROM information_schema.routine_privileges
--    WHERE routine_name = 'book_appointment';
--    (Should show ONLY service_role and postgres, NOT anon/authenticated)
--
-- 2. Confirm search_path is pinned:
--    SELECT proname, proconfig
--    FROM pg_proc
--    WHERE proname IN ('book_appointment', 'is_owner_admin');
--    (proconfig should contain 'search_path=public, pg_temp')
--
-- 3. Confirm storage policies:
--    SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects';
--    (Should NOT show any "Public read" or "Authenticated upload/delete" policies)
