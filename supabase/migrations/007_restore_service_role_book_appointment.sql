-- Migration 007: Restore service_role EXECUTE on book_appointment
--
-- Migration 006 revoked EXECUTE from PUBLIC, which also stripped the implicit
-- grant that `service_role` inherited from PUBLIC's default. Result: the
-- server's bookings started failing with "permission denied for function
-- book_appointment" because supabaseAdmin (which authenticates as service_role)
-- could no longer call the RPC.
--
-- This restores service_role access without re-opening the anon/authenticated
-- vectors that 006 closed (the Supabase linter findings 0028/0029 stay fixed).

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
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

COMMIT;

-- Verification:
-- SELECT grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_name = 'book_appointment';
-- Should show service_role with EXECUTE, and NOT anon/authenticated.
