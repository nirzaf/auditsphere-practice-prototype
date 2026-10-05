// AuditSphere cloud API — Worker entry point.
//
// One Worker serves BOTH the built React app (Workers Static Assets) and this
// JSON API under /api/*. Deployed same-origin, so there is no CORS surface and
// the session cookie can be SameSite=Strict.
//
// Every mutating handler: authenticates the session, resolves the actor from
// SERVER state, enforces scope/revision inside the shared domain guards, persists
// only changed rows, and appends an audit event.

import type { CommandEnvelope, CommandResponse, ChangesResponse, StateResponse } from '../src/shared/api/commands';
import type { CreateWorkspaceRequest, CreateWorkspaceResponse, PersonaSwitchRequest, ResumeWorkspaceRequest, SessionInfo, WorkspaceSummary, SeedSummary } from '../src/shared/api/sessions';
import type { FileCompleteRequest, FileInitRequest } from '../src/shared/api/files';
import { runWorkspaceCommand } from '../src/domain/commands';
import { runtimeCommandContext } from '../src/domain/commandContext';
import {
  advanceWorkspaceRevision,
  auditEventStatement,
  createSeededWorkspace,
  createSessionRow,
  findSessionByHash,
  getWorkspace,
  idempotencyStatement,
  getIdempotentResponse,
  listAuditEvents,
  listEntityRows,
  listRootDocumentRows,
  loadWorkspaceState,
  persistCommandChanges,
  persistEntityRemovals,
  persistManifest,
  readEntityVersions,
  executeCommandAtomically,
  readEntity,
  renameWorkspace,
  requireWorkspace,
  revokeSession,
  nowSeconds
} from './db';
import type { Env } from './env';
import { ApiError, toApiError } from './errors';
import { assertSameOrigin, baseHeaders, jsonResponse, readJson, sha256Hex } from './http';
import { createRouter, type RouteContext } from './router';
import {
  SESSION_TTL_SECONDS,
  WORKSPACE_TTL_SECONDS,
  buildActor,
  clearedSessionCookie,
  newAccessCode,
  resolveSession,
  sessionCookie,
  switchPersona
} from './sessions';
import {
  buildDownloadResponse,
  cleanupStagedFiles,
  completeFile,
  deleteFile,
  getFileRow,
  initializeFile,
  listFileRows,
  toFileMetadata,
  writeFileContent
} from './files';
import { diffEntityCollections, snapshotEntityCollections, scopeOf } from './state';

const JSON_BODY_LIMIT = 1_000_000;
/** Hard ceiling for a single command payload; the domain model is small. */
const COMMAND_BODY_LIMIT = 512_000;

/** Per-IP/route rate limit using the optional Worker Rate Limiting binding. */
async function enforceRateLimit(ctx: RouteContext, bucket: string, key: string): Promise<void> {
  const limiter = ctx.env.RATE_LIMITER;
  if (!limiter) return;
  const outcome = await limiter.limit({ key: `${bucket}:${key}` });
  if (!outcome.success) throw new ApiError('RATE_LIMITED', 'Too many requests. Wait a moment and try again.');
}

const clientKey = (ctx: RouteContext): string =>
  ctx.request.headers.get('CF-Connecting-IP') || 'local';

const workspaceSummary = (row: { id: string; name: string; seed_id: string | null; schema_version: number; revision: number; status: WorkspaceSummary['status']; expires_at: number }): WorkspaceSummary => ({
  id: row.id,
  name: row.name,
  seedId: row.seed_id,
  schemaVersion: row.schema_version,
  revision: row.revision,
  status: row.status,
  expiresAt: row.expires_at
});

// --- Health & seeds ---------------------------------------------------------

const handleHealth = async (ctx: RouteContext): Promise<Response> => {
  await ctx.env.DB.prepare('SELECT 1').first();
  return jsonResponse({ ok: true, storage: 'D1+R2', mode: 'cloud-workspace', version: 2 }, 200, ctx.requestId);
};

