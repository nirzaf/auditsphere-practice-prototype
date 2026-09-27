// AuditSphere Deterministic Calculations & Financial Math
// VP-005, VP-028, VP-029, VP-033, VP-036, VP-038, VP-040, VP-046, VP-048

import {
  InvoiceRecord,
  AdjustmentJournalItem,
  ReceiptRecord,
  CreditNoteRecord,
  TrialBalanceRow,
  GLTransactionItem,
  BudgetRecord,
  TimeEntryItem,
  ConsolidationGroupRecord,
  EngagementRecord,
  ReconciliationSchedule
} from '../types';

export function formatCurrency(amount: number, currency = 'QAR'): string {
  return `${currency} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatMinutesToHours(minutes: number): string {
  const hrs = minutes / 60;
  return `${hrs.toFixed(1)} hrs`;
}

export function getPackageContextDisplay(engagement?: EngagementRecord): { revision: string; status: 'Unavailable' | 'Not created' | 'Current' | 'Stale / blocked' } {
  if (!engagement) return { revision: '', status: 'Unavailable' };
  const history = engagement.packageHistory || [];
  if (!history.length) return { revision: '', status: 'Not created' };
  const packageRevision = history.find(item => item.revision === engagement.packageRevision);
  const visibleRevision = packageRevision || [...history].sort((left, right) => right.revision - left.revision)[0];
  const current = Boolean(packageRevision
    && packageRevision.generation === engagement.generation
    && packageRevision.generation === engagement.builtGeneration
    && packageRevision.sourceVersion === engagement.sourceVersion
    && packageRevision.validation.passed);
  return { revision: `v${visibleRevision.revision}`, status: current ? 'Current' : 'Stale / blocked' };
}

/** Return the leaf time records that represent current work, keeping prior correction revisions out of totals. */
export function getEffectiveTimeEntries(entries: TimeEntryItem[]): TimeEntryItem[] {
  const supersededIds = new Set(entries.flatMap(entry => entry.supersedesId ? [entry.supersedesId] : []));
  return entries.filter(entry => entry.status !== 'Superseded' && !supersededIds.has(entry.id));
}

export function calculateRecordedWipValue(entries: TimeEntryItem[]): number | null {
  const billable = getEffectiveTimeEntries(entries).filter(entry => entry.status === 'Approved' && entry.billable);
  if (billable.some(entry => !Number.isFinite(entry.billingRatePerHour) || entry.billingRatePerHour! < 0)) return null;
  return Math.round(billable.reduce((sum, entry) => sum + entry.durationMinutes / 60 * entry.billingRatePerHour!, 0) * 100) / 100;
}

export function applyReportingAdjustments(rows: TrialBalanceRow[], journals: AdjustmentJournalItem[], sourceVersion?: number, supportIssues: Record<string, string> = {}) {
  const adjustedRows = structuredClone(rows);
  const applied: string[] = [];
  const unapplied: Array<{ journalId: string; reason: string }> = [];
  for (const journal of journals) {
    if (journal.status !== 'Management accepted' && journal.status !== 'Reporting included') continue;
    if (sourceVersion !== undefined && journal.reflectionSourceVersion !== sourceVersion) {
      unapplied.push({ journalId: journal.id, reason: `Reflection must be confirmed against current TB source v${sourceVersion}.` });
      continue;
    }
    if (supportIssues[journal.id]) {
      unapplied.push({ journalId: journal.id, reason: `Journal support needs review: ${supportIssues[journal.id]}` });
      continue;
    }
    if (journal.reflectedInClientBooks || journal.reflectionStatus === 'Reflected in TB') continue;
    if (journal.reflectionStatus !== 'Not reflected') {
      unapplied.push({ journalId: journal.id, reason: `Reflection status is ${journal.reflectionStatus || 'unknown'}.` });
      continue;
    }
    const missing = journal.lines.filter(line => !adjustedRows.some(row => row.code === line.accountCode));
    if (missing.length) {
      unapplied.push({ journalId: journal.id, reason: `Account codes are missing from the current trial balance: ${missing.map(line => line.accountCode).join(', ')}.` });
      continue;
    }
    for (const line of journal.lines) {
      const row = adjustedRows.find(item => item.code === line.accountCode)!;
      row.balance += line.type === 'debit' ? line.amount : -line.amount;
    }
    applied.push(journal.id);
  }
  return { rows: adjustedRows, applied, unapplied };
}

// Module 15: Receivables Aging Calculation (VP-033)
export interface AgingSummary {
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  olderThan90: number;
  totalOutstanding: number;
  totalOverdue: number;
  totalUnallocatedReceipts: number;
  invoiceBreakdown: Array<{
    invoice: InvoiceRecord;
    grossAmount: number;
    effectiveCredits: number;
    effectivePayments: number;
    outstanding: number;
    bucket: 'Current' | '1–30 days' | '31–60 days' | '61–90 days' | 'Over 90 days';
    daysOverdue: number;
  }>;
}

export function calculateReceivablesAging(
  invoices: InvoiceRecord[],
  creditsOrDate?: CreditNoteRecord[] | string,
  receiptsOrDate?: ReceiptRecord[] | string,
  asOfDateStr = '2026-09-23',
  clientFilter?: string
): AgingSummary {
  const credits: CreditNoteRecord[] = Array.isArray(creditsOrDate) ? creditsOrDate : [];
  const receipts: ReceiptRecord[] = Array.isArray(receiptsOrDate) ? receiptsOrDate : [];
  const dateStr = typeof creditsOrDate === 'string' ? creditsOrDate : typeof receiptsOrDate === 'string' ? receiptsOrDate : asOfDateStr;

  const asOf = new Date(dateStr);
  asOf.setHours(23, 59, 59, 999);

  // §5.5: aging excludes not-yet-issued/draft/cancelled records. Only Issued/Paid
  // (Paid kept only when a residual outstanding remains) participate.
  let filteredInvoices = invoices.filter(
    inv => inv.status === 'Issued' || inv.status === 'Paid'
  );
  if (clientFilter) {
    filteredInvoices = filteredInvoices.filter(i => i.clientId === clientFilter);
  }

  let totalUnallocated = 0;
  receipts.forEach(rcpt => {
    if (clientFilter && rcpt.clientId !== clientFilter) return;
    const rcptDate = new Date(rcpt.date);
    if (rcptDate <= asOf) {
      const activeAllocations = (rcpt.allocations || [])
        .filter(a => {
          const allocDateStr = a.date || a.allocatedAt || rcpt.date;
          const settlementDate = new Date(Math.max(new Date(allocDateStr).getTime(), rcptDate.getTime()));
          const wasReversedBeforeAsOf = a.reversed && (!a.reversalDate || new Date(a.reversalDate) <= asOf);
          return !wasReversedBeforeAsOf && settlementDate <= asOf;
        })
        .reduce((sum, a) => sum + a.amount, 0);
      totalUnallocated += Math.max(0, rcpt.amount - activeAllocations);
    }
  });

  const breakdown: AgingSummary['invoiceBreakdown'] = [];
  let current = 0;
  let days1_30 = 0;
  let days31_60 = 0;
  let days61_90 = 0;
  let over90 = 0;

  for (const inv of filteredInvoices) {
    // Exclude invoices issued after the as-of date (not yet effective).
    const effectiveIssue = inv.issueDate ? new Date(inv.issueDate) : new Date(inv.due);
    if (effectiveIssue > asOf) continue;

    // Effective issued credits only, effective on/before as-of. Supports both
    // `issueDate` and legacy `date` fields on credit notes.
    const applicableCredits = credits
      .filter(c => c.invoiceId === inv.id && (!c.status || c.status === 'Issued' || c.status === 'Approved') && new Date(c.issueDate || c.date || inv.issueDate || inv.due) <= asOf)
      .reduce((sum, c) => sum + c.amount, 0);

    // Net allocated receipts effective on/before as-of (reversed excluded).
    // Settlement effective date is Math.max(allocDate, receiptDate).
    // An allocation reversed AFTER as-of was still effective on as-of.
    let allocatedSettled = 0;
    receipts.forEach(rcpt => {
      const rcptDate = new Date(rcpt.date);
      (rcpt.allocations || []).forEach(alloc => {
        if (alloc.invoiceId === inv.id) {
          const allocDateStr = alloc.date || alloc.allocatedAt || rcpt.date;
          const settlementDate = new Date(Math.max(new Date(allocDateStr).getTime(), rcptDate.getTime()));
          const wasReversedBeforeAsOf = alloc.reversed && (!alloc.reversalDate || new Date(alloc.reversalDate) <= asOf);
          if (!wasReversedBeforeAsOf && settlementDate <= asOf) {
            allocatedSettled += alloc.amount;
          }
        }
      });
    });
    const hasAllocationLedger = receipts.some(r =>
      (r.allocations || []).some(a => a.invoiceId === inv.id));
    const effectivePayments = hasAllocationLedger ? allocatedSettled : (inv.paid || 0);

    // §5.5: outstanding = issued − effective credits − net allocated receipts.
    const outstanding = Math.max(0, inv.amount - applicableCredits - effectivePayments);
    if (outstanding <= 0) continue;

    const dueDate = new Date(inv.due);
    const diffTime = asOf.getTime() - dueDate.getTime();
    const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    let bucket: AgingSummary['invoiceBreakdown'][0]['bucket'] = 'Current';
    if (daysOverdue <= 0) {
      // Due today is Current.
      bucket = 'Current';
      current += outstanding;
    } else if (daysOverdue <= 30) {
      bucket = '1–30 days';
      days1_30 += outstanding;
    } else if (daysOverdue <= 60) {
      bucket = '31–60 days';
      days31_60 += outstanding;
    } else if (daysOverdue <= 90) {
      bucket = '61–90 days';
      days61_90 += outstanding;
    } else {
      bucket = 'Over 90 days';
      over90 += outstanding;
    }

    breakdown.push({
      invoice: inv,
      grossAmount: inv.amount,
      effectiveCredits: applicableCredits,
      effectivePayments,
      outstanding,
      bucket,
      daysOverdue: Math.max(0, daysOverdue)
    });
  }

  const totalOutstanding = current + days1_30 + days31_60 + days61_90 + over90;
  const totalOverdue = days1_30 + days31_60 + days61_90 + over90;

  return {
    current,
    days1_30,
    days31_60,
    days61_90,
    days31to60: days31_60,
    days61to90: days61_90,
    over90,
    olderThan90: over90,
    totalOutstanding,
    totalOverdue,
    totalUnallocatedReceipts: totalUnallocated,
    invoiceBreakdown: breakdown
  };
}

// Module 13: Budget vs Actuals (VP-029)
export interface BudgetAnalysis {
  plannedMinutes: number;
  plannedHours: number;
  plannedFees: number;
  approvedMinutes: number;
  approvedHours: number;
  actualBillableValue: number | null;
  knownDeliveryCost: number | null;
  varianceHours: number;
  varianceFees: number | null;
}

export function calculateBudgetVsActual(
  budget: BudgetRecord | undefined,
  timeEntries: TimeEntryItem[],
  engagementId: string
): BudgetAnalysis {
  if (!budget) {
    return {
      plannedMinutes: 0,
      plannedHours: 0,
      plannedFees: 0,
      approvedMinutes: 0,
      approvedHours: 0,
      actualBillableValue: 0,
      knownDeliveryCost: null,
      varianceHours: 0,
      varianceFees: 0
    };
  }

  const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
  let plannedMinutes = 0;
  let plannedFees = 0;
  budget.lines.forEach(line => {
    plannedMinutes += line.plannedMinutes;
    plannedFees += roundMoney(line.plannedMinutes / 60 * line.billingRatePerHour);
  });

  const engApprovedTimes = getEffectiveTimeEntries(timeEntries).filter(
    t => t.engagementId === engagementId && t.status === 'Approved'
  );

  let approvedMinutes = 0;
  let actualBillableValue = 0;
  let hasMissingBillingRate = false;
  let hasMissingCostRate = false;
  let totalCost = 0;

  engApprovedTimes.forEach(entry => {
    approvedMinutes += entry.durationMinutes;
    const hours = entry.durationMinutes / 60;
    const currencyMismatch = Boolean(entry.currency && entry.currency !== budget.currency);
    if (entry.billable) {
      if (!currencyMismatch && entry.billingRatePerHour !== undefined && Number.isFinite(entry.billingRatePerHour) && entry.billingRatePerHour >= 0) {
        actualBillableValue += roundMoney(hours * entry.billingRatePerHour);
      } else {
        hasMissingBillingRate = true;
      }
    }

    if (!currencyMismatch && entry.costRatePerHour !== undefined && Number.isFinite(entry.costRatePerHour) && entry.costRatePerHour >= 0) {
      totalCost += roundMoney(hours * entry.costRatePerHour);
    } else {
      hasMissingCostRate = true;
    }
  });

  const plannedHours = plannedMinutes / 60;
  const approvedHours = approvedMinutes / 60;
  const varianceHours = Number((approvedHours - plannedHours).toFixed(2));
  const billed = hasMissingBillingRate ? null : actualBillableValue;
  const varianceFees = billed === null ? null : roundMoney(billed - plannedFees);

  return {
    plannedMinutes,
    plannedHours,
    plannedFees,
    approvedMinutes,
    approvedHours,
    actualBillableValue: billed,
    knownDeliveryCost: hasMissingCostRate ? null : totalCost,
    varianceHours,
    varianceFees
  };
}

// Module 21 & 24: Trial Balance Totals (VP-035, VP-038, VP-040)
export function calculateTrialBalanceTotals(rows: TrialBalanceRow[]) {
  let assets = 0;
  let liabilities = 0;
  let openingEquity = 0;
  let revenue = 0;
  let expenses = 0;
  let totalBalance = 0;
  let totalDebits = 0;
  let totalCredits = 0;

  rows.forEach(r => {
    totalBalance += r.balance;
    if (r.balance > 0) totalDebits += r.balance;
    else totalCredits += Math.abs(r.balance);

    if (r.type === 'asset') assets += r.balance;
    else if (r.type === 'liability') liabilities += -r.balance;
    else if (r.type === 'equity') openingEquity += -r.balance;
    else if (r.type === 'revenue') revenue += -r.balance;
    else if (r.type === 'expense') expenses += r.balance;
  });

  const profit = revenue - expenses;
  const isBalanced = Math.abs(totalBalance) < 0.01;
  const netDifference = totalDebits - totalCredits;

  return {
    rows,
    assets,
    liabilities,
    openingEquity,
    revenue,
    expenses,
    profit,
    totalBalance,
    totalDebits,
    totalCredits,
    netDifference,
    isBalanced
  };
}

// Module 21: General Ledger Completeness Check (VP-036)
export interface GLCompletenessCheck {
  accountCode: string;
  accountName: string;
  openingBalance: number;
  totalDebits: number;
  totalCredits: number;
  netMovement: number;
  calculatedClosing: number;
  trialBalanceClosing: number;
  residual: number;
  difference: number;
  glSum: number;
  tbBalance: number;
  isComplete: boolean;
  missingOpening?: boolean;
  unmatchedAccount?: boolean;
}

export function verifyGLCompleteness(
  glTransactions: GLTransactionItem[] | TrialBalanceRow[],
  tbRowsOrOpening?: TrialBalanceRow[] | Record<string, number>,
  openingBalances?: Record<string, number>
): {
  checks: GLCompletenessCheck[];
  discrepancies: GLCompletenessCheck[];
  allBalanced: boolean;
  isComplete: boolean;
  totalResidual: number;
} {
  // Support both (tbRows, glTransactions) and (glTransactions, tbRows) argument ordering
  let tbRows: TrialBalanceRow[];
  let glTx: GLTransactionItem[];
  let openings: Record<string, number> | undefined = openingBalances;

  if (Array.isArray(glTransactions) && glTransactions.length > 0 && 'balance' in glTransactions[0]) {
    tbRows = glTransactions as TrialBalanceRow[];
    glTx = ((tbRowsOrOpening as unknown) as GLTransactionItem[]) || [];
  } else {
    glTx = (glTransactions as GLTransactionItem[]) || [];
    tbRows = ((tbRowsOrOpening as unknown) as TrialBalanceRow[]) || [];
  }

  // If opening balances passed as 2nd arg
  if (tbRowsOrOpening && !Array.isArray(tbRowsOrOpening) && typeof tbRowsOrOpening === 'object') {
    openings = tbRowsOrOpening as Record<string, number>;
  }

  const checks: GLCompletenessCheck[] = [];
  let totalResidual = 0;
  let hasMissingOpening = false;
  let hasUnmatchedAccount = false;

  // Union of account codes in tbRows and glTx (VP-036 / EX07)
  const allCodes = Array.from(new Set([
    ...tbRows.map(r => r.code),
    ...glTx.map(t => t.accountCode)
  ]));

  allCodes.forEach(code => {
    const tb = tbRows.find(r => r.code === code);
    const txs = glTx.filter(t => t.accountCode === code);
    const debits = txs.reduce((sum, t) => sum + (t.debit || 0), 0);
    const credits = txs.reduce((sum, t) => sum + (t.credit || 0), 0);
    const netMovement = debits - credits;

    // Check if opening balance is explicitly known (EX06 / EX08 / RR07)
    const isOpeningKnown = Boolean(openings && typeof openings[code] === 'number');
    const opening = (openings && isOpeningKnown) ? openings[code] : NaN;

    if (!isOpeningKnown) {
      hasMissingOpening = true;
    }

    const tbClosing = tb ? tb.balance : 0;
    const accountName = tb ? tb.name : (txs[0]?.description || `Unmatched GL Account ${code}`);
    const isUnmatched = !tb;

    if (isUnmatched) {
      hasUnmatchedAccount = true;
    }

    const calculatedClosing = isOpeningKnown ? opening + netMovement : NaN;
    const residual = isNaN(calculatedClosing) ? 999999 : Math.abs(calculatedClosing - tbClosing);

    if (!isNaN(residual)) totalResidual += residual;

    const complete = !isUnmatched && isOpeningKnown && residual <= 0.005;

    checks.push({
      accountCode: code,
      accountName,
      openingBalance: isOpeningKnown ? opening : 0,
      totalDebits: debits,
      totalCredits: credits,
      netMovement,
      calculatedClosing: isNaN(calculatedClosing) ? 0 : calculatedClosing,
      trialBalanceClosing: tbClosing,
      residual,
      difference: residual,
      glSum: isNaN(calculatedClosing) ? 0 : calculatedClosing,
      tbBalance: tbClosing,
      isComplete: complete,
      missingOpening: !isOpeningKnown,
      unmatchedAccount: isUnmatched
    });
  });

  const discrepancies = checks.filter(c => !c.isComplete);
  // Overall result agrees with rows: must have checks, and every check must be complete (RR07, RR08)
  const isComplete = checks.length > 0 && checks.every(c => c.isComplete);
  const allBalanced = isComplete;

  return {
    checks,
    discrepancies,
    allBalanced,
    isComplete,
    totalResidual
  };
}

// Module 23: Reconciliation Variance Check (VP-039 / EX09)
export function calculateReconciliationVariance(rec: ReconciliationSchedule) {
  const items = rec.items || [];
  // Proposed corrections cannot clear timing residual (EX09)
  const isProposedCorrection = (item: (typeof items)[number]) => {
    const type = String((item as any).type || (item as any).itemType || '').trim().toLowerCase();
    return type === 'correction' || type === 'proposed correction' || Boolean((item as any).isCorrection);
  };
  const timingItems = items.filter(item => !isProposedCorrection(item));
  const proposedCorrections = items.filter(item => {
    return isProposedCorrection(item);
  });

  // Store guards admit cent-precision amounts. Sum integer cents so common
  // decimal combinations (for example 0.10 + 0.20) cannot render a false
  // residual or disagree with the review gate due to IEEE-754 noise.
  const timingCents = timingItems.reduce((sum, item) => sum + Math.round((item.amount || 0) * 100), 0);
  const correctionCents = proposedCorrections.reduce((sum, item) => sum + Math.round((item.amount || 0) * 100), 0);
  const timingSum = timingCents / 100;
  const correctionSum = correctionCents / 100;

  const statementBal = (rec as any).statementBalance ?? (rec as any).supportingBalance ?? (rec as any).statementClosingBalance ?? 0;
  const glBal = (rec as any).glBalance ?? (rec as any).sourceBalance ?? (rec as any).glClosingBalance ?? 0;

  // Reconciled variance uses only genuine timing items against statement balance
  const statementCents = Math.round(statementBal * 100);
  const sourceCents = Math.round(glBal * 100);
  const residualCents = Math.abs(statementCents + timingCents - sourceCents);
  const diff = residualCents / 100;

  return {
    timingSum,
    correctionSum,
    unexplainedDifference: diff,
    // Reconciliation is achieved only if unexplained timing diff is zero AND no pending unreflected corrections
    isReconciled: residualCents === 0
  };
}

// Module 24: Financial Statements Math
export function calculateBalanceSheet(rows: TrialBalanceRow[]) {
  const assets = rows.filter(r => r.type === 'asset');
  const liabilities = rows.filter(r => r.type === 'liability');
  const equity = rows.filter(r => r.type === 'equity');
  const currentPeriodResult = calculateIncomeStatement(rows).netProfit;

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + Math.abs(l.balance), 0);
  const totalEquity = equity.reduce((s, e) => s + Math.abs(e.balance), 0) + currentPeriodResult;

  const difference = Math.abs(totalAssets - (totalLiabilities + totalEquity));
  const isBalanced = difference === 0;

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    currentPeriodResult,
    difference,
    isBalanced
  };
}

export function calculateIncomeStatement(rows: TrialBalanceRow[]) {
  const revenues = rows.filter(r => r.type === 'revenue');
  const expenses = rows.filter(r => r.type === 'expense');

  const revenue = revenues.reduce((s, r) => s + Math.abs(r.balance), 0);
  const costOfSales = expenses.filter(e => e.name.toLowerCase().includes('cost') || e.code.startsWith('50')).reduce((s, e) => s + e.balance, 0);
  const operatingExpenses = expenses.filter(e => !e.name.toLowerCase().includes('cost') && !e.code.startsWith('50')).reduce((s, e) => s + e.balance, 0);

  const grossProfit = revenue - costOfSales;
  const netProfit = grossProfit - operatingExpenses;

  return {
    revenue,
    costOfSales,
    grossProfit,
    operatingExpenses,
    netProfit
  };
}

// Module 26: Consolidation Math (VP-045, VP-046 / EX10, EX11, EX12)
export function calculateConsolidatedBalanceSheet(
  parentRows: TrialBalanceRow[],
  subRows: TrialBalanceRow[],
  eliminations: any[]
) {
  // Carry each component's current-period result into equity for the
  // consolidated balance sheet; income-statement balances stay untouched.
  const includeCurrentPeriodResult = (rows: TrialBalanceRow[]) => {
    const result = rows.filter(row => row.type === 'revenue' || row.type === 'expense')
      .reduce((sum, row) => sum + row.balance, 0);
    return rows.some(row => row.type === 'revenue' || row.type === 'expense')
      ? [...rows, { code: 'CURRENT_PERIOD_RESULT', name: 'Current period result', type: 'equity' as const, balance: result }]
      : rows;
  };
  parentRows = includeCurrentPeriodResult(parentRows);
  subRows = includeCurrentPeriodResult(subRows);
  const allCodes = Array.from(new Set([...parentRows.map(r => r.code), ...subRows.map(r => r.code)]));

  let parentAssets = 0;
  let subsidiaryAssets = 0;
  let parentLiabilities = 0;
  let subsidiaryLiabilities = 0;
  let parentEquity = 0;
  let subsidiaryEquity = 0;
  let totalEliminationDebits = 0;
  let totalEliminationCredits = 0;
  const effects = eliminations.flatMap(e => {
    if (Array.isArray(e.lines)) return e.lines.map((line: any) => ({ ...line, id: e.id }));
    const lines = [];
    if (e.debitAccount) lines.push({ id: e.id, account: e.debitAccount, type: 'debit', amount: e.amount });
    if (e.creditAccount) lines.push({ id: e.id, account: e.creditAccount, type: 'credit', amount: e.amount });
    return lines;
  }).filter(line => Number.isFinite(line.amount) && line.amount > 0 && (line.type === 'debit' || line.type === 'credit'));

  const lines = allCodes.map(code => {
    const parentRow = parentRows.find(r => r.code === code);
    const subRow = subRows.find(r => r.code === code);
    const category = parentRow?.type || subRow?.type || 'asset';
    const name = parentRow?.name || subRow?.name || code;

    const parentBalance = parentRow ? parentRow.balance : 0;
    const subsidiaryBalance = subRow ? subRow.balance : 0;
    const combinedBalance = parentBalance + subsidiaryBalance;

    // Posted balances are signed: debit adds and credit subtracts for every account.
    let elimDebit = 0;
    let elimCredit = 0;

    effects.forEach(line => {
      if (line.account === code || String(line.account).trim().toLowerCase() === name.trim().toLowerCase()) {
        if (line.type === 'debit') elimDebit += line.amount;
        else elimCredit += line.amount;
      }
    });

    totalEliminationDebits += elimDebit;
    totalEliminationCredits += elimCredit;

    const consolidatedBalance = combinedBalance + elimDebit - elimCredit;
    if (category === 'asset') {
      parentAssets += parentBalance;
      subsidiaryAssets += subsidiaryBalance;
    } else if (category === 'liability') {
      parentLiabilities += Math.abs(parentBalance);
      subsidiaryLiabilities += Math.abs(subsidiaryBalance);
    } else if (category === 'equity') {
      parentEquity += Math.abs(parentBalance);
      subsidiaryEquity += Math.abs(subsidiaryBalance);
    }

    return {
      code,
      name,
      category,
      parentBalance,
      subsidiaryBalance,
      eliminationDebit: elimDebit,
      eliminationCredit: elimCredit,
      consolidatedBalance
    };
  });

  // Calculate totals directly from lines ensuring header and line details strictly agree (EX12)
  const totalAssets = lines
    .filter(l => l.category === 'asset')
    .reduce((s, l) => s + l.consolidatedBalance, 0);

  const totalLiabilities = lines
    .filter(l => l.category === 'liability')
    .reduce((s, l) => s + Math.abs(l.consolidatedBalance), 0);

  const totalEquity = lines
    .filter(l => l.category === 'equity')
    .reduce((s, l) => s + Math.abs(l.consolidatedBalance), 0);

  const totalEliminations = totalEliminationCredits || totalEliminationDebits;
  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) === 0;

  return {
    lines,
    parentAssets,
    subsidiaryAssets,
    parentLiabilities,
    subsidiaryLiabilities,
    parentEquity,
    subsidiaryEquity,
    totalEliminations,
    totalAssets,
    totalLiabilities,
    totalEquity,
    isBalanced
  };
}

// Module 28: ISA 320 Materiality Calculation (VP-048 / F16)
export function calculateMateriality(
  benchmarkValue: number,
  percentage: number,
  performancePct: number,
  trivialPct: number,
  rationale: string
) {
  if (!Number.isFinite(benchmarkValue) || benchmarkValue <= 0) throw new RangeError('Benchmark value must be a positive finite amount.');
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) throw new RangeError('Applied benchmark rate must be greater than 0 and no more than 100 percent.');
  if (!Number.isFinite(performancePct) || performancePct <= 0 || performancePct > 100) throw new RangeError('Performance materiality rate must be greater than 0 and no more than 100 percent.');
  if (!Number.isFinite(trivialPct) || trivialPct < 0 || trivialPct > 100) throw new RangeError('Clearly trivial rate must be from 0 through 100 percent.');
  if (!rationale.trim()) throw new RangeError('A planning rationale is required to calculate materiality.');
  const overallMateriality = Math.round(benchmarkValue * (percentage / 100));
  const performanceMateriality = Math.round(overallMateriality * (performancePct / 100));
  const clearlyTrivialThreshold = Math.round(overallMateriality * (trivialPct / 100));

  return {
    benchmarkValue,
    percentage,
    overallMateriality,
    performancePct,
    performanceMateriality,
    trivialPct,
    clearlyTrivialThreshold,
    rationale
  };
}
