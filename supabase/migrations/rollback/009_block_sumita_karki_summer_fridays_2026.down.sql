-- Rollback: remove the Friday blocks created by migration 009.
DELETE FROM blocked_slots
WHERE stylist_id = (SELECT id FROM stylists WHERE name = 'Sumita Karki')
  AND start_time = '10:00'::time
  AND end_time   = '19:00'::time
  AND reason     = 'Unavailable Fridays — Summer 2026'
  AND blocked_date IN (
    '2026-06-05','2026-06-12','2026-06-19','2026-06-26',
    '2026-07-03','2026-07-10','2026-07-17','2026-07-24','2026-07-31',
    '2026-08-07','2026-08-14','2026-08-21','2026-08-28'
  );
