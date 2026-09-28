// VP-063 unit: guards + store commands (AT-11/AT-12/AT-18/AT-24/AT-28/AT-31/AT-32/AT-47/AT-54).
// Same-person, scope, hierarchy, allocation and stale-revision rules share one
// implementation between UI actions and tests.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { visibleClientIds, visibleEngagementIds, requireEngagementScope, canOpenRoute, canReadSearchRecord, GuardError, hasConsolidationGroupScope, hasSelectedEngagementScope, eligibleAuditRiskOwners, requireIndependentActor } from '../../src/services/guards.js';
import { validateFixtures, migratePersistedState } from '../../src/services/migrations.js';
import type { PrototypeState } from '../../src/types/index.js';
import { seedPackageDefinition, seedManagementAcknowledgement } from './packageFixture.js';

let state: PrototypeState;
beforeEach(() => { state = createInitialState(); });

function setPersona(state: PrototypeState, name: string) {
  const matches = state.users.filter(u => u.name === name);
  const user = matches.find(u => u.id === state.currentUserId) || matches.find(u => u.role === state.currentRole) || matches[0];
  state.currentUserId = user?.id || '';
  state.currentPerson = name;
  if (user) state.currentRole = user.role;
}
function addAmiraManagerPersona(state: PrototypeState) {
  const user = state.users.find(u => u.id === 'relationship')!;
  state.users.push({ ...user, id: 'amira-manager', role: 'manager', label: 'Engagement manager' });
  state.roleGrants.push({ userId: 'amira-manager', role: 'manager', scopeKind: 'Global' });
  state.currentUserId = 'amira-manager';
  state.currentPerson = user.name;
  state.currentRole = 'manager';
}

describe('scope guards (AT-18)', () => {
  it('rejects a restored selected engagement outside the current grant', () => {
    state.currentUserId = 'group-user';
    state.currentRole = 'manager';
    state.currentPerson = 'Mona Khalil';
    assert.equal(state.currentUserId, 'group-user');
    state.selectedEngagement = 'ENG-26001';
    assert.equal(hasSelectedEngagementScope(state), true);
    state.selectedEngagement = 'ENG-26002';
    assert.equal(hasSelectedEngagementScope(state), false);
    state.selectedEngagement = '';
    assert.equal(hasSelectedEngagementScope(state), false, 'missing context is not an authorized selection');
  });

  it('global manager sees all; narrow group user sees one engagement only', () => {
    setPersona(state, 'Layla Rahman');
    assert.equal(visibleEngagementIds(state), 'ALL');
    setPersona(state, 'Mona Khalil');
    const engs = visibleEngagementIds(state);
    assert.deepEqual(engs, ['ENG-26001']);
    const clients = visibleClientIds(state, 'group-user');
    assert.deepEqual(clients, ['CL-001']);
  });

  it('sibling engagement ENG-26003 is hidden from the narrow ENG-26001 grant', () => {
    setPersona(state, 'Mona Khalil');
    const engs = visibleEngagementIds(state) as string[];
    assert.equal(engs.includes('ENG-26003'), false);
  });

  it('does not apply a grant issued to a different role for the same identity', () => {
    state.currentUserId = 'manager';
    state.currentRole = 'manager';
    state.currentPerson = 'Layla Rahman';
    state.selectedEngagement = 'ENG-26001';
    state.roleGrants = state.roleGrants.filter(grant => grant.userId !== 'manager');
    state.roleGrants.push({ userId: 'manager', role: 'preparer', scopeKind: 'Engagement', scopeId: 'ENG-26001' });
    assert.deepEqual(visibleEngagementIds(state), [], 'the manager cannot inherit a preparer grant bound to the same identity');
    assert.equal(hasSelectedEngagementScope(state), false, 'the mismatched grant does not authorize its restored engagement');
  });

  it('client identity with two grants sees both entities', () => {
    const clients = visibleClientIds(state, 'client_admin');
    assert.deepEqual([...(clients as string[])].sort(), ['CL-001', 'CL-003']);
  });
});

describe('client contact nomination (VP-025)', () => {
  beforeEach(() => prototypeStore.importStateJSON(JSON.stringify(createInitialState())));

  it('records a client administrator nomination for staff review without creating an identity, contact or access grant', () => {
    prototypeStore.setPersona('client_admin');
    const before = prototypeStore.getSnapshot();
    const nominationId = prototypeStore.nominateClientContact({ clientId: 'CL-001', name: 'Noura Example', email: 'Noura@example.test', reason: 'Supports the year-end bank reconciliation.' });
    const after = prototypeStore.getSnapshot();
    const nomination = after.clientContactNominations!.find(item => item.id === nominationId)!;
    assert.equal(nomination.email, 'noura@example.test');
    assert.equal(nomination.status, 'Pending review');
    assert.equal(nomination.nominatedByUserId, 'client_admin');
    assert.equal(after.users.length, before.users.length);
    assert.equal(after.contacts.length, before.contacts.length);
    assert.deepEqual(after.roleGrants, before.roleGrants);
    assert.equal(after.clientContactNominations!.length, 1);
    prototypeStore.setPersona('manager');
    prototypeStore.reviewClientContactNomination(nominationId, 'Identity and authority reviewed; add separately if approved.');
    const reviewed = prototypeStore.getSnapshot();
    assert.equal(reviewed.clientContactNominations!.find(item => item.id === nominationId)!.status, 'Reviewed');
    assert.equal(reviewed.clientContactNominations!.find(item => item.id === nominationId)!.reviewedByUserId, 'manager');
    assert.equal(reviewed.users.length, before.users.length, 'staff review does not create an identity');
    assert.equal(reviewed.contacts.length, before.contacts.length, 'staff review does not silently add a client contact');
    assert.deepEqual(reviewed.roleGrants, before.roleGrants, 'staff review does not grant access');
  });

  it('denies contributor, management approver, out-of-scope and duplicate pending nominations', () => {
    const input = { clientId: 'CL-001', name: 'Noura Example', email: 'noura@example.test', reason: 'Year-end support.' };
    for (const persona of ['client_finance', 'client']) {
      prototypeStore.setPersona(persona);
      assert.throws(() => prototypeStore.nominateClientContact(input), /cannot nominate/i, `${persona} cannot nominate contacts`);
    }
    prototypeStore.setPersona('client_admin');
    assert.throws(() => prototypeStore.nominateClientContact({ ...input, clientId: 'CL-002' }), /scope|permitted|access/i, 'the admin cannot nominate for a client outside their grants');
    const nominationId = prototypeStore.nominateClientContact(input);
    assert.throws(() => prototypeStore.nominateClientContact({ ...input, email: 'NOURA@example.test' }), /already awaiting review/i);
    assert.throws(() => prototypeStore.nominateClientContact({ ...input, email: 'not-an-email' }), /valid contact email/i);
    prototypeStore.setPersona('client_admin');
    assert.throws(() => prototypeStore.reviewClientContactNomination(nominationId, 'Not a reviewer.'), /cannot review/i, 'client administrator cannot mark their own nomination reviewed');
    prototypeStore.setPersona('manager');
    assert.throws(() => prototypeStore.reviewClientContactNomination(nominationId, '  '), /review note is required/i);
  });
});

describe('prototype superuser access', () => {
  it('opens every route, sees every client, engagement and supported consolidation group', () => {
    setPersona(state, 'AuditSphere Superuser');
    state.roleGrants = state.roleGrants.filter(grant => grant.userId !== 'superuser');
    const routes = ['overview','clients','client-detail','acquisition','proposals','engagements','jobs','job-templates','documents','communications','my-time','budgets','billing','receivables','accounting-setup','trial-balance','gl-transactions','account-mappings','adjustments','reconciliations','financial-statements','financial-packages','consolidation','onboarding','audit-planning','audit-risks','audit-fieldwork','sampling','audit','evidence','findings','reviews','approvals','quality','delivery','records','reports','search','administration','m365-setup','portal','services','role-guide','module-guide','requirements'] as const;
    assert.ok(routes.every(route => canOpenRoute('superuser', route)), 'every declared product route is available');
    assert.deepEqual(visibleClientIds(state), 'ALL');
    assert.deepEqual(visibleEngagementIds(state), 'ALL');
    assert.ok(state.consolidationGroups.every(group => hasConsolidationGroupScope(state, group.id)));
  });

  it('uses centralized command access, records the explicit SoD override, and preserves business validation', () => {
    (prototypeStore as any).state = state;
    prototypeStore.setPersona('superuser');
    const proposal = state.proposals.find(item => item.id === 'PROP-001')!;
    proposal.state = 'Internal review';
    proposal.preparedBy = 'AuditSphere Superuser';
    prototypeStore.reviewProposal(proposal.id, true);
    assert.equal(proposal.state, 'Approved to send');
    assert.match(state.events.find(event => event.ref === 'SUPERUSER-OVERRIDE')?.text || '', /Prototype Superuser Override.*commercially approve this proposal/);
    assert.throws(() => prototypeStore.addReceipt({ ...state.receipts[0], id: 'RCPT-SUPERUSER-INVALID', receiptNumber: 'RCPT-SUPERUSER-INVALID', date: '2026-02-30' }), /valid date/i, 'authorization does not bypass accounting validation');
  });

  it('leaves ordinary role restrictions and client portal projection unchanged', () => {
    assert.equal(canOpenRoute('billing', 'audit-risks'), false);
    assert.equal(canOpenRoute('preparer', 'approvals'), false);
    setPersona(state, 'Mona Khalil');
    assert.deepEqual(visibleEngagementIds(state), ['ENG-26001']);
    setPersona(state, 'Omar Nasser');
    assert.equal(canOpenRoute('client', 'portal'), true);
    assert.equal(canOpenRoute('client', 'audit-risks'), false);
    assert.equal(visibleEngagementIds(state).includes('ENG-26002'), false);
  });
});

describe('global search access projection (F01)', () => {
  it('requires the record engagement as well as the shared client grant', () => {
    setPersona(state, 'Mona Khalil');
    const siblingInvoice = { route: 'billing' as const, clientId: 'CL-001', engagementId: 'ENG-26003', requiresEngagement: true };
    const permittedInvoice = { ...siblingInvoice, engagementId: 'ENG-26001' };
    assert.equal(visibleClientIds(state).includes('CL-001'), true, 'the single engagement grant still exposes the client summary');
    assert.equal(canReadSearchRecord(state, siblingInvoice), false, 'same-client sibling engagement metadata is denied');
    assert.equal(canReadSearchRecord(state, permittedInvoice), true, 'the granted engagement invoice is readable by the manager');
    assert.equal(canReadSearchRecord(state, { ...permittedInvoice, engagementId: 'ENG-26002' }), false, 'engagement ownership must match the stated client');
  });

  it('hides billing search from preparers and only permits explicitly client-wide communications', () => {
    setPersona(state, 'Adam Khan');
    const invoice = { route: 'billing' as const, clientId: 'CL-001', engagementId: 'ENG-26001', requiresEngagement: true };
    assert.equal(canReadSearchRecord(state, invoice), false, 'a wide engagement grant does not grant the billing route');

    setPersona(state, 'Mona Khalil');
    assert.equal(canReadSearchRecord(state, { route: 'communications', clientId: 'CL-001', clientWide: true }), true);
    assert.equal(canReadSearchRecord(state, { route: 'communications', clientId: 'CL-001', requiresEngagement: true }), false, 'missing engagement ownership does not become a client-wide permission');
    const communication = { route: 'communications' as const, clientId: 'CL-001', engagementId: 'ENG-26003', requiresEngagement: true };
    assert.equal(canReadSearchRecord(state, communication), false, 'a stale or revoked sibling-scope click is rejected against current state');
  });
});

describe('safe job cancellation (VP-013)', () => {
  it('requires an active, in-scope staff owner when creating or editing a job', () => {
    state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const source = state.jobs[0];
    const candidate = { ...source, id: 'JOB-OWNER-SCOPE', title: 'Scoped owner check' };

    assert.throws(() => prototypeStore.addJob({ ...candidate, owner: 'Unknown Person' }), /active staff user with job access/);
    assert.throws(() => prototypeStore.addJob({ ...candidate, owner: 'Omar Nasser' }), /active staff user with job access/);
    assert.throws(() => prototypeStore.updateJob({ ...source, owner: 'Unknown Person' }), /active staff user with job access/);

    const limitedUser = state.users.find(user => user.id === 'group-user')!;
    const foreignEngagement = state.engagements.find(engagement => engagement.id !== 'ENG-26001')!;
    assert.throws(() => prototypeStore.addJob({
      ...candidate,
      clientId: foreignEngagement.client,
      engagementId: foreignEngagement.id,
      owner: limitedUser.name
    }), /must have access to this engagement/);

    assert.equal(state.jobs.some(job => job.id === candidate.id), false, 'invalid owners do not create jobs');
    assert.equal(state.jobs[0].owner, source.owner, 'invalid edits leave the existing owner unchanged');
  });

  it('blocks completion until all required tasks finish and does not trigger professional or billing actions', () => {
    state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const existingJob = state.jobs[0];
    const job = {
      ...existingJob,
      id: 'JOB-COMPLETION-GATE',
      title: 'Completion gate fixture',
      status: 'Not started' as const
    };
    prototypeStore.addJob(job);
    const engagement = state.engagements.find(item => item.id === job.engagementId)!;
    const task = {
      id: 'TASK-JOB-COMPLETE-GATE',
      jobId: job.id,
      title: 'Required completion gate',
      assignee: 'Layla Rahman',
      status: 'Not started' as const,
      order: 99
    };
    prototypeStore.addTask(task);
    const approvals = structuredClone(engagement.approvals);
    const releases = structuredClone(engagement.releases);
    const invoiceCount = state.invoices.length;

    assert.throws(() => prototypeStore.updateJob({ ...job, status: 'Completed' }), /required tasks are unfinished/);
    assert.equal(state.jobs.find(item => item.id === job.id)!.status, job.status);

    prototypeStore.updateTask({ ...task, status: 'Completed' });
    prototypeStore.updateJob({ ...job, status: 'Completed' });

    assert.equal(state.jobs.find(item => item.id === job.id)!.status, 'Completed');
    assert.deepEqual(engagement.approvals, approvals, 'job completion does not approve engagement evidence');
    assert.deepEqual(engagement.releases, releases, 'job completion does not release a package');
    assert.equal(state.invoices.length, invoiceCount, 'job completion does not issue an invoice');
  });

  it('requires a reason, retains linked work and prevents reopening', () => {
    state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    state.currentRole = 'manager';
    const job = state.jobs[0];
    const tasks = structuredClone(state.jobTasks.filter(task => task.jobId === job.id));
    assert.throws(() => prototypeStore.updateJob({ ...job, status: 'Cancelled' }), /requires a reason/);
    prototypeStore.updateJob({ ...job, status: 'Cancelled', cancellationReason: 'Client cancelled the scope.' });
    const cancelled = state.jobs.find(item => item.id === job.id)!;
    assert.equal(cancelled.cancelledByUserId, state.currentUserId);
    assert.ok(cancelled.cancelledAt);
    assert.equal(cancelled.cancellationReason, 'Client cancelled the scope.');
    assert.deepEqual(state.jobTasks.filter(task => task.jobId === job.id), tasks);
    assert.ok(state.events.some(event => event.ref === job.id && event.text.includes('Client cancelled the scope.')));
    assert.throws(() => prototypeStore.updateJob({ ...cancelled, status: 'In progress' }), /cannot be reopened/);
    const retainedTask = tasks[0];
    assert.throws(() => prototypeStore.addTask({ id: 'TASK-AFTER-CANCEL', jobId: job.id, title: 'Late work', assignee: 'Layla Rahman', status: 'Not started', order: 99 }), /cannot be added/);
    assert.throws(() => prototypeStore.updateTask({ ...retainedTask, status: 'Completed' }), /retained and cannot be changed/);
    assert.throws(() => prototypeStore.reassignTask(retainedTask.id, 'Sara Malik', 'Capacity balancing'), /retained and cannot be reassigned/);
    assert.throws(() => prototypeStore.addTimeEntry({ id: 'TIME-AFTER-CANCEL', person: 'Layla Rahman', clientId: job.clientId, engagementId: job.engagementId, jobId: job.id, taskId: retainedTask.id, taskTitle: retainedTask.title, date: state.asOfDate, durationMinutes: 60, billable: true, activity: 'Testing', status: 'Draft' }), /active job/);
  });
});

describe('accounting setup guards (AT-34)', () => {
  it('VP-034-AC01/AC02/AC03: versions setup, pins engagement context, and rejects invalid dimensions, hierarchy and period ranges', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const current = (prototypeStore as any).state as PrototypeState;
    setPersona(current, 'Layla Rahman');
    const engagement = current.engagements[0];
    const client = current.clients.find(item => item.id === engagement.client)!;
    const profile = structuredClone(client.accountingProfile!);
    profile.legalEntityName = `${client.name} Holdings`;
    profile.dimensions = [{ id: 'dept', name: 'Department', values: ['Sales'], active: true }];
    profile.accounts.push({ code: '9900', name: 'New account', type: 'asset', posting: true, active: true });
    current.accountMappingRevisions ||= [];
    const approvedMappings = new Map<string, any>();
    for (const related of current.engagements.filter(item => item.client === client.id)) {
      const revision = Math.max(0, ...current.accountMappingRevisions.filter(mapping => mapping.engagementId === related.id).map(mapping => mapping.revision)) + 1;
      const mapping = { engagementId: related.id, revision, mappings: [{ accountCode: related.rows[0].code, targets: [{ statementLine: 'Cash and cash equivalents', percentage: 100 }] }], status: 'Approved' as const, preparedBy: 'preparer', reviewedBy: 'reviewer' };
      current.accountMappingRevisions.push(mapping);
      approvedMappings.set(related.id, mapping);
      related.mappingApproved = true;
    }
    const book = profile.periodBooks.find(item => item.id === engagement.accountingPeriodBookId)!;
    const previousGeneration = engagement.generation;
    engagement.packageRevision = 1;
    engagement.packageHistory = [{ revision: 1, generation: previousGeneration, sourceVersion: engagement.sourceVersion, mappingRevision: 0 }] as any;
    current.statementSetRevisions = [{ id: 'SETUP-STATEMENT', engagementId: engagement.id, status: 'Reviewed' } as any];
    assert.throws(() => prototypeStore.saveAccountingProfile(client.id, { ...profile, accounts: [...profile.accounts, { ...profile.accounts[0] }] }, engagement.id, book.id), /uniquely coded/);
    assert.throws(() => prototypeStore.saveAccountingProfile(client.id, { ...profile, periodBooks: profile.periodBooks.map(item => item.id === book.id ? { ...item, endDate: '2025-12-31' } : item) }, engagement.id, book.id), /valid ranges/);
    assert.throws(() => prototypeStore.saveAccountingProfile(client.id, { ...profile, accounts: profile.accounts.map(item => item.code === '9900' ? { ...item, parentCode: '9900' } : item) }, engagement.id, book.id), /Invalid chart parent|cycle/);
    assert.throws(() => prototypeStore.saveAccountingProfile(client.id, { ...profile, accounts: profile.accounts.map(item => item.code === '9900' ? { ...item, parentCode: profile.accounts[0].code } : item) }, engagement.id, book.id), /Invalid chart parent/);
    const foreignEngagement = current.engagements.find(item => item.client !== client.id)!;
    assert.throws(() => prototypeStore.saveAccountingProfile(client.id, { ...profile, periodBooks: profile.periodBooks.map(item => item.id === book.id ? { ...item, ownerEngagementId: foreignEngagement.id } : item) }, engagement.id, book.id), /owner engagement for this client/);
    assert.throws(() => prototypeStore.saveAccountingProfile(client.id, { ...profile, periodBooks: profile.periodBooks.map(item => item.id === book.id ? { ...item, status: 'Closed' as const } : item) }, engagement.id, book.id), /open period book/);
    assert.throws(() => prototypeStore.saveAccountingProfile(client.id, { ...profile, dimensions: [{ id: 'dept', name: 'Department', values: ['Sales', ' sales '], active: true }] }, engagement.id, book.id), /unique dimension values/);
    assert.throws(() => prototypeStore.saveAccountingProfile(client.id, { ...profile, dimensions: [{ id: 'dept', name: 'Department', values: ['Sales'], active: true }, { id: ' dept ', name: 'Cost centre', values: ['North'], active: true }] }, engagement.id, book.id), /unique identifiers\/names/);
    assert.throws(() => prototypeStore.saveAccountingProfile(client.id, { ...profile, dimensions: [{ id: 'dept', name: 'Department', values: ['Sales'], active: true }, { id: 'location', name: 'Department', values: ['North'], active: true }] }, engagement.id, book.id), /unique identifiers\/names/);
    assert.throws(() => prototypeStore.saveAccountingProfile(client.id, { ...profile, dimensions: [{ id: 'dept', name: 'Unsupported dimension' as any, values: ['Sales'], active: true }] }, engagement.id, book.id), /supported dimensions/);
    const revision = prototypeStore.saveAccountingProfile(client.id, profile, engagement.id, book.id);
    assert.equal(revision, 2);
    assert.equal(client.accountingProfile!.history.at(-1)?.revision, 1);
    assert.equal(engagement.accountingProfileRevision, 2);
    assert.equal(engagement.accountingChartRevision, 2);
    for (const [relatedId, priorMapping] of approvedMappings) {
      const related = current.engagements.find(item => item.id === relatedId)!;
      const revisions = current.accountMappingRevisions.filter(mapping => mapping.engagementId === relatedId).sort((a, b) => a.revision - b.revision);
      assert.equal(priorMapping.status, 'Approved', 'the prior reviewed mapping snapshot remains approved');
      assert.equal(revisions.at(-2)?.status, 'Approved', 'setup rework does not overwrite the approved predecessor');
      assert.equal(revisions.at(-1)?.status, 'Draft', 'the affected mapping is carried forward as a new draft revision');
      assert.deepEqual(revisions.at(-1)?.mappings, priorMapping.mappings, 'the rework draft starts from the exact prior mapping content');
      assert.equal(related.mappingApproved, false, 'the engagement cannot treat the mapping as current before re-review');
    }
    assert.equal(engagement.generation, previousGeneration + 1);
    assert.equal(engagement.packageHistory[0].generation, previousGeneration, 'the existing package remains pinned to its prior generation');
    assert.equal(current.statementSetRevisions[0].status, 'Stale', 'setup changes stale dependent statement output');
    const before = engagement.sourceVersion;
    assert.throws(() => prototypeStore.updateTrialBalanceRows(engagement.id, [{ ...engagement.rows[0], code: '8888' }], { fileName: 'bad.csv', format: 'CSV', sha256: 'b'.repeat(64), mapping: { code: 0, name: 1, debit: 2, credit: 3, signed: 2, convention: 'signed-net' } }), /active posting accounts/);
    assert.equal(engagement.sourceVersion, before);
    const priorRows = structuredClone(engagement.rows);
    assert.throws(() => prototypeStore.updateTrialBalanceRows(engagement.id, [{ ...engagement.rows[0], dimensions: { dept: 'Unknown' } }], { fileName: 'unknown-dimension.csv', format: 'CSV', sha256: 'c'.repeat(64), mapping: { code: 0, name: 1, debit: 2, credit: 3, signed: 2, convention: 'signed-net', dimension: { id: 'dept', index: 4 } } }), /dimension values/);
    assert.equal(engagement.sourceVersion, before);
    assert.deepEqual(engagement.rows, priorRows, 'invalid dimension values leave the accepted trial balance unchanged');
    client.accountingProfile!.periodBooks.find(item => item.id === book.id)!.status = 'Closed';
    assert.throws(() => prototypeStore.updateTrialBalanceRows(engagement.id, priorRows, { fileName: 'closed-book.csv', format: 'CSV', sha256: 'd'.repeat(64), mapping: { code: 0, name: 1, debit: 2, credit: 3, signed: 2, convention: 'signed-net' } }), /open period book/);
    assert.equal(engagement.sourceVersion, before, 'closed-book import leaves the prior source revision intact');
    (prototypeStore as any).isSessionOnly = false;
    assert.throws(() => prototypeStore.importGeneralLedgerSource(engagement.id, { fileName: 'closed-book.csv', format: 'CSV', sha256: 'e'.repeat(64), openingBalances: {}, transactions: [] }), /open accounting period book/);
  });
});

describe('dimension-only accounting setup rework (VP-034-AC03)', () => {
  it('preserves approved mapping snapshots and creates rework drafts for same-client engagements', () => {
    (prototypeStore as any).state = state;
    (prototypeStore as any).isSessionOnly = true;
    setPersona(state, 'Layla Rahman');
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const client = state.clients.find(item => item.id === engagement.client)!;
    const profile = structuredClone(client.accountingProfile!);
    const dimension = profile.dimensions[0] || { id: 'dept', name: 'Department' as const, values: [], active: true };
    profile.dimensions = [{ ...dimension, values: [...dimension.values, 'VP034-new-value'] }];
    state.accountMappingRevisions ||= [];
    const priorMappings = new Map<string, any>();
    state.statementSetRevisions = [];
    for (const related of state.engagements.filter(item => item.client === client.id)) {
      const history = state.accountMappingRevisions.filter(mapping => mapping.engagementId === related.id);
      const revision = Math.max(0, ...history.map(mapping => mapping.revision)) + 1;
      const approved = { engagementId: related.id, revision, mappings: [{ accountCode: related.rows[0].code, targets: [{ statementLine: 'Cash and cash equivalents', percentage: 100 }] }], status: 'Approved' as const, preparedBy: 'preparer', reviewedBy: 'reviewer' };
      state.accountMappingRevisions.push(approved);
      priorMappings.set(related.id, approved);
      related.mappingApproved = true;
      state.statementSetRevisions.push({ id: `VP034-DIM-${related.id}`, engagementId: related.id, status: 'Reviewed' } as any);
    }
    const previousChartRevision = profile.chartRevision;
    const book = profile.periodBooks.find(item => item.ownerEngagementId === engagement.id)!;

    prototypeStore.saveAccountingProfile(client.id, profile, engagement.id, book.id);

    assert.equal(client.accountingProfile!.chartRevision, previousChartRevision, 'a dimension-only change does not rewrite the chart revision');
    for (const [engagementId, approved] of priorMappings) {
      const related = state.engagements.find(item => item.id === engagementId)!;
      const revisions = state.accountMappingRevisions.filter(mapping => mapping.engagementId === engagementId).sort((a, b) => a.revision - b.revision);
      assert.equal(approved.status, 'Approved', 'the approved predecessor remains unchanged');
      assert.equal(revisions.at(-2)?.status, 'Approved');
      assert.equal(revisions.at(-1)?.status, 'Draft', 'each affected engagement gets a new mapping revision for rework');
      assert.deepEqual(revisions.at(-1)?.mappings, approved.mappings, 'the new draft retains the exact approved mapping content');
      assert.equal(related.mappingApproved, false);
      assert.equal(state.statementSetRevisions.find(item => item.id === `VP034-DIM-${engagementId}`)?.status, 'Stale');
    }
  });
});

describe('reconciliation schedules (VP-039)', () => {
  it('VP-039-AC04: keeps a valid USD reconciliation in USD without combining or converting QAR balances', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const usdState = createInitialState();
    const engagement = usdState.engagements.find(item => item.id === 'ENG-26001')!;
    const client = usdState.clients.find(item => item.id === engagement.client)!;
    engagement.currency = 'USD';
    client.accountingProfile!.baseCurrency = 'USD';
    setPersona(usdState, 'Layla Rahman');
    (prototypeStore as any).state = usdState;
    const sourceBalance = engagement.rows.find(row => row.code === '1000')!.balance;
    const scheduleId = prototypeStore.saveReconciliationSchedule(engagement.id, {
      name: 'USD-only reconciliation', ref: 'REC-USD-ONLY', accountCode: '1000', status: 'Draft', evidence: 'DOC-002',
      asOfDate: '2026-09-23', currency: 'USD', sourceVersion: engagement.sourceVersion, statementBalance: sourceBalance - 100,
      items: [{ id: 'RI-USD-ONLY', date: '2026-09-23', description: 'USD timing item', amount: 100, type: 'Timing item', currency: 'USD' }]
    });
    const saved = engagement.reconciliations.find(item => item.id === scheduleId)!;
    assert.equal(saved.currency, 'USD');
    assert.equal(saved.statementBalance, sourceBalance - 100);
    assert.equal(saved.items?.[0].amount, 100, 'the schedule retains its original amount and never converts or adds a QAR balance');
  });

  it('VP-039-AC02/AC03/AC04: validates residuals and scope, preserves reviewed history, and stales on source change', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = state;
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const account = engagement.rows.find(row => row.code === '1000')!;
    state.currentUserId = 'manager'; state.currentRole = 'manager'; state.currentPerson = 'Layla Rahman';
    const input = { name: 'VP-039 schedule', ref: 'REC-VP039', accountCode: account.code, status: 'Draft' as const, evidence: 'DOC-002', asOfDate: state.asOfDate, sourceVersion: engagement.sourceVersion, statementBalance: account.balance, items: [] };
    const book = state.clients.find(client => client.id === engagement.client)!.accountingProfile!.periodBooks.find(item => item.id === engagement.accountingPeriodBookId)!;
    const schedulesBeforeInvalidSaves = structuredClone(engagement.reconciliations);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, asOfDate: '2026-02-30' }), /valid account and an as-of date/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, engagementId: 'ENG-26003' } as any), /valid account and an as-of date/, 'a caller cannot silently rebind a schedule to another engagement');
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, asOfDate: '2025-12-31' }), /within the selected engagement period book/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, asOfDate: '2027-01-01' }), /within the selected engagement period book/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, asOfDate: '2026-01-01', items: [{ id: 'RI-BEFORE-ASOF', date: '2026-01-02', description: 'After as-of date', amount: 1, type: 'Timing item' }] }), /dated in-scope items/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, items: [{ id: 'RI-FUTURE', date: '2099-01-01', description: 'Out of period', amount: 1, type: 'Timing item' }] }), /dated in-scope items/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, asOfDate: book.startDate, items: [{ id: 'RI-BEFORE-PERIOD', date: '2025-12-31', description: 'Before period', amount: 1, type: 'Timing item' }] }), /selected period book/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, items: [{ id: 'RI-IMPOSSIBLE', date: '2026-02-30', description: 'Impossible date', amount: 1, type: 'Timing item' }] }), /dated in-scope items/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, items: [{ id: 'RI-USD', date: state.asOfDate, description: 'Wrong currency', amount: 1, type: 'Timing item', currency: 'USD' }] }), /engagement currency/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, currency: 'USD' }), /engagement currency/, 'an explicitly mismatched schedule currency cannot be silently normalized to the engagement currency');
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, currency: '' }), /engagement currency/, 'an explicitly blank currency is not silently normalized');
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, statementBalance: 1.001 }), /finite cent-accurate balances/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, items: [{ id: 'RI-NAN', date: state.asOfDate, description: 'Non-finite amount', amount: Number.NaN, type: 'Timing item' }] }), /finite balances and complete/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, items: [{ id: 'RI-SUBCENT', date: state.asOfDate, description: 'Sub-cent amount', amount: 1.001, type: 'Timing item' }] }), /finite balances and complete/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, items: [{ id: 'RI-BAD-TYPE', date: state.asOfDate, description: 'Unsupported item type', amount: 1, type: 'Other' }] } as any), /dated in-scope items within the selected period book/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, items: [{ id: 5, date: state.asOfDate, description: 'Malformed identifier', amount: 1, type: 'Timing item' }] } as any), /unique identifiers/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, items: [{ id: 'RI-DUP', date: state.asOfDate, description: 'Duplicate item', amount: 1, type: 'Timing item' }, { id: 'RI-DUP', date: state.asOfDate, description: 'Duplicate item', amount: 2, type: 'Timing item' }] }), /complete, dated in-scope items/);
    assert.deepEqual(engagement.reconciliations, schedulesBeforeInvalidSaves, 'invalid date, currency and amount combinations do not partially persist a schedule');
    for (const boundary of [book.startDate, book.endDate]) {
      const boundaryId = prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, ref: `REC-${boundary}`, asOfDate: boundary, items: [{ id: `RI-${boundary}`, date: boundary, description: `Valid boundary ${boundary}`, amount: 0.01, type: 'Timing item' }] });
      assert.equal(engagement.reconciliations.find(item => item.id === boundaryId)?.asOfDate, boundary, `period boundary ${boundary} is valid`);
    }
    const id = prototypeStore.saveReconciliationSchedule(engagement.id, input);
    let schedule = engagement.reconciliations.find(item => item.id === id)!;
    assert.equal(schedule.glBalance, account.balance);
    assert.equal(schedule.status, 'Draft');
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /same person cannot review their own work/);
    state.currentUserId = 'reviewer'; state.currentRole = 'reviewer'; state.currentPerson = 'Sara Malik';
    schedule.evidence = 'DOC-OUT-OF-SCOPE';
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /in-scope evidence/);
    const foreignEvidence = { ...structuredClone(state.documents.find(document => document.id === 'DOC-002')!), id: 'DOC-VP039-FOREIGN', clientId: 'CL-002', engagementId: engagement.id };
    state.documents.push(foreignEvidence);
    schedule.evidence = foreignEvidence.id;
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /in-scope evidence/, 'evidence owned by another client cannot satisfy the schedule header');
    const siblingEngagementEvidence = { ...structuredClone(state.documents.find(document => document.id === 'DOC-002')!), id: 'DOC-VP039-SIBLING-ENG', clientId: engagement.client, engagementId: 'ENG-26003' };
    state.documents.push(siblingEngagementEvidence);
    schedule.evidence = siblingEngagementEvidence.id;
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /in-scope evidence/, 'same-client evidence pinned to a sibling engagement cannot satisfy the schedule header');
    schedule.evidence = 'DOC-002';
    schedule.items = [{ id: 'RI-NO-EVIDENCE', date: state.asOfDate, description: 'Unexplained timing item', amount: 0, type: 'Timing item' }];
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /Every reconciliation reference must resolve to in-scope evidence/);
    schedule.items = [];
    schedule.statementBalance = account.balance - 10;
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /residual .* blocks approval/);
    schedule.statementBalance = account.balance;
    schedule.items = [{ id: 'RI-CORR', date: state.asOfDate, description: 'Proposed correction', amount: 10, type: 'Proposed correction', evidenceDoc: 'DOC-OUT-OF-SCOPE' }];
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /in-scope evidence/);
    schedule.items[0].evidenceDoc = 'DOC-002';
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /proposed corrections must link/);
    const linkedJournal = state.adjustmentJournals.find(journal => journal.engagementId === engagement.id);
    assert.ok(linkedJournal, 'fixture provides an engagement-scoped reporting journal');
    schedule.items = [{ id: 'RI-LINKED-CORR', date: state.asOfDate, description: 'Linked proposed correction', amount: 10, type: 'Proposed correction', evidenceDoc: 'DOC-002', journalId: linkedJournal.id }];
    schedule.statementBalance = account.balance - 10;
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /residual .* blocks approval/, 'a correctly linked proposed correction still cannot conceal the timing residual');
    assert.equal(schedule.status, 'Draft', 'failed approval leaves the linked-correction schedule in Draft');
    schedule.statementBalance = account.balance;
    schedule.items = [{ id: 'RI-FOREIGN-EVIDENCE', date: state.asOfDate, description: 'Foreign support', amount: 1, type: 'Timing item', evidenceDoc: foreignEvidence.id }];
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /Every reconciliation reference must resolve to in-scope evidence/, 'item evidence must resolve to the same client and engagement scope');
    schedule.items[0].evidenceDoc = siblingEngagementEvidence.id;
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /Every reconciliation reference must resolve to in-scope evidence/, 'item evidence cannot cross into a sibling engagement');
    state.documents = state.documents.filter(document => ![foreignEvidence.id, siblingEngagementEvidence.id].includes(document.id));
    schedule.items = [];
    prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Returned', 'Clarify statement date and scope');
    assert.equal(schedule.status, 'Returned');
    assert.equal(schedule.reviewNote, 'Clarify statement date and scope');
    state.currentUserId = 'manager'; state.currentRole = 'manager'; state.currentPerson = 'Layla Rahman';
    prototypeStore.saveReconciliationSchedule(engagement.id, { ...schedule, asOfDate: '2026-09-22' });
    schedule = engagement.reconciliations.find(item => item.id === id)!;
    assert.equal(schedule.revision, 2);
    assert.equal(schedule.history?.[0].status, 'Returned');
    assert.equal(schedule.history?.[0].reviewNote, 'Clarify statement date and scope');
    state.currentUserId = 'reviewer'; state.currentRole = 'reviewer'; state.currentPerson = 'Sara Malik';
    prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved');
    assert.equal(schedule.status, 'Approved');
    state.currentUserId = 'manager'; state.currentRole = 'manager'; state.currentPerson = 'Layla Rahman';
    const replacement = prototypeStore.replaceDocumentRevision('DOC-002', { name: 'VP-039 bank statement v2.pdf', size: 10, sha256: 'a'.repeat(64) });
    assert.equal(schedule.status, 'Stale');
    prototypeStore.saveReconciliationSchedule(engagement.id, { ...schedule, statementBalance: account.balance, evidence: replacement.id });
    let current = engagement.reconciliations.find(item => item.id === id)!;
    assert.equal(current.status, 'Draft');
    assert.equal(current.history?.some(item => item.status === 'Approved'), true);
    assert.equal(current.evidence, replacement.id);
    const offsetRow = engagement.rows.find(row => row.code !== account.code)!;
    prototypeStore.updateTrialBalanceRows(engagement.id, engagement.rows.map(row => ({ ...row, balance: row.code === account.code ? row.balance + 1 : row.code === offsetRow.code ? row.balance - 1 : row.balance })));
    current = engagement.reconciliations.find(item => item.id === id)!;
    assert.equal(current.status, 'Stale');
    assert.equal(current.history?.at(-1)?.status, 'Draft');
  });
});

