// AuditSphere cloud API — Worker entry point.
//
// One Worker serves the built React app (Workers Static Assets) and its same-origin
// JSON API under /api/*.
//
// BUSINESS mutations resolve the authenticated actor on each request,
// enforce scope/version inside the domain command, and append an audit event.

import {
  getWorkspace,
  requireWorkspace,
  nowSeconds
} from './db';
import type { Env } from './env';
import { ApiError, toApiError } from './errors';
import { assertSameOrigin, baseHeaders, jsonResponse, readJson, sha256Hex } from './http';
import { createRouter, type RouteContext } from './router';
import { integrationStatus } from './integrations/status';
import { processBusinessOutbox } from './businessOutbox';
import { sweepStaleBusinessFiles } from './businessFileSweep';
import { queueDueBusinessArchives } from './businessReporting';
import { apiRequestMetric, outboxSnapshot, safeErrorKind, type OutboxMetricRow } from './observability';
import { APPLICATION_SCHEMA_VERSION } from './versions';
import { buildVerificationSupportBundle, type VerificationRunRow } from './verificationSupportBundle';
import { ingestVerificationRun } from './verificationIngest';
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
import { getBusinessPracticeWorkspace, getBusinessProfitability, getBusinessUtilization, getFirmProfitLossReport, getFirmTrialBalanceReport } from './businessPractice';
import { consumeBusinessArchiveDownloadTicket, createBusinessArchiveDownloadTicket, getBusinessArchiveExport, getBusinessArchiveStatus, getBusinessOpinionPreview, getBusinessReleasedReportProvenance, getBusinessReportingWorkspace } from './businessReportingQuery';
import { getBusinessWorkflow } from './businessWorkflow';

const JSON_BODY_LIMIT = 1_000_000;
/** Hard ceiling for a single command payload; the domain model is small. */
const COMMAND_BODY_LIMIT = 512_000;
const ASYNC_BUSINESS_COMMANDS = new Set([
  'proposal.generate', 'proposal.generate.retry', 'proposal.dispatch', 'proposal.dispatch.retry',
  'engagementLetter.generate', 'engagementLetter.issue', 'invoice.issueAdvance', 'payment.record', 'payment.reverse',
  'confirmation.dispatch'
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

const workspaceSummary = (row: { id: string; name: string; seed_id: string | null; schema_version: number; revision: number; status: string; data_mode: string; expires_at: number | null }) => ({
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

const handleSupportBundle = async (ctx: RouteContext): Promise<Response> => {
  const readyResponse = await handleHealthReady(ctx);
  const readiness = await readyResponse.json() as {
    status: 'ready' | 'degraded';
    schemaVersion: number | null;
    dependencyCodes: string[];
  };
  const dependencyCodes = [...readiness.dependencyCodes];
  let verificationRuns: VerificationRunRow[] = [];
  try {
    const result = await ctx.env.DB.prepare(`SELECT source_commit,schema_version,environment,started_at,completed_at,status
      FROM verification_runs ORDER BY started_at DESC LIMIT 100`).all<VerificationRunRow>();
    verificationRuns = result.results ?? [];
  } catch {
    dependencyCodes.push('VERIFICATION_RUNS_UNAVAILABLE');
  }
  const bundle = buildVerificationSupportBundle({
    generatedAt: new Date().toISOString(),
    applicationSchemaVersion: APPLICATION_SCHEMA_VERSION,
    installedSchemaVersion: readiness.schemaVersion,
    readiness: readiness.status,
    dependencyCodes,
    verificationRuns
  });
  return new Response(`${JSON.stringify(bundle, null, 2)}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="auditsphere-support-bundle.json"',
      ...baseHeaders(ctx.requestId)
    }
  });
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

// --- Workspaces -------------------------------------------------------------

const handleCreateWorkspace = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  await enforceRateLimit(ctx, 'workspace.create', clientKey(ctx));
  const requestBody = await readJson<unknown>(ctx.request, 64 * 1024);
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new ApiError('BAD_REQUEST', 'Workspace details are required.');
  }

  if (Object.hasOwn(requestBody, 'seedId')) throw new ApiError('BAD_REQUEST', 'Seeded workspace creation is no longer supported.');
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

const handleFirmTrialBalanceReport = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getFirmTrialBalanceReport(ctx.env, ctx.params.workspaceId, context, ctx.url.searchParams);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleFirmProfitLossReport = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getFirmProfitLossReport(ctx.env, ctx.params.workspaceId, context, ctx.url.searchParams);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessUtilization = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessUtilization(ctx.env, ctx.params.workspaceId, context, ctx.url.searchParams);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessProfitability = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessProfitability(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId, ctx.url.searchParams.get('asOf'));
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessReportingWorkspace = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessReportingWorkspace(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessArchiveStatus = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessArchiveStatus(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessArchiveExport = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const requestedPart = ctx.url.searchParams.get('part') ?? 'archive';
  if (requestedPart !== 'archive' && requestedPart !== 'manifest') {
    throw new ApiError('BAD_REQUEST', 'Choose archive or manifest as the export part.');
  }
  const result = await getBusinessArchiveExport(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId, requestedPart);
  return new Response(result.body ?? result.bytes ?? null, { headers: {
    'Content-Type': result.contentType,
    'Content-Disposition': `attachment; filename="${result.fileName}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Archive-SHA256': result.archiveSha256,
    'X-Archive-Manifest-SHA256': result.manifestSha256,
    'Content-Length': String(result.sizeBytes),
    'X-Request-Id': ctx.requestId,
    'Referrer-Policy': 'no-referrer'
  } });
};

const handleBusinessArchiveDownloadTicket = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request,ctx.url);
  const context=await resolveBusinessContext(ctx.env,ctx.params.workspaceId,ctx.request);
  const result=await createBusinessArchiveDownloadTicket(ctx.env,ctx.params.workspaceId,context,ctx.params.engagementId);
  return jsonResponse(result,201,ctx.requestId,{'Referrer-Policy':'no-referrer'});
};

