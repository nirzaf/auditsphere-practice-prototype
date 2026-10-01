import type { CurrentRouteKey, LegacyRouteId, RouteKey } from '../types';
import { ROUTE_CATALOG } from './legacyRouteCatalog';

/**
 * Route IDs used by the former role-portal entrypoint. Keep explicit redirects
 * for renamed views so old bookmarks land in the current React application.
 */
export const LEGACY_ROUTE_REDIRECTS: Readonly<Record<string, RouteKey>> = {
  overview: 'overview',
  'client-summary': 'clients',
  intake: 'onboarding',
  invitations: 'administration',
  compliance: 'onboarding',
  acceptance: 'onboarding',
  clients: 'clients',
  acquisition: 'acquisition',
  engagements: 'engagements',
  team: 'administration',
  onboarding: 'onboarding',
  documents: 'documents',
  accounting: 'accounting-setup',
  audit: 'audit',
  reviews: 'reviews',
  quality: 'quality',
  delivery: 'delivery',
  portal: 'portal',
  'client-team': 'portal',
  'client-requests': 'documents',
  'client-approvals': 'portal',
  'client-deliverables': 'portal',
  billing: 'billing',
  continuance: 'engagements',
  renewal: 'engagements',
  'commercial-review': 'proposals',
  'commercial-requests': 'proposals',
  crm: 'acquisition',
  'audit-acceptance': 'onboarding',
  'time-tracking': 'my-time',
  packages: 'financial-packages',
  'client-portal': 'portal',
  'reporting-centre': 'reports',
  records: 'records',
  handover: 'records',
  administration: 'administration',
  'access-requests': 'administration',
  operations: 'm365-setup',
  'my-time': 'my-time',
  services: 'administration',
  privileges: 'administration',
  'role-guide': 'requirements',
  requirements: 'requirements',
  // Global Search is a modal utility rather than a standalone workspace route.
  search: 'overview',
};


/** Retired historical route ids redirect into the current surface; legacy resolution happens
 * before route authorization, so current authorization never sees a retired route id. */
export const RETIRED_ROUTE_REDIRECTS: Record<LegacyRouteId, CurrentRouteKey> = {
  jobs:'scheduling', 'job-templates':'audit-risks', communications:'documents', budgets:'scheduling', receivables:'billing', 'accounting-setup':'trial-balance', 'gl-transactions':'trial-balance', 'account-mappings':'trial-balance', adjustments:'findings', reconciliations:'trial-balance', 'financial-packages':'delivery', consolidation:'overview', quality:'reviews', audit:'reviews', approvals:'reviews', services:'proposals', administration:'overview', 'm365-setup':'documents'
};
export function canonicalRoute(route:RouteKey):CurrentRouteKey { return RETIRED_ROUTE_REDIRECTS[route as LegacyRouteId] || route as CurrentRouteKey; }

export function resolveRouteHash(hash: string): { route: CurrentRouteKey; redirected: boolean } | null {
  const key = hash.replace(/^#/, '').trim();
  if (!key) return null;
  const legacyTarget = LEGACY_ROUTE_REDIRECTS[key];
  if (legacyTarget) return { route: canonicalRoute(legacyTarget), redirected: canonicalRoute(legacyTarget) !== key };
  if (key in ROUTE_CATALOG) return { route: canonicalRoute(key as RouteKey), redirected: canonicalRoute(key as RouteKey) !== key };
  return null;
}
