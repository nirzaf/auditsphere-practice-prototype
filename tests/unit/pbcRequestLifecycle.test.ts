// VP-023 unit: PBC request edit/reassignment/cancellation lifecycle.
// Edits and cancellation retain identity, attribution and prior submissions;
// cancellation is terminal and never deletes shared files or history.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { filterPbcRequests, getOutstandingPbcRequestCount } from '../../src/services/pbcRequestFilters.js';

describe('PBC request filters (VP-023-E02)', () => {
  const requests = [
    { id: 'P-OVERDUE', title: 'Overdue bank file', category: 'Bank', status: 'Requested', due: '2026-09-22', owner: 'Omar Nasser', contributor: 'Rami Nasser', version: 1 },
    { id: 'P-TODAY', title: 'Today payroll file', category: 'Payroll', status: 'Received', due: '2026-09-23', owner: 'Omar Nasser', contributor: 'Amal Nasser', version: 1 },
    { id: 'P-UPCOMING', title: 'Upcoming register', category: 'Assets', status: 'Needs clarification', due: '2026-09-24', owner: 'Omar Nasser', contributor: 'Amal Nasser', version: 1 },
    { id: 'P-REVIEW', title: 'Reviewed statement', category: 'Bank', status: 'Under review', due: '2026-09-25', owner: 'Omar Nasser', contributor: 'Rami Nasser', version: 1 },
    { id: 'P-DRAFT', title: 'Draft evidence', category: 'Assets', status: 'Draft', due: '2026-09-20', owner: 'Omar Nasser', contributor: 'Rami Nasser', version: 1 },
    { id: 'P-ACCEPTED', title: 'Accepted evidence', category: 'Bank', status: 'Accepted', due: '2026-09-20', owner: 'Omar Nasser', contributor: 'Amal Nasser', version: 1 },
    { id: 'P-CANCELLED', title: 'Cancelled evidence', category: 'Assets', status: 'Cancelled', due: '2026-09-23', owner: 'Omar Nasser', contributor: 'Amal Nasser', version: 1 }
  ] as const;
  const allFilters = { status: 'All' as const, due: 'All dates' as const, recipient: '', search: '' };

  it('reconciles every status, due bucket, recipient, text query and combined filters to the same result set', () => {
    assert.deepEqual(filterPbcRequests(requests, allFilters, '2026-09-23').map(item => item.id), requests.map(item => item.id));
    for (const request of requests) {
      const result = filterPbcRequests(requests, { ...allFilters, status: request.status }, '2026-09-23');
      assert.deepEqual(result.map(item => item.id), [request.id], `${request.status} filter returns only matching rows`);
    }
    assert.deepEqual(filterPbcRequests(requests, { ...allFilters, due: 'Overdue' }, '2026-09-23').map(item => item.id), ['P-OVERDUE']);
    assert.deepEqual(filterPbcRequests(requests, { ...allFilters, due: 'Due today' }, '2026-09-23').map(item => item.id), ['P-TODAY']);
    assert.deepEqual(filterPbcRequests(requests, { ...allFilters, due: 'Upcoming' }, '2026-09-23').map(item => item.id), ['P-UPCOMING', 'P-REVIEW']);
    assert.deepEqual(filterPbcRequests(requests, { ...allFilters, recipient: 'Amal Nasser' }, '2026-09-23').map(item => item.id), ['P-TODAY', 'P-UPCOMING', 'P-ACCEPTED', 'P-CANCELLED']);
    assert.deepEqual(filterPbcRequests(requests, { ...allFilters, search: 'PAYROLL' }, '2026-09-23').map(item => item.id), ['P-TODAY']);
    assert.deepEqual(filterPbcRequests(requests, { ...allFilters, due: 'Upcoming', recipient: 'Rami Nasser', search: 'bank' }, '2026-09-23').map(item => item.id), ['P-REVIEW']);
    assert.equal(getOutstandingPbcRequestCount(requests), 4, 'only requested, received, under-review and clarification items count as outstanding');
  });
});

