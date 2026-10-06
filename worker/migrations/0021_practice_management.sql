-- Practice management and firm bookkeeping are separate from client audit balances.

CREATE TABLE firm_charge_out_rates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  grade TEXT NOT NULL CHECK (grade IN ('PARTNER','MANAGER','SENIOR','ASSOCIATE')),
  hourly_minor INTEGER NOT NULL CHECK (hourly_minor BETWEEN 0 AND 9007199254740991),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  revision INTEGER NOT NULL CHECK (revision>0),
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256)=64),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,grade,revision),
  UNIQUE (workspace_id,grade,effective_from),
  CHECK (effective_to IS NULL OR effective_to>=effective_from)
);
CREATE TRIGGER firm_charge_out_rates_no_update BEFORE UPDATE ON firm_charge_out_rates BEGIN SELECT RAISE(ABORT,'charge-out rate history is append only'); END;
CREATE TRIGGER firm_charge_out_rates_no_delete BEFORE DELETE ON firm_charge_out_rates BEGIN SELECT RAISE(ABORT,'charge-out rate history is append only'); END;

CREATE TABLE firm_time_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version>0),
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  staff_member_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('COMMERCIAL','PLANNING','FIELDWORK','REVIEW','REPORTING','ARCHIVE')),
  fsli_id TEXT,
  procedure_id TEXT,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
  start_at TEXT,
  end_at TEXT,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 5000),
  billable INTEGER NOT NULL CHECK (billable IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','RETURNED','REVERSED')),
  rate_id TEXT,
  hourly_minor_snapshot INTEGER,
  charge_numerator TEXT,
  charge_denominator INTEGER,
  submitted_by_actor_id TEXT,
  submitted_at TEXT,
  approved_by_actor_id TEXT,
  approved_at TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,staff_member_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fsli_id) REFERENCES fsli_catalog(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,procedure_id) REFERENCES procedures(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,rate_id) REFERENCES firm_charge_out_rates(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,submitted_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK ((start_at IS NULL AND end_at IS NULL) OR (start_at IS NOT NULL AND end_at IS NOT NULL AND start_at<end_at)),
  CHECK ((status='DRAFT' AND rate_id IS NULL AND hourly_minor_snapshot IS NULL AND submitted_at IS NULL AND approved_at IS NULL)
      OR (status IN ('SUBMITTED','RETURNED') AND rate_id IS NOT NULL AND hourly_minor_snapshot IS NOT NULL AND submitted_at IS NOT NULL AND approved_at IS NULL)
      OR (status IN ('APPROVED','REVERSED') AND rate_id IS NOT NULL AND hourly_minor_snapshot IS NOT NULL AND submitted_at IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX firm_time_entries_period_idx ON firm_time_entries(workspace_id,staff_member_id,work_date,status);
CREATE TRIGGER firm_time_entries_approved_immutable BEFORE UPDATE ON firm_time_entries WHEN OLD.status IN ('APPROVED','REVERSED')
BEGIN SELECT RAISE(ABORT,'approved time entries are immutable; record a correction'); END;
CREATE TRIGGER firm_time_entries_no_delete BEFORE DELETE ON firm_time_entries BEGIN SELECT RAISE(ABORT,'time entry history cannot be deleted'); END;

CREATE TABLE firm_time_corrections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  original_time_entry_id TEXT NOT NULL,
  replacement_time_entry_id TEXT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 5000),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,original_time_entry_id) REFERENCES firm_time_entries(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,replacement_time_entry_id) REFERENCES firm_time_entries(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,original_time_entry_id)
);
CREATE TRIGGER firm_time_corrections_no_update BEFORE UPDATE ON firm_time_corrections BEGIN SELECT RAISE(ABORT,'time corrections are append only'); END;
CREATE TRIGGER firm_time_corrections_no_delete BEFORE DELETE ON firm_time_corrections BEGIN SELECT RAISE(ABORT,'time corrections are append only'); END;

