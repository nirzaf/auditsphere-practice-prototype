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
    readinessChecks: { environment: string; rateLimiter: string; emailProvider: string; turnstile: string; turnstileHostnames: string; publicLead: { ipHashKey: string; defaultCountry: string; notification: string; crossOrigin: string }; sharepoint: string };
  } };
}

const readyEmailProvider = { fetch: async () => Response.json({ ok: true, senderConfigured: true, recipientPolicyConfigured: true }) } as unknown as Fetcher;

it('keeps local readiness compatible while reporting unconfigured optional integrations', async () => {
  const result = await ready(readinessEnv());
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.dependencyCodes, []);
  assert.deepEqual(result.body.readinessChecks, {
    environment: 'local', rateLimiter: 'MISSING', emailProvider: 'UNCONFIGURED',
    turnstile: 'NOT_CONFIGURED', turnstileHostnames: 'NOT_CONFIGURED', publicLead: { ipHashKey: 'NOT_CONFIGURED', defaultCountry: 'NOT_CONFIGURED', notification: 'OFF', crossOrigin: 'SAME_ORIGIN_ONLY' }, sharepoint: 'NOT_CONFIGURED'
  });
});

it('fails staging readiness when required rate limiting and email are absent, then passes when both are ready', async () => {
  const missing = await ready(readinessEnv({ ENVIRONMENT: 'staging' }));
  assert.equal(missing.response.status, 503);
  assert.deepEqual(missing.body.dependencyCodes, ['RATE_LIMITER_UNBOUND', 'EMAIL_PROVIDER_UNBOUND', 'PUBLIC_LEAD_IP_HASH_SECRET_NOT_CONFIGURED', 'PUBLIC_LEAD_DEFAULT_COUNTRY_NOT_CONFIGURED']);

  const configured = await ready(readinessEnv({
    ENVIRONMENT: 'staging',
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    EMAIL_PROVIDER: readyEmailProvider,
    PUBLIC_LEAD_IP_HASH_SECRET: 'staging-public-lead-ip-key-at-least-32-characters',
    PUBLIC_LEAD_DEFAULT_COUNTRY_CODE: 'QA'
  }));
  assert.equal(configured.response.status, 200);
  assert.deepEqual(configured.body.dependencyCodes, []);
  assert.equal(configured.body.readinessChecks.turnstile, 'NOT_CONFIGURED', 'staging reports but does not fail on Turnstile configuration');
});

it('fails production readiness for each missing binding or unavailable provider', async () => {
  const common = {
    ENVIRONMENT: 'production',
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    EMAIL_PROVIDER: readyEmailProvider,
    TURNSTILE_SECRET_KEY: 'turnstile-secret', PUBLIC_LEAD_TURNSTILE_HOSTNAMES: 'www.firm.example',
    PUBLIC_LEAD_IP_HASH_SECRET: 'production-public-lead-ip-key-at-least-32-characters',
    PUBLIC_LEAD_DEFAULT_COUNTRY_CODE: 'QA'
  } satisfies Partial<Env>;
  const missingBoth = await ready(readinessEnv({ ENVIRONMENT: 'production' }));
  assert.equal(missingBoth.response.status, 503);
  assert.deepEqual(missingBoth.body.dependencyCodes, ['RATE_LIMITER_UNBOUND', 'EMAIL_PROVIDER_UNBOUND', 'TURNSTILE_NOT_CONFIGURED', 'TURNSTILE_HOSTNAMES_NOT_CONFIGURED', 'PUBLIC_LEAD_IP_HASH_SECRET_NOT_CONFIGURED', 'PUBLIC_LEAD_DEFAULT_COUNTRY_NOT_CONFIGURED']);

  const unavailableEmail = await ready(readinessEnv({
    ...common,
    EMAIL_PROVIDER: { fetch: async () => Response.json({ ok: false }) } as unknown as Fetcher
  }));
  assert.equal(unavailableEmail.response.status, 503);
  assert.deepEqual(unavailableEmail.body.dependencyCodes, ['EMAIL_PROVIDER_NOT_READY']);

  const missingTurnstile = await ready(readinessEnv({ ...common, TURNSTILE_SECRET_KEY: undefined }));
  assert.equal(missingTurnstile.response.status, 503);
  assert.deepEqual(missingTurnstile.body.dependencyCodes, ['TURNSTILE_NOT_CONFIGURED']);
  const missingTurnstileHostnames = await ready(readinessEnv({ ...common, PUBLIC_LEAD_TURNSTILE_HOSTNAMES: undefined }));
  assert.equal(missingTurnstileHostnames.response.status, 503);
  assert.deepEqual(missingTurnstileHostnames.body.dependencyCodes, ['TURNSTILE_HOSTNAMES_NOT_CONFIGURED']);
  const missingLeadKey = await ready(readinessEnv({ ...common, PUBLIC_LEAD_IP_HASH_SECRET: undefined }));
  assert.equal(missingLeadKey.response.status, 503);
  assert.deepEqual(missingLeadKey.body.dependencyCodes, ['PUBLIC_LEAD_IP_HASH_SECRET_NOT_CONFIGURED']);
  const missingCountry = await ready(readinessEnv({ ...common, PUBLIC_LEAD_DEFAULT_COUNTRY_CODE: undefined }));
  assert.equal(missingCountry.response.status, 503);
  assert.deepEqual(missingCountry.body.dependencyCodes, ['PUBLIC_LEAD_DEFAULT_COUNTRY_NOT_CONFIGURED']);
  const fullyConfigured = await ready(readinessEnv(common));
  assert.equal(fullyConfigured.response.status, 200);
  assert.deepEqual(fullyConfigured.body.dependencyCodes, []);
});

