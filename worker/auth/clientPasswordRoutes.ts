import { z } from 'zod';
import type { Handler, RouteContext } from '../router';
import type { Env } from '../env';
import { ApiError } from '../errors';
import { assertSameOrigin, jsonResponse, parseCookies, readJson, sha256Hex } from '../http';
import { authEventStatement } from './events';
import { hashPassword, verifyPassword, verifyAgainstDummy, checkPasswordPolicy } from './passwords';
import { createAuthSession, SessionError, validateAuthSession } from './sessions';
import { meBody, profilesFor, type UserRow } from './oidcRoutes';
import { sessionCookie } from './cookies';
import { tokenHash } from './tokens';

const loginBodySchema = z.strictObject({
  email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
  password: z.string().min(1).max(256)
});
const passwordChangeSchema = z.strictObject({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256) });
const resetRequestSchema = z.strictObject({ email: z.string().trim().email().max(320).transform(value => value.toLowerCase()) });
const resetConfirmSchema = z.strictObject({ token: z.string().min(43).max(256), newPassword: z.string().min(12).max(256) });

type ClientAccount = UserRow & {
  version: number;
  password_hash: string | null;
  failed_login_count: number;
  locked_until: string | null;
};
const genericLoginFailure = (ctx: RouteContext): Response =>
  jsonResponse({ code: 'UNAUTHENTICATED', message: 'Email or password is incorrect.' }, 401, ctx.requestId);

async function authLimit(ctx: RouteContext, key: string): Promise<void> {
  const limiter = ctx.env.RATE_LIMITER;
  if (!limiter) return;
  if (!(await limiter.limit({ key })).success) throw new ApiError('RATE_LIMITED', 'Too many authentication requests. Wait and try again.');
}

function accountLocked(lockedUntil: string | null, now: number, requestId: string): Response {
  const until = lockedUntil ? Date.parse(lockedUntil) : Number.NaN;
  const retryAfterSeconds = Number.isFinite(until) ? Math.max(1, Math.ceil((until - now) / 1000)) : 900;
  return jsonResponse({ code: 'ACCOUNT_LOCKED', message: 'This client account is temporarily locked.', details: { retryAfterSeconds } }, 423, requestId);
}

async function recordFailedPassword(env: Env, account: ClientAccount, now: string, requestId?: string): Promise<{
  status: string; locked_until: string | null; failed_login_count: number;
}> {
  const updated = await env.DB.prepare(`UPDATE user_accounts SET failed_login_count=failed_login_count+1,
      status=CASE WHEN failed_login_count+1>=5 THEN 'LOCKED' ELSE 'ACTIVE' END,
      locked_until=CASE WHEN failed_login_count+1>=5
        THEN strftime('%Y-%m-%dT%H:%M:%fZ',?,printf('+%d minutes',min(1440,15 * (1 << min(10,max(0,failed_login_count+1-5))))))
        ELSE NULL END,
      version=version+1,updated_at=?
    WHERE workspace_id=? AND id=? AND version=? AND kind='CLIENT' AND status='ACTIVE'
    RETURNING status,locked_until,failed_login_count`)
    .bind(now, now, account.workspace_id, account.id, account.version)
    .first<{ status: string; locked_until: string | null; failed_login_count: number }>();
  if (updated) {
    await env.DB.batch([
      authEventStatement(env, { id: crypto.randomUUID(), workspaceId: account.workspace_id, userAccountId: account.id,
        event: 'LOGIN_FAILED', detail: { reasonCode: 'INVALID_CREDENTIALS' }, now }),
      ...(updated.status === 'LOCKED' ? [authEventStatement(env, { id: crypto.randomUUID(), workspaceId: account.workspace_id,
        userAccountId: account.id, event: 'LOCKED', detail: { retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(updated.locked_until ?? '') - Date.parse(now)) / 1000)) }, now })] : [])
    ]);
    return updated;
  }
  const current = await env.DB.prepare(`SELECT status,locked_until,failed_login_count FROM user_accounts WHERE workspace_id=? AND id=?`)
    .bind(account.workspace_id, account.id).first<{ status: string; locked_until: string | null; failed_login_count: number }>();
  if (current?.status === 'LOCKED' && current.locked_until && Date.parse(current.locked_until) > Date.parse(now)) return current;
  if (requestId) throw new ApiError('UNAUTHENTICATED', 'Email or password is incorrect.');
  return current ?? { status: 'DISABLED', locked_until: null, failed_login_count: 0 };
}

