// Revision-pinned acceptance, continuance and commercial decision records.
// Persona context is self-asserted by design; these checks enforce workflow only.
import * as z from 'zod';
import type { Env } from './env';
import { ApiError } from './errors';
import { sha256Hex } from './http';

const id = z.uuid();
const date = z.iso.date();
const riskTrack = z.enum(['NEW_CLIENT', 'CONTINUANCE']);
const checkCode = z.enum([
  'UBO', 'KYC', 'AML', 'INTEGRITY', 'VIABILITY', 'INDEPENDENCE', 'CONFLICTS',
  'PRIOR_FEES', 'MANAGEMENT_CHANGE', 'OWNERSHIP_CHANGE', 'NEW_BORROWING', 'LITIGATION', 'FRAUD_REGULATORY'
]);
const riskCheck = z.strictObject({
  code: checkCode,
  outcome: z.enum(['CLEAR', 'ISSUE', 'NOT_APPLICABLE']),
  findings: z.string().trim().min(10).max(5000),
  sourceReference: z.string().trim().min(1).max(1000),
  checkMethod: z.enum(['MANUAL', 'EXTERNAL_SERVICE']).default('MANUAL'),
  providerName: z.string().trim().min(1).max(200).optional(),
  externalReference: z.string().trim().min(1).max(500).optional(),
  checkedOn: date,
  evidenceFileId: id.optional(),
  resolution: z.string().trim().min(10).max(5000).optional()
}).superRefine((check, ctx) => {
  if (check.outcome === 'NOT_APPLICABLE' && !check.resolution) {
    ctx.addIssue({ code: 'custom', path: ['resolution'], message: 'Explain why this check does not apply.' });
  }
  if (check.checkMethod === 'EXTERNAL_SERVICE' && (!check.providerName || !check.externalReference || !check.evidenceFileId)) {
    ctx.addIssue({ code: 'custom', path: ['checkMethod'], message: 'External service evidence needs a named provider, reference and committed evidence file.' });
  }
  if (check.checkMethod === 'MANUAL' && (check.providerName || check.externalReference)) {
    ctx.addIssue({ code: 'custom', path: ['providerName'], message: 'Provider fields are only used for external service evidence.' });
  }
});

const saveRiskDraft = z.strictObject({
  type: z.literal('riskAssessment.saveDraft'),
  payload: z.strictObject({
    engagementId: id,
    track: riskTrack,
    expectedDraftVersion: z.number().int().nonnegative(),
    questionnaireTemplateVersion: z.string().trim().min(1).max(200),
    assessmentDate: date,
    overallRisk: z.enum(['LOW', 'MODERATE', 'HIGH']),
    managementIntegrityConclusion: z.string().trim().min(10).max(10000),
    viabilityConclusion: z.string().trim().min(10).max(10000),
    independenceConclusion: z.string().trim().min(10).max(10000),
    checks: z.array(riskCheck).max(13)
  }).superRefine((payload, ctx) => {
    const seen = new Set<string>();
    payload.checks.forEach((check, index) => {
      if (seen.has(check.code)) ctx.addIssue({ code: 'custom', path: ['checks', index, 'code'], message: 'Each check code may appear once in a dossier revision.' });
      seen.add(check.code);
    });
  })
});
const submitRisk = z.strictObject({
  type: z.literal('riskAssessment.submit'),
  payload: z.strictObject({ assessmentId: id, expectedDraftVersion: z.number().int().positive() })
});
const saveOwner = z.strictObject({
  type: z.literal('riskAssessment.owner.save'),
  payload: z.strictObject({
    engagementId: id,
    ownerId: id.optional(),
    expectedVersion: z.number().int().positive().nullable(),
    fullName: z.string().trim().min(1).max(250),
    ownershipBps: z.number().int().min(0).max(10000),
    controlBasis: z.string().trim().min(1).max(2000),
    identityEvidenceFileId: id.optional(),
    effectiveFrom: date,
    effectiveTo: date.optional(),
    active: z.boolean().default(true)
  }).refine(value => value.active || Boolean(value.ownerId), { message: 'A new beneficial owner must be active.' })
    .refine(value => (value.expectedVersion === null) === !value.ownerId, { message: 'Owner ID and expected version must describe either a new owner or a revision.' })
    .refine(value => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, { message: 'The ownership end date must not precede its start date.' })
});
const riskDecision = z.strictObject({
  type: z.literal('risk.clear'),
  payload: z.strictObject({ engagementId: id, riskAssessmentVersionId: id, rationale: z.string().trim().min(10).max(10000) })
});
const riskReject = z.strictObject({
  type: z.literal('risk.reject'),
  payload: z.strictObject({ engagementId: id, riskAssessmentVersionId: id, rationale: z.string().trim().min(10).max(10000) })
});
const riskRevoke = z.strictObject({
  type: z.literal('risk.revoke'),
  payload: z.strictObject({ engagementId: id, clearanceId: id, rationale: z.string().trim().min(10).max(10000) })
});
const riskEscalate = z.strictObject({
  type: z.literal('riskAssessment.escalate'),
  payload: z.strictObject({ assessmentVersionId: id, checkId: id, reason: z.string().trim().min(10).max(5000), requiredEvidence: z.string().trim().min(1).max(2000) })
});
const riskResolveEscalation = z.strictObject({
  type: z.literal('riskAssessment.resolveEscalation'),
  payload: z.strictObject({ escalationId: id, expectedVersion: z.number().int().positive(), resolution: z.string().trim().min(10).max(5000), evidenceFileId: id })
});
const commercialAccept = z.strictObject({
  type: z.literal('commercialAcceptance.record'),
  payload: z.strictObject({
    engagementId: id,
    proposalVersionId: id,
    acceptedFeeMinor: z.string().regex(/^(0|[1-9][0-9]{0,15})$/).refine(value => Number.isSafeInteger(Number(value))),
    confirmationText: z.string().trim().min(10).max(5000),
    evidenceFileId: id.optional()
  })
});
const commercialRevoke = z.strictObject({
  type: z.literal('commercialAcceptance.revoke'),
  payload: z.strictObject({ acceptanceId: id, rationale: z.string().trim().min(10).max(5000) })
});

export const businessRiskCommands = [saveRiskDraft, submitRisk, saveOwner, riskDecision, riskReject, riskRevoke, riskEscalate, riskResolveEscalation, commercialAccept, commercialRevoke] as const;
export const businessRiskCommandSchema = z.discriminatedUnion('type', businessRiskCommands);
export type BusinessRiskCommand = z.infer<typeof businessRiskCommandSchema>;
export function isBusinessRiskCommand(command: { type: string }): command is BusinessRiskCommand {
  return command.type.startsWith('risk.') || command.type.startsWith('riskAssessment.') || command.type.startsWith('commercialAcceptance.');
}
export interface RiskBusinessContext {
  actor: { id: string; persona: 'PREPARER' | 'REVIEWER' | 'APPROVER' | 'CLIENT'; displayName: string; staffGrade: 'PARTNER' | 'MANAGER' | 'SENIOR' | 'ASSOCIATE' | null; clientId: string | null };
  scope: { clientId: string | null; engagementId: string | null };
  allowedActions: string[];
}
export interface RiskBusinessMutation {
  statements: D1PreparedStatement[];
  result: Record<string, unknown>;
  entityType: string;
  entityId: string;
  beforeVersion: number | null;
  afterVersion: number;
  auditDetails?: Record<string, unknown>;
}

const trackACodes = ['UBO', 'KYC', 'AML', 'INTEGRITY', 'VIABILITY', 'INDEPENDENCE', 'CONFLICTS'] as const;
const trackBCodes = ['PRIOR_FEES', 'MANAGEMENT_CHANGE', 'OWNERSHIP_CHANGE', 'NEW_BORROWING', 'LITIGATION', 'FRAUD_REGULATORY'] as const;
const isoNow = (): string => new Date().toISOString();

function assertEngagementScope(context: RiskBusinessContext, clientId: string, engagementId: string): void {
  if (context.scope.clientId && context.scope.clientId !== clientId) throw new ApiError('FORBIDDEN_SCOPE', 'The engagement is outside the selected client scope.');
  if (context.scope.engagementId && context.scope.engagementId !== engagementId) throw new ApiError('FORBIDDEN_SCOPE', 'The engagement does not match the selected engagement.');
}

function requireRiskEditor(context: RiskBusinessContext): void {
  if (context.actor.persona === 'CLIENT' || !context.allowedActions.includes('riskAssessment.draft')) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only internal PREPARER, REVIEWER or APPROVER profiles can maintain risk assessments.');
  }
}

function requirePartner(context: RiskBusinessContext): void {
  if (context.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER' || !context.allowedActions.includes('risk.clear')) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only an APPROVER with PARTNER grade can sign risk decisions.');
  }
}

