import type { Env } from './env';
import { sha256Hex } from './http';
import { ProposalDocumentError, renderProposalPdf, type ProposalDocumentInput } from './proposalDocument';
import { CommercialDocumentError, renderCommercialPdf, type CommercialDocumentInput } from './commercialDocument';
import { getBusinessAcceptanceGate } from './businessRisk';
import { prepareTrialBalanceImport } from './businessTb';
import { prepareBusinessInvoiceJournal } from './businessPractice';
import { processBusinessReportingDocument } from './businessReportingJobs';
import { ApiError } from './errors';

type JobKind = 'GENERATE_DOCUMENT' | 'SEAL_ARCHIVE' | 'EMAIL' | 'IMPORT_TB';
interface OutboxJob {
  id: string;
  workspace_id: string;
  version: number;
  kind: JobKind;
  aggregate_id: string;
  aggregate_version: number;
  payload_json: string;
  deduplication_key: string;
  status: string;
  attempts: number;
  lease_until: string | null;
  last_error_code: string | null;
  result_file_id: string | null;
}
interface JobPayload {
  commandId: string;
  proposalVersionId: string;
  proposalId?: string;
  engagementId: string;
  clientId: string;
  dispatchId?: string;
  fileVersionId?: string;
  attachmentFileVersionIds?: string[];
  recipient?: { contactRouteId: string; contactRouteVersion: number; name: string; email: string };
}
interface ProposalSnapshot {
  proposal_id: string;
  proposal_version_id: string;
  revision: number;
  mode: 'QUOTE' | 'FULL_PROPOSAL';
  scope: string;
  fee_minor: number;
  valid_until: string;
  timeline_json: string;
  firm_profile_snapshot_json: string;
  team_cv_file_ids_json: string;
  created_at: string;
  client_id: string;
  engagement_id: string;
  legal_name: string;
  trading_name: string | null;
  commercial_registration: string | null;
  engagement_code: string;
  period_start: string;
  period_end: string;
  engagement_type: string;
  lifecycle_state: string;
  current_version_id: string | null;
  client_active: number;
}
interface ExactFile {
  id: string;
  original_name: string;
  media_type: string;
  size_bytes: number;
  sha256: string;
  object_key: string;
  state: string;
  immutable: number;
  purpose: string;
}

class OutboxError extends Error {
  constructor(readonly code: string, message: string, readonly disposition: 'RETRY' | 'FAIL' | 'UNKNOWN' = 'FAIL') {
    super(message);
    this.name = 'OutboxError';
  }
}

const nowIso = () => new Date().toISOString();
const nowSeconds = () => Math.floor(Date.now() / 1000);
const MAX_JOB_ATTEMPTS = 5;
const JOB_LEASE_MS = 10 * 60 * 1000;

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function parsePayload(job: OutboxJob): JobPayload {
  try {
    const payload = JSON.parse(job.payload_json) as Partial<JobPayload>;
    if (!payload || typeof payload !== 'object'
      || typeof payload.commandId !== 'string' || typeof payload.proposalVersionId !== 'string'
      || typeof payload.engagementId !== 'string' || typeof payload.clientId !== 'string') throw new Error('shape');
    return payload as JobPayload;
  } catch {
    throw new OutboxError('INVALID_JOB_PAYLOAD', 'The stored job payload is invalid and needs administrator review.');
  }
}

function parseRawPayload(job: OutboxJob): Record<string, any> {
  try {
    const payload = JSON.parse(job.payload_json) as Record<string, unknown>;
    if (job.kind === 'GENERATE_DOCUMENT' && payload?.documentType === 'PRACTICE_REPORT') {
      if (typeof payload.reportSnapshotId !== 'string' || payload.reportSnapshotId !== job.aggregate_id
        || !['TRIAL_BALANCE','MONTHLY_PROFIT_LOSS'].includes(String(payload.kind))
        || !['CSV','XLSX','PDF'].includes(String(payload.format))
        || typeof payload.periodStart !== 'string' || typeof payload.periodEnd !== 'string'
        || typeof payload.asOf !== 'string' || typeof payload.generatedByActorId !== 'string'
        || typeof payload.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(payload.sourceHash)
        || typeof payload.rowsJson !== 'string') throw new Error('practice report shape');
      const snapshot = JSON.parse(payload.rowsJson) as Record<string, unknown>;
      if (!snapshot || typeof snapshot !== 'object' || snapshot.sourceHash !== payload.sourceHash
        || snapshot.kind !== payload.kind || snapshot.periodStart !== payload.periodStart
        || snapshot.periodEnd !== payload.periodEnd) throw new Error('practice report snapshot');
      return payload;
    }
    if (!payload || typeof payload !== 'object' || typeof payload.commandId !== 'string'
      || typeof payload.engagementId !== 'string' || typeof payload.clientId !== 'string') throw new Error('shape');
    return payload as Record<string, any>;
  } catch {
    throw new OutboxError('INVALID_JOB_PAYLOAD', 'The stored job payload is invalid and needs administrator review.');
  }
}

async function claimJob(env: Env, id: string, now: string): Promise<OutboxJob | null> {
  return env.DB.prepare(`UPDATE outbox_jobs SET status='RUNNING',attempts=attempts+1,lease_until=?,updated_at=?,version=version+1
    WHERE id=? AND kind IN ('GENERATE_DOCUMENT','SEAL_ARCHIVE','EMAIL','IMPORT_TB') AND (
      (status IN ('PENDING','RETRYABLE_FAILED') AND next_attempt_at<=?)
      OR (status='RUNNING' AND kind IN ('GENERATE_DOCUMENT','SEAL_ARCHIVE','IMPORT_TB') AND lease_until IS NOT NULL AND lease_until<=?)
    ) RETURNING id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,lease_until,last_error_code,result_file_id`)
    .bind(new Date(Date.parse(now) + JOB_LEASE_MS).toISOString(), now, id, now, now).first<OutboxJob>();
}

async function exactFile(env: Env, workspaceId: string, fileId: string): Promise<{ metadata: ExactFile; bytes: Uint8Array }> {
  const metadata = await env.DB.prepare(`SELECT id,original_name,media_type,size_bytes,sha256,object_key,state,immutable,purpose
    FROM file_versions WHERE workspace_id=? AND id=?`).bind(workspaceId, fileId).first<ExactFile>();
  if (!metadata || metadata.state !== 'COMMITTED' || metadata.immutable !== 1 || !metadata.sha256) {
    throw new OutboxError('COMMITTED_FILE_REQUIRED', 'A required attachment is missing or is not a committed immutable file version.');
  }
  const object = await env.FILES.get(metadata.object_key);
  if (!object) throw new OutboxError('FILE_OBJECT_MISSING', `Stored bytes for ${metadata.original_name} are missing.`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== metadata.size_bytes || await sha256HexBytes(bytes) !== metadata.sha256) {
    throw new OutboxError('FILE_INTEGRITY_MISMATCH', `Stored bytes for ${metadata.original_name} do not match their committed size and digest.`);
  }
  return { metadata, bytes };
}

function parseStringArray(json: string): string[] {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new OutboxError('INVALID_PROPOSAL_SNAPSHOT', 'The proposal attachment snapshot is invalid.'); }
  if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== 'string')
    || new Set(value).size !== value.length) {
    throw new OutboxError('INVALID_PROPOSAL_SNAPSHOT', 'The proposal attachment snapshot is invalid.');
  }
  return value;
}

async function buildProposalDocument(env: Env, workspaceId: string, payload: JobPayload): Promise<{ input: ProposalDocumentInput; attachmentIds: string[] }> {
  const row = await env.DB.prepare(`SELECT pv.proposal_id,pv.id AS proposal_version_id,pv.revision,pv.mode,pv.scope,pv.fee_minor,pv.valid_until,
      pv.timeline_json,pv.firm_profile_snapshot_json,pv.team_cv_file_ids_json,pv.created_at,
      e.client_id,e.id AS engagement_id,e.code AS engagement_code,e.period_start,e.period_end,e.engagement_type,e.lifecycle_state,
      p.current_version_id,c.legal_name,c.trading_name,c.commercial_registration,c.active AS client_active
    FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
    JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.client_id=pv.client_id AND e.id=pv.engagement_id
    JOIN clients c ON c.workspace_id=pv.workspace_id AND c.id=pv.client_id
    WHERE pv.workspace_id=? AND pv.id=?`).bind(workspaceId, payload.proposalVersionId).first<ProposalSnapshot>();
  if (!row || row.current_version_id !== row.proposal_version_id || row.lifecycle_state !== 'PROPOSAL_GENERATION' || row.client_active !== 1) {
    throw new OutboxError('STALE_PROPOSAL_REVISION', 'Only the current proposal revision for an active engagement in proposal generation can be rendered.');
  }
  if (row.proposal_id !== payload.proposalId || row.engagement_id !== payload.engagementId || row.client_id !== payload.clientId) {
    throw new OutboxError('JOB_SCOPE_MISMATCH', 'The proposal job no longer matches its stored engagement and client scope.');
  }

  let firm: ProposalDocumentInput['firm'];
  let timeline: ProposalDocumentInput['timeline'];
  try {
    const firmSnapshot = JSON.parse(row.firm_profile_snapshot_json) as Record<string, unknown>;
    if (typeof firmSnapshot.legalName !== 'string' || typeof firmSnapshot.registrationNumber !== 'string'
      || typeof firmSnapshot.address !== 'string' || typeof firmSnapshot.profileText !== 'string'
      || typeof firmSnapshot.methodologyText !== 'string') throw new Error('firm');
    const parsedTimeline = JSON.parse(row.timeline_json) as unknown;
    if (!Array.isArray(parsedTimeline) || parsedTimeline.some(item => !item || typeof item.name !== 'string' || typeof item.date !== 'string')) throw new Error('timeline');
    firm = {
      legalName: firmSnapshot.legalName, registrationNumber: firmSnapshot.registrationNumber,
      address: firmSnapshot.address, profileText: firmSnapshot.profileText, methodologyText: firmSnapshot.methodologyText
    };
    timeline = parsedTimeline as ProposalDocumentInput['timeline'];
  } catch {
    throw new OutboxError('INVALID_PROPOSAL_SNAPSHOT', 'The proposal firm, methodology, or timeline snapshot could not be verified.');
  }

  const attachmentIds = parseStringArray(row.team_cv_file_ids_json);
  const team: ProposalDocumentInput['team'] = [];
  if (row.mode === 'FULL_PROPOSAL') {
    if (!attachmentIds.length) throw new OutboxError('APPROVED_PARTNER_CV_REQUIRED', 'A full proposal requires the approved Partner CV that was pinned to this revision.');
    const placeholders = attachmentIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`SELECT cv.file_version_id,cv.approved,sm.display_name,sm.grade,sm.active AS staff_active,
        f.original_name,f.sha256,f.state,f.immutable,f.purpose,f.size_bytes,f.media_type,f.object_key
      FROM team_cv_documents cv JOIN staff_members sm ON sm.workspace_id=cv.workspace_id AND sm.id=cv.staff_member_id
      JOIN file_versions f ON f.workspace_id=cv.workspace_id AND f.id=cv.file_version_id
      WHERE cv.workspace_id=? AND cv.file_version_id IN (${placeholders})`).bind(workspaceId, ...attachmentIds).all<Record<string, unknown>>();
    const byId = new Map((rows.results ?? []).map(item => [String(item.file_version_id), item]));
    for (const fileId of attachmentIds) {
      const cv = byId.get(fileId);
      if (!cv || cv.approved !== 1 || cv.staff_active !== 1 || cv.state !== 'COMMITTED' || cv.immutable !== 1 || cv.purpose !== 'TEMPLATE') {
        throw new OutboxError('APPROVED_CV_REQUIRED', 'A CV pinned to this revision is no longer approved, active, committed, or immutable.');
      }
      const { metadata } = await exactFile(env, workspaceId, fileId);
      if (metadata.sha256 !== cv.sha256) throw new OutboxError('FILE_INTEGRITY_MISMATCH', 'A pinned CV digest changed after approval.');
      team.push({ displayName: String(cv.display_name), grade: String(cv.grade), originalName: metadata.original_name, sha256: metadata.sha256 });
    }
    if (!team.some(member => member.grade === 'PARTNER')) {
      throw new OutboxError('APPROVED_PARTNER_CV_REQUIRED', 'The full proposal needs a committed approved CV for the assigned Partner.');
    }
  } else if (attachmentIds.length) {
    // A quote does not expose or transmit staff CV material.
  }

  const input: ProposalDocumentInput = {
    id: row.proposal_id, revision: row.revision, createdAt: row.created_at, mode: row.mode, scope: row.scope, feeMinor: row.fee_minor,
    validUntil: row.valid_until, timeline,
    client: { legalName: row.legal_name, tradingName: row.trading_name, registrationNumber: row.commercial_registration },
    engagement: { code: row.engagement_code, periodStart: row.period_start, periodEnd: row.period_end, type: row.engagement_type },
    firm, team
  };
  return { input, attachmentIds };
}

