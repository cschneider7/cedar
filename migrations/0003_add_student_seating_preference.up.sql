ALTER TABLE students ADD COLUMN seating_preference TEXT
  CHECK (seating_preference IN ('front', 'back'));
