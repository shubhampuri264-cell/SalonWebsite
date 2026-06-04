-- Update Single Process Color price from $80 to $70
UPDATE services
SET price_min = 70
WHERE name = 'Single Process Color';
