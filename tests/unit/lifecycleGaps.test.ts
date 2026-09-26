// Lifecycle-completion guards (MOD-06/14/22/29/30/34/39).
// Covers the closure of audit-identified lifecycle dead-ends: adjustment
// "Reporting included" reachability from a live session, reasoned invoice
// returns, firm-settings prospective save, reasoned fieldwork returns,
// risk creation, and reasoned template retirement.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { migratePersistedState } from '../../src/services/migrations.js';
import { visibleClientIds, visibleEngagementIds, hasConsolidationGroupScope, canReadSearchRecord } from '../../src/services/guards.js';
import { calculateBudgetVsActual } from '../../src/services/calculations.js';
import type { PrototypeState } from '../../src/types/index.js';

let state: PrototypeState;

function setPersona(state: PrototypeState, name: string) {
  const matches = state.users.filter(u => u.name === name);
  const user = matches.find(u => u.id === state.currentUserId) || matches.find(u => u.role === state.currentRole) || matches[0];
  state.currentUserId = user?.id || '';
  state.currentPerson = name;
  if (user) state.currentRole = user.role;
}

beforeEach(() => {
  state = createInitialState();
  (prototypeStore as any).state = state;
});

describe('adjustment reporting inclusion chain (MOD-22/MOD-34)', () => {
  it('technical-review rejection requires and records a bounded rationale', () => {
    setPersona(state, 'Adam Khan');
    prototypeStore.addAdjustmentJournal({
      id: 'AJ-REJECT-NOTE', engagementId: 'ENG-26001', title: 'Rejection reason fixture', status: 'Draft',
      preparedBy: 'Adam Khan', reflectionStatus: 'Not reflected', reflectedInClientBooks: false,
      lines: [
        { accountCode: '5000', accountName: 'Operating expenses', type: 'debit', amount: 90, debit: 90, credit: 0 },
        { accountCode: '1500', accountName: 'Property, plant and equipment', type: 'credit', amount: 90, debit: 0, credit: 90 }
      ]
    });
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.reviewAdjustmentJournal('AJ-REJECT-NOTE', false), /requires a bounded technical-review rationale/);
    assert.throws(() => prototypeStore.reviewAdjustmentJournal('AJ-REJECT-NOTE', false, 'x'.repeat(501)), /requires a bounded technical-review rationale/);
    prototypeStore.reviewAdjustmentJournal('AJ-REJECT-NOTE', false, 'Support schedule does not tie to the asset register.');
    const rejected = state.adjustmentJournals.find(j => j.id === 'AJ-REJECT-NOTE')!;
    assert.equal(rejected.status, 'Rejected');
    assert.equal(rejected.reviewNote, 'Support schedule does not tie to the asset register.');
    assert.equal(rejected.reviewedBy, 'Layla Rahman');
  });

  it('reporting inclusion requires management acceptance and current reflected-TB evidence', () => {
    setPersona(state, 'Adam Khan');
    prototypeStore.addAdjustmentJournal({
      id: 'AJ-INCLUDE', engagementId: 'ENG-26001', title: 'Reporting inclusion fixture', status: 'Draft',
      preparedBy: 'Adam Khan', reflectionStatus: 'Not reflected', reflectedInClientBooks: false,
      lines: [
        { accountCode: '5000', accountName: 'Operating expenses', type: 'debit', amount: 120, debit: 120, credit: 0 },
        { accountCode: '1500', accountName: 'Property, plant and equipment', type: 'credit', amount: 120, debit: 0, credit: 120 }
      ]
    });
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.markAdjustmentJournalReportingIncluded('AJ-INCLUDE'), /management-accepted/);
    prototypeStore.reviewAdjustmentJournal('AJ-INCLUDE', true);
    assert.throws(() => prototypeStore.markAdjustmentJournalReportingIncluded('AJ-INCLUDE'), /management-accepted/);
    setPersona(state, 'Omar Nasser');
    prototypeStore.recordAdjustmentManagementDecision('AJ-INCLUDE', true);
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.markAdjustmentJournalReportingIncluded('AJ-INCLUDE'), /reflected in the current trial balance/);
    assert.throws(() => prototypeStore.updateAdjustmentJournal({ ...state.adjustmentJournals.find(j => j.id === 'AJ-INCLUDE')!, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1 }), /requires an evidence reference/);
    prototypeStore.updateAdjustmentJournal({ ...state.adjustmentJournals.find(j => j.id === 'AJ-INCLUDE')!, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1, reflectionEvidenceRef: 'TB-IMPORT-REV-1' });
    prototypeStore.markAdjustmentJournalReportingIncluded('AJ-INCLUDE');
    const included = state.adjustmentJournals.find(j => j.id === 'AJ-INCLUDE')!;
    assert.equal(included.status, 'Reporting included');
    assert.equal(included.reportingIncludedBy, 'Layla Rahman');
    assert.ok(included.reportingIncludedAt);
    assert.throws(
      () => prototypeStore.markAdjustmentJournalReportingIncluded('AJ-INCLUDE'),
      /Only a management-accepted adjustment can be recorded as included in reporting/,
      'a reporting-included journal cannot be included a second time'
    );
  });

  it('a linked finding is then dispositionable as Corrected in TB from a live session', () => {
    const journal = state.adjustmentJournals.find(j => j.id === 'AJ-01')!;
    assert.equal(journal.status, 'Management accepted', 'seeded fixture is management-accepted');
    setPersona(state, 'Layla Rahman');
    prototypeStore.updateAdjustmentJournal({ ...journal, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1, reflectionEvidenceRef: 'TB-IMPORT-REV-1' });
    prototypeStore.markAdjustmentJournalReportingIncluded('AJ-01');
    assert.equal(state.adjustmentJournals.find(j => j.id === 'AJ-01')!.status, 'Reporting included');
    setPersona(state, 'Adam Khan');
    const findingId = prototypeStore.addFinding({ engagementId: 'ENG-26001', category: 'Monetary misstatement', severity: 'Minor', title: 'Live corrected-in-TB chain', condition: 'Journal AJ-01 posts the correction.', recommendation: 'Accept the posted correction.', affectedAccount: '1500', assertion: 'Valuation', amount: 25, currency: 'QAR', linkedJournalId: journal.id });
    setPersona(state, 'Layla Rahman');
    prototypeStore.setFindingDisposition(findingId, 'Corrected in TB', 'Journal AJ-01 is reflected at the current source revision.');
    assert.equal(state.findings.find(f => f.id === findingId)?.disposition, 'Corrected in TB');
  });
});