async function renderAndStoreProposal(env: Env, job: OutboxJob): Promise<void> {
  const payload = parsePayload(job);
  const { input } = await buildProposalDocument(env, job.workspace_id, payload);
  let font: Uint8Array | undefined;
  if (/\p{Script=Arabic}/u.test(JSON.stringify(input))) {
    const fontResponse = await env.ASSETS.fetch(new Request('https://auditsphere-assets.local/fonts/NotoSansArabic-Variable.ttf'));
    if (!fontResponse.ok) throw new OutboxError('ARABIC_FONT_UNAVAILABLE', 'Restore the bundled Noto Sans Arabic font asset before generating Arabic documents.');
    font = new Uint8Array(await fontResponse.arrayBuffer());
  }
  const bytes = renderProposalPdf(input, font);
  const digest = await sha256HexBytes(bytes);
  const fileVersionId = crypto.randomUUID();
  const artifactId = crypto.randomUUID();
  const proposalArtifactId = crypto.randomUUID();
  const generatedAt = nowIso();
  const key = `workspaces/${job.workspace_id}/generated/proposals/${payload.proposalVersionId}/${digest}.pdf`;
  try {
    await env.FILES.put(key, bytes, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { sha256: digest, proposalVersionId: payload.proposalVersionId, generatedByJobId: job.id }
    });
  } catch {
    throw new OutboxError('OBJECT_STORE_WRITE_FAILED', 'The generated PDF could not be stored. The job will retry without claiming an artifact.', 'RETRY');
  }
  const stored = await env.FILES.get(key);
  if (!stored) throw new OutboxError('GENERATED_OBJECT_MISSING', 'The generated PDF could not be read back from object storage.', 'RETRY');
  const storedBytes = new Uint8Array(await stored.arrayBuffer());
  if (storedBytes.byteLength !== bytes.byteLength || await sha256HexBytes(storedBytes) !== digest) {
    throw new OutboxError('GENERATED_OBJECT_INTEGRITY_MISMATCH', 'The generated PDF did not match its stored size and digest.');
  }
  const details = {
    jobId: job.id, proposalVersionId: payload.proposalVersionId, fileVersionId,
    artifactId, contentSha256: digest, sizeBytes: bytes.byteLength, mode: input.mode, revision: input.revision
  };
  const result = { fileVersionId, artifactId, contentSha256: digest, sizeBytes: bytes.byteLength, mediaType: 'application/pdf' };
  await commitJobMutation(env, job, {
    entityType: 'PROPOSAL_VERSION', entityId: payload.proposalVersionId,
    clientId: payload.clientId, engagementId: payload.engagementId, details,
    statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,990,CASE WHEN EXISTS(SELECT 1 FROM proposals p JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.id=p.current_version_id
          JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.client_id=pv.client_id AND e.id=pv.engagement_id
          WHERE p.workspace_id=? AND pv.id=? AND pv.version=1 AND e.lifecycle_state='PROPOSAL_GENERATION') THEN 1 ELSE 0 END`)
        .bind(job.workspace_id, job.workspace_id, payload.proposalVersionId),
      env.DB.prepare(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
        VALUES(?,?,1,?,?,'Proposal-r${input.revision}.pdf','application/pdf',?,?,?,'GENERATED','COMMITTED',?,1,?,?,NULL,NULL)`)
        .bind(fileVersionId, job.workspace_id, payload.clientId, payload.engagementId, bytes.byteLength, digest, key, generatedAt, generatedAt, generatedAt),
      env.DB.prepare(`UPDATE outbox_jobs SET status='SUCCEEDED',result_file_id=?,result_json=?,last_error_code=NULL,completed_at=?,lease_until=NULL,updated_at=?,version=version+1
        WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(fileVersionId, JSON.stringify(result), generatedAt, generatedAt, job.workspace_id, job.id, job.lease_until),
      env.DB.prepare(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(artifactId, job.workspace_id, payload.clientId, payload.engagementId, input.mode, 'PROPOSAL_VERSION', payload.proposalVersionId,
          input.revision, fileVersionId, digest, bytes.byteLength, generatedAt, job.id),
      env.DB.prepare(`INSERT INTO proposal_artifacts(id,workspace_id,client_id,engagement_id,proposal_version_id,artifact_id,created_at)
        VALUES(?,?,?,?,?,?,?)`)
        .bind(proposalArtifactId, job.workspace_id, payload.clientId, payload.engagementId, payload.proposalVersionId, artifactId, generatedAt)
    ], result
  });
}

const qatarDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function formatQarMinor(value: unknown): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new OutboxError('INVALID_CONFIRMATION_BALANCE', 'The confirmation balance is outside the supported exact QAR range.');
  }
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `QAR ${amount < 0n ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

async function commercialInput(env: Env, job: OutboxJob, payload: Record<string, any>): Promise<CommercialDocumentInput> {
  if (payload.documentType === 'ENGAGEMENT_LETTER') {
    const draft = await env.DB.prepare(`SELECT d.id,d.revision,d.client_id,d.engagement_id,d.proposal_version_id,d.commercial_acceptance_id,d.risk_clearance_id,
        d.template_version_id,d.signature_file_version_id,d.signature_consent_id,d.seal_file_version_id,d.seal_approval_id,d.dependency_hash,d.status,d.created_by_actor_id,
        pv.fee_minor,e.version AS engagement_version,e.lifecycle_state,e.code AS engagement_code,e.period_start,e.period_end,e.engagement_type,
        c.legal_name AS client_name,fp.legal_name AS firm_name,t.clauses,t.revision AS template_revision,
        t.content_sha256 AS template_sha256,sm.display_name AS partner_name,signfile.sha256 AS signature_sha256,sealf.sha256 AS seal_sha256,
        ca.decision AS consent_decision,sa.decision AS seal_decision
      FROM engagement_letter_drafts d JOIN proposal_versions pv ON pv.workspace_id=d.workspace_id AND pv.id=d.proposal_version_id
      JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
      JOIN engagements e ON e.workspace_id=d.workspace_id AND e.client_id=d.client_id AND e.id=d.engagement_id
      JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id AND c.active=1
      JOIN firm_profiles fp ON fp.workspace_id=e.workspace_id
      JOIN document_template_versions t ON t.workspace_id=d.workspace_id AND t.id=d.template_version_id
      JOIN file_versions signfile ON signfile.workspace_id=d.workspace_id AND signfile.id=d.signature_file_version_id
      JOIN signature_asset_decisions ca ON ca.workspace_id=d.workspace_id AND ca.id=d.signature_consent_id
      JOIN file_versions sealf ON sealf.workspace_id=d.workspace_id AND sealf.id=d.seal_file_version_id
      JOIN seal_asset_approvals sa ON sa.workspace_id=d.workspace_id AND sa.id=d.seal_approval_id
      JOIN actor_profiles ap ON ap.workspace_id=ca.workspace_id AND ap.id=ca.partner_actor_id
      JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
      WHERE d.workspace_id=? AND d.id=? AND d.status IN ('PENDING','RUNNING','RETRYABLE_FAILED') AND p.current_version_id=d.proposal_version_id`)
      .bind(job.workspace_id, payload.draftId).first<Record<string, any>>();
    if (!draft || draft.id !== payload.draftId || draft.engagement_id !== payload.engagementId || draft.client_id !== payload.clientId
      || draft.lifecycle_state !== 'ADVANCE_BILLING' || draft.consent_decision !== 'CONSENT' || draft.seal_decision !== 'APPROVE') {
      throw new OutboxError('STALE_APPROVAL', 'The letter source, lifecycle or approved image assets changed before render.');
    }
    const gateContext = { actor: { id: draft.created_by_actor_id, persona: 'APPROVER' as const, displayName: '', staffGrade: 'PARTNER' as const, clientId: null },
      scope: { clientId: draft.client_id, engagementId: draft.engagement_id }, allowedActions: ['commercialAcceptance.read'], readOnlyReasons: [] };
    const gate = await getBusinessAcceptanceGate(env, job.workspace_id, gateContext, draft.engagement_id) as any;
    if (!gate.ready || gate.commercialKey.acceptanceId !== draft.commercial_acceptance_id
      || gate.commercialKey.proposalVersionId !== draft.proposal_version_id || gate.riskKey.clearanceId !== draft.risk_clearance_id) {
      throw new OutboxError('STALE_APPROVAL', 'A current commercial or Partner risk key no longer matches this letter revision.');
    }
    const baseDependencyHash = await sha256Hex(JSON.stringify({ engagementId: draft.engagement_id, engagementVersion: draft.engagement_version,
      proposalVersionId: draft.proposal_version_id, acceptanceId: draft.commercial_acceptance_id, clearanceId: draft.risk_clearance_id }));
    const [currentConsent, currentSealApproval] = await Promise.all([
      env.DB.prepare(`SELECT id,decision FROM signature_asset_decisions WHERE workspace_id=? AND file_version_id=? ORDER BY sequence DESC LIMIT 1`)
        .bind(job.workspace_id, draft.signature_file_version_id).first<{ id: string; decision: string }>(),
      env.DB.prepare(`SELECT id,decision FROM seal_asset_approvals WHERE workspace_id=? AND file_version_id=? ORDER BY sequence DESC LIMIT 1`)
        .bind(job.workspace_id, draft.seal_file_version_id).first<{ id: string; decision: string }>()
    ]);
    if (!currentConsent || currentConsent.id !== draft.signature_consent_id || currentConsent.decision !== 'CONSENT'
      || !currentSealApproval || currentSealApproval.id !== draft.seal_approval_id || currentSealApproval.decision !== 'APPROVE') {
      throw new OutboxError('STALE_APPROVAL', 'The Partner signature consent or firm seal approval changed before render.');
    }
    const dependencyHash = await sha256Hex(JSON.stringify({ base: baseDependencyHash, templateVersionId: draft.template_version_id,
      templateHash: draft.template_sha256, signatureFileVersionId: draft.signature_file_version_id, signatureSha256: draft.signature_sha256,
      signatureConsentId: currentConsent.id, sealFileVersionId: draft.seal_file_version_id, sealSha256: draft.seal_sha256,
      sealApprovalId: currentSealApproval.id }));
    if (dependencyHash !== draft.dependency_hash) throw new OutboxError('STALE_APPROVAL', 'The engagement, proposal, keys or exact image asset changed after this letter draft began.');
    const currentTemplate = await env.DB.prepare(`SELECT MAX(revision) AS revision FROM document_template_versions WHERE workspace_id=? AND service_type=?`)
      .bind(job.workspace_id, draft.engagement_type).first<{ revision: number | null }>();
    if (draft.template_revision !== currentTemplate?.revision) throw new OutboxError('STALE_TEMPLATE', 'The approved service template changed before render.');
    const [signature, seal] = await Promise.all([
      exactFile(env, job.workspace_id, draft.signature_file_version_id), exactFile(env, job.workspace_id, draft.seal_file_version_id)
    ]);
    if (signature.metadata.purpose !== 'SIGNATURE' || signature.metadata.media_type !== 'image/png'
      || seal.metadata.purpose !== 'SEAL' || seal.metadata.media_type !== 'image/png'
      || signature.metadata.sha256 !== draft.signature_sha256 || seal.metadata.sha256 !== draft.seal_sha256) {
      throw new OutboxError('ENGAGEMENT_ASSET_INVALID', 'A pinned PNG signature or firm seal no longer matches its committed file digest.');
    }
    return {
      kind: 'ENGAGEMENT_LETTER', number: `EL-${draft.engagement_code}-R${draft.revision}`, createdAt: nowIso(),
      firmName: draft.firm_name, clientName: draft.client_name, engagementCode: draft.engagement_code, serviceType: draft.engagement_type,
      periodStart: draft.period_start, periodEnd: draft.period_end, feeMinor: Number(draft.fee_minor), clauses: draft.clauses,
      signature: { bytes: signature.bytes, partnerName: draft.partner_name }, sealBytes: seal.bytes
    };
  }
  if (payload.documentType === 'ADVANCE_INVOICE') {
    const invoice = await env.DB.prepare(`SELECT i.id,i.client_id,i.engagement_id,i.number,i.subtotal_minor,i.tax_minor,i.total_minor,i.due_date,i.status,
        e.code AS engagement_code,e.period_start,e.period_end,e.engagement_type,c.legal_name AS client_name,fp.legal_name AS firm_name,tp.name AS tax_policy_name
      FROM invoices i JOIN engagements e ON e.workspace_id=i.workspace_id AND e.client_id=i.client_id AND e.id=i.engagement_id
      JOIN clients c ON c.workspace_id=i.workspace_id AND c.id=i.client_id JOIN firm_profiles fp ON fp.workspace_id=i.workspace_id
      JOIN billing_tax_policy_versions tp ON tp.workspace_id=i.workspace_id AND tp.id=i.tax_policy_version_id
      WHERE i.workspace_id=? AND i.id=? AND i.status='PENDING_DOCUMENT'`)
      .bind(job.workspace_id, payload.invoiceId).first<Record<string, any>>();
    if (!invoice || invoice.id !== payload.invoiceId || invoice.engagement_id !== payload.engagementId || invoice.client_id !== payload.clientId
      || !Number.isSafeInteger(invoice.total_minor)) throw new OutboxError('STALE_INVOICE', 'The invoice snapshot could not be verified.');
    return { kind: 'INVOICE', number: invoice.number, createdAt: nowIso(), firmName: invoice.firm_name, clientName: invoice.client_name,
      engagementCode: invoice.engagement_code, serviceType: invoice.engagement_type, periodStart: invoice.period_start, periodEnd: invoice.period_end,
      feeMinor: invoice.total_minor, subtotalMinor: invoice.subtotal_minor, taxMinor: invoice.tax_minor, taxPolicyName: invoice.tax_policy_name, dueDate: invoice.due_date };
  }
  if (payload.documentType === 'RECEIPT') {
    const receipt = await env.DB.prepare(`SELECT rv.id,rv.number,rv.status,p.id AS payment_id,p.client_id,p.engagement_id,p.amount_minor,p.received_on,p.reference,p.reverses_payment_id,
        e.code AS engagement_code,e.period_start,e.period_end,e.engagement_type,c.legal_name AS client_name,fp.legal_name AS firm_name
      FROM receipt_vouchers rv JOIN payments p ON p.workspace_id=rv.workspace_id AND p.id=rv.payment_id
      JOIN engagements e ON e.workspace_id=p.workspace_id AND e.client_id=p.client_id AND e.id=p.engagement_id
      JOIN clients c ON c.workspace_id=p.workspace_id AND c.id=p.client_id JOIN firm_profiles fp ON fp.workspace_id=p.workspace_id
      WHERE rv.workspace_id=? AND rv.id=? AND rv.status='PENDING' AND p.id=?`)
      .bind(job.workspace_id, payload.receiptId, payload.paymentId).first<Record<string, any>>();
    if (!receipt || receipt.engagement_id !== payload.engagementId || receipt.client_id !== payload.clientId) throw new OutboxError('STALE_RECEIPT', 'The receipt voucher is no longer pending or does not match the payment.');
    const allocated = await env.DB.prepare(`SELECT COALESCE(SUM(amount_minor),0) AS amount FROM payment_allocations WHERE workspace_id=? AND payment_id=?`)
      .bind(job.workspace_id, payload.paymentId).first<{ amount: number }>();
    return { kind: 'RECEIPT', number: receipt.number, createdAt: nowIso(), firmName: receipt.firm_name, clientName: receipt.client_name,
      engagementCode: receipt.engagement_code, serviceType: receipt.engagement_type, periodStart: receipt.period_start, periodEnd: receipt.period_end,
      feeMinor: Number(receipt.amount_minor), paymentReference: receipt.reference, receivedOn: receipt.received_on, allocatedMinor: Number(allocated?.amount ?? 0),
      isReversal: Boolean(receipt.reverses_payment_id) };
  }
  if (payload.documentType === 'CONFIRMATION_REQUEST') {
    const confirmation = await env.DB.prepare(`SELECT c.id,c.version,c.type,c.external_party_name,c.external_party_address,c.external_party_email,c.recipient_verification_text,c.balance_minor,
        c.due_date,c.source_hash,c.status,c.client_id,c.engagement_id,e.code AS engagement_code,e.period_start,e.period_end,e.engagement_type,
        cl.legal_name AS client_name,fp.legal_name AS firm_name
      FROM confirmations c JOIN engagements e ON e.workspace_id=c.workspace_id AND e.client_id=c.client_id AND e.id=c.engagement_id
      JOIN clients cl ON cl.workspace_id=c.workspace_id AND cl.id=c.client_id JOIN firm_profiles fp ON fp.workspace_id=c.workspace_id
      WHERE c.workspace_id=? AND c.id=? AND c.status='QUEUED' AND c.version=? AND c.source_hash=?`)
      .bind(job.workspace_id,payload.confirmationId,job.aggregate_version,payload.sourceHash).first<Record<string,any>>();
    if(!confirmation||confirmation.engagement_id!==payload.engagementId||confirmation.client_id!==payload.clientId||!confirmation.external_party_email){
      throw new OutboxError('STALE_CONFIRMATION','The exact queued confirmation scope changed before its request could be rendered.');
    }
    const recipient=payload.recipient as {name?:unknown;email?:unknown}|undefined;
    if(!recipient||recipient.name!==confirmation.external_party_name||recipient.email!==confirmation.external_party_email)throw new OutboxError('INVALID_RECIPIENT_SNAPSHOT','The confirmation email recipient does not match its retained independent source.');
    const balance=confirmation.balance_minor==null?'Not specified':formatQarMinor(confirmation.balance_minor);
    const noticeText=[`Confirmation type: ${confirmation.type}.`,`Balance at the confirmation date: ${balance}.`,`Response due date: ${confirmation.due_date}.`,
      `Recipient address was verified from: ${confirmation.recipient_verification_text}.`,`External party address: ${confirmation.external_party_address}.`].join('\n');
    return {kind:'CONFIRMATION_REQUEST',number:`CONF-${confirmation.engagement_code}-${String(confirmation.id).slice(0,8).toUpperCase()}`,createdAt:nowIso(),
      firmName:confirmation.firm_name,clientName:confirmation.client_name,engagementCode:confirmation.engagement_code,serviceType:confirmation.engagement_type,
      periodStart:confirmation.period_start,periodEnd:confirmation.period_end,feeMinor:0,noticeText};
  }
  if (payload.documentType === 'HOLDING_LETTER') {
    const engagement=await env.DB.prepare(`SELECT e.id,e.version,e.client_id,e.lifecycle_state,e.active_tb_version_id,e.active_mapping_version_id,e.active_materiality_version_id,
        e.code AS engagement_code,e.period_start,e.period_end,e.engagement_type,cl.legal_name AS client_name,fp.legal_name AS firm_name
      FROM engagements e JOIN clients cl ON cl.workspace_id=e.workspace_id AND cl.id=e.client_id JOIN firm_profiles fp ON fp.workspace_id=e.workspace_id
      WHERE e.workspace_id=? AND e.id=?`).bind(job.workspace_id,payload.engagementId).first<Record<string,any>>();
    if(!engagement||engagement.client_id!==payload.clientId)throw new OutboxError('JOB_SCOPE_MISMATCH','The holding letter no longer matches its engagement scope.');
    const rows=await env.DB.prepare(`SELECT id,version,type,status,due_date AS dueDate,source_hash AS sourceHash,tb_version_id AS tbVersionId,mapping_version_id AS mappingVersionId,
        materiality_version_id AS materialityVersionId,external_party_name AS externalPartyName
      FROM confirmations WHERE workspace_id=? AND engagement_id=? AND critical=1 AND status<>'CANCELLED' ORDER BY id`).bind(job.workspace_id,engagement.id).all<Record<string,unknown>>();
    const current=(rows.results??[]).filter(row=>row.status!=='RETURNED_VERIFIED'||row.tbVersionId!==engagement.active_tb_version_id||row.mappingVersionId!==engagement.active_mapping_version_id
      ||row.materialityVersionId!==engagement.active_materiality_version_id).map(row=>({id:String(row.id),version:Number(row.version),type:String(row.type),status:String(row.status),dueDate:String(row.dueDate),
        sourceHash:String(row.sourceHash),externalPartyName:String(row.externalPartyName),stalePins:row.tbVersionId!==engagement.active_tb_version_id
          ||row.mappingVersionId!==engagement.active_mapping_version_id||row.materialityVersionId!==engagement.active_materiality_version_id}));
    const currentHash=await sha256Hex(JSON.stringify(current));
    if(!current.length||currentHash!==payload.outstandingSetHash)throw new OutboxError('STALE_HOLDING_LETTER','The outstanding critical confirmation set changed before the holding letter was rendered.');
    const recipient=payload.recipient as {contactRouteId?:unknown;contactRouteVersion?:unknown;contactId?:unknown;name?:unknown;email?:unknown}|undefined;
    const route=recipient&&typeof recipient.contactRouteId==='string'?await env.DB.prepare(`SELECT cr.id,cr.version,ct.id AS contact_id,ct.full_name,ct.email
        FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
        WHERE cr.workspace_id=? AND cr.id=? AND cr.version=? AND cr.client_id=? AND cr.purpose='HOLDING_LETTER' AND cr.is_primary=1
          AND ct.active=1 AND ct.email IS NOT NULL AND ct.role IN ('MD_GM','CFO_FINANCE_DIRECTOR')`)
        .bind(job.workspace_id,recipient.contactRouteId,recipient.contactRouteVersion,engagement.client_id).first<{id:string;version:number;contact_id:string;full_name:string;email:string}>():null;
    if(!route||recipient?.contactId!==route.contact_id||recipient?.name!==route.full_name||recipient?.email!==route.email)throw new OutboxError('STALE_HOLDING_LETTER_ROUTE','An active primary management email route is required for this holding letter.');
    const noticeText=current.map((item,index)=>`${index+1}. ${item.type} — ${item.externalPartyName} — ${item.status.replaceAll('_',' ')} — due ${item.dueDate}${item.stalePins?' — source pins stale':''}`).join('\n');
    return {kind:'HOLDING_LETTER',number:`HOLD-${engagement.engagement_code}-${String(payload.outstandingSetHash).slice(0,10).toUpperCase()}`,createdAt:nowIso(),
      firmName:engagement.firm_name,clientName:engagement.client_name,engagementCode:engagement.engagement_code,serviceType:engagement.engagement_type,
      periodStart:engagement.period_start,periodEnd:engagement.period_end,feeMinor:0,noticeText};
  }
  throw new OutboxError('INVALID_DOCUMENT_TYPE', 'The commercial document job has an unsupported document type.');
}

async function renderAndStoreCommercialDocument(env: Env, job: OutboxJob): Promise<void> {
  const payload = parseRawPayload(job);
  const input = await commercialInput(env, job, payload);
  const bytes = renderCommercialPdf(input);
  const digest = await sha256HexBytes(bytes);
  const fileVersionId = crypto.randomUUID();
  const artifactId = crypto.randomUUID();
  const generatedAt = nowIso();
  const type = String(payload.documentType);
  const category = type === 'ENGAGEMENT_LETTER' ? 'engagement-letters' : type === 'ADVANCE_INVOICE' ? 'invoices' : type === 'RECEIPT' ? 'receipts'
    : type === 'CONFIRMATION_REQUEST' ? 'confirmations' : 'holding-letters';
  const key = `workspaces/${job.workspace_id}/generated/${category}/${job.aggregate_id}/${digest}.pdf`;
  try {
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' }, customMetadata: { sha256: digest, documentType: type, generatedByJobId: job.id } });
  } catch {
    throw new OutboxError('OBJECT_STORE_WRITE_FAILED', 'The generated PDF could not be stored. The job will retry without claiming an artifact.', 'RETRY');
  }
  const stored = await env.FILES.get(key);
  if (!stored) throw new OutboxError('GENERATED_OBJECT_MISSING', 'The generated PDF could not be read back from object storage.', 'RETRY');
  const storedBytes = new Uint8Array(await stored.arrayBuffer());
  if (storedBytes.byteLength !== bytes.byteLength || await sha256HexBytes(storedBytes) !== digest) {
    throw new OutboxError('GENERATED_OBJECT_INTEGRITY_MISMATCH', 'The generated PDF did not match its stored size and digest.');
  }
  const fileName = `${input.number.replace(/[^A-Z0-9._-]/gi, '-')}.pdf`;
  const artifactSourceType = type === 'ENGAGEMENT_LETTER' ? 'ENGAGEMENT_LETTER_DRAFT' : type === 'ADVANCE_INVOICE' ? 'INVOICE' : type === 'RECEIPT' ? 'PAYMENT'
    : type === 'CONFIRMATION_REQUEST' ? 'CONFIRMATION' : 'HOLDING_LETTER';
  const artifactSourceId = type === 'ENGAGEMENT_LETTER' ? payload.draftId : type === 'ADVANCE_INVOICE' ? payload.invoiceId : type === 'RECEIPT' ? payload.paymentId
    : type === 'CONFIRMATION_REQUEST' ? payload.confirmationId : payload.holdingLetterId;
  const revision = type === 'ENGAGEMENT_LETTER' || type === 'CONFIRMATION_REQUEST' ? Number(job.aggregate_version) : 1;
  const artifactKind = type === 'ENGAGEMENT_LETTER' ? 'ENGAGEMENT_LETTER' : type === 'ADVANCE_INVOICE' ? 'INVOICE' : type === 'RECEIPT' ? 'RECEIPT' : 'REPORT';
  const details = { jobId: job.id, documentType: type, fileVersionId, artifactId, contentSha256: digest, sizeBytes: bytes.byteLength, number: input.number };
  const result = { fileVersionId, artifactId, contentSha256: digest, sizeBytes: bytes.byteLength, mediaType: 'application/pdf', number: input.number };
  const statements: D1PreparedStatement[] = [
    ...(type==='HOLDING_LETTER'?[env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,987,CASE WHEN EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND id=? AND version=?)
        AND (SELECT COUNT(*) FROM confirmations c JOIN engagements e ON e.workspace_id=c.workspace_id AND e.id=c.engagement_id
          WHERE c.workspace_id=? AND c.engagement_id=? AND c.critical=1 AND c.status<>'CANCELLED'
            AND (c.status<>'RETURNED_VERIFIED' OR c.tb_version_id IS NOT e.active_tb_version_id OR c.mapping_version_id IS NOT e.active_mapping_version_id OR c.materiality_version_id IS NOT e.active_materiality_version_id))=json_array_length(?)
        AND NOT EXISTS(SELECT 1 FROM json_each(?) item LEFT JOIN confirmations c ON c.workspace_id=? AND c.id=json_extract(item.value,'$.id')
          LEFT JOIN engagements e ON e.workspace_id=c.workspace_id AND e.id=c.engagement_id
          WHERE c.id IS NULL OR c.critical<>1 OR c.status='CANCELLED' OR c.version<>CAST(json_extract(item.value,'$.version') AS INTEGER)
            OR c.status<>json_extract(item.value,'$.status') OR c.source_hash<>json_extract(item.value,'$.sourceHash')
            OR (c.status='RETURNED_VERIFIED' AND c.tb_version_id IS e.active_tb_version_id AND c.mapping_version_id IS e.active_mapping_version_id AND c.materiality_version_id IS e.active_materiality_version_id))
        AND EXISTS(SELECT 1 FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
          WHERE cr.workspace_id=? AND cr.id=? AND cr.version=? AND cr.client_id=? AND cr.purpose='HOLDING_LETTER' AND cr.is_primary=1
            AND ct.id=? AND ct.full_name=? AND ct.email=? AND ct.active=1 AND ct.role IN ('MD_GM','CFO_FINANCE_DIRECTOR'))
        THEN 1 ELSE 0 END`)
      .bind(job.workspace_id,job.workspace_id,payload.engagementId,job.aggregate_version,job.workspace_id,payload.engagementId,JSON.stringify(payload.confirmations),
        JSON.stringify(payload.confirmations),job.workspace_id,job.workspace_id,payload.recipient?.contactRouteId,payload.recipient?.contactRouteVersion,payload.clientId,
        payload.recipient?.contactId,payload.recipient?.name,payload.recipient?.email)]:[]),
    ...(type==='CONFIRMATION_REQUEST'?[env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,988,CASE WHEN EXISTS(SELECT 1 FROM confirmations WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=?
        AND status='QUEUED' AND version=? AND source_hash=?) THEN 1 ELSE 0 END`)
      .bind(job.workspace_id,job.workspace_id,payload.confirmationId,payload.clientId,payload.engagementId,job.aggregate_version,payload.sourceHash)]:[]),
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,992,CASE WHEN EXISTS(SELECT 1 FROM outbox_jobs WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?)
        THEN 1 ELSE 0 END`).bind(job.workspace_id, job.workspace_id, job.id, job.lease_until),
    env.DB.prepare(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
      VALUES(?,?,1,?,?,?,'application/pdf',?,?,?,'GENERATED','COMMITTED',?,1,?,?,NULL,NULL)`)
      .bind(fileVersionId, job.workspace_id, payload.clientId, payload.engagementId, fileName, bytes.byteLength, digest, key, generatedAt, generatedAt, generatedAt),
    env.DB.prepare(`UPDATE outbox_jobs SET status='SUCCEEDED',result_file_id=?,result_json=?,last_error_code=NULL,completed_at=?,lease_until=NULL,updated_at=?,version=version+1
      WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
      .bind(fileVersionId, JSON.stringify(result), generatedAt, generatedAt, job.workspace_id, job.id, job.lease_until),
    env.DB.prepare(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(artifactId, job.workspace_id, payload.clientId, payload.engagementId,
      artifactKind, artifactSourceType,
      artifactSourceId, revision, fileVersionId, digest, bytes.byteLength, generatedAt, job.id)
  ];
  const dispatchStatements: D1PreparedStatement[] = [];
  let emailDispatchId: string | null = null;
  if (['ADVANCE_INVOICE','RECEIPT','CONFIRMATION_REQUEST','HOLDING_LETTER'].includes(type)) {
    const recipient = payload.recipient as { contactRouteId?: unknown; contactRouteVersion?: unknown; contactId?: unknown; name?: unknown; email?: unknown } | undefined;
    const directParty = type === 'CONFIRMATION_REQUEST';
    if (!recipient || typeof recipient.name !== 'string' || typeof recipient.email !== 'string'
      || (!directParty && (typeof recipient.contactRouteId !== 'string' || typeof recipient.contactRouteVersion !== 'number' || typeof recipient.contactId !== 'string'))) {
      throw new OutboxError('INVALID_DISPATCH_PAYLOAD', 'The generated document is missing its exact recipient snapshot.');
    }
    emailDispatchId = type === 'CONFIRMATION_REQUEST' && typeof payload.dispatchId === 'string' ? payload.dispatchId : crypto.randomUUID();
    if (type === 'CONFIRMATION_REQUEST' && !/^[0-9a-f-]{36}$/i.test(emailDispatchId)) {
      throw new OutboxError('INVALID_DISPATCH_PAYLOAD', 'The confirmation dispatch identifier is missing or invalid.');
    }
    const emailJobId = crypto.randomUUID();
    const dispatchDedup = `commercial-document-email:${artifactId}`;
    const documentLabel = type === 'ADVANCE_INVOICE' ? `invoice ${input.number}` : type === 'RECEIPT' ? `receipt ${input.number}`
      : type === 'CONFIRMATION_REQUEST' ? `third-party confirmation request ${input.number}` : `holding letter ${input.number}`;
    const purpose = type === 'ADVANCE_INVOICE' ? 'INVOICE' : type === 'RECEIPT' ? 'RECEIPT' : type === 'CONFIRMATION_REQUEST' ? 'CONFIRMATION' : 'HOLDING_LETTER';
    const emailPayload = { documentType: 'COMMERCIAL_EMAIL', purpose, commandId: payload.commandId, engagementId: payload.engagementId, clientId: payload.clientId,
      dispatchId: emailDispatchId, fileVersionId, recipient, confirmationId: payload.confirmationId, subject: `AuditSphere ${documentLabel}`,
      body: `Please find the ${documentLabel} for ${input.clientName} attached.` };
    dispatchStatements.push(
      env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
        VALUES(?,?,1,'EMAIL',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
        .bind(emailJobId, job.workspace_id, emailDispatchId, 1, JSON.stringify(emailPayload), dispatchDedup, generatedAt, generatedAt, generatedAt),
      env.DB.prepare(`INSERT INTO dispatches(id,workspace_id,version,client_id,engagement_id,purpose,file_version_id,recipient_snapshot_json,status,provider_message_id,sent_at,deduplication_key,job_id,created_at,updated_at)
        VALUES(?,?,1,?,?,?,?,?,'QUEUED',NULL,NULL,?,?,?,?)`)
        .bind(emailDispatchId, job.workspace_id, payload.clientId, payload.engagementId, purpose, fileVersionId, JSON.stringify(recipient), dispatchDedup, emailJobId, generatedAt, generatedAt)
    );
    if(type==='CONFIRMATION_REQUEST'){
      dispatchStatements.push(env.DB.prepare(`UPDATE confirmations SET dispatch_id=?,updated_at=? WHERE workspace_id=? AND id=? AND status='QUEUED' AND version=? AND source_hash=?`)
        .bind(emailDispatchId,generatedAt,job.workspace_id,payload.confirmationId,job.aggregate_version,payload.sourceHash));
    }else if(type==='HOLDING_LETTER'){
      dispatchStatements.push(env.DB.prepare(`INSERT INTO holding_letters(id,workspace_id,client_id,engagement_id,outstanding_set_hash,confirmation_ids_snapshot_json,artifact_id,dispatch_id,created_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).bind(payload.holdingLetterId,job.workspace_id,payload.clientId,payload.engagementId,payload.outstandingSetHash,
          JSON.stringify(payload.confirmations),artifactId,emailDispatchId,generatedAt));
    }
  }
  let lifecycleTransition: D1PreparedStatement[] = [];
  if (type === 'ENGAGEMENT_LETTER') {
    await commercialInput(env, job, payload);
    const draft = await env.DB.prepare(`SELECT d.id,d.version,d.status,d.proposal_version_id,d.commercial_acceptance_id,d.risk_clearance_id,d.engagement_id,d.client_id
        ,d.created_by_actor_id
      FROM engagement_letter_drafts d WHERE d.workspace_id=? AND d.id=?`).bind(job.workspace_id, payload.draftId)
      .first<{ id: string; version: number; status: string; proposal_version_id: string; commercial_acceptance_id: string; risk_clearance_id: string; engagement_id: string; client_id: string; created_by_actor_id: string }>();
    if (!draft) throw new OutboxError('STALE_APPROVAL', 'The engagement letter draft no longer exists.');
    const gateContext = { actor: { id: draft.created_by_actor_id, persona: 'APPROVER' as const, displayName: '', staffGrade: 'PARTNER' as const, clientId: null },
      scope: { clientId: payload.clientId, engagementId: payload.engagementId }, allowedActions: ['commercialAcceptance.read'], readOnlyReasons: [] };
    const gate = await getBusinessAcceptanceGate(env, job.workspace_id, gateContext, payload.engagementId) as any;
    if (!['PENDING','RETRYABLE_FAILED'].includes(draft.status) || !gate.ready || gate.commercialKey.acceptanceId !== draft.commercial_acceptance_id
      || gate.riskKey.clearanceId !== draft.risk_clearance_id || gate.commercialKey.proposalVersionId !== draft.proposal_version_id) {
      throw new OutboxError('STALE_APPROVAL', 'The acceptance keys changed while the engagement letter was rendering.');
    }
    statements.push(env.DB.prepare(`UPDATE engagement_letter_drafts SET status='SUCCEEDED',version=version+1,artifact_id=?,file_version_id=?,error_code=NULL,updated_at=?
      WHERE workspace_id=? AND id=? AND version=? AND status IN ('PENDING','RETRYABLE_FAILED')`).bind(artifactId, fileVersionId, generatedAt, job.workspace_id, draft.id, draft.version));
  } else if (type === 'ADVANCE_INVOICE') {
    const invoice = await env.DB.prepare(`SELECT id,version,engagement_id,client_id,kind,number,subtotal_minor,tax_minor,total_minor,created_by_actor_id
      FROM invoices WHERE workspace_id=? AND id=? AND status='PENDING_DOCUMENT'`)
      .bind(job.workspace_id, payload.invoiceId).first<{ id: string; version: number; engagement_id: string; client_id:string; kind:string; number:string;
        subtotal_minor:number; tax_minor:number; total_minor:number; created_by_actor_id:string }>();
    if (!invoice) throw new OutboxError('STALE_INVOICE', 'The advance invoice changed while its PDF was rendering.');
    const issueDate=qatarDate();
    statements.push(...await prepareBusinessInvoiceJournal(env,job.workspace_id,{id:invoice.id,number:invoice.number,kind:invoice.kind,clientId:invoice.client_id,
      engagementId:invoice.engagement_id,subtotalMinor:invoice.subtotal_minor,taxMinor:invoice.tax_minor,totalMinor:invoice.total_minor,issueDate,actorId:invoice.created_by_actor_id},generatedAt));
    statements.push(env.DB.prepare(`UPDATE invoices SET status='ISSUED',version=version+1,artifact_id=?,file_version_id=?,issue_date=?,issued_at=?,updated_at=?
      WHERE workspace_id=? AND id=? AND version=? AND status='PENDING_DOCUMENT'`).bind(artifactId, fileVersionId, issueDate, generatedAt, generatedAt, job.workspace_id, invoice.id, invoice.version));
  } else if(type==='RECEIPT') {
    const receipt = await env.DB.prepare(`SELECT id,client_id,engagement_id,payment_id,status FROM receipt_vouchers WHERE workspace_id=? AND id=? AND status='PENDING'`)
      .bind(job.workspace_id, payload.receiptId).first<{ id: string; client_id: string; engagement_id: string; payment_id: string; status: string }>();
    if (!receipt) throw new OutboxError('STALE_RECEIPT', 'The receipt changed while its PDF was rendering.');
    statements.push(env.DB.prepare(`UPDATE receipt_vouchers SET status='ISSUED',artifact_id=?,file_version_id=?,issued_at=?
      WHERE workspace_id=? AND id=? AND status='PENDING'`).bind(artifactId, fileVersionId, generatedAt, job.workspace_id, receipt.id));
    const advance = await env.DB.prepare(`SELECT id,total_minor FROM invoices WHERE workspace_id=? AND engagement_id=? AND kind='ADVANCE' AND status='ISSUED'`)
      .bind(job.workspace_id, payload.engagementId).first<{ id: string; total_minor: number }>();
    if (advance) {
      const allocated = await env.DB.prepare(`SELECT pa.amount_minor,p.reverses_payment_id,p.id AS payment_id,rv.status AS receipt_status
        FROM payment_allocations pa JOIN payments p ON p.workspace_id=pa.workspace_id AND p.id=pa.payment_id
        LEFT JOIN receipt_vouchers rv ON rv.workspace_id=p.workspace_id AND rv.payment_id=p.id
        WHERE pa.workspace_id=? AND pa.invoice_id=?`).bind(job.workspace_id, advance.id).all<{ amount_minor: number; reverses_payment_id: string | null; payment_id: string; receipt_status: string | null }>();
      let paid = 0n;
      let receiptsReady = true;
      for (const row of allocated.results ?? []) {
        paid += BigInt(row.reverses_payment_id ? -row.amount_minor : row.amount_minor);
        if (row.payment_id !== receipt.payment_id && row.receipt_status !== 'ISSUED') receiptsReady = false;
      }
      if (paid === BigInt(advance.total_minor) && receiptsReady) {
        const engagement = await env.DB.prepare(`SELECT version,lifecycle_state FROM engagements WHERE workspace_id=? AND id=?`)
          .bind(job.workspace_id, payload.engagementId).first<{ version: number; lifecycle_state: string }>();
        if (engagement?.lifecycle_state === 'ADVANCE_BILLING') {
          const transitionId = crypto.randomUUID();
          const reason = 'The issued advance invoice is fully settled by verified allocations with committed receipt vouchers.';
          const dependencyHash = await sha256Hex(JSON.stringify({ engagementId: payload.engagementId, invoiceId: advance.id, totalMinor: advance.total_minor, paymentId: receipt.payment_id }));
          lifecycleTransition = [
            env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
              SELECT ?,993,CASE WHEN EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state='ADVANCE_BILLING')
                THEN 1 ELSE 0 END`).bind(job.workspace_id, job.workspace_id, payload.engagementId, engagement.version),
            env.DB.prepare(`UPDATE engagements SET lifecycle_state='PORTAL_ACTIVE_PLANNING',portal_activated_at=COALESCE(portal_activated_at,?),version=version+1,updated_at=?,updated_by_actor_id=NULL
              WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state='ADVANCE_BILLING'`).bind(generatedAt, generatedAt, job.workspace_id, payload.engagementId, engagement.version),
            env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at)
              VALUES(?,?,?, ?,1,'ADVANCE_BILLING','PORTAL_ACTIVE_PLANNING',?,?,?,?)`)
              .bind(transitionId, job.workspace_id, payload.clientId, payload.engagementId, payload.commandId, reason, dependencyHash, generatedAt)
          ];
        }
      }
    }
  }
  if (emailDispatchId) Object.assign(result, { dispatchId: emailDispatchId, emailStatus: 'QUEUED' });
  try {
    await commitJobMutation(env, job, { entityType: artifactSourceType,
      entityId: String(artifactSourceId), clientId: payload.clientId, engagementId: payload.engagementId,
      details, result, statements: [...statements, ...lifecycleTransition, ...dispatchStatements] });
  } catch (error) {
    if(type==='CONFIRMATION_REQUEST'||type==='HOLDING_LETTER'){
      try { await commercialInput(env,job,payload); }
      catch (validationError) { if(validationError instanceof OutboxError)throw validationError; }
    }
    throw error;
  }
}

