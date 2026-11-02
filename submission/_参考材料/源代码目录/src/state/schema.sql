PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  totp_secret TEXT NOT NULL,
  daily_limit_cents INTEGER NOT NULL DEFAULT 5000000,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  currency TEXT NOT NULL DEFAULT 'CNY',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payees (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  bank TEXT NOT NULL,
  account_no_masked TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'low',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS holds (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  idempotency_key TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  biz_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  released_at TEXT,
  captured_at TEXT
);

CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  payee_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'committed',
  idempotency_key TEXT NOT NULL UNIQUE,
  permit_id TEXT NOT NULL,
  biz_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  committed_at TEXT,
  reversed_at TEXT
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  limit_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  next_charge_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  consent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  item TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TEXT NOT NULL,
  merchant_category TEXT NOT NULL DEFAULT 'other',
  mandate_id TEXT,
  hold_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  committed_at TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scenario TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  current_node TEXT,
  state_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, node_id)
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  approver_id TEXT,
  auth_method TEXT,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permits (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  tool TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  max_amount_cents INTEGER NOT NULL DEFAULT 0,
  decision TEXT NOT NULL,
  auth_level TEXT NOT NULL,
  approver_ids TEXT NOT NULL DEFAULT '[]',
  policy_version TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  used INTEGER NOT NULL DEFAULT 0,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  value_json TEXT NOT NULL,
  source TEXT NOT NULL,
  trust TEXT NOT NULL,
  tool_call_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  trace_id TEXT NOT NULL,
  run_id TEXT,
  step_id TEXT,
  node_id TEXT,
  event_type TEXT NOT NULL,
  ts TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_trace ON audit_events(trace_id, seq);
CREATE INDEX IF NOT EXISTS idx_audit_run ON audit_events(run_id, seq);

CREATE TABLE IF NOT EXISTS audit_anchors (
  id TEXT PRIMARY KEY,
  from_seq INTEGER NOT NULL,
  to_seq INTEGER NOT NULL,
  merkle_root TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS breaker_state (
  subject TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'CLOSED',
  reason TEXT NOT NULL DEFAULT '',
  opened_at TEXT,
  unlock_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS breaker_counters (
  subject TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0,
  injection_count INTEGER NOT NULL DEFAULT 0,
  denial_count INTEGER NOT NULL DEFAULT 0,
  velocity_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mandates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  max_cents INTEGER NOT NULL,
  used_cents INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compensations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  tool TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  params_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scenario TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  fired_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- 审计表禁止更新/删除，只能追加
CREATE TRIGGER IF NOT EXISTS audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;