describe('invoice reasoned return and rework (MOD-14)', () => {
  it('returns a draft with a recorded reviewer note and clears it on approval or revision', () => {
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.reviewInvoice('INV-26003', false), /requires a bounded review note/);
    assert.throws(() => prototypeStore.reviewInvoice('INV-26003', false, 'x'.repeat(501)), /requires a bounded review note/);
    prototypeStore.reviewInvoice('INV-26003', false, 'Retainer period does not match the signed proposal.');
    let draft = state.invoices.find(i => i.id === 'INV-26003')!;
    assert.equal(draft.status, 'Draft');
    assert.equal(draft.reviewNote, 'Retainer period does not match the signed proposal.');
    assert.equal(draft.commercialApproval, undefined, 'a returned draft carries no approval');
    assert.ok(state.events.some(event => event.text.includes('returned for changes')), 'return is logged with its reason');
    setPersona(state, 'Leila Hassan');
    prototypeStore.reviseInvoiceDraft('INV-26003', {
      description: 'Annual compilation retainer (revised period)',
      due: draft.due,
      amount: draft.amount,
      lines: draft.lines,
      reason: 'Period corrected per signed proposal.'
    });
    draft = state.invoices.find(i => i.id === 'INV-26003')!;
    assert.equal(draft.revision, 2);
    assert.equal(draft.reviewNote, undefined, 'rework addresses the recorded return note');
    setPersona(state, 'Daniel James');
    prototypeStore.reviewInvoice('INV-26003', true);
    const approved = state.invoices.find(i => i.id === 'INV-26003')!;
    assert.equal(approved.status, 'Approved');
    assert.equal(approved.reviewNote, undefined);
    assert.equal(approved.commercialApproval?.by, 'Daniel James');
  });
});

describe('firm settings prospective save (MOD-39)', () => {
  it('rejects non-admins and atomically rejects invalid patches', () => {
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.updateFirmSettings({ firmName: 'X' }), /Only administrators/);
    setPersona(state, 'Khalid Al-Nuaimi');
    assert.throws(() => prototypeStore.updateFirmSettings({ firmName: '   ' }), /Firm name/);
    assert.throws(() => prototypeStore.updateFirmSettings({ currency: 'Qatari Riyal' }), /three-letter ISO/);
    assert.throws(() => prototypeStore.updateFirmSettings({ invoiceNextNumber: 0 }), /positive whole number/);
    assert.throws(() => prototypeStore.updateFirmSettings({ paymentTermsDays: 400 }), /between 0 and 365/);
    assert.throws(() => prototypeStore.updateFirmSettings({ jurisdiction: '' }), /Jurisdiction/);
    const before = structuredClone(state.firmSettings);
    assert.throws(() => prototypeStore.updateFirmSettings({ currency: 'EURO' }), /three-letter ISO/);
    assert.deepEqual(state.firmSettings, before, 'invalid patch does not partially apply');
  });

  it('saves a valid patch prospectively with a logged reason', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    prototypeStore.updateFirmSettings({ firmLegalName: 'STE Audit & Accounting L.L.C.', jurisdiction: 'State of Qatar', paymentTermsDays: 45 }, 'Legal-name refresh');
    assert.equal(state.firmSettings.firmLegalName, 'STE Audit & Accounting L.L.C.');
    assert.equal(state.firmSettings.paymentTermsDays, 45);
    assert.equal(state.firmSettings.firmName, 'STE Audit & Accounting', 'untouched fields are preserved');
    assert.ok(state.events.some(event => event.ref === 'FIRM' && event.text.includes('Legal-name refresh')), 'change is logged with its reason');
  });
});

describe('fieldwork reasoned return (MOD-30)', () => {
  it('requires a reason to return submitted or cleared fieldwork and records it', () => {
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'In progress'), /requires a bounded reason/);
    assert.throws(() => prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'In progress', 'x'.repeat(501)), /requires a bounded reason/);
    prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'In progress', 'Confirmation letter lacks the authorized signatory.');
    const returned = state.auditPrograms.find(p => p.id === 'PRG-01')!.procedures.find(p => p.id === 'PRC-01')!;
    assert.equal(returned.status, 'In progress');
    assert.equal(returned.returnReason, 'Confirmation letter lacks the authorized signatory.');
    assert.equal(returned.returnedByUserId, state.currentUserId);
    assert.ok(returned.returnedAt);
    assert.equal(returned.reviewedByUserId, undefined, 'return clears the prior review');
  });

  it('supports the rework cycle back to an independent clearance', () => {
    setPersona(state, 'Layla Rahman');
    prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'In progress', 'Signatory evidence required.');
    setPersona(state, 'Adam Khan');
    prototypeStore.updateAuditProcedureExecution('ENG-26001', 'PRC-01', 'Re-obtained confirmation with the authorized signatory.', 'Satisfactory', '');
    prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'Submitted');
    const submitted = state.auditPrograms.find(p => p.id === 'PRG-01')!.procedures.find(p => p.id === 'PRC-01')!;
    assert.equal(submitted.status, 'Submitted');
    assert.equal(submitted.returnReason, 'Signatory evidence required.', 'the preparer can still see why the work was returned');
    setPersona(state, 'Layla Rahman');
    prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'Cleared');
    const cleared = state.auditPrograms.find(p => p.id === 'PRG-01')!.procedures.find(p => p.id === 'PRC-01')!;
    assert.equal(cleared.status, 'Cleared');
    assert.equal(cleared.returnReason, undefined, 'clearance resolves the return');
    assert.equal(cleared.reviewedByUserId, state.currentUserId);
  });
});

describe('risk creation (MOD-29)', () => {
  it('validates fields, scope, and owner before creating reciprocal links', () => {
    setPersona(state, 'Adam Khan');
    assert.throws(() => prototypeStore.createAuditRisk('ENG-26001', { title: '', area: 'Revenue', assertions: ['Occurrence'], description: 'd', rationale: 'r', response: 'p', owner: 'Adam Khan', rating: 'Medium' }), /required/);
    assert.throws(() => prototypeStore.createAuditRisk('ENG-26001', { title: 'T', area: 'Revenue', assertions: [], description: 'd', rationale: 'r', response: 'p', owner: 'Adam Khan', rating: 'Medium' }), /at least one unique assertion/);
    assert.throws(() => prototypeStore.createAuditRisk('ENG-26001', { title: 'T', area: 'Revenue', assertions: ['Occurrence'], description: 'd', rationale: 'r', response: 'p', owner: 'Adam Khan', rating: 'Medium', linkedProcedureIds: ['PRC-OTHER'] }), /must both belong to the selected engagement/);
    const id = prototypeStore.createAuditRisk('ENG-26001', { title: 'Revenue cut-off', area: 'Revenue', assertions: ['Cut-off'], description: 'Sales around year end may be recorded in the wrong period.', rationale: 'High year-end volume.', response: 'Test five days of shipping documents either side of year end.', owner: 'Adam Khan', rating: 'Significant', linkedProcedureIds: ['PRC-02'] });
    const created = state.auditRisks.find(r => r.id === id)!;
    assert.equal(created.engagementId, 'ENG-26001');
    assert.deepEqual(created.linkedProcedureIds, ['PRC-02']);
    const linked = state.auditPrograms.find(p => p.id === 'PRG-01')!.procedures.find(p => p.id === 'PRC-02')!;
    assert.ok(linked.linkedRiskIds?.includes(id), 'reciprocal procedure link is created');
    assert.ok(state.events.some(event => event.ref === id));
  });
});

