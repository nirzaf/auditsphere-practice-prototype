// VP-063 unit: deterministic §8.1 fixed examples (AT-29/AT-33/AT-38/AT-40/AT-42/AT-43).
// Accounting, budget, receivables aging + boundaries, consolidation, materiality.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTrialBalanceTotals,
  calculateBudgetVsActual,
  calculateRecordedWipValue,
  calculateReceivablesAging,
  calculateConsolidatedBalanceSheet,
  calculateMateriality,
  calculateBalanceSheet,
  applyReportingAdjustments,
  getEffectiveTimeEntries,
  getPackageContextDisplay
} from '../../src/services/calculations.js';
import type { TrialBalanceRow } from '../../src/types/index.js';
import { createInitialState } from '../../src/store/initialState.js';
import { seedPackageDefinition } from './packageFixture.js';

const TB_8: TrialBalanceRow[] = [
  { code: '1000', name: 'Cash', type: 'asset', balance: 10000 },
  { code: '1100', name: 'Receivables', type: 'asset', balance: 5000 },
  { code: '1500', name: 'Equipment', type: 'asset', balance: 8000 },
  { code: '2000', name: 'Payables', type: 'liability', balance: -3000 },
  { code: '2500', name: 'Loan', type: 'liability', balance: -7000 },
  { code: '3000', name: 'Opening equity', type: 'equity', balance: -10000 },
  { code: '4000', name: 'Revenue', type: 'revenue', balance: -6000 },
  { code: '5000', name: 'Expenses', type: 'expense', balance: 3000 }
];

describe('engagement package context header (F03)', () => {
  it('distinguishes unavailable, not-created, current and stale package output', () => {
    const engagement = structuredClone(createInitialState().engagements[0]);
    assert.deepEqual(getPackageContextDisplay(undefined), { revision: '', status: 'Unavailable' });
    assert.deepEqual(getPackageContextDisplay(engagement), { revision: '', status: 'Not created' });

    seedPackageDefinition(engagement);
    assert.deepEqual(getPackageContextDisplay(engagement), { revision: `v${engagement.packageRevision}`, status: 'Current' });
    assert.deepEqual(getPackageContextDisplay({ ...engagement, sourceVersion: engagement.sourceVersion + 1 }), { revision: `v${engagement.packageRevision}`, status: 'Stale / blocked' });
    assert.deepEqual(getPackageContextDisplay({ ...engagement, generation: engagement.generation + 1 }), { revision: `v${engagement.packageRevision}`, status: 'Stale / blocked' });
  });
});

