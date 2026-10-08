import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { unstable_splitSqlQuery } from 'wrangler';
import { buildMigrationApplyPlan } from '../../tools/business-migration-apply.js';
import { buildMigrationAuditReport, type MigrationAuditSnapshot } from '../../tools/business-migration-audit-core.js';
import { buildMigrationAuditSnapshotQuery } from '../../tools/business-migration-audit-query.js';
import { APPLICATION_SCHEMA_VERSION } from '../../worker/versions.js';

const snapshot = (): MigrationAuditSnapshot => ({
  workspace: { id: '00000000-0000-4000-8000-000000000031', schema_version: 30, data_mode: 'TEST' },
  entities: [
    { entity_kind: 'clients', entity_id: 'client-parent', payload_json: JSON.stringify({
      id: 'client-parent', code: 'C-PARENT', name: 'Parent WLL', tradingName: null, entityRole: 'Holding',
      parentClientId: null, registrationNumber: null, taxId: null, industry: 'Services', address: 'Doha',
      jurisdiction: 'Qatar', status: 'Active'
    }) },
    { entity_kind: 'clients', entity_id: 'client-child', payload_json: JSON.stringify({
      id: 'client-child', code: 'C-CHILD', name: 'Child WLL', tradingName: null, entityRole: 'Subsidiary',
      parentClientId: 'client-parent', registrationNumber: null, taxId: null, industry: 'Services', address: 'Doha',
      jurisdiction: 'QA', status: 'Active'
    }) },
    { entity_kind: 'contacts', entity_id: 'contact-1', payload_json: JSON.stringify({
      id: 'contact-1', clientId: 'client-child', name: 'Finance Contact', email: 'FINANCE@example.test', phone: null,
      title: 'Finance Director', contactRole: 'CFO/Finance Director', isPrimary: true, isSignatory: false,
      active: true, effectiveFrom: '2026-01-01', effectiveTo: null
    }) }
  ],
  rootDocuments: [{ document_key: '__manifest__', payload_json: JSON.stringify({ schemaVersion: 30 }) }],
  files: [], idMaps: [], targetRows: [], targetMoneyTotals: []
});