async function getEngagement(env: Env, workspaceId: string, context: RiskBusinessContext, engagementId: string) {
  const engagement = await env.DB.prepare(`SELECT e.id,e.version,e.client_id,e.lifecycle_state,e.active_proposal_version_id,
      c.active AS client_active,c.legal_name
    FROM engagements e JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id
    WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId, engagementId)
    .first<{ id: string; version: number; client_id: string; lifecycle_state: string; active_proposal_version_id: string | null; client_active: number; legal_name: string }>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement was not found.');
  assertEngagementScope(context, engagement.client_id, engagementId);
  if (engagement.client_active !== 1 || engagement.lifecycle_state === 'ARCHIVED_READ_ONLY') throw new ApiError('WORKSPACE_FROZEN', 'This engagement is not open for acceptance or risk changes.');
  return engagement;
}

interface OwnerRow { id: string; version: number; active: number; current_revision_id: string; full_name: string; ownership_bps: number; control_basis: string; identity_evidence_file_id: string | null; effective_from: string; effective_to: string | null; evidence_sha256: string | null }
async function currentOwners(env: Env, workspaceId: string, clientId: string): Promise<OwnerRow[]> {
  const result = await env.DB.prepare(`SELECT bo.id,bo.version,bo.active,bo.current_revision_id,br.full_name,br.ownership_bps,br.control_basis,
      br.identity_evidence_file_id,br.effective_from,br.effective_to,f.sha256 AS evidence_sha256
    FROM beneficial_owners bo JOIN beneficial_owner_revisions br ON br.workspace_id=bo.workspace_id AND br.id=bo.current_revision_id
    LEFT JOIN file_versions f ON f.workspace_id=br.workspace_id AND f.id=br.identity_evidence_file_id
    WHERE bo.workspace_id=? AND bo.client_id=? AND bo.active=1 ORDER BY bo.id`).bind(workspaceId, clientId).all<OwnerRow>();
  return result.results ?? [];
}
async function ownershipHash(env: Env, workspaceId: string, clientId: string): Promise<string> {
  const owners = await currentOwners(env, workspaceId, clientId);
  return sha256Hex(JSON.stringify(owners.map(owner => ({
    id: owner.id, revisionId: owner.current_revision_id, fullName: owner.full_name, ownershipBps: owner.ownership_bps,
    controlBasis: owner.control_basis, evidenceFileId: owner.identity_evidence_file_id, evidenceSha256: owner.evidence_sha256,
    effectiveFrom: owner.effective_from, effectiveTo: owner.effective_to
  }))));
}

async function validateEvidenceFile(env: Env, workspaceId: string, clientId: string, engagementId: string, fileId: string, label: string): Promise<{ sha256: string }> {
  const file = await env.DB.prepare(`SELECT sha256 FROM file_versions WHERE workspace_id=? AND id=? AND client_id=?
      AND (engagement_id IS NULL OR engagement_id=?) AND state='COMMITTED' AND immutable=1
      AND purpose IN ('PBC','EVIDENCE') AND sha256 IS NOT NULL`)
    .bind(workspaceId, fileId, clientId, engagementId).first<{ sha256: string }>();
  if (!file) throw new ApiError('GATE_BLOCKED', `${label} must reference a committed evidence file for this client and engagement.`);
  return file;
}

async function riskDependencyHash(env: Env, workspaceId: string, assessmentVersionId: string, assessmentSourceVersion: number, clientId: string): Promise<{ dependencyHash: string; ownersHash: string }> {
  const version = await env.DB.prepare(`SELECT dependency_hash,ownership_hash FROM risk_assessment_versions
    WHERE workspace_id=? AND id=?`).bind(workspaceId, assessmentVersionId).first<{ dependency_hash: string; ownership_hash: string }>();
  if (!version) throw new ApiError('NOT_FOUND', 'The submitted risk assessment revision was not found.');
  const ownersHash = await ownershipHash(env, workspaceId, clientId);
  const assessment = await env.DB.prepare(`SELECT version FROM risk_assessments WHERE workspace_id=? AND current_version_id=?`)
    .bind(workspaceId, assessmentVersionId).first<{ version: number }>();
  if (!assessment || assessment.version !== assessmentSourceVersion || ownersHash !== version.ownership_hash) {
    throw new ApiError('STALE_APPROVAL', 'Risk facts or ownership changed after this dossier revision. Submit and approve a fresh revision.');
  }
  const escalationRows = await env.DB.prepare(`SELECT re.id,re.version,re.check_id,re.check_code,re.reason,re.required_evidence,re.status,re.resolution,
      re.evidence_file_id,fv.sha256 AS evidence_sha256,re.resolved_by_actor_id,re.resolved_at
    FROM risk_escalations re LEFT JOIN file_versions fv ON fv.workspace_id=re.workspace_id AND fv.id=re.evidence_file_id
    WHERE re.workspace_id=? AND re.assessment_version_id=? ORDER BY re.created_at,re.id`)
    .bind(workspaceId, assessmentVersionId).all<Record<string, unknown>>();
  return {
    ownersHash,
    dependencyHash: await sha256Hex(JSON.stringify({ assessmentVersionId, assessmentSourceVersion, dossierHash: version.dependency_hash, ownersHash, escalations: escalationRows.results ?? [] }))
  };
}

async function activeCommercialAcceptance(env: Env, workspaceId: string, engagementId: string, proposalVersionId: string | null) {
  if (!proposalVersionId) return null;
  return env.DB.prepare(`SELECT ca.id,ca.accepted_fee_minor,ca.proposal_version_id,ca.sequence,ca.actor_id,ca.contact_id
    FROM commercial_acceptances ca
    WHERE ca.workspace_id=? AND ca.engagement_id=? AND ca.proposal_version_id=?
      AND ca.sequence=(SELECT MAX(latest.sequence) FROM commercial_acceptances latest
        WHERE latest.workspace_id=ca.workspace_id AND latest.proposal_version_id=ca.proposal_version_id)
      AND ca.decision='ACCEPT'`)
    .bind(workspaceId, engagementId, proposalVersionId)
    .first<{ id: string; accepted_fee_minor: number; proposal_version_id: string; sequence: number; actor_id: string; contact_id: string }>();
}

async function activeRiskClearance(env: Env, workspaceId: string, engagementId: string, clientId: string) {
  const latest = await env.DB.prepare(`SELECT rc.id,rc.decision,rc.assessment_version_id,rc.dependency_hash,rv.assessment_source_version
    FROM risk_clearances rc LEFT JOIN risk_assessment_versions rv ON rv.workspace_id=rc.workspace_id AND rv.id=rc.assessment_version_id
    WHERE rc.workspace_id=? AND rc.engagement_id=?
      AND rc.sequence=(SELECT MAX(latest.sequence) FROM risk_clearances latest WHERE latest.workspace_id=rc.workspace_id AND latest.engagement_id=rc.engagement_id)`)
    .bind(workspaceId, engagementId).first<{ id: string; decision: 'CLEAR' | 'REJECT' | 'REVOKE'; assessment_version_id: string; dependency_hash: string; assessment_source_version: number | null }>();
  if (!latest || latest.decision !== 'CLEAR' || latest.assessment_source_version === null) return null;
  try {
    const current = await riskDependencyHash(env, workspaceId, latest.assessment_version_id, latest.assessment_source_version, clientId);
    return latest.dependency_hash === current.dependencyHash ? latest : null;
  } catch { return null; }
}

async function appendAdvanceIfReady(
  env: Env, workspaceId: string, engagement: { id: string; version: number; client_id: string; lifecycle_state: string; active_proposal_version_id: string | null },
  commandId: string, now: string, actorId: string, commercialId: string, riskClearanceId: string, dependencyHash: string
): Promise<D1PreparedStatement[]> {
  if (engagement.lifecycle_state !== 'DUAL_KEY_PENDING' || !engagement.active_proposal_version_id) return [];
  const transitionId = crypto.randomUUID();
  return [
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,95,CASE WHEN EXISTS(SELECT 1 FROM engagements e
        JOIN proposals p ON p.workspace_id=e.workspace_id AND p.engagement_id=e.id AND p.current_version_id=e.active_proposal_version_id
        JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.id=p.current_version_id
        JOIN commercial_acceptances ca ON ca.workspace_id=e.workspace_id AND ca.engagement_id=e.id
          AND ca.proposal_version_id=e.active_proposal_version_id AND ca.id=? AND ca.decision='ACCEPT'
        JOIN risk_clearances rc ON rc.workspace_id=e.workspace_id AND rc.engagement_id=e.id AND rc.id=? AND rc.decision='CLEAR'
        JOIN risk_assessments ra ON ra.workspace_id=e.workspace_id AND ra.engagement_id=e.id AND ra.current_version_id=rc.assessment_version_id
        JOIN risk_assessment_versions rv ON rv.workspace_id=ra.workspace_id AND rv.id=ra.current_version_id
        WHERE e.workspace_id=? AND e.id=? AND e.version=? AND e.lifecycle_state='DUAL_KEY_PENDING'
          AND e.active_proposal_version_id=? AND ca.accepted_fee_minor=pv.fee_minor
          AND NOT EXISTS(SELECT 1 FROM commercial_acceptances later WHERE later.workspace_id=ca.workspace_id
            AND later.proposal_version_id=ca.proposal_version_id AND later.sequence>ca.sequence)
          AND NOT EXISTS(SELECT 1 FROM risk_clearances later WHERE later.workspace_id=rc.workspace_id
            AND later.engagement_id=rc.engagement_id AND later.sequence>rc.sequence)
          AND rc.dependency_hash=? AND ra.version=rv.assessment_source_version AND ra.version=?)
        THEN 1 ELSE 0 END
      FROM proposal_versions pv WHERE pv.workspace_id=? AND pv.id=?`)
      .bind(workspaceId, commercialId, riskClearanceId, workspaceId, engagement.id, engagement.version,
        engagement.active_proposal_version_id, dependencyHash, (await env.DB.prepare(`SELECT version FROM risk_assessments WHERE workspace_id=? AND engagement_id=?`)
          .bind(workspaceId, engagement.id).first<{ version: number }>())?.version ?? 0,
        workspaceId, engagement.active_proposal_version_id),
    env.DB.prepare(`UPDATE engagements SET lifecycle_state='ADVANCE_BILLING',version=version+1,updated_at=?,updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state='DUAL_KEY_PENDING'`)
      .bind(now, actorId, workspaceId, engagement.id, engagement.version),
    env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at)
      SELECT ?,?,?,?,1,'DUAL_KEY_PENDING','ADVANCE_BILLING',?,'Both current acceptance keys are active for the exact proposal and risk revisions.',?,?
      WHERE changes()=1`)
      .bind(transitionId, workspaceId, engagement.client_id, engagement.id, commandId, dependencyHash, now)
  ];
}

function blocked(message: string, details?: Record<string, unknown>): never {
  throw new ApiError('GATE_BLOCKED', message, details);
}

function currentRequiredCodes(track: 'NEW_CLIENT' | 'CONTINUANCE', checks: Array<z.infer<typeof riskCheck>>): string[] {
  const required = track === 'NEW_CLIENT' ? trackACodes : trackBCodes;
  const byCode = new Map(checks.map(check => [check.code, check]));
  const blockers: string[] = [];
  for (const code of required) {
    const check = byCode.get(code);
    if (!check) { blockers.push(`${code}: assessment is missing`); continue; }
    if (check.outcome === 'NOT_APPLICABLE' && !check.resolution) blockers.push(`${code}: explain why it does not apply`);
    if (['UBO', 'KYC', 'AML'].includes(code) && check.outcome === 'CLEAR' && !check.evidenceFileId) blockers.push(`${code}: committed supporting evidence is required`);
  }
  return blockers;
}

async function buildSaveRiskDraft(env: Env, workspaceId: string, context: RiskBusinessContext, command: Extract<BusinessRiskCommand,{type:'riskAssessment.saveDraft'}>, commandId: string, now: string): Promise<RiskBusinessMutation> {
  requireRiskEditor(context);
  const payload = command.payload;
  const engagement = await getEngagement(env, workspaceId, context, payload.engagementId);
  const prior = await env.DB.prepare(`SELECT id,version,track,draft_version FROM risk_assessments WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId, engagement.id).first<{ id: string; version: number; track: 'NEW_CLIENT'|'CONTINUANCE'; draft_version: number }>();
  if ((prior?.track ?? null) !== (prior ? payload.track : null) && prior) throw new ApiError('INVALID_STATE', 'The assessment track cannot change after an assessment is started.');
  const assessmentId = prior?.id ?? crypto.randomUUID();
  const assessmentVersion = prior?.version ?? 0;
  const draft = await env.DB.prepare(`SELECT version FROM risk_assessment_drafts WHERE workspace_id=? AND assessment_id=?`)
    .bind(workspaceId, assessmentId).first<{ version: number }>();
  const currentDraftVersion = draft?.version ?? 0;
  if (currentDraftVersion !== payload.expectedDraftVersion || (prior && prior.draft_version !== currentDraftVersion)) {
    throw new ApiError('VERSION_CONFLICT', 'The risk draft changed. Reload it and apply your changes to the current draft.');
  }
  const nextDraftVersion = currentDraftVersion + 1;
  const updatedPayload = { ...payload, checks: payload.checks.map(check => ({ ...check, checkMethod: check.checkMethod ?? 'MANUAL' })) };
  const draftJson = JSON.stringify(updatedPayload);
  if (draftJson.length > 200000) throw new ApiError('BAD_REQUEST', 'The risk assessment draft is too large.');
  const statements = [
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,80,CASE WHEN EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state<>'ARCHIVED_READ_ONLY')
        AND ((?=0 AND NOT EXISTS(SELECT 1 FROM risk_assessments WHERE workspace_id=? AND engagement_id=?))
          OR (? > 0 AND EXISTS(SELECT 1 FROM risk_assessments WHERE workspace_id=? AND id=? AND version=? AND draft_version=?)))
      THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, engagement.id, engagement.version,
      currentDraftVersion, workspaceId, engagement.id, currentDraftVersion, workspaceId, assessmentId, assessmentVersion, currentDraftVersion),
    ...(prior ? [] : [env.DB.prepare(`INSERT INTO risk_assessments(
      id,workspace_id,version,client_id,engagement_id,track,current_version_id,draft_version,created_at,updated_at,created_by_actor_id,updated_by_actor_id
    ) VALUES(?,?,1,?,?,?,NULL,1,?,?,?,?)`).bind(assessmentId, workspaceId, engagement.client_id, engagement.id, payload.track, now, now, context.actor.id, context.actor.id)]),
    env.DB.prepare(`INSERT INTO risk_assessment_drafts(workspace_id,assessment_id,version,draft_json,updated_at,updated_by_actor_id)
      VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,assessment_id) DO UPDATE SET version=excluded.version,draft_json=excluded.draft_json,
        updated_at=excluded.updated_at,updated_by_actor_id=excluded.updated_by_actor_id`)
      .bind(workspaceId, assessmentId, nextDraftVersion, draftJson, now, context.actor.id),
    ...(prior ? [env.DB.prepare(`UPDATE risk_assessments SET version=version+1,draft_version=?,updated_at=?,updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND version=? AND draft_version=?`)
      .bind(nextDraftVersion, now, context.actor.id, workspaceId, assessmentId, assessmentVersion, currentDraftVersion)] : [])
  ];
  return { statements, result: { assessmentId, draftVersion: nextDraftVersion, version: prior ? assessmentVersion + 1 : 1 }, entityType: 'RISK_ASSESSMENT_DRAFT', entityId: assessmentId, beforeVersion: currentDraftVersion || null, afterVersion: nextDraftVersion, auditDetails: { engagementId: engagement.id, track: payload.track, draftVersion: nextDraftVersion } };
}

