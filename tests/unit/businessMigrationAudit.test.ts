import { it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMigrationAuditReport, type MigrationAuditSnapshot } from '../../tools/business-migration-audit-core.js';

const baseSnapshot = (): MigrationAuditSnapshot => ({
  workspace: { id: '00000000-0000-4000-8000-000000000001', schema_version: 30, data_mode: 'TEST' },
  entities: [{ entity_kind: 'clients', entity_id: 'client-1', payload_json: JSON.stringify({ id: 'client-1', name: 'Synthetic client' }) }],
  rootDocuments: [{ document_key: '__manifest__', payload_json: JSON.stringify({ schemaVersion: 30 }) }],
  files: [],
  idMaps: [{ source_kind: 'clients', source_id: 'client-1', target_kind: 'clients', target_id: 'client-1' }],
  targetRows: [{ kind: 'clients', id: 'client-1' }],
  targetMoneyTotals: [{ kind: 'invoices', row_count: '0', amount_minor: '0' }]
});

it('reconciles row counts but blocks cutover until mapped target fields are verified', () => {
  const snapshot = baseSnapshot();
  const first = buildMigrationAuditReport(snapshot, new Map(), 31, 27, '00000000-0000-4000-8000-000000000002');
  const second = buildMigrationAuditReport({ ...snapshot, entities: [...snapshot.entities].reverse() }, new Map(), 31, 27, '00000000-0000-4000-8000-000000000003');

  assert.equal(first.status, 'DRY_RUN');
  assert.equal(first.validationStatus, 'BLOCKED');
  assert.equal(first.businessRecordsChanged, false);
  assert.equal(first.auditMetadataRecorded, false);
  assert.equal(first.sourceCount, 1);
  assert.equal(first.targetCount, 1);
  assert.equal(first.blockers, 1);
  assert.deepEqual(first.reconciliationByTarget, [{ targetKind: 'clients', sourceRows: 1, mappedRows: 1, targetRows: 1, status: 'COUNTS_MATCHED' }]);
  assert.deepEqual(first.reconciliationIssues, [{ sourceKind: 'clients', sourceId: 'client-1', code: 'TARGET_FIELD_RECONCILIATION_NOT_VERIFIED' }]);
  assert.equal(first.sourceSha256, second.sourceSha256);
});

it('blocks unmapped, orphaned and missing or altered R2 source records', () => {
  const snapshot = baseSnapshot();
  snapshot.entities.push({
    entity_kind: 'engagements',
    entity_id: 'engagement-1',
    payload_json: JSON.stringify({ id: 'engagement-1', clientId: 'client-missing', fileVersionId: 'file-version-missing' })
  });
  snapshot.files.push({ id: 'file-1', r2_key: 'workspaces/test/file-1', original_name: 'evidence.pdf', size_bytes: 4, sha256: 'a'.repeat(64), state: 'COMMITTED' });
  const report = buildMigrationAuditReport(snapshot, new Map([['file-1', { found: true, sizeBytes: 4, sha256: 'b'.repeat(64) }]]), 31, 27, '00000000-0000-4000-8000-000000000004');

  assert.equal(report.validationStatus, 'BLOCKED');
  assert.ok(report.unmappedRows.some(row => row.sourceKind === 'engagements' && row.sourceId === 'engagement-1'));
  assert.ok(report.unmappedRows.some(row => row.sourceKind === 'file_objects' && row.sourceId === 'file-1'));
  assert.ok(report.orphanRows.some(row => row.referenceId === 'client-missing'));
  assert.ok(report.orphanRows.some(row => row.referenceId === 'file-version-missing'));
  assert.ok(report.missingFiles.some(file => file.sourceId === 'file-1' && file.reason === 'R2_SHA256_MISMATCH'));
  assert.ok(report.blockers >= 5);
});

it('reconciles legacy invoice totals against normalized QAR minor-unit totals', () => {
  const snapshot = baseSnapshot();
  snapshot.entities.push({
    entity_kind: 'invoices',
    entity_id: 'invoice-1',
    payload_json: JSON.stringify({ id: 'invoice-1', clientId: 'client-1', amount: 100, taxTotal: 2, currency: 'QAR' })
  });
  snapshot.idMaps.push({ source_kind: 'invoices', source_id: 'invoice-1', target_kind: 'invoices', target_id: 'invoice-1' });
  snapshot.targetRows.push({ kind: 'invoices', id: 'invoice-1' });
  snapshot.targetMoneyTotals = [{ kind: 'invoices', row_count: '1', amount_minor: '101' }];
  const report = buildMigrationAuditReport(snapshot, new Map(), 31, 27, '00000000-0000-4000-8000-000000000006');

  assert.equal(report.moneyTotals.reconciliation[0]?.status, 'MISMATCHED');
  assert.ok(report.orphanRows.some(row => row.field === 'moneyTotal' && row.reason.includes('source=102 target=101')));
  assert.equal(report.validationStatus, 'BLOCKED');
});

it('refuses a source schema newer than its migration target', () => {
  const snapshot = baseSnapshot();
  snapshot.workspace.schema_version = 31;
  const report = buildMigrationAuditReport(snapshot, new Map(), 31, 27, '00000000-0000-4000-8000-000000000005');
  assert.equal(report.validationStatus, 'BLOCKED');
  assert.equal(report.auditMetadataRecorded, false);
  assert.ok(report.unmappedRows.some(row => row.reason === 'SOURCE_SCHEMA_NOT_SUPPORTED_BY_MIGRATION_TARGET'));
});