describe('fixture integrity (AT-02/AT-54)', () => {
  it('seed fixtures pass integrity with no broken references', () => {
    const issues = validateFixtures(state);
    assert.deepEqual(issues, []);
  });

  it('rejects inline binary payloads in persisted state', () => {
    (state as any).notes = 'data:image/png;base64,iVBORw0KGgo=';
    const issues = validateFixtures(state);
    assert.equal(issues.some(i => i.code === 'PERSISTENCE_BINARY'), true);
  });

  it('rejects broken references, invalid dates, real user emails and inconsistent control totals', () => {
    const brokenReference = structuredClone(state);
    brokenReference.engagements[0].client = 'CL-MISSING';
    assert.ok(validateFixtures(brokenReference).some(issue => issue.code === 'FK_ENGAGEMENT_CLIENT'));

    const badDate = structuredClone(state);
    badDate.asOfDate = '2026-02-30';
    assert.ok(validateFixtures(badDate).some(issue => issue.code === 'FIXTURE_DATE'));

    const realEmail = structuredClone(state);
    realEmail.users[0].email = 'person@example.com';
    assert.ok(validateFixtures(realEmail).some(issue => issue.code === 'FIXTURE_PII'));

    const unbalanced = structuredClone(state);
    unbalanced.engagements[0].rows[0].balance += 1;
    assert.ok(validateFixtures(unbalanced).some(issue => issue.code === 'MONEY_TB_IMBALANCE'));
  });

  it('rejects reversed accounting period dates', () => {
    const invalid = structuredClone(state);
    const book = invalid.clients[0].accountingProfile!.periodBooks[0];
    book.startDate = '2027-01-01';
    book.endDate = '2026-12-31';
    assert.ok(validateFixtures(invalid).some(issue => issue.code === 'FIXTURE_DATE_ORDER'));
  });

  it('migrates legacy payloads deterministically and preserves history', () => {
    const legacy = { schema: 2, engagements: state.engagements, asOfDate: '2026-09-23' };
    const { state: migrated, migratedFrom, warnings } = migratePersistedState(legacy, createInitialState());
    assert.equal(migratedFrom, 2);
    assert.equal(migrated.engagements.length > 0, true);
    assert.equal(warnings.length > 0, true);
    assert.equal(migrated.schema, 29);
  });
  it('adds proposal catalogue and historical period/fee metadata when upgrading pre-v25 state', () => {
    const legacy = structuredClone(createInitialState()) as any;
    legacy.schema = 24;
    delete legacy.proposalServices;
    delete legacy.proposalTemplates;
    delete legacy.proposalServiceHistory;
    delete legacy.proposalTemplateHistory;
    const proposal = legacy.proposals[0];
    delete proposal.period;
    for (const item of proposal.items) { delete item.period; delete item.dependencies; delete item.rate; delete item.quantity; }
    const { state: migrated } = migratePersistedState(legacy, createInitialState());
    assert.ok(migrated.proposalServices?.length);
    assert.ok(migrated.proposalTemplates?.length);
    assert.equal(proposal.period, 'Historical period not recorded');
    assert.equal(proposal.items[0].quantity, 1);
    assert.equal(proposal.items[0].rate, proposal.items[0].amount);
    assert.equal(proposal.items[0].period, 'Historical period not recorded');
    assert.equal(proposal.items[0].dependencies, 'Not specified in this historical proposal.');
  });
  it('keeps prior acceptance decisions as history but removes unsupported active authority', () => {
    const legacy = createInitialState() as any;
    legacy.schema = 12;
    const engagement = legacy.engagements[0];
    engagement.acceptance = true;
    legacy.acceptanceCases = [{
      id: 'ACC-LEGACY', clientId: engagement.client, year: engagement.year, engagementId: engagement.id,
      decisionStatus: 'Accepted', independenceConfirmed: true, amlKycCompleted: true,
      conflictsCleared: true, prohibitionsChecked: true, competenceConfirmed: true,
      history: [{ action: 'decision', status: 'Accepted', notes: 'Prior decision', at: '2026-01-01T00:00:00Z' }]
    }];
    const { state: migrated } = migratePersistedState(legacy, createInitialState());
    assert.equal(migrated.engagements.find(item => item.id === engagement.id)?.acceptance, false);
    assert.equal(migrated.acceptanceCases?.[0].decisionStatus, 'Accepted');
    assert.equal(migrated.acceptanceCases?.[0].screeningEvidence && Object.keys(migrated.acceptanceCases[0].screeningEvidence || {}).length, 0);
    assert.equal(migrated.acceptanceCases?.[0].history?.[0].notes, 'Prior decision');
  });
  it('repairs a missing invoice client only through its unique linked engagement', () => {
    const legacy = structuredClone(createInitialState()) as any;
    legacy.schema = 25;
    delete legacy.invoices[0].clientId;
    const { state: migrated, warnings } = migratePersistedState(legacy, createInitialState());
    assert.equal(migrated.invoices[0].clientId, 'CL-001');
    assert.ok(warnings.some(warning => warning.includes('Linked invoice INV-26001 to client CL-001')));
    assert.deepEqual(validateFixtures(migrated), []);

    const ambiguous = structuredClone(createInitialState()) as any;
    ambiguous.schema = 25;
    delete ambiguous.invoices[0].clientId;
    ambiguous.engagements.push({ ...ambiguous.engagements[0], client: 'CL-002' });
    const unresolved = migratePersistedState(ambiguous, createInitialState()).state;
    assert.equal(unresolved.invoices[0].clientId, undefined, 'do not guess when an engagement ID is ambiguous');
    assert.ok(validateFixtures(unresolved).some(issue => issue.code === 'FK_INVOICE_CLIENT'));
  });
  it('restores missing invoice lines only when the remaining invoice identity matches its seed', () => {
    const legacy = structuredClone(createInitialState()) as any;
    legacy.schema = 26;
    delete legacy.invoices[0].lines;
    const { state: migrated, warnings } = migratePersistedState(legacy, createInitialState());
    assert.deepEqual(migrated.invoices[0].lines, createInitialState().invoices[0].lines);
    assert.ok(warnings.some(warning => warning.includes('Restored the missing line collection for unchanged seeded invoice INV-26001')));
    assert.deepEqual(validateFixtures(migrated), []);

    const customized = structuredClone(createInitialState()) as any;
    customized.schema = 26;
    delete customized.invoices[0].lines;
    customized.invoices[0].description = 'Custom audit invoice';
    const unresolved = migratePersistedState(customized, createInitialState()).state;
    assert.equal(unresolved.invoices[0].lines, undefined, 'custom invoice details must not receive invented lines');
    assert.ok(validateFixtures(unresolved).some(issue => issue.code === 'INVOICE_LINES'));
  });
  it('repairs only unchanged seeded invoice shape in a current v28 browser payload', () => {
    const currentButDamaged = structuredClone(createInitialState()) as any;
    currentButDamaged.schema = 28;
    delete currentButDamaged.invoices[0].clientId;
    delete currentButDamaged.invoices[0].lines;
    const { state: migrated, warnings } = migratePersistedState(currentButDamaged, createInitialState());
    assert.equal(migrated.schema, 29);
    assert.equal(migrated.invoices[0].clientId, 'CL-001');
    assert.deepEqual(migrated.invoices[0].lines, createInitialState().invoices[0].lines);
    assert.ok(warnings.some(warning => warning.includes('Restored missing client link for unchanged seeded invoice INV-26001')));
    assert.ok(warnings.some(warning => warning.includes('Restored missing line collection for unchanged seeded invoice INV-26001')));
    assert.deepEqual(validateFixtures(migrated), []);

    const customized = structuredClone(createInitialState()) as any;
    customized.schema = 28;
    delete customized.invoices[0].clientId;
    delete customized.invoices[0].lines;
    customized.invoices[0].description = 'Client-customized invoice';
    const unresolved = migratePersistedState(customized, createInitialState()).state;
    assert.equal(unresolved.invoices[0].clientId, undefined);
    assert.equal(unresolved.invoices[0].lines, undefined);
    assert.ok(validateFixtures(unresolved).some(issue => issue.code === 'FK_INVOICE_CLIENT'));
    assert.ok(validateFixtures(unresolved).some(issue => issue.code === 'INVOICE_LINES'));
  });
  it('upgrades each persisted schema revision through current v29 without losing histories', () => {
    const seed = createInitialState();
    for (let version = 0; version <= 28; version++) {
      const legacy = structuredClone(seed) as any;
      legacy.schema = version;
      if (version < 28) {
        legacy.users = legacy.users.filter((user: any) => user.id !== 'superuser');
        legacy.roleGrants = legacy.roleGrants.filter((grant: any) => grant.userId !== 'superuser');
      }
      if (version < 22) {
        const component = legacy.consolidationGroups.find((group: any) => group.id === 'GRP-01')?.components.find((item: any) => item.componentId === 'ENG-26002');
        if (component) { component.role = 'Associate'; component.legalEntityName = 'Northstar Services (Associate)'; }
      }
      if (version < 6) delete legacy.m365Config.permittedUsers;
      if (version < 7) legacy.engagements.forEach((e: any) => delete e.sourceHistory);
      if (version < 8) legacy.engagements.forEach((e: any) => delete e.packageHistory);
      if (version < 9) {
        legacy.auditPrograms = legacy.auditPrograms.filter((program: any) => program.id !== 'PRG-03');
        legacy.auditRisks.forEach((risk: any) => delete risk.engagementId);
        legacy.auditPrograms.forEach((program: any) => { delete program.engagementId; program.procedures.forEach((procedure: any) => { delete procedure.engagementId; delete procedure.linkedRiskIds; }); });
      }
      if (version < 10) legacy.samplePopulations.forEach((population: any) => { delete population.engagementId; population.items.forEach((item: any) => delete item.selected); });
      if (version < 11) legacy.samplePopulations.forEach((population: any) => { delete population.sourceRevision; delete population.sourceFileName; delete population.sourceComplete; delete population.sourceHistory; });
      if (version < 12) delete legacy.roleGrantHistory;
      if (version < 13) legacy.acceptanceCases?.forEach((item: any) => delete item.screeningEvidence);
      if (version < 15) legacy.samplePopulations.forEach((population: any) => { delete population.accountCode; delete population.period; delete population.currency; });
      if (version < 16) delete legacy.workpaperTemplates;
      if (version < 17) legacy.evidenceCatalogue.forEach((item: any) => { delete item.linkedProcedureHistory; delete item.adequacyHistory; });
      if (version < 18) legacy.findings.forEach((item: any) => delete item.dispositionHistory);
      if (version < 20) {
        legacy.clients.forEach((client: any) => delete client.accountingProfile);
        legacy.engagements.forEach((engagement: any) => { delete engagement.accountingPeriodBookId; delete engagement.accountingProfileRevision; delete engagement.accountingChartRevision; engagement.sourceHistory?.forEach((item: any) => { delete item.accountingProfileRevision; delete item.accountingChartRevision; delete item.periodBookId; }); });
      }
      if (version < 24) legacy.clients.forEach((client: any) => { delete client.clientType; delete client.profileRevision; });
      if (version < 21) legacy.archives?.forEach((archive: any) => { delete archive.history; delete archive.predecessorArchiveId; });
      if (version < 23) for (const group of legacy.consolidationGroups) { delete group.reportingBasis; group.components.forEach((component: any) => delete component.packageReview); }
      const { state: migrated } = migratePersistedState(legacy, createInitialState());
      assert.equal(migrated.schema, 29, `schema ${version} should reach v29`);
      assert.equal(migrated.users.some(user => user.id === 'superuser' && user.role === 'superuser'), true, 'the v28 upgrade adds the synthetic prototype superuser');
      assert.equal(migrated.consolidationGroups[0].components.find(item => item.componentId === 'ENG-26002')?.role, 'Subsidiary');
      assert.equal(migrated.consolidationGroups[0].components.find(item => item.componentId === 'ENG-26002')?.status, version < 23 ? 'Pending' : seed.consolidationGroups[0].components.find(item => item.componentId === 'ENG-26002')?.status);
      assert.ok(Array.isArray(migrated.statementSetRevisions));
      assert.ok(migrated.evidenceCatalogue.every(item => Array.isArray(item.linkedProcedureHistory) && Array.isArray(item.adequacyHistory)));
      assert.ok(migrated.findings.every(item => Array.isArray(item.dispositionHistory)));
      assert.equal(migrated.engagements[0].id, seed.engagements[0].id);
      assert.ok(migrated.clients.every(client => Boolean(client.accountingProfile)));
      assert.ok(migrated.clients.every(client => client.clientType === 'Company' && client.profileRevision === 0));
      assert.deepEqual(migrated.engagements[0].pbc.map(p => p.id), seed.engagements[0].pbc.map(p => p.id));
      assert.deepEqual(migrated.engagements[0].reviews.map(r => r.id), seed.engagements[0].reviews.map(r => r.id));
      assert.deepEqual(migrated.engagements[0].releases.map(r => r.id), seed.engagements[0].releases.map(r => r.id));
      assert.ok(migrated.engagements.every(e => Array.isArray(e.sourceHistory) && Array.isArray(e.packageHistory)));
      assert.ok(Array.isArray(migrated.m365Config.permittedUsers));
      assert.equal(migrated.samplePopulations[0].engagementId, seed.engagements[0].id);
      assert.ok(migrated.samplePopulations[0].items.every(item => item.selected), `v${version} keeps legacy sample items selected`);
      assert.equal(migrated.samplePopulations[0].sourceRevision, 1);
      assert.equal(migrated.samplePopulations[0].accountCode, seed.samplePopulations[0].accountCode);
      assert.equal(migrated.samplePopulations[0].period, seed.samplePopulations[0].period);
      assert.equal(migrated.samplePopulations[0].currency, seed.samplePopulations[0].currency);
      assert.deepEqual(migrated.workpaperTemplates?.map(item => item.id), seed.workpaperTemplates?.map(item => item.id));
      assert.deepEqual(migrated.samplePopulations[0].sourceHistory, []);
      assert.deepEqual(migrated.roleGrantHistory, []);
      for (const risk of migrated.auditRisks) for (const procedureId of risk.linkedProcedureIds) {
        const procedure = migrated.auditPrograms.flatMap(program => program.procedures).find(item => item.id === procedureId);
        assert.ok(procedure?.linkedRiskIds?.includes(risk.id), `v${version} migration restores reciprocal risk link ${risk.id} -> ${procedureId}`);
      }
    }
  });
  it('adds a baseline archive-history event to legacy records without changing their manifest', () => {
    const legacy = createInitialState() as any;
    legacy.schema = 20;
    const engagement = legacy.engagements[0];
    const archivedAt = '2026-09-20T12:00:00.000Z';
    const manifest = ['M-1 · report.pdf · SHA-256 abc'];
    legacy.archives = [{ id: 'ARC-LEGACY', engagementId: engagement.id, releaseId: 'REL-1', clientName: 'Synthetic', service: 'Audit', year: 2026, archivedAt, archivedBy: 'Layla Rahman', manifest, manifestCount: 1, onHold: false }];
    engagement.archive = { archivedAt, archivedBy: 'Layla Rahman', releaseId: 'REL-1', manifest: [...manifest], onApplicationHold: false };
    const { state: migrated } = migratePersistedState(legacy, createInitialState());
    assert.deepEqual(migrated.archives?.[0].manifest, manifest);
    assert.equal(migrated.archives?.[0].history?.[0].action, 'Existing archive state');
    assert.equal(migrated.archives?.[0].history?.[0].actorId, 'manager');
    assert.equal(migrated.engagements[0].archive?.history?.[0].at, archivedAt);
  });
});

describe('document reference lifecycle (VP-021)', () => {
  it('limits unavailable-reference changes to scoped manager and partner identities (VP-021-E01)', () => {
    (prototypeStore as any).state = state;
    const document = state.documents.find(item => item.id === 'DOC-002')!;
    const validFolderPath = '/Engagements/2026/Accounting/';
    const before = structuredClone({ brokenLink: document.brokenLink, events: state.activityLog });

    for (const name of ['Adam Khan', 'Sara Malik', 'Aisha Saleh']) {
      setPersona(state, name);
      assert.throws(() => prototypeStore.setDocumentAvailability(document.id, true, 'Simulated source outage'), /cannot change document reference availability/, `${name} cannot alter link availability`);
      assert.throws(() => prototypeStore.updateDocumentReference(document.id, 'Unauthorized rename.pdf', document.folderPath), /cannot rename or move documents/, `${name} cannot rename or move documents`);
      assert.equal(document.brokenLink, before.brokenLink, `${name} denial preserves document availability`);
      assert.equal(document.name, 'Bank_Statement_December.pdf', `${name} denial preserves document identity and name`);
      assert.deepEqual(state.activityLog, before.events, `${name} denial creates no event`);
    }

    // Mona is a manager but has only the ENG-26001 grant. The in-scope file is
    // reachable, while a file for a sibling engagement in the same client is not.
    const siblingFile = { ...document, id: 'DOC-021-SIBLING', engagementId: 'ENG-26002', brokenLink: false };
    state.documents.push(siblingFile);
    setPersona(state, 'Mona Khalil');
    prototypeStore.setDocumentAvailability(document.id, true, 'Scoped source outage');
    prototypeStore.updateDocumentReference(document.id, 'Mona scoped rename.pdf', validFolderPath);
    assert.equal(document.brokenLink, true, 'engagement-scoped manager can update an in-scope file');
    assert.equal(document.name, 'Mona scoped rename.pdf', 'engagement-scoped manager can rename an in-scope file');
    assert.throws(() => prototypeStore.setDocumentAvailability(siblingFile.id, true, 'Out-of-scope source outage'), /outside the current scoped grant/, 'same-client sibling file is denied');
    assert.throws(() => prototypeStore.updateDocumentReference(siblingFile.id, 'Out-of-scope rename.pdf', siblingFile.folderPath), /outside the current scoped grant/, 'same-client sibling rename is denied');
    assert.equal(siblingFile.brokenLink, false, 'out-of-scope denial leaves sibling file unchanged');
    assert.equal(siblingFile.name, 'Bank_Statement_December.pdf', 'out-of-scope denial cannot rename the sibling file');

    for (const name of ['Daniel James', 'Layla Rahman']) {
      setPersona(state, name);
      prototypeStore.setDocumentAvailability(document.id, false);
      assert.equal(document.brokenLink, false, `${name} can restore an in-scope reference`);
      prototypeStore.updateDocumentReference(document.id, 'Bank_Statement_December.pdf', validFolderPath);
      prototypeStore.setDocumentAvailability(document.id, true, 'Recheck role grant');
    }
  });

  it('renames and moves without changing identity, and blocks unavailable evidence until restored', () => {
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const document = state.documents.find(item => item.id === 'DOC-002')!;
    const originalEvidence = state.evidenceCatalogue.find(item => item.documentId === document.id)!;
    assert.throws(() => prototypeStore.setDocumentClientSharing(document.id, false, '  '), /reason is required/);
    prototypeStore.setDocumentClientSharing(document.id, false, 'Client asked to hold this evidence pending review.');
    assert.equal(document.visibility, 'Internal');
    prototypeStore.setDocumentClientSharing(document.id, true, 'Client approved the refreshed evidence.');
    assert.equal(document.visibility, 'Client shared');
    assert.deepEqual(document.sharingHistory?.map(item => [item.from, item.to]), [['Client shared', 'Internal'], ['Internal', 'Client shared']]);
    prototypeStore.updateDocumentReference(document.id, 'Renamed bank statement.pdf', '/Engagements/2026/Accounting/');
    assert.equal(document.id, 'DOC-002');
    assert.equal(document.folderPath, '/Engagements/2026/Accounting/');
    assert.equal(originalEvidence.documentId, 'DOC-002');
    assert.throws(() => prototypeStore.updateDocumentReference(document.id, 'Bad path.pdf', '/outside/'), /existing folder in this client library/);
    assert.throws(() => prototypeStore.updateDocumentReference(document.id, 'Wrong client.pdf', '/Clients/CL-003/2026/01_Acceptance/'), /existing folder in this client library/);
    assert.throws(() => prototypeStore.setDocumentAvailability(document.id, true), /why the document reference is unavailable/);
    prototypeStore.setDocumentAvailability(document.id, true, 'Source item deleted');
    assert.throws(() => prototypeStore.setEvidenceAdequacy(originalEvidence.id, 'Adequate'), /cannot be marked adequate/);
    assert.throws(() => prototypeStore.linkWorkpaperEvidence('ENG-26001', 'WP-A1', document.id), /available document/);
    prototypeStore.setDocumentAvailability(document.id, false);
    prototypeStore.setEvidenceAdequacy(originalEvidence.id, 'Adequate');
    assert.equal(document.brokenLink, false);
  });
});

describe('archive metadata lineage (VP-059)', () => {
  it('retains corrections and links a successor release to its predecessor archive', () => {
    const engagement = state.engagements[0];
    const makeRelease = (id: string, artifactId: string, digest: string) => ({
      id, version: Number(id.slice(-1)), generation: engagement.generation,
      releasedAt: '2026-09-23T12:00:00.000Z', releasedBy: 'Layla Rahman', delivered: false,
      manifest: [{ id: `M-${artifactId}`, artifactId, name: `${artifactId}.pdf`, type: 'PDF', mimeType: 'application/pdf', size: 128, sha: digest }]
    });
    const copyFor = (artifactId: string, digest: string) => [{
      id: `archive:${engagement.id}:${artifactId}`, name: `${artifactId}.pdf`, kind: 'PDF' as const,
      mimeType: 'application/pdf', size: 128, sha256: digest, sourceArtifactId: artifactId
    }];
    const firstDigest = 'a'.repeat(64);
    engagement.releases = [makeRelease('REL-1', 'ART-1', firstDigest)] as any;
    state.archives = [];
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');

    assert.throws(() => prototypeStore.archiveEngagement(engagement.id, 'REL-1', '2030-02-30'), /valid retention date/);
    assert.throws(() => prototypeStore.archiveEngagement(engagement.id, 'REL-1', undefined, true), /requires a reason/);
    assert.throws(() => prototypeStore.archiveEngagement(engagement.id, 'REL-MISSING'), /does not exist/);
    assert.throws(() => prototypeStore.archiveEngagement(engagement.id, 'REL-1', undefined, false, undefined, copyFor('ART-1', 'b'.repeat(64))), /exact release artifact bytes/);
    prototypeStore.archiveEngagement(engagement.id, 'REL-1', undefined, false, undefined, copyFor('ART-1', firstDigest));
    prototypeStore.archiveEngagement(engagement.id, 'REL-1', '2030-12-31', false);
    const firstArchive = state.archives![0];
    assert.equal(firstArchive.history?.map(item => item.action).join(','), 'Archived,Metadata corrected');
    assert.equal(firstArchive.history?.[1].before?.retentionUntil, undefined);
    assert.equal(firstArchive.history?.[1].after.retentionUntil, '2030-12-31');

    const nextDigest = 'b'.repeat(64);
    engagement.releases.push(makeRelease('REL-2', 'ART-2', nextDigest) as any);
    prototypeStore.archiveEngagement(engagement.id, 'REL-2', '2030-12-31', false, undefined, copyFor('ART-2', nextDigest));
    const successor = state.archives![1];
    assert.equal(successor.predecessorArchiveId, firstArchive.id);
    assert.equal(successor.history?.[0].action, 'Successor release archived');
    assert.equal(state.archives!.length, 2, 'predecessor archives remain available');
    prototypeStore.recordArchiveHandover(engagement.id, 'Successor Audit Firm', 'Inspect the newest released package.');
    assert.equal(successor.handoverRequested, true, 'handover request attaches to the latest archive');
    assert.equal(firstArchive.handoverRequested, undefined, 'handover request leaves predecessor archive unchanged');
  });
});

describe('simulated invitation expiry (VP-018)', () => {
  it('limits a disabled identity to the requirements screen', () => {
    assert.equal(canOpenRoute('preparer', 'overview', false), false);
    assert.equal(canOpenRoute('preparer', 'jobs', false), false);
    assert.equal(canOpenRoute('preparer', 'requirements', false), true);
  });

  it('blocks acceptance after expiry, records expiry, and creates no identity', () => {
    const saved = prototypeStore.exportStateJSON();
    try {
      const expired = createInitialState();
      const admin = expired.users.find(u => u.role === 'admin')!;
      expired.currentUserId = admin.id;
      expired.currentPerson = admin.name;
      expired.currentRole = 'admin';
      expired.simulatedInvitations = [{
        id: 'INV-EXPIRED-TEST', email: 'expired@example.demo', name: 'Expired Recipient',
        role: 'preparer', scopeKind: 'Global', status: 'Pending', invitedAt: '2000-01-01T00:00:00.000Z',
        invitedBy: admin.name, expiresAt: '2000-01-02T00:00:00.000Z'
      }];
      prototypeStore.importStateJSON(JSON.stringify(expired));
      assert.throws(() => prototypeStore.acceptSimulatedInvitation('INV-EXPIRED-TEST'), /expired/i);
      const result = prototypeStore.getSnapshot();
      assert.equal(result.simulatedInvitations?.[0].status, 'Expired');
      assert.equal(result.users.some(u => u.email === 'expired@example.demo'), false);
      assert.equal(result.identityStatusHistory?.some(e => e.action === 'InvitationExpired' && e.userName === 'Expired Recipient'), true);
    } finally {
      prototypeStore.importStateJSON(saved);
    }
  });
});

describe('internal comment editing (AT-14)', () => {
  it('limits edits to the author and records who and when changed the note', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    prototypeStore.resetState();
    const initial = prototypeStore.getSnapshot();
    prototypeStore.setPersona(initial.users.find(user => user.id === 'preparer')!.id);
    const author = prototypeStore.getSnapshot().currentPerson;
    prototypeStore.addComment({ id: 'CMT-EDIT-TEST', subjectType: 'job', subjectId: initial.jobs[0].id, author, authorRole: 'preparer', createdAt: new Date().toISOString(), text: 'Original note', visibility: 'internal' });
    prototypeStore.editComment('CMT-EDIT-TEST', ' Revised note ');
    const edited = prototypeStore.getSnapshot().comments.find(comment => comment.id === 'CMT-EDIT-TEST')!;
    assert.equal(edited.text, 'Revised note');
    assert.equal(edited.editedBy, author);
    assert.ok(edited.editedAt);
    prototypeStore.setPersona(prototypeStore.getSnapshot().users.find(user => user.id === 'manager')!.id);
    assert.throws(() => prototypeStore.editComment('CMT-EDIT-TEST', 'Unauthorized change'), /Only the comment author/);
  });
});

describe('sampling workpaper guards (VP-051)', () => {
  it('requires selection and records a variance against the scoped population item', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    prototypeStore.resetState();
    prototypeStore.setPersona('preparer');
    prototypeStore.setSelectedEngagement('ENG-26001');
    assert.throws(() => prototypeStore.setSampleItemSelected('POP-01', 'SAMP-01', false), /complete population source/);
    assert.throws(() => prototypeStore.recordSampleItemTest('POP-01', 'SAMP-01', 249000, 'Vouched.'), /complete population source/);
    const makeRow = (amount: number, period = 2026, currency = 'QAR') => ({ id: 'SAMP-IMPORT-1', itemRef: 'SOURCE-1', date: '2026-09-20', period, currency, counterparty: 'Customer', amount, tested: false, selected: false, result: 'Untested' as const });
    assert.throws(() => prototypeStore.replaceSamplePopulationSource('POP-01', 'wrong-context.csv', 'c'.repeat(64), [makeRow(500000, 2025, 'USD')]), /period\/currency/);
    prototypeStore.replaceSamplePopulationSource('POP-01', 'source.csv', 'b'.repeat(64), [makeRow(100)]);
    assert.throws(() => prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', true), /Reconcile the complete population/);
    assert.throws(() => prototypeStore.recordSampleItemTest('POP-01', 'SAMP-IMPORT-1', 99, 'Vouched.'), /Reconcile the complete population/);
    prototypeStore.replaceSamplePopulationSource('POP-01', 'reconciled.csv', 'd'.repeat(64), [makeRow(500000)]);
    assert.throws(() => prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', true), /Selection rationale is required/);
    prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', true, 'Select the high-value transaction');
    assert.equal(prototypeStore.getSnapshot().samplePopulations[0].items[0].selectionRationale, 'Select the high-value transaction');
    prototypeStore.recordSampleItemTest('POP-01', 'SAMP-IMPORT-1', 499999, 'Inspected independent confirmation.');
    const item = prototypeStore.getSnapshot().samplePopulations[0].items[0];
    assert.equal(item.result, 'Exception noted');
    assert.equal(item.difference, -1);
    assert.throws(() => prototypeStore.linkSampleExceptionToFinding('POP-01', 'SAMP-IMPORT-1', 'missing'), /same engagement/);
    prototypeStore.linkSampleExceptionToFinding('POP-01', 'SAMP-IMPORT-1', 'FND-01');
    assert.equal(prototypeStore.getSnapshot().samplePopulations[0].items[0].findingId, 'FND-01');
    assert.equal(prototypeStore.getSnapshot().samplePopulations[0].selectedValue, 500000);
    prototypeStore.setPersona('reviewer');
    prototypeStore.reviewSampleSelection('POP-01', 'One item tested; one-dollar difference requires follow-up.');
    assert.deepEqual([prototypeStore.getSnapshot().samplePopulations[0].selectionReviews?.[0].testedCount, prototypeStore.getSnapshot().samplePopulations[0].selectionReviews?.[0].untestedCount, prototypeStore.getSnapshot().samplePopulations[0].selectionReviews?.[0].exceptionCount], [1, 0, 1]);
    prototypeStore.setPersona('preparer');
    prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', false);
    const staleSelection = prototypeStore.getSnapshot().samplePopulations[0];
    assert.notEqual(staleSelection.selectionReviews?.at(-1)?.version, staleSelection.selectionVersion, 'changing selection invalidates the prior evaluation');
    prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', true, 'Reselect after review change');
    prototypeStore.setPersona('reviewer');
    prototypeStore.reviewSampleSelection('POP-01', 'Reselected item reviewed.');
    prototypeStore.replaceSamplePopulationSource('POP-01', 'new.csv', 'a'.repeat(64), [makeRow(120)]);
    const replaced = prototypeStore.getSnapshot().samplePopulations[0];
    assert.equal(replaced.sourceRevision, 4);
    assert.equal(replaced.sourceHistory?.[2].items[0].difference, -1);
    assert.deepEqual([replaced.totalPopulationCount, replaced.totalPopulationValue, replaced.selectedCount], [1, 120, 0]);
    assert.equal(replaced.sourceSha256, 'a'.repeat(64));
    assert.equal(replaced.selectionReviews?.length, 2, 'prior selection evaluations remain historical');
    assert.throws(() => prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', true), /Reconcile the complete population/);
  });

  it('records a selected-item testing limitation and separates it in reviewer evaluation', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    prototypeStore.resetState();
    prototypeStore.setPersona('preparer');
    prototypeStore.setSelectedEngagement('ENG-26001');
    const row = { id: 'LIMIT-1', itemRef: 'LIMIT-1', date: '2026-09-20', period: 2026, currency: 'QAR', counterparty: 'Customer', amount: 500000, tested: false, selected: false, result: 'Untested' as const };
    prototypeStore.replaceSamplePopulationSource('POP-01', 'limit.csv', 'a'.repeat(64), [row]);
    prototypeStore.setSampleItemSelected('POP-01', 'LIMIT-1', true, 'Select for confirmation testing');
    assert.throws(() => prototypeStore.recordSampleItemLimitation('POP-01', 'LIMIT-1', ''), /explain the testing limitation/);
    prototypeStore.recordSampleItemLimitation('POP-01', 'LIMIT-1', 'Customer confirmation could not be obtained.');
    prototypeStore.setPersona('reviewer');
    prototypeStore.reviewSampleSelection('POP-01', 'One item limited; alternative procedures required.');
    const population = prototypeStore.getSnapshot().samplePopulations[0];
    assert.deepEqual([population.items[0].result, population.selectionReviews?.[0].testedCount, population.selectionReviews?.[0].limitedCount, population.selectionReviews?.[0].untestedCount], ['Limited', 0, 1, 0]);
  });
});

describe('workpaper template lifecycle (VP-052)', () => {
  it('creates a fresh scoped workpaper and requires reasoned eligible reassignment', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    prototypeStore.resetState();
    prototypeStore.setPersona('manager');
    prototypeStore.setSelectedEngagement('ENG-26001');
    const id = prototypeStore.createWorkpaperFromTemplate('ENG-26001', 'TPL-WP-CASH-01', 'preparer', 'reviewer');
    let workpaper = prototypeStore.getSnapshot().engagements.find(item => item.id === 'ENG-26001')!.workpapers.find(item => item.id === id)!;
    assert.deepEqual([workpaper.sourceTemplateId, workpaper.sourceTemplateVersion, workpaper.version, workpaper.status], ['TPL-WP-CASH-01', 1, 1, 'Planned']);
    assert.deepEqual([workpaper.workingPaper, workpaper.evidenceRefs, workpaper.supportingEvidence, workpaper.conclusion, workpaper.clearance], [null, [], [], '', null]);
    assert.throws(() => prototypeStore.reassignWorkpaper('ENG-26001', id, 'reviewer', 'reviewer-2', ''), /reassignment reason/);
    prototypeStore.reassignWorkpaper('ENG-26001', id, 'reviewer', 'reviewer-2', 'Reviewer capacity change');
    workpaper = prototypeStore.getSnapshot().engagements.find(item => item.id === 'ENG-26001')!.workpapers.find(item => item.id === id)!;
    assert.deepEqual([workpaper.reviewer, workpaper.version, workpaper.assignmentHistory?.at(-1)?.reason], ['Bilal Ahmed', 2, 'Reviewer capacity change']);
  });
});

describe('access grant history (VP-018/019)', () => {
  it('retains grant and revocation actor, scope, timestamp and reason', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    prototypeStore.resetState();
    prototypeStore.setPersona('admin');
    assert.throws(() => prototypeStore.grantAccess('admin', 'admin', 'Global', undefined, 'Self promotion', { requestRef: 'AR-SELF' }), /cannot grant access to their own person/);
    assert.throws(() => prototypeStore.grantAccess('group-user', 'manager', 'Engagement', 'ENG-26002', 'Quarterly assignment'), /request reference/);
    assert.throws(() => prototypeStore.grantAccess('group-user', 'manager', 'Engagement', 'ENG-26002', 'Quarterly assignment', { effectiveFrom: '2027-09-23', expiresAt: '2027-09-22', requestRef: 'AR-42' }), /expiry cannot precede/);
    assert.throws(() => prototypeStore.grantAccess('group-user', 'manager', 'Engagement', 'ENG-26002', 'Quarterly assignment', { effectiveFrom: '2026-02-30', requestRef: 'AR-42' }), /valid/);
    assert.throws(() => prototypeStore.grantAccess('client', 'client', 'Client', 'CL-002', 'Management authority assignment', { requestRef: 'AR-CLIENT-42' }), /separate approval-evidence reference/);
    assert.throws(() => prototypeStore.grantAccess('client', 'client', 'Client', 'CL-002', 'Management authority assignment', { requestRef: 'AR-CLIENT-42', approvalEvidenceRef: 'AR-CLIENT-42' }), /separate reference/);
    assert.throws(() => prototypeStore.grantAccess('group-user', 'manager', 'Group', 'GRP-MISSING', 'Group assignment', { requestRef: 'AR-GROUP-42', approvalEvidenceRef: 'HR-CREDENTIAL-GROUP-42' }), /consolidation group does not exist/);
    prototypeStore.grantAccess('group-user', 'manager', 'Group', 'GRP-01', 'Group reporting assignment', { requestRef: 'AR-GROUP-42', approvalEvidenceRef: 'HR-CREDENTIAL-GROUP-42' });
    const groupScopedState = prototypeStore.getSnapshot();
    assert.equal(hasConsolidationGroupScope(groupScopedState, 'GRP-01', 'group-user'), true);
    assert.deepEqual(visibleEngagementIds(groupScopedState, 'group-user'), ['ENG-26001'], "group reporting scope does not add sibling engagements to the user's engagement list");
    assert.deepEqual(visibleClientIds(groupScopedState, 'group-user'), ['CL-001'], "group reporting scope does not add member clients to the user's client list");
    prototypeStore.setPersona('group-user');
    assert.throws(() => requireEngagementScope(prototypeStore.getSnapshot(), 'ENG-26002'), /outside the current scoped grant/);
    const groupEdit = structuredClone(prototypeStore.getSnapshot().consolidationGroups[0]);
    groupEdit.name = 'Example Group Holdings scoped edit';
    prototypeStore.updateConsolidationGroup(groupEdit, { reason: 'Update authorized named group' });
    assert.equal(prototypeStore.getSnapshot().consolidationGroups[0].name, groupEdit.name, 'named group grant authorizes a reporting configuration command');
    prototypeStore.setPersona('admin');
    assert.throws(() => prototypeStore.grantAccess('group-user', 'manager', 'Engagement', 'ENG-26002', 'Quarterly assignment', { requestRef: 'AR-42' }), /separate approval-evidence reference/);
    assert.throws(() => prototypeStore.grantAccess('group-user', 'manager', 'Engagement', 'ENG-26002', 'Quarterly assignment', { requestRef: 'AR-42', approvalEvidenceRef: 'AR-42' }), /separate reference/);
    prototypeStore.grantAccess('group-user', 'manager', 'Engagement', 'ENG-26002', 'Quarterly assignment', { effectiveFrom: '2999-01-01', expiresAt: '2999-12-31', requestRef: 'AR-42', approvalEvidenceRef: 'HR-CREDENTIAL-42' });
    assert.equal(visibleEngagementIds(prototypeStore.getSnapshot(), 'group-user').includes('ENG-26002'), false, 'scheduled grant does not authorize before its effective date');
    assert.throws(() => prototypeStore.revokeAccess('group-user', 'manager', 'ENG-26002', ''), /revocation reason/);
    prototypeStore.revokeAccess('group-user', 'manager', 'ENG-26002', 'Assignment ended');
    const history = prototypeStore.getSnapshot().roleGrantHistory.slice(-2);
    assert.deepEqual(history.map(event => [event.action, event.actorUserId, event.userId, event.scopeId, event.reason]), [
      ['Granted', 'admin', 'group-user', 'ENG-26002', 'Quarterly assignment'],
      ['Revoked', 'admin', 'group-user', 'ENG-26002', 'Assignment ended']
    ]);
    assert.deepEqual([history[0].requestRef, history[0].effectiveFrom, history[0].expiresAt], ['AR-42', '2999-01-01', '2999-12-31']);
    assert.deepEqual(history.map(event => event.approvalEvidenceRef), ['HR-CREDENTIAL-42', 'HR-CREDENTIAL-42'], 'the separate credential evidence reference survives grant and revocation history');
    assert.ok(history.every(event => Number.isFinite(Date.parse(event.at))));
    assert.equal(prototypeStore.getSnapshot().roleGrants.some(grant => grant.userId === 'group-user' && grant.scopeId === 'ENG-26002'), false);
  });
});