async function buildSaveOwner(env: Env, workspaceId: string, context: RiskBusinessContext, command: Extract<BusinessRiskCommand,{type:'riskAssessment.owner.save'}>, now: string): Promise<RiskBusinessMutation> {
  requireRiskEditor(context);
  const payload = command.payload;
  const engagement = await getEngagement(env, workspaceId, context, payload.engagementId);
  if (payload.identityEvidenceFileId) await validateEvidenceFile(env, workspaceId, engagement.client_id, engagement.id, payload.identityEvidenceFileId, 'Owner identity evidence');
  const before = payload.ownerId ? await env.DB.prepare(`SELECT bo.id,bo.version,bo.current_revision_id,bo.active FROM beneficial_owners bo
    WHERE bo.workspace_id=? AND bo.client_id=? AND bo.id=?`).bind(workspaceId, engagement.client_id, payload.ownerId)
    .first<{ id: string; version: number; current_revision_id: string; active: number }>() : null;
  if (payload.ownerId && (!before || before.version !== payload.expectedVersion)) throw new ApiError('VERSION_CONFLICT', 'The owner record changed. Reload before revising it.');
  const ownerId = before?.id ?? crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const revision = await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS next_revision FROM beneficial_owner_revisions
    WHERE workspace_id=? AND owner_id=?`).bind(workspaceId, ownerId).first<{ next_revision: number }>();
  const assessment = await env.DB.prepare(`SELECT id,version FROM risk_assessments WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId, engagement.id).first<{ id: string; version: number }>();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,81,CASE WHEN EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state<>'ARCHIVED_READ_ONLY')
        AND ((? IS NULL AND NOT EXISTS(SELECT 1 FROM beneficial_owners WHERE workspace_id=? AND id=?))
          OR (? IS NOT NULL AND EXISTS(SELECT 1 FROM beneficial_owners WHERE workspace_id=? AND id=? AND version=? AND current_revision_id=?)))
        AND (? IS NULL OR EXISTS(SELECT 1 FROM file_versions WHERE workspace_id=? AND id=? AND client_id=? AND state='COMMITTED' AND immutable=1 AND purpose IN ('PBC','EVIDENCE')))
      THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, engagement.id, engagement.version,
      payload.ownerId ?? null, workspaceId, ownerId, payload.ownerId ?? null, workspaceId, ownerId, payload.expectedVersion ?? 0, before?.current_revision_id ?? '',
      payload.identityEvidenceFileId ?? null, workspaceId, payload.identityEvidenceFileId ?? '', engagement.client_id),
    ...(before ? [env.DB.prepare(`UPDATE beneficial_owners SET version=version+1,current_revision_id=?,active=?,updated_at=?,updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND version=? AND current_revision_id=?`)
      .bind(revisionId, payload.active ? 1 : 0, now, context.actor.id, workspaceId, ownerId, before.version, before.current_revision_id)] : [
      env.DB.prepare(`INSERT INTO beneficial_owners(id,workspace_id,version,client_id,current_revision_id,active,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
        VALUES(?,?,1,?,?,1,?,?,?,?)`).bind(ownerId, workspaceId, engagement.client_id, revisionId, now, now, context.actor.id, context.actor.id)
    ]),
    env.DB.prepare(`INSERT INTO beneficial_owner_revisions(id,workspace_id,version,owner_id,client_id,revision,full_name,ownership_bps,control_basis,
      identity_evidence_file_id,effective_from,effective_to,supersedes_revision_id,created_at,created_by_actor_id)
      VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(revisionId, workspaceId, ownerId, engagement.client_id, revision?.next_revision ?? 1,
      payload.fullName, payload.ownershipBps, payload.controlBasis, payload.identityEvidenceFileId ?? null, payload.effectiveFrom, payload.effectiveTo ?? null,
      before?.current_revision_id ?? null, now, context.actor.id),
    ...(assessment ? [env.DB.prepare(`UPDATE risk_assessments SET version=version+1,updated_at=?,updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND version=?`).bind(now, context.actor.id, workspaceId, assessment.id, assessment.version)] : [])
  ];
  return { statements, result: { ownerId, revisionId, revision: revision?.next_revision ?? 1, version: (before?.version ?? 0) + 1 }, entityType: 'BENEFICIAL_OWNER', entityId: ownerId, beforeVersion: before?.version ?? null, afterVersion: (before?.version ?? 0) + 1, auditDetails: { engagementId: engagement.id, ownerRevisionId: revisionId } };
}

async function buildSubmitRisk(env: Env, workspaceId: string, context: RiskBusinessContext, command: Extract<BusinessRiskCommand,{type:'riskAssessment.submit'}>, now: string): Promise<RiskBusinessMutation> {
  requireRiskEditor(context);
  const assessment = await env.DB.prepare(`SELECT ra.id,ra.version,ra.client_id,ra.engagement_id,ra.track,ra.draft_version,e.version AS engagement_version
    FROM risk_assessments ra JOIN engagements e ON e.workspace_id=ra.workspace_id AND e.client_id=ra.client_id AND e.id=ra.engagement_id
    WHERE ra.workspace_id=? AND ra.id=?`).bind(workspaceId, command.payload.assessmentId)
    .first<{ id: string; version: number; client_id: string; engagement_id: string; track: 'NEW_CLIENT'|'CONTINUANCE'; draft_version: number; engagement_version: number }>();
  if (!assessment) throw new ApiError('NOT_FOUND', 'Risk assessment not found.');
  assertEngagementScope(context, assessment.client_id, assessment.engagement_id);
  if (assessment.draft_version !== command.payload.expectedDraftVersion) throw new ApiError('VERSION_CONFLICT', 'The risk assessment draft changed. Reload before submitting.');
  const draft = await env.DB.prepare(`SELECT version,draft_json FROM risk_assessment_drafts WHERE workspace_id=? AND assessment_id=?`)
    .bind(workspaceId, assessment.id).first<{ version: number; draft_json: string }>();
  if (!draft || draft.version !== command.payload.expectedDraftVersion) throw new ApiError('VERSION_CONFLICT', 'The current risk assessment draft is unavailable.');
  const parsed = saveRiskDraft.shape.payload.safeParse(JSON.parse(draft.draft_json));
  if (!parsed.success) throw new ApiError('BAD_REQUEST', 'The stored risk draft needs correction before submission.');
  const value = parsed.data;
  if (value.track !== assessment.track || value.engagementId !== assessment.engagement_id) throw new ApiError('BAD_REQUEST', 'The stored risk draft does not match its assessment.');
  const missing = currentRequiredCodes(value.track, value.checks);
  if (missing.length) blocked('Complete the required checks and resolve identified issues before submitting.', { blockers: missing });
  const owners = await currentOwners(env, workspaceId, assessment.client_id);
  const ownersTotal = owners.reduce((total, owner) => total + BigInt(owner.ownership_bps), 0n);
  const ubo = value.checks.find(check => check.code === 'UBO');
  if (value.track === 'NEW_CLIENT' && ubo?.outcome === 'CLEAR' && (owners.length === 0 || ownersTotal !== 10000n)) {
    blocked('The UBO conclusion needs a current beneficial-owner register totaling exactly 100%.', { recordedOwnershipBps: String(ownersTotal) });
  }
  const evidenceFiles = new Map<string, string>();
  for (const check of value.checks) {
    if (check.evidenceFileId) evidenceFiles.set(check.evidenceFileId, (await validateEvidenceFile(env, workspaceId, assessment.client_id, assessment.engagement_id, check.evidenceFileId, `${check.code} evidence`)).sha256);
  }
  for (const owner of owners) if (owner.identity_evidence_file_id) {
    const file = await validateEvidenceFile(env, workspaceId, assessment.client_id, assessment.engagement_id, owner.identity_evidence_file_id, 'Owner identity evidence');
    evidenceFiles.set(owner.identity_evidence_file_id, file.sha256);
  }
  const ownersHash = await ownershipHash(env, workspaceId, assessment.client_id);
  const dossierDependencyHash = await sha256Hex(JSON.stringify({
    assessmentId: assessment.id, assessmentVersion: assessment.version, engagementId: assessment.engagement_id,
    track: value.track, template: value.questionnaireTemplateVersion, date: value.assessmentDate, overallRisk: value.overallRisk,
    conclusions: [value.managementIntegrityConclusion, value.viabilityConclusion, value.independenceConclusion], ownersHash,
    checks: value.checks.map(check => ({ ...check, evidenceSha256: check.evidenceFileId ? evidenceFiles.get(check.evidenceFileId) : null }))
  }));
  const currentRevision = await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS revision FROM risk_assessment_versions WHERE workspace_id=? AND assessment_id=?`)
    .bind(workspaceId, assessment.id).first<{ revision: number }>();
  const versionId = crypto.randomUUID();
  const checkRows = value.checks.map(check => ({ id: crypto.randomUUID(), check }));
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,82,CASE WHEN EXISTS(SELECT 1 FROM risk_assessments ra JOIN risk_assessment_drafts rd ON rd.workspace_id=ra.workspace_id AND rd.assessment_id=ra.id
          JOIN engagements e ON e.workspace_id=ra.workspace_id AND e.client_id=ra.client_id AND e.id=ra.engagement_id
        WHERE ra.workspace_id=? AND ra.id=? AND ra.version=? AND ra.draft_version=? AND rd.version=? AND e.version=? AND e.lifecycle_state<>'ARCHIVED_READ_ONLY')
        AND NOT EXISTS(SELECT 1 FROM risk_assessment_versions WHERE workspace_id=? AND assessment_id=? AND source_draft_version=?)
      THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, assessment.id, assessment.version, command.payload.expectedDraftVersion,
      command.payload.expectedDraftVersion, assessment.engagement_version, workspaceId, assessment.id, command.payload.expectedDraftVersion),
    env.DB.prepare(`INSERT INTO risk_assessment_versions(id,workspace_id,version,client_id,engagement_id,assessment_id,revision,assessment_source_version,
      source_draft_version,questionnaire_template_version,assessment_date,overall_risk,management_integrity_conclusion,viability_conclusion,
      independence_conclusion,ownership_hash,dependency_hash,submitted_by_actor_id,submitted_at)
      VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(versionId, workspaceId, assessment.client_id, assessment.engagement_id,
      assessment.id, currentRevision?.revision ?? 1, assessment.version, command.payload.expectedDraftVersion,
      value.questionnaireTemplateVersion, value.assessmentDate, value.overallRisk, value.managementIntegrityConclusion,
      value.viabilityConclusion, value.independenceConclusion, ownersHash, dossierDependencyHash, context.actor.id, now),
    ...checkRows.map(({ id: checkId, check }) => env.DB.prepare(`INSERT INTO risk_checks(id,workspace_id,version,client_id,engagement_id,assessment_version_id,
      code,outcome,findings,source_reference,check_method,provider_name,external_reference,checked_on,evidence_file_id,resolution)
      VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(checkId, workspaceId, assessment.client_id, assessment.engagement_id, versionId,
      check.code, check.outcome, check.findings, check.sourceReference, check.checkMethod, check.providerName ?? null, check.externalReference ?? null,
      check.checkedOn, check.evidenceFileId ?? null, check.resolution ?? null)),
    env.DB.prepare(`UPDATE risk_assessments SET current_version_id=?,updated_at=?,updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND version=? AND draft_version=?`).bind(versionId, now, context.actor.id, workspaceId, assessment.id, assessment.version, command.payload.expectedDraftVersion)
  ];
  return { statements, result: { assessmentId: assessment.id, assessmentVersionId: versionId, revision: currentRevision?.revision ?? 1, status: 'AWAITING_PARTNER', dependencyHash: dossierDependencyHash }, entityType: 'RISK_ASSESSMENT_VERSION', entityId: versionId, beforeVersion: null, afterVersion: 1, auditDetails: { engagementId: assessment.engagement_id, revision: currentRevision?.revision ?? 1, track: value.track, dependencyHash: dossierDependencyHash } };
}

