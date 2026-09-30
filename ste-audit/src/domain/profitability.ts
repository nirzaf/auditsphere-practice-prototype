/**
 * Practice Analytics & Profitability Engine (spec §3.5 / §4.5).
 *
 * Implements:
 * 1. Tiered Charge-Out Rates calculation (Partner: 1,000, Manager: 750, Senior: 500, Junior: 200 QAR/hr).
 * 2. Engagement Profitability & Margin:
 *    Profitability = Contracted Audit Fee - Σ (Staff Hours Logged × Role Rate).
 * 3. Realization Rate:
 *    Realization % = (Contracted Audit Fee / Total Standard Value of Time) × 100.
 * 4. Phase-by-phase Budget vs. Actual Variance analysis.
 * 5. Practice Ledger aggregation: Firm Monthly Trial Balance, Firm P&L, AR Aging Schedule.
 */

import {
  CHARGE_OUT_RATES_QAR,
  CHARGE_OUT_ROLE_LABELS,
  type ChargeOutRole
} from './constants';
import type { EngagementPhase, Qar, TimeEntry } from './types';

export interface RoleHoursSummary {
  role: ChargeOutRole;
  label: string;
  rateQarPerHour: number;
  totalHours: number;
  standardCostQar: number;
}

export interface PhaseVarianceSummary {
  phase: EngagementPhase;
  budgetedHours: number;
  actualHours: number;
  varianceHours: number; // actual - budgeted
  variancePct: number;
  status: 'Under Budget' | 'On Budget' | 'Over Budget';
}

export interface EngagementProfitabilityReport {
  engagementId: string;
  contractedFeeQar: Qar;
  totalHoursLogged: number;
  totalStandardCostQar: Qar;
  netProfitabilityQar: Qar; // Fee - Cost
  grossMarginPct: number; // (Profitability / Fee) * 100
  realizationRatePct: number; // (Fee / Cost) * 100
  roleBreakdown: RoleHoursSummary[];
  phaseVariances: PhaseVarianceSummary[];
}

export interface BudgetedPhaseHours {
  phase: EngagementPhase;
  budgetedHours: number;
}

/**
 * Calculates engagement profitability based on logged staff time and tiered rates.
 */
