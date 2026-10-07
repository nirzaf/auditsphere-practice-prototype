import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createRouter } from '../../worker/router';
import { apiRequestMetric, outboxSnapshot, safeErrorKind } from '../../worker/observability';

it('labels API metrics with the declared route template and redacts concrete workspace identifiers', () => {
  const router = createRouter().get('/api/workspaces/:workspaceId/engagements/:engagementId/workflow', () => new Response());
  const match = router.match('GET', '/api/workspaces/11111111-1111-4111-8111-111111111111/engagements/22222222-2222-4222-8222-222222222222/workflow');
  assert.equal(match?.routePattern, '/api/workspaces/:workspaceId/engagements/:engagementId/workflow');
  const metric = apiRequestMetric({ requestId: 'request-1', route: match!.routePattern, method: 'get', status: 409, durationMs: 17.126 });
  assert.deepEqual(metric, { event: 'workspace.api.request', requestId: 'request-1', route: '/api/workspaces/:workspaceId/engagements/:engagementId/workflow',
    method: 'GET', status: 409, outcome: 'rejected', durationMs: 17.13 });
  assert.equal(JSON.stringify(metric).includes('11111111'), false);
  assert.equal(JSON.stringify(metric).includes('22222222'), false);
});

it('emits bounded queue counts and oldest age without job IDs or payload data', () => {
  const snapshot = outboxSnapshot([
    { kind: 'EMAIL', status: 'RETRYABLE_FAILED', count: 2, oldest_created_at: '2026-10-07T00:00:00.000Z', max_attempts: 3 },
    { kind: 'SEAL_ARCHIVE', status: 'PENDING', count: 1, oldest_created_at: '2026-10-07T00:05:00.000Z', max_attempts: 0 }
  ], '2026-10-07T00:10:00.000Z', 4, 1);
  assert.deepEqual(snapshot, { event: 'workspace.scheduled.metrics', at: '2026-10-07T00:10:00.000Z', processedJobs: 4, archiveJobsQueued: 1,
    outbox: { unfinishedJobs: 3, oldestUnfinishedAgeSeconds: 600, maxAttempts: 3,
      byKindAndStatus: [{ kind: 'EMAIL', status: 'RETRYABLE_FAILED', count: 2 }, { kind: 'SEAL_ARCHIVE', status: 'PENDING', count: 1 }] } });
  assert.equal(JSON.stringify(snapshot).includes('payload'), false);
  assert.equal(JSON.stringify(snapshot).includes('job-'), false);
});

it('logs only a safe error class name, never the exception message', () => {
  const error = new Error('client name and financial details must not be logged');
  assert.equal(safeErrorKind(error), 'Error');
  assert.equal(safeErrorKind({ message: 'sensitive details' }), 'NonErrorThrow');
});
