import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildVerificationSupportBundle } from '../../worker/verificationSupportBundle.js';

it('exports only allowlisted verification metadata and degrades readiness on known dependency codes', () => {
  const bundle = buildVerificationSupportBundle({
    generatedAt: '2026-10-07T12:05:00Z',
    applicationSchemaVersion: 33,
    installedSchemaVersion: 33,
    readiness: 'ready',
    dependencyCodes: ['R2_UNAVAILABLE', 'R2_UNAVAILABLE', 'a secret accidentally passed as a code'],
    verificationRuns: [{
      source_commit: 'A'.repeat(40),
      schema_version: 33,
      environment: 'ci',
      started_at: '2026-10-07T12:00:00Z',
      completed_at: '2026-10-07T12:04:00Z',
      status: 'PASSED',
      workspace_id: 'client-123',
      raw_output: 'account balance and API token must never leave the test runner'
    }]
  });

  assert.deepEqual(bundle, {
    format: 'auditsphere-operational-support-v1',
    generatedAt: '2026-10-07T12:05:00.000Z',
    applicationSchemaVersion: 33,
    installedSchemaVersion: 33,
    readiness: 'degraded',
    dependencyCodes: ['R2_UNAVAILABLE'],
    verificationRuns: [{
      sourceCommit: 'a'.repeat(40),
      schemaVersion: 33,
      environment: 'CI',
      startedAt: '2026-10-07T12:00:00.000Z',
      completedAt: '2026-10-07T12:04:00.000Z',
      status: 'PASSED'
    }]
  });
  const serialized = JSON.stringify(bundle);
  assert.equal(serialized.includes('client-123'), false);
  assert.equal(serialized.includes('raw_output'), false);
  assert.equal(serialized.includes('account balance'), false);
  assert.equal(serialized.includes('API token'), false);
});

it('omits malformed verification metadata and rejects invalid generated timestamps', () => {
  const bundle = buildVerificationSupportBundle({
    generatedAt: '2026-10-07T12:05:00.000Z',
    applicationSchemaVersion: 33,
    installedSchemaVersion: null,
    readiness: 'degraded',
    dependencyCodes: [],
    verificationRuns: [{
      source_commit: 'not-a-commit',
      schema_version: 33,
      environment: 'CI',
      started_at: '2026-10-07T12:00:00Z',
      completed_at: null,
      status: 'NOT_RUN'
    }]
  });
  assert.deepEqual(bundle.verificationRuns, []);
  assert.throws(() => buildVerificationSupportBundle({
    generatedAt: 'not-a-timestamp',
    applicationSchemaVersion: 33,
    installedSchemaVersion: 33,
    readiness: 'ready',
    dependencyCodes: [],
    verificationRuns: []
  }), /valid UTC generation timestamp/);
});

it('keeps CI verification separate from runtime readiness checks', () => {
  const bundle = buildVerificationSupportBundle({
    generatedAt: '2026-10-07T12:05:00.000Z',
    applicationSchemaVersion: 33,
    installedSchemaVersion: null,
    readiness: 'not_checked',
    dependencyCodes: [],
    verificationRuns: [{
      source_commit: 'c'.repeat(40),
      schema_version: 33,
      environment: 'CI',
      started_at: '2026-10-07T12:00:00Z',
      completed_at: '2026-10-07T12:04:00Z',
      status: 'PASSED'
    }]
  });
  assert.equal(bundle.readiness, 'not_checked');
  assert.equal(bundle.verificationRuns[0]?.status, 'PASSED');
});
