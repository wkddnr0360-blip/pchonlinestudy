CREATE TABLE mock_exams (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  deadline INTEGER NOT NULL CHECK (deadline > started_at),
  submitted_at INTEGER,
  CHECK (submitted_at IS NULL OR submitted_at BETWEEN started_at AND deadline)
);
CREATE UNIQUE INDEX mock_exam_one_active ON mock_exams(user_id) WHERE submitted_at IS NULL;
CREATE INDEX mock_exam_recency ON mock_exams(user_id, started_at DESC);

CREATE TABLE mock_exam_items (
  exam_id TEXT NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 20),
  target TEXT NOT NULL CHECK (target IN ('O', 'X')),
  options TEXT NOT NULL CHECK (json_valid(options) AND json_type(options) = 'array' AND json_array_length(options) = 4),
  correct_choice INTEGER NOT NULL CHECK (correct_choice BETWEEN 0 AND 3),
  response INTEGER CHECK (response BETWEEN 0 AND 3),
  response_version INTEGER NOT NULL DEFAULT 0 CHECK (response_version >= 0),
  PRIMARY KEY (exam_id, position)
);
