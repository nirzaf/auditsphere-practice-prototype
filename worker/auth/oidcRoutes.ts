import { z } from 'zod';
import type { Handler, RouteContext } from '../router';
import { ApiError } from '../errors';
import { assertSameOrigin, jsonResponse, parseCookies, readJson, serializeCookie } from '../http';
import { authEventStatement } from './events';
import { clearedSessionCookie, sessionCookie } from './cookies';
import { createAuthSession, revokeSession, SessionError, touchSession, validateAuthSession, type AuthSessionRow } from './sessions';
import { createAuthDeps, getDiscovery, getOidcConfig, newOidcValues, pkceChallenge, signStateCookie, verifyIdToken, verifyStateCookie, type AuthDeps } from './oidc';

const OIDC_COOKIE = '__Host-as_oidc';
const STATE_TTL_SECONDS = 600;
const profileRequest = z.strictObject({ actorProfileId: z.string().uuid() });

/** These auth handlers perform their own session validation rather than business-route auth. */
export const authHandlerRoutes = new Set([
  'GET /api/auth/staff/login', 'GET /api/auth/staff/callback', 'GET /api/auth/me',
  'POST /api/auth/active-profile', 'POST /api/auth/logout'
]);

export type UserRow = {
  id: string; workspace_id: string; kind: 'STAFF' | 'CLIENT'; email_normalized: string; display_name: string;
  status: 'INVITED' | 'ACTIVE' | 'LOCKED' | 'DISABLED'; external_issuer: string | null; external_subject: string | null;
  is_firm_admin: number; password_must_change: number;
};
export type ProfileRow = { id: string; persona: 'PREPARER' | 'REVIEWER' | 'APPROVER' | 'CLIENT'; display_name: string; staff_grade: string | null; client_id: string | null };

function appendCookie(headers: Headers, value: string): void { headers.append('Set-Cookie', value); }
function cookieState(value: string, secret: string, now: number) {
  return verifyStateCookie(value, secret).then(payload => {
    if (!payload || typeof payload.exp !== 'number' || payload.exp <= now) return null;
    if (typeof payload.state !== 'string' || typeof payload.nonce !== 'string' || typeof payload.verifier !== 'string' || typeof payload.returnTo !== 'string') return null;
    return payload as { state: string; nonce: string; verifier: string; returnTo: string; exp: number };
  });
}

function safeReturnTo(value: string | null, origin: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\r\n]/.test(value)) return '/';
  try {
    const parsed = new URL(value, origin);
    return parsed.origin === origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '/';
  } catch { return '/'; }
}

export async function profilesFor(env: RouteContext['env'], user: UserRow): Promise<ProfileRow[]> {
  return (await env.DB.prepare(`SELECT ap.id,ap.persona,COALESCE(sm.display_name,ct.full_name,'') AS display_name,sm.grade AS staff_grade,ct.client_id
    FROM user_profile_grants g JOIN actor_profiles ap ON ap.workspace_id=g.workspace_id AND ap.id=g.actor_profile_id
    LEFT JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
    LEFT JOIN contacts ct ON ct.workspace_id=ap.workspace_id AND ct.id=ap.contact_id
    WHERE g.workspace_id=? AND g.user_account_id=? AND g.revoked_at IS NULL AND ap.active=1
      AND (ap.persona='CLIENT' OR sm.active=1)
    ORDER BY ap.persona,ap.id`).bind(user.workspace_id, user.id).all<ProfileRow>()).results ?? [];
}

export async function meBody(env: RouteContext['env'], user: UserRow, session: AuthSessionRow, now: number) {
  const profiles = await profilesFor(env, user);
  return {
    user: { id: user.id, kind: user.kind, displayName: user.display_name, email: user.email_normalized, isFirmAdmin: user.is_firm_admin === 1 },
    workspaceId: user.workspace_id,
    profiles: profiles.map(profile => ({ id: profile.id, persona: profile.persona, displayName: profile.display_name, staffGrade: profile.staff_grade, clientId: profile.client_id })),
    activeProfileId: session.active_actor_profile_id,
    passwordMustChange: user.password_must_change === 1,
    idleExpiresAt: session.idle_expires_at
  };
}

