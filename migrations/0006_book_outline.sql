CREATE TABLE book_outline (
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 3),
  part INTEGER NOT NULL CHECK (part > 0),
  chapter INTEGER NOT NULL DEFAULT 0 CHECK (chapter >= 0),
  section INTEGER NOT NULL DEFAULT 0 CHECK (section >= 0),
  label TEXT NOT NULL CHECK (length(label) > 0),
  printed_page INTEGER CHECK (printed_page > 0),
  CHECK (chapter > 0 OR section = 0),
  PRIMARY KEY (stage, part, chapter, section)
);