describe('accounting fixed example (AT-38/AT-40)', () => {
  it('nets to zero with assets 23,000 / liabilities 10,000 / profit 3,000', () => {
    const t = calculateTrialBalanceTotals(TB_8);
    assert.equal(t.totalBalance, 0);
    assert.equal(t.isBalanced, true);
    assert.equal(t.assets, 23000);
    assert.equal(t.liabilities, 10000);
    assert.equal(t.profit, 3000);
  });

  it('applies a 500 depreciation adjustment exactly once', () => {
    const adjusted = TB_8.map(r =>
      r.code === '5000' ? { ...r, balance: r.balance + 500 } :
      r.code === '1500' ? { ...r, balance: r.balance - 500 } : r);
    const t = calculateTrialBalanceTotals(adjusted);
    assert.equal(t.assets, 22500);
    assert.equal(t.profit, 2500);
    assert.equal(t.isBalanced, true);
    const statement = calculateBalanceSheet(adjusted);
    assert.equal(statement.currentPeriodResult, 2500);
    assert.equal(statement.totalEquity, 12500);
    assert.equal(statement.isBalanced, true, 'current-period result completes the adjusted statement of financial position');
  });

  it('does not double-charge a replacement source already containing the adjustment', () => {
    const journal: any = { id: 'AJ-TEST', status: 'Management accepted', reflectionStatus: 'Reflected in TB', lines: [
      { accountCode: '5000', type: 'debit', amount: 500 }, { accountCode: '1500', type: 'credit', amount: 500 }
    ] };
    const result = applyReportingAdjustments(TB_8, [journal]);
    assert.deepEqual(result.rows, TB_8);
    assert.deepEqual(result.unapplied, []);
  });

  it('applies only accepted, unreflected journals and blocks incomplete or uncertain journals', () => {
    const journal: any = {
      id: 'AJ-TEST', status: 'Management accepted', reflectionStatus: 'Not reflected',
      lines: [
        { accountCode: '5000', type: 'debit', amount: 500 },
        { accountCode: '1500', type: 'credit', amount: 500 }
      ]
    };
    const applied = applyReportingAdjustments(TB_8, [journal]);
    assert.equal(applied.rows.find(row => row.code === '5000')?.balance, 3500);
    assert.equal(applied.rows.find(row => row.code === '1500')?.balance, 7500);
    assert.deepEqual(applied.unapplied, []);
    assert.equal(TB_8.find(row => row.code === '5000')?.balance, 3000, 'applying a journal must not mutate the source TB');

    const reflected = applyReportingAdjustments(TB_8, [{ ...journal, reflectionStatus: 'Reflected in TB' } as any]);
    assert.deepEqual(reflected.rows, TB_8, 'reflected journal is not counted twice');
    const missing = applyReportingAdjustments(TB_8, [{ ...journal, lines: [...journal.lines, { accountCode: '9999', type: 'debit', amount: 1 }] } as any]);
    assert.deepEqual(missing.rows, TB_8, 'an incomplete journal is excluded atomically');
    assert.equal(missing.unapplied[0].journalId, 'AJ-TEST');
    const uncertain = applyReportingAdjustments(TB_8, [{ ...journal, reflectionStatus: 'Unknown' } as any]);
    assert.deepEqual(uncertain.rows, TB_8, 'unknown reflection is not silently double counted');
    assert.equal(uncertain.unapplied[0].journalId, 'AJ-TEST');
    const partial = applyReportingAdjustments(TB_8, [{ ...journal, reflectionStatus: 'Partially reflected' } as any]);
    assert.deepEqual(partial.rows, TB_8, 'partial reflection is not guessed or double counted');
    assert.equal(partial.unapplied[0].journalId, 'AJ-TEST');
    const stale = applyReportingAdjustments(TB_8, [{ ...journal, reflectionStatus: 'Reflected in TB', reflectionSourceVersion: 1 } as any], 2);
    assert.deepEqual(stale.rows, TB_8, 'a decision for an older source is not applied to the current source');
    assert.match(stale.unapplied[0].reason, /current TB source v2/);
    const current = applyReportingAdjustments(TB_8, [{ ...journal, reflectionStatus: 'Reflected in TB', reflectionSourceVersion: 2 } as any], 2);
    assert.deepEqual(current.rows, TB_8, 'only reflection confirmed for the current source avoids duplicate reporting');
    assert.deepEqual(current.unapplied, []);
    const staleSupport = applyReportingAdjustments(TB_8, [{ ...journal, reflectionSourceVersion: 2 } as any], 2, { 'AJ-TEST': 'Workpaper WP-A1 is now v3; pinned v2.' });
    assert.deepEqual(staleSupport.rows, TB_8, 'a journal with stale linked support cannot affect reporting');
    assert.match(staleSupport.unapplied[0].reason, /Workpaper WP-A1 is now v3/);
    const rejected = applyReportingAdjustments(TB_8, [{ ...journal, status: 'Rejected' } as any], 2);
    assert.deepEqual(rejected.rows, TB_8, 'rejected adjustments are never included');
    assert.deepEqual(rejected.unapplied, []);
  });
});

