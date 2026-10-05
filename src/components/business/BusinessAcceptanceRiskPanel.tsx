import React, { useEffect, useMemo, useState } from 'react';
import type {
  BusinessAcceptanceGate,
  BusinessFileMetadata,
  BusinessProposal,
  BusinessRiskAssessmentDraft,
  BusinessRiskCheckCode,
  BusinessRiskCheckDraft,
  BusinessRiskOutcome,
  BusinessRiskWorkspace,
  BusinessWorkspacePreference,
  BusinessContextResponse
} from '../../shared/api/business';
import { getBusinessAcceptanceGate, getBusinessRiskWorkspace, newBusinessIdempotencyKey, runBusinessCommand } from '../../services/businessWorkspace';

const trackAChecks: BusinessRiskCheckCode[] = ['UBO', 'KYC', 'AML', 'INTEGRITY', 'VIABILITY', 'INDEPENDENCE', 'CONFLICTS'];
const checkTitle: Record<BusinessRiskCheckCode, string> = {
  UBO: 'Beneficial ownership (UBO)', KYC: 'KYC documents', AML: 'AML background evidence', INTEGRITY: 'Management integrity',
  VIABILITY: 'Client viability', INDEPENDENCE: 'Independence', CONFLICTS: 'Conflicts of interest'
};
const blankCheck = (code: BusinessRiskCheckCode): BusinessRiskCheckDraft => ({
  code, outcome: '', findings: '', sourceReference: '', checkMethod: 'MANUAL', checkedOn: ''
});
const blankDraft = (engagementId: string): BusinessRiskAssessmentDraft => ({
  engagementId, track: 'NEW_CLIENT', expectedDraftVersion: 0, questionnaireTemplateVersion: '', assessmentDate: '', overallRisk: '',
  managementIntegrityConclusion: '', viabilityConclusion: '', independenceConclusion: '', checks: trackAChecks.map(blankCheck)
});
const fileLabel = (file: BusinessFileMetadata) => `${file.originalName} · ${file.purpose} · ${file.sha256?.slice(0, 12) ?? 'digest unavailable'}`;
const keyLabel = (status: string) => status.replaceAll('_', ' ');