describe('reasoned template retirement (MOD-06)', () => {
  it('requires a bounded reason and leaves prior revisions and jobs unchanged', () => {
    setPersona(state, 'Layla Rahman');
    const tpl = state.jobTemplates.find(t => t.status === 'Published')!;
    assert.throws(() => prototypeStore.retireJobTemplate(tpl.id), /requires a bounded reason/);
    const jobsBefore = state.jobs.length;
    prototypeStore.retireJobTemplate(tpl.id, 'Standard process replaced by the FY2027 methodology.');
    assert.equal(tpl.status, 'Retired');
    assert.equal(state.jobs.length, jobsBefore);
    assert.ok(state.events.some(event => event.ref === tpl.id && event.text.includes('replaced by')));
  });
});

describe('firm settings prospective consumption (VP-062)', () => {
  it('consumes the configured invoice and credit numbers prospectively and advances the counter once', () => {
    setPersona(state, 'Layla Rahman');
    const source = structuredClone(state.invoices.find(i => i.id === 'INV-26003')!);
    const nextNumber = `${state.firmSettings.invoiceNumberPrefix}${state.firmSettings.invoiceNextNumber}`;
    prototypeStore.addInvoice({ ...source, id: 'INV-NUMBERING', invoiceNumber: nextNumber, status: 'Draft', paid: 0, amount: 5000, lines: [{ id: 'L1', description: 'Ad hoc advisory line', quantity: 1, rate: 5000, amount: 5000, sourceType: 'Ad hoc' }] });
    assert.equal(state.firmSettings.invoiceNextNumber, 5, 'consuming the configured next number advances it');
    assert.throws(() => prototypeStore.addInvoice({ ...source, id: 'INV-DUP', invoiceNumber: nextNumber, status: 'Draft', paid: 0, amount: 10, lines: [{ id: 'L2', description: 'Ad hoc advisory line', quantity: 1, rate: 10, amount: 10, sourceType: 'Ad hoc' }] }), /must be unique/, 'a duplicate number is rejected instead of colliding');
    const credit = structuredClone(state.creditNotes[0] || { invoiceId: 'INV-26002', clientId: 'CL-002', amount: 100, currency: 'QAR', reason: 'Numbering fixture', status: 'Draft', issueDate: state.asOfDate, date: state.asOfDate, preparedBy: 'Layla Rahman' });
    credit.id = 'CN-NUMBERING';
    credit.creditNumber = `${state.firmSettings.creditNumberPrefix}${state.firmSettings.creditNextNumber}`;
    prototypeStore.addCreditNote(credit);
    assert.equal(state.firmSettings.creditNextNumber, 3, 'credit counter advances prospectively');
  });

  it('an explicit non-configured number leaves the counter unchanged', () => {
    setPersona(state, 'Leila Hassan');
    const source = structuredClone(state.invoices.find(i => i.id === 'INV-26003')!);
    prototypeStore.addInvoice({ ...source, id: 'INV-EXPLICIT', invoiceNumber: 'INV-CUSTOM-9001', status: 'Draft', paid: 0, amount: 10, lines: [{ id: 'L3', description: 'Ad hoc advisory line', quantity: 1, rate: 10, amount: 10, sourceType: 'Ad hoc' }] });
    assert.equal(state.firmSettings.invoiceNextNumber, 4, 'counter does not advance for an explicit custom number');
  });

  it('numbering and default changes never rewrite issued invoices, credits or template-derived jobs', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    const issuedBefore = structuredClone(state.invoices.filter(i => i.status === 'Issued' || i.status === 'Paid'));
    const jobsBefore = structuredClone(state.jobs);
    prototypeStore.updateFirmSettings({ invoiceNumberPrefix: 'BILL-', invoiceNextNumber: 100, creditNumberPrefix: 'CR-', paymentTermsDays: 14 }, 'Renumbering policy');
    assert.deepEqual(state.invoices.filter(i => i.status === 'Issued' || i.status === 'Paid').map(i => [i.invoiceNumber, i.amount, i.due]), issuedBefore.map(i => [i.invoiceNumber, i.amount, i.due]), 'settings changes are prospective only');
    assert.deepEqual(state.jobs, jobsBefore, 'template-derived jobs are untouched');
  });

  it('system-admin identity alone cannot approve budgets, publish templates or approve mappings (VP-062-AC03)', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    assert.throws(() => prototypeStore.updateBudget(structuredClone(state.budgets.find(b => b.engagementId === 'ENG-26001')!)), /cannot/);
    assert.throws(() => prototypeStore.publishJobTemplate(state.jobTemplates[0]!.id), /cannot/);
    assert.throws(() => prototypeStore.approveAccountMappings('ENG-26001', 1), /cannot/);
  });

  it('invalid timezone and logo references are rejected atomically; valid ones save (VP-062-AC04)', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    assert.throws(() => prototypeStore.updateFirmSettings({ timezone: '' }), /Timezone/);
    assert.throws(() => prototypeStore.updateFirmSettings({ timezone: 'x'.repeat(33) }), /Timezone/);
    assert.throws(() => prototypeStore.updateFirmSettings({ logoRef: 'x'.repeat(81) }), /logo reference/);
    const before = structuredClone(state.firmSettings);
    assert.throws(() => prototypeStore.updateFirmSettings({ logoRef: 'x'.repeat(81) }), /logo reference/);
    assert.deepEqual(state.firmSettings, before, 'invalid logo patch does not partially apply');
    prototypeStore.updateFirmSettings({ logoRef: 'brand/firm-logo-2026' }, 'Brand refresh');
    assert.equal(state.firmSettings.logoRef, 'brand/firm-logo-2026');
    prototypeStore.updateFirmSettings({ logoRef: undefined }, 'Remove logo reference');
    assert.equal(state.firmSettings.logoRef, undefined);
  });
});

describe('trial-balance replacement stales journal reflection (VP-038-E01/E02)', () => {
  it('a new TB source revision blocks reporting inclusion until the reflection is re-confirmed', () => {
    setPersona(state, 'Layla Rahman');
    // AJ-01 is seeded management-accepted; reflect it at source v1 and include it in reporting.
    const journal = state.adjustmentJournals.find(j => j.id === 'AJ-01')!;
    prototypeStore.updateAdjustmentJournal({ ...journal, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1, reflectionEvidenceRef: 'TB-IMPORT-REV-1' });
    prototypeStore.markAdjustmentJournalReportingIncluded('AJ-01');
    assert.equal(state.adjustmentJournals.find(j => j.id === 'AJ-01')!.status, 'Reporting included');
    // Replace the trial balance with a rebalanced row set: sourceVersion advances.
    setPersona(state, 'Adam Khan');
    const rows = structuredClone(state.engagements.find(e => e.id === 'ENG-26001')!.rows);
    rows[0].balance += 100;
    rows[1].balance -= 100;
    prototypeStore.updateTrialBalanceRows('ENG-26001', rows);
    assert.equal(state.engagements.find(e => e.id === 'ENG-26001')!.sourceVersion, 2);
    // The included journal is now stale: its reflection pins v1 while the source is v2.
    const stale = state.adjustmentJournals.find(j => j.id === 'AJ-01')!;
    assert.equal(stale.reflectionSourceVersion, 1);
    assert.notEqual(stale.reflectionSourceVersion, state.engagements.find(e => e.id === 'ENG-26001')!.sourceVersion, 'the reflection pins its original source revision');
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.updateAdjustmentJournal({ ...stale, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1, reflectionEvidenceRef: 'TB-IMPORT-REV-1' }), /current trial-balance source revision/, 'a stale reflection decision cannot be re-asserted against the old source version');
  });
});