function bytesToFormData(bytes: Uint8Array, input: {
  recipient: { contactRouteId: string; contactRouteVersion: number; name: string; email: string };
  proposalVersionId: string;
  proposalId: string;
  revision: number;
  attachments: Array<{ name: string; mediaType: string; sha256: string; bytes: Uint8Array }>;
}): FormData {
  const form = new FormData();
  form.set('message', JSON.stringify({
    to: input.recipient.email,
    recipientName: input.recipient.name,
    subject: `Audit proposal ${input.proposalId} — revision ${input.revision}`,
    text: `Please find the approved AuditSphere proposal for ${input.proposalId}, revision ${input.revision}, attached.`,
    proposalVersionId: input.proposalVersionId
  }));
  form.append('attachment', new Blob([bytes], { type: 'application/pdf' }), `Proposal-r${input.revision}.pdf`);
  for (const attachment of input.attachments) {
    form.append('attachment', new Blob([attachment.bytes], { type: attachment.mediaType }), attachment.name);
  }
  return form;
}

async function dispatchProposal(env: Env, job: OutboxJob): Promise<void> {
  const payload = parsePayload(job);
  if (!env.EMAIL_PROVIDER) throw new OutboxError('EMAIL_PROVIDER_NOT_CONFIGURED', 'Configure the EMAIL_PROVIDER service binding before sending proposal emails. The message has not been sent.');
  if (!payload.dispatchId || !payload.fileVersionId || !payload.recipient) {
    throw new OutboxError('INVALID_DISPATCH_PAYLOAD', 'The dispatch is missing its exact proposal artifact or recipient snapshot.');
  }
  const approved = await env.DB.prepare(`SELECT pv.proposal_id,pv.revision,pv.team_cv_file_ids_json,p.current_version_id,e.version AS engagement_version,e.lifecycle_state,
      a.approval_decision_id
    FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
    JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.client_id=pv.client_id AND e.id=pv.engagement_id
    JOIN proposal_approvals a ON a.workspace_id=pv.workspace_id AND a.proposal_version_id=pv.id AND a.decision='APPROVE'
    WHERE pv.workspace_id=? AND pv.id=? ORDER BY a.decided_at DESC,a.id DESC LIMIT 1`)
    .bind(job.workspace_id, payload.proposalVersionId)
    .first<{ proposal_id: string; revision: number; team_cv_file_ids_json: string; current_version_id: string; engagement_version: number; lifecycle_state: string; approval_decision_id: string }>();
  if (!approved || approved.current_version_id !== payload.proposalVersionId || approved.lifecycle_state !== 'PROPOSAL_GENERATION') {
    throw new OutboxError('STALE_APPROVED_PROPOSAL', 'Dispatch requires Partner approval of the current proposal revision while its engagement remains in proposal generation.');
  }
  const primary = await exactFile(env, job.workspace_id, payload.fileVersionId);
  if (primary.metadata.purpose !== 'GENERATED' || primary.metadata.media_type !== 'application/pdf') {
    throw new OutboxError('PROPOSAL_ARTIFACT_INVALID', 'The exact generated proposal PDF is no longer available.');
  }
  const cvIds = parseStringArray(approved.team_cv_file_ids_json);
  const attachments: Array<{ name: string; mediaType: string; sha256: string; bytes: Uint8Array }> = [];
  for (const id of cvIds) {
    const cv = await exactFile(env, job.workspace_id, id);
    if (cv.metadata.purpose !== 'TEMPLATE' || !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(cv.metadata.media_type)) {
      throw new OutboxError('PROPOSAL_ATTACHMENT_INVALID', 'A CV attachment pinned to the approved proposal is not a committed PDF or DOCX template.');
    }
    attachments.push({ name: cv.metadata.original_name, mediaType: cv.metadata.media_type, sha256: cv.metadata.sha256, bytes: cv.bytes });
  }
  const dispatch = await env.DB.prepare(`SELECT id,status,version FROM dispatches WHERE workspace_id=? AND id=? AND job_id=?`)
    .bind(job.workspace_id, payload.dispatchId, job.id).first<{ id: string; status: string; version: number }>();
  if (!dispatch || dispatch.status !== 'QUEUED') throw new OutboxError('DISPATCH_NOT_QUEUED', 'This dispatch is no longer queued.');

  let response: Response;
  try {
    response = await env.EMAIL_PROVIDER.fetch(new Request('https://email-provider.local/send', {
      method: 'POST',
      headers: { 'Idempotency-Key': job.deduplication_key },
      body: bytesToFormData(primary.bytes, {
        recipient: payload.recipient, proposalVersionId: payload.proposalVersionId,
        proposalId: approved.proposal_id, revision: approved.revision, attachments
      })
    }));
  } catch {
    throw new OutboxError('EMAIL_PROVIDER_OUTCOME_UNKNOWN', 'The email provider connection ended without a verifiable outcome. Do not resend until the provider is reconciled.', 'UNKNOWN');
  }
  if (response.status === 408 || response.status === 429) {
    throw new OutboxError(`EMAIL_PROVIDER_HTTP_${response.status}`, `The provider returned HTTP ${response.status}; the dispatch will retry with the same idempotency key.`, 'RETRY');
  }
  if (response.status >= 500) {
    throw new OutboxError(`EMAIL_PROVIDER_HTTP_${response.status}`, `The provider returned HTTP ${response.status}; whether it accepted the message is unknown.`, 'UNKNOWN');
  }
  if (!response.ok) throw new OutboxError(`EMAIL_PROVIDER_HTTP_${response.status}`, `The provider rejected the email with HTTP ${response.status}.`);
  let providerMessageId: string;
  try {
    const result = await response.json() as { messageId?: unknown };
    if (typeof result.messageId !== 'string' || !result.messageId.trim() || result.messageId.length > 512) throw new Error('missing message id');
    providerMessageId = result.messageId.trim();
  } catch {
    throw new OutboxError('EMAIL_PROVIDER_RESPONSE_INVALID', 'The provider returned success without a verifiable message ID; delivery status is unknown.', 'UNKNOWN');
  }

  const acceptedAt = nowIso();
  const transitionId = crypto.randomUUID();
  const reason = 'The provider accepted the Partner-approved proposal email with its pinned attachments.';
  const dependencyHash = await sha256Hex(JSON.stringify({
    dispatchId: payload.dispatchId, proposalVersionId: payload.proposalVersionId,
    approvalDecisionId: approved.approval_decision_id, providerMessageId
  }));
  const details = {
    dispatchId: payload.dispatchId, proposalVersionId: payload.proposalVersionId,
    providerMessageId, recipient: payload.recipient.email, attachmentCount: attachments.length + 1
  };
  await commitJobMutation(env, job, {
    entityType: 'DISPATCH', entityId: payload.dispatchId, clientId: payload.clientId,
    engagementId: payload.engagementId, details,
    statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,990,CASE WHEN EXISTS(SELECT 1 FROM dispatches d JOIN proposals p ON p.workspace_id=d.workspace_id
            JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.id=p.current_version_id
            JOIN engagements e ON e.workspace_id=d.workspace_id AND e.client_id=d.client_id AND e.id=d.engagement_id
          WHERE d.workspace_id=? AND d.id=? AND d.job_id=? AND d.status='QUEUED' AND pv.id=?
            AND e.version=? AND e.lifecycle_state='PROPOSAL_GENERATION') THEN 1 ELSE 0 END`)
        .bind(job.workspace_id, job.workspace_id, payload.dispatchId, job.id, payload.proposalVersionId, approved.engagement_version),
      env.DB.prepare(`UPDATE outbox_jobs SET status='SUCCEEDED',provider_reference=?,result_json=?,last_error_code=NULL,completed_at=?,lease_until=NULL,updated_at=?,version=version+1
        WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(providerMessageId, JSON.stringify({ dispatchId: payload.dispatchId, providerMessageId, status: 'ACCEPTED' }), acceptedAt, acceptedAt,
          job.workspace_id, job.id, job.lease_until),
      env.DB.prepare(`UPDATE dispatches SET status='ACCEPTED',provider_message_id=?,sent_at=?,updated_at=?,version=version+1
        WHERE workspace_id=? AND id=? AND job_id=? AND status='QUEUED'`)
        .bind(providerMessageId, acceptedAt, acceptedAt, job.workspace_id, payload.dispatchId, job.id),
      env.DB.prepare(`UPDATE engagements SET lifecycle_state='DUAL_KEY_PENDING',active_proposal_version_id=?,version=version+1,updated_at=?,updated_by_actor_id=NULL
        WHERE workspace_id=? AND client_id=? AND id=? AND version=? AND lifecycle_state='PROPOSAL_GENERATION'`)
        .bind(payload.proposalVersionId, acceptedAt, job.workspace_id, payload.clientId, payload.engagementId, approved.engagement_version),
      env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at)
        VALUES(?,?,?, ?,1,'PROPOSAL_GENERATION','DUAL_KEY_PENDING',?,?,?,?)`)
        .bind(transitionId, job.workspace_id, payload.clientId, payload.engagementId, payload.commandId, reason, dependencyHash, acceptedAt)
    ],
    result: { dispatchId: payload.dispatchId, providerMessageId, status: 'ACCEPTED', transitionId }
  });
}

async function dispatchCommercial(env: Env, job: OutboxJob): Promise<void> {
  const payload = parseRawPayload(job);
  if (!env.EMAIL_PROVIDER) throw new OutboxError('EMAIL_PROVIDER_NOT_CONFIGURED', 'Configure the EMAIL_PROVIDER service binding before sending this commercial document. The message has not been sent.');
  const directConfirmation = payload.documentType === 'COMMERCIAL_EMAIL' && payload.purpose === 'CONFIRMATION';
  if (!payload.dispatchId || !payload.fileVersionId || !payload.recipient || typeof payload.recipient.name !== 'string' || typeof payload.recipient.email !== 'string'
    || (!directConfirmation && (typeof payload.recipient.contactRouteId !== 'string' || typeof payload.recipient.contactRouteVersion !== 'number'
      || typeof payload.recipient.contactId !== 'string'))) {
    throw new OutboxError('INVALID_DISPATCH_PAYLOAD', 'The commercial dispatch is missing its exact document or recipient snapshot.');
  }
  const dispatch = await env.DB.prepare(`SELECT id,status,version,purpose,file_version_id,recipient_snapshot_json FROM dispatches WHERE workspace_id=? AND id=? AND job_id=?`)
    .bind(job.workspace_id, payload.dispatchId, job.id).first<{ id: string; status: string; version: number; purpose: string; file_version_id: string; recipient_snapshot_json: string }>();
  if (!dispatch || dispatch.status !== 'QUEUED' || dispatch.file_version_id !== payload.fileVersionId
    || !['EL','INVOICE','RECEIPT','CONFIRMATION','HOLDING_LETTER','BUNDLE'].includes(dispatch.purpose)) throw new OutboxError('DISPATCH_NOT_QUEUED', 'This commercial dispatch is no longer queued for the pinned artifact.');
  let snapshot: Record<string, unknown>;
  try { snapshot = JSON.parse(dispatch.recipient_snapshot_json) as Record<string, unknown>; }
  catch { throw new OutboxError('INVALID_RECIPIENT_SNAPSHOT', 'The pinned recipient snapshot cannot be verified.'); }
  if (snapshot.name !== payload.recipient.name || snapshot.email !== payload.recipient.email
    || (!directConfirmation && (snapshot.contactRouteId !== payload.recipient.contactRouteId || snapshot.contactRouteVersion !== payload.recipient.contactRouteVersion
      || snapshot.contactId !== payload.recipient.contactId))) {
    throw new OutboxError('INVALID_RECIPIENT_SNAPSHOT', 'The email job recipient differs from the route snapshot recorded at issue.');
  }
  if(dispatch.purpose==='CONFIRMATION'){
    const confirmation=await env.DB.prepare(`SELECT id,status,dispatch_id,external_party_name,external_party_email FROM confirmations
      WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=?`).bind(job.workspace_id,payload.confirmationId,payload.clientId,payload.engagementId)
      .first<{id:string;status:string;dispatch_id:string|null;external_party_name:string;external_party_email:string|null}>();
    if(!confirmation||confirmation.status!=='QUEUED'||confirmation.dispatch_id!==payload.dispatchId||confirmation.external_party_name!==payload.recipient.name
      ||confirmation.external_party_email!==payload.recipient.email)throw new OutboxError('STALE_CONFIRMATION_DISPATCH','The exact queued confirmation or recipient changed before dispatch.');
  }else if(dispatch.purpose==='HOLDING_LETTER'){
    const route=await env.DB.prepare(`SELECT cr.version,ct.id AS contact_id,ct.full_name,ct.email FROM contact_routes cr JOIN contacts ct
        ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
      WHERE cr.workspace_id=? AND cr.id=? AND cr.client_id=? AND cr.purpose='HOLDING_LETTER' AND cr.is_primary=1 AND ct.active=1 AND ct.email IS NOT NULL
        AND ct.role IN ('MD_GM','CFO_FINANCE_DIRECTOR')`).bind(job.workspace_id,payload.recipient.contactRouteId,payload.clientId)
      .first<{version:number;contact_id:string;full_name:string;email:string}>();
    if(!route||route.version!==payload.recipient.contactRouteVersion||route.contact_id!==payload.recipient.contactId||route.full_name!==payload.recipient.name||route.email!==payload.recipient.email)
      throw new OutboxError('STALE_HOLDING_LETTER_ROUTE','The primary management contact route changed before sending the holding letter.');
  }
  const document = await exactFile(env, job.workspace_id, payload.fileVersionId);
  if (document.metadata.purpose !== 'GENERATED' || document.metadata.media_type !== 'application/pdf') {
    throw new OutboxError('COMMERCIAL_ARTIFACT_INVALID', 'The exact commercial PDF is no longer available.');
  }
  const form = new FormData();
  form.set('message', JSON.stringify({ to: payload.recipient.email, recipientName: payload.recipient.name,
    subject: payload.subject, text: payload.body, dispatchId: payload.dispatchId, purpose: dispatch.purpose }));
  form.append('attachment', new Blob([document.bytes], { type: 'application/pdf' }), document.metadata.original_name);
  let response: Response;
  try {
    response = await env.EMAIL_PROVIDER.fetch(new Request('https://email-provider.local/send', {
      method: 'POST', headers: { 'Idempotency-Key': job.deduplication_key }, body: form
    }));
  } catch {
    throw new OutboxError('EMAIL_PROVIDER_OUTCOME_UNKNOWN', 'The email provider connection ended without a verifiable outcome. Do not resend until the provider is reconciled.', 'UNKNOWN');
  }
  if (response.status === 408 || response.status === 429) throw new OutboxError(`EMAIL_PROVIDER_HTTP_${response.status}`, `The provider returned HTTP ${response.status}; the dispatch will retry with the same idempotency key.`, 'RETRY');
  if (response.status >= 500) throw new OutboxError(`EMAIL_PROVIDER_HTTP_${response.status}`, `The provider returned HTTP ${response.status}; whether it accepted the message is unknown.`, 'UNKNOWN');
  if (!response.ok) throw new OutboxError(`EMAIL_PROVIDER_HTTP_${response.status}`, `The provider rejected the email with HTTP ${response.status}.`);
  let providerMessageId: string;
  try {
    const result = await response.json() as { messageId?: unknown };
    if (typeof result.messageId !== 'string' || !result.messageId.trim() || result.messageId.length > 512) throw new Error('missing message id');
    providerMessageId = result.messageId.trim();
  } catch {
    throw new OutboxError('EMAIL_PROVIDER_RESPONSE_INVALID', 'The provider returned success without a verifiable message ID; delivery status is unknown.', 'UNKNOWN');
  }
  const acceptedAt = nowIso();
  const acceptanceStatements:D1PreparedStatement[]=[];
  if(dispatch.purpose==='CONFIRMATION'){
    acceptanceStatements.push(env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,995,CASE WHEN EXISTS(SELECT 1 FROM confirmations WHERE workspace_id=? AND id=? AND status='QUEUED' AND dispatch_id=?) THEN 1 ELSE 0 END`)
      .bind(job.workspace_id,job.workspace_id,payload.confirmationId,payload.dispatchId),
      env.DB.prepare(`UPDATE confirmations SET status='SENT',version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND status='QUEUED' AND dispatch_id=?`)
        .bind(acceptedAt,job.workspace_id,payload.confirmationId,payload.dispatchId));
  }
  await commitJobMutation(env, job, {
    entityType: 'DISPATCH', entityId: payload.dispatchId, clientId: payload.clientId, engagementId: payload.engagementId,
    details: { dispatchId: payload.dispatchId, fileVersionId: payload.fileVersionId, providerMessageId, recipient: payload.recipient.email, purpose: dispatch.purpose },
    result: { dispatchId: payload.dispatchId, providerMessageId, status: 'ACCEPTED' },
    statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,994,CASE WHEN EXISTS(SELECT 1 FROM dispatches WHERE workspace_id=? AND id=? AND job_id=? AND status='QUEUED' AND file_version_id=?)
          THEN 1 ELSE 0 END`).bind(job.workspace_id, job.workspace_id, payload.dispatchId, job.id, payload.fileVersionId),
      env.DB.prepare(`UPDATE outbox_jobs SET status='SUCCEEDED',provider_reference=?,result_json=?,last_error_code=NULL,completed_at=?,lease_until=NULL,updated_at=?,version=version+1
        WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(providerMessageId, JSON.stringify({ dispatchId: payload.dispatchId, providerMessageId, status: 'ACCEPTED' }), acceptedAt, acceptedAt,
          job.workspace_id, job.id, job.lease_until),
      env.DB.prepare(`UPDATE dispatches SET status='ACCEPTED',provider_message_id=?,sent_at=?,updated_at=?,version=version+1
        WHERE workspace_id=? AND id=? AND job_id=? AND status='QUEUED'`).bind(providerMessageId, acceptedAt, acceptedAt, job.workspace_id, payload.dispatchId, job.id),
      ...acceptanceStatements
    ]
  });
}

