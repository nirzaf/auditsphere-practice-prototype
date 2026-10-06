import type { BusinessContext } from './business';
import type { Env } from './env';
import { ApiError } from './errors';
import { getBusinessAcceptanceGate } from './businessRisk';
import { getBusinessPlanningReadiness } from './businessTb';

const LIFECYCLE = [
  { id: 'LEAD_INGESTION', label: 'Lead ingestion' },
  { id: 'PROPOSAL_GENERATION', label: 'Proposal generation' },
  { id: 'DUAL_KEY_PENDING', label: 'Client acceptance and Partner clearance' },
  { id: 'ADVANCE_BILLING', label: 'Engagement letter and advance billing' },
  { id: 'PORTAL_ACTIVE_PLANNING', label: 'Client portal and audit planning' },
  { id: 'FIELDWORK_EXECUTION', label: 'Fieldwork execution' },
  { id: 'MANAGERIAL_REVIEW', label: 'Managerial review' },
  { id: 'PARTNER_APPROVAL', label: 'Partner approval' },
  { id: 'DELIVERABLE_RELEASE', label: 'Deliverable release' },
  { id: 'COMPLIANCE_COUNTDOWN', label: 'Compliance countdown' },
  { id: 'ARCHIVED_READ_ONLY', label: 'Read-only archive' }
] as const;

type LifecycleState = typeof LIFECYCLE[number]['id'];
type StageStatus = 'completed' | 'current' | 'pending' | 'blocked' | 'rework' | 'stale';

interface TransitionRow {
  from_state: string;
  to_state: string;
  transitioned_at: string;
}

interface StageBlocker {
  code: string;
  description: string;
  route?: string;
}

function lifecycleIndex(state: string): number {
  return LIFECYCLE.findIndex(stage => stage.id === state);
}

function acceptanceBlockers(value: unknown): StageBlocker[] {
  if (!value || typeof value !== 'object') return [];
  const blockers = (value as { blockers?: unknown }).blockers;
  if (!Array.isArray(blockers)) return [];
  return blockers.flatMap((blocker, index) => {
    if (typeof blocker === 'string') return [{ code: `ACCEPTANCE_GATE_${index + 1}`, description: blocker }];
    if (!blocker || typeof blocker !== 'object') return [];
    const item = blocker as Record<string, unknown>;
    if (typeof item.description !== 'string') return [];
    return [{
      code: typeof item.code === 'string' ? item.code : `ACCEPTANCE_GATE_${index + 1}`,
      description: item.description,
      ...(typeof item.route === 'string' ? { route: item.route } : {})
    }];
  });
}

function planningBlockers(value: unknown): StageBlocker[] {
  if (!value || typeof value !== 'object') return [];
  const blockers = (value as { blockers?: unknown }).blockers;
  if (!Array.isArray(blockers)) return [];
  return blockers.flatMap((blocker, index) => {
    if (!blocker || typeof blocker !== 'object') return [];
    const item = blocker as Record<string, unknown>;
    if (typeof item.description !== 'string') return [];
    return [{
      code: typeof item.code === 'string' ? item.code : `PLANNING_GATE_${index + 1}`,
      description: item.description,
      ...(typeof item.route === 'string' ? { route: item.route } : {})
    }];
  });
}

/**
 * Projects lifecycle position from the persisted engagement state and transition
 * log. Gate blockers are included only where an existing normalized read model
 * calculates that gate; other stages identify their module as the blocker source.
 */