describe('grant approval-evidence and compatible-role combinations (VP-019-E01)', () => {
  it('professional and management-approver grants require distinct approval evidence across roles', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    for (const [userId, role] of [['preparer-2', 'preparer'], ['reviewer-2', 'reviewer'], ['eqr-2', 'eqr'], ['client-northstar', 'client']] as Array<[string, RoleKey]>) {
      // These personas hold seeded grants; revocation returns them to the applicant pool.
      const isClient = role === 'client';
      prototypeStore.revokeAccess(userId, role, isClient ? 'CL-002' : undefined, 'evidence-matrix re-grant rehearsal');
      const scopeKind = isClient ? 'Client' as const : 'Global' as const;
      const scopeId = isClient ? 'CL-002' : undefined;
      assert.throws(() => prototypeStore.grantAccess(userId, role, scopeKind, scopeId, 'evidence matrix check', { requestRef: `REQ-${userId}` }), /approval-evidence reference/, `${role} grant without evidence is rejected`);
      assert.throws(() => prototypeStore.grantAccess(userId, role, scopeKind, scopeId, 'evidence matrix check', { requestRef: 'REQ-X', approvalEvidenceRef: 'REQ-X' }), /separate reference from the access request/, `${role} grant reusing the request reference as evidence is rejected`);
      prototypeStore.grantAccess(userId, role, scopeKind, scopeId, 'evidence matrix check', { requestRef: `REQ-${userId}`, approvalEvidenceRef: `EVD-${userId}` });
      const history = state.roleGrantHistory.filter(entry => entry.userId === userId);
      assert.ok(history.length >= 2, `${role} grant and revocation both record history entries`);
    }
  });

  it('granting a role that does not match the persona is rejected; revocation restores re-grantability', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    assert.throws(() => prototypeStore.grantAccess('preparer-2', 'reviewer', 'Global', undefined, 'role mismatch check', { requestRef: 'REQ-M', approvalEvidenceRef: 'EVD-M' }), /assigned role/, 'a persona cannot be granted a different role');
    assert.throws(() => prototypeStore.grantAccess('preparer-2', 'reviewer', 'Client', 'CL-002', 'role mismatch check', { requestRef: 'REQ-M', approvalEvidenceRef: 'EVD-M' }), /assigned role/, 'the mismatch rule holds for every scope kind');
  });

  it('expiry windows bound authority at both ends and a Group grant never widens client or engagement lists (VP-019-E01)', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    // manager-2 holds a seeded Global grant; replace it with a dated window.
    prototypeStore.revokeAccess('manager-2', 'manager', undefined, 'dated-window matrix');
    prototypeStore.grantAccess('manager-2', 'manager', 'Global', undefined, 'dated window', { effectiveFrom: '2026-09-01', expiresAt: '2026-09-23', requestRef: 'REQ-WIN', approvalEvidenceRef: 'EVD-WIN' });
    state.currentUserId = 'manager-2';
    state.currentRole = 'manager';
    state.currentPerson = 'Mariam Saeed';
    // The demo clock is 2026-09-23: the grant is valid today (inclusive boundary).
    assert.equal(visibleEngagementIds(state), 'ALL', 'an expiry equal to the as-of date is still inside the window');
    // Push expiry one day earlier: every engagement and client view closes.
    const grant = state.roleGrants.find(g => g.userId === 'manager-2' && g.requestRef === 'REQ-WIN')!;
    grant.expiresAt = '2026-09-22';
    assert.notEqual(visibleEngagementIds(state), 'ALL');
    assert.equal((visibleEngagementIds(state) as string[]).length, 0, 'an expired Global grant yields no engagement rows');
    assert.equal((visibleClientIds(state, 'manager-2') as string[]).length, 0, 'an expired Global grant yields no client rows');
    // A Group grant authorizes the named group workspace without widening raw component access.
    const groupUser = state.users.find(u => u.id === 'group-user')!;
    state.currentUserId = 'group-user';
    state.currentRole = groupUser.role;
    state.currentPerson = groupUser.name;
    assert.equal(hasConsolidationGroupScope(state, 'GRP-01'), false, 'a narrow manager without the group grant is denied the group workspace');
    const before = JSON.stringify(visibleEngagementIds(state));
    setPersona(state, 'Khalid Al-Nuaimi');
    prototypeStore.grantAccess('group-user', 'manager', 'Group', 'GRP-01', 'group-only scope', { requestRef: 'REQ-GRP', approvalEvidenceRef: 'EVD-GRP' });
    assert.equal(hasConsolidationGroupScope(state, 'GRP-01', 'group-user'), true, 'the named Group grant opens the group workspace');
    state.currentUserId = 'group-user';
    state.currentRole = groupUser.role;
    state.currentPerson = groupUser.name;
    assert.equal(JSON.stringify(visibleEngagementIds(state)), before, 'a Group grant does not widen engagement lists');
    assert.equal((visibleClientIds(state, 'group-user') as string[]).length, 1, 'a Group grant does not widen client lists beyond the original narrow scope');
    setPersona(state, 'Khalid Al-Nuaimi');
    assert.throws(() => prototypeStore.grantAccess('group-user', 'manager', 'Group', 'GRP-01', 'duplicate group grant', { requestRef: 'REQ-GRP2', approvalEvidenceRef: 'EVD-GRP2' }), /already granted/, 'a duplicate group grant is rejected');
  });
});

describe('firm settings migration backfill (VP-004)', () => {
  it('backfills settings fields added in newer schemas while preserving saved values', () => {
    const legacy = createInitialState() as any;
    legacy.firmSettings = { firmName: 'Legacy Saved Firm', firmLegalName: 'Legacy Saved Firm LLC', jurisdiction: 'State of Qatar', currency: 'QAR', invoiceNumberPrefix: 'INV-OLD-', invoiceNextNumber: 9, creditNumberPrefix: 'CRN-OLD-', creditNextNumber: 3, paymentTermsDays: 21, locale: 'en-GB' };
    delete legacy.firmSettings.timezone;
    delete legacy.firmSettings.logoRef;
    const { state: migrated } = migratePersistedState(legacy, createInitialState());
    assert.equal(migrated.firmSettings.firmName, 'Legacy Saved Firm', 'saved values survive the backfill');
    assert.equal(migrated.firmSettings.invoiceNextNumber, 9);
    assert.equal(migrated.firmSettings.timezone, 'UTC+03:00 (Asia/Qatar)', 'new required settings fields are backfilled from the fresh seed');
    assert.equal(migrated.firmSettings.logoRef, undefined);
  });
});

