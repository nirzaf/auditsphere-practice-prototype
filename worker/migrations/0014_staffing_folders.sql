-- Capacity-aware engagement planning and the canonical engagement folder set.
ALTER TABLE engagements ADD COLUMN active_mapping_version_id TEXT;
ALTER TABLE engagements ADD COLUMN active_materiality_version_id TEXT;

CREATE TABLE IF NOT EXISTS staff_availability (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  staff_member_id TEXT NOT NULL,
  work_date TEXT NOT NULL CHECK (date(work_date) IS NOT NULL AND date(work_date)=work_date),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  scheduled_minutes INTEGER NOT NULL CHECK (scheduled_minutes BETWEEN 0 AND 1440),
  approved_leave_minutes INTEGER NOT NULL DEFAULT 0 CHECK (approved_leave_minutes BETWEEN 0 AND scheduled_minutes),
  updated_by_actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,staff_member_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,updated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,staff_member_id,work_date)
);
CREATE INDEX IF NOT EXISTS staff_availability_date_idx ON staff_availability(workspace_id,work_date,staff_member_id);

CREATE TABLE IF NOT EXISTS leave_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  staff_member_id TEXT NOT NULL,
  work_date TEXT NOT NULL CHECK (date(work_date) IS NOT NULL AND date(work_date)=work_date),
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
  status TEXT NOT NULL CHECK (status IN ('APPROVED')),
  approved_by_actor_id TEXT NOT NULL,
  approval_decision_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,staff_member_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approval_decision_id) REFERENCES approval_decisions(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE INDEX IF NOT EXISTS leave_records_staff_date_idx ON leave_records(workspace_id,staff_member_id,work_date);
CREATE TRIGGER IF NOT EXISTS leave_records_no_update BEFORE UPDATE ON leave_records
BEGIN SELECT RAISE(ABORT, 'approved leave records are append only'); END;
CREATE TRIGGER IF NOT EXISTS leave_records_no_delete BEFORE DELETE ON leave_records
BEGIN SELECT RAISE(ABORT, 'approved leave records cannot be deleted'); END;

CREATE TABLE IF NOT EXISTS engagement_assignments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  staff_member_id TEXT NOT NULL,
  persona TEXT NOT NULL CHECK (persona IN ('PREPARER','REVIEWER','APPROVER')),
  phase TEXT NOT NULL CHECK (phase IN ('COMMERCIAL','PLANNING','FIELDWORK','REVIEW','REPORTING','ARCHIVE')),
  start_date TEXT NOT NULL CHECK (date(start_date) IS NOT NULL AND date(start_date)=start_date),
  end_date TEXT NOT NULL CHECK (date(end_date) IS NOT NULL AND date(end_date)=end_date),
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes BETWEEN 1 AND 1000000),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,staff_member_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK (start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS engagement_assignments_staff_phase_idx ON engagement_assignments(workspace_id,staff_member_id,phase,start_date,end_date);
CREATE INDEX IF NOT EXISTS engagement_assignments_engagement_idx ON engagement_assignments(workspace_id,engagement_id,phase);

CREATE TABLE IF NOT EXISTS engagement_assignment_days (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  work_date TEXT NOT NULL CHECK (date(work_date) IS NOT NULL AND date(work_date)=work_date),
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes BETWEEN 1 AND 1440),
  FOREIGN KEY (workspace_id,assignment_id) REFERENCES engagement_assignments(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,assignment_id,work_date)
);
CREATE INDEX IF NOT EXISTS assignment_days_staff_date_idx ON engagement_assignment_days(workspace_id,work_date,assignment_id);

