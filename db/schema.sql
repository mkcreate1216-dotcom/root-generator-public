-- D1 schema for tabirome plans
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  token_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_plans_updated_at ON plans(updated_at);
CREATE INDEX IF NOT EXISTS idx_plans_token_hash ON plans(token_hash);

-- D1 schema for MCP API tokens
CREATE TABLE IF NOT EXISTS api_tokens (
  token_hash TEXT PRIMARY KEY,
  token_prefix TEXT NOT NULL,
  client_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  expires_at TEXT,
  last_used_at TEXT,
  request_count_today INTEGER NOT NULL DEFAULT 0,
  request_count_total INTEGER NOT NULL DEFAULT 0,
  last_request_date TEXT NOT NULL DEFAULT (date('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_created_at ON api_tokens(created_at);

