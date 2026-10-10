import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'node:test';

function parseJsonc(path: string): Record<string, any> {
  const source = readFileSync(resolve(process.cwd(), path), 'utf8');
  let output = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (current === '\n' || current === '\r') { lineComment = false; output += current; }
      else output += ' ';
      continue;
    }
    if (blockComment) {
      if (current === '*' && next === '/') { blockComment = false; output += '  '; index += 1; }
      else output += current === '\n' || current === '\r' ? current : ' ';
      continue;
    }
    if (inString) {
      output += current;
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') { inString = true; output += current; continue; }
    if (current === '/' && next === '/') { lineComment = true; output += '  '; index += 1; continue; }
    if (current === '/' && next === '*') { blockComment = true; output += '  '; index += 1; continue; }
    output += current;
  }
  return JSON.parse(output) as Record<string, any>;
}

it('keeps the email-provider environments isolated and safe', () => {
  const provider = parseJsonc('worker/emailProvider/wrangler.jsonc');
  const staging = provider.env.staging;
  const production = provider.env.production;

  assert.equal(provider.workers_dev, false);
  assert.equal(staging.name, 'auditsphere-email-provider-staging');
  assert.equal(staging.workers_dev, false);
  assert.equal(staging.vars.EMAIL_RECIPIENT_POLICY, 'ALLOWLIST');
  assert.equal(staging.vars.EMAIL_ALLOWED_RECIPIENTS, 'testing@mail.steauditing.com');
  assert.equal(staging.send_email[0].allowed_destination_addresses[0], 'testing@mail.steauditing.com');

  assert.equal(production.name, 'auditsphere-email-provider');
  assert.equal(production.workers_dev, false);
  assert.deepEqual(production.send_email, [], 'production cannot inherit the verified-destination-only native binding');
  assert.equal(production.vars.EMAIL_RECIPIENT_POLICY, 'ROUTED');
  assert.equal(production.vars.EMAIL_API_FORMAT, 'CLOUDFLARE_EMAIL_SERVICE_REST');
  assert.match(production.vars.EMAIL_API_URL, /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[0-9a-f]+\/email\/sending\/send$/);
  assert.equal(production.routes, undefined, 'provider remains private and service-bound');
});

it('isolates staging and production app resources and keeps production private until D6', () => {
  const app = parseJsonc('wrangler.jsonc');
  const environments = Object.keys(app.env).sort();
  assert.deepEqual(environments, ['local', 'production', 'staging']);
  assert.deepEqual(Object.keys(app).sort(), [
    '$schema', 'assets', 'compatibility_date', 'compatibility_flags', 'env', 'main', 'name', 'observability', 'workers_dev'
  ]);
  assert.equal(app.name, 'auditsphere-config-only');
  assert.equal(app.workers_dev, false, 'base config must not publish a public default worker');

  const { local, staging, production } = app.env;
  assert.equal(local.name, 'auditsphere-local');
  assert.equal(local.vars.ENVIRONMENT, 'local');
  assert.equal(local.services, undefined, 'local development must not start the native email service emulator');
  assert.equal(local.d1_databases[0].database_name, 'auditsphere-local');
  assert.equal(local.r2_buckets[0].bucket_name, 'auditsphere-local-files');
  assert.equal(staging.name, 'auditsphere-staging');
  assert.equal(production.name, 'auditsphere');
  assert.equal(staging.workers_dev, false);
  assert.equal(production.workers_dev, false);

  assert.equal(staging.d1_databases[0].binding, 'DB');
  assert.equal(production.d1_databases[0].binding, 'DB');
  assert.equal(staging.d1_databases[0].database_name, 'auditsphere-staging');
  assert.equal(production.d1_databases[0].database_name, 'auditsphere-production');
  assert.match(staging.d1_databases[0].database_id, /^REPLACE_WITH_/);
  assert.match(production.d1_databases[0].database_id, /^REPLACE_WITH_/);
  assert.notEqual(staging.d1_databases[0].database_id, production.d1_databases[0].database_id);
  assert.notEqual(staging.d1_databases[0].database_name, production.d1_databases[0].database_name);

  assert.equal(staging.r2_buckets[0].binding, 'FILES');
  assert.equal(production.r2_buckets[0].binding, 'FILES');
  assert.equal(staging.r2_buckets[0].bucket_name, 'auditsphere-staging-files');
  assert.equal(production.r2_buckets[0].bucket_name, 'auditsphere-production-files');
  assert.notEqual(staging.r2_buckets[0].bucket_name, production.r2_buckets[0].bucket_name);
  assert.equal(typeof staging.ratelimits[0].namespace_id, 'string');
  assert.equal(typeof production.ratelimits[0].namespace_id, 'string');
  assert.match(staging.ratelimits[0].namespace_id, /^\d+$/);
  assert.match(production.ratelimits[0].namespace_id, /^\d+$/);
  assert.notEqual(staging.ratelimits[0].namespace_id, production.ratelimits[0].namespace_id);

  assert.deepEqual(staging.services.map((binding: any) => [binding.binding, binding.service, binding.environment]), [
    ['EMAIL_PROVIDER', 'auditsphere-email-provider', 'staging']
  ]);
  assert.deepEqual(production.services.map((binding: any) => [binding.binding, binding.service, binding.environment]), [
    ['EMAIL_PROVIDER', 'auditsphere-email-provider', 'production']
  ]);
  assert.equal(staging.vars.ENVIRONMENT, 'staging');
  assert.equal(production.vars.ENVIRONMENT, 'production');
  assert.deepEqual(staging.triggers.crons, ['* * * * *']);
  assert.deepEqual(production.triggers.crons, ['* * * * *']);

  for (const environment of [staging, production]) {
    for (const key of Object.keys(environment.vars)) {
      assert.doesNotMatch(key, /SECRET|TOKEN|PASSWORD|KEY$/i, `secret-like var ${key} must be a Worker secret`);
    }
  }

  const source = readFileSync(resolve(process.cwd(), 'wrangler.jsonc'), 'utf8');
  assert.match(source, /TODO\(D6\): add the approved custom-domain route/);
  assert.equal(production.routes, undefined, 'no product route is deployed before the owner chooses a domain/perimeter');
});