export function calculateEngagementProfitability(
  contractedFee: Qar,
  timeEntries: TimeEntry[],
  budgetedPhases?: BudgetedPhaseHours[]
): EngagementProfitabilityReport {
  const roles: ChargeOutRole[] = ['PARTNER', 'MANAGER', 'SENIOR', 'JUNIOR'];

  const roleMap: Record<ChargeOutRole, { hours: number; cost: number }> = {
    PARTNER: { hours: 0, cost: 0 },
    MANAGER: { hours: 0, cost: 0 },
    SENIOR: { hours: 0, cost: 0 },
    JUNIOR: { hours: 0, cost: 0 }
  };

  const phaseMap: Record<EngagementPhase, number> = {
    Planning: 0,
    Fieldwork: 0,
    Review: 0,
    Reporting: 0,
    Completion: 0
  };

  for (const entry of timeEntries) {
    if (!entry.billable) continue;
    const hours = Number(entry.hours) || 0;
    const rate = CHARGE_OUT_RATES_QAR[entry.chargeOutRole] || 200;
    const cost = hours * rate;

    roleMap[entry.chargeOutRole].hours += hours;
    roleMap[entry.chargeOutRole].cost += cost;

    if (entry.phase in phaseMap) {
      phaseMap[entry.phase] += hours;
    }
  }

  const roleBreakdown: RoleHoursSummary[] = roles.map(role => ({
    role,
    label: CHARGE_OUT_ROLE_LABELS[role],
    rateQarPerHour: CHARGE_OUT_RATES_QAR[role],
    totalHours: Number(roleMap[role].hours.toFixed(2)),
    standardCostQar: Math.round(roleMap[role].cost)
  }));

  const totalHoursLogged = Number(
    roleBreakdown.reduce((acc, r) => acc + r.totalHours, 0).toFixed(2)
  );
  const totalStandardCostQar = roleBreakdown.reduce((acc, r) => acc + r.standardCostQar, 0);

  const netProfitabilityQar = contractedFee - totalStandardCostQar;
  const grossMarginPct = contractedFee > 0 ? Number(((netProfitabilityQar / contractedFee) * 100).toFixed(2)) : 0;
  const realizationRatePct = totalStandardCostQar > 0 ? Number(((contractedFee / totalStandardCostQar) * 100).toFixed(2)) : 100;

  const phases: EngagementPhase[] = ['Planning', 'Fieldwork', 'Review', 'Reporting', 'Completion'];
  const budgetedMap = new Map<EngagementPhase, number>();
  if (budgetedPhases) {
    for (const bp of budgetedPhases) {
      budgetedMap.set(bp.phase, bp.budgetedHours);
    }
  }

  const phaseVariances: PhaseVarianceSummary[] = phases.map(phase => {
    const actual = Number((phaseMap[phase] || 0).toFixed(2));
    const budgeted = budgetedMap.get(phase) ?? 0;
    const varianceHours = Number((actual - budgeted).toFixed(2));
    const variancePct = budgeted > 0 ? Number(((varianceHours / budgeted) * 100).toFixed(1)) : 0;
    const status = varianceHours > 0 ? 'Over Budget' : varianceHours < 0 ? 'Under Budget' : 'On Budget';

    return {
      phase,
      budgetedHours: budgeted,
      actualHours: actual,
      varianceHours,
      variancePct,
      status
    };
  });

  return {
    engagementId: timeEntries[0]?.engagementId ?? '',
    contractedFeeQar: contractedFee,
    totalHoursLogged,
    totalStandardCostQar,
    netProfitabilityQar,
    grossMarginPct,
    realizationRatePct,
    roleBreakdown,
    phaseVariances
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Practice Ledger & Back-Office Accounting Structures
// ─────────────────────────────────────────────────────────────────────────────

export interface PracticeLedgerAccountBalance {
  account: string;
  category: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  debit: Qar;
  credit: Qar;
  netBalance: Qar; // Debit - Credit for Assets/Expenses, Credit - Debit for Revenue/Liability/Equity
}

export interface PracticeIncomeStatement {
  reportingPeriod: string;
  auditRevenue: Qar;
  directStaffCost: Qar;
  grossMargin: Qar;
  operatingExpenses: {
    officeRent: Qar;
    salariesAndBenefits: Qar;
    pettyCash: Qar;
    otherExpenses: Qar;
    totalOperatingExpenses: Qar;
  };
  operatingProfit: Qar;
  partnerDraws: Qar;
  retainedEarnings: Qar;
}

export interface ArAgingBucket {
  clientName: string;
  engagementTitle: string;
  totalAgreedFee: Qar;
  advance50Pct: {
    amount: Qar;
    invoiced: boolean;
    paid: boolean;
    daysOutstanding: number;
    status: 'Settled' | '0-30 Days' | '31-60 Days' | '60+ Days';
  };
  final50Pct: {
    amount: Qar;
    invoiced: boolean;
    paid: boolean;
    daysOutstanding: number;
    status: 'Pending Deliverable' | '0-30 Days' | '31-60 Days' | '60+ Days';
  };
  totalOutstanding: Qar;
}

/**
 * Computes the Firm Monthly Trial Balance from practice ledger entries.
 */
export function computeFirmTrialBalance(entries: Array<{
  lines: Array<{ account: string; debit: Qar; credit: Qar }>;
}>): {
  balances: PracticeLedgerAccountBalance[];
  totalDebits: Qar;
  totalCredits: Qar;
  isBalanced: boolean;
} {
  const map = new Map<string, { debit: Qar; credit: Qar }>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      const current = map.get(line.account) ?? { debit: 0, credit: 0 };
      current.debit += line.debit;
      current.credit += line.credit;
      map.set(line.account, current);
    }
  }

  const categoryFor = (acc: string): PracticeLedgerAccountBalance['category'] => {
    if (acc === 'Cash' || acc === 'Accounts Receivable' || acc === 'Bank Accounts') return 'Asset';
    if (acc === 'Audit Revenue') return 'Revenue';
    if (acc === 'Partner Withdrawals' || acc === 'Capital') return 'Equity';
    return 'Expense';
  };

  const balances: PracticeLedgerAccountBalance[] = Array.from(map.entries()).map(([account, val]) => {
    const category = categoryFor(account);
    const netBalance = category === 'Asset' || category === 'Expense'
      ? val.debit - val.credit
      : val.credit - val.debit;

    return {
      account,
      category,
      debit: val.debit,
      credit: val.credit,
      netBalance
    };
  });

  const totalDebits = balances.reduce((sum, b) => sum + b.debit, 0);
  const totalCredits = balances.reduce((sum, b) => sum + b.credit, 0);
  const isBalanced = totalDebits === totalCredits;

  return { balances, totalDebits, totalCredits, isBalanced };
}
