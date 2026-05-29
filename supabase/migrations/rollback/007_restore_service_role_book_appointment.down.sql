-- ROLLBACK for migration 007 (service_role grant restoration)
--
-- WARNING: Applying this in isolation BREAKS the live application.
-- The Vercel API uses the service_role key to call book_appointment(); once
-- the grant is revoked, every booking attempt will fail with:
--   "permission denied for function book_appointment"
--
-- This down-migration only exists for completeness. The realistic rollback
-- sequence is:
--   1. Apply 006_security_hardening.down.sql  (re-opens to PUBLIC/anon/auth)
--   2. Apply this file                         (revokes the explicit service_role
--                                               grant — superfluous but matches
--                                               the exact pre-007 state)
--
-- Apply via: Supabase Dashboard → SQL Editor.

BEGIN;

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
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM service_role', fn);
  END LOOP;
END $$;

COMMIT;

-- Verification:
-- SELECT grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_name = 'book_appointment';
