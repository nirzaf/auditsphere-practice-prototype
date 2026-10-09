CREATE TABLE IF NOT EXISTS dispatch_delivery_events (
  workspace_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL CHECK (length(provider_event_id) BETWEEN 1 AND 200),
  dispatch_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DELIVERED','BOUNCED')),
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id,provider_event_id),
  FOREIGN KEY (workspace_id,dispatch_id) REFERENCES dispatches(workspace_id,id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS dispatch_delivery_events_dispatch_idx
  ON dispatch_delivery_events(workspace_id,dispatch_id,received_at);

CREATE TRIGGER IF NOT EXISTS dispatch_delivery_events_no_update BEFORE UPDATE ON dispatch_delivery_events
  BEGIN SELECT RAISE(ABORT, 'dispatch delivery events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS dispatch_delivery_events_no_delete BEFORE DELETE ON dispatch_delivery_events
  BEGIN SELECT RAISE(ABORT, 'dispatch delivery events are append-only'); END;

UPDATE application_schema_version SET version=49, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1;