CREATE TABLE utilization_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  staff_member_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  scheduled_minutes INTEGER NOT NULL CHECK (scheduled_minutes>=0),
  leave_minutes INTEGER NOT NULL CHECK (leave_minutes>=0),
  available_minutes INTEGER NOT NULL CHECK (available_minutes>=0),
  approved_billable_minutes INTEGER NOT NULL CHECK (approved_billable_minutes>=0),
  approved_nonbillable_minutes INTEGER NOT NULL CHECK (approved_nonbillable_minutes>=0),
  utilization_numerator INTEGER,
  utilization_denominator INTEGER,
  result_reason TEXT NOT NULL CHECK (result_reason IN ('CALCULATED','ZERO_AVAILABILITY','MISSING_CAPACITY')),
  missing_capacity_dates_json TEXT NOT NULL CHECK (json_valid(missing_capacity_dates_json)),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  calculated_by_actor_id TEXT NOT NULL,
  calculated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,staff_member_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,calculated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK ((result_reason='CALCULATED' AND utilization_numerator IS NOT NULL AND utilization_denominator>0)
      OR (result_reason<>'CALCULATED' AND utilization_numerator IS NULL AND utilization_denominator IS NULL)),
  CHECK (period_start<=period_end)
);
CREATE TRIGGER utilization_snapshots_no_update BEFORE UPDATE ON utilization_snapshots BEGIN SELECT RAISE(ABORT,'utilization snapshots are append only'); END;
CREATE TRIGGER utilization_snapshots_no_delete BEFORE DELETE ON utilization_snapshots BEGIN SELECT RAISE(ABORT,'utilization snapshots are append only'); END;

CREATE TABLE engagement_budgets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  fee_proposal_version_id TEXT NOT NULL,
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,fee_proposal_version_id) REFERENCES proposal_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,engagement_id,revision)
);
CREATE TABLE engagement_budget_phases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('COMMERCIAL','PLANNING','FIELDWORK','REVIEW','REPORTING','ARCHIVE')),
  grade TEXT NOT NULL CHECK (grade IN ('PARTNER','MANAGER','SENIOR','ASSOCIATE')),
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes>=0),
  rate_id TEXT NOT NULL,
  hourly_minor_snapshot INTEGER NOT NULL CHECK (hourly_minor_snapshot>=0),
  FOREIGN KEY (workspace_id,budget_id) REFERENCES engagement_budgets(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,rate_id) REFERENCES firm_charge_out_rates(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,budget_id,phase,grade)
);
CREATE TRIGGER engagement_budgets_no_update BEFORE UPDATE ON engagement_budgets BEGIN SELECT RAISE(ABORT,'approved engagement budgets are immutable'); END;
CREATE TRIGGER engagement_budgets_no_delete BEFORE DELETE ON engagement_budgets BEGIN SELECT RAISE(ABORT,'approved engagement budgets are immutable'); END;
CREATE TRIGGER engagement_budget_phases_no_update BEFORE UPDATE ON engagement_budget_phases BEGIN SELECT RAISE(ABORT,'approved budget phase lines are immutable'); END;
CREATE TRIGGER engagement_budget_phases_no_delete BEFORE DELETE ON engagement_budget_phases BEGIN SELECT RAISE(ABORT,'approved budget phase lines are immutable'); END;

CREATE TABLE profitability_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  as_of TEXT NOT NULL,
  fee_minor INTEGER NOT NULL CHECK (fee_minor>=0),
  approved_minutes INTEGER NOT NULL CHECK (approved_minutes>=0),
  charge_out_numerator TEXT NOT NULL,
  charge_out_denominator TEXT NOT NULL CHECK (charge_out_denominator='60'),
  charge_out_value_minor INTEGER NOT NULL CHECK (charge_out_value_minor>=0),
  profitability_minor INTEGER NOT NULL,
  phase_snapshot_json TEXT NOT NULL CHECK (json_valid(phase_snapshot_json)),
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  calculated_by_actor_id TEXT NOT NULL,
  calculated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,budget_id) REFERENCES engagement_budgets(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,calculated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TRIGGER profitability_snapshots_no_update BEFORE UPDATE ON profitability_snapshots BEGIN SELECT RAISE(ABORT,'profitability snapshots are append only'); END;
CREATE TRIGGER profitability_snapshots_no_delete BEFORE DELETE ON profitability_snapshots BEGIN SELECT RAISE(ABORT,'profitability snapshots are append only'); END;

CREATE TABLE firm_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 40),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  account_type TEXT NOT NULL CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  parent_account_id TEXT,
  normal_side TEXT NOT NULL CHECK (normal_side IN ('DEBIT','CREDIT')),
  posting_allowed INTEGER NOT NULL CHECK (posting_allowed IN (0,1)),
  active INTEGER NOT NULL CHECK (active IN (0,1)),
  control_type TEXT NOT NULL DEFAULT 'NONE' CHECK (control_type IN ('NONE','BANK','CASH','AR','AP','CONTRACT_LIABILITY','UNALLOCATED_RECEIPTS','PARTNER_CAPITAL','PARTNER_DRAWINGS')),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,parent_account_id) REFERENCES firm_accounts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,code),
  CHECK (posting_allowed=0 OR parent_account_id IS NULL OR account_type IS NOT NULL)
);
CREATE UNIQUE INDEX firm_accounts_control_unique ON firm_accounts(workspace_id,control_type) WHERE control_type<>'NONE';

