// D1 access layer.
//
// All SQL lives here. Every value is bound (prepared statements); no user string
// is ever concatenated into SQL. Related writes use `DB.batch()` so a command's
// entity updates, audit event and idempotency record commit atomically.

import type { PrototypeState } from '../src/types';
import { MANIFEST_DOCUMENT_KEY, SCALARS_DOCUMENT_KEY, parseManifest, type WorkspaceManifest } from './env';
import type { Env } from './env';
import { ApiError } from './errors';
import { assembleState, decomposeState } from './state';

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export type WorkspaceStatus = 'active' | 'frozen' | 'deleted';

export interface WorkspaceRow {
  id: string;
  seed_id: string | null;
  name: string;
  schema_version: number;
  revision: number;
  status: WorkspaceStatus;
  data_mode: 'BUSINESS' | 'TEST';
  created_at: number;
  updated_at: number;
  /** TEST-only retention sidecar. BUSINESS workspaces have no expiry value. */
  expires_at: number | null;
}

/** The legacy retention clock applies only to isolated TEST workspaces. */
export function workspaceIsExpired(
  workspace: Pick<WorkspaceRow, 'data_mode' | 'expires_at'>,
  now = nowSeconds()
): boolean {
  return workspace.data_mode === 'TEST'
    && (workspace.expires_at === null || workspace.expires_at <= now);
}

export async function getWorkspace(env: Env, workspaceId: string): Promise<WorkspaceRow | null> {
  return await env.DB
    .prepare(`SELECT w.id,w.seed_id,w.name,w.schema_version,w.revision,w.status,w.data_mode,w.created_at,w.updated_at,
                     test_expiry.expires_at
              FROM workspaces AS w
              LEFT JOIN test_workspace_expiry AS test_expiry ON test_expiry.workspace_id=w.id
              WHERE w.id=? AND w.status<>'deleted'`)
    .bind(workspaceId)
    .first<WorkspaceRow>();
}

/** Enforce the isolated TEST workspace retention policy. BUSINESS data never expires. */
export async function requireWorkspace(env: Env, workspaceId: string): Promise<WorkspaceRow> {
  const workspace = await getWorkspace(env, workspaceId);
  if (!workspace) throw new ApiError('NOT_FOUND', 'Workspace not found.');
  if (workspaceIsExpired(workspace)) {
    throw new ApiError('WORKSPACE_EXPIRED', 'This test workspace has expired or has no valid test-retention record.');
  }
  return workspace;
}

export async function renameWorkspace(env: Env, workspaceId: string, name: string): Promise<void> {
  await env.DB.prepare('UPDATE workspaces SET name=?, updated_at=? WHERE id=?').bind(name, nowSeconds(), workspaceId).run();
}

/**
 * Atomically advance the workspace revision, failing closed when the caller's
 * expected revision is stale. Returns the new revision.
 */
export async function advanceWorkspaceRevision(
  env: Env,
  workspaceId: string,
  expectedRevision: number | undefined
): Promise<number> {
  const result = expectedRevision === undefined
    ? await env.DB.prepare('UPDATE workspaces SET revision=revision+1, updated_at=? WHERE id=?').bind(nowSeconds(), workspaceId).run()
    : await env.DB.prepare('UPDATE workspaces SET revision=revision+1, updated_at=? WHERE id=? AND revision=?')
      .bind(nowSeconds(), workspaceId, expectedRevision).run();
  if (!result.meta.changes) {
    const current = await getWorkspace(env, workspaceId);
    throw new ApiError('STALE_REVISION', 'Another client saved a newer revision. Reload before continuing.', {
      currentRevision: current?.revision
    });
  }
  return (expectedRevision ?? 0) + 1;
}

