import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { routeInventory } from '../../worker/index.js';
import { hashPassword, verifyPassword } from '../../worker/auth/passwords.js';
import { createAuthSession } from '../../worker/auth/sessions.js';
import { tokenHash } from '../../worker/auth/tokens.js';
import { processBusinessOutbox } from '../../worker/businessOutbox.js';
import type { Env } from '../../worker/env.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';
import { authSessionCookie, bootstrapBusinessFixture } from '../helpers/authSession.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const sentMessages: Array<{ to: string; subject: string; text: string; purpose: string }> = [];
const limiterKeys: string[] = [];
let rejectRateLimit = false;
const env = {
  DB: db,
  FILES: { put: async () => { throw new Error('Not used by this test.'); } },
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
  PUBLIC_APP_URL: 'https://audit.example',
  RATE_LIMITER: { limit: async ({ key }: { key: string }) => { limiterKeys.push(key); return { success: !rejectRateLimit }; } },
  EMAIL_PROVIDER: { fetch: async (request: Request) => {
    const form = await request.formData();
    const message = JSON.parse(String(form.get('message'))) as { to: string; subject: string; text: string; purpose: string };
    sentMessages.push(message);
    return Response.json({ messageId: `email-${sentMessages.length}` });
  } }
} as unknown as Env;
after(() => db.close());