describe('client rules (AT-05)', () => {
  it('duplicate normalized client codes are rejected', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Amira Qasim');
    assert.throws(
      () => prototypeStore.addClient({ id: 'CL-X', code: 'exp-trad', name: 'Dup', clientType: 'Company', initials: 'D', industry: 'x', contact: 'c', jurisdiction: 'Q', status: 'Active', risk: 'Low', revenue: 1, relationshipOwner: 'Amira Qasim' }),
      /Duplicate client code/
    );
  });

  it('creates and revision-checks client profiles without changing linked identity or accounting data', () => {
    (prototypeStore as any).state = state;
    setPersona(state, 'Amira Qasim');
    const created = prototypeStore.addClient({ id: 'CL-AT06', code: '  at06  ', name: 'Cedar Test Industries', clientType: 'Company', initials: 'CT', industry: 'Manufacturing', contact: 'Amina', email: 'a@example.demo', jurisdiction: 'Qatar', status: 'Prospect', risk: 'Low', revenue: 0, relationshipOwner: 'Amira Qasim' });
    assert.deepEqual(created, []);
    const client = state.clients.find(item => item.id === 'CL-AT06')!;
    assert.equal(state.contacts.find(item => item.clientId === client.id)?.name, 'Amina', 'the profile primary contact becomes an active contact record');
    client.customFields = { preserved: 'yes' };
    const accountProfile = client.accountingProfile;
    const group = client.relationshipGroupId = 'GROUP-AT06';
    const linkedId = state.engagements[0].client;
    const before = structuredClone(client);
    assert.throws(() => prototypeStore.updateClient({ ...client, name: 'Stale edit' }, 9), /Stale client profile/);
    assert.deepEqual(client, before, 'a stale write leaves the profile unchanged');
    const warnings = prototypeStore.updateClient({ ...client, name: 'Cedar Manufacturing LLC' }, 0);
    const updated = state.clients.find(item => item.id === 'CL-AT06')!;
    assert.equal(client.id, 'CL-AT06');
    assert.equal(updated.profileRevision, 1);
    assert.equal(updated.accountingProfile, accountProfile);
    assert.equal(updated.customFields?.preserved, 'yes');
    assert.equal(updated.relationshipGroupId, group);
    assert.ok(warnings.some(warning => warning.includes('similar')));
    assert.equal(state.engagements[0].client, linkedId, 'existing client links are unaffected');
    assert.throws(() => prototypeStore.updateClient({ ...updated, email: 'bad-email' }, 1), /valid client email/);
    assert.equal(updated.profileRevision, 1, 'invalid edits are atomic');
    assert.throws(() => prototypeStore.updateClient({ ...updated, relationshipOwner: 'unknown' }, 1), /active relationship/);
  });

  it('soft-archives an established client without changing engagement, invoice or evidence references', () => {
    (prototypeStore as any).state = state;
    setPersona(state, 'Amira Qasim');
    const client = state.clients.find(item => item.id === 'CL-001')!;
    const engagementIds = state.engagements.filter(item => item.client === client.id).map(item => item.id).sort();
    const invoiceIds = state.invoices.filter(item => item.clientId === client.id).map(item => item.id).sort();
    const documentIds = state.documents.filter(item => item.clientId === client.id).map(item => item.id).sort();
    const workpaperIds = state.engagements.filter(item => item.client === client.id).flatMap(item => item.workpapers).map(item => item.id).sort();
    assert.ok(engagementIds.length > 0 && invoiceIds.length > 0 && documentIds.length > 0 && workpaperIds.length > 0, 'fixture contains established client history');
    const updated = prototypeStore.updateClient({ ...client, status: 'Archived' }, client.profileRevision || 0);
    assert.ok(Array.isArray(updated));
    assert.equal(state.clients.some(item => item.id === client.id), true);
    assert.equal(state.clients.find(item => item.id === client.id)?.status, 'Archived');
    assert.deepEqual(state.engagements.filter(item => item.client === client.id).map(item => item.id).sort(), engagementIds);
    assert.deepEqual(state.invoices.filter(item => item.clientId === client.id).map(item => item.id).sort(), invoiceIds);
    assert.deepEqual(state.documents.filter(item => item.clientId === client.id).map(item => item.id).sort(), documentIds);
    assert.deepEqual(state.engagements.filter(item => item.client === client.id).flatMap(item => item.workpapers).map(item => item.id).sort(), workpaperIds);
  });

  it('blocks new active work for suspended and archived clients while preserving draft work', () => {
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const client = state.clients.find(item => item.id === 'CL-001')!;
    const sample = structuredClone(state.engagements[0]);
    delete sample.proposalId;
    const draft = { ...sample, id: 'ENG-AT06-DRAFT', client: client.id, stage: 'Draft', acceptance: true, terms: true };
    client.status = 'Suspended';
    assert.equal(prototypeStore.addEngagement(draft).id, draft.id);
    const active = { ...sample, id: 'ENG-AT06-ACTIVE', client: client.id, stage: 'Planning', acceptance: true, terms: true };
    assert.throws(() => prototypeStore.addEngagement(active), /reactivate the client/);
    client.status = 'Archived';
    assert.throws(() => prototypeStore.addEngagement({ ...draft, id: 'ENG-AT06-ARCHIVED', stage: 'Planning' }), /reactivate the client/);
    assert.equal(state.engagements.some(item => item.id === 'ENG-AT06-ARCHIVED'), false);
  });

  it('client list and create commands require the active Global client grant', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    state.roleGrants = state.roleGrants.filter(grant => grant.userId !== 'relationship');
    state.roleGrants.push({ userId: 'relationship', role: 'relationship', scopeKind: 'Client', scopeId: 'CL-001', expiresAt: '2026-09-23' });
    state.asOfDate = '2026-09-24';
    setPersona(state, 'Amira Qasim');
    (prototypeStore as any).state = state;
    assert.deepEqual(visibleClientIds(state), []);
    assert.throws(
      () => prototypeStore.addClient({ id: 'CL-X', code: 'NEW', name: 'Out of scope', clientType: 'Company', initials: 'OS', industry: 'x', contact: 'c', jurisdiction: 'Q', status: 'Active', risk: 'Low', revenue: 1, relationshipOwner: 'Amira Qasim' }),
      /active Global client grant/
    );
    assert.equal(prototypeStore.getSnapshot().clients.some(client => client.id === 'CL-X'), false);
  });

  it('validates custom values, keeps contacts non-authorizing and relationship groups outside access grants', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Amira Qasim');
    prototypeStore.setClientCustomField('CL-001', 'cf_entity_tier', 'Tier 1 Public');
    assert.equal(state.clients.find(c => c.id === 'CL-001')?.customFields?.cf_entity_tier, 'Tier 1 Public');
    assert.throws(() => prototypeStore.setClientCustomField('CL-001', 'cf_entity_tier', 'exec(1)'), /configured choices/);
    assert.throws(() => prototypeStore.setClientCustomField('CL-001', 'cf_cr_expiry', '2026-02-30'), /valid date/);
    assert.throws(() => prototypeStore.addCustomFieldDefinition('Invalid Choice', 'choice', ['Only one']), /at least two/);
    const fieldId = prototypeStore.addCustomFieldDefinition('Risk Tier', 'choice', ['Low', 'High']);
    prototypeStore.setClientCustomField('CL-001', fieldId, 'High');
    prototypeStore.setCustomFieldDefinitionEnabled(fieldId, false);
    assert.equal(state.clients.find(c => c.id === 'CL-001')?.customFields?.[fieldId], 'High', 'disabling a used definition preserves historical values');
    assert.throws(() => prototypeStore.setClientCustomField('CL-001', fieldId, 'Low'), /active custom field/);

    const newContact = { id: 'CNT-AT05', clientId: 'CL-001', name: 'Nora Test', email: 'nora@example.demo', responsibility: 'Financial reporting', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', isPrimary: true, active: true, portalAccessRequested: true };
    assert.throws(() => prototypeStore.addContact({ ...newContact, id: 'CNT-AT05-BAD', effectiveTo: '2025-12-31' }), /end date cannot precede/);
    prototypeStore.addContact(newContact);
    assert.equal(newContact.portalAccessRequested, false);
    assert.equal(state.contacts.find(c => c.id === newContact.id)?.responsibility, 'Financial reporting');
    const createdContactId = newContact.id;
    const usersBeforeContactEdit = structuredClone(state.users);
    const contactRevision = prototypeStore.updateClientContact('CL-001', createdContactId, { name: 'Nora Test Revised', active: false });
    const revisedContact = state.contacts.find(c => c.id === createdContactId)!;
    assert.equal(contactRevision, 2);
    assert.equal(revisedContact.id, createdContactId, 'editing retains the contact identity used by historical links');
    assert.equal(revisedContact.active, false);
    assert.equal(revisedContact.isPrimary, false, 'inactivating a primary contact removes primary status');
    assert.equal(revisedContact.history?.[0].before.name, 'Nora Test');
    assert.equal(revisedContact.history?.[0].after.name, 'Nora Test Revised');
    assert.equal(revisedContact.history?.[0].after.active, false);
    assert.equal(revisedContact.portalAccessRequested, false);
    assert.deepEqual(state.users, usersBeforeContactEdit, 'contact edits never create an account identity');
    prototypeStore.updateClientContact('CL-001', createdContactId, { active: true });
    assert.equal(state.contacts.find(c => c.id === createdContactId)?.history?.length, 2, 'reactivation appends a revision without replacing the contact');
    assert.equal(state.contacts.find(c => c.id === 'CNT-01')?.isPrimary, false);
    prototypeStore.setPrimaryContact('CL-001', 'CNT-02');
    assert.equal(state.contacts.find(c => c.id === 'CNT-02')?.isPrimary, true);
    const inactive = state.contacts.find(c => c.id === 'CNT-02')!;
    inactive.active = false;
    assert.throws(() => prototypeStore.setPrimaryContact('CL-001', 'CNT-02'), /inactive/);

    const grants = structuredClone(state.roleGrants);
    setPersona(state, 'Omar Nasser');
    assert.throws(() => prototypeStore.assignClientRelationshipGroup('CL-001'), /cannot change client relationship groups/);
    setPersona(state, 'Amira Qasim');
    prototypeStore.createClientRelationshipGroup('CL-001', 'AT-05 Related Entities');
    prototypeStore.assignClientRelationshipGroup('CL-003', state.clients.find(c => c.id === 'CL-001')!.relationshipGroupId);
    assert.equal(state.relationshipGroups.find(g => g.name === 'AT-05 Related Entities')?.clientIds.includes('CL-003'), true);
    assert.deepEqual(state.roleGrants, grants, 'relationship grouping never creates client access');
  });
});

describe('task hierarchy (AT-11)', () => {
  it('rejects task assignment outside the assigned user engagement grant', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    setPersona(current, 'Layla Rahman');
    current.roleGrants = current.roleGrants.filter(grant => grant.userId !== 'preparer-2');
    current.roleGrants.push({ userId: 'preparer-2', role: 'preparer', scopeKind: 'Client', scopeId: 'CL-002' });
    assert.throws(() => prototypeStore.addTask({ id: 'T-CROSS-CLIENT-ASSIGNEE', jobId: 'JOB-2601', title: 'Out of scope task', assignee: 'Nadia Rahman', status: 'Not started', order: 99 }), /access to this engagement/);
    assert.throws(() => prototypeStore.reassignTask('TSK-103', 'Nadia Rahman', 'Capacity balancing'), /access to this engagement/);
  });

  it('requires and retains reasons when cancelling or reopening a task', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    setPersona(current, 'Layla Rahman');
    const task = { id: 'T-STATUS-HISTORY', jobId: 'JOB-2601', title: 'Status history task', assignee: 'Adam Khan', status: 'Not started' as const, order: 99 };
    prototypeStore.addTask(task);
    assert.throws(() => prototypeStore.updateTask({ ...task, status: 'Cancelled' }), /requires a reason/);
    prototypeStore.updateTask({ ...task, status: 'Cancelled', statusChangeReason: 'Duplicate request.' });
    assert.equal(current.jobTasks.find(item => item.id === task.id)?.statusHistory?.[0].reason, 'Duplicate request.');
    assert.throws(() => prototypeStore.updateTask({ ...task, status: 'In progress' }), /requires a reason/);
    prototypeStore.updateTask({ ...task, status: 'In progress', statusChangeReason: 'Work is required again.' });
    assert.deepEqual(current.jobTasks.find(item => item.id === task.id)?.statusHistory?.map(event => [event.from, event.to, event.reason]), [['Not started', 'Cancelled', 'Duplicate request.'], ['Cancelled', 'In progress', 'Work is required again.']]);
  });

  it('rejects second nesting levels and cross-job parents', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    assert.throws(
      () => prototypeStore.addTask({ id: 'T-DEEP', jobId: 'JOB-2601', parentTaskId: 'TSK-103-1', title: 'Too deep', assignee: 'Adam Khan', status: 'Not started', order: 9 }),
      /one level/
    );
    assert.throws(
      () => prototypeStore.addTask({ id: 'T-XJOB', jobId: 'JOB-2602', parentTaskId: 'TSK-101', title: 'Cross job', assignee: 'Adam Khan', status: 'Not started', order: 9 }),
      /Cross-job/
    );
    assert.throws(
      () => prototypeStore.addTask({ id: 'T-CYCLE', jobId: 'JOB-2601', parentTaskId: 'T-CYCLE', title: 'Self parent', assignee: 'Adam Khan', status: 'Not started', order: 10 }),
      /own parent/
    );
  });

  it('blocks completing a parent with unfinished children', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    const parent = (prototypeStore as any).state.jobTasks.find((t: any) => t.id === 'TSK-103');
    assert.throws(
      () => prototypeStore.updateTask({ ...parent, status: 'Completed' }),
      /unfinished/
    );
  });

  it('does not complete the parent or job when a child completes', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    setPersona(current, 'Layla Rahman');
    const child = current.jobTasks.find(item => item.parentTaskId === 'TSK-103')!;
    const parentStatus = current.jobTasks.find(item => item.id === 'TSK-103')!.status;
    const job = current.jobs.find(item => item.id === child.jobId)!;
    const jobStatus = job.status;
    prototypeStore.updateTask({ ...child, status: 'Completed' });
    assert.equal(current.jobTasks.find(item => item.id === 'TSK-103')?.status, parentStatus);
    assert.equal(job.status, jobStatus);
  });
});

describe('separation of duties (AT-24/AT-31/AT-47)', () => {
  it('a person cannot approve their own proposal, time, workpaper or review point', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const { GuardError: GE } = await import('../../src/services/guards.js');
    (prototypeStore as any).state = createInitialState();
    // Proposal prepared by Amira → Amira cannot approve even as manager label.
    setPersona((prototypeStore as any).state, 'Amira Qasim');
    assert.throws(() => prototypeStore.reviewProposal('PROP-001', true), (e: any) => e instanceof GE || /Separation of duties/.test(e.message));
    // Own time entry.
    setPersona((prototypeStore as any).state, 'Adam Khan');
    (prototypeStore as any).state.times.find((t: any) => t.id === 'TIME-01').status = 'Submitted';
    assert.throws(() => prototypeStore.reviewTimeEntry('TIME-01', 'Approved'), /own time/);
  });

  it('GuardError carries machine-readable codes', () => {
    const e = new GuardError('SELF_APPROVAL', 'x');
    assert.equal(e.code, 'SELF_APPROVAL');
  });
});

describe('review-note assignment (VP-055)', () => {
  it('limits assignees to active scoped preparers/managers and retains reassignment history', () => {
    assert.equal(canOpenRoute('preparer', 'reviews'), true, 'assigned preparers need access to their personal review queue');
    assert.equal(canOpenRoute('preparer', 'financial-packages'), true, 'preparers must reach the package editor that permits them to assemble revisions');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    const note = {
      id: 'RN-ASSIGN', wp: 'WP-A1', title: 'Assignment check', body: 'Assignment check', author: 'Layla Rahman',
      raisedBy: 'Layla Rahman', assigned: 'Adam Khan', due: '2026-10-01', response: '', severity: 'Medium' as const,
      version: 1, text: 'Assignment check', status: 'Open' as const, history: []
    };
    prototypeStore.addReviewNote('ENG-26001', note);
    assert.equal(note.assignedUserId, 'preparer');
    assert.equal(note.assignmentHistory?.[0].reason, 'Initial assignment');
    assert.throws(() => prototypeStore.reassignReviewNote('ENG-26001', note.id, 'preparer-2', ''), /reason/);
    assert.throws(() => prototypeStore.reassignReviewNote('ENG-26001', note.id, 'billing', 'Capacity change'), /active in-scope preparer or manager/);
    prototypeStore.reassignReviewNote('ENG-26001', note.id, 'preparer-2', 'Workload balancing');
    assert.equal(note.assignedUserId, 'preparer-2');
    assert.deepEqual(note.assignmentHistory?.map(event => [event.assignedUserId, event.actorUserId, event.reason]), [
      ['preparer', 'manager', 'Initial assignment'], ['preparer-2', 'manager', 'Workload balancing']
    ]);
  });

  it('pins a finding query to its revision and reopens it when the finding changes', () => {
    (prototypeStore as any).state = createInitialState();
    const current = (prototypeStore as any).state as PrototypeState;
    setPersona(current, 'Layla Rahman');
    const note = {
      id: 'RN-FINDING', wp: 'FND-01', subjectType: 'finding' as const, title: 'Finding query', body: 'Check disposition',
      author: 'Layla Rahman', raisedBy: 'Layla Rahman', assigned: 'Adam Khan', due: current.asOfDate, response: '',
      severity: 'Medium' as const, version: 1, text: 'Check disposition', status: 'Open' as const, history: []
    };
    prototypeStore.addReviewNote('ENG-26001', note);
    assert.equal(note.subjectVersion, 1);
    setPersona(current, 'Adam Khan');
    prototypeStore.respondReviewNote('ENG-26001', note.id, 'Reviewed the finding basis.');
    setPersona(current, 'Layla Rahman');
    prototypeStore.clearReviewNote('ENG-26001', note.id);
    prototypeStore.setFindingDisposition('FND-01', 'Uncorrected', 'Management retains the proposed adjustment.');
    assert.equal(note.status, 'Reopened');
    assert.equal(note.subjectVersion, 1, 'previous response remains pinned to its finding revision');
    assert.equal(note.response, 'Reviewed the finding basis.');
    assert.ok(note.history.some(event => event.action === 'Reopened after finding revision'));
  });
});

describe('opportunity and proposal lifecycle (AT-07/AT-08)', () => {
  it('revises supported service and proposal templates without rewriting copied proposal defaults', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const service = structuredClone(target.state.proposalServices[0]);
    service.description = 'Updated supported service description.';
    const savedService = target.saveProposalService(service, service.revision);
    assert.equal(savedService.revision, 2);
    assert.equal(target.state.proposalServiceHistory.at(-1).revision, 1);
    const template = structuredClone(target.state.proposalTemplates[0]);
    template.scope = 'Template source scope revision two.';
    const savedTemplate = target.saveProposalTemplate(template, template.revision);
    assert.equal(savedTemplate.revision, 2);
    assert.equal(target.state.proposalTemplateHistory.at(-1).revision, 1);
    assert.throws(() => target.saveProposalTemplate({ ...savedTemplate, quantity: 0 }, savedTemplate.revision), /positive quantity/);
    assert.throws(() => target.saveProposalService({ ...savedService, rate: -1 }, savedService.revision), /nonnegative rate/);
    assert.throws(() => target.saveProposalService({ ...savedService, periodStart: '2026-12-31', periodEnd: '2026-01-01' }, savedService.revision), /valid reporting period/);
    assert.throws(() => target.saveProposalTemplate({ ...savedTemplate, periodStart: '2026-12-31', periodEnd: '2026-01-01' }, savedTemplate.revision), /valid reporting period/);
    assert.throws(() => target.saveProposalService({ ...savedService, id: 'SVC-TAX', name: 'Tax filing', revision: 0 }), /in-scope offering/);
    assert.throws(() => target.saveProposalTemplate(savedTemplate, 1), /changed in another view/);
  });

  it('rejects Lost/Unqualified outcomes without a reason and retains opportunity stage history', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const lead = structuredClone(target.state.leads[0]);
    assert.throws(() => target.updateLead({ ...lead, stage: 'Lost', lostReason: '' }), /requires an outcome reason/);
    target.updateLead({ ...lead, stage: 'Lost', lostReason: 'Client deferred the work.' });
    const saved = target.state.leads.find((item: any) => item.id === lead.id);
    assert.equal(saved.history.at(-1).stage, 'Lost');
    assert.equal(saved.history.at(-1).reason, 'Client deferred the work.');
    const unqualified = structuredClone(target.state.leads.find((item: any) => item.id !== lead.id));
    assert.throws(() => target.updateLead({ ...unqualified, stage: 'Unqualified' }), /requires an outcome reason/);
    target.updateLead({ ...unqualified, stage: 'Unqualified', lostReason: 'Outside supported service scope.' });
    assert.equal(target.state.leads.find((item: any) => item.id === unqualified.id).history.at(-1).reason, 'Outside supported service scope.');
  });

  it('converts only won opportunities to non-authorizing prospect records once', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const lead = structuredClone(target.state.leads[0]);
    assert.throws(() => target.updateLead({ ...lead, targetDate: '2026-02-30' }), /real calendar date/);
    assert.throws(() => target.updateLead({ ...lead, value: -1 }), /valid non-negative fee/);
    target.updateLead({ ...lead, stage: 'Proposal' });
    assert.throws(() => target.convertLead(lead.id), /Only a won opportunity/);
    target.updateLead({ ...lead, stage: 'Won' });
    const client = target.convertLead(lead.id);
    assert.equal(client.status, 'Prospect');
    assert.equal(target.state.leads.find((item: any) => item.id === lead.id).accepted, false);
    assert.equal(target.state.leads.find((item: any) => item.id === lead.id).convertedClientId, client.id);
    assert.equal(target.convertLead(lead.id).id, client.id, 'retry returns the same prospect');
    assert.equal(target.state.clients.filter((item: any) => item.id === client.id).length, 1);
    assert.throws(() => target.updateLead({ ...lead, stage: 'Lost' }), /cannot be converted or reclassified/);
    const secondLead = { ...lead, id: 'LD-CROSS-CLIENT', name: 'Cross Client Opportunity', stage: 'Won' as const, convertedClientId: undefined };
    target.addLead(secondLead);
    const secondProspect = target.convertLead(secondLead.id);
    const unrelatedClient = target.state.clients.find((item: any) => item.id !== secondProspect.id);
    assert.throws(() => target.addProposal({ id: 'PROP-CROSS-CLIENT', title: 'Cross Client Proposal', revision: 1, preparedBy: 'Layla Rahman', preparedAt: '2026-09-23', clientId: unrelatedClient.id, leadId: secondLead.id, currency: 'QAR', totalAmount: 100, items: [{ id: 'PROP-CROSS-CLIENT-1', serviceName: 'Audit', description: 'Audit', scope: 'Annual audit', exclusions: 'Tax', deliverables: 'Report', clientResponsibilities: 'Supply records', feeModel: 'Fixed', amount: 100 }], terms: 'Payment within 30 days.', state: 'Draft' }), /do not match/);
  });

  it('requires independent review before presentation and preserves the exact presented revision', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    addAmiraManagerPersona(target.state);
    const id = 'PROP-AT07';
    const validProposal = { id, title: 'Test proposal', revision: 1, preparedBy: 'Amira Qasim', preparedAt: '2026-09-23', currency: 'QAR', period: 'FY2026', periodStart: '2026-01-01', periodEnd: '2026-12-31', totalAmount: 100, items: [{ id: `${id}-1`, serviceName: 'Audit', description: 'Annual audit', scope: 'Audit of FY2026 statements', exclusions: 'Tax services', deliverables: 'Audit opinion', clientResponsibilities: 'Provide records', dependencies: 'Access to books', period: 'FY2026', periodStart: '2026-01-01', periodEnd: '2026-12-31', feeModel: 'Fixed', quantity: 1, rate: 100, amount: 100 }], terms: 'Payment within 30 days.', state: 'Draft' };
    assert.throws(() => target.addProposal({ ...validProposal, periodEnd: '2025-12-31' }), /period/i, 'reversed proposal dates are rejected');
    assert.throws(() => target.addProposal({ ...validProposal, items: [{ ...validProposal.items[0], periodEnd: '2025-12-31' }] }), /period/i, 'reversed service-line dates are rejected');
    target.addProposal(validProposal);
    assert.throws(() => target.reviewProposal(id, true), /same person|Separation of duties/i);
    setPersona(target.state, 'Layla Rahman');
    assert.throws(() => target.reviewProposal(id, false, '   '), /return reason is required/i);
    target.reviewProposal(id, false, '  Clarify the period and deliverables.  ');
    assert.equal(target.state.proposals.find((item: any) => item.id === id).commercialReview.notes, 'Clarify the period and deliverables.');
    assert.equal(target.state.proposals.find((item: any) => item.id === id).commercialReview.approved, false);
    target.reviewProposal(id, true);
    target.presentProposal(id);
    const old = structuredClone(target.state.proposals.find((item: any) => item.id === id));
    const revision = target.createProposalRevision(id);
    assert.equal(target.state.proposals.find((item: any) => item.id === id).state, 'Superseded');
    assert.deepEqual(target.state.proposals.find((item: any) => item.id === id).presentedSnapshot, old.presentedSnapshot);
    assert.equal(revision.revision, 2);
    assert.equal(revision.predecessorId, id);
    assert.equal(revision.state, 'Draft');
    assert.equal(revision.commercialReview, undefined);
    const revisedDraft = structuredClone(revision);
    revisedDraft.currency = 'USD';
    revisedDraft.totalAmount = 125;
    revisedDraft.items[0].rate = 125;
    revisedDraft.items[0].amount = 125;
    target.updateProposal(revisedDraft);
    assert.equal(target.state.proposals.find((item: any) => item.id === revision.id).currency, 'USD');
    assert.equal(target.state.proposals.find((item: any) => item.id === revision.id).items.reduce((sum: number, item: any) => sum + item.amount, 0), 125);
    assert.deepEqual(target.state.proposals.find((item: any) => item.id === id).presentedSnapshot, old.presentedSnapshot, 'editing the revised draft cannot rewrite the exact earlier presented currency and fee');
  });

  it('requires client response evidence and does not create an engagement', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    const prop = target.state.proposals.find((item: any) => item.id === 'PROP-001');
    prop.state = 'Presented';
    prop.presentedSnapshot = { revision: prop.revision, title: prop.title, currency: prop.currency, totalAmount: prop.totalAmount, items: structuredClone(prop.items), terms: prop.terms, presentedBy: 'Layla Rahman', presentedAt: '2026-09-23T10:00:00Z' };
    const engagementCount = target.state.engagements.length;
    setPersona(target.state, 'Omar Nasser');
    const response = { responseType: 'Accepted', contact: 'Omar Nasser', date: '2026-09-23', method: 'Email', notes: 'Approved for acceptance.', evidenceRef: '' } as const;
    assert.throws(() => target.recordProposalResponse(prop.id, response), /evidence reference/);
    assert.throws(() => target.recordProposalResponse(prop.id, { ...response, method: 'Chat', evidenceRef: 'MAIL-ACCEPT-2026-09-23' }), /allowed method/);
    assert.throws(() => target.recordProposalResponse(prop.id, { ...response, date: '2026-02-30', evidenceRef: 'MAIL-ACCEPT-2026-09-23' }), /valid date/);
    assert.throws(() => target.recordProposalResponse(prop.id, { ...response, responseType: 'Signed' as any, evidenceRef: 'MAIL-ACCEPT-2026-09-23' }), /allowed response type/);
    assert.throws(() => target.recordProposalResponse(prop.id, { ...response, contact: 'Unlisted Signatory', evidenceRef: 'MAIL-ACCEPT-2026-09-23' }), /active client contact/);
    assert.throws(() => target.recordProposalResponse(prop.id, { ...response, contact: 'Aisha Saleh', evidenceRef: 'MAIL-ACCEPT-2026-09-23' }), /active client contact/);
    prop.state = 'Superseded';
    assert.throws(() => target.recordProposalResponse(prop.id, { ...response, evidenceRef: 'MAIL-ACCEPT-2026-09-23' }), /approved, presented proposal/);
    prop.state = 'Presented';
    prop.revision += 1;
    assert.throws(() => target.recordProposalResponse(prop.id, { ...response, evidenceRef: 'MAIL-ACCEPT-2026-09-23' }), /current presented revision/);
    prop.revision -= 1;
    for (const method of ['Email', 'Meeting', 'Letter'] as const) {
      prop.state = 'Presented';
      prop.clientResponse = undefined;
      target.recordProposalResponse(prop.id, { ...response, method, evidenceRef: `REF-${method}` });
      assert.equal(prop.state, 'Accepted');
      assert.equal(prop.clientResponse.method, method);
      assert.equal(prop.clientResponse.evidenceRef, `REF-${method}`);
      assert.equal(prop.clientResponse.recordedBy, 'Omar Nasser');
      assert.equal(prop.clientResponse.revision, prop.presentedSnapshot.revision);
    }
    for (const responseType of ['Accepted', 'Declined', 'Withdrawn'] as const) {
      prop.state = 'Presented';
      prop.clientResponse = undefined;
      target.recordProposalResponse(prop.id, { ...response, responseType, evidenceRef: `REF-${responseType}` });
      assert.equal(prop.state, responseType);
      assert.equal(prop.clientResponse.responseType, responseType);
      assert.equal(prop.clientResponse.revision, prop.presentedSnapshot.revision);
      assert.throws(() => target.recordProposalResponse(prop.id, { ...response, evidenceRef: 'REF-DUPLICATE' }), /approved, presented proposal/);
    }
    setPersona(target.state, 'Layla Rahman');
    prop.state = 'Presented';
    prop.clientResponse = undefined;
    target.recordProposalResponse(prop.id, { ...response, responseType: 'Withdrawn', method: 'Letter', evidenceRef: 'LETTER-STAFF-001' });
    assert.equal(prop.clientResponse.recordedBy, 'Layla Rahman');
    assert.equal(prop.clientResponse.recordedRole, 'manager');
    assert.ok(prop.clientResponse.contactId, 'staff response retains the linked active contact identity');
    const withdrawnResponse = structuredClone(prop.clientResponse);
    const revisedAfterWithdrawal = target.createProposalRevision(prop.id);
    assert.equal(prop.state, 'Superseded');
    assert.deepEqual(prop.clientResponse, withdrawnResponse, 'the withdrawn response remains attached to its historical revision');
    assert.equal(revisedAfterWithdrawal.clientResponse, undefined, 'the new revision cannot inherit an earlier response');
    assert.throws(() => target.recordProposalResponse(prop.id, { ...response, evidenceRef: 'REF-STALE-AFTER-WITHDRAWAL' }), /approved, presented proposal/);
    assert.equal(target.state.engagements.length, engagementCount, 'accepted proposal does not itself create an engagement');
  });
});