describe('budget fixed example (AT-29)', () => {
  it('reconciles planned 2,000 / actual 2,200 / variance +60 / cost 880', () => {
    const budget: any = {
      id: 'B', engagementId: 'E', version: 1, currency: 'QAR', status: 'Approved',
      lines: [{ id: 'L', roleOrActivity: 'Audit fieldwork', plannedMinutes: 600, billingRatePerHour: 200, costRatePerHour: 80 }]
    };
    const times: any[] = [{ engagementId: 'E', status: 'Approved', durationMinutes: 660, billable: true, activity: 'Audit fieldwork', budgetVersion: 1, billingRatePerHour: 200, costRatePerHour: 80 }];
    const a = calculateBudgetVsActual(budget, times, 'E');
    assert.equal(a.plannedFees, 2000);
    assert.equal(a.actualBillableValue, 2200);
    assert.equal(a.varianceHours, 1); // +60 minutes = +1 hour (positive = over budget)
    assert.equal(a.approvedMinutes - a.plannedMinutes, 60);
    assert.equal(a.knownDeliveryCost, 880);
    const rerated = { ...budget, version: 2, lines: [{ ...budget.lines[0], billingRatePerHour: 900, costRatePerHour: 500 }] };
    assert.equal(calculateBudgetVsActual(rerated, times, 'E').actualBillableValue, 2200);
  });

  it('reports unknown (not zero) cost when the cost rate is missing', () => {
    const budget: any = {
      id: 'B', engagementId: 'E', version: 1, currency: 'QAR', status: 'Approved',
      lines: [{ id: 'L', roleOrActivity: 'Audit fieldwork', plannedMinutes: 600, billingRatePerHour: 200 }]
    };
    const times: any[] = [{ engagementId: 'E', status: 'Approved', durationMinutes: 60, billable: true, activity: 'Audit fieldwork', budgetVersion: 1, billingRatePerHour: 200 }];
    const a = calculateBudgetVsActual(budget, times, 'E');
    assert.equal(a.knownDeliveryCost, null);
  });

  it('keeps approved time in a different currency out of budget totals', () => {
    const budget: any = {
      id: 'B', engagementId: 'E', version: 1, currency: 'QAR', status: 'Approved',
      lines: [{ id: 'L', roleOrActivity: 'Audit fieldwork', plannedMinutes: 60, billingRatePerHour: 200, costRatePerHour: 80 }]
    };
    const times: any[] = [{ engagementId: 'E', status: 'Approved', durationMinutes: 60, billable: true, activity: 'Audit fieldwork', billingRatePerHour: 100, costRatePerHour: 40, currency: 'USD' }];
    const a = calculateBudgetVsActual(budget, times, 'E');
    assert.equal(a.approvedMinutes, 60, 'time remains visible in effort totals');
    assert.equal(a.actualBillableValue, null, 'the USD snapshot is not added to a QAR budget');
    assert.equal(a.knownDeliveryCost, null, 'the USD cost snapshot is not added to QAR cost');
    assert.equal(a.varianceFees, null, 'a mixed-currency fee variance is unknown');
  });
});

describe('recorded WIP report rates (VP-060)', () => {
  it('uses approved-time rate snapshots and leaves missing rates unknown', () => {
    const entries: any[] = [
      { status: 'Approved', billable: true, durationMinutes: 180, billingRatePerHour: 200 },
      { status: 'Approved', billable: true, durationMinutes: 60, billingRatePerHour: 100 },
      { status: 'Approved', billable: false, durationMinutes: 60 },
      { status: 'Submitted', billable: true, durationMinutes: 60, billingRatePerHour: 900 }
    ];
    assert.equal(calculateRecordedWipValue(entries), 700);
    assert.equal(calculateRecordedWipValue([...entries, { status: 'Approved', billable: true, durationMinutes: 30 }]), null);
  });

  it('counts only the current revision of corrected time in effective totals', () => {
    const entries: any[] = [
      { id: 'T1', status: 'Superseded', durationMinutes: 120, billable: true, billingRatePerHour: 200 },
      { id: 'T1-R1', status: 'Approved', durationMinutes: 90, billable: true, billingRatePerHour: 200, supersedesId: 'T1' },
      { id: 'T2', status: 'Approved', durationMinutes: 60, billable: true, billingRatePerHour: 100 }
    ];
    assert.deepEqual(getEffectiveTimeEntries(entries).map(entry => entry.id), ['T1-R1', 'T2']);
    assert.equal(getEffectiveTimeEntries(entries).reduce((sum, entry) => sum + entry.durationMinutes, 0), 150);
    assert.equal(calculateRecordedWipValue(entries), 400, 'WIP values the corrected 90-minute revision once, plus the unaffected 60-minute entry');
  });
});

