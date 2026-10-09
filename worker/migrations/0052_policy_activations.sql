CREATE TABLE policy_activations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  policy_kind TEXT NOT NULL CHECK (policy_kind IN ('WORKPROGRAM_TEMPLATE','SAMPLING_POLICY','CHARGE_OUT_RATE')),
  workprogram_template_id TEXT,
  sampling_policy_id TEXT,
  charge_out_rate_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('ACTIVATE','RETIRE')),
  effective_from TEXT NOT NULL CHECK (date(effective_from) IS NOT NULL AND date(effective_from)=effective_from),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 10000),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,workprogram_template_id) REFERENCES workprogram_templates(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,sampling_policy_id) REFERENCES sampling_policies(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,charge_out_rate_id) REFERENCES firm_charge_out_rates(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK (
    (policy_kind='WORKPROGRAM_TEMPLATE' AND workprogram_template_id IS NOT NULL AND sampling_policy_id IS NULL AND charge_out_rate_id IS NULL)
    OR (policy_kind='SAMPLING_POLICY' AND workprogram_template_id IS NULL AND sampling_policy_id IS NOT NULL AND charge_out_rate_id IS NULL)
    OR (policy_kind='CHARGE_OUT_RATE' AND workprogram_template_id IS NULL AND sampling_policy_id IS NULL AND charge_out_rate_id IS NOT NULL)
  )
);

CREATE INDEX policy_activations_template_idx
  ON policy_activations(workspace_id,workprogram_template_id,effective_from);
CREATE INDEX policy_activations_sampling_idx
  ON policy_activations(workspace_id,sampling_policy_id,effective_from);
CREATE INDEX policy_activations_rate_idx
  ON policy_activations(workspace_id,charge_out_rate_id,effective_from);
CREATE INDEX policy_activations_kind_date_idx
  ON policy_activations(workspace_id,policy_kind,effective_from,approved_at);

CREATE TRIGGER policy_activations_no_update BEFORE UPDATE ON policy_activations
  BEGIN SELECT RAISE(ABORT, 'policy activation history is append only'); END;
CREATE TRIGGER policy_activations_no_delete BEFORE DELETE ON policy_activations
  BEGIN SELECT RAISE(ABORT, 'policy activation history is append only'); END;

CREATE TRIGGER workprogram_templates_approved_no_update BEFORE UPDATE ON workprogram_templates
  WHEN OLD.status='APPROVED'
  BEGIN SELECT RAISE(ABORT, 'approved workprogram templates are immutable; create a new revision'); END;
CREATE TRIGGER workprogram_templates_no_delete BEFORE DELETE ON workprogram_templates
  BEGIN SELECT RAISE(ABORT, 'workprogram template history is append only'); END;
CREATE TRIGGER sampling_policies_approved_no_update BEFORE UPDATE ON sampling_policies
  WHEN OLD.status='APPROVED'
  BEGIN SELECT RAISE(ABORT, 'approved sampling policies are immutable; create a new policy revision'); END;
CREATE TRIGGER sampling_policies_no_delete BEFORE DELETE ON sampling_policies
  BEGIN SELECT RAISE(ABORT, 'sampling policy history is append only'); END;

-- Preserve existing Partner approvals as historical activations. Their original
-- effective date is the approval date; the original activation rationale was not
-- stored, so the migration records that evidence limitation explicitly.
INSERT INTO policy_activations(id,workspace_id,policy_kind,workprogram_template_id,sampling_policy_id,charge_out_rate_id,
    action,effective_from,reason,approved_by_actor_id,approved_at)
SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6))),
    workspace_id,'WORKPROGRAM_TEMPLATE',id,NULL,NULL,'ACTIVATE',substr(approved_at,1,10),
    'Legacy approved template imported; the original activation rationale was not recorded.',approved_by_actor_id,approved_at
FROM workprogram_templates WHERE status='APPROVED' AND approved_by_actor_id IS NOT NULL AND approved_at IS NOT NULL
ORDER BY approved_at,revision,id;

INSERT INTO policy_activations(id,workspace_id,policy_kind,workprogram_template_id,sampling_policy_id,charge_out_rate_id,
    action,effective_from,reason,approved_by_actor_id,approved_at)
SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6))),
    workspace_id,'SAMPLING_POLICY',NULL,id,NULL,'ACTIVATE',substr(approved_at,1,10),
    'Legacy approved sampling policy imported; the original activation rationale was not recorded.',approved_by_actor_id,approved_at
FROM sampling_policies WHERE status='APPROVED' AND approved_by_actor_id IS NOT NULL AND approved_at IS NOT NULL
ORDER BY approved_at,version,id;

INSERT INTO policy_activations(id,workspace_id,policy_kind,workprogram_template_id,sampling_policy_id,charge_out_rate_id,
    action,effective_from,reason,approved_by_actor_id,approved_at)
SELECT lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(2))||'-'||hex(randomblob(6))),
    workspace_id,'CHARGE_OUT_RATE',NULL,NULL,id,'ACTIVATE',effective_from,
    'Legacy approved charge-out rate imported from its effective date; the activation ledger did not exist.',approved_by_actor_id,approved_at
FROM firm_charge_out_rates ORDER BY effective_from,revision,id;

CREATE VIEW policy_activation_intervals AS
WITH events AS (
  SELECT a.rowid AS event_order,a.id,a.workspace_id,a.policy_kind,a.workprogram_template_id,a.sampling_policy_id,a.charge_out_rate_id,
    COALESCE(a.workprogram_template_id,a.sampling_policy_id,a.charge_out_rate_id) AS policy_id,
    a.action,a.effective_from,a.reason,a.approved_by_actor_id,a.approved_at,
    CASE a.policy_kind
      WHEN 'WORKPROGRAM_TEMPLATE' THEN t.fsli_code||'|'||t.standards_profile_id
      WHEN 'SAMPLING_POLICY' THEN s.method
      WHEN 'CHARGE_OUT_RATE' THEN r.grade
    END AS scope_key
  FROM policy_activations a
  LEFT JOIN workprogram_templates t ON t.workspace_id=a.workspace_id AND t.id=a.workprogram_template_id
  LEFT JOIN sampling_policies s ON s.workspace_id=a.workspace_id AND s.id=a.sampling_policy_id
  LEFT JOIN firm_charge_out_rates r ON r.workspace_id=a.workspace_id AND r.id=a.charge_out_rate_id
)
SELECT events.*,
  LEAD(effective_from) OVER (PARTITION BY workspace_id,policy_kind,scope_key ORDER BY effective_from,approved_at,event_order) AS next_effective_from
FROM events;

UPDATE application_schema_version SET version=52,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE singleton=1;