async function unlockExpiredAccount(env: Env, account: ClientAccount, now: string): Promise<ClientAccount> {
  if (account.status !== 'LOCKED' || !account.locked_until || Date.parse(account.locked_until) > Date.parse(now)) return account;
  await env.DB.prepare(`UPDATE user_accounts SET status='ACTIVE',locked_until=NULL,version=version+1,updated_at=?
    WHERE workspace_id=? AND id=? AND version=? AND status='LOCKED' AND locked_until<=?`)
    .bind(now, account.workspace_id, account.id, account.version, now).run();
  return (await env.DB.prepare(`SELECT id,workspace_id,kind,email_normalized,display_name,status,external_issuer,external_subject,
      is_firm_admin,password_must_change,version,password_hash,failed_login_count,locked_until
    FROM user_accounts WHERE workspace_id=? AND id=?`).bind(account.workspace_id, account.id).first<ClientAccount>()) ?? account;
}

export const handleClientPasswordLogin: Handler = async ctx => {
  assertSameOrigin(ctx.request, ctx.url);
  const parsed = loginBodySchema.safeParse(await readJson<unknown>(ctx.request, 4096));
  if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Enter a valid email address and password.');
  const { email, password } = parsed.data;
  const ip = ctx.request.headers.get('CF-Connecting-IP') || 'local';
  await authLimit(ctx, `client-login-ip:${await sha256Hex(ip)}`);
  await authLimit(ctx, `client-login-email:${await sha256Hex(email)}`);

  const matches = await ctx.env.DB.prepare(`SELECT id,workspace_id,kind,email_normalized,display_name,status,external_issuer,external_subject,
      is_firm_admin,password_must_change,version,password_hash,failed_login_count,locked_until
    FROM user_accounts WHERE email_normalized=? ORDER BY workspace_id,id LIMIT 2`).bind(email).all<ClientAccount>();
  const account = matches.results?.length === 1 ? matches.results[0] : null;
  if (!account || account.kind !== 'CLIENT' || !['ACTIVE', 'LOCKED'].includes(account.status)) {
    await verifyAgainstDummy(password);
    return genericLoginFailure(ctx);
  }

  const now = new Date().toISOString();
  const activeAccount = await unlockExpiredAccount(ctx.env, account, now);
  if (activeAccount.status === 'LOCKED') return accountLocked(activeAccount.locked_until, Date.now(), ctx.requestId);
  const passwordValid = await verifyAgainstDummy(password, activeAccount.password_hash);
  if (!passwordValid || !activeAccount.password_hash) {
    const afterFailure = await recordFailedPassword(ctx.env, activeAccount, now, ctx.requestId);
    if (afterFailure.status === 'LOCKED') return accountLocked(afterFailure.locked_until, Date.now(), ctx.requestId);
    return genericLoginFailure(ctx);
  }

  if (activeAccount.password_must_change === 1) {
    const latestToken = await ctx.env.DB.prepare(`SELECT expires_at,consumed_at FROM credential_tokens
      WHERE workspace_id=? AND user_account_id=? AND purpose='CLIENT_TEMP_PASSWORD'
      ORDER BY created_at DESC,id DESC LIMIT 1`).bind(activeAccount.workspace_id, activeAccount.id)
      .first<{ expires_at: string; consumed_at: string | null }>();
    if (!latestToken || latestToken.consumed_at || Date.parse(latestToken.expires_at) <= Date.now()) {
      await authEventStatement(ctx.env, { id: crypto.randomUUID(), workspaceId: activeAccount.workspace_id,
        userAccountId: activeAccount.id, event: 'LOGIN_FAILED', detail: { reasonCode: 'TEMP_PASSWORD_EXPIRED' }, now }).run();
      return jsonResponse({ code: 'TEMP_PASSWORD_EXPIRED', message: 'This temporary password has expired. Request a new portal credential.' }, 401, ctx.requestId);
    }
  }

  const profiles = await profilesFor(ctx.env, activeAccount);
  if (profiles.length !== 1 || profiles[0].persona !== 'CLIENT') return genericLoginFailure(ctx);
  const succeededAt = new Date().toISOString();
  await ctx.env.DB.prepare(`UPDATE user_accounts SET failed_login_count=0,locked_until=NULL,last_login_at=?,updated_at=?,version=version+1
    WHERE workspace_id=? AND id=? AND version=? AND kind='CLIENT' AND status='ACTIVE'`)
    .bind(succeededAt, succeededAt, activeAccount.workspace_id, activeAccount.id, activeAccount.version).run();
  const created = await createAuthSession(ctx.env, { workspaceId: activeAccount.workspace_id, userAccountId: activeAccount.id,
    authMethod: 'PASSWORD', activeActorProfileId: profiles[0].id, now: succeededAt });
  try {
    await authEventStatement(ctx.env, { id: crypto.randomUUID(), workspaceId: activeAccount.workspace_id,
      userAccountId: activeAccount.id, event: 'LOGIN_SUCCEEDED', detail: { method: 'PASSWORD' }, now: succeededAt }).run();
  } catch (error) {
    await ctx.env.DB.prepare(`UPDATE auth_sessions SET revoked_at=?,revoked_reason='EXPIRED' WHERE workspace_id=? AND id=? AND revoked_at IS NULL`)
      .bind(succeededAt, activeAccount.workspace_id, created.row.id).run();
    throw error;
  }
  const user = { ...activeAccount, status: 'ACTIVE' as const, failed_login_count: 0, locked_until: null };
  return jsonResponse(await meBody(ctx.env, user, created.row, Date.parse(succeededAt)), 200, ctx.requestId,
    { 'Set-Cookie': sessionCookie(created.token, 15 * 60) });
};

