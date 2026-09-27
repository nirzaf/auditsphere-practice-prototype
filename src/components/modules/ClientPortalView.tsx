// Module 08: Client Experience Portal (VP-025)
// Client portal subviews include management representation acknowledgement without signature capture or payment.
// Strictly browser-only prototype: no online payments, no external mail delivery, local deterministic document registry.

import React, { useEffect, useRef, useState } from 'react';
import { getOutstandingPbcRequestCount } from '../../services/pbcRequestFilters';
import { RouteKey, PbcRequestItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { visibleClientIds, visibleEngagementIds } from '../../services/guards';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';
import { exportService } from '../../services/exportService';
import { sha256OfFile } from '../../services/fileMetadata';
import { persistArtifact } from '../../services/artifactStore';
import { validatePbcUpload } from '../../services/pbcUpload';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

interface ClientPortalViewProps {
  onNavigate: (route: RouteKey) => void;
  onBeforeContextChange: (run: () => void) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({ onNavigate, onBeforeContextChange, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [previewRole, setPreviewRole] = useState<'client_admin' | 'client_finance' | 'client'>('client_finance');
  const portalRole = state.currentRole === 'superuser' ? previewRole : state.currentRole;
  const [activeSub, setActiveSub] = useState<'home' | 'status' | 'pbc' | 'docs' | 'messages' | 'packages' | 'invoices' | 'approvals' | 'proposals' | 'nominations'>('home');
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadPbcModal, setUploadPbcModal] = useState<PbcRequestItem | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadDraftBaseline = useRef<{ requestId: string; clientId: string; engagementId: string } | null>(null);
  const [pbcReplies, setPbcReplies] = useState<Record<string, string>>({});
  const [rejectingAdjustmentId, setRejectingAdjustmentId] = useState<string | null>(null);
  const [adjustmentRejectNote, setAdjustmentRejectNote] = useState('');
  const [proposalContact, setProposalContact] = useState('');
  const [proposalEvidenceRef, setProposalEvidenceRef] = useState('');
  const [proposalResponseNotes, setProposalResponseNotes] = useState('');
  const [proposalResponseMethod, setProposalResponseMethod] = useState<'Email' | 'Meeting' | 'Letter'>('Email');
  const [packageRationale, setPackageRationale] = useState('');
  const [packageEvidence, setPackageEvidence] = useState('');
  const [nomineeName, setNomineeName] = useState('');
  const [nomineeEmail, setNomineeEmail] = useState('');
  const [nominationReason, setNominationReason] = useState('');

  // Client resolution supporting multi-entity grants (VP-025)
  const allowedClientIds = visibleClientIds(state);
  const availableClients = allowedClientIds === 'ALL'
    ? state.clients
    : state.clients.filter(c => (allowedClientIds as string[]).includes(c.id));

  const [selectedClientId, setSelectedClientId] = useState<string>(
    availableClients[0]?.id || ''
  );

  // Keep portal context valid when the simulated identity changes without unmounting this view.
  const resolvedClientId = availableClients.some(c => c.id === selectedClientId)
    ? selectedClientId
    : availableClients[0]?.id || '';
  const client = availableClients.find(c => c.id === resolvedClientId) || null;
  const allowedEngIds = visibleEngagementIds(state);
  const availableEngagements = client ? state.engagements.filter(e => e.client === client.id && (allowedEngIds === 'ALL' || (allowedEngIds as string[]).includes(e.id))) : [];
  const [selectedEngagementId, setSelectedEngagementId] = useState<string>(
    availableEngagements.find(e => e.id === state.selectedEngagement)?.id || availableEngagements[0]?.id || ''
  );
  const resolvedEngagementId = availableEngagements.some(e => e.id === selectedEngagementId)
    ? selectedEngagementId
    : availableEngagements[0]?.id || '';
  const eng = availableEngagements.find(e => e.id === resolvedEngagementId) || null;

  // Strictly filter by client grant and exclude unissued/drafts from client visibility (VP-025, VP-033)
  const invoices = client && eng ? state.invoices.filter(i => i.clientId === client.id && (i.engagementId || i.eng) === eng.id && (i.status === 'Issued' || i.status === 'Paid')) : [];
  const pbc = eng?.pbc.filter(request => request.status !== 'Draft' && request.status !== 'Cancelled') || [];
  // Same actionable-state filter as the staff request register (MOD-09-CL01).
  const pendingRequestCount = getOutstandingPbcRequestCount(pbc);
  // Issued credit notes reduce what the client still owes (MOD-08-CL01 / MOD-15).
  const issuedCreditsFor = (invoiceId: string) => (state.creditNotes || []).filter(credit => credit.invoiceId === invoiceId && credit.status === 'Issued').reduce((sum, credit) => sum + credit.amount, 0);
  const outstandingInvoiceCount = invoices.filter(inv => Math.round((inv.amount - (inv.paid || 0) - issuedCreditsFor(inv.id)) * 100) > 0).length;
  const sharedDocs = client ? state.documents.filter(d => d.visibility === 'Client shared' && d.clientId === client.id && (!d.engagementId || d.engagementId === eng?.id)) : [];
  const messages = client ? state.communications.filter(c => c.visibility === 'Client visible' && c.clientId === client.id && (!c.engagementId || c.engagementId === eng?.id)) : [];

  const triggerNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  };

  const handleDownloadInvoice = (inv: typeof invoices[0]) => {
    exportService.exportPDF(
      `${inv.invoiceNumber}_Client_Copy`,
      `Tax Invoice: ${inv.invoiceNumber}`,
      [
        `Customer: ${client?.name}`,
        `Service: ${eng?.service || 'Statutory Audit'}`,
        `Amount Billed: ${formatCurrency(inv.amount, inv.currency)}`,
        `Amount Paid: ${formatCurrency(inv.paid, inv.currency)}`,
        `Due Date: ${inv.due}`,
        `Status: ${inv.status}`
      ]
    );
    triggerNotice(`Downloaded invoice ${inv.invoiceNumber} PDF.`);
  };

  const handleDownloadSharedDoc = (docName: string, version: number) => {
    exportService.exportPDF(
      `${docName}_v${version}`,
      `Sample metadata preview: ${docName}`,
      [
        'SAMPLE PREVIEW ONLY — original file bytes are not stored or reproduced by this browser prototype.',
        `Document: ${docName}`,
        `Version: v${version}`,
        `Client: ${client?.name}`,
        'Source: local metadata registry; original content not available.'
      ]
    );
    triggerNotice(`Downloaded a sample metadata preview for ${docName}; it is not the original file.`);
  };

  const handleDownloadPackage = (relId: string, gen: number) => {
    exportService.exportPDF(
      `Deliverable_${relId}_Gen${gen}`,
      `Sample release preview - ${client?.name}`,
      [
        'SAMPLE PREVIEW ONLY — no released original bytes or external delivery are represented.',
        `Release Reference: ${relId}`,
        `Generation: Gen ${gen}`,
        `Client Entity: ${client?.name}`,
        `Service: ${eng?.service}`,
        `Lead Audit Partner: ${eng?.partner}`
      ]
    );
    triggerNotice(`Downloaded a local sample preview for release ${relId}.`);
  };

  const commitPbcUpload = async (): Promise<boolean> => {
    if (!uploadPbcModal || !uploadFile || !eng) return false;
    try {
      const validationError = validatePbcUpload(uploadFile);
      if (validationError) throw new Error(validationError);
      const sha256 = await sha256OfFile(uploadFile);
      const id = `DOC-PBC-${crypto.randomUUID()}`;
      const responseBlob = new Blob([uploadFile], { type: uploadFile.type || 'application/octet-stream' });
      await persistArtifact({ id, name: uploadFile.name, kind: 'PBC', mimeType: responseBlob.type, size: responseBlob.size, sha256 }, responseBlob);
      prototypeStore.uploadPbcResponse(eng.id, uploadPbcModal.id, {
        id,
        name: uploadFile.name,
        size: uploadFile.size,
        sha256,
        type: uploadFile.type
      });
      triggerNotice(`Saved ${uploadFile.name} locally (${uploadFile.size} bytes, SHA-256 ${sha256.slice(0, 12)}…). No file was uploaded to an external service.`);
      setUploadPbcModal(null);
      setUploadFile(null);
      uploadDraftBaseline.current = null;
      return true;
    } catch (err: any) {
      triggerNotice(`Upload error: ${err.message}`);
      return false;
    }
  };

  const discardPbcUpload = () => {
    setUploadFile(null);
    setUploadPbcModal(null);
    uploadDraftBaseline.current = null;
  };
  const closePbcUpload = () => onBeforeContextChange(discardPbcUpload);
  const handleUploadSubmit = async (event: React.FormEvent) => { event.preventDefault(); await commitPbcUpload(); };

  useEffect(() => {
    const baseline = uploadDraftBaseline.current;
    if (!uploadPbcModal || !baseline) { onRegisterUnsavedForm(null, 'portal-pbc-upload'); return; }
    onRegisterUnsavedForm({
      label: 'client PBC upload draft',
      isDirty: () => Boolean(uploadFile && (uploadFile !== null || uploadPbcModal.id !== baseline.requestId || client?.id !== baseline.clientId || eng?.id !== baseline.engagementId)),
      save: commitPbcUpload,
      discard: discardPbcUpload,
    }, 'portal-pbc-upload');
    return () => onRegisterUnsavedForm(null, 'portal-pbc-upload');
  }, [uploadPbcModal, uploadFile, client?.id, eng?.id, onRegisterUnsavedForm]);

  const handlePbcReply = (event: React.FormEvent, request: PbcRequestItem) => {
    event.preventDefault();
    if (!eng) return;
    try {
      prototypeStore.replyToPbcRequest(eng.id, request.id, pbcReplies[request.id] || '');
      setPbcReplies(current => ({ ...current, [request.id]: '' }));
      triggerNotice(`Reply added to ${request.id}'s client-visible timeline.`);
    } catch (err) {
      triggerNotice(err instanceof Error ? err.message : 'Reply could not be added.');
    }
  };

  const handleManagementApproval = () => {
    if (!eng) return;
    try {
      prototypeStore.recordApproval(eng.id, 'client', 'Management representation receipt recorded in the local prototype; no signature was captured.');
      triggerNotice('Management representation receipt recorded locally. No signature was captured.');
    } catch (err) {
      triggerNotice(err instanceof Error ? err.message : 'Management acknowledgement could not be recorded.');
    }
  };

  const handleManagementPackageDecision = (decision: 'Acknowledged' | 'Rejected') => {
    if (!eng) return;
    try {
      prototypeStore.recordManagementPackageDecision(eng.id, decision, packageRationale, packageEvidence);
      setPackageRationale(''); setPackageEvidence('');
      triggerNotice(`Package ${decision.toLowerCase()} recorded with rationale and evidence.`);
    } catch (err) {
      triggerNotice(err instanceof Error ? err.message : 'Management package decision could not be recorded.');
    }
  };

  const handleAdjustmentDecision = (journalId: string, accepted: boolean, note = '') => {
    try {
      prototypeStore.recordAdjustmentManagementDecision(journalId, accepted, note);
      setRejectingAdjustmentId(null);
      setAdjustmentRejectNote('');
      triggerNotice(accepted ? 'Management accepted the adjustment for reporting.' : 'Management rejected the adjustment.');
    } catch (err) {
      triggerNotice(err instanceof Error ? err.message : 'Adjustment decision could not be recorded.');
    }
  };

  const handleProposalResponse = (proposalId: string, responseType: 'Accepted' | 'Declined' | 'Withdrawn') => {
    try {
      prototypeStore.recordProposalResponse(proposalId, { responseType, contact: proposalContact.trim(), date: new Date().toISOString().slice(0, 10), method: proposalResponseMethod, notes: proposalResponseNotes.trim(), evidenceRef: proposalEvidenceRef.trim() });
      setProposalContact(''); setProposalEvidenceRef(''); setProposalResponseNotes(''); setProposalResponseMethod('Email');
      triggerNotice(`Proposal ${proposalId} ${responseType.toLowerCase()} response recorded with evidence reference.`);
    } catch (err) { triggerNotice(err instanceof Error ? err.message : 'Proposal response could not be recorded.'); }
  };

  const clearNominationDraft = () => {
    setNomineeName('');
    setNomineeEmail('');
    setNominationReason('');
  };

  const commitNomination = (): boolean => {
    if (!client || portalRole !== 'client_admin') return false;
    try {
      prototypeStore.nominateClientContact({ clientId: client.id, name: nomineeName, email: nomineeEmail, reason: nominationReason });
      clearNominationDraft();
      triggerNotice('Contact nomination submitted for staff review. No identity or access grant was created.');
      return true;
    } catch (err) {
      triggerNotice(err instanceof Error ? err.message : 'Contact nomination could not be submitted.');
      return false;
    }
  };

  useEffect(() => {
    const hasDraft = Boolean(nomineeName.trim() || nomineeEmail.trim() || nominationReason.trim());
    if (portalRole !== 'client_admin' || activeSub !== 'nominations' || !hasDraft) {
      onRegisterUnsavedForm(null, 'portal-contact-nomination');
      return;
    }
    onRegisterUnsavedForm({
      label: 'client contact nomination draft',
      isDirty: () => Boolean(nomineeName.trim() || nomineeEmail.trim() || nominationReason.trim()),
      save: () => commitNomination(),
      discard: clearNominationDraft,
    }, 'portal-contact-nomination');
    return () => onRegisterUnsavedForm(null, 'portal-contact-nomination');
  }, [portalRole, activeSub, nomineeName, nomineeEmail, nominationReason, client?.id, onRegisterUnsavedForm]);

  if (!client) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="globe" size="xl" className="text-muted mb16" />
        <h3>Client Portal Unavailable</h3>
        <p className="sub max-w-md mx-auto mt8">
          No client entity is currently mapped or permitted for your active identity.
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Portal Top Bar */}
      <div className="panel panel-pad" style={{ background: '#0e2f38', color: '#fff' }}>
        <div className="between">
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <div className="firmavatar" style={{ background: '#00c7a2', color: '#092128' }}>
              {client.initials || 'ET'}
            </div>
            <div>
              <span className="caption" style={{ color: '#00c7a2' }}>CLIENT SECURE PORTAL</span>
              <h2 style={{ color: '#fff', margin: 0 }}>{client.name}</h2>
              <div className="cell-sub" style={{ color: '#9fc4c9' }}>
                {state.currentRole === 'superuser' ? `SUPERUSER PORTAL PREVIEW · Previewing as ${portalRole.replace('_', ' ')}` : `Logged in as: ${state.currentPerson} (${state.currentRole})`}
              </div>
            </div>
          </div>

          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            {state.currentRole === 'superuser' && <label className="caption" style={{ color: '#9fc4c9' }}>Preview client role
              <select className="input sm" aria-label="Preview client portal role" style={{ background: '#193f49', color: '#fff', borderColor: '#2e5661', marginLeft: 6 }} value={previewRole} onChange={event => setPreviewRole(event.target.value as typeof previewRole)}>
                <option value="client_admin" style={{ color: '#000' }}>Client administrator</option>
                <option value="client_finance" style={{ color: '#000' }}>Finance contributor</option>
                <option value="client" style={{ color: '#000' }}>Management approver</option>
              </select>
            </label>}
            {availableClients.length > 1 && (
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <span className="caption" style={{ color: '#9fc4c9' }}>Switch Entity:</span>
                <select
                  className="input sm"
                  aria-label="Switch client entity"
                  style={{ background: '#193f49', color: '#fff', borderColor: '#2e5661' }}
                  value={resolvedClientId}
                  onChange={e => {
                    const nextClientId = e.target.value;
                    onBeforeContextChange(() => {
                      setSelectedClientId(nextClientId);
                      setSelectedEngagementId(state.engagements.find(item => item.client === nextClientId && (allowedEngIds === 'ALL' || (allowedEngIds as string[]).includes(item.id)))?.id || '');
                    });
                  }}
                >
                  {availableClients.map(c => (
                    <option key={c.id} value={c.id} style={{ color: '#000' }}>
                      {c.name} ({c.code || c.id})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {availableEngagements.length > 1 && (
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <span className="caption" style={{ color: '#9fc4c9' }}>Engagement:</span>
                <select className="input sm" aria-label="Switch engagement" style={{ background: '#193f49', color: '#fff', borderColor: '#2e5661' }} value={resolvedEngagementId} onChange={e => { const nextEngagementId = e.target.value; onBeforeContextChange(() => setSelectedEngagementId(nextEngagementId)); }}>
                  {availableEngagements.map(item => <option key={item.id} value={item.id} style={{ color: '#000' }}>{item.id} · {item.service} · FY{item.year}</option>)}
                </select>
              </div>
            )}
            <button className="btn sm ghost" style={{ color: '#fff', borderColor: '#406368' }} onClick={() => onNavigate('overview')}>
              Exit Portal Preview
            </button>
          </div>
        </div>

        {/* Notice Banner */}
        {notice && (
          <div className="mt12" style={{ background: '#00c7a220', border: '1px solid #00c7a2', padding: '8px 14px', borderRadius: 4, color: '#00c7a2' }}>
            {notice}
          </div>
        )}

        {/* Portal Navigation Tabs */}
        <div className="tabs mt20" style={{ borderBottomColor: '#20454d' }}>
          {[
            { key: 'home', label: 'Home Dashboard' },
            { key: 'status', label: 'Audit Engagement Status' },
            { key: 'pbc', label: `Information Requests (${pendingRequestCount})` },
            { key: 'docs', label: 'Shared Documents' },
            { key: 'messages', label: 'Messages & Mail' },
            { key: 'packages', label: 'Published Reports' },
            { key: 'invoices', label: 'Fee Invoices' },
            ...(portalRole === 'client_admin' ? [{ key: 'nominations', label: 'Nominate a Contact' }] : []),
            ...(portalRole === 'client' ? [{ key: 'proposals', label: 'Proposals & Terms' }, { key: 'approvals', label: 'Management Approvals' }] : [])
          ].map(t => (
            <button
              key={t.key}
              className={`tab-btn ${activeSub === t.key ? 'active' : ''}`}
              style={{ color: activeSub === t.key ? '#00c7a2' : '#9fc4c9' }}
              onClick={() => setActiveSub(t.key as any)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Subview 1: Home */}
      {activeSub === 'home' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-label">Current Phase</span>
              <div className="metric-val" style={{ fontSize: 20 }}>{eng?.stage || 'Fieldwork'}</div>
              <span className="metric-sub">Target Clearance: {eng?.due || '31 Oct 2026'}</span>
            </div>
            <div className="metric blue">
              <span className="metric-label">Pending Client Requests</span>
              <div className="metric-val">{pendingRequestCount}</div>
              <span className="metric-sub">Action required from finance team</span>
            </div>
            <div className="metric green">
              <span className="metric-label">Outstanding Invoices</span>
              <div className="metric-val">{outstandingInvoiceCount}</div>
              <span className="metric-sub">Standard 30-day payment terms</span>
            </div>
          </div>

          <div className="panel panel-pad">
            <h3>Recent Communications from Audit Team</h3>
            <div className="stack mt12" style={{ gap: 8 }}>
              {messages.length === 0 ? (
                <p className="sub">No correspondence posted yet.</p>
              ) : (
                messages.slice(0, 3).map(m => (
                  <div key={m.id} className="borderbox" style={{ padding: 12 }}>
                    <div className="between">
                      <b>{m.summary}</b>
                      <span className="caption">{new Date(m.date).toLocaleDateString('en-GB')}</span>
                    </div>
                    <p className="sub mt4" style={{ fontSize: 13 }}>{m.body}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeSub === 'nominations' && portalRole === 'client_admin' && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="panel panel-pad">
            <h3>Nominate a client contact</h3>
            <p className="sub">Send a contact suggestion to the audit practice for review. This does not create a portal login, grant access, or confer management-approval authority.</p>
            <form className="grid-2 mt12" onSubmit={event => {
              event.preventDefault();
              commitNomination();
            }}>
              <label className="caption">Contact name<input className="input mt4" aria-label="Nominee name" value={nomineeName} onChange={event => setNomineeName(event.target.value)} required maxLength={120} /></label>
              <label className="caption">Contact email<input className="input mt4" aria-label="Nominee email" type="email" value={nomineeEmail} onChange={event => setNomineeEmail(event.target.value)} required maxLength={254} /></label>
              <label className="caption" style={{ gridColumn: '1 / -1' }}>Why should this contact be added?<textarea className="input mt4" aria-label="Nomination reason" value={nominationReason} onChange={event => setNominationReason(event.target.value)} required maxLength={1000} rows={3} /></label>
              <div><button className="btn primary" type="submit">Submit nomination</button></div>
            </form>
          </div>
          <div className="panel panel-pad">
            <h3>Nomination history</h3>
            {(state.clientContactNominations || []).filter(item => item.clientId === client.id).length === 0
              ? <p className="sub mt8">No contacts have been nominated for this entity.</p>
              : <div className="stack mt8">{(state.clientContactNominations || []).filter(item => item.clientId === client.id).map(item => <div className="borderbox" key={item.id}><div className="between"><b>{item.name}</b><span className="badge amber">{item.status}</span></div><div className="cell-sub">{item.email} · Nominated by {item.nominatedBy} · {new Date(item.nominatedAt).toLocaleString('en-GB')}</div><p className="sub mt4">{item.reason}</p></div>)}</div>}
            <p className="caption mt8">Only authorized staff can review a nomination and separately manage contacts or access grants.</p>
          </div>
        </div>
      )}

      {/* Subview 2: Status */}
      {activeSub === 'status' && (
        <div className="panel panel-pad">
          <h3>FY {eng?.year || 2026} Statutory Audit Progress</h3>
          <p className="sub" style={{ marginBottom: 16 }}>
            Engagement Team: {eng?.manager || 'Engagement Manager'} (Manager), {eng?.partner || 'Lead Partner'} (Lead Audit Partner).
          </p>
          <div className="lifecyclebar mt16">
            {['Planning', 'Fieldwork', 'Review Desk', 'Partner Clearance', 'Released'].map((st, i) => (
              <div key={st} className={`life-step ${i <= 2 ? 'done' : i === 3 ? 'current' : ''}`}>
                <em>{i + 1}</em>
                {st}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subview 3: PBC Requests */}
      {activeSub === 'pbc' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Information Requests (PBC Schedule)</h3>
            <span className="caption">Upload evidence schedules requested by audit team</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Request Title</th>
                  <th>Category</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>File Upload</th>
                </tr>
              </thead>
              <tbody>
                {pbc.length === 0 ? (
                  <tr><td colSpan={5} className="text-center sub" style={{ padding: 20 }}>No information requests active.</td></tr>
                ) : (
                  pbc.map(p => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.title}</b>
                        <div className="cell-sub">{p.id}</div>
                        {p.clarificationNote && <div className="cell-sub">Clarification requested: {p.clarificationNote}</div>}
                        {p.sharedFiles && p.sharedFiles.length > 0 && (
                          <details className="mt4">
                            <summary className="cell-sub text-teal">Files submitted ({p.sharedFiles.length}) — latest: {p.sharedFiles[p.sharedFiles.length - 1].name}</summary>
                            {p.sharedFiles.map((file, index) => (
                              <div className="cell-sub" key={`${file.name}-${index}`}>v{file.version} · {file.name} · {new Date(file.uploadedAt).toLocaleDateString()} · by {file.uploadedBy}</div>
                            ))}
                          </details>
                        )}
                        <details className="mt4">
                          <summary className="cell-sub text-teal">Conversation &amp; timeline ({(p.thread?.filter(message => message.clientVisible === true).length || 0) + state.communications.filter(item => item.relatedRequestId === p.id && item.clientId === client.id && item.engagementId === eng?.id && item.visibility === 'Client visible').length})</summary>
                          <div className="stack mt8" role="log" aria-label={`Client-visible conversation for ${p.id}`} style={{ gap: 6 }}>
                            {[...(p.thread || []).filter(message => message.clientVisible === true).map(message => ({ ...message, sortTime: message.time })), ...state.communications.filter(item => item.relatedRequestId === p.id && item.clientId === client.id && item.engagementId === eng?.id && item.visibility === 'Client visible').map(item => ({ id: item.id, kind: 'email' as const, author: item.author, role: 'Staff', text: `${item.summary}\n\n${item.body || ''}${item.ccEmails?.length ? `\n\nCC: ${item.ccEmails.join(', ')}` : ''}${item.status ? `\n\nLocal simulation outcome: ${item.status}. No email was sent.` : ''}`, time: item.date, sortTime: item.date, clientVisible: true, file: undefined, version: undefined }))].sort((a, b) => a.sortTime.localeCompare(b.sortTime)).map(message => (
                              <div className="borderbox" key={message.id} style={{ padding: 8 }}>
                                <div className="between"><b>{message.author}</b><span className="caption">{Number.isNaN(Date.parse(message.time)) ? message.time : new Date(message.time).toLocaleString('en-GB')}</span></div>
                                <div className="cell-sub">{message.kind === 'response' ? 'File response' : message.kind === 'clarification' ? 'Audit clarification' : message.kind === 'email' ? 'Email · local simulation' : 'Message'}{message.file ? ` · ${message.file}${message.version ? ` · v${message.version}` : ''}` : ''}</div>
                                <p className="sub mt4" style={{ whiteSpace: 'pre-line' }}>{message.text}</p>
                              </div>
                            ))}
                            {!(p.thread?.some(message => message.clientVisible === true) || state.communications.some(item => item.relatedRequestId === p.id && item.clientId === client.id && item.engagementId === eng?.id && item.visibility === 'Client visible')) && <p className="caption">No messages yet. Replies and file responses appear here for both parties.</p>}
                          </div>
                          {['Requested', 'Needs clarification', 'Received'].includes(p.status) && (
                            <form className="stack mt8" onSubmit={event => handlePbcReply(event, p)} style={{ gap: 6 }}>
                              <label className="caption" htmlFor={`pbc-reply-${p.id}`}>Reply to the audit team</label>
                              <textarea id={`pbc-reply-${p.id}`} className="input" rows={2} maxLength={2000} value={pbcReplies[p.id] || ''} onChange={event => setPbcReplies(current => ({ ...current, [p.id]: event.target.value }))} placeholder="Ask a question or add context for your upload" />
                              <div><button className="btn sm" type="submit" disabled={!(pbcReplies[p.id] || '').trim()}>Send reply</button></div>
                            </form>
                          )}
                        </details>
                      </td>
                      <td>{p.category}</td>
                      <td>{p.due}</td>
                      <td>
                        <span className={`badge ${p.status === 'Accepted' ? 'green' : p.status === 'Received' ? 'blue' : 'amber'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td>
                        {p.status === 'Accepted' ? (
                          <span className="caption">Accepted — no further upload</span>
                        ) : (
                          <button
                            className="btn sm"
                            disabled={!['Requested', 'Needs clarification', 'Received'].includes(p.status)}
                            title={!['Requested', 'Needs clarification', 'Received'].includes(p.status) ? 'This request is not open for uploads' : undefined}
                            onClick={() => {
                              uploadDraftBaseline.current = { requestId: p.id, clientId: client.id, engagementId: eng?.id || '' };
                              setUploadPbcModal(p);
                              setUploadFile(null);
                            }}
                          >
                            <Icon name="plus" size="sm" /> Upload Document
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subview 4: Shared Docs */}
      {activeSub === 'docs' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Shared Engagement Documents</h3>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Version</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sharedDocs.length === 0 ? (
                  <tr><td colSpan={4} className="text-center sub" style={{ padding: 20 }}>No shared documents available for this entity.</td></tr>
                ) : (
                  sharedDocs.map(d => (
                    <tr key={d.id}>
                      <td><b>{d.name}</b></td>
                      <td>v{d.version}</td>
                      <td>{new Date(d.uploadedAt).toLocaleDateString('en-GB')}</td>
                      <td>
                        <button className="btn sm" onClick={() => handleDownloadSharedDoc(d.name, d.version)}>
                          <Icon name="download" size="sm" /> Download
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subview 5: Messages */}
      {activeSub === 'messages' && (
        <div className="panel panel-pad">
          <h3>Correspondence with STE Audit Practice</h3>
          <div className="stack mt12" style={{ gap: 10 }}>
            {messages.length === 0 ? (
              <p className="sub">No correspondence records available.</p>
            ) : (
              messages.map(m => (
                <div key={m.id} className="borderbox" style={{ padding: 12 }}>
                  <div className="between">
                    <b>{m.summary}</b>
                    <span className="caption">{new Date(m.date).toLocaleDateString('en-GB')}</span>
                  </div>
                  <p className="sub mt8" style={{ whiteSpace: 'pre-line' }}>{m.body}</p>
                  {m.linkedDocumentId && (() => { const linked = state.documents.find(document => document.id === m.linkedDocumentId && document.clientId === client.id && (!document.engagementId || document.engagementId === eng?.id) && document.visibility === 'Client shared' && !document.brokenLink); return linked ? <div className="cell-sub mt8">Shared document · {linked.name} · v{linked.version}</div> : null; })()}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Subview 6: Packages */}
      {activeSub === 'packages' && (
        <div className="panel panel-pad">
          <h3>Published Statutory Deliverables</h3>
          {!eng || eng.releases.length === 0 ? (
            <p className="sub">No official audit packages published yet for FY {eng?.year || 2026}. Work is currently in fieldwork review.</p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {eng.releases.map(rel => (
                <div key={rel.id} className="between borderbox" style={{ padding: 12 }}>
                  <div>
                    <b>Audited Financial Report Package ({rel.id})</b>
                    <div className="cell-sub">
                      Released on {new Date(rel.releasedAt).toLocaleDateString('en-GB')} by {rel.releasedBy} · Gen {rel.generation}
                    </div>
                  </div>
                  <button className="btn primary sm" onClick={() => handleDownloadPackage(rel.id, rel.generation)}>
                    <Icon name="download" /> Download Report Package
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subview 7: Invoices */}
      {activeSub === 'invoices' && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Professional Fee Invoices</h3>
              <p className="sub">View and download invoices. Payments are settled offline via bank wire (settlement is offline; online payment is excluded).</p>
            </div>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={7} className="text-center sub" style={{ padding: 20 }}>No issued invoices for this entity.</td></tr>
                ) : (
                  invoices.map(inv => (
                    <tr key={inv.id}>
                      <td><b>{inv.invoiceNumber}</b></td>
                      <td>{inv.description}</td>
                      <td><b>{formatCurrency(inv.amount, inv.currency)}</b></td>
                      <td>{formatCurrency(inv.paid, inv.currency)}</td>
                      <td>
                        <span className={`badge ${inv.status === 'Paid' ? 'green' : 'amber'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td>{inv.due}</td>
                      <td>
                        <button className="btn sm" onClick={() => handleDownloadInvoice(inv)}>
                          <Icon name="download" size="sm" /> Download Invoice PDF
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSub === 'proposals' && portalRole === 'client' && (
        <div className="panel panel-pad">
          <h3>Proposals &amp; Engagement Terms</h3>
          <p className="sub mt8">Review the exact revision formally presented to this client. A recorded response does not create an engagement or authorize work.</p>
          {state.proposals.filter(item => item.clientId === client.id && ['Presented', 'Accepted', 'Declined', 'Withdrawn', 'Superseded'].includes(item.state)).length === 0 ? <p className="sub mt12">No presented proposals for this entity.</p> : state.proposals.filter(item => item.clientId === client.id && ['Presented', 'Accepted', 'Declined', 'Withdrawn', 'Superseded'].includes(item.state)).map(item => {
            const snapshot = item.presentedSnapshot;
            return <div className="borderbox mt12" key={item.id}>
              <div className="between"><b>{snapshot?.title || item.title} · Rev {snapshot?.revision ?? item.revision}</b><span className="badge blue">{item.state}</span></div>
              <div className="cell-sub mt4">{item.id} · {snapshot ? formatCurrency(snapshot.totalAmount, snapshot.currency) : 'No presentation snapshot'}</div>
              {snapshot?.items.map(line => <div className="mt12" key={line.id}><b>{line.serviceName}</b><p className="sub mt4">Scope: {line.scope}</p><p className="sub">Exclusions: {line.exclusions || 'None stated'}</p><p className="sub">Deliverables: {line.deliverables}</p><p className="sub">Client responsibilities: {line.clientResponsibilities}</p></div>)}
              {snapshot && <p className="sub mt8">Terms: {snapshot.terms}</p>}
              {item.clientResponse && <div className="banner green mt12">{item.clientResponse.responseType} by {item.clientResponse.contact} · {item.clientResponse.method} · {item.clientResponse.date} · Evidence {item.clientResponse.evidenceRef}</div>}
              {item.state === 'Presented' && snapshot && snapshot.revision === item.revision && <div className="stack mt12">
                <label className="caption">Client contact<select className="input" value={proposalContact} onChange={e => setProposalContact(e.target.value)} required><option value="" disabled>Select an active contact</option>{state.contacts.filter(contact => contact.clientId === item.clientId && contact.active).map(contact => <option key={contact.id} value={contact.name}>{contact.name}{contact.isPrimary ? ' · Primary' : ''}</option>)}</select></label>
                <label className="caption">Response method<select className="input" value={proposalResponseMethod} onChange={e => setProposalResponseMethod(e.target.value as 'Email' | 'Meeting' | 'Letter')}><option>Email</option><option>Meeting</option><option>Letter</option></select></label>
                <label className="caption">Evidence reference (email, letter or meeting record)<input className="input" value={proposalEvidenceRef} onChange={e => setProposalEvidenceRef(e.target.value)} required /></label>
                <label className="caption">Response notes<textarea className="input" rows={2} value={proposalResponseNotes} onChange={e => setProposalResponseNotes(e.target.value)} required /></label>
                <div className="row"><button className="btn primary sm" disabled={!proposalContact.trim() || !proposalEvidenceRef.trim() || !proposalResponseNotes.trim()} onClick={() => handleProposalResponse(item.id, 'Accepted')}>Record Acceptance</button><button className="btn sm ghost" disabled={!proposalContact.trim() || !proposalEvidenceRef.trim() || !proposalResponseNotes.trim()} onClick={() => handleProposalResponse(item.id, 'Declined')}>Record Decline</button><button className="btn sm ghost" disabled={!proposalContact.trim() || !proposalEvidenceRef.trim() || !proposalResponseNotes.trim()} onClick={() => handleProposalResponse(item.id, 'Withdrawn')}>Record Withdrawal</button></div>
              </div>}
            </div>;
          })}
        </div>
      )}

      {activeSub === 'approvals' && portalRole === 'client' && (
        <div className="panel panel-pad">
          <h3>Presented Financial Package</h3>
          {!eng?.managementPresentation ? <p className="sub mt8">No package has been deliberately presented for management review.</p> : <div className="borderbox mt12" key={`${eng.id}-${eng.managementPresentation.packageRevision}`}>
            <div className="between"><b>Package v{eng.managementPresentation.packageRevision} · Source v{eng.managementPresentation.sourceVersion} · Gen {eng.managementPresentation.generation}</b><span className="badge blue">Presented</span></div>
            <p className="cell-sub mt4">Presented by {eng.managementPresentation.presentedBy} on {new Date(eng.managementPresentation.presentedAt).toLocaleString('en-GB')}</p>
            <div className="stack mt12">{eng.managementPresentation.artifacts.map(artifact => <div className="cell-sub" key={artifact.id}>{artifact.kind} · {artifact.name} · {artifact.size} bytes · SHA-256 {artifact.sha256}</div>)}</div>
            {eng.managementPackageDecision && eng.managementPackageDecision.generation === eng.generation ? <div className="banner green mt12">{eng.managementPackageDecision.decision} by {eng.managementPackageDecision.by} · {eng.managementPackageDecision.rationale} · Evidence {eng.managementPackageDecision.evidenceRef}</div> : <div className="stack mt12">
              <label className="caption">Management rationale<textarea aria-label="Management package rationale" className="input" rows={2} value={packageRationale} onChange={event => setPackageRationale(event.target.value)} /></label>
              <label className="caption">Evidence reference<input aria-label="Management package evidence" className="input" value={packageEvidence} onChange={event => setPackageEvidence(event.target.value)} /></label>
              <div className="row"><button className="btn primary sm" disabled={!packageRationale.trim() || !packageEvidence.trim()} onClick={() => handleManagementPackageDecision('Acknowledged')}>Acknowledge Package</button><button className="btn sm ghost" disabled={!packageRationale.trim() || !packageEvidence.trim()} onClick={() => handleManagementPackageDecision('Rejected')}>Reject Package</button></div>
            </div>}
          </div>}
          <h3>Management Representation Receipt</h3>
          {!eng ? <p className="sub mt8">Select an engagement within your granted client scope.</p> : <>
            <p className="sub mt8">Engagement {eng.id} · Generation {eng.generation}. This records a local receipt of management representation; it is not an electronic signature or external certification.</p>
            {eng.approvals.client?.generation === eng.generation ? (
              <div className="banner green mt12">Receipt recorded by {eng.approvals.client.by} for the current generation.</div>
            ) : (
              <button className="btn primary sm mt12" disabled={!eng.acceptance} onClick={handleManagementApproval}>Record Representation Receipt</button>
            )}
          </>}
          <div className="mt20">
            <h3>Audit Adjustments for Management Decision</h3>
            {!eng ? <p className="sub mt8">Select an engagement within your granted client scope.</p> : state.adjustmentJournals.filter(j => j.engagementId === eng.id && j.status === 'Technical review').length === 0 ? <p className="sub mt8">No technically reviewed adjustments are waiting for a decision.</p> : state.adjustmentJournals.filter(j => j.engagementId === eng.id && j.status === 'Technical review').map(journal => (
              <div className="borderbox mt12" key={journal.id}>
                <div className="between"><b>{journal.title}</b><span className="tag amber">Technical review complete</span></div>
                <div className="caption mt4">{journal.id} · Reviewed by {journal.reviewedBy}</div>
                {journal.rationale && <p className="sub mt8">{journal.rationale}</p>}
                <ul className="caption mt8">{journal.lines.map((line, index) => <li key={index}>{line.accountCode} · {line.accountName} · {line.type} {formatCurrency(line.amount, eng.currency)}</li>)}</ul>
                {rejectingAdjustmentId === journal.id ? <div className="stack mt12">
                  <label className="caption" htmlFor="adjustment-rejection-note">Reason for rejection (required)</label>
                  <textarea id="adjustment-rejection-note" className="input" rows={2} value={adjustmentRejectNote} onChange={e => setAdjustmentRejectNote(e.target.value)} required />
                  <div className="row"><button className="btn sm danger" disabled={!adjustmentRejectNote.trim()} onClick={() => handleAdjustmentDecision(journal.id, false, adjustmentRejectNote)}>Confirm rejection</button><button className="btn sm ghost" onClick={() => { setRejectingAdjustmentId(null); setAdjustmentRejectNote(''); }}>Cancel</button></div>
                </div> : <div className="row mt12"><button className="btn primary sm" onClick={() => handleAdjustmentDecision(journal.id, true)}>Accept adjustment</button><button className="btn sm ghost" onClick={() => { setRejectingAdjustmentId(journal.id); setAdjustmentRejectNote(''); }}>Reject adjustment</button></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload PBC Modal */}
      {uploadPbcModal && (
        <div className="modal-backdrop" data-dismiss-guard="self" onClick={event => { if (event.target === event.currentTarget) closePbcUpload(); }}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Upload Evidence Schedule</h2>
              <button className="icon-btn" onClick={closePbcUpload}>✕</button>
            </div>
            <form onSubmit={handleUploadSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Information Request</label>
                  <div style={{ fontWeight: 600 }}>{uploadPbcModal.title}</div>
                  <div className="cell-sub">{uploadPbcModal.category} · Due {uploadPbcModal.due}</div>
                </div>
                <div>
                  <label className="caption">Choose a local file</label>
                  <input
                    type="file"
                    className="input"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,image/png,image/jpeg"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    required
                  />
                  <span className="caption" style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                    The browser saves the original bytes in local IndexedDB and verifies their SHA-256. Nothing is uploaded to SharePoint or another service.
                  </span>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={closePbcUpload}>Cancel</button>
                <button type="submit" className="btn primary sm" disabled={!uploadFile}>Save response file</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