const handleSeeds = async (ctx: RouteContext): Promise<Response> => {
  // Seed catalog intentionally excludes state_json so a seed is never leaked.
  const result = await ctx.env.DB.prepare('SELECT id,title,description FROM workspace_seeds ORDER BY id').all<SeedSummary>();
  return jsonResponse({ seeds: result.results ?? [] }, 200, ctx.requestId);
};

// --- Workspaces -------------------------------------------------------------

const handleCreateWorkspace = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  await enforceRateLimit(ctx, 'workspace.create', clientKey(ctx));
  const body = await readJson<CreateWorkspaceRequest>(ctx.request, 64 * 1024);
  if (!body || typeof body.seedId !== 'string') throw new ApiError('BAD_REQUEST', 'Choose an available seed.');
  const name = (typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'AuditSphere demo workspace').slice(0, 200);
  const created = await createSeededWorkspace(ctx.env, { seedId: body.seedId, name, ttlSeconds: WORKSPACE_TTL_SECONDS });
  const loaded = await loadWorkspaceState(ctx.env, created.workspaceId);

  // Seed the initial persona from the workspace itself, never from the request.
  const seedUser = loaded.state.users.find(u => u.id === loaded.state.currentUserId && u.status === 'Active')
    ?? loaded.state.users.find(u => u.status === 'Active');
  const accessCode = newAccessCode();
  const sessionToken = newAccessCode();
  await createSessionRow(ctx.env, {
    workspaceId: created.workspaceId,
    tokenHash: await sha256Hex(accessCode),
    mode: 'demo',
    actorUserId: seedUser?.id ?? null,
    actorRole: seedUser?.role ?? null,
    ttlSeconds: WORKSPACE_TTL_SECONDS
  });
  await createSessionRow(ctx.env, {
    workspaceId: created.workspaceId,
    tokenHash: await sha256Hex(sessionToken),
    mode: 'cloud',
    actorUserId: seedUser?.id ?? null,
    actorRole: seedUser?.role ?? null,
    ttlSeconds: SESSION_TTL_SECONDS
  });

  const response: CreateWorkspaceResponse = {
    workspaceId: created.workspaceId,
    workspaceName: name,
    seedId: body.seedId,
    accessCode: `${created.workspaceId}.${accessCode}`,
    schemaVersion: created.schemaVersion,
    revision: created.revision,
    expiresAt: created.expiresAt
  };
  return jsonResponse(response, 201, ctx.requestId, { 'Set-Cookie': sessionCookie(sessionToken) });
};

const handleResumeWorkspace = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  await enforceRateLimit(ctx, 'workspace.resume', clientKey(ctx));
  const body = await readJson<ResumeWorkspaceRequest>(ctx.request, 16 * 1024);
  const [workspaceId, secret] = (body?.accessCode ?? '').trim().split('.');
  if (!/^[a-f0-9-]{36}$/.test(workspaceId ?? '') || !/^[a-f0-9]{64}$/.test(secret ?? '')) {
    throw new ApiError('BAD_REQUEST', 'Enter a valid workspace access code.');
  }
  await requireWorkspace(ctx.env, workspaceId);
  const enrollment = await findSessionByHash(ctx.env, await sha256Hex(secret));
  if (!enrollment || enrollment.workspace_id !== workspaceId || enrollment.expires_at <= nowSeconds()) {
    throw new ApiError('UNAUTHENTICATED', 'This access code is not valid for that workspace.');
  }
  const sessionToken = newAccessCode();
  await createSessionRow(ctx.env, {
    workspaceId,
    tokenHash: await sha256Hex(sessionToken),
    mode: 'cloud',
    actorUserId: enrollment.actor_user_id,
    actorRole: enrollment.actor_role,
    ttlSeconds: SESSION_TTL_SECONDS
  });
  return jsonResponse({ workspaceId, resumed: true }, 200, ctx.requestId, { 'Set-Cookie': sessionCookie(sessionToken) });
};

const handleGetWorkspace = async (ctx: RouteContext): Promise<Response> => {
  const { session } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const row = await requireWorkspace(ctx.env, ctx.params.workspaceId);
  const info: SessionInfo = { sessionId: session.id, workspaceId: row.id, mode: session.mode, actor: buildActor(await loadWorkspaceState(ctx.env, row.id).then(l => l.state), session.actor_user_id ?? '', session.actor_role ?? ''), expiresAt: session.expires_at };
  return jsonResponse({ workspace: workspaceSummary(row), session: { expiresAt: session.expires_at }, actor: info.actor }, 200, ctx.requestId);
};