describe('engagement lifecycle suspension (VP-012)', () => {
  it('blocks representative professional outputs across work, accounting, audit and delivery commands in every inactive lifecycle state', () => {
    const target = prototypeStore as any;
    const lifecycleStates = ['Suspended', 'Closed', 'Cancelled'] as const;
    for (const lifecycleStatus of lifecycleStates) {
      target.state = createInitialState();
      setPersona(target.state, 'Layla Rahman');
      const asPartner = (run: () => unknown) => {
        const identity = { currentUserId: target.state.currentUserId, currentPerson: target.state.currentPerson, currentRole: target.state.currentRole };
        setPersona(target.state, 'Daniel James');
        try { return run(); } finally { Object.assign(target.state, identity); }
      };
      const engagement = target.state.engagements.find((item: any) => item.id === 'ENG-26001');
      target.setEngagementLifecycle(engagement.id, lifecycleStatus, `VP-012 guard matrix: ${lifecycleStatus}`);
      const job = target.state.jobs.find((item: any) => item.engagementId === engagement.id);
      const client = target.state.clients.find((item: any) => item.id === engagement.client);
      const task = target.state.jobTasks.find((item: any) => item.jobId === job.id);
      const document = target.state.documents.find((item: any) => item.engagementId === engagement.id);
      const timeEntry = target.state.times.find((item: any) => item.engagementId === engagement.id);
      const request = engagement.pbc[0];
      target.state.communications.push({ id: 'VP012-INBOUND-FIXTURE', clientId: engagement.client, engagementId: engagement.id, direction: 'Inbound', author: 'Layla Rahman', date: target.state.asOfDate, channel: 'Email', summary: 'Existing communication', participants: 'Client contact', visibility: 'Internal' });
      target.state.evidenceCatalogue.push({ id: 'VP012-EVIDENCE-FIXTURE', documentId: document.id, status: 'Linked' });
      target.state.findings.push({ id: 'VP012-FINDING-FIXTURE', engagementId: engagement.id, title: 'Existing finding', disposition: 'Proposed for correction', dispositionHistory: [] });
      target.state.auditPlans = [{ id: 'VP012-BLOCKED-PLAN', engagementId: engagement.id, version: 1, status: 'Under review', preparedByUserId: 'user-preparer' }];
      engagement.disclosureHistory = [{ id: 'VP012-BLOCKED-DISCLOSURE', revision: 1, status: 'Draft' }];
      engagement.cashFlowScheduleHistory = [{ id: 'VP012-BLOCKED-CF', engagementId: engagement.id, revision: 1, status: 'Draft' }];
      const deniedActions: Array<[string, () => unknown]> = [
        ['job creation', () => target.addJob({ id: 'VP012-BLOCKED-JOB', clientId: engagement.client, engagementId: engagement.id, title: 'Blocked', owner: 'Layla Rahman', dueDate: target.state.asOfDate, status: 'Not started' })],
        ['job update', () => target.updateJob({ ...structuredClone(job), title: 'Must remain unchanged' })],
        ['task creation', () => target.addTask({ id: 'VP012-BLOCKED-TASK', jobId: job.id, title: 'Blocked', assignee: 'Layla Rahman', status: 'Not started', order: 999 })],
        ['task update', () => target.updateTask({ ...structuredClone(task), title: 'Must remain unchanged' })],
        ['task reassignment', () => target.reassignTask(task.id, 'Omar Nasser', 'Blocked by lifecycle')],
        ['engagement document registration', () => target.addDocument({ id: 'VP012-BLOCKED-DOC', clientId: engagement.client, engagementId: engagement.id, name: 'blocked.pdf', folderPath: '/', version: 1, size: 1, classification: 'Internal', visibility: 'Internal', source: 'SharePoint', uploadedBy: 'Layla Rahman', uploadedAt: new Date().toISOString() })],
        ['document revision replacement', () => target.replaceDocumentRevision(document.id, { name: 'blocked.pdf', size: 1, sha256: '0'.repeat(64) })],
        ['document reference update', () => target.updateDocumentReference(document.id, 'Must remain unchanged.pdf', document.folderPath)],
        ['document availability update', () => target.setDocumentAvailability(document.id, true, 'Blocked by lifecycle')],
        ['time entry', () => target.addTimeEntry({ id: 'VP012-BLOCKED-TIME', person: 'Layla Rahman', clientId: engagement.client, engagementId: engagement.id, date: target.state.asOfDate, durationMinutes: 30, billable: true, activity: 'Blocked', status: 'Draft' })],
        ['time review', () => target.reviewTimeEntry(timeEntry.id, 'Approved')],
        ['engagement comment', () => target.addComment({ id: 'VP012-BLOCKED-COMMENT', subjectType: 'engagement', subjectId: engagement.id, text: 'Blocked', author: 'Layla Rahman', createdAt: new Date().toISOString() })],
        ['inbound communication correction', () => target.correctCommunication('VP012-INBOUND-FIXTURE', { summary: 'Must remain unchanged' }, 'Blocked by lifecycle')],
        ['engagement budget revision', () => target.updateBudget({ ...structuredClone(target.state.budgets.find((item: any) => item.engagementId === engagement.id)), id: 'VP012-BLOCKED-BUDGET', engagementId: engagement.id })],
        ['trial-balance replacement', () => target.updateTrialBalanceRows(engagement.id, [])],
        ['general-ledger source intake', () => target.importGeneralLedgerSource(engagement.id, { fileName: 'blocked.csv', format: 'CSV', sha256: '0'.repeat(64), openingBalances: {}, transactions: [] })],
        ['account reconciliation', () => target.saveReconciliationSchedule(engagement.id, {})],
        ['reconciliation review', () => target.reviewReconciliationSchedule(engagement.id, 'REC-01', 'Approved')],
        ['account mapping revision', () => target.saveAccountMappings(engagement.id, [])],
        ['account mapping review', () => asPartner(() => target.approveAccountMappings(engagement.id, 1))],
        ['financial statement layout revision', () => target.saveStatementLayoutRevision({ engagementId: engagement.id })],
        ['financial statement revision', () => target.saveStatementSetRevision({ engagementId: engagement.id })],
        ['cash-flow schedule revision', () => target.saveCashFlowSchedule({ engagementId: engagement.id })],
        ['cash-flow schedule review', () => asPartner(() => target.reviewCashFlowSchedule(engagement.id, 1))],
        ['adjustment journal', () => target.addAdjustmentJournal({ id: 'VP012-BLOCKED-JOURNAL', engagementId: engagement.id })],
        ['workpaper creation', () => target.createWorkpaperFromTemplate(engagement.id, 'TPL-01', 'user-preparer', 'user-reviewer')],
        ['workpaper revision', () => target.updateWorkpaper(engagement.id, 'WP-A1', { applicable: true, workPerformed: 'Blocked' })],
        ['workpaper evidence link', () => target.linkWorkpaperEvidence(engagement.id, 'WP-A1', 'DOC-001')],
        ['workpaper submission', () => target.submitWorkpaper(engagement.id, 'WP-A1')],
        ['workpaper clearance', () => target.clearWorkpaper(engagement.id, 'WP-A1', 'Blocked')],
        ['review note creation', () => target.addReviewNote(engagement.id, { id: 'VP012-BLOCKED-REVIEW', subjectId: 'WP-A1', text: 'Blocked' })],
        ['engagement approval', () => target.recordApproval(engagement.id, 'partner', 'Blocked')],
        ['PBC request creation', () => target.addPbcRequest(engagement.id, { id: 'VP012-BLOCKED-PBC' })],
        ['PBC request amendment', () => target.updatePbcRequest(engagement.id, request.id, { title: 'Must remain unchanged' }, 'Blocked by lifecycle')],
        ['PBC evidence acceptance', () => target.acceptPbcResponse(engagement.id, request.id)],
        ['evidence-procedure link', () => target.linkEvidenceProcedure('VP012-EVIDENCE-FIXTURE', 'PRC-01')],
        ['audit fieldwork', () => target.updateAuditProcedureExecution(engagement.id, 'PRC-01', 'Blocked', 'Blocked', '')],
        ['audit procedure status review', () => target.updateAuditProcedureStatus(engagement.id, 'PRC-01', 'Submitted', 'Blocked by lifecycle')],
        ['audit risk creation', () => target.createAuditRisk(engagement.id, {})],
        ['audit risk amendment', () => target.updateAuditRisk(engagement.id, 'VP012-RISK-FIXTURE', {})],
        ['finding creation', () => target.addFinding({ engagementId: engagement.id })],
        ['finding disposition', () => target.setFindingDisposition('VP012-FINDING-FIXTURE', 'Accepted', 'Blocked by lifecycle')],
        ['release candidate preparation', () => target.prepareReleaseCandidate(engagement.id)],
        ['financial package assembly', () => target.saveFinancialPackageRevision({ engagementId: engagement.id })],
        ['financial disclosure revision', () => target.saveDisclosureReview(engagement.id, { id: 'VP012-BLOCKED-DISCLOSURE' })],
        ['financial disclosure review', () => asPartner(() => target.reviewDisclosure(engagement.id, 'VP012-BLOCKED-DISCLOSURE', 1))],
        ['audit plan preparation', () => target.saveAuditPlan({ engagementId: engagement.id })],
        ['audit plan review', () => target.reviewAuditPlan('VP012-BLOCKED-PLAN', true, 'Blocked by lifecycle')],
        ['amended release preparation', () => asPartner(() => target.prepareAmendedRelease(engagement.id, 'Blocked by lifecycle'))]
      ];
      for (const [action, run] of deniedActions) {
        const before = JSON.stringify(target.state);
        assert.throws(run, /professional work is blocked/, `${lifecycleStatus} must reject ${action}`);
        assert.equal(JSON.stringify(target.state), before, `${lifecycleStatus} rejection of ${action} must not write demo state`);
      }
      assert.ok(client, 'fixture client exists for engagement-bound file checks');
    }
    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
  });

  it('requires rationale, blocks professional work, keeps billing and records available, and preserves terminal history', async () => {
    const target = prototypeStore as any;
    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const engagement = target.state.engagements.find((item: any) => item.id === 'ENG-26001');
    const generation = engagement.generation;
    assert.throws(() => target.setEngagementLifecycle(engagement.id, 'Suspended', '  '), /requires a reason/);
    target.setEngagementLifecycle(engagement.id, 'Suspended', 'Awaiting client access approval.');
    assert.equal(engagement.lifecycleStatus, 'Suspended');
    assert.match(engagement.events.at(-1).text, /Active → Suspended by Layla Rahman: Awaiting client access approval/);
    assert.equal(engagement.generation, generation + 1);
    assert.throws(() => requireEngagementScope(target.state, engagement.id), /professional work is blocked/);
    assert.doesNotThrow(() => requireEngagementScope(target.state, engagement.id, 'billing'));
    assert.doesNotThrow(() => requireEngagementScope(target.state, engagement.id, 'records'));
    const job = { ...structuredClone(target.state.jobs[0]), id: 'JOB-SUSPENDED-NEW' };
    assert.throws(() => target.addJob(job), /professional work is blocked/);
    target.setEngagementLifecycle(engagement.id, 'Active', 'Client access restored.');
    target.setEngagementLifecycle(engagement.id, 'Closed', 'Final records indexed.');
    for (const action of ['professional', 'activation'] as const) {
      assert.throws(() => requireEngagementScope(target.state, engagement.id, action), /professional work is blocked/, `${action} work remains blocked while closed`);
    }
    assert.doesNotThrow(() => requireEngagementScope(target.state, engagement.id, 'billing'), 'historical billing remains available while closed');
    assert.doesNotThrow(() => requireEngagementScope(target.state, engagement.id, 'records'), 'records remain available while closed');
    assert.throws(() => target.setEngagementLifecycle(engagement.id, 'Active', 'Reopen'), /cannot transition/);
    assert.throws(() => target.updateEngagement(engagement), /immutable/);
    assert.deepEqual(engagement.events.filter((event: any) => event.type === 'lifecycle').map((event: any) => event.text), [
      'Active → Suspended by Layla Rahman: Awaiting client access approval.',
      'Suspended → Active by Layla Rahman: Client access restored.',
      'Active → Closed by Layla Rahman: Final records indexed.'
    ]);

    const cancelled = target.state.engagements.find((item: any) => item.id === 'ENG-26002');
    target.setEngagementLifecycle(cancelled.id, 'Cancelled', 'Client withdrew before fieldwork.');
    for (const action of ['professional', 'activation'] as const) {
      assert.throws(() => requireEngagementScope(target.state, cancelled.id, action), /professional work is blocked/, `${action} work remains blocked after cancellation`);
    }
    assert.doesNotThrow(() => requireEngagementScope(target.state, cancelled.id, 'billing'), 'historical billing remains available after cancellation');
    assert.doesNotThrow(() => requireEngagementScope(target.state, cancelled.id, 'records'), 'records remain available after cancellation');
    assert.throws(() => target.setEngagementLifecycle(cancelled.id, 'Active', 'Reopen'), /cannot transition/);

    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const editable = target.state.engagements[0];
    const originalGeneration = editable.generation;
    const edit = structuredClone(editable);
    edit.due = '2026-10-05';
    target.updateEngagement(edit);
    const updated = target.state.engagements.find((item: any) => item.id === editable.id);
    assert.equal(updated.due, '2026-10-05');
    assert.equal(updated.generation, originalGeneration + 1);
    assert.match(updated.events.at(-1).text, /changed by Layla Rahman: due/);
    const procedure = target.state.auditPrograms.flatMap((program: any) => program.procedures).find((item: any) => item.id === 'PRC-01');
    procedure.status = 'Cleared'; procedure.workPerformed = 'Prior-period work'; procedure.conclusion = 'Prior-period conclusion'; procedure.evidenceLimitation = 'Recheck period relevance'; procedure.reviewedByUserId = 'reviewer';
    updated.planning = true; updated.sourceAccepted = true; updated.mappingApproved = true;
    updated.approvals.partner = { by: 'partner', at: '2026-09-23T10:00:00Z', generation: updated.generation };
    updated.candidate = { generation: updated.generation };
    target.state.statementSetRevisions = [{ id: 'STALE-SCOPE', engagementId: updated.id, status: 'Reviewed' }];
    target.state.auditPlans = [{ id: 'PLAN-SCOPE', engagementId: updated.id, version: 3, status: 'Approved' }];
    updated.cashFlowScheduleHistory = [{ id: 'CF-SCOPE', engagementId: updated.id, revision: 1, sourceVersion: updated.sourceVersion, mappingRevision: 1, openingCash: 0, closingCash: 0, movements: [], status: 'Reviewed' }];
    const scopeEdit = structuredClone(updated); scopeEdit.service = 'Annual accounts'; scopeEdit.year = 2027; scopeEdit.period = '01 Jan – 31 Dec 2027';
    target.updateEngagement(scopeEdit);
    const scoped = target.state.engagements.find((item: any) => item.id === updated.id);
    assert.equal(scoped.planning, false); assert.equal(scoped.sourceAccepted, false); assert.equal(scoped.mappingApproved, false);
    assert.equal(target.state.statementSetRevisions[0].status, 'Stale');
    assert.equal(scoped.reconciliations[0].status, 'Stale', 'scope change stales reviewed account reconciliations');
    assert.equal(scoped.cashFlowScheduleHistory[0].status, 'Stale', 'scope change stales reviewed cash-flow schedules');
    assert.equal(target.state.auditPlans[0].status, 'Superseded', 'approved plan is visibly superseded after a scope change');
    assert.equal(target.state.auditPlans[0].supersededReason.includes('reporting period changed'), true);
    assert.equal(scoped.candidate, null); assert.equal(scoped.approvals.partner, null);
    assert.equal(procedure.scopeReassessmentRequired, true); assert.equal(procedure.status, 'In progress'); assert.equal(procedure.reviewedByUserId, undefined);
    assert.throws(() => target.updateAuditProcedureStatus(updated.id, procedure.id, 'Submitted'), /re-record this procedure/);
    target.updateAuditProcedureExecution(updated.id, procedure.id, 'Updated period work', 'Updated scope conclusion', 'Recheck period relevance');
    assert.equal(procedure.scopeReassessmentRequired, false);
    const teamPlan = { id: 'PLAN-TEAM', engagementId: updated.id, version: 4, status: 'Under review' };
    target.state.auditPlans.push(teamPlan);
    scoped.planning = true; procedure.status = 'Cleared'; procedure.workPerformed = 'Reconfirmed under updated period'; procedure.conclusion = 'Scope is current'; procedure.reviewedByUserId = 'reviewer';
    const teamEdit = structuredClone(scoped); teamEdit.team = [scoped.manager, scoped.partner];
    target.updateEngagement(teamEdit);
    assert.equal(target.state.auditPlans.find((plan: any) => plan.id === teamPlan.id).status, 'Superseded', 'team change blocks an in-flight plan review against obsolete assignments');
    assert.equal(target.state.engagements.find((item: any) => item.id === updated.id).planning, false);
    assert.equal(procedure.scopeReassessmentRequired, true, 'team change prompts reassessment of performed procedures');
    assert.equal(procedure.scopeReassessmentReason, 'Engagement team changed');
    const sibling = target.state.engagements.find((item: any) => item.id === 'ENG-26002');
    const invalidTeam = structuredClone(sibling);
    invalidTeam.team = [...invalidTeam.team, 'Mona Khalil'];
    assert.throws(() => target.updateEngagement(invalidTeam), /does not have an active grant/);
  });
});

describe('proposal to engagement handoff (AT-10)', () => {
  it('creates one draft per accepted proposal and requires partner evidence to activate', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    const state = target.state;
    const proposal = { ...structuredClone(state.proposals.find((item: any) => item.id === 'PROP-001')), id: 'PROP-AT10' };
    proposal.presentedSnapshot = { revision: proposal.revision, title: proposal.title, currency: proposal.currency, totalAmount: proposal.totalAmount, items: structuredClone(proposal.items), terms: proposal.terms, presentedBy: 'Layla Rahman', presentedAt: '2026-09-23T10:00:00Z' };
    state.proposals.push(proposal);
    setPersona(state, 'Layla Rahman');
    const draft = { ...structuredClone(state.engagements[0]), id: 'ENG-AT10', client: proposal.clientId, service: proposal.items.map((item: any) => item.serviceName).join(' + '), stage: 'Draft', proposalId: proposal.id, agreedFee: proposal.totalAmount, currency: proposal.currency, acceptance: false, terms: false, professionalAcceptance: undefined };
    const created = target.addEngagement(draft);
    const duplicate = target.addEngagement({ ...draft, id: 'ENG-AT10-DUP' });
    assert.equal(created.id, 'ENG-AT10');
    assert.equal(duplicate.id, created.id);
    assert.equal(state.engagements.filter((item: any) => item.proposalId === proposal.id).length, 1);
    assert.throws(() => target.addJob({ ...structuredClone(state.jobs[0]), id: 'JOB-BEFORE-AT10', clientId: created.client, engagementId: created.id }), /pending professional acceptance/);
    setPersona(state, 'Daniel James');
    assert.throws(() => target.activateEngagement(created.id, ''), /evidence reference/);
    target.activateEngagement(created.id, 'PARTNER-ACCEPT-AT10');
    assert.equal(created.stage, 'Planning');
    assert.equal(created.professionalAcceptance.evidenceRef, 'PARTNER-ACCEPT-AT10');
    assert.equal(created.professionalAcceptance.proposalRevision, proposal.revision);
    assert.doesNotThrow(() => target.addJob({ ...structuredClone(state.jobs[0]), id: 'JOB-AFTER-AT10', clientId: created.client, engagementId: created.id }));
  });
});

describe('internal collaboration scope (AT-14)', () => {
  it('rejects client and out-of-scope mention targets while retaining authorized internal notes', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const base = { id: 'CMT-AT14', subjectType: 'job', subjectId: 'JOB-2601', author: 'Layla Rahman', authorRole: 'manager', createdAt: '2026-09-23T10:00:00Z', text: 'Internal coordination note.', visibility: 'internal' };
    assert.throws(() => target.addComment({ ...base, id: 'CMT-CLIENT-MENTION', mentions: ['client_admin'] }), /active staff who can access this comment subject/);
    target.addComment({ ...base, mentions: ['partner'] });
    assert.equal(target.state.comments.find((item: any) => item.id === base.id).mentions[0], 'partner');
    assert.equal(target.state.events.some((event: any) => event.ref === base.id && event.text.includes('Local mention')), true);
    const notice = target.state.localNotices.find((item: any) => item.commentId === base.id);
    assert.equal(notice.recipientUserId, 'partner');
    target.state.currentUserId = 'manager-2';
    target.state.currentPerson = 'Mariam Saeed';
    target.state.currentRole = 'manager';
    assert.throws(() => target.markLocalNoticeRead(notice.id), /intended recipient/);
    assert.throws(() => target.moderateComment(base.id, true, ' '), /requires a reason/);
    target.state.currentUserId = 'manager';
    target.state.currentPerson = 'Layla Rahman';
    assert.throws(() => target.moderateComment(base.id, true, 'Author cannot moderate own note'), /cannot moderate their own/);
    target.state.currentUserId = 'manager-2';
    target.state.currentPerson = 'Mariam Saeed';
    target.state.currentRole = 'manager';
    target.moderateComment(base.id, true, 'Contains an accidentally pasted private detail.');
    assert.equal(target.state.comments.find((item: any) => item.id === base.id).moderationHistory[0].action, 'Hidden');
    assert.throws(() => target.moderateComment(base.id, true, 'Already hidden'), /already hidden/);
    target.moderateComment(base.id, false, 'Private detail removed; comment can be restored.');
    setPersona(target.state, 'Daniel James');
    target.markLocalNoticeRead(notice.id);
    assert.ok(notice.readAt);
  });

  it('supports client and engagement subject notes with matching mention scope', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const engagement = target.state.engagements.find((item: any) => item.id === 'ENG-26001');
    const shared = { author: 'Layla Rahman', authorRole: 'manager', createdAt: '2026-09-25T10:00:00Z', text: 'Scoped subject note.', visibility: 'internal', mentions: ['partner'] };
    target.addComment({ ...shared, id: 'CMT-CLIENT-SCOPE', subjectType: 'client', subjectId: engagement.client });
    target.addComment({ ...shared, id: 'CMT-ENGAGEMENT-SCOPE', subjectType: 'engagement', subjectId: engagement.id });
    assert.equal(target.state.localNotices.filter((item: any) => ['CMT-CLIENT-SCOPE', 'CMT-ENGAGEMENT-SCOPE'].includes(item.commentId)).length, 2);
    assert.throws(() => target.addComment({ ...shared, id: 'CMT-CLIENT-OUTSIDE', subjectType: 'client', subjectId: engagement.client, mentions: ['client_admin'] }), /active staff who can access this comment subject/);
    const reviewedRecord = JSON.stringify({ reviews: engagement.reviews, approvals: engagement.approvals, workpapers: engagement.workpapers.map((item: any) => item.clearanceHistory) });
    target.editComment('CMT-CLIENT-SCOPE', 'Revised client-scoped note.');
    assert.equal(JSON.stringify({ reviews: engagement.reviews, approvals: engagement.approvals, workpapers: engagement.workpapers.map((item: any) => item.clearanceHistory) }), reviewedRecord, 'note edits cannot rewrite separate approval or review records');
  });
});

describe('task file references (VP-014)', () => {
  it('links same-engagement library metadata and preserves a reasoned unlink history', () => {
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const task = state.jobTasks.find(item => state.jobs.find(job => job.id === item.jobId)?.engagementId === 'ENG-26001')!;
    const job = state.jobs.find(item => item.id === task.jobId)!;
    const doc = state.documents.find(item => item.clientId === job.clientId && item.engagementId === job.engagementId && !item.linkedTaskId)!;
    const foreign = { ...doc, id: 'DOC-FOREIGN-TEST', clientId: 'CL-FOREIGN' };
    state.documents.push(foreign);
    assert.throws(() => prototypeStore.linkDocumentToTask(foreign.id, task.id), /same client and engagement/);
    prototypeStore.linkDocumentToTask(doc.id, task.id);
    prototypeStore.linkDocumentToTask(doc.id, task.id);
    assert.equal(doc.linkedTaskId, task.id);
    assert.equal(doc.taskLinkHistory?.filter(item => item.action === 'Linked').length, 1);
    assert.throws(() => prototypeStore.unlinkDocumentFromTask(doc.id, ' '), /reason/);
    prototypeStore.unlinkDocumentFromTask(doc.id, 'No longer relevant to this task.');
    assert.equal(doc.linkedTaskId, undefined);
    assert.equal(doc.taskLinkHistory?.at(-1)?.reason, 'No longer relevant to this task.');
  });
});

describe('simulated mail attempts (AT-26)', () => {
  it('restricts email template maintenance and saves only supported placeholders', () => {
    (prototypeStore as any).state = state;
    const before = structuredClone(state.emailTemplates);
    const initialCount = state.communications.length;
    setPersona(state, 'Adam Khan');
    assert.throws(() => prototypeStore.saveEmailTemplate({ ...before[0], name: 'Unauthorized edit' }), /cannot maintain email templates/);
    assert.deepEqual(state.emailTemplates, before, 'unauthorized template editing leaves templates unchanged');

    setPersona(state, 'Layla Rahman');
    const revised = prototypeStore.saveEmailTemplate({ ...before[0], name: 'PBC Request Notice Revised', subject: 'Request for {client_name}', body: 'Dear {client_contact}, request {request_title} is due {due_date}.', placeholders: [] });
    assert.equal(state.emailTemplates.find(template => template.id === before[0].id)?.name, 'PBC Request Notice Revised');
    assert.deepEqual(revised.placeholders, ['{client_name}', '{client_contact}', '{request_title}', '{due_date}'], 'the supported placeholder inventory is derived from saved content');
    assert.throws(() => prototypeStore.saveEmailTemplate({ ...before[0], id: 'TPL-EM-UNSUPPORTED', name: 'Unsupported token', subject: 'Request {tenant_secret}', body: 'Body', placeholders: ['{tenant_secret}'] }), /Unsupported email template placeholder/);
    assert.equal(state.emailTemplates.some(template => template.id === 'TPL-EM-UNSUPPORTED'), false, 'invalid template is not inserted');
    assert.equal(state.communications.length, initialCount, 'template maintenance never records a client communication');
    state.emailTemplates = before;
  });

  it('accepts only an active client contact and requires unique local outcome evidence', () => {
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const makeAttempt = (id: string, recipientEmail: string, simulationReference: string) => ({
      id, clientId: 'CL-001', engagementId: 'ENG-26001', direction: 'Outbound' as const, channel: 'Email' as const,
      participants: `Layla Rahman -> ${recipientEmail}`, recipientEmail, summary: 'PBC request', body: 'Please review the request.',
      author: 'Layla Rahman', date: new Date().toISOString(), visibility: 'Client visible' as const, status: 'Simulated accepted' as const,
      simulationReference, simulationEvidence: 'Local simulation; no provider receipt.', simulationSubmissionId: `SUB-${id}`
    });
    const initialCount = state.communications.length;
    const savedMailConfig = structuredClone(state.m365Config);
    const originalDocumentCount = state.documents.length;
    state.documents.push(
      { id: 'VP026-DOC-FOREIGN', clientId: 'CL-002', engagementId: 'ENG-26002', name: 'Foreign client attachment', folderPath: '/Clients/CL-002/', version: 1, size: 1, classification: 'Correspondence', visibility: 'Client shared', source: 'SharePoint', uploadedBy: 'Layla Rahman', uploadedAt: `${state.asOfDate}T12:00:00.000Z` },
      { id: 'VP026-DOC-SIBLING', clientId: 'CL-001', engagementId: 'ENG-26002', name: 'Sibling engagement attachment', folderPath: '/Clients/CL-001/ENG-26002/', version: 1, size: 1, classification: 'Correspondence', visibility: 'Client shared', source: 'SharePoint', uploadedBy: 'Layla Rahman', uploadedAt: `${state.asOfDate}T12:00:00.000Z` },
      { id: 'VP026-DOC-INTERNAL', clientId: 'CL-001', engagementId: 'ENG-26001', name: 'Internal workpaper', folderPath: '/Clients/CL-001/ENG-26001/', version: 1, size: 1, classification: 'Working paper', visibility: 'Internal', source: 'SharePoint', uploadedBy: 'Layla Rahman', uploadedAt: `${state.asOfDate}T12:00:00.000Z` }
    );
    state.m365Config.mailSenderAccount = '';
    assert.throws(() => prototypeStore.addCommunication(makeAttempt('COMM-NO-SENDER', 'omar.nasser@example-trading.demo', 'MAIL-SIM-NO-SENDER')), /configured simulated mail sender is unavailable/);
    state.m365Config = structuredClone(savedMailConfig);
    state.m365Config.verificationResults = { ...state.m365Config.verificationResults, mail: { outcome: 'missing-resource', testedAt: `${state.asOfDate}T12:00:00.000Z`, configRevision: state.m365Config.configRevision || 1, resourceId: state.m365Config.mailSenderAccount } };
    assert.throws(() => prototypeStore.addCommunication(makeAttempt('COMM-UNAVAILABLE-SENDER', 'omar.nasser@example-trading.demo', 'MAIL-SIM-UNAVAILABLE-SENDER')), /simulated mail sender is unavailable/);
    state.m365Config = structuredClone(savedMailConfig);
    assert.throws(() => prototypeStore.addCommunication({ ...makeAttempt('COMM-UNRESOLVED-TOKEN', 'omar.nasser@example-trading.demo', 'MAIL-SIM-UNRESOLVED-TOKEN'), summary: 'Request {unknown_field}' }), /Resolve all template placeholders/);
    const foreignDocument = state.documents.find(document => document.clientId !== 'CL-001');
    assert.ok(foreignDocument, 'foreign-client sentinel is present');
    assert.throws(() => prototypeStore.addCommunication({ ...makeAttempt('COMM-CROSS-CLIENT-DOC', 'omar.nasser@example-trading.demo', 'MAIL-SIM-CROSS-CLIENT-DOC'), linkedDocumentId: foreignDocument.id }), /same client and engagement/);
    const siblingDocument = state.documents.find(document => document.clientId === 'CL-001' && document.engagementId && document.engagementId !== 'ENG-26001');
    assert.ok(siblingDocument, 'same-client sibling-engagement sentinel is present');
    assert.throws(() => prototypeStore.addCommunication({ ...makeAttempt('COMM-SIBLING-DOC', 'omar.nasser@example-trading.demo', 'MAIL-SIM-SIBLING-DOC'), linkedDocumentId: siblingDocument.id }), /same client and engagement/);
    const internalDocument = state.documents.find(document => document.id === 'VP026-DOC-INTERNAL');
    assert.ok(internalDocument, 'internal-document sentinel is present');
    assert.throws(() => prototypeStore.addCommunication({ ...makeAttempt('COMM-INTERNAL-DOC', 'omar.nasser@example-trading.demo', 'MAIL-SIM-INTERNAL-DOC'), linkedDocumentId: internalDocument.id }), /internal documents cannot be linked/);
    assert.throws(() => prototypeStore.addCommunication(makeAttempt('COMM-BAD', 'not-an-email', 'MAIL-SIM-BAD')), /valid recipient email/);
    assert.throws(() => prototypeStore.addCommunication(makeAttempt('COMM-FOREIGN', 'aisha.saleh@northstar.demo', 'MAIL-SIM-FOREIGN')), /active contact for this client/);
    assert.throws(() => prototypeStore.addCommunication({ ...makeAttempt('COMM-CC-FOREIGN', 'omar.nasser@example-trading.demo', 'MAIL-SIM-CC-FOREIGN'), ccEmails: ['aisha.saleh@northstar.demo'] }), /Every CC recipient must be an active contact for this client/);
    assert.throws(() => prototypeStore.addCommunication({ ...makeAttempt('COMM-CC-DUPLICATE', 'omar.nasser@example-trading.demo', 'MAIL-SIM-CC-DUPLICATE'), ccEmails: ['OMAR.NASSER@EXAMPLE-TRADING.DEMO'] }), /distinct valid email addresses/);
    const siblingEngagement = state.engagements.find(engagement => engagement.id === 'ENG-26002')!;
    siblingEngagement.pbc.push({ id: 'VP026-PBC-SIBLING', title: 'Sibling engagement request', category: 'Evidence', status: 'Requested', due: state.asOfDate, owner: 'Layla Rahman', version: 1 });
    assert.throws(() => prototypeStore.addCommunication({ ...makeAttempt('COMM-REQUEST-SIBLING', 'omar.nasser@example-trading.demo', 'MAIL-SIM-REQUEST-SIBLING'), relatedRequestId: 'VP026-PBC-SIBLING' }), /exact client and engagement/);
    assert.throws(() => prototypeStore.addCommunication({ ...makeAttempt('COMM-BAD-JOB', 'omar.nasser@example-trading.demo', 'MAIL-SIM-BAD-JOB'), jobId: 'MISSING-JOB' }), /job must belong/);
    const job = state.jobs.find(item => item.engagementId === 'ENG-26001')!;
    const first = { ...makeAttempt('COMM-26-1', 'OMAR.NASSER@EXAMPLE-TRADING.DEMO', 'MAIL-SIM-26-1'), jobId: job.id, ccEmails: ['AMAL.NASSER@EXAMPLE-TRADING.DEMO'], relatedRequestId: 'PBC-03' };
    prototypeStore.addCommunication(first);
    assert.equal(first.engagementId, job.engagementId);
    assert.equal(first.recipientEmail, 'omar.nasser@example-trading.demo');
    assert.deepEqual(first.ccEmails, ['amal.nasser@example-trading.demo'], 'CC addresses are normalized and retained only for active same-client contacts');
    assert.throws(() => prototypeStore.addCommunication(makeAttempt('COMM-26-2', 'omar.nasser@example-trading.demo', first.simulationReference)), /unique reference/);
    prototypeStore.addCommunication({ ...makeAttempt('COMM-26-duplicate', 'omar.nasser@example-trading.demo', 'MAIL-SIM-26-duplicate'), simulationSubmissionId: first.simulationSubmissionId });
    assert.equal(state.communications.length, initialCount + 1, 'repeated operation ID is idempotent even when the retry has a fresh record/reference ID');
    prototypeStore.addCommunication(makeAttempt('COMM-26-2', 'omar.nasser@example-trading.demo', 'MAIL-SIM-26-2'));
    assert.equal(state.communications.length, initialCount + 2, 'a second explicit manual send is recorded once as a separate attempt');
    assert.equal(state.m365Config.mailSenderAccount, savedMailConfig.mailSenderAccount, 'denied sender attempts leave the saved mail setup unchanged');
    state.documents.splice(originalDocumentCount);
  });
});

describe('manual communication date and text boundaries (VP-027-E02)', () => {
  it('rejects invalid/future dates and oversized inbound text atomically', () => {
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const record = (overrides: Record<string, unknown> = {}) => ({
      id: 'COMM-VP027-BOUNDARY', clientId: 'CL-001', engagementId: 'ENG-26001', direction: 'Inbound' as const,
      channel: 'Phone' as const, participants: 'Omar Nasser and Layla Rahman', summary: 'Discussed evidence timing',
      body: 'The client confirmed the manual delivery date.', author: state.currentPerson,
      date: `${state.asOfDate}T12:00:00.000Z`, visibility: 'Internal' as const, status: 'Recorded manually' as const,
      ...overrides
    });
    const originalCount = state.communications.length;
    assert.throws(() => prototypeStore.addCommunication(record({ date: '2026-02-30T12:00:00.000Z' })), /date must be valid/);
    assert.throws(() => prototypeStore.addCommunication(record({ date: '2026-09-24T12:00:00.000Z' })), /date must be valid/);
    assert.throws(() => prototypeStore.addCommunication(record({ summary: 'x'.repeat(241) })), /240 characters/);
    assert.throws(() => prototypeStore.addCommunication(record({ participants: 'x'.repeat(501) })), /500 characters/);
    assert.throws(() => prototypeStore.addCommunication(record({ body: 'x'.repeat(5001) })), /5,000 characters/);
    assert.equal(state.communications.length, originalCount, 'invalid input never appends a partial communication');
    prototypeStore.addCommunication(record());
    assert.equal(state.communications.length, originalCount + 1);
    assert.equal(state.communications[0].date, `${state.asOfDate}T12:00:00.000Z`);
    assert.equal(state.communications[0].status, 'Recorded manually');
    setPersona(state, 'Adam Khan');
    assert.throws(() => prototypeStore.addCommunication(record({ id: 'COMM-VP027-PUBLISH-DENIED', visibility: 'Client visible' })), /publish an inbound communication/);
    assert.equal(state.communications.length, originalCount + 1, 'unauthorized publication is rejected atomically');
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.addCommunication(record({ id: 'COMM-VP027-INTERNAL-ATTACHMENT', visibility: 'Client visible', linkedDocumentId: 'DOC-003' })), /internal documents cannot be linked/);
    assert.throws(() => prototypeStore.addCommunication(record({ id: 'COMM-VP027-FOREIGN-ATTACHMENT', linkedDocumentId: 'DOC-AT27-FOREIGN' })), /same client and engagement/);
    assert.equal(state.communications.length, originalCount + 1, 'unsafe document references do not append a partial record');
    prototypeStore.addCommunication(record({ id: 'COMM-VP027-PUBLISH-ALLOWED', visibility: 'Client visible' }));
    assert.equal(state.communications[0].visibility, 'Client visible', 'an authorized manager can explicitly create a client-visible note');
    prototypeStore.addCommunication(record({ id: 'COMM-VP027-SHARED-ATTACHMENT', visibility: 'Client visible', linkedDocumentId: 'DOC-002' }));
    assert.equal(state.communications[0].linkedDocumentId, 'DOC-002', 'a same-client shared document can be linked to the published note');
    const toCorrect = state.communications[0];
    assert.throws(() => prototypeStore.correctCommunication(toCorrect.id, { summary: 'Missing reason' }, ' '), /requires a reason/);
    setPersona(state, 'Adam Khan');
    assert.throws(() => prototypeStore.correctCommunication(toCorrect.id, { summary: 'Unauthorized edit' }, 'Not assigned'), /Only the communication author/);
    assert.equal(toCorrect.summary, 'Discussed evidence timing', 'unauthorized correction leaves the record unchanged');
    setPersona(state, 'Layla Rahman');
    prototypeStore.correctCommunication(toCorrect.id, { summary: 'Corrected evidence timing' }, 'Fix the meeting subject');
    assert.equal(toCorrect.revision, 2);
    assert.deepEqual(toCorrect.correctionHistory?.[0], {
      revision: 1, correctedBy: 'Layla Rahman', correctedByUserId: state.currentUserId,
      correctedAt: toCorrect.correctionHistory?.[0].correctedAt,
      reason: 'Fix the meeting subject',
      previous: { channel: 'Phone', participants: 'Omar Nasser and Layla Rahman', summary: 'Discussed evidence timing', body: 'The client confirmed the manual delivery date.', date: `${state.asOfDate}T12:00:00.000Z`, visibility: 'Client visible', jobId: undefined, linkedDocumentId: 'DOC-002' }
    });
    assert.throws(() => prototypeStore.correctCommunication(toCorrect.id, { date: '2026-09-24T12:00:00.000Z' }, 'Future correction'), /date must be valid/);
    assert.equal(toCorrect.summary, 'Corrected evidence timing', 'invalid correction leaves current revision unchanged');
    assert.equal(toCorrect.correctionHistory?.length, 1, 'invalid correction does not append history');
    assert.throws(() => prototypeStore.correctCommunication('COMM-01', { summary: 'Rewrite a sent attempt' }, 'Not supported'), /Only a manually recorded inbound communication/);
    prototypeStore.addCommunication(record({ id: 'COMM-VP027-VISIBILITY-CHANGE' }));
    const visibilityChange = state.communications[0];
    setPersona(state, 'Adam Khan');
    assert.throws(() => prototypeStore.correctCommunication(visibilityChange.id, { visibility: 'Client visible' }, 'Publish note'), /Only the communication author or a manager\/partner/);
    setPersona(state, 'Layla Rahman');
    prototypeStore.correctCommunication(visibilityChange.id, { visibility: 'Client visible' }, 'Client approved publication');
    assert.equal(visibilityChange.visibility, 'Client visible');
    assert.equal(visibilityChange.correctionHistory?.[0].previous.visibility, 'Internal');
  });
});

describe('time correction lifecycle (AT-28)', () => {
  it('returns, resubmits, approves and corrects time without overwriting prior revisions', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const storeState = (prototypeStore as any).state;
    setPersona(storeState, 'Adam Khan');
    const entry = storeState.times.find((t: any) => t.id === 'TIME-01');
    entry.status = 'Submitted';
    setPersona(storeState, 'Layla Rahman');
    prototypeStore.reviewTimeEntry(entry.id, 'Returned', 'Correct task detail');
    setPersona(storeState, 'Adam Khan');
    prototypeStore.resubmitReturnedTime(entry.id, { taskTitle: entry.taskTitle, durationMinutes: 75, activity: entry.activity, narrative: 'Corrected detail', billable: entry.billable });
    const firstRevision = storeState.times.find((t: any) => t.supersedesId === entry.id);
    assert.equal(entry.status, 'Superseded');
    assert.equal(firstRevision.status, 'Submitted');
    assert.equal(firstRevision.durationMinutes, 75);
    setPersona(storeState, 'Layla Rahman');
    prototypeStore.reviewTimeEntry(firstRevision.id, 'Approved');
    firstRevision.billedInvoiceId = 'INV-AT28-BILLED';
    const billedInvoice: any = { id: 'INV-AT28-BILLED', invoiceNumber: 'INV-AT28-BILLED', clientId: firstRevision.clientId, engagementId: firstRevision.engagementId, currency: 'QAR', amount: 250, status: 'Issued', lines: [{ id: 'LINE-AT28-BILLED', sourceType: 'Time entry', sourceId: firstRevision.id, amount: 250 }] };
    storeState.invoices.push(billedInvoice);
    const billedInvoiceSnapshot = structuredClone(billedInvoice);
    prototypeStore.correctApprovedTime(firstRevision.id, 60, 'Timer rounding correction');
    const correction = storeState.times.find((t: any) => t.supersedesId === firstRevision.id);
    assert.equal(firstRevision.status, 'Superseded');
    assert.equal(correction.status, 'Submitted');
    assert.equal(correction.durationMinutes, 60);
    assert.equal(correction.billedInvoiceId, billedInvoice.id, 'correction retains the consumed invoice link for separate billing review');
    prototypeStore.reviewTimeEntry(correction.id, 'Approved');
    assert.equal(correction.status, 'Approved');
    assert.deepEqual(storeState.invoices.find((invoice: any) => invoice.id === billedInvoice.id), billedInvoiceSnapshot, 'correcting billed time never rewrites the issued invoice');
    assert.equal(storeState.times.filter((t: any) => t.status === 'Approved' && (t.id === correction.id || t.supersedesId)).reduce((sum: number, t: any) => sum + t.durationMinutes, 0), 60);
  });
});

