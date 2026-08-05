-- Rollback for 017_promotions.sql
--
-- WARNING -- side effects of running this:
--
--   * DESTROYS EVERY PROMOTION THE OWNER HAS ENTERED. This table is the only
--     place offers are stored; dropping it deletes the wording, the dates and
--     the history permanently. Re-running the forward migration gives you an
--     empty table with the placeholder row back, not the salon's real offers.
--     There is no recovery except from a database backup.
--
--     If the goal is only to STOP PROMOTIONS APPEARING, do NOT run this file.
--     Run this instead -- it is instant, reversible, and loses nothing:
--         UPDATE public.promotions SET is_active = FALSE;
--     The site then shows no offers and the assistant answers "no current
--     offers", which is the same customer-visible outcome.
--
--   * Breaks the admin Promotions screen. /admin/promotions reads and writes
--     this table; it will error until the application code is rolled back too.
--
-- Deploy ordering: roll the application code back FIRST. The promotions reader
-- used by the chat assistant is written defensively (it catches errors and
-- returns an empty list), so chat degrades to "no current offers" rather than
-- failing -- but api/admin/services.ts?resource=promotions has no such guard
-- and will 500 on every request while the table is missing.

BEGIN;

-- The index and both RLS policies are owned by the table and are dropped with
-- it; naming them here would only risk drifting out of sync with 017.
DROP TABLE IF EXISTS public.promotions;

-- Guarded for the same reason as the forward migration: a missing ledger must
-- not stop the rollback from doing its actual job.
DO $$
BEGIN
  IF to_regclass('public.migrations_applied') IS NOT NULL THEN
    DELETE FROM public.migrations_applied WHERE filename = '017_promotions.sql';
  END IF;
END $$;

COMMIT;

-- Verification:
--
-- 1. The table is gone:
--      SELECT count(*) FROM information_schema.tables
--       WHERE table_schema = 'public' AND table_name = 'promotions';   -- expect 0
--
-- 2. Its policies went with it:
--      SELECT count(*) FROM pg_policies
--       WHERE schemaname = 'public' AND tablename = 'promotions';      -- expect 0
--
-- 3. The ledger no longer claims 017 is applied:
--      SELECT count(*) FROM public.migrations_applied
--       WHERE filename = '017_promotions.sql';                         -- expect 0
--    (`npm run migrate:status` should now list 017 as PENDING.)
--
-- 4. The rest of the site is unaffected -- browsing services and completing a
--    booking must both still work. Nothing outside the promotions feature
--    references this table.
