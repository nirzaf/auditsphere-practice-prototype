import * as z from 'zod';
import { APPLICATION_SCHEMA_VERSION } from './versions';
import type { RouteContext } from './router';
import { ApiError } from './errors';
import { jsonResponse, readJson } from './http';

const VerificationStatusSchema = z.enum(['PASSED', 'FAILED', 'NOT_RUN']);
type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

interface StoredRun {
  id: string;
  workspace_id: string;
  source_commit: string;
  schema_version: number;
  environment: string;
  started_at: string;
  completed_at: string | null;
  status: VerificationStatus;
}

const isCanonicalUtcTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length !== 24 || !value.endsWith('Z')) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
};

const verificationIngestSchema = z.object({
  runId: z.string().regex(/^GHA-\d{1,20}-\d{1,10}$/),
  sourceCommit: z.string().regex(/^[a-f0-9]{7,64}$/i).transform(value => value.toLowerCase()),
  schemaVersion: z.number().int().positive().refine(Number.isSafeInteger)
    .refine(value => value === APPLICATION_SCHEMA_VERSION),
  environment: z.literal('CI'),
  startedAt: z.string().refine(isCanonicalUtcTimestamp),
  completedAt: z.string().refine(isCanonicalUtcTimestamp).nullable(),
  status: VerificationStatusSchema
}).strict().superRefine((run, context) => {
  if (run.status === 'NOT_RUN' && run.completedAt !== null) {
    context.addIssue({ code: 'custom', path: ['completedAt'], message: 'An unrun verification cannot have a completion time.' });
  }
  if (run.status !== 'NOT_RUN'
    && (!run.completedAt || Date.parse(run.completedAt) < Date.parse(run.startedAt))) {
    context.addIssue({ code: 'custom', path: ['completedAt'], message: 'A completed verification needs a completion time after its start.' });
  }
});

type IngestRequest = z.infer<typeof verificationIngestSchema>;

const constantTimeTokenMatch = async (supplied: string, expected: string): Promise<boolean> => {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const suppliedDigest = new Uint8Array(left);
  const expectedDigest = new Uint8Array(right);
  let mismatch = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    mismatch |= suppliedDigest[index] ^ expectedDigest[index];
  }
  return mismatch === 0;
};

const requireTrustedSandbox = (ctx: RouteContext): { token: string; workspaceId: string } => {
  const token = ctx.env.VERIFICATION_INGEST_TOKEN;
  const workspaceId = ctx.env.VERIFICATION_INGEST_WORKSPACE_ID;
  // This endpoint is deliberately unavailable on production and ordinary dev
  // deployments. CI can only write to the one workspace pinned by sandbox env.
  if (ctx.env.ENVIRONMENT !== 'verification-sandbox'
    || typeof token !== 'string' || token.length < 32
    || typeof workspaceId !== 'string' || workspaceId.length < 1 || workspaceId.length > 128) {
    throw new ApiError('NOT_FOUND', 'That API route does not exist.');
  }
  return { token, workspaceId };
};

const parseIngestRequest = (value: unknown): IngestRequest => {
  const parsed = verificationIngestSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Verification metadata failed schema validation.');
  return parsed.data;
};

const matchesStoredRun = (row: StoredRun, workspaceId: string, input: IngestRequest): boolean =>
  row.workspace_id === workspaceId
  && row.source_commit === input.sourceCommit
  && Number(row.schema_version) === input.schemaVersion
  && row.environment === input.environment
  && row.started_at === input.startedAt
  && row.completed_at === input.completedAt
  && row.status === input.status;

/**
 * Accepts allowlisted, redacted verification metadata from trusted CI only.
 * It never executes tests, accepts files, or permits the caller to choose a
 * workspace; those boundaries remain fixed by the verification-sandbox env.
 */
export async function ingestVerificationRun(ctx: RouteContext): Promise<Response> {
  const { token, workspaceId } = requireTrustedSandbox(ctx);
  const authorization = ctx.request.headers.get('Authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match || !(await constantTimeTokenMatch(match[1], token))) {
    throw new ApiError('UNAUTHENTICATED', 'Verification metadata authorization failed.');
  }

  const input = parseIngestRequest(await readJson<unknown>(ctx.request, 16 * 1024));
  const workspace = await ctx.env.DB.prepare(`SELECT id FROM workspaces
    WHERE id=? AND data_mode='BUSINESS' AND status='active'`).bind(workspaceId).first<{ id: string }>();
  if (!workspace) throw new ApiError('UNAVAILABLE', 'The configured verification workspace is unavailable.');

  const existing = await ctx.env.DB.prepare(`SELECT id,workspace_id,source_commit,schema_version,environment,
      started_at,completed_at,status FROM verification_runs WHERE id=?`)
    .bind(input.runId).first<StoredRun>();
  if (existing) {
    if (!matchesStoredRun(existing, workspaceId, input)) {
      throw new ApiError('IDEMPOTENCY_MISMATCH', 'This CI run identity is already bound to different verification metadata.');
    }
    return jsonResponse({ accepted: true, runId: input.runId, replayed: true }, 200, ctx.requestId);
  }

  const ingestedAt = new Date().toISOString();
  await ctx.env.DB.prepare(`INSERT OR IGNORE INTO verification_runs
    (id,workspace_id,source_commit,schema_version,environment,started_at,completed_at,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(input.runId, workspaceId, input.sourceCommit, input.schemaVersion, input.environment,
      input.startedAt, input.completedAt, input.status, ingestedAt, ingestedAt).run();

  // Re-read after INSERT OR IGNORE so concurrent retries converge on the
  // first immutable row and a global primary-key collision cannot be accepted.
  const saved = await ctx.env.DB.prepare(`SELECT id,workspace_id,source_commit,schema_version,environment,
      started_at,completed_at,status FROM verification_runs WHERE id=?`)
    .bind(input.runId).first<StoredRun>();
  if (!saved) throw new ApiError('UNAVAILABLE', 'Verification metadata could not be persisted.');
  if (!matchesStoredRun(saved, workspaceId, input)) {
    throw new ApiError('IDEMPOTENCY_MISMATCH', 'This CI run identity is already bound to different verification metadata.');
  }
  return jsonResponse({ accepted: true, runId: input.runId, replayed: false }, 201, ctx.requestId);
}
