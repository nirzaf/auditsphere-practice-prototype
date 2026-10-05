import { beforeEach, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrototypeState } from '../../src/types';
import { prototypeStore as store } from '../../src/store/prototypeStore';
import { TargetLifecycleCommands } from '../../src/store/targetLifecycleCommands';
import { targetFixture, act, acceptance } from '../helpers/targetFixture';
import { computeSystemState, currentDeliverables, firmTrialBalance, fsliRiskLevel, reviewBasis, plusDays, modifiedOpinionBasisLines } from '../../src/services/targetLifecycle';

// Acceptance coverage for the requirements-conformity review backlog (R01/R04/R09/R11/R13).
let state: ReturnType<typeof targetFixture>, e: typeof state.engagements[number], commands: TargetLifecycleCommands;
let written: Array<{ id: string; title: string; lines: string[] }>;
const writer = async (id: string, title: string, lines: string[]) => {
  written.push({ id, title, lines });
  return { id, name: `${id}.pdf`, kind: 'PDF' as const, mimeType: 'application/pdf', size: 3, sha256: 'a'.repeat(64) };
};
beforeEach(() => {
  state = targetFixture();
  e = state.engagements[0];
  (store as any).state = state;
  commands = new TargetLifecycleCommands(() => state, () => {}, writer);
  written = [];
});

const partnerReadyFromFixture = (seed?: (state: PrototypeState, e: typeof state.engagements[number]) => void) => {
  state = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/current-partner-approval.json'), 'utf8')) as PrototypeState;
  e = state.engagements.find(item => item.id === state.selectedEngagement)!;
  (store as any).state = state;
  written = [];
  commands = new TargetLifecycleCommands(() => state, () => {}, writer);
  seed?.(state, e);
  if (seed) {
    // Seeded records change the review basis; re-pin the captured Manager review and SRM to
    // the recomputed basis so the fixture represents a manager-reviewed current state.
    const basis = reviewBasis(state, e);
    e.auditLifecycle!.managerReviews.forEach((record) => { record.basis = basis; });
    e.auditLifecycle!.srms.forEach((record) => { record.basis = basis; });
  }
  act(state, 'partner');
  commands.clearPartner(e.id, 'Assigned Partner independently reviewed the current SRM and Red-risk fieldwork.');
  // The command stamps the real wall clock; normalize the decision to the scenario as-of date
  // so the compiled report date (bounded by asOfDate) cannot predate the recorded clearance.
  e.auditLifecycle!.partnerClearances.at(-1)!.at = `${state.asOfDate}T09:00:00.000Z`;
  commands.selectOpinion(e.id, 'Clean', '', '');
  commands.authorizeReportSignature(e.id, state.asOfDate, 'Simulated digital signature and firm seal authorize the current reporting basis.');
};

it('R01: internal review notes stay out of the client bundle; designated cleared correspondence enters once', async () => {
  partnerReadyFromFixture((fixedState, fixedEngagement) => {
    fixedEngagement.reviews.push({
      id: 'RN-INTERNAL-MARKER', wp: 'WP-INTERNAL', title: 'INTERNAL-ONLY-MARKER query', body: 'Internal workpaper query never shown to the client.',
      severity: 'Low', status: 'Cleared', raisedBy: 'Layla Rahman', assigned: 'Adam Khan', due: fixedState.asOfDate, response: 'Resolved internally.', version: 1, history: []
    } as any);
    fixedEngagement.reviews.push({
      id: 'RN-CLIENT-MARKER', wp: 'WP-INTERNAL', title: 'CLIENT-CORRESPONDENCE-MARKER inquiry', body: 'Formal cleared management inquiry.',
      severity: 'Low', status: 'Cleared', raisedBy: 'Layla Rahman', assigned: 'Adam Khan', due: fixedState.asOfDate,
      response: 'Formal response delivered to management.', version: 1, history: [],
      externalVisibility: 'Formal client correspondence', correspondenceHistory: [{ at: new Date().toISOString(), actorUserId: 'partner', visibility: 'Formal client correspondence', reason: 'Formal management inquiry with cleared status.' }]
    } as any);
  });
  await commands.generateDeliverables(e.id, state.asOfDate);
  const correspondence = written.find((w) => w.title === 'Management Correspondences Audit Trail')!;
  assert.ok(correspondence, 'bundle 4 was generated');
  const occurrences = correspondence.lines.filter((line) => line.includes('CLIENT-CORRESPONDENCE-MARKER'));
  assert.equal(occurrences.length, 1, 'designated cleared correspondence appears exactly once');
  assert.ok(!correspondence.lines.some((line) => line.includes('INTERNAL-ONLY-MARKER')), 'internal review marker must not enter the client bundle');
  assert.ok(correspondence.lines.some((line) => /Internal review notes retained in the audit file: \d+/.test(line)), 'the bundle discloses the retained internal note count');
  assert.ok(e.reviews.some((r) => r.id === 'RN-INTERNAL-MARKER'), 'internal note stays in the audit trail');
});

