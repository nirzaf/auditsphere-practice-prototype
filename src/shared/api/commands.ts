// Shared command contract.
//
// The Worker executes these commands authoritatively. The browser sends the same
// typed union, so a request that is valid in TypeScript is the only shape the API
// accepts. This is deliberately a CLOSED union: the API never accepts arbitrary
// `state_json` replacement.
//
// Slice status: `client.*` and `lead.*` are migrated server-side. Remaining
// command families are listed in docs/prototype/cloud-full-stack-migration.md
// and are added to this union as their bodies are extracted into src/domain/.
import type { ClientRecord, PrototypeState } from '../../types';

export type WorkspaceCommand =
  | { type: 'client.create'; payload: { client: ClientRecord } }
  | { type: 'client.update'; payload: { client: ClientRecord; expectedProfileRevision: number } }
  | { type: 'lead.create'; payload: { lead: PrototypeState['leads'][number] } }
  | { type: 'lead.update'; payload: { lead: PrototypeState['leads'][number] } }
  | { type: 'lead.convert'; payload: { leadId: string; clientId?: string } }
  | { type: 'workspace.rename'; payload: { name: string } };

export type WorkspaceCommandType = WorkspaceCommand['type'];

export interface CommandEnvelope {
  command: WorkspaceCommand;
  /** Workspace revision the client last observed. A newer server revision -> 409. */
  expectedRevision?: number;
  /** Retry-safe key. Replaying the same key returns the original response. */
  idempotencyKey?: string;
}

export interface EntityChange {
  entityKind: string;
  entityId: string;
  clientId?: string;
  engagementId?: string;
  version: number;
  deleted?: boolean;
}

export interface CommandResponse {
  workspaceId: string;
  revision: number;
  changes: EntityChange[];
  auditSequence?: number;
  /** True when the response was served from the idempotency store. */
  replayed?: boolean;
}

export interface StateResponse {
  workspaceId: string;
  revision: number;
  schemaVersion: number;
  status: 'active' | 'frozen' | 'deleted';
  expiresAt: number;
  state: PrototypeState;
}

export interface ChangesResponse {
  workspaceId: string;
  revision: number;
  entities: Array<{ entityKind: string; entityId: string; clientId?: string; engagementId?: string; version: number; payload: unknown; deleted?: boolean }>;
  rootDocuments: Array<{ documentKey: string; version: number; payload: unknown }>;
  /** True when the caller's `since` is stale and a full entity set was returned. */
  fullResync?: boolean;
}

export interface AuditEvent {
  id: string;
  sequence: number;
  actorUserId?: string;
  actorRole?: string;
  commandType: string;
  entityKind?: string;
  entityId?: string;
  clientId?: string;
  engagementId?: string;
  beforeVersion?: number;
  afterVersion?: number;
  createdAt: number;
}
