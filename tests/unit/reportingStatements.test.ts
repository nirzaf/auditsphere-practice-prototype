import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildReportingStatementProjection, type ReportingStatementLine } from '../../worker/reportingStatements.js';

const balancedLines: ReportingStatementLine[] = [
  { code: 'QA-ASSET', name: 'Synthetic assets', statement: 'BALANCE_SHEET', category: 'ASSET', current_adjusted_minor: 190000, prior_minor: 175000 },
  { code: 'QA-EQUITY', name: 'Synthetic equity', statement: 'BALANCE_SHEET', category: 'EQUITY', current_adjusted_minor: 100000, prior_minor: 100000 },
  { code: 'QA-REV', name: 'Synthetic revenue', statement: 'PROFIT_LOSS', category: 'REVENUE', current_adjusted_minor: 120000, prior_minor: 100000 },
  { code: 'QA-CONTRA', name: 'Synthetic contra-revenue', statement: 'PROFIT_LOSS', category: 'REVENUE', current_adjusted_minor: -20000, prior_minor: -20000 },
  { code: 'QA-EXP', name: 'Synthetic expense', statement: 'PROFIT_LOSS', category: 'EXPENSE', current_adjusted_minor: 10000, prior_minor: 5000 }
];

it('US-REP-003 renders signed current and comparative totals after cross-casting both periods', () => {
  const projection = buildReportingStatementProjection(balancedLines);
  const balanceTotal = projection.balanceSheetRows.find(row => row.label === 'Total assets');
  const closingEquity = projection.balanceSheetRows.find(row => row.label === 'Total equity, including current-period result');
  const plRevenue = projection.profitLossRows.find(row => row.label === 'Total revenue');
  const plResult = projection.profitLossRows.find(row => row.label === 'Profit or (loss) for the period');

  assert.deepEqual(balanceTotal, { label: 'Total assets', current: 'QAR 1900.00', comparative: 'QAR 1750.00' });
  assert.deepEqual(closingEquity, { label: 'Total equity, including current-period result', current: 'QAR 1900.00', comparative: 'QAR 1750.00' });
  assert.deepEqual(plRevenue, { label: 'Total revenue', current: 'QAR 1000.00', comparative: 'QAR 800.00' });
  assert.deepEqual(plResult, { label: 'Profit or (loss) for the period', current: 'QAR 900.00', comparative: 'QAR 750.00' });
  assert.ok(projection.profitLossRows.some(row => row.label === 'QA-CONTRA · Synthetic contra-revenue' && row.current === 'QAR -200.00'));
});

it('US-REP-003 fails closed when either current or available comparative balances do not cross-cast', () => {
  assert.throws(() => buildReportingStatementProjection(balancedLines.map(line =>
    line.code === 'QA-ASSET' ? { ...line, current_adjusted_minor: Number(line.current_adjusted_minor) + 1 } : line
  )), /approved financial statement snapshot does not cross-cast/);
  assert.throws(() => buildReportingStatementProjection(balancedLines.map(line =>
    line.code === 'QA-ASSET' ? { ...line, prior_minor: Number(line.prior_minor) + 1 } : line
  )), /comparative financial statement snapshot does not cross-cast/);
});

it('US-REP-003 does not invent comparative totals when one source line has no comparative balance', () => {
  const projection = buildReportingStatementProjection(balancedLines.map(line => ({ ...line, prior_minor: null })));
  assert.deepEqual(projection.balanceSheetRows.find(row => row.label === 'Total assets'), {
    label: 'Total assets', current: 'QAR 1900.00'
  });
  assert.deepEqual(projection.profitLossRows.find(row => row.label === 'Profit or (loss) for the period'), {
    label: 'Profit or (loss) for the period', current: 'QAR 900.00'
  });
});