it('fails readiness for unavailable D1, missing/mismatched schema, and R2 in every environment', async () => {
  const environmentConfig: Record<string, Partial<Env>> = {
    local: { ENVIRONMENT: 'local' },
    staging: {
      ENVIRONMENT: 'staging',
      RATE_LIMITER: { limit: async () => ({ success: true }) },
      EMAIL_PROVIDER: readyEmailProvider,
      PUBLIC_LEAD_IP_HASH_SECRET: 'staging-public-lead-ip-key-at-least-32-characters',
      PUBLIC_LEAD_DEFAULT_COUNTRY_CODE: 'QA'
    },
    production: {
      ENVIRONMENT: 'production',
      RATE_LIMITER: { limit: async () => ({ success: true }) },
      EMAIL_PROVIDER: readyEmailProvider,
      TURNSTILE_SECRET_KEY: 'turnstile-secret',
      PUBLIC_LEAD_TURNSTILE_HOSTNAMES: 'www.firm.example',
      PUBLIC_LEAD_IP_HASH_SECRET: 'production-public-lead-ip-key-at-least-32-characters',
      PUBLIC_LEAD_DEFAULT_COUNTRY_CODE: 'QA'
    }
  };

  for (const environment of ['local', 'staging', 'production'] as const) {
    const configured = environmentConfig[environment];
    const unavailableDb = readinessEnv({
      ...configured,
      DB: { prepare: () => ({ first: async () => { throw new Error('D1 unavailable'); } }) } as unknown as D1Database
    });
    const dbResult = await ready(unavailableDb);
    assert.equal(dbResult.response.status, 503, `${environment} must fail when D1 is unavailable`);
    assert.ok(dbResult.body.dependencyCodes.includes('D1_UNAVAILABLE'));

    for (const schemaCase of ['missing', 'mismatch'] as const) {
      const schemaDb = {
        prepare(sql: string) {
          return {
            first: async () => sql.includes('application_schema_version')
              ? schemaCase === 'missing' ? null : { version: APPLICATION_SCHEMA_VERSION + 1 }
              : { ok: 1 }
          };
        }
      } as unknown as D1Database;
      const schemaResult = await ready(readinessEnv({ ...configured, DB: schemaDb }));
      assert.equal(schemaResult.response.status, 503, `${environment} must fail for ${schemaCase} schema state`);
      assert.ok(schemaResult.body.dependencyCodes.includes(
        schemaCase === 'missing' ? 'SCHEMA_VERSION_UNAVAILABLE' : 'SCHEMA_VERSION_MISMATCH'
      ));
    }

    const unavailableR2 = readinessEnv({
      ...configured,
      FILES: { head: async () => { throw new Error('R2 unavailable'); } } as unknown as R2Bucket
    });
    const r2Result = await ready(unavailableR2);
    assert.equal(r2Result.response.status, 503, `${environment} must fail when R2 is unavailable`);
    assert.ok(r2Result.body.dependencyCodes.includes('R2_UNAVAILABLE'));
  }
});
