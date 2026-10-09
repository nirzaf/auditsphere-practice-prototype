import assert from 'node:assert/strict';
import test from 'node:test';
import type { Env } from '../../worker/env';
import { clearOidcCachesForTests, getDiscovery, pkceChallenge, signStateCookie, verifyIdToken, verifyStateCookie, type AuthDeps } from '../../worker/auth/oidc';
import { createStaffOidcHandlers } from '../../worker/auth/oidcRoutes';
import { fromBase64Url, toBase64Url } from '../../worker/auth/tokens';

const tenant = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
const config = { OIDC_TENANT_ID: tenant, OIDC_CLIENT_ID: 'client-id', OIDC_CLIENT_SECRET: 'test-secret', OIDC_REDIRECT_URI: 'https://audit.example/api/auth/staff/callback' };

const b64json = (value: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
async function keyFixture() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { privateKey: pair.privateKey, jwk: { ...jwk, kid: 'fixture-key', use: 'sig', alg: 'RS256' } };
}
async function signedToken(privateKey: CryptoKey, overrides: Record<string, unknown> = {}, kid = 'fixture-key') {
  const now = Math.floor(Date.now() / 1000);
  const head = b64json({ alg: 'RS256', typ: 'JWT', kid });
  const payload = b64json({ iss: issuer, aud: 'client-id', tid: tenant, oid: 'user-object-id', nonce: 'nonce-value', iat: now, nbf: now - 1, exp: now + 300, email: 'staff@example.com', email_verified: true, ...overrides });
  const input = `${head}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(input));
  return `${input}.${toBase64Url(new Uint8Array(signature))}`;
}
function deps(publicJwk: JsonWebKey & { kid?: string }, clock = Date.now, idToken?: string): AuthDeps & { requests: string[] } {
  const requests: string[] = [];
  return {
    requests,
    now: clock,
    randomBytes: length => new Uint8Array(length).fill(7),
    fetch: (async input => {
      const url = String(input);
      requests.push(url);
      if (url.includes('.well-known/openid-configuration')) return Response.json({ issuer, authorization_endpoint: `${issuer}/oauth2/v2.0/authorize`, token_endpoint: `${issuer}/oauth2/v2.0/token`, jwks_uri: `${issuer}/discovery/v2.0/keys` });
      if (url.endsWith('/token')) return Response.json({ id_token: idToken });
      if (url.endsWith('/keys')) return Response.json({ keys: [publicJwk] });
      throw new Error(`Unexpected provider URL ${url}`);
    }) as typeof fetch
  };
}
function env() { return config as unknown as Env; }
const testUser = {
  id: 'user-id', workspace_id: 'workspace-id', kind: 'STAFF' as const, email_normalized: 'staff@example.com', display_name: 'Staff Member',
  status: 'INVITED' as const, external_issuer: null, external_subject: null, is_firm_admin: 0, password_must_change: 0
};
const testProfile = { id: '11111111-2222-4333-8444-555555555555', persona: 'PREPARER' as const, display_name: 'Staff Member', staff_grade: 'SENIOR', client_id: null };

function testDb() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) { values = bound; return this; },
        async all() {
          if (sql.includes('FROM user_accounts WHERE kind=\'STAFF\' AND external_issuer')) return { results: [] };
          if (sql.includes("status='INVITED' AND external_subject IS NULL")) return { results: [testUser] };
          if (sql.includes('FROM user_profile_grants g JOIN actor_profiles')) return { results: [testProfile] };
          if (sql.includes('FROM workspaces WHERE data_mode')) return { results: [{ id: 'workspace-id' }] };
          return { results: [] };
        },
        async first() {
          if (sql.includes('SELECT s.*,u.email_normalized')) {
            const now = Date.now();
            return { id: 'session-id', ...testUser, status: 'ACTIVE', active_actor_profile_id: testProfile.id, token_sha256: 'a'.repeat(64), auth_method: 'OIDC_ENTRA',
              created_at: new Date(now - 60_000).toISOString(), last_seen_at: new Date(now - 60_000).toISOString(), idle_expires_at: new Date(now + 30 * 60_000).toISOString(),
              absolute_expires_at: new Date(now + 12 * 60 * 60_000).toISOString(), revoked_at: null, account_status: 'ACTIVE', user_account_id: testUser.id };
          }
          if (sql.includes('FROM user_accounts WHERE workspace_id=? AND id=?')) return { ...testUser, status: 'ACTIVE', external_issuer: issuer, external_subject: 'user-object-id' };
          if (sql.includes('FROM user_profile_grants')) return { granted: 1 };
          if (sql.includes('SELECT active_actor_profile_id')) return { active_actor_profile_id: testProfile.id };
          return null;
        },
        async run() {
          calls.push({ sql, values });
          return { meta: { changes: 1 } };
        }
      };
    }
  };
  return { db, calls };
}

test('PKCE challenge and signed state cookie are verifiable and tamper resistant', async () => {
  const challenge = await pkceChallenge('fixed-verifier');
  assert.equal(challenge, toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('fixed-verifier')))));
  const cookie = await signStateCookie({ state: 'state', verifier: 'verifier' }, 'test-secret');
  assert.deepEqual(await verifyStateCookie(cookie, 'test-secret'), { state: 'state', verifier: 'verifier' });
  assert.equal(await verifyStateCookie(`${cookie.slice(0, -1)}x`, 'test-secret'), null);
  assert.equal(fromBase64Url(challenge).length, 32);
});

test('Entra discovery is cached for at most 24 hours', async () => {
  clearOidcCachesForTests();
  let now = 2_000_000_000_000;
  const fixture = deps({ kid: 'unused' }, () => now);
  await getDiscovery(env(), fixture);
  await getDiscovery(env(), fixture);
  assert.equal(fixture.requests.length, 1);
  now += 24 * 60 * 60 * 1000 + 1;
  await getDiscovery(env(), fixture);
  assert.equal(fixture.requests.length, 2);
});

test('valid RS256 ID token is accepted and core tenant claims are returned', async () => {
  clearOidcCachesForTests();
  const fixture = await keyFixture();
  const injected = deps(fixture.jwk);
  const token = await signedToken(fixture.privateKey);
  assert.deepEqual(await verifyIdToken(token, env(), 'nonce-value', injected), {
    oid: 'user-object-id', email: 'staff@example.com', preferredUsername: undefined, emailVerified: true, displayName: ''
  });
  assert.equal(injected.requests.length, 2);
});

test('ID token verification rejects nonce, audience, issuer, expiry and signature mismatches', async () => {
  clearOidcCachesForTests();
  const fixture = await keyFixture();
  const cases: Array<[string, Record<string, unknown>]> = [
    ['nonce', { nonce: 'wrong' }], ['audience', { aud: 'another-client' }], ['issuer', { iss: 'https://attacker.example' }],
    ['tenant', { tid: 'another-tenant' }], ['not yet valid', { nbf: Math.floor(Date.now() / 1000) + 600 }],
    ['issue time', { iat: Math.floor(Date.now() / 1000) + 600 }], ['expired', { exp: 1 }]
  ];
  for (const [message, overrides] of cases) {
    const token = await signedToken(fixture.privateKey, overrides);
    await assert.rejects(verifyIdToken(token, env(), 'nonce-value', deps(fixture.jwk)), new RegExp(message));
  }
  const valid = await signedToken(fixture.privateKey);
  const invalidAuthorizedParty = await signedToken(fixture.privateKey, { aud: ['client-id', 'another-client'], azp: 'another-client' });
  await assert.rejects(verifyIdToken(invalidAuthorizedParty, env(), 'nonce-value', deps(fixture.jwk)), /authorized party/);
  const parts = valid.split('.');
  const changed = `${parts[0]}.${parts[1]}.${toBase64Url(new Uint8Array(256).fill(9))}`;
  await assert.rejects(verifyIdToken(changed, env(), 'nonce-value', deps(fixture.jwk)), /signature/);
});

test('unknown key triggers one bounded JWKS refresh', async () => {
  clearOidcCachesForTests();
  const fixture = await keyFixture();
  const injected = deps(fixture.jwk, () => 2_000_000_000_000);
  const token = await signedToken(fixture.privateKey, {}, 'new-key');
  await assert.rejects(verifyIdToken(token, env(), 'nonce-value', injected), /unknown/);
  assert.equal(injected.requests.filter(url => url.endsWith('/keys')).length, 2);
  await assert.rejects(verifyIdToken(token, env(), 'nonce-value', injected), /unknown/);
  assert.equal(injected.requests.filter(url => url.endsWith('/keys')).length, 2);
});

test('login redirects to Entra with PKCE and sets a short-lived secure state cookie', async () => {
  clearOidcCachesForTests();
  const injected = deps({ kid: 'unused' });
  const handlers = createStaffOidcHandlers(() => injected);
  const request = new Request('https://audit.example/api/auth/staff/login?returnTo=%2Fengagements%3Fopen%3D1');
  const response = await handlers.login({ request, env: env(), ctx: {} as ExecutionContext, url: new URL(request.url), params: {}, requestId: 'req', origin: 'https://audit.example' });
  const location = new URL(response.headers.get('Location')!);
  assert.equal(response.status, 302);
  assert.equal(location.origin, 'https://login.microsoftonline.com');
  assert.equal(location.searchParams.get('response_type'), 'code');
  assert.equal(location.searchParams.get('scope'), 'openid profile email');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(location.searchParams.get('state')?.length, 43);
  assert.match(response.headers.get('Set-Cookie') ?? '', /__Host-as_oidc=.*HttpOnly; Secure; SameSite=Lax/);
});

test('callback rejects mismatched state, records a reason code and creates no session', async () => {
  clearOidcCachesForTests();
  const writes: string[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) { return this; },
        async all() { return { results: [{ id: 'workspace-id' }] }; },
        async first() { return null; },
        async run() { writes.push(sql); return { meta: { changes: 1 } }; }
      };
    }
  };
  const injected = deps({ kid: 'unused' });
  const handlers = createStaffOidcHandlers(() => injected);
  const cookie = await signStateCookie({ state: 'expected', nonce: 'nonce', verifier: 'verifier', returnTo: '/', exp: Date.now() + 600_000 }, 'test-secret');
  const request = new Request('https://audit.example/api/auth/staff/callback?code=one-time-code&state=attacker', { headers: { Cookie: `__Host-as_oidc=${cookie}` } });
  const response = await handlers.callback({ request, env: { ...config, DB: db } as unknown as Env, ctx: {} as ExecutionContext, url: new URL(request.url), params: {}, requestId: 'req', origin: 'https://audit.example' });
  assert.equal(response.status, 401);
  assert.equal((await response.json() as { reasonCode: string }).reasonCode, 'STATE_INVALID');
  assert.match(response.headers.get('Set-Cookie') ?? '', /__Host-as_oidc=.*Max-Age=0/);
  assert.equal(writes.filter(sql => sql.includes('INSERT INTO auth_events')).length, 1);
  assert.equal(writes.some(sql => sql.includes('INSERT INTO auth_sessions')), false);
  assert.equal(injected.requests.length, 0);
});

test('callback activates an invited staff account, creates a hashed session, and returns only cookies', async () => {
  clearOidcCachesForTests();
  const fixture = await keyFixture();
  const idToken = await signedToken(fixture.privateKey);
  const injected = deps(fixture.jwk, Date.now, idToken);
  const handlers = createStaffOidcHandlers(() => injected);
  const stateCookie = await signStateCookie({ state: 'expected', nonce: 'nonce-value', verifier: 'verifier', returnTo: '/work', exp: Date.now() + 600_000 }, 'test-secret');
  const request = new Request('https://audit.example/api/auth/staff/callback?code=one-time-code&state=expected', { headers: { Cookie: `__Host-as_oidc=${stateCookie}` } });
  const store = testDb();
  const response = await handlers.callback({ request, env: { ...config, DB: store.db } as unknown as Env, ctx: {} as ExecutionContext, url: new URL(request.url), params: {}, requestId: 'req', origin: 'https://audit.example' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), '/work');
  const cookies = response.headers.get('Set-Cookie') ?? '';
  assert.match(cookies, /__Host-as_session=.*HttpOnly; Secure; SameSite=Lax/);
  assert.match(cookies, /__Host-as_oidc=.*Max-Age=0/);
  assert.equal(cookies.includes(idToken), false);
  const activation = store.calls.find(call => call.sql.includes('UPDATE user_accounts SET status=\'ACTIVE\''));
  assert.ok(activation);
  assert.equal(activation.values[1], 'user-object-id');
  const sessionInsert = store.calls.find(call => call.sql.includes('INSERT INTO auth_sessions'));
  assert.ok(sessionInsert);
  assert.notEqual(sessionInsert.values[3], idToken);
  assert.equal(String(sessionInsert.values[3]).length, 64);
  assert.ok(store.calls.some(call => call.sql.includes('INSERT INTO auth_events') && call.values.includes('LOGIN_SUCCEEDED')));
});

test('me exposes only safe identity fields; profile switching checks grants and logout revokes', async () => {
  const injected = deps({ kid: 'unused' });
  const handlers = createStaffOidcHandlers(() => injected);
  const store = testDb();
  const workerEnv = { ...config, DB: store.db } as unknown as Env;
  const cookie = '__Host-as_session=opaque-session-token';
  const meRequest = new Request('https://audit.example/api/auth/me', { headers: { Cookie: cookie } });
  const me = await handlers.me({ request: meRequest, env: workerEnv, ctx: {} as ExecutionContext, url: new URL(meRequest.url), params: {}, requestId: 'req', origin: 'https://audit.example' });
  const payload = await me.json() as Record<string, unknown>;
  assert.equal(me.status, 200);
  assert.equal(payload.workspaceId, testUser.workspace_id);
  assert.equal(payload.activeProfileId, testProfile.id);
  assert.equal(JSON.stringify(payload).includes('token_sha256'), false);
  assert.equal(JSON.stringify(payload).includes('password_hash'), false);

  const profileRequest = new Request('https://audit.example/api/auth/active-profile', {
    method: 'POST', headers: { Cookie: cookie, Origin: 'https://audit.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ actorProfileId: testProfile.id })
  });
  const switched = await handlers.activeProfile({ request: profileRequest, env: workerEnv, ctx: {} as ExecutionContext, url: new URL(profileRequest.url), params: {}, requestId: 'req', origin: 'https://audit.example' });
  assert.equal(switched.status, 200);
  assert.ok(store.calls.some(call => call.sql.includes('UPDATE auth_sessions SET active_actor_profile_id')));
  assert.ok(store.calls.some(call => call.sql.includes('INSERT INTO auth_events') && call.values.includes('PROFILE_SWITCHED')));

  const logoutRequest = new Request('https://audit.example/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://audit.example' } });
  const logout = await handlers.logout({ request: logoutRequest, env: workerEnv, ctx: {} as ExecutionContext, url: new URL(logoutRequest.url), params: {}, requestId: 'req', origin: 'https://audit.example' });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('Set-Cookie') ?? '', /__Host-as_session=.*Max-Age=0/);
  assert.ok(store.calls.some(call => call.sql.includes("SET revoked_at=?,revoked_reason=?") && call.values.includes('LOGOUT')));
  assert.ok(store.calls.some(call => call.sql.includes('INSERT INTO auth_events') && call.values.includes('LOGOUT')));
});
