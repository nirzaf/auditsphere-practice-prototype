-- Preserve the self-asserted Partner identity used for each signature consent.
ALTER TABLE report_signature_assets
  ADD COLUMN owner_display_name TEXT;
ALTER TABLE report_signature_assets
  ADD COLUMN owner_grade TEXT CHECK (owner_grade IS NULL OR owner_grade='PARTNER');
ALTER TABLE report_signature_consents
  ADD COLUMN actor_staff_member_id TEXT REFERENCES staff_members(id) ON DELETE RESTRICT;
ALTER TABLE report_signature_consents
  ADD COLUMN actor_display_name TEXT;
ALTER TABLE report_signature_consents
  ADD COLUMN actor_persona TEXT CHECK (actor_persona IS NULL OR actor_persona='APPROVER');

CREATE TRIGGER report_signature_asset_owner_snapshot_required
BEFORE INSERT ON report_signature_assets
WHEN length(trim(COALESCE(NEW.owner_display_name,'')))=0
  OR NEW.owner_grade<>'PARTNER'
  OR NOT EXISTS (
    SELECT 1 FROM staff_members s
    WHERE s.workspace_id=NEW.workspace_id AND s.id=NEW.staff_member_id
      AND s.grade='PARTNER' AND s.active=1 AND s.display_name=NEW.owner_display_name
  )
BEGIN SELECT RAISE(ABORT,'signature asset requires an active Partner owner snapshot'); END;

CREATE TRIGGER report_signature_consent_owner_snapshot_required
BEFORE INSERT ON report_signature_consents
WHEN NEW.actor_staff_member_id IS NULL
  OR length(trim(COALESCE(NEW.actor_display_name,'')))=0
  OR NEW.actor_persona<>'APPROVER'
  OR NOT EXISTS (
    SELECT 1
    FROM report_signature_assets a
    JOIN staff_members s ON s.workspace_id=a.workspace_id AND s.id=a.staff_member_id
    WHERE a.workspace_id=NEW.workspace_id AND a.id=NEW.signature_asset_id
      AND a.staff_member_id=NEW.actor_staff_member_id AND a.status='ACTIVE'
      AND s.grade='PARTNER' AND s.active=1
  )
BEGIN SELECT RAISE(ABORT,'signature consent requires an active Partner owner snapshot'); END;

UPDATE application_schema_version
SET version = 32,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE singleton = 1;
