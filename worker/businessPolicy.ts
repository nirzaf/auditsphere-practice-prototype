import * as z from 'zod';
import type { Env } from './env';
import { ApiError } from './errors';
import type { BusinessContext, BusinessMutation } from './business';

const id = z.uuid();
const date = z.iso.date();
const reason = z.string().trim().min(10).max(10000);
const expectedVersion = z.number().int().positive();

const policyRetire = z.strictObject({
  type: z.literal('policy.retire'),
  payload: z.discriminatedUnion('policyKind', [
    z.strictObject({ policyKind: z.literal('WORKPROGRAM_TEMPLATE'), policyId: id, expectedVersion, effectiveFrom: date, reason }),
    z.strictObject({ policyKind: z.literal('SAMPLING_POLICY'), policyId: id, expectedVersion, effectiveFrom: date, reason }),
    z.strictObject({ policyKind: z.literal('CHARGE_OUT_RATE'), policyId: id, expectedVersion, effectiveFrom: date, reason })
  ])
});

export const businessPolicyCommands = [policyRetire] as const;
export type BusinessPolicyCommand = z.infer<(typeof businessPolicyCommands)[number]>;

export function isBusinessPolicyCommand(command: { type: string }): command is BusinessPolicyCommand {
  return command.type === 'policy.retire';
}

export type PolicyKind = 'WORKPROGRAM_TEMPLATE' | 'SAMPLING_POLICY' | 'CHARGE_OUT_RATE';
export type PolicyGroup =
  | { kind: 'WORKPROGRAM_TEMPLATE'; fsliCode: string; standardsProfileId: string }
  | { kind: 'SAMPLING_POLICY'; method: string }
  | { kind: 'CHARGE_OUT_RATE'; grade: string };

type PolicyEvent = { policyId: string; action: 'ACTIVATE' | 'RETIRE'; effectiveFrom: string; reason: string };

function scopeKey(group: PolicyGroup): string {
  switch (group.kind) {
    case 'WORKPROGRAM_TEMPLATE': return `${group.fsliCode}|${group.standardsProfileId}`;
    case 'SAMPLING_POLICY': return group.method;
    case 'CHARGE_OUT_RATE': return group.grade;
  }
}

function typedTarget(kind: PolicyKind, policyId: string) {
  return {
    workprogramTemplateId: kind === 'WORKPROGRAM_TEMPLATE' ? policyId : null,
    samplingPolicyId: kind === 'SAMPLING_POLICY' ? policyId : null,
    chargeOutRateId: kind === 'CHARGE_OUT_RATE' ? policyId : null
  };
}

export function businessPolicyDate(now: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(now));
}

async function latestPolicyEventAt(env: Env, workspaceId: string, group: PolicyGroup, effectiveDate: string): Promise<PolicyEvent | null> {
  const row = await env.DB.prepare(`SELECT policy_id AS policyId,action,effective_from AS effectiveFrom,reason
    FROM policy_activation_intervals
    WHERE workspace_id=? AND policy_kind=? AND scope_key=? AND effective_from<=?
      AND (next_effective_from IS NULL OR ?<next_effective_from)
    ORDER BY effective_from DESC,approved_at DESC,event_order DESC LIMIT 1`)
    .bind(workspaceId, group.kind, scopeKey(group), effectiveDate, effectiveDate)
    .first<PolicyEvent>();
  return row ?? null;
}

async function latestEffectiveDate(env: Env, workspaceId: string, group: PolicyGroup): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT MAX(effective_from) AS latestEffectiveFrom
    FROM policy_activation_intervals WHERE workspace_id=? AND policy_kind=? AND scope_key=?`)
    .bind(workspaceId, group.kind, scopeKey(group)).first<{ latestEffectiveFrom: string | null }>();
  return row?.latestEffectiveFrom ?? null;
}

export async function isPolicyActiveAt(env: Env, workspaceId: string, group: PolicyGroup, policyId: string, effectiveDate: string): Promise<boolean> {
  const latest = await latestPolicyEventAt(env, workspaceId, group, effectiveDate);
  return latest?.action === 'ACTIVATE' && latest.policyId === policyId;
}

function insertEvent(env: Env, workspaceId: string, group: PolicyGroup, policyId: string, action: 'ACTIVATE' | 'RETIRE', effectiveFrom: string, eventReason: string, actorId: string, approvedAt: string) {
  const target = typedTarget(group.kind, policyId);
  return env.DB.prepare(`INSERT INTO policy_activations(id,workspace_id,policy_kind,workprogram_template_id,sampling_policy_id,charge_out_rate_id,
      action,effective_from,reason,approved_by_actor_id,approved_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), workspaceId, group.kind, target.workprogramTemplateId, target.samplingPolicyId, target.chargeOutRateId,
      action, effectiveFrom, eventReason.trim(), actorId, approvedAt);
}

