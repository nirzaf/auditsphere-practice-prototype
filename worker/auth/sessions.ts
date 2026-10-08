import type { Env } from '../env';
import { ApiError } from '../errors';
import { newOpaqueToken, tokenHash } from './tokens';

export type SessionFailure = 'UNKNOWN' | 'REVOKED' | 'IDLE_EXPIRED' | 'ABSOLUTE_EXPIRED' | 'USER_LOCKED' | 'USER_DISABLED' | 'USER_NOT_ACTIVE' | 'GRANT_REVOKED';
export class SessionError extends ApiError {
  constructor(readonly reason: SessionFailure) {
    super(reason.includes('EXPIRED') ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED', 'The session is not valid.', { reason });
    this.name = 'SessionError';
  }
}
export interface AuthSessionRow {
  id: string; workspace_id: string; user_account_id: string; token_sha256: string;
  active_actor_profile_id: string | null; auth_method: 'OIDC_ENTRA' | 'PASSWORD'; created_at: string;
  last_seen_at: string; idle_expires_at: string; absolute_expires_at: string; revoked_at: string | null;
}
export interface SessionContext extends AuthSessionRow { email_normalized: string; display_name: string; kind: string; }
export async function createAuthSession(env: Env, input: { workspaceId: string; userAccountId: string; authMethod: 'OIDC_ENTRA' | 'PASSWORD'; activeActorProfileId?: string | null; now: string }): Promise<{ token: string; row: AuthSessionRow }> {
  const token = newOpaqueToken(); const digest = await tokenHash(token); const id = crypto.randomUUID();
  const nowMs = Date.parse(input.now); const idle = new Date(nowMs + (input.authMethod === 'OIDC_ENTRA' ? 30 : 15) * 60_000).toISOString(); const absolute = new Date(nowMs + 12 * 60 * 60_000).toISOString();
  const row: AuthSessionRow = { id, workspace_id: input.workspaceId, user_account_id: input.userAccountId, token_sha256: digest,
    active_actor_profile_id: input.activeActorProfileId ?? null, auth_method: input.authMethod, created_at: input.now, last_seen_at: input.now,
    idle_expires_at: idle, absolute_expires_at: absolute, revoked_at: null };
  await env.DB.prepare(`INSERT INTO auth_sessions(id,workspace_id,user_account_id,token_sha256,active_actor_profile_id,auth_method,created_at,last_seen_at,idle_expires_at,absolute_expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id, input.workspaceId, input.userAccountId, digest, row.active_actor_profile_id, input.authMethod, input.now, input.now, idle, absolute).run();
  return { token, row };
}

export async function validateAuthSession(env: Env, token: string, now: string): Promise<SessionContext> {
  const digest = await tokenHash(token);
  const row = await env.DB.prepare(`SELECT s.*,u.email_normalized,u.display_name,u.kind,u.status AS account_status
    FROM auth_sessions s JOIN user_accounts u ON u.workspace_id=s.workspace_id AND u.id=s.user_account_id WHERE s.token_sha256=?`).bind(digest).first<any>();
  if (!row) throw new SessionError('UNKNOWN');
  if (row.revoked_at) throw new SessionError('REVOKED');
  if (Date.parse(now) >= Date.parse(row.idle_expires_at)) throw new SessionError('IDLE_EXPIRED');
  if (Date.parse(now) >= Date.parse(row.absolute_expires_at)) throw new SessionError('ABSOLUTE_EXPIRED');
  if (row.account_status === 'LOCKED') throw new SessionError('USER_LOCKED');
  if (row.account_status === 'DISABLED') throw new SessionError('USER_DISABLED');
  if (row.account_status !== 'ACTIVE') throw new SessionError('USER_NOT_ACTIVE');
  if (row.active_actor_profile_id) {
    const grant = await env.DB.prepare(`SELECT 1 FROM user_profile_grants WHERE workspace_id=? AND user_account_id=? AND actor_profile_id=? AND revoked_at IS NULL`).bind(row.workspace_id, row.user_account_id, row.active_actor_profile_id).first();
    if (!grant) throw new SessionError('GRANT_REVOKED');
  }
  const { account_status: _, ...context } = row;
  return context as SessionContext;
}

export async function touchSession(env: Env, session: AuthSessionRow, now: string): Promise<string> {
  if (Date.parse(now) - Date.parse(session.last_seen_at) < 60_000) return session.idle_expires_at;
  const idleMinutes = session.auth_method === 'OIDC_ENTRA' ? 30 : 15;
  const idleExpiresAt = new Date(Math.min(Date.parse(now) + idleMinutes * 60_000, Date.parse(session.absolute_expires_at))).toISOString();
  await env.DB.prepare(`UPDATE auth_sessions SET last_seen_at=?,idle_expires_at=? WHERE id=? AND revoked_at IS NULL`)
    .bind(now, idleExpiresAt, session.id).run();
  return idleExpiresAt;
}
export async function revokeSession(env: Env, sessionId: string, reason: string, now: string): Promise<void> {
  await env.DB.prepare('UPDATE auth_sessions SET revoked_at=?,revoked_reason=? WHERE id=? AND revoked_at IS NULL').bind(now, reason, sessionId).run();
}
export async function revokeAllForUser(env: Env, userId: string, reason: string, now: string): Promise<void> {
  await env.DB.prepare('UPDATE auth_sessions SET revoked_at=?,revoked_reason=? WHERE user_account_id=? AND revoked_at IS NULL').bind(now, reason, userId).run();
}
