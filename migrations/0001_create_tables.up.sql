-- Classrooms
CREATE TABLE IF NOT EXISTS classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    period SMALLINT NOT NULL,
    boundary_width INTEGER NOT NULL DEFAULT 1080,
    boundary_height INTEGER NOT NULL DEFAULT 820,
    created_time TIMESTAMPTZ DEFAULT now()
);

-- Students
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    classroom_id UUID REFERENCES classrooms ON DELETE SET NULL,
    student_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_time TIMESTAMPTZ DEFAULT now()
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