import { describe, expect, it } from 'vitest';
import {
  calculateEngagementProfitability,
  computeFirmTrialBalance,
  type BudgetedPhaseHours
} from '../domain/profitability';
import type { TimeEntry } from '../domain/types';

describe('Practice Analytics & Profitability Engine (spec §3.5 / §4.5)', () => {
  const dummyTimeEntries: TimeEntry[] = [
    // Partner (1,000 QAR/hr) -> 10 hrs = 10,000 QAR
    {
      id: 'te-1',
      engagementId: 'eng-1',
      userId: 'user-partner',
      chargeOutRole: 'PARTNER',
      date: '2026-09-01',
      hours: 10,
      phase: 'Planning',
      narrative: 'Engagement kickoff, dual key acceptance',
      billable: true,
      approved: true
    },
    // Manager (750 QAR/hr) -> 20 hrs = 15,000 QAR
    {
      id: 'te-2',
      engagementId: 'eng-1',
      userId: 'user-manager',
      chargeOutRole: 'MANAGER',
      date: '2026-09-05',
      hours: 20,
      phase: 'Fieldwork',
      narrative: 'Supervising revenue substantive tests',
      billable: true,
      approved: true
    },
    // Senior (500 QAR/hr) -> 40 hrs = 20,000 QAR
    {
      id: 'te-3',
      engagementId: 'eng-1',
      userId: 'user-senior',
      chargeOutRole: 'SENIOR',
      date: '2026-09-10',
      hours: 40,
      phase: 'Fieldwork',
      narrative: 'Fixed assets & inventory vouching',
      billable: true,
      approved: true
    },
    // Junior (200 QAR/hr) -> 50 hrs = 10,000 QAR
    {
      id: 'te-4',
      engagementId: 'eng-1',
      userId: 'user-junior',
      chargeOutRole: 'JUNIOR',
      date: '2026-09-12',
      hours: 50,
      phase: 'Fieldwork',
      narrative: 'Bank & AP confirmations matching',
      billable: true,
      approved: true
    }
  ];

  it('calculates tiered charge-out rates and net profitability', () => {
    // Total cost = 10k + 15k + 20k + 10k = 55,000 QAR
    // Contracted audit fee = 80,000 QAR
    // Net profit = 25,000 QAR
    const contractedFee = 80_000;
    const report = calculateEngagementProfitability(contractedFee, dummyTimeEntries);

    expect(report.totalHoursLogged).toBe(120);
    expect(report.totalStandardCostQar).toBe(55_000);
    expect(report.netProfitabilityQar).toBe(25_000);
    expect(report.grossMarginPct).toBeCloseTo(31.25, 2); // 25k / 80k = 31.25%
    expect(report.realizationRatePct).toBeCloseTo(145.45, 2); // 80k / 55k = 145.45%

    const partnerRow = report.roleBreakdown.find(r => r.role === 'PARTNER');
    expect(partnerRow?.rateQarPerHour).toBe(1_000);
    expect(partnerRow?.standardCostQar).toBe(10_000);

    const managerRow = report.roleBreakdown.find(r => r.role === 'MANAGER');
    expect(managerRow?.rateQarPerHour).toBe(750);
    expect(managerRow?.standardCostQar).toBe(15_000);
  });

  it('computes real-time phase variance against budgeted hours', () => {
    const budgetedPhases: BudgetedPhaseHours[] = [
      { phase: 'Planning', budgetedHours: 8 },
      { phase: 'Fieldwork', budgetedHours: 100 },
      { phase: 'Review', budgetedHours: 20 },
      { phase: 'Reporting', budgetedHours: 15 },
      { phase: 'Completion', budgetedHours: 5 }
    ];

    const report = calculateEngagementProfitability(80_000, dummyTimeEntries, budgetedPhases);

    // Planning: 10 actual vs 8 budgeted -> +2 hours (Over Budget)
    const planning = report.phaseVariances.find(p => p.phase === 'Planning');
    expect(planning?.actualHours).toBe(10);
    expect(planning?.budgetedHours).toBe(8);
    expect(planning?.varianceHours).toBe(2);
    expect(planning?.status).toBe('Over Budget');

    // Fieldwork: 20+40+50 = 110 actual vs 100 budgeted -> +10 hours (Over Budget)
    const fieldwork = report.phaseVariances.find(p => p.phase === 'Fieldwork');
    expect(fieldwork?.actualHours).toBe(110);
    expect(fieldwork?.varianceHours).toBe(10);
    expect(fieldwork?.status).toBe('Over Budget');

    // Review: 0 actual vs 20 budgeted -> -20 hours (Under Budget)
    const review = report.phaseVariances.find(p => p.phase === 'Review');
    expect(review?.varianceHours).toBe(-20);
    expect(review?.status).toBe('Under Budget');
  });

  it('balances Practice Ledger entries into monthly trial balance', () => {
    const entries = [
      {
        lines: [
          { account: 'Cash', debit: 40_000, credit: 0 },
          { account: 'Audit Revenue', debit: 0, credit: 40_000 }
        ]
      },
      {
        lines: [
          { account: 'Office Rent', debit: 15_000, credit: 0 },
          { account: 'Staff Salaries', debit: 20_000, credit: 0 },
          { account: 'Cash', debit: 0, credit: 35_000 }
        ]
      }
    ];

    const result = computeFirmTrialBalance(entries);
    expect(result.isBalanced).toBe(true);
    expect(result.totalDebits).toBe(75_000);
    expect(result.totalCredits).toBe(75_000);

    const cashAcc = result.balances.find(b => b.account === 'Cash');
    expect(cashAcc?.netBalance).toBe(5_000); // 40k debit - 35k credit
  });
});