const origin = 'https://client-auth.auditsphere.test';
async function call(path: string, options: { method?: string; cookie?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
  const headers = new Headers({ Origin: origin, ...options.headers });
  if (options.cookie) headers.set('Cookie', options.cookie);
  const workspaceId = path.match(/^\/api\/workspaces\/([^/?]+)/)?.[1];
  const testProfileId = headers.get('X-Test-Session-Profile') ?? undefined;
  headers.delete('X-Test-Session-Profile');
  if (workspaceId && !headers.has('Cookie')) headers.set('Cookie', await authSessionCookie(db, workspaceId, testProfileId));
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  return worker.fetch(new Request(`${origin}${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'), headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  }), env, {} as ExecutionContext);
}

async function command(workspaceId: string, cookie: string, actorId: string, persona: string,
  type: string, payload: unknown, expectedVersions: Array<{ entity: string; id: string; version: number }> = []): Promise<Response> {
  return call(`/api/workspaces/${workspaceId}/commands`, {
    method: 'POST', cookie,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: { context: {}, expectedVersions, command: { type, payload } }
  });
}

it('enforces client login, forced password change, lockout, reset, rate limits, and firm-admin unlock', async () => {
  const workspace = await bootstrapBusinessFixture(db, {
    name: 'Client Auth Acceptance', currency: 'QAR', timezone: 'Asia/Qatar',
    initialPartner: { displayName: 'Auth Partner', naturalPersonKey: `AUTH-PARTNER-${crypto.randomUUID()}`, email: 'auth.partner@example.invalid' }
  });
  const partnerCookie = await authSessionCookie(db, workspace.workspaceId, workspace.actorProfileId);

  const associate = await command(workspace.workspaceId, partnerCookie, workspace.actorProfileId, 'APPROVER', 'staff.create', {
    displayName: 'Auth Test Preparer', naturalPersonKey: `AUTH-PREPARER-${crypto.randomUUID()}`,
    email: 'auth.preparer@example.invalid', grade: 'ASSOCIATE'
  });
  assert.equal(associate.status, 200, await associate.clone().text());
  const staffMemberId = (await associate.json() as any).result.staffMemberId as string;
  const assignment = await command(workspace.workspaceId, partnerCookie, workspace.actorProfileId, 'APPROVER', 'actor-profile.assign', {
    persona: 'PREPARER', staffMemberId
  });
  assert.equal(assignment.status, 200, await assignment.clone().text());
  const preparerProfileId = (await assignment.json() as any).result.actorProfileId as string;
  const preparerCookie = await authSessionCookie(db, workspace.workspaceId, preparerProfileId);
  const createdClient = await command(workspace.workspaceId, preparerCookie, preparerProfileId, 'PREPARER', 'client.create', {
    code: 'AUTH-CLIENT', legalName: 'Auth Acceptance Trading WLL', entityType: 'STANDALONE', industry: 'Trading',
    address: 'Doha, Qatar', countryCode: 'QA',
    primaryContact: { fullName: 'Auth Client Contact', email: 'auth.client@example.invalid', title: 'Chief Financial Officer',
      role: 'CFO_FINANCE_DIRECTOR', effectiveFrom: '2026-01-01' }
  });
  assert.equal(createdClient.status, 200, await createdClient.clone().text());
  const clientResult = (await createdClient.json() as any).result as { clientId: string; primaryContactId: string };
  const clientProfile = await command(workspace.workspaceId, partnerCookie, workspace.actorProfileId, 'APPROVER', 'actor-profile.assign', {
    persona: 'CLIENT', contactId: clientResult.primaryContactId
  });
  assert.equal(clientProfile.status, 200, await clientProfile.clone().text());
  const clientProfileId = (await clientProfile.json() as any).result.actorProfileId as string;
  await authSessionCookie(db, workspace.workspaceId, clientProfileId);
  const account = db.prepare(`SELECT id,email_normalized FROM user_accounts WHERE workspace_id=? AND contact_id=? AND kind='CLIENT'`)
    .bind(workspace.workspaceId, clientResult.primaryContactId).first<{ id: string; email_normalized: string }>()!;
  const initialPassword = 'Temporary-Portal-Password-2026!';
  const initialHash = await hashPassword(initialPassword);
  db.prepare(`UPDATE user_accounts SET password_hash=?,status='ACTIVE',password_must_change=0,version=version+1 WHERE workspace_id=? AND id=?`)
    .bind(initialHash, workspace.workspaceId, account.id).run();

  const login = (email: string, password: string) => call('/api/auth/client/login', { method: 'POST', body: { email, password } });
  const validLogin = await login(account.email_normalized, initialPassword);
  assert.equal(validLogin.status, 200, await validLogin.clone().text());
  assert.match(validLogin.headers.get('Set-Cookie') ?? '', /__Host-as_session=.*HttpOnly; Secure; SameSite=Lax/);
  const clientCookie = `__Host-as_session=${validLogin.headers.get('Set-Cookie')!.match(/^__Host-as_session=([^;]+)/)![1]}`;
  assert.equal((await call('/api/auth/me', { cookie: clientCookie })).status, 200);
  const wrong = await login(account.email_normalized, 'not-the-password');
  const unknown = await login('unknown@example.invalid', 'not-the-password');
  const staffEmail = db.prepare(`SELECT email_normalized FROM user_accounts WHERE workspace_id=? AND staff_member_id=(
      SELECT staff_member_id FROM actor_profiles WHERE workspace_id=? AND id=?)`)
    .bind(workspace.workspaceId, workspace.workspaceId, workspace.actorProfileId).first<{ email_normalized: string }>()!.email_normalized;
  const staffLogin = await login(staffEmail, 'not-the-password');
  assert.equal(wrong.status, 401);
  const genericBody = await wrong.json();
  assert.deepEqual(genericBody, await unknown.json());
  assert.deepEqual(genericBody, await staffLogin.json());

  rejectRateLimit = true;
  const limitedLogin = await login(account.email_normalized, initialPassword);
  const limitedReset = await call('/api/auth/password-reset/request', { method: 'POST', body: { email: account.email_normalized } });
  const limitedResetConfirm = await call('/api/auth/password-reset/confirm', { method: 'POST', body: {
    token: 'x'.repeat(43), newPassword: 'Rate-Limited-Reset-Password-2026!'
  } });
  assert.equal(limitedLogin.status, 429);
  assert.equal(limitedReset.status, 429);
  assert.equal(limitedResetConfirm.status, 429);
  assert.ok(limiterKeys.every(key => !key.includes(account.email_normalized) && !key.includes('127.0.0.1')));
  rejectRateLimit = false;

  const expiredToken = await tokenHash('synthetic expired temporary password token');
  db.prepare(`INSERT INTO credential_tokens(id,workspace_id,user_account_id,purpose,token_sha256,expires_at,created_at)
    VALUES(?,?,?,'CLIENT_TEMP_PASSWORD',?,?,?)`).bind(crypto.randomUUID(), workspace.workspaceId, account.id, expiredToken,
    new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() - 120_000).toISOString()).run();
  db.prepare(`UPDATE user_accounts SET password_must_change=1,version=version+1 WHERE workspace_id=? AND id=?`)
    .bind(workspace.workspaceId, account.id).run();
  const expiredWrong = await login(account.email_normalized, 'wrong-temporary-secret');
  assert.deepEqual(await expiredWrong.json(), genericBody);
  const expiredCorrect = await login(account.email_normalized, initialPassword);
  assert.equal(expiredCorrect.status, 401);
  assert.equal((await expiredCorrect.json() as any).code, 'TEMP_PASSWORD_EXPIRED');

  const currentPassword = 'Client-Temporary-Password-2026!';
  const currentHash = await hashPassword(currentPassword);
  db.prepare(`UPDATE user_accounts SET password_hash=?,password_must_change=1,status='ACTIVE',failed_login_count=0,locked_until=NULL,
      version=version+1 WHERE workspace_id=? AND id=?`).bind(currentHash, workspace.workspaceId, account.id).run();
  db.prepare(`INSERT INTO credential_tokens(id,workspace_id,user_account_id,purpose,token_sha256,expires_at,created_at)
    VALUES(?,?,?,'CLIENT_TEMP_PASSWORD',?,?,?)`).bind(crypto.randomUUID(), workspace.workspaceId, account.id,
    await tokenHash('synthetic current temporary password token'), new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(), new Date().toISOString()).run();
  const forcedLogin = await login(account.email_normalized, currentPassword);
  assert.equal(forcedLogin.status, 200, await forcedLogin.clone().text());
  const forcedCookie = `__Host-as_session=${forcedLogin.headers.get('Set-Cookie')!.match(/^__Host-as_session=([^;]+)/)![1]}`;
  assert.equal((await (await call('/api/auth/me', { cookie: forcedCookie })).json() as any).passwordMustChange, true);

  const engagementId = await createFrozenEngagement(workspace.workspaceId, preparerCookie, preparerProfileId, clientResult.clientId, clientResult.primaryContactId, partnerCookie, workspace.actorProfileId, command);
  db.prepare(`UPDATE engagements SET portal_frozen_at=? WHERE workspace_id=? AND id=?`).bind(new Date().toISOString(), workspace.workspaceId, engagementId).run();
  const frozenPortalBeforeChange = await call(`/api/workspaces/${workspace.workspaceId}/engagements/${engagementId}/portal`, { cookie: forcedCookie });
  assert.equal(frozenPortalBeforeChange.status, 403);
  assert.equal((await frozenPortalBeforeChange.json() as any).code, 'PASSWORD_CHANGE_REQUIRED', 'must-change gate takes precedence over the frozen portal route');
  for (const route of routeInventory.filter(item => item.pattern.startsWith('/api/workspaces/:workspaceId'))) {
    const path = route.pattern.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_full, name: string) => name === 'workspaceId' ? workspace.workspaceId : `00000000-0000-4000-8000-${name.padEnd(12, '0').slice(0, 12)}`);
    const response = await call(path, { method: route.method, cookie: forcedCookie });
    assert.equal(response.status, 403, `Forced change must gate ${route.method} ${route.pattern}`);
    assert.equal((await response.json() as any).code, 'PASSWORD_CHANGE_REQUIRED');
  }
  const pbcSubmit = await command(workspace.workspaceId, forcedCookie, clientProfileId, 'CLIENT', 'pbc.submit', {
    requestId: crypto.randomUUID(), expectedRequestVersion: 1, fileId: crypto.randomUUID(), fileVersion: 1
  });
  assert.equal(pbcSubmit.status, 403);
  assert.equal((await pbcSubmit.json() as any).code, 'PASSWORD_CHANGE_REQUIRED');

  const secondSession = await createAuthSession(env, { workspaceId: workspace.workspaceId, userAccountId: account.id,
    authMethod: 'PASSWORD', activeActorProfileId: clientProfileId, now: new Date().toISOString() });
  const change = await call('/api/auth/password', { method: 'POST', cookie: forcedCookie,
    body: { currentPassword, newPassword: 'A-Strong-New-Password-2026!' } });
  assert.equal(change.status, 204, await change.clone().text());
  assert.equal((await call('/api/auth/me', { cookie: forcedCookie })).status, 200, 'the current session remains usable after password change');
  const revokedOtherSession = await call('/api/auth/me', { cookie: `__Host-as_session=${secondSession.token}` });
  assert.equal(revokedOtherSession.status, 401, 'other sessions are revoked after password change');
  const frozenPortalAfterChange = await call(`/api/workspaces/${workspace.workspaceId}/engagements/${engagementId}/portal`, { cookie: forcedCookie });
  assert.equal(frozenPortalAfterChange.status, 200, await frozenPortalAfterChange.clone().text());
  assert.equal((await frozenPortalAfterChange.json() as any).mode, 'FROZEN');

  const firstUnknownReset = await call('/api/auth/password-reset/request', { method: 'POST', body: { email: 'absent@example.invalid' } });
  const secondUnknownReset = await call('/api/auth/password-reset/request', { method: 'POST', body: { email: 'absent@example.invalid' } });
  assert.equal(firstUnknownReset.status, 202);
  assert.equal(secondUnknownReset.status, 202);
  assert.deepEqual(await firstUnknownReset.clone().text(), await secondUnknownReset.clone().text());
  for (let index = 0; index < 4; index += 1) {
    const requested = await call('/api/auth/password-reset/request', { method: 'POST', body: { email: account.email_normalized } });
    assert.equal(requested.status, 202);
  }
  const allEmailJobs = db.prepare(`SELECT id,payload_json,aggregate_id FROM outbox_jobs WHERE workspace_id=? AND kind='EMAIL' ORDER BY created_at,id`)
    .bind(workspace.workspaceId).all<any>().results;
  const resetJobs = allEmailJobs.filter(job => JSON.parse(job.payload_json).documentType === 'PASSWORD_RESET');
  assert.equal(resetJobs.length, 3, `only three reset jobs per account are queued in an hour; queued EMAIL jobs: ${JSON.stringify(allEmailJobs)}`);
  assert.ok(resetJobs.every(job => {
    const payload = JSON.parse(job.payload_json) as Record<string, unknown>;
    return Object.keys(payload).sort().join(',') === 'documentType,userAccountId'
      && payload.documentType === 'PASSWORD_RESET' && payload.userAccountId === account.id;
  }));
  const processedResetJobs = await processBusinessOutbox(env, 4);
  const resetJobOutcomes = db.prepare(`SELECT status,last_error_code,result_json FROM outbox_jobs WHERE workspace_id=? AND id IN (${resetJobs.map(() => '?').join(',')})`)
    .bind(workspace.workspaceId, ...resetJobs.map(job => job.id)).all<any>().results;
  const sentResetMessages = sentMessages.filter(message => message.purpose === 'PASSWORD_RESET' && message.to === account.email_normalized);
  assert.equal(sentResetMessages.length, 3, `reset dispatch processed=${processedResetJobs}; outcomes=${JSON.stringify(resetJobOutcomes)}`);
  const resetLink = sentResetMessages.at(-1)!.text.match(/https:\/\/audit\.example\/reset\?token=([^\s]+)/);
  assert.ok(resetLink, 'the recipient email includes the one-time reset link');
  const bearerToken = decodeURIComponent(resetLink[1]);
  const resetTokenHash = await tokenHash(bearerToken);
  assert.equal(db.prepare(`SELECT 1 AS found FROM credential_tokens WHERE workspace_id=? AND user_account_id=? AND purpose='PASSWORD_RESET'
      AND token_sha256=? AND consumed_at IS NULL AND expires_at>?`)
    .bind(workspace.workspaceId, account.id, resetTokenHash, new Date().toISOString()).first<any>()?.found, 1);
  const savedJobPayloads = resetJobs.map(job => job.payload_json).join('\n');
  assert.equal(savedJobPayloads.includes(bearerToken), false);
  const resetEventDetails = db.prepare(`SELECT detail_json FROM auth_events WHERE workspace_id=? AND user_account_id=? AND event='PASSWORD_RESET_REQUESTED'`)
    .bind(workspace.workspaceId, account.id).all<any>().results.map(row => row.detail_json).join('\n');
  assert.equal(resetEventDetails.includes(bearerToken), false);
  const expiredResetToken = 'expired-reset-token-value-2026-'.padEnd(48, 'x');
  db.prepare(`INSERT INTO credential_tokens(id,workspace_id,user_account_id,purpose,token_sha256,expires_at,created_at)
    VALUES(?,?,?,'PASSWORD_RESET',?,?,?)`)
    .bind(crypto.randomUUID(), workspace.workspaceId, account.id, await tokenHash(expiredResetToken),
      new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() - 90_000).toISOString()).run();
  const expiredReset = await call('/api/auth/password-reset/confirm', { method: 'POST', body: {
    token: expiredResetToken, newPassword: 'Expired-Reset-Password-2026!'
  } });
  assert.equal(expiredReset.status, 400);
  assert.equal((await expiredReset.json() as any).code, 'INVALID_TOKEN');

  const resetOtherSession = await createAuthSession(env, { workspaceId: workspace.workspaceId, userAccountId: account.id,
    authMethod: 'PASSWORD', activeActorProfileId: clientProfileId, now: new Date().toISOString() });
  const resetResult = await call('/api/auth/password-reset/confirm', { method: 'POST', body: {
    token: bearerToken, newPassword: 'Password-Reset-New-2026!'
  } });
  assert.equal(resetResult.status, 204, await resetResult.clone().text());
  const resetAccount = db.prepare(`SELECT status,password_must_change,failed_login_count,locked_until,password_hash FROM user_accounts WHERE workspace_id=? AND id=?`)
    .bind(workspace.workspaceId, account.id).first<any>()!;
  assert.equal(resetAccount.status, 'ACTIVE');
  assert.equal(resetAccount.password_must_change, 0);
  assert.equal(resetAccount.failed_login_count, 0);
  assert.equal(resetAccount.locked_until, null);
  assert.equal(await verifyPassword('Password-Reset-New-2026!', resetAccount.password_hash), true);
  assert.equal((await call('/api/auth/me', { cookie: forcedCookie })).status, 401);
  assert.equal((await call('/api/auth/me', { cookie: `__Host-as_session=${resetOtherSession.token}` })).status, 401);
  const reusedReset = await call('/api/auth/password-reset/confirm', { method: 'POST', body: { token: bearerToken, newPassword: 'Another-Password-2026!' } });
  assert.equal(reusedReset.status, 400);
  assert.equal((await reusedReset.json() as any).code, 'INVALID_TOKEN');
  const invalidReset = await call('/api/auth/password-reset/confirm', { method: 'POST', body: { token: 'invalid'.repeat(8), newPassword: 'Another-Password-2026!' } });
  assert.equal(invalidReset.status, 400);
  assert.equal((await invalidReset.json() as any).code, 'INVALID_TOKEN');

  // Password-hash parsing has already been exercised above; malformed stored test
  // data keeps the retry-count assertions fast while still exercising lockout SQL.
  db.prepare(`UPDATE user_accounts SET password_hash='malformed-synthetic-hash' WHERE workspace_id=? AND id=?`)
    .bind(workspace.workspaceId, account.id).run();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failed = await login(account.email_normalized, 'wrong-lockout-password');
    if (attempt < 4) assert.equal(failed.status, 401);
    else {
      assert.equal(failed.status, 423);
      assert.ok((await failed.json() as any).details.retryAfterSeconds >= 895);
    }
  }
  let locked = db.prepare(`SELECT status,failed_login_count,locked_until,version FROM user_accounts WHERE workspace_id=? AND id=?`)
    .bind(workspace.workspaceId, account.id).first<any>()!;
  assert.equal(locked.status, 'LOCKED');
  db.prepare(`UPDATE user_accounts SET locked_until=? WHERE workspace_id=? AND id=?`).bind(new Date(Date.now() - 1000).toISOString(), workspace.workspaceId, account.id).run();
  const secondLock = await login(account.email_normalized, 'wrong-lockout-password');
  assert.equal(secondLock.status, 423);
  assert.ok((await secondLock.json() as any).details.retryAfterSeconds >= 1790, 'lock duration doubles after expiry');
  locked = db.prepare(`SELECT status,failed_login_count,locked_until,version FROM user_accounts WHERE workspace_id=? AND id=?`)
    .bind(workspace.workspaceId, account.id).first<any>()!;
  for (let escalation = 2; escalation <= 10; escalation += 1) {
    db.prepare(`UPDATE user_accounts SET locked_until=? WHERE workspace_id=? AND id=?`)
      .bind(new Date(Date.now() - 1000).toISOString(), workspace.workspaceId, account.id).run();
    const escalatedLock = await login(account.email_normalized, 'wrong-lockout-password');
    assert.equal(escalatedLock.status, 423, `lock escalation ${escalation} remains locked`);
    const retryAfterSeconds = (await escalatedLock.json() as any).details.retryAfterSeconds as number;
    const expectedSeconds = Math.min(24 * 60 * 60, 15 * 60 * (2 ** escalation));
    assert.ok(Math.abs(retryAfterSeconds - expectedSeconds) <= 5,
      `lock escalation ${escalation} expected ${expectedSeconds}s, got ${retryAfterSeconds}s`);
  }
  locked = db.prepare(`SELECT status,failed_login_count,locked_until,version FROM user_accounts WHERE workspace_id=? AND id=?`)
    .bind(workspace.workspaceId, account.id).first<any>()!;

  const preparerUnlock = await command(workspace.workspaceId, preparerCookie, preparerProfileId, 'PREPARER', 'user.unlock', {
    userAccountId: account.id, expectedVersion: locked.version
  });
  assert.equal(preparerUnlock.status, 403, `non-admin unlock is denied: ${await preparerUnlock.clone().text()}`);
  db.prepare(`UPDATE user_accounts SET is_firm_admin=1 WHERE workspace_id=? AND staff_member_id=(
      SELECT staff_member_id FROM actor_profiles WHERE workspace_id=? AND id=?)`)
    .bind(workspace.workspaceId, workspace.workspaceId, workspace.actorProfileId).run();
  locked = db.prepare(`SELECT status,failed_login_count,locked_until,version FROM user_accounts WHERE workspace_id=? AND id=?`)
    .bind(workspace.workspaceId, account.id).first<any>()!;
  const unlocked = await command(workspace.workspaceId, partnerCookie, workspace.actorProfileId, 'APPROVER', 'user.unlock', {
    userAccountId: account.id, expectedVersion: locked.version
  });
  assert.equal(unlocked.status, 200, await unlocked.clone().text());
  const unlockedAccount = db.prepare(`SELECT status,failed_login_count,locked_until FROM user_accounts WHERE workspace_id=? AND id=?`)
    .bind(workspace.workspaceId, account.id).first<any>()!;
  assert.equal(unlockedAccount.status, 'ACTIVE');
  assert.equal(unlockedAccount.failed_login_count, 0);
  assert.equal(unlockedAccount.locked_until, null);
  assert.equal(db.prepare(`SELECT 1 AS found FROM auth_events WHERE workspace_id=? AND user_account_id=? AND event='UNLOCKED'`)
    .bind(workspace.workspaceId, account.id).first<any>()?.found, 1);
  db.prepare(`UPDATE user_accounts SET password_hash=? WHERE workspace_id=? AND id=?`)
    .bind(resetAccount.password_hash, workspace.workspaceId, account.id).run();
  const successAfterUnlock = await login(account.email_normalized, 'Password-Reset-New-2026!');
  assert.equal(successAfterUnlock.status, 200);
  assert.equal(db.prepare(`SELECT failed_login_count FROM user_accounts WHERE workspace_id=? AND id=?`)
    .bind(workspace.workspaceId, account.id).first<any>()?.failed_login_count, 0);
});

async function createFrozenEngagement(
  workspaceId: string, preparerCookie: string, preparerId: string, clientId: string, contactId: string,
  partnerCookie: string, partnerId: string,
  runCommand: typeof command
): Promise<string> {
  const profile = await runCommand(workspaceId, partnerCookie, partnerId, 'APPROVER', 'standards-profile.create', {
    name: 'Auth Acceptance Standards', effectivePeriodStart: '2025-01-01', isa220Edition: '2025', isa570Edition: '2025',
    reportingFramework: 'IFRS', presentationEdition: 'IAS1', earlyAdoption: false
  });
  assert.equal(profile.status, 200, await profile.clone().text());
  const standardsProfileId = (await profile.json() as any).result.standardsProfileId as string;
  const lead = await runCommand(workspaceId, preparerCookie, preparerId, 'PREPARER', 'lead.create', {
    clientId, primaryContactId: contactId, source: 'REFERRAL', receivedAt: new Date().toISOString(),
    requestedService: 'STATUTORY_AUDIT', periodStart: '2025-01-01', periodEnd: '2025-12-31', estimatedFeeMinor: '100000'
  });
  assert.equal(lead.status, 200, await lead.clone().text());
  const leadId = (await lead.json() as any).result.leadId as string;
  const converted = await runCommand(workspaceId, preparerCookie, preparerId, 'PREPARER', 'lead.convert', {
    leadId, expectedVersion: 1, engagementCode: 'AUTH-ENGAGEMENT', standardsProfileId, contractFeeMinor: '100000'
  }, [{ entity: 'Lead', id: leadId, version: 1 }]);
  assert.equal(converted.status, 200, await converted.clone().text());
  return (await converted.json() as any).result.engagementId as string;
}
