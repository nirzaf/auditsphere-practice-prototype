import { buildNormalizedMigrationPlan, hashMigrationSourceSnapshot, type MigrationAuditReport, type MigrationAuditSnapshot } from './business-migration-audit-core.js';
import { APPLICATION_SCHEMA_VERSION } from '../worker/versions.js';

const TARGET_SCHEMA_VERSION = APPLICATION_SCHEMA_VERSION;
const SUPPORTED_ROOT_METADATA = new Set(['__manifest__', '__scalars__', '__settings__']);

const sqlText = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const sqlValue = (value: unknown): string => {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value === 'string') return sqlText(value);
  throw new Error('Migration plan contains a value that cannot be represented safely in SQL.');
};

export interface MigrationApplyPlan {
  sql: string;
  recordCount: number;
  sourceSha256: string;
}

/**
 * Build a deployment-only, atomic D1 apply batch for the reviewed client,
 * contact and committed-file mappings. Unsupported source data fails closed.
 */
export function buildMigrationApplyPlan(
  snapshot: MigrationAuditSnapshot,
  report: MigrationAuditReport,
  installedApplicationSchemaVersion: number,
  appliedAt: string
): MigrationApplyPlan {
  const plan = buildNormalizedMigrationPlan(snapshot);
  const blockers = [...plan.blockers];
  const addBlocker = (sourceKind: string, sourceId: string, code: string) => blockers.push({ sourceKind, sourceId, code });

  if (snapshot.workspace.schema_version >= TARGET_SCHEMA_VERSION) addBlocker('workspace', snapshot.workspace.id, 'SOURCE_SCHEMA_NOT_BELOW_MIGRATION_TARGET');
  if (installedApplicationSchemaVersion < APPLICATION_SCHEMA_VERSION) addBlocker('application', String(installedApplicationSchemaVersion), 'MIGRATION_APPLY_GUARDS_NOT_INSTALLED');
  if (report.targetSchemaVersion !== TARGET_SCHEMA_VERSION) addBlocker('application', String(report.targetSchemaVersion), 'AUDIT_REPORT_TARGET_SCHEMA_MISMATCH');
  if (report.installedApplicationSchemaVersion !== installedApplicationSchemaVersion) addBlocker('application', String(report.installedApplicationSchemaVersion), 'AUDIT_REPORT_APPLICATION_SCHEMA_MISMATCH');
  if (report.workspaceId !== snapshot.workspace.id || report.sourceSchemaVersion !== snapshot.workspace.schema_version) {
    addBlocker('workspace', snapshot.workspace.id, 'AUDIT_REPORT_DOES_NOT_MATCH_SOURCE_SNAPSHOT');
  }
  if (report.sourceSha256 !== hashMigrationSourceSnapshot(snapshot)) addBlocker('workspace', snapshot.workspace.id, 'AUDIT_REPORT_SOURCE_DIGEST_MISMATCH');
  if (report.missingFiles.length) addBlocker('file_objects', '*', 'SOURCE_FILE_BYTES_NOT_VERIFIED');
  for (const root of snapshot.rootDocuments) {
    if (!SUPPORTED_ROOT_METADATA.has(root.document_key)) addBlocker('ROOT_DOCUMENT', root.document_key, 'ROOT_DOCUMENT_MIGRATION_NOT_SUPPORTED');
  }
  if (snapshot.idMaps.length) addBlocker('migration_id_map', '*', 'WORKSPACE_ALREADY_HAS_ID_MAPPINGS');
  for (const row of snapshot.targetRows.filter(row => row.kind === 'clients' || row.kind === 'contacts' || row.kind === 'file_versions')) {
    addBlocker(`normalized:${row.kind}`, row.id, 'TARGET_ROW_ALREADY_EXISTS');
  }
  const sourceRecordCount = snapshot.entities.length + snapshot.files.length;
  if (sourceRecordCount === 0) addBlocker('workspace', snapshot.workspace.id, 'NO_SOURCE_RECORDS_TO_MIGRATE');
  if (plan.records.length !== sourceRecordCount) addBlocker('workspace', snapshot.workspace.id, 'MIGRATION_PLAN_ROW_COUNT_MISMATCH');

  const sourceClients = snapshot.entities.filter(entity => entity.entity_kind === 'clients');
  const clientCodes = new Set<string>();
  for (const record of plan.records.filter(record => record.targetKind === 'clients')) {
    const code = String(record.values.code ?? '').toLocaleLowerCase();
    if (clientCodes.has(code)) addBlocker('clients', record.sourceId, 'DUPLICATE_CLIENT_CODE');
    clientCodes.add(code);
  }
  const primaryContactByClient = new Set<string>();
  for (const record of plan.records.filter(record => record.targetKind === 'contacts' && record.values.active === 1 && record.values.is_primary === 1)) {
    const clientId = String(record.values.client_id ?? '');
    if (primaryContactByClient.has(clientId)) addBlocker('contacts', record.sourceId, 'MULTIPLE_ACTIVE_PRIMARY_CONTACTS');
    primaryContactByClient.add(clientId);
  }
  if (sourceClients.length !== plan.records.filter(record => record.targetKind === 'clients').length) {
    addBlocker('clients', '*', 'CLIENT_PLAN_ROW_COUNT_MISMATCH');
  }
  if (blockers.length) {
    const codes = [...new Set(blockers.map(blocker => blocker.code))].sort().join(', ');
    throw new Error(`Migration apply blocked: ${codes}. Run the read-only dry-run and reconcile source data first.`);
  }
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(appliedAt)) {
    throw new Error('Migration timestamp must be a UTC ISO timestamp.');
  }

  const workspaceId = snapshot.workspace.id;
  const sourceCount = sourceRecordCount;
  const runId = report.runId;
  const mappings = plan.records.map(record => ({
    id: crypto.randomUUID(), sourceKind: record.sourceKind, sourceId: record.sourceId,
    targetKind: record.targetKind, targetId: record.targetId
  }));
  const reconciliation = JSON.stringify({
    runId,
    sourceSha256: report.sourceSha256,
    sourceCount,
    targetCount: sourceCount,
    validationStatus: 'VALIDATED',
    applyProfile: 'clients-contacts-files-v2',
    preservedSourceSnapshot: true,
    unsupportedRowsCreated: 0
  });
  const rootSnapshotGuard = [
    `(SELECT COUNT(*) FROM workspace_root_documents WHERE workspace_id=${sqlText(workspaceId)})=${snapshot.rootDocuments.length}`,
    ...snapshot.rootDocuments.map(root => `EXISTS (SELECT 1 FROM workspace_root_documents WHERE workspace_id=${sqlText(workspaceId)} AND document_key=${sqlText(root.document_key)} AND payload_json=${sqlText(root.payload_json)})`)
  ].join(' AND ');
  const statements: string[] = [
    `INSERT INTO migration_runs(id,workspace_id,source_schema_version,target_schema_version,source_sha256,status,started_at,completed_at,source_count,target_count,reconciliation_json,error_code) SELECT ${sqlText(runId)},${sqlText(workspaceId)},${snapshot.workspace.schema_version},${TARGET_SCHEMA_VERSION},${sqlText(report.sourceSha256)},'VALIDATED',${sqlText(appliedAt)},NULL,${sourceCount},0,${sqlText(reconciliation)},NULL FROM workspaces w WHERE w.id=${sqlText(workspaceId)} AND w.schema_version=${snapshot.workspace.schema_version} AND w.data_mode=${sqlText(snapshot.workspace.data_mode)} AND ${rootSnapshotGuard}`
  ];

  for (const record of plan.records) {
    const source = snapshot.entities.find(entity => entity.entity_kind === record.sourceKind && entity.entity_id === record.sourceId);
    const sourceFile = snapshot.files.find(file => record.sourceKind === 'file_objects' && file.id === record.sourceId);
    if (!source && !sourceFile) throw new Error('Migration plan lost its source row; no SQL batch was produced.');
    const values: Record<string, unknown> = record.targetKind === 'clients'
      ? { ...record.values, workspace_id: workspaceId, version: 1, created_at: appliedAt, updated_at: appliedAt, created_by_actor_id: null, updated_by_actor_id: null }
      : record.targetKind === 'contacts'
        ? { ...record.values, workspace_id: workspaceId, version: 1, created_at: appliedAt, updated_at: appliedAt, created_by_actor_id: null, updated_by_actor_id: null }
        : { ...record.values, workspace_id: workspaceId, version: 1, folder_id: null, previous_version_id: null, updated_at: appliedAt, created_by_actor_id: null, updated_by_actor_id: null };
    const columns = Object.keys(values);
    const guardedSource = source
      ? `EXISTS (SELECT 1 FROM workspace_entities WHERE workspace_id=${sqlText(workspaceId)} AND entity_kind=${sqlText(record.sourceKind)} AND entity_id=${sqlText(record.sourceId)} AND payload_json=${sqlText(source.payload_json)} AND deleted_at IS NULL)`
      : `EXISTS (SELECT 1 FROM file_objects WHERE workspace_id=${sqlText(workspaceId)} AND id=${sqlText(sourceFile!.id)} AND client_id IS ${sqlValue(sourceFile!.client_id)} AND engagement_id IS ${sqlValue(sourceFile!.engagement_id)} AND category=${sqlText(sourceFile!.category)} AND logical_record_type IS ${sqlValue(sourceFile!.logical_record_type)} AND logical_record_id IS ${sqlValue(sourceFile!.logical_record_id)} AND r2_key=${sqlText(sourceFile!.r2_key)} AND original_name=${sqlText(sourceFile!.original_name)} AND mime_type=${sqlText(sourceFile!.mime_type)} AND size_bytes=${sqlValue(sourceFile!.size_bytes)} AND sha256 IS ${sqlValue(sourceFile!.sha256)} AND state=${sqlText(sourceFile!.state)} AND immutable=${sqlValue(sourceFile!.immutable)} AND created_by_user_id IS ${sqlValue(sourceFile!.created_by_user_id)} AND created_at=${sqlValue(sourceFile!.created_at)} AND committed_at IS ${sqlValue(sourceFile!.committed_at)} AND deleted_at IS NULL)`;
    statements.push(`INSERT INTO ${record.targetKind}(${columns.join(',')}) SELECT ${columns.map(column => sqlValue(values[column])).join(',')} WHERE ${guardedSource}`);
  }

  for (const mapping of mappings) {
    statements.push(`INSERT INTO migration_id_map(id,workspace_id,run_id,source_kind,source_id,target_kind,target_id) VALUES(${sqlText(mapping.id)},${sqlText(workspaceId)},${sqlText(runId)},${sqlText(mapping.sourceKind)},${sqlText(mapping.sourceId)},${sqlText(mapping.targetKind)},${sqlText(mapping.targetId)})`);
  }
  statements.push(`UPDATE migration_runs SET status='APPLIED',completed_at=${sqlText(appliedAt)},target_count=${sourceCount},reconciliation_json=${sqlText(reconciliation)} WHERE workspace_id=${sqlText(workspaceId)} AND id=${sqlText(runId)} AND status='VALIDATED'`);
  return { sql: `${statements.join(';\n')};\n`, recordCount: sourceCount, sourceSha256: report.sourceSha256 };
}