interface JobMutation {
  entityType: string;
  entityId: string;
  clientId?: string;
  engagementId?: string;
  details: Record<string, unknown>;
  statements: D1PreparedStatement[];
  result?: Record<string, unknown>;
}

async function commitJobMutation(env: Env, job: OutboxJob, mutation: JobMutation): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const head = await env.DB.prepare(`SELECT id,last_sequence,last_event_hash FROM audit_chain_heads
      WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`)
      .bind(job.workspace_id, job.workspace_id).first<{ id: string; last_sequence: number; last_event_hash: string | null }>();
    if (!head) throw new OutboxError('AUDIT_LINEAGE_MISSING', 'The workspace audit lineage is unavailable; the job result was not committed.', 'RETRY');
    const eventId = crypto.randomUUID();
    const sequence = head.last_sequence + 1;
    const timestamp = nowIso();
    const eventDetails = JSON.stringify({ jobId: job.id, result: mutation.result ?? null, details: mutation.details, provenance: 'SYSTEM_JOB' });
    const commandType = `job.${job.kind.toLowerCase()}`;
    const eventHash = await sha256Hex(JSON.stringify({
      id: eventId, workspaceId: job.workspace_id, sequence, previousHash: head.last_event_hash,
      actorId: null, actorPersona: null, commandType, entityType: mutation.entityType,
      entityId: mutation.entityId, details: eventDetails, timestamp
    }));
    const assertionStatements = [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,989,CASE WHEN EXISTS(SELECT 1 FROM outbox_jobs WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?) THEN 1 ELSE 0 END`)
        .bind(job.workspace_id, job.workspace_id, job.id, job.lease_until),
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,991,CASE WHEN EXISTS(SELECT 1 FROM audit_chain_heads WHERE id=? AND last_sequence=? AND last_event_hash IS ?) THEN 1 ELSE 0 END`)
        .bind(job.workspace_id, head.id, head.last_sequence, head.last_event_hash)
    ];
    const auditStatements = [
      env.DB.prepare(`UPDATE audit_chain_heads SET last_sequence=?,last_event_hash=?,updated_at=?
        WHERE id=? AND workspace_id=? AND last_sequence=? AND last_event_hash IS ?`)
        .bind(sequence, eventHash, timestamp, head.id, job.workspace_id, head.last_sequence, head.last_event_hash),
      env.DB.prepare(`INSERT INTO audit_events(id,workspace_id,sequence,actor_user_id,actor_role,command_type,entity_kind,entity_id,
          client_id,engagement_id,before_version,after_version,details_json,created_at,actor_assurance,source,chain_scope_kind,
          chain_scope_id,previous_hash,event_hash,actor_id,event_type,entity_type,command_id,actor_persona)
        VALUES(?,?,?,NULL,'SYSTEM',?,?,?,?,?,NULL,?,?,?, 'SYSTEM','JOB','WORKSPACE',?,?,?,?,?,?,?,?)`)
        .bind(eventId, job.workspace_id, sequence, commandType, mutation.entityType.toLowerCase(), mutation.entityId,
          mutation.clientId ?? null, mutation.engagementId ?? null, job.version + 1, eventDetails, nowSeconds(), job.workspace_id,
          head.last_event_hash, eventHash, null, commandType, mutation.entityType, job.id, null),
      env.DB.prepare(`UPDATE workspaces SET revision=revision+1,version=version+1,updated_at=?,updated_at_utc=? WHERE id=? AND data_mode='BUSINESS'`)
        .bind(nowSeconds(), timestamp, job.workspace_id),
      env.DB.prepare('DELETE FROM command_assertions WHERE workspace_id=?').bind(job.workspace_id)
    ];
    try {
      await env.DB.batch([...assertionStatements, ...mutation.statements, ...auditStatements]);
      return;
    } catch (error) {
      const current = await env.DB.prepare(`SELECT last_sequence,last_event_hash FROM audit_chain_heads WHERE id=? AND workspace_id=?`)
        .bind(head.id, job.workspace_id).first<{ last_sequence: number; last_event_hash: string | null }>();
      if (current && (current.last_sequence !== head.last_sequence || current.last_event_hash !== head.last_event_hash) && attempt < 3) continue;
      throw error;
    }
  }
  throw new OutboxError('AUDIT_LINEAGE_BUSY', 'The audit lineage remained busy; retry the background job.', 'RETRY');
}