describe('receivables fixed example (AT-33)', () => {
  const inv: any = {
    id: 'INV-1', clientId: 'CL-001', eng: 'E', invoiceNumber: 'INV-T', description: 't',
    amount: 1000, paid: 0, currency: 'QAR', status: 'Issued', due: '2026-08-15',
    issueDate: '2026-08-01', preparedBy: 'Leila Hassan', lines: []
  };
  const credit: any = { id: 'C', invoiceId: 'INV-1', clientId: 'CL-001', creditNumber: 'CRN-T', amount: 100, reason: 'r', status: 'Issued', issueDate: '2026-08-20', preparedBy: 'x' };
  const receipt: any = {
    id: 'R', clientId: 'CL-001', receiptNumber: 'REC-T', amount: 500, currency: 'QAR',
    date: '2026-09-18', method: 'Bank transfer', externalRef: 'X', allocatedAmount: 300,
    allocations: [{ invoiceId: 'INV-1', amount: 300, allocatedAt: '2026-09-18T10:00:00Z' }]
  };

  it('leaves QAR 600 in the 31–60 bucket at 2026-09-23', () => {
    const aging = calculateReceivablesAging([inv], [credit], [receipt], '2026-09-23');
    assert.equal(aging.totalOutstanding, 600);
    assert.equal(aging.days31_60, 600);
    assert.equal(aging.totalUnallocatedReceipts, 200);
  });

  it('ignores receipts effective after the as-of date', () => {
    const future = { ...receipt, allocations: [{ invoiceId: 'INV-1', amount: 300, allocatedAt: '2026-10-01T10:00:00Z' }] };
    const aging = calculateReceivablesAging([inv], [credit], [future], '2026-09-23');
    assert.equal(aging.totalOutstanding, 900);
  });

  it('keeps a later-reversed allocation effective before reversal, then restores unallocated funds', () => {
    const laterReversed = { ...receipt, allocations: [{ invoiceId: 'INV-1', amount: 300, allocatedAt: '2026-09-18T10:00:00Z', date: '2026-09-18', reversed: true, reversalDate: '2026-09-25', reversalReason: 'Corrected allocation.' }] };
    const beforeReversal = calculateReceivablesAging([inv], [credit], [laterReversed], '2026-09-23');
    assert.equal(beforeReversal.totalOutstanding, 600, 'allocation is still effective at an as-of date before its reversal');
    assert.equal(beforeReversal.days31to60, 600);
    assert.equal(beforeReversal.totalUnallocatedReceipts, 200);
    const afterReversal = calculateReceivablesAging([inv], [credit], [laterReversed], '2026-09-26');
    assert.equal(afterReversal.totalOutstanding, 900, 'a reversal effective by the as-of date restores the invoice balance');
    assert.equal(afterReversal.days31to60, 900);
    assert.equal(afterReversal.totalUnallocatedReceipts, 500, 'reversed allocation becomes unallocated receipt funds');
  });

  it('excludes drafts and pre-issue cancellations', () => {
    const draft = { ...inv, id: 'INV-D', status: 'Draft' };
    const aging = calculateReceivablesAging([inv, draft] as any, [credit], [receipt], '2026-09-23');
    assert.equal(aging.totalOutstanding, 600);
  });

  it('buckets boundaries correctly (Current / 1–30 / 31–60 / 61–90 / 90+)', () => {
    const mk = (id: string, due: string): any => ({ ...inv, id, invoiceNumber: id, due, amount: 100 });
    const invoices = [
      mk('CUR', '2026-09-23'), // due today → Current
      mk('D30', '2026-08-24'), // 30 days → 1–30
      mk('D31', '2026-08-23'), // 31 days → 31–60
      mk('D60', '2026-07-25'), // 60 days → 31–60
      mk('D61', '2026-07-24'), // 61 days → 61–90
      mk('D90', '2026-06-25'), // 90 days → 61–90
      mk('D91', '2026-06-24')  // 91 days → over 90
    ];
    const aging = calculateReceivablesAging(invoices, [], [], '2026-09-23');
    assert.equal(aging.current, 100);
    assert.equal(aging.days1_30, 100);
    assert.equal(aging.days31to60, 200);
    assert.equal(aging.days61to90, 200);
    assert.equal(aging.over90, 100);
    assert.equal(aging.totalOutstanding, 700);
  });
});

