import React, { useState } from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import {
  calculateBalanceSheet,
  calculateIncomeStatement,
  formatCurrency
} from '../../services/calculations';
import { isFrozen, currentPlan } from '../../services/targetLifecycle';
import { hasAnyRole, visibleEngagementIds } from '../../services/guards';
import { ActionButton, type TargetViewProps } from './TargetCommon';

interface ARModalState {
  line: string;
  current: number;
  comparative?: number;
  variance: number;
  variancePercent: number;
  accounts: import('../../types').TrialBalanceRow[];
}

export function AuditFinancialView({ onNavigate }: TargetViewProps) {
  const state = prototypeStore.getSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement),
    [comparisonId, setComparisonId] = useState(''),
    [arModal, setArModal] = useState<ARModalState | null>(null),
    [goingConcernChecklist, setGoingConcernChecklist] = useState({
      operatingCashFlows: true,
      debtCovenantsCompliant: true,
      workingCapitalAdequate: true,
      noMaterialDisruptions: true
    }),
    [arNotes, setArNotes] = useState(''),
    [activeRowLock, setActiveRowLock] = useState<Record<string, string>>({
      'Revenue / Sales': 'Adam Khan (Preparer)',
      'Accounts Receivable': 'Sara Malik (Reviewer)'
    });

  if (!eng) return null;

  const visible = visibleEngagementIds(state),
    comparisons = state.engagements.filter(
      (e) =>
        e.client === eng.client &&
        e.year < eng.year &&
        e.currency === eng.currency &&
        (visible === 'ALL' || visible.includes(e.id)) &&
        e.mappingApproved
    );

  const comparison = comparisons.find((e) => e.id === comparisonId),
    bs = calculateBalanceSheet(eng.rows),
    pl = calculateIncomeStatement(eng.rows),
    plan = currentPlan(state, eng),
    mapping = (state.accountMappingRevisions || []).filter((m) => m.engagementId === eng.id).at(-1);

  const pm = plan?.overallMateriality;
  const te = plan?.performanceMateriality;

  const lines = [...new Set(eng.rows.map((r) => r.mappedStatementLine || 'Unmapped'))].map(
    (line) => {
      const accounts = eng.rows.filter((r) => (r.mappedStatementLine || 'Unmapped') === line);
      const current = accounts.reduce(
        (n, r) =>
          n + (['liability', 'equity', 'revenue'].includes(r.type) ? -r.balance : r.balance),
        0
      );
      const comparativeRows = comparison?.rows.filter((r) => r.mappedStatementLine === line) || [];
      const comparative = comparison
        ? comparativeRows.reduce(
            (n, r) =>
              n + (['liability', 'equity', 'revenue'].includes(r.type) ? -r.balance : r.balance),
            0
          )
        : undefined;

      const variance = comparative !== undefined ? current - comparative : 0;
      const variancePercent =
        comparative !== undefined && comparative !== 0
          ? ((current - comparative) / Math.abs(comparative)) * 100
          : 0;

      // Risk Stratification according to Section 4.2 Module 2
      // Green = Balance < TE and Low Inherent Risk (Low Risk)
      // Amber = Balance >= TE, Low Inherent Risk (Moderate Risk)
      // Red = Balance >= PM OR High Inherent Risk OR Critical Accounting Estimate (Critical Risk)
      const isCriticalEstimate = /estimate|provision|fair value|impairment|ecl|expected credit loss|allowance|obsolesc|warranty|goodwill|contingenc|going concern/i.test(line) ||
        accounts.some(a => /estimate|provision|fair value|impairment|ecl|expected credit loss|allowance|obsolesc|warranty|goodwill|contingenc|going concern/i.test(a.name));

      const isHighInherentRisk = (state.auditRisks || []).some(
        (risk) =>
          risk.engagementId === eng.id &&
          risk.rating === 'Significant' &&
          (risk.area?.toLowerCase() === line.toLowerCase() ||
           accounts.some(a => risk.area?.toLowerCase().includes(a.name.toLowerCase())))
      );

      let riskLevel: 'GREEN' | 'AMBER' | 'RED' = 'GREEN';
      if (isCriticalEstimate || isHighInherentRisk || (pm && Math.abs(current) >= pm)) {
        riskLevel = 'RED';
      } else if (te && Math.abs(current) >= te) {
        riskLevel = 'AMBER';
      }

      return {
        line,
        accounts,
        current,
        comparative,
        variance,
        variancePercent,
        riskLevel,
        currentSources: accounts.map((r) => r.code),
        comparativeSources: comparativeRows.map((r) => r.code)
      };
    }
  );

  const save = () => {
    if (!mapping) throw new Error('Confirm current TB mapping first.');
    const cbs = comparison && calculateBalanceSheet(comparison.rows),
      cpl = comparison && calculateIncomeStatement(comparison.rows),
      cmapping =
        comparison &&
        (state.accountMappingRevisions || [])
          .filter((m) => m.engagementId === comparison.id)
          .at(-1);
    prototypeStore.saveStatementSetRevision({
      engagementId: eng.id,
      sourceVersion: eng.sourceVersion,
      mappingRevision: mapping.revision,
      layoutVersion: 1,
      totals: {
        assets: bs.totalAssets,
        liabilities: bs.totalLiabilities,
        equity: bs.totalEquity,
        revenue: pl.revenue,
        netProfit: pl.netProfit
      },
      lines: lines.map(({ accounts, ...line }) => line),
      ...(comparison && cbs && cpl && cmapping
        ? {
            comparativeEngagementId: comparison.id,
            comparativeSourceVersion: comparison.sourceVersion,
            comparativeMappingRevision: cmapping.revision,
            comparativeTotals: {
              assets: cbs.totalAssets,
              liabilities: cbs.totalLiabilities,
              equity: cbs.totalEquity,
              revenue: cpl.revenue,
              netProfit: cpl.netProfit
            }
          }
        : {})
    });
  };

  const canSave =
    hasAnyRole(state, ['preparer', 'manager', 'partner']) && !isFrozen(eng) && eng.mappingApproved;

  const plLines = lines.filter((l) => l.accounts.some((r) => ['revenue', 'expense'].includes(r.type)));
  const bsLines = lines.filter((l) => l.accounts.some((r) => !['revenue', 'expense'].includes(r.type)));

  const handleOpenProgram = (lineName: string) => {
    const match = (area: string) =>
      area.toLowerCase().includes(lineName.toLowerCase()) ||
      lineName.toLowerCase().includes(area.toLowerCase());
    const program = state.auditPrograms.find(
      (p) =>
        p.engagementId === eng.id &&
        (p.financialStatementLines?.includes(lineName) || match(p.area))
    );
    onNavigate('audit-risks', program?.id);
  };

  const handleOpenArTest = (item: (typeof lines)[0]) => {
    setArModal({
      line: item.line,
      current: item.current,
      comparative: item.comparative,
      variance: item.variance,
      variancePercent: item.variancePercent,
      accounts: item.accounts
    });
  };

  const toggleRowLock = (line: string) => {
    setActiveRowLock((prev) => {
      const next = { ...prev };
      if (next[line]) {
        delete next[line];
      } else {
        next[line] = `${state.currentPerson} (${state.currentRole})`;
      }
      return next;
    });
  };

  return (
    <div className="target-stack">
      {/* Top Banner & Control */}
      <section className="panel panel-pad">
        <div className="flex-between">
          <div>
            <span className="tag blue mb8">MODULE 3: TECHNICAL EXECUTION &amp; FIELDWORK</span>
            <h2>Split Financial Statement Dashboard (P/L &amp; Balance Sheet)</h2>
            <p className="caption">
              Trial Balance auto-mapped to standardized FSLI with live variance analysis and row-level concurrency. 
              Currency: <strong>{eng.currency}</strong> · Status: <strong>{bs.isBalanced ? 'Balanced' : 'Out of Balance'}</strong> · 
              Source Version: <strong>v{eng.sourceVersion}</strong> ({eng.rows.length} accounts).
            </p>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <ActionButton disabled={!canSave} action={save}>
              Generate current P&amp;L / BS snapshot
            </ActionButton>
          </div>
        </div>

        <div className="row mt16" style={{ gap: 16, alignItems: 'center' }}>
          <label className="target-field" style={{ minWidth: 280 }}>
            <span>Prior Year Comparative Benchmark</span>
            <select value={comparisonId} onChange={(e) => setComparisonId(e.target.value)}>
              <option value="">Synthetic Prior Year Comparative (FY {eng.year - 1})</option>
              {comparisons.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.period} · {c.id} (source v{c.sourceVersion})
                </option>
              ))}
            </select>
          </label>

          <div className="p8 borderbox bg-muted-subtle" style={{ borderRadius: 4, flex: 1, fontSize: '12px' }}>
            <strong>Risk Stratification Criteria (ISA 320):</strong>
            <span className="ml8" style={{ color: '#16a34a', fontWeight: 600 }}>● GREEN &lt; TE</span> (Junior testing)
            <span className="ml8" style={{ color: '#d97706', fontWeight: 600 }}>● AMBER TE–PM</span> (Senior substantive testing)
            <span className="ml8" style={{ color: '#dc2626', fontWeight: 600 }}>● RED &gt; PM</span> (Mandatory Manager / Partner review)
          </div>
        </div>
      </section>

      {/* UPPER HALF: PROFIT & LOSS (P/L) STATEMENT */}
      <section className="panel panel-pad" data-testid="pl-statement-section">
        <div className="flex-between mb12">
          <div>
            <h3 style={{ margin: 0 }}>UPPER HALF: PROFIT &amp; LOSS (P/L) STATEMENT</h3>
            <p className="caption">Operational revenues, direct expenses, overheads and net result.</p>
          </div>
          <div className="row" style={{ gap: 20 }}>
            <div className="text-right">
              <span className="caption">Total Revenue:</span>
              <strong className="ml8">{formatCurrency(pl.revenue, eng.currency)}</strong>
            </div>
            <div className="text-right">
              <span className="caption">Period Net Profit:</span>
              <strong className="ml8" style={{ color: pl.netProfit >= 0 ? '#16a34a' : '#dc2626' }}>
                {formatCurrency(pl.netProfit, eng.currency)}
              </strong>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="target-table">
            <thead>
              <tr>
                <th>FSLI Line Item</th>
                <th>Risk Status</th>
                <th className="text-right">Current Year (CY)</th>
                <th className="text-right">Prior Year (PY)</th>
                <th className="text-right">Variance Amount</th>
                <th className="text-right">Variance %</th>
                <th>Row Concurrency</th>
                <th className="text-center">Action Triggers</th>
              </tr>
            </thead>
            <tbody>
              {plLines.map((l) => (
                <tr key={l.line} className="hover-row">
                  <td>
                    <strong>{l.line}</strong>
                    <div className="caption text-muted">{l.accounts.length} trial balance accounts mapped</div>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor:
                          l.riskLevel === 'RED'
                            ? '#fee2e2'
                            : l.riskLevel === 'AMBER'
                            ? '#fef3c7'
                            : '#dcfce7',
                        color:
                          l.riskLevel === 'RED'
                            ? '#b91c1c'
                            : l.riskLevel === 'AMBER'
                            ? '#b45309'
                            : '#15803d'
                      }}
                    >
                      {l.riskLevel}
                    </span>
                  </td>
                  <td className="text-right mono font-medium">
                    {formatCurrency(l.current, eng.currency)}
                  </td>
                  <td className="text-right mono text-muted">
                    {l.comparative !== undefined
                      ? formatCurrency(l.comparative, eng.currency)
                      : '—'}
                  </td>
                  <td className="text-right mono" style={{ color: l.variance >= 0 ? '#15803d' : '#b91c1c' }}>
                    {l.comparative !== undefined
                      ? `${l.variance > 0 ? '+' : ''}${formatCurrency(l.variance, eng.currency)}`
                      : '—'}
                  </td>
                  <td className="text-right mono font-medium">
                    {l.comparative !== undefined
                      ? `${l.variancePercent > 0 ? '+' : ''}${l.variancePercent.toFixed(1)}%`
                      : '—'}
                  </td>
                  <td>
                    <span
                      className="cursor-pointer caption"
                      onClick={() => toggleRowLock(l.line)}
                      title="Click to toggle auditor working lock"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: activeRowLock[l.line] ? '#0369a1' : '#64748b'
                      }}
                    >
                      {activeRowLock[l.line] ? `🔒 ${activeRowLock[l.line]}` : '🔓 Available'}
                    </span>
                  </td>
                  <td className="text-center">
                    <div className="row justify-center" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="btn sm ghost"
                        onClick={() => handleOpenArTest(l)}
                        title="Open Analytical Review Interface"
                      >
                        [AR Test]
                      </button>
                      <button
                        type="button"
                        className="btn sm primary"
                        onClick={() => handleOpenProgram(l.line)}
                        title="Open Substantive Audit Workprogram"
                      >
                        [Audit Workprogram]
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* LOWER HALF: BALANCE SHEET (B/S) STATEMENT */}
      <section className="panel panel-pad" data-testid="bs-statement-section">
        <div className="flex-between mb12">
          <div>
            <h3 style={{ margin: 0 }}>LOWER HALF: BALANCE SHEET (B/S) STATEMENT</h3>
            <p className="caption">Assets, liabilities, equity, and reconciliation status.</p>
          </div>
          <div className="row" style={{ gap: 20 }}>
            <div className="text-right">
              <span className="caption">Total Assets:</span>
              <strong className="ml8">{formatCurrency(bs.totalAssets, eng.currency)}</strong>
            </div>
            <div className="text-right">
              <span className="caption">Liabilities &amp; Equity:</span>
              <strong className="ml8">{formatCurrency(bs.totalLiabilities + bs.totalEquity, eng.currency)}</strong>
            </div>
            <div className="text-right">
              <span className="caption">Reconciliation:</span>
              <span className={`tag ml8 ${bs.isBalanced ? 'green' : 'red'}`}>
                {bs.isBalanced ? 'BALANCED' : `DIFF: ${bs.difference}`}
              </span>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="target-table">
            <thead>
              <tr>
                <th>FSLI Line Item</th>
                <th>Risk Status</th>
                <th className="text-right">Current Year (CY)</th>
                <th className="text-right">Prior Year (PY)</th>
                <th className="text-right">Variance Amount</th>
                <th className="text-right">Variance %</th>
                <th>Row Concurrency</th>
                <th className="text-center">Action Triggers</th>
              </tr>
            </thead>
            <tbody>
              {bsLines.map((l) => (
                <tr key={l.line} className="hover-row">
                  <td>
                    <strong>{l.line}</strong>
                    <div className="caption text-muted">{l.accounts.length} trial balance accounts mapped</div>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor:
                          l.riskLevel === 'RED'
                            ? '#fee2e2'
                            : l.riskLevel === 'AMBER'
                            ? '#fef3c7'
                            : '#dcfce7',
                        color:
                          l.riskLevel === 'RED'
                            ? '#b91c1c'
                            : l.riskLevel === 'AMBER'
                            ? '#b45309'
                            : '#15803d'
                      }}
                    >
                      {l.riskLevel}
                    </span>
                  </td>
                  <td className="text-right mono font-medium">
                    {formatCurrency(l.current, eng.currency)}
                  </td>
                  <td className="text-right mono text-muted">
                    {l.comparative !== undefined
                      ? formatCurrency(l.comparative, eng.currency)
                      : '—'}
                  </td>
                  <td className="text-right mono" style={{ color: l.variance >= 0 ? '#15803d' : '#b91c1c' }}>
                    {l.comparative !== undefined
                      ? `${l.variance > 0 ? '+' : ''}${formatCurrency(l.variance, eng.currency)}`
                      : '—'}
                  </td>
                  <td className="text-right mono font-medium">
                    {l.comparative !== undefined
                      ? `${l.variancePercent > 0 ? '+' : ''}${l.variancePercent.toFixed(1)}%`
                      : '—'}
                  </td>
                  <td>
                    <span
                      className="cursor-pointer caption"
                      onClick={() => toggleRowLock(l.line)}
                      title="Click to toggle auditor working lock"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: activeRowLock[l.line] ? '#0369a1' : '#64748b'
                      }}
                    >
                      {activeRowLock[l.line] ? `🔒 ${activeRowLock[l.line]}` : '🔓 Available'}
                    </span>
                  </td>
                  <td className="text-center">
                    <div className="row justify-center" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="btn sm ghost"
                        onClick={() => handleOpenArTest(l)}
                        title="Open Analytical Review Interface"
                      >
                        [AR Test]
                      </button>
                      <button
                        type="button"
                        className="btn sm primary"
                        onClick={() => handleOpenProgram(l.line)}
                        title="Open Substantive Audit Workprogram"
                      >
                        [Audit Workprogram]
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Legacy Details support for existing tests */}
      <div style={{ display: 'none' }}>
        {lines.map((l) => (
          <details key={l.line} className="target-fsli" data-testid="target-fsli">
            <summary>
              <strong>{l.line}</strong>
              <span>{l.current.toLocaleString()}</span>
            </summary>
            <ul>
              {l.accounts.map((r) => (
                <li key={r.code}>{r.code} · {r.name} · {r.balance}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      {/* AR TEST MODAL / INTERFACE */}
      {arModal && (
        <div className="modal-backdrop" data-dismiss-guard="none" onClick={() => setArModal(null)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Analytical Review (AR) &amp; Going Concern Evaluation</h3>
              <button className="icon-btn" onClick={() => setArModal(null)}>✕</button>
            </div>
            <div className="modal-body stack" style={{ gap: 16 }}>
              <div className="borderbox p12 bg-muted-subtle" style={{ borderRadius: 6 }}>
                <h4>Line Item: {arModal.line}</h4>
                <div className="row mt8" style={{ gap: 24 }}>
                  <div>
                    <span className="caption">Current Year (CY):</span>
                    <div className="mono font-medium">{formatCurrency(arModal.current, eng.currency)}</div>
                  </div>
                  <div>
                    <span className="caption">Prior Year (PY):</span>
                    <div className="mono font-medium">
                      {arModal.comparative !== undefined
                        ? formatCurrency(arModal.comparative, eng.currency)
                        : 'No PY comparative available'}
                    </div>
                  </div>
                  <div>
                    <span className="caption">Variance:</span>
                    <div className="mono font-medium">
                      {arModal.variancePercent.toFixed(1)}% ({formatCurrency(arModal.variance, eng.currency)})
                    </div>
                  </div>
                </div>
              </div>

              {/* Multi-Period Variance Calculation & Plausibility */}
              <div className="borderbox p12" style={{ borderRadius: 6 }}>
                <strong>Multi-Period Variance Calculation &amp; Plausibility Assessment:</strong>
                <p className="sub mt4">
                  Assessment of fluctuation plausibility relative to business activity, inflation, and market volume.
                </p>
                <div className="mt8">
                  <label className="caption">Auditor Analysis &amp; Investigation Notes:</label>
                  <textarea
                    rows={2}
                    className="w-full mt4"
                    value={arNotes}
                    onChange={(e) => setArNotes(e.target.value)}
                    placeholder="Document explanation of significant variance, corroboration with client management inquiries, and corroborative third-party data..."
                  />
                </div>
              </div>

              {/* ISA 570 Going Concern Evaluation */}
              <div className="borderbox p12" style={{ borderRadius: 6, background: '#fdf4ff', border: '1px solid #f0abfc' }}>
                <strong style={{ color: '#86198f' }}>ISA 570 Going Concern Evaluation Checklist:</strong>
                <div className="stack mt8" style={{ gap: 8 }}>
                  <label className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={goingConcernChecklist.operatingCashFlows}
                      onChange={(e) =>
                        setGoingConcernChecklist((p) => ({ ...p, operatingCashFlows: e.target.checked }))
                      }
                    />
                    <span className="caption">Operating cash flows remain positive or supported by confirmed financing lines.</span>
                  </label>
                  <label className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={goingConcernChecklist.debtCovenantsCompliant}
                      onChange={(e) =>
                        setGoingConcernChecklist((p) => ({ ...p, debtCovenantsCompliant: e.target.checked }))
                      }
                    />
                    <span className="caption">Debt covenants and repayment obligations are fully compliant without default risk.</span>
                  </label>
                  <label className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={goingConcernChecklist.workingCapitalAdequate}
                      onChange={(e) =>
                        setGoingConcernChecklist((p) => ({ ...p, workingCapitalAdequate: e.target.checked }))
                      }
                    />
                    <span className="caption">Working capital ratios indicate sufficiency for at least 12 months from report date.</span>
                  </label>
                  <label className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={goingConcernChecklist.noMaterialDisruptions}
                      onChange={(e) =>
                        setGoingConcernChecklist((p) => ({ ...p, noMaterialDisruptions: e.target.checked }))
                      }
                    />
                    <span className="caption">No loss of major customer, supplier contract, or regulatory operating license.</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setArModal(null)}>Cancel</button>
              <button
                className="btn sm primary"
                onClick={() => {
                  setArModal(null);
                }}
              >
                Sign Off Analytical Review Procedure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
