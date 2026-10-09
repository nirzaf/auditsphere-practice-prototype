import assert from 'node:assert/strict';
import { it } from 'node:test';
import worker from '../../worker/index.js';
import type { Env } from '../../worker/env.js';

const expectedCsp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function env(environment = 'local'): Env {
  return {
    ENVIRONMENT: environment,
    ASSETS: { fetch: async () => new Response('asset', { status: 200, headers: { 'Content-Type': 'application/javascript' } }) } as unknown as Fetcher
  } as Env;
}

function assertShellHeaders(response: Response, hsts: boolean): void {
  assert.equal(response.headers.get('Content-Security-Policy'), expectedCsp);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
  assert.equal(response.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()');
  assert.equal(response.headers.get('Strict-Transport-Security'), hsts ? 'max-age=31536000; includeSubDomains' : null);
}

it('hardens the app shell and hashed assets, with HSTS only in production', async () => {
  const local = env();
  const shell = await worker.fetch(new Request('https://audit.example/'), local, {} as ExecutionContext);
  assert.equal(shell.status, 200);
  assertShellHeaders(shell, false);

  const hashedAsset = await worker.fetch(new Request('https://audit.example/assets/index-a1b2c3d4.js'), local, {} as ExecutionContext);
  assert.equal(hashedAsset.status, 200);
  assertShellHeaders(hashedAsset, false);

  const productionShell = await worker.fetch(new Request('https://audit.example/'), env('production'), {} as ExecutionContext);
  assertShellHeaders(productionShell, true);
});

it('applies no-store and nosniff to API responses at the route boundary', async () => {
  const response = await worker.fetch(new Request('https://audit.example/api/health/live'), env(), {} as ExecutionContext);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
});