CREATE TABLE IF NOT EXISTS capacity_exceptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  staff_member_id TEXT NOT NULL,
  work_date TEXT NOT NULL CHECK (date(work_date) IS NOT NULL AND date(work_date)=work_date),
  excess_minutes INTEGER NOT NULL CHECK (excess_minutes BETWEEN 1 AND 1440),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
  approval_decision_id TEXT NOT NULL,
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,staff_member_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approval_decision_id) REFERENCES approval_decisions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE INDEX IF NOT EXISTS capacity_exceptions_staff_day_idx ON capacity_exceptions(workspace_id,staff_member_id,work_date);
CREATE TRIGGER IF NOT EXISTS capacity_exceptions_no_update BEFORE UPDATE ON capacity_exceptions
BEGIN SELECT RAISE(ABORT, 'capacity exceptions are append only'); END;
CREATE TRIGGER IF NOT EXISTS capacity_exceptions_no_delete BEFORE DELETE ON capacity_exceptions
BEGIN SELECT RAISE(ABORT, 'capacity exceptions cannot be deleted'); END;

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code IN ('FIELDWORK_START','DRAFT_REPORT','FINAL_REPORT','STATUTORY_CUTOFF')),
  target_date TEXT NOT NULL CHECK (date(target_date) IS NOT NULL AND date(target_date)=target_date),
  actual_date TEXT CHECK (actual_date IS NULL OR (date(actual_date) IS NOT NULL AND date(actual_date)=actual_date)),
  source_reference TEXT NOT NULL CHECK (length(trim(source_reference)) BETWEEN 1 AND 1000),
  approved_by_actor_id TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,code)
);
CREATE INDEX IF NOT EXISTS milestones_engagement_date_idx ON milestones(workspace_id,engagement_id,target_date);

CREATE TABLE IF NOT EXISTS engagement_folders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code IN ('ADMIN_PLANNING','TB_SCHEDULES','FIELDWORK_TESTING','DRAFTS_DELIVERABLES','FINAL_SIGNED_ARCHIVE')),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 5),
  created_from_clearance_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_from_clearance_id) REFERENCES risk_clearances(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,code),
  UNIQUE (workspace_id,engagement_id,ordinal)
);
CREATE INDEX IF NOT EXISTS engagement_folders_client_idx ON engagement_folders(workspace_id,client_id,engagement_id,ordinal);
CREATE TRIGGER IF NOT EXISTS engagement_folders_no_update BEFORE UPDATE ON engagement_folders
BEGIN SELECT RAISE(ABORT, 'engagement folder taxonomy rows are immutable'); END;
CREATE TRIGGER IF NOT EXISTS engagement_folders_no_delete BEFORE DELETE ON engagement_folders
BEGIN SELECT RAISE(ABORT, 'engagement folder taxonomy rows cannot be deleted'); END;

CREATE TRIGGER IF NOT EXISTS file_folder_scope_insert
BEFORE INSERT ON file_versions WHEN NEW.folder_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'file folder must match its client and engagement')
    WHERE NOT EXISTS (SELECT 1 FROM engagement_folders f WHERE f.workspace_id=NEW.workspace_id AND f.id=NEW.folder_id
      AND f.client_id=NEW.client_id AND f.engagement_id=NEW.engagement_id);
  SELECT RAISE(ABORT, 'final signed archive only accepts release or archive artifacts')
    WHERE EXISTS (SELECT 1 FROM engagement_folders f WHERE f.workspace_id=NEW.workspace_id AND f.id=NEW.folder_id
      AND f.code='FINAL_SIGNED_ARCHIVE') AND NEW.purpose NOT IN ('RELEASE','ARCHIVE');
END;
CREATE TRIGGER IF NOT EXISTS file_folder_scope_update
BEFORE UPDATE OF folder_id ON file_versions WHEN NEW.folder_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'file folder must match its client and engagement')
    WHERE NOT EXISTS (SELECT 1 FROM engagement_folders f WHERE f.workspace_id=NEW.workspace_id AND f.id=NEW.folder_id
      AND f.client_id=NEW.client_id AND f.engagement_id=NEW.engagement_id);
  SELECT RAISE(ABORT, 'final signed archive only accepts release or archive artifacts')
    WHERE EXISTS (SELECT 1 FROM engagement_folders f WHERE f.workspace_id=NEW.workspace_id AND f.id=NEW.folder_id
      AND f.code='FINAL_SIGNED_ARCHIVE') AND NEW.purpose NOT IN ('RELEASE','ARCHIVE');
END;