/** Creates an activation and, if needed, a same-day retirement for the policy it supersedes. */
export async function activationStatements(env: Env, input: {
  workspaceId: string; group: PolicyGroup; policyId: string; effectiveFrom: string; reason: string; actorId: string; approvedAt: string;
}): Promise<ReturnType<typeof insertEvent>[]> {
  const { workspaceId, group, policyId, effectiveFrom, reason: eventReason, actorId, approvedAt } = input;
  if (effectiveFrom < businessPolicyDate(approvedAt)) {
    throw new ApiError('VALIDATION_FAILED', 'A policy cannot be activated retroactively. Choose today or a future effective date.');
  }
  const latestDate = await latestEffectiveDate(env, workspaceId, group);
  if (latestDate && effectiveFrom < latestDate) {
    throw new ApiError('VERSION_CONFLICT', 'A policy activation is already scheduled later than the requested effective date.');
  }
  const prior = await latestPolicyEventAt(env, workspaceId, group, effectiveFrom);
  if (prior?.action === 'ACTIVATE' && prior.policyId === policyId) {
    throw new ApiError('INVALID_STATE', 'This exact policy is already active for the requested effective date.');
  }
  const statements: ReturnType<typeof insertEvent>[] = [];
  if (prior?.action === 'ACTIVATE') {
    statements.push(insertEvent(env, workspaceId, group, prior.policyId, 'RETIRE', effectiveFrom,
      `Superseded by approved policy ${policyId} effective ${effectiveFrom}.`, actorId, approvedAt));
  }
  statements.push(insertEvent(env, workspaceId, group, policyId, 'ACTIVATE', effectiveFrom, eventReason, actorId, approvedAt));
  return statements;
}

function requirePartner(context: BusinessContext): void {
  if (context.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only a PARTNER APPROVER can retire an approved firm policy.');
  }
}

type RetirePayload = Extract<BusinessPolicyCommand, { type: 'policy.retire' }>['payload'];

async function retirePolicy(env: Env, workspaceId: string, context: BusinessContext, payload: RetirePayload, now: string): Promise<BusinessMutation> {
  requirePartner(context);
  const p = payload;
  if (p.effectiveFrom < businessPolicyDate(now)) {
    throw new ApiError('VALIDATION_FAILED', 'A policy cannot be retired retroactively. Choose today or a future effective date.');
  }

  let group: PolicyGroup;
  let table: string;
  let versionColumn: string;
  if (p.policyKind === 'WORKPROGRAM_TEMPLATE') {
    const row = await env.DB.prepare(`SELECT version,status,fsli_code AS fsliCode,standards_profile_id AS standardsProfileId
      FROM workprogram_templates WHERE workspace_id=? AND id=?`).bind(workspaceId, p.policyId)
      .first<{ version: number; status: string; fsliCode: string; standardsProfileId: string }>();
    if (!row) throw new ApiError('NOT_FOUND', 'The workprogram template was not found.');
    if (row.version !== p.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The workprogram template changed. Refresh and try again.');
    if (row.status !== 'APPROVED') throw new ApiError('INVALID_STATE', 'Only an approved workprogram template can be retired.');
    group = { kind: p.policyKind, fsliCode: row.fsliCode, standardsProfileId: row.standardsProfileId };
    table = 'workprogram_templates'; versionColumn = 'version';
  } else if (p.policyKind === 'SAMPLING_POLICY') {
    const row = await env.DB.prepare(`SELECT version,status,method FROM sampling_policies WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, p.policyId).first<{ version: number; status: string; method: string }>();
    if (!row) throw new ApiError('NOT_FOUND', 'The sampling policy was not found.');
    if (row.version !== p.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The sampling policy changed. Refresh and try again.');
    if (row.status !== 'APPROVED') throw new ApiError('INVALID_STATE', 'Only an approved sampling policy can be retired.');
    group = { kind: p.policyKind, method: row.method };
    table = 'sampling_policies'; versionColumn = 'version';
  } else {
    const row = await env.DB.prepare(`SELECT revision,grade FROM firm_charge_out_rates WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, p.policyId).first<{ revision: number; grade: string }>();
    if (!row) throw new ApiError('NOT_FOUND', 'The charge-out rate was not found.');
    if (row.revision !== p.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The charge-out rate changed. Refresh and try again.');
    group = { kind: p.policyKind, grade: row.grade };
    table = 'firm_charge_out_rates'; versionColumn = 'revision';
  }

  const active = await latestPolicyEventAt(env, workspaceId, group, p.effectiveFrom);
  if (active?.action !== 'ACTIVATE' || active.policyId !== p.policyId) {
    throw new ApiError('INVALID_STATE', 'This policy is not the active approved revision for the requested effective date.');
  }
  const assertion = env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
    SELECT ?,992,CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE workspace_id=? AND id=? AND ${versionColumn}=?) THEN 1 ELSE 0 END`)
    .bind(workspaceId, workspaceId, p.policyId, p.expectedVersion);
  const activationId = crypto.randomUUID();
  return {
    statements: [assertion, insertEvent(env, workspaceId, group, p.policyId, 'RETIRE', p.effectiveFrom, p.reason, context.actor.id, now)],
    result: { activationId, policyKind: p.policyKind, policyId: p.policyId, action: 'RETIRE', effectiveFrom: p.effectiveFrom, status: 'RECORDED' },
    entityType: 'POLICY_ACTIVATION', entityId: activationId, beforeVersion: null, afterVersion: 1,
    auditDetails: { policyKind: p.policyKind, policyId: p.policyId, action: 'RETIRE', effectiveFrom: p.effectiveFrom, reason: p.reason }
  };
}

export async function buildBusinessPolicyMutation(env: Env, workspaceId: string, context: BusinessContext, command: BusinessPolicyCommand, _commandId: string, now: string): Promise<BusinessMutation> {
  switch (command.type) {
    case 'policy.retire': return retirePolicy(env, workspaceId, context, command.payload, now);
  }
}
