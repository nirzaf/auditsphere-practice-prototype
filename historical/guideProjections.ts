import type { RouteKey } from '../src/types';
import { MODULE_GUIDES, TARGET_GUIDES } from './moduleGuideContent';
import { LIFECYCLES } from '../src/services/lifecycles';
const ROUTE_ALIASES: Partial<Record<RouteKey, RouteKey>> = {
  'trial-balance': 'accounting-setup', 'gl-transactions': 'accounting-setup', 'account-mappings': 'accounting-setup',
  'adjustments': 'accounting-setup', 'reconciliations': 'accounting-setup', 'quality': 'approvals', 'services': 'administration',
  'audit-fieldwork': 'audit-risks', 'client-detail': 'clients'
};
const LIFECYCLE_ROUTE_GROUP: Partial<Record<RouteKey, RouteKey[]>> = {
  'accounting-setup': ['accounting-setup', 'trial-balance', 'gl-transactions', 'account-mappings', 'adjustments', 'reconciliations'],
  'clients': ['clients', 'client-detail', 'documents'], 'approvals': ['approvals', 'quality'], 'audit-risks': ['audit-risks', 'audit-fieldwork'], 'audit-fieldwork': ['audit-risks', 'audit-fieldwork'],
  'billing': ['billing'], 'delivery': ['delivery', 'records']
};

const plain = (text: string) => text.replace(/`/g, '');
const routeTokens = (route: string) => plain(route).split(/[^a-z0-9-]+/i).filter(Boolean);

export function guidesForRoute(route: RouteKey) {
  const key = ROUTE_ALIASES[route] || route;
  // Exact-route guides first (e.g. `approvals`), then guides that merely pass through the route.
  const exact = (guide: typeof MODULE_GUIDES[number]) => plain(guide.route).trim() === key ? 0 : routeTokens(guide.route)[0] === key ? 1 : 2;
  return [...MODULE_GUIDES,...TARGET_GUIDES].filter(guide => routeTokens(guide.route).includes(key)).sort((a, b) => exact(a) - exact(b));
}

export function lifecyclesForRoute(route: RouteKey) {
  const key = ROUTE_ALIASES[route] || route;
  const group = LIFECYCLE_ROUTE_GROUP[key] || [key];
  return LIFECYCLES.filter(def => group.includes(def.route) || def.route === route);
}
