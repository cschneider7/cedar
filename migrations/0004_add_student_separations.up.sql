CREATE TABLE IF NOT EXISTS student_separations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    student_id_a UUID NOT NULL REFERENCES students ON DELETE CASCADE,
    student_id_b UUID NOT NULL REFERENCES students ON DELETE CASCADE,
    created_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (student_id_a < student_id_b),
    UNIQUE (student_id_a, student_id_b)
);
