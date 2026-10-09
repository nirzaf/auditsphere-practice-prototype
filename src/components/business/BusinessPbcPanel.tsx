import React, { useEffect, useRef, useState } from 'react';
import type {
  BusinessContextResponse,
  BusinessFileMediaType,
  BusinessPbcEngagement,
  BusinessPbcPortal,
  BusinessPbcRequest,
  BusinessWorkspacePreference
} from '../../shared/api/business';
import {
  completeBusinessFile,
  downloadBusinessFileVersion,
  getBusinessClient,
  getBusinessPbcEngagements,
  getBusinessPbcPortal,
  initializeBusinessFile,
  newBusinessIdempotencyKey,
  runBusinessCommand,
  uploadBusinessFile
} from '../../services/businessWorkspace';

interface ContactChoice { id: string; full_name: string; active: boolean; is_primary: boolean; rationale: string | null }
interface PendingUpload {
  requestId: string;
  requestVersion: number;
  selected: BusinessWorkspacePreference;
  file: File;
  clientComment: string;
  reservation?: Awaited<ReturnType<typeof initializeBusinessFile>>;
  staged?: { fileId: string; version: number; sizeBytes: number; sha256: string };
  committed?: { fileId: string; version: number; state: 'COMMITTED'; sizeBytes: number; sha256: string; commandId: string; replayed: boolean };
  keys: { reserve: string; stage: string; commit: string; submit: string };
}

function fileMediaType(file: File): BusinessFileMediaType {
  const allowed: BusinessFileMediaType[] = [
    'application/pdf', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'application/zip'
  ];
  if (allowed.includes(file.type as BusinessFileMediaType)) return file.type as BusinessFileMediaType;
  const extension = file.name.split('.').pop()?.toLowerCase();
  const fallback: Record<string, BusinessFileMediaType> = {
    pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', zip: 'application/zip'
  };
  const mediaType = extension ? fallback[extension] : undefined;
  if (!mediaType) throw new Error('Choose a PDF, CSV, text, XLSX, DOCX, PNG, JPEG or ZIP file.');
  return mediaType;
}

function statusLabel(status: BusinessPbcRequest['status']): string {
  if (status === 'PENDING_UPLOAD') return 'Pending Upload';
  if (status === 'UNDER_REVIEW') return 'Under Review';
  if (status === 'APPROVED') return 'Approved';
  return 'Rejected / Re-upload Required';
}

