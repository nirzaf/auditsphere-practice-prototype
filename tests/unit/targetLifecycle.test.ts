import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { targetFixture, act, acceptance } from '../helpers/targetFixture';
import { TargetLifecycleCommands } from '../../src/store/targetLifecycleCommands';
import { prototypeStore } from '../../src/store/prototypeStore';
import {
  activationBlockers,
  billingSummary,
  criticalConfirmationBlockers,
  currentReview,
  emptyAuditLifecycle,
  fieldworkBlockers,
  firmTrialBalance,
  opinionValidation,
  plusDays,
  reviewBasis
} from '../../src/services/targetLifecycle';
import { requireEngagementScope } from '../../src/services/guards';
import { createTargetScenario } from '../../src/store/targetScenario';
const writer = async (id: string) => ({
  id,
  name: `${id}.pdf`,
  kind: 'PDF',
  mimeType: 'application/pdf',
  size: 3,
  sha256: 'a'.repeat(64)
});
async function ready() {
  const state = targetFixture(),
    e = state.engagements[0];
  (prototypeStore as any).state = state;
  const commands = new TargetLifecycleCommands(
    () => state,
    () => {},
    writer
  );
  // Spec Flow 1 order: Key 1 (accepted proposal/EL) + Key 2 (Partner risk clearance)
  // must BOTH precede EL pin and 50% advance recording.
  act(state, 'manager');
  commands.pinAcceptedProposal(e.id, e.proposalId!);
  prototypeStore.saveAcceptanceCase(acceptance(state));
  act(state, 'partner');
  prototypeStore.decideAcceptanceCase(
    'ACC-TARGET',
    'Accepted',
    'Independent Partner assessment of all five screening areas.'
  );
  prototypeStore.generateEngagementLetter(e.id, 'ISA 210 External Statutory Audit', 'IFRS', state.currentPerson, true);
  act(state, 'billing');
  commands.recordAdvance(e.id, {
    amount: e.agreedFee / 2,
    date: state.asOfDate,
    method: 'Bank transfer',
    reference: 'ADV-TARGET'
  });
  await commands.generateOfficialReceipt(e.id);
  return { state, e, commands };
}
describe('canonical target lifecycle', () => {
  it('starts with no fabricated completion records', () => {
    const s = createTargetScenario();
    assert.equal(s.engagements.length, 0);
    assert.equal(s.confirmations?.length, 0);
    assert.equal(s.firmLedger?.length, 0);
    assert.ok(s.users.every((u) => u.role !== 'eqr'));
  });
  it('requires exact 50% and a current receipt; reversals stale the receipt', async () => {
    const { state, e, commands } = await ready();
    assert.equal(billingSummary(state, e).complete, true);
    assert.deepEqual(activationBlockers(state, e), []);
    act(state, 'billing');
    commands.reverseAdvance(
      e.id,
      e.auditLifecycle!.advancePayments[0].receiptId,
      'Recorded against wrong bank reference'
    );
    assert.equal(billingSummary(state, e).complete, false);
    assert.ok(activationBlockers(state, e).length);
    assert.equal(e.auditLifecycle!.receiptDocuments.length, 1);
  });
  it('blocks a declined case, conditional matters and missing evidence', async () => {
    const { state, e } = await ready();
    state.acceptanceCases![0].decisionStatus = 'Declined';
    assert.throws(() => requireEngagementScope(state, e.id), /declined/);
    state.acceptanceCases![0].decisionStatus = 'Accepted';
    state.acceptanceCases![0].conditions = ['Outstanding conflict'];
    assert.ok(activationBlockers(state, e).some((b) => b.includes('conditional')));
    state.acceptanceCases![0].conditions = [];
    state.acceptanceCases![0].screeningEvidence!.competence = '';
    assert.ok(activationBlockers(state, e).some((b) => b.includes('evidence')));
  });
  it('refuses advance recording while Partner risk clearance (Key 2) is incomplete', async () => {
    const state = targetFixture(),
      e = state.engagements[0];
    (prototypeStore as any).state = state;
    const commands = new TargetLifecycleCommands(() => state, () => {}, writer);
    act(state, 'manager');
    commands.pinAcceptedProposal(e.id, e.proposalId!);
    act(state, 'billing');
    assert.throws(
      () =>
        commands.recordAdvance(e.id, {
          amount: e.agreedFee / 2,
          date: state.asOfDate,
          method: 'Bank transfer',
          reference: 'ADV-NO-KEY2'
        }),
      /Dual-Key Gate: Partner risk clearance is incomplete/
    );
    assert.equal(billingSummary(state, e).complete, false);
  });
  it('rejects incomplete, duplicate, unbalanced and out-of-scope TB sources atomically', async () => {
    const { state, e, commands } = await ready();
    act(state, 'preparer');
    const before = structuredClone(e.rows);
    assert.throws(
      () =>
        commands.importMappedTB(
          e.id,
          [{ code: '1000', name: 'Cash', type: 'asset', balance: 10 }],
          { fileName: 'bad.csv', format: 'CSV', sha256: 'a'.repeat(64) }
        ),
      /balanced/
    );
    assert.deepEqual(e.rows, before);
    const rows = [
      { code: '1000', name: 'Cash', type: 'asset', balance: 100 },
      { code: '3000', name: 'Equity', type: 'equity', balance: -100 }
    ] as any;
    commands.importMappedTB(e.id, rows, {
      fileName: 'tb.csv',
      format: 'CSV',
      sha256: 'a'.repeat(64)
    });
    assert.equal(e.sourceVersion, 1);
    assert.equal(e.planning, false);
    assert.equal(e.mappingApproved, false);
    commands.confirmMapping(
      e.id,
      rows.map((r: any) => ({ code: r.code, line: r.name }))
    );
    assert.equal(e.mappingApproved, true);
    assert.ok(fieldworkBlockers(state, e).some((b) => b.includes('PM')));
  });
  it('keeps critical cancelled/no-response confirmations blocking', async () => {
    const { state, e, commands } = await ready();
    act(state, 'preparer');
    const id = commands.createConfirmation(e.id, {
      type: 'Bank',
      counterparty: 'Example bank',
      relatedFsli: 'Cash',
      ownerUserId: 'preparer',
      dueAt: state.asOfDate,
      critical: true,
      workpaperIds: []
    });
    commands.transitionConfirmation(e.id, id, 'Requested', 'Requested from bank.');
    commands.transitionConfirmation(e.id, id, 'Awaiting', 'Waiting for response.');
    commands.transitionConfirmation(e.id, id, 'No Response', 'No bank response received.');
    assert.equal(criticalConfirmationBlockers(state, e).length, 1);
    act(state, 'manager');
    commands.transitionConfirmation(
      e.id,
      id,
      'Cancelled',
      'Cancelled request without disposing audit matter.'
    );
    assert.equal(criticalConfirmationBlockers(state, e).length, 1);
    assert.throws(
      () => commands.transitionConfirmation(e.id, id, 'Cleared', 'Trying to bypass evidence.'),
      /Cannot move/
    );
  });
  it('stales review when TB, workpaper, findings or evidence change', async () => {
    const { state, e } = await ready();
    const basis = reviewBasis(state, e);
    e.auditLifecycle!.managerReviews.push({
      revision: 1,
      basis,
      actorUserId: 'manager',
      at: new Date().toISOString(),
      notes: 'Assessed basis.'
    });
    assert.equal(currentReview(state, e).manager, true);
    e.sourceVersion++;
    assert.equal(currentReview(state, e).manager, false);
    e.sourceVersion--;
    assert.equal(currentReview(state, e).manager, true);
    e.workpapers.push({
      id: 'WP-TEST',
      version: 1,
      conclusion: 'Changed',
      applicable: true
    } as any);
    assert.equal(currentReview(state, e).manager, false);
  });
  it('rejects unsupported or incomplete modified opinions', () => {
    assert.ok(opinionValidation('Qualified', '', 'short').length === 2);
    assert.ok(opinionValidation('Adverse', '', 'short').length);
    assert.deepEqual(
      opinionValidation('Qualified', 'Revenue', 'Material scope limitation over revenue records.'),
      []
    );
    assert.deepEqual(opinionValidation('Clean', '', ''), []);
  });
  it('blocks frozen writes even for superuser and blocks cross-client access', async () => {
    const { state, e, commands } = await ready();
    e.auditLifecycle!.archiveControl.freezeStatus = 'Frozen';
    act(state, 'superuser');
    assert.throws(() => commands.confirmMapping(e.id, []), /frozen|read-only/);
    assert.throws(() => prototypeStore.addReviewNote(e.id, {} as any), /frozen|read-only/);
    e.auditLifecycle!.archiveControl.freezeStatus = 'Not Started';
    act(state, 'client-northstar');
    assert.throws(() => requireEngagementScope(state, e.id, 'administrative'), /scope|access/i);
  });
  it('uses report date plus 60 calendar days and balances the separate firm ledger', async () => {
    assert.equal(plusDays('2026-09-30', 60), '2026-11-29');
    const { state, e, commands } = await ready();
    act(state, 'billing');
    const before = structuredClone(e.rows);
    commands.postFirmExpense({
      date: state.asOfDate,
      category: 'Office rent',
      amount: 1000,
      description: 'Synthetic office rent',
      reference: 'RENT-01'
    });
    assert.deepEqual(e.rows, before);
    const rows = firmTrialBalance(state);
    assert.equal(
      rows.reduce((n, r) => n + r.debit - r.credit, 0),
      0
    );
    assert.throws(
      () =>
        commands.postFirmExpense({
          date: state.asOfDate,
          category: 'Office rent',
          amount: 1000,
          description: 'Duplicate',
          reference: 'RENT-01'
        }),
      /unique/
    );
  });
});

