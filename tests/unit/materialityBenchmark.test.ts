// US-GAP-09 (P0) regression: the profit-before-tax (PBT) materiality benchmark
// must not be reduced by the income-tax expense FSLI.
//
// At the reviewed commit PBT summed every PROFIT_LOSS FSLI, including
// INCOME_TAX, so the benchmark was profit AFTER tax. benchmarkContributingLines
// selects the benchmark population; these tests pin its exact behaviour.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkContributingLines } from '../../worker/businessTb.js';

const lines = [
  { code: 'REVENUE', statement: 'PROFIT_LOSS', category: 'REVENUE' },
  { code: 'COST_OF_SALES', statement: 'PROFIT_LOSS', category: 'EXPENSE' },
  { code: 'ADMIN_EXPENSE', statement: 'PROFIT_LOSS', category: 'EXPENSE' },
  { code: 'INCOME_TAX', statement: 'PROFIT_LOSS', category: 'EXPENSE' },
  { code: 'CASH', statement: 'BALANCE_SHEET', category: 'ASSET' },
  { code: 'EQUITY', statement: 'BALANCE_SHEET', category: 'EQUITY' }
];

describe('materiality benchmark contribution (US-GAP-09)', () => {
  it('excludes the income-tax FSLI from the profit-before-tax benchmark', () => {
    const codes = benchmarkContributingLines(lines, 'PBT').map(row => row.code);
    assert.deepEqual(codes, ['REVENUE', 'COST_OF_SALES', 'ADMIN_EXPENSE']);
    assert.ok(!codes.includes('INCOME_TAX'), 'income tax must never reduce profit before tax');
  });

  it('keeps the revenue, total-asset and equity benchmark populations intact', () => {
    assert.deepEqual(benchmarkContributingLines(lines, 'REVENUE').map(row => row.code), ['REVENUE']);
    assert.deepEqual(benchmarkContributingLines(lines, 'TOTAL_ASSETS').map(row => row.code), ['CASH']);
    assert.deepEqual(benchmarkContributingLines(lines, 'EQUITY').map(row => row.code), ['EQUITY']);
  });
});
