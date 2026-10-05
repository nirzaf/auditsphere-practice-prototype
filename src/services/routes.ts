// Current-only route resolution.
//
// There is exactly one route model. This module answers two questions and does
// nothing else: is this string a current route, and what route (if any) does this
// URL hash name. There is no redirect map, no canonicalisation and no bookmark
// migration, so a retired identifier resolves to "unknown" and the caller falls
// back to a safe current default for the active persona.
import type { RouteKey } from '../types';
import { ROUTE_CATALOG } from './routeCatalog';

export function isRouteKey(value: string): value is RouteKey {
  return Object.hasOwn(ROUTE_CATALOG, value);
}

/** Returns the route named by `hash`, or null when it is not a current route. */
export function resolveRouteHash(hash: string): RouteKey | null {
  const value = hash.replace(/^#/, '').trim();
  return isRouteKey(value) ? value : null;
}

/** The route hash written back for a route, so the URL always names a real route. */
export const routeHash = (route: RouteKey): string => `#${route}`;
