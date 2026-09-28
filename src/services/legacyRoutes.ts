import type { RouteKey } from '../types';
import { ROUTE_CATALOG } from './routeCatalog';

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

export function resolveRouteHash(hash: string): { route: RouteKey; redirected: boolean } | null {
  const key = hash.replace(/^#/, '').trim();
  if (!key) return null;
  const legacyTarget = LEGACY_ROUTE_REDIRECTS[key];
  if (legacyTarget) return { route: legacyTarget, redirected: legacyTarget !== key };
  if (key in ROUTE_CATALOG) return { route: key as RouteKey, redirected: false };
  return null;
}
