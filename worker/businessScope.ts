import type { Env } from './env';
import { ApiError } from './errors';

export interface BusinessScopeContext {
  actor: {
    id: string;
    persona: string;
    staffGrade: string | null;
    clientId: string | null;
    staffMemberId: string | null;
  };
  scope: { clientId: string | null; engagementId: string | null };
  allowedActions: string[];
}

const COMMERCIAL_ENGAGEMENT_STATES = ['LEAD_INGESTION', 'PROPOSAL_GENERATION', 'DUAL_KEY_PENDING', 'ADVANCE_BILLING'] as const;

function hasCommercialEngagementAccess(context: BusinessScopeContext): boolean {
  return context.allowedActions.some(action => action.startsWith('proposal.') || action.startsWith('lead.') || action === 'billing.read');
}

function isPartnerApprover(context: BusinessScopeContext): boolean {
  return context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER';
}

function isAssignmentScopedStaff(context: BusinessScopeContext): boolean {
  return context.actor.persona === 'PREPARER' || context.actor.persona === 'REVIEWER';
}

/** Enforces D3 for an engagement while leaving client projections and Partner access unchanged. */
export async function assertBusinessEngagementAccess(
  env: Env,
  workspaceId: string,
  context: BusinessScopeContext,
  engagementId: string
): Promise<void> {
  if (context.actor.persona === 'CLIENT') return;
  const engagement = await env.DB.prepare(`SELECT id,client_id,lifecycle_state FROM engagements
    WHERE workspace_id=? AND id=?`).bind(workspaceId, engagementId)
    .first<{ id: string; client_id: string; lifecycle_state: string }>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement was not found.');
  if ((context.scope.clientId && context.scope.clientId !== engagement.client_id)
    || (context.scope.engagementId && context.scope.engagementId !== engagement.id)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The engagement is outside the selected request context.');
  }
  if (isPartnerApprover(context)) return;
  if (!isAssignmentScopedStaff(context)) throw new ApiError('FORBIDDEN_SCOPE', 'This profile has no engagement scope for this record.');

  if (COMMERCIAL_ENGAGEMENT_STATES.includes(engagement.lifecycle_state as typeof COMMERCIAL_ENGAGEMENT_STATES[number])
    && hasCommercialEngagementAccess(context)) return;
  if (!context.actor.staffMemberId) throw new ApiError('FORBIDDEN_SCOPE', 'This staff profile has no engagement assignment.');
  const assigned = await env.DB.prepare(`SELECT 1 AS found FROM engagement_assignments
    WHERE workspace_id=? AND engagement_id=? AND staff_member_id=? LIMIT 1`)
    .bind(workspaceId, engagement.id, context.actor.staffMemberId).first<{ found: number }>();
  if (!assigned) throw new ApiError('FORBIDDEN_SCOPE', 'This engagement is outside the staff member’s assigned scope.');
}

/** Client directory access follows the same assigned-client and commercial rules as its list. */
export async function assertBusinessClientAccess(
  env: Env,
  workspaceId: string,
  context: BusinessScopeContext,
  clientId: string
): Promise<void> {
  if (context.actor.persona === 'CLIENT') return;
  if (context.scope.clientId && context.scope.clientId !== clientId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The client is outside the selected request context.');
  }
  if (context.scope.engagementId) {
    const selected = await env.DB.prepare(`SELECT client_id FROM engagements WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, context.scope.engagementId).first<{ client_id: string }>();
    if (!selected || selected.client_id !== clientId) {
      throw new ApiError('FORBIDDEN_SCOPE', 'The client does not match the selected engagement.');
    }
  }
  if (isPartnerApprover(context)) return;
  if (!isAssignmentScopedStaff(context)) throw new ApiError('FORBIDDEN_SCOPE', 'This profile has no client scope for this record.');
  if (!context.actor.staffMemberId) throw new ApiError('FORBIDDEN_SCOPE', 'This staff profile has no client assignment.');
  const commerciallyVisible = hasCommercialEngagementAccess(context) ? 1 : 0;
  const allowed = await env.DB.prepare(`SELECT 1 AS found FROM clients c
    WHERE c.workspace_id=? AND c.id=? AND c.active=1 AND (
      c.created_by_actor_id=? OR EXISTS(SELECT 1 FROM engagements e WHERE e.workspace_id=c.workspace_id AND e.client_id=c.id AND (
        EXISTS(SELECT 1 FROM engagement_assignments a WHERE a.workspace_id=e.workspace_id
          AND a.engagement_id=e.id AND a.staff_member_id=?)
        OR (?=1 AND e.lifecycle_state IN ('LEAD_INGESTION','PROPOSAL_GENERATION','DUAL_KEY_PENDING','ADVANCE_BILLING'))
      ))
    ) LIMIT 1`).bind(workspaceId, clientId, context.actor.id, context.actor.staffMemberId, commerciallyVisible)
    .first<{ found: number }>();
  if (!allowed) throw new ApiError('FORBIDDEN_SCOPE', 'This client has no engagement in the staff member’s assigned scope.');
}
