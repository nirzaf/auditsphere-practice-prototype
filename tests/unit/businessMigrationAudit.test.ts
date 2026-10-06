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
  assert.equal(first.blockers, 2);
  assert.deepEqual(first.reconciliationByTarget, [{ targetKind: 'clients', sourceRows: 1, mappedRows: 1, targetRows: 1, status: 'COUNTS_MATCHED' }]);
  assert.deepEqual(first.reconciliationIssues, [
    { sourceKind: 'clients', sourceId: 'client-1', code: 'TARGET_FIELD_RECONCILIATION_NOT_VERIFIED' },
    { sourceKind: 'clients', sourceId: 'client-1', code: 'TARGET_FIELDS_NOT_SNAPSHOTTED' }
  ]);
  assert.equal(first.sourceSha256, second.sourceSha256);
});

it('compares explicitly mapped legacy client fields without exposing values', () => {
  const snapshot = baseSnapshot();
  snapshot.entities[0].payload_json = JSON.stringify({
    id: 'client-1', code: 'C-1', name: 'Example Trading WLL', tradingName: 'Example',
    entityRole: 'Standalone', parentClientId: null, registrationNumber: 'CR-1', taxId: null,
    industry: 'Trading', address: 'Doha', jurisdiction: 'Qatar', status: 'Active'
  });
  snapshot.targetFields = [{
    kind: 'clients', id: 'client-1', fields: {
      code: 'C-1', legal_name: 'Example Trading WLL', trading_name: 'Example', entity_type: 'STANDALONE',
      parent_client_id: null, commercial_registration: 'CR-1', tax_id: null, industry: 'Trading',
      address: 'Doha', country_code: 'QA', active: 1
    }
  }];
  const report = buildMigrationAuditReport(snapshot, new Map(), 31, 27, '00000000-0000-4000-8000-000000000007');

  assert.equal(report.validationStatus, 'VALIDATED');
  assert.equal(report.fieldReconciliation.length, 1);
  assert.equal(report.fieldReconciliation[0].fields.length, 11);
  assert.ok(report.fieldReconciliation[0].fields.every(field => field.status === 'MATCHED'));
  assert.notEqual(report.fieldReconciliation[0].fields[1].sourceSha256, 'Example Trading WLL');
});

it('reconciles normalized contact fields and their mapped client reference', () => {
  const snapshot = baseSnapshot();
  snapshot.entities[0].payload_json = JSON.stringify({ id: 'client-1', name: 'Synthetic client' });
  snapshot.entities.push({
    entity_kind: 'contacts',
    entity_id: 'contact-1',
    payload_json: JSON.stringify({
      id: 'contact-1', clientId: 'client-1', name: 'Synthetic Contact', email: 'CONTACT@EXAMPLE.TEST',
      phone: null, title: 'Finance Director', contactRole: 'CFO/Finance Director', isPrimary: true,
      active: true, effectiveFrom: '2026-01-01', effectiveTo: null
    })
  });
  snapshot.idMaps.push({ source_kind: 'contacts', source_id: 'contact-1', target_kind: 'contacts', target_id: 'contact-1' });
  snapshot.targetRows.push({ kind: 'contacts', id: 'contact-1' });
  snapshot.targetFields = [{ kind: 'contacts', id: 'contact-1', fields: {
    client_id: 'client-1', full_name: 'Synthetic Contact', email: 'contact@example.test', phone: null,
    title: 'Finance Director', role: 'CFO_FINANCE_DIRECTOR', is_primary: 1, active: 1,
    effective_from: '2026-01-01', effective_to: null
  } }];
  const report = buildMigrationAuditReport(snapshot, new Map(), 31, 27, '00000000-0000-4000-8000-000000000009');

  const contact = report.fieldReconciliation.find(row => row.sourceKind === 'contacts');
  assert.ok(contact);
  assert.equal(contact.fields.length, 10);
  assert.ok(contact.fields.every(field => field.status === 'MATCHED'));
  assert.equal(JSON.stringify(contact).includes('contact@example.test'), false);
});

it('blocks a mapped client field mismatch and identifies the field using hashes only', () => {
  const snapshot = baseSnapshot();
  snapshot.entities[0].payload_json = JSON.stringify({ id: 'client-1', code: 'C-1', name: 'Source Name' });
  snapshot.targetFields = [{ kind: 'clients', id: 'client-1', fields: { code: 'C-1', legal_name: 'Different Name' } }];
  const report = buildMigrationAuditReport(snapshot, new Map(), 31, 27, '00000000-0000-4000-8000-000000000008');

  assert.equal(report.validationStatus, 'BLOCKED');
  assert.ok(report.reconciliationIssues.some(issue => issue.code === 'TARGET_FIELD_MISMATCH'));
  const name = report.fieldReconciliation[0].fields.find(field => field.sourceField === 'name');
  assert.equal(name?.status, 'MISMATCHED');
  assert.ok(name?.sourceSha256 && name?.targetSha256 && name.sourceSha256 !== name.targetSha256);
  assert.equal(JSON.stringify(report).includes('Source Name'), false);
  assert.equal(JSON.stringify(report).includes('Different Name'), false);
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
