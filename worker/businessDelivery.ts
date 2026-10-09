import * as z from 'zod';
import type { Env } from './env';
import { ApiError } from './errors';
import { sha256Hex } from './http';
import { getBusinessAcceptanceGate } from './businessRisk';
import { prepareBusinessPaymentJournal } from './businessPractice';
import type { BusinessContext, BusinessMutation } from './business';

const uuid = z.uuid();
const date = z.iso.date();
const positiveMoney = z.string().regex(/^[1-9][0-9]{0,15}$/).refine(value => Number.isSafeInteger(Number(value)), 'Enter a positive QAR minor-unit amount.');
const serviceType = z.enum(['STATUTORY_AUDIT','INTERNAL_AUDIT','AGREED_UPON_PROCEDURES']);
const templateSave = z.strictObject({
  type: z.literal('document-template.save'), payload: z.strictObject({ serviceType, name: z.string().trim().min(1).max(200), clauses: z.string().trim().min(20).max(30000), expectedRevision: z.number().int().nonnegative().nullable() })
});
const signatureDecision = z.strictObject({
  type: z.literal('signature-asset.consent'), payload: z.strictObject({ fileVersionId: uuid, decision: z.enum(['CONSENT','REVOKE']), rationale: z.string().trim().min(10).max(2000) })
});
const sealDecision = z.strictObject({
  type: z.literal('seal-asset.approve'), payload: z.strictObject({ fileVersionId: uuid, decision: z.enum(['APPROVE','REVOKE']), rationale: z.string().trim().min(10).max(2000) })
});
const taxPolicySave = z.strictObject({
  type: z.literal('billing.tax-policy.save'), payload: z.strictObject({ name: z.string().trim().min(1).max(200), taxBasisPoints: z.number().int().min(0).max(100000), rationale: z.string().trim().min(10).max(2000) })
});
const letterGenerate = z.strictObject({
  type: z.literal('engagementLetter.generate'), payload: z.strictObject({ engagementId: uuid, templateVersionId: uuid, signatureFileVersionId: uuid, sealFileVersionId: uuid })
});
const letterIssue = z.strictObject({
  type: z.literal('engagementLetter.issue'), payload: z.strictObject({
    engagementId: uuid, jobId: uuid, expectedProposalVersionId: uuid, expectedRiskClearanceId: uuid,
    contactRouteId: uuid, invoiceContactRouteId: uuid, invoiceDueDate: date
  })
});
const advanceInvoiceIssue = z.strictObject({
  type: z.literal('invoice.issueAdvance'), payload: z.strictObject({ engagementId: uuid, engagementLetterId: uuid, dueDate: date, contactRouteId: uuid })
});
const allocation = z.strictObject({ invoiceId: uuid, amountMinor: positiveMoney });
const paymentRecord = z.strictObject({
  type: z.literal('payment.record'), payload: z.strictObject({
    clientId: uuid, engagementId: uuid, amountMinor: positiveMoney, receivedOn: date,
    method: z.enum(['BANK_TRANSFER','CHEQUE','CASH']), reference: z.string().trim().min(1).max(200),
    evidenceFileId: uuid, receiptContactRouteId: uuid, allocations: z.array(allocation).max(50)
  })
});
const paymentReverse = z.strictObject({
  type: z.literal('payment.reverse'), payload: z.strictObject({ paymentId: uuid, rationale: z.string().trim().min(10).max(2000) })
});

export const businessDeliveryCommands = [templateSave, signatureDecision, sealDecision, taxPolicySave, letterGenerate, letterIssue, advanceInvoiceIssue, paymentRecord, paymentReverse] as const;
export const businessDeliveryCommandSchema = z.discriminatedUnion('type', businessDeliveryCommands);
export type BusinessDeliveryCommand = z.infer<typeof businessDeliveryCommandSchema>;

export function isBusinessDeliveryCommand(command: { type: string }): command is BusinessDeliveryCommand {
  return ['document-template.save','signature-asset.consent','seal-asset.approve','billing.tax-policy.save','engagementLetter.generate',
    'engagementLetter.issue','invoice.issueAdvance','payment.record','payment.reverse'].includes(command.type);
}

function requireAction(context: BusinessContext, action: string): void {
  if (!context.allowedActions.includes(action)) throw new ApiError('PERSONA_ACTION_DENIED', 'This actor profile cannot perform the requested commercial delivery action.');
}

function requirePartner(context: BusinessContext): void {
  if (context.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only the Partner profile can approve firm document and tax policy versions.');
  }
}

function requireClientScope(context: BusinessContext, clientId: string): void {
  if (context.scope.clientId && context.scope.clientId !== clientId) throw new ApiError('FORBIDDEN_SCOPE', 'The commercial record is outside the selected client.');
}

function safeMoney(value: number | bigint): number {
  const amount = typeof value === 'bigint' ? value : BigInt(value);
  if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new ApiError('VALIDATION_FAILED', 'The QAR amount exceeds the supported safe integer range.');
  return Number(amount);
}

function qatarToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

interface EngagementPin {
  engagementId: string;
  clientId: string;
  code: string;
  version: number;
  lifecycleState: string;
  proposalVersionId: string;
  proposalRevision: number;
  feeMinor: number;
  periodStart: string;
  periodEnd: string;
  serviceType: string;
  clientName: string;
  firmName: string;
  submissionDeadline: string;
}

