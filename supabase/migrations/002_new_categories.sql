-- Migration 002: Add new service categories
-- The services table uses a TEXT column with a CHECK constraint.
-- Drop the old constraint and add a new one that includes all categories.

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_category_check;

ALTER TABLE services
  ADD CONSTRAINT services_category_check
  CHECK (category IN ('hair', 'threading', 'facial', 'waxing', 'special_treatment'));