CREATE TABLE accounting_periods (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED')),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_by_actor_id TEXT,
  closed_at TEXT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,closed_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,start_date),
  CHECK (start_date<=end_date),
  CHECK ((status='OPEN' AND closed_by_actor_id IS NULL AND closed_at IS NULL) OR (status='CLOSED' AND closed_by_actor_id IS NOT NULL AND closed_at IS NOT NULL))
);
CREATE TRIGGER accounting_periods_close_only BEFORE UPDATE ON accounting_periods
WHEN NOT (OLD.status='OPEN' AND NEW.status='CLOSED' AND OLD.workspace_id=NEW.workspace_id AND OLD.start_date=NEW.start_date AND OLD.end_date=NEW.end_date)
BEGIN SELECT RAISE(ABORT,'accounting periods may only be closed once'); END;
CREATE TRIGGER accounting_periods_no_delete BEFORE DELETE ON accounting_periods BEGIN SELECT RAISE(ABORT,'accounting period history is retained'); END;

CREATE TABLE firm_journals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version>0),
  number TEXT NOT NULL,
  posting_date TEXT NOT NULL,
  period_id TEXT NOT NULL,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 5 AND 2000),
  source_type TEXT NOT NULL CHECK (length(trim(source_type)) BETWEEN 1 AND 120),
  source_id TEXT,
  source_event_key TEXT NOT NULL,
  reversal_of_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','POSTED')),
  posted_by_actor_id TEXT,
  posted_at TEXT,
  debit_total_minor INTEGER NOT NULL CHECK (debit_total_minor>=0),
  credit_total_minor INTEGER NOT NULL CHECK (credit_total_minor>=0),
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,period_id) REFERENCES accounting_periods(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reversal_of_id) REFERENCES firm_journals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,posted_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,number),
  UNIQUE (workspace_id,source_event_key),
  CHECK ((status='DRAFT' AND posted_by_actor_id IS NULL AND posted_at IS NULL)
      OR (status='POSTED' AND posted_by_actor_id IS NOT NULL AND posted_at IS NOT NULL AND debit_total_minor=credit_total_minor AND debit_total_minor>0))
);
CREATE TABLE firm_journal_lines (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  journal_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  debit_minor INTEGER NOT NULL CHECK (debit_minor>=0),
  credit_minor INTEGER NOT NULL CHECK (credit_minor>=0),
  client_id TEXT,
  engagement_id TEXT,
  memo TEXT,
  FOREIGN KEY (workspace_id,journal_id) REFERENCES firm_journals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,account_id) REFERENCES firm_accounts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,client_id) REFERENCES clients(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK ((debit_minor>0 AND credit_minor=0) OR (credit_minor>0 AND debit_minor=0))
);
CREATE INDEX firm_journals_date_idx ON firm_journals(workspace_id,posting_date,status);
CREATE TRIGGER firm_journals_posted_immutable BEFORE UPDATE ON firm_journals WHEN OLD.status='POSTED'
BEGIN SELECT RAISE(ABORT,'posted journals are immutable; reverse or correct them'); END;
CREATE TRIGGER firm_journals_no_delete BEFORE DELETE ON firm_journals BEGIN SELECT RAISE(ABORT,'journal history cannot be deleted'); END;
CREATE TRIGGER firm_journal_lines_posted_immutable_update BEFORE UPDATE ON firm_journal_lines
WHEN EXISTS(SELECT 1 FROM firm_journals j WHERE j.workspace_id=OLD.workspace_id AND j.id=OLD.journal_id AND j.status='POSTED')
BEGIN SELECT RAISE(ABORT,'posted journal lines are immutable'); END;
CREATE TRIGGER firm_journal_lines_posted_immutable_delete BEFORE DELETE ON firm_journal_lines
WHEN EXISTS(SELECT 1 FROM firm_journals j WHERE j.workspace_id=OLD.workspace_id AND j.id=OLD.journal_id AND j.status='POSTED')
BEGIN SELECT RAISE(ABORT,'posted journal lines are immutable'); END;
CREATE TRIGGER firm_journal_lines_no_insert_posted BEFORE INSERT ON firm_journal_lines
WHEN EXISTS(SELECT 1 FROM firm_journals j WHERE j.workspace_id=NEW.workspace_id AND j.id=NEW.journal_id AND j.status='POSTED')
BEGIN SELECT RAISE(ABORT,'posted journal lines are immutable'); END;

