// Minimal typed router.
//
// Deliberately hand-written: the task allows a helper (e.g. Hono) only where it
// meaningfully reduces complexity. The surface here is small and the explicit
// table keeps every route visible in one place, with no new runtime dependency.

import type { Env } from './env';

export type RouteParams = Record<string, string>;

export interface RouteContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
  params: RouteParams;
  requestId: string;
  /** Origin of this deployment, used for same-origin checks. */
  origin: string;
}

export type Handler = (context: RouteContext) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: string;
  segments: string[];
  handler: Handler;
}

export interface Router {
  get(pattern: string, handler: Handler): Router;
  post(pattern: string, handler: Handler): Router;
  put(pattern: string, handler: Handler): Router;
  delete(pattern: string, handler: Handler): Router;
  match(method: string, pathname: string): { handler: Handler; params: RouteParams; routePattern: string } | undefined;
  /** True when the path exists but not for this method (used for 405 vs 404). */
  pathExists(pathname: string): boolean;
}

/**
 * Returns the PARAM NAME for a `:name` segment (so `params.name = value`), an
 * empty string for a matched literal, or undefined when the segment differs.
 */
const segmentMatch = (pattern: string, actual: string): string | undefined =>
  pattern.startsWith(':') ? pattern.slice(1) : pattern === actual ? '' : undefined;

export function createRouter(): Router {
  const routes: Route[] = [];
  const add = (method: string) => (pattern: string, handler: Handler): Router => {
    routes.push({ method, pattern, segments: pattern.split('/').filter(Boolean), handler });
    return router;
  };
  const router: Router = {
    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    delete: add('DELETE'),
    match(method, pathname) {
      const actual = pathname.split('/').filter(Boolean);
      for (const route of routes) {
        if (route.method !== method || route.segments.length !== actual.length) continue;
        const params: RouteParams = {};
        let matched = true;
        for (let i = 0; i < route.segments.length; i += 1) {
          const name = segmentMatch(route.segments[i], actual[i]);
          if (name === undefined) { matched = false; break; }
          if (name) params[name] = decodeURIComponent(actual[i]);
        }
        if (matched) return { handler: route.handler, params, routePattern: route.pattern };
      }
      return undefined;
    },
    pathExists(pathname) {
      const actual = pathname.split('/').filter(Boolean);
      return routes.some(route => route.segments.length === actual.length
        && route.segments.every((segment, index) => segmentMatch(segment, actual[index]) !== undefined));
    }
  };
  return router;
}
