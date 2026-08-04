-- Migration 015: post-visit follow-up email + marketing consent
--
-- Adds two independent columns to appointments:
--
--   followup_sent      idempotency flag for the day-after "how was your visit"
--                      email, mirroring how reminder_sent guards the day-before
--                      reminder. Without it, a cron retry (Vercel retries a
--                      failed invocation) re-emails everyone from yesterday.
--
--   marketing_consent  records that the customer ticked the optional
--                      "send me occasional offers" box at booking time. Stored
--                      per-appointment rather than per-customer on purpose:
--                      guests book without accounts, so there is no customer
--                      row to hang it on, and a per-booking record is also the
--                      better compliance artifact — it captures *when* consent
--                      was given, not just that it currently is.
--
-- Both are NOT NULL DEFAULT FALSE. reminder_sent (schema.sql:45) is nullable
-- DEFAULT FALSE, which means an explicit NULL insert would be skipped by the
-- cron's `.eq('reminder_sent', false)` filter forever. Nothing inserts NULL
-- today so that column is not actually broken, but the new columns close the
-- hole by construction rather than by convention.
--
-- Safe to apply before the code deploy: existing writers do not mention either
-- column, and the defaults backfill every existing row.
--
-- Run via: Supabase Dashboard -> SQL Editor.

BEGIN;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS followup_sent     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN appointments.followup_sent IS
  'True once the day-after follow-up/review email has been sent. Set by /api/cron/reminders.';
COMMENT ON COLUMN appointments.marketing_consent IS
  'Customer opted in to promotional email at booking time. Not used for transactional mail.';

-- Partial index for the follow-up cron's daily lookup:
--   WHERE appointment_date = <yesterday> AND followup_sent = FALSE
--
-- Partial rather than a plain index on appointment_date because followup_sent
-- flips to TRUE permanently the morning after each visit. The index therefore
-- only ever holds today's and tomorrow's rows plus any permanent failures --
-- a few dozen entries -- instead of growing with the full appointment history.
CREATE INDEX IF NOT EXISTS idx_appointments_followup_pending
  ON appointments (appointment_date)
  WHERE followup_sent = FALSE;

COMMIT;

-- Verification:
--
-- 1. Columns exist with the right nullability and default:
--    SELECT column_name, data_type, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_name = 'appointments'
--      AND column_name IN ('followup_sent', 'marketing_consent');
--    (expect: 2 rows, boolean, NO, false)
--
-- 2. Every pre-existing row was backfilled, not left NULL:
--    SELECT count(*) FROM appointments
--    WHERE followup_sent IS NULL OR marketing_consent IS NULL;
--    (expect: 0)
--
-- 3. The partial index is used by the cron's query shape:
--    EXPLAIN SELECT id FROM appointments
--    WHERE appointment_date = CURRENT_DATE - 1 AND followup_sent = FALSE;
--    (expect: Index Scan using idx_appointments_followup_pending, though
--     Postgres may prefer a Seq Scan while the table is small -- that is fine)
--
-- 4. Sanity-check that yesterday's real visits are the ones that would be
--    picked up, and that cancellations are not:
--    SELECT status, count(*) FROM appointments
--    WHERE appointment_date = CURRENT_DATE - 1 GROUP BY status;
