-- wOS Email, first tables. Written in the SQL that both Postgres and SQLite accept.
-- Times are epoch milliseconds (BIGINT). Lists and objects are JSON in TEXT columns.
-- Every row carries team_id so one database can hold many teams.

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  github TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  created_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS members_email ON members (team_id, email);

CREATE TABLE IF NOT EXISTS settings (
  team_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (team_id, key)
);

CREATE TABLE IF NOT EXISTS mail_accounts (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  owner_id TEXT,
  kind TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'mailbox',
  address TEXT NOT NULL,
  name TEXT,
  auth TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT '{}',
  last_sync_at BIGINT,
  last_error TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_threads (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  last_at BIGINT NOT NULL,
  labels TEXT NOT NULL DEFAULT '[]',
  triage TEXT NOT NULL DEFAULT 'needs_you',
  triage_by TEXT NOT NULL DEFAULT 'rules',
  triage_reason TEXT,
  snoozed_until BIGINT,
  archived INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  unread INTEGER NOT NULL DEFAULT 1,
  participants TEXT NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  snippet TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS threads_inbox ON mail_threads (team_id, account_id, archived, last_at);

CREATE TABLE IF NOT EXISTS mail_messages (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  in_reply_to TEXT,
  refs TEXT NOT NULL DEFAULT '[]',
  direction TEXT NOT NULL DEFAULT 'in',
  from_addr TEXT NOT NULL,
  from_name TEXT,
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  date BIGINT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  body_ref TEXT,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  attachments TEXT NOT NULL DEFAULT '[]',
  list_unsubscribe TEXT,
  folder TEXT,
  uid BIGINT,
  crm_links TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS messages_mid ON mail_messages (account_id, message_id);
CREATE INDEX IF NOT EXISTS messages_thread ON mail_messages (thread_id, date);

CREATE TABLE IF NOT EXISTS mail_drafts (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  thread_id TEXT,
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_by_kind TEXT NOT NULL DEFAULT 'person',
  created_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  approval_id TEXT,
  sent_message_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  input TEXT NOT NULL,
  summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  destructive INTEGER NOT NULL DEFAULT 0,
  requested_by TEXT,
  requested_kind TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at BIGINT,
  result TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbound_commands (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  message_id TEXT,
  from_addr TEXT,
  subject TEXT,
  verified TEXT NOT NULL DEFAULT '{}',
  accepted INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  app TEXT,
  token_id TEXT,
  parsed_intent TEXT,
  result TEXT,
  at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS commands_team ON inbound_commands (team_id, at);

CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject_id TEXT,
  member TEXT,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  app TEXT NOT NULL DEFAULT 'core',
  ref TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  question TEXT,
  options TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  answer TEXT,
  answered_by TEXT,
  answered_at BIGINT,
  message_id TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  at BIGINT NOT NULL,
  actor TEXT,
  actor_kind TEXT,
  channel TEXT,
  tool TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS audit_team ON audit_log (team_id, at);
