import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { BusinessLead, BusinessWorkspacePreference, PublicLeadStatus, PublicLeadSubmission } from '../../shared/api/business';
import { getPublicLeadSubmissions, newBusinessIdempotencyKey, runBusinessCommand } from '../../services/businessWorkspace';

const STATUSES: Array<{ value: PublicLeadStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'RECEIVED', label: 'Needs triage' },
  { value: 'DUPLICATE', label: 'Possible duplicates' },
  { value: 'ACCEPTED_AS_LEAD', label: 'Accepted as lead' },
  { value: 'REJECTED_SPAM', label: 'Spam' }
];

const SERVICES = [
  { value: 'STATUTORY_AUDIT', label: 'Statutory audit' },
  { value: 'INTERNAL_AUDIT', label: 'Internal audit' },
  { value: 'AGREED_UPON_PROCEDURES', label: 'Agreed-upon procedures' }
] as const;

type TriageDetails = {
  requestedService?: typeof SERVICES[number]['value'];
  periodStart?: string;
  periodEnd?: string;
  estimatedFeeMinor?: string;
  existingLeadId?: string;
};

function displayDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

export function PublicLeadQueue({ workspaceId, preference, canManage, leads }: {
  workspaceId: string;
  preference: BusinessWorkspacePreference;
  canManage: boolean;
  leads: BusinessLead[];
}) {
  const [filter, setFilter] = useState<PublicLeadStatus | 'ALL'>('RECEIVED');
  const [items, setItems] = useState<PublicLeadSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getPublicLeadSubmissions(workspaceId, preference, filter === 'ALL' ? undefined : filter, controller.signal)
      .then(next => { if (!controller.signal.aborted) setItems(next); })
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Web inquiries could not be loaded. Retry.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, preference, filter, reloadKey]);

  async function triage(submission: PublicLeadSubmission, decision: 'ACCEPT' | 'SPAM' | 'DUPLICATE', details: TriageDetails = {}): Promise<void> {
    if (!canManage || busyId) return;
    setBusyId(submission.id);
    setError('');
    setMessage('');
    const payload = {
      submissionId: submission.id,
      expectedVersion: submission.version,
      decision,
      ...(decision === 'ACCEPT' ? {
        requestedService: details.requestedService,
        periodStart: details.periodStart,
        periodEnd: details.periodEnd,
        ...(details.estimatedFeeMinor ? { estimatedFeeMinor: details.estimatedFeeMinor } : {})
      } : {}),
      ...(decision === 'DUPLICATE' && details.existingLeadId ? { existingLeadId: details.existingLeadId } : {})
    };
    try {
      await runBusinessCommand(workspaceId, preference, { type: 'publicLead.triage', payload }, newBusinessIdempotencyKey());
      setMessage(decision === 'ACCEPT' ? 'Inquiry accepted and added to the lead pipeline.'
        : decision === 'SPAM' ? 'Inquiry marked as spam.' : 'Inquiry closed as a duplicate.');
      setReloadKey(value => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The inquiry could not be updated. Refresh and try again.');
      // Reload so a stale optimistic version is never retried from an outdated row.
      setReloadKey(value => value + 1);
    } finally {
      setBusyId(null);
    }
  }

  return <section className="business-public-lead-queue" aria-labelledby="business-public-leads-heading">
    <div className="business-section-heading">
      <div><p className="business-eyebrow">PUBLIC INTAKE</p><h3 id="business-public-leads-heading">Web inquiries</h3></div>
      <label className="business-public-lead-filter" htmlFor="business-public-lead-status"><span>Filter status</span>
        <select id="business-public-lead-status" value={filter} onChange={event => setFilter(event.target.value as PublicLeadStatus | 'ALL')}>
          {STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>
      </label>
    </div>
    {error && <p className="business-alert" role="alert">{error} <button type="button" className="btn sm" onClick={() => setReloadKey(value => value + 1)}>Retry</button></p>}
    {message && <p className="business-command-message" role="status">{message}</p>}
    {loading ? <p className="business-muted" role="status">Loading web inquiries…</p>
      : items.length === 0 ? <p className="business-muted">No web inquiries match this status.</p>
        : <ul className="business-public-lead-list">{items.map(submission => <InquiryRow key={submission.id}
          submission={submission} leads={leads} canManage={canManage} busy={busyId === submission.id}
          onTriage={triage} />)}</ul>}
    <p className="business-note">Inquiry messages and contact details are visible only to staff with lead access. Duplicate lead links are checked against the submitted contact email by the Worker.</p>
  </section>;
}

function InquiryRow({ submission, leads, canManage, busy, onTriage }: {
  submission: PublicLeadSubmission;
  leads: BusinessLead[];
  canManage: boolean;
  busy: boolean;
  onTriage: (submission: PublicLeadSubmission, decision: 'ACCEPT' | 'SPAM' | 'DUPLICATE', details?: TriageDetails) => Promise<void>;
}) {
  const [service, setService] = useState<typeof SERVICES[number]['value']>(
    submission.serviceInterest && submission.serviceInterest !== 'OTHER' ? submission.serviceInterest : 'STATUTORY_AUDIT'
  );
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [estimatedFeeMinor, setEstimatedFeeMinor] = useState('');
  const [existingLeadId, setExistingLeadId] = useState(submission.leadId ?? '');
  const actionable = canManage && ['RECEIVED', 'DUPLICATE'].includes(submission.status);

  function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (periodStart > periodEnd || periodEnd < periodStart) return;
    void onTriage(submission, 'ACCEPT', { requestedService: service, periodStart, periodEnd, estimatedFeeMinor });
  }

  return <li className="business-public-lead-card">
    <div className="business-public-lead-summary">
      <div className="business-public-lead-title"><strong>{submission.companyName}</strong><span className={`business-public-lead-status status-${submission.status.toLowerCase()}`}>{submission.status.replaceAll('_', ' ')}</span></div>
      <p>{submission.contactName} · <a href={`mailto:${encodeURIComponent(submission.email)}`}>{submission.email}</a>{submission.phone ? ` · ${submission.phone}` : ''}</p>
      <p>{submission.serviceInterest?.replaceAll('_', ' ') ?? 'Service not specified'} · Received {displayDate(submission.createdAt)} · v{submission.version}</p>
      {submission.message && <blockquote>{submission.message}</blockquote>}
      {submission.leadId && <p className="business-muted">Linked lead: {submission.leadId}</p>}
    </div>
    {actionable && <form className="business-public-lead-triage" onSubmit={accept}>
      <div className="business-form-grid">
        <label className="business-field" htmlFor={`public-lead-service-${submission.id}`}><span>Requested service</span><select id={`public-lead-service-${submission.id}`} value={service} onChange={event => setService(event.target.value as typeof service)}>
          {SERVICES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label className="business-field" htmlFor={`public-lead-start-${submission.id}`}><span>Audited period starts</span><input id={`public-lead-start-${submission.id}`} type="date" required max={periodEnd || undefined} value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></label>
        <label className="business-field" htmlFor={`public-lead-end-${submission.id}`}><span>Audited period ends</span><input id={`public-lead-end-${submission.id}`} type="date" required min={periodStart || undefined} value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></label>
        <label className="business-field" htmlFor={`public-lead-fee-${submission.id}`}><span>Estimated fee · QAR minor units</span><input id={`public-lead-fee-${submission.id}`} inputMode="numeric" pattern="[0-9]*" value={estimatedFeeMinor} onChange={event => setEstimatedFeeMinor(event.target.value)} /><small>Optional intake estimate.</small></label>
      </div>
      {filterablePeriodError(periodStart, periodEnd) && <p className="business-alert" role="alert">The period end must be on or after the period start.</p>}
      <div className="business-public-lead-actions">
        <button className="btn primary sm" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Accept as lead'}</button>
        <button className="btn sm" type="button" disabled={busy} onClick={() => void onTriage(submission, 'SPAM')}>Mark spam</button>
        <label className="business-field" htmlFor={`public-lead-duplicate-${submission.id}`}><span>Matching lead · optional</span><select id={`public-lead-duplicate-${submission.id}`} value={existingLeadId} onChange={event => setExistingLeadId(event.target.value)}>
          <option value="">No lead link</option>
          {leads.map(lead => <option key={lead.id} value={lead.id}>{lead.clientName ?? 'Prospect'} · {lead.contactName ?? 'Contact'} · {lead.receivedAt.slice(0, 10)}</option>)}
        </select></label>
        <button className="btn sm" type="button" disabled={busy} onClick={() => void onTriage(submission, 'DUPLICATE', { existingLeadId })}>Mark duplicate</button>
      </div>
    </form>}
  </li>;
}

function filterablePeriodError(start: string, end: string): boolean {
  return Boolean(start && end && end < start);
}