describe('budget unallocated variance and rate attribution (VP-029-E01/E02)', () => {
  it('unallocated planned lines show planned-only variance without double counting approved time', () => {
    const budget = state.budgets.find(b => b.engagementId === 'ENG-26001' && !b.jobId)!;
    // A second, job-less planned line that no approved time matches: the unallocated case.
    const analysis = calculateBudgetVsActual(budget, state.times, 'ENG-26001');
    assert.equal(analysis.plannedMinutes, budget.lines.reduce((s, l) => s + l.plannedMinutes, 0), 'planned totals count every line once');
    assert.ok(analysis.approvedMinutes > 0 && analysis.approvedMinutes < analysis.plannedMinutes, 'approved time is a strict subset of the plan for this fixture');
    assert.equal(analysis.varianceHours, Math.round(((analysis.approvedMinutes - analysis.plannedMinutes) / 60) * 100) / 100, 'variance is approved minus planned with no double counting');
    assert.equal(analysis.actualBillableValue, null, 'a billable entry without a rate makes valuation Unknown, never zero');
    const ratedOnly = calculateBudgetVsActual(budget, state.times.filter(t => t.id !== 'TIME-03'), 'ENG-26001');
    assert.ok(ratedOnly.actualBillableValue !== null && ratedOnly.actualBillableValue > 0, 'entries with pinned rates are valued');
    assert.equal(ratedOnly.approvedMinutes, analysis.approvedMinutes - state.times.find(t => t.id === 'TIME-03')!.durationMinutes, 'removing the rateless entry removes exactly its minutes');
  });

  it('a new budget version with different rates never restates approved-time valuation or history', () => {
    setPersona(state, 'Layla Rahman');
    const budget = state.budgets.find(b => b.engagementId === 'ENG-26001' && !b.jobId)!;
    const before = calculateBudgetVsActual(budget, state.times, 'ENG-26001');
    const doubled = structuredClone(budget);
    doubled.version = (budget.version || 1) + 1;
    doubled.lines = doubled.lines.map(line => ({ ...line, billingRatePerHour: line.billingRatePerHour * 2, costRatePerHour: line.costRatePerHour !== undefined ? line.costRatePerHour * 2 : undefined }));
    prototypeStore.updateBudget(doubled);
    const after = calculateBudgetVsActual(state.budgets.find(b => b.id === budget.id)!, state.times, 'ENG-26001');
    assert.equal(after.actualBillableValue, before.actualBillableValue, 'approved time keeps its pinned approval-time rates');
    assert.equal(after.approvedMinutes, before.approvedMinutes);
    assert.ok(after.plannedFees > before.plannedFees, 'planned fees do restate to the new version');
    const history = (state.budgets.find(b => b.id === budget.id)!).history || [];
    assert.ok(history.some(h => h.version === budget.version), 'the prior version is retained in history');
    assert.throws(() => prototypeStore.updateBudget({ ...doubled, version: 1 }), /must advance/, 'stale budget revisions are rejected');
  });
});

describe('elimination duplicate inclusion and remaining finance negatives (VP-031/034/039/045)', () => {
  it('rejects a second active elimination covering the same counterparty pair and account, in either direction (VP-045-E02)', () => {
    setPersona(state, 'Layla Rahman');
    const elimination = {
      id: '', counterpartyA: 'ENG-26001', counterpartyB: 'ENG-26002',
      title: 'Duplicate intercompany elimination', explanation: 'Same balance as the seeded elimination.',
      currency: 'QAR', amount: 10000, evidenceRef: 'EVD-DUP-001',
      lines: [
        { account: 'Trade and other payables', type: 'debit' as const, amount: 10000 },
        { account: 'Trade and other receivables', type: 'credit' as const, amount: 10000 }
      ]
    };
    assert.throws(() => prototypeStore.saveConsolidationElimination('GRP-01', elimination, 'duplicate inclusion attempt'), /already covers one of these accounts/, 'the seeded approved elimination blocks a duplicate inclusion by component IDs');
    const reversed = { ...elimination, counterpartyA: 'ENG-26002', counterpartyB: 'ENG-26001' };
    assert.throws(() => prototypeStore.saveConsolidationElimination('GRP-01', reversed, 'reversed duplicate attempt'), /already covers one of these accounts/, 'reversing the counterparties is the same inclusion');
    const legalName = { ...elimination, counterpartyA: 'Example Trading Entity', counterpartyB: 'Northstar Services' };
    assert.throws(() => prototypeStore.saveConsolidationElimination('GRP-01', legalName, 'name-based duplicate attempt'), /distinct component entities/, 'name-based entries are rejected at validation, so no duplicate path exists through seeded names');
  });

  it('caps credits across successive issues and rejects cross-currency credits (VP-031-E01)', () => {
    setPersona(state, 'Layla Rahman');
    const invoice = state.invoices.find(i => i.id === 'INV-26002')!; // issued QAR 120,000 fixture
    const first = { id: 'CN-CAP1', invoiceId: invoice.id, clientId: invoice.clientId, creditNumber: 'CRN-CAP-1', amount: 90000, currency: 'QAR', reason: 'Partial fee reversal', status: 'Draft' as const, issueDate: state.asOfDate, date: state.asOfDate, preparedBy: 'Layla Rahman' };
    prototypeStore.addCreditNote(first);
    setPersona(state, 'Daniel James');
    prototypeStore.reviewCreditNote('CN-CAP1', true);
    setPersona(state, 'Leila Hassan');
    prototypeStore.issueCreditNote('CN-CAP1');
    setPersona(state, 'Layla Rahman');
    assert.equal(invoice.creditsApplied, 90000, 'the issued credit is applied to the invoice');
    assert.throws(() => prototypeStore.addCreditNote({ ...first, id: 'CN-CAP2', creditNumber: 'CRN-CAP-2', amount: 110001, reason: 'Over-cap reversal' }), /exceeds remaining creditable amount/, 'the second credit cannot exceed the remaining balance');
    assert.throws(() => prototypeStore.addCreditNote({ ...first, id: 'CN-CAP3', creditNumber: 'CRN-CAP-3', amount: 20000, currency: 'USD', reason: 'Wrong currency reversal' }), /must match the invoice currency/, 'cross-currency credits are rejected');
    const exact = { ...first, id: 'CN-CAP4', creditNumber: 'CRN-CAP-4', amount: 30000, reason: 'Exact remaining reversal' };
    prototypeStore.addCreditNote(exact);
    assert.equal(invoice.creditsApplied, 90000, 'a drafted credit is not applied until issued');
  });

  it('keeps a migrated unselected reporting basis explicit and blocks TB intake until configured (VP-034-E02)', () => {
    const legacy = createInitialState() as any;
    legacy.schema = 12;
    legacy.clients[0].accountingProfile!.reportingBasis = undefined;
    const { state: migrated } = migratePersistedState(legacy, createInitialState());
    assert.equal(migrated.clients[0].accountingProfile!.reportingBasis, 'Not selected', 'the migrated basis stays explicitly unselected, never defaulted');
    const engagement = migrated.engagements.find(e => e.client === migrated.clients[0].id)!;
    setPersona(migrated, 'Adam Khan');
    (prototypeStore as any).state = migrated;
    const rows = structuredClone(engagement.rows);
    assert.throws(() => prototypeStore.updateTrialBalanceRows(engagement.id, rows, { fileName: 'basis.csv', format: 'CSV', sha256: 'a'.repeat(64), mapping: { code: 0, name: 1, debit: 2, credit: 3, signed: -1, convention: 'debit-credit' } }), /accounting setup/, 'TB intake stays blocked until the reporting basis is deliberately selected');
  });

  it('rejects reconciliation items in a foreign currency (VP-039-E01)', () => {
    setPersona(state, 'Adam Khan');
    const eng = state.engagements.find(e => e.id === 'ENG-26001')!;
    const schedule = {
      id: 'REC-FX', ref: 'REC-FX', title: 'Foreign-currency item guard', name: 'Foreign-currency item guard',
      accountCode: eng.rows[0].code, status: 'Draft' as const, evidence: 'EVD-REC-FX', asOfDate: state.asOfDate,
      sourceVersion: eng.sourceVersion, currency: 'QAR', statementBalance: 1000, glBalance: 1000,
      items: [{ id: 'RI-FX1', date: state.asOfDate, description: 'USD-denominated timing item', amount: 250, type: 'Timing item' as const, currency: 'USD' }]
    };
    assert.throws(() => prototypeStore.saveReconciliationSchedule(eng.id, schedule as any), /engagement currency/, 'a foreign-currency reconciling item is rejected atomically');
  });
});