CREATE TABLE firm_expenses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version>0),
  expense_date TEXT NOT NULL,
  payee TEXT NOT NULL CHECK (length(trim(payee)) BETWEEN 1 AND 300),
  category TEXT NOT NULL CHECK (category IN ('RENT','SALARIES_BENEFITS','OVERHEAD','PETTY_CASH','OTHER')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 5000),
  supporting_file_id TEXT,
  missing_support_reason TEXT,
  debit_account_id TEXT NOT NULL,
  settlement_account_id TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('BANK','CASH','PAYABLE')),
  client_id TEXT,
  engagement_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','POSTED','RETURNED')),
  approved_by_actor_id TEXT,
  approved_at TEXT,
  journal_id TEXT,
  created_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,supporting_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,debit_account_id) REFERENCES firm_accounts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,settlement_account_id) REFERENCES firm_accounts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,journal_id) REFERENCES firm_journals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,journal_id),
  CHECK ((supporting_file_id IS NOT NULL) OR length(trim(COALESCE(missing_support_reason,'')))>=10),
  CHECK ((status='DRAFT' AND journal_id IS NULL AND approved_by_actor_id IS NULL AND approved_at IS NULL)
      OR (status='POSTED' AND journal_id IS NOT NULL AND approved_by_actor_id IS NOT NULL AND approved_at IS NOT NULL)
      OR status='RETURNED')
);
CREATE TRIGGER firm_expenses_posted_immutable BEFORE UPDATE ON firm_expenses WHEN OLD.status='POSTED'
BEGIN SELECT RAISE(ABORT,'posted expenses are immutable'); END;
CREATE TRIGGER firm_expenses_no_delete BEFORE DELETE ON firm_expenses BEGIN SELECT RAISE(ABORT,'expense history cannot be deleted'); END;

CREATE TABLE partner_withdrawals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  partner_staff_id TEXT NOT NULL,
  withdrawal_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  equity_account_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 5000),
  journal_id TEXT NOT NULL,
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,partner_staff_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,equity_account_id) REFERENCES firm_accounts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,bank_account_id) REFERENCES firm_accounts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,journal_id) REFERENCES firm_journals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,journal_id)
);
CREATE TRIGGER partner_withdrawals_no_update BEFORE UPDATE ON partner_withdrawals BEGIN SELECT RAISE(ABORT,'Partner withdrawal records are immutable'); END;
CREATE TRIGGER partner_withdrawals_no_delete BEFORE DELETE ON partner_withdrawals BEGIN SELECT RAISE(ABORT,'Partner withdrawal records are immutable'); END;

