ALTER TABLE file_versions ADD COLUMN payment_evidence_reservation_id TEXT;

CREATE TABLE payment_evidence_reservations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  reserved_by_actor_id TEXT NOT NULL,
  payment_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reserved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE UNIQUE INDEX file_versions_payment_evidence_reservation_idx
  ON file_versions(workspace_id,payment_evidence_reservation_id) WHERE payment_evidence_reservation_id IS NOT NULL;

CREATE TRIGGER payment_evidence_reservations_staff_scope_insert
BEFORE INSERT ON payment_evidence_reservations
BEGIN
  SELECT RAISE(ABORT,'payment evidence reservations require an active internal actor and engagement')
  WHERE NOT EXISTS (
    SELECT 1 FROM actor_profiles ap JOIN engagements e ON e.workspace_id=NEW.workspace_id AND e.client_id=NEW.client_id AND e.id=NEW.engagement_id
    WHERE ap.workspace_id=NEW.workspace_id AND ap.id=NEW.reserved_by_actor_id AND ap.active=1 AND ap.persona IN ('PREPARER','REVIEWER','APPROVER')
  );
END;
CREATE TRIGGER payment_evidence_reservations_payment_update
BEFORE UPDATE OF payment_id ON payment_evidence_reservations
WHEN OLD.payment_id IS NOT NULL OR NEW.payment_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM payments p JOIN file_versions f ON f.workspace_id=p.workspace_id AND f.id=p.evidence_file_id
  WHERE p.workspace_id=NEW.workspace_id AND p.id=NEW.payment_id AND p.client_id=NEW.client_id AND p.engagement_id=NEW.engagement_id
    AND f.payment_evidence_reservation_id=NEW.id AND f.created_by_actor_id=NEW.reserved_by_actor_id
)
BEGIN SELECT RAISE(ABORT,'payment evidence can be attached once to its verified payment only'); END;
CREATE TRIGGER payment_evidence_reservations_no_delete BEFORE DELETE ON payment_evidence_reservations
BEGIN SELECT RAISE(ABORT,'payment evidence reservation history cannot be deleted'); END;

CREATE TRIGGER file_versions_payment_evidence_scope_insert
BEFORE INSERT ON file_versions
WHEN NEW.payment_evidence_reservation_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'payment evidence file must match its internal reservation')
  WHERE NEW.purpose<>'EVIDENCE' OR NOT EXISTS (
    SELECT 1 FROM payment_evidence_reservations r
    WHERE r.workspace_id=NEW.workspace_id AND r.id=NEW.payment_evidence_reservation_id AND r.client_id=NEW.client_id
      AND r.engagement_id=NEW.engagement_id AND r.reserved_by_actor_id=NEW.created_by_actor_id AND r.payment_id IS NULL
  );
END;
CREATE TRIGGER file_versions_payment_evidence_binding_immutable
BEFORE UPDATE OF payment_evidence_reservation_id ON file_versions
WHEN NEW.payment_evidence_reservation_id IS NOT OLD.payment_evidence_reservation_id
BEGIN SELECT RAISE(ABORT,'payment evidence reservation binding is immutable'); END;