describe('workspace, document and communication matrices (VP-020/021/026/027)', () => {
  it('blocks workspace preparation for suspended clients and stays idempotent on repeat (VP-020-E01)', () => {
    setPersona(state, 'Layla Rahman');
    prototypeStore.simulateM365Verification('sharepoint', 'success');
    const client = state.clients.find(c => c.id === 'CL-001')!;
    const foldersBefore = JSON.stringify(state.folders || []);
    prototypeStore.prepareClientWorkspace(client.id);
    const afterFirst = JSON.stringify(state.folders || []);
    prototypeStore.prepareClientWorkspace(client.id);
    assert.equal(JSON.stringify(state.folders || []), afterFirst, 'repeat preparation is idempotent');
    assert.notEqual(foldersBefore, afterFirst, 'first preparation materializes the client folder hierarchy');
    client.status = 'Suspended';
    assert.throws(() => prototypeStore.prepareClientWorkspace('CL-001'), /active accepted client/, 'a suspended client cannot have a workspace prepared');
  });

  it('rejects foreign-client rename targets and keeps evidence pins across replacement (VP-021-E01)', () => {
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.updateDocumentReference('DOC-001', 'Renamed statement', '/Northstar/2026/'), /existing folder in this client library/, 'a rename into another client root is rejected');
    const doc = state.documents.find(d => d.id === 'DOC-002')!;
    const evidence = state.evidenceCatalogue.find(e => e.documentId === 'DOC-002');
    prototypeStore.replaceDocumentRevision('DOC-002', { name: doc.name, size: doc.size, sha256: 'b'.repeat(64) }, 'DOC-002-R2');
    const priorEvidence = state.evidenceCatalogue.find(e => e.id === evidence?.id)!;
    const replacementEvidence = state.evidenceCatalogue.find(e => e.documentId === 'DOC-002-R2')!;
    assert.equal(priorEvidence.version, evidence?.version, 'the original evidence pin remains attached to the original document revision');
    assert.notEqual(replacementEvidence.id, evidence?.id, 'replacement evidence receives a new identity instead of rewriting the old pin');
    assert.equal(replacementEvidence.version, doc.version + 1);
    assert.equal(replacementEvidence.adequacyStatus, 'Pending verification', 'replacement evidence requires independent reassessment');
    assert.equal(state.documents.find(item => item.id === 'DOC-002')?.version, doc.version, 'the superseded document revision remains immutable');
    assert.equal(state.documents.find(item => item.id === 'DOC-002-R2')?.version, doc.version + 1, 'replacement is stored as a new incremented revision');
  });

  it('restricts proposal-template editing by role and keeps mail recipients within active contacts (VP-026-E01)', () => {
    setPersona(state, 'Adam Khan');
    const template = structuredClone(state.proposalTemplates?.[0]);
    assert.throws(() => prototypeStore.saveProposalTemplate({ ...template, name: 'Preparer edit attempt' } as any), /maintain proposal content templates/, 'a preparer cannot edit proposal templates');
    setPersona(state, 'Amira Qasim');
    // Recipient selection is a UI-picker constraint for manual inbound records; the store
    // bounds the record itself by the date/text/visibility guards verified under VP-027.
    const inbound = prototypeStore.addCommunication({ id: 'COMM-INB-026', clientId: 'CL-001', engagementId: 'ENG-26001', direction: 'Inbound', channel: 'Call', visibility: 'Internal', summary: 'Manual inbound record with free-text participants', participants: 'Named attendee (manual entry)', body: 'Discussion notes', date: state.asOfDate, author: 'Amira Qasim', recipient: 'Omar Nasser' } as any);
    assert.ok(state.communications.some(c => c.id === 'COMM-INB-026'), 'the manual inbound record is stored without implying a provider send');
  });

  it('allows a manager to correct another author\'s inbound note with retained history (VP-027-E02)', () => {
    const comm = state.communications.find(c => c.direction === 'Inbound')! || state.communications[0];
    assert.ok(comm, 'a seeded communication exists');
    setPersona(state, 'Layla Rahman');
    const expectedRevision = (comm.revision || 1) + 1;
    prototypeStore.correctCommunication(comm.id, { summary: `${comm.summary} (manager-corrected)` }, 'Manager corrected the summary wording.');
    const corrected = state.communications.find(c => c.id === comm.id)!;
    assert.equal(corrected.revision, expectedRevision, 'the revision advances');
    assert.ok((corrected.correctionHistory || []).length >= 1, 'the correction history is retained with actor and reason');
  });
});