async function recordJobFailure(env: Env, job: OutboxJob, error: unknown): Promise<void> {
  const failure = error instanceof OutboxError
    ? error
    : error instanceof ApiError
      ? new OutboxError(error.code, error.message)
      : error instanceof Error && error.message.startsWith('ARCHIVE_INCOMPLETE:')
        ? new OutboxError('ARCHIVE_INCOMPLETE', error.message, 'RETRY')
    : error instanceof ProposalDocumentError
      ? new OutboxError(error.code, error.message)
      : error instanceof CommercialDocumentError
        ? new OutboxError(error.code, error.message)
      : new OutboxError('JOB_PROCESSING_FAILED', 'The background job failed unexpectedly. Retry or inspect Worker logs.', 'RETRY');
  const now = nowIso();
  const exhausted = job.attempts >= MAX_JOB_ATTEMPTS;
  const disposition = failure.disposition === 'RETRY' && !exhausted ? 'RETRY' : failure.disposition === 'UNKNOWN' ? 'UNKNOWN' : 'FAIL';
  const status = disposition === 'RETRY' ? 'RETRYABLE_FAILED' : disposition === 'UNKNOWN' ? 'UNKNOWN' : 'PERMANENT_FAILED';
  const delaySeconds = Math.min(60 * 2 ** Math.min(job.attempts, 6), 3600);
  const nextAttempt = new Date(Date.parse(now) + delaySeconds * 1000).toISOString();
  const payload = (() => { try { return JSON.parse(job.payload_json) as Record<string, unknown>; } catch { return {}; } })();
  const dispatchStatus = disposition === 'UNKNOWN' ? 'UNKNOWN' : disposition === 'FAIL' ? 'FAILED' : null;
  const dispatchId = job.kind === 'EMAIL' && typeof payload.dispatchId === 'string' ? payload.dispatchId : null;
  const documentType = typeof payload.documentType === 'string' ? payload.documentType : null;
  let archiveMissingFiles: string[] = [];
  if (failure.code === 'ARCHIVE_INCOMPLETE') {
    try { archiveMissingFiles = JSON.parse(failure.message.replace(/^ARCHIVE_INCOMPLETE:/, '')) as string[]; }
    catch { archiveMissingFiles = [failure.message.slice('ARCHIVE_INCOMPLETE:'.length)]; }
  }
  const documentEntity = documentType === 'ENGAGEMENT_LETTER' && typeof payload.draftId === 'string' ? { type: 'ENGAGEMENT_LETTER_DRAFT', id: payload.draftId }
    : documentType === 'ADVANCE_INVOICE' && typeof payload.invoiceId === 'string' ? { type: 'INVOICE', id: payload.invoiceId }
      : documentType === 'RECEIPT' && typeof payload.receiptId === 'string' ? { type: 'RECEIPT_VOUCHER', id: payload.receiptId }
        : documentType === 'CONFIRMATION_REQUEST' && typeof payload.confirmationId === 'string' ? { type: 'CONFIRMATION', id: payload.confirmationId }
          : documentType === 'HOLDING_LETTER' && typeof payload.holdingLetterId === 'string' ? { type: 'HOLDING_LETTER', id: payload.holdingLetterId }
            : documentType === 'REPORT_CANDIDATE' && typeof payload.reportCandidateId === 'string' ? { type: 'REPORT_CANDIDATE', id: payload.reportCandidateId }
              : documentType === 'MANAGEMENT_LETTER' && typeof payload.managementLetterVersionId === 'string' ? { type: 'MANAGEMENT_LETTER_VERSION', id: payload.managementLetterVersionId }
                : documentType === 'REPRESENTATION_TEMPLATE' && typeof payload.requestId === 'string' ? { type: 'REPRESENTATION_REQUEST', id: payload.requestId }
                  : documentType === 'BUNDLE_CANDIDATE' && typeof payload.bundleCandidateId === 'string' ? { type: 'BUNDLE_CANDIDATE', id: payload.bundleCandidateId }
                  : documentType === 'SEAL_ARCHIVE' && typeof payload.archiveRunId === 'string' ? { type: 'ARCHIVE_RUN', id: payload.archiveRunId }
                    : documentType === 'PRACTICE_REPORT' && typeof payload.reportSnapshotId === 'string' ? { type: 'FIRM_REPORT_SNAPSHOT', id: payload.reportSnapshotId } : null;
  const failureEntityType = job.kind === 'IMPORT_TB' ? 'TB_IMPORT' : job.kind === 'EMAIL' ? 'DISPATCH' : documentEntity?.type ?? 'PROPOSAL_VERSION';
  const failureEntityId = dispatchId ?? documentEntity?.id ?? job.aggregate_id;
  await commitJobMutation(env, job, {
    entityType: failureEntityType,
    entityId: failureEntityId,
    clientId: typeof payload.clientId === 'string' ? payload.clientId : undefined,
    engagementId: typeof payload.engagementId === 'string' ? payload.engagementId : undefined,
    details: { jobId: job.id, status, errorCode: failure.code, errorMessage: failure.message },
    statements: [
      env.DB.prepare(`UPDATE outbox_jobs SET status=?,last_error_code=?,next_attempt_at=?,completed_at=?,lease_until=NULL,updated_at=?,version=version+1
        WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(status, failure.code, nextAttempt, status === 'RETRYABLE_FAILED' ? null : now, now, job.workspace_id, job.id, job.lease_until),
      ...(dispatchId && dispatchStatus ? [env.DB.prepare(`UPDATE dispatches SET status=?,updated_at=?,version=version+1
          WHERE workspace_id=? AND id=? AND job_id=? AND status='QUEUED'`)
        .bind(dispatchStatus, now, job.workspace_id, dispatchId, job.id)] : []),
      ...(documentType === 'ENGAGEMENT_LETTER' && typeof payload.draftId === 'string' ? [env.DB.prepare(`UPDATE engagement_letter_drafts SET status=?,error_code=?,version=version+1,updated_at=?
          WHERE workspace_id=? AND id=? AND job_id=? AND status IN ('PENDING','RETRYABLE_FAILED')`)
        .bind(status, failure.code, now, job.workspace_id, payload.draftId, job.id)] : []),
      ...(documentType === 'REPORT_CANDIDATE' && typeof payload.reportCandidateId === 'string' && status === 'PERMANENT_FAILED' ? [env.DB.prepare(`UPDATE report_candidates SET status='FAILED',failure_code=?,updated_at=? WHERE workspace_id=? AND id=? AND status='PREPARING'`)
        .bind(failure.code,now,job.workspace_id,payload.reportCandidateId)] : []),
      ...(documentType === 'MANAGEMENT_LETTER' && typeof payload.managementLetterVersionId === 'string' && status === 'PERMANENT_FAILED' ? [env.DB.prepare(`UPDATE management_letter_versions SET status='FAILED' WHERE workspace_id=? AND id=? AND status='PREPARING'`)
        .bind(job.workspace_id,payload.managementLetterVersionId)] : []),
      ...(documentType === 'REPRESENTATION_TEMPLATE' && typeof payload.requestId === 'string' && status === 'PERMANENT_FAILED' ? [env.DB.prepare(`UPDATE representation_requests SET status='FAILED',version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND status='PREPARING'`)
        .bind(now,job.workspace_id,payload.requestId)] : []),
      ...(documentType === 'BUNDLE_CANDIDATE' && typeof payload.bundleCandidateId === 'string' ? [env.DB.prepare(`UPDATE bundle_candidates SET status=?,failure_code=?,updated_at=? WHERE workspace_id=? AND id=? AND status='PREPARING'`)
        .bind(status === 'PERMANENT_FAILED' ? 'FAILED' : 'PREPARING',failure.code,now,job.workspace_id,payload.bundleCandidateId)] : []),
      ...(documentType === 'SEAL_ARCHIVE' && typeof payload.archiveRunId === 'string' ? [env.DB.prepare(`UPDATE archive_runs SET status=?,error_code=?,missing_files_json=?,last_attempt_at=?,updated_at=? WHERE workspace_id=? AND id=? AND status<>'SEALED'`)
        .bind('FAILED',failure.code,JSON.stringify(archiveMissingFiles),now,now,job.workspace_id,payload.archiveRunId)] : []),
      ...(job.kind === 'IMPORT_TB' ? [env.DB.prepare(`UPDATE tb_imports SET status=CASE WHEN ?='PERMANENT_FAILED' THEN 'INVALID' ELSE 'VALIDATING' END,
          error_count=error_count+CASE WHEN ?='PERMANENT_FAILED' THEN 1 ELSE 0 END,
          errors_json=CASE WHEN ?='PERMANENT_FAILED' THEN json_array(json_object('row',0,'code',?,'message',?)) ELSE errors_json END,updated_at=?
        WHERE workspace_id=? AND id=? AND status IN ('STAGED','VALIDATING')`)
        .bind(status,status,status,failure.code,failure.message,now,job.workspace_id,job.aggregate_id)] : [])
    ],
    result: { status, errorCode: failure.code }
  });
}

async function markExpiredEmailUnknown(env: Env, candidate: { id: string; workspace_id: string; lease_until: string | null; aggregate_id: string; payload_json: string }): Promise<void> {
  if (!candidate.lease_until) return;
  const job = await env.DB.prepare(`SELECT id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,lease_until,last_error_code,result_file_id
    FROM outbox_jobs WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=? AND kind='EMAIL'`)
    .bind(candidate.workspace_id, candidate.id, candidate.lease_until).first<OutboxJob>();
  if (!job) return;
  const payload = parseRawPayload(job);
  const now = nowIso();
  await commitJobMutation(env, job, {
    entityType: 'DISPATCH', entityId: typeof payload.dispatchId === 'string' ? payload.dispatchId : job.aggregate_id,
    clientId: payload.clientId, engagementId: payload.engagementId,
    details: { jobId: job.id, status: 'UNKNOWN', errorCode: 'EMAIL_PROVIDER_OUTCOME_UNKNOWN',
      errorMessage: 'The Worker stopped after the provider call began. Reconcile the provider record before any retry.' },
    statements: [
      env.DB.prepare(`UPDATE outbox_jobs SET status='UNKNOWN',last_error_code='EMAIL_PROVIDER_OUTCOME_UNKNOWN',completed_at=?,lease_until=NULL,updated_at=?,version=version+1
        WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(now, now, job.workspace_id, job.id, job.lease_until),
      ...(typeof payload.dispatchId === 'string' ? [env.DB.prepare(`UPDATE dispatches SET status='UNKNOWN',updated_at=?,version=version+1
          WHERE workspace_id=? AND id=? AND job_id=? AND status='QUEUED'`)
        .bind(now, job.workspace_id, payload.dispatchId, job.id)] : [])
    ],
    result: { status: 'UNKNOWN', errorCode: 'EMAIL_PROVIDER_OUTCOME_UNKNOWN' }
  });
}

/** Claim and process a bounded number of proposal/document/email jobs. */
export async function processBusinessOutbox(env: Env, limit = 20): Promise<number> {
  const now = nowIso();
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), 50);
  const [ready, expiredEmail] = await Promise.all([
    env.DB.prepare(`SELECT j.id FROM outbox_jobs j JOIN workspaces w ON w.id=j.workspace_id AND w.data_mode='BUSINESS'
      WHERE j.kind IN ('GENERATE_DOCUMENT','SEAL_ARCHIVE','EMAIL','IMPORT_TB') AND (
        (j.status IN ('PENDING','RETRYABLE_FAILED') AND j.next_attempt_at<=?)
      OR (j.status='RUNNING' AND j.kind IN ('GENERATE_DOCUMENT','SEAL_ARCHIVE','IMPORT_TB') AND j.lease_until IS NOT NULL AND j.lease_until<=?)
      ) ORDER BY j.next_attempt_at,j.created_at,j.id LIMIT ?`)
      .bind(now, now, safeLimit).all<{ id: string }>(),
    env.DB.prepare(`SELECT j.id,j.workspace_id,j.lease_until,j.aggregate_id,j.payload_json FROM outbox_jobs j
      JOIN workspaces w ON w.id=j.workspace_id AND w.data_mode='BUSINESS'
      WHERE j.kind='EMAIL' AND j.status='RUNNING' AND j.lease_until IS NOT NULL AND j.lease_until<=? ORDER BY j.lease_until,j.id LIMIT ?`)
      .bind(now, safeLimit).all<{ id: string; workspace_id: string; lease_until: string | null; aggregate_id: string; payload_json: string }>()
  ]);
  let processed = 0;
  for (const candidate of expiredEmail.results ?? []) {
    try { await markExpiredEmailUnknown(env, candidate); processed += 1; }
    catch (error) { console.error('expired email job reconciliation failed', candidate.id, String(error)); }
  }
  for (const candidate of ready.results ?? []) {
    const job = await claimJob(env, candidate.id, nowIso());
    if (!job) continue;
    try {
      const payload = parseRawPayload(job);
      if (job.kind === 'IMPORT_TB') {
        await commitJobMutation(env, job, await prepareTrialBalanceImport(env, job));
      } else if (job.kind === 'GENERATE_DOCUMENT' || job.kind === 'SEAL_ARCHIVE') {
        if (typeof payload.documentType === 'string') {
          const reportingHandled=await processBusinessReportingDocument(env,job,payload,mutation=>commitJobMutation(env,job,mutation));
          if(!reportingHandled&&job.kind==='SEAL_ARCHIVE')throw new OutboxError('INVALID_ARCHIVE_JOB','Archive sealing jobs must use the archive document processor.');
          if(!reportingHandled)await renderAndStoreCommercialDocument(env,job);
        }
        else await renderAndStoreProposal(env, job);
      } else if (payload.documentType === 'COMMERCIAL_EMAIL') await dispatchCommercial(env, job);
      else await dispatchProposal(env, job);
      processed += 1;
    } catch (error) {
      try { await recordJobFailure(env, job, error); processed += 1; }
      catch (recordError) { console.error('business job result could not be committed', job.id, String(recordError)); }
    }
  }
  return processed;
}
