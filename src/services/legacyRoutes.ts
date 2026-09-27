import type { RouteKey } from '../types';

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

const ACTIVE_ROUTES = new Set<RouteKey>([
  'overview', 'clients', 'client-detail', 'acquisition', 'proposals', 'engagements',
  'jobs', 'job-templates', 'documents', 'communications', 'my-time', 'budgets',
  'billing', 'receivables', 'accounting-setup', 'trial-balance', 'gl-transactions',
  'account-mappings', 'adjustments', 'reconciliations', 'financial-statements',
  'financial-packages', 'consolidation', 'onboarding', 'audit-planning', 'audit-risks',
  'audit-fieldwork', 'sampling', 'audit', 'evidence', 'findings', 'reviews', 'approvals',
  'quality', 'delivery', 'records', 'reports', 'administration', 'm365-setup',
  'portal', 'services', 'role-guide', 'module-guide', 'requirements',
]);

export function resolveRouteHash(hash: string): { route: RouteKey; redirected: boolean } | null {
  const key = hash.replace(/^#/, '').trim();
  if (!key) return null;
  const legacyTarget = LEGACY_ROUTE_REDIRECTS[key];
  if (legacyTarget) return { route: legacyTarget, redirected: legacyTarget !== key };
  if (ACTIVE_ROUTES.has(key as RouteKey)) return { route: key as RouteKey, redirected: false };
  return null;
}