const handleDeleteWorkspace = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const { session } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  await ctx.env.DB.prepare("UPDATE workspaces SET status='deleted', updated_at=? WHERE id=?")
    .bind(nowSeconds(), ctx.params.workspaceId).run();
  await revokeSession(ctx.env, session.id);
  return jsonResponse({ deleted: true }, 200, ctx.requestId, { 'Set-Cookie': clearedSessionCookie() });
};

// --- Session / persona ------------------------------------------------------

const handlePersonaSwitch = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const { session, state } = await resolveSession(ctx.env, ctx.request);
  const body = await readJson<PersonaSwitchRequest>(ctx.request, 8 * 1024);
  if (!body || typeof body.userId !== 'string') throw new ApiError('BAD_REQUEST', 'A persona userId is required.');
  // The requested persona must already exist and be active INSIDE this workspace.
  const actor = await switchPersona(ctx.env, session, state, body.userId);
  return jsonResponse({ actor }, 200, ctx.requestId);
};

const handleLogout = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const { session } = await resolveSession(ctx.env, ctx.request);
  await revokeSession(ctx.env, session.id);
  return jsonResponse({ loggedOut: true }, 200, ctx.requestId, { 'Set-Cookie': clearedSessionCookie() });
};

// --- State & change feed ----------------------------------------------------

const handleState = async (ctx: RouteContext): Promise<Response> => {
  const { session, state } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const row = await requireWorkspace(ctx.env, ctx.params.workspaceId);
  const response: StateResponse = {
    workspaceId: row.id,
    revision: row.revision,
    schemaVersion: row.schema_version,
    status: row.status,
    expiresAt: row.expires_at,
    state
  };
  return jsonResponse(response, 200, ctx.requestId);
};

const handleChanges = async (ctx: RouteContext): Promise<Response> => {
  const { session } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const row = await requireWorkspace(ctx.env, ctx.params.workspaceId);
  const since = Number(ctx.url.searchParams.get('since'));
  // When the caller is already at the current revision there is nothing to send.
  if (Number.isInteger(since) && since === row.revision) {
    const empty: ChangesResponse = { workspaceId: row.id, revision: row.revision, entities: [], rootDocuments: [] };
    return jsonResponse(empty, 200, ctx.requestId);
  }
  const [entities, documents] = await Promise.all([
    listEntityRows(ctx.env, row.id),
    listRootDocumentRows(ctx.env, row.id)
  ]);
  const response: ChangesResponse = {
    workspaceId: row.id,
    revision: row.revision,
    // Entity versions are per-entity, so a stale `since` returns the full set and
    // says so explicitly rather than pretending to be a precise delta.
    fullResync: true,
    entities: entities.map(entity => ({
      entityKind: entity.entity_kind,
      entityId: entity.entity_id,
      clientId: entity.client_id ?? undefined,
      engagementId: entity.engagement_id ?? undefined,
      version: entity.version,
      payload: JSON.parse(entity.payload_json)
    })),
    rootDocuments: documents
      .filter(document => !document.document_key.startsWith('__'))
      .map(document => ({ documentKey: document.document_key, version: document.version, payload: JSON.parse(document.payload_json) }))
  };
  return jsonResponse(response, 200, ctx.requestId);
};

const handleEvents = async (ctx: RouteContext): Promise<Response> => {
  const { session } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  await requireWorkspace(ctx.env, ctx.params.workspaceId);
  const limit = Number(ctx.url.searchParams.get('limit') ?? 200);
  return jsonResponse({ events: await listAuditEvents(ctx.env, ctx.params.workspaceId, Number.isFinite(limit) ? limit : 200) }, 200, ctx.requestId);
};

