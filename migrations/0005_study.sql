CREATE TABLE book_questions (
  no INTEGER PRIMARY KEY CHECK (no > 0),
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 3),
  part INTEGER NOT NULL CHECK (part > 0),
  chapter INTEGER NOT NULL CHECK (chapter > 0),
  section INTEGER CHECK (section > 0),
  chapter_key TEXT NOT NULL,
  active_revision INTEGER NOT NULL DEFAULT 1 CHECK (active_revision > 0),
  FOREIGN KEY (no, active_revision) REFERENCES question_revisions(no, revision) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX book_questions_stage_no ON book_questions(stage, no);

CREATE TABLE question_revisions (
  no INTEGER NOT NULL REFERENCES book_questions(no),
  revision INTEGER NOT NULL CHECK (revision > 0),
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 20000),
  source TEXT NOT NULL,
  answer TEXT NOT NULL CHECK (answer IN ('O', 'X')),
  marker TEXT NOT NULL CHECK ((answer = 'O' AND marker = '[○]') OR (answer = 'X' AND marker IN ('[×]', '[X]'))),
  explanation TEXT NOT NULL CHECK (json_valid(explanation) AND json_type(explanation) = 'array'),
  PRIMARY KEY (no, revision)
);

CREATE TRIGGER preserve_question_identity BEFORE UPDATE OF no, stage, part, chapter, section, chapter_key ON book_questions
BEGIN SELECT RAISE(ABORT, 'question identity is immutable'); END;

CREATE TRIGGER preserve_question_revision BEFORE UPDATE ON question_revisions
BEGIN SELECT RAISE(ABORT, 'question revision is immutable'); END;

CREATE TRIGGER preserve_question_revision_delete BEFORE DELETE ON question_revisions
BEGIN SELECT RAISE(ABORT, 'question revision is immutable'); END;

CREATE TABLE study_attempts (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('study', 'legacy')),
  no INTEGER NOT NULL REFERENCES book_questions(no),
  choice TEXT NOT NULL CHECK (choice IN ('O', 'X')),
  revision INTEGER,
  is_correct INTEGER CHECK (is_correct IN (0, 1)),
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  CHECK ((kind = 'study' AND revision IS NOT NULL AND is_correct IS NOT NULL)
      OR (kind = 'legacy' AND revision IS NULL AND is_correct IS NULL)),
  PRIMARY KEY (user_id, kind, event_id),
  FOREIGN KEY (no, revision) REFERENCES question_revisions(no, revision)
);
CREATE INDEX study_attempts_recency ON study_attempts(user_id, occurred_at DESC);
CREATE INDEX study_attempts_question ON study_attempts(user_id, kind, no, occurred_at DESC, event_id DESC);

CREATE TABLE study_rate_limits (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  slot INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  PRIMARY KEY (user_id, action)
);
