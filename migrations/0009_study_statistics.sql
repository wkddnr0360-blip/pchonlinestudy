ALTER TABLE study_attempts ADD COLUMN statistics_version INTEGER CHECK (statistics_version > 0);
ALTER TABLE study_attempts ADD COLUMN statistics_first INTEGER CHECK (statistics_first IN (0, 1));
ALTER TABLE study_attempts ADD COLUMN elapsed_ms INTEGER CHECK (elapsed_ms BETWEEN 1000 AND 600000);

CREATE TABLE study_statistics_versions (
  no INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  statistics_version INTEGER NOT NULL CHECK (statistics_version <= revision),
  PRIMARY KEY (no, revision),
  FOREIGN KEY (no, revision) REFERENCES question_revisions(no, revision),
  FOREIGN KEY (no, statistics_version) REFERENCES question_revisions(no, revision)
);

CREATE TRIGGER study_statistics_version_before_publish BEFORE INSERT ON study_statistics_versions
WHEN NEW.revision <= (SELECT active_revision FROM book_questions WHERE no = NEW.no)
  OR (SELECT answer FROM question_revisions WHERE no = NEW.no AND revision = NEW.revision)
     <> (SELECT answer FROM question_revisions WHERE no = NEW.no AND revision = NEW.statistics_version)
BEGIN
  SELECT RAISE(ABORT, 'statistics version requires an unpublished revision with the same answer');
END;
CREATE TRIGGER study_statistics_version_immutable_update BEFORE UPDATE ON study_statistics_versions
BEGIN SELECT RAISE(ABORT, 'statistics version is immutable'); END;
CREATE TRIGGER study_statistics_version_immutable_delete BEFORE DELETE ON study_statistics_versions
BEGIN SELECT RAISE(ABORT, 'statistics version is immutable'); END;

CREATE TABLE study_statistics (
  no INTEGER NOT NULL,
  statistics_version INTEGER NOT NULL,
  first_correct INTEGER NOT NULL,
  first_wrong INTEGER NOT NULL,
  repeat_correct INTEGER NOT NULL,
  repeat_wrong INTEGER NOT NULL,
  selected_o INTEGER NOT NULL,
  timed_count INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  PRIMARY KEY (no, statistics_version),
  FOREIGN KEY (no, statistics_version) REFERENCES question_revisions(no, revision)
);

CREATE TABLE study_statistics_job (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor INTEGER NOT NULL DEFAULT 0,
  day INTEGER NOT NULL DEFAULT 0,
  reads INTEGER NOT NULL DEFAULT 0,
  writes INTEGER NOT NULL DEFAULT 0,
  calculated_at INTEGER,
  status TEXT NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting', 'ready', 'delayed', 'paused', 'metrics_unavailable')),
  account_reads INTEGER,
  account_writes INTEGER,
  account_requests INTEGER,
  observed_at INTEGER
);
INSERT INTO study_statistics_job (id) VALUES (1);

CREATE TABLE study_statistics_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  very_easy INTEGER NOT NULL DEFAULT 90,
  easy INTEGER NOT NULL DEFAULT 75,
  medium INTEGER NOT NULL DEFAULT 50,
  hard INTEGER NOT NULL DEFAULT 30,
  CHECK (100 >= very_easy AND very_easy > easy AND easy > medium AND medium > hard AND hard > 0)
);
INSERT INTO study_statistics_settings (id) VALUES (1);