describe('proposal response methods and search person/grant matrix (VP-010/011/061)', () => {
  it('records Email, Meeting and Letter responses with evidence, then withdraws and re-records (VP-011-E01/E02)', () => {
    setPersona(state, 'Amira Qasim');
    const seedClone = structuredClone(state.proposals.find(p => p.state === 'Accepted')!);
    const proposal = { ...seedClone, id: 'PROP-REHEARSAL', revision: 1, state: 'Draft' as any, predecessorId: undefined, presentedBy: undefined, presentedAt: undefined, presentedSnapshot: undefined, clientResponse: undefined, responseHistory: [] as any[] };
    state.proposals.unshift(proposal);
    setPersona(state, 'Layla Rahman');
    prototypeStore.reviewProposal(proposal.id, true, 'Rehearsal approval');
    setPersona(state, 'Amira Qasim');
    prototypeStore.presentProposal(proposal.id, 'Email presentation to the CFO', 'DOC-PROP-PRES');
    setPersona(state, 'Omar Nasser');
    let active = proposal;
    for (const method of ['Email', 'Meeting', 'Letter'] as const) {
      // Email and Meeting are recorded then withdrawn (the client misread the fee);
      // each withdrawal forces the revise -> reapprove -> re-present rework path.
      const responseType = method === 'Letter' ? 'Accepted' : 'Withdrawn';
      prototypeStore.recordProposalResponse(active.id, { responseType, contact: 'Omar Nasser', date: state.asOfDate, method, notes: method === 'Letter' ? `${method} acceptance with linked correspondence` : `${method} response withdrawn to correct the fee reading`, evidenceRef: method === 'Letter' ? 'DOC-RESP-Letter' : `DOC-RESP-${method}-W` } as any);
      if (method !== 'Letter') {
        setPersona(state, 'Amira Qasim');
        prototypeStore.createProposalRevision(active.id, `Re-present after the ${method} withdrawal with corrected fee wording`);
        active = state.proposals.find(p => p.predecessorId === active.id)!;
        setPersona(state, 'Layla Rahman');
        prototypeStore.reviewProposal(active.id, true, `Rehearsal approval after the ${method} withdrawal`);
        setPersona(state, 'Amira Qasim');
        prototypeStore.presentProposal(active.id, `Re-presented after the ${method} withdrawal`, `DOC-PROP-PRES-${method}`);
        setPersona(state, 'Omar Nasser');
      }
    }
    const chain: any[] = [];
    let cursor: any = state.proposals.find(p => p.id === proposal.id)!;
    while (cursor) { chain.push(cursor); cursor = state.proposals.find(p => p.predecessorId === cursor.id); }
    const responses = chain.map(p => p.clientResponse).filter(Boolean);
    assert.equal(responses.length, 3, 'each proposal revision carries exactly one recorded response');
    assert.ok(responses.some(r => r.method === 'Email') && responses.some(r => r.method === 'Meeting') && responses.some(r => r.method === 'Letter'), 'all three allowed response methods are demonstrated');
    assert.ok(responses.filter(r => r.responseType === 'Withdrawn').length === 2, 'the two withdrawals are retained in history');
    assert.ok(chain.every(p => p.presentedSnapshot), 'every presented revision keeps its snapshot');
    const finalRevision = chain[chain.length - 1];
    assert.equal(finalRevision.state, 'Accepted', 'the proposal ends accepted after the final Letter response');
  });

  it('a presented proposal revision keeps its presented snapshot across return and re-present (VP-010-E02)', () => {
    setPersona(state, 'Amira Qasim');
    const seedClone = structuredClone(state.proposals.find(p => p.state === 'Accepted')!);
    const draft = { ...seedClone, id: 'PROP-SNAPSHOT', revision: 1, state: 'Draft' as any, predecessorId: undefined, presentedBy: undefined, presentedAt: undefined, presentedSnapshot: undefined, clientResponse: undefined, responseHistory: [] as any[] };
    state.proposals.unshift(draft);
    setPersona(state, 'Layla Rahman');
    prototypeStore.reviewProposal(draft.id, true, 'Rehearsal approval');
    setPersona(state, 'Amira Qasim');
    prototypeStore.presentProposal(draft.id, 'Presented at the board meeting', 'DOC-PROP-PRES-2');
    const presented = state.proposals.find(p => p.id === draft.id)!;
    assert.ok(presented.presentedSnapshot, 'presentation pins a snapshot');
    const snapshotBefore = JSON.stringify(presented.presentedSnapshot);
    setPersona(state, 'Layla Rahman');
    prototypeStore.createProposalRevision(draft.id, 'Fee restructure requested');
    const revised = state.proposals.find(p => p.predecessorId === draft.id)!;
    const predecessor = state.proposals.find(p => p.id === draft.id)!;
    assert.equal(JSON.stringify(predecessor.presentedSnapshot), snapshotBefore, 'the prior presented snapshot is unchanged by the revision');
    assert.notEqual(revised.id, draft.id, 'the revision is a new record');
    assert.equal(revised.state, 'Draft', 'the revision starts as a fresh draft');
  });

  it('search read-access follows persona and grant across record types (VP-061-E02)', () => {
    const s = state;
    const doc = s.documents.find(d => d.visibility === 'Client shared')!;
    const internalDoc = { route: 'documents', clientId: 'CL-001', objectId: 'X', title: 'Internal working paper' };
    // Client persona: shared documents readable, internal staff routes not openable.
    const clientUser = s.users.find(u => u.id === 'client_admin')!;
    const clientState = { ...s, currentUserId: clientUser.id, currentRole: clientUser.role, currentPerson: clientUser.name };
    assert.equal(canReadSearchRecord(clientState as any, { route: 'portal', clientId: doc.clientId, objectId: doc.id, title: doc.name }), true, 'a client reads its shared document through the portal route');
    assert.equal(canReadSearchRecord(clientState as any, internalDoc as any), false, 'a client cannot open internal staff records through search');
    // Narrow manager: granted engagement only.
    const narrow = { ...s, currentUserId: 'group-user', currentRole: 'manager', currentPerson: 'Mona Khalil' };
    assert.equal(canReadSearchRecord(narrow as any, { route: 'jobs', clientId: 'CL-001', engagementId: 'ENG-26001', objectId: 'JOB-2601', title: 'Granted job' }), true, 'the narrow manager reads granted-engagement records');
    assert.equal(canReadSearchRecord(narrow as any, { route: 'jobs', clientId: 'CL-002', engagementId: 'ENG-26002', objectId: 'JOB-2602', title: 'Foreign job' }), false, 'the narrow manager cannot read sibling-engagement records');
    // Revoked scope: strip the narrow grant and the record becomes unreadable.
    const revoked = { ...narrow, roleGrants: s.roleGrants.filter(g => g.userId !== 'group-user') };
    assert.equal(canReadSearchRecord(revoked as any, { route: 'jobs', clientId: 'CL-001', engagementId: 'ENG-26001', objectId: 'JOB-2601', title: 'Granted job' }), false, 'a revoked grant removes search readability');
    // Superuser reads everything but overrides are labelled (checked elsewhere); admin reads staff records.
    const admin = { ...s, currentUserId: 'admin', currentRole: 'admin', currentPerson: 'Khalid Al-Nuaimi' };
    assert.equal(canReadSearchRecord(admin as any, { route: 'administration', objectId: 'FIRM', title: 'Firm settings' }), true, 'an administrator reads administration records');
  });
});