describe('time entry scenario dates and work scope (VP-028)', () => {
  it('rejects invalid and future dates and task links outside the selected job', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const s = (prototypeStore as any).state as PrototypeState;
    setPersona(s, 'Adam Khan');
    const job = s.jobs.find(j => j.engagementId === 'ENG-26001' && j.status !== 'Cancelled')!;
    const task = s.jobTasks.find(t => t.jobId === job.id && t.status !== 'Cancelled')!;
    const entry: any = { id: 'TIME-VP028-SCOPE', person: 'Adam Khan', clientId: job.clientId, engagementId: job.engagementId, jobId: job.id, taskId: task.id, taskTitle: task.title, date: s.asOfDate, durationMinutes: 30, billable: true, activity: 'Audit fieldwork', status: 'Submitted' };
    prototypeStore.addTimeEntry({ ...entry, id: 'TIME-VP028-VALID' });
    assert.throws(() => prototypeStore.addTimeEntry({ ...entry, id: 'TIME-VP028-INVALID-DATE', date: '2026-02-30' }), /valid date/);
    assert.throws(() => prototypeStore.addTimeEntry({ ...entry, id: 'TIME-VP028-FUTURE', date: '2026-09-26' }), /scenario date/);
    const otherJob = { ...job, id: 'JOB-VP028-OTHER', title: 'Separate task scope' };
    const otherTask = { ...task, id: 'TSK-VP028-OTHER', jobId: otherJob.id };
    s.jobs.push(otherJob);
    s.jobTasks.push(otherTask);
    assert.throws(() => prototypeStore.addTimeEntry({ ...entry, id: 'TIME-VP028-CROSS-TASK', taskId: otherTask.id }), /selected job/);
    assert.throws(() => prototypeStore.addTimeEntry({ ...entry, id: 'TIME-VP028-NONPOSITIVE', durationMinutes: 0 }), /positive whole-minute/);
    assert.equal(s.times.some(t => t.id === 'TIME-VP028-VALID'), true);
    assert.equal(s.times.some(t => ['TIME-VP028-INVALID-DATE', 'TIME-VP028-FUTURE', 'TIME-VP028-CROSS-TASK', 'TIME-VP028-NONPOSITIVE'].includes(t.id)), false);
  });
});

describe('adjustment approval lifecycle (AT-38)', () => {
  it('requires an independent technical reviewer and a scoped client management decision', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const storeState = (prototypeStore as any).state;
    setPersona(storeState, 'Adam Khan');
    prototypeStore.addAdjustmentJournal({
      id: 'AJ-LIFECYCLE', engagementId: 'ENG-26001', title: 'Approval lifecycle fixture', status: 'Draft',
      preparedBy: 'Adam Khan', reflectionStatus: 'Not reflected', reflectedInClientBooks: false,
      lines: [
        { accountCode: '5000', accountName: 'Operating expenses', type: 'debit', amount: 100, debit: 100, credit: 0 },
        { accountCode: '1500', accountName: 'Property, plant and equipment', type: 'credit', amount: 100, debit: 0, credit: 100 }
      ]
    });
    setPersona(storeState, 'Omar Nasser');
    assert.throws(() => prototypeStore.recordAdjustmentManagementDecision('AJ-LIFECYCLE', true), /Only technically reviewed/);
    setPersona(storeState, 'Layla Rahman');
    prototypeStore.reviewAdjustmentJournal('AJ-LIFECYCLE', true);
    const reviewed = storeState.adjustmentJournals.find((j: any) => j.id === 'AJ-LIFECYCLE');
    assert.equal(reviewed.status, 'Technical review');
    assert.equal(reviewed.reviewedBy, 'Layla Rahman');
    setPersona(storeState, 'Omar Nasser');
    assert.throws(() => prototypeStore.recordAdjustmentManagementDecision('AJ-LIFECYCLE', false), /requires a management rationale/);
    prototypeStore.recordAdjustmentManagementDecision('AJ-LIFECYCLE', true);
    const accepted = storeState.adjustmentJournals.find((j: any) => j.id === 'AJ-LIFECYCLE');
    assert.equal(accepted.status, 'Management accepted');
    assert.equal(accepted.managementAcceptedBy, 'Omar Nasser');
    setPersona(storeState, 'Layla Rahman');
    assert.throws(() => prototypeStore.updateAdjustmentJournal({ ...accepted, reflectionSourceVersion: 0 }), /current trial-balance source revision/);
    assert.throws(() => prototypeStore.updateAdjustmentJournal({ ...accepted, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1 }), /requires an evidence reference/);
    prototypeStore.updateAdjustmentJournal({ ...accepted, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1, reflectionEvidenceRef: 'TB-IMPORT-REV-1' });
    const reflected = storeState.adjustmentJournals.find((j: any) => j.id === 'AJ-LIFECYCLE');
    assert.equal(reflected.reflectionEvidenceRef, 'TB-IMPORT-REV-1');
    assert.deepEqual(reflected.reflectionHistory.map((entry: any) => [entry.status, entry.sourceVersion, entry.evidenceRef]), [['Not reflected', 1, undefined]]);
    prototypeStore.updateAdjustmentJournal({ ...reflected, reflectionStatus: 'Partially reflected', reflectedInClientBooks: false, reflectionSourceVersion: 1 });
    const reflection = storeState.adjustmentJournals.find((j: any) => j.id === 'AJ-LIFECYCLE');
    assert.equal(reflection.reflectionStatus, 'Partially reflected');
    assert.equal(reflection.reflectionSourceVersion, 1);
    assert.deepEqual(reflection.reflectionHistory.map((entry: any) => [entry.status, entry.sourceVersion, entry.evidenceRef]), [['Not reflected', 1, undefined], ['Reflected in TB', 1, 'TB-IMPORT-REV-1']]);
    setPersona(storeState, 'Adam Khan');
    assert.throws(() => prototypeStore.amendAdjustmentJournal('AJ-LIFECYCLE', { title: 'Amended lifecycle fixture', lines: accepted.lines, rationale: 'Corrected support.' }, ''), /amendment reason is required/);
    assert.throws(() => prototypeStore.amendAdjustmentJournal('AJ-LIFECYCLE', { title: 'Amended lifecycle fixture', lines: [{ ...accepted.lines[0], amount: 200, debit: 200 }, accepted.lines[1]], rationale: 'Corrected support.' }, 'Corrected amount.'), /must balance/);
    const sourceBeforeAmendment = structuredClone(storeState.engagements.find((e: any) => e.id === 'ENG-26001').rows);
    prototypeStore.amendAdjustmentJournal('AJ-LIFECYCLE', { title: 'Amended lifecycle fixture', lines: [{ ...accepted.lines[0], amount: 200, debit: 200 }, { ...accepted.lines[1], amount: 200, credit: 200 }], rationale: 'Revised using the corrected asset schedule.' }, 'Corrected amount from the approved schedule.');
    const amended = storeState.adjustmentJournals.find((j: any) => j.id === 'AJ-LIFECYCLE');
    assert.equal(amended.revision, 2);
    assert.equal(amended.status, 'Draft', 'amendment requires fresh independent review');
    assert.equal(amended.reviewedBy, undefined);
    assert.equal(amended.managementAcceptedBy, undefined);
    assert.equal(amended.reflectionStatus, 'Unknown', 'old reflection decision is stale after content changes');
    assert.equal(amended.amendmentHistory[0].status, 'Management accepted');
    assert.equal(amended.amendmentHistory[0].managementAcceptedBy, 'Omar Nasser');
    assert.equal(amended.amendmentHistory[0].reflectionEvidenceRef, 'TB-IMPORT-REV-1');
    assert.equal(amended.amendmentHistory[0].reason, 'Corrected amount from the approved schedule.');
    assert.deepEqual(storeState.engagements.find((e: any) => e.id === 'ENG-26001').rows, sourceBeforeAmendment, 'amendment never changes client trial-balance rows');
    prototypeStore.addAdjustmentJournal({
      id: 'AJ-REJECT', engagementId: 'ENG-26001', title: 'Rejection lifecycle fixture', status: 'Draft',
      preparedBy: 'Adam Khan', reflectionStatus: 'Not reflected', reflectedInClientBooks: false,
      lines: [
        { accountCode: '5000', accountName: 'Operating expenses', type: 'debit', amount: 50, debit: 50, credit: 0 },
        { accountCode: '1500', accountName: 'Property, plant and equipment', type: 'credit', amount: 50, debit: 0, credit: 50 }
      ]
    });
    setPersona(storeState, 'Layla Rahman');
    prototypeStore.reviewAdjustmentJournal('AJ-REJECT', true);
    setPersona(storeState, 'Omar Nasser');
    assert.throws(() => prototypeStore.recordAdjustmentManagementDecision('AJ-REJECT', false), /requires a management rationale/);
    prototypeStore.recordAdjustmentManagementDecision('AJ-REJECT', false, 'Amount is not supported by the fixed-asset schedule.');
    const rejected = storeState.adjustmentJournals.find((j: any) => j.id === 'AJ-REJECT');
    assert.equal(rejected.status, 'Rejected');
    assert.equal(rejected.managementDecisionNote, 'Amount is not supported by the fixed-asset schedule.');
    setPersona(storeState, 'Amira Qasim');
    assert.throws(() => prototypeStore.recordAdjustmentManagementDecision('AJ-LIFECYCLE', true), /Role "relationship"/);
  });
});

describe('adjustment journal support revision pins (VP-038-E01)', () => {
  const makeJournal = (supportLinks?: any, id = 'AJ-SUPPORT') => ({
    id, engagementId: 'ENG-26001', title: 'Support-linked adjustment', status: 'Draft' as const,
    preparedBy: 'Adam Khan', reflectionStatus: 'Not reflected' as const, reflectedInClientBooks: false,
    rationale: 'Adjust fixed-asset depreciation to the approved schedule.', supportLinks,
    lines: [
      { accountCode: '5000', accountName: 'Operating expenses', type: 'debit' as const, amount: 100, debit: 100, credit: 0 },
      { accountCode: '1500', accountName: 'Property, plant and equipment', type: 'credit' as const, amount: 100, debit: 0, credit: 100 }
    ]
  });

  it('pins exact evidence, workpaper and finding revisions and rejects each stale pin at decisions', () => {
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Adam Khan');
    const evidence = state.evidenceCatalogue.find(item => item.id === 'EVD-02')!;
    const document = state.documents.find(item => item.id === evidence.documentId)!;
    const workpaper = state.engagements.find(item => item.id === 'ENG-26001')!.workpapers.find(item => item.id === 'WP-A1')!;
    const finding = state.findings.find(item => item.id === 'FND-01')!;
    const pins = () => ({
      evidence: { id: evidence.id, evidenceVersion: evidence.version, documentId: document.id, documentVersion: document.version },
      workpaper: { id: workpaper.id, version: workpaper.version },
      finding: { id: finding.id, revision: finding.revision || 1 }
    });
    const originalPins = pins();
    prototypeStore.addAdjustmentJournal(makeJournal(originalPins));
    assert.deepEqual(state.adjustmentJournals.find(item => item.id === 'AJ-SUPPORT')?.supportLinks, originalPins);

    setPersona(state, 'Layla Rahman');
    evidence.version++;
    assert.match(prototypeStore.getAdjustmentSupportIssue('ENG-26001', originalPins) || '', /not adequate at the pinned current evidence/);
    assert.throws(() => prototypeStore.reviewAdjustmentJournal('AJ-SUPPORT', true), /pinned current evidence/);
    evidence.version--;
    workpaper.version++;
    assert.throws(() => prototypeStore.reviewAdjustmentJournal('AJ-SUPPORT', true), /workpaper revision is stale/);
    workpaper.version--;
    finding.revision = 2;
    assert.throws(() => prototypeStore.reviewAdjustmentJournal('AJ-SUPPORT', true), /finding revision is stale/);
    finding.revision = 1;
    prototypeStore.reviewAdjustmentJournal('AJ-SUPPORT', true);

    setPersona(state, 'Omar Nasser');
    finding.revision = 2;
    assert.throws(() => prototypeStore.recordAdjustmentManagementDecision('AJ-SUPPORT', true), /finding revision is stale/);
    finding.revision = 1;
    prototypeStore.recordAdjustmentManagementDecision('AJ-SUPPORT', true);
    const accepted = state.adjustmentJournals.find(item => item.id === 'AJ-SUPPORT')!;
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.updateAdjustmentJournal({ ...accepted, supportLinks: undefined }), /supporting references.*immutable/);

    prototypeStore.updateAdjustmentJournal({ ...accepted, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1, reflectionEvidenceRef: 'TB-IMPORT-REV-1' });
    const reflected = state.adjustmentJournals.find(item => item.id === 'AJ-SUPPORT')!;
    workpaper.version++;
    assert.throws(() => prototypeStore.markAdjustmentJournalReportingIncluded('AJ-SUPPORT'), /workpaper revision is stale/);
    assert.match(prototypeStore.getAdjustmentSupportIssues('ENG-26001')['AJ-SUPPORT'] || '', /workpaper revision is stale/);
    const currentPins = pins();
    const sourceRows = structuredClone(state.engagements.find(item => item.id === 'ENG-26001')!.rows);
    setPersona(state, 'Adam Khan');
    const revisedLines = [
      { ...reflected.lines[0], amount: 110, debit: 110 },
      { ...reflected.lines[1], amount: 110, credit: 110 }
    ];
    prototypeStore.amendAdjustmentJournal('AJ-SUPPORT', { title: 'Support-linked adjustment amended', lines: revisedLines, rationale: reflected.rationale || '', supportLinks: currentPins }, 'Updated to the current workpaper revision.');
    const amended = state.adjustmentJournals.find(item => item.id === 'AJ-SUPPORT')!;
    assert.equal(amended.status, 'Draft');
    assert.deepEqual(amended.supportLinks, currentPins);
    assert.deepEqual(amended.amendmentHistory?.[0].supportLinks, originalPins, 'the predecessor keeps its exact historical pins');
    assert.deepEqual(state.engagements.find(item => item.id === 'ENG-26001')!.rows, sourceRows, 'support-link amendment never mutates source trial-balance rows');
  });

  it('rejects foreign, unavailable, superseded and stale support references atomically', () => {
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Adam Khan');
    const foreignDoc = { ...state.documents.find(item => item.id === 'DOC-002')!, id: 'DOC-FOREIGN', clientId: 'CL-002', engagementId: 'ENG-26002' };
    state.documents.push(foreignDoc);
    state.evidenceCatalogue.push({ ...state.evidenceCatalogue.find(item => item.id === 'EVD-01')!, id: 'EVD-FOREIGN', documentId: foreignDoc.id });
    const foreignFinding = { ...state.findings.find(item => item.id === 'FND-01')!, id: 'FND-FOREIGN', engagementId: 'ENG-26002' };
    state.findings.push(foreignFinding);
    const attempts = [
      { evidence: { id: 'EVD-FOREIGN', evidenceVersion: 1, documentId: 'DOC-FOREIGN', documentVersion: 1 } },
      { workpaper: { id: 'WP-FOREIGN', version: 1 } },
      { finding: { id: 'FND-FOREIGN', revision: 1 } }
    ];
    attempts.forEach((supportLinks, index) => assert.throws(() => prototypeStore.addAdjustmentJournal(makeJournal(supportLinks, `AJ-FOREIGN-${index}`)), /within this engagement|within this engagement|must belong to this engagement/));
    assert.equal(state.adjustmentJournals.some(item => item.id.startsWith('AJ-FOREIGN-')), false, 'rejected support cannot partially create journal records');

    const evidence = state.evidenceCatalogue.find(item => item.id === 'EVD-02')!;
    const document = state.documents.find(item => item.id === evidence.documentId)!;
    const staleEvidence = { evidence: { id: evidence.id, evidenceVersion: evidence.version, documentId: document.id, documentVersion: document.version + 1 } };
    assert.throws(() => prototypeStore.addAdjustmentJournal(makeJournal(staleEvidence, 'AJ-STALE-SUPPORT')), /pinned current evidence/);
    document.brokenLink = true;
    const unavailable = { evidence: { id: evidence.id, evidenceVersion: evidence.version, documentId: document.id, documentVersion: document.version } };
    assert.throws(() => prototypeStore.addAdjustmentJournal(makeJournal(unavailable, 'AJ-UNAVAILABLE-SUPPORT')), /available document/);
    assert.equal(state.adjustmentJournals.some(item => ['AJ-STALE-SUPPORT', 'AJ-UNAVAILABLE-SUPPORT'].includes(item.id)), false);
  });
});

describe('adjustment journal line integrity (VP-038-AC04)', () => {
  it('rejects invalid line types and mixed client, engagement or currency context on create and amendment', () => {
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Adam Khan');
    const lines = [
      { accountCode: '5000', accountName: 'Operating expenses', type: 'debit' as const, amount: 100, debit: 100, credit: 0 },
      { accountCode: '1500', accountName: 'Property, plant and equipment', type: 'credit' as const, amount: 100, debit: 0, credit: 100 }
    ];
    const journal = (id: string, entries: any) => ({
      id, engagementId: 'ENG-26001', title: 'Integrity test adjustment', status: 'Draft' as const,
      preparedBy: 'Adam Khan', reflectionStatus: 'Not reflected' as const, reflectedInClientBooks: false,
      rationale: 'Test that malformed and mixed-context lines are rejected.', lines: entries
    });
    const attempts = [
      lines.map((line, index) => index === 0 ? { ...line, type: 'sideways' } : line),
      lines.map((line, index) => index === 0 ? { ...line, clientId: 'CL-002' } : line),
      lines.map((line, index) => index === 0 ? { ...line, engagementId: 'ENG-26002' } : line),
      lines.map((line, index) => index === 0 ? { ...line, currency: 'USD' } : line),
      lines.map((line, index) => index === 0 ? { ...line, debit: 80, credit: 20 } : line)
    ];
    attempts.forEach((entries, index) => {
      assert.throws(() => prototypeStore.addAdjustmentJournal(journal(`AJ-BAD-LINE-${index}`, entries) as any), /Journal lines must contain/);
    });
    assert.equal(state.adjustmentJournals.some(item => item.id.startsWith('AJ-BAD-LINE-')), false, 'invalid create attempts leave no journal records');

    prototypeStore.addAdjustmentJournal(journal('AJ-AMEND-LINE', lines));
    const prior = state.adjustmentJournals.find(item => item.id === 'AJ-AMEND-LINE')!;
    prior.status = 'Rejected';
    const snapshot = structuredClone(prior);
    attempts.forEach(entries => {
      assert.throws(() => prototypeStore.amendAdjustmentJournal(prior.id, {
        title: 'Invalid mixed-context amendment', rationale: 'Must not be saved.', lines: entries as any
      }, 'Testing line integrity.'), /Amended journal lines must contain/);
    });
    assert.deepEqual(prior, snapshot, 'invalid amendment attempts preserve the rejected journal and its history');
  });
});

describe('evidence adequacy (AT-20/AT-46)', () => {
  it('persists attributable adequacy and requires rationale for deficiency', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Sara Malik');
    assert.throws(
      () => prototypeStore.setEvidenceAdequacy('EVD-01', 'Deficient', ''),
      /rationale/
    );
    prototypeStore.setEvidenceAdequacy('EVD-01', 'Deficient', 'Bank confirmation missing signature page');
    const ev = (prototypeStore as any).state.evidenceCatalogue.find((e: any) => e.id === 'EVD-01');
    assert.equal(ev.adequacyStatus, 'Deficient');
    assert.equal(ev.adequacyHistory.at(-1).rationale, 'Bank confirmation missing signature page');
    prototypeStore.setEvidenceAdequacy('EVD-01', 'Adequate');
    assert.equal(
      (prototypeStore as any).state.evidenceCatalogue.find((e: any) => e.id === 'EVD-01').adequacyStatus,
      'Adequate'
    );
  });

  it('records reasoned evidence unlink history and invalidates cleared dependent work', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    const workpaper = state.engagements.find(item => item.id === 'ENG-26001')!.workpapers.find(item => item.id === 'WP-A1')!;
    const priorWorkpaperVersion = workpaper.version;
    const procedure = state.auditPrograms.flatMap(program => program.procedures).find(item => item.id === 'PRC-01')!;
    procedure.status = 'Cleared';
    procedure.reviewedByUserId = 'reviewer';
    procedure.reviewedAt = '2026-09-23T08:00:00.000Z';
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.unlinkEvidenceProcedure('EVD-01', 'PRC-01', ''), /rationale/);
    prototypeStore.unlinkEvidenceProcedure('EVD-01', 'PRC-01', 'New statement supersedes the prior source.');
    const evidence = state.evidenceCatalogue.find(item => item.id === 'EVD-01')!;
    assert.equal(evidence.linkedProcedures.includes('PRC-01'), false);
    assert.equal(evidence.linkedProcedureHistory?.at(-1)?.reason, 'New statement supersedes the prior source.');
    assert.equal(procedure.status, 'In progress');
    assert.equal(procedure.evidenceReassessmentRequired, true);
    assert.equal(procedure.reviewedAt, undefined);
    assert.equal(workpaper.version, priorWorkpaperVersion, 'removing a procedure relation does not mutate the separate workpaper pin');
  });

  it('links evidence to a current adequate revision and retains link history', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Adam Khan');
    prototypeStore.linkEvidenceProcedure('EVD-01', 'PRC-03');
    const evidence = state.evidenceCatalogue.find(item => item.id === 'EVD-01')!;
    assert.ok(evidence.linkedProcedures.includes('PRC-03'));
    assert.deepEqual(evidence.linkedProcedureHistory?.map(item => [item.procedureId, item.action]), [['PRC-03', 'Linked']]);
    const document = state.documents.find(item => item.id === evidence.documentId)!;
    document.version++;
    assert.throws(() => prototypeStore.linkEvidenceProcedure('EVD-01', 'PRC-02'), /current document revision/);
  });

  it('adequacy changes retain history and stale linked cleared procedures/workpapers', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Sara Malik');
    const procedure = state.auditPrograms.flatMap(program => program.procedures).find(item => item.id === 'PRC-01')!;
    procedure.status = 'Cleared';
    procedure.reviewedByUserId = 'reviewer';
    procedure.reviewedAt = '2026-09-23T08:00:00.000Z';
    const workpaper = state.engagements.find(item => item.id === 'ENG-26001')!.workpapers.find(item => item.id === 'WP-A1')!;
    const priorVersion = workpaper.version;
    const priorHistory = workpaper.clearanceHistory.length;
    prototypeStore.setEvidenceAdequacy('EVD-01', 'Deficient', 'Statement page is incomplete.');
    assert.equal(procedure.status, 'In progress');
    assert.equal(procedure.evidenceReassessmentRequired, true);
    assert.equal(workpaper.status, 'Changes required');
    assert.equal(workpaper.version, priorVersion + 1);
    assert.equal(workpaper.clearanceHistory.length, priorHistory + 1);
  });

  it('retains the exact evidence pin when a document revision supersedes it (AT-20)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const evidence = state.evidenceCatalogue.find(item => item.id === 'EVD-01')!;
    const originalId = evidence.documentId;
    const original = state.documents.find(doc => doc.id === originalId)!;
    const revision = prototypeStore.replaceDocumentRevision(originalId, { name: 'Bank_Statement_December_v2.pdf', size: 42, sha256: 'a'.repeat(64) });
    assert.equal(evidence.documentId, originalId);
    assert.equal(evidence.version, 1);
    assert.equal(state.documents.find(doc => doc.id === originalId)?.name, original.name, 'prior revision remains available');
    assert.equal(revision.version, original.version + 1);
    assert.equal(revision.supersedesDocumentId, originalId);
    const replacementEvidence = state.evidenceCatalogue.find(item => item.documentId === revision.id)!;
    assert.ok(replacementEvidence);
    assert.equal(replacementEvidence.adequacyStatus, 'Pending verification');
    assert.deepEqual(evidence.linkedProcedures, ['PRC-01', 'PRC-02'], 'prior evidence links stay pinned to the prior revision');
    assert.deepEqual(replacementEvidence.linkedProcedures, [], 'replacement starts without inheriting fieldwork links');
    assert.throws(() => prototypeStore.linkWorkpaperEvidence('ENG-26001', 'WP-A1', originalId), /latest document revision/);
    const procedure = state.auditPrograms.flatMap(program => program.procedures).find(item => item.id === 'PRC-01')!;
    assert.equal(procedure.evidenceReassessmentRequired, true);
    assert.equal(procedure.status, 'In progress');
    assert.throws(() => prototypeStore.updateAuditProcedureStatus('ENG-26001', procedure.id, 'Cleared'), /Reassess the changed evidence/);
    assert.throws(() => prototypeStore.updateAuditProcedureStatus('ENG-26001', procedure.id, 'Submitted'), /current adequate evidence/);
    const workpaper = state.engagements[0].workpapers.find(item => item.id === 'WP-A1')!;
    assert.equal(workpaper.status, 'Changes required');
    assert.equal(workpaper.clearance, null);
    assert.equal(workpaper.clearanceHistory.length, 1);
    prototypeStore.setEvidenceAdequacy(replacementEvidence.id, 'Adequate');
    prototypeStore.linkEvidenceProcedure(replacementEvidence.id, procedure.id);
    prototypeStore.unlinkWorkpaperEvidence('ENG-26001', 'WP-A1', originalId, 'Replaced by reviewed current statement.');
    prototypeStore.linkWorkpaperEvidence('ENG-26001', 'WP-A1', revision.id);
    assert.deepEqual(workpaper.evidenceRefs, [revision.id]);
    assert.deepEqual(workpaper.evidenceLinkHistory?.map(item => item.action), ['Unlinked', 'Linked']);
    prototypeStore.updateAuditProcedureExecution('ENG-26001', procedure.id, 'Rechecked the replacement statement.', 'Agrees after reassessment.', '');
    prototypeStore.updateAuditProcedureStatus('ENG-26001', procedure.id, 'Submitted');
    assert.equal(procedure.evidenceReassessmentRequired, false);
    assert.throws(() => prototypeStore.replaceDocumentRevision(originalId, { name: 'duplicate.pdf', size: 1, sha256: 'b'.repeat(64) }), /already has a replacement/);
  });
});

describe('finding lifecycle (VP-054)', () => {
  it('VP-054-AC01/02/03/04: separates gross and signed net amounts by currency and records disposition rationale', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Adam Khan');
    const base = { engagementId: 'ENG-26001', category: 'Monetary misstatement' as const, severity: 'Minor' as const, title: 'FX difference', condition: 'Rate mismatch identified.', recommendation: 'Recalculate at the approved closing rate.', affectedAccount: '1200', assertion: 'Valuation', currency: 'USD' };
    const positiveId = prototypeStore.addFinding({ ...base, amount: 200 });
    prototypeStore.addFinding({ ...base, title: 'Opposite direction difference', amount: -150 });
    const positive = state.findings.find(item => item.id === positiveId)!;
    assert.deepEqual([positive.grossMisstatement, positive.netMisstatement], [200, 200]);
    const qualitativeId = prototypeStore.addFinding({ ...base, title: 'Control gap', category: 'Internal control deficiency', severity: 'Significant', amount: undefined, currency: undefined });
    assert.equal(state.findings.find(item => item.id === qualitativeId)?.grossMisstatement, undefined);
    assert.throws(() => prototypeStore.addFinding({ ...base, title: 'Missing currency', currency: '', amount: 10 }), /ISO currency/);
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.setFindingDisposition(positiveId, 'Corrected in TB', 'Client says it was posted.'), /linked reviewed journal/);
    assert.throws(() => prototypeStore.setFindingDisposition(positiveId, 'Corrected by client', ''), /rationale/);
    prototypeStore.setFindingDisposition(positiveId, 'Corrected by client', 'Management supplied a revised signed schedule.');
    const updated = state.findings.find(item => item.id === positiveId)!;
    assert.equal(updated.disposition, 'Corrected by client');
    assert.equal(updated.managementResponse, undefined, 'disposition rationale is not confused with client response');
    assert.deepEqual(updated.dispositionHistory?.map(item => [item.from, item.disposition, item.rationale]), [['Proposed for correction', 'Corrected by client', 'Management supplied a revised signed schedule.']]);
    const journal = state.adjustmentJournals.find(item => item.id === 'AJ-01')!;
    journal.status = 'Reporting included';
    journal.reflectionStatus = 'Reflected in TB';
    const journalFinding = prototypeStore.addFinding({ ...base, title: 'Linked journal correction', amount: 25, linkedJournalId: journal.id });
    prototypeStore.setFindingDisposition(journalFinding, 'Corrected in TB', 'Reviewed journal AJ-01 is reflected in the trial balance.');
    assert.equal(state.findings.find(item => item.id === journalFinding)?.disposition, 'Corrected in TB');

    const qualitative = state.findings.find(item => item.id === qualitativeId)!;
    const qualitativeProvenance = [qualitative.engagementId, qualitative.category, qualitative.severity, qualitative.amount, qualitative.currency, qualitative.linkedProcedureId, qualitative.linkedEvidenceId, qualitative.linkedWorkpaperId];
    prototypeStore.setFindingDisposition(qualitativeId, 'Uncorrected', 'The control deficiency remains unresolved after client response.');
    prototypeStore.setFindingDisposition(qualitativeId, 'Waived as immaterial', 'A reviewer documented why no adjustment is warranted.');
    const afterDisposition = state.findings.find(item => item.id === qualitativeId)!;
    assert.deepEqual([afterDisposition.engagementId, afterDisposition.category, afterDisposition.severity, afterDisposition.amount, afterDisposition.currency, afterDisposition.linkedProcedureId, afterDisposition.linkedEvidenceId, afterDisposition.linkedWorkpaperId], qualitativeProvenance, 'disposition revisions preserve qualitative classification and exact source provenance');
    assert.deepEqual(afterDisposition.dispositionHistory?.map(item => item.disposition), ['Uncorrected', 'Waived as immaterial'], 'release treatment changes only after a reasoned human disposition');
  });

  it('VP-054-AC01/02: requires scoped source references and preserves the originating sampling exception', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Adam Khan');
    const sample = state.samplePopulations[0];
    sample.items[0].result = 'Exception noted';
    sample.items[0].selected = true;
    const id = prototypeStore.addFinding({ engagementId: sample.engagementId, category: 'Monetary misstatement', severity: 'Significant', title: 'Sample difference', condition: 'Confirmation differs from ledger.', recommendation: 'Investigate and propose correction.', affectedAccount: '1200', assertion: 'Existence', amount: 10, currency: sample.currency, linkedProcedureId: 'PRC-01', linkedEvidenceId: 'EVD-01', linkedSamplePopulationId: sample.id, linkedSampleItemId: sample.items[0].id });
    const finding = state.findings.find(item => item.id === id)!;
    assert.deepEqual([finding.linkedProcedureId, finding.linkedEvidenceId, finding.linkedSampleItemId], ['PRC-01', 'EVD-01', sample.items[0].id]);
    assert.equal(sample.items[0].findingId, id);
    assert.equal(sample.items[0].result, 'Exception noted', 'promotion preserves the original exception');
    assert.throws(() => prototypeStore.addFinding({ engagementId: sample.engagementId, category: 'Monetary misstatement', severity: 'Minor', title: 'Bad link', condition: 'Issue.', recommendation: 'Correct.', affectedAccount: '1200', assertion: 'Existence', amount: 1, currency: 'QAR', linkedProcedureId: 'PRC-OTHER' }), /resolve within this engagement and client/);
  });

  it('keeps unresolved significant findings as an independent release gate', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Adam Khan');
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    Object.assign(engagement, { acceptance: true, terms: true, planning: true, sourceAccepted: true, mappingApproved: true });
    engagement.workpapers.forEach(item => { item.status = 'Not applicable'; item.applicable = false; });
    engagement.reviews.forEach(item => { item.status = 'Cleared'; });
    const findingId = prototypeStore.addFinding({ engagementId: engagement.id, category: 'Internal control deficiency', severity: 'Significant', title: 'Unresolved significant finding', condition: 'Required review control did not operate.', recommendation: 'Implement and evidence a secondary review.', affectedAccount: '1200', assertion: 'Completeness' });
    assert.match(prototypeStore.evaluateReleaseReadiness(engagement.id).reason || '', /Unresolved material findings/);
    setPersona(state, 'Layla Rahman');
    prototypeStore.setFindingDisposition(findingId, 'Uncorrected waived', 'No further adjustment is proposed; the unresolved risk remains documented.');
    assert.doesNotMatch(prototypeStore.evaluateReleaseReadiness(engagement.id).reason || '', /Unresolved material findings/);
  });
});

