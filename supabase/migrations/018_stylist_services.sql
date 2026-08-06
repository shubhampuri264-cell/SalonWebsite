-- Stylist -> service eligibility.
--
-- Until now nothing in the database linked a stylist to the services they
-- actually perform. `specialties` looks like it does, but it is free text used
-- for display only: no query has ever filtered on it, so the booking wizard,
-- the API and the chat assistant all offered the entire roster for every
-- service. A customer could book the threading specialist for a balayage, and
-- the "anyone available" path could assign one at random.
--
-- WHY A JOIN TABLE AND NOT A CATEGORY ARRAY ON `stylists`.
--
-- The division of labour is almost, but not quite, the service category
-- boundary: Sumita does hair, Sazana does threading, waxing, facials and the
-- lash/brow treatments -- and Hot Oil Hair Massage (category
-- special_treatment) is done by BOTH. One service crossing the line is all it
-- takes for a per-stylist category array to become unrepresentable, and the
-- workarounds are worse than the join table: inventing a pseudo-category for a
-- single service distorts the customer-facing menu, and a second "exceptions"
-- column means two mechanisms to check and two places to forget.
--
-- The cost is real and worth stating: a service added later gets NO rows here
-- and is therefore bookable with NOBODY. That is the safe direction to fail
-- (nothing is mis-assigned), and the seed below is written as INSERT ... SELECT
-- over `services` so re-running this file backfills any service added since.
-- The verification query at the bottom is what catches it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stylist_services (
  stylist_id UUID NOT NULL REFERENCES public.stylists(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stylist_id, service_id)
);

COMMENT ON TABLE public.stylist_services IS
  'Which stylist performs which service. A booking is rejected unless the (stylist_id, service_id) pair exists here. No row means not bookable -- absence is never treated as "anyone can do it".';

-- The primary key already indexes (stylist_id, service_id), which serves
-- "can this stylist do this service". The reverse question -- "who can do this
-- service" -- is what the booking wizard and Iris ask on every session, and a
-- composite PK cannot answer it without a scan, so service_id gets its own
-- index. This is also the FK index Postgres does not create for you.
CREATE INDEX IF NOT EXISTS idx_stylist_services_service
  ON public.stylist_services (service_id);

ALTER TABLE public.stylist_services ENABLE ROW LEVEL SECURITY;

-- Public read: this drives which stylists a customer is offered, exactly like
-- the public reads of `services` and `stylists`. Writes are service-role only,
-- which on this database means "nobody but a migration" -- there is no admin UI
-- for the roster (see api/admin/, which has no stylists endpoint).
DROP POLICY IF EXISTS "Public can read stylist services" ON public.stylist_services;
CREATE POLICY "Public can read stylist services"
  ON public.stylist_services FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Owner can manage stylist services" ON public.stylist_services;
CREATE POLICY "Owner can manage stylist services"
  ON public.stylist_services FOR ALL
  USING (public.is_owner_admin())
  WITH CHECK (public.is_owner_admin());

REVOKE ALL ON public.stylist_services FROM anon, authenticated;
GRANT SELECT ON public.stylist_services TO anon, authenticated;

DO $$
DECLARE
  v_sumita UUID;
  v_sazana UUID;
  v_hot_oil UUID;
BEGIN
  SELECT id INTO v_sumita FROM stylists WHERE name = 'Sumita Karki';
  SELECT id INTO v_sazana FROM stylists WHERE name = 'Sazana Aryal';

  -- Fail loudly. A half-applied migration here leaves stylists with no rows,
  -- which the application reads as "bookable for nothing" -- that takes online
  -- booking down completely rather than merely getting an assignment wrong.
  IF v_sumita IS NULL THEN
    RAISE EXCEPTION 'Stylist "Sumita Karki" not found in stylists table';
  END IF;
  IF v_sazana IS NULL THEN
    RAISE EXCEPTION 'Stylist "Sazana Aryal" not found in stylists table';
  END IF;

  -- Sumita: hair only. Cuts, colour, treatments.
  INSERT INTO public.stylist_services (stylist_id, service_id)
  SELECT v_sumita, s.id FROM services s WHERE s.category = 'hair'
  ON CONFLICT DO NOTHING;

  -- Sazana: threading, waxing, facials, and the lash/brow special treatments.
  INSERT INTO public.stylist_services (stylist_id, service_id)
  SELECT v_sazana, s.id
    FROM services s
   WHERE s.category IN ('threading', 'waxing', 'facial', 'special_treatment')
  ON CONFLICT DO NOTHING;

  -- The one service both of them do, and the reason this is a join table.
  -- Matched by name because it has no stable id; skipped without complaint if
  -- the owner has since renamed or retired it, since a missing optional row
  -- must not fail the migration that also sets up the other 55 services.
  SELECT id INTO v_hot_oil FROM services WHERE name = 'Hot Oil Hair Massage';
  IF v_hot_oil IS NOT NULL THEN
    INSERT INTO public.stylist_services (stylist_id, service_id)
    VALUES (v_sumita, v_hot_oil)
    ON CONFLICT DO NOTHING;
  ELSE
    RAISE NOTICE 'Service "Hot Oil Hair Massage" not found — skipping the shared assignment.';
  END IF;

  -- The displayed specialties listed threading only, which undersold Sazana by
  -- three quarters of the menu she actually covers. Display copy only; it
  -- gates nothing.
  UPDATE stylists
     SET specialties = ARRAY[
           'Eyebrow Threading',
           'Facial Threading',
           'Waxing',
           'Facials',
           'Eyelash Extensions',
           'Eyebrow Lamination'
         ]
   WHERE id = v_sazana;
END $$;

DO $$
BEGIN
  IF to_regclass('public.migrations_applied') IS NOT NULL THEN
    INSERT INTO public.migrations_applied (filename) VALUES ('018_stylist_services.sql')
    ON CONFLICT (filename) DO NOTHING;
  ELSE
    RAISE NOTICE 'migrations_applied not found — skipping ledger entry. Apply 000_migrations_ledger.sql, then re-run this file to record it.';
  END IF;
END $$;

COMMIT;

-- Verification:
--
--   Per-stylist counts:
--     SELECT st.name, count(*) AS services
--       FROM stylist_services ss
--       JOIN stylists st ON st.id = ss.stylist_id
--      GROUP BY st.name ORDER BY st.name;
--     (expect: Sazana Aryal 44, Sumita Karki 12 -- 11 hair + Hot Oil Hair Massage)
--
--   THE ONE THAT MATTERS. Any active service nobody can perform is invisible to
--   customers: it appears on the menu and then offers no stylist. Run this after
--   every services change, not just after this migration.
--     SELECT s.category, s.name
--       FROM services s
--      WHERE s.is_active
--        AND NOT EXISTS (
--          SELECT 1 FROM stylist_services ss
--            JOIN stylists st ON st.id = ss.stylist_id
--           WHERE ss.service_id = s.id AND st.is_active
--        )
--      ORDER BY s.category, s.name;
--     (expect: 0 rows. If not, re-run this file -- the seed is idempotent and
--      backfills by category -- or add the rows by hand.)
--
--   The shared service:
--     SELECT st.name FROM stylist_services ss
--       JOIN stylists st ON st.id = ss.stylist_id
--       JOIN services sv ON sv.id = ss.service_id
--      WHERE sv.name = 'Hot Oil Hair Massage' ORDER BY st.name;
--     (expect: Sazana Aryal, Sumita Karki)
