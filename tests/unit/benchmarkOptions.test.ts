import assert from 'node:assert/strict';
import { it } from 'node:test';
import { parseBenchmarkOptions } from '../../tools/benchmark-options.js';

it('keeps the existing invocation on the isolated local benchmark', () => {
  assert.deepEqual(parseBenchmarkOptions([]), { mode: 'local' });
});

it('requires explicit synthetic-staging acknowledgement and a deployed build identity', () => {
  assert.throws(() => parseBenchmarkOptions([
    '--target', 'https://auditsphere-staging.example.com',
    '--workspace-id', 'synthetic-workspace', '--build-id', 'abc123'
  ]), /confirm-synthetic-staging/);
  assert.throws(() => parseBenchmarkOptions([
    '--target', 'https://auditsphere-staging.example.com',
    '--workspace-id', 'synthetic-workspace', '--confirm-synthetic-staging'
  ]), /build-id/);
});

it('refuses production and unlabeled public hosts for remote load', () => {
  for (const target of [
    'https://auditsphere-visual-prototype.quadrate-lk.workers.dev',
    'https://auditsphere-production.example.com',
    'https://example.com'
  ]) {
    assert.throws(() => parseBenchmarkOptions([
      '--target', target, '--workspace-id', 'synthetic-workspace', '--build-id', 'abc123',
      '--confirm-synthetic-staging'
    ]), /staging|production/);
  }
});

it('defaults staging runs to 50 synthetic workflow profiles over 15 minutes without cookies', () => {
  const options = parseBenchmarkOptions([
    '--target', 'https://auditsphere-staging.example.com',
    '--workspace-id', 'synthetic-workspace', '--build-id', 'abc123', '--confirm-synthetic-staging'
  ]);
  assert.equal(options.mode, 'staging');
  if (options.mode !== 'staging') return;
  assert.equal(options.users, 50);
  assert.equal(options.durationSeconds, 900);
  assert.equal(options.thinkTimeMs, 5000);
  assert.equal(options.target.origin, 'https://auditsphere-staging.example.com');
  assert.equal('cookies' in options, false);
});