/** Authoritative stored versions for a returned change list (read after commit). */
async function withLiveVersions(
  env: Env,
  workspaceId: string,
  items: Array<{ entityKind: string; entityId: string; clientId?: string; engagementId?: string; version: number }>
): Promise<Array<{ entityKind: string; entityId: string; clientId?: string; engagementId?: string; version: number }>> {
  return Promise.all(items.map(async item => ({
    ...item,
    version: (await readEntity(env, workspaceId, item.entityKind, item.entityId))?.version ?? 0
  })));
}

// --- Commands (server-authoritative) ---------------------------------------

/**
 * The ONLY mutation path for structured state. The client cannot replace
 * `state_json`; it submits a typed command that the Worker validates with the
 * shared domain guards before anything is written.
 */
const handleCommand = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const workspaceId = ctx.params.workspaceId;
  await enforceRateLimit(ctx, 'workspace.command', `${clientKey(ctx)}:${workspaceId}`);

  const { session, state, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');

  const envelope = await readJson<CommandEnvelope>(ctx.request, COMMAND_BODY_LIMIT);
  if (!envelope || !envelope.command || typeof envelope.command.type !== 'string') {
    throw new ApiError('BAD_REQUEST', 'A typed command is required.');
  }

  const requestHash = await sha256Hex(JSON.stringify(envelope));
  if (envelope.idempotencyKey) {
    const existing = await getIdempotentResponse(ctx.env, workspaceId, envelope.idempotencyKey);
    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new ApiError('IDEMPOTENCY_MISMATCH', 'This idempotency key was already used with a different request.');
      }
      // The recorded payload is the original outcome except for the workspace revision,
      // which is a live cursor rather than part of the command's result.
      const replay = JSON.parse(existing.response_json) as CommandResponse;
      const live = await getWorkspace(ctx.env, workspaceId);
      return jsonResponse({
        ...replay,
        revision: live?.revision ?? replay.revision,
        changes: await withLiveVersions(ctx.env, workspaceId, replay.changes),
        replayed: true
      }, 200, ctx.requestId);
    }
  }

  const loaded = await loadWorkspaceState(ctx.env, workspaceId);

  // Snapshot the entity collections so the command's real effect is derived from the
  // state itself rather than a hand-maintained change list.
  const before = snapshotEntityCollections(state, loaded.manifest.entityCollections);

  // Optimistic concurrency is per entity: a stale declared version is rejected before
  // anything is written. The workspace revision is a monotonic change cursor rather
  // than a gate, so two clients editing different rows never conflict.
  const expectedVersions = envelope.expectedVersions ?? [];
  if (expectedVersions.length) {
    const current = await readEntityVersions(ctx.env, workspaceId, expectedVersions);
    const drifted = expectedVersions.filter(ref => current[`${ref.entity}:${ref.id}`] !== ref.version);
    if (drifted.length) {
      throw new ApiError('VERSION_CONFLICT', 'Another client changed one of these records. Reload before continuing.', {
        currentVersions: drifted.map(ref => ({
          entity: ref.entity,
          id: ref.id,
          version: current[`${ref.entity}:${ref.id}`]
        }))
      });
    }
  }

  const trail: string[] = [];
  const domain = runWorkspaceCommand(state, envelope.command, runtimeCommandContext((text, ref) => {
    trail.push(`${ref}: ${text}`);
  }));

  // Persist what the command actually changed: added/updated entities, removed
  // entities, any root document whose content differs, the monotonic revision bump,
  // the audit event and the idempotency record — all in ONE batch, so a failure can
  // never leave a prefix of the command committed.
  const diff = diffEntityCollections(state, loaded.manifest, before);
  const changes = diff.upserts.map(change => {
    const collection = (state as unknown as Record<string, unknown>)[change.entityKind];
    const item = Array.isArray(collection)
      ? (collection as Array<Record<string, unknown>>).find(candidate => candidate && (candidate as { id?: unknown }).id === change.entityId)
      : undefined;
    const scope = scopeOf(change.entityKind, item ?? {});
    return {
      entityKind: change.entityKind,
      entityId: change.entityId,
      clientId: scope.clientId,
      engagementId: scope.engagementId,
      version: 0
    };
  });

  // The revision is assigned inside the batch, so the recorded replay payload carries
  // every other field and the caller-facing revision is read back live.
  const recorded: Omit<CommandResponse, 'revision'> = { workspaceId, changes, replayed: false };

  const outcome = await executeCommandAtomically(ctx.env, {
    workspaceId,
    state,
    manifest: loaded.manifest,
    originalRootDocuments: loaded.originalRootDocuments,
    upserts: diff.upserts,
    removals: diff.removals,
    manifestUpdate: diff.manifest,
    expectedVersions,
    newName: envelope.command.type === 'workspace.rename' ? (domain.result as { name: string }).name : undefined,
    audit: {
      actorUserId: actor.userId || undefined,
      actorRole: actor.role,
      commandType: envelope.command.type,
      entityKind: changes[0]?.entityKind,
      entityId: changes[0]?.entityId,
      clientId: changes[0]?.clientId,
      engagementId: changes[0]?.engagementId,
      details: { trail, changeCount: changes.length }
    },
    idempotency: envelope.idempotencyKey
      ? { key: envelope.idempotencyKey, requestHash, response: recorded }
      : undefined
  });

  return jsonResponse(
    {
      ...recorded,
      changes: await withLiveVersions(ctx.env, workspaceId, changes),
      revision: outcome.revision,
      auditSequence: outcome.auditSequence,
      result: domain.result
    },
    200,
    ctx.requestId
  );
};

