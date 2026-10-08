import assert from 'node:assert/strict';
import { it } from 'node:test';
import { clearedSessionCookie, sessionCookie } from '../../worker/auth/cookies';
import { authEventStatement } from '../../worker/auth/events';
import { checkPasswordPolicy, generateTemporaryPassword, hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from '../../worker/auth/passwords';
import { createAuthSession, revokeAllForUser, revokeSession, SessionError, touchSession, validateAuthSession } from '../../worker/auth/sessions';
import { newOpaqueToken, tokenHash } from '../../worker/auth/tokens';
import type { Env } from '../../worker/env';

it('creates opaque high-entropy tokens and hashes them as SHA-256 hex', async () => {
  const token = newOpaqueToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await tokenHash(token), 'a'.repeat(0) + await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)).then(value => [...new Uint8Array(value)].map(n => n.toString(16).padStart(2, '0')).join('')));
  assert.notEqual(newOpaqueToken(), token);
});

it('serializes Argon2id parameters and verifies passwords without accepting malformed hashes', async () => {
  const encoded = await hashPassword('Correct horse battery staple!');
  assert.match(encoded, /^argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal(await verifyPassword('Correct horse battery staple!', encoded), true);
  assert.equal(await verifyPassword('incorrect password', encoded), false);
  assert.equal(await verifyPassword('pw', 'malformed'), false);
  assert.equal(await verifyAgainstDummy('unknown user password'), false);
  assert.equal(needsRehash(encoded), false);
  assert.equal(needsRehash('malformed'), true);
});

it('generates unique temporary passwords accepted by the policy', async () => {
  const generated = new Set<string>();
  for (let i = 0; i < 10_000; i += 1) {
    const password = generateTemporaryPassword();
    assert.ok(password.length >= 16);
    assert.equal((await checkPasswordPolicy(password, { email: 'client@example.test' })).valid, true);
    generated.add(password);
  }
  assert.equal(generated.size, 10_000);
});

it('enforces length, email local-part, and known breached-password rules', async () => {
  assert.deepEqual(await checkPasswordPolicy('!!', { email: 'client@example.test' }), { valid: false, reason: 'LENGTH' });
  assert.deepEqual(await checkPasswordPolicy('client-private-pass', { email: 'client@example.test' }), { valid: false, reason: 'EMAIL' });
  assert.deepEqual(await checkPasswordPolicy('password', { email: 'other@example.test' }), { valid: false, reason: 'BREACHED' });
  assert.deepEqual(await checkPasswordPolicy('Correct horse 123!', { email: 'other@example.test' }), { valid: true });
});

it('produces the required host-only secure session cookies', () => {
  assert.equal(sessionCookie('abc', 3600), '__Host-as_session=abc; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax');
  assert.equal(clearedSessionCookie(), '__Host-as_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax');
});

function sessionEnv(options: { row?: Record<string, unknown> | null; grant?: boolean } = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const env = { DB: { prepare(sql: string) {
    const statement = { values: [] as unknown[], bind(...values: unknown[]) { this.values = values; return this; },
      async first() {
        calls.push({ sql, values: this.values });
        if (sql.includes('FROM auth_sessions')) return options.row === undefined ? null : options.row;
        if (sql.includes('FROM user_profile_grants')) return options.grant === false ? null : { ok: 1 };
        return null;
      }, async run() { calls.push({ sql, values: this.values }); return { success: true }; } };
    return statement;
  } } } as unknown as Env;
  return { env, calls };
}

const validSessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-1', workspace_id: 'workspace-1', user_account_id: 'user-1', token_sha256: 'a'.repeat(64),
  active_actor_profile_id: 'profile-1', auth_method: 'PASSWORD', created_at: '2026-10-08T12:00:00.000Z',
  last_seen_at: '2026-10-08T12:00:00.000Z', idle_expires_at: '2026-10-08T12:30:00.000Z',
  absolute_expires_at: '2026-10-09T00:00:00.000Z', revoked_at: null, revoked_reason: null,
  email_normalized: 'client@example.test', display_name: 'Client', kind: 'CLIENT', account_status: 'ACTIVE', ...overrides
});