export interface SessionRow {
  id: string;
  workspace_id: string;
  token_hash: string;
  mode: 'cloud' | 'demo';
  actor_user_id: string | null;
  actor_role: string | null;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export async function findSessionByHash(env: Env, tokenHash: string): Promise<SessionRow | null> {
  return await env.DB
    .prepare(`SELECT id,workspace_id,token_hash,mode,actor_user_id,actor_role,created_at,expires_at,revoked_at
              FROM workspace_sessions WHERE token_hash=? AND revoked_at IS NULL`)
    .bind(tokenHash)
    .first<SessionRow>();
}

export async function updateSessionActor(env: Env, sessionId: string, userId: string, role: string): Promise<void> {
  await env.DB.prepare('UPDATE workspace_sessions SET actor_user_id=?, actor_role=? WHERE id=?').bind(userId, role, sessionId).run();
}

export async function revokeSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare('UPDATE workspace_sessions SET revoked_at=? WHERE id=?').bind(nowSeconds(), sessionId).run();
}

/**
 * Create a server session. Only the SHA-256 of the secret is stored, so a D1 read
 * cannot replay a session and logs never hold a usable secret.
 */
export async function createSessionRow(
  env: Env,
  input: {
    workspaceId: string;
    tokenHash: string;
    mode?: 'cloud' | 'demo';
    actorUserId?: string | null;
    actorRole?: string | null;
    ttlSeconds: number;
  }
): Promise<{ id: string; expiresAt: number }> {
  const id = crypto.randomUUID();
  const now = nowSeconds();
  const expiresAt = now + input.ttlSeconds;
  await env.DB.prepare(
    `INSERT INTO workspace_sessions(id,workspace_id,token_hash,mode,actor_user_id,actor_role,created_at,expires_at)
     VALUES(?,?,?,?,?,?,?,?)`
  ).bind(
    id, input.workspaceId, input.tokenHash, input.mode ?? 'cloud',
    input.actorUserId ?? null, input.actorRole ?? null, now, expiresAt
  ).run();
  return { id, expiresAt };
}

export interface LoadedWorkspace {
  workspace: WorkspaceRow;
  manifest: WorkspaceManifest;
  state: PrototypeState;
  /** Root documents as loaded, used to persist only what actually changed. */
  originalRootDocuments: Record<string, Record<string, unknown>>;
}

/** Write a freshly decomposed state into D1 (used at seed/materialise time). */
export async function writeDecomposedState(
  env: Env,
  workspaceId: string,
  state: PrototypeState,
  schemaVersion: number
): Promise<void> {
  const decomposed = decomposeState(state, schemaVersion);
  const now = nowSeconds();
  const documentSql = `INSERT INTO workspace_root_documents(workspace_id,document_key,version,payload_json,created_at,updated_at)
       VALUES(?,?,1,?,?,?)
       ON CONFLICT(workspace_id,document_key) DO UPDATE SET
         version=workspace_root_documents.version+1,
         payload_json=excluded.payload_json, updated_at=excluded.updated_at`;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(documentSql).bind(workspaceId, MANIFEST_DOCUMENT_KEY, JSON.stringify(decomposed.manifest), now, now),
    env.DB.prepare(documentSql).bind(workspaceId, SCALARS_DOCUMENT_KEY, JSON.stringify(decomposed.scalars), now, now)
  ];
  for (const [key, payload] of Object.entries(decomposed.rootDocuments)) {
    statements.push(env.DB.prepare(documentSql).bind(workspaceId, key, JSON.stringify(payload), now, now));
  }
  await runBatched(env, statements);
  const entitySql = `INSERT INTO workspace_entities(workspace_id,entity_kind,entity_id,client_id,engagement_id,version,payload_json,created_at,updated_at)
       VALUES(?,?,?,?,?,1,?,?,?)
       ON CONFLICT(workspace_id,entity_kind,entity_id) DO UPDATE SET
         version=workspace_entities.version+1,
         client_id=excluded.client_id, engagement_id=excluded.engagement_id,
         payload_json=excluded.payload_json, updated_at=excluded.updated_at, deleted_at=NULL`;
  for (const group of chunk(decomposed.entities, 40)) {
    await runBatched(env, group.map(entity => env.DB.prepare(entitySql).bind(
      workspaceId, entity.collection, entity.entityId,
      entity.clientId ?? null, entity.engagementId ?? null,
      JSON.stringify(entity.payload), now, now
    )));
  }
}

