// Shared session / persona contracts.
import type { RoleKey } from '../../types';

export type SessionMode = 'cloud' | 'demo';

/**
 * The authoritative actor. Resolved by the Worker from server-held state and the
 * session record — never taken from the request body. `clientIds`/`engagementIds`
 * mirror the pure `visibleClientIds`/`visibleEngagementIds` guard output.
 */
export interface SessionActor {
  userId: string;
  personId: string;
  name: string;
  role: RoleKey;
  clientIds: 'ALL' | string[];
  engagementIds: 'ALL' | string[];
}

export interface SessionInfo {
  sessionId: string;
  workspaceId: string;
  mode: SessionMode;
  actor: SessionActor;
  expiresAt: number;
}

export interface ResumeWorkspaceRequest {
  /** Copyable access code: `<workspaceId>.<sessionSecret>`. */
  accessCode: string;
}

export interface PersonaSwitchRequest {
  userId: string;
}

export interface CreateWorkspaceRequest {
  seedId: string;
  name?: string;
}

export interface CreateWorkspaceResponse {
  workspaceId: string;
  workspaceName: string;
  seedId: string | null;
  accessCode: string;
  schemaVersion: number;
  revision: number;
  expiresAt: number;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  seedId: string | null;
  schemaVersion: number;
  revision: number;
  status: 'active' | 'frozen' | 'deleted';
  dataMode: 'BUSINESS' | 'TEST';
  /** Present only for isolated TEST workspaces. */
  expiresAt?: number;
}

export interface SeedSummary {
  id: string;
  title: string;
  description: string;
}