const createDatabase = (sourceSnapshot = snapshot()): DatabaseSync => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON');
  const directory = resolve(process.cwd(), 'worker', 'migrations');
  for (const file of readdirSync(directory).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    for (const statement of unstable_splitSqlQuery(readFileSync(join(directory, file), 'utf8'))) database.prepare(statement).run();
  }
  database.prepare(`INSERT INTO workspaces(id,seed_id,name,schema_version,revision,status,created_at,updated_at)
    VALUES (?,NULL,'Migration apply fixture',30,1,'active',0,0)`).run(sourceSnapshot.workspace.id);
  for (const entity of sourceSnapshot.entities) {
    database.prepare(`INSERT INTO workspace_entities(workspace_id,entity_kind,entity_id,version,payload_json,created_at,updated_at)
      VALUES (?,?,?,?,?,0,0)`).run(sourceSnapshot.workspace.id, entity.entity_kind, entity.entity_id, 1, entity.payload_json);
  }
  for (const root of sourceSnapshot.rootDocuments) {
    database.prepare(`INSERT INTO workspace_root_documents(workspace_id,document_key,version,payload_json,created_at,updated_at)
      VALUES(?,?,1,?,0,0)`).run(sourceSnapshot.workspace.id, root.document_key, root.payload_json);
  }
  for (const file of sourceSnapshot.files) {
    database.prepare(`INSERT INTO file_objects(id,workspace_id,client_id,engagement_id,category,logical_record_type,logical_record_id,
      r2_key,original_name,mime_type,size_bytes,sha256,state,immutable,created_by_user_id,created_at,committed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      file.id, sourceSnapshot.workspace.id, file.client_id, file.engagement_id, file.category, file.logical_record_type,
      file.logical_record_id, file.r2_key, file.original_name, file.mime_type, file.size_bytes, file.sha256,
      file.state, file.immutable, file.created_by_user_id, file.created_at, file.committed_at
    );
  }
  return database;
};

it('builds an atomic, source-guarded plan for reviewed clients and contacts', () => {
  const source = snapshot();
  const report = buildMigrationAuditReport(source, new Map(), APPLICATION_SCHEMA_VERSION, APPLICATION_SCHEMA_VERSION);
  assert.equal(report.targetSchemaVersion, APPLICATION_SCHEMA_VERSION);
  const plan = buildMigrationApplyPlan(source, report, APPLICATION_SCHEMA_VERSION, '2026-10-08T10:00:00.000Z');

  assert.equal(plan.recordCount, 3);
  assert.match(plan.sql, /status='VALIDATED'/);
  assert.match(plan.sql, /UPDATE migration_runs SET status='APPLIED'/);
  assert.match(plan.sql, new RegExp(`,${APPLICATION_SCHEMA_VERSION},.*'VALIDATED'`));
  assert.match(plan.sql, /payload_json=/);
  assert.ok(plan.sql.indexOf("SELECT 'client-parent'") < plan.sql.indexOf("SELECT 'client-child'"), 'parents are inserted before subsidiaries');
  assert.match(plan.sql, /contacts\(id,client_id,full_name,email,phone,title,role,is_primary,is_signatory,active/);
  assert.equal(plan.sourceSha256, report.sourceSha256);
});

it('rejects a dry-run report when root or entity source data changed before apply planning', () => {
  const source = snapshot();
  const report = buildMigrationAuditReport(source, new Map(), APPLICATION_SCHEMA_VERSION, APPLICATION_SCHEMA_VERSION);
  const changed = structuredClone(source);
  changed.rootDocuments[0].payload_json = JSON.stringify({ schemaVersion: 30, changed: true });
  assert.throws(
    () => buildMigrationApplyPlan(changed, report, APPLICATION_SCHEMA_VERSION, '2026-10-08T10:00:00.000Z'),
    /AUDIT_REPORT_SOURCE_DIGEST_MISMATCH/
  );

  const staleSchemaReport = buildMigrationAuditReport(source, new Map(), APPLICATION_SCHEMA_VERSION - 1, APPLICATION_SCHEMA_VERSION);
  assert.throws(
    () => buildMigrationApplyPlan(source, staleSchemaReport, APPLICATION_SCHEMA_VERSION, '2026-10-08T10:00:00.000Z'),
    /AUDIT_REPORT_TARGET_SCHEMA_MISMATCH/
  );
});

it('applies all planned rows atomically and rolls back when a source row changed after preflight', () => {
  const source = snapshot();
  const report = buildMigrationAuditReport(source, new Map(), APPLICATION_SCHEMA_VERSION, APPLICATION_SCHEMA_VERSION);
  const plan = buildMigrationApplyPlan(source, report, APPLICATION_SCHEMA_VERSION, '2026-10-08T10:00:00.000Z');
  const apply = (database: DatabaseSync, sql: string): void => {
    database.exec('BEGIN');
    try {
      for (const statement of unstable_splitSqlQuery(sql)) database.prepare(statement).run();
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  };

  const validDatabase = createDatabase();
  try {
    apply(validDatabase, plan.sql);
    assert.equal(validDatabase.prepare("SELECT COUNT(*) AS n FROM clients WHERE workspace_id=?").get(source.workspace.id)?.n, 2);
    assert.equal(validDatabase.prepare("SELECT COUNT(*) AS n FROM contacts WHERE workspace_id=?").get(source.workspace.id)?.n, 1);
    assert.equal(validDatabase.prepare("SELECT status FROM migration_runs WHERE id=?").get(report.runId)?.status, 'APPLIED');
    assert.equal(validDatabase.prepare("SELECT COUNT(*) AS n FROM migration_id_map WHERE run_id=?").get(report.runId)?.n, 3);
  } finally { validDatabase.close(); }

  const staleDatabase = createDatabase();
  try {
    staleDatabase.prepare("UPDATE workspace_entities SET payload_json=? WHERE workspace_id=? AND entity_kind='contacts' AND entity_id='contact-1'")
      .run('{"id":"contact-1","name":"Changed Contact"}', source.workspace.id);
    assert.throws(() => apply(staleDatabase, plan.sql), /MIGRATION_TARGET_ROW_MISSING_OR_UNSUPPORTED/);
    assert.equal(staleDatabase.prepare("SELECT COUNT(*) AS n FROM clients WHERE workspace_id=?").get(source.workspace.id)?.n, 0);
    assert.equal(staleDatabase.prepare("SELECT COUNT(*) AS n FROM migration_runs WHERE workspace_id=?").get(source.workspace.id)?.n, 0);
  } finally { staleDatabase.close(); }

  const changedRootDatabase = createDatabase();
  try {
    changedRootDatabase.prepare('UPDATE workspace_root_documents SET payload_json=? WHERE workspace_id=? AND document_key=?')
      .run('{"schemaVersion":30,"changed":true}', source.workspace.id, '__manifest__');
    assert.throws(() => apply(changedRootDatabase, plan.sql));
    assert.equal(changedRootDatabase.prepare('SELECT COUNT(*) AS n FROM migration_runs WHERE workspace_id=?').get(source.workspace.id)?.n, 0);
    assert.equal(changedRootDatabase.prepare('SELECT COUNT(*) AS n FROM clients WHERE workspace_id=?').get(source.workspace.id)?.n, 0);
  } finally { changedRootDatabase.close(); }
});

it('blocks unmapped entity kinds instead of dropping them', () => {
  const source = snapshot();
  source.entities.push({ entity_kind: 'invoices', entity_id: 'invoice-1', payload_json: '{"id":"invoice-1"}' });
  const report = buildMigrationAuditReport(source, new Map(), APPLICATION_SCHEMA_VERSION, APPLICATION_SCHEMA_VERSION);

  assert.throws(() => buildMigrationApplyPlan(source, report, APPLICATION_SCHEMA_VERSION, '2026-10-08T10:00:00.000Z'), /ENTITY_KIND_NOT_SUPPORTED_BY_APPLY_MIGRATOR/);
});

it('migrates canonical leads with exact client/contact links and source lifecycle state', () => {
  const source = snapshot();
  source.entities.push({ entity_kind: 'leads', entity_id: 'lead-1', payload_json: JSON.stringify({
    id: 'lead-1', clientId: 'client-child', primaryContactId: 'contact-1', source: 'EMAIL',
    receivedAt: '2026-10-01T12:00:00.000Z', requestedService: 'STATUTORY_AUDIT',
    periodStart: '2026-01-01', periodEnd: '2026-12-31', estimatedFeeMinor: 100000,
    status: 'QUALIFIED', lossReason: null, convertedEngagementId: null
  }) });
  const report = buildMigrationAuditReport(source, new Map(), APPLICATION_SCHEMA_VERSION, APPLICATION_SCHEMA_VERSION);
  const plan = buildMigrationApplyPlan(source, report, APPLICATION_SCHEMA_VERSION, '2026-10-08T10:00:00.000Z');
  assert.equal(plan.recordCount, 4);
  assert.ok(plan.sql.indexOf("SELECT 'contact-1'") < plan.sql.indexOf("SELECT 'lead-1'"), 'contact must exist before the lead FK is inserted');

  const database = createDatabase(source);
  try {
    database.exec('BEGIN');
    try {
      for (const statement of unstable_splitSqlQuery(plan.sql)) database.prepare(statement).run();
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    const lead = database.prepare(`SELECT id,client_id,primary_contact_id,source,received_at,requested_service,
      period_start,period_end,estimated_fee_minor,status,loss_reason,converted_engagement_id
      FROM leads WHERE workspace_id=? AND id='lead-1'`).get(source.workspace.id) as Record<string, unknown>;
    assert.deepEqual(JSON.parse(JSON.stringify(lead)), {
      id: 'lead-1', client_id: 'client-child', primary_contact_id: 'contact-1', source: 'EMAIL',
      received_at: '2026-10-01T12:00:00.000Z', requested_service: 'STATUTORY_AUDIT',
      period_start: '2026-01-01', period_end: '2026-12-31', estimated_fee_minor: 100000,
      status: 'QUALIFIED', loss_reason: null, converted_engagement_id: null
    });
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM state_transitions WHERE workspace_id=?").get(source.workspace.id)?.n, 0,
      'migration must not synthesize lifecycle transitions');
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM migration_id_map WHERE run_id=? AND source_kind='leads'").get(report.runId)?.n, 1);
    const auditRow = database.prepare(buildMigrationAuditSnapshotQuery(source.workspace.id)).get() as { snapshot_json: string };
    const after = JSON.parse(auditRow.snapshot_json) as MigrationAuditSnapshot;
    const reconciled = buildMigrationAuditReport(after, new Map(), APPLICATION_SCHEMA_VERSION, APPLICATION_SCHEMA_VERSION, report.runId);
    assert.equal(reconciled.validationStatus, 'VALIDATED');
    assert.ok(reconciled.fieldReconciliation.find(item => item.sourceKind === 'leads')?.fields.every(field => field.status === 'MATCHED'));
  } finally { database.close(); }
});

it('blocks a lost lead whose source does not preserve the required loss rationale', () => {
  const source = snapshot();
  source.entities.push({ entity_kind: 'leads', entity_id: 'lead-lost', payload_json: JSON.stringify({
    id: 'lead-lost', clientId: 'client-child', primaryContactId: 'contact-1', source: 'EMAIL',
    receivedAt: '2026-10-01T12:00:00.000Z', requestedService: 'STATUTORY_AUDIT',
    periodStart: '2026-01-01', periodEnd: '2026-12-31', estimatedFeeMinor: null,
    status: 'LOST', lossReason: null, convertedEngagementId: null
  }) });
  const report = buildMigrationAuditReport(source, new Map(), APPLICATION_SCHEMA_VERSION, APPLICATION_SCHEMA_VERSION);
  assert.throws(
    () => buildMigrationApplyPlan(source, report, APPLICATION_SCHEMA_VERSION, '2026-10-08T10:00:00.000Z'),
    /LOST_LEAD_REQUIRES_SOURCE_REASON/
  );
});

it('blocks leads with normalized dates or timestamps that would roll to another calendar day', () => {
  const source = snapshot();
  const payload = {
    id: 'lead-invalid-date', clientId: 'client-child', primaryContactId: 'contact-1', source: 'EMAIL',
    receivedAt: '2026-02-31T12:00:00.000Z', requestedService: 'STATUTORY_AUDIT',
    periodStart: '2026-01-01', periodEnd: '2026-12-31', estimatedFeeMinor: null,
    status: 'OPEN', lossReason: null, convertedEngagementId: null
  };
  source.entities.push({ entity_kind: 'leads', entity_id: payload.id, payload_json: JSON.stringify(payload) });
  const report = buildMigrationAuditReport(source, new Map(), APPLICATION_SCHEMA_VERSION, APPLICATION_SCHEMA_VERSION);
  assert.throws(
    () => buildMigrationApplyPlan(source, report, APPLICATION_SCHEMA_VERSION, '2026-10-08T10:00:00.000Z'),
    /SOURCE_FIELD_VALUE_NOT_MAPPABLE/
  );
});

it('migrates verified committed files with exact IDs, hashes, and legacy provenance in the same atomic batch', () => {
  const source = snapshot();
  const sha256 = 'b'.repeat(64);
  source.files.push({
    id: 'file-evidence-1', client_id: 'client-child', engagement_id: null, category: 'EVIDENCE',
    logical_record_type: 'finding', logical_record_id: 'finding-1', r2_key: 'workspaces/31/evidence/file-evidence-1',
    original_name: 'bank-confirmation.pdf', mime_type: 'application/pdf', size_bytes: 12, sha256,
    state: 'COMMITTED', immutable: 1, created_by_user_id: 'legacy-user-7', created_at: 1760000000, committed_at: 1760000010
  });
  const verifiedObjects = new Map([['file-evidence-1', { found: true, sizeBytes: 12, sha256 }]]);
  const report = buildMigrationAuditReport(source, verifiedObjects, APPLICATION_SCHEMA_VERSION, APPLICATION_SCHEMA_VERSION);
  const plan = buildMigrationApplyPlan(source, report, APPLICATION_SCHEMA_VERSION, '2026-10-08T10:00:00.000Z');
  const database = createDatabase(source);
  try {
    database.exec('BEGIN');
    try {
      for (const statement of unstable_splitSqlQuery(plan.sql)) database.prepare(statement).run();
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    const migrated = database.prepare(`SELECT id,client_id,object_key,purpose,state,sha256,legacy_created_by_user_id,
      legacy_logical_record_type,legacy_logical_record_id FROM file_versions WHERE workspace_id=? AND id=?`)
      .get(source.workspace.id, 'file-evidence-1') as Record<string, unknown>;
    assert.deepEqual(JSON.parse(JSON.stringify(migrated)), {
      id: 'file-evidence-1', client_id: 'client-child', object_key: 'workspaces/31/evidence/file-evidence-1',
      purpose: 'EVIDENCE', state: 'COMMITTED', sha256, legacy_created_by_user_id: 'legacy-user-7',
      legacy_logical_record_type: 'finding', legacy_logical_record_id: 'finding-1'
    });
    assert.equal(database.prepare("SELECT status FROM migration_runs WHERE id=?").get(report.runId)?.status, 'APPLIED');
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM migration_id_map WHERE run_id=? AND source_kind='file_objects' AND target_kind='file_versions'").get(report.runId)?.n, 1);

    const auditRow = database.prepare(buildMigrationAuditSnapshotQuery(source.workspace.id)).get() as { snapshot_json: string };
    const after = JSON.parse(auditRow.snapshot_json) as MigrationAuditSnapshot;
    const reconciled = buildMigrationAuditReport(after, verifiedObjects, APPLICATION_SCHEMA_VERSION, APPLICATION_SCHEMA_VERSION, report.runId);
    assert.equal(reconciled.validationStatus, 'VALIDATED');
    assert.ok(reconciled.fieldReconciliation.find(item => item.sourceKind === 'file_objects')?.fields.every(field => field.status === 'MATCHED'));
  } finally { database.close(); }
});

it('blocks file apply when its R2 bytes are missing or do not match the source hash', () => {
  const source = snapshot();
  source.files.push({
    id: 'file-missing', client_id: null, engagement_id: null, category: 'EVIDENCE', logical_record_type: null,
    logical_record_id: null, r2_key: 'workspaces/31/evidence/file-missing', original_name: 'evidence.pdf',
    mime_type: 'application/pdf', size_bytes: 12, sha256: 'c'.repeat(64), state: 'COMMITTED', immutable: 1,
    created_by_user_id: null, created_at: 1760000000, committed_at: 1760000010
  });
  const report = buildMigrationAuditReport(source, new Map(), APPLICATION_SCHEMA_VERSION, APPLICATION_SCHEMA_VERSION);
  assert.throws(() => buildMigrationApplyPlan(source, report, APPLICATION_SCHEMA_VERSION, '2026-10-08T10:00:00.000Z'), /SOURCE_FILE_BYTES_NOT_VERIFIED/);
});

it('requires the guarded schema and does not infer missing contact signatory data', () => {
  const source = snapshot();
  const contact = JSON.parse(source.entities[2].payload_json) as Record<string, unknown>;
  delete contact.isSignatory;
  source.entities[2].payload_json = JSON.stringify(contact);
  const report = buildMigrationAuditReport(source, new Map(), APPLICATION_SCHEMA_VERSION, 40);

  assert.throws(() => buildMigrationApplyPlan(source, report, 39, '2026-10-08T10:00:00.000Z'), /MIGRATION_APPLY_GUARDS_NOT_INSTALLED/);
  assert.throws(() => buildMigrationApplyPlan(source, report, APPLICATION_SCHEMA_VERSION, '2026-10-08T10:00:00.000Z'), /SOURCE_FIELD_VALUE_NOT_MAPPABLE/);
});
