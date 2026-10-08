import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index.js';
import { processBusinessOutbox } from '../../worker/businessOutbox.js';
import { createAuthSession } from '../../worker/auth/sessions.js';
import type { Env } from '../../worker/env.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';
import { authSessionCookie } from '../helpers/authSession.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const sent: Array<{ message: Record<string, unknown>; idempotencyKey: string | null }> = [];
const env = {
  DB: db,
  FILES: {},
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
  BUSINESS_SETUP_ENABLED: 'true',
  PUBLIC_APP_URL: 'https://staging.auditsphere.test',
  EMAIL_PROVIDER: { fetch: async (request: Request) => {
    const form = await request.formData();
    sent.push({ message: JSON.parse(String(form.get('message'))) as Record<string, unknown>, idempotencyKey: request.headers.get('Idempotency-Key') });
    return Response.json({ messageId: `admin-email-${sent.length}` });
  } }
} as unknown as Env;
after(() => db.close());

const origin = 'https://staging.auditsphere.test';

async function bootstrap(): Promise<{ workspaceId: string; actorProfileId: string; staffMemberId: string; userAccountId: string }> {
  const response = await worker.fetch(new Request(`${origin}/api/workspaces`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ name: `Auth Admin ${crypto.randomUUID()}`, currency: 'QAR', timezone: 'Asia/Qatar', initialPartner: {
      displayName: 'Admin Partner', naturalPersonKey: `ADMIN-${crypto.randomUUID()}`, email: `${crypto.randomUUID()}@auditsphere.test`
    } })
  }), env, {} as any);
  assert.equal(response.status, 201, await response.clone().text());
  return response.json() as Promise<{ workspaceId: string; actorProfileId: string; staffMemberId: string; userAccountId: string }>;
}

async function command(workspaceId: string, cookie: string, actorId: string, persona: string, type: string, payload: unknown,
  expectedVersions: Array<{ entity: string; id: string; version: number }> = [], idempotencyKey = crypto.randomUUID()): Promise<Response> {
  return worker.fetch(new Request(`${origin}/api/workspaces/${workspaceId}/commands`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ actor: { actorId, persona }, context: {}, expectedVersions, command: { type, payload } })
  }), env, {} as any);
}