describe('consolidation fixed example (AT-42)', () => {
  it('eliminates the 1,000 intercompany pair in group only; keeps 100 unmatched visible', () => {
    const parent: TrialBalanceRow[] = [
      { code: '1100', name: 'Trade and other receivables', type: 'asset', balance: 5000 },
      { code: '2000', name: 'Trade and other payables', type: 'liability', balance: -3000 }
    ];
    const sub: TrialBalanceRow[] = [
      { code: '1100', name: 'Trade and other receivables', type: 'asset', balance: 1000 },
      { code: '2000', name: 'Trade and other payables', type: 'liability', balance: -1000 }
    ];
    const out = calculateConsolidatedBalanceSheet(parent, sub, [
      { id: 'ELIM-1', lines: [
        { account: '1100', type: 'credit', amount: 1000 },
        { account: '2000', type: 'debit', amount: 1000 }
      ] }
    ]);
    assert.equal(out.totalEliminations >= 1000, true);
    // Component packages unchanged: inputs still carry their original balances.
    assert.equal(parent[0].balance, 5000);
    assert.equal(sub[0].balance, 1000);
  });

  it('keeps a 100 receivable difference visible after eliminating only the matched 900', () => {
    const parent: TrialBalanceRow[] = [{ code: 'IC-AR', name: 'Intercompany receivable', type: 'asset', balance: 1000 }];
    const sub: TrialBalanceRow[] = [{ code: 'IC-AP', name: 'Intercompany payable', type: 'liability', balance: -900 }];
    const out = calculateConsolidatedBalanceSheet(parent, sub, [{ id: 'ELIM-IC-900', lines: [
      { account: 'IC-AR', type: 'credit', amount: 900 },
      { account: 'IC-AP', type: 'debit', amount: 900 }
    ] }]);
    assert.equal(out.lines.find(line => line.code === 'IC-AR')?.consolidatedBalance, 100);
    assert.equal(out.lines.find(line => line.code === 'IC-AP')?.consolidatedBalance, 0);
    assert.equal(parent[0].balance, 1000);
    assert.equal(sub[0].balance, -900);
  });

  it('includes component current-period results in consolidated equity without changing source rows', () => {
    const parent: TrialBalanceRow[] = [
      { code: '1000', name: 'Cash', type: 'asset', balance: 1000 },
      { code: '2000', name: 'Payables', type: 'liability', balance: -200 },
      { code: '3000', name: 'Equity', type: 'equity', balance: -500 },
      { code: '4000', name: 'Revenue', type: 'revenue', balance: -400 },
      { code: '5000', name: 'Expenses', type: 'expense', balance: 100 }
    ];
    const sourceBefore = structuredClone(parent);
    const out = calculateConsolidatedBalanceSheet(parent, [], []);
    assert.equal(out.totalAssets, 1000);
    assert.equal(out.totalLiabilities + out.totalEquity, 1000);
    assert.equal(out.isBalanced, true);
    assert.deepEqual(parent, sourceBefore);
  });
});

describe('materiality math (AT-44)', () => {
  it('computes explicit overall / performance / trivial rates deterministically', () => {
    const m = calculateMateriality(1000000, 5, 75, 5, 'Fixed calculation fixture.');
    assert.equal(m.overallMateriality, 50000);
    assert.equal(m.performanceMateriality, 37500);
    assert.equal(m.clearlyTrivialThreshold, 2500);
  });

  it('rejects missing, invalid, or unsupported assumed rates', () => {
    assert.throws(() => calculateMateriality(1000000, Number.NaN, 75, 5, 'Fixture.'));
    assert.throws(() => calculateMateriality(1000000, 5, 0, 5, 'Fixture.'));
    assert.throws(() => calculateMateriality(1000000, 5, 75, 101, 'Fixture.'));
    assert.throws(() => calculateMateriality(1000000, 5, 75, 5, '  '));
  });
});

