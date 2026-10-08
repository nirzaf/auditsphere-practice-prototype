import { createAuthSession } from '../../worker/auth/sessions';
import type { Env } from '../../worker/env';
import type { BusinessE2eServer } from './businessE2eServer.js';

type TestDatabase = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

const tokens = new WeakMap<object, Map<string, string>>();

/** Creates a real session and profile grant for API tests without driving Entra. */
export async function authSessionCookie(db: TestDatabase, workspaceId: string, requestedActorProfileId?: string): Promise<string> {
  const actorProfileId = requestedActorProfileId ?? (await db.prepare(`SELECT id FROM actor_profiles
    WHERE workspace_id=? AND active=1 ORDER BY CASE persona WHEN 'APPROVER' THEN 0 WHEN 'PREPARER' THEN 1 WHEN 'REVIEWER' THEN 2 ELSE 3 END,id LIMIT 1`)
    .bind(workspaceId).first<{ id: string }>())?.id;
  if (!actorProfileId) throw new Error(`Cannot create test authentication for workspace ${workspaceId} without an active actor profile.`);
  let byProfile = tokens.get(db as object);
  if (!byProfile) { byProfile = new Map(); tokens.set(db as object, byProfile); }
  const key = `${workspaceId}:${actorProfileId}`;
  const cached = byProfile.get(key);
  if (cached) return cached;

  const profile = await db.prepare(`SELECT ap.persona,ap.staff_member_id,ap.contact_id,sm.display_name AS staff_name,
      sm.grade, c.full_name AS client_name,c.email AS client_email
    FROM actor_profiles ap LEFT JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
    LEFT JOIN contacts c ON c.workspace_id=ap.workspace_id AND c.id=ap.contact_id
    WHERE ap.workspace_id=? AND ap.id=?`).bind(workspaceId, actorProfileId)
    .first<{ persona: string; staff_member_id: string | null; contact_id: string | null; staff_name: string | null; grade: string | null; client_name: string | null; client_email: string | null }>();
  if (!profile) throw new Error(`Cannot create test authentication for missing actor profile ${actorProfileId}.`);

  const identityKey = profile.persona === 'CLIENT' ? `contact:${profile.contact_id}` : `staff:${profile.staff_member_id}`;
  const identityDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${workspaceId}:${identityKey}`));
  const identityHash = [...new Uint8Array(identityDigest)].map(value => value.toString(16).padStart(2, '0')).join('');
  const userAccountId = `test-user-${identityHash.slice(0, 24)}`;
  const email = profile.persona === 'CLIENT' && profile.client_email ? profile.client_email.trim().toLowerCase() : `${userAccountId}@auditsphere.test`;
  const displayName = profile.persona === 'CLIENT' ? profile.client_name || 'Test Client' : profile.staff_name || 'Test Staff';
  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO user_accounts(id,workspace_id,kind,email_normalized,display_name,staff_member_id,contact_id,status,
      external_issuer,external_subject,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'ACTIVE',NULL,NULL,?,?)`).bind(userAccountId, workspaceId,
    profile.persona === 'CLIENT' ? 'CLIENT' : 'STAFF', email, displayName, profile.staff_member_id, profile.contact_id, now, now).run();
  await db.prepare(`INSERT OR IGNORE INTO user_profile_grants(id,workspace_id,user_account_id,actor_profile_id,granted_by_actor_id,granted_at)
    VALUES(?,?,?,?,NULL,?)`).bind(crypto.randomUUID(), workspaceId, userAccountId, actorProfileId, now).run();

  const created = await createAuthSession({ DB: db } as unknown as Env, {
    workspaceId, userAccountId, authMethod: 'OIDC_ENTRA', activeActorProfileId: actorProfileId, now
  });
  const cookie = `__Host-as_session=${created.token}`;
  byProfile.set(key, cookie);
  return cookie;
}

/** Installs a real test session in a headless browser through its CDP Network domain. */
export async function setBrowserAuthSession(
  tab: { command(method: string, params?: Record<string, unknown>): Promise<any> },
  server: BusinessE2eServer,
  workspaceId: string,
  actorProfileId: string
): Promise<void> {
  const cookie = await authSessionCookie(server.db, workspaceId, actorProfileId);
  const separator = cookie.indexOf('=');
  const result = await tab.command('Network.setCookie', {
    name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: server.origin,
    path: '/', secure: true, httpOnly: true, sameSite: 'Lax'
  });
  if (result?.success === false) throw new Error('The test browser rejected the cookie-backed auth session.');
}
