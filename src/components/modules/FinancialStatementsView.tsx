// Module 24: Financial Statements Generation & Export (VP-040, VP-041)
import React, { useEffect, useRef, useState } from 'react';
import { CashFlowScheduleRevision, RouteKey, TrialBalanceRow, StatementLayoutRevision } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { applyReportingAdjustments, calculateBalanceSheet, calculateIncomeStatement, formatCurrency as formatCurrencyFor } from '../../services/calculations';
import { exportService } from '../../services/exportService';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { visibleEngagementIds } from '../../services/guards';
import { ModuleIdentityLine, StaleNotice, StatusBadge } from '../common/Enterprise';

interface FinancialStatementsViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const FinancialStatementsView: React.FC<FinancialStatementsViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [statementType, setStatementType] = useState<'bs' | 'is' | 'equity' | 'cashflow'>('bs');
  const [comparativeEngagementId, setComparativeEngagementId] = useState('');
  const [, refreshRevisionHistory] = useState(0);
  const [revisionError, setRevisionError] = useState('');
  const [layoutError, setLayoutError] = useState('');
  const [layoutDraft, setLayoutDraft] = useState<{ lines: StatementLayoutRevision['lines']; subtotals: StatementLayoutRevision['subtotals'] }>({ lines: [], subtotals: [] });
  const [cashFlowError, setCashFlowError] = useState('');
  const latestCashFlow = state.engagements.find(e => e.id === state.selectedEngagement)?.cashFlowScheduleHistory?.at(-1);
  const [cashFlowDraft, setCashFlowDraft] = useState(() => ({
    openingCash: latestCashFlow?.openingCash ?? 0,
    closingCash: latestCashFlow?.closingCash ?? 0,
    openingEquity: latestCashFlow?.openingEquity ?? 0,
    movements: latestCashFlow?.movements.map(item => ({ ...item })) ?? [{ id: crypto.randomUUID(), description: '', category: 'Operating' as const, amount: 0, evidenceRef: '' }]
  }));
  const initialCashFlowDraft = useRef(JSON.stringify(cashFlowDraft));

  const visibleEngagements = visibleEngagementIds(state);
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement && (visibleEngagements === 'ALL' || visibleEngagements.includes(e.id)));
  const client = state.clients.find(c => c.id === selectedEng?.client);
  const mappingHistory = (state.accountMappingRevisions || []).filter(item => item.engagementId === selectedEng?.id);
  const currentMapping = [...mappingHistory].sort((a, b) => b.revision - a.revision)[0];
  const canEditLayout = hasAnyRole(state, ['manager', 'preparer', 'partner']);
  const layoutHistory = (state.statementLayoutRevisions || []).filter(item => item.engagementId === selectedEng?.id).sort((a, b) => b.revision - a.revision);
  const latestLayout = layoutHistory[0];
  const layoutVersion = latestLayout?.revision || 1;
  useEffect(() => {
    setLayoutDraft(latestLayout ? { lines: structuredClone(latestLayout.lines), subtotals: structuredClone(latestLayout.subtotals) } : { lines: [], subtotals: [] });
    setLayoutError('');
  }, [selectedEng?.id, latestLayout?.revision]);
  const saveCashFlow = () => {
    if (!selectedEng || !currentMapping) return false;
    try {
      setCashFlowError('');
      prototypeStore.saveCashFlowSchedule({ engagementId: selectedEng.id, sourceVersion: selectedEng.sourceVersion, mappingRevision: currentMapping.revision, ...structuredClone(cashFlowDraft) });
      const saved = prototypeStore.getSnapshot().engagements.find(item => item.id === selectedEng.id)?.cashFlowScheduleHistory?.at(-1);
      if (!saved) return false;
      const nextDraft = { openingCash: saved.openingCash, closingCash: saved.closingCash, openingEquity: saved.openingEquity ?? 0, movements: saved.movements.map(item => ({ ...item })) };
      setCashFlowDraft(nextDraft);
      initialCashFlowDraft.current = JSON.stringify(nextDraft);
      refreshRevisionHistory(value => value + 1);
      return true;
    } catch (error) {
      setCashFlowError(error instanceof Error ? error.message : String(error));
      return false;
    }
  };
  useEffect(() => {
    const key = 'financial-statements-cash-flow';
    if (!onRegisterUnsavedForm || !selectedEng) return;
    const guard: UnsavedFormGuard = {
      label: 'Cash flow schedule',
      isDirty: () => JSON.stringify(cashFlowDraft) !== initialCashFlowDraft.current,
      save: saveCashFlow,
      discard: () => setCashFlowDraft(JSON.parse(initialCashFlowDraft.current))
    };
    onRegisterUnsavedForm(guard, key);
    return () => onRegisterUnsavedForm(null, key);
  }, [cashFlowDraft, selectedEng?.id, currentMapping?.revision, onRegisterUnsavedForm]);

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="file" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to generate and review financial statements.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  // Every statement surface and export follows the selected engagement currency.
  // Comparative periods are already constrained to the same currency.
  const formatCurrency = (amount: number, currency = selectedEng.currency) => formatCurrencyFor(amount, currency);

  const adjustmentResult = applyReportingAdjustments(selectedEng.rows, state.adjustmentJournals.filter(j => j.engagementId === selectedEng.id), selectedEng.sourceVersion, prototypeStore.getAdjustmentSupportIssues(selectedEng.id));
  const mappedAccounts = currentMapping?.mappings || [];
  const unmappedRows = selectedEng.rows.filter(row => !mappedAccounts.some(mapping => mapping.accountCode === row.code));
  const mappingReady = Boolean(currentMapping?.status === 'Approved' && !unmappedRows.length);
  const cashFlowHistory = (selectedEng.cashFlowScheduleHistory || []).slice().sort((a, b) => b.revision - a.revision);
  const currentCashFlowRevision = cashFlowHistory[0];
  const cashFlowCurrent = Boolean(currentCashFlowRevision && currentCashFlowRevision.sourceVersion === selectedEng.sourceVersion && currentCashFlowRevision.mappingRevision === currentMapping?.revision && mappingReady);
  const equityMovementLines = currentCashFlowRevision?.movements.filter(item => ['Equity contribution', 'Equity distribution'].includes(item.category)) || [];
  const equityMovementTotal = equityMovementLines.reduce((sum, item) => sum + item.amount, 0);
  const updateCashFlowMovement = (id: string, changes: Partial<CashFlowScheduleRevision['movements'][number]>) => setCashFlowDraft(current => ({ ...current, movements: current.movements.map(item => item.id === id ? { ...item, ...changes } : item) }));
  const reviewCashFlow = () => {
    try { setCashFlowError(''); prototypeStore.reviewCashFlowSchedule(selectedEng.id, currentCashFlowRevision!.revision); refreshRevisionHistory(value => value + 1); }
    catch (error) { setCashFlowError(error instanceof Error ? error.message : String(error)); }
  };
  const mapRows = (rows: TrialBalanceRow[], mappings: typeof mappedAccounts): TrialBalanceRow[] => rows.flatMap(row => {
    const targets = mappings.find(mapping => mapping.accountCode === row.code)?.targets || [];
    let allocatedCents = 0;
    return targets.map((target, index) => {
      const cents = index === targets.length - 1 ? Math.round(row.balance * 100) - allocatedCents : Math.round(row.balance * 100 * target.percentage / 100);
      allocatedCents += cents;
      return {
        ...row,
        code: `${row.code} → ${target.statementLine}`,
        name: target.statementLine,
        type: ['Cash and cash equivalents', 'Trade receivables', 'Other current assets', 'Property and equipment'].includes(target.statementLine) ? 'asset' : ['Trade payables', 'Borrowings'].includes(target.statementLine) ? 'liability' : target.statementLine === 'Share capital and reserves' ? 'equity' : target.statementLine === 'Revenue' ? 'revenue' : 'expense',
        balance: cents / 100,
        mappedStatementLine: target.statementLine
      };
    });
  });
  const statementRows: TrialBalanceRow[] = mappingReady
    ? mapRows(adjustmentResult.rows, mappedAccounts)
    : adjustmentResult.rows;
  const bs = calculateBalanceSheet(statementRows);
  const is = calculateIncomeStatement(statementRows);
  const equityClosing = (currentCashFlowRevision?.openingEquity ?? 0) + equityMovementTotal + is.netProfit;
  const equityScheduleReady = Boolean(cashFlowCurrent && currentCashFlowRevision?.status === 'Reviewed' && currentCashFlowRevision.openingEquity !== undefined && Math.abs(equityClosing - bs.totalEquity) <= 0.005);
  const priorPeriods = state.engagements.filter(eng => eng.client === selectedEng.client && eng.currency === selectedEng.currency && eng.year < selectedEng.year).sort((a, b) => b.year - a.year);
  const comparativeEngagement = priorPeriods.find(eng => eng.id === comparativeEngagementId) || priorPeriods[0];
  const priorMapping = comparativeEngagement && [...(state.accountMappingRevisions || []).filter(item => item.engagementId === comparativeEngagement.id)].sort((a, b) => b.revision - a.revision)[0];
  const priorUnmapped = comparativeEngagement?.rows.filter(row => !priorMapping?.mappings.some(mapping => mapping.accountCode === row.code)) || [];
  const priorMappingReady = Boolean(priorMapping?.status === 'Approved' && priorUnmapped.length === 0);
  const priorAdjustmentResult = comparativeEngagement && applyReportingAdjustments(comparativeEngagement.rows, state.adjustmentJournals.filter(j => j.engagementId === comparativeEngagement.id), comparativeEngagement.sourceVersion, prototypeStore.getAdjustmentSupportIssues(comparativeEngagement.id));
  const priorRows = comparativeEngagement && priorMappingReady && priorAdjustmentResult ? mapRows(priorAdjustmentResult.rows, priorMapping!.mappings) : [];
  const priorBalanceSheet = priorRows.length ? calculateBalanceSheet(priorRows) : null;
  const priorIncomeStatement = priorRows.length ? calculateIncomeStatement(priorRows) : null;
  const comparativeReady = Boolean(mappingReady && priorBalanceSheet && priorIncomeStatement && comparativeEngagement);
  const comparisonAmount = (row: TrialBalanceRow) => ['liability', 'equity', 'revenue'].includes(row.type) ? -row.balance : row.balance;
  const comparisonLineRows = [...new Set(statementRows.map(row => row.mappedStatementLine).filter((line): line is string => Boolean(line)))].sort().map(line => {
    const currentRows = statementRows.filter(row => row.mappedStatementLine === line);
    const priorLineRows = priorRows.filter(row => row.mappedStatementLine === line);
    return {
      line,
      statement: currentRows[0]?.type === 'asset' || currentRows[0]?.type === 'liability' || currentRows[0]?.type === 'equity' ? 'bs' as const : 'is' as const,
      current: currentRows.reduce((sum, row) => sum + comparisonAmount(row), 0),
      prior: priorLineRows.reduce((sum, row) => sum + comparisonAmount(row), 0),
      currentSources: currentRows.map(row => row.code.split(' → ')[0]).join(', '),
      priorSources: priorLineRows.map(row => row.code.split(' → ')[0]).join(', ')
    };
  });
  const balanceSheetLines = new Set(['Cash and cash equivalents', 'Trade receivables', 'Other current assets', 'Property and equipment', 'Trade payables', 'Borrowings', 'Share capital and reserves']);
  const defaultLayoutLines: StatementLayoutRevision['lines'] = comparisonLineRows.map((row, index) => ({ line: row.line, statement: balanceSheetLines.has(row.line) ? 'bs' : 'is', group: balanceSheetLines.has(row.line) ? 'Financial position' : 'Performance', order: index + 1 }));
  const configuredLayoutLines = (layoutDraft.lines.length ? layoutDraft.lines : defaultLayoutLines).map(line => ({ ...line, group: line.group.trim() || (line.statement === 'bs' ? 'Financial position' : 'Performance') })).sort((a, b) => a.statement.localeCompare(b.statement) || a.order - b.order || a.line.localeCompare(b.line));
  const orderedLineRows = configuredLayoutLines.flatMap(layout => { const row = comparisonLineRows.find(item => item.line === layout.line); return row ? [{ ...row, group: layout.group, order: layout.order }] : []; });
  const configuredSubtotals = layoutDraft.subtotals.map(item => ({ ...item, lineNames: item.lineNames.map(line => line.trim()).filter(Boolean) }));
  const subtotalRows = configuredSubtotals.map(item => ({ ...item, current: comparisonLineRows.filter(row => item.lineNames.includes(row.line) && row.statement === item.statement).reduce((sum, row) => sum + row.current, 0), comparative: comparativeReady ? comparisonLineRows.filter(row => item.lineNames.includes(row.line) && row.statement === item.statement).reduce((sum, row) => sum + row.prior, 0) : undefined }));
  const saveLayoutRevision = () => {
    if (!currentMapping || !mappingReady) return;
    try {
      setLayoutError('');
      prototypeStore.saveStatementLayoutRevision({ engagementId: selectedEng.id, sourceVersion: selectedEng.sourceVersion, mappingRevision: currentMapping.revision, lines: configuredLayoutLines, subtotals: configuredSubtotals });
      refreshRevisionHistory(value => value + 1);
    } catch (error) { setLayoutError(error instanceof Error ? error.message : String(error)); }
  };
  const statementHistory = (state.statementSetRevisions || []).filter(item => item.engagementId === selectedEng.id).sort((a, b) => b.revision - a.revision);
  const latestStatementRevision = statementHistory[0];
  const currentStatementTotals = { assets: bs.totalAssets, liabilities: bs.totalLiabilities, equity: bs.totalEquity, revenue: is.revenue, netProfit: is.netProfit };
  const comparativeStatementTotals = comparativeReady && priorBalanceSheet && priorIncomeStatement ? { assets: priorBalanceSheet.totalAssets, liabilities: priorBalanceSheet.totalLiabilities, equity: priorBalanceSheet.totalEquity, revenue: priorIncomeStatement.revenue, netProfit: priorIncomeStatement.netProfit } : undefined;
  const revisionCurrent = Boolean(latestStatementRevision && latestStatementRevision.sourceVersion === selectedEng.sourceVersion && latestStatementRevision.mappingRevision === currentMapping?.revision && latestStatementRevision.layoutVersion === layoutVersion && latestStatementRevision.comparativeEngagementId === (comparativeReady ? comparativeEngagement?.id : undefined) && latestStatementRevision.comparativeSourceVersion === (comparativeReady ? comparativeEngagement?.sourceVersion : undefined) && latestStatementRevision.comparativeMappingRevision === (comparativeReady ? priorMapping?.revision : undefined));
  const saveStatementRevision = () => {
    try {
      setRevisionError('');
      prototypeStore.saveStatementSetRevision({ engagementId: selectedEng.id, sourceVersion: selectedEng.sourceVersion, mappingRevision: currentMapping!.revision, comparativeEngagementId: comparativeReady ? comparativeEngagement!.id : undefined, comparativeSourceVersion: comparativeReady ? comparativeEngagement!.sourceVersion : undefined, comparativeMappingRevision: comparativeReady ? priorMapping!.revision : undefined, layoutVersion, layout: configuredLayoutLines, subtotals: subtotalRows, totals: currentStatementTotals, comparativeTotals: comparativeStatementTotals, lines: orderedLineRows.map(row => ({ line: row.line, current: row.current, comparative: comparativeReady ? row.prior : undefined, currentSources: row.currentSources.split(', ').filter(Boolean), comparativeSources: comparativeReady ? row.priorSources.split(', ').filter(Boolean) : [] })) });
      refreshRevisionHistory(value => value + 1);
    } catch (error) { setRevisionError(error instanceof Error ? error.message : String(error)); }
  };
  const reviewStatementRevision = () => {
    try { setRevisionError(''); prototypeStore.reviewStatementSetRevision(selectedEng.id, latestStatementRevision!.revision); refreshRevisionHistory(value => value + 1); }
    catch (error) { setRevisionError(error instanceof Error ? error.message : String(error)); refreshRevisionHistory(value => value + 1); }
  };

  const handleExportXLSX = () => {
    const priorAmount = (value?: number) => comparativeReady ? value ?? 0 : 'Unavailable';
    const currentColumn = `Current FY${selectedEng.year} (${selectedEng.currency})`;
    const priorColumn = `Comparative FY${comparativeEngagement?.year ?? 'unavailable'} (${selectedEng.currency})`;
    const pairedRow = (line: string, current: number, prior?: number, currentSources = '', priorSources = '', group = '') => ({
      LineItem: line,
      [currentColumn]: current,
      [priorColumn]: priorAmount(prior),
      'Current source accounts': currentSources,
      'Comparative source accounts': comparativeReady ? priorSources : 'Unavailable',
      Group: group
    });
    const data = [
      pairedRow('Total assets', bs.totalAssets, priorBalanceSheet?.totalAssets),
      pairedRow('Total liabilities', bs.totalLiabilities, priorBalanceSheet?.totalLiabilities),
      pairedRow('Total equity', bs.totalEquity, priorBalanceSheet?.totalEquity),
      pairedRow('Current-period result', bs.currentPeriodResult, priorBalanceSheet?.currentPeriodResult),
      ...orderedLineRows.map(row => pairedRow(row.line, row.current, row.prior, row.currentSources, row.priorSources, row.group)),
      ...subtotalRows.map(row => pairedRow(row.label, row.current, row.comparative, '', '', `Subtotal · ${row.statement === 'bs' ? 'Financial position' : 'Performance'}`)),
      pairedRow('Revenue', is.revenue, priorIncomeStatement?.revenue),
      pairedRow('Cost of sales', is.costOfSales, priorIncomeStatement?.costOfSales),
      pairedRow('Gross profit', is.grossProfit, priorIncomeStatement?.grossProfit),
      pairedRow('Operating expenses', is.operatingExpenses, priorIncomeStatement?.operatingExpenses),
      pairedRow('Net profit', is.netProfit, priorIncomeStatement?.netProfit)
    ];

    exportService.exportXLSX(
      `Financial_Statements_${client?.code || 'CL001'}_FY2026`,
      'Financial Statements',
      data
    );
  };

  const handleExportPDF = () => {
    const lines = [
      `Entity: ${client?.name || 'Example Trading Entity'}`,
      `Reporting Period: ${selectedEng.period}`,
      `Currency: ${selectedEng.currency}`,
      '',
      `BALANCE SHEET`,
      `Total Assets: ${formatCurrency(bs.totalAssets)}`,
      `Total Liabilities: ${formatCurrency(bs.totalLiabilities)}`,
      `Total Equity: ${formatCurrency(bs.totalEquity)}`,
      `Balance Sheet Equation Check: ${bs.isBalanced ? 'BALANCED' : 'IMBALANCE DETECTED'}`,
      '',
      `INCOME STATEMENT`,
      ...statementRows.filter(row => ['revenue', 'expense'].includes(row.type)).map(row => `${row.mappedStatementLine || row.type} · Source ${row.code.split(' → ')[0]}: ${formatCurrency(row.balance)}`),
      `Revenue: ${formatCurrency(is.revenue)}`,
      `Cost of Sales: ${formatCurrency(is.costOfSales)}`,
      `Gross Profit: ${formatCurrency(is.grossProfit)}`,
      `Operating Expenses: ${formatCurrency(is.operatingExpenses)}`,
      `Net Profit for the Year: ${formatCurrency(is.netProfit)}`,
      '',
      `CONFIGURED MAPPED STATEMENT LAYOUT · v${layoutVersion}`,
      ...orderedLineRows.map(row => `${row.group} · ${row.line}: current ${formatCurrency(row.current)} [${row.currentSources}] · prior ${comparativeReady ? formatCurrency(row.prior) : 'Unavailable'} [${comparativeReady ? row.priorSources : 'Unavailable'}]`),
      ...subtotalRows.map(row => `${row.label} (${row.statement === 'bs' ? 'Financial position' : 'Performance'}): current ${formatCurrency(row.current)} · prior ${row.comparative === undefined ? 'Unavailable' : formatCurrency(row.comparative)} · lines ${row.lineNames.join(', ')}`),
      '',
      comparativeReady ? `COMPARATIVE DETAIL · FY ${comparativeEngagement!.year}` : 'COMPARATIVE PERIOD UNAVAILABLE',
      ...(comparativeReady ? comparisonLineRows.map(row => `${row.line}: current ${formatCurrency(row.current)} [${row.currentSources}] · prior ${formatCurrency(row.prior)} [${row.priorSources}]`) : ['No comparative figures are substituted.'])
    ];

    exportService.exportPDF(
      `Financial_Report_${client?.code || 'CL001'}_FY2026`,
      `Audited Financial Statements - FY ${selectedEng.year}`,
      lines
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Financial Statements</h1>
          <p>Multi-statement drill-down, balance verification, and genuine demonstration document exports.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" disabled={!mappingReady} onClick={handleExportXLSX}>
            <Icon name="download" /> Export XLSX
          </button>
          <button className="btn primary sm" disabled={!mappingReady} onClick={handleExportPDF}>
            <Icon name="download" /> Export PDF
          </button>
        </div>
      </div>

      {!mappingReady && <div role="alert" className="badge danger" style={{ display: 'block', padding: 12 }}>Statement generation is blocked until the latest mapping revision is independently approved and covers all trial balance accounts. Unmapped: {unmappedRows.map(row => row.code).join(', ') || 'none'}.</div>}

      <section className="panel panel-pad" aria-label="Statement revision review">
        <div className="between"><div><h3>Statement Set Revisions</h3><p className="sub">Save this mapped statement set, then have an independent reviewer approve the saved revision.</p></div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm ghost" disabled={!mappingReady} onClick={saveStatementRevision}>Save statement revision</button>
            {latestStatementRevision?.status === 'Draft' && revisionCurrent && <button className="btn sm primary" onClick={reviewStatementRevision}>Review statement revision v{latestStatementRevision.revision}</button>}
          </div>
        </div>
        {revisionError && <p role="alert" className="badge danger mt12">{revisionError}</p>}
        {/* The latest-revision line keeps its established wording; the shared
            stale notice below it adds the reason, impact and required action. */}
        {latestStatementRevision && <p role="status" className="mt12">Latest: v{latestStatementRevision.revision} · {revisionCurrent ? latestStatementRevision.status : 'Stale'} · prepared by {latestStatementRevision.preparedByUserId}{latestStatementRevision.reviewedByUserId ? ` · reviewed by ${latestStatementRevision.reviewedByUserId}` : ''}</p>}
        {latestStatementRevision && <p className="caption mt4">Current revision status: <StatusBadge status={revisionCurrent ? latestStatementRevision.status : 'Stale'} explain /></p>}
        {latestStatementRevision && !revisionCurrent && (
          <div className="mt12">
            <StaleNotice
              sourceLabel={`statement source v${latestStatementRevision.sourceVersion}`}
              currentSourceLabel={`v${selectedEng.sourceVersion}`}
              reason={latestStatementRevision.sourceVersion !== selectedEng.sourceVersion
                ? `The trial-balance source advanced from v${latestStatementRevision.sourceVersion} to v${selectedEng.sourceVersion} after this statement revision was saved.`
                : latestStatementRevision.mappingRevision !== currentMapping?.revision
                ? `The approved account mapping changed from revision ${latestStatementRevision.mappingRevision} to ${currentMapping?.revision ?? 'a newer revision'} after this statement revision was saved.`
                : latestStatementRevision.layoutVersion !== layoutVersion
                ? `The statement layout changed from v${latestStatementRevision.layoutVersion} to v${layoutVersion} after this revision was saved.`
                : 'The comparative period selection changed after this statement revision was saved.'}
              affected={['Statement preview totals', 'Spreadsheet and PDF output derived from this revision', 'Any package that included this revision', 'Release readiness for this generation']}
              preserved={latestStatementRevision.reviewedByUserId
                ? `The independent review of v${latestStatementRevision.revision} by ${latestStatementRevision.reviewedByUserId} remains in history and is not erased.`
                : `v${latestStatementRevision.revision} remains readable as history; nothing has been deleted.`}
              required="Recalculate from the current source and mapping, save a new statement revision, then obtain a fresh independent review."
              actions={<button type="button" className="btn sm primary" disabled={!mappingReady} onClick={saveStatementRevision}>Recalculate and save a new revision</button>}
            />
          </div>
        )}
        <div className="caption mt8">{statementHistory.length ? statementHistory.map(item => `v${item.revision} ${item.status} · ${new Date(item.preparedAt).toLocaleString()}`).join(' | ') : 'No statement revisions saved.'}</div>
      </section>

      <section className="panel panel-pad" aria-label="Comparative period summary">
        <div className="between"><div><h3>Comparative Period</h3><p className="sub">Choose an earlier source period for this client and currency. Missing or unmapped periods remain unavailable.</p></div>
          <select className="input" aria-label="Comparative period" value={comparativeEngagement?.id || ''} onChange={e => { prototypeStore.staleStatementRevisionsForComparativeChange(selectedEng.id, e.target.value); setComparativeEngagementId(e.target.value); }} style={{ maxWidth: 320 }}>
            {priorPeriods.length ? priorPeriods.map(eng => <option key={eng.id} value={eng.id}>{eng.year} · {eng.period}</option>) : <option value="">No prior period</option>}
          </select>
        </div>
        {!mappingReady ? <p role="status" className="badge amber mt12">Current period unavailable until its mapping is independently approved.</p>
          : !comparativeEngagement ? <p role="status" className="badge amber mt12">Comparative period unavailable; no earlier source period exists for this client and currency.</p>
          : !priorMappingReady ? <p role="status" className="badge amber mt12">Comparative period unavailable; {comparativeEngagement.year} accounts lack a complete independently approved mapping. No zero amounts are substituted.</p>
          : priorBalanceSheet && priorIncomeStatement && <div className="tablewrap mt12"><table><thead><tr><th>Statement total</th><th>{selectedEng.year} current ({selectedEng.currency})</th><th>{comparativeEngagement.year} comparative ({selectedEng.currency})</th></tr></thead><tbody>
            {[["Total assets", bs.totalAssets, priorBalanceSheet.totalAssets], ["Total liabilities", bs.totalLiabilities, priorBalanceSheet.totalLiabilities], ["Total equity", bs.totalEquity, priorBalanceSheet.totalEquity], ["Revenue", is.revenue, priorIncomeStatement.revenue], ["Net profit", is.netProfit, priorIncomeStatement.netProfit]].map(([label, current, prior]) => <tr key={String(label)}><td>{label}</td><td>{formatCurrency(Number(current))}</td><td>{formatCurrency(Number(prior))}</td></tr>)}
          </tbody></table></div>}
      </section>

      <section className="panel panel-pad" aria-label="Statement layout editor">
        <div className="between wrap"><div><h3>Statement Layout &amp; Subtotals</h3><p className="sub">Version {layoutVersion} · Map every supported line to a statement group and order; defined subtotals sum only their selected lines. Saving a layout stales prior statement reviews and release approvals.</p></div>
          <button className="btn sm primary" disabled={!canEditLayout || !mappingReady || !configuredLayoutLines.length} onClick={saveLayoutRevision}>Save layout v{layoutVersion + 1}</button>
        </div>
        {layoutError && <p role="alert" className="badge danger mt12">{layoutError}</p>}
        {!mappingReady ? <p role="status" className="badge amber mt12">Approve a complete mapping before editing statement presentation.</p> : <>
          <details className="mt12" open>
            <summary>Configure mapped line grouping and order</summary>
            <div className="tablewrap mt8"><table><thead><tr><th>Statement</th><th>Mapped line</th><th>Group</th><th>Display order</th></tr></thead><tbody>
              {configuredLayoutLines.map((line, index) => <tr key={line.line}>
                <td>{line.statement === 'bs' ? 'Financial position' : 'Performance'}</td><td>{line.line}</td>
                <td><label className="sr-only" htmlFor={`layout-group-${index}`}>Group for {line.line}</label><input id={`layout-group-${index}`} className="input" aria-label={`Statement group ${line.line}`} disabled={!canEditLayout} value={line.group} onChange={event => setLayoutDraft(current => ({ ...current, lines: configuredLayoutLines.map(item => item.line === line.line ? { ...item, group: event.target.value } : item) }))} /></td>
                <td><label className="sr-only" htmlFor={`layout-order-${index}`}>Order for {line.line}</label><input id={`layout-order-${index}`} className="input" aria-label={`Statement order ${line.line}`} type="number" min="1" step="1" disabled={!canEditLayout} value={line.order} onChange={event => setLayoutDraft(current => ({ ...current, lines: configuredLayoutLines.map(item => item.line === line.line ? { ...item, order: Number(event.target.value) } : item) }))} /></td>
              </tr>)}
            </tbody></table></div>
          </details>
          <div className="between mt16"><div><h4>Custom subtotals</h4><p className="caption">Enter exact mapped line names separated by commas. A subtotal only includes lines from its selected statement.</p></div><button className="btn sm" disabled={!canEditLayout} onClick={() => setLayoutDraft(current => ({ ...current, lines: configuredLayoutLines, subtotals: [...configuredSubtotals, { id: crypto.randomUUID(), label: '', statement: 'is' as const, lineNames: [] }] }))}>Add subtotal</button></div>
          {configuredSubtotals.length > 0 && <div className="tablewrap mt8"><table><thead><tr><th>Subtotal label</th><th>Statement</th><th>Included line names</th><th>Current</th><th>Comparative</th><th></th></tr></thead><tbody>
            {subtotalRows.map(row => <tr key={row.id}>
              <td><input className="input" aria-label={`Subtotal label ${row.id}`} disabled={!canEditLayout} value={row.label} onChange={event => setLayoutDraft(current => ({ ...current, lines: configuredLayoutLines, subtotals: configuredSubtotals.map(item => item.id === row.id ? { ...item, label: event.target.value } : item) }))} /></td>
              <td><select className="input" aria-label={`Subtotal statement ${row.id}`} disabled={!canEditLayout} value={row.statement} onChange={event => setLayoutDraft(current => ({ ...current, lines: configuredLayoutLines, subtotals: configuredSubtotals.map(item => item.id === row.id ? { ...item, statement: event.target.value as 'bs' | 'is' } : item) }))}><option value="bs">Financial position</option><option value="is">Performance</option></select></td>
              <td><input className="input" aria-label={`Subtotal lines ${row.id}`} disabled={!canEditLayout} value={row.lineNames.join(', ')} onChange={event => setLayoutDraft(current => ({ ...current, lines: configuredLayoutLines, subtotals: configuredSubtotals.map(item => item.id === row.id ? { ...item, lineNames: event.target.value.split(',') } : item) }))} /></td>
              <td>{formatCurrency(row.current, selectedEng.currency)}</td><td>{row.comparative === undefined ? 'Unavailable' : formatCurrency(row.comparative, selectedEng.currency)}</td>
              <td><button className="btn sm ghost" aria-label={`Remove subtotal ${row.label || row.id}`} onClick={() => setLayoutDraft(current => ({ ...current, lines: configuredLayoutLines, subtotals: configuredSubtotals.filter(item => item.id !== row.id) }))}>Remove</button></td>
            </tr>)}
          </tbody></table></div>}
          <div className="tablewrap mt16"><table aria-label="Configured financial statement layout preview"><thead><tr><th>Statement group</th><th>Line / source accounts</th><th>Current ({selectedEng.currency})</th><th>Comparative ({comparativeEngagement?.year ?? 'unavailable'})</th></tr></thead><tbody>
            {orderedLineRows.map((row, index) => <React.Fragment key={row.line}>{index === 0 || orderedLineRows[index - 1].statement !== row.statement || orderedLineRows[index - 1].group !== row.group ? <tr><th colSpan={4}>{row.statement === 'bs' ? 'Financial position' : 'Performance'} · {row.group}</th></tr> : null}<tr><td>{row.group}</td><td>{row.line} <span className="caption">· Sources {row.currentSources}</span></td><td>{formatCurrency(row.current, selectedEng.currency)}</td><td>{comparativeReady ? formatCurrency(row.prior, selectedEng.currency) : 'Unavailable'}</td></tr></React.Fragment>)}
            {subtotalRows.map(row => <tr key={row.id}><td>Subtotal</td><td><b>{row.label}</b> <span className="caption">· {row.lineNames.join(', ')}</span></td><td><b>{formatCurrency(row.current, selectedEng.currency)}</b></td><td>{row.comparative === undefined ? 'Unavailable' : formatCurrency(row.comparative, selectedEng.currency)}</td></tr>)}
          </tbody></table></div>
        </>}
      </section>

      {adjustmentResult.unapplied.length > 0 && <div role="status" className="badge danger" style={{ display: 'block', padding: 12 }}>
        Some management-accepted adjustments were excluded because their source reflection or account mapping needs review: {adjustmentResult.unapplied.map(item => `${item.journalId}: ${item.reason}`).join(' ')}
      </div>}
      <div className="caption">Accepted, unreflected adjustments included: {adjustmentResult.applied.join(', ') || 'None'}. Reflected or unapproved journals are excluded.</div>

      {/* Statement Select Tabs */}
      <div className="tabs">
        <button className={`tab-btn ${statementType === 'bs' ? 'active' : ''}`} onClick={() => setStatementType('bs')}>
          Statement of Financial Position (Balance Sheet)
        </button>
        <button className={`tab-btn ${statementType === 'is' ? 'active' : ''}`} onClick={() => setStatementType('is')}>
          Statement of Comprehensive Income (P&L)
        </button>
        <button className={`tab-btn ${statementType === 'equity' ? 'active' : ''}`} onClick={() => setStatementType('equity')}>
          Statement of Changes in Equity
        </button>
        <button className={`tab-btn ${statementType === 'cashflow' ? 'active' : ''}`} onClick={() => setStatementType('cashflow')}>
          Statement of Cash Flows
        </button>
      </div>

      {/* 1: Balance Sheet */}
      {statementType === 'bs' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel-pad" style={{ background: bs.isBalanced ? '#f0fdf4' : '#fef2f2' }}>
            <div className="between">
              <div>
                <b>{bs.isBalanced ? 'Balance Sheet Equation Balanced: Assets = Liabilities + Equity' : 'Balance Sheet Discrepancy Detected!'}</b>
                <p className="sub" style={{ fontSize: 13, marginTop: 4 }}>
                  Assets: {formatCurrency(bs.totalAssets)} · Liabilities + Equity: {formatCurrency(bs.totalLiabilities + bs.totalEquity)} · Difference: {formatCurrency(bs.difference)}
                </p>
              </div>
              <span className={`badge ${bs.isBalanced ? 'green' : 'amber'}`}>
                {bs.isBalanced ? 'Balanced' : 'Imbalance'}
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Line Item / Account Classification</th>
                    <th>Account Code</th>
                    <th style={{ textAlign: 'right' }}>Amount ({selectedEng.currency})</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: '#f8fafc' }}><td colSpan={3}><b>ASSETS</b></td></tr>
                  {bs.assets.map((a: TrialBalanceRow) => (
                    <tr key={a.code}>
                      <td style={{ paddingLeft: 24 }}>{a.name} <span className="caption">· Source {a.code.split(' → ')[0]} · Mapping {a.mappedStatementLine || 'legacy'}</span></td>
                      <td><span className="mono">{a.code}</span></td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(a.balance)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2}><b>Total Assets</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(bs.totalAssets)}</b></td>
                  </tr>

                  <tr style={{ background: '#f8fafc' }}><td colSpan={3}><b>LIABILITIES</b></td></tr>
                  {bs.liabilities.map((l: TrialBalanceRow) => (
                    <tr key={l.code}>
                      <td style={{ paddingLeft: 24 }}>{l.name} <span className="caption">· Source {l.code.split(' → ')[0]} · Mapping {l.mappedStatementLine || 'legacy'}</span></td>
                      <td><span className="mono">{l.code}</span></td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(-l.balance, selectedEng.currency)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2}><b>Total Liabilities</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(bs.totalLiabilities)}</b></td>
                  </tr>

                  <tr style={{ background: '#f8fafc' }}><td colSpan={3}><b>EQUITY</b></td></tr>
                  {bs.equity.map((e: TrialBalanceRow) => (
                    <tr key={e.code}>
                      <td style={{ paddingLeft: 24 }}>{e.name} <span className="caption">· Source {e.code.split(' → ')[0]} · Mapping {e.mappedStatementLine || 'legacy'}</span></td>
                      <td><span className="mono">{e.code}</span></td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(-e.balance, selectedEng.currency)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ paddingLeft: 24 }}>Current-period profit / (loss)</td>
                    <td>—</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(bs.currentPeriodResult)}</td>
                  </tr>
                  <tr>
                    <td colSpan={2}><b>Total Equity</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(bs.totalEquity)}</b></td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}><b>Total Liabilities and Equity</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(bs.totalLiabilities + bs.totalEquity)}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2: Income Statement */}
      {statementType === 'is' && (
        <div className="panel">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Operating Category</th>
                  <th style={{ textAlign: 'right' }}>Amount ({selectedEng.currency})</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Revenue from Contracts with Customers</b></td>
                  <td style={{ textAlign: 'right' }}><b>{formatCurrency(is.revenue)}</b></td>
                </tr>
                <tr>
                  <td style={{ paddingLeft: 24 }}>Cost of Sales</td>
                  <td style={{ textAlign: 'right' }}>({formatCurrency(is.costOfSales)})</td>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <td><b>Gross Profit</b></td>
                  <td style={{ textAlign: 'right' }}><b>{formatCurrency(is.grossProfit)}</b></td>
                </tr>
                <tr>
                  <td style={{ paddingLeft: 24 }}>General & Administrative Expenses</td>
                  <td style={{ textAlign: 'right' }}>({formatCurrency(is.operatingExpenses)})</td>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <td><b>Operating Profit (EBIT)</b></td>
                  <td style={{ textAlign: 'right' }}><b>{formatCurrency(is.netProfit)}</b></td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Net Profit for the Year Attributable to Owners</b></td>
                  <td style={{ textAlign: 'right' }}><b>{formatCurrency(is.netProfit)}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 3: Statement of Changes in Equity */}
      {statementType === 'equity' && (
        <section className="panel panel-pad" aria-label="Statement of Changes in Equity">
          <h3>Statement of Changes in Equity</h3>
          {!equityScheduleReady ? <p role="status" className="badge amber mt12" style={{ display: 'block', padding: 12 }}>
            Statement of Changes in Equity is unavailable: enter opening total equity and evidence-backed contributions/distributions in the movement schedule, then obtain independent review. No equity figures are substituted.
          </p> : <div className="tablewrap mt12"><table><thead><tr><th>Movement</th><th>Amount ({selectedEng.currency})</th><th>Evidence</th></tr></thead><tbody>
            <tr><td>Opening total equity</td><td>{formatCurrency(currentCashFlowRevision!.openingEquity!, selectedEng.currency)}</td><td>Prior-period balance entered for this schedule</td></tr>
            {equityMovementLines.map(item => <tr key={item.id}><td>{item.category}: {item.description}</td><td>{formatCurrency(item.amount, selectedEng.currency)}</td><td>{item.evidenceRef}</td></tr>)}
            <tr><td>Current-period result</td><td>{formatCurrency(is.netProfit, selectedEng.currency)}</td><td>Current mapped statement result</td></tr>
            <tr><th>Closing total equity</th><th>{formatCurrency(equityClosing, selectedEng.currency)}</th><th>Agrees to approved mapped trial balance</th></tr>
          </tbody></table><p className="caption mt8">Total equity only. The combined Share capital and reserves mapping does not support component-level balances.</p></div>}
        </section>
      )}

      {/* 4: Statement of Cash Flows */}
      {statementType === 'cashflow' && (
        <section className="panel panel-pad" aria-label="Statement of Cash Flows">
          <div className="between"><div><h3>Statement of Cash Flows</h3><p className="sub">Enter supported movements from scoped evidence. Non-cash items are disclosed separately and excluded from the cash reconciliation.</p></div>
            <div className="row" style={{ gap: 8 }}>
              {currentCashFlowRevision?.status === 'Draft' && cashFlowCurrent && <button className="btn sm primary" onClick={reviewCashFlow}>Review schedule v{currentCashFlowRevision.revision}</button>}
              <button className="btn sm ghost" disabled={!mappingReady} onClick={saveCashFlow}>Save movement revision</button>
            </div>
          </div>
          {!mappingReady && <div role="status" className="badge amber mt12" style={{ display: 'block', padding: 12 }}>An approved complete account mapping is required before preparing cash flows.</div>}
          {cashFlowError && <p role="alert" className="badge danger mt12">{cashFlowError}</p>}
          {currentCashFlowRevision && <p role="status" className="mt12">Latest schedule v{currentCashFlowRevision.revision} · {cashFlowCurrent ? currentCashFlowRevision.status : 'Stale'} · prepared by {currentCashFlowRevision.preparedByUserId}{currentCashFlowRevision.reviewedByUserId ? ` · reviewed by ${currentCashFlowRevision.reviewedByUserId}` : ''}</p>}
          <div className="grid2 mt12">
            <label className="caption">Opening cash ({selectedEng.currency})<input className="input mt4" type="number" step="0.01" min="0" aria-label="Opening cash" value={cashFlowDraft.openingCash} onChange={event => setCashFlowDraft(current => ({ ...current, openingCash: Number(event.target.value) }))} /></label>
            <label className="caption">Closing cash ({selectedEng.currency})<input className="input mt4" type="number" step="0.01" min="0" aria-label="Closing cash" value={cashFlowDraft.closingCash} onChange={event => setCashFlowDraft(current => ({ ...current, closingCash: Number(event.target.value) }))} /></label>
            <label className="caption">Opening total equity ({selectedEng.currency})<input className="input mt4" type="number" step="0.01" min="0" aria-label="Opening total equity" value={cashFlowDraft.openingEquity} onChange={event => setCashFlowDraft(current => ({ ...current, openingEquity: Number(event.target.value) }))} /></label>
          </div>
          <p className="caption">Equity contributions and distributions are shown in the Changes in Equity statement after this schedule is independently reviewed and reconciles to the mapped trial balance.</p>
          <div className="tablewrap mt12"><table><thead><tr><th>Movement</th><th>Classification</th><th>Amount ({selectedEng.currency})</th><th>Evidence document ID</th><th></th></tr></thead><tbody>
            {cashFlowDraft.movements.map(item => <tr key={item.id}>
              <td><input className="input" aria-label={`Movement description ${item.id}`} value={item.description} onChange={event => updateCashFlowMovement(item.id, { description: event.target.value })} /></td>
              <td><select className="input" aria-label={`Movement category ${item.id}`} value={item.category} onChange={event => updateCashFlowMovement(item.id, { category: event.target.value as CashFlowScheduleRevision['movements'][number]['category'] })}>{['Operating', 'Investing', 'Financing', 'Equity contribution', 'Equity distribution', 'Non-cash'].map(category => <option key={category}>{category}</option>)}</select></td>
              <td><input className="input" aria-label={`Movement amount ${item.id}`} type="number" step="0.01" value={item.amount} onChange={event => updateCashFlowMovement(item.id, { amount: Number(event.target.value) })} /></td>
              <td><input className="input" aria-label={`Movement evidence ${item.id}`} value={item.evidenceRef} onChange={event => updateCashFlowMovement(item.id, { evidenceRef: event.target.value })} /></td>
              <td><button className="btn sm ghost" aria-label={`Remove movement ${item.id}`} onClick={() => setCashFlowDraft(current => ({ ...current, movements: current.movements.filter(movement => movement.id !== item.id) }))}>Remove</button></td>
            </tr>)}
          </tbody></table></div>
          <button className="btn sm ghost mt8" onClick={() => setCashFlowDraft(current => ({ ...current, movements: [...current.movements, { id: crypto.randomUUID(), description: '', category: 'Operating', amount: 0, evidenceRef: '' }] }))}>Add movement</button>
          <div className="grid3 mt12">
            <div className="borderbox panel-pad"><span className="caption">Cash movement (non-cash excluded)</span><b className="block mt4">{formatCurrency(cashFlowDraft.movements.filter(item => item.category !== 'Non-cash').reduce((sum, item) => sum + item.amount, 0))}</b></div>
            <div className="borderbox panel-pad"><span className="caption">Calculated closing cash</span><b className="block mt4">{formatCurrency(cashFlowDraft.openingCash + cashFlowDraft.movements.filter(item => item.category !== 'Non-cash').reduce((sum, item) => sum + item.amount, 0))}</b></div>
            <div className="borderbox panel-pad"><span className="caption">Approved mapped TB cash</span><b className="block mt4">{formatCurrency(mappedAccounts.flatMap(mapping => mapping.targets.filter(target => target.statementLine === 'Cash and cash equivalents').map(target => (selectedEng.rows.find(row => row.code === mapping.accountCode)?.balance || 0) * target.percentage / 100)).reduce((sum, amount) => sum + amount, 0))}</b></div>
          </div>
          {cashFlowHistory.length > 0 && <div className="caption mt12">History: {cashFlowHistory.map(item => `v${item.revision} ${item.status} · ${new Date(item.preparedAt).toLocaleString()}`).join(' | ')}</div>}
        </section>
      )}
    </div>
  );
};
