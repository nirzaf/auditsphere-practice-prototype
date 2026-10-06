-- Engagement-scoped client PBC requests, immutable submissions and reviews.

ALTER TABLE engagements ADD COLUMN portal_activated_at TEXT;

CREATE TABLE IF NOT EXISTS pbc_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 5000),
  due_date TEXT NOT NULL,
  requested_by_actor_id TEXT NOT NULL,
  assigned_contact_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('GENERAL','TRIAL_BALANCE','BANK_STATEMENT','CONTRACTS','INVOICES','PAYROLL','LEGAL','OTHER')),
  required_for_planning INTEGER NOT NULL CHECK (required_for_planning IN (0,1)),
  required_for_release INTEGER NOT NULL CHECK (required_for_release IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('PENDING_UPLOAD','UNDER_REVIEW','APPROVED','REJECTED_REUPLOAD_REQUIRED')),
  current_submission_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  updated_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id, client_id, engagement_id) REFERENCES engagements(workspace_id, client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, requested_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, assigned_contact_id) REFERENCES contacts(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, created_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, updated_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, current_submission_id) REFERENCES pbc_submissions(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  CHECK ((status='PENDING_UPLOAD' AND current_submission_id IS NULL) OR (status<>'PENDING_UPLOAD' AND current_submission_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS pbc_requests_engagement_status_idx ON pbc_requests(workspace_id, engagement_id, status, due_date);
CREATE INDEX IF NOT EXISTS pbc_requests_contact_idx ON pbc_requests(workspace_id, assigned_contact_id, engagement_id);

CREATE TABLE IF NOT EXISTS pbc_submissions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  request_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  file_version_id TEXT NOT NULL,
  uploaded_by_contact_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  client_comment TEXT,
  supersedes_submission_id TEXT,
  FOREIGN KEY (workspace_id, request_id) REFERENCES pbc_requests(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, file_version_id) REFERENCES file_versions(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, uploaded_by_contact_id) REFERENCES contacts(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, supersedes_submission_id) REFERENCES pbc_submissions(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, request_id, sequence),
  UNIQUE (workspace_id, file_version_id)
);
CREATE INDEX IF NOT EXISTS pbc_submissions_request_idx ON pbc_submissions(workspace_id, request_id, sequence DESC);

CREATE TABLE IF NOT EXISTS pbc_reviews (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  submission_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE','REJECT')),
  comments TEXT,
  reviewed_by_actor_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  file_sha256 TEXT NOT NULL CHECK (length(file_sha256) = 64),
  FOREIGN KEY (workspace_id, submission_id) REFERENCES pbc_submissions(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, request_id) REFERENCES pbc_requests(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, reviewed_by_actor_id) REFERENCES actor_profiles(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, id),
  CHECK (decision <> 'REJECT' OR length(trim(comments)) >= 10)
);
CREATE INDEX IF NOT EXISTS pbc_reviews_request_idx ON pbc_reviews(workspace_id, request_id, reviewed_at, id);

ALTER TABLE file_versions ADD COLUMN pbc_request_id TEXT;
ALTER TABLE file_versions ADD COLUMN pbc_request_version INTEGER;
CREATE INDEX IF NOT EXISTS file_versions_pbc_request_idx ON file_versions(workspace_id, pbc_request_id, pbc_request_version);

CREATE TRIGGER IF NOT EXISTS pbc_requests_current_submission_scope_insert
BEFORE INSERT ON pbc_requests
WHEN NEW.current_submission_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'PBC current submission must belong to the same request')
  WHERE NOT EXISTS (SELECT 1 FROM pbc_submissions s WHERE s.workspace_id=NEW.workspace_id AND s.id=NEW.current_submission_id AND s.request_id=NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS pbc_requests_current_submission_scope_update
BEFORE UPDATE OF current_submission_id ON pbc_requests
WHEN NEW.current_submission_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'PBC current submission must belong to the same request')
  WHERE NOT EXISTS (SELECT 1 FROM pbc_submissions s WHERE s.workspace_id=NEW.workspace_id AND s.id=NEW.current_submission_id AND s.request_id=NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS pbc_submissions_exact_scope_insert
BEFORE INSERT ON pbc_submissions
BEGIN
  SELECT RAISE(ABORT, 'PBC submission must use the assigned contact and request-bound committed file')
  WHERE NOT EXISTS (
    SELECT 1 FROM pbc_requests r JOIN contacts c ON c.workspace_id=r.workspace_id AND c.id=r.assigned_contact_id AND c.client_id=r.client_id AND c.active=1
      JOIN file_versions f ON f.workspace_id=r.workspace_id AND f.id=NEW.file_version_id AND f.client_id=r.client_id AND f.engagement_id=r.engagement_id
        AND f.purpose='PBC' AND f.state='COMMITTED' AND f.immutable=1 AND f.pbc_request_id=r.id AND f.pbc_request_version=r.version AND f.sha256 IS NOT NULL
    WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.request_id AND r.assigned_contact_id=NEW.uploaded_by_contact_id
      AND r.status IN ('PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED')
      AND r.version=(SELECT MAX(version) FROM pbc_requests WHERE workspace_id=r.workspace_id AND id=r.id)
  );
  SELECT RAISE(ABORT, 'PBC replacement must supersede the current rejected submission')
  WHERE NEW.supersedes_submission_id IS NOT (SELECT current_submission_id FROM pbc_requests WHERE workspace_id=NEW.workspace_id AND id=NEW.request_id)
    AND EXISTS (SELECT 1 FROM pbc_requests WHERE workspace_id=NEW.workspace_id AND id=NEW.request_id AND current_submission_id IS NOT NULL);
END;
CREATE TRIGGER IF NOT EXISTS pbc_submissions_no_update BEFORE UPDATE ON pbc_submissions
BEGIN SELECT RAISE(ABORT, 'PBC submissions are append only'); END;
CREATE TRIGGER IF NOT EXISTS pbc_submissions_no_delete BEFORE DELETE ON pbc_submissions
BEGIN SELECT RAISE(ABORT, 'PBC submissions cannot be deleted'); END;

CREATE TRIGGER IF NOT EXISTS pbc_reviews_current_file_insert
BEFORE INSERT ON pbc_reviews
BEGIN
  SELECT RAISE(ABORT, 'PBC review must match the current submission and exact file digest')
  WHERE NOT EXISTS (
    SELECT 1 FROM pbc_requests r JOIN pbc_submissions s ON s.workspace_id=r.workspace_id AND s.id=r.current_submission_id
      JOIN file_versions f ON f.workspace_id=s.workspace_id AND f.id=s.file_version_id
    WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.request_id AND r.current_submission_id=NEW.submission_id
      AND r.status='UNDER_REVIEW' AND f.sha256=NEW.file_sha256
  );
END;
CREATE TRIGGER IF NOT EXISTS pbc_reviews_no_update BEFORE UPDATE ON pbc_reviews
BEGIN SELECT RAISE(ABORT, 'PBC review decisions are append only'); END;
CREATE TRIGGER IF NOT EXISTS pbc_reviews_no_delete BEFORE DELETE ON pbc_reviews
BEGIN SELECT RAISE(ABORT, 'PBC review decisions cannot be deleted'); END;

CREATE TRIGGER IF NOT EXISTS file_versions_pbc_scope_insert
BEFORE INSERT ON file_versions
WHEN NEW.pbc_request_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'PBC file must match an open request, contact scope and current version')
  WHERE NEW.purpose<>'PBC' OR NEW.pbc_request_version IS NULL OR NOT EXISTS (
    SELECT 1 FROM pbc_requests r JOIN contacts c ON c.workspace_id=r.workspace_id AND c.id=r.assigned_contact_id AND c.client_id=r.client_id AND c.active=1
    WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.pbc_request_id AND r.client_id=NEW.client_id AND r.engagement_id=NEW.engagement_id
      AND r.version=NEW.pbc_request_version AND r.status IN ('PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED')
  );
END;
CREATE TRIGGER IF NOT EXISTS file_versions_pbc_scope_update
BEFORE UPDATE OF pbc_request_id,pbc_request_version ON file_versions
WHEN NEW.pbc_request_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'PBC file binding is immutable after reservation')
  WHERE OLD.pbc_request_id IS NOT NULL OR NEW.purpose<>'PBC' OR NEW.pbc_request_version IS NULL OR NOT EXISTS (
    SELECT 1 FROM pbc_requests r WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.pbc_request_id
      AND r.client_id=NEW.client_id AND r.engagement_id=NEW.engagement_id
  );
END;
