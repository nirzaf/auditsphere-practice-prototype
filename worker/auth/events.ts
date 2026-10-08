import type { Env } from '../env';

export interface AuthEventInput {
  id: string; workspaceId: string; userAccountId?: string | null; event: string;
  detail?: Record<string, unknown>; ipHash?: string | null; now: string;
}

export function authEventStatement(env: Env, input: AuthEventInput): D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO auth_events(id,workspace_id,user_account_id,event,detail_json,ip_sha256,created_at)
    VALUES(?,?,?,?,?,?,?)`).bind(input.id, input.workspaceId, input.userAccountId ?? null, input.event,
    JSON.stringify(input.detail ?? {}), input.ipHash ?? null, input.now);
}
