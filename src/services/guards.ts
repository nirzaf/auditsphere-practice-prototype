// AuditSphere shared command guards — VP-002/VP-003/VP-019/VP-056
// Single place for demo person, active status, role grant, scope, revision and
// separation-of-duties checks. UI actions AND programmatic command calls must use
// these so tests exercise the same rules as the browser.
// Browser-local only: these illustrate intended production behaviour; browser data
// remains inspectable by the browser owner.

import type { PrototypeState, RoleKey, RouteKey } from '../types';

export interface CommandContext {
  person: string;
  role: RoleKey;
  expectedRevision?: number;
  actualRevision?: number;
}

export class GuardError extends Error {
  code: 'FORBIDDEN_SCOPE' | 'SELF_APPROVAL' | 'STALE_REVISION' | 'DISABLED_IDENTITY' | 'INVALID_STATE';
  constructor(code: GuardError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/** Roles that carry professional assurance or client management-approval duties. */
export function roleRequiresApprovalEvidence(role: RoleKey): boolean {
  return ['partner', 'manager', 'preparer', 'reviewer', 'eqr', 'client'].includes(role);
}

/** Prototype-only full-access identity; it does not represent production authentication. */
export function isSuperuserRole(role: RoleKey): boolean {
  return role === 'superuser';
}

/** Shared capability predicate used by UI affordances and centralized store authorization. */
export function hasAnyRole(state: PrototypeState, roles: readonly RoleKey[]): boolean {
  return isSuperuserRole(state.currentRole) || roles.includes(state.currentRole);
}

export function hasRole(state: PrototypeState, role: RoleKey): boolean {
  return isSuperuserRole(state.currentRole) || state.currentRole === role;
}

/** Record each prototype-only authorization/actor override; never changes validation rules. */
export function recordPrototypeSuperuserOverride(state: PrototypeState, action: string): boolean {
  if (!isSuperuserRole(state.currentRole) || !activePersona(state).active) return false;
  state.events.unshift({ text: `Prototype Superuser Override: ${state.currentPerson} accessed ${action}; this is a test-only override, not an independent approval.`, ref: 'SUPERUSER-OVERRIDE', time: new Date().toISOString(), type: 'shield' });
  if (state.events.length > 50) state.events.pop();
  return true;
}

const staleStates = new WeakSet<object>();

export function markStateStale(state: PrototypeState, stale: boolean): void {
  if (stale) staleStates.add(state);
  else staleStates.delete(state);
}

export function activePersona(state: PrototypeState) {
  const user = state.users.find(u => u.id === state.currentUserId);
  return user
    ? { id: user.id, personId: user.personId || user.id, name: user.name, role: user.role, active: user.status === 'Active' && state.currentPerson === user.name && state.currentRole === user.role }
    : { id: '', personId: '', name: state.currentPerson, role: state.currentRole, active: false };
}

export function requireActiveIdentity(state: PrototypeState): void {
  if (staleStates.has(state)) {
    throw new GuardError('STALE_REVISION', 'Another browser tab saved newer state. Reload it or explicitly replace it before continuing.');
  }
  const persona = activePersona(state);
  if (!persona.id || state.currentPerson !== persona.name || state.currentRole !== persona.role) {
    throw new GuardError('DISABLED_IDENTITY', `Identity "${state.currentPerson}" is not recognized.`);
  }
  if (!persona.active) {
    throw new GuardError('DISABLED_IDENTITY', `Identity "${persona.name}" is disabled and cannot perform business commands.`);
  }
}

/** Narrow grants: Global sees all; Client sees one client; Engagement sees one engagement.
 * Grants bind to immutable persona IDs. Revoking grants results in zero access,
 * never fallback to another person's grants. */
export function visibleClientIds(state: PrototypeState, userId = state.currentUserId): string[] | 'ALL' {
  const user = state.users.find(u => u.id === userId && u.status === 'Active');
  if (!user || (userId === state.currentUserId && !activePersona(state).active)) return [];
  if (isSuperuserRole(user.role)) return 'ALL';
  const today = state.asOfDate || new Date().toISOString().slice(0, 10);
  const grants = state.roleGrants.filter(g => g.userId === userId && g.role === user.role && (!g.effectiveFrom || g.effectiveFrom <= today) && (!g.expiresAt || g.expiresAt >= today));
  if (grants.length === 0) return [];
  if (grants.some(g => g.scopeKind === 'Global')) return 'ALL';
  const clients = new Set<string>();
  for (const g of grants) {
    if (g.scopeKind === 'Client' && g.scopeId) clients.add(g.scopeId);
    if (g.scopeKind === 'Engagement' && g.scopeId) {
      const eng = state.engagements.find(e => e.id === g.scopeId);
      if (eng) clients.add(eng.client);
    }
  }
  return [...clients];
}

export function visibleEngagementIds(state: PrototypeState, userId = state.currentUserId): string[] | 'ALL' {
  const user = state.users.find(u => u.id === userId && u.status === 'Active');
  if (!user || (userId === state.currentUserId && !activePersona(state).active)) return [];
  if (isSuperuserRole(user.role)) return 'ALL';
  const today = state.asOfDate || new Date().toISOString().slice(0, 10);
  const grants = state.roleGrants.filter(g => g.userId === userId && g.role === user.role && (!g.effectiveFrom || g.effectiveFrom <= today) && (!g.expiresAt || g.expiresAt >= today));
  if (grants.length === 0) return [];
  if (grants.some(g => g.scopeKind === 'Global')) return 'ALL';
  const engs = new Set<string>();
  for (const g of grants) {
    if (g.scopeKind === 'Engagement' && g.scopeId) engs.add(g.scopeId);
    if (g.scopeKind === 'Client' && g.scopeId) {
      state.engagements.filter(e => e.client === g.scopeId).forEach(e => engs.add(e.id));
    }
  }
  return [...engs];
}

/** A restored selection is valid only if it belongs to the active persona's engagement scope. */
export function hasSelectedEngagementScope(state: PrototypeState): boolean {
  const visible = visibleEngagementIds(state);
  return visible === 'ALL' || Boolean(state.selectedEngagement && visible.includes(state.selectedEngagement));
}

/** Group grants expose only the named group reporting workspace, not its client or engagement routes. */
export function hasConsolidationGroupScope(state: PrototypeState, groupId: string, userId = state.currentUserId): boolean {
  const user = state.users.find(item => item.id === userId && item.status === 'Active');
  if (!user || (userId === state.currentUserId && !activePersona(state).active)) return false;
  if (isSuperuserRole(user.role)) return state.consolidationGroups.some(item => item.id === groupId);
  const today = state.asOfDate || new Date().toISOString().slice(0, 10);
  const grants = state.roleGrants.filter(grant => grant.userId === userId && grant.role === user.role && (!grant.effectiveFrom || grant.effectiveFrom <= today) && (!grant.expiresAt || grant.expiresAt >= today));
  if (grants.some(grant => grant.scopeKind === 'Global')) return true;
  if (grants.some(grant => grant.scopeKind === 'Group' && grant.scopeId === groupId)) return true;
  const group = state.consolidationGroups.find(item => item.id === groupId);
  if (!group) return false;
  const visible = visibleEngagementIds(state, userId);
  return group.components.length > 0 && (visible === 'ALL' || group.components.every(component => visible.includes(component.componentId)));
}

export function requireConsolidationGroupScope(state: PrototypeState, groupId: string): void {
  if (!hasConsolidationGroupScope(state, groupId)) throw new GuardError('FORBIDDEN_SCOPE', `Consolidation group "${groupId}" is outside the current scoped grant.`);
}

/**
 * Lifecycle-only check for professional writes that are not scoped through
 * requireEngagementScope (accounting setup, group work on component engagements).
 * Suspended, Closed and Cancelled engagements accept no new professional work.
 */
export function requireActiveEngagementLifecycle(state: PrototypeState, engagementId: string): void {
  const status = state.engagements.find(item => item.id === engagementId)?.lifecycleStatus || 'Active';
  if (status !== 'Active') throw new GuardError('INVALID_STATE', `Engagement ${engagementId} is ${status.toLowerCase()}; professional work is blocked.`);
}

/** Group professional writes require every component engagement to be Active. */
export function requireActiveConsolidationComponents(state: PrototypeState, groupId: string): void {
  const group = state.consolidationGroups.find(item => item.id === groupId);
  for (const component of group?.components || []) requireActiveEngagementLifecycle(state, component.componentId);
}

export function eligibleReviewAssignees(state: PrototypeState, engagementId: string) {
  return state.users.filter(user => {
    const visible = visibleEngagementIds(state, user.id);
    return user.status === 'Active' && ['manager', 'preparer'].includes(user.role)
      && (visible === 'ALL' || visible.includes(engagementId));
  });
}

/** Active professional staff who can open the risk register for this engagement. */
export function eligibleAuditRiskOwners(state: PrototypeState, engagementId: string) {
  return state.users.filter(user => {
    const visible = visibleEngagementIds(state, user.id);
    return user.status === 'Active' && user.group === 'Professional'
      && canOpenRoute(user.role, 'audit-risks')
      && (visible === 'ALL' || visible.includes(engagementId));
  });
}

export function requireClientScope(state: PrototypeState, clientId: string): void {
  const visible = visibleClientIds(state);
  if (visible !== 'ALL' && !visible.includes(clientId)) {
    throw new GuardError('FORBIDDEN_SCOPE', `Client "${clientId}" is outside the current scoped grant.`);
  }
}

export function requireEngagementScope(state: PrototypeState, engagementId: string, action: 'professional' | 'activation' | 'billing' | 'records' | 'administrative' = 'professional'): void {
  const visible = visibleEngagementIds(state);
  if (visible !== 'ALL' && !visible.includes(engagementId)) {
    throw new GuardError('FORBIDDEN_SCOPE', `Engagement "${engagementId}" is outside the current scoped grant.`);
  }
  if (action !== 'administrative' && action !== 'billing' && action !== 'records') {
    const engagement = state.engagements.find(item => item.id === engagementId);
    const status = engagement?.lifecycleStatus || 'Active';
    if (status !== 'Active') throw new GuardError('INVALID_STATE', `Engagement ${engagementId} is ${status.toLowerCase()}; professional work is blocked.`);
    if (action === 'professional' && ['Draft', 'Acceptance'].includes(engagement?.stage || '') && engagement?.proposalId && !engagement.professionalAcceptance) throw new GuardError('INVALID_STATE', `Engagement ${engagementId} is pending professional acceptance; work is blocked.`);
  }
}

/** Same natural person cannot approve their own preparation by switching role labels. */
export function requireIndependentActor(preparer: string, actor: string, action: string, state?: PrototypeState): void {
  if (state && recordPrototypeSuperuserOverride(state, action)) return;
  const naturalId = (identity: string) => {
    const user = state?.users.find(u => u.id === identity || u.name === identity);
    return user?.personId || user?.id || identity;
  };
  if (naturalId(preparer) === naturalId(actor)) {
    throw new GuardError('SELF_APPROVAL', `Separation of duties: ${actor} cannot ${action}; the same person cannot review their own work, even under a different role label.`);
  }
}

export function requireRevision(expected: number | undefined, actual: number, subject: string): void {
  if (expected !== undefined && expected !== actual) {
    throw new GuardError('STALE_REVISION', `Stale ${subject}: expected revision ${expected} but found ${actual}. Reload and retry.`);
  }
}

/** Client views must never receive staff economics, internal notes or presenter exports. */
export const CLIENT_ROLES: RoleKey[] = ['client_admin', 'client_finance', 'client'];
export function isClientRole(role: RoleKey): boolean {
  return (CLIENT_ROLES as string[]).includes(role);
}

const PROFESSIONAL_ROUTES: RouteKey[] = [
  'overview', 'clients', 'client-detail', 'proposals', 'engagements', 'jobs', 'job-templates',
  'documents', 'communications', 'my-time', 'budgets', 'billing', 'receivables',
  'accounting-setup', 'trial-balance', 'gl-transactions', 'account-mappings', 'adjustments',
  'reconciliations', 'financial-statements', 'financial-packages', 'consolidation', 'onboarding',
  'audit-planning', 'audit-risks', 'audit-fieldwork', 'sampling', 'audit', 'evidence', 'findings',
  'reviews', 'approvals', 'quality', 'delivery', 'records', 'reports', 'portal', 'm365-setup', 'requirements'
];

/** Shared UI route policy; App checks it again so direct navigation cannot bypass the sidebar. */
export function canOpenRoute(role: RoleKey, route: RouteKey, active = true): boolean {
  if (!active) return route === 'requirements';
  if (isSuperuserRole(role)) return true;
  if (route === 'requirements') return true;
  // The module guide is read-only client-demo guidance available to every active persona.
  if (route === 'module-guide') return true;
  if (isClientRole(role)) return route === 'portal';
  if (role === 'partner') return PROFESSIONAL_ROUTES.includes(route);
  if (role === 'manager') return PROFESSIONAL_ROUTES.includes(route) && route !== 'administration';
  if (role === 'reviewer') return ['overview', 'engagements', 'jobs', 'documents', 'communications', 'my-time', 'budgets', 'accounting-setup', 'trial-balance', 'gl-transactions', 'account-mappings', 'adjustments', 'reconciliations', 'financial-statements', 'financial-packages', 'audit-planning', 'audit-risks', 'audit-fieldwork', 'sampling', 'audit', 'evidence', 'findings', 'reviews', 'approvals', 'quality', 'requirements'].includes(route);
  if (role === 'preparer') return ['overview', 'engagements', 'jobs', 'documents', 'communications', 'my-time', 'budgets', 'accounting-setup', 'trial-balance', 'gl-transactions', 'account-mappings', 'adjustments', 'reconciliations', 'financial-statements', 'financial-packages', 'audit-planning', 'audit-risks', 'audit-fieldwork', 'sampling', 'audit', 'evidence', 'findings', 'reviews', 'requirements'].includes(route);
  if (role === 'eqr') return ['overview', 'engagements', 'documents', 'accounting-setup', 'trial-balance', 'financial-statements', 'financial-packages', 'audit-planning', 'audit-risks', 'audit', 'evidence', 'findings', 'reviews', 'approvals', 'quality', 'delivery', 'records', 'requirements'].includes(route);
  if (role === 'relationship') return ['overview', 'clients', 'client-detail', 'acquisition', 'proposals', 'engagements', 'communications', 'requirements'].includes(route);
  if (role === 'onboarding') return ['overview', 'clients', 'client-detail', 'engagements', 'documents', 'communications', 'onboarding', 'portal', 'requirements'].includes(route);
  if (role === 'compliance') return ['overview', 'clients', 'client-detail', 'engagements', 'documents', 'onboarding', 'approvals', 'requirements'].includes(route);
  if (role === 'billing') return ['overview', 'clients', 'my-time', 'budgets', 'billing', 'receivables', 'reports', 'requirements'].includes(route);
  if (role === 'records') return ['overview', 'clients', 'documents', 'records', 'reports', 'requirements'].includes(route);
  if (role === 'admin') return ['overview', 'administration', 'm365-setup', 'requirements'].includes(route);
  return false;
}

/**
 * Search must apply the same role and record-scope rules before projecting any
 * metadata. Client visibility can be inherited from one engagement grant, so a
 * client grant alone is never enough for an engagement-owned record.
 */
export function canReadSearchRecord(
  state: PrototypeState,
  record: { route: RouteKey; clientId?: string; engagementId?: string; requiresEngagement?: boolean; clientWide?: boolean }
): boolean {
  const persona = activePersona(state);
  if (!persona.active || !canOpenRoute(state.currentRole, record.route, persona.active)) return false;

  const clients = visibleClientIds(state);
  const engagements = visibleEngagementIds(state);
  if (record.clientId && clients !== 'ALL' && !clients.includes(record.clientId)) return false;

  if (record.engagementId) {
    const engagement = state.engagements.find(item => item.id === record.engagementId);
    if (!engagement || (record.clientId && engagement.client !== record.clientId)) return false;
    if (engagements !== 'ALL' && !engagements.includes(record.engagementId)) return false;
  } else if (record.requiresEngagement) {
    return false;
  } else if (record.clientWide && !record.clientId) {
    // A client-wide record must name the client whose grant authorizes it.
    return false;
  }

  return true;
}
