import assert from 'node:assert/strict';
import test from 'node:test';
import { routeInventory } from '../../worker/index';
import { authHandlerRoutes } from '../../worker/auth/oidcRoutes';

const expectedRoutes = `GET /api/auth/staff/login
GET /api/auth/staff/callback
POST /api/auth/client/login
GET /api/auth/me
POST /api/auth/password
POST /api/auth/password-reset/request
POST /api/auth/password-reset/confirm
POST /api/auth/active-profile
POST /api/auth/logout
GET /api/health
GET /api/health/live
GET /api/health/ready
GET /api/health/support-bundle
GET /api/integrations/status
POST /api/internal/verification-runs
POST /api/internal/bootstrap
POST /api/workspaces
GET /api/workspaces/:workspaceId/actor-profiles
GET /api/workspaces/:workspaceId/users
GET /api/workspaces/:workspaceId/context
GET /api/workspaces/:workspaceId/clients
GET /api/workspaces/:workspaceId/clients/:clientId
GET /api/workspaces/:workspaceId/leads
GET /api/workspaces/:workspaceId/standards-profiles
GET /api/workspaces/:workspaceId/proposal-workspace
GET /api/workspaces/:workspaceId/engagements/:engagementId/workflow
GET /api/workspaces/:workspaceId/engagements/:engagementId/acceptance-gate
GET /api/workspaces/:workspaceId/engagements/:engagementId/risk-workspace
GET /api/workspaces/:workspaceId/engagements/:engagementId/delivery-workspace
GET /api/workspaces/:workspaceId/engagements/:engagementId/planning-workspace
GET /api/workspaces/:workspaceId/engagements/:engagementId/financial-statements
GET /api/workspaces/:workspaceId/engagements/:engagementId/fslis/:fsliId/source-lines
GET /api/workspaces/:workspaceId/engagements/:engagementId/fieldwork-workspace
GET /api/workspaces/:workspaceId/engagements/:engagementId/sampling-plans/:planId
GET /api/workspaces/:workspaceId/engagements/:engagementId/sampling-populations/:populationId
GET /api/workspaces/:workspaceId/engagements/:engagementId/changes
GET /api/workspaces/:workspaceId/engagements/:engagementId/trial-balance-workspace
GET /api/workspaces/:workspaceId/engagements/:engagementId/trial-balance-preview
GET /api/workspaces/:workspaceId/engagements/:engagementId/tb-imports/:importId
GET /api/workspaces/:workspaceId/engagements/:engagementId/planning-readiness
GET /api/workspaces/:workspaceId/engagements/:engagementId/folders
GET /api/workspaces/:workspaceId/capacity
GET /api/workspaces/:workspaceId/practice/utilization
GET /api/workspaces/:workspaceId/practice/engagements/:engagementId/profitability
GET /api/workspaces/:workspaceId/practice/reports/trial-balance
GET /api/workspaces/:workspaceId/practice/reports/profit-loss
GET /api/workspaces/:workspaceId/practice
GET /api/workspaces/:workspaceId/engagements/:engagementId/reporting-workspace
GET /api/workspaces/:workspaceId/engagements/:engagementId/archive-status
GET /api/workspaces/:workspaceId/engagements/:engagementId/archive/export
POST /api/workspaces/:workspaceId/engagements/:engagementId/archive/download-ticket
GET /api/archive-download/:token
GET /api/workspaces/:workspaceId/engagements/:engagementId/opinion-preview
GET /api/workspaces/:workspaceId/engagements/:engagementId/released-report/provenance
GET /api/workspaces/:workspaceId/pbc-engagements
GET /api/workspaces/:workspaceId/engagements/:engagementId/pbc/:requestId
GET /api/workspaces/:workspaceId/engagements/:engagementId/portal
GET /api/workspaces/:workspaceId/changes
POST /api/workspaces/:workspaceId/commands
GET /api/workspaces/:workspaceId/files
POST /api/workspaces/:workspaceId/files
GET /api/workspaces/:workspaceId/files/:fileId
GET /api/workspaces/:workspaceId/files/:fileId/metadata
DELETE /api/workspaces/:workspaceId/files/:fileId
PUT /api/workspaces/:workspaceId/files/:fileId/content
POST /api/workspaces/:workspaceId/files/:fileId/complete
GET /api/workspaces/:workspaceId`.split('\n');

test('Worker route inventory lists staff auth routes alongside BUSINESS routes', () => {
  assert.deepEqual(routeInventory.map(route => `${route.method} ${route.pattern}`), expectedRoutes);
  for (const route of authHandlerRoutes) assert.ok(routeInventory.some(item => `${item.method} ${item.pattern}` === route), `${route} must remain in the route inventory`);
});