const handleNativeArchiveDownload = async (ctx: RouteContext): Promise<Response> => {
  const result=await consumeBusinessArchiveDownloadTicket(ctx.env,ctx.params.token);
  return new Response(result.body,{headers:{
    'Content-Type':result.contentType,
    'Content-Disposition':`attachment; filename="${result.fileName}"`,
    'Content-Length':String(result.sizeBytes),
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'X-Archive-SHA256':result.archiveSha256,
    'X-Archive-Manifest-SHA256':result.manifestSha256,
    'X-Request-Id':ctx.requestId,
    'Referrer-Policy':'no-referrer'
  }});
};

const handleBusinessOpinionPreview = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const opinionVersionId = ctx.url.searchParams.get('versionId')?.trim();
  if (!opinionVersionId) throw new ApiError('BAD_REQUEST', 'Provide the opinion version to preview.');
  const result = await getBusinessOpinionPreview(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId, opinionVersionId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleBusinessReleasedReportProvenance = async (ctx: RouteContext): Promise<Response> => {
  const context = await resolveBusinessContext(ctx.env, ctx.params.workspaceId, ctx.request);
  const result = await getBusinessReleasedReportProvenance(ctx.env, ctx.params.workspaceId, context, ctx.params.engagementId);
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

const handleGetWorkspace = async (ctx: RouteContext): Promise<Response> => {
  const row = await requireWorkspace(ctx.env, ctx.params.workspaceId);
  if (row.data_mode !== 'BUSINESS') throw new ApiError('NOT_FOUND', 'Workspace not found.');
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
};

const handleChanges = async (ctx: RouteContext): Promise<Response> => {
  const row = await requireWorkspace(ctx.env, ctx.params.workspaceId);
  if (row.data_mode !== 'BUSINESS') throw new ApiError('NOT_FOUND', 'Workspace not found.');
  const changes = await getBusinessChanges(ctx.env, row.id, ctx.request, ctx.url);
  return jsonResponse(changes, 200, ctx.requestId);
};

// --- Commands (server-authoritative) ---------------------------------------

const handleCommand = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const workspaceId = ctx.params.workspaceId;
  await enforceRateLimit(ctx, 'workspace.command', `${clientKey(ctx)}:${workspaceId}`);

  const workspace = await getWorkspace(ctx.env, workspaceId);
  if (!workspace || workspace.data_mode !== 'BUSINESS') throw new ApiError('NOT_FOUND', 'Workspace not found.');
  const body = await readJson<unknown>(ctx.request, COMMAND_BODY_LIMIT);
  const envelope = parseBusinessCommandEnvelope(body, ctx.request.headers.get('Idempotency-Key'));
  const response = await runBusinessDirectoryCommand(ctx.env, workspaceId, ctx.request, envelope);
  const recorded = await ctx.env.DB.prepare(`SELECT response_status FROM command_receipts WHERE workspace_id=? AND idempotency_key=?`)
    .bind(workspaceId, envelope.idempotencyKey).first<{ response_status: number }>();
  const result = businessCommandHttpResult(response, envelope.command.type, recorded?.response_status, ctx.requestId);
  return jsonResponse(result.body, result.status, ctx.requestId);
};

// --- Files (R2) -------------------------------------------------------------

const handleFileInit = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (!workspace || workspace.data_mode !== 'BUSINESS') throw new ApiError('NOT_FOUND', 'Workspace not found.');
  const body = await readJson<Record<string, unknown>>(ctx.request, 64 * 1024);
  const envelope = businessEnvelopeFromRequest(ctx.request, { type: 'file.reserve', payload: body });
  const result = await runBusinessDirectoryCommand(ctx.env, ctx.params.workspaceId, ctx.request, envelope);
  const replayed = Boolean(result.replayed);
  return jsonResponse({ ...(result.result as Record<string, unknown>), commandId: result.commandId, replayed }, replayed ? 200 : 201, ctx.requestId);
};

