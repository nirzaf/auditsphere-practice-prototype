import React, { useEffect, useMemo, useState } from 'react';
import type { BusinessContextResponse, BusinessEngagementOption, BusinessFileMetadata, BusinessWorkspacePreference } from '../../shared/api/business';
import { completeBusinessFile, downloadBusinessArchiveExport, downloadBusinessFileVersion, getBusinessArchiveStatus, getBusinessOpinionPreview, getBusinessReportingWorkspace, initializeBusinessFile,
  getBusinessReleasedReportProvenance, newBusinessIdempotencyKey, runBusinessCommand, uploadBusinessFile } from '../../services/businessWorkspace';

type ReportRow = Record<string, unknown>;
type ReportingWorkspace = {
  engagement: ReportRow;
  opinions?: ReportRow[];
  affectedFslis?: ReportRow[];
  signatureAssets?: ReportRow[];
  staff?: ReportRow[];
  statementSnapshot?: (ReportRow & { lines?: ReportRow[]; fsliCatalog?: ReportRow[] }) | null;
  financialStatementDrafts?: ReportRow[];
  financialStatementApprovals?: ReportRow[];
  reportCandidates?: ReportRow[];
  managementLetters?: ReportRow[];
  representationRequests?: ReportRow[];
  representationReturns?: ReportRow[];
  bundleCandidates?: ReportRow[];
  releasedBundles?: ReportRow[];
  bundleDeliveries?: ReportRow[];
  bundleDispatches?: ReportRow[];
  portalAcknowledgements?: ReportRow[];
  retentionPolicies?: ReportRow[];
  archive?: ReportRow;
  findings?: ReportRow[];
  contactRoutes?: ReportRow[];
  jobs?: ReportRow[];
  readOnly?: boolean;
  releasedBundle?: ReportRow | null;
};
type OpinionPreview = ReportRow & {
  revision: number;
  dependencyHash: string;
  isCurrentForSrm: boolean;
  reportingBlockers: string[];
  sections: Array<{ heading: string; paragraphs?: string[]; rows?: Array<{ label: string; current?: string; detail?: string }> }>;
};
type OpinionAffectedInput = { key: string; fsliId: string; amount: string; explanation: string };
type OpinionAdditionalInput = { key: string; heading: string; body: string };

interface Props {
  workspaceId: string;
  selected: BusinessWorkspacePreference;
  context: BusinessContextResponse;
  engagement: BusinessEngagementOption;
  files: BusinessFileMetadata[];
  onChanged: () => void;
}

