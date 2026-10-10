-- Store local work-day time intervals so approved leave totals cannot double-count overlaps.
ALTER TABLE leave_records ADD COLUMN start_minute INTEGER;
ALTER TABLE leave_records ADD COLUMN end_minute INTEGER;

CREATE INDEX leave_records_interval_idx
  ON leave_records(workspace_id,staff_member_id,work_date,start_minute,end_minute);

-- Existing day-only leave rows remain immutable but cannot safely be combined with
-- new intervals for the same staff member and date until their timing is reconciled.
CREATE TRIGGER leave_records_interval_insert_guard BEFORE INSERT ON leave_records
WHEN NEW.start_minute IS NULL OR NEW.end_minute IS NULL
  OR NEW.start_minute < 0 OR NEW.start_minute > 1439
  OR NEW.end_minute < 1 OR NEW.end_minute > 1440
  OR NEW.end_minute <= NEW.start_minute
  OR NEW.minutes <> NEW.end_minute - NEW.start_minute
  OR EXISTS (
    SELECT 1 FROM leave_records existing
    WHERE existing.workspace_id=NEW.workspace_id
      AND existing.staff_member_id=NEW.staff_member_id
      AND existing.work_date=NEW.work_date
      AND existing.status='APPROVED'
      AND (
        existing.start_minute IS NULL OR existing.end_minute IS NULL
        OR (existing.start_minute < NEW.end_minute AND existing.end_minute > NEW.start_minute)
      )
  )
BEGIN
  SELECT RAISE(ABORT,'approved leave intervals must be valid, unambiguous and non-overlapping');
END;

UPDATE application_schema_version
SET version=55, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton=1;
