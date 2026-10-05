import type { Env } from './env';
import { sha256Hex } from './http';
import { ProposalDocumentError, renderProposalPdf, type ProposalDocumentInput } from './proposalDocument';

type JobKind = 'GENERATE_DOCUMENT' | 'EMAIL';
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

async function claimJob(env: Env, id: string, now: string): Promise<OutboxJob | null> {
  return env.DB.prepare(`UPDATE outbox_jobs SET status='RUNNING',attempts=attempts+1,lease_until=?,updated_at=?,version=version+1
    WHERE id=? AND kind IN ('GENERATE_DOCUMENT','EMAIL') AND (
      (status IN ('PENDING','RETRYABLE_FAILED') AND next_attempt_at<=?)
      OR (status='RUNNING' AND kind='GENERATE_DOCUMENT' AND lease_until IS NOT NULL AND lease_until<=?)
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
    : error instanceof ProposalDocumentError
      ? new OutboxError(error.code, error.message)
      : new OutboxError('JOB_PROCESSING_FAILED', 'The background job failed unexpectedly. Retry or inspect Worker logs.', 'RETRY');
  const now = nowIso();
  const exhausted = job.attempts >= MAX_JOB_ATTEMPTS;
  const disposition = failure.disposition === 'RETRY' && !exhausted ? 'RETRY' : failure.disposition === 'UNKNOWN' ? 'UNKNOWN' : 'FAIL';
  const status = disposition === 'RETRY' ? 'RETRYABLE_FAILED' : disposition === 'UNKNOWN' ? 'UNKNOWN' : 'PERMANENT_FAILED';
  const delaySeconds = Math.min(60 * 2 ** Math.min(job.attempts, 6), 3600);
  const nextAttempt = new Date(Date.parse(now) + delaySeconds * 1000).toISOString();
  const payload = (() => { try { return JSON.parse(job.payload_json) as Partial<JobPayload>; } catch { return {}; } })();
  const dispatchStatus = disposition === 'UNKNOWN' ? 'UNKNOWN' : disposition === 'FAIL' ? 'FAILED' : null;
  const dispatchId = typeof payload.dispatchId === 'string' ? payload.dispatchId : null;
  await commitJobMutation(env, job, {
    entityType: job.kind === 'EMAIL' ? 'DISPATCH' : 'PROPOSAL_VERSION',
    entityId: dispatchId ?? job.aggregate_id,
    clientId: typeof payload.clientId === 'string' ? payload.clientId : undefined,
    engagementId: typeof payload.engagementId === 'string' ? payload.engagementId : undefined,
    details: { jobId: job.id, status, errorCode: failure.code, errorMessage: failure.message },
    statements: [
      env.DB.prepare(`UPDATE outbox_jobs SET status=?,last_error_code=?,next_attempt_at=?,completed_at=?,lease_until=NULL,updated_at=?,version=version+1
        WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(status, failure.code, nextAttempt, status === 'RETRYABLE_FAILED' ? null : now, now, job.workspace_id, job.id, job.lease_until),
      ...(dispatchId && dispatchStatus ? [env.DB.prepare(`UPDATE dispatches SET status=?,updated_at=?,version=version+1
          WHERE workspace_id=? AND id=? AND job_id=? AND status='QUEUED'`)
        .bind(dispatchStatus, now, job.workspace_id, dispatchId, job.id)] : [])
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
  const payload = parsePayload(job);
  const now = nowIso();
  await commitJobMutation(env, job, {
    entityType: 'DISPATCH', entityId: payload.dispatchId ?? job.aggregate_id,
    clientId: payload.clientId, engagementId: payload.engagementId,
    details: { jobId: job.id, status: 'UNKNOWN', errorCode: 'EMAIL_PROVIDER_OUTCOME_UNKNOWN',
      errorMessage: 'The Worker stopped after the provider call began. Reconcile the provider record before any retry.' },
    statements: [
      env.DB.prepare(`UPDATE outbox_jobs SET status='UNKNOWN',last_error_code='EMAIL_PROVIDER_OUTCOME_UNKNOWN',completed_at=?,lease_until=NULL,updated_at=?,version=version+1
        WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(now, now, job.workspace_id, job.id, job.lease_until),
      ...(payload.dispatchId ? [env.DB.prepare(`UPDATE dispatches SET status='UNKNOWN',updated_at=?,version=version+1
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
      WHERE j.kind IN ('GENERATE_DOCUMENT','EMAIL') AND (
        (j.status IN ('PENDING','RETRYABLE_FAILED') AND j.next_attempt_at<=?)
        OR (j.status='RUNNING' AND j.kind='GENERATE_DOCUMENT' AND j.lease_until IS NOT NULL AND j.lease_until<=?)
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
      if (job.kind === 'GENERATE_DOCUMENT') await renderAndStoreProposal(env, job);
      else await dispatchProposal(env, job);
      processed += 1;
    } catch (error) {
      try { await recordJobFailure(env, job, error); processed += 1; }
      catch (recordError) { console.error('business job result could not be committed', job.id, String(recordError)); }
    }
  }
  return processed;
}
