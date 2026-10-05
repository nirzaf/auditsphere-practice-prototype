// Session & persona resolution.
//
// Security property: the actor (user id + role) is stored on the SERVER session
// row and applied to the state the Worker then validates against. The browser
// never supplies an authoritative actor on a mutation; it can only ask to switch
// to a persona that already exists, active, inside this workspace.

import type { PrototypeState } from '../src/types';
import type { SessionActor } from '../src/shared/api/sessions';
import { visibleClientIds, visibleEngagementIds } from '../src/services/guards';
import { findSessionByHash, loadWorkspaceState, nowSeconds, updateSessionActor, type SessionRow } from './db';
import type { Env } from './env';
import { ApiError } from './errors';
import { parseCookies, randomToken, sessionCookieName, serializeCookie, sha256Hex } from './http';

/** 12 hours: long enough for a demo, short enough to bound a leaked cookie. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
/** Demo workspace lifetime, matching the existing seven-day snapshot policy. */
export const WORKSPACE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface ResolvedSession {
  session: SessionRow;
  state: PrototypeState;
  actor: SessionActor;
}

export const newAccessCode = () => randomToken(32);

/**
 * Overwrite the session-adjacent fields of state from server-held identity.
 * Guards (`requireActiveIdentity`, scope checks) then run against the SESSION's
 * actor rather than anything the client sent.
 */
export function applyServerActor(state: PrototypeState, userId: string, role: string): void {
  const user = state.users.find(candidate => candidate.id === userId);
  if (!user) throw new ApiError('DISABLED_IDENTITY', 'The session actor no longer exists in this workspace.');
  if (user.status !== 'Active') throw new ApiError('DISABLED_IDENTITY', `Persona "${user.name}" is ${user.status}.`);
  if (user.role !== role) throw new ApiError('DISABLED_IDENTITY', 'The session actor role no longer matches the stored persona.');
  state.currentUserId = user.id;
  state.currentRole = user.role;
  state.currentPerson = user.name;
}

export function buildActor(state: PrototypeState, userId: string, role: string): SessionActor {
  const user = state.users.find(candidate => candidate.id === userId);
  return {
    userId,
    personId: user?.personId || userId,
    name: user?.name ?? '',
    role: role as SessionActor['role'],
    clientIds: visibleClientIds(state),
    engagementIds: visibleEngagementIds(state)
  };
}

export async function resolveSession(env: Env, request: Request): Promise<ResolvedSession> {
  const token = parseCookies(request.headers.get('Cookie'))[sessionCookieName];
  if (!token) throw new ApiError('UNAUTHENTICATED', 'A workspace session is required. Resume with your access code.');
  const session = await findSessionByHash(env, await sha256Hex(token));
  if (!session) throw new ApiError('UNAUTHENTICATED', 'This workspace session is invalid or has been revoked.');
  // A `demo` row is the long-lived enrollment secret. It redeems into a fresh
  // short-lived `cloud` session; it is never itself accepted as a request session.
  if (session.mode !== 'cloud') {
    throw new ApiError('UNAUTHENTICATED', 'Resume the workspace with its access code to start a session.');
  }
  if (session.expires_at <= nowSeconds()) throw new ApiError('SESSION_EXPIRED', 'The workspace session expired. Resume again with the access code.');
  const { state, workspace } = await loadWorkspaceState(env, session.workspace_id);
  if (workspace.status !== 'active') throw new ApiError('WORKSPACE_FROZEN', 'This workspace is not writable.');
  const actor = session.actor_user_id
    ? (applyServerActor(state, session.actor_user_id, session.actor_role ?? ''), buildActor(state, session.actor_user_id, session.actor_role ?? ''))
    : { userId: '', personId: '', name: '', role: state.currentRole, clientIds: visibleClientIds(state), engagementIds: visibleEngagementIds(state) };
  return { session, state, actor };
}

/** Switch persona. The persona must exist and be active inside this workspace. */
export async function switchPersona(env: Env, session: SessionRow, state: PrototypeState, userId: string): Promise<SessionActor> {
  const requested = state.users.find(candidate => candidate.id === userId);
  if (!requested) throw new ApiError('NOT_FOUND', 'That persona is not available in this workspace.');
  if (requested.status !== 'Active') throw new ApiError('DISABLED_IDENTITY', `Persona "${requested.name}" is ${requested.status}.`);
  applyServerActor(state, requested.id, requested.role);
  await updateSessionActor(env, session.id, requested.id, requested.role);
  return buildActor(state, requested.id, requested.role);
}

export const sessionCookie = (token: string, ttlSeconds = SESSION_TTL_SECONDS): string =>
  serializeCookie(sessionCookieName, token, { maxAgeSeconds: ttlSeconds, sameSite: 'Strict' });

export const clearedSessionCookie = (): string =>
  serializeCookie(sessionCookieName, '', { maxAgeSeconds: 0, sameSite: 'Strict' });
