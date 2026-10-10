import React, { useEffect, useMemo, useState } from 'react';
import type { BusinessContextResponse, BusinessDeliveryWorkspace, BusinessEngagementOption, BusinessFileMetadata, BusinessWorkspacePreference } from '../../shared/api/business';
import { completeBusinessFile, downloadBusinessFile, getBusinessAcceptanceGate, getBusinessDeliveryWorkspace, initializeBusinessFile, newBusinessIdempotencyKey, runBusinessCommand, uploadBusinessFile } from '../../services/businessWorkspace';

interface Props {
  workspaceId: string;
  selected: BusinessWorkspacePreference;
  context: BusinessContextResponse;
  engagement: Pick<BusinessEngagementOption, 'id' | 'clientId' | 'clientName' | 'lifecycleState'>;
  files: BusinessFileMetadata[];
  onChanged: () => void;
}

type AllocationDraft = { invoiceId: string; amountMinor: string };

function qatarToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function BusinessDeliveryPanel({ workspaceId, selected, context, engagement, files, onChanged }: Props) {
  const [data, setData] = useState<BusinessDeliveryWorkspace | null>(null);
  const [gate, setGate] = useState<Awaited<ReturnType<typeof getBusinessAcceptanceGate>> | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [templateService, setTemplateService] = useState<'STATUTORY_AUDIT'|'INTERNAL_AUDIT'|'AGREED_UPON_PROCEDURES'>('STATUTORY_AUDIT');
  const [templateName, setTemplateName] = useState('');
  const [templateClauses, setTemplateClauses] = useState('');
  const [taxName, setTaxName] = useState('');
  const [taxBps, setTaxBps] = useState('0');
  const [taxRationale, setTaxRationale] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedSignature, setSelectedSignature] = useState('');
  const [selectedSeal, setSelectedSeal] = useState('');
  const [elRouteId, setElRouteId] = useState('');
  const [invoiceRouteId, setInvoiceRouteId] = useState('');
  const [receiptRouteId, setReceiptRouteId] = useState('');
  const [dueDate, setDueDate] = useState(qatarToday());
  const [paymentAmount, setPaymentAmount] = useState('');
  const [receivedOn, setReceivedOn] = useState(qatarToday());
  const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER'|'CHEQUE'|'CASH'>('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [evidenceFileId, setEvidenceFileId] = useState('');
  const [paymentEvidenceFile, setPaymentEvidenceFile] = useState<BusinessFileMetadata | null>(null);
  const [allocations, setAllocations] = useState<AllocationDraft[]>([{ invoiceId: '', amountMinor: '' }]);
  const [reversalForPayment, setReversalForPayment] = useState<string | null>(null);
  const [paymentReversalRationales, setPaymentReversalRationales] = useState<Record<string, string>>({});

  const isPartner = context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER';
  const isClient = context.actor.persona === 'CLIENT';
  const canIssueInvoice = context.allowedActions.includes('invoice.issue');
  const canRecordPayment = context.allowedActions.includes('payment.record');
  const serviceTemplates = useMemo(() => data?.templates?.filter(item => item.serviceType === engagementService(data, engagement.id)) ?? [], [data, engagement.id]);
  const workspaceSignatureFiles = files.filter(file => file.purpose === 'SIGNATURE' && file.mediaType === 'image/png' && file.state === 'COMMITTED' && !file.clientId);
  const workspaceSealFiles = files.filter(file => file.purpose === 'SEAL' && file.mediaType === 'image/png' && file.state === 'COMMITTED' && !file.clientId);
  const evidenceFiles = files.filter(file => file.purpose === 'EVIDENCE' && file.state === 'COMMITTED' && file.engagementId === engagement.id);
  const routeOptions = data?.contactRoutes ?? [];
  const activeLetters = data?.letters ?? [];
  const pendingJobs = Boolean(data?.letterDrafts?.some(item => ['PENDING','RUNNING','RETRYABLE_FAILED'].includes(item.status))
    || data?.invoices.some(item => item.status === 'PENDING_DOCUMENT')
    || data?.payments.some(item => item.receiptStatus === 'PENDING'));

  useEffect(() => {
    if (!selected.actorId || !selected.persona) return;
    const controller = new AbortController();
    Promise.all([
      getBusinessDeliveryWorkspace(workspaceId, engagement.id, selected, controller.signal),
      getBusinessAcceptanceGate(workspaceId, engagement.id, selected, controller.signal)
    ]).then(([nextData, nextGate]) => {
      if (controller.signal.aborted) return;
      setData(nextData);
      setGate(nextGate);
      setError('');
      setElRouteId(current => current || nextData.contactRoutes?.find(route => route.purpose === 'EL')?.id || '');
      setInvoiceRouteId(current => current || nextData.contactRoutes?.find(route => route.purpose === 'INVOICE')?.id || '');
      setReceiptRouteId(current => current || nextData.contactRoutes?.find(route => route.purpose === 'RECEIPT')?.id || '');
      setSelectedTemplate(current => current || nextData.templates?.filter(item => item.serviceType === nextData.engagement.serviceType)
        .sort((left, right) => right.revision - left.revision)[0]?.id || '');
      setSelectedSignature(current => current || nextData.signatureAssets?.find(item => item.decision === 'CONSENT')?.id || '');
      setSelectedSeal(current => current || nextData.sealAssets?.find(item => item.decision === 'APPROVE')?.id || '');
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Commercial records could not be loaded.'); });
    return () => controller.abort();
  }, [workspaceId, engagement.id, selected.actorId, selected.persona, selected.clientId, refresh]);

  useEffect(() => {
    if (!pendingJobs) return;
    const timer = window.setInterval(() => setRefresh(value => value + 1), 4000);
    return () => window.clearInterval(timer);
  }, [pendingJobs]);

  const perform = async (command: unknown, label: string) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await runBusinessCommand(workspaceId, selected, command, newBusinessIdempotencyKey());
      setMessage(label);
      setRefresh(value => value + 1);
      onChanged();
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The commercial command was rejected.');
      return null;
    } finally { setBusy(false); }
  };

  const saveTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentRevision = Math.max(0, ...(data?.templates ?? []).filter(item => item.serviceType === templateService).map(item => item.revision));
    await perform({ type: 'document-template.save', payload: { serviceType: templateService, name: templateName, clauses: templateClauses, expectedRevision: currentRevision } }, 'Approved template revision saved.');
    setTemplateName(''); setTemplateClauses('');
  };

  const saveTaxPolicy = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await perform({ type: 'billing.tax-policy.save', payload: { name: taxName, taxBasisPoints: Number(taxBps), rationale: taxRationale } }, 'Explicit billing tax policy saved.');
    setTaxName(''); setTaxRationale('');
  };

  const consentSignature = async (fileVersionId: string, decision: 'CONSENT'|'REVOKE') => {
    await perform({ type: 'signature-asset.consent', payload: { fileVersionId, decision, rationale: decision === 'CONSENT'
      ? 'I consent to use this uploaded signature image on the engagement letters I issue.'
      : 'I revoke use of this signature image for future engagement letter renders.' } }, `Signature image ${decision.toLowerCase()} recorded.`);
  };

  const approveSeal = async (fileVersionId: string, decision: 'APPROVE'|'REVOKE') => {
    await perform({ type: 'seal-asset.approve', payload: { fileVersionId, decision, rationale: decision === 'APPROVE'
      ? 'This uploaded PNG is approved as the current firm seal image for engagement letter rendering.'
      : 'This seal image is withdrawn from future engagement letter rendering.' } }, `Seal ${decision.toLowerCase()} recorded.`);
  };

  const generateLetter = async () => {
    if (!selectedTemplate || !selectedSignature || !selectedSeal) return;
    await perform({ type: 'engagementLetter.generate', payload: { engagementId: engagement.id, templateVersionId: selectedTemplate,
      signatureFileVersionId: selectedSignature, sealFileVersionId: selectedSeal } }, 'Letter generation queued. The exact approval keys will be checked again before issue.');
  };

  const issueLetter = async (draft: NonNullable<BusinessDeliveryWorkspace['letterDrafts']>[number]) => {
    const commercial = gate?.commercialKey as Record<string, unknown> | undefined;
    const risk = gate?.riskKey as Record<string, unknown> | undefined;
    if (!commercial || !risk || !elRouteId || !invoiceRouteId || !data?.taxPolicies?.length) return;
    await perform({ type: 'engagementLetter.issue', payload: { engagementId: engagement.id, jobId: draft.jobId,
      expectedProposalVersionId: String(commercial.proposalVersionId ?? ''), expectedRiskClearanceId: String(risk.clearanceId ?? ''),
      contactRouteId: elRouteId, invoiceContactRouteId: invoiceRouteId, invoiceDueDate: dueDate } },
      'Engagement letter issued; its advance invoice PDF and engagement letter email were queued. The invoice email queues after PDF verification.');
  };

  const issueAdvanceInvoice = async (invoiceId: string) => {
    const letter = activeLetters.find(item => item.id === data?.invoices.find(invoice => invoice.id === invoiceId)?.engagementLetterId);
    if (!letter || !invoiceRouteId) return;
    await perform({ type: 'invoice.issueAdvance', payload: { engagementId: engagement.id, engagementLetterId: letter.id, dueDate, contactRouteId: invoiceRouteId } },
      'Invoice PDF generation queued. It becomes issued after verified storage.');
  };

  const recordPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const paymentAllocations = allocations.filter(item => item.invoiceId && item.amountMinor).map(item => ({ invoiceId: item.invoiceId, amountMinor: item.amountMinor }));
    await perform({ type: 'payment.record', payload: { clientId: engagement.clientId, engagementId: engagement.id, amountMinor: paymentAmount,
      receivedOn, method: paymentMethod, reference: paymentReference, evidenceFileId, receiptContactRouteId: receiptRouteId, allocations: paymentAllocations } },
      'Payment verified in the workspace; receipt generation and email are queued.');
    setPaymentAmount(''); setPaymentReference(''); setAllocations([{ invoiceId: '', amountMinor: '' }]);
  };

  const uploadPaymentEvidence = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;
    const mediaType = selectedFile.type === 'application/pdf' ? 'application/pdf'
      : selectedFile.type === 'image/png' ? 'image/png'
        : selectedFile.type === 'image/jpeg' ? 'image/jpeg' : null;
    if (!mediaType || selectedFile.size <= 0 || selectedFile.size > 25 * 1024 * 1024) {
      setError('Choose a PDF, PNG or JPEG payment document up to 25 MB.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const reservation = await initializeBusinessFile(workspaceId, selected, {
        purpose: 'EVIDENCE', originalName: selectedFile.name, mediaType, sizeBytes: selectedFile.size,
        clientId: engagement.clientId, engagementId: engagement.id, paymentEvidenceReservationId: crypto.randomUUID()
      }, newBusinessIdempotencyKey());
      const staged = await uploadBusinessFile(workspaceId, selected, reservation, selectedFile, mediaType, newBusinessIdempotencyKey());
      const committed = await completeBusinessFile(workspaceId, selected, staged, newBusinessIdempotencyKey());
      const metadata: BusinessFileMetadata = { id: committed.fileId, version: committed.version, clientId: engagement.clientId,
        engagementId: engagement.id, originalName: selectedFile.name, mediaType, sizeBytes: committed.sizeBytes,
        sha256: committed.sha256, purpose: 'EVIDENCE', state: 'COMMITTED', committedAt: new Date().toISOString(), immutable: true };
      setPaymentEvidenceFile(metadata); setEvidenceFileId(metadata.id);
      setMessage('Payment evidence uploaded and committed. Review it before recording the payment.');
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment evidence could not be uploaded.');
    } finally { setBusy(false); }
  };

  const reversePayment = async (event: React.FormEvent<HTMLFormElement>, paymentId: string) => {
    event.preventDefault();
    const rationale = (paymentReversalRationales[paymentId] ?? '').trim();
    if (rationale.length < 10) return;
    const result = await perform({ type: 'payment.reverse', payload: { paymentId, rationale } },
      'Payment reversal recorded with a new immutable receipt voucher.');
    if (result !== null) {
      setReversalForPayment(null);
      setPaymentReversalRationales(current => { const next = { ...current }; delete next[paymentId]; return next; });
    }
  };

  const download = async (fileId: string | null | undefined, name: string) => {
    if (!fileId) return;
    const file = files.find(item => item.id === fileId);
    if (!file) { setError('The exact committed file is not in the current file projection. Refresh stored files and retry.'); return; }
    setError('');
    try {
      const blob = await downloadBusinessFile(workspaceId, file, selected);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = name; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The committed document could not be downloaded.'); }
  };

  if (!data) return <section className="business-delivery-card" aria-label="Engagement letters and billing"><p role="status">Loading engagement delivery records…</p>{error && <p role="alert">{error}</p>}</section>;
  const advanceInvoices = data.invoices.filter(item => item.kind === 'ADVANCE');
  const outstandingEvidence = [...evidenceFiles.filter(file => file.id !== paymentEvidenceFile?.id), ...(paymentEvidenceFile ? [paymentEvidenceFile] : [])];
  const partnerReady = isPartner && gate?.ready && engagement.lifecycleState === 'ADVANCE_BILLING';

  return <section className="business-delivery-card" aria-labelledby={`business-delivery-${engagement.id}`}>
    <div className="business-section-heading">
      <div><p className="business-eyebrow">COMMERCIAL DELIVERY · {data.engagement.code}</p><h2 id={`business-delivery-${engagement.id}`}>Engagement letters and billing</h2></div>
      <span className="business-delivery-state">{data.engagement.lifecycleState.replaceAll('_', ' ')}</span>
    </div>
    {error && <p className="business-alert" role="alert">{error}</p>}
    {message && <p className="business-command-message" role="status">{message}</p>}

    {isPartner && <>
      <div className="business-delivery-grid">
        <form className="business-form business-commercial-form" onSubmit={saveTemplate}>
          <h3>Approve service letter template</h3>
          <label className="business-field"><span>Service type</span><select value={templateService} onChange={event => setTemplateService(event.target.value as typeof templateService)}>
            <option value="STATUTORY_AUDIT">Statutory audit</option><option value="INTERNAL_AUDIT">Internal audit</option><option value="AGREED_UPON_PROCEDURES">Agreed-upon procedures</option>
          </select></label>
          <label className="business-field"><span>Template name</span><input required maxLength={200} value={templateName} onChange={event => setTemplateName(event.target.value)} /></label>
          <label className="business-field"><span>Partner-approved clauses</span><textarea required minLength={20} maxLength={30000} rows={5} value={templateClauses} onChange={event => setTemplateClauses(event.target.value)} /></label>
          <p className="business-note">Templates are firm-authored and versioned. The application does not invent statutory clauses or claim legal compliance.</p>
          <button className="btn sm" disabled={busy}>Save approved template revision</button>
        </form>
        <form className="business-form business-commercial-form" onSubmit={saveTaxPolicy}>
          <h3>Configure explicit billing tax policy</h3>
          <label className="business-field"><span>Policy name</span><input required maxLength={200} value={taxName} onChange={event => setTaxName(event.target.value)} /></label>
          <label className="business-field"><span>Tax rate (basis points)</span><input required inputMode="numeric" pattern="[0-9]{1,6}" value={taxBps} onChange={event => setTaxBps(event.target.value)} /></label>
          <label className="business-field"><span>Approval rationale</span><textarea required minLength={10} maxLength={2000} rows={3} value={taxRationale} onChange={event => setTaxRationale(event.target.value)} /></label>
          <p className="business-note">No tax rate is assumed. A zero rate is a firm configuration choice, not a legal conclusion.</p>
          <button className="btn sm" disabled={busy}>Save tax policy revision</button>
        </form>
      </div>
      <div className="business-delivery-assets">
        <div><h3>Partner signature image consent</h3>{workspaceSignatureFiles.length ? workspaceSignatureFiles.map(file => {
          const decision = data.signatureAssets?.find(asset => asset.id === file.id)?.decision ?? 'NONE';
          return <p key={file.id}><span>{file.originalName} · {decision}</span><button type="button" className="btn sm" disabled={busy} onClick={() => void consentSignature(file.id, decision === 'CONSENT' ? 'REVOKE' : 'CONSENT')}>{decision === 'CONSENT' ? 'Revoke' : 'Consent'}</button></p>;
        }) : <p className="business-muted">Upload a PNG with purpose SIGNATURE in Stored files first.</p>}</div>
        <div><h3>Firm seal approval</h3>{workspaceSealFiles.length ? workspaceSealFiles.map(file => {
          const decision = data.sealAssets?.find(asset => asset.id === file.id)?.decision ?? 'NONE';
          return <p key={file.id}><span>{file.originalName} · {decision}</span><button type="button" className="btn sm" disabled={busy} onClick={() => void approveSeal(file.id, decision === 'APPROVE' ? 'REVOKE' : 'APPROVE')}>{decision === 'APPROVE' ? 'Withdraw' : 'Approve'}</button></p>;
        }) : <p className="business-muted">Upload a PNG with purpose SEAL in Stored files first.</p>}</div>
      </div>
      {data.taxPolicies?.length ? <p className="business-note">Current explicit tax policy: {data.taxPolicies[0]?.name} · {data.taxPolicies[0]?.taxBasisPoints} bps · revision {data.taxPolicies[0]?.revision}</p> : <p className="business-gate-blocker">Invoices are blocked until a Partner records an explicit tax policy.</p>}
    </>}

    {isPartner && <div className="business-delivery-workflow">
      <h3>Generate and issue a gated engagement letter</h3>
      {gate?.blockers.map(blocker => <p className="business-gate-blocker" key={blocker}>{blocker}</p>)}
      {engagement.lifecycleState !== 'ADVANCE_BILLING' && <p className="business-note">Letter generation is available after both current acceptance keys move this engagement to advance billing.</p>}
      <div className="business-form-grid">
        <label className="business-field"><span>Approved service template</span><select value={selectedTemplate} onChange={event => setSelectedTemplate(event.target.value)}><option value="">Select a version</option>
          {serviceTemplates.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.revision}</option>)}</select></label>
        <label className="business-field"><span>Consented signature PNG</span><select value={selectedSignature} onChange={event => setSelectedSignature(event.target.value)}><option value="">Select an asset</option>
          {data.signatureAssets?.filter(item => item.decision === 'CONSENT').map(item => <option key={item.id} value={item.id}>{item.originalName}</option>)}</select></label>
        <label className="business-field"><span>Approved firm seal PNG</span><select value={selectedSeal} onChange={event => setSelectedSeal(event.target.value)}><option value="">Select an asset</option>
          {data.sealAssets?.filter(item => item.decision === 'APPROVE').map(item => <option key={item.id} value={item.id}>{item.originalName}</option>)}</select></label>
        <label className="business-field"><span>EL recipient route</span><select value={elRouteId} onChange={event => setElRouteId(event.target.value)}><option value="">Select route</option>
          {routeOptions.filter(route => route.purpose === 'EL').map(route => <option key={route.id} value={route.id}>{route.name} · {route.email}</option>)}</select></label>
        <label className="business-field"><span>CFO / Finance Director invoice route</span><select value={invoiceRouteId} onChange={event => setInvoiceRouteId(event.target.value)}><option value="">Select CFO route</option>
          {routeOptions.filter(route => route.purpose === 'INVOICE').map(route => <option key={route.id} value={route.id}>{route.name} · {route.email}</option>)}</select></label>
        <label className="business-field"><span>Advance invoice due date</span><input type="date" required value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
      </div>
      <button type="button" className="btn primary" disabled={busy || !partnerReady || !selectedTemplate || !selectedSignature || !selectedSeal} onClick={() => void generateLetter()}>Generate pinned engagement letter</button>
      {data.letterDrafts?.map(draft => <div className="business-delivery-row" key={draft.id}>
        <strong>Letter revision {draft.revision} · {draft.status.replaceAll('_',' ')}</strong><span>Job {draft.jobId} · proposal {draft.proposalVersionId}</span>
        {draft.errorCode && <small role="alert">{draft.errorCode}</small>}
        {draft.status === 'SUCCEEDED' && <button type="button" className="btn sm" disabled={busy || !gate?.ready || !elRouteId || !invoiceRouteId || !dueDate || !data.taxPolicies?.length} onClick={() => void issueLetter(draft)}>Revalidate keys and issue EL + advance invoice</button>}
        {draft.fileVersionId && <button type="button" className="btn sm" onClick={() => void download(draft.fileVersionId, `engagement-letter-r${draft.revision}.pdf`)}>Download rendered draft</button>}
      </div>)}
      {activeLetters.map(letter => <div className="business-delivery-row" key={letter.id}><strong>Issued engagement letter · revision {letter.revision}</strong>
        <span>QAR {letter.feeMinor} minor units · issued {letter.issuedAt}</span><button type="button" className="btn sm" onClick={() => void download(letter.fileVersionId, `engagement-letter-r${letter.revision}.pdf`)}>Download issued letter</button></div>)}
    </div>}

    {canIssueInvoice && <div className="business-delivery-workflow">
      <h3>Advance invoice · 50% of the pinned engagement fee</h3>
      {isPartner && <p className="business-note">Issuing an engagement letter now queues its matching invoice automatically. The invoice below shows document and provider status; Reviewer issue controls are retained for existing draft records.</p>}
      <div className="business-form-grid">
        {!isPartner && <label className="business-field"><span>Invoice recipient route</span><select value={invoiceRouteId} onChange={event => setInvoiceRouteId(event.target.value)}><option value="">Select route</option>
          {routeOptions.filter(route => route.purpose === 'INVOICE').map(route => <option key={route.id} value={route.id}>{route.name} · {route.email}</option>)}</select></label>}
        {!isPartner && <label className="business-field"><span>Due date</span><input type="date" required value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>}
      </div>
      {advanceInvoices.map(invoice => <div className="business-delivery-row" key={invoice.id}>
        <strong>{invoice.number} · {invoice.status.replaceAll('_',' ')}</strong><span>Subtotal QAR minor {invoice.subtotalMinor} · tax {invoice.taxMinor} · total {invoice.totalMinor} · outstanding {invoice.outstandingMinor}</span>
        {invoice.status === 'DRAFT' && !isPartner && <button type="button" className="btn sm" disabled={busy || !invoiceRouteId || !data.taxPolicies?.length} onClick={() => void issueAdvanceInvoice(invoice.id)}>Prepare and issue invoice PDF</button>}
        {invoice.fileVersionId && invoice.status === 'ISSUED' && <button type="button" className="btn sm" onClick={() => void download(invoice.fileVersionId, `${invoice.number}.pdf`)}>Download invoice PDF</button>}
      </div>)}
    </div>}

    {canRecordPayment && <form className="business-form business-commercial-form business-delivery-workflow" onSubmit={recordPayment}>
      <h3>Record a verified payment and issue its receipt</h3>
      <p className="business-note">Verification is the selected staff profile’s recorded review of the committed evidence. No bank integration is claimed.</p>
      <label className="business-field"><span>Upload payment evidence (PDF, PNG or JPEG)</span><input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={event => void uploadPaymentEvidence(event)} /></label>
      <p className="business-note">Use this dedicated upload for payment support, including collections recorded after the audit file is sealed. The evidence stays tied to this engagement and uploader.</p>
      <div className="business-form-grid">
        <label className="business-field"><span>Amount (QAR minor units)</span><input required inputMode="numeric" pattern="[1-9][0-9]{0,15}" value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} /></label>
        <label className="business-field"><span>Received date</span><input type="date" required value={receivedOn} onChange={event => setReceivedOn(event.target.value)} /></label>
        <label className="business-field"><span>Method</span><select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="CASH">Cash</option></select></label>
        <label className="business-field"><span>Reference</span><input required maxLength={200} value={paymentReference} onChange={event => setPaymentReference(event.target.value)} /></label>
        <label className="business-field"><span>Committed evidence</span><select required value={evidenceFileId} onChange={event => setEvidenceFileId(event.target.value)}><option value="">Select evidence</option>{outstandingEvidence.map(file => <option key={file.id} value={file.id}>{file.originalName} · {file.sha256?.slice(0,12)}</option>)}</select></label>
        <label className="business-field"><span>Receipt email route</span><select required value={receiptRouteId} onChange={event => setReceiptRouteId(event.target.value)}><option value="">Select route</option>{routeOptions.filter(route => route.purpose === 'RECEIPT').map(route => <option key={route.id} value={route.id}>{route.name} · {route.email}</option>)}</select></label>
      </div>
      <fieldset className="business-delivery-allocations"><legend>Invoice allocations · leave amounts blank for unapplied cash</legend>
        {allocations.map((allocation, index) => <div className="business-form-grid" key={index}>
          <label className="business-field"><span>Issued invoice</span><select value={allocation.invoiceId} onChange={event => setAllocations(items => items.map((item, at) => at === index ? { ...item, invoiceId: event.target.value } : item))}><option value="">Unallocated</option>{data.invoices.filter(invoice => invoice.status === 'ISSUED').map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number} · due {invoice.outstandingMinor}</option>)}</select></label>
          <label className="business-field"><span>Allocation (QAR minor)</span><input inputMode="numeric" pattern="[1-9][0-9]{0,15}" value={allocation.amountMinor} onChange={event => setAllocations(items => items.map((item, at) => at === index ? { ...item, amountMinor: event.target.value } : item))} /></label>
          {allocations.length > 1 && <button type="button" className="btn sm" onClick={() => setAllocations(items => items.filter((_, at) => at !== index))}>Remove allocation</button>}
        </div>)}
        <button type="button" className="btn sm" disabled={allocations.length >= 50} onClick={() => setAllocations(items => [...items, { invoiceId: '', amountMinor: '' }])}>Add allocation line</button>
      </fieldset>
      <button className="btn primary" disabled={busy || !evidenceFileId || !receiptRouteId}>Verify payment and queue receipt</button>
    </form>}

    {(isClient || context.allowedActions.includes('billing.read')) && <div className="business-delivery-workflow">
      <h3>Issued documents and payment ledger</h3>
      {!isClient && advanceInvoices.map(invoice => <div className="business-delivery-row" key={invoice.id}><strong>{invoice.number} · {invoice.status.replaceAll('_',' ')}</strong>
        <span>Due {invoice.dueDate} · total {invoice.totalMinor} · outstanding {invoice.outstandingMinor}</span>
        {invoice.fileVersionId && <button type="button" className="btn sm" onClick={() => void download(invoice.fileVersionId, `${invoice.number}.pdf`)}>Download invoice</button>}</div>)}
      {data.payments.map(payment => <div className="business-delivery-row" key={payment.id}><strong>{payment.reversal ? 'Reversal' : 'Verified payment'} · QAR minor {payment.amountMinor}</strong>
        <span>{payment.receivedOn} · {payment.method}{!isClient && ` · receipt ${payment.receiptNumber ?? 'pending'} · ${payment.receiptStatus ?? 'pending'}`}</span>
        {!isClient && payment.receiptFileId && <button type="button" className="btn sm" onClick={() => void download(payment.receiptFileId, `${payment.receiptNumber}.pdf`)}>Download receipt</button>}
        {!isClient && !payment.reversal && context.allowedActions.includes('payment.reverse') && <>
          <button type="button" className="btn sm" disabled={busy || payment.receiptStatus !== 'ISSUED'}
            aria-expanded={reversalForPayment === payment.id} aria-controls={reversalForPayment === payment.id ? `payment-reversal-${payment.id}` : undefined}
            onClick={() => setReversalForPayment(current => current === payment.id ? null : payment.id)}>
            {reversalForPayment === payment.id ? 'Cancel reversal' : 'Record reversal'}
          </button>
          {reversalForPayment === payment.id && <form id={`payment-reversal-${payment.id}`} className="business-delivery-reversal"
            onSubmit={event => void reversePayment(event, payment.id)}>
            <label className="business-field"><span>Reason for reversing this payment</span>
              <textarea required minLength={10} maxLength={2000} value={paymentReversalRationales[payment.id] ?? ''}
                onChange={event => setPaymentReversalRationales(current => ({ ...current, [payment.id]: event.target.value }))}
                placeholder="Describe the evidence or allocation error that requires this reversal." />
              <small>This reason is recorded with the immutable payment reversal.</small>
            </label>
            <button className="btn primary" type="submit" disabled={busy || (paymentReversalRationales[payment.id] ?? '').trim().length < 10}>
              {busy ? 'Recording…' : 'Confirm payment reversal'}
            </button>
          </form>}
        </>}
      </div>)}
      {!activeLetters.length && !data.invoices.length && !data.payments.length && <p className="business-muted">No issued commercial documents or payments are recorded for this engagement.</p>}
    </div>}
  </section>;
}

function engagementService(data: BusinessDeliveryWorkspace | null, engagementId: string): string | undefined {
  return data?.engagement.id === engagementId ? data.engagement.serviceType : undefined;
}
