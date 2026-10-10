CREATE TABLE representation_template_approvals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  clauses_json TEXT NOT NULL CHECK (json_valid(clauses_json) AND json_array_length(clauses_json) BETWEEN 1 AND 30),
  clauses_hash TEXT NOT NULL CHECK (length(clauses_hash)=64),
  approval_rationale TEXT NOT NULL CHECK (length(trim(approval_rationale)) BETWEEN 10 AND 2000),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,request_id) REFERENCES representation_requests(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,request_id)
);
CREATE TRIGGER representation_template_approvals_no_update BEFORE UPDATE ON representation_template_approvals
BEGIN SELECT RAISE(ABORT,'approved representation wording is immutable'); END;
CREATE TRIGGER representation_template_approvals_no_delete BEFORE DELETE ON representation_template_approvals
BEGIN SELECT RAISE(ABORT,'approved representation wording is immutable'); END;