CREATE TABLE petty_cash_reconciliations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  as_of TEXT NOT NULL,
  ledger_balance_minor INTEGER NOT NULL,
  counted_cash_minor INTEGER NOT NULL CHECK (counted_cash_minor>=0),
  difference_minor INTEGER NOT NULL,
  explanation TEXT NOT NULL CHECK (length(trim(explanation)) BETWEEN 10 AND 5000),
  custodian_staff_id TEXT NOT NULL,
  reviewed_by_actor_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,account_id) REFERENCES firm_accounts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,custodian_staff_id) REFERENCES staff_members(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,reviewed_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK (difference_minor=counted_cash_minor-ledger_balance_minor)
);
CREATE TRIGGER petty_cash_reconciliations_no_update BEFORE UPDATE ON petty_cash_reconciliations BEGIN SELECT RAISE(ABORT,'petty cash reconciliations are append only'); END;
CREATE TRIGGER petty_cash_reconciliations_no_delete BEFORE DELETE ON petty_cash_reconciliations BEGIN SELECT RAISE(ABORT,'petty cash reconciliations are append only'); END;

CREATE TABLE firm_revenue_policies (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  effective_from TEXT NOT NULL,
  recognition_method TEXT NOT NULL CHECK (recognition_method IN ('DEFER_UNTIL_EARNED','APPROVED_MILESTONE')),
  recognition_rules TEXT NOT NULL CHECK (length(trim(recognition_rules)) BETWEEN 10 AND 10000),
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256)=64),
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,revision)
);
CREATE TRIGGER firm_revenue_policies_no_update BEFORE UPDATE ON firm_revenue_policies BEGIN SELECT RAISE(ABORT,'approved revenue policies are append only'); END;
CREATE TRIGGER firm_revenue_policies_no_delete BEFORE DELETE ON firm_revenue_policies BEGIN SELECT RAISE(ABORT,'approved revenue policies are append only'); END;

CREATE TABLE revenue_recognitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  recognition_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  basis TEXT NOT NULL CHECK (length(trim(basis)) BETWEEN 10 AND 5000),
  supporting_file_id TEXT,
  journal_id TEXT NOT NULL,
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,policy_id) REFERENCES firm_revenue_policies(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,supporting_file_id) REFERENCES file_versions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,journal_id) REFERENCES firm_journals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,journal_id)
);
CREATE TRIGGER revenue_recognitions_no_update BEFORE UPDATE ON revenue_recognitions BEGIN SELECT RAISE(ABORT,'revenue recognition events are append only'); END;
CREATE TRIGGER revenue_recognitions_no_delete BEFORE DELETE ON revenue_recognitions BEGIN SELECT RAISE(ABORT,'revenue recognition events are append only'); END;

CREATE TABLE payment_allocation_reversals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  allocation_id TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 5000),
  journal_id TEXT,
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,allocation_id) REFERENCES payment_allocations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,journal_id) REFERENCES firm_journals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TRIGGER payment_allocation_reversals_no_update BEFORE UPDATE ON payment_allocation_reversals BEGIN SELECT RAISE(ABORT,'allocation reversals are append only'); END;
CREATE TRIGGER payment_allocation_reversals_no_delete BEFORE DELETE ON payment_allocation_reversals BEGIN SELECT RAISE(ABORT,'allocation reversals are append only'); END;

CREATE TABLE firm_credit_notes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  number TEXT NOT NULL,
  credit_date TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 5000),
  journal_id TEXT NOT NULL,
  approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id,engagement_id) REFERENCES engagements(workspace_id,client_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,invoice_id) REFERENCES invoices(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,journal_id) REFERENCES firm_journals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,approved_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  UNIQUE (workspace_id,number)
);
CREATE TRIGGER firm_credit_notes_no_update BEFORE UPDATE ON firm_credit_notes BEGIN SELECT RAISE(ABORT,'credit notes are append only'); END;
CREATE TRIGGER firm_credit_notes_no_delete BEFORE DELETE ON firm_credit_notes BEGIN SELECT RAISE(ABORT,'credit notes are append only'); END;