export async function getBusinessWorkflow(
  env: Env,
  workspaceId: string,
  context: BusinessContext,
  engagementId: string
): Promise<{
  state: LifecycleState;
  sourceVersion: number;
  stages: Array<{
    id: LifecycleState;
    label: string;
    status: StageStatus;
    completedCount: number;
    requiredCount: number;
    blockers: StageBlocker[];
    blockerCoverage: 'evaluated' | 'module-detail';
  }>;
}> {
  if (!context.allowedActions.includes('engagement.read')) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read engagement workflow progress.');
  }
  const engagement = await env.DB.prepare(`SELECT id,version,client_id,lifecycle_state FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, engagementId)
    .first<{ id: string; version: number; client_id: string; lifecycle_state: string }>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement was not found in this workspace.');
  const currentIndex = lifecycleIndex(engagement.lifecycle_state);
  if (currentIndex < 0) throw new ApiError('UNAVAILABLE', 'The engagement lifecycle state is not recognized.');
  if ((context.scope.engagementId && context.scope.engagementId !== engagementId)
    || (context.scope.clientId && context.scope.clientId !== engagement.client_id)
    || (context.actor.persona === 'CLIENT' && context.actor.clientId !== engagement.client_id)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The engagement is outside the selected request scope.');
  }
  const source = await env.DB.prepare(`SELECT last_sequence FROM audit_chain_heads
    WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`).bind(workspaceId, workspaceId)
    .first<{ last_sequence: number }>();
  if (!source) throw new ApiError('UNAVAILABLE', 'Workspace workflow lineage is not initialized.');

  const transitions = await env.DB.prepare(`SELECT from_state,to_state,transitioned_at FROM state_transitions
    WHERE workspace_id=? AND engagement_id=? ORDER BY transitioned_at DESC,id DESC LIMIT 1`)
    .bind(workspaceId, engagementId).first<TransitionRow>();
  const fromIndex = transitions?.to_state === engagement.lifecycle_state ? lifecycleIndex(transitions.from_state) : -1;
  const returnedFromIndex = fromIndex > currentIndex ? fromIndex : -1;

  let blockers: StageBlocker[] = [];
  let blockerCoverage: 'evaluated' | 'module-detail' = 'module-detail';
  if (engagement.lifecycle_state === 'DUAL_KEY_PENDING' && context.allowedActions.includes('commercialAcceptance.read')) {
    blockers = acceptanceBlockers(await getBusinessAcceptanceGate(env, workspaceId, context, engagementId));
    blockerCoverage = 'evaluated';
  } else if (engagement.lifecycle_state === 'PORTAL_ACTIVE_PLANNING' && context.allowedActions.includes('planning.read')) {
    blockers = planningBlockers(await getBusinessPlanningReadiness(env, workspaceId, context, engagementId));
    blockerCoverage = 'evaluated';
  }

  const [currentEngagement, currentSource] = await Promise.all([
    env.DB.prepare(`SELECT version,lifecycle_state FROM engagements WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, engagementId).first<{ version: number; lifecycle_state: string }>(),
    env.DB.prepare(`SELECT last_sequence FROM audit_chain_heads
      WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`).bind(workspaceId, workspaceId)
      .first<{ last_sequence: number }>()
  ]);
  if (!currentEngagement || !currentSource || currentEngagement.version !== engagement.version
    || currentEngagement.lifecycle_state !== engagement.lifecycle_state || currentSource.last_sequence !== source.last_sequence) {
    throw new ApiError('VERSION_CONFLICT', 'The workspace changed while workflow progress was calculated. Refresh and retry.');
  }

  const stages = LIFECYCLE.map((stage, index) => {
    let status: StageStatus;
    if (index < currentIndex) status = 'completed';
    else if (index === currentIndex) {
      status = engagement.lifecycle_state === 'ARCHIVED_READ_ONLY' ? 'completed' : blockers.length ? 'blocked' : 'current';
    } else if (returnedFromIndex > currentIndex && index === returnedFromIndex) status = 'rework';
    else if (returnedFromIndex > currentIndex && index < returnedFromIndex) status = 'stale';
    else status = 'pending';

    const appliesToCurrentStage = index === currentIndex;
    return {
      ...stage,
      status,
      completedCount: status === 'completed' ? 1 : 0,
      requiredCount: 1,
      blockers: appliesToCurrentStage ? blockers : [],
      blockerCoverage: appliesToCurrentStage ? blockerCoverage : 'module-detail' as const
    };
  });

  return { state: engagement.lifecycle_state as LifecycleState, sourceVersion: Number(source.last_sequence), stages };
}
