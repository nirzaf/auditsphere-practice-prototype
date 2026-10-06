CREATE TABLE representation_file_reservations (
  workspace_id TEXT NOT NULL,
  file_version_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  reserved_by_actor_id TEXT NOT NULL,
  reserved_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id,file_version_id),
  UNIQUE (workspace_id,request_id,file_version_id),
  FOREIGN KEY (workspace_id,file_version_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,request_id) REFERENCES representation_requests(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reserved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX representation_file_reservations_request_idx
  ON representation_file_reservations(workspace_id,request_id,reserved_at);

CREATE TRIGGER representation_file_reservations_scope_insert
BEFORE INSERT ON representation_file_reservations
BEGIN
  SELECT RAISE(ABORT,'signed representation upload must match the open request, client contact and portal')
  WHERE NOT EXISTS (
    SELECT 1 FROM file_versions f
    JOIN representation_requests r ON r.workspace_id=f.workspace_id AND r.id=NEW.request_id
    JOIN contact_routes cr ON cr.workspace_id=r.workspace_id AND cr.id=r.contact_route_id AND cr.client_id=r.client_id
    JOIN contacts c ON c.workspace_id=cr.workspace_id AND c.client_id=cr.client_id AND c.id=cr.contact_id AND c.active=1
    JOIN actor_profiles ap ON ap.workspace_id=NEW.workspace_id AND ap.id=NEW.reserved_by_actor_id
      AND ap.persona='CLIENT' AND ap.active=1 AND ap.contact_id=c.id
    JOIN engagements e ON e.workspace_id=r.workspace_id AND e.client_id=r.client_id AND e.id=r.engagement_id
    WHERE f.workspace_id=NEW.workspace_id AND f.id=NEW.file_version_id AND f.created_by_actor_id=NEW.reserved_by_actor_id
      AND f.client_id=r.client_id AND f.engagement_id=r.engagement_id AND f.purpose='EVIDENCE'
      AND f.media_type='application/pdf' AND f.state='INITIALIZED' AND f.immutable=0
      AND r.status IN ('SENT','REJECTED') AND e.portal_activated_at IS NOT NULL AND e.portal_frozen_at IS NULL AND e.locked_at IS NULL
      AND (e.archive_due_at IS NULL OR e.archive_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
END;
CREATE TRIGGER representation_file_reservations_no_update BEFORE UPDATE ON representation_file_reservations
BEGIN SELECT RAISE(ABORT,'representation upload reservations are immutable'); END;
CREATE TRIGGER representation_file_reservations_no_delete BEFORE DELETE ON representation_file_reservations
BEGIN SELECT RAISE(ABORT,'representation upload reservations cannot be deleted'); END;
