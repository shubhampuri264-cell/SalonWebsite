-- Rollback for 015_followup_email_and_marketing_consent.sql
--
-- WARNING -- side effects of running this:
--
--   * DESTROYS ALL MARKETING CONSENT RECORDS. marketing_consent is the only
--     place the salon stores who agreed to receive offers. Dropping the column
--     deletes that permission list permanently; re-running the forward
--     migration brings back an empty column, not the old answers. There is no
--     way to recover it except from a database backup. If the goal is only to
--     stop the follow-up emails, do NOT run this file -- unset the
--     GOOGLE_REVIEW_URL env var in Vercel instead, which disables the send
--     immediately with no schema change and no data loss.
--
--   * Loses the followup_sent flags. If the column is later re-added, every
--     past appointment reads as "not yet followed up". The cron only looks at
--     yesterday, so this cannot spam the whole history -- at worst one day of
--     customers gets a duplicate email.
--
-- Deploy ordering: roll the application code back FIRST. api/cron/reminders.ts
-- selects and updates followup_sent, and api/appointments.ts writes
-- marketing_consent; both start erroring the moment these columns disappear.

BEGIN;

DROP INDEX IF EXISTS idx_appointments_followup_pending;

ALTER TABLE appointments
  DROP COLUMN IF EXISTS followup_sent,
  DROP COLUMN IF EXISTS marketing_consent;

COMMIT;

-- Verification:
--
-- 1. Both columns are gone:
--    SELECT count(*) FROM information_schema.columns
--    WHERE table_name = 'appointments'
--      AND column_name IN ('followup_sent', 'marketing_consent');
--    (expect: 0)
--
-- 2. The index is gone:
--    SELECT count(*) FROM pg_indexes
--    WHERE indexname = 'idx_appointments_followup_pending';
--    (expect: 0)
--
-- 3. Booking still works end to end -- POST /api/appointments must return 201.
--    It writes marketing_consent, so a stale deploy will 500 here.
