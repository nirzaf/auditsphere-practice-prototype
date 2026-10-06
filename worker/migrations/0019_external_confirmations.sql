-- External confirmations are versioned workpaper records. Dispatch and holding
-- letter artifacts are retained through the existing verified file/outbox path.
-- 0018's adjustment-response trigger references this field; add it before this
-- migration's schema changes so both fresh and already-migrated D1 databases
-- can revalidate the existing trigger when applying 0019.
ALTER TABLE audit_adjustments ADD COLUMN client_response TEXT;

CREATE TABLE dispatches_next (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('PROPOSAL','EL','INVOICE','RECEIPT','PBC','HOLDING_LETTER','BUNDLE','CONFIRMATION')),
  file_version_id TEXT NOT NULL,
  recipient_snapshot_json TEXT NOT NULL CHECK (json_valid(recipient_snapshot_json) AND length(recipient_snapshot_json)<=10000),
  status TEXT NOT NULL CHECK (status IN ('QUEUED','ACCEPTED','DELIVERED','BOUNCED','FAILED','UNKNOWN')),
  provider_message_id TEXT,
  sent_at TEXT,
  deduplication_key TEXT NOT NULL,
  job_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,job_id) REFERENCES outbox_jobs(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,deduplication_key)
);
INSERT INTO dispatches_next(id,workspace_id,version,client_id,engagement_id,purpose,file_version_id,recipient_snapshot_json,status,provider_message_id,sent_at,deduplication_key,job_id,created_at,updated_at)
  SELECT id,workspace_id,version,client_id,engagement_id,purpose,file_version_id,recipient_snapshot_json,status,provider_message_id,sent_at,deduplication_key,job_id,created_at,updated_at FROM dispatches;
DROP TABLE dispatches;
ALTER TABLE dispatches_next RENAME TO dispatches;
CREATE INDEX dispatches_engagement_status_idx ON dispatches(workspace_id,engagement_id,purpose,status);

