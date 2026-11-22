-- Reset the owner's two-step sign-in (lost or replaced phone, or an
-- authenticator nobody recognises).
--
-- Confirm it is really her asking -- call her on the number you know. This is
-- the one step that removes the second factor.
--
-- What it does:
--   * Deletes every authenticator on the owner account and the approval pin.
--   * Signs her out everywhere.
-- She then signs in with her password, sets up again, and you run
-- approve-owner-authenticator.sql.
--
-- If someone else may know her password, have her reset it first.
--
-- Run via: supabase db query --linked -f supabase/admin/reset-owner-authenticator.sql

BEGIN;

DO $$
DECLARE
  v_owner  UUID;
  v_owners INTEGER;
BEGIN
  SELECT count(*), min(id::text)::uuid INTO v_owners, v_owner
    FROM auth.users
   WHERE raw_app_meta_data->>'role' = 'owner';
  IF v_owners <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 owner account, found %', v_owners;
  END IF;

  DELETE FROM auth.mfa_factors WHERE user_id = v_owner;
  UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data - 'owner_factor_id' WHERE id = v_owner;
  DELETE FROM auth.sessions WHERE user_id = v_owner;
END $$;

COMMIT;
