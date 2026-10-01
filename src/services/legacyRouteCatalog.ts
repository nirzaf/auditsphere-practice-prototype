// Bookmark and historical progress compatibility only; current UI uses routeCatalog.ts.
import type { CurrentRouteKey, LegacyRouteId, RouteKey } from '../types';
import { CURRENT_ROUTE_CATALOG, type RouteInfo } from './routeCatalog';

// Retired historical routes kept only so old bookmarks and persisted hashes redirect to the
// current surface (services/legacyRoutes.ts). The intersection Record keeps the current/legacy
// partition exhaustive at compile time: CurrentRouteKey ∪ LegacyRouteId === RouteKey.
export const LEGACY_ROUTE_INFO: Record<LegacyRouteId, RouteInfo> & Record<Exclude<RouteKey, CurrentRouteKey>, RouteInfo> = {
  'jobs': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'job-templates': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'communications': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'budgets': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'receivables': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'accounting-setup': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'gl-transactions': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'account-mappings': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'adjustments': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'reconciliations': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'financial-packages': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'consolidation': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'audit': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'approvals': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'quality': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'administration': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'm365-setup': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'services': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' }
};

/**
 * Derived runtime catalogue covering every bookmarkable RouteKey. Current routes keep their
 * product metadata; retired entries are redirect placeholders. Current-facing code should
 * prefer CURRENT_ROUTE_CATALOG.
 */
export const ROUTE_CATALOG: Record<RouteKey, RouteInfo> = { ...CURRENT_ROUTE_CATALOG, ...LEGACY_ROUTE_INFO };