describe('money guards (AT-30/AT-31/AT-32)', () => {
  it('VP-031 validates invoice references, dates and required account/contact snapshots at the command boundary', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const isolated = (prototypeStore as any).state as PrototypeState;
    setPersona(isolated, 'Leila Hassan');
    isolated.currentRole = 'billing';
    const invoice = {
      id: 'INV-VALIDATION-01', clientId: 'CL-001', eng: 'ENG-26001', engagementId: 'ENG-26001',
      invoiceNumber: ' INV-VALIDATION-01 ', description: 'Valid ad-hoc invoice', amount: 25, paid: 0,
      currency: 'QAR', status: 'Draft' as const, due: '2026-10-01', preparedBy: 'Leila Hassan',
      lines: [{ id: 'LINE-VALIDATION-01', description: 'Consulting', quantity: 1, rate: 25, amount: 25, sourceType: 'Ad hoc' as const }]
    };
    const before = isolated.invoices.length;
    assert.throws(() => prototypeStore.addInvoice({ ...invoice, id: 'INV-EMPTY-REF', invoiceNumber: '   ' }), /Invoice reference is required/);
    assert.throws(() => prototypeStore.addInvoice({ ...invoice, id: 'INV-LONG-REF', invoiceNumber: 'R'.repeat(65) }), /at most 64 characters/);
    assert.throws(() => prototypeStore.addInvoice({ ...invoice, id: 'INV-DUPLICATE-REF', invoiceNumber: ' inv-2026-001 ' }), /unique/);
    assert.throws(() => prototypeStore.addInvoice({ ...invoice, id: 'INV-BAD-DUE', due: '2026-02-30' }), /valid calendar dates/);
    assert.throws(() => prototypeStore.addInvoice({ ...invoice, id: 'INV-BAD-ISSUE', issueDate: '2026-02-30' }), /valid calendar dates/);
    assert.throws(() => prototypeStore.addInvoice({ ...invoice, id: 'INV-DUE-BEFORE-ISSUE', issueDate: '2026-10-02' }), /due date on or after/);
    assert.throws(() => prototypeStore.addInvoice({ ...invoice, id: 'INV-MISSING-BILL-TO', billingDetails: { accountName: ' ', contactName: '' } }), /billing account name and contact name/);
    assert.equal(isolated.invoices.length, before, 'invalid invoice metadata is rejected without inserting a draft');

    prototypeStore.addInvoice(invoice);
    const saved = isolated.invoices.find(item => item.id === invoice.id)!;
    assert.equal(saved.invoiceNumber, 'INV-VALIDATION-01', 'the invoice reference is trimmed before persistence');
    assert.equal(saved.issueDate, isolated.asOfDate, 'an omitted issue date uses the deterministic scenario date');
    assert.equal(saved.billingDetails?.accountName, isolated.clients.find(item => item.id === 'CL-001')?.name);
    assert.equal(saved.billingDetails?.contactName, isolated.clients.find(item => item.id === 'CL-001')?.contact);
    prototypeStore.resetState();
  });

  it('VP-030 invoices approved time at its pinned rate exactly once', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const isolated = (prototypeStore as any).state as PrototypeState;
    setPersona(isolated, 'Leila Hassan');
    isolated.currentRole = 'billing';
    const source = isolated.times.find(time => time.id === 'TIME-01')!;
    const line = { id: 'LINE-TIME-01', description: source.taskTitle, quantity: 3, rate: 200, amount: 600, sourceType: 'Time entry' as const, sourceId: source.id };
    const invoice = { id: 'INV-TIME-01', clientId: source.clientId, eng: source.engagementId, engagementId: source.engagementId, invoiceNumber: 'INV-TIME-01', description: 'Approved time', amount: 600, paid: 0, currency: 'QAR', status: 'Draft' as const, due: '2026-10-31', preparedBy: 'Leila Hassan', lines: [line] };
    prototypeStore.addInvoice(invoice);
    assert.equal(source.billedInvoiceId, invoice.id, 'creating a draft reserves its source');
    assert.throws(() => prototypeStore.addInvoice({ ...invoice, id: 'INV-TIME-02', invoiceNumber: 'INV-TIME-02' }), /not approved, billable, current, and available/);
    assert.equal(source.billedInvoiceId, invoice.id, 'a duplicate attempt cannot move the reservation');
  });

  it('VP-030 accepts reconciled ad-hoc invoice lines and rejects invalid quantities', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const isolated = (prototypeStore as any).state as PrototypeState;
    setPersona(isolated, 'Leila Hassan');
    isolated.currentRole = 'billing';
    const invoice: PrototypeState['invoices'][number] = {
      id: 'INV-ADHOC-01', clientId: 'CL-001', eng: 'ENG-26001', engagementId: 'ENG-26001',
      invoiceNumber: 'INV-ADHOC-01', description: 'Ad-hoc services', amount: 200, paid: 0,
      currency: 'QAR', status: 'Draft' as const, due: '2026-10-31', preparedBy: 'Leila Hassan',
      lines: [
        { id: 'LINE-1', description: 'Consulting', quantity: 1, rate: 100, amount: 100, sourceType: 'Ad hoc' as const },
        { id: 'LINE-2', description: 'Additional review', quantity: 2, rate: 50, amount: 100, sourceType: 'Ad hoc' as const }
      ]
    };
    prototypeStore.addInvoice(invoice);
    assert.equal(isolated.invoices.find(item => item.id === invoice.id)?.amount, 200);
    assert.throws(() => prototypeStore.addInvoice({
      ...invoice, id: 'INV-ADHOC-02', invoiceNumber: 'INV-ADHOC-02',
      lines: [{ id: 'LINE-BAD', description: 'Invalid quantity', quantity: 0, rate: 100, amount: 200, sourceType: 'Ad hoc' }]
    }), /positive quantity/);
  });

  it('VP-031 cancels only an unapproved draft and releases its reserved time source', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const isolated = (prototypeStore as any).state as PrototypeState;
    setPersona(isolated, 'Leila Hassan');
    isolated.currentRole = 'billing';
    const source = isolated.times.find(time => time.id === 'TIME-01')!;
    const line = { id: 'LINE-TIME-CANCEL', description: 'Approved time', quantity: source.durationMinutes / 60, rate: source.billingRatePerHour!, amount: source.durationMinutes / 60 * source.billingRatePerHour!, sourceType: 'Time entry' as const, sourceId: source.id };
    const invoice = { id: 'INV-CANCEL-01', clientId: source.clientId, eng: source.engagementId, engagementId: source.engagementId, invoiceNumber: 'INV-CANCEL-01', description: 'Draft to cancel', amount: line.amount, paid: 0, currency: source.currency!, status: 'Draft' as const, due: '2026-10-31', preparedBy: 'Leila Hassan', lines: [line] };
    prototypeStore.addInvoice(invoice);
    assert.equal(source.billedInvoiceId, invoice.id);
    prototypeStore.cancelInvoiceDraft(invoice.id);
    assert.equal(isolated.invoices.find(item => item.id === invoice.id)?.status, 'Cancelled');
    assert.equal(source.billedInvoiceId, undefined);

    const replacement = { ...invoice, id: 'INV-CANCEL-02', invoiceNumber: 'INV-CANCEL-02', status: 'Draft' as const };
    prototypeStore.addInvoice(replacement);
    assert.equal(source.billedInvoiceId, replacement.id, 'the released source can be deliberately reserved by a replacement draft');
    setPersona(isolated, 'Layla Rahman');
    prototypeStore.reviewInvoice(replacement.id, true);
    assert.throws(() => prototypeStore.cancelInvoiceDraft(replacement.id), /Only unapproved invoice drafts/);
    assert.equal(source.billedInvoiceId, replacement.id, 'approval keeps the source reserved');
  });

  it('VP-030 caps fixed-service billing at the unbilled accepted proposal balance', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const isolated = (prototypeStore as any).state as PrototypeState;
    setPersona(isolated, 'Leila Hassan');
    isolated.currentRole = 'billing';
    const line = { id: 'LINE-FIXED-01', description: 'Accepted proposal fixed-fee services', quantity: 1, rate: 100000, amount: 100000, sourceType: 'Fixed service' as const, sourceId: 'proposal:PROP-001:r2' };
    const invoice = { id: 'INV-FIXED-01', clientId: 'CL-001', eng: 'ENG-26001', engagementId: 'ENG-26001', invoiceNumber: 'INV-FIXED-01', description: 'Remaining accepted fee', amount: 100000, paid: 0, currency: 'QAR', status: 'Draft' as const, due: '2026-10-31', preparedBy: 'Leila Hassan', lines: [line] };
    prototypeStore.addInvoice(invoice);
    assert.equal(isolated.invoices.find(item => item.id === invoice.id)?.lines[0].sourceId, 'proposal:PROP-001:r2');
    assert.throws(() => prototypeStore.addInvoice({ ...invoice, id: 'INV-FIXED-02', invoiceNumber: 'INV-FIXED-02' }), /remaining accepted proposal balance of 0/);
  });

  it('rejects over-allocation and cross-client allocation atomically', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    assert.throws(() => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', 999999), /unallocated/);
    assert.throws(() => prototypeStore.allocateReceipt('RCPT-02', 'INV-26003', 10), /Cross-client/);
  });

  it('credits cannot exceed the remaining creditable amount', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    assert.throws(
      () => prototypeStore.addCreditNote({ id: 'C-X', invoiceId: 'INV-26002', clientId: 'CL-001', creditNumber: 'CRN-X', amount: 999999, reason: 'too big', status: 'Issued', issueDate: '2026-09-23', preparedBy: 'Leila Hassan' }),
      /remaining creditable/
    );
    assert.throws(
      () => prototypeStore.addCreditNote({ id: 'C-X-CLIENT', invoiceId: 'INV-26002', clientId: 'CL-002', creditNumber: 'CRN-X-CLIENT', amount: 1000, reason: 'wrong client', status: 'Draft', issueDate: '2026-09-23', preparedBy: 'Leila Hassan' }),
      /Cross-client credits are rejected/
    );
    assert.throws(
      () => prototypeStore.addCreditNote({ id: 'C-X-CURRENCY', invoiceId: 'INV-26002', clientId: 'CL-001', creditNumber: 'CRN-X-CURRENCY', amount: 1000, currency: 'USD', reason: 'wrong currency', status: 'Draft', issueDate: '2026-09-23', preparedBy: 'Leila Hassan' }),
      /currency must match the invoice currency/
    );
  });

  it('VP-031 revising an approved invoice preserves history and requires fresh approval', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const isolated = (prototypeStore as any).state as PrototypeState;
    setPersona(isolated, 'Leila Hassan');
    const invoice = {
      id: 'INV-REV-01', clientId: 'CL-001', eng: 'ENG-26001', engagementId: 'ENG-26001', invoiceNumber: 'INV-REV-01',
      description: 'Initial accepted fee', amount: 100000, paid: 0, creditsApplied: 0, currency: 'QAR', status: 'Draft' as const,
      due: '2026-10-31', preparedBy: 'Leila Hassan', revision: 1,
      lines: [{ id: 'LINE-REV-01', description: 'Initial accepted fee', quantity: 1, rate: 100000, amount: 100000, sourceType: 'Ad hoc' as const }]
    };
    prototypeStore.addInvoice(invoice);
    setPersona(isolated, 'Layla Rahman');
    prototypeStore.reviewInvoice(invoice.id, true);
    assert.equal(invoice.commercialApproval?.reviewedRevision, 1);
    setPersona(isolated, 'Leila Hassan');
    prototypeStore.reviseInvoiceDraft(invoice.id, {
      description: 'Revised accepted fee', due: '2026-11-15', amount: 120000,
      lines: [{ id: 'LINE-REV-02', description: 'Revised accepted fee', quantity: 1, rate: 120000, amount: 120000, sourceType: 'Ad hoc' }],
      reason: 'Correct the agreed fee before issue.'
    });
    assert.equal(invoice.revision, 2);
    assert.equal(invoice.status, 'Draft');
    assert.equal(invoice.commercialApproval, undefined, 'the prior approval is cleared from the editable current revision');
    assert.equal(invoice.revisionHistory?.[0].amount, 100000);
    assert.equal(invoice.revisionHistory?.[0].editedBy, 'Leila Hassan');
    assert.equal(invoice.commercialApprovalHistory?.[0].revision, 1);
    assert.throws(() => prototypeStore.issueInvoice(invoice.id), /Only the current independently reviewed invoice revision/);
    setPersona(isolated, 'Layla Rahman');
    prototypeStore.reviewInvoice(invoice.id, true);
    assert.equal(invoice.commercialApproval?.reviewedRevision, 2);
    setPersona(isolated, 'Leila Hassan');
    prototypeStore.issueInvoice(invoice.id);
    assert.equal(invoice.status, 'Issued');
    assert.throws(() => prototypeStore.reviseInvoiceDraft(invoice.id, { description: 'Issued edit', due: '2026-11-15', amount: 120000, lines: invoice.lines, reason: 'Must reject issued edits.' }), /Only unissued invoice drafts can be revised/);
  });

  it('VP-031 returns and revises credit notes by revision and requires review of the current revision', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const isolated = (prototypeStore as any).state as PrototypeState;
    const invoice = isolated.invoices.find(item => item.id === 'INV-26002')!;
    setPersona(isolated, 'Leila Hassan');
    isolated.currentRole = 'billing';
    const credit = { id: 'CR-REV-01', invoiceId: invoice.id, clientId: invoice.clientId, creditNumber: 'CR-REV-01', amount: 1000, currency: invoice.currency, reason: 'Initial adjustment', status: 'Draft' as const, issueDate: isolated.asOfDate, preparedBy: isolated.currentPerson };
    prototypeStore.addCreditNote(credit);
    assert.throws(() => prototypeStore.reviewCreditNote(credit.id, false), /requires a reason/);
    setPersona(isolated, 'Layla Rahman');
    prototypeStore.reviewCreditNote(credit.id, false, 'Provide supporting commercial calculation.');
    assert.equal(credit.returnReason, 'Provide supporting commercial calculation.');
    setPersona(isolated, 'Leila Hassan');
    prototypeStore.reviseCreditNote(credit.id, { amount: 1200, reason: 'Revised adjustment with calculation' });
    assert.equal(credit.revision, 3, 'a returned revision advances its persisted credit-note revision');
    assert.equal(credit.reviewedBy, undefined);
    setPersona(isolated, 'Layla Rahman');
    prototypeStore.reviewCreditNote(credit.id, true);
    assert.equal(credit.reviewedRevision, 3, 'independent review pins the revised credit-note revision');
    assert.throws(() => prototypeStore.reviseCreditNote(credit.id, { amount: 1300, reason: 'Attempt after approval' }), /Only a returned draft/);
    assert.equal(invoice.creditsApplied || 0, 0, 'approval and revision do not move or settle money');
  });

  // Isolated Acceptance Reproductions (EX13 - EX18)
  it('EX13: Proposal prevents self approval', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    // PROP-001 preparedBy: 'Amira Qasim'
    addAmiraManagerPersona((prototypeStore as any).state);
    assert.throws(
      () => prototypeStore.reviewProposal('PROP-001', true),
      /commercially approve/
    );
  });

  it('EX14: Client contributor cannot record partner decision', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    (prototypeStore as any).state.currentRole = 'client_finance';
    assert.throws(
      () => prototypeStore.recordApproval('ENG-26001', 'partner'),
      /Only a partner/
    );
  });

  it('EX15: Allocation rejects wrong client/currency/draft invoice', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    // Create draft invoice with same client as RCPT-02
    const rcpt = (prototypeStore as any).state.receipts.find((r: any) => r.id === 'RCPT-02');
    const draftInv = {
      id: 'INV-DRAFT-X', clientId: rcpt.clientId, invoiceNumber: 'INV-DRAFT', amount: 500, paid: 0, currency: 'QAR', status: 'Draft', due: '2026-10-01', lines: []
    };
    (prototypeStore as any).state.invoices.push(draftInv);
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', draftInv.id, 100),
      /Only issued invoices/
    );
    // Cross client
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26003', 10),
      /Cross-client/
    );
  });

  it('EX16: Allocation rejects negative amount', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', -100),
      /positive/
    );
  });

  it('EX17: Allocation rejects amount above invoice outstanding', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    // INV-26002 amount is 85000 QAR
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', 90000),
      /exceeds/
    );
  });

  it('EX18 positive control: rejects exceeding receipt funds', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    const rcpt = (prototypeStore as any).state.receipts.find((r: any) => r.id === 'RCPT-02');
    const unallocated = rcpt.amount - (rcpt.allocatedAmount || 0);
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', unallocated + 1000),
      /exceeds available unallocated/
    );
  });

  it('VP-032 rejects malformed receipts and stale allocation caches atomically', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    setPersona(current, 'Leila Hassan');
    current.currentRole = 'billing';
    const malformed = { id: 'RCP-BAD', clientId: 'CL-001', receiptNumber: 'RCP-BAD', amount: 500, currency: 'QAR', date: '2026-02-30', method: 'Bank transfer' as const, externalRef: '', allocatedAmount: 0, allocations: [] };
    assert.throws(() => prototypeStore.addReceipt(malformed), /valid date/);
    malformed.date = '2026-09-25';
    assert.throws(() => prototypeStore.addReceipt({ ...malformed, allocations: [{ invoiceId: 'INV-26002', amount: 100, allocatedAt: '2026-09-25T00:00:00Z' }], allocatedAmount: 100 }), /start with no allocations/);
    const receiptsBeforeInvalidAmounts = current.receipts.length;
    for (const [index, amount] of [0, -0.01, Number.NaN, Number.POSITIVE_INFINITY, 1.001].entries()) {
      assert.throws(
        () => prototypeStore.addReceipt({ ...malformed, id: `RCP-AMOUNT-${index}`, receiptNumber: `RCP-AMOUNT-${index}`, amount }),
        /finite, positive, and use at most two decimal places/
      );
    }
    assert.equal(current.receipts.length, receiptsBeforeInvalidAmounts, 'invalid receipt amounts do not partially append receipts');
    assert.equal(current.receipts.some(item => item.id === malformed.id), false, 'rejected receipt remains unrecorded');

    const minimumValidReceipt = { ...malformed, id: 'RCP-MIN-CENT', receiptNumber: 'RCP-MIN-CENT', amount: 0.01, method: 'Cash' as const, reference: 'COUNTER-01', notes: 'Recorded from a human-provided receipt.' };
    prototypeStore.addReceipt(minimumValidReceipt);
    assert.equal(current.receipts[0].amount, 0.01, 'the smallest positive two-decimal receipt is accepted');
    assert.equal(current.receipts[0].reference, 'COUNTER-01');
    assert.equal(current.receipts[0].notes, 'Recorded from a human-provided receipt.');

    const invoice = current.invoices.find(item => item.id === 'INV-26002')!;
    const receipt = { id: 'RCP-AT32-STALE', clientId: 'CL-001', receiptNumber: 'RCP-AT32-STALE', amount: 1000, currency: 'QAR', date: '2026-09-25', method: 'Other' as const, externalRef: 'LOCAL-01', allocatedAmount: 0, allocations: [] };
    prototypeStore.addReceipt(receipt);
    receipt.allocatedAmount = 1;
    const paidBefore = invoice.paid;
    assert.throws(() => prototypeStore.allocateReceipt(receipt.id, invoice.id, 100), /allocation balance is stale/);
    assert.equal(receipt.allocations.length, 0);
    assert.equal(invoice.paid, paidBefore, 'stale cache failure does not alter invoice settlement');
  });
});

