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
import { processBusinessOutbox } from './businessOutbox';
import { queueDueBusinessArchives } from './businessReporting';
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
import {
  bootstrapBusinessWorkspace,
  listBusinessActorProfiles,
  listBusinessClients,
  getBusinessClient,
  listBusinessLeads,
  listBusinessStandardsProfiles,
  getBusinessProposalWorkspace,
  getBusinessPbcRequestPortal,
  getBusinessPbcPortal,
  listBusinessPbcEngagements,
  getBusinessChanges,
  businessEnvelopeFromRequest,
  getBusinessFileDownload,
  getBusinessFileMetadata,
  listBusinessFiles,
  parseBusinessBootstrapInput,
  parseBusinessCommandEnvelope,
  runBusinessFileContent,
  resolveBusinessContext,
  runBusinessDirectoryCommand
} from './business';
import { getBusinessAcceptanceGate, getBusinessRiskWorkspace } from './businessRisk';
import { getBusinessDeliveryWorkspace } from './businessDelivery';
import { getBusinessCapacity, getBusinessPlanningWorkspace, listBusinessEngagementFolders } from './businessPlanning';
import { getBusinessPlanningReadiness, getBusinessTrialBalanceImport, getBusinessTrialBalancePreview, getBusinessTrialBalanceWorkspace } from './businessTb';
import { getBusinessFinancialStatements, getBusinessFsliSourceLines, getBusinessFieldworkWorkspace, getBusinessSamplingPlan, getBusinessSamplingPopulation, getBusinessFieldworkChanges } from './businessFieldwork';
import { getBusinessPracticeWorkspace } from './businessPractice';
import { getBusinessReportingWorkspace } from './businessReportingQuery';
import { getBusinessWorkflow } from './businessWorkflow';

const JSON_BODY_LIMIT = 1_000_000;
/** Hard ceiling for a single command payload; the domain model is small. */
const COMMAND_BODY_LIMIT = 512_000;
/** Updated alongside the latest application schema migration. */
const APPLICATION_SCHEMA_VERSION = 29;

const ASYNC_BUSINESS_COMMANDS = new Set([
  'proposal.generate', 'proposal.generate.retry', 'proposal.dispatch', 'proposal.dispatch.retry',
  'engagementLetter.generate', 'engagementLetter.issue', 'invoice.issueAdvance', 'payment.record', 'payment.reverse'
]);

export function businessCommandHttpResult(
  response: Record<string, unknown>, commandType: string, recordedStatus: number | null | undefined, requestId: string
): { body: unknown; status: number } {
  const defaultStatus = ASYNC_BUSINESS_COMMANDS.has(commandType) ? 202 : 200;
  const status = recordedStatus !== null && recordedStatus !== undefined && recordedStatus !== 200
    ? Number(recordedStatus) : defaultStatus;
  const result = response.result && typeof response.result === 'object'
    ? response.result as Record<string, unknown> : null;
  if (status === 409 && commandType === 'report.release' && result?.blocked === true) {
    const blockers = Array.isArray(result.blockers) ? result.blockers as Array<Record<string, unknown>> : [];
    const criticalConfirmationIds = blockers
      .filter(blocker => blocker.code === 'CRITICAL_CONFIRMATION_OUTSTANDING' || blocker.code === 'STALE_CONFIRMATION_SOURCE')
      .map(blocker => blocker.entityId).filter((id): id is string => typeof id === 'string');
    return {
      status,
      body: {
        code: 'GATE_BLOCKED',
        message: 'Critical confirmation clearance changed after bundle preparation.',
        details: { criticalConfirmationIds, holdingLetterJobId: result.holdingLetterJobId ?? null, blockers },
        requestId
      }
    };
  }
  return { body: response, status };
}

/** Per-IP/route rate limit using the optional Worker Rate Limiting binding. */
async function enforceRateLimit(ctx: RouteContext, bucket: string, key: string): Promise<void> {
  const limiter = ctx.env.RATE_LIMITER;
  if (!limiter) return;
  const outcome = await limiter.limit({ key: `${bucket}:${key}` });
  if (!outcome.success) throw new ApiError('RATE_LIMITED', 'Too many requests. Wait a moment and try again.');
}

const clientKey = (ctx: RouteContext): string =>
  ctx.request.headers.get('CF-Connecting-IP') || 'local';

