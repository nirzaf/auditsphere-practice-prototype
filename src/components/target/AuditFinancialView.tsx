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

export function AuditFinancialView({ onNavigate }: TargetViewProps) {
  const state = prototypeStore.getSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement),
    [comparisonId, setComparisonId] = useState('');
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
  const lines = [...new Set(eng.rows.map((r) => r.mappedStatementLine || 'Unmapped'))].map(
    (line) => {
      const accounts = eng.rows.filter((r) => (r.mappedStatementLine || 'Unmapped') === line);
      const current = accounts.reduce(
        (n, r) =>
          n + (['liability', 'equity', 'revenue'].includes(r.type) ? -r.balance : r.balance),
        0
      );
      const comparativeRows = comparison?.rows.filter((r) => r.mappedStatementLine === line) || [];
      return {
        line,
        accounts,
        current,
        comparative: comparison
          ? comparativeRows.reduce(
              (n, r) =>
                n + (['liability', 'equity', 'revenue'].includes(r.type) ? -r.balance : r.balance),
              0
            )
          : undefined,
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
  return (
    <div className="target-stack">
      <section className="panel panel-pad">
        <div className="flex-between">
          <div>
            <h2>Trial balance → P&L & balance sheet</h2>
            <p className="caption">
              Source v{eng.sourceVersion} · {eng.rows.length} accounts · {eng.currency} ·{' '}
              {bs.isBalanced ? 'Balanced' : 'Out of balance'}
            </p>
          </div>
          <ActionButton disabled={!canSave} action={save}>
            Generate current P&L / BS snapshot
          </ActionButton>
        </div>
        <label className="target-field">
          Comparative client period
          <select value={comparisonId} onChange={(e) => setComparisonId(e.target.value)}>
            <option value="">No approved comparative source available / selected</option>
            {comparisons.map((e) => (
              <option value={e.id} key={e.id}>
                {e.period} · {e.id} · source v{e.sourceVersion}
              </option>
            ))}
          </select>
        </label>
        <p className="caption">
          Current mapping and account identities are preserved. A TB replacement stales the saved
          statement snapshot.
        </p>
      </section>
      <div className="target-two-columns">
        <section className="panel panel-pad">
          <h3>Profit & loss</h3>
          <dl className="target-totals">
            <dt>Revenue</dt>
            <dd>{formatCurrency(pl.revenue, eng.currency)}</dd>
            <dt>Cost of sales</dt>
            <dd>{formatCurrency(pl.costOfSales, eng.currency)}</dd>
            <dt>Operating expenses</dt>
            <dd>{formatCurrency(pl.operatingExpenses, eng.currency)}</dd>
            <dt>Profit / loss</dt>
            <dd>{formatCurrency(pl.netProfit, eng.currency)}</dd>
          </dl>
          {lines
            .filter((l) => l.accounts.some((r) => ['revenue', 'expense'].includes(r.type)))
            .map((l) => (
              <FinancialLine
                key={l.line}
                line={l}
                engagementId={eng.id}
                materiality={plan?.overallMateriality}
                onNavigate={onNavigate}
              />
            ))}
        </section>
        <section className="panel panel-pad">
          <h3>Balance sheet</h3>
          <dl className="target-totals">
            <dt>Assets</dt>
            <dd>{formatCurrency(bs.totalAssets, eng.currency)}</dd>
            <dt>Liabilities</dt>
            <dd>{formatCurrency(bs.totalLiabilities, eng.currency)}</dd>
            <dt>Equity including period result</dt>
            <dd>{formatCurrency(bs.totalEquity, eng.currency)}</dd>
            <dt>Difference</dt>
            <dd>{formatCurrency(bs.difference, eng.currency)}</dd>
          </dl>
          {lines
            .filter((l) => l.accounts.some((r) => !['revenue', 'expense'].includes(r.type)))
            .map((l) => (
              <FinancialLine
                key={l.line}
                line={l}
                engagementId={eng.id}
                materiality={plan?.overallMateriality}
                onNavigate={onNavigate}
              />
            ))}
        </section>
      </div>
      <details className="panel panel-pad">
        <summary>Statement snapshot history</summary>
        {(state.statementSetRevisions || [])
          .filter((r) => r.engagementId === eng.id)
          .map((r) => (
            <p key={r.id}>
              v{r.revision} · source v{r.sourceVersion} · mapping v{r.mappingRevision} · {r.status}
            </p>
          ))}
      </details>
    </div>
  );
}
function FinancialLine({
  line,
  engagementId,
  materiality,
  onNavigate
}: {
  line: {
    line: string;
    current: number;
    comparative?: number;
    accounts: import('../../types').TrialBalanceRow[];
  };
  engagementId: string;
  materiality?: number;
  onNavigate: TargetViewProps['onNavigate'];
}) {
  const state = prototypeStore.getSnapshot();
  const match = (area: string) =>
    area
      .toLowerCase()
      .split(/\W+/)
      .some(
        (word) =>
          word.length > 3 &&
          `${line.line} ${line.accounts.map((r) => r.name).join(' ')}`.toLowerCase().includes(word)
      );
  const programs = state.auditPrograms.filter(
    (p) =>
      p.engagementId === engagementId &&
      (p.financialStatementLines?.includes(line.line) || match(p.area))
  );
  const risks = state.auditRisks.filter((r) => r.engagementId === engagementId && match(r.area));
  const findings = state.findings.filter(
    (f) =>
      f.engagementId === engagementId &&
      (f.financialStatementLine === line.line ||
        line.accounts.some((r) => r.code === f.affectedAccount))
  );
  return (
    <details className="target-fsli" data-testid="target-fsli">
      <summary>
        <strong>{line.line}</strong>
        <span>
          {line.current.toLocaleString()}{' '}
          {line.comparative !== undefined
            ? ` / comparative ${line.comparative.toLocaleString()}`
            : ''}
        </span>
      </summary>
      <p>
        PM: {materiality ?? 'Not calculated'} ·{' '}
        {materiality === undefined
          ? 'Not assessed'
          : Math.abs(line.current) >= materiality
            ? 'Material FSLI'
            : 'Below PM'}{' '}
        · risk: {risks.length ? risks.map((r) => r.rating).join(', ') : 'Not assessed'}
      </p>
      <ul>
        {line.accounts.map((r) => (
          <li key={r.code}>
            {r.code} · {r.name} · {r.balance.toLocaleString()}
          </li>
        ))}
      </ul>
      <p>
        Linked findings: {findings.length} · linked workpapers:{' '}
        {programs.map((p) => p.leadWorkpaperRef || 'Not linked').join(', ') || 'Not prepared'}
      </p>
      <button className="btn sm" onClick={() => onNavigate('audit-risks', programs[0]?.id)}>
        Open audit program for {line.line}
      </button>
      <p className="caption">
        Engagement {engagementId} remains selected; return to P&L / BS to revisit this FSLI.
      </p>
    </details>
  );
}