it('rejects corrupt imported target collections, staffing and firm journals', () => {
  const s = targetFixture();
  s.firmLedger = [
    {
      date: '2026-09-30',
      lines: [
        { account: 'Cash', debit: 10, credit: 0 },
        { account: 'Office rent', debit: 0, credit: 9 }
      ]
    } as any
  ];
  assert.throws(() => prototypeStore.importStateJSON(JSON.stringify(s)), /unbalanced/i);
  s.firmLedger = [];
  s.engagements[0].auditLifecycle!.staffing = [
    { revision: 1, allocations: [{ plannedHours: NaN }] } as any
  ];
  assert.throws(() => prototypeStore.importStateJSON(JSON.stringify(s)), /staffing/i);
});
it('replays Random, Stratified and systematic MUS samples from the same complete population and seed', async () => {
  const { state, e, commands } = await ready();
  act(state, 'manager');
  e.auditLifecycle!.workspace = {
    path: '/synthetic',
    preparedAt: state.asOfDate,
    preparedByUserId: 'admin',
    accessVerifiedAt: state.asOfDate
  };
  commands.saveStaffing(
    e.id,
    [
      { role: 'Partner', userId: 'partner' },
      { role: 'Manager', userId: 'manager' },
      { role: 'Senior/Reviewer', userId: 'reviewer' },
      { role: 'Preparer/Staff', userId: 'preparer' }
    ].map((a) => ({
      ...a,
      phase: 'Fieldwork',
      plannedHours: 10,
      chargeRate: null,
      costRate: null,
      startDate: state.asOfDate,
      endDate: state.asOfDate
    })) as any,
    'Synthetic sampling test allocation'
  );
  act(state, 'preparer');
  commands.importMappedTB(
    e.id,
    [
      { code: '1000', name: 'Cash', type: 'asset', balance: 1000 },
      { code: '3000', name: 'Capital', type: 'equity', balance: -1000 }
    ],
    { fileName: 'tb.csv', format: 'CSV', sha256: 'a'.repeat(64) }
  );
  commands.confirmMapping(e.id, [
    { code: '1000', line: 'Cash' },
    { code: '3000', line: 'Capital' }
  ]);
  state.auditPlans = [
    {
      id: 'PLAN-SAMPLE',
      engagementId: e.id,
      version: 1,
      status: 'Approved',
      sourceVersion: e.sourceVersion
    } as any
  ];
  e.planning = true;
  const id = commands.importPopulation(
    e.id,
    '1000',
    'population.csv',
    'b'.repeat(64),
    [700, 100, 100, 100].map((amount, n) => ({
      id: `R${n}`,
      itemRef: `R${n}`,
      date: '2026-09-01',
      counterparty: 'Synthetic supplier',
      amount,
      tested: false,
      result: 'Untested'
    })) as any
  );
  const p = state.samplePopulations[0];
  for (const method of ['Random', 'Stratified', 'Monetary Unit Sampling'] as const) {
    commands.generateSample(e.id, id, method, 3, 42);
    const selected = p.items.filter((i) => i.selected).map((i) => i.id);
    commands.generateSample(e.id, id, method, 3, 42);
    assert.deepEqual(
      p.items.filter((i) => i.selected).map((i) => i.id),
      selected
    );
    assert.equal(p.selectedCount, selected.length);
    assert.equal(
      p.selectedValue,
      p.items.filter((i) => i.selected).reduce((n, i) => n + i.amount, 0)
    );
    if (method === 'Monetary Unit Sampling')
      assert.ok(p.items.find((i) => i.amount === 700)?.selected);
  }
});