const handleFileContent = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (!workspace || workspace.data_mode !== 'BUSINESS') throw new ApiError('NOT_FOUND', 'Workspace not found.');
  const result = await runBusinessFileContent(ctx.env, ctx.params.workspaceId, ctx.request, ctx.params.fileId);
  return jsonResponse({ ...(result.result as Record<string, unknown>), commandId: result.commandId, replayed: result.replayed }, 200, ctx.requestId);
};

const handleFileComplete = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (!workspace || workspace.data_mode !== 'BUSINESS') throw new ApiError('NOT_FOUND', 'Workspace not found.');
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
};

const handleFileDownload = async (ctx: RouteContext): Promise<Response> => {
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (!workspace || workspace.data_mode !== 'BUSINESS') throw new ApiError('NOT_FOUND', 'Workspace not found.');
  const response = await getBusinessFileDownload(ctx.env, ctx.params.workspaceId, ctx.request, ctx.params.fileId);
  const headers = new Headers(response.headers);
  headers.set('X-Request-Id', ctx.requestId);
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, { status: response.status, headers });
};

const handleFileDelete = async (ctx: RouteContext): Promise<Response> => {
  await assertSameOrigin(ctx.request, ctx.url);
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (!workspace || workspace.data_mode !== 'BUSINESS') throw new ApiError('NOT_FOUND', 'Workspace not found.');
  const expectedVersion = Number(ctx.request.headers.get('X-File-Version'));
  const reason = ctx.request.headers.get('X-Rejection-Reason') ?? '';
  const command = { type: 'file.reject', payload: { fileId: ctx.params.fileId, expectedVersion, reason } };
  const envelope = businessEnvelopeFromRequest(ctx.request, command, [
    { entity: 'FileVersion', id: ctx.params.fileId, version: expectedVersion }
  ]);
  const result = await runBusinessDirectoryCommand(ctx.env, ctx.params.workspaceId, ctx.request, envelope);
  return jsonResponse(result.result, 200, ctx.requestId);
};

const handleFileList = async (ctx: RouteContext): Promise<Response> => {
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (!workspace || workspace.data_mode !== 'BUSINESS') throw new ApiError('NOT_FOUND', 'Workspace not found.');
  const limit = Number(ctx.url.searchParams.get('limit') ?? 100);
  const result = await listBusinessFiles(ctx.env, ctx.params.workspaceId, ctx.request, limit);
  return jsonResponse({ files: result.items }, 200, ctx.requestId);
};

const handleFileMetadata = async (ctx: RouteContext): Promise<Response> => {
  const workspace = await getWorkspace(ctx.env, ctx.params.workspaceId);
  if (!workspace || workspace.data_mode !== 'BUSINESS') throw new ApiError('NOT_FOUND', 'Workspace not found.');
  const result = await getBusinessFileMetadata(ctx.env, ctx.params.workspaceId, ctx.request, ctx.params.fileId);
  return jsonResponse(result, 200, ctx.requestId);
};

