-- A member signed in with a warOnSaaS account: the account id is the stable key.
ALTER TABLE email_members ADD COLUMN sub TEXT;
CREATE INDEX IF NOT EXISTS email_members_sub ON email_members (team_id, sub);
