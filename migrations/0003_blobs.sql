-- Message bodies kept in the database itself, for hosted spaces on Postgres with no disk.
CREATE TABLE IF NOT EXISTS email_blobs (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TEXT NOT NULL);
