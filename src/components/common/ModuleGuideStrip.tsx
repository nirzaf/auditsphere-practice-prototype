// "How this module works" — a collapsed lifecycle guide shown above every routed module.
// Content comes from the existing module rehearsal guides (moduleGuideContent.ts) and the
// lifecycle definitions (lifecycles.ts); nothing here is a second requirements source.
// Deliberately no headings, tables or .panel: it must not change the page's own structure.
import React from 'react';
import type { RouteKey } from '../../types';
import { MODULE_GUIDES, TARGET_GUIDES } from '../../services/moduleGuideContent';
import { LIFECYCLES } from '../../services/lifecycles';

const ROUTE_ALIASES: Partial<Record<RouteKey, RouteKey>> = {
  'trial-balance': 'accounting-setup', 'gl-transactions': 'accounting-setup', 'account-mappings': 'accounting-setup',
  'adjustments': 'accounting-setup', 'reconciliations': 'accounting-setup', 'quality': 'approvals', 'services': 'administration',
  'audit-fieldwork': 'audit-risks', 'client-detail': 'clients'
};
const LIFECYCLE_ROUTE_GROUP: Partial<Record<RouteKey, RouteKey[]>> = {
  'accounting-setup': ['accounting-setup', 'trial-balance', 'gl-transactions', 'account-mappings', 'adjustments', 'reconciliations'],
  'clients': ['clients', 'client-detail', 'documents'], 'approvals': ['approvals', 'quality'], 'audit-risks': ['audit-risks', 'audit-fieldwork'],
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

export const ModuleGuideStrip: React.FC<{ route: RouteKey }> = ({ route }) => {
  const guides = guidesForRoute(route);
  const lifecycles = lifecyclesForRoute(route);
  if (!guides.length && !lifecycles.length) return null;
  const primary = guides[0];
  return (
    <details className="module-guide" data-testid="module-guide-strip">
      <summary>
        <span className="module-guide-label">How this module works</span>
        {primary && <span className="caption">{primary.id} · {primary.name} · {primary.steps.length} steps</span>}
        {lifecycles.length > 0 && <span className="caption">{lifecycles.length} record {lifecycles.length === 1 ? 'lifecycle' : 'lifecycles'}</span>}
      </summary>
      <div className="module-guide-body">
        {guides.map(guide => (
          <div key={guide.id} className="module-guide-section">
            <b>{guide.id} · {guide.name}</b>
            <ol>{guide.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
            <p className="small"><b>Expected outcome:</b> {guide.outcome}</p>
            <p className="small"><b>Failure / denial path to try:</b> {guide.failure}</p>
            <p className="caption"><b>Prototype limits:</b> {guide.limits}</p>
          </div>
        ))}
        {lifecycles.length > 0 && <div className="module-guide-section">
          <b>Record lifecycles</b>
          <ul className="module-guide-lifecycles">
            {lifecycles.map(def => (
              <li key={def.id}>
                <span className="small bold">{def.record}</span>
                <span className="lc-path">{def.path.map(step => step.step).join(' → ')}</span>
                {def.rework && <span className="caption">Rework: {def.rework.note}</span>}
                {def.terminal?.length ? <span className="caption">Terminal: {def.terminal.join(', ')}</span> : null}
              </li>
            ))}
          </ul>
        </div>}
      </div>
    </details>
  );
};