export const handleClientPasswordChange: Handler = async ctx => {
  assertSameOrigin(ctx.request, ctx.url);
  const token = parseCookies(ctx.request.headers.get('Cookie'))['__Host-as_session'];
  if (!token) throw new SessionError('UNKNOWN');
  const now = new Date().toISOString();
  const session = await validateAuthSession(ctx.env, token, now);
  const body = passwordChangeSchema.safeParse(await readJson<unknown>(ctx.request, 2048));
  if (!body.success) throw new ApiError('VALIDATION_FAILED', 'Provide your current password and a policy-compliant new password.');
  const account = await ctx.env.DB.prepare(`SELECT id,workspace_id,kind,email_normalized,status,password_hash,password_must_change,version
    FROM user_accounts WHERE workspace_id=? AND id=?`).bind(session.workspace_id, session.user_account_id)
    .first<{ id: string; workspace_id: string; kind: string; email_normalized: string; status: string; password_hash: string | null; password_must_change: number; version: number }>();
  if (!account || account.kind !== 'CLIENT') throw new ApiError('PERSONA_ACTION_DENIED', 'Only a client portal user can change a password here.');
  if (!account.password_hash || !(await verifyPassword(body.data.currentPassword, account.password_hash))) {
    throw new ApiError('UNAUTHENTICATED', 'The current password is incorrect.');
  }
  const policy = await checkPasswordPolicy(body.data.newPassword, { email: account.email_normalized });
  if (!policy.valid) throw new ApiError('VALIDATION_FAILED', 'Choose a password that is at least 12 characters, excludes your email name, and is not a known breached password.', { reason: policy.reason });
  const passwordHash = await hashPassword(body.data.newPassword);
  const forced = account.password_must_change === 1;
  const changedAt = new Date().toISOString();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,980,CASE WHEN EXISTS(SELECT 1 FROM user_accounts WHERE workspace_id=? AND id=? AND version=?
        AND kind='CLIENT' AND status='ACTIVE' AND password_hash=? AND EXISTS(
          SELECT 1 FROM auth_sessions WHERE workspace_id=? AND id=? AND user_account_id=? AND revoked_at IS NULL AND absolute_expires_at>?))
      THEN 1 ELSE 0 END`).bind(account.workspace_id, account.workspace_id, account.id, account.version, account.password_hash,
      session.workspace_id, session.id, account.id, changedAt),
    ctx.env.DB.prepare(`UPDATE user_accounts SET password_hash=?,password_must_change=0,password_changed_at=?,failed_login_count=0,
      locked_until=NULL,version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND kind='CLIENT' AND status='ACTIVE'`)
      .bind(passwordHash, changedAt, changedAt, account.workspace_id, account.id, account.version),
    ctx.env.DB.prepare(`UPDATE auth_sessions SET revoked_at=?,revoked_reason='PASSWORD_CHANGED'
      WHERE workspace_id=? AND user_account_id=? AND id<>? AND revoked_at IS NULL`)
      .bind(changedAt, account.workspace_id, account.id, session.id),
    authEventStatement(ctx.env, { id: crypto.randomUUID(), workspaceId: account.workspace_id, userAccountId: account.id,
      event: 'PASSWORD_CHANGED', detail: { forced }, now: changedAt }),
    ctx.env.DB.prepare('DELETE FROM command_assertions WHERE workspace_id=? AND seq=980').bind(account.workspace_id)
  ]);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
};

export const handlePasswordResetRequest: Handler = async ctx => {
  assertSameOrigin(ctx.request, ctx.url);
  const body = resetRequestSchema.safeParse(await readJson<unknown>(ctx.request, 2048));
  if (!body.success) throw new ApiError('VALIDATION_FAILED', 'Provide a valid email address.');
  const ip = ctx.request.headers.get('CF-Connecting-IP') || 'local';
  await authLimit(ctx, `password-reset-ip:${await sha256Hex(ip)}`);
  const now = new Date().toISOString();
  const matches = await ctx.env.DB.prepare(`SELECT id,workspace_id,version,status FROM user_accounts
    WHERE email_normalized=? AND kind='CLIENT' ORDER BY workspace_id,id LIMIT 2`).bind(body.data.email)
    .all<{ id: string; workspace_id: string; version: number; status: string }>();
  const account = matches.results?.length === 1 && ['ACTIVE', 'LOCKED'].includes(matches.results[0].status) ? matches.results[0] : null;
  if (account) {
    const hourAgo = new Date(Date.parse(now) - 60 * 60 * 1000).toISOString();
    const eventId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const payload = JSON.stringify({ documentType: 'PASSWORD_RESET', userAccountId: account.id });
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`INSERT INTO auth_events(id,workspace_id,user_account_id,event,detail_json,ip_sha256,created_at)
        SELECT ?,?,?, 'PASSWORD_RESET_REQUESTED',json_object('outcome',CASE WHEN (
          SELECT COUNT(*) FROM auth_events WHERE workspace_id=? AND user_account_id=?
            AND event='PASSWORD_RESET_REQUESTED' AND created_at>=?)<3 THEN 'QUEUED' ELSE 'THROTTLED' END),NULL,?`)
        .bind(eventId, account.workspace_id, account.id, account.workspace_id, account.id, hourAgo, now),
      ctx.env.DB.prepare(`INSERT INTO outbox_jobs(
        id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,
        next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at
      ) SELECT ?,?,1,'EMAIL',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?
        WHERE EXISTS(SELECT 1 FROM auth_events WHERE workspace_id=? AND id=? AND json_extract(detail_json,'$.outcome')='QUEUED')`)
        .bind(jobId, account.workspace_id, account.id, account.version, payload, `password-reset:${jobId}`, now, now, now,
          account.workspace_id, eventId)
    ]);
  }
  return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
};

export const handlePasswordResetConfirm: Handler = async ctx => {
  assertSameOrigin(ctx.request, ctx.url);
  const body = resetConfirmSchema.safeParse(await readJson<unknown>(ctx.request, 4096));
  if (!body.success) throw new ApiError('VALIDATION_FAILED', 'Provide a valid reset link and policy-compliant new password.');
  const ip = ctx.request.headers.get('CF-Connecting-IP') || 'local';
  await authLimit(ctx, `password-reset-confirm-ip:${await sha256Hex(ip)}`);
  const submittedTokenHash = await tokenHash(body.data.token);
  const now = new Date().toISOString();
  const reset = await ctx.env.DB.prepare(`SELECT t.id,t.workspace_id,t.user_account_id,t.expires_at,t.consumed_at,
      u.email_normalized,u.kind,u.status,u.version
    FROM credential_tokens t JOIN user_accounts u ON u.workspace_id=t.workspace_id AND u.id=t.user_account_id
    WHERE t.token_sha256=? AND t.purpose='PASSWORD_RESET'`)
    .bind(submittedTokenHash).first<{ id: string; workspace_id: string; user_account_id: string; expires_at: string; consumed_at: string | null;
      email_normalized: string; kind: string; status: string; version: number }>();
  if (!reset || reset.consumed_at || Date.parse(reset.expires_at) <= Date.parse(now)
    || reset.kind !== 'CLIENT' || !['ACTIVE', 'LOCKED'].includes(reset.status)) {
    throw new ApiError('INVALID_TOKEN', 'This password reset link is invalid or expired. Request a new link.');
  }
  const policy = await checkPasswordPolicy(body.data.newPassword, { email: reset.email_normalized });
  if (!policy.valid) throw new ApiError('VALIDATION_FAILED', 'Choose a password that is at least 12 characters, excludes your email name, and is not a known breached password.', { reason: policy.reason });
  const passwordHash = await hashPassword(body.data.newPassword);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,981,CASE WHEN EXISTS(SELECT 1 FROM credential_tokens t JOIN user_accounts u
        ON u.workspace_id=t.workspace_id AND u.id=t.user_account_id WHERE t.workspace_id=? AND t.id=?
          AND t.user_account_id=? AND t.token_sha256=? AND t.purpose='PASSWORD_RESET' AND t.consumed_at IS NULL AND t.expires_at>?
          AND u.version=? AND u.kind='CLIENT' AND u.status IN ('ACTIVE','LOCKED')) THEN 1 ELSE 0 END`)
      .bind(reset.workspace_id, reset.workspace_id, reset.id, reset.user_account_id, submittedTokenHash, now, reset.version),
    ctx.env.DB.prepare(`UPDATE user_accounts SET status='ACTIVE',password_hash=?,password_must_change=0,password_changed_at=?,
      failed_login_count=0,locked_until=NULL,version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND kind='CLIENT' AND status IN ('ACTIVE','LOCKED')`)
      .bind(passwordHash, now, now, reset.workspace_id, reset.user_account_id, reset.version),
    ctx.env.DB.prepare(`UPDATE credential_tokens SET consumed_at=? WHERE workspace_id=? AND id=? AND purpose='PASSWORD_RESET' AND consumed_at IS NULL`)
      .bind(now, reset.workspace_id, reset.id),
    ctx.env.DB.prepare(`UPDATE auth_sessions SET revoked_at=?,revoked_reason='PASSWORD_CHANGED'
      WHERE workspace_id=? AND user_account_id=? AND revoked_at IS NULL`).bind(now, reset.workspace_id, reset.user_account_id),
    authEventStatement(ctx.env, { id: crypto.randomUUID(), workspaceId: reset.workspace_id, userAccountId: reset.user_account_id,
      event: 'PASSWORD_RESET_COMPLETED', detail: { method: 'EMAIL_LINK' }, now }),
    ctx.env.DB.prepare('DELETE FROM command_assertions WHERE workspace_id=? AND seq=981').bind(reset.workspace_id)
  ]);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
};