it('R01: designation is an explicit manager/partner decision with a reason and only for cleared notes', () => {
  partnerReadyFromFixture((fixedState, fixedEngagement) => {
    fixedEngagement.reviews.push({
      id: 'RN-DESIGNATE', wp: 'WP-INTERNAL', title: 'Designation probe', body: 'Cleared query.', severity: 'Low', status: 'Cleared',
      raisedBy: 'Layla Rahman', assigned: 'Adam Khan', due: fixedState.asOfDate, response: 'Resolved.', version: 1, history: []
    } as any);
  });
  const note = e.reviews.find((r) => r.id === 'RN-DESIGNATE') as any;
  act(state, 'manager');
  note.status = 'Open';
  assert.throws(() => store.designateReviewCorrespondence(e.id, 'RN-DESIGNATE', true, 'Not cleared yet.'), /cleared/i);
  note.status = 'Cleared';
  store.designateReviewCorrespondence(e.id, 'RN-DESIGNATE', true, 'Formal management correspondence with cleared status.');
  assert.equal(note.externalVisibility, 'Formal client correspondence');
  store.designateReviewCorrespondence(e.id, 'RN-DESIGNATE', false, 'Withdrawn from the client bundle by the Manager.');
  assert.equal(note.externalVisibility, 'Internal only');
  assert.throws(() => store.designateReviewCorrespondence(e.id, 'RN-DESIGNATE', true, ''), /reason/i);
});

it('R09: incomplete findings are omitted from the management letter; complete findings keep their three parts', async () => {
  partnerReadyFromFixture((fixedState, fixedEngagement) => {
    fixedState.findings.push({
      managementLetterVisible: true, id: 'F-COMPLETE', engagementId: fixedEngagement.id, title: 'Segregation of duties gap', category: 'Internal control deficiency', severity: 'Minor',
      condition: 'One clerk both approves and posts payments.', impact: 'Duplicate or fraudulent payments could be processed without detection.',
      recommendation: 'Separate approval and posting duties across two clerks.', disposition: 'Management agreed'
    } as any);
    fixedState.findings.push({
      id: 'F-INCOMPLETE', engagementId: fixedEngagement.id, title: 'INCOMPLETE-MARKER filing gap', category: 'Internal control deficiency', severity: 'Minor',
      condition: 'Supporting documents are filed late.', disposition: 'Management agreed'
    } as any);
  });
  await commands.generateDeliverables(e.id, state.asOfDate);
  const letter = written.find((w) => w.title === 'Management Letter')!;
  assert.ok(letter, 'management letter was generated');
  assert.ok(letter.lines.some((line) => line.includes('Segregation of duties gap') && line.includes('Deficiency')), 'complete finding included as a deficiency');
  assert.ok(letter.lines.some((line) => line.includes('Duplicate or fraudulent payments could be processed')), 'recorded impact is reproduced verbatim');
  assert.ok(letter.lines.some((line) => line.includes('Separate approval and posting duties')), 'recorded recommendation is reproduced verbatim');
  assert.ok(!letter.lines.some((line) => line.includes('INCOMPLETE-MARKER')), 'incomplete finding must not appear');
  assert.ok(letter.lines.some((line) => line.includes('1 finding(s) omitted')), 'the letter discloses the omitted finding');
});

