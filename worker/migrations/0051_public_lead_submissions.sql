-- Public web-form submissions and privacy-preserving rolling-hour rate limit.
CREATE TABLE IF NOT EXISTS public_lead_submissions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECEIVED','ACCEPTED_AS_LEAD','REJECTED_SPAM','DUPLICATE')),
  company_name TEXT NOT NULL CHECK (length(trim(company_name)) BETWEEN 1 AND 200),
  contact_name TEXT NOT NULL CHECK (length(trim(contact_name)) BETWEEN 1 AND 200),
  email_normalized TEXT NOT NULL CHECK (length(email_normalized) BETWEEN 3 AND 320),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 40),
  service_interest TEXT CHECK (service_interest IS NULL OR service_interest IN ('STATUTORY_AUDIT','INTERNAL_AUDIT','AGREED_UPON_PROCEDURES','OTHER')),
  message TEXT CHECK (message IS NULL OR length(message) <= 4000),
  turnstile_verified INTEGER NOT NULL CHECK (turnstile_verified IN (0,1)),
  ip_sha256 TEXT NOT NULL,
  lead_id TEXT,
  triaged_by_actor_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, lead_id) REFERENCES leads(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, triaged_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS public_lead_submissions_status_idx ON public_lead_submissions(workspace_id, status, created_at);

-- A short-lived, HMAC-SHA256 IP digest protects the exact five-per-hour policy.
CREATE TABLE IF NOT EXISTS public_lead_rate_limit_events (
  id TEXT PRIMARY KEY,
  ip_sha256 TEXT NOT NULL CHECK (length(ip_sha256)=64),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS public_lead_rate_limit_events_window_idx
  ON public_lead_rate_limit_events(ip_sha256,created_at);

UPDATE application_schema_version SET version=51, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1;
