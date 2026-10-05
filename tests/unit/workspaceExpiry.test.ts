import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceIsExpired } from '../../worker/db';

test('business workspaces never expire, regardless of the test retention clock', () => {
  assert.equal(workspaceIsExpired({ data_mode: 'BUSINESS', expires_at: null }, 10_000), false);
  assert.equal(workspaceIsExpired({ data_mode: 'BUSINESS', expires_at: 1 }, 10_000), false);
});

test('test workspaces expire at their recorded deadline and fail closed without one', () => {
  assert.equal(workspaceIsExpired({ data_mode: 'TEST', expires_at: 1_000 }, 999), false);
  assert.equal(workspaceIsExpired({ data_mode: 'TEST', expires_at: 1_000 }, 1_000), true);
  assert.equal(workspaceIsExpired({ data_mode: 'TEST', expires_at: null }, 999), true);
});