async function buildRiskDecision(env: Env, workspaceId: string, context: RiskBusinessContext, command: Extract<BusinessRiskCommand,{type:'risk.clear'|'risk.reject'|'risk.revoke'}>, commandId: string, now: string): Promise<RiskBusinessMutation> {
  requirePartner(context);
  const revokePayload = command.type === 'risk.revoke' ? command.payload : null;
  const revoke = revokePayload !== null;
  const payload = command.payload;
  const engagementId = payload.engagementId;
  const engagement = await getEngagement(env, workspaceId, context, engagementId);
  const assessmentVersionId = revokePayload
    ? await env.DB.prepare(`SELECT assessment_version_id FROM risk_clearances WHERE workspace_id=? AND engagement_id=? AND id=?`)
      .bind(workspaceId, engagement.id, revokePayload.clearanceId).first<{ assessment_version_id: string }>().then(row => row?.assessment_version_id ?? null)
    : command.type === 'risk.revoke' ? null : command.payload.riskAssessmentVersionId;
  if (!assessmentVersionId) throw new ApiError('NOT_FOUND', 'Risk assessment or clearance was not found for this engagement.');
  const snapshot = await env.DB.prepare(`SELECT rv.id,rv.revision,rv.assessment_id,rv.assessment_source_version,rv.dependency_hash,rv.ownership_hash,
      ra.version AS current_assessment_version,ra.current_version_id,rv.client_id,rv.engagement_id
    FROM risk_assessment_versions rv JOIN risk_assessments ra ON ra.workspace_id=rv.workspace_id AND ra.id=rv.assessment_id
    WHERE rv.workspace_id=? AND rv.id=? AND rv.engagement_id=?`).bind(workspaceId, assessmentVersionId, engagement.id)
    .first<{ id: string; revision: number; assessment_id: string; assessment_source_version: number; dependency_hash: string; ownership_hash: string; current_assessment_version: number; current_version_id: string | null; client_id: string; engagement_id: string }>();
  if (!snapshot) throw new ApiError('NOT_FOUND', 'Risk assessment revision was not found for this engagement.');
  if (snapshot.current_version_id !== snapshot.id) throw new ApiError('STALE_APPROVAL', 'Only the current submitted risk revision can receive a Partner decision.');
  const currentHash = await riskDependencyHash(env, workspaceId, snapshot.id, snapshot.assessment_source_version, snapshot.client_id);
  if (snapshot.current_assessment_version !== snapshot.assessment_source_version) throw new ApiError('STALE_APPROVAL', 'Risk facts changed after submission. Submit a new revision before Partner review.');
  const checks = await env.DB.prepare(`SELECT id,code,outcome,resolution,evidence_file_id FROM risk_checks
    WHERE workspace_id=? AND assessment_version_id=? ORDER BY code,id`).bind(workspaceId, snapshot.id)
    .all<{ id: string; code: string; outcome: string; resolution: string | null; evidence_file_id: string | null }>();
  const checkItems = checks.results ?? [];
  const escalationRows = await env.DB.prepare(`SELECT id,check_id,check_code,status,resolution,evidence_file_id,required_evidence
    FROM risk_escalations WHERE workspace_id=? AND assessment_version_id=? ORDER BY created_at DESC,id DESC`)
    .bind(workspaceId, snapshot.id).all<{ id: string; check_id: string; check_code: string; status: 'OPEN'|'RESOLVED'; resolution: string | null; evidence_file_id: string | null; required_evidence: string }>();
  const escalationItems = escalationRows.results ?? [];
  const checkBlockers: string[] = [];
  const required = snapshot.current_assessment_version > 0
    ? (await env.DB.prepare(`SELECT track FROM risk_assessments WHERE workspace_id=? AND id=?`).bind(workspaceId, snapshot.assessment_id)
      .first<{ track: 'NEW_CLIENT'|'CONTINUANCE' }>())?.track === 'CONTINUANCE' ? trackBCodes : trackACodes
    : trackACodes;
  const checkByCode = new Map(checkItems.map(check => [check.code, check]));
  for (const code of required) {
    const check = checkByCode.get(code);
    const escalationsForCheck = check ? escalationItems.filter(item => item.check_id === check.id) : [];
    const openEscalation = escalationsForCheck.find(item => item.status === 'OPEN');
    const resolvedEscalation = escalationsForCheck.find(item => item.status === 'RESOLVED');
    if (!check) checkBlockers.push(`${code}: assessment is missing`);
    else if (openEscalation) checkBlockers.push(`${code}: Partner escalation is still open; ${openEscalation.required_evidence}`);
    else if (check.outcome === 'ISSUE' && !check.resolution && !resolvedEscalation?.resolution) checkBlockers.push(`${code}: identified issue remains unresolved`);
    else if (check.outcome === 'NOT_APPLICABLE' && !check.resolution) checkBlockers.push(`${code}: non-applicability needs an explanation`);
    else if (['UBO', 'KYC', 'AML'].includes(code) && check.outcome === 'CLEAR' && !check.evidence_file_id && !resolvedEscalation?.evidence_file_id) checkBlockers.push(`${code}: committed supporting evidence is missing`);
  }
  if (checkBlockers.length) blocked('The dossier has unresolved or incomplete required checks.', { blockers: checkBlockers });
  const prior = await env.DB.prepare(`SELECT id,sequence,decision,assessment_version_id,approval_decision_id,dependency_hash
    FROM risk_clearances WHERE workspace_id=? AND engagement_id=? ORDER BY sequence DESC LIMIT 1`)
    .bind(workspaceId, engagement.id).first<{ id: string; sequence: number; decision: 'CLEAR'|'REJECT'|'REVOKE'; assessment_version_id: string; approval_decision_id: string; dependency_hash: string }>();
  if (revokePayload && (!prior || prior.id !== revokePayload.clearanceId || prior.decision !== 'CLEAR')) {
    throw new ApiError('INVALID_STATE', 'Only the current Partner CLEAR decision can be revoked.');
  }
  const decision = revoke ? 'REVOKE' : command.type === 'risk.reject' ? 'REJECT' : 'CLEAR';
  const sequence = (prior?.sequence ?? 0) + 1;
  const clearanceId = crypto.randomUUID();
  const approvalId = crypto.randomUUID();
  const dependencies = [
    { type: 'RISK_ASSESSMENT_VERSION', id: snapshot.id, version: 1, hash: snapshot.dependency_hash },
    ...checkItems.map(check => ({ type: 'RISK_CHECK', id: check.id, version: 1, hash: null as string | null })),
    ...await currentOwners(env, workspaceId, engagement.client_id).then(owners => owners.map(owner => ({ type: 'BENEFICIAL_OWNER_REVISION', id: owner.current_revision_id, version: 1, hash: null as string | null })))
  ];
  const fileDependencies = await env.DB.prepare(`SELECT DISTINCT fv.id,fv.version,fv.sha256 FROM file_versions fv
    WHERE fv.workspace_id=? AND fv.id IN (SELECT evidence_file_id FROM risk_checks WHERE workspace_id=? AND assessment_version_id=? AND evidence_file_id IS NOT NULL
      UNION SELECT br.identity_evidence_file_id FROM beneficial_owners bo JOIN beneficial_owner_revisions br ON br.workspace_id=bo.workspace_id AND br.id=bo.current_revision_id
        WHERE bo.workspace_id=? AND bo.client_id=? AND bo.active=1 AND br.identity_evidence_file_id IS NOT NULL
      UNION SELECT evidence_file_id FROM risk_escalations WHERE workspace_id=? AND assessment_version_id=? AND evidence_file_id IS NOT NULL)`)
    .bind(workspaceId, workspaceId, snapshot.id, workspaceId, engagement.client_id, workspaceId, snapshot.id).all<{ id: string; version: number; sha256: string }>();
  dependencies.push(...(fileDependencies.results ?? []).map(file => ({ type: 'FILE_VERSION', id: file.id, version: file.version, hash: file.sha256 })));
  const actorSnapshot = JSON.stringify({ actorId: context.actor.id, persona: context.actor.persona, displayName: context.actor.displayName, staffGrade: context.actor.staffGrade, assurance: 'SELF_ASSERTED' });
  const reason = payload.rationale;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,84,CASE WHEN EXISTS(SELECT 1 FROM risk_assessments ra JOIN risk_assessment_versions rv
          ON rv.workspace_id=ra.workspace_id AND rv.id=ra.current_version_id
        WHERE ra.workspace_id=? AND ra.engagement_id=? AND ra.current_version_id=? AND ra.version=?
          AND rv.assessment_source_version=? AND rv.ownership_hash=? AND EXISTS(SELECT 1 FROM engagements e
            WHERE e.workspace_id=ra.workspace_id AND e.id=ra.engagement_id AND e.version=? AND e.lifecycle_state<>'ARCHIVED_READ_ONLY'))
        AND ((?='REVOKE' AND EXISTS(SELECT 1 FROM risk_clearances WHERE workspace_id=? AND engagement_id=? AND id=? AND decision='CLEAR'))
          OR (?<>'REVOKE' AND 1=1))
      THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, engagement.id, snapshot.id, snapshot.current_assessment_version,
      snapshot.assessment_source_version, snapshot.ownership_hash, engagement.version, decision, workspaceId, engagement.id, revokePayload?.clearanceId ?? '', decision),
    env.DB.prepare(`INSERT INTO approval_decisions(id,workspace_id,client_id,engagement_id,version,subject_type,subject_id,subject_version,decision,rationale,actor_snapshot_json,decided_at,supersedes_decision_id)
      VALUES(?,?,?,?,1,'RISK_ASSESSMENT',?,?,?,?,?,?,?)`).bind(approvalId, workspaceId, engagement.client_id, engagement.id,
      snapshot.id, snapshot.revision, decision === 'CLEAR' ? 'APPROVE' : decision, reason, actorSnapshot, now, prior?.approval_decision_id ?? null),
    ...dependencies.map(dep => env.DB.prepare(`INSERT INTO approval_dependencies(id,workspace_id,client_id,engagement_id,version,approval_id,entity_type,entity_id,entity_version,content_sha256)
      VALUES(?,?, ?,?,1,?,?,?,?,?)`).bind(crypto.randomUUID(), workspaceId, engagement.client_id, engagement.id, approvalId, dep.type, dep.id, dep.version, dep.hash)),
    env.DB.prepare(`INSERT INTO risk_clearances(id,workspace_id,sequence,client_id,engagement_id,assessment_version_id,approval_decision_id,decision,rationale,
      partner_actor_id,signature_asset_id,dependency_hash,supersedes_clearance_id,signed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,NULL,?,?,?)`).bind(clearanceId, workspaceId, sequence, engagement.client_id, engagement.id, snapshot.id,
      approvalId, decision, reason, context.actor.id, currentHash.dependencyHash, prior?.id ?? null, now)
  ];
  let transitionStatements: D1PreparedStatement[] = [];
  if (decision === 'CLEAR' && engagement.active_proposal_version_id) {
    const commercial = await activeCommercialAcceptance(env, workspaceId, engagement.id, engagement.active_proposal_version_id);
    if (commercial && engagement.lifecycle_state === 'DUAL_KEY_PENDING') {
      const transitionHash = await sha256Hex(JSON.stringify({ proposalVersionId: commercial.proposal_version_id, commercialAcceptanceId: commercial.id, riskClearanceId: clearanceId, riskDependencyHash: currentHash.dependencyHash }));
      transitionStatements = await appendAdvanceIfReady(env, workspaceId, engagement, commandId, now, context.actor.id, commercial.id, clearanceId, currentHash.dependencyHash);
      if (!transitionStatements.length) transitionStatements = [];
      // The transition dependency hash is tied to both exact decisions.
      if (transitionStatements.length) transitionStatements[2] = env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at)
        SELECT ?,?,?,?,1,'DUAL_KEY_PENDING','ADVANCE_BILLING',?,'Both current acceptance keys are active for the exact proposal and risk revisions.',?,?
        WHERE changes()=1`).bind(crypto.randomUUID(), workspaceId, engagement.client_id, engagement.id, commandId, transitionHash, now);
    }
  }
  statements.push(...transitionStatements);
  return { statements, result: { clearanceId, approvalDecisionId: approvalId, decision, riskKey: decision === 'CLEAR' ? 'ACTIVE' : decision === 'REVOKE' ? 'REVOKED' : 'REJECTED', dependencyHash: currentHash.dependencyHash }, entityType: 'RISK_CLEARANCE', entityId: clearanceId, beforeVersion: prior?.sequence ?? null, afterVersion: sequence, auditDetails: { engagementId: engagement.id, assessmentVersionId: snapshot.id, decision, dependencyHash: currentHash.dependencyHash } };
}

async function buildCommercialAcceptance(env: Env, workspaceId: string, context: RiskBusinessContext, command: Extract<BusinessRiskCommand,{type:'commercialAcceptance.record'|'commercialAcceptance.revoke'}>, commandId: string, now: string): Promise<RiskBusinessMutation> {
  const revoke = command.type === 'commercialAcceptance.revoke';
  if (context.actor.persona !== 'CLIENT' || !context.allowedActions.includes(revoke ? 'commercialAcceptance.revoke' : 'commercialAcceptance.record')) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only a CLIENT profile can accept or revoke its engagement terms.');
  }
  let payload: (typeof command)['payload'] = command.payload;
  let engagementId: string;
  let proposalVersionId: string;
  let acceptedFeeMinor: number | null;
  let confirmationText: string;
  let evidenceFileId: string | null;
  type CommercialPrior = { id: string; sequence: number; client_id: string; engagement_id: string; proposal_version_id: string; contact_id: string; actor_id: string };
  let prior: CommercialPrior | null = null;
  if (revoke) {
    prior = await env.DB.prepare(`SELECT id,sequence,client_id,engagement_id,proposal_version_id,contact_id,actor_id FROM commercial_acceptances
      WHERE workspace_id=? AND id=? AND decision='ACCEPT'`).bind(workspaceId, command.payload.acceptanceId)
      .first<CommercialPrior>();
    if (!prior) throw new ApiError('NOT_FOUND', 'The commercial acceptance was not found.');
    engagementId = prior.engagement_id; proposalVersionId = prior.proposal_version_id; acceptedFeeMinor = null;
    confirmationText = command.payload.rationale; evidenceFileId = null;
  } else {
    engagementId = command.payload.engagementId; proposalVersionId = command.payload.proposalVersionId;
    acceptedFeeMinor = Number(command.payload.acceptedFeeMinor); confirmationText = command.payload.confirmationText;
    evidenceFileId = command.payload.evidenceFileId ?? null;
  }
  const engagement = await getEngagement(env, workspaceId, context, engagementId);
  const actor = await env.DB.prepare(`SELECT ap.contact_id,c.client_id,c.active,c.is_signatory
    FROM actor_profiles ap JOIN contacts c ON c.workspace_id=ap.workspace_id AND c.id=ap.contact_id
    WHERE ap.workspace_id=? AND ap.id=? AND ap.persona='CLIENT'`)
    .bind(workspaceId, context.actor.id).first<{ contact_id: string; client_id: string; active: number; is_signatory: number }>();
  if (!actor || actor.client_id !== engagement.client_id || actor.active !== 1 || actor.is_signatory !== 1) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Commercial acceptance requires the active signatory contact profile for this client.');
  }
  if (prior && (prior.actor_id !== context.actor.id || prior.contact_id !== actor.contact_id)) throw new ApiError('PERSONA_ACTION_DENIED', 'Only the client contact who recorded this acceptance can revoke it.');
  const proposal = await env.DB.prepare(`SELECT pv.id,pv.fee_minor,pv.revision,p.current_version_id,e.active_proposal_version_id,e.lifecycle_state
    FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
    JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.id=pv.engagement_id
    WHERE pv.workspace_id=? AND pv.id=? AND pv.engagement_id=?`)
    .bind(workspaceId, proposalVersionId, engagement.id)
    .first<{ id: string; fee_minor: number; revision: number; current_version_id: string; active_proposal_version_id: string | null; lifecycle_state: string }>();
  if (!proposal) throw new ApiError('NOT_FOUND', 'The proposal revision was not found for this engagement.');
  if (proposal.current_version_id !== proposalVersionId || proposal.active_proposal_version_id !== proposalVersionId) {
    throw new ApiError('STALE_APPROVAL', 'The proposal changed. Acceptance must identify the current active proposal revision.');
  }
  if (!revoke && acceptedFeeMinor !== proposal.fee_minor) throw new ApiError('VALIDATION_FAILED', 'The accepted amount must exactly match the current proposal fee in QAR minor units.');
  if (!revoke) {
    const presented = await env.DB.prepare(`SELECT 1 AS found FROM proposal_artifacts pa
      JOIN generated_artifacts ga ON ga.workspace_id=pa.workspace_id AND ga.id=pa.artifact_id
      JOIN file_versions fv ON fv.workspace_id=ga.workspace_id AND fv.id=ga.file_version_id AND fv.state='COMMITTED' AND fv.immutable=1
      WHERE pa.workspace_id=? AND pa.proposal_version_id=?
        AND EXISTS(SELECT 1 FROM proposal_approvals a WHERE a.workspace_id=pa.workspace_id AND a.proposal_version_id=pa.proposal_version_id
          AND a.decision='APPROVE' AND NOT EXISTS(SELECT 1 FROM proposal_approvals later WHERE later.workspace_id=a.workspace_id
            AND later.proposal_version_id=a.proposal_version_id AND (later.decided_at>a.decided_at OR (later.decided_at=a.decided_at AND later.id>a.id))))
      LIMIT 1`).bind(workspaceId, proposalVersionId).first<{ found: number }>();
    if (!presented) blocked('The current proposal must have a Partner-approved, committed artifact before the client can accept it.');
    if (evidenceFileId) await validateEvidenceFile(env, workspaceId, engagement.client_id, engagement.id, evidenceFileId, 'Acceptance evidence');
  }
  const latest = await env.DB.prepare(`SELECT id,sequence,decision,accepted_fee_minor FROM commercial_acceptances
    WHERE workspace_id=? AND proposal_version_id=? ORDER BY sequence DESC LIMIT 1`)
    .bind(workspaceId, proposalVersionId).first<{ id: string; sequence: number; decision: 'ACCEPT'|'REVOKE'; accepted_fee_minor: number | null }>();
  if (revoke && (!latest || latest.id !== prior?.id || latest.decision !== 'ACCEPT')) throw new ApiError('INVALID_STATE', 'Only the current commercial acceptance can be revoked.');
  if (!revoke && latest?.decision === 'ACCEPT') throw new ApiError('INVALID_STATE', 'This proposal revision already has a current client acceptance.');
  const sequence = (latest?.sequence ?? 0) + 1;
  const acceptanceId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,85,CASE WHEN EXISTS(SELECT 1 FROM engagements e JOIN proposals p ON p.workspace_id=e.workspace_id AND p.engagement_id=e.id
          AND p.current_version_id=e.active_proposal_version_id JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.id=p.current_version_id
          JOIN contacts c ON c.workspace_id=e.workspace_id AND c.client_id=e.client_id AND c.id=? AND c.active=1 AND c.is_signatory=1
        WHERE e.workspace_id=? AND e.id=? AND e.version=? AND e.active_proposal_version_id=? AND pv.id=?
          AND (? IS NULL OR pv.fee_minor=?) AND ((?='REVOKE' AND EXISTS(SELECT 1 FROM commercial_acceptances ca
            WHERE ca.workspace_id=e.workspace_id AND ca.id=? AND ca.sequence=? AND ca.decision='ACCEPT')) OR (?='ACCEPT'))
        AND (? IS NULL OR EXISTS(SELECT 1 FROM file_versions fv WHERE fv.workspace_id=? AND fv.id=? AND fv.client_id=e.client_id
          AND fv.state='COMMITTED' AND fv.immutable=1 AND fv.purpose IN ('PBC','EVIDENCE'))))
      THEN 1 ELSE 0 END`).bind(workspaceId, actor.contact_id, workspaceId, engagement.id, engagement.version, proposalVersionId,
      proposalVersionId, acceptedFeeMinor, acceptedFeeMinor, revoke ? 'REVOKE' : 'ACCEPT', prior?.id ?? '', prior?.sequence ?? 0,
      revoke ? 'REVOKE' : 'ACCEPT', evidenceFileId, workspaceId, evidenceFileId ?? ''),
    env.DB.prepare(`INSERT INTO commercial_acceptances(id,workspace_id,sequence,client_id,engagement_id,proposal_version_id,contact_id,decision,
      accepted_fee_minor,confirmation_text,evidence_file_id,actor_id,revoked_acceptance_id,accepted_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(acceptanceId, workspaceId, sequence, engagement.client_id, engagement.id, proposalVersionId,
      actor.contact_id, revoke ? 'REVOKE' : 'ACCEPT', acceptedFeeMinor, confirmationText, evidenceFileId, context.actor.id,
      revoke ? prior?.id ?? null : null, now)
  ];
  if (!revoke && engagement.lifecycle_state === 'DUAL_KEY_PENDING') {
    const risk = await activeRiskClearance(env, workspaceId, engagement.id, engagement.client_id);
    if (risk) {
      const key = await riskDependencyHash(env, workspaceId, risk.assessment_version_id, risk.assessment_source_version!, engagement.client_id);
      const transitionHash = await sha256Hex(JSON.stringify({ proposalVersionId, commercialAcceptanceId: acceptanceId, riskClearanceId: risk.id, riskDependencyHash: key.dependencyHash }));
      statements.push(...await appendAdvanceIfReady(env, workspaceId, engagement, commandId, now, context.actor.id, acceptanceId, risk.id, key.dependencyHash));
      if (statements.length >= 5) statements[statements.length - 1] = env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at)
        SELECT ?,?,?,?,1,'DUAL_KEY_PENDING','ADVANCE_BILLING',?,'Both current acceptance keys are active for the exact proposal and risk revisions.',?,?
        WHERE changes()=1`).bind(crypto.randomUUID(), workspaceId, engagement.client_id, engagement.id, commandId, transitionHash, now);
    }
  }
  return { statements, result: { acceptanceId, decision: revoke ? 'REVOKE' : 'ACCEPT', commercialKey: revoke ? 'REVOKED' : 'ACTIVE', proposalVersionId, acceptedFeeMinor: acceptedFeeMinor === null ? null : String(acceptedFeeMinor) }, entityType: 'COMMERCIAL_ACCEPTANCE', entityId: acceptanceId, beforeVersion: latest?.sequence ?? null, afterVersion: sequence, auditDetails: { engagementId: engagement.id, proposalVersionId, decision: revoke ? 'REVOKE' : 'ACCEPT', feeMinor: acceptedFeeMinor === null ? null : String(acceptedFeeMinor) } };
}