describe('PBC request lifecycle (VP-023)', () => {
  beforeEach(() => {
    (prototypeStore as any).state = createInitialState(); // Isolated legacy PBC record contract; target activation is tested separately.
    prototypeStore.setPersona('manager');
    prototypeStore.setSelectedEngagement('ENG-26001');
  });

  it('edits title, due date and recipient with a recorded reason and an internal thread entry', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-01', title: 'Year-end bank statements', category: 'Bank evidence', status: 'Draft', due: '2026-09-30', owner: 'client@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    const request = (prototypeStore as any).state.engagements.find((e: any) => e.id === 'ENG-26001').pbc.find((r: any) => r.id === 'PBC-TEST-01');
    request.status = 'Needs clarification';
    request.version = 3;
    request.sharedFiles = [{ id: 'FILE-PBC-TEST-01', name: 'prior-response.pdf', version: 2, size: 123, sha: 'a'.repeat(64), uploadedBy: 'Rami Nasser', uploadedAt: '2026-09-20T10:00:00.000Z', source: 'Client portal' }];
    request.acceptanceHistory = [{ version: 2, acceptedBy: 'Layla Rahman', acceptedByUserId: 'manager', acceptedAt: '2026-09-21T10:00:00.000Z' }];
    const priorFiles = structuredClone(request.sharedFiles);
    const priorAcceptances = structuredClone(request.acceptanceHistory);
    prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-01', { title: 'Year-end bank statements and reconciliations', due: '2026-10-05', contributor: 'Amal Nasser' }, 'Client asked to widen the scope and extend the date.');
    const updated = prototypeStore.getSnapshot().engagements.find(e => e.id === 'ENG-26001')!.pbc.find(r => r.id === 'PBC-TEST-01')!;
    assert.equal(updated.title, 'Year-end bank statements and reconciliations');
    assert.equal(updated.due, '2026-10-05');
    assert.equal(updated.owner, 'client@example.test', 'request owner is not overwritten by client-recipient reassignment');
    assert.equal(updated.contributor, 'Amal Nasser', 'the portal-authorized client contributor is actually reassigned');
    assert.deepEqual(updated.sharedFiles, priorFiles, 'reassignment preserves prior uploaded response metadata');
    assert.deepEqual(updated.acceptanceHistory, priorAcceptances, 'reassignment preserves prior acceptance decisions');
    assert.equal(updated.version, 3, 'metadata reassignment does not rewrite the submitted evidence revision');
    const entry = updated.thread!.at(-1)!;
    assert.ok(entry.text.includes('Request edited') && entry.text.includes('Client asked to widen the scope'));
    assert.equal(entry.clientVisible, false, 'edit notes are internal');
  });

  it('rejects a recipient who is inactive or assigned to another client', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-05', title: 'Restricted recipient test', category: 'Bank evidence', status: 'Draft', due: '2026-09-30', owner: 'client@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-05', { contributor: 'Aisha Saleh' }, 'Try another client contact'), /active contact assigned to this client/i);
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-05', { contributor: 'Former Contact' }, 'Try an inactive recipient'), /active contact assigned to this client/i);
  });

  it('rejects unauthorized initial recipients and rechecks an active recipient before presentation atomically', () => {
    const engagement = prototypeStore.getSnapshot().engagements.find(item => item.id === 'ENG-26001')!;
    const before = structuredClone(engagement.pbc);
    assert.throws(() => prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-UNAUTHORIZED', title: 'Foreign recipient', category: 'Bank', status: 'Draft', due: '2026-09-30', owner: 'Layla Rahman', contributor: 'Aisha Saleh', version: 1 }), /active contact assigned to this client/i);
    assert.deepEqual(engagement.pbc, before, 'unauthorized draft recipient creates no partial request');

    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-STALE-RECIPIENT', title: 'Recipient deactivation', category: 'Bank', status: 'Draft', due: '2026-09-30', owner: 'Layla Rahman', contributor: 'Rami Nasser', version: 1 });
    const rami = (prototypeStore as any).state.contacts.find((contact: any) => contact.clientId === 'CL-001' && contact.name === 'Rami Nasser')!;
    rami.active = false;
    const beforePresent = structuredClone(engagement.pbc.find(item => item.id === 'PBC-TEST-STALE-RECIPIENT'));
    assert.throws(() => prototypeStore.presentPbcRequest('ENG-26001', 'PBC-TEST-STALE-RECIPIENT'), /active contact assigned to this client/i);
    assert.deepEqual(engagement.pbc.find(item => item.id === 'PBC-TEST-STALE-RECIPIENT'), beforePresent, 'deactivated-recipient presentation does not change the draft');
  });

  it('rejects presentation when required request context is missing', () => {
    const state = createInitialState();
    state.currentRole = 'manager'; state.currentUserId = 'manager'; state.currentPerson = 'Layla Rahman'; state.selectedEngagement = 'ENG-26001';
    state.engagements.find(engagement => engagement.id === 'ENG-26001')!.pbc.unshift({ id: 'PBC-TEST-06', title: 'Context check', category: 'Bank evidence', status: 'Draft', due: '2026-09-30', owner: '', contributor: 'Rami Nasser', version: 1 });
    (prototypeStore as any).state = state; // Historical record contract.
    const engagement = prototypeStore.getSnapshot().engagements.find(item => item.id === 'ENG-26001')!;
    const requestBefore = structuredClone(engagement.pbc.find(item => item.id === 'PBC-TEST-06'));
    const eventsBefore = prototypeStore.getSnapshot().events.length;
    assert.throws(() => prototypeStore.presentPbcRequest('ENG-26001', 'PBC-TEST-06'), /title, owner, and client recipient are required before presentation/i);
    assert.deepEqual(engagement.pbc.find(item => item.id === 'PBC-TEST-06'), requestBefore, 'missing presentation context preserves the exact draft');
    assert.equal(prototypeStore.getSnapshot().events.length, eventsBefore, 'failed presentation adds no activity event');
  });

  it('rejects edits without a reason, no-op edits, and edits to cancelled requests', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-02', title: 'Loan confirmations', category: 'Bank evidence', status: 'Draft', due: '2026-09-30', owner: 'client@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-02', { due: '2026-10-01' }, '   '), /reason is required/i);
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-02', { title: 'Loan confirmations' }, 'no field changed'), /No changes/i);
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-02', { due: 'not-a-date' }, 'bad date'), /valid due date/i);
    prototypeStore.cancelPbcRequest('ENG-26001', 'PBC-TEST-02', 'Duplicate of an existing request.');
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-02', { due: '2026-10-01' }, 'late edit'), /cancelled/i);
  });

  it('records client replies in the shared client-visible request timeline', () => {
    prototypeStore.setPersona('client_finance');
    prototypeStore.replyToPbcRequest('ENG-26001', 'PBC-03', 'We will upload the approved fixed-asset register tomorrow.');
    const request = prototypeStore.getSnapshot().engagements.find(e => e.id === 'ENG-26001')!.pbc.find(p => p.id === 'PBC-03')!;
    const reply = request.thread!.at(-1)!;
    assert.equal(reply.kind, 'email');
    assert.equal(reply.role, 'client_finance');
    assert.equal(reply.clientVisible, true);
    assert.match(reply.text, /approved fixed-asset register/);
    assert.ok(Date.parse(reply.time));
    prototypeStore.setPersona('manager');
    assert.throws(() => prototypeStore.replyToPbcRequest('ENG-26001', 'PBC-03', 'Staff must not impersonate a client reply.'), /cannot reply to a client PBC request/i);
  });

  it('cancels with a reason, retains shared files and history, and refuses double cancellation', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-03', title: 'Inventory listing', category: 'Operations', status: 'Draft', due: '2026-09-30', owner: 'finance@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    prototypeStore.presentPbcRequest('ENG-26001', 'PBC-TEST-03');
    prototypeStore.setPersona('client_finance');
    prototypeStore.uploadPbcResponse('ENG-26001', 'PBC-TEST-03', { name: 'inventory.csv', size: 120, sha256: 'a'.repeat(64), type: 'text/csv' });
    prototypeStore.setPersona('manager');
    prototypeStore.cancelPbcRequest('ENG-26001', 'PBC-TEST-03', 'Duplicate of an existing request.');
    const cancelled = prototypeStore.getSnapshot().engagements.find(e => e.id === 'ENG-26001')!.pbc.find(r => r.id === 'PBC-TEST-03')!;
    assert.equal(cancelled.status, 'Cancelled');
    assert.equal(cancelled.sharedFiles!.length, 1, 'shared files are retained');
    assert.ok(cancelled.thread!.some(t => t.text.includes('Request cancelled')));
    assert.throws(() => prototypeStore.cancelPbcRequest('ENG-26001', 'PBC-TEST-03', 'again'), /already cancelled/i);
  });

  it('links a post-acceptance PBC replacement to the prior document and reopens dependent review', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-07', title: 'Signed bank statement', category: 'Bank evidence', status: 'Draft', due: '2026-09-30', owner: 'Rami Nasser', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    prototypeStore.presentPbcRequest('ENG-26001', 'PBC-TEST-07');
    prototypeStore.setPersona('client_finance');
    prototypeStore.uploadPbcResponse('ENG-26001', 'PBC-TEST-07', { id: 'DOC-PBC-FIRST', name: 'bank-statement-v1.pdf', size: 120, sha256: 'a'.repeat(64), type: 'application/pdf' });

    prototypeStore.setPersona('manager');
    const state = (prototypeStore as any).state;
    const request = state.engagements.find((engagement: any) => engagement.id === 'ENG-26001').pbc.find((item: any) => item.id === 'PBC-TEST-07');
    const procedure = state.auditPrograms.flatMap((program: any) => program.procedures).find((item: any) => item.id === 'PRC-01');
    const workpaper = state.engagements.find((engagement: any) => engagement.id === 'ENG-26001').workpapers.find((item: any) => item.id === 'WP-A1');
    state.evidenceCatalogue.push({ id: 'EVD-PBC-TEST', title: 'Signed bank statement', documentId: 'DOC-PBC-FIRST', version: 1, sha: 'a'.repeat(64), adequacyStatus: 'Adequate', receivedDate: '2026-09-26', owner: 'Rami Nasser', linkedProcedures: [] });
    prototypeStore.linkEvidenceProcedure('EVD-PBC-TEST', 'PRC-01');
    procedure.status = 'Cleared';
    procedure.reviewedByUserId = state.currentUserId;
    procedure.reviewedAt = '2026-09-26T09:00:00.000Z';
    workpaper.evidenceRefs = ['DOC-PBC-FIRST'];
    workpaper.status = 'Submitted';
    workpaper.submittedBy = 'Adam Khan';
    workpaper.submittedVersion = workpaper.version;

    prototypeStore.acceptPbcResponse('ENG-26001', 'PBC-TEST-07');
    prototypeStore.requestPbcClarification('ENG-26001', 'PBC-TEST-07', 'Please provide the signed final page.');
    prototypeStore.setPersona('client_finance');
    prototypeStore.uploadPbcResponse('ENG-26001', 'PBC-TEST-07', { id: 'DOC-PBC-SECOND', name: 'bank-statement-v2.pdf', size: 140, sha256: 'b'.repeat(64), type: 'application/pdf' });

    const replacement = state.documents.find((document: any) => document.id === 'DOC-PBC-SECOND');
    const replacementEvidence = state.evidenceCatalogue.find((item: any) => item.documentId === replacement.id);
    assert.equal(replacement.supersedesDocumentId, 'DOC-PBC-FIRST');
    assert.equal(replacement.version, 2);
    assert.equal(request.status, 'Received', 'replacement is received but needs a new independent acceptance');
    assert.equal(request.acceptanceHistory.at(-1).version, 1, 'the prior acceptance remains in history');
    assert.equal(replacementEvidence.adequacyStatus, 'Pending verification');
    assert.equal(procedure.evidenceReassessmentRequired, true);
    assert.equal(procedure.status, 'In progress');
    assert.equal(workpaper.status, 'Changes required');
    assert.equal(workpaper.clearance, null);
  });

  it('requires an in-scope staff role to edit or cancel', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-04', title: 'Fixed asset register', category: 'Accounting', status: 'Draft', due: '2026-09-30', owner: 'client@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    prototypeStore.setPersona('client_finance');
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-04', { due: '2026-10-01' }, 'client edit'), /cannot edit/i);
    assert.throws(() => prototypeStore.cancelPbcRequest('ENG-26001', 'PBC-TEST-04', 'client cancel'), /cannot cancel/i);
  });
});