// --- Files (R2) -------------------------------------------------------------

const handleFileInit = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const { session, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const body = await readJson<FileInitRequest>(ctx.request, 64 * 1024);
  if (!body || typeof body.category !== 'string') throw new ApiError('BAD_REQUEST', 'A file category is required.');
  const result = await initializeFile(ctx.env, ctx.params.workspaceId, actor, body, ctx.origin);
  return jsonResponse(result, 201, ctx.requestId);
};

const handleFileContent = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const { session, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const file = await writeFileContent(ctx.env, ctx.params.workspaceId, ctx.params.fileId, actor, ctx.request);
  return jsonResponse({ file }, 200, ctx.requestId);
};

const handleFileComplete = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const { session, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const body = await readJson<FileCompleteRequest>(ctx.request, 8 * 1024);
  if (!body || !Number.isFinite(body.sizeBytes)) throw new ApiError('BAD_REQUEST', 'Declare the uploaded size to complete the file.');
  const result = await completeFile(ctx.env, ctx.params.workspaceId, ctx.params.fileId, actor, body);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleFileDownload = async (ctx: RouteContext): Promise<Response> => {
  const { session, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const response = await buildDownloadResponse(ctx.env, ctx.params.workspaceId, ctx.params.fileId, actor);
  // Re-apply the correlation header to the streamed response.
  const headers = new Headers(response.headers);
  headers.set('X-Request-Id', ctx.requestId);
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, { status: response.status, headers });
};

const handleFileDelete = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const { session, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  await deleteFile(ctx.env, ctx.params.workspaceId, ctx.params.fileId, actor);
  return jsonResponse({ deleted: true }, 200, ctx.requestId);
};

const handleFileList = async (ctx: RouteContext): Promise<Response> => {
  const { session, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const rows = await listFileRows(ctx.env, ctx.params.workspaceId, {
    clientId: ctx.url.searchParams.get('clientId') ?? undefined,
    engagementId: ctx.url.searchParams.get('engagementId') ?? undefined
  });
  // Only files inside the actor's server-resolved scope are ever listed.
  const visible = rows.filter(row => {
    if (row.client_id && actor.clientIds !== 'ALL' && !actor.clientIds.includes(row.client_id)) return false;
    if (row.engagement_id && actor.engagementIds !== 'ALL' && !actor.engagementIds.includes(row.engagement_id)) return false;
    return true;
  });
  return jsonResponse({ files: visible.map(toFileMetadata) }, 200, ctx.requestId);
};

const handleFileMetadata = async (ctx: RouteContext): Promise<Response> => {
  const { session, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const row = await getFileRow(ctx.env, ctx.params.workspaceId, ctx.params.fileId);
  if (!row) throw new ApiError('NOT_FOUND', 'File not found.');
  if (row.client_id && actor.clientIds !== 'ALL' && !actor.clientIds.includes(row.client_id)) throw new ApiError('FORBIDDEN_SCOPE', 'Out of scope.');
  if (row.engagement_id && actor.engagementIds !== 'ALL' && !actor.engagementIds.includes(row.engagement_id)) throw new ApiError('FORBIDDEN_SCOPE', 'Out of scope.');
  return jsonResponse({ file: toFileMetadata(row) }, 200, ctx.requestId);
};

// --- Router -----------------------------------------------------------------

const router = createRouter()
  .get('/api/health', handleHealth)
  .get('/api/seeds', handleSeeds)
  .post('/api/workspaces', handleCreateWorkspace)
  .post('/api/workspaces/resume', handleResumeWorkspace)
  .get('/api/workspaces/:workspaceId/state', handleState)
  .get('/api/workspaces/:workspaceId/changes', handleChanges)
  .get('/api/workspaces/:workspaceId/events', handleEvents)
  .post('/api/workspaces/:workspaceId/commands', handleCommand)
  .get('/api/workspaces/:workspaceId/files', handleFileList)
  .post('/api/workspaces/:workspaceId/files', handleFileInit)
  .get('/api/workspaces/:workspaceId/files/:fileId', handleFileDownload)
  .get('/api/workspaces/:workspaceId/files/:fileId/metadata', handleFileMetadata)
  .delete('/api/workspaces/:workspaceId/files/:fileId', handleFileDelete)
  .put('/api/workspaces/:workspaceId/files/:fileId/content', handleFileContent)
  .post('/api/workspaces/:workspaceId/files/:fileId/complete', handleFileComplete)
  .get('/api/workspaces/:workspaceId', handleGetWorkspace)
  .delete('/api/workspaces/:workspaceId', handleDeleteWorkspace)
  .post('/api/session/persona', handlePersonaSwitch)
  .post('/api/session/logout', handleLogout);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();

    // Anything outside /api/* is the built React app (Workers Static Assets).
    if (!url.pathname.startsWith('/api/')) {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'no-referrer');
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }

    const context: RouteContext = {
      request,
      env,
      ctx,
      url,
      params: {},
      requestId,
      origin: url.origin
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: baseHeaders(requestId) });

    const match = router.match(request.method, url.pathname);
    if (!match) {
      const methodMismatch = router.pathExists(url.pathname);
      const body = {
        code: methodMismatch ? 'BAD_REQUEST' : 'NOT_FOUND',
        message: methodMismatch ? 'That API route does not accept this method.' : 'That API route does not exist.',
        requestId
      };
      return jsonResponse(body, methodMismatch ? 400 : 404, requestId);
    }

    try {
      return await match.handler({ ...context, params: match.params });
    } catch (error) {
      const mapped = toApiError(error, requestId);
      // Structured operational log; never includes secrets, codes or file bytes.
      console.log(JSON.stringify({
        event: 'workspace.api.error',
        requestId,
        path: url.pathname,
        method: request.method,
        code: mapped.body.code,
        status: mapped.status
      }));
      return jsonResponse(mapped.body, mapped.status, requestId);
    }
  },

  /**
   * Scheduled cleanup: expired workspaces/sessions/idempotency keys, abandoned
   * staged uploads, and the legacy snapshot tables the v1 API still owns.
   */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const now = nowSeconds();
    await env.DB.prepare('DELETE FROM workspace_sessions WHERE expires_at<=?').bind(now).run();
    await env.DB.prepare('DELETE FROM idempotency_keys WHERE expires_at<=?').bind(now).run();
    await env.DB.prepare("UPDATE workspaces SET status='deleted' WHERE expires_at<=? AND status<>'deleted'").bind(now).run();
    await cleanupStagedFiles(env).catch(error => console.error('staged cleanup failed', String(error)));
    // Preserve the existing legacy snapshot API's retention behaviour.
    await env.DB.prepare('DELETE FROM demo_workspaces WHERE expires_at<=?').bind(now).run();
    await env.DB.prepare('DELETE FROM demo_creation_limits WHERE window_start<?')
      .bind(Math.floor(Date.now() / 3600000) - 24).run();
  }
};