async function buildRiskEscalation(env: Env, workspaceId: string, context: RiskBusinessContext, command: Extract<BusinessRiskCommand,{type:'riskAssessment.escalate'}>, now: string): Promise<RiskBusinessMutation> {
  if (context.actor.persona !== 'REVIEWER' || !context.allowedActions.includes('riskAssessment.escalate')) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'A REVIEWER profile must raise a risk escalation for Partner attention.');
  }
  const assessment = await env.DB.prepare(`SELECT ra.id,ra.client_id,ra.engagement_id,ra.current_version_id
    FROM risk_assessment_versions rv JOIN risk_assessments ra ON ra.workspace_id=rv.workspace_id AND ra.id=rv.assessment_id
    WHERE rv.workspace_id=? AND rv.id=?`).bind(workspaceId, command.payload.assessmentVersionId)
    .first<{ id: string; client_id: string; engagement_id: string; current_version_id: string | null }>();
  if (!assessment) throw new ApiError('NOT_FOUND', 'The submitted risk assessment revision was not found.');
  assertEngagementScope(context, assessment.client_id, assessment.engagement_id);
  if (assessment.current_version_id !== command.payload.assessmentVersionId) throw new ApiError('STALE_APPROVAL', 'Escalate only a current submitted risk revision.');
  const engagement = await getEngagement(env, workspaceId, context, assessment.engagement_id);
  const check = await env.DB.prepare(`SELECT id,code,outcome,evidence_file_id FROM risk_checks WHERE workspace_id=? AND id=? AND assessment_version_id=?`)
    .bind(workspaceId, command.payload.checkId, command.payload.assessmentVersionId)
    .first<{ id: string; code: string; outcome: string; evidence_file_id: string | null }>();
  if (!check) throw new ApiError('NOT_FOUND', 'The risk check is not part of this submitted revision.');
  if (check.outcome === 'CLEAR' && check.evidence_file_id) throw new ApiError('INVALID_STATE', 'Escalate only an identified issue or a check with missing supporting evidence.');
  const latest = await env.DB.prepare(`SELECT id,status,version FROM risk_escalations WHERE workspace_id=? AND assessment_version_id=? AND check_id=? ORDER BY created_at DESC,id DESC LIMIT 1`)
    .bind(workspaceId, command.payload.assessmentVersionId, check.id).first<{ id: string; status: 'OPEN'|'RESOLVED'; version: number }>();
  if (latest?.status === 'OPEN') throw new ApiError('INVALID_STATE', 'This risk check already has an open Partner escalation.');
  const escalationId = crypto.randomUUID();
  const statements = [
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,86,CASE WHEN EXISTS(SELECT 1 FROM risk_assessments ra JOIN risk_assessment_versions rv ON rv.workspace_id=ra.workspace_id AND rv.assessment_id=ra.id
          JOIN risk_checks rc ON rc.workspace_id=rv.workspace_id AND rc.assessment_version_id=rv.id
          JOIN engagements e ON e.workspace_id=ra.workspace_id AND e.client_id=ra.client_id AND e.id=ra.engagement_id
        WHERE ra.workspace_id=? AND ra.id=? AND ra.current_version_id=? AND ra.version=rv.assessment_source_version
          AND rc.id=? AND rc.code=? AND e.version=? AND e.lifecycle_state<>'ARCHIVED_READ_ONLY')
        AND NOT EXISTS(SELECT 1 FROM risk_escalations old WHERE old.workspace_id=? AND old.assessment_version_id=? AND old.check_id=? AND old.status='OPEN')
      THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, assessment.id, command.payload.assessmentVersionId, check.id, check.code, engagement.version,
      workspaceId, command.payload.assessmentVersionId, check.id),
    env.DB.prepare(`INSERT INTO risk_escalations(id,workspace_id,version,client_id,engagement_id,assessment_id,assessment_version_id,check_id,check_code,
      reason,required_evidence,status,resolution,evidence_file_id,created_by_actor_id,resolved_by_actor_id,resolved_at,created_at,updated_at)
      VALUES(?,?,1,?,?,?,?,?,?,?,?,'OPEN',NULL,NULL,?,NULL,NULL,?,?)`)
      .bind(escalationId, workspaceId, assessment.client_id, assessment.engagement_id, assessment.id, command.payload.assessmentVersionId,
        check.id, check.code, command.payload.reason, command.payload.requiredEvidence, context.actor.id, now, now)
  ];
  return { statements, result: { escalationId, assessmentVersionId: command.payload.assessmentVersionId, checkId: check.id, checkCode: check.code, status: 'OPEN' },
    entityType: 'RISK_ESCALATION', entityId: escalationId, beforeVersion: latest?.version ?? null, afterVersion: 1,
    auditDetails: { engagementId: assessment.engagement_id, assessmentVersionId: command.payload.assessmentVersionId, checkCode: check.code, status: 'OPEN' } };
}

