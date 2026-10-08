-- Sign-outs heard from the account (back-channel logout): tokens issued at or before this moment are dead.
CREATE TABLE IF NOT EXISTS email_signouts (sub TEXT PRIMARY KEY, at BIGINT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