it('A11/R08/R10 four opinions share exported basis and reissues retain one fee and earliest deadline', async () => {
  partnerReadyFromFixture();
  const focus = e.rows.find(r => r.mappedStatementLine)!.mappedStatementLine!;
  const due = e.auditLifecycle!.archiveControl.freezeDueDate;
  for (const value of ['Clean','Qualified','Adverse','Disclaimer'] as const) {
    const basis = value === 'Clean' ? '' : 'Recorded scope limitation for the selected FSLI; no invented valuation defect.';
    commands.selectOpinion(e.id,value,value === 'Clean' ? '' : focus,basis);
    commands.authorizeReportSignature(e.id,state.asOfDate,'Partner authorizes the current opinion and reporting basis with simulated credentials.');
    written=[]; await commands.generateDeliverables(e.id,state.asOfDate);
    const report=written.find(w=>w.title==='Audit Report')!;
    if (value !== 'Clean') for (const line of modifiedOpinionBasisLines(e.auditLifecycle!.opinions.at(-1)!)) assert.ok(report.lines.includes(line));
    assert.ok(!report.lines.some(l=>l.includes('inadequate valuation')));
    assert.equal(new Set(e.auditLifecycle!.balanceInvoices.map(r=>r.invoiceId)).size,1);
    assert.ok(currentDeliverables(state,e)); assert.equal(e.auditLifecycle!.archiveControl.freezeDueDate,due);
  }
  const previous=currentDeliverables(state,e)!.id;
  state.asOfDate=plusDays(state.asOfDate,1);
  commands.authorizeReportSignature(e.id,state.asOfDate,'Synthetic reissue authorization after one day; original deadline retained.');
  assert.equal(currentDeliverables(state,e),undefined,'A superseded signature revision cannot remain current.');
  await commands.generateDeliverables(e.id,state.asOfDate);
  assert.notEqual(currentDeliverables(state,e)!.id,previous);
  assert.equal(e.auditLifecycle!.archiveControl.freezeDueDate,due);
  assert.equal(new Set(e.auditLifecycle!.balanceInvoices.map(r=>r.invoiceId)).size,1);
});

it('R11: a critical Requested confirmation auto-issues a current holding letter, refreshed per blocker set', async () => {
  partnerReadyFromFixture();
  // The fixture already carries one critical Awaiting bank blocker with its own letter.
  const baseline = e.auditLifecycle!.holdingLetters?.length || 0;
  assert.ok(baseline >= 1, 'the captured fixture blocker already has its holding letter');
  act(state, 'preparer');
  const id = commands.createConfirmation(e.id, {
    type: 'Legal', counterparty: 'Synthetic Counsel', relatedFsli: 'Provisions', ownerUserId: 'preparer',
    dueAt: state.asOfDate, critical: true, workpaperIds: []
  });
  const afterCreate = e.auditLifecycle!.holdingLetters!.length;
  await commands.transitionConfirmationWithHandover(e.id, id, 'Requested', 'Critical legal request sent (synthetic).');
  assert.ok(e.auditLifecycle!.holdingLetters!.some((l) => l.sourceBlockers.some((b) => b.includes('Legal confirmation for Synthetic Counsel'))), 'a current letter covers the new critical Requested blocker');
  const afterTransition = e.auditLifecycle!.holdingLetters!.length;
  assert.ok(afterTransition >= afterCreate, 'the new blocker carries a letter');
  await commands.generateHoldingLetter(e.id);
  assert.equal(e.auditLifecycle!.holdingLetters!.length, afterTransition, 'repeated checks never duplicate letters for the same blocker set');
  // An outstanding critical confirmation drops the system state back below PARTNER_APPROVAL:
  // release stays blocked until the matter is cleared, with the current letter on file.
  assert.notEqual(computeSystemState(state, e).state, 'DELIVERABLE_RELEASE', 'release stays blocked while a critical confirmation is outstanding');
});