export function BusinessAcceptanceRiskPanel({
  workspaceId, selected, context, engagementId, clientId, engagementName, files, clientProposal, onChanged
}: {
  workspaceId: string;
  selected: BusinessWorkspacePreference;
  context: BusinessContextResponse;
  engagementId: string;
  clientId: string;
  engagementName: string;
  files: BusinessFileMetadata[];
  clientProposal?: BusinessProposal;
  onChanged?: () => void;
}) {
  const scoped = useMemo(() => ({ ...selected, clientId, engagementId }), [selected, clientId, engagementId]);
  const [riskWorkspace, setRiskWorkspace] = useState<BusinessRiskWorkspace | null>(null);
  const [gate, setGate] = useState<BusinessAcceptanceGate | null>(null);
  const [draft, setDraft] = useState<BusinessRiskAssessmentDraft>(() => blankDraft(engagementId));
  const [owners, setOwners] = useState<BusinessRiskWorkspace['beneficialOwners']>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerBps, setOwnerBps] = useState('');
  const [ownerBasis, setOwnerBasis] = useState('');
  const [ownerEvidenceId, setOwnerEvidenceId] = useState('');
  const [ownerFrom, setOwnerFrom] = useState('');
  const [ownerTo, setOwnerTo] = useState('');
  const [ownerActive, setOwnerActive] = useState(true);
  const [decisionRationale, setDecisionRationale] = useState('');
  const [acceptedFee, setAcceptedFee] = useState('');
  const [acceptanceText, setAcceptanceText] = useState('');
  const [acceptanceEvidenceId, setAcceptanceEvidenceId] = useState('');
  const [acceptanceRevokeReason, setAcceptanceRevokeReason] = useState('');
  const [escalationCheckId, setEscalationCheckId] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [requiredEvidence, setRequiredEvidence] = useState('');
  const [resolutionEscalationId, setResolutionEscalationId] = useState('');
  const [escalationResolution, setEscalationResolution] = useState('');
  const [resolutionEvidenceId, setResolutionEvidenceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const isClient = context.actor.persona === 'CLIENT';
  const eligibleFiles = files.filter(file => file.state === 'COMMITTED' && file.immutable && ['PBC', 'EVIDENCE'].includes(file.purpose));
  const editable = context.allowedActions.includes('riskAssessment.draft');
  const canClear = context.allowedActions.includes('risk.clear');
  const selectedOwner = owners.find(owner => owner.id === selectedOwnerId) ?? null;
  const currentVersionId = riskWorkspace?.assessment?.currentVersionId;
  const riskDecisionId = gate?.riskKey && 'clearanceId' in gate.riskKey ? String(gate.riskKey.clearanceId ?? '') : '';
  const commercialKey = (gate?.commercialKey ?? {}) as {
    acceptanceId?: unknown; proposalRevision?: unknown; feeMinor?: unknown; contactName?: unknown; actorName?: unknown; acceptedAt?: unknown; evidenceFileId?: unknown;
  };
  const riskKey = (gate?.riskKey ?? {}) as {
    assessmentRevision?: unknown; partnerName?: unknown; signedAt?: unknown; evidence?: unknown;
  };
  const clientAcceptanceId = typeof commercialKey.acceptanceId === 'string' ? commercialKey.acceptanceId : '';
  const currentEscalations = currentVersionId ? (riskWorkspace?.escalations ?? []).filter(item => item.assessmentVersionId === currentVersionId) : [];
  const canEscalate = context.allowedActions.includes('riskAssessment.escalate');
  const canResolveEscalation = context.allowedActions.includes('riskAssessment.resolveEscalation');
  const escalationCandidates = (riskWorkspace?.checks ?? []).filter((row: any) => row.outcome === 'ISSUE' ||
    (['UBO', 'KYC', 'AML'].includes(String(row.code)) && !row.evidence_file_id));

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setGate(null);
    if (isClient) {
      getBusinessAcceptanceGate(workspaceId, engagementId, scoped, controller.signal).then(result => {
        if (!controller.signal.aborted) setGate(result);
      }).catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Acceptance status could not be loaded.');
      });
      setRiskWorkspace(null);
      return () => controller.abort();
    }
    if (!context.allowedActions.includes('risk.read')) { setRiskWorkspace(null); return () => controller.abort(); }
    getBusinessRiskWorkspace(workspaceId, engagementId, scoped, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setRiskWorkspace(result);
      setGate(result.acceptanceGate);
      setOwners(result.beneficialOwners);
      if (result.assessment?.draft) {
        setDraft({ ...result.assessment.draft, engagementId, expectedDraftVersion: result.assessment.draftVersion });
      } else if (result.assessment && result.checks.length) {
        const current = new Map(result.checks.map((row: any) => [row.code, row]));
        const checks = trackAChecks.map(code => {
          const row = current.get(code) as any;
          return row ? { ...blankCheck(code), outcome: row.outcome, findings: row.findings, sourceReference: row.source_reference,
            checkMethod: row.check_method, providerName: row.provider_name ?? undefined, externalReference: row.external_reference ?? undefined,
            checkedOn: row.checked_on, evidenceFileId: row.evidence_file_id ?? undefined, resolution: row.resolution ?? undefined } : blankCheck(code);
        });
        setDraft({ ...blankDraft(engagementId), track: result.assessment.track, expectedDraftVersion: result.assessment.draftVersion, checks,
          questionnaireTemplateVersion: result.assessment.questionnaireTemplateVersion ?? '', assessmentDate: result.assessment.assessmentDate ?? '',
          overallRisk: (result.assessment.overallRisk as BusinessRiskAssessmentDraft['overallRisk']) ?? '',
          managementIntegrityConclusion: result.assessment.managementIntegrityConclusion ?? '', viabilityConclusion: result.assessment.viabilityConclusion ?? '',
          independenceConclusion: result.assessment.independenceConclusion ?? '' });
      } else {
        setDraft(blankDraft(engagementId));
      }
      setSelectedOwnerId(current => current && result.beneficialOwners.some(owner => owner.id === current) ? current : '');
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The risk workspace could not be loaded.');
    });
    return () => controller.abort();
  }, [workspaceId, engagementId, scoped.actorId, scoped.persona, scoped.clientId, scoped.engagementId, isClient, context.allowedActions.join(','), refresh]);

  useEffect(() => {
    if (!selectedOwner) {
      setOwnerName(''); setOwnerBps(''); setOwnerBasis(''); setOwnerEvidenceId(''); setOwnerFrom(''); setOwnerTo(''); setOwnerActive(true);
      return;
    }
    setOwnerName(selectedOwner.fullName); setOwnerBps(String(selectedOwner.ownershipBps)); setOwnerBasis(selectedOwner.controlBasis);
    setOwnerEvidenceId(selectedOwner.identityEvidenceFileId ?? ''); setOwnerFrom(selectedOwner.effectiveFrom); setOwnerTo(selectedOwner.effectiveTo ?? ''); setOwnerActive(true);
  }, [selectedOwnerId, selectedOwner?.version]);

  const command = async (type: string, payload: Record<string, unknown>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await runBusinessCommand(workspaceId, scoped, { type, payload }, newBusinessIdempotencyKey());
      setMessage(success);
      setRefresh(value => value + 1);
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The request could not be saved.');
    } finally { setBusy(false); }
  };

  const saveRiskDraft = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.overallRisk) { setError('Select the reviewer’s overall risk conclusion.'); return; }
    if (draft.checks.some(check => !check.outcome)) { setError('Select an outcome for each required Track A check.'); return; }
    const checks = draft.checks.map(({ outcome, ...check }) => ({ ...check, resolution: check.resolution?.trim() || undefined, outcome }));
    void command('riskAssessment.saveDraft', { ...draft, expectedDraftVersion: riskWorkspace?.assessment?.draftVersion ?? 0, checks }, 'Risk assessment draft saved with a new version.');
  };
  const submitRiskDraft = () => {
    const assessment = riskWorkspace?.assessment;
    if (!assessment?.id || !assessment.draftVersion) return;
    void command('riskAssessment.submit', { assessmentId: assessment.id, expectedDraftVersion: assessment.draftVersion }, 'The exact risk revision was submitted for Partner decision.');
  };
  const saveOwner = (event: React.FormEvent) => {
    event.preventDefault();
    const owner = selectedOwner;
    void command('riskAssessment.owner.save', {
      engagementId, ...(owner ? { ownerId: owner.id } : {}), expectedVersion: owner?.version ?? null,
      fullName: ownerName, ownershipBps: Number(ownerBps), controlBasis: ownerBasis,
      ...(ownerEvidenceId ? { identityEvidenceFileId: ownerEvidenceId } : {}), effectiveFrom: ownerFrom,
      ...(ownerTo ? { effectiveTo: ownerTo } : {}), active: ownerActive
    }, owner ? 'A new immutable ownership revision was recorded.' : 'Beneficial owner recorded.');
  };
  const recordAcceptance = (event: React.FormEvent) => {
    event.preventDefault();
    if (!clientProposal || !acceptedFee.trim() || !acceptanceText.trim()) return;
    void command('commercialAcceptance.record', {
      engagementId, proposalVersionId: clientProposal.proposalVersionId, acceptedFeeMinor: acceptedFee.trim(), confirmationText: acceptanceText.trim(),
      ...(acceptanceEvidenceId ? { evidenceFileId: acceptanceEvidenceId } : {})
    }, 'Your acceptance was recorded against this exact proposal revision and fee.');
  };
  const revokeAcceptance = () => {
    if (!clientAcceptanceId || acceptanceRevokeReason.trim().length < 10) return;
    void command('commercialAcceptance.revoke', { acceptanceId: clientAcceptanceId, rationale: acceptanceRevokeReason.trim() }, 'Your current acceptance was revoked; its history remains recorded.');
  };
  const escalateRiskCheck = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentVersionId || !escalationCheckId) return;
    void command('riskAssessment.escalate', { assessmentVersionId: currentVersionId, checkId: escalationCheckId,
      reason: escalationReason.trim(), requiredEvidence: requiredEvidence.trim() }, 'The current risk check was escalated to the Partner.');
  };
  const resolveEscalation = (event: React.FormEvent) => {
    event.preventDefault();
    const escalation = currentEscalations.find(item => item.id === resolutionEscalationId && item.status === 'OPEN');
    if (!escalation || !resolutionEvidenceId) return;
    void command('riskAssessment.resolveEscalation', { escalationId: escalation.id, expectedVersion: escalation.version,
      resolution: escalationResolution.trim(), evidenceFileId: resolutionEvidenceId }, 'The Partner resolved the escalation with committed evidence.');
  };
  const rationalePayload = decisionRationale.trim();
  const status = (label: string, value?: string) => <div className="business-key-status"><span>{label}</span><strong>{value ? keyLabel(value) : 'pending'}</strong></div>;

  return <section className="business-directory-card business-risk-card" aria-labelledby={`acceptance-risk-${engagementId}`}>
    <div className="business-section-heading">
      <div><p className="business-eyebrow">GOVERNANCE · US-ENG-004 · US-GOV-001</p><h2 id={`acceptance-risk-${engagementId}`}>Acceptance and risk · {engagementName}</h2></div>
      <button type="button" className="btn sm" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh decision state</button>
    </div>
    {error && <p role="alert" className="business-alert">{error}</p>}
    {message && <p role="status" className="business-command-message">{message}</p>}
    {gate && <div className="business-key-grid" aria-label="Current acceptance gate">
      {status('Client commercial key', gate.commercialKey.status)}
      {status('Partner risk key', gate.riskKey.status)}
    </div>}
    {gate && <div className="business-key-details" aria-label="Acceptance source revisions and evidence">
      {gate.commercialKey.status === 'ACTIVE' && <p>Commercial source: proposal revision {String(commercialKey.proposalRevision ?? clientProposal?.revision ?? 'current')}
        {typeof commercialKey.feeMinor === 'string' ? ` · QAR ${commercialKey.feeMinor} minor units` : clientProposal ? ` · QAR ${clientProposal.feeMinor} minor units` : ''}
        {typeof commercialKey.contactName === 'string' ? ` · accepted by ${commercialKey.contactName}` : ''}
        {typeof commercialKey.actorName === 'string' ? ` · actor ${commercialKey.actorName}` : ''}
        {typeof commercialKey.acceptedAt === 'string' ? ` · ${new Date(commercialKey.acceptedAt).toLocaleString()}` : ''}
        {typeof commercialKey.evidenceFileId === 'string' ? ` · evidence ${files.find(file => file.id === commercialKey.evidenceFileId)?.originalName ?? commercialKey.evidenceFileId}` : ''}</p>}
      {gate.riskKey.status === 'ACTIVE' && context.actor.persona !== 'CLIENT' && <p>Risk source: assessment revision {String(riskKey.assessmentRevision ?? 'current')}
        {typeof riskKey.partnerName === 'string' ? ` · Partner ${riskKey.partnerName}` : ''}
        {typeof riskKey.signedAt === 'string' ? ` · signed ${new Date(riskKey.signedAt).toLocaleString()}` : ''}
        {Array.isArray(riskKey.evidence) && riskKey.evidence.length > 0 ? ` · ${riskKey.evidence.length} committed evidence file(s): ${riskKey.evidence.map((entry: any) => files.find(file => file.id === entry.id)?.originalName ?? entry.id).join(', ')}` : ' · no linked committed evidence'}</p>}
    </div>}
    {gate?.blockers.map(blocker => <p key={blocker} className="business-gate-blocker">{blocker}</p>)}

    {isClient && clientProposal && <form className="business-form business-commercial-form" onSubmit={recordAcceptance}>
      <h3>Accept the current proposal revision</h3>
      <p className="business-note">Revision {clientProposal.revision} · QAR {clientProposal.feeMinor} minor units · {clientProposal.scope}</p>
      {gate?.commercialKey.status === 'ACTIVE' ? <>
        <p className="business-success-note">Your acceptance is recorded for this proposal revision{typeof commercialKey.acceptedAt === 'string' ? ` at ${new Date(commercialKey.acceptedAt).toLocaleString()}` : ''}.</p>
        {clientAcceptanceId && <div className="business-form">
          <label className="business-field" htmlFor={`acceptance-revoke-${engagementId}`}><span>Reason to revoke this acceptance</span><textarea id={`acceptance-revoke-${engagementId}`} className="input" required minLength={10} maxLength={5000} rows={2} value={acceptanceRevokeReason} onChange={event => setAcceptanceRevokeReason(event.target.value)} /></label>
          <button type="button" className="btn" disabled={busy || acceptanceRevokeReason.trim().length < 10} onClick={revokeAcceptance}>Revoke my current acceptance</button>
        </div>}
      </> : <>
        <div className="business-form-grid">
          <label className="business-field" htmlFor={`acceptance-fee-${engagementId}`}><span>Confirm exact accepted fee · QAR minor units</span><input id={`acceptance-fee-${engagementId}`} inputMode="numeric" pattern="[0-9]*" required value={acceptedFee} onChange={event => setAcceptedFee(event.target.value)} /></label>
          <label className="business-field" htmlFor={`acceptance-evidence-${engagementId}`}><span>Optional signed acceptance evidence</span><select id={`acceptance-evidence-${engagementId}`} value={acceptanceEvidenceId} onChange={event => setAcceptanceEvidenceId(event.target.value)}><option value="">No file attached</option>{eligibleFiles.filter(file => file.clientId === clientProposal.clientId && (!file.engagementId || file.engagementId === engagementId)).map(file => <option key={file.id} value={file.id}>{fileLabel(file)}</option>)}</select></label>
        </div>
        <label className="business-field" htmlFor={`acceptance-confirmation-${engagementId}`}><span>Confirmation of scope and fee</span><textarea id={`acceptance-confirmation-${engagementId}`} className="input" required minLength={10} maxLength={5000} rows={3} value={acceptanceText} onChange={event => setAcceptanceText(event.target.value)} placeholder="Enter your acceptance in your own words." /></label>
        <p className="business-note">The confirmation is recorded against the selected CLIENT contact profile. Persona selection is self-asserted and is not identity verification.</p>
        <button className="btn primary" type="submit" disabled={busy || acceptedFee !== clientProposal.feeMinor || acceptanceText.trim().length < 10}>Record acceptance of revision {clientProposal.revision}</button>
      </>}
    </form>}

    {!isClient && riskWorkspace && <>
      <div className="business-risk-summary">
        <strong>Track A · New client acceptance dossier</strong>
        <span>{riskWorkspace.assessment ? `Assessment ${riskWorkspace.assessment.id.slice(0, 8)} · draft v${riskWorkspace.assessment.draftVersion} · ${riskWorkspace.assessment.currentVersionId ? `submitted revision ${riskWorkspace.assessment.revision}` : 'not submitted'}` : 'No risk assessment has been started.'}</span>
      </div>
      {editable && <>
        <form className="business-form business-commercial-form" onSubmit={saveOwner}>
          <h3>Beneficial ownership register</h3>
          <div className="business-form-grid">
            <label className="business-field" htmlFor={`risk-owner-select-${engagementId}`}><span>Current owner record</span><select id={`risk-owner-select-${engagementId}`} value={selectedOwnerId} onChange={event => setSelectedOwnerId(event.target.value)}><option value="">Add a beneficial owner</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.fullName} · {owner.ownershipBps} bps</option>)}</select></label>
            <label className="business-field" htmlFor={`risk-owner-name-${engagementId}`}><span>Full name</span><input id={`risk-owner-name-${engagementId}`} required maxLength={250} value={ownerName} onChange={event => setOwnerName(event.target.value)} /></label>
            <label className="business-field" htmlFor={`risk-owner-bps-${engagementId}`}><span>Ownership · basis points</span><input id={`risk-owner-bps-${engagementId}`} type="number" min="0" max="10000" step="1" required value={ownerBps} onChange={event => setOwnerBps(event.target.value)} /></label>
            <label className="business-field" htmlFor={`risk-owner-from-${engagementId}`}><span>Effective from</span><input id={`risk-owner-from-${engagementId}`} type="date" required value={ownerFrom} onChange={event => setOwnerFrom(event.target.value)} /></label>
            <label className="business-field" htmlFor={`risk-owner-to-${engagementId}`}><span>Effective to, if ended</span><input id={`risk-owner-to-${engagementId}`} type="date" value={ownerTo} onChange={event => setOwnerTo(event.target.value)} /></label>
            <label className="business-field" htmlFor={`risk-owner-evidence-${engagementId}`}><span>Identity evidence</span><select id={`risk-owner-evidence-${engagementId}`} value={ownerEvidenceId} onChange={event => setOwnerEvidenceId(event.target.value)}><option value="">No file selected</option>{eligibleFiles.filter(file => file.clientId === riskWorkspace.engagement.clientId && (!file.engagementId || file.engagementId === engagementId)).map(file => <option key={file.id} value={file.id}>{fileLabel(file)}</option>)}</select></label>
          </div>
          <label className="business-field" htmlFor={`risk-owner-basis-${engagementId}`}><span>Ownership or control basis</span><textarea id={`risk-owner-basis-${engagementId}`} className="input" required minLength={1} maxLength={2000} rows={2} value={ownerBasis} onChange={event => setOwnerBasis(event.target.value)} /></label>
          {selectedOwner && <label className="business-check-field"><input type="checkbox" checked={ownerActive} onChange={event => setOwnerActive(event.target.checked)} /><span>Include this owner in the current ownership register</span></label>}
          <p className="business-note">Changes create an immutable ownership revision and make an earlier risk clearance stale. A CLEAR UBO conclusion requires current ownership to total exactly 10,000 bps.</p>
          <button type="submit" className="btn" disabled={busy || !ownerName.trim() || !ownerBps || !ownerFrom}>{busy ? 'Saving…' : selectedOwner ? 'Save new ownership revision' : 'Add beneficial owner'}</button>
        </form>

        <form className="business-form business-commercial-form" onSubmit={saveRiskDraft}>
          <h3>Track A questionnaire and reviewer conclusions</h3>
          <div className="business-form-grid">
            <label className="business-field" htmlFor={`risk-template-${engagementId}`}><span>Approved questionnaire template version</span><input id={`risk-template-${engagementId}`} required maxLength={200} value={draft.questionnaireTemplateVersion} onChange={event => setDraft(current => ({ ...current, questionnaireTemplateVersion: event.target.value }))} /></label>
            <label className="business-field" htmlFor={`risk-date-${engagementId}`}><span>Assessment date</span><input id={`risk-date-${engagementId}`} type="date" required value={draft.assessmentDate} onChange={event => setDraft(current => ({ ...current, assessmentDate: event.target.value }))} /></label>
            <label className="business-field" htmlFor={`risk-level-${engagementId}`}><span>Overall risk conclusion</span><select id={`risk-level-${engagementId}`} required value={draft.overallRisk} onChange={event => setDraft(current => ({ ...current, overallRisk: event.target.value as BusinessRiskAssessmentDraft['overallRisk'] }))}><option value="">Select reviewer conclusion</option><option value="LOW">Low</option><option value="MODERATE">Moderate</option><option value="HIGH">High</option></select></label>
          </div>
          {[['managementIntegrityConclusion', 'Management integrity conclusion'], ['viabilityConclusion', 'Client viability conclusion'], ['independenceConclusion', 'Independence conclusion']].map(([key, label]) => <label className="business-field" key={key} htmlFor={`risk-conclusion-${key}-${engagementId}`}><span>{label}</span><textarea id={`risk-conclusion-${key}-${engagementId}`} className="input" required minLength={10} maxLength={10000} rows={2} value={draft[key as keyof BusinessRiskAssessmentDraft] as string} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} /></label>)}
          <div className="business-risk-check-list">
            {draft.checks.map((check, index) => <fieldset className="business-risk-check" key={check.code}>
              <legend>{checkTitle[check.code]}</legend>
              <div className="business-form-grid">
                <label className="business-field" htmlFor={`risk-outcome-${check.code}-${engagementId}`}><span>Outcome</span><select id={`risk-outcome-${check.code}-${engagementId}`} required value={check.outcome} onChange={event => setDraft(current => ({ ...current, checks: current.checks.map((item, i) => i === index ? { ...item, outcome: event.target.value as BusinessRiskOutcome | '' } : item) }))}><option value="">Select outcome</option><option value="CLEAR">Clear</option><option value="ISSUE">Issue identified</option><option value="NOT_APPLICABLE">Not applicable</option></select></label>
                <label className="business-field" htmlFor={`risk-date-${check.code}-${engagementId}`}><span>Checked on</span><input id={`risk-date-${check.code}-${engagementId}`} type="date" required value={check.checkedOn} onChange={event => setDraft(current => ({ ...current, checks: current.checks.map((item, i) => i === index ? { ...item, checkedOn: event.target.value } : item) }))} /></label>
                <label className="business-field" htmlFor={`risk-method-${check.code}-${engagementId}`}><span>Evidence method</span><select id={`risk-method-${check.code}-${engagementId}`} value={check.checkMethod} onChange={event => setDraft(current => ({ ...current, checks: current.checks.map((item, i) => i === index ? { ...item, checkMethod: event.target.value as BusinessRiskCheckDraft['checkMethod'] } : item) }))}><option value="MANUAL">Manual review</option><option value="EXTERNAL_SERVICE">External service evidence, manually reviewed</option></select></label>
                <label className="business-field" htmlFor={`risk-evidence-${check.code}-${engagementId}`}><span>Committed supporting file{['UBO', 'KYC', 'AML'].includes(check.code) ? ' · required for Clear' : ''}</span><select id={`risk-evidence-${check.code}-${engagementId}`} value={check.evidenceFileId ?? ''} onChange={event => setDraft(current => ({ ...current, checks: current.checks.map((item, i) => i === index ? { ...item, evidenceFileId: event.target.value || undefined } : item) }))}><option value="">Select a committed evidence file</option>{eligibleFiles.filter(file => file.clientId === riskWorkspace.engagement.clientId && (!file.engagementId || file.engagementId === engagementId)).map(file => <option key={file.id} value={file.id}>{fileLabel(file)}</option>)}</select></label>
              </div>
              <label className="business-field" htmlFor={`risk-findings-${check.code}-${engagementId}`}><span>Findings and conclusion support</span><textarea id={`risk-findings-${check.code}-${engagementId}`} className="input" required minLength={10} maxLength={5000} rows={2} value={check.findings} onChange={event => setDraft(current => ({ ...current, checks: current.checks.map((item, i) => i === index ? { ...item, findings: event.target.value } : item) }))} /></label>
              <label className="business-field" htmlFor={`risk-source-${check.code}-${engagementId}`}><span>Source reference</span><input id={`risk-source-${check.code}-${engagementId}`} required maxLength={1000} value={check.sourceReference} onChange={event => setDraft(current => ({ ...current, checks: current.checks.map((item, i) => i === index ? { ...item, sourceReference: event.target.value } : item) }))} /></label>
              {check.checkMethod === 'EXTERNAL_SERVICE' && <div className="business-form-grid"><label className="business-field" htmlFor={`risk-provider-${check.code}-${engagementId}`}><span>External provider name</span><input id={`risk-provider-${check.code}-${engagementId}`} required maxLength={200} value={check.providerName ?? ''} onChange={event => setDraft(current => ({ ...current, checks: current.checks.map((item, i) => i === index ? { ...item, providerName: event.target.value } : item) }))} /></label><label className="business-field" htmlFor={`risk-provider-ref-${check.code}-${engagementId}`}><span>Provider reference</span><input id={`risk-provider-ref-${check.code}-${engagementId}`} required maxLength={500} value={check.externalReference ?? ''} onChange={event => setDraft(current => ({ ...current, checks: current.checks.map((item, i) => i === index ? { ...item, externalReference: event.target.value } : item) }))} /></label><p className="business-note">No automated screening provider is configured. Record only a real external report that you reviewed and attach it above.</p></div>}
              {(check.outcome === 'ISSUE' || check.outcome === 'NOT_APPLICABLE') && <label className="business-field" htmlFor={`risk-resolution-${check.code}-${engagementId}`}><span>{check.outcome === 'ISSUE' ? 'Issue resolution, or escalate after submission' : 'Reason this check does not apply'}</span><textarea id={`risk-resolution-${check.code}-${engagementId}`} className="input" required={check.outcome === 'NOT_APPLICABLE'} minLength={10} maxLength={5000} rows={2} value={check.resolution ?? ''} onChange={event => setDraft(current => ({ ...current, checks: current.checks.map((item, i) => i === index ? { ...item, resolution: event.target.value || undefined } : item) }))} /></label>}
            </fieldset>)}
          </div>
          <p className="business-note">A submission freezes this exact dossier revision and its evidence references. Manual entries do not claim an AML/KYC API integration. The Partner cannot clear unresolved issues or open escalations.</p>
          <div className="business-dialog-actions"><button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : `Save risk draft v${riskWorkspace.assessment?.draftVersion ?? 0}`}</button><button type="button" className="btn primary" disabled={busy || !riskWorkspace.assessment?.id || !riskWorkspace.assessment?.draftVersion} onClick={submitRiskDraft}>Submit saved revision for Partner decision</button></div>
        </form>
      </>}

      {riskWorkspace.escalations.length > 0 && <section className="business-risk-escalations" aria-label="Risk escalation history">
        <h3>Escalation history</h3>
        {riskWorkspace.escalations.map(item => {
          const current = item.assessmentVersionId === currentVersionId;
          const evidence = item.evidenceFileId ? files.find(file => file.id === item.evidenceFileId) : null;
          return <article className={`business-risk-escalation ${item.status === 'OPEN' ? 'is-open' : 'is-resolved'}`} key={item.id}>
            <div><strong>{item.checkCode} · {item.status === 'OPEN' ? 'Open' : 'Resolved'}{!current ? ' · Superseded dossier revision' : ''}</strong><span>Raised by {item.createdByName} · {new Date(item.createdAt).toLocaleString()}</span></div>
            <p>{item.reason}</p><p>Evidence required: {item.requiredEvidence}</p>
            {item.resolution && <p>Partner resolution: {item.resolution}{item.resolvedByName ? ` · ${item.resolvedByName}` : ''}{item.resolvedAt ? ` · ${new Date(item.resolvedAt).toLocaleString()}` : ''}</p>}
            {evidence && <p>Resolution evidence: {fileLabel(evidence)}</p>}
          </article>;
        })}
      </section>}

      {canEscalate && currentVersionId && escalationCandidates.length > 0 && <form className="business-form business-commercial-form" onSubmit={escalateRiskCheck}>
        <h3>Escalate an open risk issue to the Partner</h3>
        <label className="business-field" htmlFor={`risk-escalation-check-${engagementId}`}><span>Current submitted risk check</span><select id={`risk-escalation-check-${engagementId}`} required value={escalationCheckId} onChange={event => setEscalationCheckId(event.target.value)}><option value="">Select an issue or missing support</option>{escalationCandidates.map((check: any) => <option key={check.id} value={check.id}>{check.code} · {check.outcome}{!check.evidence_file_id ? ' · supporting evidence missing' : ''}</option>)}</select></label>
        <label className="business-field" htmlFor={`risk-escalation-reason-${engagementId}`}><span>Why Partner attention is required</span><textarea id={`risk-escalation-reason-${engagementId}`} className="input" required minLength={10} maxLength={5000} rows={2} value={escalationReason} onChange={event => setEscalationReason(event.target.value)} /></label>
        <label className="business-field" htmlFor={`risk-escalation-evidence-${engagementId}`}><span>Specific evidence needed before clearance</span><input id={`risk-escalation-evidence-${engagementId}`} required minLength={1} maxLength={2000} value={requiredEvidence} onChange={event => setRequiredEvidence(event.target.value)} /></label>
        <button type="submit" className="btn" disabled={busy || !escalationCheckId || escalationReason.trim().length < 10 || !requiredEvidence.trim()}>Escalate selected check</button>
      </form>}

      {canResolveEscalation && currentEscalations.some(item => item.status === 'OPEN') && <form className="business-form business-commercial-form" onSubmit={resolveEscalation}>
        <h3>Partner review of open escalation</h3>
        <label className="business-field" htmlFor={`risk-escalation-open-${engagementId}`}><span>Current dossier escalation</span><select id={`risk-escalation-open-${engagementId}`} required value={resolutionEscalationId} onChange={event => setResolutionEscalationId(event.target.value)}><option value="">Select an open escalation</option>{currentEscalations.filter(item => item.status === 'OPEN').map(item => <option key={item.id} value={item.id}>{item.checkCode} · {item.requiredEvidence}</option>)}</select></label>
        <label className="business-field" htmlFor={`risk-escalation-resolution-${engagementId}`}><span>Resolution and Partner conclusion</span><textarea id={`risk-escalation-resolution-${engagementId}`} className="input" required minLength={10} maxLength={5000} rows={3} value={escalationResolution} onChange={event => setEscalationResolution(event.target.value)} /></label>
        <label className="business-field" htmlFor={`risk-escalation-resolution-file-${engagementId}`}><span>Committed resolution evidence</span><select id={`risk-escalation-resolution-file-${engagementId}`} required value={resolutionEvidenceId} onChange={event => setResolutionEvidenceId(event.target.value)}><option value="">Select committed evidence</option>{eligibleFiles.filter(file => file.clientId === clientId && (!file.engagementId || file.engagementId === engagementId)).map(file => <option key={file.id} value={file.id}>{fileLabel(file)}</option>)}</select></label>
        <button type="submit" className="btn primary" disabled={busy || !resolutionEscalationId || escalationResolution.trim().length < 10 || !resolutionEvidenceId}>Resolve escalation with evidence</button>
      </form>}

      {canClear && currentVersionId && <div className="business-form business-commercial-form">
        <h3>Partner decision on revision {riskWorkspace.assessment?.revision ?? 'pending'}</h3>
        <label className="business-field" htmlFor={`risk-decision-reason-${engagementId}`}><span>Decision rationale</span><textarea id={`risk-decision-reason-${engagementId}`} className="input" required minLength={10} maxLength={10000} rows={3} value={decisionRationale} onChange={event => setDecisionRationale(event.target.value)} /></label>
        <div className="business-dialog-actions">
          {gate?.riskKey.status !== 'ACTIVE' && <button type="button" className="btn primary" disabled={busy || rationalePayload.length < 10} onClick={() => void command('risk.clear', { engagementId, riskAssessmentVersionId: currentVersionId, rationale: rationalePayload }, 'Partner CLEAR decision recorded against this exact risk revision.')}>Clear current risk revision</button>}
          {gate?.riskKey.status !== 'ACTIVE' && <button type="button" className="btn" disabled={busy || rationalePayload.length < 10} onClick={() => void command('risk.reject', { engagementId, riskAssessmentVersionId: currentVersionId, rationale: rationalePayload }, 'Partner REJECT decision recorded.')}>Reject current risk revision</button>}
          {gate?.riskKey.status === 'ACTIVE' && riskDecisionId && <button type="button" className="btn" disabled={busy || rationalePayload.length < 10} onClick={() => void command('risk.revoke', { engagementId, clearanceId: riskDecisionId, rationale: rationalePayload }, 'Partner risk clearance revoked; its history remains immutable.')}>Revoke current risk clearance</button>}
        </div>
      </div>}
    </>}
  </section>;
}
