// Module 15: Receivables Aging & Offline Receipts Allocation (VP-032, VP-033)
import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, ReceiptRecord, InvoiceRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { calculateReceivablesAging, formatCurrency } from '../../services/calculations';
import { exportService } from '../../services/exportService';
import { visibleClientIds } from '../../services/guards';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { ListState } from '../common/Enterprise';

interface ReceivablesViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
  onBeforeContextChange?: (change: () => void) => void;
}

export const ReceivablesView: React.FC<ReceivablesViewProps> = ({ onNavigate, onRegisterUnsavedForm, onBeforeContextChange }) => {
  const state = prototypeStore.getSnapshot();
  const allowedClientIds = visibleClientIds(state);
  const scopedClients = state.clients.filter(c => allowedClientIds === 'ALL' || allowedClientIds.includes(c.id));
  const currencies = Array.from(new Set([
    ...state.invoices.filter(i => allowedClientIds === 'ALL' || allowedClientIds.includes(i.clientId)).map(i => i.currency),
    ...state.receipts.filter(r => allowedClientIds === 'ALL' || allowedClientIds.includes(r.clientId)).map(r => r.currency)
  ])).sort();
  const [clientFilter, setClientFilter] = useState('ALL');
  const [currencyFilter, setCurrencyFilter] = useState(currencies[0] || 'QAR');
  const [asOfDate, setAsOfDate] = useState(state.asOfDate || '2026-09-23');
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [selectedAgingBucket, setSelectedAgingBucket] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRecord | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New receipt form
  const [receiptNumber, setReceiptNumber] = useState(`RCP-2600${state.receipts.length + 1}`);
  const [receiptAmount, setReceiptAmount] = useState(150000);
  const [method, setMethod] = useState<ReceiptRecord['method']>('Bank transfer');
  const [reference, setReference] = useState('TX-QNB-998822');

  // Allocation form
  const [targetInvoiceId, setTargetInvoiceId] = useState<string>('');
  const [allocateAmount, setAllocateAmount] = useState<number>(0);
  const receiptBaseline = useRef({ receiptNumber, receiptAmount, method, reference });
  const allocationBaseline = useRef({ targetInvoiceId, allocateAmount, receiptId: selectedReceipt?.id || '' });

  const client = scopedClients.find(c => c.id === clientFilter) || scopedClients[0];
  const invoices = state.invoices.filter(i =>
    (allowedClientIds === 'ALL' || allowedClientIds.includes(i.clientId)) &&
    (clientFilter === 'ALL' || i.clientId === clientFilter) && i.currency === currencyFilter && (i.issueDate || i.due) <= asOfDate
  );
  const receiptLedger = state.receipts.filter(r =>
    (allowedClientIds === 'ALL' || allowedClientIds.includes(r.clientId)) &&
    (clientFilter === 'ALL' || r.clientId === clientFilter) && r.currency === currencyFilter
  );
  const receipts = receiptLedger.filter(r => r.date <= asOfDate);
  const credits = state.creditNotes.filter(c =>
    (allowedClientIds === 'ALL' || allowedClientIds.includes(c.clientId)) &&
    (clientFilter === 'ALL' || c.clientId === clientFilter) && (c.currency || invoices.find(i => i.id === c.invoiceId)?.currency) === currencyFilter
  );

  const aging = calculateReceivablesAging(invoices, credits, receiptLedger, asOfDate, clientFilter === 'ALL' ? undefined : clientFilter);
  const agingMetrics = [
    { label: 'Current', value: aging.current, bucket: 'Current', tone: '', detail: 'Not overdue' },
    { label: '1–30 Days', value: aging.days1_30, bucket: '1–30 days', tone: 'blue', detail: 'Follow-up due' },
    { label: '31–60 Days', value: aging.days31to60, bucket: '31–60 days', tone: 'amber', detail: 'Management follow-up' },
    { label: '61–90 Days', value: aging.days61to90, bucket: '61–90 days', tone: 'purple', detail: 'Escalation recommended' },
    { label: '90+ Days', value: aging.olderThan90, bucket: 'Over 90 days', tone: 'red', detail: `Total overdue: ${formatCurrency(aging.totalOverdue, currencyFilter)}` }
  ];
  const agingDetails = aging.invoiceBreakdown.filter(row => !selectedAgingBucket || row.bucket === selectedAgingBucket);
  const invoicePaymentsAsOf = (invoice: InvoiceRecord) => {
    const ledger = receiptLedger.flatMap(rec => rec.allocations
      .filter(allocation => allocation.invoiceId === invoice.id)
      .map(allocation => ({ allocation, receiptDate: rec.date })));
    if (!ledger.length) return invoice.paid;
    return ledger.filter(({ allocation, receiptDate }) => {
      const allocatedDate = (allocation.date || allocation.allocatedAt || receiptDate).slice(0, 10);
      return allocatedDate <= asOfDate && (!allocation.reversed || !allocation.reversalDate || allocation.reversalDate > asOfDate);
    }).reduce((sum, item) => sum + item.allocation.amount, 0);
  };
  const statementInvoices = clientFilter === 'ALL' ? [] : invoices.filter(inv => inv.clientId === client?.id && (inv.status === 'Issued' || inv.status === 'Paid') && (inv.issueDate || inv.due) <= asOfDate);
  const statementCredits = clientFilter === 'ALL' ? [] : credits.filter(credit => credit.clientId === client?.id && credit.status === 'Issued' && credit.issueDate <= asOfDate);
  const statementReceipts = clientFilter === 'ALL' ? [] : receipts.filter(rec => rec.clientId === client?.id && rec.date <= asOfDate);
  const statementRows = [
    ['Document No', 'Date', 'Type', 'Currency', 'Billed Amount', 'Paid / Allocated', 'Balance'],
    ...statementInvoices.map(inv => {
      const paid = invoicePaymentsAsOf(inv);
      return [inv.invoiceNumber, inv.issueDate || inv.due || '', 'Invoice', inv.currency, inv.amount.toString(), paid.toString(), (inv.amount - paid).toString()];
    }),
    ...statementCredits.map(credit => [credit.creditNumber, credit.issueDate, 'Credit note', credit.currency || currencyFilter, String(-credit.amount), '0', String(-credit.amount)]),
    ...statementReceipts.map(rec => {
      const allocated = rec.allocations.filter(allocation => {
        const allocatedDate = (allocation.date || allocation.allocatedAt || rec.date).slice(0, 10);
        return allocatedDate <= asOfDate && (!allocation.reversed || !allocation.reversalDate || allocation.reversalDate > asOfDate);
      }).reduce((sum, allocation) => sum + allocation.amount, 0);
      return [rec.receiptNumber, rec.date, 'Receipt', rec.currency, `-${rec.amount}`, allocated.toString(), (rec.amount - allocated).toString()];
    })
  ];

  const saveReceiptDraft = () => {
    const newRec: ReceiptRecord = {
      id: `RCP-${Date.now().toString().slice(-4)}`,
      clientId: client?.id || 'CL-001',
      receiptNumber,
      amount: receiptAmount,
      allocatedAmount: 0,
      currency: currencyFilter,
      date: new Date().toISOString().split('T')[0],
      method,
      reference,
      externalRef: reference,
      allocations: []
    };

    try { prototypeStore.addReceipt(newRec); setShowReceiptModal(false); const nextNumber = `RCP-2600${prototypeStore.getSnapshot().receipts.length + 1}`; setReceiptNumber(nextNumber); receiptBaseline.current = { receiptNumber: nextNumber, receiptAmount, method, reference }; return true; }
    catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Receipt could not be recorded.' }); return false; }
  };

  const handleAddReceipt = (e: React.FormEvent) => { e.preventDefault(); saveReceiptDraft(); };
  const saveAllocationDraft = () => {
    if (!selectedReceipt || !targetInvoiceId || allocateAmount <= 0) return false;
    try {
      prototypeStore.allocateReceipt(selectedReceipt.id, targetInvoiceId, allocateAmount);
      setShowAllocateModal(false);
      allocationBaseline.current = { targetInvoiceId, allocateAmount, receiptId: selectedReceipt.id };
      setSelectedReceipt(null);
      setNotice({ type: 'success', text: `Allocated ${formatCurrency(allocateAmount, selectedReceipt.currency)} to invoice ${targetInvoiceId}.` });
      setTimeout(() => setNotice(null), 4000);
      return true;
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
      return false;
    }
  };
  const handleAllocate = (e: React.FormEvent) => { e.preventDefault(); saveAllocationDraft(); };

  const discardReceiptDraft = () => { setShowReceiptModal(false); setReceiptNumber(`RCP-2600${prototypeStore.getSnapshot().receipts.length + 1}`); setReceiptAmount(150000); setMethod('Bank transfer'); setReference('TX-QNB-998822'); };
  const discardAllocationDraft = () => { setShowAllocateModal(false); setSelectedReceipt(null); setTargetInvoiceId(''); setAllocateAmount(0); };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    onRegisterUnsavedForm({ label: 'offline receipt draft', isDirty: () => showReceiptModal && (receiptNumber !== receiptBaseline.current.receiptNumber || receiptAmount !== receiptBaseline.current.receiptAmount || method !== receiptBaseline.current.method || reference !== receiptBaseline.current.reference), save: saveReceiptDraft, discard: discardReceiptDraft }, 'receivables-receipt-draft');
    onRegisterUnsavedForm({ label: 'receipt allocation draft', isDirty: () => showAllocateModal && Boolean(selectedReceipt) && (targetInvoiceId !== allocationBaseline.current.targetInvoiceId || allocateAmount !== allocationBaseline.current.allocateAmount || selectedReceipt?.id !== allocationBaseline.current.receiptId), save: saveAllocationDraft, discard: discardAllocationDraft }, 'receivables-allocation-draft');
    return () => { onRegisterUnsavedForm(null, 'receivables-receipt-draft'); onRegisterUnsavedForm(null, 'receivables-allocation-draft'); };
  }, [onRegisterUnsavedForm, showReceiptModal, showAllocateModal, receiptNumber, receiptAmount, method, reference, selectedReceipt, targetInvoiceId, allocateAmount]);

  const openReceiptModal = () => { receiptBaseline.current = { receiptNumber, receiptAmount, method, reference }; setShowReceiptModal(true); };
  const openAllocationModal = (receipt: ReceiptRecord) => {
    const unallocated = receipt.amount - receipt.allocatedAmount;
    const unpaid = invoices.find(invoice => invoice.paid < invoice.amount);
    setSelectedReceipt(receipt); setAllocateAmount(unallocated); setTargetInvoiceId(unpaid?.id || '');
    allocationBaseline.current = { targetInvoiceId: unpaid?.id || '', allocateAmount: unallocated, receiptId: receipt.id };
    setShowAllocateModal(true);
  };

  const handleReverse = (receipt: ReceiptRecord, index: number) => {
    const reason = prompt('Please enter the reason for allocation reversal:');
    if (!reason) return;
    prototypeStore.reverseAllocation(receipt.id, index, reason);
  };

  const handleExportStatementCSV = () => {
    if (clientFilter === 'ALL') return;
    exportService.exportCSV(`Client_Statement_${client?.id}_${asOfDate}`, statementRows);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Accounts Receivable Aging & Receipts</h1>
          <p>Deterministic 30-day aging buckets, offline manual cash receipts, and audit trail reversals.</p>
          <div className="row mt12" style={{ gap: 10, flexWrap: 'wrap' }}>
            <label className="caption">Client
            <select className="input" aria-label="Receivables client" value={clientFilter} onChange={e => { const value = e.target.value; onBeforeContextChange ? onBeforeContextChange(() => setClientFilter(value)) : setClientFilter(value); }}>
                <option value="ALL">All permitted clients</option>
                {scopedClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="caption">Currency
              <select className="input" aria-label="Receivables currency" value={currencyFilter} onChange={e => { const value = e.target.value; onBeforeContextChange ? onBeforeContextChange(() => setCurrencyFilter(value)) : setCurrencyFilter(value); }}>
                {currencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </label>
            <label className="caption">As of
              <input className="input" aria-label="Receivables as of date" type="date" value={asOfDate} onChange={e => { const value = e.target.value; onBeforeContextChange ? onBeforeContextChange(() => setAsOfDate(value)) : setAsOfDate(value); }} />
            </label>
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={handleExportStatementCSV} disabled={clientFilter === 'ALL'} title={clientFilter === 'ALL' ? 'Select one client to export a statement.' : undefined}>
            <Icon name="download" /> Export Statement CSV
          </button>
          <button className="btn sm ghost" onClick={() => window.print()} disabled={clientFilter === 'ALL'} title={clientFilter === 'ALL' ? 'Select one client to print a statement.' : undefined}>
            Print Statement
          </button>
          <button className="btn primary sm" onClick={openReceiptModal} disabled={clientFilter === 'ALL'} title={clientFilter === 'ALL' ? 'Select one client to record a receipt.' : undefined}>
            <Icon name="plus" /> Record Offline Receipt
          </button>
        </div>
      </div>

      {notice && (
        <div className={`badge ${notice.type === 'error' ? 'danger' : 'success'}`} style={{ padding: '8px 12px', display: 'block', fontSize: 13 }}>
          {notice.text}
        </div>
      )}

      <div className="panel panel-pad receivables-statement">
        <div className="panel-head">
          <div>
            <h3>Client Account Statement</h3>
            {clientFilter !== 'ALL' && <span className="caption">{client?.name} · {currencyFilter} · As of {asOfDate}</span>}
          </div>
          {clientFilter === 'ALL' && <span className="caption">Select one permitted client to view or print a statement.</span>}
        </div>
        {clientFilter !== 'ALL' && <div className="tablewrap"><table>
          <thead><tr>{statementRows[0].map(header => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{statementRows.slice(1).map((row, i) => <tr key={`${row[0]}-${i}`}>{row.map((value, col) => <td key={col}>{value}</td>)}</tr>)}</tbody>
        </table></div>}
      </div>

      {/* Aging Metric Cards */}
      <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {agingMetrics.map(({ label, value, bucket, tone, detail }) => <button key={bucket} type="button" className={`metric ${tone}`} aria-label={`${label}: ${formatCurrency(value, currencyFilter)}`} aria-pressed={selectedAgingBucket === bucket} onClick={() => setSelectedAgingBucket(selectedAgingBucket === bucket ? '' : bucket)} style={{ color: 'inherit', textAlign: 'left', width: '100%' }}>
          <div className="metric-label">{label}</div>
          <div className="metric-val">{formatCurrency(value, currencyFilter)}</div>
          <span className="metric-sub">{detail}</span>
        </button>)}
      </div>

      <div className="panel">
        <div className="panel-head between"><div><h3>{selectedAgingBucket ? `${selectedAgingBucket} invoice detail` : 'Outstanding invoice detail'}</h3><p className="sub">{agingDetails.length} issued invoice(s) · {currencyFilter} · as of {asOfDate}</p></div>{selectedAgingBucket && <button className="btn sm ghost" onClick={() => setSelectedAgingBucket('')}>Show all</button>}</div>
        <div className="tablewrap"><table><thead><tr><th>Invoice</th><th>Client</th><th>Due</th><th>Gross</th><th>Credits</th><th>Payments</th><th>Outstanding</th><th>Aging</th><th>Days overdue</th></tr></thead><tbody>
          {agingDetails.map(row => <tr key={row.invoice.id} data-outstanding={row.outstanding}><td><b>{row.invoice.invoiceNumber}</b></td><td>{scopedClients.find(c => c.id === row.invoice.clientId)?.name || row.invoice.clientId}</td><td>{row.invoice.due}</td><td>{formatCurrency(row.grossAmount, currencyFilter)}</td><td>{formatCurrency(row.effectiveCredits, currencyFilter)}</td><td>{formatCurrency(row.effectivePayments, currencyFilter)}</td><td><b>{formatCurrency(row.outstanding, currencyFilter)}</b></td><td>{row.bucket}</td><td>{row.daysOverdue}</td></tr>)}
          {!agingDetails.length && (
            state.invoices.length === 0
              ? <ListState colSpan={9} kind="empty" message="No invoice records yet" hint="Issued invoices appear here once billing has issued them; receipts and credit notes then allocate against them." />
              : <ListState colSpan={9} kind="no-match" message="No outstanding invoices match these filters" hint="Issued invoices exist in this practice but none remain outstanding under the selected currency and aging bucket." />
          )}
        </tbody></table></div>
      </div>

      {/* Receipts Register */}
      <div className="panel">
        <div className="panel-head">
          <h3>Offline Bank Receipts ({receipts.length})</h3>
          <span className="caption">Manual Wire / Cheque Reconciliations</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Method</th>
                <th>Bank Reference</th>
                <th>Date</th>
                <th>Total Received</th>
                <th>Allocated</th>
                <th>Unallocated Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map(r => {
                const unallocated = r.amount - r.allocatedAmount;
                return (
                  <tr key={r.id}>
                    <td><b>{r.receiptNumber}</b></td>
                    <td>{r.method}</td>
                    <td><span className="mono">{r.reference}</span></td>
                    <td>{r.date}</td>
                    <td><b>{formatCurrency(r.amount, r.currency)}</b></td>
                    <td>{formatCurrency(r.allocatedAmount, r.currency)}</td>
                    <td>
                      <b style={{ color: unallocated > 0 ? 'var(--blue)' : 'var(--text)' }}>
                        {formatCurrency(unallocated, r.currency)}
                      </b>
                    </td>
                    <td>
                      {unallocated > 0 && (
                        <button
                          className="btn sm primary"
                          onClick={() => openAllocationModal(r)}
                        >
                          Allocate to Invoice
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Allocations History */}
      <div className="panel panel-pad">
        <h3>Receipt Allocations & Audit Trail</h3>
        <div className="stack mt12" style={{ gap: 8 }}>
          {receipts.flatMap(r => r.allocations.map((a, idx) => ({ ...a, receipt: r, index: idx }))).map(item => {
            const inv = invoices.find(i => i.id === item.invoiceId);
            return (
              <div key={`${item.receipt.id}-${item.index}`} className="between borderbox" style={{ padding: 10 }}>
                <div>
                  <b>{item.receipt.receiptNumber}</b> allocated <b>{formatCurrency(item.amount)}</b> to <b>{inv?.invoiceNumber || item.invoiceId}</b>
                  <div className="cell-sub">
                    {new Date(item.allocatedAt).toLocaleString('en-GB')}
                    {item.reversed && <span style={{ color: 'red', marginLeft: 8 }}>(Reversed: {item.reversalReason})</span>}
                  </div>
                </div>
                {!item.reversed && (
                  <button
                    className="btn sm ghost"
                    onClick={() => handleReverse(item.receipt, item.index)}
                  >
                    Reverse Allocation
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Record Receipt Modal */}
      {showReceiptModal && (
        <div className="modal-backdrop" onClick={discardReceiptDraft}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Record Offline Bank Receipt</h2>
              <button type="button" className="icon-btn" aria-label="Close receipt dialog" onClick={discardReceiptDraft}>✕</button>
            </div>
            <form onSubmit={handleAddReceipt}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Receipt Number</label>
                  <input
                    type="text"
                    className="input"
                    value={receiptNumber}
                    onChange={e => setReceiptNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Payment Method</label>
                    <select
                      className="input"
                      value={method}
                      onChange={e => setMethod(e.target.value as any)}
                    >
                      <option value="Bank transfer">Bank Wire / Transfer</option>
                      <option value="Cheque">Corporate Cheque</option>
                      <option value="Cash">Cash</option>
                      <option value="Other">Other (recorded offline)</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Amount ({currencyFilter})</label>
                    <input
                      type="number"
                      className="input"
                      value={receiptAmount}
                      onChange={e => setReceiptAmount(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="caption">Bank Reference / Cheque No.</label>
                  <input
                    type="text"
                    className="input"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder="e.g. TX-QNB-998822"
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardReceiptDraft}>Cancel</button>
                <button type="submit" className="btn primary sm">Record Receipt</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Allocate Modal */}
      {showAllocateModal && selectedReceipt && (
        <div className="modal-backdrop" onClick={discardAllocationDraft}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Allocate Receipt {selectedReceipt.receiptNumber}</h2>
              <button type="button" className="icon-btn" aria-label="Close allocation dialog" onClick={discardAllocationDraft}>✕</button>
            </div>
            <form onSubmit={handleAllocate}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Unallocated Funds Available</label>
                  <div><b>{formatCurrency(selectedReceipt.amount - selectedReceipt.allocatedAmount, selectedReceipt.currency)}</b></div>
                </div>
                <div>
                  <label className="caption">Select Outstanding Invoice</label>
                  <select
                    className="input"
                    value={targetInvoiceId}
                    onChange={e => setTargetInvoiceId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Invoice --</option>
                    {invoices.filter(i => i.paid < i.amount).map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} (Owed: {formatCurrency(inv.amount - inv.paid, inv.currency)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="caption">Amount to Allocate ({currencyFilter})</label>
                  <input
                    type="number"
                    max={selectedReceipt.amount - selectedReceipt.allocatedAmount}
                    className="input"
                    value={allocateAmount}
                    onChange={e => setAllocateAmount(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardAllocationDraft}>Cancel</button>
                <button type="submit" className="btn primary sm">Apply Allocation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