const handleIntegrationStatus = async (ctx: RouteContext): Promise<Response> =>
  jsonResponse(await integrationStatus(ctx.env), 200, ctx.requestId);

// --- Router -----------------------------------------------------------------

const router = createRouter()
  .get('/api/health', handleHealth)
  .get('/api/health/live', handleHealthLive)
  .get('/api/health/ready', handleHealthReady)
  .get('/api/health/support-bundle', handleSupportBundle)
  .get('/api/integrations/status', handleIntegrationStatus)
  .post('/api/internal/verification-runs', ingestVerificationRun)
  .post('/api/workspaces', handleCreateWorkspace)
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
  .get('/api/workspaces/:workspaceId/practice/utilization', handleBusinessUtilization)
  .get('/api/workspaces/:workspaceId/practice/engagements/:engagementId/profitability', handleBusinessProfitability)
  .get('/api/workspaces/:workspaceId/practice/reports/trial-balance', handleFirmTrialBalanceReport)
  .get('/api/workspaces/:workspaceId/practice/reports/profit-loss', handleFirmProfitLossReport)
  .get('/api/workspaces/:workspaceId/practice', handleBusinessPracticeWorkspace)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/reporting-workspace', handleBusinessReportingWorkspace)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/archive-status', handleBusinessArchiveStatus)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/archive/export', handleBusinessArchiveExport)
  .post('/api/workspaces/:workspaceId/engagements/:engagementId/archive/download-ticket', handleBusinessArchiveDownloadTicket)
  .get('/api/archive-download/:token', handleNativeArchiveDownload)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/opinion-preview', handleBusinessOpinionPreview)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/released-report/provenance', handleBusinessReleasedReportProvenance)
  .get('/api/workspaces/:workspaceId/pbc-engagements', handleBusinessPbcEngagements)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/pbc/:requestId', handleBusinessPbcRequest)
  .get('/api/workspaces/:workspaceId/engagements/:engagementId/portal', handleBusinessPbcPortal)
  .get('/api/workspaces/:workspaceId/changes', handleChanges)
  .post('/api/workspaces/:workspaceId/commands', handleCommand)
  .get('/api/workspaces/:workspaceId/files', handleFileList)
  .post('/api/workspaces/:workspaceId/files', handleFileInit)
  .get('/api/workspaces/:workspaceId/files/:fileId', handleFileDownload)
  .get('/api/workspaces/:workspaceId/files/:fileId/metadata', handleFileMetadata)
  .delete('/api/workspaces/:workspaceId/files/:fileId', handleFileDelete)
  .put('/api/workspaces/:workspaceId/files/:fileId/content', handleFileContent)
  .post('/api/workspaces/:workspaceId/files/:fileId/complete', handleFileComplete)
  .get('/api/workspaces/:workspaceId', handleGetWorkspace);