CREATE TABLE firm_report_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('TRIAL_BALANCE','MONTHLY_PROFIT_LOSS','AR_AGING')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  as_of TEXT NOT NULL,
  journal_cutoff_hash TEXT NOT NULL CHECK (length(journal_cutoff_hash)=64),
  rows_snapshot_json TEXT NOT NULL CHECK (json_valid(rows_snapshot_json)),
  debit_total_minor INTEGER,
  credit_total_minor INTEGER,
  profit_minor INTEGER,
  generated_by_actor_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,generated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id),
  CHECK (period_start<=period_end)
);
CREATE TABLE ar_aging_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  as_of TEXT NOT NULL,
  client_id TEXT,
  rows_snapshot_json TEXT NOT NULL CHECK (json_valid(rows_snapshot_json)),
  current_minor INTEGER NOT NULL,
  days_1_30_minor INTEGER NOT NULL,
  days_31_60_minor INTEGER NOT NULL,
  days_61_90_minor INTEGER NOT NULL,
  days_91_plus_minor INTEGER NOT NULL,
  outstanding_total_minor INTEGER NOT NULL,
  unallocated_minor INTEGER NOT NULL,
  control_account_minor INTEGER,
  reconciliation_difference_minor INTEGER,
  source_hash TEXT NOT NULL CHECK (length(source_hash)=64),
  generated_by_actor_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id,client_id) REFERENCES clients(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,generated_by_actor_id) REFERENCES actor_profiles(workspace_id,id) ON DELETE RESTRICT,
  UNIQUE (workspace_id,id)
);
CREATE TRIGGER firm_report_snapshots_no_update BEFORE UPDATE ON firm_report_snapshots BEGIN SELECT RAISE(ABORT,'firm report snapshots are append only'); END;
CREATE TRIGGER firm_report_snapshots_no_delete BEFORE DELETE ON firm_report_snapshots BEGIN SELECT RAISE(ABORT,'firm report snapshots are append only'); END;
CREATE TRIGGER ar_aging_snapshots_no_update BEFORE UPDATE ON ar_aging_snapshots BEGIN SELECT RAISE(ABORT,'AR aging snapshots are append only'); END;
CREATE TRIGGER ar_aging_snapshots_no_delete BEFORE DELETE ON ar_aging_snapshots BEGIN SELECT RAISE(ABORT,'AR aging snapshots are append only'); END;

-- Workspaces that already exist when this migration is applied receive a real,
-- approved default rate schedule, a starter ledger chart, an open calendar year,
-- and an explicit deferred-revenue policy. New workspaces receive the same rows
-- in their atomic BUSINESS bootstrap transaction.
INSERT INTO firm_charge_out_rates(id,workspace_id,grade,hourly_minor,effective_from,effective_to,revision,content_sha256,approved_by_actor_id,approved_at)
SELECT lower(hex(randomblob(16))),w.id,r.grade,r.hourly_minor,'1970-01-01',NULL,1,r.content_sha256,ap.id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM workspaces w
JOIN actor_profiles ap ON ap.workspace_id=w.id AND ap.id=(SELECT MIN(ap2.id) FROM actor_profiles ap2
  JOIN staff_members sm2 ON sm2.workspace_id=ap2.workspace_id AND sm2.id=ap2.staff_member_id AND sm2.grade='PARTNER'
  WHERE ap2.workspace_id=w.id AND ap2.persona='APPROVER' AND ap2.active=1)
JOIN (
  SELECT 'PARTNER' AS grade,100000 AS hourly_minor,'6e2520f231fe3fe52ccc853159ac225c383886c351c6b15eb3f951c451c8705c' AS content_sha256
  UNION ALL SELECT 'MANAGER',75000,'27c4cf9d14c713d42c78d34456b20087414d11219504a39123ce9a1ddea1e170'
  UNION ALL SELECT 'SENIOR',50000,'d877374a80013f32e139ff89ea1089e6cefde0987a255982fc5d125c7581d30c'
  UNION ALL SELECT 'ASSOCIATE',20000,'2958db15ed9012550ab9e753de4f4e0dc88b8617f244404f65755a610eb347f1'
) r
WHERE w.data_mode='BUSINESS' AND NOT EXISTS(SELECT 1 FROM firm_charge_out_rates x WHERE x.workspace_id=w.id);

INSERT INTO firm_accounts(id,workspace_id,code,name,account_type,parent_account_id,normal_side,posting_allowed,active,control_type,created_by_actor_id,created_at,updated_at)
SELECT lower(hex(randomblob(16))),w.id,a.code,a.name,a.account_type,NULL,a.normal_side,1,1,a.control_type,ap.id,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM workspaces w
JOIN actor_profiles ap ON ap.workspace_id=w.id AND ap.id=(SELECT MIN(ap2.id) FROM actor_profiles ap2
  JOIN staff_members sm2 ON sm2.workspace_id=ap2.workspace_id AND sm2.id=ap2.staff_member_id AND sm2.grade='PARTNER'
  WHERE ap2.workspace_id=w.id AND ap2.persona='APPROVER' AND ap2.active=1)