/** Create a workspace row from a named synthetic seed and materialise its state. */
export async function createSeededWorkspace(
  env: Env,
  options: { seedId: string | null; name: string; ttlSeconds: number }
): Promise<{ workspaceId: string; revision: number; expiresAt: number; schemaVersion: number }> {
  const workspaceId = crypto.randomUUID();
  const state = await resolveSeedState(env, options.seedId);
  const schemaVersion = Number((state as unknown as { schema?: unknown }).schema ?? 1) || 1;
  const now = nowSeconds();
  const expiresAt = now + options.ttlSeconds;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO workspaces(id,seed_id,name,schema_version,revision,status,created_at,updated_at,data_mode)
                    VALUES(?,?,?,?,1,'active',?,?,'TEST')`)
      .bind(workspaceId, options.seedId, options.name, schemaVersion, now, now),
    env.DB.prepare('INSERT INTO test_workspace_expiry(workspace_id,expires_at) VALUES(?,?)')
      .bind(workspaceId, expiresAt)
  ]);
  await writeDecomposedState(env, workspaceId, state, schemaVersion);
  return { workspaceId, revision: 1, expiresAt, schemaVersion };
}

/** Resolve a seed's state. A null seed id yields an empty-but-valid shell. */
export async function resolveSeedState(env: Env, seedId: string | null): Promise<PrototypeState> {
  if (seedId) {
    const seed = await env.DB.prepare('SELECT state_json FROM workspace_seeds WHERE id=?')
      .bind(seedId)
      .first<{ state_json: string }>();
    if (!seed) throw new ApiError('BAD_REQUEST', 'Choose an available seed.');
    const parsed = JSON.parse(seed.state_json) as PrototypeState;
    (parsed as unknown as { asOfDate?: string }).asOfDate = new Date().toISOString().slice(0, 10);
    return parsed;
  }
  return {
    schema: 1,
    id: crypto.randomUUID(),
    currentUserId: '',
    currentRole: 'superuser',
    currentPerson: '',
    clients: [],
    contacts: [],
    leads: [],
    proposals: [],
    engagements: [],
    documents: [],
    users: [],
    roleGrants: [],
    events: []
  } as unknown as PrototypeState;
}

/** Load and reassemble a workspace's authoritative `PrototypeState`. */
export async function loadWorkspaceState(env: Env, workspaceId: string): Promise<LoadedWorkspace> {
  const workspace = await requireWorkspace(env, workspaceId);
  const [documents, entities] = await Promise.all([
    env.DB.prepare('SELECT document_key,payload_json FROM workspace_root_documents WHERE workspace_id=?')
      .bind(workspaceId).all<{ document_key: string; payload_json: string }>(),
    env.DB.prepare(`SELECT entity_kind,entity_id,payload_json FROM workspace_entities
                    WHERE workspace_id=? AND deleted_at IS NULL`)
      .bind(workspaceId).all<{ entity_kind: string; entity_id: string; payload_json: string }>()
  ]);
  const rootDocuments: Record<string, Record<string, unknown>> = {};
  for (const row of documents.results ?? []) rootDocuments[row.document_key] = JSON.parse(row.payload_json);
  const manifest = parseManifest(rootDocuments[MANIFEST_DOCUMENT_KEY]) ?? {
    schemaVersion: workspace.schema_version,
    entityCollections: [],
    rootDocuments: []
  };
  const entitiesByCollection: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of entities.results ?? []) {
    (entitiesByCollection[row.entity_kind] ??= []).push(JSON.parse(row.payload_json));
  }
  const scalars = rootDocuments[SCALARS_DOCUMENT_KEY] ?? {};
  const state = assembleState(workspaceId, manifest, scalars, rootDocuments, entitiesByCollection);
  return { workspace, manifest, state, originalRootDocuments: rootDocuments };
}

/** D1 batch requests are bounded; keep statement batches small. */
async function runBatched(env: Env, statements: D1PreparedStatement[]): Promise<void> {
  for (const group of chunk(statements, 40)) await env.DB.batch(group);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

const ENTITY_UPSERT_SQL = `INSERT INTO workspace_entities(workspace_id,entity_kind,entity_id,client_id,engagement_id,version,payload_json,created_at,updated_at)
  VALUES(?,?,?,?,?,1,?,?,?)
  ON CONFLICT(workspace_id,entity_kind,entity_id) DO UPDATE SET
    version=workspace_entities.version+1,
    client_id=excluded.client_id, engagement_id=excluded.engagement_id,
    payload_json=excluded.payload_json, updated_at=excluded.updated_at, deleted_at=NULL`;

const distinctChanges = <T extends { entityKind: string; entityId: string }>(changes: T[]): T[] => {
  const map = new Map<string, T>();
  for (const change of changes) map.set(`${change.entityKind}:${change.entityId}`, change);
  return [...map.values()];
};

/** Root-document upsert used by every persistence path. */
const ROOT_DOCUMENT_UPSERT_SQL = `INSERT INTO workspace_root_documents(workspace_id,document_key,version,payload_json,created_at,updated_at)
    VALUES(?,?,1,?,?,?)
    ON CONFLICT(workspace_id,document_key) DO UPDATE SET
      version=workspace_root_documents.version+1,
      payload_json=excluded.payload_json, updated_at=excluded.updated_at`;

/**
 * Assertion rows let one D1 batch abort when an optimistic version check fails: the
 * CHECK constraint rejects `ok = 0`, so the transaction rolls back instead of
 * committing a prefix of the command. The rows are deleted in the same batch.
 */
const COMMAND_ASSERT_TABLE = 'command_assertions';

/**
 * A command's whole effect must commit in ONE batch. Beyond this many statements the
 * command fails closed rather than being split, because a partially committed
 * command would otherwise be reported as successful.
 */
const COMMAND_STATEMENT_LIMIT = 100;

export interface VersionRef {
  entity: string;
  id: string;
  version: number;
}

/**
 * Build the entity and root-document rows a command touched without executing them,
 * so a caller can commit them together with the revision, audit and idempotency rows
 * in a single transaction.
 */
export function buildCommandRowStatements(
  env: Env,
  workspaceId: string,
  state: PrototypeState,
  manifest: WorkspaceManifest,
  upserts: Array<{ entityKind: string; entityId: string }>,
  removals: Array<{ entityKind: string; entityId: string }>,
  originalRootDocuments: Record<string, Record<string, unknown>>,
  manifestUpdate: WorkspaceManifest | undefined,
  now: number
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  for (const change of distinctChanges(upserts)) {
    const collection = (state as unknown as Record<string, unknown>)[change.entityKind];
    if (!Array.isArray(collection)) continue;
    const item = collection.find(candidate =>
      Boolean(candidate) && typeof candidate === 'object' && (candidate as { id?: unknown }).id === change.entityId);
    if (!item) continue;
    const record = item as Record<string, unknown>;
    const clientId = (record.clientId ?? (change.entityKind === 'clients' ? record.id : undefined) ?? record.client) as string | undefined;
    const engagementId = (record.engagementId ?? (change.entityKind === 'engagements' ? record.id : undefined) ?? record.engagement) as string | undefined;
    statements.push(env.DB.prepare(ENTITY_UPSERT_SQL).bind(
      workspaceId, change.entityKind, change.entityId,
      typeof clientId === 'string' ? clientId : null,
      typeof engagementId === 'string' ? engagementId : null,
      JSON.stringify(record), now, now
    ));
  }

  if (removals.length) {
    const removalSql = `UPDATE workspace_entities SET deleted_at=?, updated_at=?
      WHERE workspace_id=? AND entity_kind=? AND entity_id=? AND deleted_at IS NULL`;
    for (const removal of distinctChanges(removals)) {
      statements.push(env.DB.prepare(removalSql).bind(now, now, workspaceId, removal.entityKind, removal.entityId));
    }
  }

  for (const key of manifest.rootDocuments) {
    const current = (state as unknown as Record<string, unknown>)[key];
    if (current === undefined) continue;
    if (JSON.stringify(current) === JSON.stringify(originalRootDocuments[key])) continue;
    statements.push(env.DB.prepare(ROOT_DOCUMENT_UPSERT_SQL).bind(workspaceId, key, JSON.stringify(current), now, now));
  }

  if (manifestUpdate) {
    statements.push(env.DB.prepare(ROOT_DOCUMENT_UPSERT_SQL)
      .bind(workspaceId, MANIFEST_DOCUMENT_KEY, JSON.stringify(manifestUpdate), now, now));
  }

  return statements;
}

/**
 * Persist ONLY the entities a command actually touched, plus any root document whose
 * content changed. Retained for callers that do not need the atomic path.
 */
export async function persistCommandChanges(
  env: Env,
  workspaceId: string,
  state: PrototypeState,
  manifest: WorkspaceManifest,
  changes: Array<{ entityKind: string; entityId: string }>,
  originalRootDocuments: Record<string, Record<string, unknown>>
): Promise<void> {
  const now = nowSeconds();
  await runBatched(env, buildCommandRowStatements(
    env, workspaceId, state, manifest, changes, [], originalRootDocuments, undefined, now
  ));
}


/**
 * Soft-delete entity rows a command removed from the authoritative state. Rows are
 * marked `deleted_at` rather than dropped, so the workspace can still explain what
 * happened.
 */
export async function persistEntityRemovals(
  env: Env,
  workspaceId: string,
  removals: Array<{ entityKind: string; entityId: string }>
): Promise<void> {
  if (!removals.length) return;
  const now = nowSeconds();
  const sql = `UPDATE workspace_entities SET deleted_at=?, updated_at=?
    WHERE workspace_id=? AND entity_kind=? AND entity_id=? AND deleted_at IS NULL`;
  const statements = distinctChanges(removals).map(removal =>
    env.DB.prepare(sql).bind(now, now, workspaceId, removal.entityKind, removal.entityId)
  );
  await runBatched(env, statements);
}

/** Persist an extended layout manifest when a command introduced new collections. */
export async function persistManifest(env: Env, workspaceId: string, manifest: WorkspaceManifest): Promise<void> {
  const now = nowSeconds();
  const sql = `INSERT INTO workspace_root_documents(workspace_id,document_key,version,payload_json,created_at,updated_at)
    VALUES(?,?,1,?,?,?)
    ON CONFLICT(workspace_id,document_key) DO UPDATE SET
      version=workspace_root_documents.version+1,
      payload_json=excluded.payload_json, updated_at=excluded.updated_at`;
  await env.DB.prepare(sql).bind(workspaceId, MANIFEST_DOCUMENT_KEY, JSON.stringify(manifest), now, now).run();
}

/** Current stored versions for the entities a caller declared. */
export async function readEntityVersions(
  env: Env,
  workspaceId: string,
  refs: VersionRef[]
): Promise<Record<string, number>> {
  const versions: Record<string, number> = {};
  for (const ref of refs) {
    const row = await env.DB.prepare(
      `SELECT version FROM workspace_entities
       WHERE workspace_id=? AND entity_kind=? AND entity_id=? AND deleted_at IS NULL`
    ).bind(workspaceId, ref.entity, ref.id).first<{ version: number }>();
    versions[`${ref.entity}:${ref.id}`] = row?.version ?? 0;
  }
  return versions;
}

export interface AtomicCommandInput {
  workspaceId: string;
  state: PrototypeState;
  manifest: WorkspaceManifest;
  originalRootDocuments: Record<string, Record<string, unknown>>;
  upserts: Array<{ entityKind: string; entityId: string }>;
  removals: Array<{ entityKind: string; entityId: string }>;
  manifestUpdate?: WorkspaceManifest;
  /** Entity versions the caller observed. A drift aborts the batch. */
  expectedVersions: VersionRef[];
  newName?: string;
  audit: Omit<AuditEventInput, 'workspaceId'>;
  idempotency?: { key: string; requestHash: string; response: unknown };
}

/**
 * Apply a command's entire effect in ONE D1 batch.
 *
 * The previous path issued three independent commits (revision bump, row writes,
 * audit/idempotency), so a failure could leave a prefix of the work applied while the
 * caller was told the command failed. Everything now commits together or not at all.
 *
 * Concurrency is per entity: a stale declared version aborts the batch through a
 * CHECK-constrained assertion row, and the workspace revision is a monotonic change
 * cursor rather than a gate, so independent edits to different rows no longer
 * conflict with each other.
 */
export async function executeCommandAtomically(
  env: Env,
  input: AtomicCommandInput
): Promise<{ revision: number; auditSequence: string }> {
  const now = nowSeconds();
  const statements: D1PreparedStatement[] = [];

  input.expectedVersions.forEach((ref, seq) => {
    statements.push(env.DB.prepare(
      `INSERT INTO ${COMMAND_ASSERT_TABLE}(workspace_id,seq,ok)
       SELECT ?,?,CASE WHEN EXISTS(SELECT 1 FROM workspace_entities
         WHERE workspace_id=? AND entity_kind=? AND entity_id=? AND version=? AND deleted_at IS NULL)
         THEN 1 ELSE 0 END`
    ).bind(input.workspaceId, seq, input.workspaceId, ref.entity, ref.id, ref.version));
  });

  statements.push(env.DB.prepare('UPDATE workspaces SET revision=revision+1, updated_at=? WHERE id=?')
    .bind(now, input.workspaceId));
  if (input.newName !== undefined) {
    statements.push(env.DB.prepare('UPDATE workspaces SET name=?, updated_at=? WHERE id=?')
      .bind(input.newName, now, input.workspaceId));
  }

  statements.push(...buildCommandRowStatements(
    env, input.workspaceId, input.state, input.manifest,
    input.upserts, input.removals, input.originalRootDocuments, input.manifestUpdate, now
  ));

  const audit = auditEventStatement(env, { ...input.audit, workspaceId: input.workspaceId });
  statements.push(audit.statement);

  if (input.idempotency) {
    statements.push(idempotencyStatement(
      env, input.workspaceId, input.idempotency.key, input.idempotency.requestHash, input.idempotency.response
    ));
  }

  if (input.expectedVersions.length) {
    statements.push(env.DB.prepare(`DELETE FROM ${COMMAND_ASSERT_TABLE} WHERE workspace_id=?`).bind(input.workspaceId));
  }

  if (statements.length > COMMAND_STATEMENT_LIMIT) {
    throw new ApiError(
      'UNAVAILABLE',
      `This command changes ${statements.length} rows, above the atomic batch limit of ${COMMAND_STATEMENT_LIMIT}; nothing was saved.`
    );
  }

  await env.DB.batch(statements);
  const workspace = await getWorkspace(env, input.workspaceId);
  return { revision: workspace?.revision ?? 0, auditSequence: audit.id };
}

export interface AuditEventInput {
  workspaceId: string;
  actorUserId?: string;
  actorRole?: string;
  commandType: string;
  entityKind?: string;
  entityId?: string;
  clientId?: string;
  engagementId?: string;
  beforeVersion?: number;
  afterVersion?: number;
  details?: unknown;
}

/** Append-only audit trail. The sequence is allocated in SQL so it cannot race. */
export function auditEventStatement(env: Env, event: AuditEventInput): { id: string; statement: D1PreparedStatement } {
  const id = crypto.randomUUID();
  const statement = env.DB.prepare(
    `INSERT INTO audit_events(id,workspace_id,sequence,actor_user_id,actor_role,command_type,entity_kind,entity_id,client_id,engagement_id,before_version,after_version,details_json,created_at)
     SELECT ?,?,COALESCE(MAX(sequence),0)+1,?,?,?,?,?,?,?,?,?,?,? FROM audit_events WHERE workspace_id=?`
  ).bind(
    id, event.workspaceId,
    event.actorUserId ?? null, event.actorRole ?? null, event.commandType,
    event.entityKind ?? null, event.entityId ?? null, event.clientId ?? null, event.engagementId ?? null,
    event.beforeVersion ?? null, event.afterVersion ?? null,
    event.details === undefined ? null : JSON.stringify(event.details),
    nowSeconds(), event.workspaceId
  );
  return { id, statement };
}

export async function listAuditEvents(env: Env, workspaceId: string, limit = 200): Promise<unknown[]> {
  const result = await env.DB.prepare(
    `SELECT id,sequence,actor_user_id,actor_role,command_type,entity_kind,entity_id,client_id,engagement_id,
            before_version,after_version,details_json,created_at
     FROM audit_events WHERE workspace_id=? ORDER BY sequence DESC LIMIT ?`
  ).bind(workspaceId, Math.min(Math.max(limit, 1), 500)).all();
  return result.results ?? [];
}

export interface IdempotencyRow {
  idempotency_key: string;
  request_hash: string;
  response_json: string;
}

export async function getIdempotentResponse(env: Env, workspaceId: string, key: string): Promise<IdempotencyRow | null> {
  return await env.DB.prepare(
    'SELECT idempotency_key,request_hash,response_json FROM idempotency_keys WHERE workspace_id=? AND idempotency_key=? AND expires_at>?'
  ).bind(workspaceId, key, nowSeconds()).first<IdempotencyRow>();
}

export function idempotencyStatement(
  env: Env,
  workspaceId: string,
  key: string,
  requestHash: string,
  response: unknown
): D1PreparedStatement {
  const now = nowSeconds();
  return env.DB.prepare(
    `INSERT INTO idempotency_keys(workspace_id,idempotency_key,request_hash,response_json,created_at,expires_at)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(workspace_id,idempotency_key) DO UPDATE SET
       request_hash=excluded.request_hash, response_json=excluded.response_json, expires_at=excluded.expires_at`
  ).bind(workspaceId, key, requestHash, JSON.stringify(response), now, now + 24 * 60 * 60);
}

/** Read a single entity directly (scoped reads avoid loading the whole state). */
export async function readEntity(
  env: Env,
  workspaceId: string,
  entityKind: string,
  entityId: string
): Promise<{ payload: unknown; version: number; clientId: string | null; engagementId: string | null } | null> {
  const row = await env.DB.prepare(
    `SELECT payload_json,version,client_id,engagement_id FROM workspace_entities
     WHERE workspace_id=? AND entity_kind=? AND entity_id=? AND deleted_at IS NULL`
  ).bind(workspaceId, entityKind, entityId)
    .first<{ payload_json: string; version: number; client_id: string | null; engagement_id: string | null }>();
  if (!row) return null;
  return { payload: JSON.parse(row.payload_json), version: row.version, clientId: row.client_id, engagementId: row.engagement_id };
}

export interface EntityRow {
  entity_kind: string;
  entity_id: string;
  client_id: string | null;
  engagement_id: string | null;
  version: number;
  payload_json: string;
}

/** Raw entity rows with versions, used by the change feed. */
export async function listEntityRows(env: Env, workspaceId: string): Promise<EntityRow[]> {
  const result = await env.DB.prepare(
    `SELECT entity_kind,entity_id,client_id,engagement_id,version,payload_json FROM workspace_entities
     WHERE workspace_id=? AND deleted_at IS NULL`
  ).bind(workspaceId).all<EntityRow>();
  return result.results ?? [];
}

export interface RootDocumentRow {
  document_key: string;
  version: number;
  payload_json: string;
}

export async function listRootDocumentRows(env: Env, workspaceId: string): Promise<RootDocumentRow[]> {
  const result = await env.DB.prepare(
    'SELECT document_key,version,payload_json FROM workspace_root_documents WHERE workspace_id=?'
  ).bind(workspaceId).all<RootDocumentRow>();
  return result.results ?? [];
}