async function currentLetterPins(env: Env, workspaceId: string, context: BusinessContext, engagementId: string): Promise<{
  engagement: EngagementPin; proposalVersionId: string; acceptanceId: string; clearanceId: string; dependencyHash: string;
}> {
  requireAction(context, 'engagementLetter.manage');
  const gate = await getBusinessAcceptanceGate(env, workspaceId, context, engagementId) as any;
  if (!gate.ready) throw new ApiError('GATE_BLOCKED', 'A current client commercial acceptance and Partner risk clearance are required before generating an engagement letter.', { blockers: gate.blockers });
  if (gate.lifecycleState !== 'ADVANCE_BILLING') throw new ApiError('INVALID_TRANSITION', 'Engagement letters can only be prepared during advance billing.');
  const row = await env.DB.prepare(`SELECT e.id AS engagement_id,e.version,e.client_id,e.code,e.lifecycle_state,e.period_start,e.period_end,e.engagement_type,
      pv.id AS proposal_version_id,pv.revision,pv.fee_minor,pv.timeline_json,c.legal_name AS client_name,fp.legal_name AS firm_name
    FROM engagements e JOIN proposals p ON p.workspace_id=e.workspace_id AND p.engagement_id=e.id
    JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.id=p.current_version_id AND pv.id=e.active_proposal_version_id
    JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id AND c.active=1
    JOIN firm_profiles fp ON fp.workspace_id=e.workspace_id
    WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId, engagementId)
    .first<Record<string, unknown> & { engagement_id: string; version: number; client_id: string; code: string; lifecycle_state: string; proposal_version_id: string; revision: number; fee_minor: number; timeline_json: string; period_start: string; period_end: string; engagement_type: string; client_name: string; firm_name: string }>();
  if (!row) throw new ApiError('NOT_FOUND', 'The active engagement, proposal or approved firm profile was not found.');
  requireClientScope(context, row.client_id);
  if (context.scope.engagementId && context.scope.engagementId !== engagementId) throw new ApiError('FORBIDDEN_SCOPE', 'The engagement does not match the selected request context.');
  const commercialKey = gate.commercialKey as { acceptanceId?: string; proposalVersionId?: string };
  const riskKey = gate.riskKey as { clearanceId?: string };
  if (!commercialKey.acceptanceId || commercialKey.proposalVersionId !== row.proposal_version_id || !riskKey.clearanceId) {
    throw new ApiError('STALE_APPROVAL', 'The current client acceptance or Partner clearance no longer pins the active proposal revision.');
  }
  let timeline: Array<{ name: string; date: string }>;
  try {
    const parsed = JSON.parse(row.timeline_json) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.some(item => !item || typeof item.name !== 'string' || typeof item.date !== 'string')) throw new Error('invalid timeline');
    timeline = parsed as Array<{ name: string; date: string }>;
  } catch {
    throw new ApiError('GATE_BLOCKED', 'The accepted proposal has no verified delivery timetable; revise it before issuing engagement terms.');
  }
  const submissionDeadline = timeline[timeline.length - 1].date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(submissionDeadline)) throw new ApiError('GATE_BLOCKED', 'The final accepted timetable milestone must have an explicit submission deadline.');
  const dependencyHash = await sha256Hex(JSON.stringify({
    engagementId, engagementVersion: row.version, proposalVersionId: row.proposal_version_id,
    acceptanceId: commercialKey.acceptanceId, clearanceId: riskKey.clearanceId
  }));
  return {
    engagement: {
      engagementId: row.engagement_id, clientId: row.client_id, code: row.code, version: row.version, lifecycleState: row.lifecycle_state,
      proposalVersionId: row.proposal_version_id, proposalRevision: row.revision, feeMinor: row.fee_minor,
      periodStart: row.period_start, periodEnd: row.period_end, serviceType: row.engagement_type,
      clientName: row.client_name, firmName: row.firm_name, submissionDeadline
    },
    proposalVersionId: row.proposal_version_id, acceptanceId: commercialKey.acceptanceId, clearanceId: riskKey.clearanceId, dependencyHash
  };
}

async function committedPng(env: Env, workspaceId: string, fileId: string, purpose: 'SIGNATURE' | 'SEAL'): Promise<{ id: string; sha256: string; created_by_actor_id: string | null }> {
  const file = await env.DB.prepare(`SELECT id,sha256,created_by_actor_id FROM file_versions
    WHERE workspace_id=? AND id=? AND purpose=? AND media_type='image/png' AND client_id IS NULL AND engagement_id IS NULL
      AND state='COMMITTED' AND immutable=1 AND sha256 IS NOT NULL`).bind(workspaceId, fileId, purpose)
    .first<{ id: string; sha256: string; created_by_actor_id: string | null }>();
  if (!file) throw new ApiError('GATE_BLOCKED', `Select a committed workspace PNG stored for ${purpose.toLowerCase()} use.`);
  return file;
}

async function buildTemplateSave(env: Env, workspaceId: string, context: BusinessContext, command: Extract<BusinessDeliveryCommand,{type:'document-template.save'}>, now: string): Promise<BusinessMutation> {
  requirePartner(context);
  const { serviceType: selectedService, name, clauses, expectedRevision } = command.payload;
  const current = await env.DB.prepare(`SELECT MAX(revision) AS revision FROM document_template_versions WHERE workspace_id=? AND service_type=?`)
    .bind(workspaceId, selectedService).first<{ revision: number | null }>();
  const revision = (current?.revision ?? 0);
  if (expectedRevision !== revision) throw new ApiError('VERSION_CONFLICT', 'The approved template set changed. Reload before creating a new revision.');
  const templateVersionId = crypto.randomUUID();
  const contentSha256 = await sha256Hex(JSON.stringify({ selectedService, name, clauses }));
  return {
    statements: [env.DB.prepare(`INSERT INTO document_template_versions(id,workspace_id,version,service_type,revision,name,clauses,content_sha256,approved_by_actor_id,approved_at)
      VALUES(?,?,1,?,?,?,?,?,?,?)`).bind(templateVersionId, workspaceId, selectedService, revision + 1, name, clauses, contentSha256, context.actor.id, now)],
    result: { templateVersionId, serviceType: selectedService, revision: revision + 1, contentSha256 },
    entityType: 'DOCUMENT_TEMPLATE_VERSION', entityId: templateVersionId, beforeVersion: revision || null, afterVersion: revision + 1,
    auditDetails: { serviceType: selectedService, revision: revision + 1, contentSha256 }
  };
}

async function buildSignatureDecision(env: Env, workspaceId: string, context: BusinessContext, command: Extract<BusinessDeliveryCommand,{type:'signature-asset.consent'}>, now: string): Promise<BusinessMutation> {
  requirePartner(context);
  const file = await committedPng(env, workspaceId, command.payload.fileVersionId, 'SIGNATURE');
  if (file.created_by_actor_id && file.created_by_actor_id !== context.actor.id) throw new ApiError('PERSONA_ACTION_DENIED', 'A Partner can consent only to a signature image they uploaded under their selected profile.');
  const last = await env.DB.prepare(`SELECT sequence,decision FROM signature_asset_decisions WHERE workspace_id=? AND file_version_id=? ORDER BY sequence DESC LIMIT 1`)
    .bind(workspaceId, file.id).first<{ sequence: number; decision: string }>();
  if (last?.decision === command.payload.decision) throw new ApiError('VERSION_CONFLICT', 'That signature asset already has the requested current consent state.');
  const id = crypto.randomUUID();
  return {
    statements: [env.DB.prepare(`INSERT INTO signature_asset_decisions(id,workspace_id,sequence,file_version_id,decision,partner_actor_id,rationale,decided_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(id, workspaceId, (last?.sequence ?? 0) + 1, file.id, command.payload.decision, context.actor.id, command.payload.rationale, now)],
    result: { decisionId: id, fileVersionId: file.id, decision: command.payload.decision, provenance: 'SELF_ASSERTED_PARTNER_PROFILE' },
    entityType: 'SIGNATURE_ASSET_DECISION', entityId: id, beforeVersion: last?.sequence ?? null, afterVersion: (last?.sequence ?? 0) + 1
  };
}

async function buildSealDecision(env: Env, workspaceId: string, context: BusinessContext, command: Extract<BusinessDeliveryCommand,{type:'seal-asset.approve'}>, now: string): Promise<BusinessMutation> {
  requirePartner(context);
  const file = await committedPng(env, workspaceId, command.payload.fileVersionId, 'SEAL');
  const last = await env.DB.prepare(`SELECT sequence,decision FROM seal_asset_approvals WHERE workspace_id=? AND file_version_id=? ORDER BY sequence DESC LIMIT 1`)
    .bind(workspaceId, file.id).first<{ sequence: number; decision: string }>();
  if (last?.decision === command.payload.decision) throw new ApiError('VERSION_CONFLICT', 'That firm seal already has the requested current approval state.');
  const id = crypto.randomUUID();
  return {
    statements: [env.DB.prepare(`INSERT INTO seal_asset_approvals(id,workspace_id,sequence,file_version_id,decision,partner_actor_id,rationale,decided_at)
      VALUES(?,?,?,?,?,?,?,?)`).bind(id, workspaceId, (last?.sequence ?? 0) + 1, file.id, command.payload.decision, context.actor.id, command.payload.rationale, now)],
    result: { approvalId: id, fileVersionId: file.id, decision: command.payload.decision },
    entityType: 'SEAL_ASSET_APPROVAL', entityId: id, beforeVersion: last?.sequence ?? null, afterVersion: (last?.sequence ?? 0) + 1
  };
}

async function buildTaxPolicySave(env: Env, workspaceId: string, context: BusinessContext, command: Extract<BusinessDeliveryCommand,{type:'billing.tax-policy.save'}>, now: string): Promise<BusinessMutation> {
  requirePartner(context);
  const prior = await env.DB.prepare(`SELECT MAX(revision) AS revision FROM billing_tax_policy_versions WHERE workspace_id=?`).bind(workspaceId).first<{ revision: number | null }>();
  const revision = (prior?.revision ?? 0) + 1;
  const id = crypto.randomUUID();
  return {
    statements: [env.DB.prepare(`INSERT INTO billing_tax_policy_versions(id,workspace_id,version,revision,name,tax_basis_points,rationale,approved_by_actor_id,approved_at)
      VALUES(?,?,1,?,?,?,?,?,?)`).bind(id, workspaceId, revision, command.payload.name, command.payload.taxBasisPoints, command.payload.rationale, context.actor.id, now)],
    result: { taxPolicyVersionId: id, revision, taxBasisPoints: command.payload.taxBasisPoints, status: 'APPROVED_CONFIGURATION' },
    entityType: 'BILLING_TAX_POLICY_VERSION', entityId: id, beforeVersion: prior?.revision ?? null, afterVersion: revision,
    auditDetails: { revision, name: command.payload.name, taxBasisPoints: command.payload.taxBasisPoints, rationale: command.payload.rationale }
  };
}