CREATE TABLE confirmations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BANK','AR','AP','INVENTORY','LEGAL')),
  fsli_id TEXT NOT NULL,
  tb_version_id TEXT NOT NULL,
  mapping_version_id TEXT NOT NULL,
  materiality_version_id TEXT NOT NULL,
  external_party_name TEXT NOT NULL CHECK (length(trim(external_party_name)) BETWEEN 1 AND 200),
  external_party_address TEXT NOT NULL CHECK (length(trim(external_party_address)) BETWEEN 1 AND 2000),
  external_party_email TEXT CHECK (external_party_email IS NULL OR (length(external_party_email)<=320 AND instr(external_party_email,'@')>1)),
  recipient_verification_text TEXT NOT NULL CHECK (length(trim(recipient_verification_text)) BETWEEN 10 AND 5000),
  balance_minor INTEGER CHECK (balance_minor IS NULL OR balance_minor BETWEEN -9007199254740991 AND 9007199254740991),
  critical INTEGER NOT NULL CHECK (critical IN (0,1)),
  criticality_reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','QUEUED','SENT','RETURNED_UNVERIFIED','RETURNED_VERIFIED','CANCELLED')),
  due_date TEXT NOT NULL,
  dispatch_id TEXT,
  response_file_id TEXT,
  response_recorded_by_actor_id TEXT,
  returned_at TEXT,
  verified_by_actor_id TEXT,
  verified_at TEXT,
  verification_rationale TEXT,
  reliance_frozen INTEGER NOT NULL DEFAULT 0 CHECK (reliance_frozen IN (0,1)),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,tb_version_id) REFERENCES tb_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,mapping_version_id) REFERENCES mapping_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,materiality_version_id) REFERENCES materiality_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,dispatch_id) REFERENCES dispatches(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,response_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,response_recorded_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,verified_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK (critical=0 OR length(trim(COALESCE(criticality_reason,''))) BETWEEN 10 AND 5000),
  CHECK ((status IN ('RETURNED_UNVERIFIED','RETURNED_VERIFIED') AND response_file_id IS NOT NULL AND response_recorded_by_actor_id IS NOT NULL AND returned_at IS NOT NULL)
      OR (status='CANCELLED' AND ((response_file_id IS NULL AND response_recorded_by_actor_id IS NULL AND returned_at IS NULL)
        OR (response_file_id IS NOT NULL AND response_recorded_by_actor_id IS NOT NULL AND returned_at IS NOT NULL)))
      OR (status NOT IN ('RETURNED_UNVERIFIED','RETURNED_VERIFIED','CANCELLED') AND response_file_id IS NULL AND response_recorded_by_actor_id IS NULL AND returned_at IS NULL)),
  CHECK ((status='RETURNED_VERIFIED' AND verified_by_actor_id IS NOT NULL AND verified_at IS NOT NULL AND length(trim(COALESCE(verification_rationale,'')))>=10)
      OR (status='CANCELLED' AND ((verified_by_actor_id IS NULL AND verified_at IS NULL AND verification_rationale IS NULL)
        OR (verified_by_actor_id IS NOT NULL AND verified_at IS NOT NULL AND length(trim(COALESCE(verification_rationale,'')))>=10)))
      OR (status NOT IN ('RETURNED_VERIFIED','CANCELLED') AND verified_by_actor_id IS NULL AND verified_at IS NULL AND verification_rationale IS NULL))
);
CREATE TABLE confirmation_scope_reassessments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  prior_confirmation_id TEXT NOT NULL,
  replacement_confirmation_id TEXT,
  prior_source_hash TEXT NOT NULL CHECK (length(prior_source_hash)=64),
  replacement_source_hash TEXT CHECK (replacement_source_hash IS NULL OR length(replacement_source_hash)=64),
  prior_critical INTEGER NOT NULL CHECK (prior_critical IN (0,1)),
  replacement_critical INTEGER CHECK (replacement_critical IS NULL OR replacement_critical IN (0,1)),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 10000),
  partner_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,prior_confirmation_id) REFERENCES confirmations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,replacement_confirmation_id) REFERENCES confirmations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,partner_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,prior_confirmation_id),
  CHECK ((replacement_confirmation_id IS NULL AND replacement_source_hash IS NULL AND replacement_critical IS NULL)
      OR (replacement_confirmation_id IS NOT NULL AND replacement_source_hash IS NOT NULL AND replacement_critical IS NOT NULL))
);
CREATE TRIGGER confirmation_scope_reassessments_no_update BEFORE UPDATE ON confirmation_scope_reassessments
BEGIN SELECT RAISE(ABORT, 'confirmation scope reassessment approvals are append only'); END;
CREATE TRIGGER confirmation_scope_reassessments_no_delete BEFORE DELETE ON confirmation_scope_reassessments
BEGIN SELECT RAISE(ABORT, 'confirmation scope reassessment approvals are append only'); END;
CREATE INDEX confirmations_engagement_status_idx ON confirmations(workspace_id,engagement_id,status,critical);
CREATE TRIGGER confirmations_status_transition
BEFORE UPDATE OF status ON confirmations
WHEN NOT ((OLD.status='DRAFT' AND NEW.status IN ('QUEUED','CANCELLED'))
  OR (OLD.status='QUEUED' AND NEW.status='SENT')
  OR (OLD.status='SENT' AND NEW.status='RETURNED_UNVERIFIED')
  OR (OLD.status='RETURNED_UNVERIFIED' AND NEW.status='RETURNED_VERIFIED')
  OR (NEW.status='CANCELLED' AND OLD.status<>'CANCELLED' AND EXISTS(SELECT 1 FROM confirmation_scope_reassessments r
      WHERE r.workspace_id=OLD.workspace_id AND r.prior_confirmation_id=OLD.id)))
