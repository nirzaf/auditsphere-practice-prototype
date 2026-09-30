import { exportToCSV } from '../../services/exportService';
import React, { useState } from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { firmTrialBalance, practiceEconomics, allocatedSettlementAt } from '../../services/targetLifecycle';
import { visibleEngagementIds } from '../../services/guards';
import { formatCurrency } from '../../services/calculations';
import {
  ActionButton,
  Field,
  TargetForm,
  value,
  amount,
  type TargetViewProps
} from './TargetCommon';

export function PracticeView(props: TargetViewProps & { ledger?: boolean }) {
  const s = prototypeStore.getSnapshot(),
    visible = visibleEngagementIds(s),
    engagements = s.engagements.filter((e) => visible === 'ALL' || visible.includes(e.id));

  const [activeLedgerTab, setActiveLedgerTab] = useState<'tb' | 'pl' | 'ar_aging'>('tb');
  const [reportMonth, setReportMonth] = useState(s.asOfDate.slice(0, 7));

  // Compute Practice Trial Balance
  const tbRows = firmTrialBalance(s, reportMonth);
  const totalDebit = tbRows.reduce((sum, r) => sum + r.debit, 0);
  const totalCredit = tbRows.reduce((sum, r) => sum + r.credit, 0);

  // Compute Firm Monthly Profit & Loss
  // Revenue = Billed engagement fees
  // Expenses = Office Rent, Staff Salaries, Petty Cash, Other expenses
  const billedRevenue = -(tbRows.find(r => r.account === 'Audit fee revenue')?.balance || 0);

  const monthRows = tbRows;
  const monthlyBalance = (account: string) => monthRows.find(row => row.account === account)?.balance || 0;
  const rentExpense = monthlyBalance('Office rent');
  const salaryExpense = monthlyBalance('Staff salaries');
  const pettyCashExpense = monthlyBalance('Petty cash');
  const otherExpenses = monthlyBalance('Other expenses');
  const partnerWithdrawals = monthlyBalance('Partner withdrawals');
  const totalExpenses = rentExpense + salaryExpense + pettyCashExpense + otherExpenses;
  const netFirmProfit = billedRevenue - totalExpenses;

  // Compute Client Accounts Receivable Aging Schedule (50% Advance & 50% Final Fee)
  const monthEnd = new Date(Date.UTC(Number(reportMonth.slice(0,4)),Number(reportMonth.slice(5,7)),0)).toISOString().slice(0,10);
  const invoicesWithAging = s.invoices.filter(inv => ['Issued', 'Paid'].includes(inv.status) && inv.currency === s.firmSettings.currency && Boolean(inv.issueDate && inv.issueDate <= monthEnd)).map((inv) => {
    const desc = inv.description?.toLowerCase() || '';
    const isAdvance = desc.includes('advance') || inv.invoiceNumber.includes('ADV');
    const isFinal = desc.includes('final') || inv.invoiceNumber.includes('FINAL') || inv.invoiceNumber.includes('BAL');
    const invoiceType = isAdvance ? '50% Advance Invoice' : isFinal ? '50% Final Fee Note' : 'Audit Service Invoice';

    // Simulated aging based on invoice date
    const issueDateStr = inv.due;
    const daysOld = Math.max(0, Math.floor((Date.parse(monthEnd) - Date.parse(issueDateStr)) / (1000 * 60 * 60 * 24)));
    let agingBucket: 'Current' | '1–30 Days' | '31–60 Days' | '61–90 Days' | '90+ Days' = 'Current';
    if (daysOld > 90) agingBucket = '90+ Days';
    else if (daysOld > 60) agingBucket = '61–90 Days';
    else if (daysOld > 30) agingBucket = '31–60 Days';
    else if (daysOld > 0) agingBucket = '1–30 Days';

    const client = s.clients.find((c) => c.id === inv.clientId);

    return {
      ...inv,
      paid: allocatedSettlementAt(s,inv.id,monthEnd),
      invoiceType,
      daysOld,
      agingBucket,
      clientName: client?.name || inv.clientId
    };
  });

  return (
    <div className="target-stack">
      <section className="panel panel-pad"><label>Reporting month <input aria-label="Reporting month" type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} /></label><p>Currency: {s.firmSettings.currency}. Prototype accrual projection: issued fees credit revenue/debit receivables; effective allocated receipts debit cash/credit receivables; reversals post on their recorded reversal date. Drafts excluded. Monthly TB shows movements; aging shows balances at month end; withdrawals remain separate.</p></section>
      {/* Module Header */}
      <section className="panel panel-pad">
        <div className="flex-between">
          <div>
            <span className="tag blue mb8">MODULE 5: PRACTICE MANAGEMENT &amp; INTERNAL BOOKKEEPING</span>
            <h2>{props.ledger ? 'Firm expenses & practice ledger' : 'Practice realization & analytics'}</h2>
            <p className="caption">
              Operational actuals, realization metrics, and internal accounting ledger for STE Audit &amp; Accounting LLC (Doha, Qatar · QAR). Firm expenses are separate from client audit trial balances.
            </p>
          </div>
          <div className="target-buttons">
            <button
              className={`btn sm ${!props.ledger ? 'primary' : 'ghost'}`}
              onClick={() => props.onNavigate('reports')}
            >
              Real-Time Profitability
            </button>
            <button
              className={`btn sm ${props.ledger ? 'primary' : 'ghost'}`}
              onClick={() => props.onNavigate('practice-ledger')}
            >
              Internal Ledger &amp; TB
            </button>
          </div>
        </div>

        {/* Tiered Charge-Out Rates Engine Banner */}
        <div className="mt16 p12 borderbox bg-muted-subtle" style={{ borderRadius: 6 }}>
          <h4 style={{ margin: '0 0 6px 0' }}>Tiered Charge-Out Rates Engine:</h4>
          <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
            <div>
              <span className="caption">Engagement Partner:</span>
              <strong className="ml8" style={{ color: '#0369a1' }}>1,000 QAR / hour</strong>
            </div>
            <div>
              <span className="caption">Audit Manager:</span>
              <strong className="ml8" style={{ color: '#0369a1' }}>750 QAR / hour</strong>
            </div>
            <div>
              <span className="caption">Audit Senior / Supervisor:</span>
              <strong className="ml8" style={{ color: '#0369a1' }}>500 QAR / hour</strong>
            </div>
            <div>
              <span className="caption">Audit Associate / Junior:</span>
              <strong className="ml8" style={{ color: '#0369a1' }}>200 QAR / hour</strong>
            </div>
          </div>
        </div>
      </section>

      {/* VIEW 1: PROFITABILITY & REALIZATION ANALYTICS */}
      {!props.ledger && (
        <section className="panel panel-pad">
          <h3>Engagement Profitability &amp; Realization Matrix</h3>
          <p className="caption mb12">
            Engagement Profitability = Contracted Engagement Fee − Total Engagement Cost [Σ (Logged Hours per Role × Role Charge-Out Rate)].
          </p>

          <div className="table-wrap">
            <table className="target-table">
              <thead>
                <tr>
                  <th>Engagement</th>
                  <th className="text-right">Budgeted Hours</th>
                  <th className="text-right">Actual Hours</th>
                  <th className="text-right">Hours Variance</th>
                  <th className="text-right">Contracted Fee</th>
                  <th className="text-right">Total Engagement Cost</th>
                  <th className="text-right">Engagement Profitability</th>
                  <th className="text-right">Realization</th>
                  <th className="text-right">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map((e) => {
                  const m = practiceEconomics(s, e);
                  const client = s.clients.find((c) => c.id === e.client);
                  const fee = e.agreedFee;
                  const varianceHours = m.actualHours - m.budgetHours;
                  return (
                    <tr key={e.id} className="hover-row">
                      <td>
                        <strong>{client?.name || e.client}</strong>
                        <div className="caption text-muted">{e.id} · {e.period}</div>
                      </td>
                      <td className="text-right mono">{m.budgetHours} hrs</td>
                      <td className="text-right mono">{m.actualHours} hrs</td>
                      <td className="text-right mono" style={{ color: varianceHours <= 0 ? '#15803d' : '#b91c1c' }}>
                        {varianceHours > 0 ? `+${varianceHours}` : varianceHours} hrs
                      </td>
                      <td className="text-right mono font-medium">
                        {formatCurrency(fee, e.currency)}
                      </td>
                      <td className="text-right mono text-muted">
                        {m.wip !== null ? formatCurrency(m.wip, e.currency) : 'Unknown'}
                      </td>
                      <td className="text-right mono font-medium" style={{ color: m.profit !== null && m.profit >= 0 ? '#15803d' : '#b91c1c' }}>
                        {m.profit !== null ? formatCurrency(m.profit, e.currency) : 'Unknown'}
                      </td>
                      <td className="text-right mono">
                        {m.realization !== null ? `${m.realization.toFixed(1)}%` : 'Unknown'}
                      </td>
                      <td className="text-right mono">
                        {m.utilization !== null ? `${m.utilization.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!props.ledger && engagements.map(engagement => <section className="panel panel-pad" key={engagement.id}>
        <h3>{engagement.id} — phase hours (actual minus budget)</h3>
        <div className="tablewrap"><table><thead><tr><th>Phase</th><th>Budget hours</th><th>Logged hours</th><th>Variance hours</th></tr></thead><tbody>
          {practiceEconomics(s, engagement).phases.map(row => <tr key={row.phase}><td>{row.phase}</td><td>{row.budget}</td><td>{row.actual}</td><td>{row.variance}</td></tr>)}
        </tbody></table></div>
      </section>)}
      {/* VIEW 2: PRACTICE LEDGER & INTERNAL BOOKKEEPING */}
      {props.ledger && (
        <>
          {/* Post Operational Expense Form */}
          <TargetForm
            title="Record Firm Operational Expense"
            button="Post Firm Expense"
            onRegisterUnsavedForm={props.onRegisterUnsavedForm}
            onCommit={(d) =>
              prototypeStore.lifecycle.postFirmExpense({
                date: value(d, 'date'),
                category: value(d, 'category') as 'Office rent',
                amount: amount(d, 'amount'),
                description: value(d, 'description'),
                reference: value(d, 'reference')
              })
            }
          >
            <Field label="Expense Date" name="date" type="date" defaultValue={s.asOfDate} />
            <Field label="Firm Operational Account" name="category">
              <option value="Office rent">Office Rent &amp; Facility Costs</option>
              <option value="Staff salaries">Staff Salaries, End of Service, &amp; Benefits</option>
              <option value="Partner withdrawals">Partner Drawings &amp; Profit Withdrawals</option>
              <option value="Other expenses">Operational Overhead &amp; Administrative Expenses</option>
              <option value="Petty cash">Petty Cash Disbursals</option>
            </Field>
            <Field label="Amount (QAR)" name="amount" type="number" step="0.01" min={0.01} />
            <Field label="Description / Vendor" name="description" placeholder="e.g. West Bay Office Lease - Monthly Facility Disbursal" />
            <Field label="Transaction Reference Code" name="reference" placeholder="e.g. TR-EXP-2026-092" />
          </TargetForm>

          {/* Three Outputs: Tabs for TB, P&L, AR Aging */}
          <section className="panel panel-pad">
            <div className="tabs">
              <button
                className={`tab-btn ${activeLedgerTab === 'tb' ? 'active' : ''}`}
                onClick={() => setActiveLedgerTab('tb')}
              >
                1. Internal Firm Monthly Trial Balance
              </button>
              <button
                className={`tab-btn ${activeLedgerTab === 'pl' ? 'active' : ''}`}
                onClick={() => setActiveLedgerTab('pl')}
              >
                2. Internal Firm Profit &amp; Loss (P&amp;L)
              </button>
              <button
                className={`tab-btn ${activeLedgerTab === 'ar_aging' ? 'active' : ''}`}
                onClick={() => setActiveLedgerTab('ar_aging')}
              >
                3. Accounts Receivable Aging (50/50 Fee Schedule)
              </button>
            </div>

            {/* TAB 1: TRIAL BALANCE */}
            {activeLedgerTab === 'tb' && (
              <div className="mt16">
                <div className="flex-between mb12">
                  <div>
                    <h4>Internal Firm Trial Balance ({s.firmSettings.currency})</h4>
                    <p className="caption">Operational general ledger accounts reconciled for the practice.</p>
                  </div>
                  <ActionButton
                    action={() =>
                      exportToCSV('STE_Firm_Monthly_Trial_Balance.csv', [
                        ['Account', 'Currency', 'Debit', 'Credit', 'Net Balance'],
                        ...tbRows.map((r) => [
                          r.account,
                          s.firmSettings.currency,
                          String(r.debit),
                          String(r.credit),
                          String(r.balance)
                        ]),
                        ['TOTAL', s.firmSettings.currency, String(totalDebit), String(totalCredit), '0.00']
                      ])
                    }
                  >
                    Export Trial Balance CSV
                  </ActionButton>
                </div>

                <div className="table-wrap">
                  <table className="target-table">
                    <thead>
                      <tr>
                        <th>Account Name</th>
                        <th className="text-right">Debit (QAR)</th>
                        <th className="text-right">Credit (QAR)</th>
                        <th className="text-right">Net Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tbRows.map((r) => (
                        <tr key={r.account}>
                          <td><strong>{r.account}</strong></td>
                          <td className="text-right mono">{formatCurrency(r.debit, 'QAR')}</td>
                          <td className="text-right mono">{formatCurrency(r.credit, 'QAR')}</td>
                          <td className="text-right mono font-medium">{formatCurrency(r.balance, 'QAR')}</td>
                        </tr>
                      ))}
                      <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                        <td>TOTAL RECONCILED</td>
                        <td className="text-right mono">{formatCurrency(totalDebit, 'QAR')}</td>
                        <td className="text-right mono">{formatCurrency(totalCredit, 'QAR')}</td>
                        <td className="text-right mono" style={{ color: totalDebit === totalCredit ? '#15803d' : '#b91c1c' }}>
                          {totalDebit === totalCredit ? 'BALANCED' : 'OUT OF BALANCE'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: PROFIT & LOSS */}
            {activeLedgerTab === 'pl' && (
              <div className="mt16">
                <div className="flex-between mb12">
                  <div>
                    <h4>Internal Firm Profit &amp; Loss Statement ({s.firmSettings.currency})</h4>
                    <label>Reporting month <input type="month" value={reportMonth} onChange={event => setReportMonth(event.target.value)} required /></label>
                    <p className="caption">Issued fees and recorded overhead for {reportMonth}. Partner withdrawals require an agreed accounting policy and are disclosed separately.</p>
                  </div>
                  <div className="text-right">
                    <span className="caption">Net Firm Margin:</span>
                    <strong className="ml8" style={{ color: netFirmProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                      {formatCurrency(netFirmProfit, 'QAR')}
                    </strong>
                  </div>
                </div>

                <div className="borderbox p16 stack" style={{ gap: 12, background: '#f8fafc', borderRadius: 6 }}>
                  <div className="flex-between">
                    <strong>Billed Audit Fees &amp; Professional Revenue:</strong>
                    <span className="mono font-medium" style={{ color: '#15803d' }}>
                      +{formatCurrency(billedRevenue, 'QAR')}
                    </span>
                  </div>

                  <div className="pt8 border-top stack" style={{ gap: 8 }}>
                    <div className="caption font-medium text-muted">LESS: OPERATIONAL OVERHEAD &amp; EXPENSES:</div>
                    <div className="flex-between pl12">
                      <span>• Office Rent &amp; Facility Costs:</span>
                      <span className="mono text-muted">({formatCurrency(rentExpense, 'QAR')})</span>
                    </div>
                    <div className="flex-between pl12">
                      <span>• Staff Salaries, End of Service &amp; Benefits:</span>
                      <span className="mono text-muted">({formatCurrency(salaryExpense, 'QAR')})</span>
                    </div>
                    <div className="flex-between pl12">
                      <span>• Operational Overhead &amp; Administrative Expenses:</span>
                      <span className="mono text-muted">({formatCurrency(otherExpenses, 'QAR')})</span>
                    </div>
                    <div className="flex-between pl12">
                      <span>• Petty Cash Disbursals:</span>
                      <span className="mono text-muted">({formatCurrency(pettyCashExpense, 'QAR')})</span>
                    </div>
                    <div className="flex-between pl12 font-medium">
                      <span>Total Operational Expenses:</span>
                      <span className="mono" style={{ color: '#b91c1c' }}>
                        ({formatCurrency(totalExpenses, 'QAR')})
                      </span>
                    </div>
                  </div>

                  <div className="pt12 border-top flex-between" style={{ fontSize: '15px' }}>
                    <strong>NET PRACTICE PROFIT / (LOSS):</strong>
                    <strong className="mono" style={{ color: netFirmProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                      {formatCurrency(netFirmProfit, 'QAR')}
                    </strong>
                  </div>
                  <div className="pt12 border-top flex-between">
                    <span>Separate disclosure: Partner withdrawals (accounting policy pending):</span>
                    <span className="mono">{formatCurrency(partnerWithdrawals, 'QAR')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: ACCOUNTS RECEIVABLE AGING */}
            {activeLedgerTab === 'ar_aging' && (
              <div className="mt16">
                <div className="flex-between mb12">
                  <div>
                    <h4>Client Accounts Receivable Aging Schedule</h4>
                    <p className="caption">Tracking 50% Advance Invoices and 50% Final Balance Fee Notes.</p>
                  </div>
                  <span className="tag blue">{invoicesWithAging.length} COMMERCIAL INVOICES</span>
                </div>

                <div className="table-wrap">
                  <table className="target-table">
                    <thead>
                      <tr>
                        <th>Invoice Number</th>
                        <th>Client Entity</th>
                        <th>Milestone Fee Category</th>
                        <th className="text-right">Invoice Amount</th>
                        <th className="text-right">Age (Days)</th>
                        <th>Aging Bracket</th>
                        <th>Settlement Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoicesWithAging.map((inv) => (
                        <tr key={inv.id} className="hover-row">
                          <td>
                            <strong>{inv.invoiceNumber}</strong>
                            <div className="caption text-muted">Issued: {inv.issueDate}</div>
                          </td>
                          <td>{inv.clientName}</td>
                          <td>
                            <span className="tag" style={{ background: '#f1f5f9' }}>
                              {inv.invoiceType}
                            </span>
                          </td>
                          <td className="text-right mono font-medium">
                            {formatCurrency(inv.amount, inv.currency)}
                          </td>
                          <td className="text-right mono">{inv.daysOld} days</td>
                          <td>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor:
                                  inv.agingBucket === '90+ Days'
                                    ? '#fee2e2'
                                    : inv.agingBucket === '61–90 Days'
                                    ? '#ffedd5'
                                    : '#f0fdf4',
                                color:
                                  inv.agingBucket === '90+ Days'
                                    ? '#b91c1c'
                                    : inv.agingBucket === '61–90 Days'
                                    ? '#c2410c'
                                    : '#15803d'
                              }}
                            >
                              {inv.agingBucket}
                            </span>
                          </td>
                          <td>
                            <span className={`tag ${inv.status === 'Paid' ? 'green' : inv.status === 'Issued' ? 'amber' : 'ghost'}`}>
                              {inv.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Posting History */}
          <details className="panel panel-pad" open>
            <summary>Firm General Ledger Journal Entries ({s.firmLedger?.length || 0})</summary>
            <div className="stack mt8" style={{ gap: 6 }}>
              {s.firmLedger?.map((e) => (
                <div key={e.id} className="p8 borderbox flex-between" style={{ background: '#f8fafc', borderRadius: 4, fontSize: '12px' }}>
                  <div>
                    <strong>{e.reference}</strong> · {e.date} · {e.description}
                    <div className="caption text-muted">Posted by: {e.actorUserId}</div>
                  </div>
                  <div className="mono">
                    {e.lines.map((l) => `${l.account}: Dr ${l.debit} Cr ${l.credit}`).join(' | ')}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