it('R13: firm TB carries opening balances forward and clears settled receivables in later months', () => {
  state.invoices.push({
    id: 'INV-TB', clientId: e.client, eng: e.id, engagementId: e.id, invoiceNumber: 'INV-TB-1',
    description: 'Final audit balance', amount: 1000, paid: 0, currency: 'QAR', status: 'Issued',
    due: '2026-09-20', issueDate: '2026-09-10', preparedBy: 'tester', revision: 1, lines: []
  } as any);
  state.receipts.push({
    id: 'REC-TB', clientId: e.client, receiptNumber: 'REC-TB-1', amount: 400, currency: 'QAR', date: '2026-10-05',
    method: 'Bank transfer', externalRef: 'REC-TB-1', reference: 'REC-TB-1', allocatedAmount: 400,
    allocations: [{ invoiceId: 'INV-TB', amount: 400, allocatedAt: new Date().toISOString(), date: '2026-10-05' }]
  } as any);
  const september = firmTrialBalance(state, '2026-09');
  const october = firmTrialBalance(state, '2026-10');
  const arSeptember = september.find((r) => r.account === 'Accounts receivable')!;
  const arOctober = october.find((r) => r.account === 'Accounts receivable')!;
  assert.equal(arSeptember.opening, 0);
  assert.equal(arSeptember.closing, 1000, 'September closes with the unpaid invoice');
  assert.equal(arOctober.opening, 1000, 'October opens with the brought-forward receivable');
  assert.equal(arOctober.closing, 600, 'the October payment reduces the carried-forward balance');
  const cashOctober = october.find((r) => r.account === 'Cash')!;
  assert.equal(cashOctober.opening, 0);
  assert.equal(cashOctober.closing, 400);
  const allocation=state.receipts.find(r=>r.id==='REC-TB')!.allocations[0];
  allocation.reversed=true;allocation.reversalDate='2026-11-05';allocation.reversalReason='Synthetic incorrect allocation reversed.';
  const november=firmTrialBalance(state,'2026-11');
  assert.equal(november.find(r=>r.account==='Accounts receivable')!.opening,600);
  assert.equal(november.find(r=>r.account==='Accounts receivable')!.closing,1000);
  assert.equal(november.find(r=>r.account==='Cash')!.closing,0);
  assert.equal(firmTrialBalance(state,'2026-10').find(r=>r.account==='Accounts receivable')!.closing,600,'Later reversals preserve earlier-month settlement history.');
});