const workspaceSummary = (row: { id: string; name: string; seed_id: string | null; schema_version: number; revision: number; status: WorkspaceSummary['status']; data_mode: WorkspaceSummary['dataMode']; expires_at: number | null }): WorkspaceSummary => ({
  id: row.id,
  name: row.name,
  seedId: row.seed_id,
  schemaVersion: row.schema_version,
  revision: row.revision,
  status: row.status,
  dataMode: row.data_mode,
  ...(row.expires_at === null ? {} : { expiresAt: row.expires_at })
});

// --- Health & seeds ---------------------------------------------------------

const handleHealth = async (ctx: RouteContext): Promise<Response> => {
  await ctx.env.DB.prepare('SELECT 1').first();
  return jsonResponse({ ok: true, storage: 'D1+R2', mode: 'cloud-workspace', version: 2 }, 200, ctx.requestId);
};

const handleHealthLive = async (ctx: RouteContext): Promise<Response> =>
  jsonResponse({ status: 'ok' }, 200, ctx.requestId);

const handleHealthReady = async (ctx: RouteContext): Promise<Response> => {
  const dependencyCodes: string[] = [];
  let schemaVersion: number | null = null;
  try {
    await ctx.env.DB.prepare('SELECT 1 AS ok').first();
  } catch {
    dependencyCodes.push('D1_UNAVAILABLE');
  }
  if (!dependencyCodes.includes('D1_UNAVAILABLE')) {
    try {
      const schema = await ctx.env.DB.prepare('SELECT version FROM application_schema_version WHERE singleton=1')
        .first<{ version: number }>();
      if (!schema || !Number.isInteger(schema.version) || schema.version < 1) throw new Error('schema');
      schemaVersion = schema.version;
      if (schema.version !== APPLICATION_SCHEMA_VERSION) dependencyCodes.push('SCHEMA_VERSION_MISMATCH');
    } catch {
      dependencyCodes.push('SCHEMA_VERSION_UNAVAILABLE');
    }
  }
  try {
    // head() checks the configured binding without requiring or creating a probe object.
    await ctx.env.FILES.head('__auditsphere_readiness_probe__');
  } catch {
    dependencyCodes.push('R2_UNAVAILABLE');
  }
  const ready = dependencyCodes.length === 0;
  return jsonResponse({ status: ready ? 'ready' : 'degraded', schemaVersion, dependencyCodes }, ready ? 200 : 503, ctx.requestId);
};

const handleMigrationStatus = async (ctx: RouteContext): Promise<Response> => {
  const workspace = await ctx.env.DB.prepare('SELECT id FROM workspaces WHERE id=?')
    .bind(ctx.params.workspaceId).first<{ id: string }>();
  if (!workspace) throw new ApiError('NOT_FOUND', 'Workspace not found.');
  const [schema, run] = await Promise.all([
    ctx.env.DB.prepare('SELECT version FROM application_schema_version WHERE singleton=1').first<{ version: number }>(),
    ctx.env.DB.prepare(`SELECT id,status FROM migration_runs WHERE workspace_id=? ORDER BY started_at DESC,id DESC LIMIT 1`)
      .bind(ctx.params.workspaceId).first<{ id: string; status: string }>()
  ]);
  if (!schema) throw new ApiError('UNAVAILABLE', 'The installed application schema version is unavailable.');
  return jsonResponse({ schemaVersion: schema.version, lastRunId: run?.id ?? null, status: run?.status ?? null }, 200, ctx.requestId);
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
  const requestBody = await readJson<unknown>(ctx.request, 64 * 1024);
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new ApiError('BAD_REQUEST', 'Workspace details are required.');
  }

  // The real operating profile has a separate empty BUSINESS bootstrap. It does
  // not load a seed, create a session/access code, or set a cookie.
  if (!Object.hasOwn(requestBody, 'seedId')) {
    if (ctx.env.BUSINESS_SETUP_ENABLED !== 'true') {
      throw new ApiError('UNAVAILABLE', 'Business workspace setup is not enabled for this trusted deployment.');
    }
    const setupKey = ctx.request.headers.get('Idempotency-Key')?.trim();
    if (!setupKey || setupKey.length < 8 || setupKey.length > 200) {
      throw new ApiError('BAD_REQUEST', 'A unique Idempotency-Key header is required for workspace setup.');
    }
    const input = parseBusinessBootstrapInput(requestBody);
    const created = await bootstrapBusinessWorkspace(ctx.env, input, setupKey);
    return jsonResponse(created, created.replayed ? 200 : 201, ctx.requestId);
  }

  const body = requestBody as Partial<CreateWorkspaceRequest>;
  if (typeof body.seedId !== 'string') throw new ApiError('BAD_REQUEST', 'Choose an available seed.');
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

