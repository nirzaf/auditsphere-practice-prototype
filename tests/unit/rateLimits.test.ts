import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { enforceNamedRateLimit } from '../../worker/rateLimits.js';
import { toApiError } from '../../worker/errors.js';
import { enforcePublicLeadHourlyLimit } from '../../worker/publicLeadRateLimit.js';
import type { Env } from '../../worker/env.js';
import type { RouteContext } from '../../worker/router.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteD1 } from '../helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rateDb = new SqliteD1();
rateDb.migrate(repositoryRoot);
after(() => rateDb.close());

function context(env: Partial<Env>): RouteContext {
  return {
    request: new Request('https://audit.example.test/api/test'),
    env: env as Env,
    ctx: {} as ExecutionContext,
    url: new URL('https://audit.example.test/api/test'),
    params: {},
    requestId: 'rate-limit-test',
    origin: 'https://audit.example.test'
  };
}

it('uses the general request bucket with the caller-provided opaque key', async () => {
  const keys: string[] = [];
  const limiter = { limit: async ({ key }: { key: string }) => { keys.push(key); return { success: true }; } };
  const ctx = context({ RATE_LIMITER: limiter });
  await enforceNamedRateLimit(ctx, 'RATE_LIMITER', 'workspace.command:ip-hash:workspace');
  assert.deepEqual(keys, ['workspace.command:ip-hash:workspace']);
});

it('returns RATE_LIMITED when a configured bucket rejects a request', async () => {
  const ctx = context({ RATE_LIMITER: { limit: async () => ({ success: false }) } });
  await assert.rejects(enforceNamedRateLimit(ctx, 'RATE_LIMITER', 'workspace.command:ip-hash:workspace'), error => {
    const mapped = toApiError(error, ctx.requestId);
    assert.equal(mapped.status, 429);
    assert.equal(mapped.body.code, 'RATE_LIMITED');
    return true;
  });
});

it('fails closed with 503 in production when a required bucket is unbound', async () => {
  for (const environment of ['production', 'staging']) {
    const ctx = context({ ENVIRONMENT: environment });
    await assert.rejects(enforceNamedRateLimit(ctx, 'RATE_LIMITER', 'workspace.command:ip-hash:workspace'), error => {
      const mapped = toApiError(error, ctx.requestId);
      assert.equal(mapped.status, 503);
      assert.equal(mapped.body.code, 'UNAVAILABLE');
      return true;
    });
  }
});

it('keeps local development usable when an optional rate-limit binding is absent', async () => {
  await enforceNamedRateLimit(context({ ENVIRONMENT: 'local' }), 'RATE_LIMITER', 'workspace.command:ip-hash:workspace');
});

it('enforces five public leads in a rolling hour using only a salted IP digest', async () => {
  const ip = '203.0.113.44';
  const start = new Date('2026-10-09T12:00:00.000Z');
  let digest = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    digest = await enforcePublicLeadHourlyLimit({ DB: rateDb as unknown as D1Database,
      PUBLIC_LEAD_IP_HASH_SECRET: 'test-only-hmac-secret-with-32-characters-minimum' }, ip, new Date(start.getTime() + attempt * 1000));
  }
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, ip);
  await assert.rejects(enforcePublicLeadHourlyLimit({ DB: rateDb as unknown as D1Database,
    PUBLIC_LEAD_IP_HASH_SECRET: 'test-only-hmac-secret-with-32-characters-minimum' }, ip, new Date(start.getTime() + 5_000)), error => {
    assert.equal((error as { code?: string }).code, 'RATE_LIMITED');
    return true;
  });

  const anotherIp = await enforcePublicLeadHourlyLimit({ DB: rateDb as unknown as D1Database,
    PUBLIC_LEAD_IP_HASH_SECRET: 'test-only-hmac-secret-with-32-characters-minimum' }, '203.0.113.45', new Date(start.getTime() + 5_000));
  assert.notEqual(anotherIp, digest);
  const afterWindow = await enforcePublicLeadHourlyLimit({ DB: rateDb as unknown as D1Database,
    PUBLIC_LEAD_IP_HASH_SECRET: 'test-only-hmac-secret-with-32-characters-minimum' }, ip, new Date(start.getTime() + 60 * 60 * 1000 + 1));
  assert.equal(afterWindow, digest);
  const stored = await rateDb.prepare('SELECT ip_sha256 FROM public_lead_rate_limit_events WHERE ip_sha256=? LIMIT 1')
    .bind(digest).first<{ ip_sha256: string }>();
  assert.equal(stored?.ip_sha256, digest);
});

it('fails closed when the public lead IP hash key is missing', async () => {
  await assert.rejects(enforcePublicLeadHourlyLimit({ DB: rateDb as unknown as D1Database }, '203.0.113.46'), error => {
    const mapped = toApiError(error, 'rate-limit-test');
    assert.equal(mapped.status, 503);
    assert.equal(mapped.body.code, 'UNAVAILABLE');
    return true;
  });
});