async function buildResolveRiskEscalation(env: Env, workspaceId: string, context: RiskBusinessContext, command: Extract<BusinessRiskCommand,{type:'riskAssessment.resolveEscalation'}>, now: string): Promise<RiskBusinessMutation> {
  requirePartner(context);
  const escalation = await env.DB.prepare(`SELECT re.id,re.version,re.client_id,re.engagement_id,re.assessment_id,re.assessment_version_id,re.check_id,re.check_code,
      re.required_evidence,re.status,ra.current_version_id,e.version AS engagement_version
    FROM risk_escalations re JOIN risk_assessments ra ON ra.workspace_id=re.workspace_id AND ra.id=re.assessment_id
    JOIN engagements e ON e.workspace_id=re.workspace_id AND e.client_id=re.client_id AND e.id=re.engagement_id
    WHERE re.workspace_id=? AND re.id=?`).bind(workspaceId, command.payload.escalationId)
    .first<{ id: string; version: number; client_id: string; engagement_id: string; assessment_id: string; assessment_version_id: string; check_id: string; check_code: string; required_evidence: string; status: 'OPEN'|'RESOLVED'; current_version_id: string | null; engagement_version: number }>();
  if (!escalation) throw new ApiError('NOT_FOUND', 'The Partner escalation was not found.');
  assertEngagementScope(context, escalation.client_id, escalation.engagement_id);
  const engagement = await getEngagement(env, workspaceId, context, escalation.engagement_id);
  if (escalation.current_version_id !== escalation.assessment_version_id) throw new ApiError('STALE_APPROVAL', 'This escalation belongs to a superseded risk dossier revision.');
  if (escalation.status !== 'OPEN' || escalation.version !== command.payload.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'This escalation is no longer open at the expected version.');
  await validateEvidenceFile(env, workspaceId, escalation.client_id, escalation.engagement_id, command.payload.evidenceFileId, 'Escalation resolution evidence');
  const statements = [
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,87,CASE WHEN EXISTS(SELECT 1 FROM risk_escalations re JOIN risk_assessments ra ON ra.workspace_id=re.workspace_id AND ra.id=re.assessment_id
          JOIN engagements e ON e.workspace_id=re.workspace_id AND e.client_id=re.client_id AND e.id=re.engagement_id
          JOIN file_versions fv ON fv.workspace_id=re.workspace_id AND fv.id=? AND fv.client_id=re.client_id
            AND (fv.engagement_id IS NULL OR fv.engagement_id=re.engagement_id) AND fv.state='COMMITTED' AND fv.immutable=1 AND fv.purpose IN ('PBC','EVIDENCE')
        WHERE re.workspace_id=? AND re.id=? AND re.version=? AND re.status='OPEN' AND ra.current_version_id=re.assessment_version_id
          AND e.version=? AND e.lifecycle_state<>'ARCHIVED_READ_ONLY') THEN 1 ELSE 0 END`)
      .bind(workspaceId, command.payload.evidenceFileId, workspaceId, escalation.id, command.payload.expectedVersion, engagement.version),
    env.DB.prepare(`UPDATE risk_escalations SET version=version+1,status='RESOLVED',resolution=?,evidence_file_id=?,resolved_by_actor_id=?,resolved_at=?,updated_at=?
      WHERE workspace_id=? AND id=? AND version=? AND status='OPEN' AND assessment_version_id=?`)
      .bind(command.payload.resolution, command.payload.evidenceFileId, context.actor.id, now, now, workspaceId, escalation.id,
        command.payload.expectedVersion, escalation.assessment_version_id)
  ];
  return { statements, result: { escalationId: escalation.id, status: 'RESOLVED', version: command.payload.expectedVersion + 1, checkCode: escalation.check_code },
    entityType: 'RISK_ESCALATION', entityId: escalation.id, beforeVersion: command.payload.expectedVersion, afterVersion: command.payload.expectedVersion + 1,
    auditDetails: { engagementId: escalation.engagement_id, assessmentVersionId: escalation.assessment_version_id, checkCode: escalation.check_code, status: 'RESOLVED', requiredEvidence: escalation.required_evidence } };
}

export async function buildBusinessRiskMutation(
  env: Env, workspaceId: string, context: RiskBusinessContext, command: BusinessRiskCommand, commandId: string, now = isoNow()
): Promise<RiskBusinessMutation> {
  if (command.type === 'riskAssessment.saveDraft') return buildSaveRiskDraft(env, workspaceId, context, command, commandId, now);
  if (command.type === 'riskAssessment.owner.save') return buildSaveOwner(env, workspaceId, context, command, now);
  if (command.type === 'riskAssessment.submit') return buildSubmitRisk(env, workspaceId, context, command, now);
  if (command.type === 'riskAssessment.escalate') return buildRiskEscalation(env, workspaceId, context, command, now);
  if (command.type === 'riskAssessment.resolveEscalation') return buildResolveRiskEscalation(env, workspaceId, context, command, now);
  if (command.type === 'risk.clear' || command.type === 'risk.reject' || command.type === 'risk.revoke') return buildRiskDecision(env, workspaceId, context, command, commandId, now);
  return buildCommercialAcceptance(env, workspaceId, context, command, commandId, now);
}

export async function getBusinessAcceptanceGate(env: Env, workspaceId: string, context: RiskBusinessContext, engagementId: string): Promise<Record<string, unknown>> {
  if (!context.allowedActions.includes('commercialAcceptance.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read acceptance status.');
  const engagement = await getEngagement(env, workspaceId, context, engagementId);
  const proposalVersionId = engagement.active_proposal_version_id;
  const proposal = proposalVersionId ? await env.DB.prepare(`SELECT pv.id,pv.revision,pv.fee_minor,pv.created_at,p.current_version_id
    FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
    WHERE pv.workspace_id=? AND pv.id=? AND pv.engagement_id=?`).bind(workspaceId, proposalVersionId, engagement.id)
    .first<{ id: string; revision: number; fee_minor: number; created_at: string; current_version_id: string }>() : null;
  const accepted = proposal ? await env.DB.prepare(`SELECT ca.id,ca.sequence,ca.decision,ca.proposal_version_id,ca.accepted_fee_minor,ca.confirmation_text,ca.contact_id,ca.actor_id,ca.accepted_at,ca.evidence_file_id,
      ct.full_name AS contact_name,ap.persona AS actor_persona,sm.display_name AS actor_name
    FROM commercial_acceptances ca JOIN contacts ct ON ct.workspace_id=ca.workspace_id AND ct.id=ca.contact_id
    JOIN actor_profiles ap ON ap.workspace_id=ca.workspace_id AND ap.id=ca.actor_id
    LEFT JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
    WHERE ca.workspace_id=? AND ca.proposal_version_id=? ORDER BY ca.sequence DESC LIMIT 1`)
    .bind(workspaceId, proposal.id).first<Record<string, unknown> & { decision: 'ACCEPT'|'REVOKE'; accepted_fee_minor: number | null; accepted_at: string; id: string }>() : null;
  const commercialActive = Boolean(proposal && proposal.current_version_id === proposal.id && accepted?.decision === 'ACCEPT' && accepted.accepted_fee_minor === proposal.fee_minor);
  const assessment = await env.DB.prepare(`SELECT ra.id,ra.version,ra.track,ra.current_version_id,rv.revision,rv.assessment_source_version,rv.ownership_hash,rv.dependency_hash,rv.submitted_at,
      rc.id AS clearance_id,rc.decision AS clearance_decision,rc.sequence AS clearance_sequence,rc.dependency_hash AS clearance_dependency_hash,rc.signed_at,rc.partner_actor_id,
      ap.persona AS partner_persona,sm.display_name AS partner_name
    FROM risk_assessments ra LEFT JOIN risk_assessment_versions rv ON rv.workspace_id=ra.workspace_id AND rv.id=ra.current_version_id
    LEFT JOIN risk_clearances rc ON rc.workspace_id=ra.workspace_id AND rc.engagement_id=ra.engagement_id
      AND rc.sequence=(SELECT MAX(last_rc.sequence) FROM risk_clearances last_rc WHERE last_rc.workspace_id=ra.workspace_id AND last_rc.engagement_id=ra.engagement_id)
    LEFT JOIN actor_profiles ap ON ap.workspace_id=rc.workspace_id AND ap.id=rc.partner_actor_id
    LEFT JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
    WHERE ra.workspace_id=? AND ra.engagement_id=?`)
    .bind(workspaceId, engagement.id).first<Record<string, unknown> & { id: string; version: number; current_version_id: string | null; revision: number | null; assessment_source_version: number | null; ownership_hash: string | null; dependency_hash: string | null; clearance_id: string | null; clearance_decision: 'CLEAR'|'REJECT'|'REVOKE'|null; clearance_dependency_hash: string | null }>();
  let riskActive = false;
  let riskStatus: string = assessment?.clearance_decision === 'REJECT' ? 'REJECTED' : assessment?.clearance_decision === 'REVOKE' ? 'REVOKED' : 'PENDING';
  if (assessment?.current_version_id && assessment.clearance_decision === 'CLEAR' && assessment.clearance_id && assessment.assessment_source_version !== null) {
    try {
      const current = await riskDependencyHash(env, workspaceId, assessment.current_version_id, assessment.assessment_source_version, engagement.client_id);
      riskActive = current.dependencyHash === assessment.clearance_dependency_hash;
      riskStatus = riskActive ? 'ACTIVE' : 'STALE';
    } catch { riskStatus = 'STALE'; }
  }
  const riskEvidenceRows = assessment?.current_version_id ? await env.DB.prepare(`SELECT DISTINCT fv.id,fv.sha256
    FROM file_versions fv WHERE fv.workspace_id=? AND fv.state='COMMITTED' AND fv.immutable=1 AND fv.id IN (
      SELECT evidence_file_id FROM risk_checks WHERE workspace_id=? AND assessment_version_id=? AND evidence_file_id IS NOT NULL
      UNION SELECT br.identity_evidence_file_id FROM beneficial_owners bo JOIN beneficial_owner_revisions br ON br.workspace_id=bo.workspace_id AND br.id=bo.current_revision_id
        WHERE bo.workspace_id=? AND bo.client_id=? AND bo.active=1 AND br.identity_evidence_file_id IS NOT NULL
      UNION SELECT evidence_file_id FROM risk_escalations WHERE workspace_id=? AND assessment_version_id=? AND status='RESOLVED' AND evidence_file_id IS NOT NULL
    ) ORDER BY fv.id`).bind(workspaceId, workspaceId, assessment.current_version_id, workspaceId, engagement.client_id, workspaceId, assessment.current_version_id)
    .all<{ id: string; sha256: string }>() : { results: [] as Array<{ id: string; sha256: string }> };
  const internal = context.actor.persona !== 'CLIENT';
  const blockers: string[] = [];
  if (!commercialActive) blockers.push(!proposal ? 'No active proposal revision is pinned to this engagement.' : accepted?.decision === 'REVOKE' ? 'The current proposal acceptance was revoked.' : 'Client acceptance of the current proposal fee is pending.');
  if (!riskActive) blockers.push(riskStatus === 'STALE' ? 'Risk facts changed after Partner clearance; a current dossier decision is required.' : 'Current Partner risk clearance is pending.');
  return {
    engagementId, lifecycleState: engagement.lifecycle_state,
    commercialKey: internal ? {
      status: commercialActive ? 'ACTIVE' : accepted?.decision === 'REVOKE' && proposal?.id === accepted?.proposal_version_id ? 'REVOKED' : 'PENDING',
      proposalVersionId: proposal?.id ?? null, proposalRevision: proposal?.revision ?? null, feeMinor: proposal ? String(proposal.fee_minor) : null,
      acceptanceId: accepted?.decision === 'ACCEPT' && accepted.proposal_version_id === proposal?.id ? accepted.id : null,
      contactName: accepted?.contact_name ?? null, actorName: accepted?.actor_name ?? null, acceptedAt: accepted?.accepted_at ?? null,
      evidenceFileId: accepted?.evidence_file_id ?? null
    } : { status: commercialActive ? 'ACTIVE' : 'PENDING',
      acceptanceId: accepted?.decision === 'ACCEPT' && accepted.actor_id === context.actor.id ? accepted.id : null,
      acceptedAt: accepted?.decision === 'ACCEPT' && accepted.actor_id === context.actor.id ? accepted.accepted_at : null,
      evidenceFileId: accepted?.decision === 'ACCEPT' && accepted.actor_id === context.actor.id ? accepted.evidence_file_id : null },
    riskKey: internal ? {
      status: riskStatus, assessmentId: assessment?.id ?? null, assessmentVersionId: assessment?.current_version_id ?? null,
      assessmentRevision: assessment?.revision ?? null, clearanceId: assessment?.clearance_id ?? null,
      decision: assessment?.clearance_decision ?? null, partnerName: assessment?.partner_name ?? null, signedAt: assessment?.signed_at ?? null,
      dependencyHash: assessment?.clearance_dependency_hash ?? null, evidence: riskEvidenceRows.results ?? []
    } : { status: riskStatus },
    ready: commercialActive && riskActive,
    blockers: internal ? blockers : [
      ...(!commercialActive ? ['Commercial acceptance of the current proposal is pending.'] : []),
      ...(!riskActive ? ['The engagement onboarding decision is pending.'] : [])
    ]
  };
}

export async function getBusinessRiskWorkspace(env: Env, workspaceId: string, context: RiskBusinessContext, engagementId: string): Promise<Record<string, unknown>> {
  if (context.actor.persona === 'CLIENT' || !context.allowedActions.includes('risk.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read the internal risk dossier.');
  const engagement = await getEngagement(env, workspaceId, context, engagementId);
  const [assessment, owners, acceptanceGate] = await Promise.all([
    env.DB.prepare(`SELECT ra.id,ra.version,ra.track,ra.current_version_id,ra.draft_version,rv.revision,rv.overall_risk,rv.questionnaire_template_version,
        rv.assessment_date,rv.management_integrity_conclusion,rv.viability_conclusion,rv.independence_conclusion,rv.submitted_at,
        rd.draft_json,rd.version AS draft_version_current
      FROM risk_assessments ra LEFT JOIN risk_assessment_versions rv ON rv.workspace_id=ra.workspace_id AND rv.id=ra.current_version_id
      LEFT JOIN risk_assessment_drafts rd ON rd.workspace_id=ra.workspace_id AND rd.assessment_id=ra.id
      WHERE ra.workspace_id=? AND ra.engagement_id=?`).bind(workspaceId, engagement.id).first<Record<string, unknown> & { id: string; current_version_id: string | null; draft_json: string | null }>(),
    currentOwners(env, workspaceId, engagement.client_id),
    getBusinessAcceptanceGate(env, workspaceId, context, engagement.id)
  ]);
  let checks: Array<Record<string, unknown>> = [];
  let escalations: Array<Record<string, unknown>> = [];
  if (assessment?.current_version_id) {
    const rows = await env.DB.prepare(`SELECT id,code,outcome,findings,source_reference,check_method,provider_name,external_reference,checked_on,evidence_file_id,resolution
      FROM risk_checks WHERE workspace_id=? AND assessment_version_id=? ORDER BY code,id`).bind(workspaceId, assessment.current_version_id).all<Record<string, unknown>>();
    checks = rows.results ?? [];
  }
  if (assessment?.id) {
    const rows = await env.DB.prepare(`SELECT re.id,re.version,re.assessment_version_id,re.check_id,re.check_code,re.reason,re.required_evidence,re.status,re.resolution,
        re.evidence_file_id,fv.sha256 AS evidence_sha256,re.created_by_actor_id,creator.display_name AS created_by_name,re.created_at,
        re.resolved_by_actor_id,resolver.display_name AS resolved_by_name,re.resolved_at
      FROM risk_escalations re LEFT JOIN file_versions fv ON fv.workspace_id=re.workspace_id AND fv.id=re.evidence_file_id
      LEFT JOIN actor_profiles creator ON creator.workspace_id=re.workspace_id AND creator.id=re.created_by_actor_id
      LEFT JOIN actor_profiles resolver ON resolver.workspace_id=re.workspace_id AND resolver.id=re.resolved_by_actor_id
      WHERE re.workspace_id=? AND re.assessment_id=? ORDER BY re.created_at DESC,re.id DESC`)
      .bind(workspaceId, assessment.id).all<Record<string, unknown>>();
    escalations = rows.results ?? [];
  }
  const draft = assessment?.draft_json ? JSON.parse(assessment.draft_json) : null;
  return {
    engagement: { id: engagement.id, clientId: engagement.client_id, clientName: engagement.legal_name, lifecycleState: engagement.lifecycle_state },
    requiredTrackACodes: trackACodes, requiredTrackBCodes: trackBCodes,
    assessment: assessment ? {
      id: assessment.id, version: assessment.version, track: assessment.track, currentVersionId: assessment.current_version_id,
      revision: assessment.revision, overallRisk: assessment.overall_risk,
      questionnaireTemplateVersion: assessment.questionnaire_template_version, assessmentDate: assessment.assessment_date,
      managementIntegrityConclusion: assessment.management_integrity_conclusion, viabilityConclusion: assessment.viability_conclusion,
      independenceConclusion: assessment.independence_conclusion, submittedAt: assessment.submitted_at,
      draftVersion: assessment.draft_version_current, draft
    } : null,
    checks,
    escalations: escalations.map(item => ({
      id: item.id, version: item.version, assessmentVersionId: item.assessment_version_id, checkId: item.check_id, checkCode: item.check_code,
      reason: item.reason, requiredEvidence: item.required_evidence, status: item.status, resolution: item.resolution,
      evidenceFileId: item.evidence_file_id, evidenceSha256: item.evidence_sha256, createdByActorId: item.created_by_actor_id,
      createdByName: item.created_by_name, createdAt: item.created_at, resolvedByActorId: item.resolved_by_actor_id,
      resolvedByName: item.resolved_by_name, resolvedAt: item.resolved_at
    })),
    beneficialOwners: owners.map(owner => ({ id: owner.id, version: owner.version, revisionId: owner.current_revision_id, fullName: owner.full_name,
      ownershipBps: owner.ownership_bps, controlBasis: owner.control_basis, identityEvidenceFileId: owner.identity_evidence_file_id,
      effectiveFrom: owner.effective_from, effectiveTo: owner.effective_to, evidenceSha256: owner.evidence_sha256 })),
    acceptanceGate
  };
}
