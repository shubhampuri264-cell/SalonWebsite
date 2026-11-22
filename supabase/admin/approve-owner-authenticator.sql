-- Approve the owner's authenticator app.
--
-- Run ONCE, right after she has set up two-step sign-in (the setup screen,
-- then "Almost done"), and only after confirming with her -- in
-- person or by phone -- that she did it just now. Until this runs, the admin
-- API refuses every session, hers included (code FACTOR_NOT_APPROVED).
--
-- What it does:
--   * Pins app_metadata.owner_factor_id to her single verified authenticator.
--     The API admits only sessions verified with that authenticator, so an
--     app someone else adds with her password is useless to them.
--   * Signs out every other session on her account (any device or anyone not
--     verified with that authenticator).
--
-- Stops, changing nothing, unless there is exactly one owner account with
-- exactly one verified authenticator. Two verified authenticators means
-- someone else may have added one: do not pick one -- run
-- reset-owner-authenticator.sql and have her set up again.
--
-- Run via: supabase db query --linked -f supabase/admin/approve-owner-authenticator.sql

BEGIN;

DO $$
DECLARE
  v_owner   UUID;
  v_owners  INTEGER;
  v_factor  UUID;
  v_factors INTEGER;
BEGIN
  SELECT count(*), min(id::text)::uuid INTO v_owners, v_owner
    FROM auth.users
   WHERE raw_app_meta_data->>'role' = 'owner';
  IF v_owners <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 owner account, found %', v_owners;
  END IF;

  SELECT count(*), min(id::text)::uuid INTO v_factors, v_factor
    FROM auth.mfa_factors
   WHERE user_id = v_owner AND status = 'verified' AND factor_type = 'totp';
  IF v_factors <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 verified authenticator on the owner account, found %. Do not approve; reset instead.', v_factors;
  END IF;

  UPDATE auth.users
     SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('owner_factor_id', v_factor)
   WHERE id = v_owner;

  DELETE FROM auth.sessions
   WHERE user_id = v_owner
     AND factor_id IS DISTINCT FROM v_factor;

  RAISE NOTICE 'Approved authenticator % (created %)', v_factor,
    (SELECT created_at FROM auth.mfa_factors WHERE id = v_factor);
END $$;

COMMIT;

-- Check (expect one row, approved = true):
--   SELECT f.created_at, f.friendly_name,
--          (u.raw_app_meta_data->>'owner_factor_id') = f.id::text AS approved
--     FROM auth.mfa_factors f JOIN auth.users u ON u.id = f.user_id
--    WHERE u.raw_app_meta_data->>'role' = 'owner';
