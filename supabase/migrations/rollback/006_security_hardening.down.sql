-- ROLLBACK for migration 006 (security hardening)
--
-- WARNING: This RE-OPENS the security holes that 006 closed. Only run it if
-- you have a concrete reason to revert (e.g. an unforeseen breakage that
-- cannot be fixed forward). Prefer fix-forward over rolling this back.
--
-- What this undoes:
--   1. Re-grants EXECUTE on book_appointment to PUBLIC, anon, authenticated
--      (which lets anyone hit /rest/v1/rpc/book_appointment and bypass the
--      server-side zod validation + rate limit). Supabase linter findings
--      0028/0029 will re-trigger after this runs.
--   2. Resets search_path on book_appointment and is_owner_admin to the
--      database default (mutable). Linter finding 0011 will re-trigger.
--   3. Restores the broad "public read" SELECT policies on the staff-images
--      and gallery-images storage buckets (allows anonymous listing).
--   4. Replaces the owner-only upload/delete storage policies with the prior
--      "any authenticated user" policies (any logged-in customer can upload
--      junk into storage — you pay for it).
--
-- Apply via: Supabase Dashboard → SQL Editor.
-- Companion: if you roll back 006 you must also roll back 007 (which depends
-- on 006). Run 007.down.sql AFTER this file.

BEGIN;

-- 1. Re-grant EXECUTE on book_appointment to the broad roles 006 revoked.
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
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- 2. Reset search_path to the database default (mutable).
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
    EXECUTE format('ALTER FUNCTION %s RESET search_path', fn);
  END LOOP;
END $$;

ALTER FUNCTION public.is_owner_admin() RESET search_path;

-- 3. Restore broad SELECT policies on the public storage buckets.
CREATE POLICY "Public read staff-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'staff-images');

CREATE POLICY "Public read gallery-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gallery-images');

-- 4. Drop the owner-only upload/delete policies, restore "authenticated" ones.
DROP POLICY IF EXISTS "Owner upload staff-images"    ON storage.objects;
DROP POLICY IF EXISTS "Owner upload gallery-images"  ON storage.objects;
DROP POLICY IF EXISTS "Owner delete staff-images"    ON storage.objects;
DROP POLICY IF EXISTS "Owner delete gallery-images"  ON storage.objects;

CREATE POLICY "Authenticated upload staff-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-images');

CREATE POLICY "Authenticated upload gallery-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gallery-images');

CREATE POLICY "Authenticated delete staff-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'staff-images');

CREATE POLICY "Authenticated delete gallery-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'gallery-images');

COMMIT;

-- Verification:
-- 1. Confirm anon/authenticated CAN call book_appointment again:
--    SELECT grantee, privilege_type
--    FROM information_schema.routine_privileges
--    WHERE routine_name = 'book_appointment';
-- 2. Confirm storage policies are restored:
--    SELECT policyname FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects';
