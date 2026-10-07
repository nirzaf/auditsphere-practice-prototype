// Firm expense category → ledger account mapping (US-GAP-24, R50).
//
// The Worker's `expense.create` command stores the chosen category and posts to the
// supplied expense-type debit account. The firm chart of accounts seeded by
// `worker/migrations/0021_practice_management.sql` provides one expense account per
// operating category, so the UI derives the appropriate debit account from the
// operator's category selection instead of hardcoding a single overhead account.

export type FirmExpenseCategory = 'RENT' | 'SALARIES_BENEFITS' | 'OVERHEAD' | 'PETTY_CASH' | 'OTHER';

export const FIRM_EXPENSE_CATEGORY_ACCOUNTS: Record<FirmExpenseCategory, { code: string; label: string }> = {
  RENT: { code: '5000', label: 'Rent Expense' },
  SALARIES_BENEFITS: { code: '5100', label: 'Salaries and Benefits' },
  OVERHEAD: { code: '5200', label: 'Operating Overheads' },
  PETTY_CASH: { code: '5300', label: 'Petty Cash Expense' },
  // `OTHER` has no dedicated seeded account; it falls back to operating overheads and
  // remains an explicit, visible choice rather than a silent default.
  OTHER: { code: '5200', label: 'Operating Overheads' }
};

/** Returns the chart-of-accounts code that should carry the given expense category. */
export function expenseAccountCodeForCategory(category: FirmExpenseCategory): string {
  return FIRM_EXPENSE_CATEGORY_ACCOUNTS[category].code;
}