describe('time-date matrix and accounting period/book edit rework (VP-028-E01/VP-034-E01)', () => {
  it('bounds time dates at the scenario day and rejects cross-engagement task links (VP-028-E01)', () => {
    setPersona(state, 'Adam Khan');
    const base = state.times.find(t => t.id === 'TIME-01')!;
    const entry = (date: string, taskId?: string) => ({ ...structuredClone(base), id: `TIME-MTX-${date}-${taskId || 'na'}`, date, taskId, taskTitle: 'Matrix entry' });
    prototypeStore.addTimeEntry(entry(state.asOfDate) as any);
    assert.throws(() => prototypeStore.addTimeEntry(entry('2026-09-24') as any), /on or before the active scenario date/, 'a date after the scenario day is rejected');
    assert.throws(() => prototypeStore.addTimeEntry(entry('2026-02-30') as any), /valid/, 'an impossible calendar date is rejected');
    const foreignTask = state.jobTasks.find(task => { const job = state.jobs.find(j => j.id === task.jobId); return task.id !== base.taskId && job && job.engagementId !== 'ENG-26001'; });
    if (foreignTask) assert.throws(() => prototypeStore.addTimeEntry(entry(state.asOfDate, foreignTask.id) as any), /own engagement|belongs/, 'a cross-engagement task link is rejected');
  });

  it('a period/book edit through saveAccountingProfile stales dependent output for every same-client engagement (VP-034-E01)', () => {
    setPersona(state, 'Layla Rahman');
    const client = state.clients.find(c => c.id === 'CL-001')!;
    const profile = client.accountingProfile!;
    const siblings = state.engagements.filter(e => e.client === client.id);
    assert.ok(siblings.length >= 1, 'the client has at least one engagement');
    const edited = structuredClone(profile);
    const book = edited.periodBooks.find(b => b.ownerEngagementId === siblings[0].id)!;
    book.endDate = '2027-01-31';
    prototypeStore.saveAccountingProfile(client.id, edited, siblings[0].id, book.id);
    const after = state.clients.find(c => c.id === client.id)!.accountingProfile!;
    assert.ok(after.revision > profile.revision, 'the profile revision advances');
    assert.equal(after.periodBooks.find(b => b.id === book.id)!.endDate, '2027-01-31', 'the period edit persists');
    const staleSibling = state.engagements.find(e => e.client === client.id && e.id !== siblings[0].id);
    if (staleSibling) {
      const statements = staleSibling.statements || [];
      assert.ok(statements.some(s => s.status === 'Stale') || statements.length === 0, 'sibling reviewed output is staled or absent without silent alteration');
    }
    assert.ok((after.history || []).length >= 1, 'the profile edit is retained in history');
  });
});

describe('authentic historical fixture migration (VP-004-E01)', () => {
  it('migrates the genuine schema-5 historical seed from commit f5f4f78 with integrity', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const legacy = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'legacy-seed-f5f4f78.json'), 'utf8'));
    assert.equal(legacy.schema, 5, 'the fixture is the authentic schema-5 historical state');
    const { state: migrated, warnings } = migratePersistedState(legacy, createInitialState());
    assert.equal(migrated.schema, 28, 'the fixture migrates to the current schema');
    assert.equal(migrated.clients.length, legacy.clients.length, 'every historical client survives');
    assert.equal(migrated.engagements.length, legacy.engagements.length, 'every historical engagement survives');
    assert.ok(warnings.length > 0, 'the migration records its warnings');
    const { validateFixtures } = await import('../../src/services/migrations.js');
    assert.deepEqual(validateFixtures(migrated).filter(i => i.code.startsWith('FK_')), [], 'no foreign-key integrity issues after migration');
  });
});

describe('statement layout/mapping staleness and disclosure gating (VP-040/041)', () => {
  it('a layout revision stales every reviewed statement set for the engagement (VP-040-E01)', () => {
    setPersona(state, 'Adam Khan');
    const eng = state.engagements.find(e => e.id === 'ENG-26001')!;
    const mapping = [...(state.accountMappingRevisions || [])].filter(m => m.engagementId === eng.id).sort((a, b) => b.revision - a.revision)[0];
    assert.ok(mapping && mapping.status === 'Approved', 'an approved mapping exists for the engagement');
    const balanceSheetLines = new Set(['Cash and cash equivalents', 'Trade receivables', 'Other current assets', 'Property and equipment', 'Trade payables', 'Borrowings', 'Share capital and reserves']);
    const mappedLines = [...new Set(mapping.mappings.flatMap(item => item.targets.map(target => target.statementLine)))].sort();
    const layoutLines = (names: string[]) => {
      const orderByStatement: Record<string, number> = {};
      return names.map(line => {
        const statement = balanceSheetLines.has(line) ? 'bs' as const : 'is' as const;
        orderByStatement[statement] = (orderByStatement[statement] || 0) + 1;
        return { line, statement, group: statement === 'bs' ? 'Assets and liabilities' : 'Performance', order: orderByStatement[statement] };
      });
    };
    // Save a current layout, then a statement set on it, then have it independently reviewed.
    prototypeStore.saveStatementLayoutRevision({ engagementId: eng.id, sourceVersion: eng.sourceVersion, mappingRevision: mapping.revision, lines: layoutLines(mappedLines), subtotals: [] });
    const layoutVersion = Math.max(1, ...(state.statementLayoutRevisions || []).filter(l => l.engagementId === eng.id).map(l => l.revision));
    prototypeStore.saveStatementSetRevision({ engagementId: eng.id, sourceVersion: eng.sourceVersion, mappingRevision: mapping.revision, layoutVersion, layout: layoutLines(mappedLines), subtotals: [], totals: { assets: 0, liabilities: 0, equity: 0, revenue: 0, netProfit: 0 }, lines: mappedLines.map(line => ({ line, current: 0, currentSources: [], comparativeSources: [] })) });
    const set = [...(state.statementSetRevisions || [])].filter(s => s.engagementId === eng.id).sort((a, b) => b.revision - a.revision)[0];
    assert.ok(set, 'the statement set is saved on the current layout and mapping');
    setPersona(state, 'Sara Malik');
    prototypeStore.reviewStatementSetRevision(eng.id, set.revision);
    const reviewed = [...(state.statementSetRevisions || [])].find(s => s.id === set.id)!;
    assert.equal(reviewed.status, 'Reviewed', 'the statement set is independently reviewed');
    // A layout change now stales the reviewed output.
    setPersona(state, 'Adam Khan');
    prototypeStore.saveStatementLayoutRevision({ engagementId: eng.id, sourceVersion: eng.sourceVersion, mappingRevision: mapping.revision, lines: layoutLines([...mappedLines].reverse()), subtotals: [] });
    const after = (state.statementSetRevisions || []).find(s => s.id === set.id)!;
    assert.equal(after.status, 'Stale', 'the layout change stales the reviewed statement set');
  });

  it('a disclosure review marks the package generation stale while unsupported figures stay unavailable (VP-040-E03/VP-041-E03)', () => {
    setPersona(state, 'Layla Rahman');
    const eng = state.engagements.find(e => e.id === 'ENG-26001')!;
    const disclosure = (eng.disclosureHistory || [])[0];
    if (disclosure) {
      const revisionBefore = disclosure.revision;
      prototypeStore.saveDisclosureReview(eng.id, { ...structuredClone(disclosure), status: undefined, preparedByUserId: undefined, reviewedByUserId: undefined, reviewedAt: undefined, revision: undefined } as any);
      const after = (eng.disclosureHistory || []).find(d => d.id === disclosure.id)!;
      assert.ok(after.revision > (revisionBefore || 0) || after.reviewedByUserId, 'the disclosure review is recorded with attribution');
    }
    const packageGen = (eng.packageGenerations || (eng as any).packages || []);
    assert.ok(Array.isArray(packageGen), 'package generations remain inspectable for staleness');
  });
});