describe('prototype workflow guards & lifecycle (F03, F04, F05, F06, F13)', () => {
  it('VP-046-AC03: binds group output approval to an independent reviewer and current input fingerprint', () => {
    (prototypeStore as any).state = state;
    state.currentUserId = 'manager'; state.currentRole = 'manager'; state.currentPerson = 'Layla Rahman';
    const group = state.consolidationGroups[0];
    for (const component of group.components) {
      const engagement = state.engagements.find(item => item.id === component.componentId)!;
      component.packageRows = structuredClone(engagement.rows);
      component.packageRevisionPinned = engagement.packageRevision;
      component.status = 'Ready';
      component.packageReview = { componentId: component.componentId, packageRevision: engagement.packageRevision, sourceVersion: engagement.sourceVersion, reportingBasis: 'IFRS', period: group.period, reviewedByUserId: 'reviewer', reviewedAt: new Date().toISOString(), evidenceRef: 'PACKAGE-REVIEW' };
    }
    const fingerprint = JSON.stringify({
      group: [group.id, group.period, group.reportingBasis, group.presentationCurrency || group.currency, group.perimeterRevision || 1],
      components: group.components.map(component => { const source = state.engagements.find(item => item.id === component.componentId); return [component.componentId, component.role, component.ownershipPercent, component.status, component.packageReview, component.packageRevisionPinned, source?.sourceVersion, component.packageRows]; }),
      rates: group.components.map(component => [component.currency, component.currency === (group.presentationCurrency || group.currency) ? 1 : group.fxRates[component.currency], group.fxRateHistory?.[component.currency]?.length || 0]),
      eliminations: group.eliminations.filter(item => item.status === 'Approved').map(item => [item.id, item.revision || 1, item.amount, item.lines, item.approvedPerimeterRevision, item.approvedComponentPins, item.approvedFxRates, item.approvalEvidenceRef])
    });
    prototypeStore.saveConsolidationOutputPackage(group.id, { id: 'GROUP-OUT-TEST', revision: 1, fingerprint, preparedByUserId: state.currentUserId, preparedAt: new Date().toISOString(), evidenceRef: 'GROUP-PREP-01', artifact: { id: 'GROUP-OUT-TEST', name: 'group.json', mimeType: 'application/json', size: 20, sha256: 'a'.repeat(64) }, status: 'Draft', reviewHistory: [] });
    assert.throws(() => prototypeStore.reviewConsolidationOutputPackage(group.id, 'GROUP-OUT-TEST', 'Approved', 'self review', 'REVIEW-01'), /Role .* cannot review consolidated output/);
    state.currentUserId = 'partner'; state.currentRole = 'partner'; state.currentPerson = 'Daniel James';
    prototypeStore.reviewConsolidationOutputPackage(group.id, 'GROUP-OUT-TEST', 'Approved', 'Independent group review', 'GROUP-REVIEW-01');
    assert.equal(group.outputPackages?.[0].approvedFingerprint, fingerprint);
    const altered = structuredClone(group); altered.outputPackages![0].status = 'Returned';
    assert.throws(() => prototypeStore.updateConsolidationGroup(altered, { reason: 'tamper with approval' }), /guarded prepare and independent-review actions/);
    group.fxRates.USD = 3.65;
    assert.throws(() => prototypeStore.reviewConsolidationOutputPackage(group.id, 'GROUP-OUT-TEST', 'Returned', 'stale revision', 'GROUP-REVIEW-02'), /exact group-output revision/);
    group.fxRates.USD = 3.64;
    group.perimeterRevision = 2;
    assert.throws(() => prototypeStore.reviewConsolidationOutputPackage(group.id, 'GROUP-OUT-TEST', 'Returned', 'stale perimeter', 'GROUP-REVIEW-03'), /exact group-output revision/);
    group.perimeterRevision = 1;
    group.components[0].packageRows![0].balance += 1;
    assert.throws(() => prototypeStore.reviewConsolidationOutputPackage(group.id, 'GROUP-OUT-TEST', 'Returned', 'stale component snapshot', 'GROUP-REVIEW-04'), /exact group-output revision/);
    group.components[0].packageRows![0].balance -= 1;
    group.eliminations[0].lines[0].amount += 1;
    assert.throws(() => prototypeStore.reviewConsolidationOutputPackage(group.id, 'GROUP-OUT-TEST', 'Returned', 'stale elimination', 'GROUP-REVIEW-05'), /exact group-output revision/);
  });

  it('VP-043-AC02/AC04: rejects ownership outside the supported wholly owned parent/subsidiary profile', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    const group = state.consolidationGroups[0];
    assert.throws(() => prototypeStore.updateConsolidationGroup({
      ...structuredClone(group),
      components: group.components.map((component: any, index: number) => index === 1 ? { ...component, ownershipPercent: 80 } : component)
    }), /one Parent and one 100% owned Subsidiary/);
    assert.throws(() => prototypeStore.updateConsolidationGroup({
      ...structuredClone(group),
      components: group.components.map((component: any, index: number) => index === 1 ? { ...component, role: 'Associate' } : component)
    }), /one Parent and one 100% owned Subsidiary/);
    const sub = state.engagements.find((engagement: any) => engagement.id === 'ENG-26002');
    const subClient = state.clients.find((client: any) => client.id === sub.client);
    const priorBasis = subClient.accountingProfile.reportingBasis;
    subClient.accountingProfile.reportingBasis = 'Local GAAP';
    assert.throws(() => prototypeStore.updateConsolidationGroup(structuredClone(group), { reason: 'reject mixed reporting bases' }), /incompatible or unselected reporting basis\/period book/);
    subClient.accountingProfile.reportingBasis = priorBasis;
    const tamperedElimination = structuredClone(prototypeStore.getSnapshot().consolidationGroups[0]);
    tamperedElimination.eliminations[0].amount = 1;
    assert.throws(() => prototypeStore.updateConsolidationGroup(tamperedElimination, { reason: 'attempt direct journal mutation' }), /guarded draft and independent-review actions/);
    const pendingReview = structuredClone(group);
    pendingReview.components[1].status = 'Pending';
    delete pendingReview.components[1].packageReview;
    prototypeStore.updateConsolidationGroup(pendingReview, { reason: 'hold pending package review' });
    assert.equal(prototypeStore.getSnapshot().consolidationGroups[0].components[1].status, 'Pending', 'a pending package may be pinned but cannot claim a review');
    const mismatchedSnapshot = structuredClone(prototypeStore.getSnapshot().consolidationGroups[0]);
    mismatchedSnapshot.components[1].packageRows[0].balance += 1;
    assert.throws(() => prototypeStore.updateConsolidationGroup(mismatchedSnapshot), /retain its pinned snapshot or pin the exact current/);
    const newGroup = structuredClone(prototypeStore.getSnapshot().consolidationGroups[0]);
    newGroup.id = 'GRP-02';
    newGroup.name = 'Second supported group';
    prototypeStore.updateConsolidationGroup(newGroup);
    assert.equal(state.consolidationGroups.find((item: any) => item.id === 'GRP-02')?.components[1].packageRevisionPinned, state.engagements.find((item: any) => item.id === 'ENG-26002')?.packageRevision);
  });

  it('VP-043-AC02: rejects invalid consolidation perimeter edits and preserves the recorded perimeter', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    const before = structuredClone(state.consolidationGroups[0]);
    const attempt = (mutate: (group: any) => void, reason = 'test attempt') => {
      const candidate = structuredClone(state.consolidationGroups[0]);
      mutate(candidate);
      return candidate;
    };
    assert.throws(() => prototypeStore.updateConsolidationGroup(attempt(group => { group.components[0].effectiveDate = '2026-02-30'; })), /valid effective date/);
    assert.throws(() => prototypeStore.updateConsolidationGroup(attempt(group => { group.components[1].effectiveDate = 'not-a-date'; })), /valid effective date/);
    assert.throws(() => prototypeStore.updateConsolidationGroup(attempt(group => { group.components[1].componentId = 'ENG-26001'; })), /exactly two distinct/);
    assert.throws(() => prototypeStore.updateConsolidationGroup(attempt(group => {
      group.components[1].componentId = 'ENG-26003';
      group.components[1].packageRevisionPinned = 1;
      group.components[1].packageRows = structuredClone(state.engagements.find((e: any) => e.id === 'ENG-26003').rows);
    })), /does not match the group period/);
    assert.throws(() => prototypeStore.updateConsolidationGroup(attempt(group => { group.components[0].effectiveDate = '2026-01-01'; }), ''), /Record a reason/);
    assert.deepEqual(state.consolidationGroups[0], before, 'failed perimeter edits leave the recorded group untouched');
  });

  it('VP-043-AC01/AC03, VP-045-AC04: versions perimeters, stales eliminations on component change and reverts', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    const seed = structuredClone(state.engagements.find((e: any) => e.id === 'ENG-26002'));
    seed.id = 'ENG-26004';
    state.engagements.push(seed);
    const ownerProfile = state.clients.find((client: any) => client.id === seed.client).accountingProfile;
    const ownerBook = structuredClone(ownerProfile.periodBooks.find((book: any) => book.ownerEngagementId === 'ENG-26002'));
    ownerBook.id = 'PB-ENG-26004';
    ownerBook.ownerEngagementId = 'ENG-26004';
    ownerProfile.periodBooks.push(ownerBook);
    seed.accountingPeriodBookId = ownerBook.id;
    const sourceBefore = structuredClone(state.engagements.map((e: any) => ({ id: e.id, rows: e.rows })));
    const current = () => state.consolidationGroups[0];
    const dated = structuredClone(current());
    dated.components[0].effectiveDate = '2026-01-01';
    dated.components[1].effectiveDate = '2026-03-15';
    prototypeStore.updateConsolidationGroup(dated, { reason: 'Record component effective dates' });
    assert.equal(current().perimeterRevision, 2);
    assert.equal(current().perimeterHistory?.length, 1);
    assert.equal(current().perimeterHistory?.[0].reason, 'Record component effective dates');
    assert.equal(current().eliminations[0].status, 'Draft', 'every perimeter revision requires elimination re-review');
    assert.equal(current().eliminations[0].reviewHistory?.length, 1);
    const swapped = structuredClone(current());
    swapped.components[1] = {
      componentId: 'ENG-26004', role: 'Subsidiary', legalEntityName: 'Northstar Services (Subsidiary)',
      currency: 'QAR', ownershipPercent: 100, packageRevisionPinned: 1,
      packageRows: structuredClone(seed.rows), status: 'Pending',
    };
    prototypeStore.updateConsolidationGroup(swapped, { reason: 'Correct subsidiary to the in-scope 2026 engagement' });
    assert.equal(current().perimeterRevision, 3);
    assert.equal(current().components[1].componentId, 'ENG-26004');
    assert.equal(current().eliminations[0].status, 'Draft', 'component replacement returns approval to draft');
    assert.equal(current().eliminations[0].reviewHistory?.length, 1);
    assert.equal(current().eliminations[0].reviewHistory?.[0].status, 'Returned');
    assert.match(current().eliminations[0].reviewHistory?.[0].note || '', /requires independent re-review/);
    assert.equal(current().eliminations[0].amount, 50000, 'journal content is preserved through staling');
    assert.equal(current().eliminations[0].lines.length, 2);
    prototypeStore.revertConsolidationPerimeter('GRP-01', 2, 'Subsidiary correction was premature');
    assert.equal(current().perimeterRevision, 4);
    assert.equal(current().components[1].componentId, 'ENG-26002');
    assert.equal(current().components[1].effectiveDate, '2026-03-15', 'revert restores the recorded revision content');
    assert.throws(() => prototypeStore.revertConsolidationPerimeter('GRP-01', 9, 'No such revision'), /no recorded history/);
    assert.deepEqual(state.engagements.map((e: any) => ({ id: e.id, rows: e.rows })), sourceBefore, 'perimeter work never mutates engagement trial balances');
  });

  it('VP-045-AC01/AC02/AC04: validates, independently reviews, and stales group elimination journals', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    const group = state.consolidationGroups[0];
    const debit = group.components[0].packageRows.find((row: any) => row.type === 'liability');
    const credit = group.components[1].packageRows.find((row: any) => row.type === 'asset');
    const draft = { id: '', title: 'Intercompany receivable elimination', counterpartyA: group.components[0].componentId, counterpartyB: group.components[1].componentId, amount: 100, currency: group.currency, status: 'Draft', explanation: 'Reconcile reciprocal balances.', evidenceRef: 'IC-REC-01', debitAccount: debit.code, creditAccount: credit.code, lines: [{ account: debit.code, type: 'debit', amount: 100 }, { account: credit.code, type: 'credit', amount: 100 }] };
    assert.throws(() => prototypeStore.saveConsolidationElimination(group.id, { ...draft, lines: [{ ...draft.lines[0], amount: 90 }, draft.lines[1]] } as any, 'unbalanced draft'), /must balance/);
    assert.throws(() => prototypeStore.saveConsolidationElimination(group.id, { ...draft, amount: 0.001, lines: [{ ...draft.lines[0], amount: 0.001 }, { ...draft.lines[1], amount: 0.001 }] } as any, 'fractional cent'), /positive cent amount/);
    assert.throws(() => prototypeStore.saveConsolidationElimination(group.id, { ...draft, lines: [{ ...draft.lines[0], account: 'UNMAPPED' }, draft.lines[1]] } as any, 'unmapped account'), /match an account/);
    const id = prototypeStore.saveConsolidationElimination(group.id, draft as any, 'Create supported group-only journal');
    const saved = group.eliminations.find((item: any) => item.id === id);
    assert.equal(saved.status, 'Draft');
    assert.equal(saved.revision, 1);
    assert.throws(() => prototypeStore.reviewConsolidationElimination(group.id, id, 'Approved', 'Looks good', 'IC-REVIEW-01'), /submitted/);
    prototypeStore.submitConsolidationElimination(group.id, id);
    assert.equal(saved.status, 'Submitted');
    assert.equal(saved.submittedByUserId, state.currentUserId);
    assert.ok(saved.submittedAt);
    assert.throws(() => prototypeStore.saveConsolidationElimination(group.id, { ...draft, id, title: 'Changed after submit' } as any, 'Amend submitted journal'), /locked until an independent reviewer returns/);
    assert.throws(() => prototypeStore.reviewConsolidationElimination(group.id, id, 'Approved', 'Looks good', 'IC-REVIEW-01'), /cannot review their own/);
    prototypeStore.setPersona('reviewer');
    assert.throws(() => prototypeStore.reviewConsolidationElimination(group.id, id, 'Approved', '', 'IC-REVIEW-01'), /rationale and evidence/);
    prototypeStore.reviewConsolidationElimination(group.id, id, 'Approved', 'Reciprocal balances agree to the component package pins.', 'IC-REVIEW-01');
    assert.equal(saved.status, 'Approved');
    assert.equal(saved.approvedPerimeterRevision, 1);
    assert.equal(saved.approvedComponentPins.length, 2);
    assert.equal(saved.approvalEvidenceRef, 'IC-REVIEW-01');
    setPersona(state, 'Layla Rahman');
    const changedPerimeter = structuredClone(group);
    changedPerimeter.components[0].effectiveDate = '2026-01-01';
    prototypeStore.updateConsolidationGroup(changedPerimeter, { reason: 'Change effective date' });
    const stale = state.consolidationGroups[0].eliminations.find((item: any) => item.id === id);
    assert.equal(stale.status, 'Draft');
    assert.equal(stale.amount, 100);
    assert.equal(stale.reviewHistory.at(-1).status, 'Returned');
    assert.equal(stale.approvalEvidenceRef, undefined);
  });

  it('VP-045-E02: a replacement component package preserves the approved journal and requires a fresh review', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    const group = state.consolidationGroups[0];
    group.eliminations = [];
    const debit = group.components[0].packageRows.find((row: any) => row.type === 'liability');
    const credit = group.components[1].packageRows.find((row: any) => row.type === 'asset');
    const draft = { id: '', title: 'Replacement package elimination', counterpartyA: group.components[0].componentId, counterpartyB: group.components[1].componentId, amount: 100, currency: group.currency, status: 'Draft', explanation: 'Eliminate only the matched account pair.', evidenceRef: 'VP45-PKG-01', lines: [{ account: debit.code, type: 'debit', amount: 100 }, { account: credit.code, type: 'credit', amount: 100 }] };
    const before = structuredClone(group);
    assert.throws(() => prototypeStore.saveConsolidationElimination(group.id, { ...draft, counterpartyB: 'ENG-OUTSIDE' } as any, 'Unsupported component pair'), /two distinct component entities/);
    assert.throws(() => prototypeStore.saveConsolidationElimination(group.id, { ...draft, currency: 'USD' } as any, 'Mixed currency'), /group-currency/);
    assert.deepEqual(group, before, 'invalid counterparty/currency attempts do not mutate the group');
    const id = prototypeStore.saveConsolidationElimination(group.id, draft as any, 'Create supported elimination');
    prototypeStore.submitConsolidationElimination(group.id, id);
    prototypeStore.setPersona('reviewer');
    prototypeStore.reviewConsolidationElimination(group.id, id, 'Approved', 'The original pinned package pair agrees.', 'VP45-REVIEW-01');
    const approvedBefore = structuredClone(group.eliminations.find((item: any) => item.id === id));

    const component = group.components[1];
    const replacedEngagement = state.engagements.find((item: any) => item.id === component.componentId);
    replacedEngagement.rows[0].balance += 1;
    replacedEngagement.sourceVersion += 1;
    replacedEngagement.packageRevision += 1;
    const replacement = structuredClone(group);
    const replacementComponent = replacement.components.find((item: any) => item.componentId === component.componentId);
    replacementComponent.packageRevisionPinned = replacedEngagement.packageRevision;
    replacementComponent.packageRows = structuredClone(replacedEngagement.rows);
    replacementComponent.packageReview = { ...replacementComponent.packageReview, componentId: component.componentId, packageRevision: replacedEngagement.packageRevision, sourceVersion: replacedEngagement.sourceVersion, reviewedByUserId: 'reviewer', reviewedAt: '2026-09-27T10:00:00Z', evidenceRef: 'VP45-REPIN-01' };
    replacementComponent.status = 'Ready';
    setPersona(state, 'Layla Rahman');
    prototypeStore.updateConsolidationGroup(replacement, { reason: 'Pin the replacement component source package' });

    const after = state.consolidationGroups[0].eliminations.find((item: any) => item.id === id);
    assert.equal(after.status, 'Draft', 'the prior approval is invalidated when a replacement component package is pinned');
    assert.equal(after.revision, approvedBefore.revision, 'staleness retains the same immutable journal revision');
    assert.deepEqual(after.lines, approvedBefore.lines, 'staleness does not rewrite the approved journal content');
    assert.equal(after.reviewHistory.at(-1).status, 'Returned');
    assert.match(after.reviewHistory.at(-1).note, /perimeter revision/);
    assert.equal(after.approvalEvidenceRef, undefined);
    assert.throws(() => prototypeStore.reviewConsolidationElimination(group.id, id, 'Approved', 'Old approval attempt', 'VP45-STALE-01'), /Only a submitted group elimination/);
  });

  it('rejects consolidation perimeter edits outside manager/partner authority', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Adam Khan');
    const candidate = structuredClone(state.consolidationGroups[0]);
    candidate.components[0].effectiveDate = '2026-01-01';
    assert.throws(() => prototypeStore.updateConsolidationGroup(candidate, { reason: 'preparer attempt' }), /cannot change consolidation groups/);
    assert.throws(() => prototypeStore.revertConsolidationPerimeter('GRP-01', 1, 'preparer attempt'), /cannot change consolidation groups/);
  });

  it('rejects a self-loop component assignment as a duplicate perimeter', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    const before = structuredClone(state.consolidationGroups[0]);
    const loop = structuredClone(state.consolidationGroups[0]);
    loop.components[1].componentId = loop.components[0].componentId;
    assert.throws(() => prototypeStore.updateConsolidationGroup(loop, { reason: 'cycle attempt' }), /exactly two distinct/);
    assert.deepEqual(state.consolidationGroups[0], before, 'a self-loop cannot replace the recorded perimeter');
  });

  it('keeps consolidation group revisions independent across groups', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    const second = structuredClone(state.consolidationGroups[0]);
    second.id = 'GRP-02';
    second.name = 'Second supported group';
    prototypeStore.updateConsolidationGroup(second);
    assert.equal(state.consolidationGroups.find((item: any) => item.id === 'GRP-02')?.perimeterRevision, 1);
    const edited = structuredClone(state.consolidationGroups[0]);
    edited.components[0].effectiveDate = '2026-01-01';
    prototypeStore.updateConsolidationGroup(edited, { reason: 'date revision on GRP-01' });
    assert.equal(state.consolidationGroups.find((item: any) => item.id === 'GRP-01')?.perimeterRevision, 2);
    assert.equal(state.consolidationGroups.find((item: any) => item.id === 'GRP-02')?.perimeterRevision, 1, 'editing one group leaves the other revision unchanged');
  });

  it('rejects narrow-grant perimeter saves without widening component access', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    const dated = structuredClone(state.consolidationGroups[0]);
    dated.components[0].effectiveDate = '2026-01-01';
    prototypeStore.updateConsolidationGroup(dated, { reason: 'seed revision history' });
    setPersona(state, 'Mona Khalil');
    const before = structuredClone(state.consolidationGroups[0]);
    const candidate = structuredClone(state.consolidationGroups[0]);
    candidate.components[0].effectiveDate = '2026-02-01';
    assert.throws(() => prototypeStore.updateConsolidationGroup(candidate, { reason: 'narrow attempt' }), /outside the current scoped grant/);
    assert.throws(() => prototypeStore.revertConsolidationPerimeter('GRP-01', 2, 'narrow attempt'), /outside the current scoped grant/);
    assert.deepEqual(state.consolidationGroups[0], before, 'a denied save discloses and changes nothing');
  });

  it('VP-044-AC03/AC04, VP-045-AC04: version-controls explicit consolidation FX rates and rejects wrong context', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    const group = state.consolidationGroups[0];
    group.components[1].currency = 'USD';
    delete group.fxRates.USD;
    const sourceRows = structuredClone(state.engagements.find((e: any) => e.id === group.components[1].componentId).rows);
    assert.throws(() => prototypeStore.updateConsolidationFxRate(group.id, 'USD', 0, '2026-09-23'), /greater than zero/);
    assert.throws(() => prototypeStore.updateConsolidationFxRate(group.id, 'EUR', 3.9, '2026-09-23'), /used by a group component/);
    assert.throws(() => prototypeStore.updateConsolidationFxRate(group.id, 'USD', 3.64, '2026-02-30'), /valid effective date/);
    prototypeStore.updateConsolidationFxRate(group.id, 'USD', 3.64, '2026-09-23');
    prototypeStore.updateConsolidationFxRate(group.id, 'USD', 3.65, '2026-09-24');
    assert.equal(group.fxRateHistory.USD.length, 2);
    assert.equal(group.fxRateHistory.USD[1].revision, 2);
    assert.equal(group.fxRateHistory.USD[1].purpose, 'Closing');
    assert.equal(group.fxRates.USD, 3.65);
    assert.deepEqual(state.engagements.find((e: any) => e.id === group.components[1].componentId).rows, sourceRows);
  });

  it('versions account mappings, conserves split allocations and requires independent approval', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    (prototypeStore as any).state.accountMappingRevisions = [];
    const eng = prototypeStore.getSnapshot().engagements[0];
    prototypeStore.setPersona('preparer');
    const split = [{ accountCode: eng.rows[0].code, targets: [{ statementLine: 'Cash and cash equivalents', percentage: 60 }, { statementLine: 'Other current assets', percentage: 40 }] }];
    assert.throws(() => prototypeStore.saveAccountMappings(eng.id, [{ ...split[0], targets: [{ statementLine: 'Cash and cash equivalents', percentage: 70 }] }]), /total exactly 100%/);
    assert.throws(() => prototypeStore.saveAccountMappings(eng.id, [{ accountCode: 'missing', targets: [{ statementLine: 'Cash and cash equivalents', percentage: 100 }] }]), /reference unique source accounts/);
    assert.throws(() => prototypeStore.saveAccountMappings(eng.id, [{ accountCode: eng.rows[0].code, targets: [{ statementLine: 'Miscellaneous', percentage: 100 }] }]), /valid statement targets/);
    prototypeStore.saveAccountMappings(eng.id, split);
    (prototypeStore as any).state.accountMappingRevisions[0].preparedBy = 'reviewer';
    prototypeStore.setPersona('reviewer');
    assert.throws(() => prototypeStore.approveAccountMappings(eng.id, 1), /same person cannot review their own work/);
    prototypeStore.setPersona('preparer');
    (prototypeStore as any).state.accountMappingRevisions[0].preparedBy = 'preparer';
    prototypeStore.setPersona('reviewer');
    prototypeStore.approveAccountMappings(eng.id, 1);
    prototypeStore.setPersona('preparer');
    prototypeStore.saveAccountMappings(eng.id, split);
    const history = prototypeStore.getSnapshot().accountMappingRevisions!;
    assert.deepEqual(history.map(item => [item.revision, item.status]), [[1, 'Approved'], [2, 'Draft']]);
    assert.equal(history[0].mappings[0].targets.reduce((sum, item) => sum + item.percentage, 0), 100);
  });

  it('saves statement revisions, requires an independent reviewer, then stales them on source change', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    const engagement = state.engagements.find((item: any) => item.id === 'ENG-26001');
    state.accountMappingRevisions = [];
    prototypeStore.setPersona('preparer');
    const targets: Record<string, string> = { asset: 'Cash and cash equivalents', liability: 'Trade payables', equity: 'Share capital and reserves', revenue: 'Revenue', expense: 'Operating expenses' };
    prototypeStore.saveAccountMappings(engagement.id, engagement.rows.map((row: any) => ({ accountCode: row.code, targets: [{ statementLine: targets[row.type], percentage: 100 }] })));
    prototypeStore.setPersona('reviewer');
    prototypeStore.approveAccountMappings(engagement.id, 1);
    prototypeStore.setPersona('preparer');
    const input = { engagementId: engagement.id, sourceVersion: engagement.sourceVersion, mappingRevision: 1, layoutVersion: 1, totals: { assets: 10, liabilities: 4, equity: 6, revenue: 0, netProfit: 0 }, lines: [{ line: 'Cash and cash equivalents', current: 10, currentSources: ['1000'], comparativeSources: [] }] };
    prototypeStore.saveStatementSetRevision(input);
    const preparer = state.users.find((user: any) => user.id === 'preparer');
    const samePersonReviewer = { ...state.users.find((user: any) => user.id === 'reviewer'), id: 'same-person-reviewer', personId: preparer.personId };
    state.users.push(samePersonReviewer);
    state.roleGrants.push({ userId: samePersonReviewer.id, role: 'reviewer', scopeKind: 'Global' });
    prototypeStore.setPersona(samePersonReviewer.id);
    assert.throws(() => prototypeStore.reviewStatementSetRevision(engagement.id, 1), /same person cannot review their own work/);
    prototypeStore.setPersona('partner');
    prototypeStore.reviewStatementSetRevision(engagement.id, 1);
    assert.equal(prototypeStore.getSnapshot().statementSetRevisions?.[0].status, 'Reviewed');
    prototypeStore.staleStatementRevisionsForComparativeChange(engagement.id, 'ENG-26003');
    assert.equal(prototypeStore.getSnapshot().statementSetRevisions?.[0].status, 'Stale');
    assert.throws(() => prototypeStore.reviewStatementSetRevision(engagement.id, 1), /no longer current/);
    assert.equal(prototypeStore.getSnapshot().statementSetRevisions?.[0].status, 'Stale');
    prototypeStore.setPersona('preparer');
    prototypeStore.updateTrialBalanceRows(engagement.id, engagement.rows.map((row: any, index: number) => ({ ...row, balance: row.balance + (index === 0 ? 1 : 0) })));
    assert.equal(prototypeStore.getSnapshot().statementSetRevisions?.[0].status, 'Stale');
  });

  it('VP-040-AC03/AC04: versions statement layout order, groups and validated subtotals and stales prior output', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    const engagement = state.engagements.find((item: any) => item.id === 'ENG-26001');
    state.accountMappingRevisions = [];
    const targets: Record<string, string> = { asset: 'Cash and cash equivalents', liability: 'Trade payables', equity: 'Share capital and reserves', revenue: 'Revenue', expense: 'Operating expenses' };
    prototypeStore.setPersona('preparer');
    prototypeStore.saveAccountMappings(engagement.id, engagement.rows.map((row: any) => ({ accountCode: row.code, targets: [{ statementLine: targets[row.type], percentage: 100 }] })));
    prototypeStore.setPersona('reviewer');
    prototypeStore.approveAccountMappings(engagement.id, 1);
    prototypeStore.setPersona('preparer');
    const balanceSheetLines = new Set(['Cash and cash equivalents', 'Trade receivables', 'Other current assets', 'Property and equipment', 'Trade payables', 'Borrowings', 'Share capital and reserves']);
    const mappedLines = [...new Set(state.accountMappingRevisions[0].mappings.flatMap((item: any) => item.targets.map((target: any) => target.statementLine)))];
    const layoutLines = mappedLines.map((line: string, index: number) => ({ line, statement: balanceSheetLines.has(line) ? 'bs' as const : 'is' as const, group: balanceSheetLines.has(line) ? 'Balance sheet' : 'Income statement', order: index + 1 }));
    const subtotal = { id: 'ST-SUBTOTAL-1', label: 'Selected performance subtotal', statement: 'is' as const, lineNames: ['Revenue', 'Operating expenses'] };
    const duplicateOrder = layoutLines.map((line: any) => line.statement === 'is' ? { ...line, order: 1 } : line);
    assert.throws(() => prototypeStore.saveStatementLayoutRevision({ engagementId: engagement.id, sourceVersion: engagement.sourceVersion, mappingRevision: 1, lines: duplicateOrder, subtotals: [subtotal] }), /unique within each statement/);
    assert.throws(() => prototypeStore.saveStatementLayoutRevision({ engagementId: engagement.id, sourceVersion: engagement.sourceVersion, mappingRevision: 1, lines: layoutLines, subtotals: [{ ...subtotal, lineNames: ['Cash and cash equivalents'] }] }), /one or more unique lines/);
    assert.equal(prototypeStore.saveStatementLayoutRevision({ engagementId: engagement.id, sourceVersion: engagement.sourceVersion, mappingRevision: 1, lines: layoutLines, subtotals: [subtotal] }), 2);
    const layoutInput: any = { engagementId: engagement.id, sourceVersion: engagement.sourceVersion, mappingRevision: 1, layoutVersion: 2, layout: layoutLines, subtotals: [{ ...subtotal, current: 12, comparative: 10 }], totals: { assets: 10, liabilities: 4, equity: 6, revenue: 12, netProfit: 8 }, lines: layoutLines.map((line: any) => ({ line: line.line, current: 1, currentSources: ['1000'], comparativeSources: [] })) };
    prototypeStore.saveStatementSetRevision(layoutInput);
    state.engagements.find((item: any) => item.id === engagement.id).candidate = { packageRevision: 1 };
    state.engagements.find((item: any) => item.id === engagement.id).approvals.manager = { status: 'Approved' };
    const nextLayout = layoutLines.map((line: any) => ({ ...line, group: `${line.group} revised`, order: line.order + 1 }));
    assert.equal(prototypeStore.saveStatementLayoutRevision({ engagementId: engagement.id, sourceVersion: engagement.sourceVersion, mappingRevision: 1, lines: nextLayout, subtotals: [subtotal] }), 3);
    const savedState = prototypeStore.getSnapshot();
    assert.equal(savedState.statementSetRevisions?.[0].status, 'Stale');
    assert.equal(savedState.engagements.find((item: any) => item.id === engagement.id)?.candidate, null);
    assert.equal(savedState.engagements.find((item: any) => item.id === engagement.id)?.approvals.manager, null);
    assert.throws(() => prototypeStore.saveStatementSetRevision(layoutInput), /current saved layout version/);
  });

  it('VP-041-AC01/AC03: saves evidence-backed cash-flow schedules, requires independent reconciliation, and stales on source replacement', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    state.accountMappingRevisions = [];
    const engagement = state.engagements.find((item: any) => item.id === 'ENG-26001');
    const target = (row: any) => row.code === '1000' ? 'Cash and cash equivalents' : row.type === 'asset' ? 'Other current assets' : row.type === 'liability' ? 'Trade payables' : row.type === 'equity' ? 'Share capital and reserves' : row.type === 'revenue' ? 'Revenue' : 'Operating expenses';
    prototypeStore.setPersona('preparer');
    prototypeStore.saveAccountMappings(engagement.id, engagement.rows.map((row: any) => ({ accountCode: row.code, targets: [{ statementLine: target(row), percentage: 100 }] })));
    prototypeStore.setPersona('reviewer');
    prototypeStore.approveAccountMappings(engagement.id, 1);
    prototypeStore.setPersona('preparer');
    const openingEquity = engagement.rows.filter((row: any) => row.type === 'equity').reduce((sum: number, row: any) => sum + Math.abs(row.balance), 0) - 100000;
    const input = { engagementId: engagement.id, sourceVersion: engagement.sourceVersion, mappingRevision: 1, openingCash: 900000, closingCash: 1000000, openingEquity, movements: [{ id: 'CF-1', description: 'Equity contribution', category: 'Equity contribution' as const, amount: 100000, evidenceRef: 'DOC-002' }, { id: 'CF-2', description: 'Equipment acquired on lease', category: 'Non-cash' as const, amount: 50000, evidenceRef: 'DOC-002' }] };
    assert.throws(() => prototypeStore.saveCashFlowSchedule({ ...input, movements: [{ ...input.movements[0], amount: 1.001 }] }), /cent-accurate/);
    assert.throws(() => prototypeStore.saveCashFlowSchedule({ ...input, movements: [{ ...input.movements[0], amount: -100000 }, input.movements[1]] }), /equity contributions are inflows/);
    prototypeStore.saveCashFlowSchedule(input);
    const preparer = state.users.find((user: any) => user.id === 'preparer');
    const samePersonReviewer = { ...state.users.find((user: any) => user.id === 'reviewer'), id: 'same-person-cash-reviewer', personId: preparer.personId };
    state.users.push(samePersonReviewer);
    state.roleGrants.push({ userId: samePersonReviewer.id, role: 'reviewer', scopeKind: 'Global' });
    prototypeStore.setPersona(samePersonReviewer.id);
    assert.throws(() => prototypeStore.reviewCashFlowSchedule(engagement.id, 1), /same person cannot review their own work/);
    prototypeStore.setPersona('partner');
    prototypeStore.reviewCashFlowSchedule(engagement.id, 1);
    const reviewed = prototypeStore.getSnapshot().engagements.find(item => item.id === engagement.id)?.cashFlowScheduleHistory?.[0];
    assert.equal(reviewed?.status, 'Reviewed');
    assert.equal(reviewed?.movements.filter(item => item.category !== 'Non-cash').reduce((sum, item) => sum + item.amount, 0), 100000);
    assert.equal(validateFixtures(state).some(issue => issue.code === 'CASH_FLOW_REVISION'), false);
    const brokenEvidence = structuredClone(state);
    brokenEvidence.engagements.find((item: any) => item.id === engagement.id).cashFlowScheduleHistory[0].movements[0].evidenceRef = 'DOC-MISSING';
    assert.equal(validateFixtures(brokenEvidence).some(issue => issue.code === 'CASH_FLOW_REVISION'), true, 'recovery validation rejects a persisted broken cash-flow evidence reference');
    prototypeStore.setPersona('preparer');
    prototypeStore.updateTrialBalanceRows(engagement.id, structuredClone(engagement.rows));
    assert.equal(prototypeStore.getSnapshot().engagements.find(item => item.id === engagement.id)?.cashFlowScheduleHistory?.[0].status, 'Stale');
  });

  it('VP-041-AC02/AC03: persists per-note disclosure drafts and requires independent review plus scoped evidence', () => {
    (prototypeStore as any).state = state;
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const priorGeneration = engagement.generation;
    engagement.packageHistory = [{ revision: 1, generation: priorGeneration }] as any;
    engagement.candidate = { id: 'old-candidate' } as any;
    engagement.approvals.manager = { by: 'Manager', byUserId: 'manager', at: '2026-09-20', generation: priorGeneration };
    prototypeStore.setPersona('preparer');
    const input = { id: 'DISC-01', title: 'Significant accounting policies', applicability: 'Applicable' as const, text: 'Revenue is recognized when control transfers.', evidenceRef: 'DOC-002', sharedWithClient: true };
    assert.throws(() => prototypeStore.saveDisclosureReview(engagement.id, { ...input, evidenceRef: undefined }), /content with evidence/);
    prototypeStore.saveDisclosureReview(engagement.id, input);
    assert.throws(() => prototypeStore.reviewDisclosure(engagement.id, input.id, 1), /cannot review financial disclosures/);
    prototypeStore.setPersona('partner');
    prototypeStore.reviewDisclosure(engagement.id, input.id, 1);
    const saved = prototypeStore.getSnapshot().engagements.find(item => item.id === engagement.id)?.disclosureHistory?.[0];
    assert.equal(saved?.status, 'Reviewed');
    assert.notEqual(saved?.preparedByUserId, saved?.reviewedByUserId);
    assert.equal(engagement.generation, priorGeneration + 2, 'saving and independently reviewing disclosure revisions each stale the prior package generation');
    assert.equal(engagement.packageHistory[0].generation, priorGeneration, 'prior package snapshot remains immutable and historical');
    assert.equal(engagement.candidate, null, 'disclosure changes invalidate a frozen release candidate');
    assert.equal(engagement.approvals.manager, null, 'disclosure changes clear generation-bound approval');
    prototypeStore.setPersona('preparer');
    assert.equal(prototypeStore.saveDisclosureReview(engagement.id, { ...input, evidenceRef: 'DOC-MISSING' }), 2);
    prototypeStore.setPersona('partner');
    assert.throws(() => prototypeStore.reviewDisclosure(engagement.id, input.id, 2), /in-scope client document/);
  });

  it('binds a package containing cash flows to the current reviewed schedule revision', () => {
    (prototypeStore as any).state = createInitialState();
    (prototypeStore as any).isSessionOnly = false;
    (prototypeStore as any).persist = () => {};
    const state = (prototypeStore as any).state;
    const engagement = state.engagements.find((item: any) => item.id === 'ENG-26001');
    engagement.cashFlowScheduleHistory = [{ id: `${engagement.id}-CF-1`, engagementId: engagement.id, revision: 1, sourceVersion: engagement.sourceVersion, mappingRevision: 1, openingCash: 900000, closingCash: 1000000, movements: [{ id: 'CF-1', description: 'Equity contribution', category: 'Equity contribution', amount: 100000, evidenceRef: 'DOC-002' }], status: 'Reviewed', preparedByUserId: 'preparer', preparedAt: '2026-09-24T00:00:00Z', reviewedByUserId: 'reviewer', reviewedAt: '2026-09-24T00:01:00Z' }];
    prototypeStore.setPersona('manager');
    const revision = engagement.packageRevision + 1;
    const artifacts = [['XLSX', 'test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['DOCX', 'test.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['PDF', 'test.pdf', 'application/pdf']].map(([kind, name, mimeType]) => ({ id: `${engagement.id}-NEW-${kind}`, kind, name, mimeType, size: 1, sha256: 'a'.repeat(64) }));
    const record = { id: `${engagement.id}-PKG-${revision}`, engagementId: engagement.id, revision, generation: engagement.generation + 1, sourceVersion: engagement.sourceVersion, mappingRevision: 1, notes: 'Test package', noteApplicability: 'Applicable', noteRevision: revision, sections: [{ id: 'cf', title: 'Cash flows', desc: 'Reviewed v1', enabled: true, order: 1 }], validation: { passed: true, trialBalanceNet: 0, pendingWorkpapers: 0, openReviews: 0, materialFindings: 0 }, artifacts, createdAt: '2026-09-24T00:00:00Z', createdBy: 'Layla Rahman', createdByUserId: state.currentUserId };
    assert.throws(() => prototypeStore.saveFinancialPackageRevision(record as any), /valid cash-flow lineage/);
    prototypeStore.saveFinancialPackageRevision({ ...record, cashFlowScheduleRevision: 1 } as any);
    assert.equal(engagement.packageHistory.at(-1).cashFlowScheduleRevision, 1);
    const priorPackageGeneration = engagement.packageHistory.at(-1).generation;
    prototypeStore.saveCashFlowSchedule({ engagementId: engagement.id, sourceVersion: engagement.sourceVersion, mappingRevision: 1, openingCash: 900000, closingCash: 1000000, movements: [{ id: 'CF-2', description: 'Updated contribution support', category: 'Equity contribution', amount: 100000, evidenceRef: 'DOC-002' }] });
    assert.equal(engagement.cashFlowScheduleHistory[0].status, 'Stale', 'support replacement stales the reviewed prior schedule');
    assert.equal(engagement.packageHistory.at(-1).generation, priorPackageGeneration, 'saved package snapshot remains immutable');
    assert.notEqual(engagement.packageHistory.at(-1).generation, engagement.generation, 'support replacement stales package generation');
  });

  it('pins newly assembled package revisions to the exact accepted GL source hash', () => {
    (prototypeStore as any).state = state;
    (prototypeStore as any).isSessionOnly = false;
    (prototypeStore as any).persist = () => {};
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const sourceV1 = { revision: 1, sha256: '1'.repeat(64), transactions: [] };
    engagement.glSourceHistory = [sourceV1] as any;
    setPersona(state, 'Layla Rahman');
    const artifacts = [
      { id: 'PKG-GL-XLSX', name: 'package.xlsx', kind: 'XLSX' as const, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 1, sha256: 'a'.repeat(64) },
      { id: 'PKG-GL-DOCX', name: 'package.docx', kind: 'DOCX' as const, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1, sha256: 'b'.repeat(64) },
      { id: 'PKG-GL-PDF', name: 'package.pdf', kind: 'PDF' as const, mimeType: 'application/pdf', size: 1, sha256: 'c'.repeat(64) }
    ];
    const nextRecord = (revision: number, generation: number, glSourceRevision: number, glSourceSha256: string) => ({
      id: `PKG-GL-${revision}`, engagementId: engagement.id, revision, generation,
      sourceVersion: engagement.sourceVersion, glSourceRevision, glSourceSha256, mappingRevision: 1,
      notes: '', noteRevision: revision, sections: [{ id: 'bs', title: 'Balance sheet', desc: '', enabled: true, order: 1 }],
      validation: { passed: true, trialBalanceNet: 0, pendingWorkpapers: 0, openReviews: 0, materialFindings: 0 },
      artifacts: artifacts.map(artifact => ({ ...artifact, id: `${artifact.id}-${revision}` })), createdAt: '2026-09-26T00:00:00Z', createdBy: state.currentPerson, createdByUserId: state.currentUserId
    });
    assert.throws(() => prototypeStore.saveFinancialPackageRevision(nextRecord(engagement.packageRevision + 1, engagement.generation + 1, 1, 'f'.repeat(64)) as any), /current TB\/GL source/);
    prototypeStore.saveFinancialPackageRevision(nextRecord(engagement.packageRevision + 1, engagement.generation + 1, sourceV1.revision, sourceV1.sha256) as any);
    const prior = engagement.packageHistory.at(-1)!;
    assert.equal(prior.glSourceRevision, 1);
    assert.equal(prior.glSourceSha256, sourceV1.sha256);

    const sourceV2 = { revision: 2, sha256: '2'.repeat(64), transactions: [] };
    engagement.glSourceHistory.push(sourceV2 as any);
    engagement.generation++;
    engagement.candidate = null;
    assert.throws(() => prototypeStore.saveFinancialPackageRevision(nextRecord(engagement.packageRevision + 1, engagement.generation + 1, sourceV1.revision, sourceV1.sha256) as any), /current TB\/GL source/);
    prototypeStore.saveFinancialPackageRevision(nextRecord(engagement.packageRevision + 1, engagement.generation + 1, sourceV2.revision, sourceV2.sha256) as any);
    assert.equal(engagement.packageHistory.at(-1)?.glSourceRevision, 2);
    assert.equal(engagement.packageHistory.at(-1)?.glSourceSha256, sourceV2.sha256);
    assert.equal(engagement.packageHistory[0].glSourceSha256, sourceV1.sha256, 'accepted predecessor package source hash remains immutable');
  });

  it('risk and procedure links are reciprocal and engagement scoped (VP-049-AC01/AC03/AC04)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    prototypeStore.setAuditRiskProcedureLink('ENG-26001', 'RSK-01', 'PRC-03', true);
    const current = (prototypeStore as any).state;
    assert.ok(current.auditRisks.find((risk: any) => risk.id === 'RSK-01').linkedProcedureIds.includes('PRC-03'));
    assert.ok(current.auditPrograms.flatMap((program: any) => program.procedures).find((procedure: any) => procedure.id === 'PRC-03').linkedRiskIds.includes('RSK-01'));
    assert.throws(() => prototypeStore.setAuditRiskProcedureLink('ENG-26002', 'RSK-01', 'PRC-03', true), /both belong to the selected engagement/);
    const secondaryRiskId = prototypeStore.createAuditRisk('ENG-26001', { title: 'AT49 additional receivables risk', area: 'Revenue & Receivables', assertions: ['Completeness', 'Accuracy'], description: 'Test a second risk sharing the same substantive procedure.', rationale: 'A separate risk factor affects the selected assertions.', response: 'Extend the shared procedure for the additional risk.', owner: current.auditRisks.find((risk: any) => risk.id === 'RSK-01').owner, rating: 'Medium', linkedProcedureIds: ['PRC-03'] });
    const procedure = current.auditPrograms.flatMap((program: any) => program.procedures).find((item: any) => item.id === 'PRC-03');
    assert.ok(procedure.linkedRiskIds.includes('RSK-01') && procedure.linkedRiskIds.includes(secondaryRiskId) && procedure.linkedRiskIds.length >= 2, 'one procedure can retain reciprocal links to multiple risks');
    const procedureSnapshot = { id: procedure.id, title: procedure.title, instructions: procedure.instructions, requiredEvidence: procedure.requiredEvidence };
    const templateSnapshots = structuredClone(current.auditProgramTemplates || []);
    const engagement = current.engagements.find((item: any) => item.id === 'ENG-26001');
    prototypeStore.saveAuditPlan({ id: 'PLAN-ENG-26001-V1', engagementId: engagement.id, version: 1, status: 'Under review', benchmark: 'revenue', benchmarkValue: 2_000_000, materialityRate: 1.5, performanceMaterialityRate: 75, clearlyTrivialRate: 5, overallMateriality: 30_000, performanceMateriality: 22_500, clearlyTrivialThreshold: 1_500, rationales: ['Initial plan basis.'], teamAllocations: [{ person: 'Layla Rahman', role: 'Engagement Manager', scheduledStart: '2026-09-25', scheduledEnd: '2026-10-31' }], timingMilestones: [], significantAreas: ['Revenue & Receivables'] });
    prototypeStore.setPersona('reviewer');
    prototypeStore.reviewAuditPlan('PLAN-ENG-26001-V1', true, 'Approved initial risk response.');
    prototypeStore.setPersona('manager');
    procedure.status = 'Cleared'; procedure.workPerformed = 'Prior approved testing'; procedure.conclusion = 'No exception'; procedure.evidenceLimitation = 'Current evidence requires reassessment.'; procedure.reviewedByUserId = 'reviewer'; procedure.reviewedAt = '2026-09-23T00:00:00.000Z';
    const risk = current.auditRisks.find((item: any) => item.id === 'RSK-01');
    const priorResponse = risk.response;
    prototypeStore.updateAuditRisk('ENG-26001', risk.id, { title: risk.title, area: risk.area, assertions: risk.assertions, description: risk.description, rationale: risk.rationale, response: `${risk.response} Reassess supporting detail.`, owner: risk.owner, rating: risk.rating });
    assert.equal(risk.revisions.length, 1);
    assert.equal(risk.revisions[0].response, priorResponse);
    assert.equal(risk.revisions[0].changedBy, 'Layla Rahman');
    assert.deepEqual(risk.revisions[0].assertions, risk.assertions);
    assert.equal(risk.revisions[0].reviewImpact, 'Risk RSK-01 changed; audit plan v2 requires independent review.');
    assert.deepEqual(current.auditPlans.map((plan: any) => plan.status), ['Superseded', 'Under review']);
    assert.equal(current.auditPlans[0].reviewNotes, 'Approved initial risk response.');
    assert.match(current.auditPlans[0].supersededReason, /requires independent review/);
    assert.match(current.auditPlans[1].rationales.at(-1), /Risk RSK-01 changed/);
    assert.equal(engagement.planning, false);
    assert.equal(procedure.status, 'In progress');
    assert.equal(procedure.scopeReassessmentRequired, true);
    assert.equal(procedure.reviewedByUserId, undefined);
    assert.equal(procedure.scopeReassessmentHistory[0].previousStatus, 'Cleared');
    assert.throws(() => prototypeStore.updateAuditProcedureStatus(engagement.id, procedure.id, 'Submitted'), /re-record this procedure/);
    prototypeStore.setPersona('reviewer');
    prototypeStore.reviewAuditPlan('PLAN-ENG-26001-V2', true, 'Reviewed risk-driven plan revision.');
    assert.equal(current.auditPlans[1].status, 'Approved');
    assert.equal(engagement.planning, true);
    prototypeStore.setPersona('manager');
    prototypeStore.updateAuditProcedureExecution(engagement.id, procedure.id, 'Reassessed the shared procedure for RSK-01 and the additional receivables risk.', 'Both risk responses are addressed by current evidence.', 'Current evidence was rechecked after the risk-driven plan revision.');
    prototypeStore.updateAuditProcedureStatus(engagement.id, procedure.id, 'Submitted');
    prototypeStore.setPersona('reviewer');
    prototypeStore.updateAuditProcedureStatus(engagement.id, procedure.id, 'Cleared');
    assert.equal(procedure.status, 'Cleared', 'independent reviewer clears the reassessed shared procedure');
    prototypeStore.setPersona('manager');
    const secondaryRisk = current.auditRisks.find((item: any) => item.id === secondaryRiskId);
    prototypeStore.updateAuditRisk(engagement.id, secondaryRiskId, { title: secondaryRisk.title, area: secondaryRisk.area, assertions: secondaryRisk.assertions, description: secondaryRisk.description, rationale: secondaryRisk.rationale, response: `${secondaryRisk.response} Add a targeted cut-off sample.`, owner: secondaryRisk.owner, rating: secondaryRisk.rating, linkedProcedureIds: secondaryRisk.linkedProcedureIds });
    assert.deepEqual(current.auditPlans.map((plan: any) => plan.status), ['Superseded', 'Superseded', 'Under review'], 'a second risk change supersedes the reviewed plan and creates the next review revision');
    assert.match(current.auditPlans[2].rationales.at(-1), new RegExp(secondaryRiskId));
    assert.match(current.auditPlans[1].rationales.at(-1), /Risk RSK-01 changed/, 'earlier plan revision retains its original rationale snapshot');
    assert.equal(procedure.status, 'In progress');
    assert.equal(procedure.scopeReassessmentHistory.length, 2, 'repeated risk changes retain both reassessment events');
    assert.deepEqual(procedure.scopeReassessmentHistory.map((item: any) => item.previousStatus), ['Cleared', 'Cleared']);
    assert.ok(procedure.linkedRiskIds.includes('RSK-01') && procedure.linkedRiskIds.includes(secondaryRiskId));
    prototypeStore.updateAuditProcedureExecution(engagement.id, procedure.id, 'Reworked after the second risk response update.', 'Updated work covers both linked risks.', 'No limitation remains after the targeted reassessment.');
    prototypeStore.updateAuditProcedureStatus(engagement.id, procedure.id, 'Submitted');
    prototypeStore.setPersona('reviewer');
    prototypeStore.updateAuditProcedureStatus(engagement.id, procedure.id, 'In progress', 'Add the requested cut-off sample and clarify the additional risk response.');
    assert.equal(procedure.returnReason, 'Add the requested cut-off sample and clarify the additional risk response.');
    assert.equal(procedure.status, 'In progress', 'reviewer return reopens the procedure for preparer rework');
    prototypeStore.setPersona('manager');
    prototypeStore.updateAuditProcedureExecution(engagement.id, procedure.id, 'Added the requested cut-off sample and clarified the shared risk response.', 'The expanded sample supports both risk responses.', 'No limitation remains.');
    prototypeStore.updateAuditProcedureStatus(engagement.id, procedure.id, 'Submitted');
    prototypeStore.setPersona('reviewer');
    prototypeStore.updateAuditProcedureStatus(engagement.id, procedure.id, 'Cleared');
    assert.equal(procedure.status, 'Cleared', 'returned work can be reworked, resubmitted and independently cleared');
    assert.equal(procedure.scopeReassessmentHistory.length, 2, 'rework preserves prior reassessment history');
    assert.deepEqual({ id: procedure.id, title: procedure.title, instructions: procedure.instructions, requiredEvidence: procedure.requiredEvidence }, procedureSnapshot, 'risk reassessment does not rewrite the pinned procedure instructions');
    assert.deepEqual(current.auditProgramTemplates || [], templateSnapshots, 'risk reassessment does not rewrite reusable template revisions');
    prototypeStore.resetState();
  });

  it('VP-049-E02/AC04: risk owners must be active professional staff with selected-engagement access', async () => {
    state = structuredClone(createInitialState());
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const risk = state.auditRisks.find(item => item.id === 'RSK-01')!;
    const changes = {
      title: risk.title, area: risk.area, assertions: [...risk.assertions], description: risk.description,
      rationale: risk.rationale, response: risk.response, owner: risk.owner, rating: risk.rating,
      linkedProcedureIds: [...risk.linkedProcedureIds]
    };
    const before = structuredClone(risk);
    const eligibleNames = eligibleAuditRiskOwners(state, 'ENG-26001').map(user => user.name);
    assert.ok(eligibleNames.includes('Adam Khan'));
    assert.ok(!eligibleNames.some(name => state.users.some(user => user.name === name && user.group === 'Client')));

    const clientUser = state.users.find(user => user.group === 'Client' && user.status === 'Active')!;
    assert.throws(() => prototypeStore.updateAuditRisk('ENG-26001', risk.id, { ...changes, owner: clientUser.name }), /active in-scope professional owner/);

    const outOfScopeOwner = { ...state.users.find(user => user.id === 'preparer')!, id: 'preparer-eng-26002', name: 'Out-of-scope preparer' };
    state.users.push(outOfScopeOwner);
    state.roleGrants.push({ userId: outOfScopeOwner.id, role: outOfScopeOwner.role, scopeKind: 'Engagement', scopeId: 'ENG-26002' });
    assert.ok(!eligibleAuditRiskOwners(state, 'ENG-26001').some(user => user.id === outOfScopeOwner.id));
    assert.throws(() => prototypeStore.updateAuditRisk('ENG-26001', risk.id, { ...changes, owner: outOfScopeOwner.name }), /active in-scope professional owner/);

    const inactiveName = 'Mariam Saeed';
    const inactive = state.users.find(user => user.name === inactiveName)!;
    inactive.status = 'Inactive';
    assert.throws(() => prototypeStore.updateAuditRisk('ENG-26001', risk.id, { ...changes, owner: inactiveName }), /active in-scope professional owner/);

    assert.deepEqual(risk, before, 'rejected owner assignments leave the risk and its links unchanged');
    assert.equal(state.auditPlans?.length ?? 0, 0, 'rejected owner assignments do not create or stale a plan');
    prototypeStore.resetState();
  });

  it('audit program templates preserve revisions and apply fresh work (VP-049-AC02/AC03/AC04)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    const template = { name: 'Revenue verification', area: 'Revenue & Receivables', description: 'Test recorded revenue.', procedures: [{ title: 'Trace transactions', objective: 'Confirm occurrence', instructions: 'Trace to invoices.', defaultAssertions: ['Occurrence'], requiredEvidenceType: 'Invoice' }] };
    assert.throws(() => prototypeStore.createAuditProgramTemplate({ ...template, area: 'Payroll' }), /supported audit area/);
    const id = prototypeStore.createAuditProgramTemplate(template);
    assert.throws(() => prototypeStore.applyAuditProgramTemplate('ENG-26001', id), /Published audit program template not found/);
    prototypeStore.publishAuditProgramTemplate(id);
    const programId = prototypeStore.applyAuditProgramTemplate('ENG-26001', id);
    const applied = (prototypeStore as any).state.auditPrograms.find((item: any) => item.id === programId);
    assert.equal(applied.sourceTemplateVersion, 1);
    assert.equal(applied.procedures[0].status, 'Not started');
    assert.equal(applied.procedures[0].workPerformed, '');
    prototypeStore.updateAuditProcedureExecution('ENG-26001', applied.procedures[0].id, 'Version one inspection completed.', 'The selected invoices agree to source records.', 'Evidence limitation documented for this isolated lifecycle check.');
    prototypeStore.updateAuditProcedureStatus('ENG-26001', applied.procedures[0].id, 'Submitted');
    assert.deepEqual(applied.procedures[0].history.map((entry: any) => [entry.programId, entry.sourceTemplateId, entry.sourceTemplateVersion]), [[programId, id, 1], [programId, id, 1]], 'history entries retain the applied template v1 context');
    prototypeStore.reviseAuditProgramTemplate(id, { ...template, description: 'Updated purpose.' });
    assert.equal((prototypeStore as any).state.auditProgramTemplates.find((item: any) => item.id === id).status, 'Draft');
    assert.equal((prototypeStore as any).state.auditProgramTemplateHistory[0].status, 'Published');
    assert.throws(() => prototypeStore.applyAuditProgramTemplate('ENG-26001', id), /Published audit program template not found/);
    prototypeStore.publishAuditProgramTemplate(id);
    const secondProgramId = prototypeStore.applyAuditProgramTemplate('ENG-26001', id);
    const appliedV2 = (prototypeStore as any).state.auditPrograms.find((item: any) => item.id === secondProgramId);
    prototypeStore.updateAuditProcedureExecution('ENG-26001', appliedV2.procedures[0].id, 'Version two inspection completed.', 'Revised instructions were followed and supported.', '');
    assert.equal(appliedV2.procedures[0].history[0].sourceTemplateVersion, 2, 'a procedure created from template v2 records its own version context');
    assert.notEqual(appliedV2.procedures[0].id, applied.procedures[0].id, 'template revisions create distinct procedure histories');
    prototypeStore.retireAuditProgramTemplate(id);
    assert.throws(() => prototypeStore.applyAuditProgramTemplate('ENG-26001', id), /Published audit program template not found/);
    assert.equal((prototypeStore as any).state.auditProgramTemplates.find((item: any) => item.id === id).status, 'Retired');
    assert.equal(applied.sourceTemplateVersion, 1);
    assert.equal(applied.procedures[0].instructions, 'Trace to invoices.');
    assert.equal(appliedV2.sourceTemplateVersion, 2);
    assert.equal(appliedV2.procedures[0].history[0].sourceTemplateId, id);
  });

  it('EQR sign-off blocked when unresolved EQR concerns exist (VP-056 / F03)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Dr. Tariq Al-Sayed');
    (prototypeStore as any).state.currentRole = 'eqr';

    const eng = (prototypeStore as any).state.engagements[0];
    eng.eqrConcerns = [
      { id: 'EQR-99', text: 'Unresolved going concern inquiry', resolved: false, raisedBy: 'Layla Rahman', raisedAt: new Date().toISOString() }
    ];

    assert.throws(
      () => prototypeStore.recordApproval(eng.id, 'eqr', 'Signoff attempt'),
      /Unresolved EQR concerns/
    );

    // An independent manager responds; the EQR then reviews the response.
    const manager = (prototypeStore as any).state.users.find((u: any) => u.role === 'manager' && u.name !== 'Layla Rahman');
    assert.ok(manager);
    (prototypeStore as any).state.currentUserId = manager.id;
    (prototypeStore as any).state.currentPerson = manager.name;
    (prototypeStore as any).state.currentRole = manager.role;
    prototypeStore.respondEqrConcern(eng.id, 'EQR-99', 'Reviewed against the updated going concern forecast.');
    setPersona((prototypeStore as any).state, 'Dr. Tariq Al-Sayed');
    prototypeStore.toggleEqrConcern(eng.id, 'EQR-99');
    assert.strictEqual(eng.eqrConcerns[0].resolved, true);
    prototypeStore.recordApproval(eng.id, 'eqr', 'Cleared after resolution');
    assert.ok(eng.approvals.eqr);
  });

  it('VP-056 binds EQR assignment and management acknowledgement to one engagement revision', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    const first = current.engagements.find(item => item.id === 'ENG-26001')!;
    const second = current.engagements.find(item => item.id === 'ENG-26002')!;
    first.approvals.eqr = { by: 'Dr. Tariq Al-Sayed', byUserId: 'eqr', at: '2026-09-23T00:00:00Z', generation: first.generation };
    first.approvalHistory = [{ role: 'eqr', by: 'Dr. Tariq Al-Sayed', byUserId: 'eqr', at: '2026-09-23T00:00:00Z', generation: first.generation }];
    const secondBefore = structuredClone({ generation: second.generation, approvals: second.approvals, concerns: second.eqrConcerns });
    setPersona(current, 'Layla Rahman');
    prototypeStore.assignEqrReviewer(first.id, 'eqr-2', 'Original reviewer unavailable');
    assert.equal(first.approvals.eqr, null);
    assert.equal(first.approvalHistory?.length, 1);
    assert.equal(first.eqrAssignmentHistory?.[0].reason, 'Original reviewer unavailable');
    assert.deepEqual({ generation: second.generation, approvals: second.approvals, concerns: second.eqrConcerns }, secondBefore);
    setPersona(current, 'Dr. Tariq Al-Sayed');
    assert.throws(() => prototypeStore.recordApproval(first.id, 'eqr', 'Old reviewer'), /currently assigned EQR/);
    setPersona(current, 'Dr. Samira Noor');
    prototypeStore.recordApproval(first.id, 'eqr', 'Independent review complete');
    assert.equal(first.approvals.eqr?.byUserId, 'eqr-2');

    seedPackageDefinition(first);
    setPersona(current, 'Layla Rahman');
    prototypeStore.presentManagementPackage(first.id);
    setPersona(current, 'Omar Nasser');
    prototypeStore.recordManagementPackageDecision(first.id, 'Acknowledged', 'Reviewed the presented package', 'MIN-123');
    assert.equal(first.managementPackageDecision?.decision, 'Acknowledged');
    assert.equal(first.managementPackageDecision?.packageRevision, first.packageRevision);
    const priorDecision = structuredClone(first.managementPackageDecision);
    first.generation++;
    assert.throws(() => prototypeStore.recordManagementPackageDecision(first.id, 'Acknowledged', 'Reconfirm', 'MIN-124'), /no current package deliberately presented/);
    assert.deepEqual(first.managementPackageDecision, priorDecision, 'a source generation change stales but never relabels the prior decision');
  });

  it('acceptance recommendation stays pending until the assigned independent partner decides', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    const eng = current.engagements[0];
    eng.acceptance = false;
    setPersona(current, 'Hana Ali');
    assert.throws(() => prototypeStore.saveAcceptanceCase({
      id: `ACC-${eng.client}-${eng.year}`, clientId: eng.client, year: eng.year, service: eng.service,
      riskRating: 'Low', independenceConfirmed: true, amlKycCompleted: true, conflictsCleared: true,
      prohibitionsChecked: true, competenceConfirmed: true, conditions: [], recommendationBy: '',
      recommendationDate: '', recommendationNotes: 'Checks reviewed; recommend acceptance.', decisionStatus: 'Accepted'
    }), /evidence reference/);
    prototypeStore.saveAcceptanceCase({
      id: `ACC-${eng.client}-${eng.year}`, clientId: eng.client, year: eng.year, service: eng.service,
      riskRating: 'Low', independenceConfirmed: true, amlKycCompleted: true, conflictsCleared: true,
      prohibitionsChecked: true, competenceConfirmed: true, screeningEvidence: { amlKyc: 'KYC-101', independence: 'IND-101', conflicts: 'COI-101', prohibitions: 'ROT-101', competence: 'COMP-101' }, conditions: [], recommendationBy: '',
      recommendationDate: '', recommendationNotes: 'Checks reviewed; recommend acceptance.', decisionStatus: 'Accepted'
    });
    assert.equal(prototypeStore.getSnapshot().acceptanceCases?.[0].decisionStatus, 'Pending');
    assert.equal(prototypeStore.getSnapshot().acceptanceCases?.[0].history?.[0].screeningEvidence?.amlKyc, 'KYC-101');
    setPersona(current, 'Daniel James');
    const prohibitedCase = { ...prototypeStore.getSnapshot().acceptanceCases![0], riskRating: 'Prohibited' as const };
    setPersona(current, 'Hana Ali');
    prototypeStore.saveAcceptanceCase(prohibitedCase);
    setPersona(current, 'Daniel James');
    assert.throws(() => prototypeStore.decideAcceptanceCase(`ACC-${eng.client}-${eng.year}`, 'Accepted', 'Prohibited mandate.'), /mandate is not prohibited/);
    assert.equal(prototypeStore.getSnapshot().acceptanceCases?.[0].decisionStatus, 'Pending');
    setPersona(current, 'Hana Ali');
    prototypeStore.saveAcceptanceCase({ ...prohibitedCase, riskRating: 'Low' });
    setPersona(current, 'Daniel James');
    prototypeStore.decideAcceptanceCase(`ACC-${eng.client}-${eng.year}`, 'Accepted', 'Accepted after independent review.');
    assert.equal(eng.acceptance, true);
    assert.deepEqual(prototypeStore.getSnapshot().acceptanceCases?.[0].history?.map(item => item.action), ['recommendation', 'recommendation', 'recommendation', 'decision']);
  });

  it('allocates one receipt across invoices and reverses only the selected allocation', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    setPersona(current, 'Layla Rahman');
    const secondInvoice = { ...structuredClone(current.invoices.find(item => item.id === 'INV-26002')!), id: 'INV-AT32-2', invoiceNumber: 'INV-AT32-2', amount: 100_000, paid: 0, due: '2027-01-01' };
    const firstInvoice = current.invoices.find(item => item.id === 'INV-26002')!;
    firstInvoice.due = '2026-01-01';
    const firstInvoicePaid = Math.max(firstInvoice.paid, current.receipts.flatMap(item => item.allocations).filter(item => item.invoiceId === firstInvoice.id && !item.reversed).reduce((sum, item) => sum + item.amount, 0));
    current.invoices.push(secondInvoice);
    const receipt = { ...structuredClone(current.receipts[0]), id: 'RCP-AT32-MULTI', receiptNumber: 'RCP-AT32-MULTI', amount: 160_000, allocatedAmount: 0, allocations: [] };
    prototypeStore.addReceipt(receipt);
    prototypeStore.allocateReceipt(receipt.id, 'INV-26002', 50_000);
    const beforeMissingReversalReason = { receipt: structuredClone(receipt), invoice: structuredClone(firstInvoice) };
    assert.throws(() => prototypeStore.reverseAllocation(receipt.id, 0, '   '), /reversal reason is required/);
    assert.deepEqual(receipt, beforeMissingReversalReason.receipt, 'missing reversal reason leaves allocation history and receipt balance unchanged');
    assert.deepEqual(firstInvoice, beforeMissingReversalReason.invoice, 'missing reversal reason leaves invoice settlement unchanged');
    prototypeStore.allocateReceipt(receipt.id, secondInvoice.id, 70_000);
    assert.equal(receipt.allocatedAmount, 120_000);
    assert.equal(receipt.amount - receipt.allocatedAmount, 40_000, 'partial/split allocations preserve the receipt unallocated balance');
    assert.equal(receipt.amount, receipt.allocations.filter(item => !item.reversed).reduce((sum, item) => sum + item.amount, 0) + (receipt.amount - receipt.allocatedAmount), 'gross receipt equals active allocation history plus unallocated amount');
    assert.deepEqual(receipt.allocations.map(item => item.invoiceId), ['INV-26002', secondInvoice.id]);
    assert.equal(secondInvoice.paid, 70_000);
    assert.equal(firstInvoice.due, '2026-01-01');
    assert.equal(secondInvoice.due, '2027-01-01');
    const receiptBeforeInvoiceOverage = structuredClone(receipt);
    const secondInvoiceBeforeOverage = structuredClone(secondInvoice);
    assert.throws(() => prototypeStore.allocateReceipt(receipt.id, secondInvoice.id, 30_001), /exceeds remaining invoice balance/);
    assert.deepEqual(receipt, receiptBeforeInvoiceOverage, 'invoice over-allocation leaves allocation history and receipt balance unchanged');
    assert.deepEqual(secondInvoice, secondInvoiceBeforeOverage, 'invoice over-allocation leaves settlement unchanged');
    const secondInvoiceBeforeStaleReverse = structuredClone(secondInvoice);
    secondInvoice.paid += 1;
    const staleReceiptSnapshot = structuredClone(receipt);
    const staleInvoiceSnapshot = structuredClone(secondInvoice);
    assert.throws(() => prototypeStore.reverseAllocation(receipt.id, 1, 'Stale invoice balance must not reverse.'), /Settlement totals are stale/);
    assert.deepEqual(receipt, staleReceiptSnapshot, 'stale invoice totals preserve receipt allocation history');
    assert.deepEqual(secondInvoice, staleInvoiceSnapshot, 'stale invoice totals remain unchanged after rejected reversal');
    secondInvoice.paid = secondInvoiceBeforeStaleReverse.paid;
    prototypeStore.reverseAllocation(receipt.id, 0, 'Correct first invoice allocation.');
    assert.equal(receipt.allocatedAmount, 70_000);
    assert.equal(receipt.amount - receipt.allocatedAmount, 90_000, 'reversing one allocation restores its funds to the unallocated receipt balance');
    assert.equal(receipt.amount, receipt.allocations.filter(item => !item.reversed).reduce((sum, item) => sum + item.amount, 0) + (receipt.amount - receipt.allocatedAmount));
    assert.equal(receipt.allocations[0].reversalReason, 'Correct first invoice allocation.');
    assert.equal(receipt.allocations[0].reversed, true, 'reversal retains rather than deletes original allocation history');
    assert.equal(firstInvoice.paid, firstInvoicePaid);
    assert.equal(secondInvoice.paid, 70_000);
    const afterFirstReversal = { receipt: structuredClone(receipt), firstInvoice: structuredClone(firstInvoice) };
    prototypeStore.reverseAllocation(receipt.id, 0, 'Duplicate correction request.');
    assert.deepEqual(receipt, afterFirstReversal.receipt, 'repeating an allocation reversal does not restore receipt funds twice or rewrite its history');
    assert.deepEqual(firstInvoice, afterFirstReversal.firstInvoice, 'repeating an allocation reversal does not alter invoice settlement twice');

    const fullySettledInvoice = { ...structuredClone(firstInvoice), id: 'INV-AT32-FULL', invoiceNumber: 'INV-AT32-FULL', amount: 25, paid: 0, status: 'Issued' as const, due: '2026-09-20' };
    current.invoices.push(fullySettledInvoice);
    const fullyAllocatedReceipt = { ...structuredClone(receipt), id: 'RCP-AT32-FULL', receiptNumber: 'RCP-AT32-FULL', amount: 25, allocatedAmount: 0, allocations: [] };
    prototypeStore.addReceipt(fullyAllocatedReceipt);
    prototypeStore.allocateReceipt(fullyAllocatedReceipt.id, fullySettledInvoice.id, 25);
    assert.equal(fullySettledInvoice.paid, 25);
    assert.equal(fullySettledInvoice.status, 'Paid');
    assert.equal(fullyAllocatedReceipt.amount - fullyAllocatedReceipt.allocatedAmount, 0);
    prototypeStore.reverseAllocation(fullyAllocatedReceipt.id, 0, 'Restore fully settled balance.');
    assert.equal(fullySettledInvoice.paid, 0);
    assert.equal(fullySettledInvoice.status, 'Issued', 'reversing full settlement restores the invoice to Issued');
    assert.equal(fullyAllocatedReceipt.allocatedAmount, 0);
    assert.equal(fullyAllocatedReceipt.amount - fullyAllocatedReceipt.allocatedAmount, 25, 'full reversal restores the entire receipt to unallocated funds');
    assert.equal(fullyAllocatedReceipt.allocations.length, 1, 'full reversal retains its original allocation row');
    assert.equal(fullyAllocatedReceipt.allocations[0].reversalReason, 'Restore fully settled balance.');
  });

  it('VP-048-AC01/AC02: audit plans require explicit rates and rate-consistent threshold amounts', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    const engagement = current.engagements[0];
    const planningBefore = engagement.planning;
    setPersona(current, 'Layla Rahman');
    const plan = {
      id: `PLAN-${engagement.id}-V1`, engagementId: engagement.id, version: 1, status: 'Under review' as const,
      benchmark: 'revenue', benchmarkValue: 2_000_000, materialityRate: 1.5,
      performanceMaterialityRate: 75, clearlyTrivialRate: 5, overallMateriality: 30_000,
      performanceMateriality: 22_500, clearlyTrivialThreshold: 1_500,
      rationales: ['Entered fixture basis.'], teamAllocations: [{ person: 'Layla Rahman', role: 'Engagement Manager', scheduledStart: '2026-09-25', scheduledEnd: '2026-10-31' }], timingMilestones: [], significantAreas: []
    };

    assert.throws(() => prototypeStore.saveAuditPlan({ ...plan, performanceMaterialityRate: undefined }), /explicit valid materiality rates/);
    assert.throws(() => prototypeStore.saveAuditPlan({ ...plan, clearlyTrivialRate: 101 }), /explicit valid materiality rates/);
    assert.throws(() => prototypeStore.saveAuditPlan({ ...plan, clearlyTrivialThreshold: 1_499 }), /must match its saved benchmark and explicit rates/);
    assert.throws(() => prototypeStore.saveAuditPlan({ ...plan, teamAllocations: [] }), /Assign at least one in-scope staff member/);
    assert.throws(() => prototypeStore.saveAuditPlan({ ...plan, teamAllocations: [{ ...plan.teamAllocations[0], person: 'Unknown Person' }] }), /active staff user/);
    assert.throws(() => prototypeStore.saveAuditPlan({ ...plan, teamAllocations: [{ ...plan.teamAllocations[0], scheduledStart: '2026-02-30' }] }), /valid scheduled date range/);
    assert.throws(() => prototypeStore.saveAuditPlan({ ...plan, teamAllocations: [{ ...plan.teamAllocations[0], scheduledStart: '2026-11-01' }] }), /valid scheduled date range/);
    assert.equal(current.auditPlans?.length ?? 0, 0, 'invalid plans do not append a revision');
    assert.equal(engagement.planning, planningBefore, 'invalid plans do not change the planning gate');

    prototypeStore.saveAuditPlan(plan);
    assert.equal(current.auditPlans?.[0].performanceMaterialityRate, 75);
    assert.equal(current.auditPlans?.[0].clearlyTrivialRate, 5);
  });

  it('VP-048-AC03/AC04: audit plans retain revisions and require a different reviewer', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    const eng = current.engagements[0];
    const plan = (version: number) => ({
      id: `PLAN-${eng.id}-V${version}`, engagementId: eng.id, version, status: 'Under review' as const,
      benchmark: 'revenue', benchmarkValue: 2_000_000, materialityRate: 1.5, overallMateriality: 30_000,
      performanceMaterialityRate: 75, clearlyTrivialRate: 5, performanceMateriality: 22_500, clearlyTrivialThreshold: 1_500, rationales: ['Revenue is the selected benchmark.'],
      teamAllocations: [{ person: 'Layla Rahman', role: 'Engagement Manager', scheduledStart: '2026-09-25', scheduledEnd: '2026-10-31' }], timingMilestones: [], significantAreas: []
    });
    setPersona(current, 'Layla Rahman');
    prototypeStore.saveAuditPlan(plan(1));
    assert.equal(eng.planning, false);
    assert.throws(() => prototypeStore.reviewAuditPlan(`PLAN-${eng.id}-V1`, true, 'Reviewed.'), /same person/);
    setPersona(current, 'Sara Malik');
    prototypeStore.reviewAuditPlan(`PLAN-${eng.id}-V1`, true, 'Reviewed and approved.');
    assert.equal(eng.planning, true);
    setPersona(current, 'Layla Rahman');
    const affectedProcedure = current.auditPrograms.flatMap(program => program.procedures).find(procedure => procedure.id === 'PRC-03')!;
    affectedProcedure.status = 'Cleared';
    affectedProcedure.reviewedByUserId = 'reviewer';
    affectedProcedure.reviewedAt = '2026-09-24T00:00:00.000Z';
    prototypeStore.saveAuditPlan(plan(2));
    assert.deepEqual(prototypeStore.getSnapshot().auditPlans?.map(p => p.status), ['Superseded', 'Under review']);
    assert.equal(eng.planning, false);
    assert.equal(affectedProcedure.status, 'In progress', 'approved-plan revision reopens cleared fieldwork');
    assert.equal(affectedProcedure.scopeReassessmentRequired, true, 'approved-plan revision requires scope reassessment');
    assert.match(affectedProcedure.scopeReassessmentReason || '', /reassess planned procedure scope and conclusions/);
    assert.equal(affectedProcedure.scopeReassessmentHistory?.at(-1)?.previousStatus, 'Cleared');
    assert.equal(affectedProcedure.reviewedByUserId, undefined, 'stale reviewer attribution is cleared from the live procedure');
  });

  it('Job template lifecycle: draft templates cannot be instantiated; publishing allows (VP-015 / F06)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';

    const draftTpl = {
      id: 'TPL-TEST-DRAFT',
      name: 'Unpublished Draft Template',
      service: 'Statutory Audit',
      description: 'Test template',
      defaultJobTitle: 'Test Job',
      status: 'Draft' as const,
      revision: 1,
      tasks: [{ title: 'Phase 1', subtasks: ['Subtask 1'] }]
    };

    prototypeStore.addJobTemplate(draftTpl);

    assert.throws(() => prototypeStore.addJobTemplate({ ...draftTpl, id: 'TPL-EMPTY-TASKS', tasks: [] }), /requires a name, default job title, and titled phases/);
    assert.throws(() => prototypeStore.addJobTemplate({ ...draftTpl, id: 'TPL-UNTITLED-TASK', tasks: [{ title: '  ' }] }), /requires a name, default job title, and titled phases/);
    assert.throws(() => prototypeStore.addJobTemplate({ ...draftTpl, id: 'TPL-UNTITLED-SUBTASK', tasks: [{ title: 'Phase', subtasks: ['  '] }] }), /requires a name, default job title, and titled phases/);

    assert.throws(
      () => prototypeStore.applyJobTemplate(draftTpl.id, 'ENG-26001', 'Test Job', '2026-10-31', 'Layla Rahman'),
      /Only Published templates/
    );

    // Publish template
    prototypeStore.publishJobTemplate(draftTpl.id);
    const beforeCount = (prototypeStore as any).state.jobs.length;
    prototypeStore.applyJobTemplate(draftTpl.id, 'ENG-26001', 'Test Job', '2026-10-31', 'Layla Rahman', undefined, '2026-10-01');
    assert.strictEqual((prototypeStore as any).state.jobs.length, beforeCount + 1);
    const sourceJob = (prototypeStore as any).state.jobs.at(-1);
    assert.equal(sourceJob.fromTemplateRevision, 1);
    assert.equal(sourceJob.startDate, '2026-10-01');
    const originalTasks = structuredClone(draftTpl.tasks);
    const revision = prototypeStore.createJobTemplateRevision(draftTpl.id, { name: 'Revised Template', service: draftTpl.service, description: draftTpl.description, defaultJobTitle: 'Revised Job', tasks: [{ title: 'Revised Phase', subtasks: ['New Subtask'] }] });
    assert.equal(revision.revision, 2);
    assert.equal(revision.status, 'Draft');
    assert.equal(revision.revisionOfId, draftTpl.id);
    assert.equal(draftTpl.status, 'Published');
    assert.deepEqual(draftTpl.tasks, originalTasks);
    prototypeStore.publishJobTemplate(revision.id);
    const idempotencyKey = 'VP015-RETRY-TEST';
    const jobsBeforeRetry = (prototypeStore as any).state.jobs.length;
    prototypeStore.applyJobTemplate(revision.id, 'ENG-26001', 'Revised Job', '2026-11-01', 'Layla Rahman', idempotencyKey);
    prototypeStore.applyJobTemplate(revision.id, 'ENG-26001', 'Revised Job', '2026-11-01', 'Layla Rahman', idempotencyKey);
    assert.equal((prototypeStore as any).state.jobs.length, jobsBeforeRetry + 1);
    assert.equal((prototypeStore as any).state.jobs.at(-1).fromTemplateRevision, 2);
    assert.throws(() => prototypeStore.applyJobTemplate(revision.id, 'ENG-26001', 'Changed Job', '2026-11-01', 'Layla Rahman', idempotencyKey), /already used for different job details/);
    assert.throws(() => prototypeStore.applyJobTemplate(revision.id, 'ENG-26001', 'Invalid Date Job', '2026-11-01', 'Layla Rahman', undefined, '2026-02-31'), /valid start and delivery dates/);
    assert.throws(() => prototypeStore.applyJobTemplate(revision.id, 'ENG-26001', 'Reversed Job', '2026-10-31', 'Layla Rahman', undefined, '2026-11-01'), /valid start and delivery dates/);

    // Retire template
    prototypeStore.retireJobTemplate(draftTpl.id, 'Superseded by the revised audit delivery template.');
    assert.throws(
      () => prototypeStore.applyJobTemplate(draftTpl.id, 'ENG-26001', 'Another Job', '2026-10-31', 'Layla Rahman'),
      /Only Published templates/
    );
  });

  it('Workpaper version replacement invalidates clearance and resets status (VP-050-AC03/AC04 / F05)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const eng = (prototypeStore as any).state.engagements[0];
    const wp = eng.workpapers[0];

    // Mark cleared
    wp.status = 'Cleared';
    wp.clearance = {
      clearedBy: 'Sara Malik',
      clearedAt: new Date().toISOString(),
      sourceVersion: 1,
      generation: 1,
      version: wp.version,
      notes: 'Initial clearance'
    };

    setPersona((prototypeStore as any).state, 'Adam Khan');
    (prototypeStore as any).state.currentRole = 'preparer';

    const oldVersion = wp.version;
    prototypeStore.replaceWorkpaperRevision(eng.id, wp.id, {
      name: `${wp.id}_Revision2.xlsx`, size: 10, sha256: 'a'.repeat(64)
    });

    assert.strictEqual(wp.version, oldVersion + 1);
    assert.strictEqual(wp.status, 'In progress');
    assert.strictEqual(wp.clearance, null);
    assert.ok(wp.clearanceHistory.length > 0);
  });

  it('PBC response upload sets status to Received (not Accepted) and registers document (VP-023 / F05)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Rami Nasser');

    const eng = (prototypeStore as any).state.engagements[0];
    const req = eng.pbc.find((item: any) => item.id === 'PBC-03');

    setPersona((prototypeStore as any).state, 'Omar Nasser');
    assert.throws(() => prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'wrong-user.pdf', size: 100, sha256: 'a'.repeat(64) }), /named client contributor/);
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    assert.throws(() => prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'empty.pdf', size: 0, sha256: 'a'.repeat(64) }), /non-empty local file/);
    assert.throws(() => prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'oversized.pdf', size: 10 * 1024 * 1024 + 1, sha256: 'a'.repeat(64) }), /10 MB PBC upload limit/);
    assert.throws(() => prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'unsafe.exe', size: 100, sha256: 'a'.repeat(64) }), /Choose a PDF, Word, Excel, CSV, text, PNG or JPEG/);
    assert.throws(() => prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'fake.pdf', size: 100, type: 'application/x-msdownload', sha256: 'a'.repeat(64) }), /Choose a PDF, Word, Excel, CSV, text, PNG or JPEG/);
    assert.throws(() => prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'missing-digest.pdf', size: 100 }), /SHA-256/);
    prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'Bank_Statement_Q4.pdf', size: 102400, sha256: 'a'.repeat(64) });

    assert.strictEqual(req.status, 'Received');
    assert.notStrictEqual(req.status, 'Accepted');

    const uploadedDoc = (prototypeStore as any).state.documents.find((d: any) => d.linkedPbcId === req.id);
    assert.ok(uploadedDoc);
    assert.strictEqual(uploadedDoc.visibility, 'Client shared');

    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    assert.throws(() => prototypeStore.requestPbcClarification(eng.id, req.id, '  '), /Clarification details are required/);
    prototypeStore.requestPbcClarification(eng.id, req.id, 'Please provide a signed final statement.');
    assert.strictEqual(req.status, 'Needs clarification');
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'Bank_Statement_Q4_v2.pdf', size: 2048, sha256: 'b'.repeat(64) });
    assert.strictEqual(req.status, 'Received');
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    prototypeStore.acceptPbcResponse(eng.id, req.id);
    assert.strictEqual(req.status, 'Accepted');
    assert.strictEqual(req.acceptedVersion, 2);
    assert.strictEqual(req.acceptedBy, 'Layla Rahman');
    assert.ok(req.acceptedAt);
    assert.deepEqual(req.acceptanceHistory?.map(item => [item.version, item.acceptedBy, item.acceptedByUserId]), [[2, 'Layla Rahman', 'manager']]);
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    assert.throws(() => prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'late-change.pdf', size: 10, sha256: 'c'.repeat(64) }), /cannot be uploaded while the request is Accepted/);
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    const acceptedGeneration = eng.generation;
    prototypeStore.requestPbcClarification(eng.id, req.id, 'Replace the accepted document with the corrected signed copy.');
    assert.strictEqual(req.status, 'Needs clarification');
    assert.equal(eng.generation, acceptedGeneration + 1, 'requesting a replacement invalidates current package/release approval basis');
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'Bank_Statement_Q4_v3.pdf', size: 3072, sha256: 'c'.repeat(64) });
    assert.deepEqual(req.acceptanceHistory?.map(item => [item.version, item.acceptedBy]), [[2, 'Layla Rahman']]);
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    prototypeStore.acceptPbcResponse(eng.id, req.id);
    assert.deepEqual(req.acceptanceHistory?.map(item => [item.version, item.acceptedBy]), [[2, 'Layla Rahman'], [3, 'Layla Rahman']]);
    assert.deepEqual(req.sharedFiles?.map((file: any) => file.version), [1, 2, 3]);
    assert.ok(req.thread?.some((message: any) => message.kind === 'clarification' && message.clientVisible));
  });

  it('Re-open release for amendment preserves predecessor and lineage (VP-058 / F04)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Daniel James');
    (prototypeStore as any).state.currentRole = 'partner';

    const eng = (prototypeStore as any).state.engagements[0];
    // Ensure all workpapers cleared, review points closed, approvals present for generation
    eng.workpapers.forEach((w: any) => {
      w.status = 'Cleared';
      w.clearance = { clearedBy: 'Sara Malik', clearedAt: '2026-09-21T09:00:00Z', sourceVersion: eng.sourceVersion, generation: eng.generation, version: w.version, notes: 'Independent review completed.' };
    });
    if (eng.reviews) eng.reviews.forEach((r: any) => { r.status = 'Cleared'; });
    if (eng.eqrConcerns) eng.eqrConcerns.forEach((c: any) => { c.resolved = true; });
    eng.approvals = {
      manager: { by: 'Layla Rahman', at: '2026-09-21T10:00:00Z', generation: eng.generation },
      client: { by: 'Omar Nasser', at: '2026-09-21T11:00:00Z', generation: eng.generation },
      partner: { by: 'Daniel James', at: '2026-09-21T12:00:00Z', generation: eng.generation },
      eqr: eng.eqrRequired ? { by: 'Dr. Tariq Al-Sayed', at: '2026-09-21T13:00:00Z', generation: eng.generation } : null
    };

    // Issue initial release
    seedPackageDefinition(eng);
    seedManagementAcknowledgement(eng);
    prototypeStore.prepareReleaseCandidate(eng.id);
    prototypeStore.issueRelease(eng.id, 'First local release record', ['board@example.demo', ' BOARD@example.demo ']);
    assert.deepEqual(eng.releases[0].recipients, ['board@example.demo'], 'distribution recipients are trimmed and deduplicated without regard to case');
    const firstRelId = eng.releases[0].id;

    prototypeStore.prepareReleaseCandidate(eng.id);
    assert.throws(() => prototypeStore.issueRelease(eng.id, 'Duplicate delivery attempt', ['board@example.demo']), /already been released/);
    assert.equal(eng.releases.length, 1, 'retrying issue in the same generation cannot create a second release');

    // Reopen for amendment
    prototypeStore.reopenReleaseForAmendment(eng.id, 'Subsequent adjusting event: litigation settlement');
    assert.strictEqual(eng.releases[0].isAmended, undefined);
    assert.strictEqual(eng.candidate, null);
    assert.strictEqual(eng.approvals.partner, null);

    // Unapproved reissue must be blocked because approvals were invalidated for the new generation!
    assert.throws(
      () => prototypeStore.prepareReleaseCandidate(eng.id),
      /missing or invalid for generation/
    );

    // Record renewed approvals for new generation
    eng.approvals = {
      manager: { by: 'Layla Rahman', at: '2026-09-22T10:00:00Z', generation: eng.generation },
      client: { by: 'Omar Nasser', at: '2026-09-22T11:00:00Z', generation: eng.generation },
      partner: { by: 'Daniel James', at: '2026-09-22T12:00:00Z', generation: eng.generation },
      eqr: eng.eqrRequired ? { by: 'Dr. Tariq Al-Sayed', at: '2026-09-22T13:00:00Z', generation: eng.generation } : null
    };

    // Freeze and issue second release
    seedPackageDefinition(eng);
    seedManagementAcknowledgement(eng);
    prototypeStore.prepareReleaseCandidate(eng.id);
    prototypeStore.issueRelease(eng.id, 'Second local release record', ['board@example.demo']);
    assert.strictEqual(eng.releases.length, 2);
    assert.strictEqual(eng.releases[1].predecessorId, firstRelId);
  });

  it('Canonical SharePoint client folders created idempotently (VP-017 / F13)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Daniel James');
    (prototypeStore as any).state.currentRole = 'partner';

    const state = (prototypeStore as any).state;
    assert.throws(() => prototypeStore.prepareClientWorkspace('CL-001', 2026), /current synthetic SharePoint binding succeeds/);
    prototypeStore.simulateM365Verification('sharepoint', 'success');

    const beforeFolderCount = state.folders.length;
    prototypeStore.prepareClientWorkspace('CL-001', 2026, 'ENG-26001');
    // Calling a second time should be idempotent (no duplicates)
    prototypeStore.prepareClientWorkspace('CL-001', 2026, 'ENG-26001');

    const clientCode = state.clients.find((client: any) => client.id === 'CL-001').code;
    const clientPrefix = `${state.m365Config.folderRoot}/${clientCode}/`;
    const clientFolders = state.folders.filter((f: any) => f.clientId === 'CL-001' && f.path.startsWith(clientPrefix));
    assert.ok(clientFolders.some((f: any) => f.path.includes('01_Acceptance')));
    assert.ok(clientFolders.some((f: any) => f.path.includes('02_Planning')));
    assert.ok(clientFolders.some((f: any) => f.path.includes('03_Fieldwork')));
    assert.ok(clientFolders.some((f: any) => f.path.includes('04_Deliverables')));
    assert.ok(clientFolders.some((f: any) => f.path.includes('05_Correspondence')));
    assert.equal(clientFolders.filter((f: any) => f.path === clientPrefix).length, 1);
    assert.equal(state.folders.length, beforeFolderCount + 8, 'the root, year, engagement and five standard subfolders are created once');
    assert.throws(() => prototypeStore.prepareClientWorkspace('CL-001', 2026, 'ENG-26002'), /does not match this client and year/);

    const inactiveClient = state.clients.find((client: any) => client.status !== 'Active');
    if (inactiveClient) {
      const previousStatus = inactiveClient.status;
      inactiveClient.status = 'Suspended';
      assert.throws(() => prototypeStore.prepareClientWorkspace(inactiveClient.id, 2026), /active accepted client/);
      inactiveClient.status = previousStatus;
    }
  });

  it('creates an idempotent fresh next-period continuance draft without prior work (VP-047)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    state.currentRole = 'manager';
    const prior = state.engagements[0];
    const partner = state.users.find((u: any) => u.name === prior.partner && u.role === 'partner');
    state.acceptanceCases = [{
      id: 'ACC-CONT', clientId: prior.client, year: prior.year, service: prior.service,
      riskRating: 'Low', independenceConfirmed: true, amlKycCompleted: true,
      screeningEvidence: { amlKyc: 'KYC-101', independence: 'IND-101', conflicts: 'COI-101', prohibitions: 'ROT-101', competence: 'COMP-101' },
      conflictsCleared: true, prohibitionsChecked: true, competenceConfirmed: true,
      conditions: [], recommendationBy: 'Layla Rahman', recommendationDate: '2026-09-20',
      recommendationNotes: 'Prior year continuance review.', decisionBy: prior.partner,
      decisionByUserId: partner.id, decisionDate: '2026-09-21', decisionStatus: 'Accepted'
    }];
    assert.throws(() => prototypeStore.createContinuanceDraft(prior.id, ''), /Record current-period changes/);
    const draft = prototypeStore.createContinuanceDraft(prior.id, 'Ownership changed; new ERP deployed.');
    assert.equal(draft.year, prior.year + 1);
    assert.equal(draft.continuanceFromEngagementId, prior.id);
    assert.equal(draft.continuanceNotes, 'Ownership changed; new ERP deployed.');
    assert.ok(state.clients.find((client: any) => client.id === prior.client).accountingProfile.periodBooks.some((book: any) => book.id === draft.accountingPeriodBookId));
    assert.equal(draft.accountingProfileRevision, state.clients.find((client: any) => client.id === prior.client).accountingProfile.revision);
    assert.equal(draft.acceptance, false);
    assert.equal(draft.terms, false);
    assert.equal(draft.rows.length, 0);
    assert.equal(draft.workpapers.length, 0);
    assert.equal(draft.reviews.length, 0);
    assert.equal(draft.releases.length, 0);
    assert.deepEqual(draft.approvals, { manager: null, client: null, partner: null, eqr: null });
    assert.equal(prototypeStore.createContinuanceDraft(prior.id, 'Changed text ignored on retry.').id, draft.id);
    assert.equal(state.engagements.filter((e: any) => e.continuanceFromEngagementId === prior.id).length, 1);
    assert.equal(state.acceptanceCases[0].continuedToEngagementId, draft.id);
  });

  it('retains immutable trial-balance source snapshots with import metadata (VP-035)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    const engagement = state.engagements[0];
    const original = structuredClone(engagement.rows);
    state.statementSetRevisions ||= [];
    state.statementSetRevisions.push({ engagementId: engagement.id, status: 'Reviewed', sourceVersion: engagement.sourceVersion, mappingRevision: 0 } as any);
    engagement.reconciliations.push({ id: 'REC-VP035', status: 'Approved', sourceVersion: engagement.sourceVersion } as any);
    const replacement = structuredClone(original);
    replacement[0].balance += 125;
    prototypeStore.updateTrialBalanceRows(engagement.id, replacement, {
      fileName: 'replacement.csv', format: 'CSV', sha256: 'a'.repeat(64),
      mapping: { code: 0, name: 1, debit: 2, credit: 3, signed: 2, convention: 'signed-net' }
    });
    assert.deepEqual(engagement.sourceHistory[0].rows, original);
    assert.equal(engagement.sourceHistory[1].version, 2);
    assert.equal(engagement.sourceHistory[1].predecessorVersion, 1);
    assert.equal(engagement.sourceHistory[1].sha256, 'a'.repeat(64));
    assert.equal(engagement.sourceHistory[1].fileName, 'replacement.csv');
    assert.equal(state.statementSetRevisions.at(-1).status, 'Stale', 'TB replacement stales reviewed statement output');
    assert.equal(engagement.reconciliations.at(-1).status, 'Stale', 'TB replacement stales approved reconciliation');
    engagement.rows[0].balance = -999;
    assert.deepEqual(engagement.sourceHistory[1].rows, replacement);
  });
});
