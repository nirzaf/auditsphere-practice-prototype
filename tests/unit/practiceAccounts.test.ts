// US-GAP-24 (R50) regression: the firm expense UI derives the correct debit account
// from the selected operating category instead of hardcoding one overhead account.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  expenseAccountCodeForCategory,
  FIRM_EXPENSE_CATEGORY_ACCOUNTS,
  type FirmExpenseCategory
} from '../../src/services/practiceAccounts.js';

describe('firm expense account mapping (US-GAP-24)', () => {
  it('maps every supported category to a distinct seeded expense account', () => {
    assert.equal(expenseAccountCodeForCategory('RENT'), '5000');
    assert.equal(expenseAccountCodeForCategory('SALARIES_BENEFITS'), '5100');
    assert.equal(expenseAccountCodeForCategory('OVERHEAD'), '5200');
    assert.equal(expenseAccountCodeForCategory('PETTY_CASH'), '5300');
  });

  it('falls back to operating overheads for the explicit OTHER category', () => {
    assert.equal(expenseAccountCodeForCategory('OTHER'), '5200');
  });

  it('covers exactly the five category values persisted by expense.create', () => {
    const categories: FirmExpenseCategory[] = ['RENT', 'SALARIES_BENEFITS', 'OVERHEAD', 'PETTY_CASH', 'OTHER'];
    assert.deepEqual(Object.keys(FIRM_EXPENSE_CATEGORY_ACCOUNTS).sort(), [...categories].sort());
    for (const category of categories) assert.match(expenseAccountCodeForCategory(category), /^\d{4}$/);
  });
});
