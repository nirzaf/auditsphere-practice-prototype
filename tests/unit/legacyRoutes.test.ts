import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_ROUTE_REDIRECTS, resolveRouteHash, canonicalRoute } from '../../src/services/legacyRoutes.js';

describe('legacy hash routes (VP-002)', () => {
  it('resolves every route from the former React migration baseline', () => {
    for (const [legacy, route] of Object.entries(LEGACY_ROUTE_REDIRECTS)) {
      assert.deepEqual(resolveRouteHash(`#${legacy}`), {
        route: canonicalRoute(route),
        redirected: canonicalRoute(route) !== legacy,
      }, `legacy route #${legacy}`);
    }
  });

  it('covers every route ID in the former role-view registry', () => {
    const priorRoleRoutes = [
      'overview', 'acquisition', 'client-summary', 'intake', 'invitations', 'compliance',
      'acceptance', 'clients', 'engagements', 'team', 'documents', 'accounting', 'audit',
      'reviews', 'quality', 'delivery', 'continuance', 'renewal', 'portal', 'client-team',
      'client-requests', 'client-approvals', 'client-deliverables', 'billing', 'commercial-review',
      'commercial-requests', 'records', 'handover', 'administration', 'access-requests',
      'operations', 'my-time', 'services', 'role-guide', 'privileges', 'requirements',
    ];
    assert.deepEqual(priorRoleRoutes.filter(route => !LEGACY_ROUTE_REDIRECTS[route]), []);
  });

  it('keeps current route IDs and declines unknown fragments', () => {
    assert.deepEqual(resolveRouteHash('#audit-planning'), { route: 'audit-planning', redirected: false });
    assert.deepEqual(resolveRouteHash('#search'), { route: 'overview', redirected: true }, 'Search is a modal utility and stale standalone hashes return to a real workspace');
    assert.equal(resolveRouteHash('#not-a-route'), null);
    assert.equal(resolveRouteHash(''), null);
  });
});