export function BusinessPbcPanel({
  workspaceId, selected, context, directoryRevision, onChanged
}: {
  workspaceId: string;
  selected: BusinessWorkspacePreference;
  context: BusinessContextResponse;
  directoryRevision: number;
  onChanged: () => void;
}) {
  const [engagements, setEngagements] = useState<BusinessPbcEngagement[]>([]);
  const [engagementId, setEngagementId] = useState(selected.engagementId ?? '');
  const [contacts, setContacts] = useState<ContactChoice[]>([]);
  const [contactsScopeKey, setContactsScopeKey] = useState('');
  const [portal, setPortal] = useState<BusinessPbcPortal | null>(null);
  const [portalScopeKey, setPortalScopeKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [portalError, setPortalError] = useState('');
  const [message, setMessage] = useState('');
  const [clientComments, setClientComments] = useState<Record<string, string>>({});
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [pendingRequestIds, setPendingRequestIds] = useState<string[]>([]);
  const uploadAttempts = useRef(new Map<string, PendingUpload>());
  const commandKeys = useRef(new Map<string, { signature: string; key: string }>());
  const cursor = useRef<string | null>(null);
  const polling = useRef(false);
  const engagement = engagements.find(item => item.id === engagementId) ?? null;
  const requestContext: BusinessWorkspacePreference | null = engagement
    ? { ...selected, clientId: engagement.clientId, engagementId: engagement.id }
    : null;
  const activePortalScopeKey = [workspaceId, context.actor.id, context.actor.persona, context.actor.clientId ?? selected.clientId ?? '', engagementId].join('|');
  const activeContactsScopeKey = [context.actor.id, engagement?.clientId ?? ''].join('|');
  const visibleContacts = contactsScopeKey === activeContactsScopeKey ? contacts : [];

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setEngagements([]);
    setPortal(null);
    setPortalScopeKey('');
    setContacts([]);
    setContactsScopeKey('');
    cursor.current = null;
    setEngagementId(selected.engagementId ?? '');
    getBusinessPbcEngagements(workspaceId, { ...selected, engagementId: undefined }, controller.signal).then(items => {
      if (controller.signal.aborted) return;
      setEngagements(items);
      setEngagementId(current => items.some(item => item.id === current)
        ? current : items.find(item => item.id === selected.engagementId)?.id ?? items[0]?.id ?? '');
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The PBC engagement list could not be loaded.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, selected.actorId, selected.persona, selected.clientId]);

  useEffect(() => {
    if (!engagement || context.actor.persona === 'CLIENT' || !context.allowedActions.includes('pbc.manage')) {
      setContacts([]);
      setContactsScopeKey('');
      return;
    }
    const controller = new AbortController();
    const clientContext = { ...selected, clientId: engagement.clientId, engagementId: engagement.id };
    const requestedContactsScopeKey = [context.actor.id, engagement.clientId].join('|');
    getBusinessClient(workspaceId, engagement.clientId, clientContext, controller.signal).then(detail => {
      if (!controller.signal.aborted) {
        const contactRoles = new Map(detail.contacts.map(contact => [String(contact.id), String(contact.role).trim().toUpperCase()]));
        setContacts(detail.routes
          .filter(route => route.purpose === 'PBC' && (
            (Number(route.is_primary) === 1 && contactRoles.get(String(route.contact_id)) === 'CHIEF_ACCOUNTANT_LIAISON')
            || (Number(route.is_primary) === 0 && Boolean(route.rationale?.trim()))
          ))
          .map(route => ({ id: route.contact_id, full_name: route.full_name, active: true, is_primary: Number(route.is_primary) === 1, rationale: route.rationale })));
        setContactsScopeKey(requestedContactsScopeKey);
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setContacts([]);
        setContactsScopeKey('');
        setError('PBC recipient routes could not be loaded. Refresh the client directory and try again.');
      }
    });
    return () => controller.abort();
  }, [workspaceId, selected.actorId, selected.persona, selected.clientId, engagement?.id, engagement?.clientId, context.actor.id, context.actor.persona, context.allowedActions, directoryRevision]);

  useEffect(() => {
    if (!engagement || !requestContext) { setPortal(null); setPortalScopeKey(''); setPortalError(''); return; }
    let active = true;
    const controller = new AbortController();
    cursor.current = null;
    setPortal(null);
    setPortalScopeKey('');
    setPortalError('');
    const refresh = async (announce: boolean) => {
      if (polling.current || document.visibilityState === 'hidden') return;
      polling.current = true;
      try {
        const next = await getBusinessPbcPortal(workspaceId, engagement.id, requestContext, controller.signal);
        if (!active || controller.signal.aborted) return;
        if (announce && cursor.current !== null && cursor.current !== next.changeCursor) setMessage('A PBC request or review changed in this engagement.');
        cursor.current = next.changeCursor;
        setPortal(next);
        setPortalScopeKey(activePortalScopeKey);
        setPortalError('');
      } catch (reason) {
        if (active && !controller.signal.aborted) setPortalError(reason instanceof Error ? reason.message : 'The PBC workspace could not be refreshed.');
      } finally { polling.current = false; }
    };
    void refresh(false);
    const timer = window.setInterval(() => void refresh(true), 3000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(true); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      polling.current = false;
    };
  }, [workspaceId, activePortalScopeKey, engagement?.id, requestContext?.actorId, requestContext?.persona, requestContext?.clientId]);

  const commandKeyFor = (slot: string, payload: unknown): string => {
    const signature = JSON.stringify(payload);
    const previous = commandKeys.current.get(slot);
    if (previous?.signature === signature) return previous.key;
    const next = { signature, key: newBusinessIdempotencyKey() };
    commandKeys.current.set(slot, next);
    return next.key;
  };

  const refreshNow = async () => {
    if (!engagement || !requestContext || polling.current) return;
    try {
      const next = await getBusinessPbcPortal(workspaceId, engagement.id, requestContext);
      cursor.current = next.changeCursor;
      setPortal(next);
      setPortalScopeKey(activePortalScopeKey);
      setPortalError('');
      onChanged();
    } catch (reason) { setPortalError(reason instanceof Error ? reason.message : 'The PBC workspace could not be refreshed.'); }
  };

  const createRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!engagement || !requestContext || !context.allowedActions.includes('pbc.manage')) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      clientId: engagement.clientId,
      engagementId: engagement.id,
      title: String(data.get('title') ?? ''),
      description: String(data.get('description') ?? ''),
      dueDate: String(data.get('dueDate') ?? ''),
      assignedContactId: String(data.get('assignedContactId') ?? ''),
      category: String(data.get('category') ?? 'GENERAL'),
      requiredForPlanning: data.get('requiredForPlanning') === 'on',
      requiredForRelease: data.get('requiredForRelease') === 'on'
    };
    setBusyRequestId('create'); setError(''); setMessage('');
    try {
      const created = await runBusinessCommand<{ requestId: string; status: string }>(workspaceId, requestContext,
        { type: 'pbc.request.create', payload }, commandKeyFor('pbc.request.create', payload));
      commandKeys.current.delete('pbc.request.create');
      form.reset();
      setMessage(`PBC request saved as ${created.result.status.replaceAll('_', ' ').toLowerCase()}.`);
      await refreshNow();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The PBC request could not be saved.'); }
    finally { setBusyRequestId(null); }
  };

  const continueUpload = async (requestId: string) => {
    const attempt = uploadAttempts.current.get(requestId);
    if (!attempt || busyRequestId) return;
    setBusyRequestId(requestId); setError(''); setMessage('');
    try {
      const mediaType = fileMediaType(attempt.file);
      attempt.reservation ??= await initializeBusinessFile(workspaceId, attempt.selected, {
        clientId: attempt.selected.clientId,
        engagementId: attempt.selected.engagementId,
        purpose: 'PBC', originalName: attempt.file.name, mediaType, sizeBytes: attempt.file.size,
        pbcRequestId: attempt.requestId, expectedPbcRequestVersion: attempt.requestVersion
      }, attempt.keys.reserve);
      attempt.staged ??= await uploadBusinessFile(workspaceId, attempt.selected, attempt.reservation, attempt.file, mediaType, attempt.keys.stage);
      attempt.committed ??= await completeBusinessFile(workspaceId, attempt.selected, attempt.staged, attempt.keys.commit);
      await runBusinessCommand(workspaceId, attempt.selected, { type: 'pbc.submit', payload: {
        requestId: attempt.requestId, expectedRequestVersion: attempt.requestVersion, fileVersionId: attempt.committed.fileId,
        ...(attempt.clientComment ? { clientComment: attempt.clientComment } : {})
      } }, attempt.keys.submit);
      uploadAttempts.current.delete(requestId);
      setPendingRequestIds([...uploadAttempts.current.keys()]);
      setClientComments(current => ({ ...current, [requestId]: '' }));
      setMessage('The verified response was submitted and is now Under Review.');
      await refreshNow();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The response upload could not be completed. Retry with the same file.');
    } finally { setBusyRequestId(null); }
  };

  const startUpload = async (request: BusinessPbcRequest, file: File) => {
    if (!requestContext || !portal?.canUpload || !['PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED'].includes(request.status)) return;
    if (file.size <= 0 || file.size > 25 * 1024 * 1024) { setError('Choose a non-empty file up to 25 MiB.'); return; }
    try { fileMediaType(file); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Choose a supported document type.'); return; }
    const attempt: PendingUpload = {
      requestId: request.id, requestVersion: request.version, selected: requestContext, file,
      clientComment: clientComments[request.id]?.trim() ?? '',
      keys: { reserve: newBusinessIdempotencyKey(), stage: newBusinessIdempotencyKey(), commit: newBusinessIdempotencyKey(), submit: newBusinessIdempotencyKey() }
    };
    uploadAttempts.current.set(request.id, attempt);
    setPendingRequestIds([...uploadAttempts.current.keys()]);
    await continueUpload(request.id);
  };

  const reviewSubmission = async (request: BusinessPbcRequest, decision: 'APPROVE' | 'REJECT') => {
    if (!requestContext || request.status !== 'UNDER_REVIEW' || !request.currentSubmissionId) return;
    const comments = reviewComments[request.id]?.trim() ?? '';
    if (decision === 'REJECT' && comments.length < 10) {
      setError('Add a meaningful rejection reason of at least 10 characters.');
      return;
    }
    const payload = { requestId: request.id, expectedRequestVersion: request.version, submissionId: request.currentSubmissionId,
      decision, ...(comments ? { comments } : {}) };
    setBusyRequestId(request.id); setError(''); setMessage('');
    try {
      await runBusinessCommand(workspaceId, requestContext, { type: 'pbc.review', payload }, commandKeyFor(`pbc.review.${request.id}`, payload));
      commandKeys.current.delete(`pbc.review.${request.id}`);
      setReviewComments(current => ({ ...current, [request.id]: '' }));
      setMessage(decision === 'APPROVE' ? 'The current PBC submission was approved.' : 'The current PBC submission was rejected with a reason.');
      await refreshNow();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The PBC review decision could not be saved.'); }
    finally { setBusyRequestId(null); }
  };

  const downloadSubmission = async (fileId: string, fileName: string) => {
    if (!requestContext || downloadingId) return;
    setDownloadingId(fileId);
    try {
      const blob = await downloadBusinessFileVersion(workspaceId, fileId, requestContext);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = fileName; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The committed submission could not be downloaded.'); }
    finally { setDownloadingId(null); }
  };

  const downloadPortalFile = async (fileId: string, fileName: string) => downloadSubmission(fileId, fileName);

  const documentGroups: Array<{ title: string; categories: BusinessPbcPortal['clientDocuments'][number]['category'][] }> = [
    { title: 'Engagement letters & invoices', categories: ['ENGAGEMENT_LETTER', 'INVOICE'] },
    { title: 'Receipts', categories: ['RECEIPT'] },
    { title: 'Holding letters', categories: ['HOLDING_LETTER'] },
    { title: 'Final deliverables', categories: ['FINAL_DELIVERABLE'] }
  ];

  return <section className="business-pbc-panel" aria-labelledby="business-pbc-heading">
    <div className="business-section-heading">
      <div><p className="business-eyebrow">CLIENT PORTAL · US-ENG-007 / US-ENG-008</p><h2 id="business-pbc-heading">PBC requests and responses</h2></div>
      <label className="business-field" htmlFor="business-pbc-engagement"><span>Engagement</span>
        <select id="business-pbc-engagement" value={engagementId} onChange={event => setEngagementId(event.target.value)} disabled={loading || engagements.length === 0}>
          {engagements.length === 0 && <option value="">No engagement in this scope</option>}
          {engagements.map(item => <option key={item.id} value={item.id}>{item.code} · {item.periodEnd} · {item.lifecycleState.replaceAll('_',' ')}</option>)}
        </select>
      </label>
    </div>
    {loading && <p className="business-muted" role="status">Loading engagement portal…</p>}
    {portalError && <p className="business-alert" role="alert">{portalError}</p>}
    {error && <p className="business-alert" role="alert">{error}</p>}
    {message && <p className="business-command-message" role="status" aria-atomic="true">{message}</p>}
    {portal && portalScopeKey === activePortalScopeKey && <>
      <div className="business-pbc-statusbar">
        <strong>Portal {portal.mode.replaceAll('_',' ').toLowerCase()}</strong>
        <span>{portal.engagement.periodStart} to {portal.engagement.periodEnd}</span>
        <span>{portal.requests.length} requests</span>
      </div>
      {!portal.canUpload && portal.mode === 'NOT_ACTIVE' && <p className="business-note">{portal.uploadBlocker}</p>}
      {portal.mode === 'FROZEN' && <p className="business-note">This portal is frozen. Existing request and response history remains read-only.</p>}

      {context.allowedActions.includes('pbc.manage') && <form className="business-form business-commercial-form" onSubmit={event => void createRequest(event)}>
        <h3>Create a client document request</h3>
        <div className="business-form-grid">
          <label className="business-field" htmlFor="business-pbc-title"><span>Requested item</span><input id="business-pbc-title" name="title" required maxLength={240} /></label>
          <label className="business-field" htmlFor="business-pbc-category"><span>Category</span><select id="business-pbc-category" name="category"><option value="GENERAL">General</option><option value="TRIAL_BALANCE">Trial balance</option><option value="BANK_STATEMENT">Bank statement</option><option value="CONTRACTS">Contracts</option><option value="INVOICES">Invoices</option><option value="PAYROLL">Payroll</option><option value="LEGAL">Legal</option><option value="OTHER">Other</option></select></label>
          <label className="business-field" htmlFor="business-pbc-due"><span>Due date</span><input id="business-pbc-due" name="dueDate" type="date" required /></label>
          <label className="business-field" htmlFor="business-pbc-contact"><span>Assigned PBC recipient</span><select id="business-pbc-contact" name="assignedContactId" required defaultValue=""><option value="">Select a configured PBC route</option>{visibleContacts.filter(contact => contact.active).map(contact => <option key={contact.id} value={contact.id}>{contact.full_name}{contact.is_primary ? ' · Primary PBC route' : ` · Documented alternate${contact.rationale ? ` — ${contact.rationale}` : ''}`}</option>)}</select></label>
          <label className="business-field business-pbc-checkbox" htmlFor="business-pbc-planning"><input id="business-pbc-planning" name="requiredForPlanning" type="checkbox" /> Required for planning handover</label>
          <label className="business-field business-pbc-checkbox" htmlFor="business-pbc-release"><input id="business-pbc-release" name="requiredForRelease" type="checkbox" /> Required before final release</label>
        </div>
        <label className="business-field" htmlFor="business-pbc-description"><span>Instructions</span><textarea id="business-pbc-description" name="description" required minLength={1} maxLength={5000} rows={3} /></label>
        {visibleContacts.filter(contact => contact.active).length === 0 && <p className="business-alert" role="alert">Add an active Chief Accountant / Audit Liaison PBC route, or document an approved alternate route, before creating a request.</p>}
        <div className="business-dialog-actions"><button className="btn primary" type="submit" disabled={!engagement || !requestContext || !visibleContacts.some(contact => contact.active) || busyRequestId === 'create'}>{busyRequestId === 'create' ? 'Saving request…' : 'Create request'}</button></div>
      </form>}

      {portal.requests.length === 0 ? <p className="business-muted">No PBC requests have been recorded for this engagement.</p> : <ul className="business-pbc-list" aria-label="PBC requests">
        {portal.requests.map(request => {
          const current = request.submissions.find(item => item.id === request.currentSubmissionId);
          const pending = pendingRequestIds.includes(request.id);
          const canSubmit = context.actor.persona === 'CLIENT' && portal.canUpload && ['PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED'].includes(request.status);
          const canReview = context.allowedActions.includes('pbc.review') && context.actor.persona === 'REVIEWER' && request.status === 'UNDER_REVIEW' && Boolean(current);
          return <li className="business-pbc-card" key={request.id}>
            <div className="business-pbc-card-head">
              <div><h3>{request.title}</h3><p>{request.description}</p><small>{request.category.replaceAll('_',' ')} · Due {request.dueDate} · Assigned to {request.assignedContact}</small></div>
              <span className={`business-pbc-status status-${request.status.toLowerCase()}`}>{statusLabel(request.status)}</span>
            </div>
            <div className="business-pbc-flags">{request.requiredForPlanning && <span>Planning required</span>}{request.requiredForRelease && <span>Release required</span>}</div>
            {request.submissions.length > 0 && <ol className="business-pbc-submissions" aria-label={`Submission history for ${request.title}`}>
              {request.submissions.map(submission => <li key={submission.id}>
                <div><strong>Response {submission.sequence}: {submission.originalName}</strong><small>Submitted {new Date(submission.submittedAt).toLocaleString()} · SHA-256 {submission.sha256.slice(0, 12)}…</small>
                  {submission.clientComment && <p>Client note: {submission.clientComment}</p>}
                  <button type="button" className="btn sm" disabled={Boolean(downloadingId)} onClick={() => void downloadSubmission(submission.fileVersionId, submission.originalName)}>{downloadingId === submission.fileVersionId ? 'Checking bytes…' : 'Download verified response'}</button>
                </div>
                {submission.reviews.map(review => <div className="business-pbc-review" key={review.id}>
                  <strong>{review.decision === 'APPROVE' ? 'Approved' : 'Rejected / Re-upload Required'}</strong><small>{new Date(review.reviewedAt).toLocaleString()} · reviewed against SHA-256 {review.fileSha256.slice(0, 12)}…</small>
                  {review.comments && <p>{review.comments}</p>}
                </div>)}
              </li>)}
            </ol>}
            {canSubmit && <div className="business-pbc-upload">
              <label className="business-field" htmlFor={`business-pbc-upload-${request.id}`}><span>{request.status === 'REJECTED_REUPLOAD_REQUIRED' ? 'Upload corrected replacement' : 'Upload response'}</span>
                <input id={`business-pbc-upload-${request.id}`} type="file" accept=".pdf,.csv,.txt,.xlsx,.docx,.png,.jpg,.jpeg,.zip" disabled={busyRequestId === request.id || pending} onChange={event => {
                  const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
                  if (file) void startUpload(request, file);
                }} />
                <small>Verified raw bytes, up to 25 MiB. The previous rejected response stays in history.</small>
              </label>
              <label className="business-field" htmlFor={`business-pbc-client-comment-${request.id}`}><span>Optional note</span><input id={`business-pbc-client-comment-${request.id}`} maxLength={2000} value={clientComments[request.id] ?? ''} onChange={event => setClientComments(current => ({ ...current, [request.id]: event.target.value }))} /></label>
              {pending && <button type="button" className="btn sm" disabled={busyRequestId === request.id} onClick={() => void continueUpload(request.id)}>{busyRequestId === request.id ? 'Retrying upload…' : 'Retry this upload'}</button>}
            </div>}
            {canReview && <div className="business-pbc-review-form">
              <label className="business-field" htmlFor={`business-pbc-review-note-${request.id}`}><span>Review note {request.currentSubmissionId && '(required for rejection)'}</span><textarea id={`business-pbc-review-note-${request.id}`} rows={2} maxLength={10000} value={reviewComments[request.id] ?? ''} onChange={event => setReviewComments(current => ({ ...current, [request.id]: event.target.value }))} /></label>
              <div className="business-dialog-actions"><button type="button" className="btn sm" disabled={busyRequestId === request.id} onClick={() => void reviewSubmission(request, 'APPROVE')}>Approve this submission</button><button type="button" className="btn sm" disabled={busyRequestId === request.id || (reviewComments[request.id]?.trim().length ?? 0) < 10} onClick={() => void reviewSubmission(request, 'REJECT')}>Reject with reason</button></div>
            </div>}
            {request.status === 'UNDER_REVIEW' && !canReview && <p className="business-muted">The current committed submission is awaiting a Reviewer decision.</p>}
          </li>;
        })}
      </ul>}

      {context.actor.persona === 'CLIENT' && <div className="business-pbc-documents">
        <section className="business-client-documents" aria-labelledby="business-client-documents-heading">
          <h3 id="business-client-documents-heading">Documents</h3>
          {documentGroups.map(group => {
            const documents = portal.clientDocuments.filter(document => group.categories.includes(document.category));
            return <section key={group.title} aria-label={group.title}>
              <h4>{group.title}</h4>
              {documents.length ? <ul>{documents.map(document => <li key={`${document.id}:${document.fileVersionId}`}>
                <div><strong>{document.originalName}</strong><small>{document.engagementCode} · Issued {document.issueDate}</small>
                  {document.category === 'HOLDING_LETTER' && <details><summary>Blocking confirmations at issue ({document.blockers?.length ?? 0})</summary>
                    {document.blockers?.length ? <ul>{document.blockers.map(blocker => <li key={`${document.id}:${blocker.id}`}>
                      {blocker.type} · {blocker.status.replaceAll('_', ' ')} · due {blocker.dueDate}{blocker.stalePins ? ' · source changed' : ''}
                    </li>)}</ul> : <p className="business-muted">No blocker details were saved with this letter.</p>}
                  </details>}
                </div>
                <button type="button" className="btn sm" disabled={Boolean(downloadingId)} onClick={() => void downloadPortalFile(document.fileVersionId, document.originalName)}>
                  {downloadingId === document.fileVersionId ? 'Checking bytes…' : 'Download'}
                </button>
              </li>)}</ul> : <p className="business-muted">None issued yet.</p>}
            </section>;
          })}
        </section>
      </div>}
    </>}
  </section>;
}
