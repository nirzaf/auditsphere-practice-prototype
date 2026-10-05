'use client';

import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  PieChart,
  Scale,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Building,
  CheckCircle2
} from 'lucide-react';
import {
  calculateEngagementProfitability,
  computeFirmTrialBalance,
  type BudgetedPhaseHours
} from '@/domain/profitability';
import { formatQar } from '@/lib/utils';
import { CHARGE_OUT_RATES_QAR, CHARGE_OUT_ROLE_LABELS } from '@/domain/constants';

interface Module5PracticeProps {
  userRole: string;
  timeEntries: any[];
  practiceLedger: any[];
  contractedFeeQar: number;
}

export function Module5Practice({
  userRole,
  timeEntries,
  practiceLedger,
  contractedFeeQar = 120000
}: Module5PracticeProps) {
  const [activeTab, setActiveTab] = useState<'profitability' | 'ledger' | 'aging'>('profitability');

  // Budgeted hours baseline for Doha Pearl Contracting
  const budgetedPhases: BudgetedPhaseHours[] = [
    { phase: 'Planning', budgetedHours: 30 },
    { phase: 'Fieldwork', budgetedHours: 150 },
    { phase: 'Review', budgetedHours: 40 },
    { phase: 'Reporting', budgetedHours: 25 },
    { phase: 'Completion', budgetedHours: 10 }
  ];

  // Compute live profitability
  const profitability = calculateEngagementProfitability(
    contractedFeeQar,
    timeEntries.map(t => ({
      id: t.id,
      engagementId: t.engagementId,
      userId: t.userId,
      chargeOutRole: t.chargeOutRole,
      date: t.date.toString(),
      hours: Number(t.hours),
      phase: t.phase === 'PLANNING' ? 'Planning' : t.phase === 'FIELDWORK' ? 'Fieldwork' : 'Review',
      narrative: t.narrative,
      billable: t.billable,
      approved: t.approved
    })),
    budgetedPhases
  );

  // Compute practice ledger trial balance
  const ledgerEntriesFormatted = practiceLedger.map(entry => ({
    lines: entry.lines.map((l: any) => ({
      account: l.account === 'CASH' ? 'Cash' : l.account === 'OFFICE_RENT' ? 'Office Rent' : l.account === 'STAFF_SALARIES' ? 'Staff Salaries' : l.account === 'STAFF_BENEFITS' ? 'Staff Benefits' : 'Other Expenses',
      debit: Number(l.debit),
      credit: Number(l.credit)
    }))
  }));

  const firmTrialBalance = computeFirmTrialBalance(ledgerEntriesFormatted);

  return (
    <div className="space-y-6">
      {/* Sub navigation */}
      <div className="flex border-b border-slate-200 space-x-2 pb-2 text-xs">
        <button
          onClick={() => setActiveTab('profitability')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeTab === 'profitability'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Tiered Rates &amp; Engagement Profitability</span>
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeTab === 'ledger'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>Practice Back-Office Ledger &amp; Trial Balance</span>
        </button>

        <button
          onClick={() => setActiveTab('aging')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeTab === 'aging'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Accounts Receivable (AR) 50/50 Aging Schedule</span>
        </button>
      </div>

      {/* ── TAB: PROFITABILITY ──────────────────────────────────────────────── */}
      {activeTab === 'profitability' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Tiered Charge-Out Rates &amp; Engagement Realization</h3>
              <p className="text-xs text-slate-500">
                Formula: Profitability = Contracted Audit Fee - Σ (Staff Hours Logged × Role Charge-Out Rate).
              </p>
            </div>
            <div className="text-xs font-mono text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Contracted Fee: {formatQar(profitability.contractedFeeQar)}
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Total Staff Cost (Time)</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                {formatQar(profitability.totalStandardCostQar)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">{profitability.totalHoursLogged} billable hours logged</div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Net Engagement Profitability</div>
              <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
                {formatQar(profitability.netProfitabilityQar)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Fee less total staff standard charge</div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Gross Margin %</div>
              <div className="text-2xl font-bold font-mono text-blue-600 mt-1">
                {profitability.grossMarginPct}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Target firm threshold: &gt; 40%</div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Realization Rate</div>
              <div className="text-2xl font-bold font-mono text-purple-600 mt-1">
                {profitability.realizationRatePct}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Standard rate recovery multiplier</div>
            </div>
          </div>

          {/* Tiered Role Breakdown & Phase Variance Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Role Breakdown */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Tiered Charge-Out Rates (Spec §3.5 / §4.5.1)
              </h4>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3">Audit Role</th>
                      <th className="p-3 text-right">Standard Rate</th>
                      <th className="p-3 text-center">Hours</th>
                      <th className="p-3 text-right">Standard Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {profitability.roleBreakdown.map(r => (
                      <tr key={r.role} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 font-semibold text-slate-900">{r.label}</td>
                        <td className="p-3 text-right font-mono text-slate-700">{formatQar(r.rateQarPerHour)}/hr</td>
                        <td className="p-3 text-center font-mono font-bold text-blue-600">{r.totalHours}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-600">{formatQar(r.standardCostQar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Phase Variance */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Phase-by-Phase Budget vs. Actual Variance
              </h4>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3">Phase</th>
                      <th className="p-3 text-center">Budgeted</th>
                      <th className="p-3 text-center">Actual</th>
                      <th className="p-3 text-right">Variance</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {profitability.phaseVariances.map(p => (
                      <tr key={p.phase} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 font-medium text-slate-900">{p.phase}</td>
                        <td className="p-3 text-center font-mono text-slate-500">{p.budgetedHours}h</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-900">{p.actualHours}h</td>
                        <td className="p-3 text-right font-mono">
                          <span className={p.varianceHours > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {p.varianceHours > 0 ? `+${p.varianceHours}h` : `${p.varianceHours}h`}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            p.status === 'Over Budget'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: BACK-OFFICE LEDGER ─────────────────────────────────────────── */}
      {activeTab === 'ledger' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Back-Office Practice Operational Ledger (§4.5.2)</h3>
              <p className="text-xs text-slate-500">
                Segregated accounting for firm operational expenses (Office Rent, Staff Salaries, Partner Draws, Petty Cash).
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              firmTrialBalance.isBalanced ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {firmTrialBalance.isBalanced ? 'Ledger Balanced (Debits = Credits)' : 'Out of Balance'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Monthly Trial Balance */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Firm Monthly Trial Balance (August 2026)
              </h4>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3">Ledger Account</th>
                      <th className="p-3 text-right">Debit (QAR)</th>
                      <th className="p-3 text-right">Credit (QAR)</th>
                      <th className="p-3 text-right">Net Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {firmTrialBalance.balances.map(b => (
                      <tr key={b.account} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 font-medium text-slate-900">{b.account}</td>
                        <td className="p-3 text-right font-mono text-slate-700">{formatQar(b.debit)}</td>
                        <td className="p-3 text-right font-mono text-slate-700">{formatQar(b.credit)}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-600">{formatQar(b.netBalance)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                      <td className="p-3 text-slate-900 uppercase text-[10px]">Total Debits / Credits</td>
                      <td className="p-3 text-right font-mono text-blue-600">{formatQar(firmTrialBalance.totalDebits)}</td>
                      <td className="p-3 text-right font-mono text-blue-600">{formatQar(firmTrialBalance.totalCredits)}</td>
                      <td className="p-3 text-right font-mono text-emerald-600">0 QAR</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Firm P&L Statement */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Firm Operational Income Statement (P&amp;L)
              </h4>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-700 font-semibold">Audit Practice Revenue:</span>
                  <span className="font-mono text-emerald-600 font-bold">{formatQar(60000)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600">
                  <span>Less: Office Rent &amp; Utilities (West Bay):</span>
                  <span className="font-mono text-rose-600">({formatQar(22000)})</span>
                </div>
                <div className="flex justify-between py-1 text-slate-600">
                  <span>Less: Staff Salaries &amp; Statutory Pension:</span>
                  <span className="font-mono text-rose-600">({formatQar(44500)})</span>
                </div>
                <div className="flex justify-between py-2 border-t border-b border-slate-300 font-bold text-slate-900">
                  <span>Net Operating Firm Contribution:</span>
                  <span className="font-mono text-blue-600">({formatQar(6500)})</span>
                </div>
                <div className="text-[10px] text-slate-500 italic mt-2">
                  * Note: Advance payments recorded as initial unearned retainer; full 120,000 QAR recognized upon final report issuance.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: AR AGING 50/50 ────────────────────────────────────────────── */}
      {activeTab === 'aging' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Accounts Receivable (AR) 50/50 Aging Schedule</h3>
              <p className="text-xs text-slate-500">
                Tracking 50% advance settlement and remaining 50% deliverable release balance.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3">Client Entity</th>
                  <th className="p-3 text-right">Agreed Fee</th>
                  <th className="p-3 text-center">50% Advance (60k)</th>
                  <th className="p-3 text-center">50% Final Release (60k)</th>
                  <th className="p-3 text-right">Total Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr className="hover:bg-slate-50/80 transition">
                  <td className="p-3">
                    <div className="font-bold text-slate-900">Doha Pearl Contracting W.L.L.</div>
                    <div className="text-[11px] text-slate-500">CR: 104829 • Statutory Audit 2026</div>
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">{formatQar(120000)}</td>
                  <td className="p-3 text-center">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Settled (RCPT-2026-001)
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      Pending Deliverable Release
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-amber-600">{formatQar(60000)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