it('creates, validates, touches, and revokes server-side sessions', async () => {
  const create = sessionEnv();
  const result = await createAuthSession(create.env, { workspaceId: 'workspace-1', userAccountId: 'user-1', authMethod: 'OIDC_ENTRA', now: '2026-10-08T12:00:00.000Z' });
  assert.match(result.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(result.row.idle_expires_at, '2026-10-08T12:30:00.000Z');
  assert.match(create.calls[0].sql, /INSERT INTO auth_sessions/);

  const valid = sessionEnv({ row: validSessionRow() });
  const context = await validateAuthSession(valid.env, 'session-token', '2026-10-08T12:01:00.000Z');
  assert.equal(context.email_normalized, 'client@example.test');
  assert.ok(valid.calls.some(call => call.sql.includes('user_profile_grants')));
  await touchSession(valid.env, validSessionRow() as any, '2026-10-08T12:00:30.000Z');
  assert.equal(valid.calls.length, 2, 'touch is rate limited to one database write per minute');
  await touchSession(valid.env, validSessionRow() as any, '2026-10-08T12:02:00.000Z');
  assert.match(valid.calls[2].sql, /UPDATE auth_sessions SET last_seen_at/);
  await revokeSession(valid.env, 'session-1', 'LOGOUT', '2026-10-08T12:03:00.000Z');
  await revokeAllForUser(valid.env, 'user-1', 'PASSWORD_CHANGED', '2026-10-08T12:03:00.000Z');
  assert.equal(valid.calls.length, 5);
  const clientSession = await createAuthSession(create.env, { workspaceId: 'workspace-1', userAccountId: 'user-1', authMethod: 'PASSWORD', now: '2026-10-08T12:00:00.000Z' });
  assert.equal(clientSession.row.idle_expires_at, '2026-10-08T12:15:00.000Z');
});

it('reports distinct session failure reasons, including revoked profile grants', async () => {
  const now = '2026-10-08T12:10:00.000Z';
  const cases: Array<[Record<string, unknown> | null, boolean | undefined, string, string]> = [
    [null, undefined, '2026-10-08T12:11:00.000Z', 'UNKNOWN'],
    [validSessionRow({ revoked_at: now }), undefined, '2026-10-08T12:11:00.000Z', 'REVOKED'],
    [validSessionRow({ idle_expires_at: now }), undefined, '2026-10-08T12:11:00.000Z', 'IDLE_EXPIRED'],
    [validSessionRow({ absolute_expires_at: now }), undefined, '2026-10-08T12:11:00.000Z', 'ABSOLUTE_EXPIRED'],
    [validSessionRow({ account_status: 'LOCKED' }), undefined, '2026-10-08T12:11:00.000Z', 'USER_LOCKED'],
    [validSessionRow({ account_status: 'DISABLED' }), undefined, '2026-10-08T12:11:00.000Z', 'USER_DISABLED'],
    [validSessionRow({ account_status: 'INVITED' }), undefined, '2026-10-08T12:11:00.000Z', 'USER_NOT_ACTIVE'],
    [validSessionRow(), false, '2026-10-08T12:11:00.000Z', 'GRANT_REVOKED']
  ];
  for (const [row, grant, at, reason] of cases) {
    const { env } = sessionEnv({ row, grant });
    await assert.rejects(validateAuthSession(env, 'token', at), error => error instanceof SessionError && error.reason === reason && error.code === (reason.includes('EXPIRED') ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED') && error.status === 401);
  }
});

it('creates a parameterized authentication event statement without logging sensitive material', () => {
  let bound: unknown[] = [];
  const env = { DB: { prepare(sql: string) {
    assert.match(sql, /INSERT INTO auth_events/);
    return { bind(...values: unknown[]) { bound = values; return {} as D1PreparedStatement; } };
  } } } as unknown as Env;
  const statement = authEventStatement(env, { id: 'event-1', workspaceId: 'workspace-1', event: 'LOGIN_FAILED', detail: { reason: 'bad_credentials' }, now: '2026-10-08T12:00:00.000Z' });
  assert.ok(statement);
  assert.deepEqual(bound, ['event-1', 'workspace-1', null, 'LOGIN_FAILED', '{"reason":"bad_credentials"}', null, '2026-10-08T12:00:00.000Z']);
});