export const routeInventory = router.listRoutes();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    const finishApiResponse = (response: Response, route: string): Response => {
      if (url.pathname.startsWith('/api/')) {
        console.log(JSON.stringify(apiRequestMetric({ requestId, route, method: request.method, status: response.status,
          durationMs: performance.now() - startedAt })));
      }
      return response;
    };

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

    if (request.method === 'OPTIONS') return finishApiResponse(new Response(null, { status: 204, headers: baseHeaders(requestId) }), 'OPTIONS');

    const match = router.match(request.method, url.pathname);
    if (!match) {
      const methodMismatch = router.pathExists(url.pathname);
      const body = {
        code: methodMismatch ? 'BAD_REQUEST' : 'NOT_FOUND',
        message: methodMismatch ? 'That API route does not accept this method.' : 'That API route does not exist.',
        requestId
      };
      return finishApiResponse(jsonResponse(body, methodMismatch ? 400 : 404, requestId), methodMismatch ? 'method-mismatch' : 'unmatched');
    }

    try {
      return finishApiResponse(await match.handler({ ...context, params: match.params }), match.routePattern);
    } catch (error) {
      const mapped = toApiError(error, requestId);
      // Structured operational log; never includes secrets, codes or file bytes.
      console.log(JSON.stringify({
        event: 'workspace.api.error',
        requestId,
        route: match.routePattern,
        method: request.method,
        code: mapped.body.code,
        status: mapped.status
      }));
      return finishApiResponse(jsonResponse(mapped.body, mapped.status, requestId), match.routePattern);
    }
  },

  /** Process durable business jobs and operational archive work. */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const now = nowSeconds();
    const at = new Date(now * 1000).toISOString();
    const sweepId = crypto.randomUUID();
    let archiveJobsQueued = 0;
    let processedJobs = 0;
    try {
      await sweepStaleBusinessFiles(env, now).catch(() => {
        console.error(JSON.stringify({ event: 'workspace.file_sweep', examined: 0, rejected: 0, objectsDeleted: 0, errors: 1 }));
      });
      archiveJobsQueued = await queueDueBusinessArchives(env, at).catch(error => {
        console.error(JSON.stringify({ event: 'workspace.archive.sweep_failed', sweepId, errorKind: safeErrorKind(error) }));
        return 0;
      });
      processedJobs = await processBusinessOutbox(env).catch(error => {
        console.error(JSON.stringify({ event: 'workspace.outbox.sweep_failed', sweepId, errorKind: safeErrorKind(error) }));
        return 0;
      });
    } finally {
      await logScheduledOperationalMetrics(env, sweepId, at, archiveJobsQueued, processedJobs);
    }
  }
};

async function logScheduledOperationalMetrics(env: Env, sweepId: string, at: string, archiveJobsQueued: number, processedJobs: number): Promise<void> {
  try {
    const [queue, archives] = await Promise.all([
      env.DB.prepare(`SELECT kind,status,COUNT(*) AS count,MIN(created_at) AS oldest_created_at,MAX(attempts) AS max_attempts
        FROM outbox_jobs WHERE status<>'SUCCEEDED' GROUP BY kind,status`).all<OutboxMetricRow>(),
      env.DB.prepare(`SELECT
          SUM(CASE WHEN e.archive_due_at<=? THEN 1 ELSE 0 END) AS overdue_count,
          SUM(CASE WHEN e.archive_due_at<=? AND (r.id IS NULL OR r.status<>'SEALED') THEN 1 ELSE 0 END) AS overdue_unsealed_count,
          SUM(CASE WHEN e.archive_due_at<=? AND r.status='FAILED' THEN 1 ELSE 0 END) AS failed_due_count
        FROM engagements e JOIN workspaces w ON w.id=e.workspace_id AND w.data_mode='BUSINESS'
        LEFT JOIN archive_runs r ON r.workspace_id=e.workspace_id AND r.engagement_id=e.id
          AND r.id=(SELECT latest.id FROM archive_runs latest WHERE latest.workspace_id=e.workspace_id AND latest.engagement_id=e.id
            ORDER BY latest.updated_at DESC,latest.id DESC LIMIT 1)
        WHERE e.lifecycle_state IN ('COMPLIANCE_COUNTDOWN','ARCHIVED_READ_ONLY') AND e.archive_due_at IS NOT NULL`)
        .bind(at, at, at).first<{ overdue_count: number | null; overdue_unsealed_count: number | null; failed_due_count: number | null }>()
    ]);
    const rows = queue.results ?? [];
    const summary = outboxSnapshot(rows, at, processedJobs, archiveJobsQueued);
    console.log(JSON.stringify({ ...summary, sweepId, archives: {
      overdueCount: Number(archives?.overdue_count ?? 0),
      overdueUnsealedCount: Number(archives?.overdue_unsealed_count ?? 0),
      failedDueCount: Number(archives?.failed_due_count ?? 0)
    } }));
    if (Number(archives?.overdue_unsealed_count ?? 0) > 0 || Number(archives?.failed_due_count ?? 0) > 0) {
      console.error(JSON.stringify({ event: 'workspace.archive.overdue', severity: 'error', sweepId,
        overdueUnsealedCount: Number(archives?.overdue_unsealed_count ?? 0),
        failedDueCount: Number(archives?.failed_due_count ?? 0) }));
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'workspace.scheduled.metrics_failed', sweepId, errorKind: safeErrorKind(error) }));
  }
}
