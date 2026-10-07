import React, { useEffect, useMemo, useState } from 'react';
import type { BusinessContextResponse, BusinessEngagementOption, BusinessFileMetadata, BusinessWorkspacePreference } from '../../shared/api/business';
import { downloadBusinessFileVersion, getBusinessPracticeWorkspace, newBusinessIdempotencyKey, runBusinessCommand } from '../../services/businessWorkspace';

type Account = { id: string; code: string; name: string; accountType: string; normalSide: string; postingAllowed: number | boolean; active: number | boolean; controlType: string };
type Staff = { id: string; displayName: string; grade: string };
type TimeEntry = { id: string; version: number; staff_member_id?: string; staffMemberId?: string; display_name?: string; grade?: string; work_date?: string; phase?: string; fsli_id?: string | null; procedure_id?: string | null; minutes: number; description: string; billable: boolean; status: string; chargeOutMinor?: string | null };
type PracticeData = {
  staff: Staff[]; rates: Array<Record<string, unknown>>; timeEntries: TimeEntry[];
  fsliCatalog: Array<{ id: string; code: string; name: string; statement: string }>;
  procedureCatalog: Array<{ id: string; ordinal: number; title: string; status: string; fsliId: string; fsliCode: string | null }>;
  utilization: Array<{ staffMemberId: string; displayName?: string; grade?: string; scheduledMinutes: number; leaveMinutes: number; availableMinutes: number; recordedMinutes: number; approvedBillableMinutes: number; approvedNonbillableMinutes: number; utilizationBps: number | null; resultReason: string; missingCapacityDates: string[] }>;
  accounts: Account[]; accountingPeriods: Array<{ id: string; startDate: string; endDate: string; status: string }>;
  journals: Array<{ id: string; version: number; number: string; postingDate: string; description: string; sourceType: string; status: string; debitTotalMinor: string; creditTotalMinor: string }>;
  expenses: Array<{ id: string; date: string; payee: string; category: string; amountMinor: string; description: string; status: string }>;
  revenuePolicies: Array<{ id: string; revision: number; name: string; recognitionMethod: string }>;
  payments: Array<{ id: string; clientId: string; engagementId: string; amountMinor: string; receivedOn: string; method: string; reference: string; receiptNumber: string | null; receiptStatus: string | null; fullyReversed: number | boolean; reversesPaymentId: string | null; remainingUnallocatedMinor: string }>;
  arAging: null | { asOf: string; invoices: Array<{ invoiceId: string; clientId: string; engagementId: string; kind: string; number: string; dueDate: string; outstandingMinor: string; bucket: string }>; buckets: Record<string, string>; outstandingTotalMinor: string; unallocatedMinor: string; controlAccountMinor: string; reconciliationDifferenceMinor: string; reconciliationStatus: string };
  trialBalance: { rows: Array<{ accountId: string; code: string; name: string; accountType: string; openingMinor: string; periodDebitMinor: string; periodCreditMinor: string; closingMinor: string }>; closingDebitMinor: string; closingCreditMinor: string; closingBalanced: boolean; sourceHash: string };
  profitLoss: { revenueMinor: string; expenseMinor: string; profitMinor: string; sourceHash: string; recognitionNote: string };
  budget: { id: string; revision: number; sourceHash: string } | null;
  profitability: { feeMinor: string; chargeOutValueMinor: string; profitabilityMinor: string; approvedMinutes: number; pendingMinutes: number; billedMinor: string; collectedMinor: string; metricLabel: string; formula: string; sourceHash: string; phases: Array<{ phase: string; plannedMinutes: number; actualMinutes: number; varianceMinutes: number; varianceBps: number | null; varianceStatus: string; chargeOutValueMinor: string }> } | null;
  partnerWithdrawals: Array<Record<string, unknown>>;
  pettyCashReconciliations: Array<Record<string, unknown>>;
  creditNotes: Array<Record<string, unknown>>;
  paymentAllocations: Array<Record<string, unknown>>;
  controlAccountBalances: Array<{ accountId: string; code: string; name: string; balanceMinor: string }>;
  reportSnapshots: Array<{ id: string; kind: string; periodStart: string; periodEnd: string; sourceHash: string; fileVersionId: string | null; fileName: string | null; sha256: string | null; generatedAt: string }>;
  period: { from: string; to: string };
};

interface Props {
  workspaceId: string;
  selected: BusinessWorkspacePreference;
  context: BusinessContextResponse;
  engagement: Pick<BusinessEngagementOption, 'id' | 'clientId' | 'clientName' | 'lifecycleState'>;
  files: BusinessFileMetadata[];
  onChanged: () => void;
}

