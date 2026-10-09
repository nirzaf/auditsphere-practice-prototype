import { useEffect, useState } from 'react';
import {
  BUSINESS_MODULES,
  ROUTE_CATALOG,
  resolveRouteHash,
  routeHash,
  type RouteKey
} from '../../services/routeCatalog';

const DEFAULT_ROUTE: RouteKey = 'overview';
type RouteEntry = [RouteKey, (typeof ROUTE_CATALOG)[RouteKey]];

function readRoute(): RouteKey {
  return resolveRouteHash(window.location.hash) ?? DEFAULT_ROUTE;
}

function routeGroups() {
  const groups = new Map<string, RouteEntry[]>();
  for (const [key, route] of Object.entries(ROUTE_CATALOG) as Array<[RouteKey, (typeof ROUTE_CATALOG)[RouteKey]]>) {
    const routes = groups.get(route.section) ?? [];
    routes.push([key, route]);
    groups.set(route.section, routes);
  }
  return [...groups.entries()];
}

const ROUTE_GROUPS = routeGroups();

export function BusinessModuleNavigation() {
  const [activeRoute, setActiveRoute] = useState(readRoute);
  const [navigationVersion, setNavigationVersion] = useState(0);
  const [targetUnavailable, setTargetUnavailable] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      setActiveRoute(readRoute());
      setNavigationVersion(version => version + 1);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const route = ROUTE_CATALOG[activeRoute];
    // Loading the default workspace should not steal focus from the browser's
    // normal page entry point. Explicit deep links and subsequent route changes
    // still move focus to their destination.
    if (activeRoute === DEFAULT_ROUTE && window.location.hash === '') return;
    setTargetUnavailable(false);
    const focusTarget = () => {
      const target = document.getElementById(route.targetId);
      if (!target) return false;
      observer.disconnect();
      window.clearTimeout(unavailableTimer);
      setTargetUnavailable(false);
      const disclosure = target.querySelector('details');
      if (disclosure) disclosure.open = true;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      const nativelyFocusable = target.matches('a[href], button, input, select, textarea, summary, iframe, object, embed, [contenteditable="true"]');
      if (!nativelyFocusable && !target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      return true;
    };
    const observer = new MutationObserver(() => { focusTarget(); });
    observer.observe(document.body, { childList: true, subtree: true });
    const unavailableTimer = window.setTimeout(() => {
      setTargetUnavailable(!document.getElementById(route.targetId));
    }, 1500);
    focusTarget();
    return () => {
      observer.disconnect();
      window.clearTimeout(unavailableTimer);
    };
  }, [activeRoute, navigationVersion]);

  const activeModule = ROUTE_CATALOG[activeRoute].moduleId;

  return <nav id="business-module-navigation" className="business-module-navigation" aria-label="Business module navigation">
    <div className="business-module-links">
      {BUSINESS_MODULES.map(module => <a
        key={module.id}
        href={routeHash(module.defaultRoute)}
        className={activeModule === module.id ? 'active' : ''}
        aria-current={activeModule === module.id ? 'page' : undefined}
      >{module.label}</a>)}
    </div>
    <label className="business-route-select" htmlFor="business-route-select">
      <span>Jump to section</span>
      <select id="business-route-select" value={activeRoute} onChange={event => {
        const nextRoute = event.currentTarget.value;
        if (Object.hasOwn(ROUTE_CATALOG, nextRoute)) window.location.hash = routeHash(nextRoute as RouteKey);
      }}>
        {ROUTE_GROUPS.map(([section, routes]) => <optgroup key={section} label={section}>
          {routes.map(([key, route]) => <option key={key} value={key}>{route.label}</option>)}
        </optgroup>)}
      </select>
    </label>
    {targetUnavailable && <p className="business-module-unavailable" role="status">
      This section is not available in the current workspace context. Select a client, engagement, and persona with access to it.
    </p>}
  </nav>;
}
