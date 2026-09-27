// Module 14: Invoicing, Billing & Credit Notes (VP-030, VP-031)
import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, InvoiceRecord, InvoiceLineItem, CreditNoteRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { invoiceTaxLine, formatCurrency, getEffectiveTimeEntries } from '../../services/calculations';
import { exportService } from '../../services/exportService';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

import { ListState, ModuleIdentityLine, ModuleLifecycleHint, StatusBadge } from '../common/Enterprise';
interface BillingInvoicingViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const BillingInvoicingView: React.FC<BillingInvoicingViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [selectedTimeSourceIds, setSelectedTimeSourceIds] = useState<string[]>([]);
  const [selectedFixedServiceSource, setSelectedFixedServiceSource] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [invoiceEditReason, setInvoiceEditReason] = useState('');
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [editingCreditId, setEditingCreditId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New draft invoice form — numbering and due-date defaults come from the saved firm settings
  // (VP-062-AC01/AC02 prospective application).
  const [invNumber, setInvNumber] = useState(() => `${state.firmSettings.invoiceNumberPrefix}${state.firmSettings.invoiceNextNumber}`);
  const [description, setDescription] = useState('Interim audit fee billing - Phase 1 Fieldwork');
  const [amount, setAmount] = useState(200000);
  const [additionalLines, setAdditionalLines] = useState<Array<{ description: string; quantity: number; rate: number }>>([]);
  const [due, setDue] = useState(() => {
    const base = new Date(`${state.asOfDate}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + state.firmSettings.paymentTermsDays);
    return base.toISOString().slice(0, 10);
  });

  // Credit note form
  const [creditAmount, setCreditAmount] = useState(25000);
  const [creditReason, setCreditReason] = useState('Commercial fee adjustment approved by partner');
  const invoiceDraft = { invNumber, description, amount, additionalLines, due, selectedTimeSourceIds, selectedFixedServiceSource, editingInvoiceId, invoiceEditReason };
  const initialInvoiceDraft = useRef(JSON.stringify(invoiceDraft));
  const creditDraft = { creditAmount, creditReason };
  const initialCreditDraft = useRef(JSON.stringify(creditDraft));

  const invoices = state.invoices;
  const selectedEngagement = state.engagements.find(e => e.id === state.selectedEngagement);
  const client = state.clients.find(c => c.id === selectedEngagement?.client);
  const currency = selectedEngagement?.currency || 'QAR';
  const availableTimeSources = getEffectiveTimeEntries(state.times).filter(time =>
    time.status === 'Approved' && time.billable && !time.supersedesId && !time.billedInvoiceId &&
    time.clientId === client?.id && time.engagementId === selectedEngagement?.id &&
    time.currency === selectedEngagement?.currency && Number.isFinite(time.billingRatePerHour) && (time.billingRatePerHour || 0) > 0 &&
    !invoices.some(invoice => invoice.status !== 'Cancelled' && invoice.lines.some(line => line.sourceType === 'Time entry' && line.sourceId === time.id))
  );
  const acceptedProposal = state.proposals.find(proposal => proposal.id === selectedEngagement?.proposalId && proposal.state === 'Accepted' && proposal.items.some(item => item.feeModel === 'Fixed'));
  const fixedServiceTotal = acceptedProposal?.items.filter(item => item.feeModel === 'Fixed').reduce((sum, item) => sum + item.amount, 0) || 0;
  const fixedServiceBilled = invoices.filter(invoice => invoice.clientId === client?.id && (invoice.engagementId || invoice.eng) === selectedEngagement?.id && invoice.status !== 'Cancelled').flatMap(invoice => invoice.lines).filter(line => line.sourceType === 'Fixed service').reduce((sum, line) => sum + line.amount, 0);
  const fixedServiceRemaining = Math.max(0, fixedServiceTotal - fixedServiceBilled);
  const fixedServiceSourceId = acceptedProposal ? `proposal:${acceptedProposal.id}:r${acceptedProposal.revision}` : '';
  const selectedTimeSources = availableTimeSources.filter(time => selectedTimeSourceIds.includes(time.id));
  const selectedFixedService = selectedFixedServiceSource && fixedServiceRemaining > 0;
  const sourcedTotal = Math.round((selectedTimeSources.reduce((sum, time) => sum + time.durationMinutes / 60 * (time.billingRatePerHour || 0), 0) + (selectedFixedService ? fixedServiceRemaining : 0)) * 100) / 100;
  const hasSources = selectedTimeSources.length > 0 || selectedFixedService;

  const saveInvoiceDraft = () => {
    if (!showDraftModal) return true;
    const previousRevision = editingInvoiceId ? state.invoices.find(item => item.id === editingInvoiceId)?.revision || 1 : undefined;
    handleCreateDraft(new Event('submit') as unknown as React.FormEvent);
    const latest = prototypeStore.getSnapshot();
    const saved = editingInvoiceId
      ? (latest.invoices.find(item => item.id === editingInvoiceId)?.revision || 1) > (previousRevision || 1)
      : latest.invoices.length > invoices.length;
    if (saved) initialInvoiceDraft.current = JSON.stringify(invoiceDraft);
    return saved;
  };
  const saveCreditDraft = () => {
    if (!showCreditModal || !selectedInvoice) return true;
    const previousCreditCount = state.creditNotes.length;
    handleCreateCredit(new Event('submit') as unknown as React.FormEvent);
    const latestCredits = prototypeStore.getSnapshot().creditNotes;
    const saved = editingCreditId
      ? latestCredits.some(credit => credit.id === editingCreditId && credit.amount === creditAmount && credit.reason === creditReason.trim() && !credit.reviewedBy && !credit.reviewedRevision)
      : latestCredits.length > previousCreditCount;
    if (saved) initialCreditDraft.current = JSON.stringify(creditDraft);
    return saved;
  };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const guards: UnsavedFormGuard[] = [
      { label: 'Invoice draft', isDirty: () => showDraftModal, save: saveInvoiceDraft, discard: () => { setShowDraftModal(false); setSelectedTimeSourceIds([]); setSelectedFixedServiceSource(false); } },
      { label: 'Credit note draft', isDirty: () => showCreditModal && JSON.stringify(creditDraft) !== initialCreditDraft.current, save: saveCreditDraft, discard: () => { setShowCreditModal(false); setSelectedInvoice(null); setEditingCreditId(null); } }
    ];
    onRegisterUnsavedForm(guards[0], 'billing-invoice-draft');
    onRegisterUnsavedForm(guards[1], 'billing-credit-draft');
    return () => { onRegisterUnsavedForm(null, 'billing-invoice-draft'); onRegisterUnsavedForm(null, 'billing-credit-draft'); };
  }, [showDraftModal, showCreditModal, selectedInvoice, invoiceDraft, creditDraft, onRegisterUnsavedForm]);

  const handleCreateDraft = (e: React.FormEvent) => {
    e.preventDefault();

    const lines: InvoiceLineItem[] = selectedTimeSources.length
      ? selectedTimeSources.map(time => ({
        id: `LINE-${time.id}`,
        description: `${time.date} · ${time.taskTitle} · ${time.person}`,
        quantity: time.durationMinutes / 60,
        rate: time.billingRatePerHour!,
        amount: Math.round(time.durationMinutes / 60 * time.billingRatePerHour! * 100) / 100,
        sourceType: 'Time entry' as const,
        sourceId: time.id
      }))
      : [];
    if (selectedFixedService && acceptedProposal) lines.push({
      id: `LINE-${fixedServiceSourceId}`,
      description: `Accepted fixed-fee services · ${acceptedProposal.items.filter(item => item.feeModel === 'Fixed').map(item => item.serviceName).join(', ')}`,
      quantity: 1,
      rate: fixedServiceRemaining,
      amount: fixedServiceRemaining,
      sourceType: 'Fixed service' as const,
      sourceId: fixedServiceSourceId
    });
    if (lines.length === 0) {
      lines.push({ id: 'LINE-ADHOC-1', description: description.trim(), quantity: 1, rate: amount, amount: Math.round(amount * 100) / 100, sourceType: 'Ad hoc' as const });
      additionalLines.forEach((line, index) => lines.push({
        id: `LINE-ADHOC-${index + 2}`,
        description: line.description.trim(),
        quantity: line.quantity,
        rate: line.rate,
        amount: Math.round(line.quantity * line.rate * 100) / 100,
        sourceType: 'Ad hoc'
      }));
    }
    const adHocTotal = lines.filter(line => line.sourceType === 'Ad hoc').reduce((sum, line) => sum + line.amount, 0);

    const originalInvoice = editingInvoiceId ? state.invoices.find(item => item.id === editingInvoiceId) : undefined;
    const newInv: InvoiceRecord = {
      id: originalInvoice?.id || `INV-${Date.now().toString().slice(-4)}`,
      clientId: originalInvoice?.clientId || client?.id || 'CL-001',
      eng: originalInvoice?.eng || state.selectedEngagement,
      engagementId: originalInvoice?.engagementId || state.selectedEngagement,
      invoiceNumber: invNumber,
      description: hasSources ? `Approved source billing · ${lines.length} lines` : description,
      amount: hasSources ? sourcedTotal : adHocTotal,
      paid: originalInvoice?.paid || 0,
      creditsApplied: originalInvoice?.creditsApplied || 0,
      currency: originalInvoice?.currency || currency,
      billingDetails: originalInvoice?.billingDetails || (client ? {
        accountName: client.name,
        contactName: client.contact,
        email: client.email,
        phone: client.phone,
        address: client.address,
        registrationNumber: client.registrationNumber
      } : undefined),
      issueDate: originalInvoice?.issueDate || state.asOfDate,
      due,
      status: 'Draft',
      preparedBy: originalInvoice?.preparedBy || state.currentPerson,
      lines
    };

    // Source-linked revision: pinned time/fixed-service lines are carried over byte-for-byte
    // (the store rejects any change to them); ad-hoc lines are rebuilt from the editor.
    if (originalInvoice && originalInvoice.lines.some(line => line.sourceType !== 'Ad hoc')) {
      const originalAdHoc = originalInvoice.lines.filter(line => line.sourceType === 'Ad hoc');
      const revisedAdHoc = additionalLines.map((line, index) => ({
        id: originalAdHoc[index]?.id || `LINE-ADHOC-R${index + 1}`,
        description: line.description.trim(),
        quantity: line.quantity,
        rate: line.rate,
        amount: Math.round(line.quantity * line.rate * 100) / 100,
        sourceType: 'Ad hoc' as const
      }));
      newInv.lines = [...originalInvoice.lines.filter(line => line.sourceType !== 'Ad hoc').map(line => ({ ...line })), ...revisedAdHoc];
      newInv.amount = Math.round(newInv.lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
      newInv.description = description;
    }

    try {
      if (originalInvoice) {
        prototypeStore.reviseInvoiceDraft(originalInvoice.id, { description: newInv.description, due: newInv.due, amount: newInv.amount, lines: newInv.lines, reason: invoiceEditReason });
        setNotice({ type: 'success', text: `Invoice ${originalInvoice.invoiceNumber} saved as revision ${(originalInvoice.revision || 1) + 1}; independent review is required again.` });
      } else prototypeStore.addInvoice(newInv);
      setSelectedTimeSourceIds([]);
      setSelectedFixedServiceSource(false);
      setShowDraftModal(false);
      setEditingInvoiceId(null);
      setInvoiceEditReason('');
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleApprove = (inv: InvoiceRecord) => {
    try {
      prototypeStore.reviewInvoice(inv.id, true);
      setNotice({ type: 'success', text: `Invoice ${inv.invoiceNumber} reviewed and approved.` });
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const handleReturnInvoice = (inv: InvoiceRecord) => {
    const reason = window.prompt('Reason for returning this invoice draft for changes:');
    if (!reason?.trim()) return;
    try {
      prototypeStore.reviewInvoice(inv.id, false, reason);
      setNotice({ type: 'success', text: `Invoice ${inv.invoiceNumber} returned to the preparer with a recorded reason.` });
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const handleIssue = (inv: InvoiceRecord) => {
    prototypeStore.issueInvoice(inv.id);
  };

  const canReviseInvoice = (inv: InvoiceRecord) => inv.status === 'Draft' || inv.status === 'Approved';
  const editingInvoice = editingInvoiceId ? state.invoices.find(item => item.id === editingInvoiceId) : undefined;
  const editingSourceInvoice = Boolean(editingInvoice?.lines.some(line => line.sourceType !== 'Ad hoc'));

  const handleReviseInvoice = (inv: InvoiceRecord) => {
    setEditingInvoiceId(inv.id);
    setInvNumber(inv.invoiceNumber);
    setDescription(inv.description);
    const adHocLines = inv.lines.filter(line => line.sourceType === 'Ad hoc');
    const sourceLinked = inv.lines.some(line => line.sourceType !== 'Ad hoc');
    if (sourceLinked) {
      // Source-linked revision: the header description and due date are editable; every
      // ad-hoc line (including the first) is edited through the ad-hoc editor below.
      setAmount(inv.amount);
      setAdditionalLines(adHocLines.map(line => ({ description: line.description, quantity: line.quantity, rate: line.rate })));
    } else {
      setAmount(adHocLines[0]?.amount ?? inv.amount);
      setAdditionalLines(adHocLines.slice(1).map(line => ({ description: line.description, quantity: line.quantity, rate: line.rate })));
    }
    setDue(inv.due);
    setSelectedTimeSourceIds([]);
    setSelectedFixedServiceSource(false);
    setInvoiceEditReason('');
    setShowDraftModal(true);
  };

  const handleCancelDraft = (inv: InvoiceRecord) => {
    try {
      prototypeStore.cancelInvoiceDraft(inv.id);
      setNotice({ type: 'success', text: `Draft invoice ${inv.invoiceNumber} cancelled; unissued time sources are available again.` });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleCreateCredit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const existingCredit = editingCreditId ? state.creditNotes.find(item => item.id === editingCreditId) : undefined;
    if (existingCredit) {
      try {
        prototypeStore.reviseCreditNote(existingCredit.id, { amount: creditAmount, reason: creditReason });
        setNotice({ type: 'success', text: `Credit note ${existingCredit.creditNumber} revised and returned for independent review.` });
        setShowCreditModal(false); setSelectedInvoice(null); setEditingCreditId(null);
      } catch (err: any) { setNotice({ type: 'error', text: err.message }); }
      return;
    }
    const newCredit: CreditNoteRecord = {
      id: `CN-${Date.now().toString().slice(-4)}`,
      clientId: selectedInvoice.clientId,
      invoiceId: selectedInvoice.id,
      creditNumber: `${state.firmSettings.creditNumberPrefix}${state.firmSettings.creditNextNumber}`,
      amount: creditAmount,
      currency: selectedInvoice.currency,
      reason: creditReason,
      status: 'Draft',
      issueDate: state.asOfDate,
      date: new Date().toISOString().split('T')[0],
      preparedBy: state.currentPerson,
      issuedBy: undefined
    };

    try {
      prototypeStore.addCreditNote(newCredit);
      setNotice({ type: 'success', text: `Credit note ${newCredit.creditNumber} saved as a draft for independent review.` });
      setShowCreditModal(false);
      setSelectedInvoice(null);
      setEditingCreditId(null);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleReviewCredit = (creditId: string) => {
    try { prototypeStore.reviewCreditNote(creditId, true); setNotice({ type: 'success', text: 'Credit note approved for issue.' }); }
    catch (err: any) { setNotice({ type: 'error', text: err.message }); }
  };

  const handleReturnCredit = (creditId: string) => {
    const reason = window.prompt('Reason for returning this credit note for revision:');
    if (!reason?.trim()) return;
    try { prototypeStore.reviewCreditNote(creditId, false, reason); setNotice({ type: 'success', text: 'Credit note returned with a recorded reason.' }); }
    catch (err: any) { setNotice({ type: 'error', text: err.message }); }
  };

  const handleReviseCredit = (credit: CreditNoteRecord) => {
    setEditingCreditId(credit.id);
    setSelectedInvoice(invoices.find(invoice => invoice.id === credit.invoiceId) || null);
    setCreditAmount(credit.amount);
    setCreditReason(credit.reason);
    initialCreditDraft.current = JSON.stringify({ creditAmount: credit.amount, creditReason: credit.reason });
    setShowCreditModal(true);
  };

  const handleIssueCredit = (creditId: string) => {
    try { prototypeStore.issueCreditNote(creditId); setNotice({ type: 'success', text: 'Credit note issued in the local prototype.' }); }
    catch (err: any) { setNotice({ type: 'error', text: err.message }); }
  };

  const handleExportPDF = (inv: InvoiceRecord) => {
    exportService.exportPDF(
      `${inv.invoiceNumber}_Document`,
      `Invoice: ${inv.invoiceNumber}`,
      [
        `Client Legal Name: ${inv.billingDetails?.accountName || client?.name || 'Example Trading Entity'}`,
        `Issuing Firm: ${state.firmSettings.firmLegalName} (${state.firmSettings.firmName})`,
        `Firm Jurisdiction: ${state.firmSettings.jurisdiction}`,
        `Billing Contact: ${inv.billingDetails?.contactName || client?.contact || 'Not recorded'}`,
        `Billing Email: ${inv.billingDetails?.email || client?.email || 'Not recorded'}`,
        `Billing Phone: ${inv.billingDetails?.phone || client?.phone || 'Not recorded'}`,
        `Billing Address: ${inv.billingDetails?.address || client?.address || 'Not recorded'}`,
        `Registration Number: ${inv.billingDetails?.registrationNumber || client?.registrationNumber || 'Not recorded'}`,
        `Client Jurisdiction: ${client?.jurisdiction || 'State of Qatar'}`,
        `Billing Description: ${inv.description}`,
        `Billed Amount: ${formatCurrency(inv.amount, inv.currency)}`,
        invoiceTaxLine(inv),
        `Amount Paid: ${formatCurrency(inv.paid, inv.currency)}`,
        `Balance Outstanding: ${formatCurrency(inv.amount - inv.paid - (inv.creditsApplied || 0), inv.currency)}`,
        `Payment Due Date: ${inv.due}`,
        `Status: ${inv.status}`
      ]
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Billing, Invoicing & Credit Notes</h1>
          <p>Multi-currency professional fee invoicing, independent approval, and local PDF billing records.</p>
        </div>
        <button className="btn primary sm" onClick={() => { setEditingInvoiceId(null); setInvoiceEditReason(''); setAdditionalLines([]); setInvNumber(`${state.firmSettings.invoiceNumberPrefix}${state.firmSettings.invoiceNextNumber}`); const base = new Date(`${state.asOfDate}T00:00:00Z`); base.setUTCDate(base.getUTCDate() + state.firmSettings.paymentTermsDays); setDue(base.toISOString().slice(0, 10)); setShowDraftModal(true); }}>
          <Icon name="plus" /> Draft New Invoice
        </button>
        <ModuleIdentityLine />
        <ModuleLifecycleHint />
      </div>

      {notice && (
        <div className={`badge ${notice.type === 'error' ? 'danger' : 'success'}`} role={notice.type === 'error' ? 'alert' : 'status'} aria-live={notice.type === 'error' ? 'assertive' : 'polite'} style={{ padding: '8px 12px', display: 'block', fontSize: 13 }}>
          {notice.text}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>Invoices Register ({invoices.length})</h3>
          <span className="caption">Separation of duties: Preparer cannot approve own invoice</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Credits</th>
                <th>Outstanding</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <ListState
                  colSpan={9}
                  kind={state.invoices.length > 0 ? 'no-match' : 'empty'}
                  message={state.invoices.length > 0 ? 'No invoices match these filters' : 'No invoice records yet'}
                  hint={state.invoices.length > 0
                    ? `${state.invoices.length} invoice record(s) exist in this practice but none are in the current scope or match the selected filters.`
                    : 'Use “Draft New Invoice” to create a draft from approved billable time or an accepted fixed-fee proposal. Drafts then move through independent review (approve or reasoned return), issue, and — if needed — credit notes.'}
                />
              )}
              {invoices.map(inv => {
                const outstanding = Math.max(0, inv.amount - inv.paid - (inv.creditsApplied || 0));
                return (
                  <tr key={inv.id}>
                    <td><b>{inv.invoiceNumber}</b></td>
                    <td>
                      {inv.description}
                      {inv.reviewNote && <div className="caption text-danger mt4">Returned by reviewer: {inv.reviewNote}</div>}
                      {inv.commercialApproval && <div className="caption mt4">Approved by {inv.commercialApproval.by}{inv.commercialApproval.at ? ` · ${new Date(inv.commercialApproval.at).toLocaleString()}` : ''}</div>}
                      {Boolean((inv.revisionHistory?.length || inv.commercialApprovalHistory?.length)) && (
                        <details className="mt4">
                          <summary className="caption">History ({(inv.revisionHistory?.length || 0) + (inv.commercialApprovalHistory?.length || 0)} entries)</summary>
                          {(inv.revisionHistory || []).map(entry => (
                            <div className="caption" key={`${entry.revision}-${entry.editedAt}`}>Rev {entry.revision} → {entry.revision + 1} · {entry.editedBy} · {new Date(entry.editedAt).toLocaleString()} · {entry.reason}</div>
                          ))}
                          {(inv.commercialApprovalHistory || []).map(entry => (
                            <div className="caption" key={`${entry.revision}-${entry.at}`}>Rev {entry.revision} approved by {entry.by} · {new Date(entry.at).toLocaleString()}{entry.basis ? ` · ${entry.basis}` : ''}</div>
                          ))}
                        </details>
                      )}
                    </td>
                    <td><b>{formatCurrency(inv.amount, inv.currency)}</b></td>
                    <td>{formatCurrency(inv.paid, inv.currency)}</td>
                    <td>{inv.creditsApplied ? formatCurrency(inv.creditsApplied, inv.currency) : '—'}</td>
                    <td><b>{formatCurrency(outstanding, inv.currency)}</b></td>
                    <td>
                      <span className={`badge ${inv.status === 'Paid' ? 'green' : inv.status === 'Issued' ? 'blue' : 'amber'}`}>
                        <StatusBadge status={inv.status} />
                      </span>
                    </td>
                    <td>{inv.due}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="btn sm"
                          onClick={() => handleExportPDF(inv)}
                          title="Export Demonstration PDF with watermark"
                        >
                          <Icon name="download" size="sm" /> PDF
                        </button>
                        {inv.status === 'Draft' && (
                          <>
                            {canReviseInvoice(inv) && <button className="btn sm ghost" onClick={() => handleReviseInvoice(inv)}>Edit</button>}
                            <button className="btn sm ghost" onClick={() => handleApprove(inv)}>Approve</button>
                            <button className="btn sm ghost text-danger" onClick={() => handleReturnInvoice(inv)}>Return</button>
                            {hasAnyRole(state, ['billing', 'manager', 'partner']) && <button className="btn sm ghost text-danger" onClick={() => handleCancelDraft(inv)}>Cancel Draft</button>}
                          </>
                        )}
                        {inv.status === 'Approved' && (
                          <>
                            {canReviseInvoice(inv) && <button className="btn sm ghost" onClick={() => handleReviseInvoice(inv)}>Revise</button>}
                            <button className="btn sm primary" onClick={() => handleIssue(inv)}>Issue</button>
                          </>
                        )}
                        {inv.status === 'Issued' && outstanding > 0 && (
                          <button
                            className="btn sm ghost"
                            onClick={() => {
                              setEditingCreditId(null);
                              setSelectedInvoice(inv);
                              setCreditAmount(25000);
                              setCreditReason('Commercial fee adjustment approved by partner');
                              initialCreditDraft.current = JSON.stringify({ creditAmount: 25000, creditReason: 'Commercial fee adjustment approved by partner' });
                              setShowCreditModal(true);
                            }}
                          >
                            Credit Note
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit Notes Register */}
      {state.creditNotes.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3>Credit Notes ({state.creditNotes.length})</h3>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Credit Note #</th>
                  <th>Original Invoice</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Prepared / Reviewed / Issued</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.creditNotes.map(cn => (
                  <tr key={cn.id}>
                    <td><b>{cn.creditNumber}</b></td>
                    <td>{cn.invoiceId}</td>
                    <td><b>{formatCurrency(cn.amount, cn.currency)}</b></td>
                    <td>{cn.reason}</td>
                    <td>{cn.date}</td>
                    <td><StatusBadge status={cn.status} /></td>
                    <td>{[cn.preparedBy, cn.reviewedBy, cn.issuedBy].filter(Boolean).join(' / ') || '—'}</td>
                    <td>
                      {cn.status === 'Draft' && <>
                        <button className="btn sm" onClick={() => handleReturnCredit(cn.id)}>Return</button>
                        <button className="btn sm" onClick={() => handleReviewCredit(cn.id)}>Approve</button>
                        {cn.returnReason && <button className="btn sm ghost" onClick={() => handleReviseCredit(cn)}>Revise</button>}
                      </>}
                      {cn.status === 'Approved' && <>
                        <button className="btn sm" onClick={() => handleReturnCredit(cn.id)}>Return</button>
                        <button className="btn sm primary" onClick={() => handleIssueCredit(cn.id)}>Issue</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Draft Modal */}
      {showDraftModal && (
        <div className="modal-backdrop" onClick={() => setShowDraftModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{editingInvoiceId ? `Revise Invoice ${invNumber}` : 'Draft Fee Invoice'}</h2>
              <button className="icon-btn" onClick={() => setShowDraftModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateDraft}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                {!editingInvoiceId && <fieldset className="stack" style={{ gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <legend className="caption">Approved billable time (optional)</legend>
                  {availableTimeSources.length === 0 ? <div className="caption">No unbilled approved time with a pinned rate for this engagement.</div> : availableTimeSources.map(time => (
                    <label key={time.id} className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                      <span><input type="checkbox" checked={selectedTimeSourceIds.includes(time.id)} onChange={e => setSelectedTimeSourceIds(ids => e.target.checked ? [...ids, time.id] : ids.filter(id => id !== time.id))} /> {time.date} · {time.taskTitle} · {time.person}</span>
                      <b>{formatCurrency(time.durationMinutes / 60 * (time.billingRatePerHour || 0), time.currency || 'QAR')}</b>
                    </label>
                  ))}
                  {acceptedProposal && fixedServiceRemaining > 0 && <label className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                    <span><input type="checkbox" checked={selectedFixedService} onChange={e => setSelectedFixedServiceSource(e.target.checked)} /> Accepted fixed-fee services · proposal {acceptedProposal.id} v{acceptedProposal.revision}</span>
                    <b>{formatCurrency(fixedServiceRemaining, acceptedProposal.currency)}</b>
                  </label>}
                  {hasSources && <div className="caption">Sources are pinned to this draft; duplicate or over-contract billing is rejected. Total: <b>{formatCurrency(sourcedTotal, selectedTimeSources[0]?.currency || acceptedProposal?.currency || currency)}</b></div>}
                </fieldset>}
                {client && <fieldset className="stack" style={{ gap: 4, border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <legend className="caption">Bill to — client profile snapshot</legend>
                  <div><span className="caption">Invoice date (scenario)</span><br /><b>{editingInvoice?.issueDate || state.asOfDate}</b></div>
                  <b>{client.name}</b>
                  <span>{client.contact}</span>
                  {client.email && <span>{client.email}</span>}
                  {client.phone && <span>{client.phone}</span>}
                  {client.address && <span>{client.address}</span>}
                  {client.registrationNumber && <span>Registration: {client.registrationNumber}</span>}
                  <span className="caption">These values are captured on the draft and stay attached to its invoice record.</span>
                </fieldset>}
                <div className="grid2">
                  <div>
                    <label className="caption" htmlFor="invoice-number">Invoice Number (required)</label>
                    <input
                      id="invoice-number"
                      type="text"
                      className="input"
                      value={invNumber}
                      onChange={e => setInvNumber(e.target.value)}
                      maxLength={64}
                      pattern=".*\S.*"
                      title="Enter an invoice reference containing at least one non-space character."
                      disabled={Boolean(editingInvoiceId)}
                      required
                    />
                  </div>
                  <div>
                    <label className="caption" htmlFor="invoice-due-date">Payment Due Date (required)</label>
                    <input
                      id="invoice-due-date"
                      type="date"
                      className="input"
                      value={due}
                      onChange={e => setDue(e.target.value)}
                      min={editingInvoice?.issueDate || state.asOfDate}
                      aria-describedby="invoice-due-date-help"
                      required
                    />
                    <span id="invoice-due-date-help" className="caption">Choose a valid date on or after the invoice date shown above.</span>
                  </div>
                </div>
                <div>
                  <label className="caption" htmlFor="invoice-description">Fee Description (required)</label>
                  <input
                    id="invoice-description"
                    type="text"
                    className="input"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    maxLength={240}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Invoice Amount ({currency})</label>
                  <input
                    type="number"
                    className="input"
                    value={editingSourceInvoice
                      ? Math.round(((editingInvoice?.lines.filter(line => line.sourceType !== 'Ad hoc').reduce((sum, line) => sum + line.amount, 0) || 0) + additionalLines.reduce((sum, line) => sum + line.quantity * line.rate, 0)) * 100) / 100
                      : hasSources ? sourcedTotal : amount}
                    onChange={e => setAmount(Number(e.target.value))}
                    readOnly={hasSources || editingSourceInvoice}
                    required
                  />
                  {editingSourceInvoice && <div className="caption">Source-linked lines are pinned and carried unchanged into the revision; only the description, due date, and ad-hoc lines can change.</div>}
                </div>
                {!hasSources && <div className="stack" style={{ gap: 8 }}>
                  {additionalLines.map((line, index) => <fieldset key={index} className="grid2" style={{ gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <legend className="caption">Additional ad-hoc line {index + 1}</legend>
                    <div>
                      <label className="caption">Line Description</label>
                      <input className="input" aria-label={`Ad hoc line ${index + 1} description`} value={line.description} onChange={e => setAdditionalLines(lines => lines.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} required />
                    </div>
                    <div>
                      <label className="caption">Quantity</label>
                      <input className="input" aria-label={`Ad hoc line ${index + 1} quantity`} type="number" min="0.01" step="0.01" value={line.quantity} onChange={e => setAdditionalLines(lines => lines.map((item, i) => i === index ? { ...item, quantity: Number(e.target.value) } : item))} required />
                    </div>
                    <div>
                      <label className="caption">Rate ({currency})</label>
                      <input className="input" aria-label={`Ad hoc line ${index + 1} rate`} type="number" min="0" step="0.01" value={line.rate} onChange={e => setAdditionalLines(lines => lines.map((item, i) => i === index ? { ...item, rate: Number(e.target.value) } : item))} required />
                    </div>
                    <div className="row" style={{ alignItems: 'end', justifyContent: 'space-between' }}>
                      <span className="caption">Line total: {formatCurrency(Math.round(line.quantity * line.rate * 100) / 100, currency)}</span>
                      <button className="btn ghost sm" type="button" onClick={() => setAdditionalLines(lines => lines.filter((_, i) => i !== index))}>Remove line</button>
                    </div>
                  </fieldset>)}
                  <button className="btn sm" type="button" onClick={() => setAdditionalLines(lines => [...lines, { description: '', quantity: 1, rate: 0 }])}>Add ad-hoc line</button>
                  {additionalLines.length > 0 && <b>Ad-hoc total: {formatCurrency(Math.round((amount + additionalLines.reduce((sum, line) => sum + line.quantity * line.rate, 0)) * 100) / 100, currency)}</b>}
                </div>}
                {editingInvoiceId && <div>
                  <label className="caption" htmlFor="invoice-revision-reason">Reason for invoice revision</label>
                  <textarea id="invoice-revision-reason" className="input" value={invoiceEditReason} onChange={e => setInvoiceEditReason(e.target.value)} maxLength={500} required />
                  <p className="caption">Saving creates a new draft revision and clears the prior approval. Issued invoices cannot be edited; source-linked time and fixed-fee lines stay pinned.</p>
                </div>}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => { setShowDraftModal(false); setEditingInvoiceId(null); setInvoiceEditReason(''); }}>Cancel</button>
                <button type="submit" className="btn primary sm">{editingInvoiceId ? 'Save Invoice Revision' : 'Create Draft'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credit Note Modal */}
      {showCreditModal && selectedInvoice && (
        <div className="modal-backdrop" onClick={() => setShowCreditModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{editingCreditId ? 'Revise' : 'Draft'} Credit Note for {selectedInvoice.invoiceNumber}</h2>
              <button className="icon-btn" onClick={() => setShowCreditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateCredit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Original Invoice Total</label>
                  <div><b>{formatCurrency(selectedInvoice.amount, selectedInvoice.currency)}</b></div>
                </div>
                <div>
                  <label className="caption">Credit Amount ({selectedInvoice.currency})</label>
                  <input
                    type="number"
                    max={selectedInvoice.amount - selectedInvoice.paid}
                    className="input"
                    value={creditAmount}
                    onChange={e => setCreditAmount(Number(e.target.value))}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Commercial Justification</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={creditReason}
                    onChange={e => setCreditReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowCreditModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">{editingCreditId ? 'Resubmit Credit Note' : 'Create Draft Credit Note'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