const phases = ['COMMERCIAL', 'PLANNING', 'FIELDWORK', 'REVIEW', 'REPORTING', 'ARCHIVE'];
const grades = ['PARTNER', 'MANAGER', 'SENIOR', 'ASSOCIATE'];
function qatarToday(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function qatarTomorrow(): string { const date = new Date(`${qatarToday()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || !/^-?\d+$/.test(String(value))) return '—';
  const n = BigInt(String(value)); const sign = n < 0n ? '−' : ''; const abs = n < 0n ? -n : n;
  return `${sign}QAR ${(abs / 100n).toLocaleString('en-US')}.${String(abs % 100n).padStart(2, '0')}`;
}
function qatarMinor(value: string): string {
  const match = /^(0|[1-9]\d{0,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Enter a QAR amount with up to two decimal places.');
  return String(BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0'));
}

export function BusinessPracticePanel({ workspaceId, selected, context, engagement, files, onChanged }: Props) {
  const today = qatarToday();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<PracticeData | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [staffMemberId, setStaffMemberId] = useState(context.actor.staffMemberId ?? '');
  const [workDate, setWorkDate] = useState(today);
  const [phase, setPhase] = useState('FIELDWORK');
  const [fsliId, setFsliId] = useState('');
  const [procedureId, setProcedureId] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [description, setDescription] = useState('');
  const [billable, setBillable] = useState(true);
  const [rateGrade, setRateGrade] = useState('ASSOCIATE');
  const [rateQar, setRateQar] = useState('200');
  const [rateEffectiveFrom, setRateEffectiveFrom] = useState(qatarTomorrow());
  const [accountCode, setAccountCode] = useState('5400');
  const [accountName, setAccountName] = useState('Other operating expense');
  const [accountType, setAccountType] = useState<'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'>('EXPENSE');
  const [expensePayee, setExpensePayee] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseSupport, setExpenseSupport] = useState('');
  const [expenseReason, setExpenseReason] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('OVERHEAD');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<'BANK' | 'CASH' | 'PAYABLE'>('BANK');
  const [expenseSettlementAccountId, setExpenseSettlementAccountId] = useState('');
  const [missingSupportReason, setMissingSupportReason] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [selectedPaymentId, setSelectedPaymentId] = useState('');
  const [allocationAmount, setAllocationAmount] = useState('');
  const [policyName, setPolicyName] = useState('');
  const [policyRules, setPolicyRules] = useState('');
  const [recognitionAmount, setRecognitionAmount] = useState('');
  const [recognitionBasis, setRecognitionBasis] = useState('');
  const [journalDate, setJournalDate] = useState(today);
  const [journalMemo, setJournalMemo] = useState('');
  const [journalDebitAccount, setJournalDebitAccount] = useState('');
  const [journalCreditAccount, setJournalCreditAccount] = useState('');
  const [journalAmount, setJournalAmount] = useState('');
  const [budgetRows, setBudgetRows] = useState<Array<{ phase: string; grade: string; plannedMinutes: string }>>([{ phase: 'FIELDWORK', grade: 'SENIOR', plannedMinutes: '0' }]);
  const [openPeriodStart, setOpenPeriodStart] = useState(`${today.slice(0, 4)}-01-01`);
  const [openPeriodEnd, setOpenPeriodEnd] = useState(today);
  const [closePeriodId, setClosePeriodId] = useState('');
  const [withdrawalPartnerId, setWithdrawalPartnerId] = useState('');
  const [withdrawalDate, setWithdrawalDate] = useState(today);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [pettyCashAccountId, setPettyCashAccountId] = useState('');
  const [pettyCashCustodianId, setPettyCashCustodianId] = useState('');
  const [pettyCashCount, setPettyCashCount] = useState('');
  const [pettyCashExplanation, setPettyCashExplanation] = useState('');
  const [creditInvoiceId, setCreditInvoiceId] = useState('');
  const [creditNoteAmount, setCreditNoteAmount] = useState('');
  const [creditNoteReason, setCreditNoteReason] = useState('');
  const [allocationToReverseId, setAllocationToReverseId] = useState('');
  const [allocationReverseAmount, setAllocationReverseAmount] = useState('');
  const [allocationReverseReason, setAllocationReverseReason] = useState('');
  const [exportKind, setExportKind] = useState<'TRIAL_BALANCE' | 'MONTHLY_PROFIT_LOSS'>('TRIAL_BALANCE');
  const [exportFormat, setExportFormat] = useState<'CSV' | 'XLSX' | 'PDF'>('XLSX');
  const [fileBusyId, setFileBusyId] = useState('');

  const isPartner = context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER';
  const canReview = context.allowedActions.includes('practice.approve') || isPartner;
  const canManage = context.allowedActions.includes('practice.manage') || isPartner;
  const committedEvidence = useMemo(() => files.filter(file => file.purpose === 'EVIDENCE' && file.state === 'COMMITTED'
    && file.engagementId === engagement.id), [files, engagement.id]);

  useEffect(() => {
    if (!selected.actorId || !selected.persona) return;
    const controller = new AbortController();
    getBusinessPracticeWorkspace(workspaceId, selected, { from, to, engagementId: engagement.id, asOfDate: to }, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setData(result as unknown as PracticeData); setError(''); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Firm practice data could not be loaded.'); });
    return () => controller.abort();
  }, [workspaceId, selected.actorId, selected.persona, selected.clientId, selected.engagementId, engagement.id, from, to, refresh]);

  const perform = async (type: string, payload: Record<string, unknown>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await runBusinessCommand(workspaceId, selected, { type, payload }, newBusinessIdempotencyKey());
      setMessage(success); setRefresh(value => value + 1); onChanged(); return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The practice command was rejected.'); return false; }
    finally { setBusy(false); }
  };

  const captureTime = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!staffMemberId) { setError('Select the staff member who performed this work.'); return; }
    if (await perform('time.create', { engagementId: engagement.id, staffMemberId, workDate, phase, minutes: Number(minutes), description, billable,
      ...(fsliId ? { fsliId } : {}), ...(procedureId ? { procedureId } : {}) }, 'Time entry saved as a draft. Submit it for independent approval.')) setDescription('');
  };
  const saveRate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try { await perform('practice.rate.set', { grade: rateGrade, hourlyMinor: qatarMinor(rateQar), effectiveFrom: rateEffectiveFrom }, `Approved ${rateGrade.toLowerCase()} rate effective ${rateEffectiveFrom}.`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter a valid charge-out rate.'); }
  };
  const createExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const debit = data?.accounts.find(account => account.code === '5200') ?? data?.accounts.find(account => account.accountType === 'EXPENSE');
    const expectedControl = expensePaymentMethod === 'BANK' ? 'BANK' : expensePaymentMethod === 'CASH' ? 'CASH' : 'AP';
    const settlement = data?.accounts.find(account => account.id === expenseSettlementAccountId && account.controlType === expectedControl)
      ?? data?.accounts.find(account => account.controlType === expectedControl);
    if (!debit || !settlement) { setError(`Configure an expense account and ${expectedControl} control account before recording an expense.`); return; }
    if (!expenseSupport && missingSupportReason.trim().length < 10) { setError('Explain why voucher support is missing; a generic exception is not accepted.'); return; }
    try {
      const payload: Record<string, unknown> = { date: today, payee: expensePayee, category: expenseCategory, amountMinor: qatarMinor(expenseAmount), description: expenseReason || `Operating expense paid to ${expensePayee}`,
        debitAccountId: debit.id, settlementAccountId: settlement.id, paymentMethod: expensePaymentMethod, ...(expenseSupport ? { supportingFileId: expenseSupport } : { missingSupportReason }) };
      if (await perform('expense.create', payload, 'Expense saved as a draft for independent review.')) { setExpensePayee(''); setExpenseAmount(''); setExpenseSupport(''); setExpenseReason(''); setMissingSupportReason(''); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter a valid QAR amount.'); }
  };
  const saveAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await perform('ledger.account.create', { code: accountCode, name: accountName, accountType, normalSide: ['LIABILITY', 'EQUITY', 'REVENUE'].includes(accountType) ? 'CREDIT' : 'DEBIT', controlType: 'NONE', postingAllowed: true }, 'Firm account added to the chart of accounts.');
  };
  const createJournal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!journalDebitAccount || !journalCreditAccount) { setError('Choose the debit and credit accounts.'); return; }
    try { const amountMinor = qatarMinor(journalAmount);
      await perform('ledger.create-draft', { postingDate: journalDate, description: journalMemo, sourceType: 'MANUAL', lines: [
        { accountId: journalDebitAccount, debitMinor: amountMinor, creditMinor: '0' }, { accountId: journalCreditAccount, debitMinor: '0', creditMinor: amountMinor }
      ] }, 'Balanced journal draft saved. An independent Reviewer or Partner must post it.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter a valid QAR amount.'); }
  };
  const saveRevenuePolicy = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await perform('revenue-policy.save', { name: policyName, effectiveFrom: today, recognitionMethod: 'DEFER_UNTIL_EARNED', recognitionRules: policyRules }, 'Versioned deferred-revenue policy recorded.');
  };
  const recognizeRevenue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data?.revenuePolicies[0]) { setError('Create and approve a revenue policy first.'); return; }
    try { await perform('revenue.recognize', { engagementId: engagement.id, policyId: data.revenuePolicies[0].id, date: today, amountMinor: qatarMinor(recognitionAmount), basis: recognitionBasis }, 'Revenue recognition event and balanced journal posted.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter a valid QAR amount.'); }
  };
  const saveBudget = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const proposalVersionId = (data as unknown as { engagement?: { activeProposalVersionId?: string } } | null)?.engagement?.activeProposalVersionId;
    if (!proposalVersionId) { setError('The engagement has no accepted proposal revision to pin.'); return; }
    const budgetPhases = budgetRows.map(row => ({ phase: row.phase, grade: row.grade, plannedMinutes: Number(row.plannedMinutes) }));
    if (new Set(budgetPhases.map(row => `${row.phase}:${row.grade}`)).size !== budgetPhases.length) { setError('Each phase and grade pair may appear only once in a budget.'); return; }
    await perform('budget.approve', { engagementId: engagement.id, feeProposalVersionId: proposalVersionId, phases: budgetPhases },
      'Immutable multi-phase budget approved against the accepted fee revision.');
  };
  const openPeriod = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); await perform('accounting-period.open', { startDate: openPeriodStart, endDate: openPeriodEnd }, 'Accounting period opened with a non-overlapping date range.');
  };
  const recordWithdrawal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const drawings = data?.accounts.find(account => account.controlType === 'PARTNER_DRAWINGS'), bank = data?.accounts.find(account => account.controlType === 'BANK');
    if (!withdrawalPartnerId || !drawings || !bank) { setError('Choose a Partner and configure the Partner Drawings and Bank control accounts.'); return; }
    try { await perform('partner-withdrawal.post', { partnerStaffId: withdrawalPartnerId, date: withdrawalDate, amountMinor: qatarMinor(withdrawalAmount),
      equityAccountId: drawings.id, bankAccountId: bank.id, reason: withdrawalReason }, 'Partner withdrawal posted as an equity distribution, not a business expense.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter a valid withdrawal amount.'); }
  };
  const reconcilePettyCash = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try { await perform('petty-cash.reconcile', { accountId: pettyCashAccountId, asOf: to, countedCashMinor: qatarMinor(pettyCashCount), explanation: pettyCashExplanation, custodianStaffId: pettyCashCustodianId },
      'Independent petty-cash reconciliation saved with any variance visible.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter a valid counted cash amount.'); }
  };
  const issueCreditNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try { await perform('credit-note.issue', { invoiceId: creditInvoiceId, date: today, amountMinor: qatarMinor(creditNoteAmount), reason: creditNoteReason },
      'Credit note issued and posted against the current outstanding invoice balance.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter a valid credit amount.'); }
  };
  const reverseAllocation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try { await perform('payment.reverse-allocation', { allocationId: allocationToReverseId, effectiveDate: today, amountMinor: qatarMinor(allocationReverseAmount), reason: allocationReverseReason },
      'Allocation reversal posted; original receipt and allocation history remain preserved.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter a valid reversal amount.'); }
  };
  const exportPracticeReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await perform('practice.export-report', { kind: exportKind, periodStart: from, periodEnd: to, format: exportFormat }, `${exportKind === 'TRIAL_BALANCE' ? 'Trial balance' : 'Profit and loss'} export queued from an immutable source snapshot.`);
  };
  const downloadReport = async (snapshot: PracticeData['reportSnapshots'][number]) => {
    if (!snapshot.fileVersionId) { setError('This report snapshot has no committed file yet.'); return; }
    setFileBusyId(snapshot.fileVersionId); setError('');
    try {
      const blob = await downloadBusinessFileVersion(workspaceId, snapshot.fileVersionId, selected);
      if (snapshot.sha256) {
        const rawHash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        const actual = [...new Uint8Array(rawHash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (actual !== snapshot.sha256) throw new Error('The downloaded report bytes do not match the immutable file digest.');
      }
      const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = snapshot.fileName ?? 'firm-report';
      document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The firm report could not be downloaded.'); }
    finally { setFileBusyId(''); }
  };

  const currentPayment = data?.payments.find(payment => payment.id === selectedPaymentId);
  const currentInvoice = data?.arAging?.invoices.find(invoice => invoice.invoiceId === selectedInvoiceId);
  const selectedAllocation = data?.paymentAllocations.find(allocation => allocation.id === allocationToReverseId);
  const accountOptions = data?.accounts.filter(account => Boolean(account.active) && Boolean(account.postingAllowed)) ?? [];

  return <section className="business-directory-card" aria-labelledby={`business-practice-${engagement.id}`}>
    <div className="business-section-heading">
      <div><p className="business-eyebrow">PRACTICE MANAGEMENT · INTERNAL FIRM RECORDS</p><h2 id={`business-practice-${engagement.id}`}>Time, firm ledger and receivables</h2></div>
      <button type="button" className="btn sm" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh practice data</button>
    </div>
    <p className="business-note">Firm bookkeeping and staff records are separate from client trial balances and audit adjustments. This view uses approved entries and posted journals only.</p>
    {error && <p className="business-alert" role="alert">{error}</p>}{message && <p className="business-command-message" role="status">{message}</p>}
    <div className="business-form-grid">
      <label className="business-field"><span>Report from</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label className="business-field"><span>Report through</span><input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      <div className="business-field"><span>Engagement</span><input readOnly value={`${engagement.clientName} · ${engagement.id}`} /></div>
    </div>

    {data && <>
      <div className="business-delivery-grid">
        <div className="business-record-list"><h3>Firm trial balance</h3>
          <p><strong>{data.trialBalance.closingBalanced ? 'Balanced exactly' : 'Out of balance'}</strong> · debit {money(data.trialBalance.closingDebitMinor)} · credit {money(data.trialBalance.closingCreditMinor)}</p>
          <small>Source {data.trialBalance.sourceHash.slice(0, 16)}… · opening balances and posted movements through {to}.</small>
        </div>
        <div className="business-record-list"><h3>Monthly profit and loss · selected period</h3>
          <p>Revenue {money(data.profitLoss.revenueMinor)} · expenses {money(data.profitLoss.expenseMinor)} · profit {money(data.profitLoss.profitMinor)}</p>
          <small>{data.profitLoss.recognitionNote}</small>
        </div>
      </div>

      <div className="business-practice-actions">
        <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('practice.capture-utilization-report', { from, to }, 'Utilization snapshot captured from explicit capacity and approved time.')}>Capture utilization snapshot</button>
        <button type="button" className="btn sm" disabled={busy || !data.budget} onClick={() => void perform('practice.capture-profitability-report', { engagementId: engagement.id, asOf: new Date().toISOString() }, 'Profitability snapshot captured against approved time and budget.')}>Capture profitability snapshot</button>
        <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('practice.capture-ar-aging-report', { asOf: to }, 'AR aging snapshot captured with the current reconciliation result.')}>Capture AR aging snapshot</button>
      </div>

      {(data.utilization.length > 0 || data.profitability) && <div className="business-delivery-grid">
        {data.utilization.length > 0 && <div className="business-record-list"><h3>Utilization · approved billable time against available capacity</h3>
          <div className="business-table-wrap"><table className="business-table"><thead><tr><th>Staff / grade</th><th>Approved billable</th><th>Available</th><th>Utilization</th></tr></thead><tbody>
            {data.utilization.map(row => <tr key={row.staffMemberId}><td>{row.displayName ?? row.staffMemberId} · {row.grade ?? '—'}</td><td>{row.approvedBillableMinutes} min</td><td>{row.availableMinutes} min</td>
              <td>{row.utilizationBps === null ? `Not calculated · ${row.resultReason.replaceAll('_', ' ').toLowerCase()}` : `${(row.utilizationBps / 100).toFixed(2)}%`}</td></tr>)}
          </tbody></table></div>
          <small>Approved billable minutes divided by explicitly scheduled capacity after approved leave. Missing capacity is shown, never assumed.</small></div>}
        {data.profitability && <div className="business-record-list"><h3>Engagement profitability · current approved budget and time</h3>
          <p>Accepted fee {money(data.profitability.feeMinor)} · charge-out value {money(data.profitability.chargeOutValueMinor)} · margin {money(data.profitability.profitabilityMinor)}</p>
          <small>{data.profitability.metricLabel} · {data.profitability.pendingMinutes} pending minutes · billed {money(data.profitability.billedMinor)} · collected {money(data.profitability.collectedMinor)}.</small>
          <div className="business-table-wrap"><table className="business-table"><thead><tr><th>Phase</th><th>Planned</th><th>Actual</th><th>Variance</th><th>Status</th></tr></thead><tbody>
            {data.profitability.phases.map(row => <tr key={row.phase}><td>{row.phase}</td><td>{row.plannedMinutes} min</td><td>{row.actualMinutes} min</td><td>{row.varianceMinutes >= 0 ? '+' : ''}{row.varianceMinutes} min</td><td>{row.varianceStatus.replaceAll('_', ' ')}</td></tr>)}
          </tbody></table></div></div>}
      </div>}

      {context.actor.persona === 'PREPARER' && <form className="business-form business-commercial-form" onSubmit={captureTime}>
        <h3>Record actual time</h3>
        <div className="business-form-grid">
          <label className="business-field"><span>Staff member</span><select required value={staffMemberId} onChange={event => setStaffMemberId(event.target.value)}><option value="">Select staff</option>{data.staff.map(staff => <option key={staff.id} value={staff.id}>{staff.displayName} · {staff.grade}</option>)}</select></label>
          <label className="business-field"><span>Work date</span><input type="date" required value={workDate} onChange={event => setWorkDate(event.target.value)} /></label>
          <label className="business-field"><span>Phase</span><select value={phase} onChange={event => setPhase(event.target.value)}>{phases.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="business-field"><span>FSLI (optional)</span><select value={fsliId} onChange={event => setFsliId(event.target.value)}><option value="">No specific FSLI</option>{data.fsliCatalog.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <label className="business-field"><span>Procedure (optional)</span><select value={procedureId} onChange={event => {
            const selectedProcedureId = event.target.value;
            setProcedureId(selectedProcedureId);
            const selectedProcedure = data.procedureCatalog.find(item => item.id === selectedProcedureId);
            if (selectedProcedure) setFsliId(selectedProcedure.fsliId);
          }}><option value="">No specific procedure</option>{data.procedureCatalog.map(item => <option key={item.id} value={item.id}>{item.fsliCode ? `${item.fsliCode} · ` : ''}{item.ordinal}. {item.title}</option>)}</select></label>
          <label className="business-field"><span>Actual minutes</span><input type="number" min="1" max="1440" required value={minutes} onChange={event => setMinutes(event.target.value)} /></label>
          <label className="business-field"><span>Description</span><input required minLength={10} maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} /></label>
          <label className="business-field"><span>Chargeable</span><select value={billable ? 'true' : 'false'} onChange={event => setBillable(event.target.value === 'true')}><option value="true">Billable</option><option value="false">Non-billable</option></select></label>
        </div><button className="btn primary" disabled={busy}>Save draft time entry</button>
      </form>}

      {canManage && <form className="business-form business-commercial-form" onSubmit={saveRate}>
        <h3>Set a grade charge-out rate</h3><div className="business-form-grid">
          <label className="business-field"><span>Grade</span><select value={rateGrade} onChange={event => setRateGrade(event.target.value)}>{grades.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="business-field"><span>QAR per hour</span><input required inputMode="decimal" value={rateQar} onChange={event => setRateQar(event.target.value)} /></label>
          <label className="business-field"><span>Effective from</span><input type="date" required value={rateEffectiveFrom} onChange={event => setRateEffectiveFrom(event.target.value)} /></label>
        </div><button className="btn sm" disabled={busy}>Save rate revision</button>
        <small>A new rate must be future-effective; historical work keeps its pinned rate. Each time submission pins the effective rate and calculates value in QAR minor units.</small>
      </form>}

      <h3>Actual time entries</h3>
      {data.timeEntries.length ? <div className="business-table-wrap"><table className="business-table"><thead><tr><th>Date</th><th>Staff / grade</th><th>Phase</th><th>FSLI / procedure</th><th>Minutes</th><th>Value</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {data.timeEntries.map(entry => {
          const fsli = data.fsliCatalog.find(item => item.id === entry.fsli_id);
          const procedure = data.procedureCatalog.find(item => item.id === entry.procedure_id);
          const reference = [fsli?.code, procedure ? `${procedure.ordinal}. ${procedure.title}` : null].filter(Boolean).join(' · ');
          return <tr key={entry.id}><td>{entry.work_date ?? '—'}</td><td>{entry.display_name ?? '—'} · {entry.grade ?? '—'}</td><td>{entry.phase ?? '—'}</td><td>{reference || '—'}</td><td>{entry.minutes}</td><td>{money(entry.chargeOutMinor)}</td><td>{entry.status}</td><td>
          {entry.status === 'DRAFT' || entry.status === 'RETURNED' ? <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('time.submit', { timeEntryId: entry.id, expectedVersion: entry.version }, 'Time submitted for independent approval.')}>Submit</button> : null}
          {entry.status === 'SUBMITTED' && canReview && <><button type="button" className="btn sm" disabled={busy} onClick={() => void perform('time.approve', { timeEntryId: entry.id, expectedVersion: entry.version }, 'Approved time retained with its rate snapshot.')}>Approve</button>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('time.return', { timeEntryId: entry.id, expectedVersion: entry.version, reason: 'Please clarify the work performed and engagement phase before approval.' }, 'Time returned with a recorded reason.')}>Return</button></>}
          {entry.status === 'APPROVED' && canReview && <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('time.correct', { timeEntryId: entry.id, expectedVersion: entry.version, reason: 'Approved time is reversed after independent correction review.', replacement: null }, 'Correction appended. The original time remains in history.')}>Correct / reverse</button>}
        </td></tr>;
        })}
      </tbody></table></div> : <p className="business-muted">No time entries exist for this engagement and period.</p>}

      {isPartner && <form className="business-form business-commercial-form" onSubmit={saveBudget}>
        <h3>Approve a multi-phase budget</h3>
        {budgetRows.map((row, index) => <div className="business-form-grid" key={index}>
          <label className="business-field"><span>Phase</span><select value={row.phase} onChange={event => setBudgetRows(rows => rows.map((item, position) => position === index ? { ...item, phase: event.target.value } : item))}>{phases.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="business-field"><span>Grade</span><select value={row.grade} onChange={event => setBudgetRows(rows => rows.map((item, position) => position === index ? { ...item, grade: event.target.value } : item))}>{grades.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="business-field"><span>Planned minutes</span><input type="number" min="0" max="1000000" required value={row.plannedMinutes} onChange={event => setBudgetRows(rows => rows.map((item, position) => position === index ? { ...item, plannedMinutes: event.target.value } : item))} /></label>
          {budgetRows.length > 1 && <button type="button" className="btn sm" disabled={busy} onClick={() => setBudgetRows(rows => rows.filter((_, position) => position !== index))}>Remove line</button>}
        </div>)}
        <div className="business-practice-actions">
          <button type="button" className="btn sm" disabled={busy || budgetRows.length >= 24} onClick={() => setBudgetRows(rows => [...rows, { phase: 'FIELDWORK', grade: 'SENIOR', plannedMinutes: '0' }])}>Add phase line</button>
          <button className="btn sm" disabled={busy}>Pin complete budget to accepted fee revision</button>
        </div>
        {data.budget && <small>Current immutable budget revision {data.budget.revision} · {data.budget.sourceHash.slice(0, 16)}… Each approval supersedes the prior plan with the complete set of phase lines above.</small>}
      </form>}

      {isPartner && <form className="business-form business-commercial-form" onSubmit={openPeriod}>
        <h3>Open an accounting period</h3><div className="business-form-grid"><label className="business-field"><span>Period start</span><input type="date" required value={openPeriodStart} onChange={event => setOpenPeriodStart(event.target.value)} /></label>
          <label className="business-field"><span>Period end</span><input type="date" required value={openPeriodEnd} onChange={event => setOpenPeriodEnd(event.target.value)} /></label></div>
        <button className="btn sm" disabled={busy}>Open non-overlapping period</button>
      </form>}
      <div className="business-record-list"><h3>Accounting periods</h3>{data.accountingPeriods.length ? data.accountingPeriods.map(period => <div className="business-delivery-row" key={period.id}>
        <strong>{period.startDate}–{period.endDate} · {period.status}</strong><span>{period.status === 'OPEN' ? 'Posting allowed until closed' : 'Closed period'}</span>
        {isPartner && period.status === 'OPEN' && <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('accounting-period.close', { periodId: period.id }, 'Accounting period closed after confirming no journal drafts remain.')}>Close period</button>}
      </div>) : <p className="business-muted">No formal accounting periods are open yet; create one before period-based posting is required.</p>}</div>

      <div className="business-delivery-grid">
        <form className="business-form business-commercial-form" onSubmit={createExpense}>
          <h3>Record an operating expense</h3>
          <label className="business-field"><span>Payee</span><input required maxLength={300} value={expensePayee} onChange={event => setExpensePayee(event.target.value)} /></label>
          <label className="business-field"><span>Amount (QAR)</span><input required inputMode="decimal" value={expenseAmount} onChange={event => setExpenseAmount(event.target.value)} /></label>
          <div className="business-form-grid"><label className="business-field"><span>Expense category</span><select value={expenseCategory} onChange={event => setExpenseCategory(event.target.value)}>{['RENT', 'SALARIES_BENEFITS', 'OVERHEAD', 'PETTY_CASH', 'OTHER'].map(item => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
            <label className="business-field"><span>Settlement method</span><select value={expensePaymentMethod} onChange={event => { const method = event.target.value as typeof expensePaymentMethod; setExpensePaymentMethod(method); setExpenseSettlementAccountId(''); }}><option value="BANK">Bank paid</option><option value="CASH">Cash paid</option><option value="PAYABLE">Record payable</option></select></label>
            <label className="business-field"><span>Settlement account</span><select required value={expenseSettlementAccountId || (data.accounts.find(account => account.controlType === (expensePaymentMethod === 'BANK' ? 'BANK' : expensePaymentMethod === 'CASH' ? 'CASH' : 'AP'))?.id ?? '')} onChange={event => setExpenseSettlementAccountId(event.target.value)}><option value="">Choose control account</option>{accountOptions.filter(account => account.controlType === (expensePaymentMethod === 'BANK' ? 'BANK' : expensePaymentMethod === 'CASH' ? 'CASH' : 'AP')).map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label></div>
          <label className="business-field"><span>Supporting receipt</span><select value={expenseSupport} onChange={event => setExpenseSupport(event.target.value)}><option value="">No committed voucher</option>{committedEvidence.map(file => <option key={file.id} value={file.id}>{file.originalName}</option>)}</select></label>
          <label className="business-field"><span>Expense description</span><textarea required minLength={10} maxLength={2000} value={expenseReason} onChange={event => setExpenseReason(event.target.value)} /></label>
          {!expenseSupport && <label className="business-field"><span>Specific reason the voucher is missing</span><textarea required minLength={10} maxLength={2000} value={missingSupportReason} onChange={event => setMissingSupportReason(event.target.value)} /></label>}
          <button className="btn sm" disabled={busy}>Save expense draft</button>
        </form>
        <form className="business-form business-commercial-form" onSubmit={saveRevenuePolicy}>
          <h3>Approve a revenue recognition policy</h3>
          <label className="business-field"><span>Policy name</span><input required minLength={1} maxLength={200} value={policyName} onChange={event => setPolicyName(event.target.value)} /></label>
          <label className="business-field"><span>Recognition rules</span><textarea required minLength={10} maxLength={10000} value={policyRules} onChange={event => setPolicyRules(event.target.value)} /></label>
          <button className="btn sm" disabled={busy || !isPartner}>Save Partner-approved policy</button>
        </form>
      </div>
      <form className="business-form business-commercial-form" onSubmit={recognizeRevenue}>
        <h3>Recognize earned engagement revenue</h3>
        <div className="business-form-grid"><label className="business-field"><span>Amount (QAR)</span><input required inputMode="decimal" value={recognitionAmount} onChange={event => setRecognitionAmount(event.target.value)} /></label>
          <label className="business-field"><span>Service / milestone basis</span><input required minLength={10} maxLength={5000} value={recognitionBasis} onChange={event => setRecognitionBasis(event.target.value)} /></label></div>
        <button className="btn sm" disabled={busy || !isPartner || !data.revenuePolicies.length}>Recognize revenue with current policy</button>
      </form>

      {isPartner && <form className="business-form business-commercial-form" onSubmit={recordWithdrawal}>
        <h3>Record a Partner equity withdrawal</h3><div className="business-form-grid">
          <label className="business-field"><span>Partner recipient</span><select required value={withdrawalPartnerId} onChange={event => setWithdrawalPartnerId(event.target.value)}><option value="">Choose Partner</option>{data.staff.filter(staff => staff.grade === 'PARTNER').map(staff => <option key={staff.id} value={staff.id}>{staff.displayName}</option>)}</select></label>
          <label className="business-field"><span>Date</span><input type="date" required value={withdrawalDate} onChange={event => setWithdrawalDate(event.target.value)} /></label>
          <label className="business-field"><span>Amount (QAR)</span><input required inputMode="decimal" value={withdrawalAmount} onChange={event => setWithdrawalAmount(event.target.value)} /></label>
          <label className="business-field"><span>Business purpose / rationale</span><textarea required minLength={10} value={withdrawalReason} onChange={event => setWithdrawalReason(event.target.value)} /></label>
        </div><button className="btn sm" disabled={busy}>Post approved equity withdrawal</button>
      </form>}
      {data.partnerWithdrawals.length > 0 && <div className="business-record-list"><h3>Partner withdrawal history</h3>{data.partnerWithdrawals.map(item => <div className="business-delivery-row" key={String(item.id)}><strong>{String(item.partnerName)} · {money(String(item.amountMinor))}</strong><span>{String(item.date)} · {String(item.reason)} · journal {String(item.journalId)}</span></div>)}</div>}

      {canReview && <form className="business-form business-commercial-form" onSubmit={reconcilePettyCash}>
        <h3>Reconcile petty cash</h3><div className="business-form-grid">
          <label className="business-field"><span>Cash control account</span><select required value={pettyCashAccountId} onChange={event => setPettyCashAccountId(event.target.value)}><option value="">Choose cash account</option>{data.accounts.filter(account => account.controlType === 'CASH' && Boolean(account.active)).map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
          <label className="business-field"><span>Named cash custodian</span><select required value={pettyCashCustodianId} onChange={event => setPettyCashCustodianId(event.target.value)}><option value="">Choose custodian</option>{data.staff.map(staff => <option key={staff.id} value={staff.id}>{staff.displayName} · {staff.grade}</option>)}</select></label>
          <label className="business-field"><span>Counted cash (QAR) as of {to}</span><input required inputMode="decimal" value={pettyCashCount} onChange={event => setPettyCashCount(event.target.value)} /></label>
          <label className="business-field"><span>Count explanation and evidence reference</span><textarea required minLength={10} value={pettyCashExplanation} onChange={event => setPettyCashExplanation(event.target.value)} /></label>
        </div><button className="btn sm" disabled={busy}>Save independent cash reconciliation</button>
      </form>}
      {data.pettyCashReconciliations.length > 0 && <div className="business-record-list"><h3>Petty-cash count history</h3>{data.pettyCashReconciliations.map(item => <div className="business-delivery-row" key={String(item.id)}><strong>{String(item.accountCode)} · {String(item.asOf)} · difference {money(String(item.differenceMinor))}</strong><span>Ledger {money(String(item.ledgerBalanceMinor))} · counted {money(String(item.countedCashMinor))} · custodian {String(item.custodianName)} · {String(item.explanation)}</span></div>)}</div>}

      {canManage && <form className="business-form business-commercial-form" onSubmit={saveAccount}>
        <h3>Extend firm chart of accounts</h3><div className="business-form-grid"><label className="business-field"><span>Code</span><input required maxLength={40} value={accountCode} onChange={event => setAccountCode(event.target.value)} /></label>
          <label className="business-field"><span>Name</span><input required maxLength={200} value={accountName} onChange={event => setAccountName(event.target.value)} /></label>
          <label className="business-field"><span>Classification</span><select value={accountType} onChange={event => setAccountType(event.target.value as typeof accountType)}>{['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map(item => <option key={item}>{item}</option>)}</select></label></div>
        <button className="btn sm" disabled={busy}>Add posting account</button>
      </form>}

      {canManage && <form className="business-form business-commercial-form" onSubmit={createJournal}>
        <h3>Create a balanced manual journal draft</h3><div className="business-form-grid">
          <label className="business-field"><span>Posting date</span><input type="date" required value={journalDate} onChange={event => setJournalDate(event.target.value)} /></label>
          <label className="business-field"><span>Description</span><input required minLength={5} maxLength={2000} value={journalMemo} onChange={event => setJournalMemo(event.target.value)} /></label>
          <label className="business-field"><span>Debit account</span><select required value={journalDebitAccount} onChange={event => setJournalDebitAccount(event.target.value)}><option value="">Choose account</option>{accountOptions.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
          <label className="business-field"><span>Credit account</span><select required value={journalCreditAccount} onChange={event => setJournalCreditAccount(event.target.value)}><option value="">Choose account</option>{accountOptions.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
          <label className="business-field"><span>Amount (QAR)</span><input required inputMode="decimal" value={journalAmount} onChange={event => setJournalAmount(event.target.value)} /></label>
        </div><button className="btn sm" disabled={busy}>Save journal draft</button>
      </form>}

      <h3>Firm journal activity</h3>
      {data.journals.length ? <div className="business-record-list">{data.journals.map(journal => <div className="business-delivery-row" key={journal.id}>
        <strong>{journal.number} · {journal.status}</strong><span>{journal.postingDate} · {journal.description} · debit {money(journal.debitTotalMinor)} / credit {money(journal.creditTotalMinor)}</span>
        {journal.status === 'DRAFT' && canReview && <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('ledger.post', { journalId: journal.id, expectedVersion: journal.version }, 'Journal independently posted.')}>Post journal</button>}
        {journal.status === 'POSTED' && canReview && <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('ledger.reverse', { journalId: journal.id, postingDate: today, reason: 'Reviewed source correction; preserve the posted original and append a reversing journal.' }, 'Reversal journal posted; original remains immutable.')}>Reverse</button>}
      </div>)}</div> : <p className="business-muted">No firm journals exist for the selected period.</p>}

      <h3>Internal firm trial balance</h3>
      <div className="business-table-wrap"><table className="business-table"><thead><tr><th>Account</th><th>Opening</th><th>Period debits</th><th>Period credits</th><th>Closing</th></tr></thead><tbody>
        {data.trialBalance.rows.map(row => <tr key={row.accountId}><td>{row.code} · {row.name}</td><td>{money(row.openingMinor)}</td><td>{money(row.periodDebitMinor)}</td><td>{money(row.periodCreditMinor)}</td><td>{money(row.closingMinor)}</td></tr>)}
      </tbody></table></div>

      {isPartner && <form className="business-form business-commercial-form" onSubmit={exportPracticeReport}>
        <h3>Export an immutable internal firm report</h3><div className="business-form-grid">
          <label className="business-field"><span>Report</span><select value={exportKind} onChange={event => setExportKind(event.target.value as typeof exportKind)}><option value="TRIAL_BALANCE">Firm trial balance</option><option value="MONTHLY_PROFIT_LOSS">Firm profit and loss</option></select></label>
          <label className="business-field"><span>Format</span><select value={exportFormat} onChange={event => setExportFormat(event.target.value as typeof exportFormat)}><option>CSV</option><option>XLSX</option><option>PDF</option></select></label>
          <label className="business-field"><span>Period start</span><input type="date" required value={from} onChange={event => setFrom(event.target.value)} /></label>
          <label className="business-field"><span>Period end</span><input type="date" required value={to} onChange={event => setTo(event.target.value)} /></label>
        </div><button className="btn sm" disabled={busy}>Generate verified report file</button>
      </form>}
      {data.reportSnapshots.length > 0 && <div className="business-record-list"><h3>Generated report snapshots</h3>{data.reportSnapshots.map(snapshot => <div className="business-delivery-row" key={snapshot.id}>
        <strong>{snapshot.kind.replaceAll('_', ' ')} · {snapshot.periodStart}–{snapshot.periodEnd}</strong><span>{snapshot.fileName ?? 'File generation pending'} · source {snapshot.sourceHash.slice(0, 16)}… · {snapshot.generatedAt}</span>
        {snapshot.fileVersionId && <button type="button" className="btn sm" disabled={Boolean(fileBusyId)} onClick={() => void downloadReport(snapshot)}>{fileBusyId === snapshot.fileVersionId ? 'Verifying…' : 'Download and verify file'}</button>}
      </div>)}</div>}

      {data.arAging && <>
        <div className="business-section-heading"><div><h3>Invoice aging as of {data.arAging.asOf}</h3><p>{data.arAging.reconciliationStatus}: difference {money(data.arAging.reconciliationDifferenceMinor)}</p></div></div>
        <div className="business-table-wrap"><table className="business-table"><thead><tr><th>Installment</th><th>Due date</th><th>Bucket</th><th>Outstanding</th><th>Allocate receipt</th></tr></thead><tbody>
          {data.arAging.invoices.map(invoice => <tr key={invoice.invoiceId}><td>{invoice.kind} · {invoice.number}</td><td>{invoice.dueDate}</td><td>{invoice.bucket}</td><td>{money(invoice.outstandingMinor)}</td><td>
            <button type="button" className="btn sm" onClick={() => setSelectedInvoiceId(invoice.invoiceId)}>Select invoice</button>
          </td></tr>)}
        </tbody></table></div>
        <p className="business-note">Current {money(data.arAging.buckets.CURRENT)} · 1–30 {money(data.arAging.buckets.DAYS_1_30)} · 31–60 {money(data.arAging.buckets.DAYS_31_60)} · 61–90 {money(data.arAging.buckets.DAYS_61_90)} · 91+ {money(data.arAging.buckets.DAYS_91_PLUS)} · unallocated cash {money(data.arAging.unallocatedMinor)} · AR control {money(data.arAging.controlAccountMinor)}</p>
        <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault(); if (!currentPayment || !currentInvoice) { setError('Choose a verified receipt and invoice before allocating.'); return; }
          try { void perform('payment.allocate', { paymentId: currentPayment.id, effectiveDate: today, allocations: [{ invoiceId: currentInvoice.invoiceId, amountMinor: qatarMinor(allocationAmount) }] }, 'Receipt allocation posted to firm AR.'); }
          catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter a valid allocation amount.'); } }}>
          <h3>Apply verified unallocated receipt</h3><div className="business-form-grid">
            <label className="business-field"><span>Receipt</span><select required value={selectedPaymentId} onChange={event => setSelectedPaymentId(event.target.value)}><option value="">Choose a receipt</option>{data.payments.filter(payment => !payment.reversesPaymentId && !payment.fullyReversed && BigInt(payment.remainingUnallocatedMinor) > 0n && payment.receiptStatus === 'ISSUED').map(payment => <option key={payment.id} value={payment.id}>{payment.receiptNumber} · available {money(payment.remainingUnallocatedMinor)}</option>)}</select></label>
            <label className="business-field"><span>Invoice</span><select required value={selectedInvoiceId} onChange={event => setSelectedInvoiceId(event.target.value)}><option value="">Choose invoice</option>{data.arAging.invoices.filter(invoice => invoice.clientId === currentPayment?.clientId && invoice.engagementId === currentPayment?.engagementId).map(invoice => <option key={invoice.invoiceId} value={invoice.invoiceId}>{invoice.number} · {money(invoice.outstandingMinor)} outstanding</option>)}</select></label>
            <label className="business-field"><span>Amount (QAR)</span><input required inputMode="decimal" value={allocationAmount} onChange={event => setAllocationAmount(event.target.value)} /></label>
          </div><button className="btn sm" disabled={busy || !canReview}>Post explicit allocation</button>
        </form>
        {canReview && <form className="business-form business-commercial-form" onSubmit={issueCreditNote}>
          <h3>Issue a reasoned credit note</h3><div className="business-form-grid">
            <label className="business-field"><span>Issued invoice</span><select required value={creditInvoiceId} onChange={event => setCreditInvoiceId(event.target.value)}><option value="">Choose an outstanding invoice</option>{data.arAging.invoices.filter(invoice => BigInt(invoice.outstandingMinor) > 0n).map(invoice => <option key={invoice.invoiceId} value={invoice.invoiceId}>{invoice.number} · outstanding {money(invoice.outstandingMinor)}</option>)}</select></label>
            <label className="business-field"><span>Credit amount (QAR)</span><input required inputMode="decimal" value={creditNoteAmount} onChange={event => setCreditNoteAmount(event.target.value)} /></label>
            <label className="business-field"><span>Reason and approval basis</span><textarea required minLength={10} value={creditNoteReason} onChange={event => setCreditNoteReason(event.target.value)} /></label>
          </div><button className="btn sm" disabled={busy || !creditInvoiceId}>Issue credit note and post journal</button>
        </form>}
        {data.creditNotes.length > 0 && <div className="business-record-list"><h3>Credit note history</h3>{data.creditNotes.map(note => <div className="business-delivery-row" key={String(note.id)}><strong>{String(note.invoiceNumber)} · {money(String(note.amountMinor))}</strong><span>{String(note.date)} · {String(note.reason)} · journal {String(note.journalId)}</span></div>)}</div>}
        {canReview && <form className="business-form business-commercial-form" onSubmit={reverseAllocation}>
          <h3>Reverse an invoice allocation</h3><div className="business-form-grid">
            <label className="business-field"><span>Existing receipt allocation</span><select required value={allocationToReverseId} onChange={event => setAllocationToReverseId(event.target.value)}><option value="">Choose allocation</option>{data.paymentAllocations.filter(allocation => BigInt(String(allocation.amountMinor)) > BigInt(String(allocation.reversedMinor))).map(allocation => <option key={String(allocation.id)} value={String(allocation.id)}>{String(allocation.invoiceNumber)} · allocated {money(String(allocation.amountMinor))} · reversed {money(String(allocation.reversedMinor))}</option>)}</select></label>
            <label className="business-field"><span>Reversal amount (QAR)</span><input required inputMode="decimal" value={allocationReverseAmount} onChange={event => setAllocationReverseAmount(event.target.value)} /></label>
            <label className="business-field"><span>Reversal reason</span><textarea required minLength={10} value={allocationReverseReason} onChange={event => setAllocationReverseReason(event.target.value)} /></label>
          </div>{selectedAllocation && <p className="business-note">Remaining allocation {money(String(BigInt(String(selectedAllocation.amountMinor)) - BigInt(String(selectedAllocation.reversedMinor))))} · original receipt {String(selectedAllocation.paymentId)}.</p>}
          <button className="btn sm" disabled={busy || !allocationToReverseId}>Post allocation reversal</button>
        </form>}
      </>}
      {data.expenses.length > 0 && <><h3>Expense records</h3><div className="business-record-list">{data.expenses.map(expense => <div className="business-delivery-row" key={expense.id}><strong>{expense.category} · {expense.payee} · {money(expense.amountMinor)}</strong><span>{expense.date} · {expense.description} · {expense.status}</span>
        {expense.status === 'DRAFT' && canReview && <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('expense.approve-and-post', { expenseId: expense.id }, 'Expense approved and posted to the firm ledger.')}>Approve and post</button>}
      </div>)}</div></>}
    </>}
  </section>;
}
