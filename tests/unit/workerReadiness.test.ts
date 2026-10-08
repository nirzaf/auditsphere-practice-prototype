import assert from 'node:assert/strict';
import { it } from 'node:test';
import worker from '../../worker/index.js';
import { APPLICATION_SCHEMA_VERSION } from '../../worker/versions.js';
import type { Env } from '../../worker/env.js';

function readinessEnv(overrides: Partial<Env> = {}): Env {
  const db = {
    prepare(sql: string) {
      return {
        bind() { return this; },
        async first() {
          if (sql.includes('application_schema_version')) return { version: APPLICATION_SCHEMA_VERSION };
          return { ok: 1 };
        }
      };
    }
  };
  return {
    DB: db as unknown as D1Database,
    FILES: { head: async () => null } as unknown as R2Bucket,
    ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as unknown as Fetcher,
    ...overrides
  };
}

async function ready(env: Env) {
  const response = await worker.fetch(new Request('https://local.auditsphere.test/api/health/ready'), env, {} as ExecutionContext);
  return { response, body: await response.json() as {
    status: string;
    dependencyCodes: string[];
    readinessChecks: { environment: string; rateLimiter: string; emailProvider: string; auth: { entra: string }; turnstile: string; sharepoint: string };
  } };
}

const readyEmailProvider = { fetch: async () => Response.json({ ok: true, senderConfigured: true, recipientPolicyConfigured: true }) } as unknown as Fetcher;

it('keeps local readiness compatible while reporting unconfigured optional integrations', async () => {
  const result = await ready(readinessEnv());
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.dependencyCodes, []);
  assert.deepEqual(result.body.readinessChecks, {
    environment: 'local', rateLimiter: 'MISSING', emailProvider: 'UNCONFIGURED', auth: { entra: 'NOT_CONFIGURED' },
    turnstile: 'NOT_CONFIGURED', sharepoint: 'NOT_CONFIGURED'
  });
});

it('fails staging readiness when required rate limiting and email are absent, then passes when both are ready', async () => {
  const missing = await ready(readinessEnv({ ENVIRONMENT: 'staging' }));
  assert.equal(missing.response.status, 503);
  assert.deepEqual(missing.body.dependencyCodes, ['RATE_LIMITER_UNBOUND', 'EMAIL_PROVIDER_UNBOUND']);

  const configured = await ready(readinessEnv({
    ENVIRONMENT: 'staging',
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    EMAIL_PROVIDER: readyEmailProvider
  }));
  assert.equal(configured.response.status, 200);
  assert.deepEqual(configured.body.dependencyCodes, []);
  assert.equal(configured.body.readinessChecks.auth.entra, 'NOT_CONFIGURED');
  assert.equal(configured.body.readinessChecks.turnstile, 'NOT_CONFIGURED', 'staging reports but does not fail on OIDC or Turnstile configuration');
});

it('fails production readiness for each missing binding or unavailable provider', async () => {
  const common = {
    ENVIRONMENT: 'production',
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    EMAIL_PROVIDER: readyEmailProvider,
    OIDC_TENANT_ID: 'tenant', OIDC_CLIENT_ID: 'client', OIDC_CLIENT_SECRET: 'secret', OIDC_REDIRECT_URI: 'https://audit.example.test/callback',
    TURNSTILE_SECRET_KEY: 'turnstile-secret'
  } satisfies Partial<Env>;
  const missingBoth = await ready(readinessEnv({ ENVIRONMENT: 'production' }));
  assert.equal(missingBoth.response.status, 503);
  assert.deepEqual(missingBoth.body.dependencyCodes, ['RATE_LIMITER_UNBOUND', 'EMAIL_PROVIDER_UNBOUND', 'OIDC_NOT_CONFIGURED', 'TURNSTILE_NOT_CONFIGURED']);

  const unavailableEmail = await ready(readinessEnv({
    ...common,
    EMAIL_PROVIDER: { fetch: async () => Response.json({ ok: false }) } as unknown as Fetcher
  }));
  assert.equal(unavailableEmail.response.status, 503);
  assert.deepEqual(unavailableEmail.body.dependencyCodes, ['EMAIL_PROVIDER_NOT_READY']);

  const missingOidc = await ready(readinessEnv({ ...common, OIDC_CLIENT_SECRET: undefined }));
  assert.equal(missingOidc.response.status, 503);
  assert.deepEqual(missingOidc.body.dependencyCodes, ['OIDC_NOT_CONFIGURED']);
  const missingTurnstile = await ready(readinessEnv({ ...common, TURNSTILE_SECRET_KEY: undefined }));
  assert.equal(missingTurnstile.response.status, 503);
  assert.deepEqual(missingTurnstile.body.dependencyCodes, ['TURNSTILE_NOT_CONFIGURED']);
  const fullyConfigured = await ready(readinessEnv(common));
  assert.equal(fullyConfigured.response.status, 200);
  assert.deepEqual(fullyConfigured.body.dependencyCodes, []);
});