it('R04: one workpaper per FSLI with risk-tiered ownership (RED manager/partner, GREEN preparer/senior)', async () => {
  act(state, 'manager');
  commands.pinAcceptedProposal(e.id, e.proposalId!);
  store.saveAcceptanceCase(acceptance(state));
  act(state, 'partner');
  store.decideAcceptanceCase('ACC-TARGET', 'Accepted', 'Independent assessment of all required checks.');
  store.generateEngagementLetter(e.id, 'ISA 210 External Statutory Audit', 'IFRS', state.currentPerson, true);
  act(state, 'billing');
  commands.recordAdvance(e.id, { amount: e.agreedFee / 2, date: state.asOfDate, method: 'Bank transfer', reference: 'ADV-OWNER' });
  await commands.generateOfficialReceipt(e.id);
  act(state, 'admin');
  store.simulateM365Verification('sharepoint', 'success');
  store.prepareClientWorkspace(e.client, e.year, e.id);
  commands.verifyWorkspaceAccess(e.id, 'Verified local simulated evidence workspace.');
  act(state, 'manager');
  commands.importMappedTB(e.id, [
    { code: '1000', name: 'Cash', type: 'asset', balance: 100 },
    { code: '3000', name: 'Capital', type: 'equity', balance: -100 },
    { code: '1100', name: 'Receivables', type: 'asset', balance: 1068420 },
    { code: '4000', name: 'Revenue', type: 'revenue', balance: -1068420 }
  ], { fileName: 'tb.csv', format: 'CSV', sha256: 'a'.repeat(64) });
  commands.confirmMapping(e.id, [
    { code: '1000', line: 'Cash' }, { code: '3000', line: 'Equity' },
    { code: '1100', line: 'Receivables' }, { code: '4000', line: 'Revenue' }
  ]);
  act(state, 'preparer');
  store.saveAuditPlan({ id: 'PLAN-OWNER', engagementId: e.id, version: 1, status: 'Under review', benchmark: 'profit', benchmarkValue: 1068420, materialityRate: 5, overallMateriality: 53000, performanceMaterialityRate: 75, performanceMateriality: 39750, clearlyTrivialRate: 5, clearlyTrivialThreshold: 2650, rationales: ['Owner test plan.'], teamAllocations: [{ person: 'Sara Malik', role: 'Reviewer', scheduledStart: state.asOfDate, scheduledEnd: state.asOfDate }], timingMilestones: [], significantAreas: [] } as any);
  act(state, 'partner');
  store.reviewAuditPlan('PLAN-OWNER', true, 'Partner approves the current basis.');
  act(state, 'manager');
  commands.saveStaffing(e.id, ([
    { userId: 'partner', role: 'Partner' }, { userId: 'manager', role: 'Manager' },
    { userId: 'reviewer', role: 'Senior/Reviewer' }, { userId: 'preparer', role: 'Preparer/Staff' }
  ] as const).map((a) => ({ ...a, phase: 'Fieldwork', plannedHours: 10, chargeRate: a.role === 'Partner' ? 1000 : a.role === 'Manager' ? 750 : a.role === 'Senior/Reviewer' ? 500 : 200, costRate: 100, startDate: state.asOfDate, endDate: state.asOfDate, capacityHours: 40, leaveHours: 0, targetUtilizationPct: 80 })), 'Ownership test staffing.');
  commands.prepareStandardPrograms(e.id);
  const programs = state.auditPrograms.filter((p) => p.engagementId === e.id);
  const workpapers = e.workpapers.filter((w) => w.applicable);
  assert.equal(workpapers.length, programs.length, 'every program has exactly one workpaper');
  const mappedFslis = [...new Set(e.rows.map((r) => r.mappedStatementLine!))];
  for (const line of mappedFslis)
    assert.equal(programs.filter((p) => p.area === line).length, 1, `one program per FSLI: ${line}`);
  // Expense-style FSLIs no longer share a Purchasing program: each mapped line is its own file.
  assert.ok(!programs.some((p) => p.area === 'Purchasing'), 'the Purchasing catch-all is gone');
  for (const workpaper of workpapers) {
    const program = programs.find((p) => p.leadWorkpaperRef === workpaper.id)!;
    const red = (program.financialStatementLines || []).some((line) => fsliRiskLevel(state, e, line) === 'RED');
    assert.equal(workpaper.executionRiskLevel, red ? 'RED' : 'GREEN');
    if (red) {
      assert.equal(workpaper.preparer, 'Layla Rahman', 'RED work executed by the Manager');
      assert.equal(workpaper.reviewer, 'Daniel James', 'RED work reviewed by the assigned Partner');
    } else {
      assert.equal(workpaper.preparer, 'Adam Khan', 'GREEN work executed by the Preparer');
      assert.equal(workpaper.reviewer, 'Sara Malik', 'GREEN work reviewed by the Senior/Reviewer');
    }
  }
});
