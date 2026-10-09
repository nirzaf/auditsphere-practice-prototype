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

it('keeps email-provider staging allowlisted and production routed without a public endpoint', () => {
  const provider = parseJsonc('worker/emailProvider/wrangler.jsonc');
  const staging = provider.env.staging;
  const production = provider.env.production;

  assert.equal(provider.workers_dev, false);
  assert.equal(staging.workers_dev, false);
  assert.equal(staging.vars.EMAIL_RECIPIENT_POLICY, 'ALLOWLIST');
  assert.equal(staging.vars.EMAIL_ALLOWED_RECIPIENTS, 'testing@mail.steauditing.com');
  assert.equal(staging.send_email[0].allowed_destination_addresses[0], 'testing@mail.steauditing.com');

  assert.equal(production.workers_dev, false);
  assert.deepEqual(production.send_email, [], 'production cannot inherit the verified-destination-only native binding');
  assert.equal(production.vars.EMAIL_RECIPIENT_POLICY, 'ROUTED');
  assert.equal(production.vars.EMAIL_API_FORMAT, 'CLOUDFLARE_EMAIL_SERVICE_REST');
  assert.match(production.vars.EMAIL_API_URL, /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[0-9a-f]+\/email\/sending\/send$/);
  assert.equal(production.routes, undefined);
  assert.equal(production.workers_dev, false, 'production has no workers.dev public route');

  const app = parseJsonc('wrangler.jsonc');
  assert.ok(app.services.some((binding: Record<string, string>) => binding.binding === 'EMAIL_PROVIDER'
    && binding.service === 'auditsphere-email-provider' && binding.environment === 'production'));
});