BEGIN SELECT RAISE(ABORT, 'invalid external confirmation state transition'); END;
CREATE TRIGGER confirmations_scope_frozen_after_queue
BEFORE UPDATE OF type,fsli_id,external_party_name,external_party_address,external_party_email,recipient_verification_text,balance_minor,critical,criticality_reason,due_date ON confirmations
WHEN OLD.status<>'DRAFT' AND (
  NEW.type IS NOT OLD.type OR NEW.fsli_id IS NOT OLD.fsli_id OR NEW.external_party_name IS NOT OLD.external_party_name
  OR NEW.external_party_address IS NOT OLD.external_party_address OR NEW.external_party_email IS NOT OLD.external_party_email
  OR NEW.recipient_verification_text IS NOT OLD.recipient_verification_text OR NEW.balance_minor IS NOT OLD.balance_minor
  OR NEW.critical IS NOT OLD.critical OR NEW.criticality_reason IS NOT OLD.criticality_reason OR NEW.due_date IS NOT OLD.due_date)
BEGIN SELECT RAISE(ABORT, 'relied-upon confirmation scope is frozen'); END;
CREATE TRIGGER confirmations_response_immutable
BEFORE UPDATE OF response_file_id,response_recorded_by_actor_id,returned_at ON confirmations
WHEN OLD.response_file_id IS NOT NULL AND (NEW.response_file_id IS NOT OLD.response_file_id OR NEW.response_recorded_by_actor_id IS NOT OLD.response_recorded_by_actor_id OR NEW.returned_at IS NOT OLD.returned_at)
BEGIN SELECT RAISE(ABORT, 'confirmation response evidence is immutable'); END;
CREATE TRIGGER confirmations_no_delete BEFORE DELETE ON confirmations
BEGIN SELECT RAISE(ABORT, 'confirmation history cannot be deleted'); END;

CREATE TABLE confirmation_followups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  confirmation_id TEXT NOT NULL,
  note TEXT NOT NULL CHECK (length(trim(note)) BETWEEN 10 AND 5000),
  dispatch_id TEXT,
  followed_at TEXT NOT NULL,
  created_by_actor_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,confirmation_id) REFERENCES confirmations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,dispatch_id) REFERENCES dispatches(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TRIGGER confirmation_followups_no_update BEFORE UPDATE ON confirmation_followups
BEGIN SELECT RAISE(ABORT, 'confirmation follow-up history is append only'); END;
CREATE TRIGGER confirmation_followups_no_delete BEFORE DELETE ON confirmation_followups
BEGIN SELECT RAISE(ABORT, 'confirmation follow-up history is append only'); END;

CREATE TABLE confirmation_alternative_procedures (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  confirmation_id TEXT NOT NULL,
  evidence_file_id TEXT NOT NULL,
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 10000),
  recorded_by_actor_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,confirmation_id) REFERENCES confirmations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,evidence_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,recorded_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TRIGGER confirmation_alternative_procedures_no_update BEFORE UPDATE ON confirmation_alternative_procedures
BEGIN SELECT RAISE(ABORT, 'alternative procedure history is append only'); END;
CREATE TRIGGER confirmation_alternative_procedures_no_delete BEFORE DELETE ON confirmation_alternative_procedures
BEGIN SELECT RAISE(ABORT, 'alternative procedure history is append only'); END;

CREATE TABLE holding_letters (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  outstanding_set_hash TEXT NOT NULL CHECK (length(outstanding_set_hash)=64),
  confirmation_ids_snapshot_json TEXT NOT NULL CHECK (json_valid(confirmation_ids_snapshot_json)),
  artifact_id TEXT NOT NULL,
  dispatch_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,artifact_id) REFERENCES generated_artifacts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,dispatch_id) REFERENCES dispatches(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,outstanding_set_hash),
  UNIQUE (workspace_id,artifact_id)
);
CREATE TRIGGER holding_letters_no_update BEFORE UPDATE ON holding_letters
BEGIN SELECT RAISE(ABORT, 'holding-letter source snapshots are append only'); END;
CREATE TRIGGER holding_letters_no_delete BEFORE DELETE ON holding_letters
BEGIN SELECT RAISE(ABORT, 'holding-letter source snapshots are append only'); END;