const handleBusinessActorProfiles = async (ctx: RouteContext): Promise<Response> => {
  const profiles = await listBusinessActorProfiles(ctx.env, ctx.params.workspaceId);
  return jsonResponse(profiles, 200, ctx.requestId);
};

const handleBusinessContext = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  return jsonResponse(context, 200, ctx.requestId);
};

const handleBusinessClients = async (ctx: RouteContext): Promise<Response> => {
  const result = await listBusinessClients(ctx.env, ctx.params.workspaceId, ctx.request, ctx.url);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessClient = async (ctx: RouteContext): Promise<Response> => {
  const result = await getBusinessClient(ctx.env, ctx.params.workspaceId, ctx.request, ctx.params.clientId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessLeads = async (ctx: RouteContext): Promise<Response> => {
  const result = await listBusinessLeads(ctx.env, ctx.params.workspaceId, ctx.request, ctx.url);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessStandardsProfiles = async (ctx: RouteContext): Promise<Response> => {
  const result = await listBusinessStandardsProfiles(ctx.env, ctx.params.workspaceId, ctx.request);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessProposalWorkspace = async (ctx: RouteContext): Promise<Response> => {
  const result = await getBusinessProposalWorkspace(ctx.env, ctx.params.workspaceId, ctx.request);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessAcceptanceGate = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessAcceptanceGate(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessWorkflow = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessWorkflow(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessRiskWorkspace = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessRiskWorkspace(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessDeliveryWorkspace = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessDeliveryWorkspace(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessPlanningWorkspace = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessPlanningWorkspace(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessFinancialStatements = async (ctx: RouteContext): Promise<Response> => {
  const context=await resolveBusinessContext(ctx.env,ctx.params.workspaceId,ctx.request);
  const result=await getBusinessFinancialStatements(ctx.env,ctx.params.workspaceId,context,ctx.params.engagementId);
  return jsonResponse(result,200,ctx.requestId);
};

const handleBusinessFsliSourceLines = async (ctx: RouteContext): Promise<Response> => {
  const context=await resolveBusinessContext(ctx.env,ctx.params.workspaceId,ctx.request);
  const limit=Number(ctx.url.searchParams.get('limit')??100);const cursor=Number(ctx.url.searchParams.get('cursor')??0);
  if(!Number.isInteger(limit)||!Number.isInteger(cursor)||cursor<0)throw new ApiError('BAD_REQUEST','Source-line limit and cursor must be non-negative integers.');
  const result=await getBusinessFsliSourceLines(ctx.env,ctx.params.workspaceId,context,ctx.params.engagementId,ctx.params.fsliId,limit,cursor);
  return jsonResponse(result,200,ctx.requestId);
};

const handleBusinessFieldworkWorkspace = async (ctx: RouteContext): Promise<Response> => {
  const context=await resolveBusinessContext(ctx.env,ctx.params.workspaceId,ctx.request);
  const result=await getBusinessFieldworkWorkspace(ctx.env,ctx.params.workspaceId,context,ctx.params.engagementId);
  return jsonResponse(result,200,ctx.requestId);
};

const handleBusinessSamplingPlan = async (ctx: RouteContext): Promise<Response> => {
  const context=await resolveBusinessContext(ctx.env,ctx.params.workspaceId,ctx.request);
  const result=await getBusinessSamplingPlan(ctx.env,ctx.params.workspaceId,context,ctx.params.engagementId,ctx.params.planId);
  return jsonResponse(result,200,ctx.requestId);
};

const handleBusinessSamplingPopulation = async (ctx: RouteContext): Promise<Response> => {
  const context=await resolveBusinessContext(ctx.env,ctx.params.workspaceId,ctx.request);
  const result=await getBusinessSamplingPopulation(ctx.env,ctx.params.workspaceId,context,ctx.params.engagementId,ctx.params.populationId);
  return jsonResponse(result,200,ctx.requestId);
};

const handleBusinessFieldworkChanges = async (ctx: RouteContext): Promise<Response> => {
  const context=await resolveBusinessContext(ctx.env,ctx.params.workspaceId,ctx.request);
  const after=Number(ctx.url.searchParams.get('after')??0);const limit=Number(ctx.url.searchParams.get('limit')??100);
  if(!Number.isInteger(after)||after<0||!Number.isInteger(limit)||limit<1)throw new ApiError('BAD_REQUEST','Change feed cursor and limit must be non-negative integers.');
  const result=await getBusinessFieldworkChanges(ctx.env,ctx.params.workspaceId,context,ctx.params.engagementId,after,limit);
  return jsonResponse(result,200,ctx.requestId);
};

const handleBusinessTrialBalanceWorkspace = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessTrialBalanceWorkspace(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessTrialBalancePreview = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const fileId = ctx.url.searchParams.get('fileId') ?? '';
  const result = await getBusinessTrialBalancePreview(ctx.env, ctx.params.workspaceId, context, fileId,
    ctx.url.searchParams.get('worksheet') ?? undefined);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessTrialBalanceImport = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessTrialBalanceImport(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId, ctx.params.importId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessPlanningReadiness = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessPlanningReadiness(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessCapacity = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessCapacity(ctx.env, ctx.params.workspaceId, context,
    ctx.url.searchParams.get('from') ?? '', ctx.url.searchParams.get('to') ?? '');
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessPracticeWorkspace = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessPracticeWorkspace(ctx.env, ctx.params.workspaceId, context, ctx.url.searchParams);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessReportingWorkspace = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessReportingWorkspace(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessEngagementFolders = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await listBusinessEngagementFolders(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessPbcEngagements = async (ctx: RouteContext): Promise<Response> => {
  const result = await listBusinessPbcEngagements(ctx.env, ctx.params.workspaceId, ctx.request);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessPbcPortal = async (ctx: RouteContext): Promise<Response> => {
  const result = await getBusinessPbcPortal(ctx.env, ctx.params.workspaceId, ctx.request, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessPbcRequest = async (ctx: RouteContext): Promise<Response> => {
  const result = await getBusinessPbcRequestPortal(ctx.env, ctx.params.workspaceId, ctx.request, ctx.params.engagementId, ctx.params.requestId);
  return jsonResponse(result, 200, ctx.requestId);
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
  const candidate = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (candidate?.data_mode === 'BUSINESS') {
    const row = await requireWorkspace(ctx.env, ctx.params.workspaceId);
    const directory = await ctx.env.DB.prepare(`SELECT version,business_status,currency,timezone
      FROM workspaces WHERE id=?`).bind(row.id)
      .first<{ version: number; business_status: 'ACTIVE' | 'READ_ONLY'; currency: 'QAR'; timezone: 'Asia/Qatar' }>();
    if (!directory) throw new ApiError('NOT_FOUND', 'Workspace not found.');
    return jsonResponse({ workspace: {
      ...workspaceSummary(row),
      version: directory.version,
      status: directory.business_status,
      currency: directory.currency,
      timezone: directory.timezone
    } }, 200, ctx.requestId);
  }
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
    dataMode: row.data_mode,
    ...(row.expires_at === null ? {} : { expiresAt: row.expires_at }),
    state
  };
  return jsonResponse(response, 200, ctx.requestId);
};

const handleChanges = async (ctx: RouteContext): Promise<Response> => {
  const row = await requireWorkspace(ctx.env, ctx.params.workspaceId);
  if (row.data_mode === 'BUSINESS') {
    const changes = await getBusinessChanges(ctx.env, row.id, ctx.request, ctx.url);
    return jsonResponse(changes, 200, ctx.requestId);
  }
  const { session } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
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

  const workspace = await getWorkspace(ctx.env, workspaceId);
  if (workspace?.data_mode === 'BUSINESS') {
    const body = await readJson<unknown>(ctx.request, COMMAND_BODY_LIMIT);
    const envelope = parseBusinessCommandEnvelope(body, ctx.request.headers.get('Idempotency-Key'));
    const response = await runBusinessDirectoryCommand(ctx.env, workspaceId, ctx.request, envelope);
    const recorded = await ctx.env.DB.prepare(`SELECT response_status FROM command_receipts WHERE workspace_id=? AND idempotency_key=?`)
      .bind(workspaceId, envelope.idempotencyKey).first<{ response_status: number }>();
    const result = businessCommandHttpResult(response, envelope.command.type, recorded?.response_status, ctx.requestId);
    return jsonResponse(result.body, result.status, ctx.requestId);
  }

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
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (workspace?.data_mode === 'BUSINESS') {
    const body = await readJson<Record<string, unknown>>(ctx.request, 64 * 1024);
    const envelope = businessEnvelopeFromRequest(ctx.request, { type: 'file.reserve', payload: body });
    const result = await runBusinessDirectoryCommand(ctx.env, ctx.params.workspaceId, ctx.request, envelope);
    const replayed = Boolean(result.replayed);
    return jsonResponse({ ...(result.result as Record<string, unknown>), commandId: result.commandId, replayed }, replayed ? 200 : 201, ctx.requestId);
  }
  const { session, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const body = await readJson<FileInitRequest>(ctx.request, 64 * 1024);
  if (!body || typeof body.category !== 'string') throw new ApiError('BAD_REQUEST', 'A file category is required.');
  const result = await initializeFile(ctx.env, ctx.params.workspaceId, actor, body, ctx.origin);
  return jsonResponse(result, 201, ctx.requestId);
};

const handleFileContent = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (workspace?.data_mode === 'BUSINESS') {
    const result = await runBusinessFileContent(ctx.env, ctx.params.workspaceId, ctx.request, ctx.params.fileId);
    return jsonResponse({ ...(result.result as Record<string, unknown>), commandId: result.commandId, replayed: result.replayed }, 200, ctx.requestId);
  }
  const { session, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const file = await writeFileContent(ctx.env, ctx.params.workspaceId, ctx.params.fileId, actor, ctx.request);
  return jsonResponse({ file }, 200, ctx.requestId);
};

const handleFileComplete = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (workspace?.data_mode === 'BUSINESS') {
    const body = await readJson<{ expectedVersion: number; sizeBytes: number; sha256: string }>(ctx.request, 8 * 1024);
    if (!body || !Number.isFinite(body.expectedVersion) || !Number.isFinite(body.sizeBytes)) {
      throw new ApiError('BAD_REQUEST', 'The staged file version and digest are required to complete the upload.');
    }
    const command = { type: 'file.commit', payload: { fileId: ctx.params.fileId, ...body } };
    const envelope = businessEnvelopeFromRequest(ctx.request, command, [
      { entity: 'FileVersion', id: ctx.params.fileId, version: body.expectedVersion }
    ]);
    const result = await runBusinessDirectoryCommand(ctx.env, ctx.params.workspaceId, ctx.request, envelope);
    return jsonResponse({ ...(result.result as Record<string, unknown>), commandId: result.commandId, replayed: result.replayed }, 200, ctx.requestId);
  }
  const { session, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  const body = await readJson<FileCompleteRequest>(ctx.request, 8 * 1024);
  if (!body || !Number.isFinite(body.sizeBytes)) throw new ApiError('BAD_REQUEST', 'Declare the uploaded size to complete the file.');
  const result = await completeFile(ctx.env, ctx.params.workspaceId, ctx.params.fileId, actor, body);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleFileDownload = async (ctx: RouteContext): Promise<Response> => {
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (workspace?.data_mode === 'BUSINESS') {
    const response = await getBusinessFileDownload(ctx.env, ctx.params.workspaceId, ctx.request, ctx.params.fileId);
    const headers = new Headers(response.headers);
    headers.set('X-Request-Id', ctx.requestId);
    headers.set('Referrer-Policy', 'no-referrer');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
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
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (workspace?.data_mode === 'BUSINESS') {
    const expectedVersion = Number(ctx.request.headers.get('X-File-Version'));
    const reason = ctx.request.headers.get('X-Rejection-Reason') ?? '';
    const command = { type: 'file.reject', payload: { fileId: ctx.params.fileId, expectedVersion, reason } };
    const envelope = businessEnvelopeFromRequest(ctx.request, command, [
      { entity: 'FileVersion', id: ctx.params.fileId, version: expectedVersion }
    ]);
    const result = await runBusinessDirectoryCommand(ctx.env, ctx.params.workspaceId, ctx.request, envelope);
    return jsonResponse(result.result, 200, ctx.requestId);
  }
  const { session, actor } = await resolveSession(ctx.env, ctx.request);
  if (session.workspace_id !== ctx.params.workspaceId) throw new ApiError('FORBIDDEN_SCOPE', 'Session does not match this workspace.');
  await deleteFile(ctx.env, ctx.params.workspaceId, ctx.params.fileId, actor);
  return jsonResponse({ deleted: true }, 200, ctx.requestId);
};

const handleFileList = async (ctx: RouteContext): Promise<Response> => {
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (workspace?.data_mode === 'BUSINESS') {
    const limit = Number(ctx.url.searchParams.get('limit') ?? 100);
    const result = await listBusinessFiles(ctx.env, ctx.params.workspaceId, ctx.request, limit);
    return jsonResponse({ files: result.items }, 200, ctx.requestId);
  }
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
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (workspace?.data_mode === 'BUSINESS') {
    const result = await getBusinessFileMetadata(ctx.env, ctx.params.workspaceId, ctx.request, ctx.params.fileId);
    return jsonResponse(result, 200, ctx.requestId);
  }
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
  .get('/api/health/live', handleHealthLive)
  .get('/api/health/ready', handleHealthReady)
  .get('/api/seeds', handleSeeds)
  .post('/api/workspaces', handleCreateWorkspace)
  .post('/api/workspaces/resume', handleResumeWorkspace)
  .get('/api/workspaces/:workspaceId/actor-profiles', handleBusinessActorProfiles)
  .get('/api/workspaces/:workspaceId/context', handleBusinessContext)
  .get('/api/workspaces/:workspaceId/migration-status', handleMigrationStatus)
  .get('/api/workspaces/:workspaceId/clients', handleBusinessClients)
  .get('/api/workspaces/:workspaceId/clients/:clientId', handleBusinessClient)
  .get('/api/workspaces/:workspaceId/leads', handleBusinessLeads)
  .get('/api/workspaces/:workspaceId/standards-profiles', handleBusinessStandardsProfiles)
  .get('/api/workspaces/:workspaceId/proposal-workspace', handleBusinessProposalWorkspace)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/workflow', handleBusinessWorkflow)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/acceptance-gate', handleBusinessAcceptanceGate)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/risk-workspace', handleBusinessRiskWorkspace)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/delivery-workspace', handleBusinessDeliveryWorkspace)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/planning-workspace', handleBusinessPlanningWorkspace)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/financial-statements', handleBusinessFinancialStatements)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/fslis/:fsliId/source-lines', handleBusinessFsliSourceLines)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/fieldwork-workspace', handleBusinessFieldworkWorkspace)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/sampling-plans/:planId', handleBusinessSamplingPlan)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/sampling-populations/:populationId', handleBusinessSamplingPopulation)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/changes', handleBusinessFieldworkChanges)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/trial-balance-workspace', handleBusinessTrialBalanceWorkspace)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/trial-balance-preview', handleBusinessTrialBalancePreview)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/tb-imports/:importId', handleBusinessTrialBalanceImport)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/planning-readiness', handleBusinessPlanningReadiness)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/folders', handleBusinessEngagementFolders)
  .get('/api/workspaces/:workspaceId/capacity', handleBusinessCapacity)
  .get('/api/workspaces/:workspaceId/practice', handleBusinessPracticeWorkspace)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/reporting-workspace', handleBusinessReportingWorkspace)
  .get('/api/workspaces/:workspaceId/pbc-engagements', handleBusinessPbcEngagements)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/pbc/:requestId', handleBusinessPbcRequest)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/portal', handleBusinessPbcPortal)
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

  /** Process durable business jobs and clean expired legacy/session state. */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const now = nowSeconds();
    await queueDueBusinessArchives(env,new Date(now*1000).toISOString()).catch(error => console.error('business archive deadline enforcement failed', String(error)));
    await processBusinessOutbox(env).catch(error => console.error('business outbox processing failed', String(error)));
    await env.DB.prepare('DELETE FROM workspace_sessions WHERE expires_at<=?').bind(now).run();
    await env.DB.prepare('DELETE FROM idempotency_keys WHERE expires_at<=?').bind(now).run();
    await env.DB.prepare(`UPDATE workspaces SET status='deleted'
                          WHERE data_mode='TEST' AND status<>'deleted'
                            AND id IN (SELECT workspace_id FROM test_workspace_expiry WHERE expires_at<=?)`)
      .bind(now).run();
    await cleanupStagedFiles(env).catch(error => console.error('staged cleanup failed', String(error)));
    // Preserve the existing legacy snapshot API's retention behaviour.
    await env.DB.prepare('DELETE FROM demo_workspaces WHERE expires_at<=?').bind(now).run();
    await env.DB.prepare('DELETE FROM demo_creation_limits WHERE window_start<?')
      .bind(Math.floor(Date.now() / 3600000) - 24).run();
  }
};