it('limits user administration to firm admins and audits invite, grant, revoke, disable and enable lifecycle', async () => {
  const workspace = await bootstrap();
  const adminCookie = await authSessionCookie(db, workspace.workspaceId, workspace.actorProfileId);
  const adminAccount = db.prepare('SELECT version FROM user_accounts WHERE workspace_id=? AND id=?')
    .bind(workspace.workspaceId, workspace.userAccountId).first<{ version: number }>()!;

  const createdStaffResponse = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'staff.create', {
    displayName: 'Invite Acceptance Staff', naturalPersonKey: `INVITEE-${crypto.randomUUID()}`, email: `invitee-${crypto.randomUUID()}@auditsphere.test`, grade: 'ASSOCIATE'
  });
  assert.equal(createdStaffResponse.status, 200, await createdStaffResponse.clone().text());
  const staffMemberId = (await createdStaffResponse.json() as any).result.staffMemberId as string;
  const staff = db.prepare('SELECT email FROM staff_members WHERE workspace_id=? AND id=?').bind(workspace.workspaceId, staffMemberId).first<{ email: string }>()!;
  const assigned = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'actor-profile.assign', {
    persona: 'PREPARER', staffMemberId
  });
  assert.equal(assigned.status, 200, await assigned.clone().text());
  const profileId = (await assigned.json() as any).result.actorProfileId as string;

  const invitePayload = { staffMemberId, email: staff.email };
  const inviteKey = crypto.randomUUID();
  const invited = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.inviteStaff', invitePayload, [], inviteKey);
  assert.equal(invited.status, 200, await invited.clone().text());
  assert.equal((await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.inviteStaff', invitePayload, [], inviteKey)).status, 200,
    'the identical invitation command replays without issuing another invitation');
  const inviteResult = (await invited.json() as any).result as { userAccountId: string; credentialTokenId: string; outboxJobId: string };
  assert.equal(inviteResult.userAccountId, db.prepare('SELECT id FROM user_accounts WHERE workspace_id=? AND staff_member_id=?')
    .bind(workspace.workspaceId, staffMemberId).first<any>()?.id);
  const inviteToken = db.prepare('SELECT expires_at,consumed_at,token_sha256 FROM credential_tokens WHERE workspace_id=? AND id=?')
    .bind(workspace.workspaceId, inviteResult.credentialTokenId).first<any>();
  assert.ok(Date.parse(inviteToken.expires_at) > Date.now() + 6 * 24 * 60 * 60_000);
  assert.equal(inviteToken.consumed_at, null);
  assert.equal(inviteToken.token_sha256.length, 64);

  const versionOne = db.prepare('SELECT version FROM user_accounts WHERE workspace_id=? AND id=?')
    .bind(workspace.workspaceId, inviteResult.userAccountId).first<{ version: number }>()!;
  const grantKey = crypto.randomUUID();
  const grantPayload = { userAccountId: inviteResult.userAccountId, actorProfileId: profileId, expectedVersion: versionOne.version };
  const grantRequest = [{ entity: 'UserAccount', id: inviteResult.userAccountId, version: versionOne.version }];
  const wrongOwnerGrant = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.grantProfile', {
    ...grantPayload, actorProfileId: workspace.actorProfileId
  }, grantRequest);
  assert.equal(wrongOwnerGrant.status, 403);
  assert.equal((await wrongOwnerGrant.json() as any).code, 'PERSONA_ACTION_DENIED');
  const grant = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.grantProfile', grantPayload, grantRequest, grantKey);
  assert.equal(grant.status, 200, await grant.clone().text());
  assert.equal((await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.grantProfile', grantPayload, grantRequest, grantKey)).status, 200,
    'the identical idempotency key replays the grant');
  const duplicateGrant = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.grantProfile', {
    ...grantPayload, expectedVersion: versionOne.version + 1
  }, [{ entity: 'UserAccount', id: inviteResult.userAccountId, version: versionOne.version + 1 }]);
  assert.equal(duplicateGrant.status, 409);
  assert.equal((await duplicateGrant.json() as any).code, 'VERSION_CONFLICT');

  const listed = await worker.fetch(new Request(`${origin}/api/workspaces/${workspace.workspaceId}/users`, { headers: { Cookie: adminCookie } }), env, {} as any);
  assert.equal(listed.status, 200, await listed.clone().text());
  const users = await listed.json() as { items: Array<Record<string, any>> };
  const listedInvitee = users.items.find(item => item.id === inviteResult.userAccountId);
  assert.equal(listedInvitee?.status, 'INVITED');
  assert.equal(listedInvitee?.lastLoginAt, null);
  assert.equal(listedInvitee?.grants.some((item: any) => item.actorProfileId === profileId), true);

  const processed = await processBusinessOutbox(env, 50);
  assert.ok(processed >= 1);
  const invitationMail = sent.find(item => item.message.to === staff.email);
  assert.ok(invitationMail, 'the invite outbox sends through the configured provider');
  assert.match(String(invitationMail?.message.text), /\/api\/auth\/staff\/login/);
  assert.match(String(invitationMail?.message.text), /expires at/);
  assert.equal(invitationMail?.message.purpose, 'STAFF_INVITE');
  assert.equal(db.prepare('SELECT status FROM outbox_jobs WHERE workspace_id=? AND id=?')
    .bind(workspace.workspaceId, inviteResult.outboxJobId).first<any>()?.status, 'SUCCEEDED');

  const inviteeCookie = await authSessionCookie(db, workspace.workspaceId, profileId);
  const nonAdminList = await worker.fetch(new Request(`${origin}/api/workspaces/${workspace.workspaceId}/users`, { headers: { Cookie: inviteeCookie } }), env, {} as any);
  assert.equal(nonAdminList.status, 403);
  assert.equal((await nonAdminList.json() as any).code, 'PERSONA_ACTION_DENIED');
  const nonAdminInvite = await command(workspace.workspaceId, inviteeCookie, profileId, 'PREPARER', 'user.inviteStaff', invitePayload);
  assert.equal(nonAdminInvite.status, 403);
  assert.equal((await nonAdminInvite.json() as any).code, 'PERSONA_ACTION_DENIED');
  assert.ok(db.prepare('SELECT last_login_at FROM user_accounts WHERE workspace_id=? AND id=?')
    .bind(workspace.workspaceId, inviteResult.userAccountId).first<any>());

  const firstGrant = db.prepare(`SELECT id FROM user_profile_grants WHERE workspace_id=? AND user_account_id=? AND actor_profile_id=? AND revoked_at IS NULL`)
    .bind(workspace.workspaceId, inviteResult.userAccountId, profileId).first<{ id: string }>()!;
  const revokeKey = crypto.randomUUID();
  const revokePayload = { grantId: firstGrant.id };
  const revoked = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.revokeProfile', revokePayload, [], revokeKey);
  assert.equal(revoked.status, 200, await revoked.clone().text());
  assert.equal((await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.revokeProfile', revokePayload, [], revokeKey)).status, 200,
    'the identical revoke command replays');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM auth_sessions WHERE workspace_id=? AND user_account_id=?
      AND revoked_reason='GRANT_REVOKED'`).bind(workspace.workspaceId, inviteResult.userAccountId).first<any>()?.count, 1);
  const staleRevoke = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.revokeProfile', revokePayload);
  assert.equal(staleRevoke.status, 404);
  assert.equal((await staleRevoke.json() as any).code, 'NOT_FOUND');
  const afterRevoke = db.prepare('SELECT version FROM user_accounts WHERE workspace_id=? AND id=?')
    .bind(workspace.workspaceId, inviteResult.userAccountId).first<{ version: number }>()!;
  const regrant = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.grantProfile', {
    userAccountId: inviteResult.userAccountId, actorProfileId: profileId, expectedVersion: afterRevoke.version
  }, [{ entity: 'UserAccount', id: inviteResult.userAccountId, version: afterRevoke.version }]);
  assert.equal(regrant.status, 200, await regrant.clone().text());

  db.prepare(`UPDATE user_accounts SET external_issuer='https://login.microsoftonline.com/test/v2.0',external_subject='synthetic-invitee'
    WHERE workspace_id=? AND id=?`).bind(workspace.workspaceId, inviteResult.userAccountId).run();
  assert.equal(db.prepare('SELECT external_subject FROM user_accounts WHERE workspace_id=? AND id=?')
    .bind(workspace.workspaceId, inviteResult.userAccountId).first<any>()?.external_subject, 'synthetic-invitee');
  const firstSession = await createAuthSession(env, { workspaceId: workspace.workspaceId, userAccountId: inviteResult.userAccountId,
    authMethod: 'OIDC_ENTRA', activeActorProfileId: profileId, now: new Date().toISOString() });
  const secondSession = await createAuthSession(env, { workspaceId: workspace.workspaceId, userAccountId: inviteResult.userAccountId,
    authMethod: 'OIDC_ENTRA', activeActorProfileId: profileId, now: new Date().toISOString() });
  const current = db.prepare('SELECT version FROM user_accounts WHERE workspace_id=? AND id=?')
    .bind(workspace.workspaceId, inviteResult.userAccountId).first<{ version: number }>()!;
  const disablePayload = { userAccountId: inviteResult.userAccountId, expectedVersion: current.version, reason: 'Staff access is being removed for testing.' };
  const disableVersions = [{ entity: 'UserAccount', id: inviteResult.userAccountId, version: current.version }];
  const disableKey = crypto.randomUUID();
  const disabled = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.disable', disablePayload, disableVersions, disableKey);
  assert.equal(disabled.status, 200, await disabled.clone().text());
  assert.equal((await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.disable', disablePayload, disableVersions, disableKey)).status, 200);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM auth_sessions WHERE workspace_id=? AND user_account_id=?
      AND revoked_at IS NOT NULL AND revoked_reason='ACCOUNT_DISABLED'`)
    .bind(workspace.workspaceId, inviteResult.userAccountId).first<any>()?.count, 2);
  const staleDisable = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.disable', disablePayload, disableVersions);
  assert.equal(staleDisable.status, 409);
  assert.equal((await staleDisable.json() as any).code, 'VERSION_CONFLICT');

  const disabledAccount = db.prepare('SELECT version FROM user_accounts WHERE workspace_id=? AND id=?')
    .bind(workspace.workspaceId, inviteResult.userAccountId).first<{ version: number }>()!;
  const enablePayload = { userAccountId: inviteResult.userAccountId, expectedVersion: disabledAccount.version, reason: 'Access is restored for acceptance testing.' };
  const enableVersions = [{ entity: 'UserAccount', id: inviteResult.userAccountId, version: disabledAccount.version }];
  const enableKey = crypto.randomUUID();
  const enabled = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.enable', {
    ...enablePayload
  }, enableVersions, enableKey);
  assert.equal(enabled.status, 200, await enabled.clone().text());
  assert.equal((await enabled.json() as any).result.status, 'ACTIVE');
  assert.equal((await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.enable', enablePayload, enableVersions, enableKey)).status, 200,
    'the identical enable command replays');
  const staleEnable = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.enable', {
    userAccountId: inviteResult.userAccountId, expectedVersion: disabledAccount.version, reason: 'This stale enable must be rejected.'
  }, [{ entity: 'UserAccount', id: inviteResult.userAccountId, version: disabledAccount.version }]);
  assert.equal(staleEnable.status, 409);
  assert.equal((await staleEnable.json() as any).code, 'VERSION_CONFLICT');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM auth_events WHERE workspace_id=? AND user_account_id=? AND event='ACCOUNT_ENABLED'`)
    .bind(workspace.workspaceId, inviteResult.userAccountId).first<any>()?.count, 1);

  const ownGrant = db.prepare(`SELECT id FROM user_profile_grants WHERE workspace_id=? AND user_account_id=? AND actor_profile_id=? AND revoked_at IS NULL`)
    .bind(workspace.workspaceId, workspace.userAccountId, workspace.actorProfileId).first<{ id: string }>()!;
  const selfRevoke = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.revokeProfile', { grantId: ownGrant.id });
  assert.equal(selfRevoke.status, 409);
  assert.equal((await selfRevoke.json() as any).code, 'GATE_BLOCKED');
  const selfDisable = await command(workspace.workspaceId, adminCookie, workspace.actorProfileId, 'APPROVER', 'user.disable', {
    userAccountId: workspace.userAccountId, expectedVersion: adminAccount.version, reason: 'This must be rejected because it is self-disable.'
  }, [{ entity: 'UserAccount', id: workspace.userAccountId, version: adminAccount.version }]);
  assert.equal(selfDisable.status, 409);
  assert.equal((await selfDisable.json() as any).code, 'GATE_BLOCKED');
  assert.equal(firstSession.row.user_account_id, inviteResult.userAccountId);
  assert.equal(secondSession.row.user_account_id, inviteResult.userAccountId);
});
