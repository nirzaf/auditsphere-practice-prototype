import { ROUTE_CATALOG, type RouteKey } from './routeCatalog';

export { isRouteKey, resolveRouteHash, routeHash } from './routeCatalog';

/** The nearest live panel for a route is used when its detail panel is hidden by current scope. */
export function routeTarget(route: RouteKey): string {
  return ROUTE_CATALOG[route].targetId;
}
