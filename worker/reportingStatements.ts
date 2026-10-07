export type ReportingStatementLine = {
  code: string;
  name: string;
  statement: string;
  category: string;
  current_adjusted_minor: number | string;
  prior_minor: number | string | null;
};

export type ReportingStatementRow = { label: string; current: string; comparative?: string };
export type ReportingStatementProjection = { balanceSheetRows: ReportingStatementRow[]; profitLossRows: ReportingStatementRow[] };

function money(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `QAR ${value < 0n ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

/** Projects approved statement lines and checks both current and complete comparative cross-casts. */
export function buildReportingStatementProjection(lines: ReportingStatementLine[]): ReportingStatementProjection {
  if (!lines.length) throw new Error('The approved statement snapshot contains no presentation lines.');
  const sum = (predicate: (line: ReportingStatementLine) => boolean, field: 'current_adjusted_minor' | 'prior_minor') =>
    lines.filter(predicate).reduce((total, line) => total + BigInt(String(line[field] ?? 0)), 0n);
  const categoryTotal = (statement: string, category: string, field: 'current_adjusted_minor' | 'prior_minor') =>
    sum(line => line.statement === statement && line.category === category, field);
  const rowsFor = (statement: string): ReportingStatementRow[] => lines.filter(line => line.statement === statement).map(line => ({
    label: `${line.code} · ${line.name}`,
    current: money(BigInt(String(line.current_adjusted_minor))),
    ...(line.prior_minor === null ? {} : { comparative: money(BigInt(String(line.prior_minor))) })
  }));
  const totalRow = (label: string, current: bigint, comparative: bigint | null): ReportingStatementRow => ({
    label,
    current: money(current),
    ...(comparative === null ? {} : { comparative: money(comparative) })
  });

  const assets = categoryTotal('BALANCE_SHEET', 'ASSET', 'current_adjusted_minor');
  const liabilities = categoryTotal('BALANCE_SHEET', 'LIABILITY', 'current_adjusted_minor');
  const equity = categoryTotal('BALANCE_SHEET', 'EQUITY', 'current_adjusted_minor');
  const revenue = categoryTotal('PROFIT_LOSS', 'REVENUE', 'current_adjusted_minor');
  const expenses = categoryTotal('PROFIT_LOSS', 'EXPENSE', 'current_adjusted_minor');
  const currentResult = revenue - expenses;
  if (assets !== liabilities + equity + currentResult) {
    throw new Error('The approved financial statement snapshot does not cross-cast to zero.');
  }

  const hasComparatives = lines.every(line => line.prior_minor !== null);
  const comparativeTotals = hasComparatives ? {
    assets: categoryTotal('BALANCE_SHEET', 'ASSET', 'prior_minor'),
    liabilities: categoryTotal('BALANCE_SHEET', 'LIABILITY', 'prior_minor'),
    equity: categoryTotal('BALANCE_SHEET', 'EQUITY', 'prior_minor'),
    revenue: categoryTotal('PROFIT_LOSS', 'REVENUE', 'prior_minor'),
    expenses: categoryTotal('PROFIT_LOSS', 'EXPENSE', 'prior_minor')
  } : null;
  const priorResult = comparativeTotals ? comparativeTotals.revenue - comparativeTotals.expenses : null;
  if (comparativeTotals && comparativeTotals.assets !== comparativeTotals.liabilities + comparativeTotals.equity + priorResult!) {
    throw new Error('The approved comparative financial statement snapshot does not cross-cast to zero.');
  }

  const balanceSheetRows = [
    ...rowsFor('BALANCE_SHEET'),
    totalRow('Total assets', assets, comparativeTotals?.assets ?? null),
    totalRow('Total liabilities', liabilities, comparativeTotals?.liabilities ?? null),
    totalRow('Total equity, including current-period result', equity + currentResult,
      comparativeTotals ? comparativeTotals.equity + priorResult! : null),
    totalRow('Total liabilities and equity', liabilities + equity + currentResult,
      comparativeTotals ? comparativeTotals.liabilities + comparativeTotals.equity + priorResult! : null)
  ];
  const profitLossRows = [
    ...rowsFor('PROFIT_LOSS'),
    totalRow('Total revenue', revenue, comparativeTotals?.revenue ?? null),
    totalRow('Total expenses', expenses, comparativeTotals?.expenses ?? null),
    totalRow('Profit or (loss) for the period', currentResult, priorResult)
  ];
  return { balanceSheetRows, profitLossRows };
}