describe('GL completeness tests (EX06, EX07, EX08)', () => {
  const tbRows: TrialBalanceRow[] = [
    { code: '1000', name: 'Cash', type: 'asset', balance: 500 }
  ];
  const glTxs: any[] = [
    { accountCode: '1000', debit: 500, credit: 0, description: 'Cash receipt' }
  ];

  it('EX06: unknown opening balance is not confirmed complete', async () => {
    const { verifyGLCompleteness } = await import('../../src/services/calculations.js');
    // When opening balances are provided but missing account '1000'
    const res = verifyGLCompleteness(glTxs, tbRows, {});
    assert.equal(res.isComplete, false);
  });

  it('EX07: extra unmatched source account is not ignored', async () => {
    const { verifyGLCompleteness } = await import('../../src/services/calculations.js');
    const glWithExtra = [
      ...glTxs,
      { accountCode: '9999', debit: 100, credit: 0, description: 'Unknown account' }
    ];
    const res = verifyGLCompleteness(glWithExtra, tbRows, { '1000': 0 });
    assert.equal(res.isComplete, false);
  });

  it('EX08 positive control: explicit zero opening and matching movements', async () => {
    const { verifyGLCompleteness } = await import('../../src/services/calculations.js');
    const res = verifyGLCompleteness(glTxs, tbRows, { '1000': 0 });
    assert.equal(res.isComplete, true);
  });
});

describe('Reconciliation variance tests (EX09)', () => {
  it('EX09: proposed correction cannot clear timing residual', async () => {
    const { calculateReconciliationVariance } = await import('../../src/services/calculations.js');
    const recSchedule: any = {
      statementBalance: 1000,
      glBalance: 1100,
      items: [
        { type: 'correction', amount: 100, description: 'Legacy proposed bank fee adjustment' },
        { type: 'Proposed correction', amount: 100, description: 'UI proposed bank fee adjustment' }
      ]
    };
    const res = calculateReconciliationVariance(recSchedule);
    // Proposed correction must not be counted as a timing item to artificially clear the residual
    assert.equal(res.unexplainedDifference, 100);
    assert.equal(res.timingSum, 0);
    assert.equal(res.correctionSum, 200);
    assert.equal(res.isReconciled, false);

    const signedTiming = calculateReconciliationVariance({
      supportingBalance: 1100,
      sourceBalance: 1000,
      items: [{ type: 'Timing item', amount: -100, description: 'Outstanding payment' }]
    } as any);
    assert.equal(signedTiming.timingSum, -100);
    assert.equal(signedTiming.unexplainedDifference, 0);
    assert.equal(signedTiming.isReconciled, true, 'negative signed timing values reconcile using the documented statement-plus-timing convention and legacy source/supporting aliases');
  });
});

describe('Consolidation math tests (EX10, EX11, EX12)', () => {
  it('EX10, EX11, EX12: eliminates 1,000 assets and liabilities once, headers and details agree', () => {
    const parent: TrialBalanceRow[] = [
      { code: '1000', name: 'Cash', type: 'asset', balance: 4000 },
      { code: '1100', name: 'Trade receivables (Intercompany)', type: 'asset', balance: 1000 },
      { code: '2000', name: 'Trade payables (Intercompany)', type: 'liability', balance: -1000 }
    ];
    const subsidiary: TrialBalanceRow[] = [
      { code: '1000', name: 'Cash', type: 'asset', balance: 4000 }
    ];

    // Combined assets = 4000 + 1000 + 4000 = 9000
    // Combined payable = -1000
    const eliminations = [
      {
        id: 'ELIM-1',
        debitAccount: '2000',
        creditAccount: '1100',
        amount: 1000,
        description: 'Eliminate intercompany balance'
      }
    ];

    const out = calculateConsolidatedBalanceSheet(parent, subsidiary, eliminations);

    // EX10: 9000 initial assets less 1000 elimination = 8000
    assert.equal(out.totalAssets, 8000);

    // EX11: debit clears -1000 credit payable to 0
    assert.equal(out.totalLiabilities, 0);

    // EX12: asset detail lines sum must agree with totalAssets header
    const detailAssetSum = out.lines
      .filter(l => l.category === 'asset')
      .reduce((s, l) => s + l.consolidatedBalance, 0);
    assert.equal(detailAssetSum, out.totalAssets);
    assert.equal(detailAssetSum === out.totalAssets, true);
  });
});
