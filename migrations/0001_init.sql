-- wOS Email, first tables. Written in the SQL that both Postgres and SQLite accept.
-- Times are TEXT, ISO 8601 in UTC. Lists and objects are JSON in TEXT columns.
-- Every row carries team_id so one database can hold many teams.

CREATE TABLE IF NOT EXISTS email_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  github TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS email_members_email ON email_members (team_id, email);

CREATE TABLE IF NOT EXISTS email_settings (
  team_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (team_id, key)
);

CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  owner_id TEXT,
  kind TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'mailbox',
  address TEXT NOT NULL,
  name TEXT,
  auth TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT '{}',
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_threads (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  last_at TEXT NOT NULL,
  labels TEXT NOT NULL DEFAULT '[]',
  triage TEXT NOT NULL DEFAULT 'needs_you',
  triage_by TEXT NOT NULL DEFAULT 'rules',
  triage_reason TEXT,
  snoozed_until TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  unread INTEGER NOT NULL DEFAULT 1,
  participants TEXT NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  snippet TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS email_threads_inbox ON email_threads (team_id, account_id, archived, last_at);

CREATE TABLE IF NOT EXISTS email_messages (
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
  date TEXT NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_mid ON email_messages (account_id, message_id);
CREATE INDEX IF NOT EXISTS email_messages_thread ON email_messages (thread_id, date);

CREATE TABLE IF NOT EXISTS email_drafts (
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_approvals (
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
  decided_at TEXT,
  result TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_commands (
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
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS email_commands_team ON email_commands (team_id, at);

CREATE TABLE IF NOT EXISTS email_tokens (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject_id TEXT,
  member TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_alerts (
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
  answered_at TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_audit (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT,
  actor_kind TEXT,
  channel TEXT,
  tool TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS email_audit_team ON email_audit (team_id, at);
