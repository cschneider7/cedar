-- Classrooms
CREATE TABLE IF NOT EXISTS classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    period SMALLINT NOT NULL,
    term_season TEXT NOT NULL CHECK (term_season IN ('fall', 'winter', 'spring', 'summer')),
    term_year SMALLINT NOT NULL,
    boundary_width INTEGER NOT NULL DEFAULT 1080,
    boundary_height INTEGER NOT NULL DEFAULT 820,
    created_time TIMESTAMPTZ DEFAULT now(),
    pinned_at TIMESTAMPTZ
);

-- Students
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    classroom_id UUID REFERENCES classrooms ON DELETE SET NULL,
    student_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_time TIMESTAMPTZ DEFAULT now(),
    image_url TEXT,
    seating_preference TEXT CHECK (seating_preference IN ('front', 'back'))
);

-- Tables
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id UUID NOT NULL REFERENCES classrooms ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    rows SMALLINT NOT NULL CHECK (rows BETWEEN 1 AND 15),
    cols SMALLINT NOT NULL CHECK (cols BETWEEN 1 AND 15),
    x_pos INTEGER NOT NULL,
    y_pos INTEGER NOT NULL,
    UNIQUE (classroom_id, table_number)
);

-- Seats
CREATE TABLE IF NOT EXISTS seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES tables ON DELETE CASCADE,
    student_id UUID REFERENCES students ON DELETE SET NULL,
    seat_number SMALLINT NOT NULL,
    UNIQUE (table_id, seat_number)
);

-- Student separations ("keep these two students apart")
CREATE TABLE IF NOT EXISTS student_separations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    student_id_a UUID NOT NULL REFERENCES students ON DELETE CASCADE,
    student_id_b UUID NOT NULL REFERENCES students ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (student_id_a < student_id_b),
    UNIQUE (student_id_a, student_id_b)
);

-- Preview-environment read-only role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'preview_readonly') THEN
    CREATE ROLE preview_readonly LOGIN;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA public TO preview_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO preview_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO preview_readonly;