JOIN (
  SELECT '1000' AS code,'Bank' AS name,'ASSET' AS account_type,'DEBIT' AS normal_side,'BANK' AS control_type
  UNION ALL SELECT '1010','Petty Cash','ASSET','DEBIT','CASH'
  UNION ALL SELECT '1100','Trade Receivables','ASSET','DEBIT','AR'
  UNION ALL SELECT '2100','Contract Liability','LIABILITY','CREDIT','CONTRACT_LIABILITY'
  UNION ALL SELECT '2110','Unallocated Client Receipts','LIABILITY','CREDIT','UNALLOCATED_RECEIPTS'
  UNION ALL SELECT '2190','Accounts Payable','LIABILITY','CREDIT','AP'
  UNION ALL SELECT '2200','VAT Payable','LIABILITY','CREDIT','NONE'
  UNION ALL SELECT '3000','Partner Capital','EQUITY','CREDIT','PARTNER_CAPITAL'
  UNION ALL SELECT '3100','Partner Drawings','EQUITY','DEBIT','PARTNER_DRAWINGS'
  UNION ALL SELECT '4000','Professional Fees','REVENUE','CREDIT','NONE'
  UNION ALL SELECT '5000','Rent Expense','EXPENSE','DEBIT','NONE'
  UNION ALL SELECT '5100','Salaries and Benefits','EXPENSE','DEBIT','NONE'
  UNION ALL SELECT '5200','Operating Overheads','EXPENSE','DEBIT','NONE'
  UNION ALL SELECT '5300','Petty Cash Expense','EXPENSE','DEBIT','NONE'
) a
WHERE w.data_mode='BUSINESS' AND NOT EXISTS(SELECT 1 FROM firm_accounts x WHERE x.workspace_id=w.id);

INSERT INTO accounting_periods(id,workspace_id,start_date,end_date,status,created_by_actor_id,created_at)
SELECT lower(hex(randomblob(16))),w.id,strftime('%Y-01-01','now'),strftime('%Y-12-31','now'),'OPEN',ap.id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM workspaces w JOIN actor_profiles ap ON ap.workspace_id=w.id AND ap.id=(SELECT MIN(ap2.id) FROM actor_profiles ap2
  JOIN staff_members sm2 ON sm2.workspace_id=ap2.workspace_id AND sm2.id=ap2.staff_member_id AND sm2.grade='PARTNER'
  WHERE ap2.workspace_id=w.id AND ap2.persona='APPROVER' AND ap2.active=1)
WHERE w.data_mode='BUSINESS' AND NOT EXISTS(SELECT 1 FROM accounting_periods p WHERE p.workspace_id=w.id AND p.status='OPEN');

INSERT INTO firm_revenue_policies(id,workspace_id,revision,name,effective_from,recognition_method,recognition_rules,content_sha256,approved_by_actor_id,approved_at)
SELECT lower(hex(randomblob(16))),w.id,1,'Baseline deferred revenue recognition','1970-01-01','DEFER_UNTIL_EARNED',
  'Invoice advances are contract liabilities until service is earned and explicitly recognized by a Partner.',
  '5c0ef43de35b6cf98f0c5802a8dba4da55424b496df6c6a00c360d86c8e16f83',ap.id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM workspaces w JOIN actor_profiles ap ON ap.workspace_id=w.id AND ap.id=(SELECT MIN(ap2.id) FROM actor_profiles ap2
  JOIN staff_members sm2 ON sm2.workspace_id=ap2.workspace_id AND sm2.id=ap2.staff_member_id AND sm2.grade='PARTNER'
  WHERE ap2.workspace_id=w.id AND ap2.persona='APPROVER' AND ap2.active=1)
WHERE w.data_mode='BUSINESS' AND NOT EXISTS(SELECT 1 FROM firm_revenue_policies p WHERE p.workspace_id=w.id);
