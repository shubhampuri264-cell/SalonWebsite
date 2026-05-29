-- Block hair stylist Sumita Karki on every Friday in June, July, August 2026.
DO $$
DECLARE
  v_stylist_id UUID;
BEGIN
  SELECT id INTO v_stylist_id FROM stylists WHERE name = 'Sumita Karki';
  IF v_stylist_id IS NULL THEN
    RAISE EXCEPTION 'Stylist "Sumita Karki" not found in stylists table';
  END IF;

  INSERT INTO blocked_slots (stylist_id, blocked_date, start_time, end_time, reason)
  SELECT v_stylist_id, d::date, '10:00'::time, '19:00'::time,
         'Unavailable Fridays — Summer 2026'
  FROM UNNEST(ARRAY[
    '2026-06-05','2026-06-12','2026-06-19','2026-06-26',
    '2026-07-03','2026-07-10','2026-07-17','2026-07-24','2026-07-31',
    '2026-08-07','2026-08-14','2026-08-21','2026-08-28'
  ]::date[]) AS d
  WHERE NOT EXISTS (
    SELECT 1 FROM blocked_slots b
    WHERE b.stylist_id = v_stylist_id
      AND b.blocked_date = d::date
      AND b.start_time = '10:00'::time
      AND b.end_time   = '19:00'::time
  );
END $$;
