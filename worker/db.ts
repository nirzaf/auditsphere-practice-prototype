// Minimal D1 workspace lookup shared by BUSINESS domain modules.

import type { Env } from './env';
import { ApiError } from './errors';

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export interface WorkspaceRow {
  id: string;
  seed_id: string | null;
  name: string;
  schema_version: number;
  revision: number;
  status: 'active' | 'frozen' | 'deleted';
  data_mode: 'BUSINESS' | 'TEST';
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}

export async function getWorkspace(env: Env, workspaceId: string): Promise<WorkspaceRow | null> {
  return await env.DB.prepare(`SELECT id,seed_id,name,schema_version,revision,status,data_mode,created_at,updated_at,
                                      NULL AS expires_at
                               FROM workspaces
                               WHERE id=? AND status<>'deleted'`)
    .bind(workspaceId)
    .first<WorkspaceRow>();
}

export async function requireWorkspace(env: Env, workspaceId: string): Promise<WorkspaceRow> {
  const workspace = await getWorkspace(env, workspaceId);
  if (!workspace) throw new ApiError('NOT_FOUND', 'Workspace not found.');
  return workspace;
}