const rowText = (row: ReportRow | undefined, key: string, fallback = ''): string => {
  const value = row?.[key]; return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
};
const rowObject = (row: ReportRow | null | undefined, key: string): ReportRow | undefined => {
  const value = row?.[key]; return value && typeof value === 'object' && !Array.isArray(value) ? value as ReportRow : undefined;
};
const rowNumber = (row: ReportRow | undefined, key: string): number => Number(row?.[key] ?? 0);
const rows = (value: unknown): ReportRow[] => Array.isArray(value) ? value.filter((item): item is ReportRow => Boolean(item) && typeof item === 'object') : [];
const representationReviewChecks = [
  { key: 'identityConfirmed', label: 'Signatory identity matches the evidence provided' },
  { key: 'capacityConfirmed', label: 'Each signatory has the stated management authority' },
  { key: 'completenessConfirmed', label: 'The signed representation is complete' },
  { key: 'periodConfirmed', label: 'The entity and reporting period match the engagement' },
  { key: 'dateConfirmed', label: 'The representation date is acceptable and no later than the report date' },
  { key: 'consistencyConfirmed', label: 'Representations are consistent with the planned report and current sources' }
] as const;
function qatarDate(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function minorFromQar(value: string): string {
  const match = /^(-?)(0|[1-9]\d{0,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Enter a QAR amount with up to two decimal places.');
  const minor = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0') || '0');
  return `${match[1] === '-' && minor !== 0n ? '-' : ''}${minor}`;
}
function formatQarMinor(value: unknown): string {
  if (value === undefined || value === null || !/^-?\d+$/.test(String(value))) return '—';
  const minor = BigInt(String(value)), absolute = minor < 0n ? -minor : minor;
  return `${minor < 0n ? '−' : ''}QAR ${(absolute / 100n).toLocaleString('en-US')}.${String(absolute % 100n).padStart(2, '0')}`;
}
async function digest(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function BusinessReportingPanel({ workspaceId, selected, context, engagement, files, onChanged }: Props) {
  const today = qatarDate();
  const [data, setData] = useState<ReportingWorkspace | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<ReportRow | null>(null);
  const [archiveStatusError, setArchiveStatusError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [downloading, setDownloading] = useState('');
  const [candidatePreview, setCandidatePreview] = useState<{ candidateId: string; url: string } | null>(null);
  const [releasedProvenance, setReleasedProvenance] = useState<ReportRow | null>(null);
  const [releasedProvenanceError, setReleasedProvenanceError] = useState('');

  const [opinionCategory, setOpinionCategory] = useState('UNMODIFIED');
  const [opinionRationale, setOpinionRationale] = useState('');
  const [materialityAssessment, setMaterialityAssessment] = useState('');
  const [pervasivenessAssessment, setPervasivenessAssessment] = useState('');
  const [basisText, setBasisText] = useState('');
  const [goingConcernText, setGoingConcernText] = useState('');
  const [affectedFslis, setAffectedFslis] = useState<OpinionAffectedInput[]>([{ key: 'affected-0', fsliId: '', amount: '', explanation: '' }]);
  const [additionalSections, setAdditionalSections] = useState<OpinionAdditionalInput[]>([]);
  const [opinionPreview, setOpinionPreview] = useState<OpinionPreview | null>(null);
  const [opinionPreviewError, setOpinionPreviewError] = useState('');
  const [aupReportType, setAupReportType] = useState('');
  const [aupProcedureSummary, setAupProcedureSummary] = useState('');

  const [signatureFileId, setSignatureFileId] = useState('');
  const [sealFileId, setSealFileId] = useState('');
  const [signatureLabel, setSignatureLabel] = useState('');
  const [policyText, setPolicyText] = useState('');
  const [ociApplicable, setOciApplicable] = useState(false);
  const [noteTitle, setNoteTitle] = useState('Basis of preparation and significant accounting policies');
  const [noteBody, setNoteBody] = useState('');
  const [cashFlowLabel, setCashFlowLabel] = useState('Net cash flows from operating activities');
  const [cashFlowCurrent, setCashFlowCurrent] = useState('');
  const [cashFlowPrior, setCashFlowPrior] = useState('');
  const [equityCurrent, setEquityCurrent] = useState('');
  const [equityPrior, setEquityPrior] = useState('');
  const [ociCurrent, setOciCurrent] = useState('');
  const [ociPrior, setOciPrior] = useState('');
  const [selectedOpinionId, setSelectedOpinionId] = useState('');
  const [selectedApprovalId, setSelectedApprovalId] = useState('');
  const [selectedSignatureAssetId, setSelectedSignatureAssetId] = useState('');
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([]);
  const [findingDetails, setFindingDetails] = useState<Record<string, { impact: string; recommendation: string }>>({});
  const [noDeficienciesReason, setNoDeficienciesReason] = useState('');
  const [responsibleParty, setResponsibleParty] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [reportCandidateId, setReportCandidateId] = useState('');
  const [reportConsentText, setReportConsentText] = useState('I reviewed the exact report and statement candidate hash, opinion, entity, period, fee and signature rendering shown here and consent to image application for this candidate.');
  const [representationDate, setRepresentationDate] = useState(today);
  const [requiredSignatories, setRequiredSignatories] = useState('');
  const [routeId, setRouteId] = useState('');
  const [selectedRepresentationRequestId, setSelectedRepresentationRequestId] = useState('');
  const [signedFileIds, setSignedFileIds] = useState<Record<string, string>>({});
  const [signedUploadFiles, setSignedUploadFiles] = useState<Record<string, File>>({});
  const [uploadedSignedFiles, setUploadedSignedFiles] = useState<Record<string, { id: string; originalName: string; sha256: string }>>({});
  const [signatoryNames, setSignatoryNames] = useState('');
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [reviewConfirmations, setReviewConfirmations] = useState<Record<string, Record<string, boolean>>>({});
  const [selectedManagementId, setSelectedManagementId] = useState('');
  const [retentionName, setRetentionName] = useState('Firm-approved audit-file retention');
  const [retentionYears, setRetentionYears] = useState('7');
  const [retainIndefinitely, setRetainIndefinitely] = useState(false);
  const [retentionLegalBasis, setRetentionLegalBasis] = useState('Retention period approved under the firm record-retention policy and applicable professional and legal requirements.');
  const [archiveNote, setArchiveNote] = useState('Index and cross-reference the completed report release records for administrative assembly.');
  const [archiveRecordType, setArchiveRecordType] = useState('DELIVERABLE_BUNDLE');
  const [archiveRecordId, setArchiveRecordId] = useState('');
  const [deliveryBundleId, setDeliveryBundleId] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'EMAIL'|'PORTAL_ACKNOWLEDGEMENT'|'RECORDED_HANDOVER'>('EMAIL');
  const [deliveryDispatchId, setDeliveryDispatchId] = useState('');
  const [deliveryEvidenceFileId, setDeliveryEvidenceFileId] = useState('');
  const [confirmedConsentCandidateIds, setConfirmedConsentCandidateIds] = useState<string[]>([]);

  useEffect(() => {
    if (!selected.actorId || !selected.persona) return;
    const controller = new AbortController();
    getBusinessReportingWorkspace(workspaceId, engagement.id, selected, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setData(result as ReportingWorkspace); setError(''); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Reporting records could not be loaded.'); });
    return () => controller.abort();
  }, [workspaceId, engagement.id, selected.actorId, selected.persona, selected.clientId, selected.engagementId, refresh]);

  useEffect(() => {
    if (!selected.actorId || !selected.persona) return;
    const controller = new AbortController();
    getBusinessArchiveStatus(workspaceId, engagement.id, selected, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setArchiveStatus(result); setArchiveStatusError(''); } })
      .catch(reason => { if (!controller.signal.aborted) setArchiveStatusError(reason instanceof Error ? reason.message : 'Archive status could not be loaded.'); });
    return () => controller.abort();
  }, [workspaceId, engagement.id, selected.actorId, selected.persona, selected.clientId, selected.engagementId, refresh]);

  const perform = async (type: string, payload: Record<string, unknown>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await runBusinessCommand<Record<string, unknown>>(workspaceId, selected, { type, payload }, newBusinessIdempotencyKey());
      setMessage(success); setRefresh(value => value + 1); onChanged(); return response.result;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The reporting command was rejected.'); return null; }
    finally { setBusy(false); }
  };
  const uploadSignedRepresentation = async (requestId: string) => {
    const file = signedUploadFiles[requestId];
    if (!file) { setError('Choose the signed representation PDF to upload.'); return; }
    if (file.type !== 'application/pdf' || file.size <= 0 || file.size > 25 * 1024 * 1024) {
      setError('Choose a non-empty PDF no larger than 25 MiB.'); return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const input = { purpose: 'EVIDENCE' as const, originalName: file.name, mediaType: 'application/pdf' as const,
        sizeBytes: file.size, clientId: engagement.clientId, engagementId: engagement.id, representationRequestId: requestId };
      const reservation = await initializeBusinessFile(workspaceId, selected, input, newBusinessIdempotencyKey());
      const staged = await uploadBusinessFile(workspaceId, selected, reservation, file, 'application/pdf', newBusinessIdempotencyKey());
      const committed = await completeBusinessFile(workspaceId, selected, staged, newBusinessIdempotencyKey());
      setSignedFileIds(current => ({ ...current, [requestId]: committed.fileId }));
      setUploadedSignedFiles(current => ({ ...current, [requestId]: { id: committed.fileId, originalName: file.name, sha256: committed.sha256 } }));
      setSignedUploadFiles(current => { const next = { ...current }; delete next[requestId]; return next; });
      setMessage(`${file.name} is committed, hash verified, and bound to this representation request.`);
      setRefresh(value => value + 1); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The signed representation could not be verified and stored.'); }
    finally { setBusy(false); }
  };
  const download = async (fileId: string, name: string, expectedHash?: string) => {
    setDownloading(fileId); setError('');
    try {
      const blob = await downloadBusinessFileVersion(workspaceId, fileId, selected);
      if (expectedHash && await digest(blob) !== expectedHash) throw new Error('The downloaded bytes do not match the published SHA-256 digest.');
      const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
      document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The verified artifact could not be downloaded.'); }
    finally { setDownloading(''); }
  };

  const downloadArchiveExport = async (part: 'archive' | 'manifest') => {
    const archiveSha256 = rowText(data?.archive, 'archiveSha256');
    const manifestSha256 = rowText(data?.archive, 'manifestSha256');
    if (!archiveSha256 || !manifestSha256) { setError('A sealed archive with both recorded hashes is required.'); return; }
    setDownloading(`archive-${part}`); setError('');
    try {
      const result = await downloadBusinessArchiveExport(workspaceId, engagement.id, part, selected, archiveSha256, manifestSha256);
      const url = URL.createObjectURL(result.blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = result.fileName; document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The sealed archive export could not be verified.'); }
    finally { setDownloading(''); }
  };

  const loadCandidatePreview = async (fileId: string, candidateId: string, expectedHash: string) => {
    setDownloading(fileId); setError('');
    try {
      const blob = await downloadBusinessFileVersion(workspaceId, fileId, selected);
      if (await digest(blob) !== expectedHash) throw new Error('The candidate preview does not match the consented SHA-256 digest.');
      if (blob.type && blob.type !== 'application/pdf') throw new Error('The candidate preview is not a PDF document.');
      setConfirmedConsentCandidateIds(current => current.filter(id => id !== candidateId));
      setCandidatePreview({ candidateId, url: URL.createObjectURL(blob) });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The verified report preview could not be opened.'); }
    finally { setDownloading(''); }
  };

  useEffect(() => () => { if (candidatePreview) URL.revokeObjectURL(candidatePreview.url); }, [candidatePreview]);

  const opinions = data?.opinions ?? [];
  const approvals = data?.financialStatementApprovals ?? [];
  const candidates = data?.reportCandidates ?? [];
  const assets = data?.signatureAssets ?? [];
  const findings = data?.findings ?? [];
  const requests = data?.representationRequests ?? [];
  const returns = data?.representationReturns ?? [];
  const management = data?.managementLetters ?? [];
  const bundles = data?.bundleCandidates ?? [];
  const releasedBundles = data?.releasedBundles ?? [];
  const bundleDeliveries = data?.bundleDeliveries ?? [];
  const bundleDispatches = data?.bundleDispatches ?? [];
  const portalAcknowledgements = data?.portalAcknowledgements ?? [];
  const snapshot = data?.statementSnapshot ?? null;
  const firmFiles = useMemo(() => files.filter(file => file.state === 'COMMITTED' && file.immutable), [files]);
  const signatureFiles = firmFiles.filter(file => file.purpose === 'SIGNATURE' && file.mediaType === 'image/png');
  const sealFiles = firmFiles.filter(file => file.purpose === 'SEAL' && file.mediaType === 'image/png');
  const signedReturns = firmFiles.filter(file => file.engagementId === engagement.id && ['EVIDENCE', 'GENERATED'].includes(file.purpose) && file.mediaType === 'application/pdf');
  const deliveryEvidenceFiles = firmFiles.filter(file => file.engagementId === engagement.id);
  const isClient = context.actor.persona === 'CLIENT';
  const isPartner = context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER';
  const partnerAssets = assets.filter(asset => asset.staffMemberId === context.actor.staffMemberId);
  useEffect(() => {
    if (selectedSignatureAssetId && !partnerAssets.some(asset => asset.id === selectedSignatureAssetId)) setSelectedSignatureAssetId('');
  }, [assets, context.actor.staffMemberId, selectedSignatureAssetId]);
  const canReview = context.actor.persona === 'REVIEWER' || isPartner;
  const currentOpinion = opinions.find(row => row.id === selectedOpinionId) ?? opinions[0];
  const currentApproval = approvals.find(row => row.id === selectedApprovalId) ?? approvals[0];
  const isAup = rowText(data?.engagement, 'engagementType') === 'AGREED_UPON_PROCEDURES';
  const previewVersionId = rowText(currentOpinion, 'id');
  useEffect(() => {
    if (!isPartner || !previewVersionId) { setOpinionPreview(null); setOpinionPreviewError(''); return; }
    const controller = new AbortController();
    setOpinionPreview(null); setOpinionPreviewError('');
    getBusinessOpinionPreview(workspaceId, engagement.id, previewVersionId, selected, controller.signal)
      .then(result => { if (!controller.signal.aborted) setOpinionPreview(result as OpinionPreview); })
      .catch(reason => { if (!controller.signal.aborted) setOpinionPreviewError(reason instanceof Error ? reason.message : 'The exact opinion preview could not be loaded.'); });
    return () => controller.abort();
  }, [workspaceId, engagement.id, selected.actorId, selected.persona, selected.clientId, selected.engagementId, previewVersionId, isPartner, refresh]);
  const pendingJobs = (data?.jobs ?? []).some(job => ['PENDING', 'RUNNING', 'RETRYABLE_FAILED'].includes(String(job.status)));
  useEffect(() => {
    if (!pendingJobs) return;
    const timer = window.setInterval(() => setRefresh(value => value + 1), 5000);
    return () => window.clearInterval(timer);
  }, [pendingJobs]);

  const currentArchiveDue = rowText(data?.engagement, 'archiveDueAt');
  const daysUntilArchive = currentArchiveDue ? Math.ceil((Date.parse(currentArchiveDue) - Date.now()) / 86_400_000) : null;
  const clientUploadsOpen = !rowText(data?.engagement, 'portalFrozenAt') && !rowText(data?.engagement, 'lockedAt')
    && (!currentArchiveDue || Date.parse(currentArchiveDue) > Date.now());
  const released = isClient ? data?.releasedBundle : releasedBundles[0];
  const releasedParts = rows(released?.parts);
  const provenanceEngagement = rowObject(releasedProvenance, 'engagement');
  const provenanceConsent = rowObject(releasedProvenance, 'consent');
  const provenanceSignature = rowObject(releasedProvenance, 'reportSignature');
  const provenanceAsset = rowObject(releasedProvenance, 'signatureAsset');
  const provenanceOwner = rowObject(provenanceAsset, 'owner');
  const provenanceSignatureAsset = rowObject(provenanceAsset, 'signature');
  const provenanceSealAsset = rowObject(provenanceAsset, 'seal');
  const provenanceHashes = rowObject(releasedProvenance, 'sourceHashes');

  useEffect(() => {
    if (!isPartner || releasedBundles.length === 0) { setReleasedProvenance(null); setReleasedProvenanceError(''); return; }
    const controller = new AbortController();
    getBusinessReleasedReportProvenance(workspaceId, engagement.id, selected, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setReleasedProvenance(result as ReportRow); setReleasedProvenanceError(''); } })
      .catch(reason => { if (!controller.signal.aborted) { setReleasedProvenance(null); setReleasedProvenanceError(reason instanceof Error ? reason.message : 'Released report provenance is unavailable.'); } });
    return () => controller.abort();
  }, [workspaceId, engagement.id, selected.actorId, selected.persona, selected.clientId, selected.engagementId, isPartner, releasedBundles[0]?.id]);

  return <section className="business-directory-card" aria-labelledby={`business-reporting-${engagement.id}`}>
    <div className="business-section-heading">
      <div><p className="business-eyebrow">REPORTING · PUBLICATION · RETENTION</p><h2 id={`business-reporting-${engagement.id}`}>Reporting and final deliverables</h2></div>
      <button type="button" className="btn sm" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh reporting</button>
    </div>
    {error && <p className="business-alert" role="alert">{error}</p>}{message && <p className="business-command-message" role="status">{message}</p>}
    <p className="business-note">{engagement.clientName} · {engagement.code} · {engagement.periodStart}–{engagement.periodEnd} · {engagement.lifecycleState.replaceAll('_', ' ')}. Signature images record self-asserted persona approval; they are not certificate-backed electronic signatures.</p>

    {isClient ? <>
      <div className="business-delivery-grid">
        <div className="business-record-list"><h3>Portal upload status</h3><p><strong>{rowText(data?.engagement, 'portalFrozenAt') ? 'Read only' : 'Open'}</strong></p>
          {rowText(data?.engagement, 'portalFrozenAt') && <small>Frozen at {rowText(data?.engagement, 'portalFrozenAt')}; released audit content remains available below.</small>}</div>
        <div className="business-record-list"><h3>Archive status</h3><p>{rowText(data?.archive, 'status', 'Assembly has not started')}</p>
          {rowText(archiveStatus ?? undefined, 'sealedAt') && <small>Sealed {rowText(archiveStatus ?? undefined, 'sealedAt')}</small>}
          {archiveStatusError && <small role="status">{archiveStatusError}</small>}</div>
      </div>
      {requests.length > 0 && <div className="business-record-list"><h3>Signed letter of representation</h3>
        {requests.map(request => {
          const requestId = rowText(request, 'id');
          const requestFiles: Array<{ id: string; originalName: string; sha256: string | null }> = signedReturns
            .filter(file => file.representationRequestId === requestId).map(file => ({ id: file.id, originalName: file.originalName, sha256: file.sha256 }));
          const localFile = uploadedSignedFiles[requestId];
          if (localFile && !requestFiles.some(file => file.id === localFile.id)) {
            requestFiles.push({ id: localFile.id, originalName: localFile.originalName, sha256: localFile.sha256 });
          }
          let signatoryNamesForRequest: string[] = [];
          try { signatoryNamesForRequest = JSON.parse(rowText(request, 'requiredSignatoriesJson')) as string[]; } catch { /* malformed server data remains visible as an empty requirement list */ }
          return <div className="business-delivery-row" key={requestId}>
            <strong>{rowText(request, 'status')} · proposed report date {rowText(request, 'proposedReportDate')}</strong>
            <span>Required management signatories: {signatoryNamesForRequest.join(', ') || 'request configuration is unavailable'}</span>
            {['SENT', 'REJECTED'].includes(rowText(request, 'status')) && <>
              {!clientUploadsOpen && <p className="business-alert" role="status">The portal is frozen or the archive deadline has passed; this request cannot accept a signed return.</p>}
              <label className="business-field"><span>Signed LOR PDF</span><input type="file" accept="application/pdf,.pdf" disabled={busy || !clientUploadsOpen}
                onChange={event => { const file = event.currentTarget.files?.[0]; setSignedUploadFiles(current => file ? { ...current, [requestId]: file } : current); }} /></label>
              <button type="button" className="btn sm" disabled={busy || !clientUploadsOpen || !signedUploadFiles[requestId]}
                onClick={() => void uploadSignedRepresentation(requestId)}>Upload and verify signed PDF</button>
              <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault(); void perform('representation.receive', {
                requestId, signedFileId: signedFileIds[requestId], representationDate, signatoryNames
              }, 'Signed representation return received and retained for independent review.'); }}>
                <label className="business-field"><span>Committed PDF for this request</span><select required value={signedFileIds[requestId] ?? ''}
                  onChange={event => setSignedFileIds(current => ({ ...current, [requestId]: event.target.value }))}>
                  <option value="">Choose this request’s uploaded signed return</option>{requestFiles.map(file => <option key={file.id} value={file.id}>{file.originalName} · {file.sha256?.slice(0, 12)}</option>)}
                </select></label>
                <label className="business-field"><span>Representation date</span><input type="date" required min={engagement.periodEnd}
                  max={rowText(request, 'proposedReportDate')} value={representationDate} onChange={event => setRepresentationDate(event.target.value)} /></label>
                <label className="business-field"><span>Names as signed</span><textarea required minLength={1} value={signatoryNames} onChange={event => setSignatoryNames(event.target.value)} /></label>
                <button className="btn sm" disabled={busy || !clientUploadsOpen || !signedFileIds[requestId] || !signatoryNames.trim()}>Submit signed return for independent review</button>
              </form>
            </>}
            {returns.filter(item => item.requestId === requestId).map(item => <p key={String(item.id)}>Return v{rowText(item, 'revision')} received {rowText(item, 'representationDate')} · {rowText(item, 'fileName')} · SHA-256 {rowText(item, 'fileSha256').slice(0, 16)}…</p>)}
          </div>;
        })}
      </div>}
      <h3>Released bundle</h3>
      {releasedParts.length ? <div className="business-record-list">{releasedParts.map(part => <div className="business-delivery-row" key={String(part.id ?? part.kind)}>
        <strong>{rowText(part, 'kind').replaceAll('_', ' ')}</strong><span>{rowText(part, 'fileName')} · {((Number(part.sizeBytes) || 0) / 1024).toFixed(1)} KiB · SHA-256 {rowText(part, 'sha256').slice(0, 16)}…</span>
        <button type="button" className="btn sm" disabled={Boolean(downloading)} onClick={() => void download(rowText(part, 'fileId'), rowText(part, 'fileName', `${rowText(part, 'kind').toLowerCase()}.pdf`), rowText(part, 'sha256'))}>{downloading === part.fileId ? 'Verifying…' : 'Download and verify'}</button>
        {rowText(part, 'signedReturnFileId') && <button type="button" className="btn sm" disabled={Boolean(downloading)}
          onClick={() => void download(rowText(part, 'signedReturnFileId'), rowText(part, 'signedReturnName', 'signed-representation.pdf'), rowText(part, 'signedReturnSha256'))}>
          {downloading === rowText(part, 'signedReturnFileId') ? 'Verifying signed return…' : 'Download accepted signed return'}
        </button>}
      </div>)}</div> : <p className="business-muted">No final bundle has been released for this engagement.</p>}
      {data?.releasedBundle && <div className="business-record-list"><h3>Portal delivery acknowledgement</h3>
        {portalAcknowledgements.length > 0 ? <p role="status">Acknowledged {rowText(portalAcknowledgements[0], 'deliveredAt')}.</p>
          : <><p>Released downloads are available. Acknowledging receipt records an operational event and does not change the report signature or archive deadline.</p>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('bundle.record-delivery', {
              bundleId: rowText(data.releasedBundle ?? undefined, 'id'), method: 'PORTAL_ACKNOWLEDGEMENT', dispatchId: null, evidenceFileId: null
            }, 'Portal acknowledgement recorded. The signed report date and archive deadline are unchanged.')}>Acknowledge portal receipt</button></>}
      </div>}
    </> : <>
      <div className="business-delivery-grid">
        <div className="business-record-list"><h3>Current statement source</h3><p>{snapshot ? `Snapshot ${rowText(snapshot, 'id')} · ${rows(snapshot.lines).length} presentation lines` : 'A cleared statement snapshot is required.'}</p>
          {snapshot && <small>Source hash {rowText(snapshot, 'sourceHash').slice(0, 18)}… · generated {rowText(snapshot, 'generatedAt')}</small>}</div>
        <div className="business-record-list"><h3>Assembly deadline</h3><p>{currentArchiveDue ? `${daysUntilArchive === null ? 'Calculating' : daysUntilArchive < 0 ? 'Overdue' : `${daysUntilArchive} days remaining`} · ${currentArchiveDue}` : 'The 60-day clock starts only after successful report release.'}</p>
          <small>Deadline is derived from the report signature timestamp and does not move when email or downloads are retried.</small></div>
      </div>

      {isPartner && <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault(); try {
        const modified = !isAup && opinionCategory !== 'UNMODIFIED';
        const affectedValues = modified ? affectedFslis.map(item => ({ fsliId: item.fsliId,
          amountMinor: item.amount.trim() ? minorFromQar(item.amount) : null, explanation: item.explanation })) : [];
        const additionalValues = additionalSections.map(({ heading, body }) => ({ heading, body }));
        void perform('opinion.select', { engagementId: engagement.id, category: isAup ? null : opinionCategory,
          affectedFslis: affectedValues,
          rationale: isAup ? 'AUP report. No ISA audit opinion is expressed.' : opinionRationale,
          materialityAssessment: isAup ? 'Not applicable to an agreed-upon procedures report.' : materialityAssessment,
          pervasivenessAssessment: isAup ? 'Not applicable to an agreed-upon procedures report.' : pervasivenessAssessment,
          ...(!isAup && opinionCategory !== 'UNMODIFIED' && basisText.trim() ? { basisText } : {}),
          ...(!isAup && goingConcernText.trim() ? { goingConcernReportingText: goingConcernText } : {}), additionalSections: additionalValues,
          ...(isAup ? { aupReportType, aupProcedureSummary } : {}) }, 'Versioned Partner opinion saved against the current cleared SRM.')
          .then(result => { if (result && typeof result.opinionVersionId === 'string') setSelectedOpinionId(result.opinionVersionId); });
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Review the opinion fields and try again.'); } }}>
        <h3>Partner opinion and conditional basis</h3>
        {isAup ? <div className="business-form-grid"><label className="business-field"><span>Approved AUP report type</span><input required value={aupReportType} onChange={event => setAupReportType(event.target.value)} /></label>
          <label className="business-field"><span>Procedures and factual findings summary</span><textarea required minLength={20} value={aupProcedureSummary} onChange={event => setAupProcedureSummary(event.target.value)} /></label></div> : <label className="business-field"><span>Audit opinion</span><select value={opinionCategory} onChange={event => setOpinionCategory(event.target.value)}>
          <option value="UNMODIFIED">Clean / unqualified</option><option value="QUALIFIED">Qualified</option><option value="DISCLAIMER">Disclaimer</option><option value="ADVERSE">Adverse</option></select></label>}
        {isAup ? <p role="status" className="business-note">This engagement uses its approved AUP report type and factual findings. No ISA audit opinion or modified-opinion basis is selected.</p>
          : <div className="business-form-grid"><label className="business-field"><span>Partner rationale</span><textarea required minLength={10} value={opinionRationale} onChange={event => setOpinionRationale(event.target.value)} /></label>
            <label className="business-field"><span>Materiality assessment</span><textarea required minLength={10} value={materialityAssessment} onChange={event => setMaterialityAssessment(event.target.value)} /></label>
            <label className="business-field"><span>Pervasiveness assessment</span><textarea required minLength={10} value={pervasivenessAssessment} onChange={event => setPervasivenessAssessment(event.target.value)} /></label>
            {opinionCategory !== 'UNMODIFIED' && <label className="business-field"><span>Basis text</span><textarea required minLength={20} value={basisText} onChange={event => setBasisText(event.target.value)} /></label>}
            <label className="business-field"><span>Going-concern / other required reporting section, if applicable</span><textarea value={goingConcernText} onChange={event => setGoingConcernText(event.target.value)} /></label></div>}
        {!isAup && opinionCategory !== 'UNMODIFIED' && <fieldset className="business-form-grid">
          <legend>Affected financial statement lines</legend>
          {affectedFslis.map((item, index) => <div className="business-form-grid" key={item.key}>
            <label className="business-field" htmlFor={`opinion-fsli-${item.key}`}><span>FSLI {index + 1}</span><select id={`opinion-fsli-${item.key}`} required value={item.fsliId}
              onChange={event => setAffectedFslis(current => current.map(line => line.key === item.key ? { ...line, fsliId: event.target.value } : line))}>
              <option value="">Choose an FSLI</option>{rows(snapshot?.fsliCatalog).map(option => <option key={String(option.id)} value={String(option.id)}>{rowText(option, 'code')} · {rowText(option, 'name')}</option>)}</select></label>
            <label className="business-field" htmlFor={`opinion-amount-${item.key}`}><span>Quantifiable amount (QAR, optional)</span><input id={`opinion-amount-${item.key}`} inputMode="decimal"
              pattern="-?(0|[1-9][0-9]{0,12})([.][0-9]{1,2})?" title="Use a QAR amount with up to two decimal places." value={item.amount}
              onChange={event => setAffectedFslis(current => current.map(line => line.key === item.key ? { ...line, amount: event.target.value } : line))} /></label>
            <label className="business-field" htmlFor={`opinion-explanation-${item.key}`}><span>Nature and explanation</span><textarea id={`opinion-explanation-${item.key}`} required minLength={10} value={item.explanation}
              onChange={event => setAffectedFslis(current => current.map(line => line.key === item.key ? { ...line, explanation: event.target.value } : line))} /></label>
            {affectedFslis.length > 1 && <button type="button" className="btn sm" aria-label={`Remove affected FSLI ${index + 1}`}
              onClick={() => setAffectedFslis(current => current.filter(line => line.key !== item.key))}>Remove line</button>}
          </div>)}
          <button type="button" className="btn sm" disabled={affectedFslis.length >= 100}
            onClick={() => setAffectedFslis(current => [...current, { key: crypto.randomUUID(), fsliId: '', amount: '', explanation: '' }])}>Add affected FSLI</button>
        </fieldset>}
        <fieldset className="business-form-grid"><legend>Additional explanatory report sections</legend>
          <p className="business-note">Add any other required report section as a separate heading and text. The preview preserves both exactly.</p>
          {additionalSections.map((section, index) => <div className="business-form-grid" key={section.key}>
            <label className="business-field" htmlFor={`opinion-additional-heading-${section.key}`}><span>Section heading {index + 1}</span><input id={`opinion-additional-heading-${section.key}`} required maxLength={200} value={section.heading}
              onChange={event => setAdditionalSections(current => current.map(item => item.key === section.key ? { ...item, heading: event.target.value } : item))} /></label>
            <label className="business-field" htmlFor={`opinion-additional-body-${section.key}`}><span>Section text {index + 1}</span><textarea id={`opinion-additional-body-${section.key}`} required minLength={10} value={section.body}
              onChange={event => setAdditionalSections(current => current.map(item => item.key === section.key ? { ...item, body: event.target.value } : item))} /></label>
            <button type="button" className="btn sm" aria-label={`Remove explanatory section ${index + 1}`}
              onClick={() => setAdditionalSections(current => current.filter(item => item.key !== section.key))}>Remove section</button>
          </div>)}
          <button type="button" className="btn sm" disabled={additionalSections.length >= 30}
            onClick={() => setAdditionalSections(current => [...current, { key: crypto.randomUUID(), heading: '', body: '' }])}>Add explanatory section</button>
        </fieldset>
        <button className="btn sm" disabled={busy || !isPartner}>Save new opinion version</button>
      </form>}
      {isPartner && opinions.length > 0 && <section className="business-record-list" aria-labelledby="opinion-preview-title" aria-live="polite">
        <h3 id="opinion-preview-title">Exact report text preview</h3>
        <label className="business-field" htmlFor="opinion-preview-version"><span>Opinion version used for preview and report preparation</span>
          <select id="opinion-preview-version" value={previewVersionId} onChange={event => setSelectedOpinionId(event.target.value)}>
            {opinions.map(item => <option key={String(item.id)} value={String(item.id)}>v{rowText(item, 'revision')} · {rowText(item, 'category', rowText(item, 'aup_report_type'))}</option>)}
          </select>
        </label>
        {opinionPreviewError && <p role="alert" className="business-note">{opinionPreviewError}</p>}
        {opinionPreview && <>
          <p role="status">Version {opinionPreview.revision} · SHA-256 source {opinionPreview.dependencyHash} · {opinionPreview.isCurrentForSrm ? 'Current cleared SRM' : 'Stale source; a new opinion version is required'}.</p>
          {opinionPreview.reportingBlockers.length > 0 && <div role="alert" className="business-note"><strong>Report preparation is blocked until these items are resolved:</strong>
            <ul>{opinionPreview.reportingBlockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></div>}
          {opinionPreview.sections.map((section, index) => <section key={`${index}-${section.heading}`} aria-labelledby={`opinion-preview-section-${index}`}>
            <h4 id={`opinion-preview-section-${index}`}>{section.heading}</h4>
            {(section.paragraphs ?? []).map((paragraph, paragraphIndex) => <p key={paragraphIndex} style={{ whiteSpace: 'pre-wrap' }}>{paragraph}</p>)}
            {section.rows && <table><thead><tr><th scope="col">Financial statement line</th><th scope="col">Amount</th><th scope="col">Nature and explanation</th></tr></thead>
              <tbody>{section.rows.map((line, lineIndex) => <tr key={`${line.label}-${lineIndex}`}><th scope="row">{line.label}</th><td>{line.current ?? '—'}</td><td>{line.detail ?? ''}</td></tr>)}</tbody></table>}
          </section>)}
        </>}
      </section>}
      {opinions.length > 0 && <div className="business-record-list"><h3>Opinion history</h3>{opinions.map(item => <p key={String(item.id)}>v{rowText(item, 'revision')} · {rowText(item, 'report_type')} · {rowText(item, 'category', rowText(item, 'aup_report_type'))} · {rowText(item, 'basis_heading', 'AUP findings')} · {rowText(item, 'dependency_hash').slice(0, 16)}…</p>)}</div>}

      {isPartner && <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault(); void perform('signature-asset.register', { staffMemberId: context.actor.staffMemberId,
        signatureFileId, sealFileId, label: signatureLabel }, 'Partner signature and seal registered with immutable file hashes.'); }}>
        <h3>Register a Partner signature image and PNG seal</h3><div className="business-form-grid">
          <label className="business-field"><span>Partner owner</span><output>{context.actor.displayName} · current self-asserted Partner profile</output></label>
          <label className="business-field"><span>Committed signature PNG</span><select required value={signatureFileId} onChange={event => setSignatureFileId(event.target.value)}><option value="">Choose signature</option>{signatureFiles.map(file => <option key={file.id} value={file.id}>{file.originalName} · {file.sha256?.slice(0, 12)}</option>)}</select></label>
          <label className="business-field"><span>Committed seal PNG</span><select required value={sealFileId} onChange={event => setSealFileId(event.target.value)}><option value="">Choose seal</option>{sealFiles.map(file => <option key={file.id} value={file.id}>{file.originalName} · {file.sha256?.slice(0, 12)}</option>)}</select></label>
          <label className="business-field"><span>Asset label</span><input required maxLength={200} value={signatureLabel} onChange={event => setSignatureLabel(event.target.value)} /></label></div>
        <p className="business-note">Upload the actual images through the firm-file controls first. The seal must include transparent pixels. Registration records the current Partner profile as a self-asserted owner; no built-in signature is supplied.</p>
        <button className="btn sm" disabled={busy || !isPartner || !context.actor.staffMemberId}>Register assets</button>
      </form>}

      {canReview && snapshot && <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault();
        try {
          const prior = (value: string) => value.trim() ? minorFromQar(value) : null;
          const supplementLines = [
            { section: 'CASH_FLOW', code: 'CF-OPERATING', label: cashFlowLabel, currentMinor: minorFromQar(cashFlowCurrent), priorMinor: prior(cashFlowPrior), rationale: 'Management-provided and engagement-supported cash-flow classification for review.' },
            { section: 'EQUITY_CHANGE', code: 'EQUITY-CLOSING', label: 'Closing equity and changes during the period', currentMinor: minorFromQar(equityCurrent), priorMinor: prior(equityPrior), rationale: 'Reconciled to the approved opening and closing equity schedules.' },
            ...(ociApplicable ? [{ section: 'OCI', code: 'OCI-TOTAL', label: 'Other comprehensive income', currentMinor: minorFromQar(ociCurrent), priorMinor: prior(ociPrior), rationale: 'Include only where applicable under the approved reporting framework.' }] : [])
          ];
          const notes = [{ noteNumber: '1', title: noteTitle, body: noteBody, amountMinor: null, sortOrder: 1 }];
          void perform('financial-statements.save-disclosures', { engagementId: engagement.id, statementSnapshotId: rowText(snapshot, 'id'), accountingPolicies: policyText,
            ociApplicable, notes, supplementLines }, 'Disclosure draft saved with visible completeness checks.');
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enter valid statement amounts.'); }
      }}>
        <h3>Complete statement schedules and disclosures</h3><label className="business-field"><span>Accounting policies</span><textarea required minLength={20} value={policyText} onChange={event => setPolicyText(event.target.value)} /></label>
        <div className="business-form-grid"><label className="business-field"><span>Note title</span><input required value={noteTitle} onChange={event => setNoteTitle(event.target.value)} /></label>
          <label className="business-field"><span>Note disclosure</span><textarea required minLength={10} value={noteBody} onChange={event => setNoteBody(event.target.value)} /></label>
          <label className="business-field"><span>Cash-flow line label</span><input required value={cashFlowLabel} onChange={event => setCashFlowLabel(event.target.value)} /></label>
          <label className="business-field"><span>Cash flow current (QAR)</span><input required inputMode="decimal" value={cashFlowCurrent} onChange={event => setCashFlowCurrent(event.target.value)} /></label>
          <label className="business-field"><span>Cash flow comparative (QAR)</span><input inputMode="decimal" value={cashFlowPrior} onChange={event => setCashFlowPrior(event.target.value)} /></label>
          <label className="business-field"><span>Equity current (QAR)</span><input required inputMode="decimal" value={equityCurrent} onChange={event => setEquityCurrent(event.target.value)} /></label>
          <label className="business-field"><span>Equity comparative (QAR)</span><input inputMode="decimal" value={equityPrior} onChange={event => setEquityPrior(event.target.value)} /></label>
          <label className="business-field"><span>OCI applicable</span><select value={ociApplicable ? 'yes' : 'no'} onChange={event => setOciApplicable(event.target.value === 'yes')}><option value="no">No</option><option value="yes">Yes</option></select></label>
          {ociApplicable && <><label className="business-field"><span>OCI current (QAR)</span><input required inputMode="decimal" value={ociCurrent} onChange={event => setOciCurrent(event.target.value)} /></label><label className="business-field"><span>OCI comparative (QAR)</span><input inputMode="decimal" value={ociPrior} onChange={event => setOciPrior(event.target.value)} /></label></>}</div>
        <button className="btn sm" disabled={busy}>Save statement disclosure revision</button>
      </form>}
      {canReview && <div className="business-record-list"><h3>Financial-statement drafts</h3>{(data?.financialStatementDrafts ?? []).map(draft => <div className="business-delivery-row" key={String(draft.id)}>
        <strong>v{rowText(draft, 'version')} · {rowText(draft, 'status')}</strong><span>Completeness {rowText(draft, 'completenessChecklistJson')} · source {rowText(draft, 'sourceHash').slice(0, 16)}…</span>
        {draft.status === 'DRAFT' && <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('financial-statements.approve', { draftId: rowText(draft, 'id'), sourceHash: rowText(draft, 'sourceHash') }, 'Statements approved by the independent reviewer and pinned immutably.')}>Approve exact draft</button>}
      </div>)}</div>}

      {isPartner && <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault(); void perform('report.prepare', { engagementId: engagement.id,
        opinionVersionId: selectedOpinionId || rowText(currentOpinion, 'id'), financialStatementApprovalId: selectedApprovalId || rowText(currentApproval, 'id'),
        signatureAssetId: selectedSignatureAssetId || rowText(partnerAssets[0], 'id'), proposedReportDate: today }, 'Report candidate queued for PDF generation.'); }}>
        <h3>{isAup ? 'Prepare exact AUP report candidate' : 'Prepare exact auditor-report and statement candidate'}</h3><div className="business-form-grid">
          <label className="business-field"><span>Partner opinion</span><select required value={selectedOpinionId} onChange={event => setSelectedOpinionId(event.target.value)}><option value="">Choose opinion</option>{opinions.map(item => <option key={String(item.id)} value={String(item.id)}>v{rowText(item, 'revision')} · {rowText(item, 'category', rowText(item, 'aup_report_type'))}</option>)}</select></label>
          <label className="business-field"><span>Approved statement draft</span><select required value={selectedApprovalId} onChange={event => setSelectedApprovalId(event.target.value)}><option value="">Choose approved statements</option>{approvals.map(item => <option key={String(item.id)} value={String(item.id)}>Draft v{rowText(item, 'draftVersion')} · {rowText(item, 'approvedAt')}</option>)}</select></label>
          <label className="business-field"><span>Your signature and seal asset</span><select required value={selectedSignatureAssetId} onChange={event => setSelectedSignatureAssetId(event.target.value)}><option value="">Choose your registered asset</option>{partnerAssets.map(item => <option key={String(item.id)} value={String(item.id)}>{rowText(item, 'label')} · {rowText(item, 'staffName')}</option>)}</select></label>
          <label className="business-field"><span>Proposed Qatar report date</span><input type="date" readOnly value={today} /></label></div>
        <button className="btn sm" disabled={busy || !isPartner || !opinionPreview || opinionPreview.opinionVersionId !== selectedOpinionId || opinionPreview.reportingBlockers.length > 0}>Generate report candidate</button>
      </form>}
      {candidates.length > 0 && <div className="business-record-list"><h3>Report candidates and explicit signature consent</h3>{candidates.map(candidate => {
        const id = rowText(candidate, 'id');
        const candidateOpinion = opinions.find(opinion => opinion.id === candidate.opinionVersionId);
        const candidateAsset = partnerAssets.find(asset => asset.id === candidate.signatureAssetId);
        const candidateAssetSignature = rowText(candidateAsset, 'signatureSha256');
        const candidateAssetSeal = rowText(candidateAsset, 'sealSha256');
        const candidatePreviewIsOpen = candidatePreview?.candidateId === id;
        const candidateDateIsCurrent = rowText(candidate, 'proposedReportDate') === today;
        return <div className="business-delivery-row" key={id}><strong>{id} · {rowText(candidate, 'status')}</strong>
          <span>Proposed Qatar report date {rowText(candidate, 'proposedReportDate')} · candidate content SHA-256 {rowText(candidate, 'contentSha256')} · job {rowText(candidate, 'failureCode', 'no failure')}</span>
          {isPartner && candidate.status === 'READY' && <section className="business-report-consent" aria-label={`Review report candidate ${id} before signature consent`}>
            <h4>Exact report and signature review</h4>
            <dl><div><dt>Entity</dt><dd>{engagement.clientName}</dd></div><div><dt>Reporting period</dt><dd>{engagement.periodStart}–{engagement.periodEnd}</dd></div>
              <div><dt>Opinion</dt><dd>{rowText(candidateOpinion, 'category', rowText(candidateOpinion, 'aup_report_type'))}</dd></div>
              <div><dt>Contract fee</dt><dd>{formatQarMinor(engagement.contractFeeMinor)}</dd></div><div><dt>Signature owner</dt><dd>{rowText(candidateAsset, 'staffName', 'Asset owner unavailable')}</dd></div>
              <div><dt>Signature asset</dt><dd>{rowText(candidateAsset, 'label', 'Asset unavailable')}</dd></div>
              <div><dt>Signature SHA-256</dt><dd>{candidateAssetSignature || 'Unavailable'}</dd></div><div><dt>Seal SHA-256</dt><dd>{candidateAssetSeal || 'Unavailable'}</dd></div></dl>
            <button type="button" className="btn sm" disabled={Boolean(downloading) || !rowText(candidate, 'fileId')}
              onClick={() => void loadCandidatePreview(rowText(candidate, 'fileId'), id, rowText(candidate, 'contentSha256'))}>Open hash-verified report preview</button>
            {candidatePreviewIsOpen && candidatePreview && <iframe className="business-report-preview-frame" title={`Hash-verified report preview ${id}`} src={candidatePreview.url} />}
            {!candidateDateIsCurrent && <p className="business-alert" role="status">This preview is dated for an earlier Qatar day. It cannot be consented or released; prepare a current report candidate.</p>}
            {candidateDateIsCurrent && !candidate.consentId && candidatePreviewIsOpen && <>
              <label><input type="checkbox" checked={confirmedConsentCandidateIds.includes(id)} onChange={event => setConfirmedConsentCandidateIds(current => event.target.checked ? [...current, id] : current.filter(item => item !== id))} /> I reviewed the exact PDF above, its full content hash, opinion, entity, period, fee, signature owner and seal hashes.</label>
              <button type="button" className="btn sm" disabled={busy || !confirmedConsentCandidateIds.includes(id)} onClick={() => {
                const assetId = rowText(candidate, 'signatureAssetId'), contentHash = rowText(candidate, 'contentSha256'), date = rowText(candidate, 'proposedReportDate');
                void perform('report.consent', { engagementId: engagement.id, reportCandidateId: id, signatureAssetId: assetId, candidateContentHash: contentHash, proposedReportDate: date, consentText: reportConsentText }, 'Explicit consent recorded for this exact report hash and image asset.');
              }}>Consent to exact report hash</button>
            </>}
            {Boolean(candidate.consentId) && <span>Consent recorded for candidate hash {rowText(candidate, 'consentContentHash')} · signature event recorded only after final release.</span>}
          </section>}
          {rowText(candidate, 'fileId') && <button type="button" className="btn sm" disabled={Boolean(downloading)} onClick={() => void download(rowText(candidate, 'fileId'), `report-candidate-${id}.pdf`, rowText(candidate, 'contentSha256'))}>Download hash-verified preview</button>}
        </div>;
      })}</div>}

      {isPartner && <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault();
        const items = selectedFindingIds.map(findingId => ({ findingId, impact: findingDetails[findingId]?.impact ?? '',
          recommendation: findingDetails[findingId]?.recommendation ?? '', ...(responsibleParty.trim() ? { responsibleParty } : {}), ...(targetDate ? { targetDate } : {}) }));
        void perform('management-letter.prepare', { engagementId: engagement.id, items, ...(items.length ? {} : { noReportableDeficienciesReason: noDeficienciesReason }) }, 'Management-letter version queued from selected findings or an explicit no-deficiencies rationale.'); }}>
        <h3>Prepare management letter</h3>
        {findings.length ? <div className="business-form-grid"><fieldset className="business-field"><legend>Findings to communicate</legend>{findings.map(finding => <label key={String(finding.id)}><input type="checkbox" checked={selectedFindingIds.includes(String(finding.id))} onChange={event => setSelectedFindingIds(current => event.target.checked ? [...current, String(finding.id)] : current.filter(id => id !== finding.id))} /> {rowText(finding, 'title')} · {rowText(finding, 'severity')}</label>)}</fieldset>
          {selectedFindingIds.map(findingId => {
            const finding = findings.find(item => item.id === findingId);
            const detail = findingDetails[findingId] ?? { impact: '', recommendation: '' };
            return <fieldset className="business-field" key={findingId}><legend>{rowText(finding, 'title')} · deficiency</legend><p>{rowText(finding, 'title')}. {rowText(finding, 'description')}</p>
              <label><span>Impact</span><textarea required minLength={10} value={detail.impact} onChange={event => setFindingDetails(current => ({
                ...current, [findingId]: { ...(current[findingId] ?? { impact: '', recommendation: '' }), impact: event.target.value }
              }))} /></label>
              <label><span>Recommendation</span><textarea required minLength={10} value={detail.recommendation} onChange={event => setFindingDetails(current => ({
                ...current, [findingId]: { ...(current[findingId] ?? { impact: '', recommendation: '' }), recommendation: event.target.value }
              }))} /></label>
              {rowText(finding, 'clientResponse') && <p>Management response recorded: {rowText(finding, 'clientResponse')}</p>}
            </fieldset>;
          })}</div> : <p className="business-muted">No current reviewed findings are available.</p>}
        {!selectedFindingIds.length && <label className="business-field"><span>Partner-approved reason for no reportable deficiencies</span><textarea required minLength={10} value={noDeficienciesReason} onChange={event => setNoDeficienciesReason(event.target.value)} /></label>}
        {selectedFindingIds.length > 0 && <div className="business-form-grid"><label className="business-field"><span>Responsible party (optional)</span><input value={responsibleParty} onChange={event => setResponsibleParty(event.target.value)} /></label><label className="business-field"><span>Target date (optional)</span><input type="date" value={targetDate} onChange={event => setTargetDate(event.target.value)} /></label></div>}
        <button className="btn sm" disabled={busy || !isPartner}>Generate management letter</button>
      </form>}
      {management.length > 0 && <div className="business-record-list"><h3>Management letter history</h3>{management.map(item => <p key={String(item.id)}>v{rowText(item, 'revision')} · {rowText(item, 'status')} · SHA-256 {rowText(item, 'sourceHash').slice(0, 16)}… · {rowText(item, 'failureCode')}</p>)}</div>}

      {canReview && <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault();
        const names = requiredSignatories.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
        void perform('representation.prepare', { engagementId: engagement.id, proposedReportDate: today, requiredSignatories: names, contactRouteId: routeId }, 'Representation letter template queued before report signing.'); }}>
        <h3>Prepare pre-report letter of representation</h3><div className="business-form-grid">
          <label className="business-field"><span>Primary management report route</span><select required value={routeId} onChange={event => setRouteId(event.target.value)}><option value="">Choose FINAL_REPORT contact</option>{(data?.contactRoutes ?? []).map(item => <option key={String(item.id)} value={String(item.id)}>{rowText(item, 'contactName')} · {rowText(item, 'email')}</option>)}</select></label>
          <label className="business-field"><span>Required management signatories (one per line)</span><textarea required value={requiredSignatories} onChange={event => setRequiredSignatories(event.target.value)} /></label>
          <label className="business-field"><span>Proposed report date</span><input type="date" readOnly value={today} /></label></div>
        <button className="btn sm" disabled={busy}>Prepare representation template</button>
      </form>}
      {requests.length > 0 && <div className="business-record-list"><h3>Representation requests and returned evidence</h3>{requests.map(request => <div className="business-delivery-row" key={String(request.id)}>
        <strong>{rowText(request, 'status')} · {rowText(request, 'proposedReportDate')}</strong><span>Request {rowText(request, 'id')} · email dispatch {rowText(request, 'dispatchStatus', 'not queued')}</span>
        {request.status === 'PREPARED' && canReview && <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('representation.send', { requestId: rowText(request, 'id') }, 'Representation email queued with the actual editable template. Provider outcome remains pending until confirmed.')}>Send template</button>}
        {request.status === 'RECEIVED' && canReview && returns.filter(item => item.requestId === request.id).map(item => {
          const returnId = rowText(item, 'id');
          const checks = reviewConfirmations[returnId] ?? {};
          const reviewReason = reviewReasons[returnId] ?? '';
          const allChecksConfirmed = representationReviewChecks.every(check => checks[check.key]);
          const submitReview = (decision: 'ACCEPT' | 'REJECT') => void perform('representation.review', {
            requestId: rowText(request, 'id'), returnId, decision, reviewReason, dependencyHash: rowText(request, 'dependencyHash'),
            identityConfirmed: Boolean(checks.identityConfirmed), capacityConfirmed: Boolean(checks.capacityConfirmed),
            completenessConfirmed: Boolean(checks.completenessConfirmed), periodConfirmed: Boolean(checks.periodConfirmed),
            dateConfirmed: Boolean(checks.dateConfirmed), consistencyConfirmed: Boolean(checks.consistencyConfirmed)
          }, decision === 'ACCEPT' ? 'Current signed return accepted against its source dependency hash.' : 'Signed return rejected with a recorded review reason.');
          return <div className="business-delivery-row" key={returnId}><strong>{rowText(item, 'fileName')} · {rowText(item, 'representationDate')}</strong>
            <span>{rowText(item, 'signatoryNames')} · {rowText(item, 'fileSha256').slice(0, 16)}…</span>
            <fieldset className="business-field"><legend>Independent reviewer checks for this exact return</legend>{representationReviewChecks.map(check => <label key={check.key}>
              <input type="checkbox" checked={Boolean(checks[check.key])} onChange={event => setReviewConfirmations(current => ({
                ...current, [returnId]: { ...(current[returnId] ?? {}), [check.key]: event.target.checked }
              }))} /> {check.label}
            </label>)}</fieldset>
            <label className="business-field"><span>Review rationale, including any discrepancy</span><textarea required minLength={10} value={reviewReason}
              onChange={event => setReviewReasons(current => ({ ...current, [returnId]: event.target.value }))} /></label>
            <button type="button" className="btn sm" disabled={busy || !allChecksConfirmed || reviewReason.trim().length < 10} onClick={() => submitReview('ACCEPT')}>Accept signed return</button>
            <button type="button" className="btn sm" disabled={busy || reviewReason.trim().length < 10} onClick={() => submitReview('REJECT')}>Reject with reason</button>
          </div>;
        })}
      </div>)}</div>}

      {isPartner && <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault(); void perform('bundle.prepare', { engagementId: engagement.id, reportCandidateId: reportCandidateId || rowText(candidates.find(row => row.status === 'READY'), 'id'),
        managementLetterVersionId: selectedManagementId || rowText(management.find(row => row.status === 'READY'), 'id'), representationRequestId: selectedRepresentationRequestId || rowText(requests.find(row => row.status === 'ACCEPTED'), 'id') }, 'Private five-part bundle candidate queued; no client files are published yet.'); }}>
        <h3>Prepare private five-part deliverable bundle</h3><div className="business-form-grid">
          <label className="business-field"><span>Ready report with explicit consent</span><select required value={reportCandidateId} onChange={event => setReportCandidateId(event.target.value)}><option value="">Choose candidate</option>{candidates.filter(item => item.status === 'READY' && item.consentId).map(item => <option key={String(item.id)} value={String(item.id)}>{rowText(item, 'proposedReportDate')} · {rowText(item, 'contentSha256').slice(0, 12)}</option>)}</select></label>
          <label className="business-field"><span>Ready management letter</span><select required value={selectedManagementId} onChange={event => setSelectedManagementId(event.target.value)}><option value="">Choose reviewed version</option>{management.filter(item => item.status === 'READY').map(item => <option key={String(item.id)} value={String(item.id)}>v{rowText(item, 'revision')} · {rowText(item, 'sourceHash').slice(0, 12)}</option>)}</select></label>
          <label className="business-field"><span>Accepted signed representation</span><select required value={selectedRepresentationRequestId} onChange={event => setSelectedRepresentationRequestId(event.target.value)}><option value="">Choose accepted request</option>{requests.filter(item => item.status === 'ACCEPTED').map(item => <option key={String(item.id)} value={String(item.id)}>{rowText(item, 'proposedReportDate')} · {rowText(item, 'id')}</option>)}</select></label></div>
        <button className="btn sm" disabled={busy || !isPartner}>Prepare five parts</button>
      </form>}
      {bundles.length > 0 && <div className="business-record-list"><h3>Bundle candidates</h3>{bundles.map(bundle => <div className="business-delivery-row" key={String(bundle.id)}><strong>v{rowText(bundle, 'revision')} · {rowText(bundle, 'status')}</strong>
        <span>Content SHA-256 {rowText(bundle, 'contentHash').slice(0, 18)}… · {rows(bundle.parts).length} prepared parts · final fee {formatQarMinor(bundle.finalFeeMinor)}</span>
        {isPartner && bundle.status === 'READY' && <button type="button" className="btn primary" disabled={busy} onClick={() => void perform('report.release', { candidateId: rowText(bundle, 'id'), expectedContentHash: rowText(bundle, 'contentHash'), proposedReportDate: today }, 'Atomic release requested; delivery status will be shown separately from publication.')}>Release exact five-part bundle</button>}
      </div>)}</div>}

      {isPartner && <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault();
        void perform('retention-policy.save', { name: retentionName, retentionYears: retainIndefinitely ? null : Number(retentionYears), retainIndefinitely, legalBasis: retentionLegalBasis }, 'New immutable firm retention policy approved.'); }}>
        <h3>Approve firm retention policy</h3><div className="business-form-grid"><label className="business-field"><span>Policy name</span><input required value={retentionName} onChange={event => setRetentionName(event.target.value)} /></label>
          <label className="business-field"><span>Retention period (years)</span><input type="number" min="1" max="100" disabled={retainIndefinitely} required={!retainIndefinitely} value={retentionYears} onChange={event => setRetentionYears(event.target.value)} /></label>
          <label className="business-field"><span>Retain indefinitely</span><select value={retainIndefinitely ? 'yes' : 'no'} onChange={event => setRetainIndefinitely(event.target.value === 'yes')}><option value="no">No, use a period</option><option value="yes">Yes</option></select></label>
          <label className="business-field"><span>Legal / professional basis</span><textarea required minLength={10} value={retentionLegalBasis} onChange={event => setRetentionLegalBasis(event.target.value)} /></label></div>
        <button className="btn sm" disabled={busy}>Approve retention policy</button>
      </form>}
      {(data?.retentionPolicies ?? []).length > 0 && <div className="business-record-list"><h3>Retention policy history</h3>{data?.retentionPolicies?.map(policy => <p key={String(policy.id)}>v{rowText(policy, 'version')} · {rowText(policy, 'name')} · {policy.retainIndefinitely ? 'Indefinite' : `${rowText(policy, 'retentionYears')} years`} · approved {rowText(policy, 'approvedAt')}</p>)}</div>}

      {data?.engagement.lifecycleState === 'COMPLIANCE_COUNTDOWN' && <div className="business-form business-commercial-form"><h3>Administrative archive assembly</h3>
        {isPartner && !rowText(data.engagement, 'lockedAt') && <button type="button" className="btn sm" disabled={busy} onClick={() => void perform('archive.lock', { engagementId: engagement.id, reason: 'EARLY_PARTNER_LOCK', rationale: 'Partner verified the released bundle and completed administrative archive assembly.' }, 'Engagement locked read-only; archive sealing is queued.')}>Lock and seal archive now</button>}
        {canReview && !rowText(data.engagement, 'lockedAt') && <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault(); void perform('archive.note', { engagementId: engagement.id, text: archiveNote, relatedRecordType: archiveRecordType, relatedRecordId: archiveRecordId }, 'Administrative assembly note appended without changing audit evidence.'); }}>
          <label className="business-field"><span>Assembly note</span><textarea required minLength={10} value={archiveNote} onChange={event => setArchiveNote(event.target.value)} /></label>
          <div className="business-form-grid"><label className="business-field"><span>Related record type</span><select value={archiveRecordType} onChange={event => setArchiveRecordType(event.target.value)}><option value="DELIVERABLE_BUNDLE">Released bundle</option><option value="REPORT_CANDIDATE">Report candidate</option><option value="STATEMENT_SNAPSHOT">Statement snapshot</option><option value="FINDING">Finding</option></select></label>
            <label className="business-field"><span>Related record</span><select required value={archiveRecordId} onChange={event => setArchiveRecordId(event.target.value)}><option value="">Choose retained record</option>
              {(archiveRecordType === 'DELIVERABLE_BUNDLE' ? releasedBundles : archiveRecordType === 'REPORT_CANDIDATE' ? candidates : archiveRecordType === 'FINDING' ? findings : snapshot ? [snapshot] : []).map(item => <option key={String(item.id)} value={String(item.id)}>{rowText(item, 'id')}</option>)}</select></label></div>
          <button className="btn sm" disabled={busy || !archiveRecordId}>Append assembly note</button>
        </form>}
      </div>}
      {data?.archive && <div className="business-record-list"><h3>Archive assembly status</h3><p>{rowText(archiveStatus ?? undefined, 'assemblyStatus', rowText(data.archive, 'status', 'Not started'))} · locked {rowText(archiveStatus ?? undefined, 'lockedAt', rowText(data.engagement, 'lockedAt', 'not yet'))}</p>
        {rowText(data.archive, 'errorCode') && <p className="business-alert" role="alert">{rowText(data.archive, 'errorCode')} · {rowText(data.archive, 'missingFilesJson')}</p>}
        {archiveStatusError && <p className="business-alert" role="alert">{archiveStatusError}</p>}
        {rowText(data.archive, 'archiveSha256') && <><small>Sealed archive SHA-256 {rowText(data.archive, 'archiveSha256')} · manifest SHA-256 {rowText(data.archive, 'manifestSha256')}</small>
          {canReview && <div className="business-practice-actions">
            <button type="button" className="btn sm" disabled={Boolean(downloading)} onClick={() => void downloadArchiveExport('archive')}>{downloading === 'archive-archive' ? 'Verifying archive…' : 'Export verified sealed archive'}</button>
            <button type="button" className="btn sm" disabled={Boolean(downloading)} onClick={() => void downloadArchiveExport('manifest')}>{downloading === 'archive-manifest' ? 'Verifying manifest…' : 'Export verified manifest'}</button>
          </div>}
        </>}
      </div>}
      {releasedBundles.length > 0 && <div className="business-record-list"><h3>Released five-part bundle</h3>{releasedBundles.map(bundle => <div className="business-delivery-row" key={String(bundle.id)}><strong>Release v{rowText(bundle, 'revision')} · {rowText(bundle, 'releasedAt')}</strong><span>Content SHA-256 {rowText(bundle, 'contentHash')} · final invoice {rowText(bundle.invoice as ReportRow | undefined, 'number', 'pending')}</span>
        {rows(bundle.parts).map(part => <button type="button" className="btn sm" key={String(part.id)} disabled={Boolean(downloading)} onClick={() => void download(rowText(part, 'fileId'), rowText(part, 'fileName'), rowText(part, 'sha256'))}>Download {rowText(part, 'kind').replaceAll('_', ' ')}</button>)}
      </div>)}</div>}
      {canReview && releasedBundles.length > 0 && <section className="business-record-list" aria-label="Bundle delivery evidence">
        <h3>Delivery outcomes</h3>
        {bundleDispatches.map(dispatch => <div className="business-delivery-row" key={String(dispatch.id)}><strong>Email {rowText(dispatch, 'status')} · {rowText(dispatch, 'acceptedAt', 'provider acceptance pending')}</strong>
          <span>Dispatch {rowText(dispatch, 'id')} · {rowText(dispatch, 'lastErrorCode', rowText(dispatch, 'providerMessageId', 'No provider outcome recorded'))}</span>
          {isPartner && dispatch.status === 'FAILED' && dispatch.jobStatus === 'PERMANENT_FAILED' && <button type="button" className="btn sm" disabled={busy}
            onClick={() => void perform('bundle.delivery.retry', { bundleId: rowText(dispatch, 'bundleId'), dispatchId: rowText(dispatch, 'id'), expectedDispatchVersion: rowNumber(dispatch, 'version') },
              'A new email attempt was queued with the same released report file and recipient. No invoice or deadline was changed.')}>Retry failed email</button>}
        </div>)}
        {bundleDeliveries.map(delivery => <p key={String(delivery.id)}>{rowText(delivery, 'method').replaceAll('_', ' ')} recorded {rowText(delivery, 'deliveredAt')} · dispatch {rowText(delivery, 'dispatchId', 'not applicable')}</p>)}
        <form className="business-form business-commercial-form" onSubmit={event => { event.preventDefault(); const bundleId = deliveryBundleId || rowText(releasedBundles[0], 'id');
          void perform('bundle.record-delivery', { bundleId, method: deliveryMethod, dispatchId: deliveryMethod === 'EMAIL' ? deliveryDispatchId || null : null,
            evidenceFileId: deliveryEvidenceFileId || null }, 'Operational delivery evidence recorded without changing the released bundle or lifecycle deadline.'); }}>
          <div className="business-form-grid">
            <label className="business-field"><span>Released bundle</span><select required value={deliveryBundleId || rowText(releasedBundles[0], 'id')} onChange={event => setDeliveryBundleId(event.target.value)}>
              {releasedBundles.map(bundle => <option key={String(bundle.id)} value={String(bundle.id)}>v{rowText(bundle, 'revision')} · {rowText(bundle, 'id')}</option>)}</select></label>
            <label className="business-field"><span>Delivery method</span><select value={deliveryMethod} onChange={event => { setDeliveryMethod(event.target.value as typeof deliveryMethod); setDeliveryDispatchId(''); }}>
              <option value="EMAIL">Provider accepted email</option><option value="PORTAL_ACKNOWLEDGEMENT">Portal acknowledgement</option><option value="RECORDED_HANDOVER">Recorded handover</option></select></label>
            {deliveryMethod === 'EMAIL' && <label className="business-field"><span>Accepted bundle email dispatch</span><select required value={deliveryDispatchId} onChange={event => setDeliveryDispatchId(event.target.value)}>
              <option value="">Choose accepted dispatch</option>{bundleDispatches.filter(dispatch => ['ACCEPTED','DELIVERED'].includes(rowText(dispatch, 'status'))).map(dispatch => <option key={String(dispatch.id)} value={String(dispatch.id)}>{rowText(dispatch, 'status')} · {rowText(dispatch, 'providerMessageId', rowText(dispatch, 'id'))}</option>)}</select></label>}
            <label className="business-field"><span>Supporting evidence (optional)</span><select value={deliveryEvidenceFileId} onChange={event => setDeliveryEvidenceFileId(event.target.value)}>
              <option value="">No separate evidence file</option>{deliveryEvidenceFiles.map(file => <option key={file.id} value={file.id}>{file.originalName} · {file.sha256?.slice(0, 12)}</option>)}</select></label>
          </div><button className="btn sm" disabled={busy || releasedBundles.length === 0 || deliveryMethod === 'EMAIL' && !deliveryDispatchId}>Record delivery outcome</button>
        </form>
      </section>}
      {isPartner && releasedBundles.length > 0 && <section className="business-record-list business-report-provenance" aria-labelledby={`report-provenance-${engagement.id}`}>
        <h3 id={`report-provenance-${engagement.id}`}>Released report signature provenance</h3>
        {releasedProvenanceError && <p className="business-alert" role="alert">{releasedProvenanceError}</p>}
        {!releasedProvenance && !releasedProvenanceError && <p role="status">Loading the released signature and source record…</p>}
        {releasedProvenance && <>
          <p>Report {rowText(provenanceEngagement, 'code')} for {rowText(provenanceEngagement, 'clientName')} · {rowText(provenanceEngagement, 'periodStart')}–{rowText(provenanceEngagement, 'periodEnd')} · report date {rowText(provenanceEngagement, 'reportDate')} · signed {rowText(provenanceSignature, 'signedAt')}.</p>
          <p>Signature method: {rowText(provenanceSignature, 'signingMethod')} · attribution: {rowText(provenanceSignature, 'attribution')}. This records a self-asserted persona action and is not certificate-backed or verified identity.</p>
          <dl><div><dt>Consent actor</dt><dd>{rowText(provenanceConsent, 'actorDisplayName', 'Historical actor display name unavailable')} · {rowText(provenanceConsent, 'actorStaffMemberId', 'staff snapshot unavailable')}</dd></div>
            <div><dt>Consented candidate SHA-256</dt><dd>{rowText(provenanceConsent, 'candidateContentSha256')}</dd></div>
            <div><dt>Signature owner</dt><dd>{rowText(provenanceOwner, 'displayName')} · {rowText(provenanceOwner, 'grade')} · {rowText(provenanceAsset, 'label')} ({rowText(provenanceAsset, 'status')})</dd></div>
            <div><dt>Signature source</dt><dd>{rowText(provenanceSignatureAsset, 'fileId')} · SHA-256 {rowText(provenanceSignatureAsset, 'sha256')} · {rowText(provenanceSignatureAsset, 'width')}×{rowText(provenanceSignatureAsset, 'height')}</dd></div>
            <div><dt>Seal source</dt><dd>{rowText(provenanceSealAsset, 'fileId')} · SHA-256 {rowText(provenanceSealAsset, 'sha256')} · {rowText(provenanceSealAsset, 'width')}×{rowText(provenanceSealAsset, 'height')}</dd></div>
            <div><dt>Final report</dt><dd>{rowText(provenanceSignature, 'fileName')} · SHA-256 {rowText(provenanceSignature, 'finalFileSha256')}</dd></div></dl>
          <h4>Pinned source hashes</h4><ul>{Object.entries(provenanceHashes ?? {}).map(([name, value]) => <li key={name}><strong>{name.replaceAll(/([A-Z])/g, ' $1')}</strong>: {String(value)}</li>)}</ul>
        </>}
      </section>}
    </>}
  </section>;
}
