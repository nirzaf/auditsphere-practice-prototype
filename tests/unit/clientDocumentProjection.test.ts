import assert from 'node:assert/strict';
import test from 'node:test';
import { projectClientDocuments, type ClientDocumentSourceRow } from '../../worker/clientDocumentProjection';

test('client document projection returns only issued-document fields', () => {
  const rows: ClientDocumentSourceRow[] = [
    { id: 'invoice-1', file_version_id: 'file-1', category: 'INVOICE', original_name: 'INV-1.pdf', issue_date: '2026-09-02',
      engagement_id: 'eng-1', engagement_code: 'AUD-2026', artifact_id: 'internal-artifact', tax_policy_version_id: 'tax-policy' },
    { id: 'draft-1', file_version_id: 'file-draft', category: 'DRAFT', original_name: 'draft.pdf', issue_date: '2026-09-03',
      engagement_id: 'eng-1', engagement_code: 'AUD-2026' }
  ];

  assert.deepEqual(projectClientDocuments(rows), [{
    id: 'invoice-1', fileVersionId: 'file-1', category: 'INVOICE', originalName: 'INV-1.pdf', issueDate: '2026-09-02',
    engagementId: 'eng-1', engagementCode: 'AUD-2026'
  }]);
});

test('holding letter blockers keep their original status and expose no source internals', () => {
  const rows: ClientDocumentSourceRow[] = [{
    id: 'holding-1', file_version_id: 'file-holding', category: 'HOLDING_LETTER', original_name: 'holding-letter.pdf', issue_date: '2026-08-20',
    engagement_id: 'eng-1', engagement_code: 'AUD-2026',
    blockers_json: JSON.stringify([{ id: 'confirmation-1', version: 3, type: 'BANK', status: 'RETURNED_UNVERIFIED', dueDate: '2026-08-18',
      sourceHash: 'private-source-hash', externalPartyName: 'Private external party', stalePins: true }])
  }];

  const [document] = projectClientDocuments(rows);
  assert.deepEqual(document, {
    id: 'holding-1', fileVersionId: 'file-holding', category: 'HOLDING_LETTER', originalName: 'holding-letter.pdf', issueDate: '2026-08-20',
    engagementId: 'eng-1', engagementCode: 'AUD-2026',
    blockers: [{ id: 'confirmation-1', type: 'BANK', status: 'RETURNED_UNVERIFIED', dueDate: '2026-08-18', stalePins: true }]
  });
  assert.equal(JSON.stringify(document).includes('sourceHash'), false);
  assert.equal(JSON.stringify(document).includes('externalPartyName'), false);
});

test('invalid source rows and malformed holding snapshots fail closed', () => {
  const rows: ClientDocumentSourceRow[] = [
    { id: 'broken', file_version_id: 'file-broken', category: 'RECEIPT', original_name: 'receipt.pdf', issue_date: null,
      engagement_id: 'eng-1', engagement_code: 'AUD-2026' },
    { id: 'holding-1', file_version_id: 'file-holding', category: 'HOLDING_LETTER', original_name: 'holding-letter.pdf', issue_date: '2026-08-20',
      engagement_id: 'eng-1', engagement_code: 'AUD-2026', blockers_json: '{not json' }
  ];

  assert.deepEqual(projectClientDocuments(rows), [{
    id: 'holding-1', fileVersionId: 'file-holding', category: 'HOLDING_LETTER', originalName: 'holding-letter.pdf', issueDate: '2026-08-20',
    engagementId: 'eng-1', engagementCode: 'AUD-2026', blockers: []
  }]);
});
