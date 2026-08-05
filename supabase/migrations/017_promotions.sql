-- Migration 017: promotions
--
-- Creates the table the site has always talked about but never had. The
-- marketing plan, the booking flow and the PRD for the chat assistant all
-- assume "current offers" exist somewhere queryable; until now the only
-- promo-adjacent artifact in the schema was appointments.marketing_consent
-- (015), which records a customer's opt-in and says nothing about what is
-- actually being offered.
--
-- Column notes:
--
--   offer_text   Free text, deliberately NOT a numeric discount. "20% off",
--                "$10 off", and "free brow shaping with any facial" all have to
--                fit, and the assistant quotes this VERBATIM -- it is never
--                parsed, never used in arithmetic, and never paraphrased. That
--                rule exists because a chatbot that restates an offer in its own
--                words is a chatbot that can misstate it, and the salon is
--                liable for what it says (see Moffatt v. Air Canada, 2024).
--
--   starts_on /  A date range rather than a bare is_active flag, so the owner
--   ends_on      can schedule an offer ahead of time and let it lapse on its own.
--                ends_on NULL means open-ended. is_active is kept as a separate
--                manual override for "pull this now", mirroring how services are
--                retired (013) rather than deleted.
--
-- The CHECK constraints on length are a security control, not cosmetics.
-- This is the one operator-authored string that reaches an LLM's context
-- window, so bounding its length bounds the indirect prompt-injection surface.
--
-- A placeholder row is seeded so the feature has data from day one and the
-- empty state is a deliberate message rather than a blank panel. Edit it or set
-- is_active = FALSE from Admin -> Promotions; no code change needed.
--
-- Safe to apply before the code deploy: nothing reads this table yet, and the
-- reader added later tolerates its absence (it catches and returns []) so the
-- ordering is forgiving in both directions.
--
-- Run via: Supabase Dashboard -> SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.promotions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  offer_text  TEXT NOT NULL,
  starts_on   DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on     DATE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promotions_title_len  CHECK (char_length(title) BETWEEN 2 AND 120),
  CONSTRAINT promotions_offer_len  CHECK (char_length(offer_text) BETWEEN 2 AND 200),
  CONSTRAINT promotions_desc_len   CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT promotions_date_order CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

COMMENT ON TABLE public.promotions IS
  'Owner-managed offers. Read by the public site and quoted verbatim by the Iris chat assistant.';
COMMENT ON COLUMN public.promotions.offer_text IS
  'Quoted verbatim by the assistant. Never parsed, never paraphrased.';
COMMENT ON COLUMN public.promotions.is_active IS
  'Manual override. A promotion is live only when is_active AND today is inside [starts_on, ends_on].';

-- Partial index for the only hot query: "what is running today". Partial on
-- is_active so retired promotions never enter the index, mirroring
-- idx_appointments_followup_pending from 015.
CREATE INDEX IF NOT EXISTS idx_promotions_live
  ON public.promotions (starts_on, ends_on)
  WHERE is_active = TRUE;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- Public read of live promotions only. Note that CURRENT_DATE here evaluates in
-- the DATABASE's timezone (UTC on Supabase), not SALON_TIMEZONE -- so for the
-- ~4-5 hours between New York midnight and UTC midnight this policy and the
-- application disagree about what "today" is. That is tolerable because every
-- API route reads through the service-role client and bypasses RLS entirely:
-- this policy is defense-in-depth for any future anon-key read, and the
-- AUTHORITATIVE date filter is app-side, using salonToday() from _lib/dates.
DROP POLICY IF EXISTS "Public can read live promotions" ON public.promotions;
CREATE POLICY "Public can read live promotions"
  ON public.promotions FOR SELECT
  USING (
    is_active = TRUE
    AND starts_on <= CURRENT_DATE
    AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)
  );

DROP POLICY IF EXISTS "Owner can manage promotions" ON public.promotions;
CREATE POLICY "Owner can manage promotions"
  ON public.promotions FOR ALL
  USING (public.is_owner_admin())
  WITH CHECK (public.is_owner_admin());

-- Placeholder so the feature ships with data. Guarded by NOT EXISTS rather than
-- ON CONFLICT: there is no unique constraint on title (two real offers may well
-- share one), so this is the only way to keep the seed idempotent if the file
-- is run twice.
--
-- description is left NULL DELIBERATELY. Every column on this row is rendered
-- to customers in the Iris offers card, so a note to the operator ("edit this
-- when a real offer starts, or set is_active = FALSE") placed in `description`
-- is shown verbatim to the public. Notes for whoever runs this file belong in
-- SQL comments like this one; the row itself is customer-facing copy only.
--
-- To retire the placeholder once a real offer exists:
--   UPDATE public.promotions SET is_active = FALSE WHERE title = 'No current offers';
INSERT INTO public.promotions (title, offer_text)
SELECT
  'No current offers',
  'No promotions are running right now.'
WHERE NOT EXISTS (SELECT 1 FROM public.promotions);

-- Ledger bookkeeping, guarded so it can never block the actual migration.
-- 000_migrations_ledger.sql may not have been applied yet (or at all): this
-- file's real work is the promotions table, and failing the whole transaction
-- over a missing audit row would be the bookkeeping wagging the dog. Run 000
-- afterwards and re-run this file if you want the entry backfilled -- every
-- statement above is idempotent.
DO $$
BEGIN
  IF to_regclass('public.migrations_applied') IS NOT NULL THEN
    INSERT INTO public.migrations_applied (filename) VALUES ('017_promotions.sql')
    ON CONFLICT (filename) DO NOTHING;
  ELSE
    RAISE NOTICE 'migrations_applied not found — skipping ledger entry. Apply 000_migrations_ledger.sql, then re-run this file to record it.';
  END IF;
END $$;

COMMIT;

-- Verification:
--
-- 1. Table exists with RLS enabled:
--      SELECT rowsecurity FROM pg_tables
--       WHERE schemaname = 'public' AND tablename = 'promotions';   -- expect true
--
-- 2. Both policies are present:
--      SELECT policyname, cmd FROM pg_policies
--       WHERE schemaname = 'public' AND tablename = 'promotions';
--      -- expect "Public can read live promotions" (SELECT)
--      --        "Owner can manage promotions"    (ALL)
--
-- 3. The placeholder seeded exactly once:
--      SELECT count(*) FROM public.promotions;                      -- expect 1
--
-- 4. The length guards actually bite (each should ERROR):
--      INSERT INTO public.promotions (title, offer_text)
--        VALUES ('x', 'too short title');                           -- promotions_title_len
--      INSERT INTO public.promotions (title, offer_text)
--        VALUES ('Valid title', repeat('a', 201));                  -- promotions_offer_len
--      INSERT INTO public.promotions (title, offer_text, starts_on, ends_on)
--        VALUES ('Valid title', 'Valid offer', '2026-09-01', '2026-08-01');
--                                                                   -- promotions_date_order
--
-- 5. anon sees only live rows (expect 1 with the seeded placeholder, 0 once it
--    is deactivated):
--      SET ROLE anon; SELECT count(*) FROM public.promotions; RESET ROLE;
--
-- 6. anon cannot write (expect ERROR: new row violates row-level security):
--      SET ROLE anon;
--      INSERT INTO public.promotions (title, offer_text) VALUES ('Hacked', 'Free everything');
--      RESET ROLE;
--
-- 7. Ledger updated:
--      SELECT filename, applied_at FROM public.migrations_applied
--       WHERE filename = '017_promotions.sql';                      -- expect one row