async function buildLetterGenerate(env: Env, workspaceId: string, context: BusinessContext, command: Extract<BusinessDeliveryCommand,{type:'engagementLetter.generate'}>, commandId: string, now: string): Promise<BusinessMutation> {
  requirePartner(context);
  const pins = await currentLetterPins(env, workspaceId, context, command.payload.engagementId);
  const [template, signature, seal] = await Promise.all([
    env.DB.prepare(`SELECT id,service_type,revision,content_sha256 FROM document_template_versions WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, command.payload.templateVersionId).first<{ id: string; service_type: string; revision: number; content_sha256: string }>(),
    committedPng(env, workspaceId, command.payload.signatureFileVersionId, 'SIGNATURE'),
    committedPng(env, workspaceId, command.payload.sealFileVersionId, 'SEAL')
  ]);
  if (!template || template.service_type !== pins.engagement.serviceType) throw new ApiError('GATE_BLOCKED', 'Choose a Partner-approved engagement letter template for this exact service type.');
  if (!signature.created_by_actor_id || signature.created_by_actor_id !== context.actor.id) throw new ApiError('PERSONA_ACTION_DENIED', 'The selected signature image must be uploaded by this Partner profile and explicitly consented.');
  const [consent, sealApproval, templateCurrent, signatureCurrent, sealCurrent] = await Promise.all([
    env.DB.prepare(`SELECT id,decision FROM signature_asset_decisions WHERE workspace_id=? AND file_version_id=? ORDER BY sequence DESC LIMIT 1`)
      .bind(workspaceId, signature.id).first<{ id: string; decision: string }>(),
    env.DB.prepare(`SELECT id,decision FROM seal_asset_approvals WHERE workspace_id=? AND file_version_id=? ORDER BY sequence DESC LIMIT 1`)
      .bind(workspaceId, seal.id).first<{ id: string; decision: string }>(),
    env.DB.prepare(`SELECT MAX(revision) AS revision FROM document_template_versions WHERE workspace_id=? AND service_type=?`)
      .bind(workspaceId, pins.engagement.serviceType).first<{ revision: number }>(),
    env.DB.prepare(`SELECT sha256 FROM file_versions WHERE workspace_id=? AND id=?`).bind(workspaceId, signature.id).first<{ sha256: string }>(),
    env.DB.prepare(`SELECT sha256 FROM file_versions WHERE workspace_id=? AND id=?`).bind(workspaceId, seal.id).first<{ sha256: string }>()
  ]);
  if (!consent || consent.decision !== 'CONSENT') throw new ApiError('GATE_BLOCKED', 'The Partner has not consented to use this exact signature image.');
  if (!sealApproval || sealApproval.decision !== 'APPROVE') throw new ApiError('GATE_BLOCKED', 'The Partner has not approved use of this exact firm seal PNG.');
  if (template.revision !== templateCurrent?.revision) throw new ApiError('STALE_APPROVAL', 'Only the current approved template revision can be used to start a new letter.');
  const latest = await env.DB.prepare(`SELECT COALESCE(MAX(revision),0) AS revision FROM engagement_letter_drafts WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId, pins.engagement.engagementId).first<{ revision: number }>();
  const revision = (latest?.revision ?? 0) + 1;
  const dependencyHash = await sha256Hex(JSON.stringify({
    base: pins.dependencyHash, templateVersionId: template.id, templateHash: template.content_sha256,
    signatureFileVersionId: signature.id, signatureSha256: signatureCurrent?.sha256, signatureConsentId: consent.id,
    sealFileVersionId: seal.id, sealSha256: sealCurrent?.sha256, sealApprovalId: sealApproval.id
  }));
  const draftId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const dedup = `engagement-letter:${draftId}`;
  const payload = { documentType: 'ENGAGEMENT_LETTER', draftId, commandId, engagementId: pins.engagement.engagementId, clientId: pins.engagement.clientId };
  const created = new Date(now).toISOString();
  return {
    statements: [
      env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
        VALUES(?,?,1,'GENERATE_DOCUMENT',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
        .bind(jobId, workspaceId, draftId, revision, JSON.stringify(payload), dedup, created, created, created),
      env.DB.prepare(`INSERT INTO engagement_letter_drafts(id,workspace_id,version,client_id,engagement_id,revision,proposal_version_id,commercial_acceptance_id,risk_clearance_id,template_version_id,signature_file_version_id,signature_consent_id,seal_file_version_id,seal_approval_id,dependency_hash,status,job_id,artifact_id,file_version_id,error_code,created_by_actor_id,created_at,updated_at)
        VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING',?,NULL,NULL,NULL,?,?,?)`)
        .bind(draftId, workspaceId, pins.engagement.clientId, pins.engagement.engagementId, revision, pins.proposalVersionId,
          pins.acceptanceId, pins.clearanceId, template.id, signature.id, consent.id, seal.id, sealApproval.id, dependencyHash,
          jobId, context.actor.id, created, created)
    ],
    result: { draftId, jobId, status: 'PENDING', revision }, entityType: 'ENGAGEMENT_LETTER_DRAFT', entityId: draftId,
    beforeVersion: null, afterVersion: 1, auditDetails: { jobId, engagementId: pins.engagement.engagementId, dependencyHash }
  };
}

async function buildLetterIssue(env: Env, workspaceId: string, context: BusinessContext, command: Extract<BusinessDeliveryCommand,{type:'engagementLetter.issue'}>, now: string): Promise<BusinessMutation> {
  requirePartner(context);
  requireAction(context, 'invoice.issue');
  const { engagementId, jobId, expectedProposalVersionId, expectedRiskClearanceId, contactRouteId, invoiceContactRouteId, invoiceDueDate } = command.payload;
  const pins = await currentLetterPins(env, workspaceId, context, engagementId);
  if (pins.proposalVersionId !== expectedProposalVersionId || pins.clearanceId !== expectedRiskClearanceId) throw new ApiError('STALE_APPROVAL', 'The current dual acceptance keys changed while the letter was rendering. Generate a new revision.');
  if (invoiceDueDate < qatarToday()) throw new ApiError('VALIDATION_FAILED', 'The advance invoice due date cannot be before today in Asia/Qatar.');
  const draft = await env.DB.prepare(`SELECT d.id,d.version,d.revision,d.client_id,d.engagement_id,d.proposal_version_id,d.commercial_acceptance_id,d.risk_clearance_id,
      d.template_version_id,d.signature_file_version_id,d.signature_consent_id,d.seal_file_version_id,d.seal_approval_id,d.dependency_hash,d.status,d.artifact_id,d.file_version_id,
      ga.content_sha256,gj.status AS job_status
    FROM engagement_letter_drafts d JOIN outbox_jobs gj ON gj.workspace_id=d.workspace_id AND gj.id=d.job_id
    JOIN generated_artifacts ga ON ga.workspace_id=d.workspace_id AND ga.id=d.artifact_id
    WHERE d.workspace_id=? AND d.engagement_id=? AND d.job_id=? AND d.proposal_version_id=? AND d.risk_clearance_id=?`)
    .bind(workspaceId, engagementId, jobId, expectedProposalVersionId, expectedRiskClearanceId)
    .first<Record<string, unknown> & { id: string; version: number; revision: number; client_id: string; engagement_id: string; proposal_version_id: string; commercial_acceptance_id: string; risk_clearance_id: string; template_version_id: string; signature_file_version_id: string; signature_consent_id: string; seal_file_version_id: string; seal_approval_id: string; dependency_hash: string; status: string; artifact_id: string; file_version_id: string; content_sha256: string; job_status: string }>();
  if (!draft || draft.status !== 'SUCCEEDED' || draft.job_status !== 'SUCCEEDED') throw new ApiError('GATE_BLOCKED', 'Wait for the pinned engagement letter render job to succeed before issue.');
  const alreadyIssued = await env.DB.prepare(`SELECT id FROM engagement_letters WHERE workspace_id=? AND engagement_id=?
    AND proposal_version_id=? AND commercial_acceptance_id=? AND risk_clearance_id=? LIMIT 1`)
    .bind(workspaceId, engagementId, draft.proposal_version_id, draft.commercial_acceptance_id, draft.risk_clearance_id).first<{ id: string }>();
  if (alreadyIssued) throw new ApiError('VERSION_CONFLICT', 'A letter is already issued for these exact acceptance keys.');
  const issuedBefore = await env.DB.prepare(`SELECT id FROM engagement_letters WHERE workspace_id=? AND engagement_id=? AND revision=?`)
    .bind(workspaceId, engagementId, draft.revision).first<{ id: string }>();
  if (issuedBefore) throw new ApiError('VERSION_CONFLICT', 'This letter revision has already been issued.');
  const route = await env.DB.prepare(`SELECT cr.version,cr.client_id,cr.contact_id,ct.full_name,ct.email
    FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
    WHERE cr.workspace_id=? AND cr.id=? AND cr.purpose='EL' AND cr.client_id=? AND cr.is_primary=1 AND ct.active=1 AND ct.email IS NOT NULL`)
    .bind(workspaceId, contactRouteId, pins.engagement.clientId)
    .first<{ version: number; client_id: string; contact_id: string; full_name: string; email: string }>();
  if (!route) throw new ApiError('GATE_BLOCKED', 'Select the active primary EL contact route for this client.');
  const invoiceRoute = await env.DB.prepare(`SELECT cr.version,cr.client_id,cr.contact_id,ct.full_name,ct.email
    FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
    WHERE cr.workspace_id=? AND cr.id=? AND cr.purpose='INVOICE' AND cr.client_id=? AND cr.is_primary=1
      AND ct.active=1 AND ct.role='CFO_FINANCE_DIRECTOR' AND ct.email IS NOT NULL`)
    .bind(workspaceId, invoiceContactRouteId, pins.engagement.clientId)
    .first<{ version: number; client_id: string; contact_id: string; full_name: string; email: string }>();
  if (!invoiceRoute) throw new ApiError('GATE_BLOCKED', 'Select the active primary CFO/Finance Director invoice route for this client.');
  const taxPolicy = await env.DB.prepare(`SELECT id,revision,name,tax_basis_points FROM billing_tax_policy_versions
    WHERE workspace_id=? ORDER BY revision DESC LIMIT 1`).bind(workspaceId)
    .first<{ id: string; revision: number; name: string; tax_basis_points: number }>();
  if (!taxPolicy) throw new ApiError('GATE_BLOCKED', 'A Partner-approved explicit tax policy is required before the engagement letter and advance invoice can be issued.');
  const latestTemplate = await env.DB.prepare(`SELECT MAX(revision) AS revision FROM document_template_versions WHERE workspace_id=? AND service_type=?`)
    .bind(workspaceId, pins.engagement.serviceType).first<{ revision: number }>();
  const template = await env.DB.prepare(`SELECT revision,content_sha256 FROM document_template_versions WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, draft.template_version_id).first<{ revision: number; content_sha256: string }>();
  const [consent, signatureFile, sealFile] = await Promise.all([
    env.DB.prepare(`SELECT id,decision FROM signature_asset_decisions WHERE workspace_id=? AND file_version_id=? ORDER BY sequence DESC LIMIT 1`)
      .bind(workspaceId, draft.signature_file_version_id).first<{ id: string; decision: string }>(),
    env.DB.prepare(`SELECT sha256 FROM file_versions WHERE workspace_id=? AND id=?`).bind(workspaceId, draft.signature_file_version_id).first<{ sha256: string }>(),
    env.DB.prepare(`SELECT sha256 FROM file_versions WHERE workspace_id=? AND id=?`).bind(workspaceId, draft.seal_file_version_id).first<{ sha256: string }>()
  ]);
  const sealApproval = await env.DB.prepare(`SELECT id,decision FROM seal_asset_approvals WHERE workspace_id=? AND file_version_id=? ORDER BY sequence DESC LIMIT 1`)
    .bind(workspaceId, draft.seal_file_version_id).first<{ id: string; decision: string }>();
  if (template?.revision !== latestTemplate?.revision || consent?.id !== draft.signature_consent_id || consent.decision !== 'CONSENT'
    || sealApproval?.id !== draft.seal_approval_id || sealApproval.decision !== 'APPROVE') {
    throw new ApiError('STALE_APPROVAL', 'The approved template, signature consent or seal approval changed after rendering. Generate a new letter revision.');
  }
  const currentDependencyHash = await sha256Hex(JSON.stringify({
    base: pins.dependencyHash, templateVersionId: draft.template_version_id, templateHash: template?.content_sha256,
    signatureFileVersionId: draft.signature_file_version_id, signatureSha256: signatureFile?.sha256, signatureConsentId: consent.id,
    sealFileVersionId: draft.seal_file_version_id, sealSha256: sealFile?.sha256, sealApprovalId: sealApproval.id
  }));
  if (draft.dependency_hash !== currentDependencyHash) throw new ApiError('STALE_APPROVAL', 'The engagement, proposal, acceptance key, clearance, template or image asset changed after render. Generate the letter again.');
  const letterId = crypto.randomUUID();
  const invoiceId = crypto.randomUUID();
  const invoiceNumber = `AS-${pins.engagement.code.replace(/[^A-Z0-9]/gi, '').toUpperCase()}-ADV-${invoiceId.slice(0, 8).toUpperCase()}`;
  const advanceMinor = safeMoney((BigInt(pins.engagement.feeMinor) + 1n) / 2n);
  const taxMinor = safeMoney((BigInt(advanceMinor) * BigInt(taxPolicy.tax_basis_points) + 5000n) / 10000n);
  const totalMinor = safeMoney(BigInt(advanceMinor) + BigInt(taxMinor));
  const timestamp = new Date(now).toISOString();
  const recipientSnapshot = JSON.stringify({ contactRouteId, contactRouteVersion: route.version, contactId: route.contact_id, name: route.full_name, email: route.email });
  const invoiceRecipient = { contactRouteId: invoiceContactRouteId, contactRouteVersion: invoiceRoute.version,
    contactId: invoiceRoute.contact_id, name: invoiceRoute.full_name, email: invoiceRoute.email };
  const dispatchId = crypto.randomUUID();
  const emailJobId = crypto.randomUUID();
  const dispatchDedup = `engagement-letter-email:${letterId}`;
  const emailPayload = { documentType: 'COMMERCIAL_EMAIL', commandId: crypto.randomUUID(), engagementId, clientId: pins.engagement.clientId,
    dispatchId, fileVersionId: draft.file_version_id, recipient: { contactRouteId, contactRouteVersion: route.version, name: route.full_name, email: route.email },
    subject: `Engagement letter ${pins.engagement.engagementId}`, body: `Please find the issued engagement letter for ${pins.engagement.clientName} attached.` };
  return {
    statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,79,CASE WHEN EXISTS(SELECT 1 FROM engagements e JOIN proposals p ON p.workspace_id=e.workspace_id AND p.engagement_id=e.id
          JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.id=p.current_version_id AND pv.id=e.active_proposal_version_id
          JOIN engagement_letter_drafts d ON d.workspace_id=e.workspace_id AND d.engagement_id=e.id AND d.job_id=? AND d.status='SUCCEEDED'
          JOIN risk_clearances rc ON rc.workspace_id=e.workspace_id AND rc.id=? AND rc.decision='CLEAR'
          WHERE e.workspace_id=? AND e.id=? AND e.version=? AND e.lifecycle_state='ADVANCE_BILLING' AND pv.id=? AND d.risk_clearance_id=rc.id
            AND EXISTS(SELECT 1 FROM commercial_acceptances ca WHERE ca.workspace_id=e.workspace_id AND ca.id=d.commercial_acceptance_id
              AND ca.engagement_id=e.id AND ca.proposal_version_id=pv.id AND ca.decision='ACCEPT' AND ca.accepted_fee_minor=pv.fee_minor
              AND ca.sequence=(SELECT MAX(latest.sequence) FROM commercial_acceptances latest WHERE latest.workspace_id=ca.workspace_id AND latest.proposal_version_id=ca.proposal_version_id))
            AND EXISTS(SELECT 1 FROM contact_routes er JOIN contacts ec ON ec.workspace_id=er.workspace_id AND ec.client_id=er.client_id AND ec.id=er.contact_id
              WHERE er.workspace_id=? AND er.id=? AND er.version=? AND er.client_id=e.client_id AND er.purpose='EL' AND er.is_primary=1
                AND ec.id=? AND ec.full_name=? AND ec.email=? AND ec.active=1)
            AND EXISTS(SELECT 1 FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
              WHERE cr.workspace_id=? AND cr.id=? AND cr.version=? AND cr.client_id=e.client_id AND cr.purpose='INVOICE' AND cr.is_primary=1
                AND ct.id=? AND ct.full_name=? AND ct.email=? AND ct.role='CFO_FINANCE_DIRECTOR' AND ct.active=1)
            AND EXISTS(SELECT 1 FROM billing_tax_policy_versions tp WHERE tp.workspace_id=? AND tp.id=?
              AND tp.revision=(SELECT MAX(latest.revision) FROM billing_tax_policy_versions latest WHERE latest.workspace_id=tp.workspace_id)))
        THEN 1 ELSE 0 END`).bind(workspaceId, jobId, expectedRiskClearanceId, workspaceId, engagementId, pins.engagement.version, expectedProposalVersionId,
        workspaceId, contactRouteId, route.version, route.contact_id, route.full_name, route.email,
        workspaceId, invoiceContactRouteId, invoiceRoute.version, invoiceRoute.contact_id, invoiceRoute.full_name, invoiceRoute.email, workspaceId, taxPolicy.id),
      env.DB.prepare(`INSERT INTO engagement_letters(id,workspace_id,version,client_id,engagement_id,revision,proposal_version_id,commercial_acceptance_id,risk_clearance_id,template_version_id,artifact_id,file_version_id,signature_file_version_id,signature_consent_id,seal_file_version_id,seal_approval_id,content_sha256,fee_minor,period_start,period_end,issued_by_actor_id,issued_at)
        VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(letterId, workspaceId, pins.engagement.clientId, engagementId, draft.revision, draft.proposal_version_id, draft.commercial_acceptance_id,
          draft.risk_clearance_id, draft.template_version_id, draft.artifact_id, draft.file_version_id, draft.signature_file_version_id,
          draft.signature_consent_id, draft.seal_file_version_id, draft.seal_approval_id, draft.content_sha256, pins.engagement.feeMinor,
          pins.engagement.periodStart, pins.engagement.periodEnd, context.actor.id, timestamp),
      env.DB.prepare(`UPDATE engagement_letter_drafts SET status='ISSUED',version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='SUCCEEDED'`)
        .bind(timestamp, workspaceId, draft.id, draft.version),
      env.DB.prepare(`INSERT INTO invoices(id,workspace_id,version,client_id,engagement_id,engagement_letter_id,kind,number,fee_revision_id,tax_policy_version_id,subtotal_minor,tax_minor,total_minor,currency,issue_date,due_date,contact_route_id,recipient_snapshot_json,status,artifact_id,file_version_id,corrects_invoice_id,created_by_actor_id,issued_at,created_at,updated_at)
        VALUES(?,?,1,?,? ,?,'ADVANCE',?,?,?,?,?,?,'QAR',NULL,?,?,?,'PENDING_DOCUMENT',NULL,NULL,NULL,?,NULL,?,?)`)
        .bind(invoiceId, workspaceId, pins.engagement.clientId, engagementId, letterId, invoiceNumber, pins.proposalVersionId,
          taxPolicy.id, advanceMinor, taxMinor, totalMinor, invoiceDueDate, invoiceContactRouteId, JSON.stringify(invoiceRecipient),
          context.actor.id, timestamp, timestamp),
      env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
        VALUES(?,?,1,'GENERATE_DOCUMENT',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
        .bind(crypto.randomUUID(), workspaceId, invoiceId, 1, JSON.stringify({ documentType: 'ADVANCE_INVOICE', invoiceId, commandId: crypto.randomUUID(),
          engagementId, clientId: pins.engagement.clientId, recipient: invoiceRecipient }), `advance-invoice:${invoiceId}`, timestamp, timestamp, timestamp),
      env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
        VALUES(?,?,1,'EMAIL',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
        .bind(emailJobId, workspaceId, dispatchId, 1, JSON.stringify(emailPayload), dispatchDedup, timestamp, timestamp, timestamp),
      env.DB.prepare(`INSERT INTO dispatches(id,workspace_id,version,client_id,engagement_id,purpose,file_version_id,recipient_snapshot_json,status,provider_message_id,sent_at,deduplication_key,job_id,created_at,updated_at)
        VALUES(?,?,1,?,?,'EL',?,?, 'QUEUED',NULL,NULL,?,?,?,?)`)
        .bind(dispatchId, workspaceId, pins.engagement.clientId, engagementId, draft.file_version_id, recipientSnapshot, dispatchDedup, emailJobId, timestamp, timestamp)
    ],
    result: { letterId, fileId: draft.file_version_id, advanceInvoiceId: invoiceId, advanceInvoiceNumber: invoiceNumber,
      advanceInvoiceSubtotalMinor: String(advanceMinor), advanceInvoiceTaxMinor: String(taxMinor), advanceInvoiceTotalMinor: String(totalMinor),
      advanceInvoiceStatus: 'PENDING_DOCUMENT', invoiceDueDate, state: 'ADVANCE_BILLING', dispatchId, dispatchStatus: 'QUEUED' },
    entityType: 'ENGAGEMENT_LETTER', entityId: letterId, beforeVersion: null, afterVersion: 1,
    auditDetails: { engagementId, proposalVersionId: draft.proposal_version_id, commercialAcceptanceId: draft.commercial_acceptance_id,
      riskClearanceId: draft.risk_clearance_id, templateVersionId: draft.template_version_id, signatureFileVersionId: draft.signature_file_version_id,
      sealFileVersionId: draft.seal_file_version_id, recipient: route.email, invoiceRecipient: invoiceRoute.email, invoiceDueDate,
      invoiceId, invoiceNumber, taxPolicyVersionId: taxPolicy.id }
  };
}

async function buildAdvanceInvoice(env: Env, workspaceId: string, context: BusinessContext, command: Extract<BusinessDeliveryCommand,{type:'invoice.issueAdvance'}>, commandId: string, now: string): Promise<BusinessMutation> {
  requireAction(context, 'invoice.issue');
  const letter = await env.DB.prepare(`SELECT l.id,l.client_id,l.engagement_id,l.proposal_version_id,l.fee_minor,e.version AS engagement_version,e.lifecycle_state,
      e.code AS engagement_code,e.period_start,e.period_end,e.engagement_type,c.legal_name AS client_name,fp.legal_name AS firm_name
    FROM engagement_letters l JOIN engagements e ON e.workspace_id=l.workspace_id AND e.client_id=l.client_id AND e.id=l.engagement_id
    JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id JOIN firm_profiles fp ON fp.workspace_id=e.workspace_id
    WHERE l.workspace_id=? AND l.id=? AND l.engagement_id=?`).bind(workspaceId, command.payload.engagementLetterId, command.payload.engagementId)
    .first<Record<string, unknown> & { id: string; client_id: string; engagement_id: string; proposal_version_id: string; fee_minor: number; engagement_version: number; lifecycle_state: string; engagement_code: string; period_start: string; period_end: string; engagement_type: string; client_name: string; firm_name: string }>();
  if (!letter) throw new ApiError('NOT_FOUND', 'An issued engagement letter is required for advance billing.');
  requireClientScope(context, letter.client_id);
  if (letter.lifecycle_state !== 'ADVANCE_BILLING') throw new ApiError('INVALID_TRANSITION', 'An advance invoice can only be issued while the engagement is in advance billing.');
  if (command.payload.dueDate < qatarToday()) throw new ApiError('VALIDATION_FAILED', 'The invoice due date cannot be before today in Asia/Qatar.');
  const route = await env.DB.prepare(`SELECT cr.version,cr.contact_id,ct.full_name,ct.email FROM contact_routes cr
    JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
    WHERE cr.workspace_id=? AND cr.id=? AND cr.client_id=? AND cr.purpose='INVOICE' AND cr.is_primary=1 AND ct.active=1 AND ct.email IS NOT NULL`)
    .bind(workspaceId, command.payload.contactRouteId, letter.client_id).first<{ version: number; contact_id: string; full_name: string; email: string }>();
  if (!route) throw new ApiError('GATE_BLOCKED', 'Select the active primary INVOICE contact route for this client.');
  const invoice = await env.DB.prepare(`SELECT id,version,status,number,subtotal_minor FROM invoices WHERE workspace_id=? AND engagement_letter_id=? AND kind='ADVANCE'`)
    .bind(workspaceId, letter.id).first<{ id: string; version: number; status: string; number: string; subtotal_minor: number }>();
  if (!invoice) throw new ApiError('NOT_FOUND', 'The engagement letter advance invoice draft was not found.');
  if (invoice.status !== 'DRAFT') throw new ApiError('VERSION_CONFLICT', 'The advance invoice is already being issued or has been issued.');
  const taxPolicy = await env.DB.prepare(`SELECT id,revision,name,tax_basis_points FROM billing_tax_policy_versions WHERE workspace_id=? ORDER BY revision DESC LIMIT 1`)
    .bind(workspaceId).first<{ id: string; revision: number; name: string; tax_basis_points: number }>();
  if (!taxPolicy) throw new ApiError('GATE_BLOCKED', 'A Partner-approved explicit tax policy is required before invoice issue.');
  const subtotal = BigInt(invoice.subtotal_minor);
  const tax = (subtotal * BigInt(taxPolicy.tax_basis_points) + 5000n) / 10000n;
  const total = safeMoney(subtotal + tax);
  const jobId = crypto.randomUUID();
  const dedup = `advance-invoice:${invoice.id}`;
  const nowIso = new Date(now).toISOString();
  const invoiceNumber = `AS-${letter.engagement_code.replace(/[^A-Z0-9]/gi, '').toUpperCase()}-ADV-${invoice.id.slice(0, 8).toUpperCase()}`;
  const recipient = { contactRouteId: command.payload.contactRouteId, contactRouteVersion: route.version, contactId: route.contact_id, name: route.full_name, email: route.email };
  const payload = { documentType: 'ADVANCE_INVOICE', invoiceId: invoice.id, commandId, engagementId: letter.engagement_id, clientId: letter.client_id, recipient };
  return {
    statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,81,CASE WHEN EXISTS(SELECT 1 FROM invoices WHERE workspace_id=? AND id=? AND version=? AND status='DRAFT')
          AND EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state='ADVANCE_BILLING')
        THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, invoice.id, invoice.version, workspaceId, letter.engagement_id, letter.engagement_version),
      env.DB.prepare(`UPDATE invoices SET version=version+1,number=?,tax_policy_version_id=?,tax_minor=?,total_minor=?,due_date=?,contact_route_id=?,recipient_snapshot_json=?,status='PENDING_DOCUMENT',updated_at=?
        WHERE workspace_id=? AND id=? AND version=? AND status='DRAFT'`).bind(invoiceNumber, taxPolicy.id, Number(tax), total, command.payload.dueDate, command.payload.contactRouteId, JSON.stringify(recipient), nowIso, workspaceId, invoice.id, invoice.version),
      env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
        VALUES(?,?,1,'GENERATE_DOCUMENT',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
        .bind(jobId, workspaceId, invoice.id, invoice.version + 1, JSON.stringify(payload), dedup, nowIso, nowIso, nowIso)
    ],
    result: { invoiceId: invoice.id, number: invoiceNumber, subtotalMinor: String(subtotal), taxMinor: String(tax), totalMinor: String(total), currency: 'QAR', status: 'PENDING_DOCUMENT', jobId },
    entityType: 'INVOICE', entityId: invoice.id, beforeVersion: invoice.version, afterVersion: invoice.version + 1,
    auditDetails: { invoiceNumber, engagementLetterId: letter.id, taxPolicyVersionId: taxPolicy.id, taxBasisPoints: taxPolicy.tax_basis_points, jobId }
  };
}

async function allocationTotals(env: Env, workspaceId: string, invoiceIds?: string[]): Promise<Map<string, bigint>> {
  if (!invoiceIds?.length) return new Map();
  const placeholders = invoiceIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT pa.invoice_id,pa.amount_minor,p.reverses_payment_id FROM payment_allocations pa JOIN payments p ON p.workspace_id=pa.workspace_id AND p.id=pa.payment_id
    WHERE pa.workspace_id=? AND pa.invoice_id IN (${placeholders})`).bind(workspaceId, ...invoiceIds).all<{ invoice_id: string; amount_minor: number; reverses_payment_id: string | null }>();
  const totals = new Map<string, bigint>();
  for (const row of rows.results ?? []) totals.set(row.invoice_id, (totals.get(row.invoice_id) ?? 0n) + BigInt(row.reverses_payment_id ? -row.amount_minor : row.amount_minor));
  return totals;
}

async function buildPaymentRecord(env: Env, workspaceId: string, context: BusinessContext, command: Extract<BusinessDeliveryCommand,{type:'payment.record'}>, commandId: string, now: string): Promise<BusinessMutation> {
  requireAction(context, 'payment.record');
  const input = command.payload;
  requireClientScope(context, input.clientId);
  if (context.scope.engagementId && context.scope.engagementId !== input.engagementId) throw new ApiError('FORBIDDEN_SCOPE', 'The payment is outside the selected engagement.');
  if (input.receivedOn > qatarToday()) throw new ApiError('VALIDATION_FAILED', 'A payment cannot be recorded with a future received date.');
  const amount = BigInt(input.amountMinor);
  const file = await env.DB.prepare(`SELECT id,payment_evidence_reservation_id FROM file_versions WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=?
    AND purpose='EVIDENCE' AND state='COMMITTED' AND immutable=1`).bind(workspaceId, input.evidenceFileId, input.clientId, input.engagementId)
    .first<{ id: string; payment_evidence_reservation_id: string | null }>();
  if (!file) throw new ApiError('GATE_BLOCKED', 'A committed engagement-scoped payment evidence file is required.');
  const route = await env.DB.prepare(`SELECT cr.version,cr.contact_id,ct.full_name,ct.email FROM contact_routes cr
    JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
    WHERE cr.workspace_id=? AND cr.id=? AND cr.client_id=? AND cr.purpose='RECEIPT' AND cr.is_primary=1 AND ct.active=1 AND ct.email IS NOT NULL`)
    .bind(workspaceId, input.receiptContactRouteId, input.clientId).first<{ version: number; contact_id: string; full_name: string; email: string }>();
  if (!route) throw new ApiError('GATE_BLOCKED', 'Select the active primary RECEIPT contact route for this client.');
  const engagement = await env.DB.prepare(`SELECT version,lifecycle_state FROM engagements WHERE workspace_id=? AND client_id=? AND id=?`)
    .bind(workspaceId, input.clientId, input.engagementId).first<{ version: number; lifecycle_state: string }>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'The payment engagement was not found.');
  const invoiceIds = [...new Set(input.allocations.map(item => item.invoiceId))];
  if (invoiceIds.length !== input.allocations.length) throw new ApiError('VALIDATION_FAILED', 'Use one allocation per invoice in a payment command.');
  const invoiceRows = invoiceIds.length ? await env.DB.prepare(`SELECT id,total_minor,status,engagement_id,kind FROM invoices
    WHERE workspace_id=? AND client_id=? AND engagement_id=? AND id IN (${invoiceIds.map(() => '?').join(',')})`)
    .bind(workspaceId, input.clientId, input.engagementId, ...invoiceIds).all<{ id: string; total_minor: number; status: string; engagement_id: string; kind: string }>() : { results: [] as Array<{ id: string; total_minor: number; status: string; engagement_id: string; kind: string }> };
  const invoices = new Map((invoiceRows.results ?? []).map(row => [row.id, row]));
  if (invoices.size !== invoiceIds.length || [...invoices.values()].some(row => row.status !== 'ISSUED')) throw new ApiError('GATE_BLOCKED', 'Every payment allocation must target an issued invoice for this engagement.');
  const allocations = input.allocations.map(item => ({ invoiceId: item.invoiceId, amount: BigInt(item.amountMinor) }));
  const allocatedTotal = allocations.reduce((sum, item) => sum + item.amount, 0n);
  if (allocatedTotal > amount) throw new ApiError('VALIDATION_FAILED', 'Payment allocations cannot exceed the verified payment amount. Unallocated cash may be left unapplied.');
  const balances = await allocationTotals(env, workspaceId, invoiceIds);
  for (const item of allocations) {
    const invoice = invoices.get(item.invoiceId)!;
    if (item.amount + (balances.get(item.invoiceId) ?? 0n) > BigInt(invoice.total_minor)) throw new ApiError('VALIDATION_FAILED', 'The allocation exceeds the invoice balance.');
  }
  const paymentId = crypto.randomUUID();
  const receiptId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const number = `AS-RCP-${paymentId.slice(0, 8).toUpperCase()}`;
  const dedup = `receipt:${paymentId}`;
  const timestamp = new Date(now).toISOString();
  const payload = { documentType: 'RECEIPT', receiptId, paymentId, commandId, engagementId: input.engagementId, clientId: input.clientId };
  const recipient = { contactRouteId: input.receiptContactRouteId, contactRouteVersion: route.version, contactId: route.contact_id, name: route.full_name, email: route.email };
  Object.assign(payload, { recipient });
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO payments(id,workspace_id,version,client_id,engagement_id,amount_minor,received_on,method,reference,evidence_file_id,verified_by_actor_id,reverses_payment_id,created_at)
      VALUES(?,?,1,?,?,?,?,?,?,?, ?,NULL,?)`).bind(paymentId, workspaceId, input.clientId, input.engagementId, Number(amount), input.receivedOn, input.method, input.reference, input.evidenceFileId, context.actor.id, timestamp),
    ...(file.payment_evidence_reservation_id ? [env.DB.prepare(`UPDATE payment_evidence_reservations SET payment_id=?
      WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=? AND payment_id IS NULL`)
      .bind(paymentId, workspaceId, file.payment_evidence_reservation_id, input.clientId, input.engagementId)] : []),
    ...allocations.map(item => env.DB.prepare(`INSERT INTO payment_allocations(id,workspace_id,version,client_id,engagement_id,payment_id,invoice_id,amount_minor,allocated_on)
      VALUES(?,?,1,?,?,?,?,?,?)`).bind(crypto.randomUUID(), workspaceId, input.clientId, input.engagementId, paymentId, item.invoiceId, Number(item.amount), input.receivedOn)),
    env.DB.prepare(`INSERT INTO receipt_vouchers(id,workspace_id,version,client_id,engagement_id,payment_id,number,artifact_id,file_version_id,contact_route_id,recipient_snapshot_json,status,issued_at,created_at)
      VALUES(?,?,1,?,?,?, ?,NULL,NULL,?,?,'PENDING',NULL,?)`).bind(receiptId, workspaceId, input.clientId, input.engagementId, paymentId, number, input.receiptContactRouteId, JSON.stringify(recipient), timestamp),
    env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
      VALUES(?,?,1,'GENERATE_DOCUMENT',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
      .bind(jobId, workspaceId, receiptId, 1, JSON.stringify(payload), dedup, timestamp, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,82,CASE WHEN EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND client_id=? AND id=? AND version=?)
        AND EXISTS(SELECT 1 FROM invoices WHERE workspace_id=? AND client_id=? AND engagement_id=? AND status='ISSUED')
        AND EXISTS(SELECT 1 FROM file_versions f WHERE f.workspace_id=? AND f.id=? AND f.state='COMMITTED' AND f.immutable=1 AND f.purpose='EVIDENCE'
          AND (f.payment_evidence_reservation_id IS NULL OR EXISTS(SELECT 1 FROM payment_evidence_reservations per
            WHERE per.workspace_id=f.workspace_id AND per.id=f.payment_evidence_reservation_id AND per.client_id=f.client_id
              AND per.engagement_id=f.engagement_id AND per.payment_id=?)))
      THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, input.clientId, input.engagementId, engagement.version,
        workspaceId,input.clientId,input.engagementId,workspaceId, input.evidenceFileId, paymentId),
    ...await prepareBusinessPaymentJournal(env,workspaceId,context,{paymentId,clientId:input.clientId,engagementId:input.engagementId,method:input.method,
      amountMinor:Number(amount),allocations:allocations.map(item=>({invoiceId:item.invoiceId,amountMinor:Number(item.amount)})),postingDate:input.receivedOn,now:timestamp})
  ];
  const advanceInvoice = (invoiceRows.results ?? []).find(row => row.kind === 'ADVANCE' && row.status === 'ISSUED');
  const outstanding = advanceInvoice ? BigInt(advanceInvoice.total_minor) - (balances.get(advanceInvoice.id) ?? 0n)
    - allocations.filter(item => item.invoiceId === advanceInvoice.id).reduce((sum, item) => sum + item.amount, 0n) : 0n;
  return {
    statements, result: { paymentId, receiptId, receiptJobId: jobId, amountMinor: String(amount), allocatedMinor: String(allocatedTotal),
      unappliedMinor: String(amount - allocatedTotal), outstandingMinor: String(outstanding < 0n ? 0n : outstanding) },
    entityType: 'PAYMENT', entityId: paymentId, beforeVersion: null, afterVersion: 1,
    auditDetails: { clientId: input.clientId, engagementId: input.engagementId, method: input.method, reference: input.reference,
      evidenceFileId: input.evidenceFileId, allocationCount: allocations.length, selfAssertedVerification: true }
  };
}

async function buildPaymentReverse(env: Env, workspaceId: string, context: BusinessContext, command: Extract<BusinessDeliveryCommand,{type:'payment.reverse'}>, commandId: string, now: string): Promise<BusinessMutation> {
  requireAction(context, 'payment.reverse');
  const source = await env.DB.prepare(`SELECT p.id,p.client_id,p.engagement_id,p.amount_minor,p.received_on,p.method,p.reference,p.evidence_file_id,p.reverses_payment_id,
      rv.contact_route_id,rv.recipient_snapshot_json,rv.status AS receipt_status,e.lifecycle_state FROM payments p
    JOIN receipt_vouchers rv ON rv.workspace_id=p.workspace_id AND rv.payment_id=p.id
    JOIN engagements e ON e.workspace_id=p.workspace_id AND e.client_id=p.client_id AND e.id=p.engagement_id
    WHERE p.workspace_id=? AND p.id=?`).bind(workspaceId, command.payload.paymentId)
    .first<{ id: string; client_id: string; engagement_id: string; amount_minor: number; received_on: string; method: string; reference: string; evidence_file_id: string; reverses_payment_id: string | null; contact_route_id: string; recipient_snapshot_json: string; receipt_status: string; lifecycle_state: string }>();
  if (!source || source.reverses_payment_id) throw new ApiError('NOT_FOUND', 'A verified original payment was not found for reversal.');
  requireClientScope(context, source.client_id);
  if (source.receipt_status !== 'ISSUED') throw new ApiError('GATE_BLOCKED', 'A payment can be reversed only after its original receipt has been committed.');
  const prior = await env.DB.prepare(`SELECT id FROM payments WHERE workspace_id=? AND reverses_payment_id=?`).bind(workspaceId, source.id).first<{ id: string }>();
  if (prior) throw new ApiError('VERSION_CONFLICT', 'This payment already has an immutable reversal.');
  const originalAllocations = await env.DB.prepare(`SELECT invoice_id,amount_minor FROM payment_allocations WHERE workspace_id=? AND payment_id=? ORDER BY invoice_id`)
    .bind(workspaceId, source.id).all<{ invoice_id: string; amount_minor: number }>();
  const reversalId = crypto.randomUUID();
  const receiptId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const timestamp = new Date(now).toISOString();
  const reversalReference = `REVERSAL:${source.reference}`.slice(0, 200);
  const reversalDate=qatarToday();
  const recipient = JSON.parse(source.recipient_snapshot_json) as Record<string, unknown>;
  const payload = { documentType: 'RECEIPT', receiptId, paymentId: reversalId, commandId, engagementId: source.engagement_id, clientId: source.client_id, recipient };
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO payments(id,workspace_id,version,client_id,engagement_id,amount_minor,received_on,method,reference,evidence_file_id,verified_by_actor_id,reverses_payment_id,created_at)
      VALUES(?,?,1,?,?,?,?,?,?,?, ?,?,?)`).bind(reversalId, workspaceId, source.client_id, source.engagement_id, source.amount_minor, reversalDate, source.method, reversalReference, source.evidence_file_id, context.actor.id, source.id, timestamp),
    ...(originalAllocations.results ?? []).map(item => env.DB.prepare(`INSERT INTO payment_allocations(id,workspace_id,version,client_id,engagement_id,payment_id,invoice_id,amount_minor,allocated_on)
      VALUES(?,?,1,?,?,?,?,?,?)`).bind(crypto.randomUUID(), workspaceId, source.client_id, source.engagement_id, reversalId, item.invoice_id, item.amount_minor, reversalDate)),
    env.DB.prepare(`INSERT INTO receipt_vouchers(id,workspace_id,version,client_id,engagement_id,payment_id,number,artifact_id,file_version_id,contact_route_id,recipient_snapshot_json,status,issued_at,created_at)
      VALUES(?,?,1,?,?,?, ?,NULL,NULL,?,?,'PENDING',NULL,?)`).bind(receiptId, workspaceId, source.client_id, source.engagement_id, reversalId, `AS-RCP-${reversalId.slice(0, 8).toUpperCase()}`, source.contact_route_id, source.recipient_snapshot_json, timestamp),
    env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
      VALUES(?,?,1,'GENERATE_DOCUMENT',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
      .bind(jobId, workspaceId, receiptId, 1, JSON.stringify(payload), `receipt:${reversalId}`, timestamp, timestamp, timestamp)
  ];
  statements.push(...await prepareBusinessPaymentJournal(env,workspaceId,context,{paymentId:reversalId,clientId:source.client_id,engagementId:source.engagement_id,method:source.method,
    amountMinor:source.amount_minor,allocations:(originalAllocations.results??[]).map(item=>({invoiceId:item.invoice_id,amountMinor:item.amount_minor})),postingDate:reversalDate,
    now:timestamp,reversesPaymentId:source.id,reason:command.payload.rationale}));
  return { statements, result: { paymentId: reversalId, reversesPaymentId: source.id, receiptId, receiptJobId: jobId, status: 'REVERSAL_RECORDED' },
    entityType: 'PAYMENT', entityId: reversalId, beforeVersion: null, afterVersion: 1,
    auditDetails: { reversesPaymentId: source.id, rationale: command.payload.rationale, allocationCount: originalAllocations.results?.length ?? 0 } };
}

export async function buildBusinessDeliveryMutation(env: Env, workspaceId: string, context: BusinessContext, command: BusinessDeliveryCommand, commandId: string, now: string): Promise<BusinessMutation> {
  switch (command.type) {
    case 'document-template.save': return buildTemplateSave(env, workspaceId, context, command, now);
    case 'signature-asset.consent': return buildSignatureDecision(env, workspaceId, context, command, now);
    case 'seal-asset.approve': return buildSealDecision(env, workspaceId, context, command, now);
    case 'billing.tax-policy.save': return buildTaxPolicySave(env, workspaceId, context, command, now);
    case 'engagementLetter.generate': return buildLetterGenerate(env, workspaceId, context, command, commandId, now);
    case 'engagementLetter.issue': return buildLetterIssue(env, workspaceId, context, command, now);
    case 'invoice.issueAdvance': return buildAdvanceInvoice(env, workspaceId, context, command, commandId, now);
    case 'payment.record': return buildPaymentRecord(env, workspaceId, context, command, commandId, now);
    case 'payment.reverse': return buildPaymentReverse(env, workspaceId, context, command, commandId, now);
  }
}

export async function getBusinessDeliveryWorkspace(env: Env, workspaceId: string, context: BusinessContext, engagementId: string): Promise<Record<string, unknown>> {
  requireAction(context, 'commercialAcceptance.read');
  const engagement = await env.DB.prepare(`SELECT e.id,e.client_id,e.code,e.version,e.lifecycle_state,e.period_start,e.period_end,e.engagement_type,e.contract_fee_minor,c.legal_name AS client_name
    FROM engagements e JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id WHERE e.workspace_id=? AND e.id=?`)
    .bind(workspaceId, engagementId).first<Record<string, unknown> & { id: string; client_id: string; lifecycle_state: string; contract_fee_minor: number }>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'Engagement not found.');
  requireClientScope(context, engagement.client_id);
  if (context.scope.engagementId && context.scope.engagementId !== engagementId) throw new ApiError('FORBIDDEN_SCOPE', 'The engagement does not match the selected request context.');
  const isInternal = context.actor.persona !== 'CLIENT';
  const [letters, invoices, payments, drafts, templates, routes, signatures, seals, taxPolicies] = await Promise.all([
    env.DB.prepare(`SELECT l.id,l.revision,l.proposal_version_id,l.commercial_acceptance_id,l.risk_clearance_id,l.template_version_id,l.artifact_id,l.file_version_id,l.content_sha256,l.fee_minor,l.period_start,l.period_end,l.issued_at
      FROM engagement_letters l WHERE l.workspace_id=? AND l.engagement_id=? ORDER BY l.revision DESC`)
      .bind(workspaceId, engagementId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT i.id,i.version,i.kind,i.engagement_letter_id,i.number,i.subtotal_minor,i.tax_minor,i.total_minor,i.due_date,i.status,i.artifact_id,i.file_version_id,i.issue_date,i.issued_at,
        (SELECT j.last_error_code FROM outbox_jobs j WHERE j.workspace_id=i.workspace_id AND j.kind='GENERATE_DOCUMENT' AND j.aggregate_id=i.id ORDER BY j.created_at DESC LIMIT 1) AS document_error_code
      FROM invoices i WHERE i.workspace_id=? AND i.engagement_id=? ${isInternal ? '' : "AND i.status='ISSUED'"} ORDER BY i.created_at DESC,i.id`)
      .bind(workspaceId, engagementId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT p.id,p.amount_minor,p.received_on,p.method,p.reverses_payment_id,pv.id AS receipt_id,pv.number AS receipt_number,pv.status AS receipt_status,pv.file_version_id AS receipt_file_id,
        (SELECT j.last_error_code FROM outbox_jobs j WHERE j.workspace_id=pv.workspace_id AND j.kind='GENERATE_DOCUMENT' AND j.aggregate_id=pv.id ORDER BY j.created_at DESC LIMIT 1) AS receipt_error_code
      FROM payments p LEFT JOIN receipt_vouchers pv ON pv.workspace_id=p.workspace_id AND pv.payment_id=p.id
      WHERE p.workspace_id=? AND p.engagement_id=? ORDER BY p.created_at DESC,p.id`)
      .bind(workspaceId, engagementId).all<Record<string, unknown>>(),
    isInternal ? env.DB.prepare(`SELECT d.id,d.revision,d.proposal_version_id,d.commercial_acceptance_id,d.risk_clearance_id,d.template_version_id,d.signature_file_version_id,d.seal_file_version_id,d.status,d.job_id,d.file_version_id,d.error_code
      FROM engagement_letter_drafts d WHERE d.workspace_id=? AND d.engagement_id=? ORDER BY d.revision DESC`)
      .bind(workspaceId, engagementId).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Array<Record<string, unknown>> }),
    isInternal ? env.DB.prepare(`SELECT id,service_type,revision,name,clauses,content_sha256,approved_by_actor_id,approved_at FROM document_template_versions WHERE workspace_id=? ORDER BY service_type,revision DESC`)
      .bind(workspaceId).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Array<Record<string, unknown>> }),
    isInternal ? env.DB.prepare(`SELECT cr.id,cr.version,cr.contact_id,cr.purpose,ct.full_name,ct.email FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.id=cr.contact_id
      WHERE cr.workspace_id=? AND cr.client_id=? AND cr.purpose IN ('EL','INVOICE','RECEIPT') AND cr.is_primary=1 AND ct.active=1 AND ct.email IS NOT NULL ORDER BY cr.purpose,ct.full_name`)
      .bind(workspaceId, engagement.client_id).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Array<Record<string, unknown>> }),
    context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER' ? env.DB.prepare(`SELECT f.id,f.original_name,f.sha256,COALESCE(d.decision,'NONE') AS decision,d.id AS decision_id FROM file_versions f
      LEFT JOIN signature_asset_decisions d ON d.workspace_id=f.workspace_id AND d.file_version_id=f.id AND d.sequence=(SELECT MAX(x.sequence) FROM signature_asset_decisions x WHERE x.workspace_id=f.workspace_id AND x.file_version_id=f.id)
      WHERE f.workspace_id=? AND f.purpose='SIGNATURE' AND f.media_type='image/png' AND f.state='COMMITTED' AND f.immutable=1 ORDER BY f.original_name`)
      .bind(workspaceId).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Array<Record<string, unknown>> }),
    context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER' ? env.DB.prepare(`SELECT f.id,f.original_name,f.sha256,COALESCE(d.decision,'NONE') AS decision,d.id AS approval_id FROM file_versions f
      LEFT JOIN seal_asset_approvals d ON d.workspace_id=f.workspace_id AND d.file_version_id=f.id AND d.sequence=(SELECT MAX(x.sequence) FROM seal_asset_approvals x WHERE x.workspace_id=f.workspace_id AND x.file_version_id=f.id)
      WHERE f.workspace_id=? AND f.purpose='SEAL' AND f.media_type='image/png' AND f.state='COMMITTED' AND f.immutable=1 ORDER BY f.original_name`)
      .bind(workspaceId).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Array<Record<string, unknown>> }),
    context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER' ? env.DB.prepare(`SELECT id,revision,name,tax_basis_points,rationale,approved_at FROM billing_tax_policy_versions WHERE workspace_id=? ORDER BY revision DESC`)
      .bind(workspaceId).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Array<Record<string, unknown>> })
  ]);
  const invoiceRows = invoices.results ?? [];
  const balances = await allocationTotals(env, workspaceId, invoiceRows.map(row => String(row.id)));
  const allocations = await env.DB.prepare(`SELECT pa.invoice_id,pa.amount_minor,p.reverses_payment_id FROM payment_allocations pa JOIN payments p ON p.workspace_id=pa.workspace_id AND p.id=pa.payment_id
    WHERE pa.workspace_id=? AND pa.engagement_id=? ORDER BY pa.allocated_on,pa.id`).bind(workspaceId, engagementId).all<{ invoice_id: string; amount_minor: number; reverses_payment_id: string | null }>();
  const allocationsByInvoice = new Map<string, Array<{ amountMinor: string; reversal: boolean }>>();
  for (const row of allocations.results ?? []) {
    const group = allocationsByInvoice.get(row.invoice_id) ?? [];
    group.push({ amountMinor: String(row.amount_minor), reversal: Boolean(row.reverses_payment_id) });
    allocationsByInvoice.set(row.invoice_id, group);
  }
  return {
    engagement: { id: engagement.id, clientId: engagement.client_id, code: engagement.code, version: engagement.version,
      lifecycleState: engagement.lifecycle_state, periodStart: engagement.period_start, periodEnd: engagement.period_end,
      serviceType: engagement.engagement_type, clientName: engagement.client_name, contractFeeMinor: String(engagement.contract_fee_minor) },
    letters: (letters.results ?? []).map(row => isInternal ? ({ id: row.id, revision: row.revision, proposalVersionId: row.proposal_version_id,
      commercialAcceptanceId: row.commercial_acceptance_id, riskClearanceId: row.risk_clearance_id, templateVersionId: row.template_version_id,
      artifactId: row.artifact_id, fileVersionId: row.file_version_id, contentSha256: row.content_sha256, feeMinor: String(row.fee_minor),
      periodStart: row.period_start, periodEnd: row.period_end, issuedAt: row.issued_at }) : ({ id: row.id, revision: row.revision,
      fileVersionId: row.file_version_id, feeMinor: String(row.fee_minor), periodStart: row.period_start, periodEnd: row.period_end, issuedAt: row.issued_at })),
    invoices: invoiceRows.map(row => {
      const paid = balances.get(String(row.id)) ?? 0n;
      const total = BigInt(Number(row.total_minor));
      const publicInvoice = { id: row.id, version: row.version, number: row.number, totalMinor: String(row.total_minor), dueDate: row.due_date,
        status: row.status, outstandingMinor: String(total > paid ? total - paid : 0n) };
      if (!isInternal) return publicInvoice;
      return { id: row.id, version: row.version, kind: row.kind, engagementLetterId: row.engagement_letter_id, number: row.number, subtotalMinor: String(row.subtotal_minor), taxMinor: String(row.tax_minor),
        totalMinor: String(row.total_minor), dueDate: row.due_date, status: row.status, artifactId: row.artifact_id, fileVersionId: row.file_version_id,
        issueDate: row.issue_date, issuedAt: row.issued_at, documentErrorCode: row.document_error_code ?? null, outstandingMinor: String(total > paid ? total - paid : 0n),
        allocations: allocationsByInvoice.get(String(row.id)) ?? [] };
    }),
    payments: (payments.results ?? []).map(row => isInternal ? ({ id: row.id, amountMinor: String(row.amount_minor), receivedOn: row.received_on,
      method: row.method, reversal: Boolean(row.reverses_payment_id), receiptId: row.receipt_id, receiptNumber: row.receipt_number,
      receiptStatus: row.receipt_status, receiptFileId: row.receipt_file_id, receiptErrorCode: row.receipt_error_code ?? null }) : ({
      id: row.id, amountMinor: String(row.amount_minor), receivedOn: row.received_on, method: row.method, reversal: Boolean(row.reverses_payment_id)
    })),
    ...(isInternal ? {
      letterDrafts: (drafts.results ?? []).map(row => ({ id: row.id, revision: row.revision, proposalVersionId: row.proposal_version_id,
        commercialAcceptanceId: row.commercial_acceptance_id, riskClearanceId: row.risk_clearance_id, templateVersionId: row.template_version_id,
        signatureFileVersionId: row.signature_file_version_id, sealFileVersionId: row.seal_file_version_id, status: row.status,
        jobId: row.job_id, fileVersionId: row.file_version_id, errorCode: row.error_code })),
      templates: (templates.results ?? []).map(row => ({ id: row.id, serviceType: row.service_type, revision: row.revision, name: row.name,
        clauses: row.clauses, contentSha256: row.content_sha256, approvedByActorId: row.approved_by_actor_id, approvedAt: row.approved_at })),
      contactRoutes: (routes.results ?? []).map(row => ({ id: row.id, version: row.version, contactId: row.contact_id, purpose: row.purpose, name: row.full_name, email: row.email })),
      signatureAssets: (signatures.results ?? []).map(row => ({ id: row.id, originalName: row.original_name, sha256: row.sha256, decision: row.decision, decisionId: row.decision_id })),
      sealAssets: (seals.results ?? []).map(row => ({ id: row.id, originalName: row.original_name, sha256: row.sha256, decision: row.decision, approvalId: row.approval_id })),
      taxPolicies: (taxPolicies.results ?? []).map(row => ({ id: row.id, revision: row.revision, name: row.name, taxBasisPoints: row.tax_basis_points, rationale: row.rationale, approvedAt: row.approved_at }))
    } : {})
  };
}