async function currentSession(ctx: RouteContext, deps: AuthDeps): Promise<{ token: string; user: UserRow; session: AuthSessionRow }> {
  const token = parseCookies(ctx.request.headers.get('Cookie'))['__Host-as_session'];
  if (!token) throw new SessionError('UNKNOWN');
  const now = new Date(deps.now()).toISOString();
  const session = await validateAuthSession(ctx.env, token, now);
  session.idle_expires_at = await touchSession(ctx.env, session, now);
  const user = await ctx.env.DB.prepare(`SELECT id,workspace_id,kind,email_normalized,display_name,status,external_issuer,external_subject,is_firm_admin,password_must_change
    FROM user_accounts WHERE workspace_id=? AND id=?`).bind(session.workspace_id, session.user_account_id).first<UserRow>();
  if (!user) throw new SessionError('UNKNOWN');
  return { token, user, session };
}

async function recordEvent(ctx: RouteContext, user: UserRow, event: string, detail: Record<string, unknown>, now: string): Promise<void> {
  await authEventStatement(ctx.env, { id: crypto.randomUUID(), workspaceId: user.workspace_id, userAccountId: user.id, event, detail, now }).run();
}

async function recordLoginFailure(ctx: RouteContext, reason: string, user?: UserRow): Promise<void> {
  let workspaceId = user?.workspace_id ?? ctx.env.OIDC_AUDIT_WORKSPACE_ID;
  if (!workspaceId) {
    const candidates = await ctx.env.DB.prepare("SELECT id FROM workspaces WHERE data_mode='BUSINESS' ORDER BY id LIMIT 2").all<{ id: string }>();
    if (candidates.results.length === 1) workspaceId = candidates.results[0].id;
  }
  if (!workspaceId) return;
  await authEventStatement(ctx.env, { id: crypto.randomUUID(), workspaceId, userAccountId: user?.id, event: 'LOGIN_FAILED', detail: { reasonCode: reason }, now: new Date().toISOString() }).run();
}

async function fail(ctx: RouteContext, reason: string, user?: UserRow): Promise<Response> {
  try { await recordLoginFailure(ctx, reason, user); } catch { /* authentication failures must stay generic */ }
  const response = jsonResponse({ code: 'UNAUTHENTICATED', message: 'The sign-in could not be completed.', reasonCode: reason }, 401, ctx.requestId,
    { 'Set-Cookie': serializeCookie(OIDC_COOKIE, '', { maxAgeSeconds: 0, sameSite: 'Lax' }) });
  return response;
}

async function findAccount(ctx: RouteContext, claims: Awaited<ReturnType<typeof verifyIdToken>>, issuer: string, now: string): Promise<UserRow | null> {
  const bound = await ctx.env.DB.prepare(`SELECT id,workspace_id,kind,email_normalized,display_name,status,external_issuer,external_subject,is_firm_admin,password_must_change
    FROM user_accounts WHERE kind='STAFF' AND external_issuer=? AND external_subject=?`).bind(issuer, claims.oid).all<UserRow>();
  if (bound.results.length > 1) return null;
  if (bound.results[0]) return bound.results[0];
  if (!claims.emailVerified) return null;
  const email = (claims.email ?? claims.preferredUsername)?.trim().toLowerCase();
  if (!email) return null;
  const invited = await ctx.env.DB.prepare(`SELECT u.id,u.workspace_id,u.kind,u.email_normalized,u.display_name,u.status,u.external_issuer,u.external_subject,u.is_firm_admin,u.password_must_change
    FROM user_accounts u WHERE u.kind='STAFF' AND u.status='INVITED' AND u.external_subject IS NULL AND u.email_normalized=?
      AND EXISTS(SELECT 1 FROM credential_tokens t WHERE t.workspace_id=u.workspace_id AND t.user_account_id=u.id
        AND t.purpose='STAFF_INVITE' AND t.consumed_at IS NULL AND t.expires_at>?
        AND NOT EXISTS(SELECT 1 FROM credential_tokens newer WHERE newer.workspace_id=t.workspace_id AND newer.user_account_id=t.user_account_id
          AND newer.purpose='STAFF_INVITE' AND (newer.created_at>t.created_at OR (newer.created_at=t.created_at AND newer.id>t.id))))`)
    .bind(email, now).all<UserRow>();
  return invited.results.length === 1 ? invited.results[0] : null;
}

async function chooseActiveProfile(ctx: RouteContext, user: UserRow, profiles: ProfileRow[]): Promise<string | null> {
  if (profiles.length === 1) return profiles[0].id;
  if (!profiles.length) return null;
  const ids = new Set(profiles.map(profile => profile.id));
  const latest = await ctx.env.DB.prepare(`SELECT active_actor_profile_id FROM auth_sessions
    WHERE workspace_id=? AND user_account_id=? AND active_actor_profile_id IS NOT NULL
    ORDER BY last_seen_at DESC,created_at DESC LIMIT 1`).bind(user.workspace_id, user.id).first<{ active_actor_profile_id: string }>();
  return latest && ids.has(latest.active_actor_profile_id) ? latest.active_actor_profile_id : null;
}

function oidcErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('state')) return 'STATE_INVALID';
  if (message.includes('nonce')) return 'NONCE_INVALID';
  if (message.includes('audience')) return 'AUDIENCE_INVALID';
  if (message.includes('issuer') || message.includes('tenant')) return 'ISSUER_INVALID';
  if (message.includes('expired') || message.includes('issue time') || message.includes('not yet valid')) return 'TOKEN_TIME_INVALID';
  if (message.includes('signing key') || message.includes('signature')) return 'SIGNATURE_INVALID';
  if (message.includes('account') || message.includes('grant')) return 'ACCOUNT_NOT_ELIGIBLE';
  return 'OIDC_CALLBACK_INVALID';
}

export function createStaffOidcHandlers(depsFactory: (env: RouteContext['env']) => AuthDeps = createAuthDeps): {
  login: Handler; callback: Handler; me: Handler; activeProfile: Handler; logout: Handler;
} {
  return {
    login: async ctx => {
      const deps = depsFactory(ctx.env);
      try {
        const config = getOidcConfig(ctx.env);
        const discovery = await getDiscovery(ctx.env, deps);
        const values = newOidcValues(deps);
        const returnTo = safeReturnTo(ctx.url.searchParams.get('returnTo'), ctx.url.origin);
        const payload = await signStateCookie({ ...values, returnTo, exp: deps.now() + STATE_TTL_SECONDS * 1000 }, config.clientSecret);
        const authorize = new URL(discovery.authorization_endpoint);
        authorize.search = new URLSearchParams({ client_id: config.clientId, response_type: 'code', redirect_uri: config.redirectUri,
          response_mode: 'query', scope: 'openid profile email', state: values.state, nonce: values.nonce,
          code_challenge: await pkceChallenge(values.verifier), code_challenge_method: 'S256' }).toString();
        const response = new Response(null, { status: 302, headers: { Location: authorize.toString(), 'Cache-Control': 'no-store' } });
        appendCookie(response.headers, serializeCookie(OIDC_COOKIE, payload, { maxAgeSeconds: STATE_TTL_SECONDS, sameSite: 'Lax' }));
        return response;
      } catch { return fail(ctx, 'OIDC_NOT_CONFIGURED'); }
    },
    callback: async ctx => {
      const deps = depsFactory(ctx.env);
      const stateCookie = parseCookies(ctx.request.headers.get('Cookie'))[OIDC_COOKIE];
      let matchedUser: UserRow | undefined;
      try {
        const config = getOidcConfig(ctx.env);
        if (ctx.url.searchParams.has('error')) return await fail(ctx, 'AUTHORIZATION_DENIED');
        const state = await cookieState(stateCookie ?? '', config.clientSecret, deps.now());
        const code = ctx.url.searchParams.get('code');
        if (!state || !code || ctx.url.searchParams.get('state') !== state.state) return await fail(ctx, 'STATE_INVALID');
        const discovery = await getDiscovery(ctx.env, deps);
        const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, client_secret: config.clientSecret,
          code, redirect_uri: config.redirectUri, code_verifier: state.verifier });
        const tokenResponse = await deps.fetch(discovery.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
        if (!tokenResponse.ok) return await fail(ctx, 'TOKEN_EXCHANGE_FAILED');
        const tokens = await tokenResponse.json() as { id_token?: unknown };
        if (typeof tokens.id_token !== 'string') return await fail(ctx, 'ID_TOKEN_MISSING');
        const claims = await verifyIdToken(tokens.id_token, ctx.env, state.nonce, deps);
        const oidcIssuer = `https://login.microsoftonline.com/${config.tenant}/v2.0`;
        const now = new Date(deps.now()).toISOString();
        matchedUser = await findAccount(ctx, claims, oidcIssuer, now) ?? undefined;
        if (!matchedUser) return await fail(ctx, 'ACCOUNT_NOT_ELIGIBLE');
        if (matchedUser.status === 'LOCKED' || matchedUser.status === 'DISABLED') return await fail(ctx, matchedUser.status === 'LOCKED' ? 'ACCOUNT_LOCKED' : 'ACCOUNT_DISABLED', matchedUser);
        if (matchedUser.status !== 'INVITED' && matchedUser.status !== 'ACTIVE') return await fail(ctx, 'ACCOUNT_NOT_ACTIVE', matchedUser);
        const profiles = await profilesFor(ctx.env, matchedUser);
        if (!profiles.length) return await fail(ctx, 'NO_ACTIVE_GRANTS', matchedUser);
        if (matchedUser.status === 'INVITED') {
          const invitation = await ctx.env.DB.prepare(`SELECT t.id,t.expires_at FROM credential_tokens t
            WHERE t.workspace_id=? AND t.user_account_id=? AND t.purpose='STAFF_INVITE' AND t.consumed_at IS NULL AND t.expires_at>?
              AND NOT EXISTS(SELECT 1 FROM credential_tokens newer WHERE newer.workspace_id=t.workspace_id AND newer.user_account_id=t.user_account_id
                AND newer.purpose='STAFF_INVITE' AND (newer.created_at>t.created_at OR (newer.created_at=t.created_at AND newer.id>t.id)))`)
            .bind(matchedUser.workspace_id, matchedUser.id, now).first<{ id: string; expires_at: string }>();
          if (!invitation || !Number.isFinite(Date.parse(invitation.expires_at)) || Date.parse(invitation.expires_at) <= Date.parse(now)) {
            return await fail(ctx, 'INVITATION_EXPIRED', matchedUser);
          }
          try {
            await ctx.env.DB.batch([
              ctx.env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
                SELECT ?,998,CASE WHEN EXISTS(SELECT 1 FROM user_accounts u JOIN credential_tokens t
                  ON t.workspace_id=u.workspace_id AND t.user_account_id=u.id
                  WHERE u.workspace_id=? AND u.id=? AND u.kind='STAFF' AND u.status='INVITED' AND u.email_normalized=?
                    AND (u.external_subject IS NULL OR u.external_subject=?) AND (u.external_issuer IS NULL OR u.external_issuer=?)
                    AND t.id=? AND t.purpose='STAFF_INVITE' AND t.consumed_at IS NULL AND t.expires_at>?) THEN 1 ELSE 0 END`)
                .bind(matchedUser.workspace_id, matchedUser.workspace_id, matchedUser.id, matchedUser.email_normalized,
                  claims.oid, oidcIssuer, invitation.id, now),
              ctx.env.DB.prepare(`UPDATE user_accounts SET status='ACTIVE',external_issuer=?,external_subject=?,last_login_at=?,updated_at=?,version=version+1
                WHERE workspace_id=? AND id=? AND status='INVITED' AND email_normalized=?
                  AND (external_subject IS NULL OR (external_subject=? AND (external_issuer IS NULL OR external_issuer=?)))
                  AND EXISTS(SELECT 1 FROM credential_tokens t WHERE t.workspace_id=user_accounts.workspace_id AND t.user_account_id=user_accounts.id
                    AND t.id=? AND t.purpose='STAFF_INVITE' AND t.consumed_at IS NULL AND t.expires_at>?)`)
                .bind(oidcIssuer, claims.oid, now, now, matchedUser.workspace_id, matchedUser.id, matchedUser.email_normalized,
                  claims.oid, oidcIssuer, invitation.id, now),
              ctx.env.DB.prepare(`UPDATE credential_tokens SET consumed_at=? WHERE workspace_id=? AND id=? AND user_account_id=?
                AND purpose='STAFF_INVITE' AND consumed_at IS NULL AND expires_at>?`)
                .bind(now, matchedUser.workspace_id, invitation.id, matchedUser.id, now),
              authEventStatement(ctx.env, { id: crypto.randomUUID(), workspaceId: matchedUser.workspace_id, userAccountId: matchedUser.id,
                event: 'INVITE_ACCEPTED', detail: { method: 'OIDC_ENTRA', issuer: oidcIssuer, tokenId: invitation.id }, now }),
              ctx.env.DB.prepare('DELETE FROM command_assertions WHERE workspace_id=?').bind(matchedUser.workspace_id)
            ]);
          } catch {
            return await fail(ctx, 'ACCOUNT_BINDING_CONFLICT', matchedUser);
          }
          matchedUser = { ...matchedUser, status: 'ACTIVE', external_issuer: oidcIssuer, external_subject: claims.oid };
        } else {
          await ctx.env.DB.prepare('UPDATE user_accounts SET last_login_at=?,updated_at=? WHERE workspace_id=? AND id=?').bind(now, now, matchedUser.workspace_id, matchedUser.id).run();
        }
        const activeProfileId = await chooseActiveProfile(ctx, matchedUser, profiles);
        const created = await createAuthSession(ctx.env, { workspaceId: matchedUser.workspace_id, userAccountId: matchedUser.id, authMethod: 'OIDC_ENTRA', activeActorProfileId: activeProfileId, now });
        try { await recordEvent(ctx, matchedUser, 'LOGIN_SUCCEEDED', { method: 'OIDC_ENTRA' }, now); }
        catch (error) { await revokeSession(ctx.env, created.row.id, 'EXPIRED', now); throw error; }
        const response = new Response(null, { status: 302, headers: { Location: safeReturnTo(state.returnTo, ctx.url.origin), 'Cache-Control': 'no-store' } });
        appendCookie(response.headers, sessionCookie(created.token, 30 * 60));
        appendCookie(response.headers, serializeCookie(OIDC_COOKIE, '', { maxAgeSeconds: 0, sameSite: 'Lax' }));
        return response;
      } catch (error) { return await fail(ctx, oidcErrorCode(error), matchedUser); }
    },
    me: async ctx => {
      const deps = depsFactory(ctx.env);
      try {
        const current = await currentSession(ctx, deps);
        const response = jsonResponse(await meBody(ctx.env, current.user, current.session, deps.now()), 200, ctx.requestId);
        appendCookie(response.headers, sessionCookie(current.token, Math.max(0, Math.floor((Date.parse(current.session.idle_expires_at) - deps.now()) / 1000))));
        return response;
      } catch (error) {
        if (error instanceof SessionError) return jsonResponse({ code: error.code, message: error.message }, error.status, ctx.requestId, { 'Set-Cookie': clearedSessionCookie() });
        throw error;
      }
    },
    activeProfile: async ctx => {
      assertSameOrigin(ctx.request, ctx.url);
      const deps = depsFactory(ctx.env);
      const current = await currentSession(ctx, deps);
      if (current.user.password_must_change === 1) {
        throw new ApiError('PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before switching profiles.');
      }
      const body = profileRequest.safeParse(await readJson<unknown>(ctx.request, 2048).catch(() => null));
      if (!body.success) throw new ApiError('VALIDATION_FAILED', 'Choose a valid actor profile.');
      const { actorProfileId } = body.data;
      const grant = await ctx.env.DB.prepare(`SELECT 1 FROM user_profile_grants g JOIN actor_profiles ap ON ap.workspace_id=g.workspace_id AND ap.id=g.actor_profile_id
        JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
        WHERE g.workspace_id=? AND g.user_account_id=? AND g.actor_profile_id=? AND g.revoked_at IS NULL AND ap.active=1 AND sm.active=1`)
        .bind(current.user.workspace_id, current.user.id, actorProfileId).first();
      if (!grant) throw new ApiError('PERSONA_ACTION_DENIED', 'This profile is not granted to the signed-in user.');
      await ctx.env.DB.prepare('UPDATE auth_sessions SET active_actor_profile_id=? WHERE id=? AND revoked_at IS NULL').bind(actorProfileId, current.session.id).run();
      const now = new Date(deps.now()).toISOString();
      await recordEvent(ctx, current.user, 'PROFILE_SWITCHED', { actorProfileId }, now);
      const session = { ...current.session, active_actor_profile_id: actorProfileId };
      const response = jsonResponse(await meBody(ctx.env, current.user, session, deps.now()), 200, ctx.requestId);
      appendCookie(response.headers, sessionCookie(current.token, Math.max(0, Math.floor((Date.parse(current.session.idle_expires_at) - deps.now()) / 1000))));
      return response;
    },
    logout: async ctx => {
      assertSameOrigin(ctx.request, ctx.url);
      const deps = depsFactory(ctx.env);
      const token = parseCookies(ctx.request.headers.get('Cookie'))['__Host-as_session'];
      if (token) {
        let session: Awaited<ReturnType<typeof validateAuthSession>> | undefined;
        try { session = await validateAuthSession(ctx.env, token, new Date(deps.now()).toISOString()); }
        catch (error) { if (!(error instanceof SessionError)) throw error; }
        if (session) {
          const now = new Date(deps.now()).toISOString();
          await revokeSession(ctx.env, session.id, 'LOGOUT', now);
          const user = await ctx.env.DB.prepare(`SELECT id,workspace_id,kind,email_normalized,display_name,status,external_issuer,external_subject,is_firm_admin,password_must_change
            FROM user_accounts WHERE workspace_id=? AND id=?`).bind(session.workspace_id, session.user_account_id).first<UserRow>();
          if (user) await recordEvent(ctx, user, 'LOGOUT', {}, now);
        }
      }
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'Set-Cookie': clearedSessionCookie() } });
    }
  };
}

const handlers = createStaffOidcHandlers();
export const handleStaffLogin = handlers.login;
export const handleStaffCallback = handlers.callback;
export const handleAuthMe = handlers.me;
export const handleActiveProfile = handlers.activeProfile;
export const handleAuthLogout = handlers.logout;
