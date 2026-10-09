import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import worker, { businessCommandHttpResult } from '../../worker/index.js';
import { criticalConfirmationBlockers, queueHoldingLetterForBlockers } from '../../worker/businessFieldwork.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';
import { authSessionCookie } from '../helpers/authSession.js';
import { verifyPassword } from '../../worker/auth/passwords.js';
import { preparePortalCredentialProvisioning } from '../../worker/businessPortalCredentials.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function decodedPdfContent(bytes: Uint8Array): string {
  const pdf = Buffer.from(bytes);
  const streams: string[] = [];
  const marker = Buffer.from('stream\n');
  let cursor = 0;
  while (cursor < pdf.length) {
    const markerIndex = pdf.indexOf(marker, cursor);
    if (markerIndex < 0) break;
    const dictionaryStart = pdf.lastIndexOf(Buffer.from('<<'), markerIndex);
    const dictionary = pdf.subarray(dictionaryStart, markerIndex).toString('latin1');
    const dataStart = markerIndex + marker.length;
    const declaredLength = dictionary.match(/\/Length\s+(\d+)\b/);
    const dataEnd = declaredLength
      ? dataStart + Number(declaredLength[1])
      : pdf.indexOf(Buffer.from('endstream'), dataStart);
    if (dataEnd < 0) break;
    if (dictionary.includes('/FlateDecode')) {
      let compressedEnd = dataEnd;
      if (!declaredLength && pdf[compressedEnd - 1] === 0x0a) compressedEnd -= 1;
      if (!declaredLength && pdf[compressedEnd - 1] === 0x0d) compressedEnd -= 1;
      streams.push(inflateSync(pdf.subarray(dataStart, compressedEnd)).toString('latin1'));
    }
    const endMarker = pdf.indexOf(Buffer.from('endstream'), dataEnd);
    if (endMarker < 0) break;
    cursor = endMarker + Buffer.byteLength('endstream');
  }
  return streams.join('\n');
}

/** Independent log-recurrence reference for exact binomial CDF values. */
function referenceBinomialCdf(k: number, n: number, probability: number): number {
  if (k < 0) return 0;
  if (probability <= 0) return 1;
  if (probability >= 1) return k >= n ? 1 : 0;
  const upper = Math.min(k, n);
  const logTerms = [n * Math.log1p(-probability)];
  for (let index = 1; index <= upper; index++) {
    logTerms.push(logTerms[index - 1] + Math.log(n - index + 1) - Math.log(index)
      + Math.log(probability) - Math.log1p(-probability));
  }
  let maximum = Number.NEGATIVE_INFINITY;
  for (const term of logTerms) maximum = Math.max(maximum, term);
  return Math.min(1, Math.exp(maximum) * logTerms.reduce((sum, term) => sum + Math.exp(term - maximum), 0));
}

function referenceMusSampleCount(pT: number, pE: number, alpha: number): number {
  for (let draws = 1; draws <= 5000; draws++) {
    if (referenceBinomialCdf(Math.floor(draws * pE), draws, pT) <= alpha) return draws;
  }
  throw new Error('Reference MUS sample exceeds the supported calculation domain.');
}

function referenceMusUnits(seedHex: string, draws: number, totalMinor: number): number[] {
  const seed = Buffer.from(seedHex, 'hex');
  const range = BigInt(totalMinor);
  const space = 1n << 64n;
  const limit = (space / range) * range;
  return Array.from({ length: draws }, (_, counter) => {
    for (let retry = 0; retry < 100; retry++) {
      const digest = createHmac('sha256', seed)
        .update(`AUDITSPHERE_SAMPLING:v1:${counter}:${retry}`)
        .digest();
      const sample = digest.readBigUInt64BE(0);
      if (sample < limit) return Number(sample % range) + 1;
    }
    throw new Error(`Reference MUS draw ${counter + 1} exceeded the rejection limit.`);
  });
}

function referenceUpperBoundMinor(taintedDraws: number, draws: number, alpha: number, populationMinor: number): number {
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 100; iteration++) {
    const midpoint = (lower + upper) / 2;
    if (referenceBinomialCdf(taintedDraws, draws, midpoint) > alpha) lower = midpoint;
    else upper = midpoint;
  }
  return Math.ceil(((lower + upper) / 2) * populationMinor);
}

const db = new SqliteD1();
db.migrate(repositoryRoot);
const r2Objects = new Map<string, Uint8Array>();
let failNextR2Write = false;
let failNextR2Head = false;
const fakeR2 = {
  async put(key: string, body: BodyInit) {
    if (failNextR2Write) { failNextR2Write = false; throw new Error('Simulated transient object store write failure'); }
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    r2Objects.set(key, bytes);
    return { key, size: bytes.length, etag: 'test-etag', httpEtag: 'test-etag', uploaded: new Date() };
  },
  async get(key: string) {
    const bytes = r2Objects.get(key);
    if (!bytes) return null;
    const copy = bytes.slice();
    return {
      key, size: copy.length, etag: 'test-etag', httpEtag: 'test-etag', uploaded: new Date(),
      body: new Response(copy).body,
      arrayBuffer: async () => copy.slice().buffer,
      text: async () => new TextDecoder().decode(copy),
      json: async () => JSON.parse(new TextDecoder().decode(copy)),
      httpMetadata: {}, customMetadata: {}
    };
  },
  async head(key: string) {
    if (failNextR2Head) { failNextR2Head = false; throw new Error('Simulated transient object store head failure'); }
    const bytes = r2Objects.get(key);
    return bytes ? { key, size: bytes.length, etag: 'test-etag', httpEtag: 'test-etag', uploaded: new Date(), httpMetadata: {}, customMetadata: {} } : null;
  }
};
const env = {
  DB: db,
  FILES: fakeR2 as any,
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as any,
  BOOTSTRAP_TOKEN: 'unit-bootstrap-token-for-fixtures-only-at-least-32',
  PUBLIC_APP_URL: 'https://local.auditsphere.test'
} as any;

async function testFetch(request: Request, requestEnv = env, executionContext = {} as any): Promise<Response> {
  const workspaceId = new URL(request.url).pathname.match(/^\/api\/workspaces\/([^/?]+)/)?.[1];
  const testProfileId = request.headers.get('X-Test-Session-Profile') ?? undefined;
  if (workspaceId && testProfileId && !request.headers.has('Cookie')) {
    const headers = new Headers(request.headers);
    headers.delete('X-Test-Session-Profile');
    headers.set('Cookie', await authSessionCookie(db, workspaceId, testProfileId));
    request = new Request(request, { headers });
  }
  return worker.fetch(request, requestEnv, executionContext);
}

after(() => db.close());

async function call(path: string, options: {
  method?: string;
  payload?: unknown;
  headers?: Record<string, string>;
} = {}): Promise<{ response: Response; body: any }> {
  const method = options.method ?? 'GET';
  const headers = new Headers({ Origin: 'https://local.auditsphere.test', ...options.headers });
  let payload = options.payload;
  if (path.endsWith('/commands') && payload && typeof payload === 'object' && 'command' in payload) {
    const request = payload as { command: { type?: string; payload?: Record<string, unknown> }; idempotencyKey?: string };
    if (request.idempotencyKey) headers.set('Idempotency-Key', request.idempotencyKey);
    const commandPayload = request.command.payload ?? {};
    const commandVersion = request.command.type === 'proposal.create' ? commandPayload.expectedEngagementVersion
      : request.command.type === 'pbc.submit' || request.command.type === 'pbc.review' ? commandPayload.expectedRequestVersion : commandPayload.expectedVersion;
    const versionTarget = typeof commandVersion === 'number'
      ? request.command.type === 'staff.update' ? { entity: 'StaffMember', id: commandPayload.staffMemberId }
        : request.command.type === 'actor-profile.deactivate' ? { entity: 'ActorProfile', id: commandPayload.actorProfileId }
          : request.command.type === 'client.update' || request.command.type === 'client.deactivate' ? { entity: 'Client', id: commandPayload.clientId }
            : request.command.type === 'contact.update' ? { entity: 'Contact', id: commandPayload.contactId }
              : request.command.type === 'lead.update' || request.command.type === 'lead.lose' || request.command.type === 'lead.convert' ? { entity: 'Lead', id: commandPayload.leadId }
                : request.command.type === 'engagement.advance' ? { entity: 'Engagement', id: commandPayload.engagementId }
                  : request.command.type === 'team-cv.approve' ? { entity: 'TeamCv', id: commandPayload.teamCvId }
                      : request.command.type === 'pbc.submit' || request.command.type === 'pbc.review' ? { entity: 'PbcRequest', id: commandPayload.requestId }
                        : request.command.type === 'proposal.create' ? { entity: 'Engagement', id: commandPayload.engagementId }
                      : request.command.type === 'proposal.revise' ? { entity: 'Proposal', id: commandPayload.proposalId }
                        : request.command.type === 'proposal.generate' || request.command.type === 'proposal.generate.retry'
                          || request.command.type === 'proposal.approve' || request.command.type === 'proposal.dispatch'
                          ? { entity: 'ProposalVersion', id: commandPayload.proposalVersionId }
                          : request.command.type === 'proposal.dispatch.retry' ? { entity: 'Dispatch', id: commandPayload.dispatchId }
                          : request.command.type === 'analytical-review.submit' ? { entity: 'AnalyticalReview', id: commandPayload.analyticalReviewId }
                          : request.command.type === 'workprogram.template.approve' ? { entity: 'WorkprogramTemplate', id: commandPayload.templateId }
                          : ['procedure.update', 'procedure.mark-not-applicable', 'procedure.submit', 'procedure.review'].includes(String(request.command.type))
                            ? { entity: 'Procedure', id: commandPayload.procedureId }
                          : request.command.type === 'sampling.policy.approve' ? { entity: 'SamplingPolicy', id: commandPayload.policyId }
                          : request.command.type === 'sampling.record-test' && commandPayload.expectedVersion > 0
                            ? { entity: 'SampleTest', id: commandPayload.populationRowId }
                  : request.command.type === 'time.submit' || request.command.type === 'time.approve'
                    || request.command.type === 'time.return' || request.command.type === 'time.correct'
                    ? { entity: 'TimeEntry', id: commandPayload.timeEntryId }
                    : request.command.type === 'ledger.post' ? { entity: 'FirmJournal', id: commandPayload.journalId }
                  : null
      : null;
    payload = {
      context: {
        ...(headers.get('X-Client-Id') ? { clientId: headers.get('X-Client-Id') } : {}),
        ...(headers.get('X-Engagement-Id') ? { engagementId: headers.get('X-Engagement-Id') } : {})
      },
      expectedVersions: versionTarget && typeof versionTarget.id === 'string'
        ? [{ ...versionTarget, version: commandVersion }]
        : [],
      command: request.command
    };
  }
  if (options.payload !== undefined) headers.set('Content-Type', 'application/json');
  const workspaceId = path.match(/^\/api\/workspaces\/([^/?]+)/)?.[1];
  if (workspaceId) headers.set('Cookie', await authSessionCookie(db as any, workspaceId, headers.get('X-Test-Session-Profile') ?? undefined));
  headers.delete('X-Test-Session-Profile');
  const request = new Request(`https://local.auditsphere.test${path}`, {
    method,
    headers,
    ...(options.payload === undefined ? {} : { body: JSON.stringify(payload) })
  });
  const response = await testFetch(request, env, {} as any);
  return { response, body: await response.json() };
}

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  call(path, { method: 'POST', payload, headers });

it('bootstraps a no-session BUSINESS workspace, records manual dispatch and maintains atomic directory profiles', async () => {
  const live = await call('/api/health/live');
  assert.equal(live.response.status, 200);
  assert.deepEqual(live.body, { status: 'ok' });
  const ready = await call('/api/health/ready');
  assert.equal(ready.response.status, 200, JSON.stringify(ready.body));
  assert.equal(ready.body.status, 'ready');
  assert.equal(ready.body.schemaVersion, 50);
  assert.deepEqual(ready.body.dependencyCodes, []);
  const supportBundle = await call('/api/health/support-bundle');
  assert.equal(supportBundle.response.status, 200);
  assert.match(supportBundle.response.headers.get('content-disposition') ?? '', /attachment; filename="auditsphere-support-bundle.json"/);
  assert.equal(supportBundle.body.applicationSchemaVersion, 50);
  assert.equal(supportBundle.body.installedSchemaVersion, 50);
  assert.equal(supportBundle.body.readiness, 'ready');
  assert.deepEqual(supportBundle.body.verificationRuns, []);
  assert.equal(JSON.stringify(supportBundle.body).includes('workspaceId'), false);
  failNextR2Head = true;
  const degradedReady = await call('/api/health/ready');
  assert.equal(degradedReady.response.status, 503);
  assert.deepEqual(degradedReady.body.dependencyCodes, ['R2_UNAVAILABLE']);

  const input = {
    name: 'AuditSphere local business test',
    currency: 'QAR',
    timezone: 'Asia/Qatar',
    initialPartner: {
      displayName: 'Local Partner',
      naturalPersonKey: `TEST-PERSON-${crypto.randomUUID()}`,
      email: 'local.partner@example.invalid'
    }
  };
  const removedBootstrap = await post('/api/workspaces', input, { 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(removedBootstrap.response.status, 404);

  const bootstrapKey = crypto.randomUUID();
  const bootstrapHeaders = { Authorization: `Bearer ${env.BOOTSTRAP_TOKEN}`, 'Idempotency-Key': bootstrapKey };
  const created = await post('/api/internal/bootstrap', input, bootstrapHeaders);
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.equal(created.response.headers.get('set-cookie'), null, 'BUSINESS setup must not create a session cookie');
  assert.match(created.body.workspaceId, /^[a-f0-9-]{36}$/);
  assert.match(created.body.staffMemberId, /^[a-f0-9-]{36}$/);
  assert.match(created.body.actorProfileId, /^[a-f0-9-]{36}$/);
  const workspaceId = created.body.workspaceId as string;

  const verificationRunId = crypto.randomUUID();
  const verificationStartedAt = new Date(Date.now() - 1000).toISOString();
  const verificationCompletedAt = new Date().toISOString();
  await db.prepare(`INSERT INTO verification_runs(id,workspace_id,source_commit,schema_version,environment,started_at,
    completed_at,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
    verificationRunId, workspaceId, 'a'.repeat(40), 40, 'CI', verificationStartedAt,
    verificationCompletedAt, 'PASSED', verificationCompletedAt, verificationCompletedAt
  ).run();
  const populatedSupportBundle = await call('/api/health/support-bundle');
  assert.equal(populatedSupportBundle.response.status, 200);
  assert.deepEqual(populatedSupportBundle.body.verificationRuns, [{
    sourceCommit: 'a'.repeat(40), schemaVersion: 40, environment: 'CI',
    startedAt: verificationStartedAt, completedAt: verificationCompletedAt, status: 'PASSED'
  }]);
  assert.equal(JSON.stringify(populatedSupportBundle.body).includes(workspaceId), false,
    'the operational export must not reveal the owning workspace ID');

  const replay = await post('/api/internal/bootstrap', input, bootstrapHeaders);
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.workspaceId, workspaceId);
  assert.equal(replay.body.replayed, true);
  const keyReuse = await post('/api/internal/bootstrap', { ...input, name: 'Different request' }, bootstrapHeaders);
  assert.equal(keyReuse.response.status, 409);
  assert.equal(keyReuse.body.code, 'IDEMPOTENCY_MISMATCH');

  const stored = db.prepare(`SELECT w.data_mode,w.seed_id,w.business_status,
      (SELECT COUNT(*) FROM audit_events WHERE workspace_id=w.id) AS event_count,
      (SELECT actor_assurance FROM audit_events WHERE workspace_id=w.id) AS actor_assurance,
      (SELECT source FROM audit_events WHERE workspace_id=w.id) AS event_source,
      (SELECT event_type FROM audit_events WHERE workspace_id=w.id) AS event_type
    FROM workspaces w WHERE w.id=?`).bind(workspaceId).first<any>();
  assert.equal(stored.data_mode, 'BUSINESS');
  assert.equal(stored.seed_id, null);
  assert.equal(stored.business_status, 'ACTIVE');
  assert.equal(db.prepare('PRAGMA table_info(workspaces)').all<any>().results.some(column => column.name === 'expires_at'), false,
    'legacy expiry column was removed');
  assert.equal(stored.event_count, 1);
  assert.equal(stored.actor_assurance, 'SYSTEM');
  assert.equal(stored.event_source, 'JOB');
  assert.equal(stored.event_type, 'BOOTSTRAP');

  const profiles = await call(`/api/workspaces/${workspaceId}/actor-profiles`);
  assert.equal(profiles.response.status, 200, JSON.stringify(profiles.body));
  assert.deepEqual(profiles.body.items.map((profile: any) => profile.persona), ['APPROVER']);
  const approverHeaders = { 'X-Test-Session-Profile': created.body.actorProfileId, };
  const bootstrapChanges = await call(`/api/workspaces/${workspaceId}/changes?after=0`, { headers: approverHeaders });
  assert.equal(bootstrapChanges.response.status, 200, JSON.stringify(bootstrapChanges.body));
  assert.deepEqual(Object.keys(bootstrapChanges.body).sort(), ['events', 'hasMore', 'nextCursor']);
  assert.equal(bootstrapChanges.body.events.length, 1);
  assert.equal(bootstrapChanges.body.events[0].sequence, 1);
  assert.equal(Object.hasOwn(bootstrapChanges.body.events[0], 'details'), false, 'workspace feed never returns private audit details');
  const noNewChanges = await call(`/api/workspaces/${workspaceId}/changes?after=${bootstrapChanges.body.nextCursor}`, { headers: approverHeaders });
  assert.equal(noNewChanges.response.status, 200);
  assert.deepEqual(noNewChanges.body.events, []);
  assert.equal(noNewChanges.body.hasMore, false);
  const futureCursor = await call(`/api/workspaces/${workspaceId}/changes?after=2`, { headers: approverHeaders });
  assert.equal(futureCursor.response.status, 400);
  assert.equal(futureCursor.body.code, 'BAD_REQUEST');
  const approverContext = await call(`/api/workspaces/${workspaceId}/context`, { headers: approverHeaders });
  assert.equal(approverContext.response.status, 200, JSON.stringify(approverContext.body));
  assert.deepEqual(approverContext.body.allowedActions, [
    'directory.manage', 'client.read', 'client.manage', 'lead.read', 'lead.manage', 'lead.convert', 'engagement.read', 'engagement.advance', 'standards.read', 'standards.manage', 'file.read', 'file.upload', 'proposal.read', 'proposal.create', 'proposal.generate', 'proposal.approve', 'proposal.dispatch', 'firm.manage', 'risk.read', 'riskAssessment.draft', 'riskAssessment.submit', 'riskAssessment.resolveEscalation', 'risk.clear', 'commercialAcceptance.read', 'engagementLetter.manage', 'invoice.issue', 'payment.record', 'payment.reverse', 'billing.read', 'pbc.read', 'pbc.manage', 'pbc.review', 'planning.read', 'staffing.manage', 'tb.manage', 'fieldwork.read', 'fieldwork.manage', 'fieldwork.review', 'sampling.manage', 'evidence.review', 'practice.read', 'practice.manage', 'practice.approve', 'ledger.read', 'ledger.manage', 'ledger.post', 'reporting.read', 'reporting.prepare', 'reporting.approve', 'reporting.release', 'firm.admin'
  ]);

  const staffKey = crypto.randomUUID();
  const staffRequest = {
    idempotencyKey: staffKey,
    command: { type: 'staff.create', payload: {
      displayName: 'Local Reviewer',
      naturalPersonKey: `TEST-PERSON-${crypto.randomUUID()}`,
      email: 'local.reviewer@example.invalid',
      grade: 'MANAGER'
    } }
  };
  const staff = await post(`/api/workspaces/${workspaceId}/commands`, staffRequest, approverHeaders);
  assert.equal(staff.response.status, 200, JSON.stringify(staff.body));
  assert.equal(staff.body.replayed, false);
  const firstChangePage = await call(`/api/workspaces/${workspaceId}/changes?after=0&limit=1`, { headers: approverHeaders });
  assert.equal(firstChangePage.response.status, 200, JSON.stringify(firstChangePage.body));
  assert.equal(firstChangePage.body.events.length, 1);
  assert.equal(firstChangePage.body.events[0].sequence, 1);
  assert.equal(firstChangePage.body.hasMore, true);
  assert.equal(firstChangePage.body.nextCursor, '1');
  const secondChangePage = await call(`/api/workspaces/${workspaceId}/changes?after=${firstChangePage.body.nextCursor}&limit=1`, { headers: approverHeaders });
  assert.equal(secondChangePage.response.status, 200, JSON.stringify(secondChangePage.body));
  assert.equal(secondChangePage.body.events[0].sequence, 2);
  assert.equal(secondChangePage.body.hasMore, false);
  const staffReplay = await post(`/api/workspaces/${workspaceId}/commands`, staffRequest, approverHeaders);
  assert.equal(staffReplay.response.status, 200);
  assert.equal(staffReplay.body.result.staffMemberId, staff.body.result.staffMemberId);
  assert.equal(staffReplay.body.replayed, true);

  const assigned = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'actor-profile.assign', payload: { persona: 'REVIEWER', staffMemberId: staff.body.result.staffMemberId } }
  }, approverHeaders);
  assert.equal(assigned.response.status, 200, JSON.stringify(assigned.body));
  const reviewerId = assigned.body.result.actorProfileId as string;
  const reviewerHeaders = { 'X-Test-Session-Profile': reviewerId, };

  const reviewerContext = await call(`/api/workspaces/${workspaceId}/context`, { headers: reviewerHeaders });
  assert.equal(reviewerContext.response.status, 200, JSON.stringify(reviewerContext.body));
  assert.equal(reviewerContext.body.actor.persona, 'REVIEWER');
  const approverContextAgain = await call(`/api/workspaces/${workspaceId}/context`, { headers: approverHeaders });
  assert.equal(approverContextAgain.body.actor.persona, 'APPROVER', 'requests do not share mutable actor state');

  const forbiddenDirectoryEdit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'staff.create', payload: {
      displayName: 'Should Not Be Added', naturalPersonKey: `TEST-${crypto.randomUUID()}`, grade: 'ASSOCIATE'
    } }
  }, reviewerHeaders);
  assert.equal(forbiddenDirectoryEdit.response.status, 403);
  assert.equal(forbiddenDirectoryEdit.body.code, 'PERSONA_ACTION_DENIED');

  const wrongGrade = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'actor-profile.assign', payload: { persona: 'APPROVER', staffMemberId: staff.body.result.staffMemberId } }
  }, approverHeaders);
  assert.equal(wrongGrade.response.status, 403);
  assert.equal(wrongGrade.body.code, 'PERSONA_ACTION_DENIED');

  const staleUpdate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'staff.update', payload: { staffMemberId: staff.body.result.staffMemberId, expectedVersion: 1, displayName: 'Updated Reviewer' } }
  }, approverHeaders);
  assert.equal(staleUpdate.response.status, 200, JSON.stringify(staleUpdate.body));
  const auditCountBeforeStaleRetry = db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?')
    .bind(workspaceId).first<{ count: number }>()?.count;
  const staleRetry = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'staff.update', payload: { staffMemberId: staff.body.result.staffMemberId, expectedVersion: 1, displayName: 'Stale Reviewer' } }
  }, approverHeaders);
  assert.equal(staleRetry.response.status, 409);
  assert.equal(staleRetry.body.code, 'VERSION_CONFLICT');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?')
    .bind(workspaceId).first<{ count: number }>()?.count, auditCountBeforeStaleRetry, 'failed optimistic update writes no audit event');

  const cannotDeactivateLastApprover = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'actor-profile.deactivate', payload: { actorProfileId: created.body.actorProfileId, expectedVersion: 1 } }
  }, approverHeaders);
  assert.equal(cannotDeactivateLastApprover.response.status, 403);
  assert.equal(cannotDeactivateLastApprover.body.code, 'PERSONA_ACTION_DENIED');

  const preparerStaff = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'staff.create', payload: {
      displayName: 'Local Preparer', naturalPersonKey: `TEST-PERSON-${crypto.randomUUID()}`, grade: 'ASSOCIATE'
    } }
  }, approverHeaders);
  assert.equal(preparerStaff.response.status, 200, JSON.stringify(preparerStaff.body));
  const preparerProfile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(),
    command: { type: 'actor-profile.assign', payload: { persona: 'PREPARER', staffMemberId: preparerStaff.body.result.staffMemberId } }
  }, approverHeaders);
  assert.equal(preparerProfile.response.status, 200, JSON.stringify(preparerProfile.body));
  const preparerHeaders = { 'X-Test-Session-Profile': preparerProfile.body.result.actorProfileId as string, };
  const makeClient = (code: string, entityType: 'HOLDING' | 'SUBSIDIARY' | 'STANDALONE', parentClientId?: string) => ({
    code,
    legalName: `${code} Trading WLL`,
    entityType,
    ...(parentClientId ? { parentClientId } : {}),
    industry: 'Trading',
    address: 'Doha, Qatar',
    countryCode: 'QA',
    primaryContact: {
      fullName: `${code} Finance Contact`, email: `${code.toLowerCase()}-finance@example.invalid`,
      title: 'Chief Financial Officer', role: 'CFO_FINANCE_DIRECTOR', effectiveFrom: '2026-01-01'
    }
  });
  const cursorBeforeFirstClient = db.prepare(`SELECT last_sequence FROM audit_chain_heads
    WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`).bind(workspaceId, workspaceId).first<{ last_sequence: number }>()!.last_sequence;
  const firstClient = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'client.create', payload: makeClient('C001', 'HOLDING') }
  }, preparerHeaders);
  assert.equal(firstClient.response.status, 200, JSON.stringify(firstClient.body));
  const clientId = firstClient.body.result.clientId as string;
  const financeContactId = firstClient.body.result.primaryContactId as string;
  assert.deepEqual(firstClient.body.result.routePurposes, ['INVOICE', 'RECEIPT']);

  const clientDetail = await call(`/api/workspaces/${workspaceId}/clients/${clientId}`, { headers: preparerHeaders });
  assert.equal(clientDetail.response.status, 200, JSON.stringify(clientDetail.body));
  assert.equal(clientDetail.body.client.legalName, 'C001 Trading WLL');
  assert.deepEqual(clientDetail.body.routes.map((route: any) => route.purpose), ['INVOICE', 'RECEIPT']);
  assert.equal(clientDetail.body.routes.every((route: any) => route.contact_id === financeContactId), true);

  const pbcContact = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.create', payload: {
      clientId,
      contact: { fullName: 'Chief Accountant', email: 'chief-accountant@example.invalid', title: 'Chief Accountant', role: 'CHIEF_ACCOUNTANT_LIAISON', effectiveFrom: '2026-01-01' }
    } }
  }, preparerHeaders);
  assert.equal(pbcContact.response.status, 200, JSON.stringify(pbcContact.body));
  assert.deepEqual(pbcContact.body.result.routePurposes, ['PBC']);
  const pbcContactId = pbcContact.body.result.contactId as string;
  const wrongPrimaryPbcRoute = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.route', payload: {
      clientId, contactId: financeContactId, purpose: 'PBC', isPrimary: true, expectedVersion: null
    } }
  }, preparerHeaders);
  assert.equal(wrongPrimaryPbcRoute.response.status, 409, JSON.stringify(wrongPrimaryPbcRoute.body));
  assert.equal(wrongPrimaryPbcRoute.body.code, 'GATE_BLOCKED');
  const mismatchedPbcContactRole = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.update', payload: {
      contactId: pbcContactId, expectedVersion: 1, role: 'CFO_FINANCE_DIRECTOR'
    } }
  }, preparerHeaders);
  assert.equal(mismatchedPbcContactRole.response.status, 409, JSON.stringify(mismatchedPbcContactRole.body));
  assert.equal(mismatchedPbcContactRole.body.code, 'GATE_BLOCKED');

  const mdContact = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.create', payload: {
      clientId,
      contact: { fullName: 'Managing Director', email: 'md@example.invalid', title: 'Managing Director', role: 'MD_GM', effectiveFrom: '2026-01-01' }
    } }
  }, preparerHeaders);
  assert.equal(mdContact.response.status, 200, JSON.stringify(mdContact.body));
  assert.deepEqual(mdContact.body.result.routePurposes, ['PROPOSAL', 'EL', 'FINAL_REPORT', 'HOLDING_LETTER']);
  const mdContactId = mdContact.body.result.contactId as string;

  const secondaryFinanceContact = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.create', payload: {
      clientId,
      contact: { fullName: 'Finance Director', email: 'finance-director@example.invalid', title: 'Finance Director', role: 'CFO_FINANCE_DIRECTOR', effectiveFrom: '2026-01-01' }
    } }
  }, preparerHeaders);
  assert.equal(secondaryFinanceContact.response.status, 200, JSON.stringify(secondaryFinanceContact.body));
  assert.deepEqual(secondaryFinanceContact.body.result.routePurposes, [], 'creating a contact must not silently add alternate routes for existing purposes');
  const secondaryFinanceContactId = secondaryFinanceContact.body.result.contactId as string;
  const undocumentedAlternate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.route', payload: {
      clientId, contactId: secondaryFinanceContactId, purpose: 'INVOICE', isPrimary: false, expectedVersion: null
    } }
  }, preparerHeaders);
  assert.equal(undocumentedAlternate.response.status, 422);
  assert.equal(undocumentedAlternate.body.code, 'VALIDATION_FAILED');
  const documentedAlternate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.route', payload: {
      clientId, contactId: secondaryFinanceContactId, purpose: 'INVOICE', isPrimary: false,
      rationale: 'The finance director is the authorized backup when the CFO is unavailable.', expectedVersion: null
    } }
  }, preparerHeaders);
  assert.equal(documentedAlternate.response.status, 200, JSON.stringify(documentedAlternate.body));
  const alternateDetails = await call(`/api/workspaces/${workspaceId}/clients/${clientId}`, { headers: preparerHeaders });
  assert.equal(alternateDetails.body.routes.find((route: any) => route.purpose === 'INVOICE' && route.contact_id === secondaryFinanceContactId)?.rationale,
    'The finance director is the authorized backup when the CFO is unavailable.');
  const promoteAlternate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.route', payload: {
      clientId, contactId: secondaryFinanceContactId, purpose: 'INVOICE', isPrimary: true,
      rationale: 'The CFO remains an approved alternate for invoice delivery.', expectedVersion: 1
    } }
  }, preparerHeaders);
  assert.equal(promoteAlternate.response.status, 200, JSON.stringify(promoteAlternate.body));
  const promotedDetails = await call(`/api/workspaces/${workspaceId}/clients/${clientId}`, { headers: preparerHeaders });
  const invoiceRoutes = promotedDetails.body.routes.filter((route: any) => route.purpose === 'INVOICE');
  assert.equal(invoiceRoutes.find((route: any) => route.contact_id === secondaryFinanceContactId)?.is_primary, 1);
  assert.equal(invoiceRoutes.find((route: any) => route.contact_id === secondaryFinanceContactId)?.rationale, null);
  assert.equal(invoiceRoutes.find((route: any) => route.contact_id === financeContactId)?.is_primary, 0);
  assert.equal(invoiceRoutes.find((route: any) => route.contact_id === financeContactId)?.rationale,
    'The CFO remains an approved alternate for invoice delivery.');

  const routeBeforeContactChange = await call(`/api/workspaces/${workspaceId}/clients/${clientId}`, { headers: preparerHeaders });
  assert.equal(routeBeforeContactChange.body.routes.find((route: any) => route.purpose === 'EL')?.contact_id, mdContactId);
  const contactUpdate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.update', payload: {
      contactId: mdContactId, expectedVersion: 1, email: 'md-new@example.invalid'
    } }
  }, preparerHeaders);
  assert.equal(contactUpdate.response.status, 200, JSON.stringify(contactUpdate.body));
  const routeAfterContactChange = await call(`/api/workspaces/${workspaceId}/clients/${clientId}`, { headers: preparerHeaders });
  assert.equal(routeAfterContactChange.body.routes.find((route: any) => route.purpose === 'EL')?.email, 'md-new@example.invalid');

  const childClient = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'client.create', payload: makeClient('C002', 'SUBSIDIARY', clientId) }
  }, preparerHeaders);
  assert.equal(childClient.response.status, 200, JSON.stringify(childClient.body));
  const childClientId = childClient.body.result.clientId as string;
  const scopedStaff = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staff.create', payload: {
      displayName: 'Client Context Staff', naturalPersonKey: `TEST-PERSON-${crypto.randomUUID()}`,
      email: 'client-context.staff@example.invalid', grade: 'ASSOCIATE'
    } }
  }, { ...approverHeaders, 'X-Client-Id': clientId });
  assert.equal(scopedStaff.response.status, 200, JSON.stringify(scopedStaff.body));
  const clientScopedChanges = await call(`/api/workspaces/${workspaceId}/changes?after=${cursorBeforeFirstClient}`, {
    headers: { ...preparerHeaders, 'X-Client-Id': clientId }
  });
  assert.equal(clientScopedChanges.response.status, 200, JSON.stringify(clientScopedChanges.body));
  assert.equal(clientScopedChanges.body.resyncRequired, undefined, 'new business events have trustworthy scope metadata');
  assert.equal(clientScopedChanges.body.hasMore, false);
  assert.ok(clientScopedChanges.body.events.length > 0);
  assert.equal(clientScopedChanges.body.events.every((event: any) => event.clientId === clientId), true);
  assert.equal(clientScopedChanges.body.events.some((event: any) => event.entityId === scopedStaff.body.result.staffMemberId), false,
    'workspace configuration changes stay out of a client-scoped feed');
  assert.equal(clientScopedChanges.body.events.some((event: any) => event.entityId === childClientId), false,
    'a selected client feed excludes another client’s identifiers');
  const auditCountBeforeCycle = db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?')
    .bind(workspaceId).first<{ count: number }>()?.count;
  const cycleAttempt = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'client.update', payload: {
      clientId, expectedVersion: 1, entityType: 'SUBSIDIARY', parentClientId: childClientId
    } }
  }, preparerHeaders);
  assert.equal(cycleAttempt.response.status, 422, JSON.stringify(cycleAttempt.body));
  assert.equal(cycleAttempt.body.code, 'VALIDATION_FAILED');
  assert.equal(db.prepare('SELECT parent_client_id,entity_type FROM clients WHERE workspace_id=? AND id=?')
    .bind(workspaceId, clientId).first<any>()?.parent_client_id, null);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?')
    .bind(workspaceId).first<{ count: number }>()?.count, auditCountBeforeCycle);

  const wrongWorkspaceParent = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'client.create', payload: makeClient('C003', 'SUBSIDIARY', crypto.randomUUID()) }
  }, preparerHeaders);
  assert.equal(wrongWorkspaceParent.response.status, 422);
  assert.equal(wrongWorkspaceParent.body.code, 'VALIDATION_FAILED');
  const clientList = await call(`/api/workspaces/${workspaceId}/clients?limit=1`, { headers: preparerHeaders });
  assert.equal(clientList.response.status, 200, JSON.stringify(clientList.body));
  assert.equal(clientList.body.items.length, 1);
  assert.ok(clientList.body.nextCursor);
  const nextClientPage = await call(`/api/workspaces/${workspaceId}/clients?limit=1&cursor=${encodeURIComponent(clientList.body.nextCursor)}`, { headers: preparerHeaders });
  assert.equal(nextClientPage.response.status, 200, JSON.stringify(nextClientPage.body));
  assert.equal(nextClientPage.body.items.length, 1);
  assert.notEqual(clientList.body.items[0].id, nextClientPage.body.items[0].id);

  const independentCreates = await Promise.all(['C004', 'C005'].map(code => post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'client.create', payload: makeClient(code, 'STANDALONE') }
  }, preparerHeaders)));
  assert.equal(independentCreates.every(result => result.response.status === 200), true,
    JSON.stringify(independentCreates.map(result => result.body)));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=? AND code IN (?,?)')
    .bind(workspaceId, 'C004', 'C005').first<{ count: number }>()?.count, 2,
    'independent client rows survive a concurrent workspace audit-head advance');

  const clientProfile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'actor-profile.assign', payload: { persona: 'CLIENT', contactId: financeContactId } }
  }, approverHeaders);
  assert.equal(clientProfile.response.status, 200, JSON.stringify(clientProfile.body));
  const clientHeaders = { 'X-Test-Session-Profile': clientProfile.body.result.actorProfileId as string, };
  const clientChanges = await call(`/api/workspaces/${workspaceId}/changes?after=${cursorBeforeFirstClient}`, { headers: clientHeaders });
  assert.equal(clientChanges.response.status, 200, JSON.stringify(clientChanges.body));
  assert.equal(clientChanges.body.resyncRequired, undefined);
  assert.ok(clientChanges.body.events.length > 0);
  assert.equal(clientChanges.body.events.every((event: any) => Object.keys(event).sort().join(',') === 'changedAt,sequence'), true,
    'CLIENT feed events expose only sequence and time, not staff or entity details');
  const pbcClientProfile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'actor-profile.assign', payload: { persona: 'CLIENT', contactId: pbcContactId } }
  }, approverHeaders);
  assert.equal(pbcClientProfile.response.status, 200, JSON.stringify(pbcClientProfile.body));
  const pbcClientIdentity = { 'X-Test-Session-Profile': pbcClientProfile.body.result.actorProfileId as string, };

  const clientProjection = await call(`/api/workspaces/${workspaceId}/clients`, { headers: clientHeaders });
  assert.equal(clientProjection.response.status, 200, JSON.stringify(clientProjection.body));
  assert.equal(clientProjection.body.items.length, 1);
  assert.equal(clientProjection.body.items[0].id, clientId);
  assert.equal('code' in clientProjection.body.items[0], false, 'CLIENT receives an explicit projection allowlist');
  const scopedClientDetail = await call(`/api/workspaces/${workspaceId}/clients/${clientId}`, { headers: clientHeaders });
  assert.equal(scopedClientDetail.response.status, 200, JSON.stringify(scopedClientDetail.body));
  assert.deepEqual(scopedClientDetail.body.routes, []);
  assert.equal(scopedClientDetail.body.contacts.length, 1);
  assert.equal(scopedClientDetail.body.contacts[0].id, financeContactId);
  const outOfScopeClient = await call(`/api/workspaces/${workspaceId}/clients/${childClientId}`, { headers: clientHeaders });
  assert.equal(outOfScopeClient.response.status, 403);
  assert.equal(outOfScopeClient.body.code, 'FORBIDDEN_SCOPE');

  const futureIas1Profile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'standards-profile.create', payload: {
      name: 'Invalid future IAS 1 profile', effectivePeriodStart: '2027-01-01', effectivePeriodEnd: '2027-12-31',
      isa220Edition: 'ISA 220 Revised', isa570Edition: 'ISA 570 Revised 2024', reportingFramework: 'IFRS',
      presentationEdition: 'IAS1', earlyAdoption: false
    } }
  }, approverHeaders);
  assert.equal(futureIas1Profile.response.status, 422, JSON.stringify(futureIas1Profile.body));
  assert.equal(futureIas1Profile.body.code, 'VALIDATION_FAILED');
  const unapprovedEarlyIfrs18Profile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'standards-profile.create', payload: {
      name: 'Unapproved early IFRS 18 profile', effectivePeriodStart: '2026-01-01', effectivePeriodEnd: '2026-12-31',
      isa220Edition: 'ISA 220 Revised', isa570Edition: 'ISA 570 Revised 2024', reportingFramework: 'IFRS',
      presentationEdition: 'IFRS18', earlyAdoption: false
    } }
  }, approverHeaders);
  assert.equal(unapprovedEarlyIfrs18Profile.response.status, 422, JSON.stringify(unapprovedEarlyIfrs18Profile.body));
  assert.equal(unapprovedEarlyIfrs18Profile.body.code, 'VALIDATION_FAILED');

  const standards = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'standards-profile.create', payload: {
      name: 'Test firm-approved standards', effectivePeriodStart: '2020-01-01', effectivePeriodEnd: '2030-12-31',
      isa220Edition: 'ISA 220 Revised', isa570Edition: 'ISA 570 Revised 2024', reportingFramework: 'IFRS',
      presentationEdition: 'IAS1', earlyAdoption: false
    } }
  }, approverHeaders);
  assert.equal(standards.response.status, 200, JSON.stringify(standards.body));
  const actualStandardsProfileId = standards.body.result.standardsProfileId as string;
  assert.match(standards.body.result.contentSha256, /^[a-f0-9]{64}$/);
  const standardsProfiles = await call(`/api/workspaces/${workspaceId}/standards-profiles`, { headers: approverHeaders });
  assert.equal(standardsProfiles.response.status, 200, JSON.stringify(standardsProfiles.body));
  assert.equal(standardsProfiles.body.items.length, 1);
  const lead = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'lead.create', payload: {
      clientId, primaryContactId: financeContactId, source: 'REFERRAL', receivedAt: '2026-10-05T09:00:00Z',
      requestedService: 'STATUTORY_AUDIT', periodStart: '2025-01-01', periodEnd: '2025-12-31'
    } }
  }, preparerHeaders);
  assert.equal(lead.response.status, 200, JSON.stringify(lead.body));
  const leadId = lead.body.result.leadId as string;
  const leadList = await call(`/api/workspaces/${workspaceId}/leads?status=OPEN`, { headers: preparerHeaders });
  assert.equal(leadList.response.status, 200, JSON.stringify(leadList.body));
  assert.equal(leadList.body.items.length, 1);
  assert.equal(leadList.body.items[0].estimatedFeeMinor, null);
  const clientLeadList = await call(`/api/workspaces/${workspaceId}/leads`, { headers: clientHeaders });
  assert.equal(clientLeadList.response.status, 403);

  const missingFeeConvert = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'lead.convert', payload: {
      leadId, expectedVersion: 1, engagementCode: 'E2026-001', standardsProfileId: actualStandardsProfileId
    } }
  }, preparerHeaders);
  assert.equal(missingFeeConvert.response.status, 422);
  assert.equal(missingFeeConvert.body.code, 'VALIDATION_FAILED');
  const conversion = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'lead.convert', payload: {
      leadId, expectedVersion: 1, engagementCode: 'E2026-001', standardsProfileId: actualStandardsProfileId, contractFeeMinor: '250001'
    } }
  }, preparerHeaders);
  assert.equal(conversion.response.status, 200, JSON.stringify(conversion.body));
  assert.equal(conversion.body.result.state, 'LEAD_INGESTION');
  const engagementId = conversion.body.result.engagementId as string;
  const initialWorkflow = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/workflow`, {
    headers: { ...preparerHeaders, 'X-Client-Id': clientId }
  });
  assert.equal(initialWorkflow.response.status, 200, JSON.stringify(initialWorkflow.body));
  assert.equal(initialWorkflow.body.state, 'LEAD_INGESTION');
  assert.ok(Number.isSafeInteger(initialWorkflow.body.sourceVersion) && initialWorkflow.body.sourceVersion > 0);
  assert.equal(initialWorkflow.body.stages.length, 11);
  assert.equal(initialWorkflow.body.stages[0].status, 'current');
  assert.equal(initialWorkflow.body.stages[0].completedCount, 0);
  assert.equal(initialWorkflow.body.stages[0].blockerCoverage, 'evaluated');
  assert.deepEqual(initialWorkflow.body.stages[0].blockers, [], 'the active converted lead and primary contact satisfy intake readiness');
  assert.equal(initialWorkflow.body.stages.at(-1).status, 'pending');
  const wrongClientWorkflow = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/workflow`, {
    headers: { ...preparerHeaders, 'X-Client-Id': crypto.randomUUID() }
  });
  assert.equal(wrongClientWorkflow.response.status, 403);
  assert.equal(wrongClientWorkflow.body.code, 'FORBIDDEN_SCOPE');
  const advance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'engagement.advance', payload: {
      engagementId, expectedVersion: 1, expectedState: 'LEAD_INGESTION'
    } }
  }, preparerHeaders);
  assert.equal(advance.response.status, 200, JSON.stringify(advance.body));
  assert.equal(advance.body.result.state, 'PROPOSAL_GENERATION');
  const proposalWorkflow = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/workflow`, {
    headers: { ...preparerHeaders, 'X-Client-Id': clientId }
  });
  assert.equal(proposalWorkflow.response.status, 200, JSON.stringify(proposalWorkflow.body));
  assert.equal(proposalWorkflow.body.stages[1].status, 'blocked');
  assert.equal(proposalWorkflow.body.stages[1].blockerCoverage, 'evaluated');
  assert.deepEqual(proposalWorkflow.body.stages[1].blockers.map((item: any) => item.code), ['CURRENT_PROPOSAL_REQUIRED']);
  const engagementChanges = await call(`/api/workspaces/${workspaceId}/changes?after=${cursorBeforeFirstClient}&engagementId=${engagementId}`, {
    headers: { ...approverHeaders, 'X-Client-Id': clientId }
  });
  assert.equal(engagementChanges.response.status, 200, JSON.stringify(engagementChanges.body));
  assert.equal(engagementChanges.body.resyncRequired, undefined);
  assert.ok(engagementChanges.body.events.some((event: any) => event.engagementId === engagementId));
  assert.equal(engagementChanges.body.events.every((event: any) => event.clientId === clientId), true, JSON.stringify(engagementChanges.body.events));
  const transition = db.prepare(`SELECT from_state,to_state,command_id FROM state_transitions WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId, conversion.body.result.engagementId).first<any>();
  assert.deepEqual({ ...transition }, { from_state: 'LEAD_INGESTION', to_state: 'PROPOSAL_GENERATION', command_id: advance.body.commandId });

  const pdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  const fileReservation = await post(`/api/workspaces/${workspaceId}/files`, {
    clientId, engagementId: conversion.body.result.engagementId, purpose: 'EVIDENCE', originalName: 'internal-evidence.pdf',
    mediaType: 'application/pdf', sizeBytes: pdf.length
  }, { ...preparerHeaders, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(fileReservation.response.status, 201, JSON.stringify(fileReservation.body));
  assert.equal(fileReservation.body.state, 'INITIALIZED');
  const fileId = fileReservation.body.fileId as string;

  const uploadFileBytes = async (bytes: Uint8Array, idempotencyKey: string) => {
    const uploadRequest = new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${fileId}/content`, {
      method: 'PUT',
      headers: {
        Origin: 'https://local.auditsphere.test', ...preparerHeaders, 'Idempotency-Key': idempotencyKey,
        'X-File-Version': '1', 'Content-Type': 'application/pdf',
        Cookie: await authSessionCookie(db, workspaceId, preparerHeaders['X-Test-Session-Profile'])
      },
      body: bytes
    });
    const response = await testFetch(uploadRequest, env, {} as any);
    return { response, body: await response.json() };
  };
  const disguisedBytes = new Uint8Array(pdf.length);
  disguisedBytes.set(new TextEncoder().encode('MZ\u0000not a PDF'));
  const disguisedExecutable = await uploadFileBytes(disguisedBytes, crypto.randomUUID());
  assert.equal(disguisedExecutable.response.status, 415);
  assert.equal(disguisedExecutable.body.code, 'UNSUPPORTED_MEDIA_TYPE');
  assert.equal(db.prepare('SELECT state FROM file_versions WHERE workspace_id=? AND id=?').bind(workspaceId, fileId).first<any>()?.state, 'INITIALIZED');

  const stageKey = crypto.randomUUID();
  const stagedFile = await uploadFileBytes(pdf, stageKey);
  assert.equal(stagedFile.response.status, 200, JSON.stringify(stagedFile.body));
  assert.equal(stagedFile.body.state, 'STAGED');
  assert.equal(stagedFile.body.sha256, 'eadef7418e14af08d4dab416d408d94121199f49e60eed1caa7a6bec3b16ebe0');
  const stageReplay = await uploadFileBytes(pdf, stageKey);
  assert.equal(stageReplay.response.status, 200);
  assert.equal(stageReplay.body.replayed, true, 'the same binary upload key and bytes replay the recorded stage result');
  const changedPdf = pdf.slice();
  changedPdf[5] = '2'.charCodeAt(0);
  const changedRetry = await uploadFileBytes(changedPdf, stageKey);
  assert.equal(changedRetry.response.status, 409);
  assert.equal(changedRetry.body.code, 'IDEMPOTENCY_MISMATCH');

  const staleCommit = await post(`/api/workspaces/${workspaceId}/files/${fileId}/complete`, {
    expectedVersion: 1, sizeBytes: stagedFile.body.sizeBytes, sha256: stagedFile.body.sha256
  }, { ...preparerHeaders, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(staleCommit.response.status, 409);
  assert.equal(staleCommit.body.code, 'VERSION_CONFLICT');
  const commitKey = crypto.randomUUID();
  const committedFile = await post(`/api/workspaces/${workspaceId}/files/${fileId}/complete`, {
    expectedVersion: 2, sizeBytes: stagedFile.body.sizeBytes, sha256: stagedFile.body.sha256
  }, { ...preparerHeaders, 'Idempotency-Key': commitKey });
  assert.equal(committedFile.response.status, 200, JSON.stringify(committedFile.body));
  assert.equal(committedFile.body.state, 'COMMITTED');
  const committedRow = db.prepare('SELECT version,state,immutable,sha256,object_key FROM file_versions WHERE workspace_id=? AND id=?')
    .bind(workspaceId, fileId).first<any>();
  assert.deepEqual({ version: committedRow.version, state: committedRow.state, immutable: committedRow.immutable }, { version: 3, state: 'COMMITTED', immutable: 1 });
  assert.equal(committedRow.sha256, stagedFile.body.sha256);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=? AND entity_id=?')
    .bind(workspaceId, fileId).first<any>()?.count, 3, 'reservation, staging and commitment are individually audited');
  const listedFiles = await call(`/api/workspaces/${workspaceId}/files`, { headers: preparerHeaders });
  assert.equal(listedFiles.response.status, 200, JSON.stringify(listedFiles.body));
  assert.equal(listedFiles.body.files.length, 1);
  assert.equal(listedFiles.body.files[0].id, fileId);
  const download = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${fileId}`, { headers: preparerHeaders }), env, {} as any);
  assert.equal(download.status, 200);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), pdf, 'download returns the verified committed bytes');
  const otherClientFile = await call(`/api/workspaces/${workspaceId}/files/${crypto.randomUUID()}/metadata`, { headers: preparerHeaders });
  assert.equal(otherClientFile.response.status, 404);
  const selectedClientTemplate = await post(`/api/workspaces/${workspaceId}/files`, {
    purpose: 'TEMPLATE', originalName: 'firm-template.txt', mediaType: 'text/plain', sizeBytes: 4
  }, { ...approverHeaders, 'X-Client-Id': clientId, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(selectedClientTemplate.response.status, 201, JSON.stringify(selectedClientTemplate.body));

  const prospectLead = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'lead.create', payload: {
      newClient: {
        code: 'PROSPECT-001', legalName: 'Prospect Trading WLL', industry: 'Trading', address: 'Doha, Qatar', countryCode: 'QA',
        primaryContact: { fullName: 'Prospect Finance Contact', email: 'prospect.finance@example.invalid', title: 'CFO', role: 'CFO_FINANCE_DIRECTOR' }
      },
      source: 'WEB_FORM', receivedAt: '2026-10-05T10:00:00Z', requestedService: 'STATUTORY_AUDIT',
      periodStart: '2025-01-01', periodEnd: '2025-12-31', estimatedFeeMinor: '120000'
    } }
  }, preparerHeaders);
  assert.equal(prospectLead.response.status, 200, JSON.stringify(prospectLead.body));
  assert.equal(prospectLead.body.result.createdClient, true);
  assert.match(prospectLead.body.result.clientId, /^[a-f0-9-]{36}$/);
  assert.match(prospectLead.body.result.primaryContactId, /^[a-f0-9-]{36}$/);
  assert.deepEqual(prospectLead.body.result.routePurposes, ['INVOICE', 'RECEIPT']);
  const prospectRows = db.prepare(`SELECT l.client_id,l.primary_contact_id,c.legal_name,ct.is_primary,
      (SELECT COUNT(*) FROM contact_routes cr WHERE cr.workspace_id=c.workspace_id AND cr.client_id=c.id) AS route_count
    FROM leads l JOIN clients c ON c.workspace_id=l.workspace_id AND c.id=l.client_id
    JOIN contacts ct ON ct.workspace_id=l.workspace_id AND ct.client_id=l.client_id AND ct.id=l.primary_contact_id
    WHERE l.workspace_id=? AND l.id=?`).bind(workspaceId, prospectLead.body.result.leadId).first<any>();
  assert.equal(prospectRows.legal_name, 'Prospect Trading WLL');
  assert.equal(prospectRows.is_primary, 1);
  assert.equal(prospectRows.route_count, 2);

  const auditBeforeDuplicate = db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?')
    .bind(workspaceId).first<{ count: number }>()?.count;
  const duplicateProspect = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'lead.create', payload: {
      newClient: {
        code: 'PROSPECT-002', legalName: ' Prospect Trading WLL ', industry: 'Trading', address: 'Doha, Qatar', countryCode: 'QA',
        primaryContact: { fullName: 'Different Contact', email: 'different@example.invalid', title: 'CFO', role: 'CFO_FINANCE_DIRECTOR' }
      },
      source: 'REFERRAL', receivedAt: '2026-10-05T10:05:00Z', requestedService: 'STATUTORY_AUDIT',
      periodStart: '2025-01-01', periodEnd: '2025-12-31'
    } }
  }, preparerHeaders);
  assert.equal(duplicateProspect.response.status, 409, JSON.stringify(duplicateProspect.body));
  assert.match(duplicateProspect.body.message, /exact legal name.*link the lead/i);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM clients WHERE workspace_id=? AND code IN (?,?)')
    .bind(workspaceId, 'PROSPECT-001', 'PROSPECT-002').first<{ count: number }>()?.count, 1,
    'duplicate exact legal name does not create another client');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM leads WHERE workspace_id=?')
    .bind(workspaceId).first<{ count: number }>()?.count, 2,
    'duplicate prospect does not create an orphan lead');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?')
    .bind(workspaceId).first<{ count: number }>()?.count, auditBeforeDuplicate,
    'a rejected duplicate does not append an audit decision');

  const createFirmEvidenceFile = async (originalName: string): Promise<string> => {
    const bytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
    const reservation = await post(`/api/workspaces/${workspaceId}/files`, {
      purpose: 'TEMPLATE', originalName, mediaType: 'application/pdf', sizeBytes: bytes.length
    }, { ...approverHeaders, 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(reservation.response.status, 201, JSON.stringify(reservation.body));
    const staged = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${reservation.body.fileId}/content`, {
      method: 'PUT', headers: { Origin: 'https://local.auditsphere.test', ...approverHeaders, 'Idempotency-Key': crypto.randomUUID(),
        'X-File-Version': '1', 'Content-Type': 'application/pdf' }, body: bytes
    }), env, {} as any);
    const stagedBody = await staged.json() as any;
    assert.equal(staged.status, 200, JSON.stringify(stagedBody));
    const committed = await post(`/api/workspaces/${workspaceId}/files/${reservation.body.fileId}/complete`, {
      expectedVersion: 2, sizeBytes: bytes.length, sha256: stagedBody.sha256
    }, { ...approverHeaders, 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(committed.response.status, 200, JSON.stringify(committed.body));
    return reservation.body.fileId;
  };
  const credentialEvidenceFileId = await createFirmEvidenceFile('qatar-audit-registration.pdf');
  const portfolioEvidenceFileId = await createFirmEvidenceFile('anonymized-trading-portfolio.pdf');
  const firmProfile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'firm-profile.save', payload: {
      expectedVersion: null, legalName: 'Local Audit Partners WLL', registrationNumber: 'CR-LOCAL-001',
      address: 'Doha, Qatar', profileText: 'Independent assurance and advisory services for Qatar entities.',
      methodologyText: 'The firm performs a risk-based engagement using its approved methodology and documented professional review.',
      credentialsText: 'Current Qatar audit registration verified against firm records.',
      industryPortfolioText: 'Anonymized statutory audit experience across local trading and service entities.',
      credentialFileVersionIds: [credentialEvidenceFileId], portfolioFileVersionIds: [portfolioEvidenceFileId]
    } }
  }, approverHeaders);
  assert.equal(firmProfile.response.status, 200, JSON.stringify(firmProfile.body));
  assert.equal(firmProfile.body.result.version, 1);

  const proposalTerms = {
    engagementId: conversion.body.result.engagementId,
    mode: 'FULL_PROPOSAL',
    scope: 'Statutory audit for the reporting period ended 31 December 2025.',
    feeMinor: '250001', validUntil: '2026-11-01',
    timeline: [{ name: 'Planning and fieldwork', date: '2027-02-15' }]
  };
  const blockedFullProposal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.create', payload: { ...proposalTerms, expectedEngagementVersion: advance.body.result.version } }
  }, reviewerHeaders);
  assert.equal(blockedFullProposal.response.status, 409, JSON.stringify(blockedFullProposal.body));
  assert.equal(blockedFullProposal.body.code, 'GATE_BLOCKED');
  assert.match(blockedFullProposal.body.message, /approved.*CV.*Partner/i);

  const cvBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  const cvReservation = await post(`/api/workspaces/${workspaceId}/files`, {
    purpose: 'TEMPLATE', originalName: 'approved-partner-cv.pdf', mediaType: 'application/pdf', sizeBytes: cvBytes.length
  }, { ...approverHeaders, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(cvReservation.response.status, 201, JSON.stringify(cvReservation.body));
  const cvUpload = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${cvReservation.body.fileId}/content`, {
    method: 'PUT', headers: { Origin: 'https://local.auditsphere.test', ...approverHeaders, 'Idempotency-Key': crypto.randomUUID(), 'X-File-Version': '1', 'Content-Type': 'application/pdf' }, body: cvBytes
  }), env, {} as any);
  const cvStaged = await cvUpload.json() as any;
  assert.equal(cvUpload.status, 200, JSON.stringify(cvStaged));
  const cvCommit = await post(`/api/workspaces/${workspaceId}/files/${cvReservation.body.fileId}/complete`, {
    expectedVersion: 2, sizeBytes: cvBytes.length, sha256: cvStaged.sha256
  }, { ...approverHeaders, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(cvCommit.response.status, 200, JSON.stringify(cvCommit.body));
  const partnerStaffId = db.prepare(`SELECT staff_member_id FROM actor_profiles WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, created.body.actorProfileId).first<any>()?.staff_member_id;
  const attachedCv = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'team-cv.attach', payload: { staffMemberId: partnerStaffId, fileVersionId: cvReservation.body.fileId } }
  }, approverHeaders);
  assert.equal(attachedCv.response.status, 200, JSON.stringify(attachedCv.body));
  const approvedCv = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'team-cv.approve', payload: {
      teamCvId: attachedCv.body.result.teamCvId, expectedVersion: 1, rationale: 'The Partner reviewed this current CV and confirms it for client proposals.'
    } }
  }, approverHeaders);
  assert.equal(approvedCv.response.status, 200, JSON.stringify(approvedCv.body));
  assert.equal(approvedCv.body.result.status, 'APPROVED');

  const proposal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.create', payload: { ...proposalTerms, selectedTeamCvIds: [attachedCv.body.result.teamCvId], expectedEngagementVersion: advance.body.result.version } }
  }, reviewerHeaders);
  assert.equal(proposal.response.status, 200, JSON.stringify(proposal.body));
  assert.equal(proposal.body.result.revision, 1);
  assert.deepEqual({ advance: proposal.body.result.advanceMinor, final: proposal.body.result.finalMinor }, { advance: '125001', final: '125000' });
  const proposalEvidencePins = db.prepare(`SELECT firm_credential_file_ids_json,firm_portfolio_file_ids_json
    FROM proposal_versions WHERE workspace_id=? AND id=?`).bind(workspaceId, proposal.body.result.proposalVersionId).first<any>();
  assert.deepEqual(JSON.parse(proposalEvidencePins.firm_credential_file_ids_json), [credentialEvidenceFileId]);
  assert.deepEqual(JSON.parse(proposalEvidencePins.firm_portfolio_file_ids_json), [portfolioEvidenceFileId]);

  const revisedProposal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.revise', payload: {
      ...proposalTerms, selectedTeamCvIds: [attachedCv.body.result.teamCvId], proposalId: proposal.body.result.proposalId, expectedVersion: 1,
      scope: 'Statutory audit scope with the agreed reporting period and named deliverables.'
    } }
  }, reviewerHeaders);
  assert.equal(revisedProposal.response.status, 200, JSON.stringify(revisedProposal.body));
  assert.equal(revisedProposal.body.result.revision, 2);
  assert.equal(db.prepare('SELECT scope FROM proposal_versions WHERE workspace_id=? AND id=?')
    .bind(workspaceId, proposal.body.result.proposalVersionId).first<any>()?.scope, proposalTerms.scope,
    'an issued revision remains immutable when a new proposal revision is drafted');
  const generateProposal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.generate', payload: {
      proposalVersionId: revisedProposal.body.result.proposalVersionId, expectedVersion: 1
    } }
  }, reviewerHeaders);
  assert.equal(generateProposal.response.status, 202, JSON.stringify(generateProposal.body));
  assert.equal(generateProposal.body.result.status, 'PENDING');
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const generatedJob = db.prepare(`SELECT status,result_file_id FROM outbox_jobs WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, generateProposal.body.result.jobId).first<any>();
  assert.equal(generatedJob?.status, 'SUCCEEDED', 'the scheduled outbox renders and commits the actual proposal PDF');
  const generatedFile = db.prepare(`SELECT state,purpose,media_type,sha256,size_bytes,immutable FROM file_versions WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, generatedJob.result_file_id).first<any>();
  assert.deepEqual({ state: generatedFile?.state, purpose: generatedFile?.purpose, mediaType: generatedFile?.media_type, immutable: generatedFile?.immutable },
    { state: 'COMMITTED', purpose: 'GENERATED', mediaType: 'application/pdf', immutable: 1 });
  assert.ok(generatedFile.sha256 && generatedFile.size_bytes > 500);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM proposal_artifacts WHERE workspace_id=? AND proposal_version_id=?`)
    .bind(workspaceId, revisedProposal.body.result.proposalVersionId).first<any>()?.count, 1);
  const downloadedProposal = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${generatedJob.result_file_id}`, {
    headers: { Origin: 'https://local.auditsphere.test', ...reviewerHeaders }
  }), env, {} as any);
  const downloadedBytes = new Uint8Array(await downloadedProposal.arrayBuffer());
  assert.equal(downloadedProposal.status, 200);
  assert.equal(await crypto.subtle.digest('SHA-256', downloadedBytes).then(digest => Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')), generatedFile.sha256,
    'the downloaded proposal contains the exact committed PDF bytes');
  const proposalWorkspace = await call(`/api/workspaces/${workspaceId}/proposal-workspace`, { headers: reviewerHeaders });
  assert.equal(proposalWorkspace.response.status, 200, JSON.stringify(proposalWorkspace.body));
  assert.equal(proposalWorkspace.body.proposals[0].revision, 2);
  assert.equal(proposalWorkspace.body.proposals[0].documentStatus, 'SUCCEEDED');
  assert.equal(proposalWorkspace.body.proposals[0].artifactFileId, generatedJob.result_file_id);
  assert.equal(proposalWorkspace.body.firmProfile.registrationNumber, 'CR-LOCAL-001');
  assert.deepEqual(proposalWorkspace.body.firmProfile.credentialFileVersionIds, [credentialEvidenceFileId]);
  assert.deepEqual(proposalWorkspace.body.firmProfile.portfolioFileVersionIds, [portfolioEvidenceFileId]);

  const thirdProposal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.revise', payload: {
      ...proposalTerms, selectedTeamCvIds: [attachedCv.body.result.teamCvId], proposalId: proposal.body.result.proposalId, expectedVersion: 2,
      scope: 'Statutory audit and reporting deliverables for the agreed reporting period ended 31 December 2025.'
    } }
  }, reviewerHeaders);
  assert.equal(thirdProposal.response.status, 200, JSON.stringify(thirdProposal.body));
  failNextR2Write = true;
  const failingGenerate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.generate', payload: {
      proposalVersionId: thirdProposal.body.result.proposalVersionId, expectedVersion: 1
    } }
  }, reviewerHeaders);
  assert.equal(failingGenerate.response.status, 202, JSON.stringify(failingGenerate.body));
  await worker.scheduled({ scheduledTime: Date.now(), cron: '* * * * *' } as any, env);
  const failedDocument = db.prepare(`SELECT status,last_error_code FROM outbox_jobs WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, failingGenerate.body.result.jobId).first<any>();
  assert.equal(failedDocument?.status, 'RETRYABLE_FAILED');
  assert.equal(failedDocument?.last_error_code, 'OBJECT_STORE_WRITE_FAILED');
  const retryDocument = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.generate.retry', payload: {
      proposalVersionId: thirdProposal.body.result.proposalVersionId, expectedVersion: 1, failedJobId: failingGenerate.body.result.jobId
    } }
  }, reviewerHeaders);
  assert.equal(retryDocument.response.status, 202, JSON.stringify(retryDocument.body));
  await worker.scheduled({ scheduledTime: Date.now(), cron: '* * * * *' } as any, env);
  assert.equal(db.prepare(`SELECT status FROM outbox_jobs WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, failingGenerate.body.result.jobId).first<any>()?.status, 'SUCCEEDED');
  const latestProposalWorkspace = await call(`/api/workspaces/${workspaceId}/proposal-workspace`, { headers: reviewerHeaders });
  assert.equal(latestProposalWorkspace.body.proposals[0].revision, 3);
  assert.equal(latestProposalWorkspace.body.proposals[0].documentStatus, 'SUCCEEDED');

  const approval = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.approve', payload: {
      proposalVersionId: thirdProposal.body.result.proposalVersionId, expectedVersion: 1,
      note: 'The Partner reviewed the generated current quotation against approved firm content.'
    } }
  }, approverHeaders);
  assert.equal(approval.response.status, 200, JSON.stringify(approval.body));

  const route = latestProposalWorkspace.body.contactRoutes[0];
  assert.ok(route?.id, 'a proposal email contact route is available');
  const queuedDispatch = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.dispatch', payload: {
      proposalVersionId: thirdProposal.body.result.proposalVersionId, expectedVersion: 1, contactRouteId: route.id
    } }
  }, approverHeaders);
  assert.equal(queuedDispatch.response.status, 202, JSON.stringify(queuedDispatch.body));
  assert.equal(queuedDispatch.body.result.status, 'QUEUED');
  assert.equal(db.prepare(`SELECT lifecycle_state FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, conversion.body.result.engagementId).first<any>()?.lifecycle_state, 'PROPOSAL_GENERATION',
    'queue insertion does not advance the lifecycle before provider acceptance');

  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const failedDispatch = db.prepare(`SELECT d.status,d.version,j.status AS job_status,j.last_error_code
    FROM dispatches d JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id
    WHERE d.workspace_id=? AND d.id=?`).bind(workspaceId, queuedDispatch.body.result.dispatchId).first<any>();
  assert.equal(failedDispatch?.status, 'FAILED');
  assert.equal(failedDispatch?.job_status, 'PERMANENT_FAILED');
  assert.equal(failedDispatch?.last_error_code, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  assert.equal(db.prepare(`SELECT lifecycle_state FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, conversion.body.result.engagementId).first<any>()?.lifecycle_state, 'PROPOSAL_GENERATION',
    'an unconfigured email provider does not claim acceptance or progress the engagement');
  const failureView = await call(`/api/workspaces/${workspaceId}/proposal-workspace`, { headers: reviewerHeaders });
  assert.equal(failureView.body.proposals[0].dispatchStatus, 'FAILED');
  assert.equal(failureView.body.proposals[0].dispatchErrorCode, 'EMAIL_PROVIDER_NOT_CONFIGURED');

  const retryWithoutSender = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.dispatch.retry', payload: {
      dispatchId: queuedDispatch.body.result.dispatchId, expectedVersion: failedDispatch.version
    } }
  }, approverHeaders);
  assert.equal(retryWithoutSender.response.status, 202, JSON.stringify(retryWithoutSender.body));
  env.EMAIL_PROVIDER = { fetch: async () => Response.json({ error: 'EMAIL_SENDER_NOT_CONFIGURED' }, { status: 424 }) };
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const rejectedSenderDispatch = db.prepare(`SELECT d.status,d.version,j.status AS job_status,j.last_error_code
    FROM dispatches d JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id
    WHERE d.workspace_id=? AND d.id=?`).bind(workspaceId, retryWithoutSender.body.result.dispatchId).first<any>();
  assert.equal(rejectedSenderDispatch?.status, 'FAILED');
  assert.equal(rejectedSenderDispatch?.job_status, 'PERMANENT_FAILED');
  assert.equal(rejectedSenderDispatch?.last_error_code, 'EMAIL_PROVIDER_HTTP_424');

  const retryDispatch = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.dispatch.retry', payload: {
      dispatchId: retryWithoutSender.body.result.dispatchId, expectedVersion: rejectedSenderDispatch.version
    } }
  }, approverHeaders);
  assert.equal(retryDispatch.response.status, 202, JSON.stringify(retryDispatch.body));
  const latestApproval = db.prepare(`SELECT decided_at FROM proposal_approvals WHERE workspace_id=? AND proposal_version_id=?
    ORDER BY decided_at DESC,id DESC LIMIT 1`).bind(workspaceId, thirdProposal.body.result.proposalVersionId).first<any>();
  assert.ok(latestApproval?.decided_at, 'the exact proposal revision has a recorded Partner approval');
  const manualFirst = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.dispatch.recordManual', payload: {
      engagementId: conversion.body.result.engagementId, proposalVersionId: thirdProposal.body.result.proposalVersionId,
      channel: 'WHATSAPP', contactId: financeContactId, sentAt: latestApproval.decided_at,
      note: 'Synthetic acceptance fixture: approved proposal sent manually.'
    } }
  }, approverHeaders);
  assert.equal(manualFirst.response.status, 200, JSON.stringify(manualFirst.body));
  assert.equal(manualFirst.body.result.status, 'RECORDED');
  assert.equal(manualFirst.body.result.lifecycleState, 'DUAL_KEY_PENDING');
  assert.equal(manualFirst.body.result.channel, 'WHATSAPP');
  assert.equal(db.prepare(`SELECT file_version_id FROM manual_dispatch_records WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, manualFirst.body.result.manualDispatchId).first<any>()?.file_version_id,
  db.prepare(`SELECT ga.file_version_id FROM proposal_artifacts pa JOIN generated_artifacts ga
    ON ga.workspace_id=pa.workspace_id AND ga.id=pa.artifact_id WHERE pa.workspace_id=? AND pa.proposal_version_id=?`)
    .bind(workspaceId, thirdProposal.body.result.proposalVersionId).first<any>()?.file_version_id,
  'manual dispatch history pins the exact generated PDF for the approved proposal');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM state_transitions WHERE workspace_id=? AND engagement_id=?
    AND to_state='DUAL_KEY_PENDING'`).bind(workspaceId, conversion.body.result.engagementId).first<any>()?.count, 1,
  'manual delivery writes one proposal acceptance transition');
  const manualWorkflow = await call(`/api/workspaces/${workspaceId}/engagements/${conversion.body.result.engagementId}/workflow`, {
    headers: { ...approverHeaders, 'X-Client-Id': clientId }
  });
  assert.equal(manualWorkflow.response.status, 200, JSON.stringify(manualWorkflow.body));
  assert.equal(manualWorkflow.body.stages[1].status, 'completed',
    'a recorded manual send satisfies proposal dispatch readiness for the exact current revision');
  let deliveredAttachments = 0;
  let deliveredAttachmentNames: string[] = [];
  const deliveredRecipients: string[] = [];
  const deliveredPortalMessages: Array<{ to: string; subject: string; text: string; purpose: string }> = [];
  let emailProviderMessageSequence = 0;
  env.EMAIL_PROVIDER = { fetch: async (request: Request) => {
    const form = await request.formData();
    const message = JSON.parse(String(form.get('message')));
    assert.match(message.to, /^[^@]+@example\.invalid$/);
    deliveredRecipients.push(message.to);
    const files = form.getAll('attachment').filter((item): item is File => typeof item !== 'string');
    if (message.purpose === 'PORTAL_CREDENTIALS' || message.purpose === 'PORTAL_ACCESS_NOTICE') {
      assert.equal(files.length, 0, 'portal credentials are never written into a document attachment');
      deliveredPortalMessages.push(message);
    } else {
      deliveredAttachments = files.length;
      deliveredAttachmentNames = files.map(file => file.name);
    }
    assert.ok(request.headers.get('Idempotency-Key'));
    emailProviderMessageSequence += 1;
    return Response.json({ messageId: `local-provider-message-${emailProviderMessageSequence}` }, { status: 202 });
  } };
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  assert.equal(deliveredAttachments, 4, 'dispatch contains the proposal PDF, Partner CV and both selected firm evidence files');
  assert.ok(deliveredAttachmentNames.includes('qatar-audit-registration.pdf'));
  assert.ok(deliveredAttachmentNames.includes('anonymized-trading-portfolio.pdf'));
  assert.equal(db.prepare(`SELECT status FROM dispatches WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, retryDispatch.body.result.dispatchId).first<any>()?.status, 'ACCEPTED');
  assert.equal(db.prepare(`SELECT lifecycle_state FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, conversion.body.result.engagementId).first<any>()?.lifecycle_state, 'DUAL_KEY_PENDING',
    'email-provider acceptance preserves the lifecycle state already advanced by manual delivery');
  const manualAfterEmail = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.dispatch.recordManual', payload: {
      engagementId: conversion.body.result.engagementId, proposalVersionId: thirdProposal.body.result.proposalVersionId,
      channel: 'HAND_DELIVERY', contactId: financeContactId, sentAt: new Date().toISOString(),
      note: 'Synthetic acceptance fixture: a second delivery channel was recorded after the email acceptance.'
    } }
  }, approverHeaders);
  assert.equal(manualAfterEmail.response.status, 200, JSON.stringify(manualAfterEmail.body));
  assert.equal(manualAfterEmail.body.result.lifecycleState, 'DUAL_KEY_PENDING',
    'recording a later delivery channel preserves the already-advanced lifecycle state');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM state_transitions WHERE workspace_id=? AND engagement_id=?
    AND to_state='DUAL_KEY_PENDING'`).bind(workspaceId, conversion.body.result.engagementId).first<any>()?.count, 1,
  'email acceptance after manual delivery does not duplicate the lifecycle transition');
  const manualDispatchHistory = await call(`/api/workspaces/${workspaceId}/proposal-workspace`, { headers: approverHeaders });
  assert.equal(manualDispatchHistory.response.status, 200, JSON.stringify(manualDispatchHistory.body));
  assert.deepEqual(manualDispatchHistory.body.proposals[0].manualDispatches.map((item: any) => item.channel).sort(),
    ['HAND_DELIVERY', 'WHATSAPP']);

  const makeRiskHeaders = (headers: Record<string, string>) => ({ ...headers, 'X-Client-Id': clientId, 'X-Engagement-Id': engagementId });
  // US-REP-001 — a visible Partner opinion control is not an authorization boundary.
  const reviewerOpinionAttempt = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'opinion.select', payload: {
      engagementId, category: 'UNMODIFIED', affectedFslis: [],
      rationale: 'This reviewer must not create a Partner-only audit opinion.',
      materialityAssessment: 'The reviewer has no authority to approve materiality for the report.',
      pervasivenessAssessment: 'The reviewer has no authority to approve report pervasiveness.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(reviewerOpinionAttempt.response.status, 403, JSON.stringify(reviewerOpinionAttempt.body));
  assert.equal(reviewerOpinionAttempt.body.code, 'PERSONA_ACTION_DENIED');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM opinion_versions WHERE workspace_id=? AND engagement_id=?')
    .bind(workspaceId, engagementId).first<any>()?.count, 0, 'a denied direct API call leaves no opinion version');
  const invalidModifiedOpinion = await post('/api/workspaces/' + workspaceId + '/commands', {
    idempotencyKey: crypto.randomUUID(), command: { type: 'opinion.select', payload: {
      engagementId, category: 'QUALIFIED', affectedFslis: [],
      rationale: 'The Partner conclusion is recorded for this synthetic audit.',
      materialityAssessment: 'The amount is evaluated against overall materiality.',
      pervasivenessAssessment: 'The effect is assessed across the financial statements.'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(invalidModifiedOpinion.response.status, 422, JSON.stringify(invalidModifiedOpinion.body));
  assert.equal(invalidModifiedOpinion.body.code, 'VALIDATION_FAILED', 'the HTTP command boundary rejects incomplete modified opinions');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM opinion_versions WHERE workspace_id=? AND engagement_id=?')
    .bind(workspaceId, engagementId).first<any>()?.count, 0, 'invalid category-specific input cannot persist an opinion');
  const reviewerOpinionPreview = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/opinion-preview?versionId=${crypto.randomUUID()}`,
    { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(reviewerOpinionPreview.response.status, 403, JSON.stringify(reviewerOpinionPreview.body));
  assert.equal(reviewerOpinionPreview.body.code, 'PERSONA_ACTION_DENIED', 'a Reviewer cannot read the Partner-only opinion preview');
  const reviewerReportProvenance = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/released-report/provenance`,
    { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(reviewerReportProvenance.response.status, 403, JSON.stringify(reviewerReportProvenance.body));
  assert.equal(reviewerReportProvenance.body.code, 'PERSONA_ACTION_DENIED', 'a Reviewer cannot read internal signature provenance');
  const unreleasedReportProvenance = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/released-report/provenance`,
    { headers: makeRiskHeaders(approverHeaders) });
  assert.equal(unreleasedReportProvenance.response.status, 404, JSON.stringify(unreleasedReportProvenance.body));
  assert.equal(unreleasedReportProvenance.body.code, 'NOT_FOUND', 'a staged candidate or consent is not presented as released provenance');

  const signatory = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.update', payload: { contactId: financeContactId, expectedVersion: 1, isSignatory: true } }
  }, preparerHeaders);
  assert.equal(signatory.response.status, 200, JSON.stringify(signatory.body));

  const owner = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.owner.save', payload: {
      engagementId, expectedVersion: null, fullName: 'Test beneficial owner', ownershipBps: 10000,
      controlBasis: 'Direct 100 percent ownership per the filed shareholder register.', identityEvidenceFileId: fileId,
      effectiveFrom: '2020-01-01', active: true
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(owner.response.status, 200, JSON.stringify(owner.body));
  assert.equal(owner.body.result.revision, 1);

  const riskChecks = [
    ['UBO', fileId], ['KYC', fileId], ['AML', fileId], ['INTEGRITY', undefined], ['VIABILITY', undefined], ['INDEPENDENCE', undefined], ['CONFLICTS', undefined]
  ].map(([code, evidenceFileId]) => ({
    code, outcome: code === 'AML' ? 'ISSUE' : 'CLEAR', findings: `${code} reviewed against the current client evidence and recorded sources.`,
    sourceReference: `${code} workpaper evidence and reviewer inspection`, checkedOn: '2026-10-05',
    ...(evidenceFileId ? { evidenceFileId } : {})
  }));
  const riskDraftPayload = {
    engagementId, track: 'NEW_CLIENT', expectedDraftVersion: 0, questionnaireTemplateVersion: 'QA-TRACK-A-2026.1',
    assessmentDate: '2026-10-05', overallRisk: 'MODERATE',
    managementIntegrityConclusion: 'Management integrity was reviewed against the documented source evidence and no unresolved issue was identified.',
    viabilityConclusion: 'The client has a viable operating profile based on the current engagement intake and records reviewed.',
    independenceConclusion: 'The engagement team independence checks were documented and no unresolved conflict was identified.', checks: riskChecks
  };
  const draftRisk = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.saveDraft', payload: riskDraftPayload }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(draftRisk.response.status, 200, JSON.stringify(draftRisk.body));
  assert.equal(draftRisk.body.result.draftVersion, 1);

  const incompleteGate = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/acceptance-gate`, { headers: makeRiskHeaders(approverHeaders) });
  assert.equal(incompleteGate.response.status, 200, JSON.stringify(incompleteGate.body));
  assert.equal(incompleteGate.body.commercialKey.status, 'PENDING');
  assert.equal(incompleteGate.body.riskKey.status, 'PENDING');
  assert.equal(incompleteGate.body.ready, false);
  const blockedWorkflow = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/workflow`, { headers: makeRiskHeaders(approverHeaders) });
  assert.equal(blockedWorkflow.response.status, 200, JSON.stringify(blockedWorkflow.body));
  assert.equal(blockedWorkflow.body.state, 'DUAL_KEY_PENDING');
  assert.equal(blockedWorkflow.body.stages[2].status, 'blocked');
  assert.equal(blockedWorkflow.body.stages[2].blockerCoverage, 'evaluated');
  assert.equal(blockedWorkflow.body.stages[2].blockers.length, 2);
  const clientWorkflow = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/workflow`, {
    headers: makeRiskHeaders(clientHeaders)
  });
  assert.equal(clientWorkflow.response.status, 200, JSON.stringify(clientWorkflow.body));
  assert.equal(clientWorkflow.body.stages[2].status, 'blocked');
  assert.equal(clientWorkflow.body.stages[2].blockers.every((blocker: any) => !('entityId' in blocker)), true,
    'the CLIENT workflow projection does not reveal internal entity identifiers');

  const submitRisk = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.submit', payload: { assessmentId: draftRisk.body.result.assessmentId, expectedDraftVersion: 1 } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(submitRisk.response.status, 200, JSON.stringify(submitRisk.body));
  const submitDuplicate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.submit', payload: { assessmentId: draftRisk.body.result.assessmentId, expectedDraftVersion: 1 } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(submitDuplicate.response.status, 409);
  assert.equal(submitDuplicate.body.code, 'VERSION_CONFLICT');

  const clientCannotReadRisk = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/risk-workspace`, { headers: makeRiskHeaders(clientHeaders) });
  assert.equal(clientCannotReadRisk.response.status, 403);
  const clientCannotClearRisk = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'risk.clear', payload: { engagementId, riskAssessmentVersionId: submitRisk.body.result.assessmentVersionId, rationale: 'The client must not clear internal risk.' } }
  }, makeRiskHeaders(clientHeaders));
  assert.equal(clientCannotClearRisk.response.status, 403);
  assert.equal(clientCannotClearRisk.body.code, 'PERSONA_ACTION_DENIED');

  const amlCheckId = db.prepare(`SELECT id FROM risk_checks WHERE workspace_id=? AND assessment_version_id=? AND code='AML'`)
    .bind(workspaceId, submitRisk.body.result.assessmentVersionId).first<any>()?.id as string;
  const unresolvedIssueClear = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'risk.clear', payload: {
      engagementId, riskAssessmentVersionId: submitRisk.body.result.assessmentVersionId,
      rationale: 'Attempted Partner clearance while the AML issue still needs review.'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(unresolvedIssueClear.response.status, 409);
  assert.equal(unresolvedIssueClear.body.code, 'GATE_BLOCKED');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM risk_clearances WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId, engagementId).first<any>()?.count, 0, 'blocked clearance writes no decision history');

  const escalation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.escalate', payload: {
      assessmentVersionId: submitRisk.body.result.assessmentVersionId, checkId: amlCheckId,
      reason: 'The AML source report contains an unresolved adverse media match requiring Partner evaluation.',
      requiredEvidence: 'Obtain the current signed client explanation and supporting court disposition.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(escalation.response.status, 200, JSON.stringify(escalation.body));
  const clearWhileEscalated = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'risk.clear', payload: {
      engagementId, riskAssessmentVersionId: submitRisk.body.result.assessmentVersionId,
      rationale: 'Attempted Partner clearance while the escalation remains open.'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(clearWhileEscalated.response.status, 409);
  assert.equal(clearWhileEscalated.body.code, 'GATE_BLOCKED');
  const unqualifiedResolution = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.resolveEscalation', payload: {
      escalationId: escalation.body.result.escalationId, expectedVersion: 1,
      resolution: 'Reviewed the source report and supporting documents; the issue is resolved for this revision.', evidenceFileId: fileId
    } }
  }, makeRiskHeaders(preparerHeaders));
  assert.equal(unqualifiedResolution.response.status, 403);
  assert.equal(unqualifiedResolution.body.code, 'PERSONA_ACTION_DENIED');
  const resolvedEscalation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.resolveEscalation', payload: {
      escalationId: escalation.body.result.escalationId, expectedVersion: 1,
      resolution: 'Reviewed the source report and signed client explanation; the reported matter is not a match to the client.', evidenceFileId: fileId
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(resolvedEscalation.response.status, 200, JSON.stringify(resolvedEscalation.body));
  assert.equal(resolvedEscalation.body.result.status, 'RESOLVED');

  const clearedRisk = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'risk.clear', payload: {
      engagementId, riskAssessmentVersionId: submitRisk.body.result.assessmentVersionId,
      rationale: 'The Partner reviewed the complete current Track A dossier and its pinned evidence.'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(clearedRisk.response.status, 200, JSON.stringify(clearedRisk.body));
  assert.equal(clearedRisk.body.result.folderProvision.createdCount, 5);
  const foldersAfterClearance = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/folders`, { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(foldersAfterClearance.response.status, 200, JSON.stringify(foldersAfterClearance.body));
  assert.deepEqual(foldersAfterClearance.body.folders.map((folder: any) => [folder.ordinal, folder.code, folder.displayName]), [
    [1, 'ADMIN_PLANNING', '01_Administration & Planning'], [2, 'TB_SCHEDULES', '02_Trial Balance & Schedules'],
    [3, 'FIELDWORK_TESTING', '03_Fieldwork & Testing'], [4, 'DRAFTS_DELIVERABLES', '04_Drafts & Deliverables'],
    [5, 'FINAL_SIGNED_ARCHIVE', '05_Final Signed Archive']
  ]);
  assert.equal(foldersAfterClearance.body.folders.reduce((total: number, folder: any) => total + folder.fileCount, 0), 0,
    'automatic folder provisioning creates no placeholder documents');
  const oneKeyGate = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/acceptance-gate`, { headers: makeRiskHeaders(approverHeaders) });
  assert.equal(oneKeyGate.body.commercialKey.status, 'PENDING');
  assert.equal(oneKeyGate.body.riskKey.status, 'ACTIVE');
  assert.equal(oneKeyGate.body.ready, false);

  const proposalVersionId = thirdProposal.body.result.proposalVersionId as string;
  const forgedDualKey = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'commercialAcceptance.record', payload: {
      engagementId, proposalVersionId, acceptedFeeMinor: '250001', confirmationText: 'I accept the agreed scope and fee.', dualKeyPassed: true
    } }
  }, makeRiskHeaders(clientHeaders));
  assert.equal(forgedDualKey.response.status, 400);
  assert.equal(forgedDualKey.body.code, 'BAD_REQUEST');

  const wrongFee = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'commercialAcceptance.record', payload: {
      engagementId, proposalVersionId, acceptedFeeMinor: '250000', confirmationText: 'I accept the agreed scope and fee.'
    } }
  }, makeRiskHeaders(clientHeaders));
  assert.equal(wrongFee.response.status, 422);
  assert.equal(wrongFee.body.code, 'VALIDATION_FAILED');

  const accepted = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'commercialAcceptance.record', payload: {
      engagementId, proposalVersionId, acceptedFeeMinor: '250001', confirmationText: 'I accept the agreed audit scope and stated proposal fee.'
    } }
  }, makeRiskHeaders(clientHeaders));
  assert.equal(accepted.response.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.result.commercialKey, 'ACTIVE');
  assert.equal(db.prepare(`SELECT contract_fee_minor FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, engagementId).first<any>()?.contract_fee_minor, 250001,
    'acceptance atomically replaces the conversion estimate with the exact current proposal fee');
  assert.equal(db.prepare(`SELECT lifecycle_state FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, engagementId).first<any>()?.lifecycle_state, 'ADVANCE_BILLING',
    'both current keys advance the engagement atomically into advance billing');
  const readyGate = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/acceptance-gate`, { headers: makeRiskHeaders(approverHeaders) });
  assert.equal(readyGate.body.ready, true);
  assert.equal(readyGate.body.commercialKey.status, 'ACTIVE');
  assert.equal(readyGate.body.riskKey.status, 'ACTIVE');
  const clientReadyGate = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/acceptance-gate`, { headers: makeRiskHeaders(clientHeaders) });
  assert.equal(clientReadyGate.body.ready, true);
  assert.equal('partnerName' in clientReadyGate.body.riskKey, false, 'the client projection does not disclose internal risk decision details');
  assert.equal(typeof clientReadyGate.body.commercialKey.acceptanceId, 'string', 'a client can manage only its own acceptance record');
  const revokedAcceptance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'commercialAcceptance.revoke', payload: {
      acceptanceId: clientReadyGate.body.commercialKey.acceptanceId, rationale: 'The client requested withdrawal while the current proposal terms are being reconsidered.'
    } }
  }, makeRiskHeaders(clientHeaders));
  assert.equal(revokedAcceptance.response.status, 200, JSON.stringify(revokedAcceptance.body));
  const revokedGate = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/acceptance-gate`, { headers: makeRiskHeaders(approverHeaders) });
  assert.equal(revokedGate.body.commercialKey.status, 'REVOKED');
  assert.equal(revokedGate.body.riskKey.status, 'ACTIVE');
  assert.equal(revokedGate.body.ready, false, 'revoking the commercial key invalidates the gate without rewriting the risk decision');
  const renewedAcceptance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'commercialAcceptance.record', payload: {
      engagementId, proposalVersionId, acceptedFeeMinor: '250001', confirmationText: 'I reconfirm the current audit scope and proposal fee.'
    } }
  }, makeRiskHeaders(clientHeaders));
  assert.equal(renewedAcceptance.response.status, 200, JSON.stringify(renewedAcceptance.body));
  const renewedGate = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/acceptance-gate`, { headers: makeRiskHeaders(approverHeaders) });
  assert.equal(renewedGate.body.ready, true);
  const readWorkflowStage = async (state: string) => {
    const workflow = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/workflow`, { headers: makeRiskHeaders(approverHeaders) });
    assert.equal(workflow.response.status, 200, JSON.stringify(workflow.body));
    assert.equal(workflow.body.state, state);
    const stage = workflow.body.stages.find((item: any) => item.id === state);
    assert.ok(stage, `workflow includes ${state}`);
    assert.equal(stage.blockerCoverage, 'evaluated', `${state} readiness is projected from persisted records`);
    return stage;
  };
  const billingBeforeLetter = await readWorkflowStage('ADVANCE_BILLING');
  assert.equal(billingBeforeLetter.status, 'blocked');
  assert.deepEqual(billingBeforeLetter.blockers.map((item: any) => item.code), ['ISSUED_ENGAGEMENT_LETTER_REQUIRED']);

  const storeCommittedFile = async (purpose: string, originalName: string, mediaType: string, bytes: Uint8Array, headers: Record<string, string>, scope: Record<string, string> = {}) => {
    const reservation = await post(`/api/workspaces/${workspaceId}/files`, { ...scope, purpose, originalName, mediaType, sizeBytes: bytes.length },
      { ...headers, 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(reservation.response.status, 201, JSON.stringify(reservation.body));
    const fileId = reservation.body.fileId as string;
    const staged = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${fileId}/content`, {
      method: 'PUT', headers: { Origin: 'https://local.auditsphere.test', ...headers, 'Idempotency-Key': crypto.randomUUID(), 'X-File-Version': '1', 'Content-Type': mediaType }, body: bytes
    }), env, {} as any);
    const stagedBody = await staged.json() as any;
    assert.equal(staged.status, 200, JSON.stringify(stagedBody));
    const committed = await post(`/api/workspaces/${workspaceId}/files/${fileId}/complete`, {
      expectedVersion: 2, sizeBytes: stagedBody.sizeBytes, sha256: stagedBody.sha256
    }, { ...headers, 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(committed.response.status, 200, JSON.stringify(committed.body));
    assert.equal(committed.body.state, 'COMMITTED');
    return fileId;
  };
  const validPng = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQMQr4DwACigGWbdwAgAAAAABJRU5ErkJggg=='), value => value.charCodeAt(0));
  const signatureFileId = await storeCommittedFile('SIGNATURE', 'partner-signature.png', 'image/png', validPng, approverHeaders);
  const sealFileId = await storeCommittedFile('SEAL', 'firm-seal.png', 'image/png', validPng, approverHeaders);
  const wrongServiceTemplate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'document-template.save', payload: {
      serviceType: 'INTERNAL_AUDIT', name: 'Internal audit letter', clauses: 'Firm-approved internal audit service terms and scope.', expectedRevision: 0
    } }
  }, approverHeaders);
  assert.equal(wrongServiceTemplate.response.status, 200, JSON.stringify(wrongServiceTemplate.body));
  const serviceTemplate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'document-template.save', payload: {
      serviceType: 'STATUTORY_AUDIT', name: 'Statutory audit letter', clauses: 'Firm-approved statutory audit service terms and scope.', expectedRevision: 0
    } }
  }, approverHeaders);
  assert.equal(serviceTemplate.response.status, 200, JSON.stringify(serviceTemplate.body));
  const taxPolicy = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'billing.tax-policy.save', payload: {
      name: 'Local explicit zero-tax policy', taxBasisPoints: 0, rationale: 'Firm-approved test policy; zero is explicitly configured for this test workspace.'
    } }
  }, approverHeaders);
  assert.equal(taxPolicy.response.status, 200, JSON.stringify(taxPolicy.body));
  for (const command of [
    { type: 'signature-asset.consent', payload: { fileVersionId: signatureFileId, decision: 'CONSENT', rationale: 'I consent to use this uploaded test signature image.' } },
    { type: 'seal-asset.approve', payload: { fileVersionId: sealFileId, decision: 'APPROVE', rationale: 'This uploaded test PNG is approved as the firm seal image.' } }
  ]) {
    const decision = await post(`/api/workspaces/${workspaceId}/commands`, { idempotencyKey: crypto.randomUUID(), command }, approverHeaders);
    assert.equal(decision.response.status, 200, JSON.stringify(decision.body));
  }
  const deliveryPath = `/api/workspaces/${workspaceId}/engagements/${engagementId}/delivery-workspace`;
  const deliveryBeforeLetter = await call(deliveryPath, { headers: makeRiskHeaders(approverHeaders) });
  assert.equal(deliveryBeforeLetter.response.status, 200, JSON.stringify(deliveryBeforeLetter.body));
  const deliveryRoutes = deliveryBeforeLetter.body.contactRoutes as Array<{ id: string; purpose: string }>;
  const letterRouteId = deliveryRoutes.find(item => item.purpose === 'EL')?.id;
  const invoiceRouteId = deliveryRoutes.find(item => item.purpose === 'INVOICE')?.id;
  const receiptRouteId = deliveryRoutes.find(item => item.purpose === 'RECEIPT')?.id;
  assert.ok(letterRouteId && invoiceRouteId && receiptRouteId, 'all three active commercial routes are available');
  const wrongTemplateLetter = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'engagementLetter.generate', payload: {
      engagementId, templateVersionId: wrongServiceTemplate.body.result.templateVersionId, signatureFileVersionId: signatureFileId, sealFileVersionId: sealFileId
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(wrongTemplateLetter.response.status, 409);
  assert.equal(wrongTemplateLetter.body.code, 'GATE_BLOCKED');
  const generatedLetter = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'engagementLetter.generate', payload: {
      engagementId, templateVersionId: serviceTemplate.body.result.templateVersionId, signatureFileVersionId: signatureFileId, sealFileVersionId: sealFileId
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(generatedLetter.response.status, 202, JSON.stringify(generatedLetter.body));
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const renderedDelivery = await call(deliveryPath, { headers: makeRiskHeaders(approverHeaders) });
  const renderedDraft = renderedDelivery.body.letterDrafts.find((draft: any) => draft.id === generatedLetter.body.result.draftId);
  assert.equal(renderedDraft?.status, 'SUCCEEDED', JSON.stringify(renderedDraft));
  assert.ok(renderedDraft.fileVersionId);
  const renderedLetterFile = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${renderedDraft.fileVersionId}`, { headers: makeRiskHeaders(approverHeaders) }), env, {} as any);
  const renderedLetterBytes = new Uint8Array(await renderedLetterFile.arrayBuffer());
  assert.equal(renderedLetterFile.status, 200);
  assert.equal(new TextDecoder().decode(renderedLetterBytes.slice(0, 8)), '%PDF-1.3', 'the approved clause and actual PNG assets produced a PDF');
  const renderedLetterContent = decodedPdfContent(renderedLetterBytes);
  const clientLegalName = db.prepare('SELECT legal_name FROM clients WHERE workspace_id=? AND id=?')
    .bind(workspaceId, clientId).first<any>()?.legal_name;
  for (const expected of [
    'ENGAGEMENT LETTER',
    'E2026-001',
    clientLegalName,
    'STATUTORY AUDIT',
    '2025-01-01 to 2025-12-31',
    'QAR 2,500.01',
    '2027-02-15',
    'Firm-approved statutory audit service terms and scope.',
    'Partner signature image',
    'Firm seal',
    'not a certificate-based digital signature.'
  ]) {
    assert.ok(renderedLetterContent.includes(expected), `the actual engagement-letter PDF contains ${expected}`);
  }
  assert.ok((new TextDecoder().decode(renderedLetterBytes).match(/\/Subtype \/Image\b/g) ?? []).length >= 1,
    'the actual engagement-letter PDF embeds the approved PNG asset data');

  const issuedLetter = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'engagementLetter.issue', payload: {
      engagementId, jobId: renderedDraft.jobId, expectedProposalVersionId: renewedGate.body.commercialKey.proposalVersionId,
      expectedRiskClearanceId: renewedGate.body.riskKey.clearanceId, contactRouteId: letterRouteId,
      invoiceContactRouteId: invoiceRouteId, invoiceDueDate: '2099-12-31'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(issuedLetter.response.status, 202, JSON.stringify(issuedLetter.body));
  assert.equal(issuedLetter.body.result.state, 'ADVANCE_BILLING');
  assert.equal(issuedLetter.body.result.advanceInvoiceStatus, 'PENDING_DOCUMENT');
  assert.equal(issuedLetter.body.result.invoiceDueDate, '2099-12-31');
  const issuedLetterRecord = db.prepare(`SELECT proposal_version_id,commercial_acceptance_id,risk_clearance_id,template_version_id,
      artifact_id,file_version_id,signature_file_version_id,signature_consent_id,seal_file_version_id,seal_approval_id,
      content_sha256,fee_minor,period_start,period_end
    FROM engagement_letters WHERE workspace_id=? AND id=?`).bind(workspaceId, issuedLetter.body.result.letterId).first<any>();
  assert.ok(issuedLetterRecord, 'the issue command creates an immutable issued-letter record');
  assert.equal(issuedLetterRecord.proposal_version_id, renewedGate.body.commercialKey.proposalVersionId);
  assert.equal(issuedLetterRecord.commercial_acceptance_id, renewedGate.body.commercialKey.acceptanceId);
  assert.equal(issuedLetterRecord.risk_clearance_id, renewedGate.body.riskKey.clearanceId);
  assert.equal(issuedLetterRecord.template_version_id, serviceTemplate.body.result.templateVersionId);
  assert.equal(issuedLetterRecord.file_version_id, issuedLetter.body.result.fileId);
  assert.equal(issuedLetterRecord.signature_file_version_id, signatureFileId);
  assert.equal(issuedLetterRecord.seal_file_version_id, sealFileId);
  assert.equal(issuedLetterRecord.fee_minor, 250001);
  assert.equal(issuedLetterRecord.period_start, '2025-01-01');
  assert.equal(issuedLetterRecord.period_end, '2025-12-31');
  assert.match(issuedLetterRecord.content_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual((await readWorkflowStage('ADVANCE_BILLING')).blockers.map((item: any) => item.code), ['ADVANCE_INVOICE_RENDER_PENDING'],
    'issuing the engagement letter atomically queues the exact advance invoice render');
  const issuedDelivery = await call(deliveryPath, { headers: makeRiskHeaders(reviewerHeaders) });
  const invoiceDraft = issuedDelivery.body.invoices.find((invoice: any) => invoice.id === issuedLetter.body.result.advanceInvoiceId);
  assert.equal(invoiceDraft?.status, 'PENDING_DOCUMENT');
  assert.equal(invoiceDraft?.subtotalMinor, '125001', 'the odd-minor-unit advance fee rounds half up');
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const issuedInvoiceView = await call(deliveryPath, { headers: makeRiskHeaders(reviewerHeaders) });
  const issuedInvoice = issuedInvoiceView.body.invoices.find((invoice: any) => invoice.id === issuedLetter.body.result.advanceInvoiceId);
  assert.equal(issuedInvoice?.status, 'ISSUED');
  assert.ok(issuedInvoice?.fileVersionId);
  assert.equal(issuedInvoice?.dueDate, '2099-12-31');
  assert.equal(issuedInvoice?.totalMinor, '125001');
  const invoiceFile = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${issuedInvoice.fileVersionId}`,
    { headers: makeRiskHeaders(reviewerHeaders) }), env, {} as any);
  assert.equal(invoiceFile.status, 200);
  const invoicePdfBytes = new Uint8Array(await invoiceFile.arrayBuffer());
  assert.equal(new TextDecoder().decode(invoicePdfBytes.slice(0, 8)), '%PDF-1.3');
  const invoicePdfContent = decodedPdfContent(invoicePdfBytes);
  for (const expected of [
    'ADVANCE INVOICE',
    issuedInvoice.number,
    clientLegalName,
    'QAR 1,250.01',
    'Local explicit zero-tax policy',
    'QAR 0.00',
    'Total due: QAR 1,250.01',
    'Due date: 2099-12-31'
  ]) {
    assert.ok(invoicePdfContent.includes(expected), `the issued advance-invoice PDF contains ${expected}`);
  }
  assert.deepEqual((await readWorkflowStage('ADVANCE_BILLING')).blockers.map((item: any) => item.code), ['ADVANCE_PAYMENT_UNSETTLED']);

  const wrongPbcRecipient = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'pbc.request.create', payload: {
      clientId, engagementId, title: 'Misrouted trial balance', description: 'This should require a purpose-specific PBC recipient route.',
      dueDate: '2026-10-15', assignedContactId: financeContactId, category: 'TRIAL_BALANCE',
      requiredForPlanning: true, requiredForRelease: true
    } }
  }, makeRiskHeaders(preparerHeaders));
  assert.equal(wrongPbcRecipient.response.status, 409, JSON.stringify(wrongPbcRecipient.body));
  assert.equal(wrongPbcRecipient.body.code, 'GATE_BLOCKED');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM pbc_requests WHERE workspace_id=? AND engagement_id=? AND title='Misrouted trial balance'`)
    .bind(workspaceId, engagementId).first<any>()?.count, 0, 'a request cannot persist when its assignee lacks a valid PBC route');

  const pbcRequestCreated = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'pbc.request.create', payload: {
      clientId, engagementId, title: 'Year-end trial balance', description: 'Provide the complete debit and credit export for the audit period.',
      dueDate: '2026-10-15', assignedContactId: pbcContactId, category: 'TRIAL_BALANCE',
      requiredForPlanning: true, requiredForRelease: true
    } }
  }, makeRiskHeaders(preparerHeaders));
  assert.equal(pbcRequestCreated.response.status, 200, JSON.stringify(pbcRequestCreated.body));
  assert.equal(pbcRequestCreated.body.result.status, 'PENDING_UPLOAD');
  const pbcRequestId = pbcRequestCreated.body.result.requestId as string;
  const clientPbcHeaders = makeRiskHeaders(pbcClientIdentity);
  const pbcEngagementList = await call(`/api/workspaces/${workspaceId}/pbc-engagements`, { headers: clientPbcHeaders });
  assert.equal(pbcEngagementList.response.status, 200, JSON.stringify(pbcEngagementList.body));
  assert.equal(pbcEngagementList.body.engagements.find((item: any) => item.id === engagementId)?.clientId, clientId);
  const pbcPortalPath = `/api/workspaces/${workspaceId}/engagements/${engagementId}/portal`;
  const pbcBeforeHandover = await call(pbcPortalPath, { headers: clientPbcHeaders });
  assert.equal(pbcBeforeHandover.response.status, 200, JSON.stringify(pbcBeforeHandover.body));
  assert.equal(pbcBeforeHandover.body.mode, 'NOT_ACTIVE');
  assert.equal(pbcBeforeHandover.body.canUpload, false);
  assert.equal(pbcBeforeHandover.body.requests[0].status, 'PENDING_UPLOAD');
  for (const forbiddenField of ['risk', 'srm', 'firmLedger', 'staffRates', 'otherClients']) {
    assert.equal(forbiddenField in pbcBeforeHandover.body, false, `client PBC projection excludes ${forbiddenField}`);
  }
  const blockedPbcReservation = await post(`/api/workspaces/${workspaceId}/files`, {
    clientId, engagementId, pbcRequestId, expectedPbcRequestVersion: 1, purpose: 'PBC', originalName: 'year-end-tb.pdf',
    mediaType: 'application/pdf', sizeBytes: pdf.length
  }, { ...clientPbcHeaders, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(blockedPbcReservation.body.code, 'GATE_BLOCKED', JSON.stringify(blockedPbcReservation.body));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM file_versions WHERE workspace_id=? AND pbc_request_id=?')
    .bind(workspaceId, pbcRequestId).first<any>()?.count, 0, 'the unsettled advance blocks PBC reservation before a file row is created');

  const evidenceFileId = await storeCommittedFile('EVIDENCE', 'bank-transfer-evidence.pdf', 'application/pdf', pdf,
    makeRiskHeaders(reviewerHeaders), { clientId, engagementId });
  const partialPayment = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'payment.record', payload: {
      clientId, engagementId, amountMinor: '60000', receivedOn: '2026-10-05', method: 'BANK_TRANSFER', reference: 'BANK-LOCAL-001',
      evidenceFileId, receiptContactRouteId: receiptRouteId, allocations: [{ invoiceId: issuedInvoice.id, amountMinor: '60000' }]
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(partialPayment.response.status, 202, JSON.stringify(partialPayment.body));
  assert.equal(partialPayment.body.result.outstandingMinor, '65001');
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const partialPaymentView = await call(deliveryPath, { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(partialPaymentView.body.engagement.lifecycleState, 'ADVANCE_BILLING');
  assert.equal(partialPaymentView.body.invoices.find((invoice: any) => invoice.id === issuedInvoice.id).outstandingMinor, '65001');
  const partialPaymentRecord = partialPaymentView.body.payments.find((payment: any) => payment.id === partialPayment.body.result.paymentId);
  assert.equal(partialPaymentRecord.receiptStatus, 'ISSUED');
  assert.ok(partialPaymentRecord.receiptFileId, 'payment verification commits an actual receipt PDF');
  const receiptFile = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${partialPaymentRecord.receiptFileId}`,
    { headers: makeRiskHeaders(reviewerHeaders) }), env, {} as any);
  assert.equal(receiptFile.status, 200);
  const receiptPdfBytes = new Uint8Array(await receiptFile.arrayBuffer());
  assert.equal(new TextDecoder().decode(receiptPdfBytes.slice(0, 8)), '%PDF-1.3');
  const receiptPdfContent = decodedPdfContent(receiptPdfBytes);
  for (const expected of [
    'PAYMENT RECEIPT',
    partialPaymentRecord.receiptNumber,
    clientLegalName,
    '2026-10-05',
    'QAR 600.00',
    'BANK-LOCAL-001',
    'Allocated to this invoice: QAR 600.00'
  ]) {
    assert.ok(receiptPdfContent.includes(expected), `the committed receipt PDF contains ${expected}`);
  }
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const receiptDelivery = db.prepare(`SELECT d.status,d.provider_message_id,j.status AS job_status
    FROM dispatches d JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id
    WHERE d.workspace_id=? AND d.purpose='RECEIPT' AND d.file_version_id=?`)
    .bind(workspaceId, partialPaymentRecord.receiptFileId).first<any>();
  assert.deepEqual({ status: receiptDelivery?.status, jobStatus: receiptDelivery?.job_status },
    { status: 'ACCEPTED', jobStatus: 'SUCCEEDED' }, 'the real receipt PDF is sent through the email outbox provider contract');
  assert.ok(receiptDelivery.provider_message_id);
  assert.deepEqual((await readWorkflowStage('ADVANCE_BILLING')).blockers.map((item: any) => item.code), ['ADVANCE_PAYMENT_UNSETTLED'],
    'a partial payment with a committed receipt does not unlock planning');
  const overAllocation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'payment.record', payload: {
      clientId, engagementId, amountMinor: '70000', receivedOn: '2026-10-05', method: 'BANK_TRANSFER', reference: 'BANK-LOCAL-OVER',
      evidenceFileId, receiptContactRouteId: receiptRouteId, allocations: [{ invoiceId: issuedInvoice.id, amountMinor: '70000' }]
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(overAllocation.response.status, 422);
  assert.equal(overAllocation.body.code, 'VALIDATION_FAILED');
  const reversedPayment = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'payment.reverse', payload: {
      paymentId: partialPayment.body.result.paymentId, rationale: 'The recorded test transfer was reversed by the bank.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(reversedPayment.response.status, 202, JSON.stringify(reversedPayment.body));
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const reversedView = await call(deliveryPath, { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(reversedView.body.invoices.find((invoice: any) => invoice.id === issuedInvoice.id).outstandingMinor, '125001');
  assert.equal(reversedView.body.payments.find((payment: any) => payment.id === reversedPayment.body.result.paymentId).reversal, true);
  assert.deepEqual((await readWorkflowStage('ADVANCE_BILLING')).blockers.map((item: any) => item.code), ['ADVANCE_PAYMENT_UNSETTLED'],
    'a payment reversal restores the advance-billing blocker');
  const portalRouteFixture = db.prepare(`SELECT cr.id,cr.version,cr.purpose,cr.is_primary,ct.id AS contact_id,ct.version AS contact_version,
      ct.role,ct.active,ct.email,c.active AS client_active FROM contact_routes cr
    JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
    JOIN clients c ON c.workspace_id=cr.workspace_id AND c.id=cr.client_id
    WHERE cr.workspace_id=? AND cr.client_id=? AND cr.purpose='PBC'`)
    .bind(workspaceId, clientId).all<any>().results;
  assert.equal(portalRouteFixture?.length, 1);
  assert.deepEqual({ purpose: portalRouteFixture?.[0]?.purpose, primary: portalRouteFixture?.[0]?.is_primary,
    role: portalRouteFixture?.[0]?.role, active: portalRouteFixture?.[0]?.active, hasEmail: Boolean(portalRouteFixture?.[0]?.email),
    clientActive: portalRouteFixture?.[0]?.client_active },
  { purpose: 'PBC', primary: 1, role: 'CHIEF_ACCOUNTANT_LIAISON', active: 1, hasEmail: true, clientActive: 1 },
  `the PBC Audit Liaison route is fully eligible for portal provisioning: ${JSON.stringify(portalRouteFixture)}`);
  db.prepare(`UPDATE user_accounts SET password_must_change=1,version=version+1
    WHERE workspace_id=? AND contact_id=? AND kind='CLIENT' AND status='ACTIVE'`)
    .bind(workspaceId, pbcContactId).run();
  const settlement = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'payment.record', payload: {
      clientId, engagementId, amountMinor: '125001', receivedOn: '2026-10-05', method: 'BANK_TRANSFER', reference: 'BANK-LOCAL-SETTLEMENT',
      evidenceFileId, receiptContactRouteId: receiptRouteId, allocations: [{ invoiceId: issuedInvoice.id, amountMinor: '125001' }]
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(settlement.response.status, 202, JSON.stringify(settlement.body));
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  // D3 requires named staff assignments as soon as the commercial billing phase
  // advances into client planning. Keep this end-to-end fixture representative
  // of the authorization state used by its remaining internal reads/commands.
  for (const [actorHeaders, persona, phase] of [
    [preparerHeaders, 'PREPARER', 'PLANNING'], [reviewerHeaders, 'REVIEWER', 'REVIEW']
  ] as const) {
    const staffMemberId = db.prepare(`SELECT staff_member_id FROM actor_profiles WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, actorHeaders['X-Test-Session-Profile']).first<{ staff_member_id: string }>()?.staff_member_id;
    assert.ok(staffMemberId, `${persona} profile has a staff identity for its engagement assignment`);
    db.prepare(`INSERT INTO engagement_assignments(id,workspace_id,version,client_id,engagement_id,staff_member_id,persona,phase,
      start_date,end_date,planned_minutes,created_by_actor_id,created_at)
      VALUES(?,?,1,?,?,?,?,?,'2020-01-01','2020-01-02',240,?,?)`)
      .bind(crypto.randomUUID(), workspaceId, clientId, engagementId, staffMemberId, persona, phase,
        approverHeaders['X-Test-Session-Profile'], new Date().toISOString()).run();
  }
  const settledView = await call(deliveryPath, { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(settledView.body.engagement.lifecycleState, 'PORTAL_ACTIVE_PLANNING', 'planning unlocks only when the full advance and committed final receipt exist');
  assert.equal(settledView.body.invoices.find((invoice: any) => invoice.id === issuedInvoice.id).outstandingMinor, '0');
  assert.deepEqual(deliveredPortalMessages, [], 'credential delivery is queued atomically with the receipt transition and runs in the next outbox pass');
  const credentialJobLogs: string[] = [];
  const mutableConsole = console as unknown as Record<string, (...args: unknown[]) => void>;
  const savedConsoleMethods = new Map<string, (...args: unknown[]) => void>();
  for (const method of ['log', 'info', 'warn', 'error']) {
    savedConsoleMethods.set(method, mutableConsole[method]);
    mutableConsole[method] = (...args) => credentialJobLogs.push(args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' '));
  }
  try {
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  } finally {
    for (const [method, original] of savedConsoleMethods) mutableConsole[method] = original;
  }
  const portalJobStates = db.prepare(`SELECT status,last_error_code FROM outbox_jobs WHERE workspace_id=?
    AND json_extract(payload_json,'$.documentType')='PORTAL_CREDENTIALS' AND json_extract(payload_json,'$.engagementId')=?`)
    .bind(workspaceId, engagementId).all<any>().results;
  assert.equal(deliveredPortalMessages.length, 1, `settling the advance sends one Audit Liaison portal credential email; jobs=${JSON.stringify(portalJobStates)}, logs=${credentialJobLogs.join('|')}`);
  const portalEmail = deliveredPortalMessages[0];
  assert.equal(portalEmail.purpose, 'PORTAL_CREDENTIALS');
  assert.equal(portalEmail.to, 'chief-accountant@example.invalid');
  assert.match(portalEmail.text, /Portal: https:\/\/local\.auditsphere\.test/);
  assert.match(portalEmail.text, /Login email: chief-accountant@example\.invalid/);
  assert.match(portalEmail.text, /Temporary password: [A-Za-z0-9!@#$%]{24}/);
  assert.match(portalEmail.text, /Expires: .* \(seven days after issue\)/);
  assert.match(portalEmail.text, /must change this password at your first sign-in/i);
  assert.equal(portalEmail.text.includes(clientLegalName), false, 'credential email contains no other engagement or client data');
  assert.equal(portalEmail.text.includes('E2026-001'), false, 'credential email does not disclose an engagement code');
  const temporaryPassword = portalEmail.text.match(/Temporary password: ([^\r\n]+)/)?.[1];
  assert.ok(temporaryPassword, 'the delivered message has a temporary password');
  const portalIssue = db.prepare(`SELECT id,trigger,contact_route_id,user_account_id,credential_token_id,outbox_job_id,created_at
    FROM portal_credential_issues WHERE workspace_id=? AND engagement_id=? AND trigger='ADVANCE_PAYMENT'`)
    .bind(workspaceId, engagementId).first<any>();
  assert.ok(portalIssue);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM portal_credential_issues WHERE workspace_id=? AND engagement_id=? AND trigger='ADVANCE_PAYMENT'`)
    .bind(workspaceId, engagementId).first<any>()?.count, 1);
  const portalAccount = db.prepare(`SELECT id,status,password_hash,password_must_change,email_normalized FROM user_accounts
    WHERE workspace_id=? AND contact_id=? AND kind='CLIENT'`).bind(workspaceId, pbcContactId).first<any>();
  assert.deepEqual({ status: portalAccount?.status, passwordMustChange: portalAccount?.password_must_change, email: portalAccount?.email_normalized },
    { status: 'ACTIVE', passwordMustChange: 1, email: 'chief-accountant@example.invalid' });
  assert.equal(await verifyPassword(temporaryPassword, portalAccount.password_hash), true, 'the delivered password matches the stored Argon2id hash');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM user_profile_grants WHERE workspace_id=? AND user_account_id=?
    AND actor_profile_id=? AND revoked_at IS NULL`).bind(workspaceId, portalAccount.id, pbcClientProfile.body.result.actorProfileId)
    .first<any>()?.count, 1, 'the client portal account receives one active grant to its CLIENT actor profile');
  const portalToken = db.prepare(`SELECT purpose,expires_at,created_at FROM credential_tokens WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, portalIssue.credential_token_id).first<any>();
  assert.equal(portalToken.purpose, 'CLIENT_TEMP_PASSWORD');
  assert.equal(Date.parse(portalToken.expires_at) - Date.parse(portalToken.created_at), 7 * 24 * 60 * 60 * 1000);
  const portalPayload = db.prepare('SELECT payload_json FROM outbox_jobs WHERE workspace_id=? AND id=?')
    .bind(workspaceId, portalIssue.outbox_job_id).first<any>()?.payload_json as string;
  const portalAudit = db.prepare(`SELECT COALESCE(group_concat(details_json,''),'') AS details FROM audit_events
    WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId, engagementId).first<any>()?.details as string;
  const portalAuthEvent = db.prepare(`SELECT detail_json FROM auth_events WHERE workspace_id=? AND user_account_id=?
    AND event='TEMP_PASSWORD_ISSUED' ORDER BY created_at DESC,id DESC LIMIT 1`).bind(workspaceId, portalAccount.id).first<any>()?.detail_json as string;
  assert.equal([portalPayload, portalAudit, portalAuthEvent, ...credentialJobLogs].join('\n').includes(temporaryPassword), false,
    'neither durable outbox/audit/auth data nor captured Worker logs contain the plaintext password');
  db.prepare(`UPDATE user_accounts SET password_must_change=0,password_changed_at=?,version=version+1,updated_at=?
    WHERE workspace_id=? AND id=? AND kind='CLIENT' AND status='ACTIVE'`)
    .bind(new Date().toISOString(), new Date().toISOString(), workspaceId, portalAccount.id).run();
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  assert.equal(deliveredPortalMessages.length, 1, 'replaying an idle outbox pass does not send a second automatic credential message');
  const currentPbcContactVersion = db.prepare('SELECT version FROM contacts WHERE workspace_id=? AND id=?')
    .bind(workspaceId, pbcContactId).first<any>()?.version as number;
  const deactivateLiaison = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.update', payload: {
      contactId: pbcContactId, expectedVersion: currentPbcContactVersion, active: false
    } }
  }, makeRiskHeaders(preparerHeaders));
  assert.equal(deactivateLiaison.response.status, 200, JSON.stringify(deactivateLiaison.body));
  const missingRoutePreparation = await preparePortalCredentialProvisioning(env, {
    workspaceId, clientId, engagementId, trigger: 'ADVANCE_PAYMENT', commandId: crypto.randomUUID(),
    createdByActorId: reviewerHeaders['X-Test-Session-Profile'], createdAt: new Date().toISOString()
  });
  assert.equal(missingRoutePreparation.blockedCode, 'PORTAL_LIAISON_ROUTE_MISSING');
  assert.equal(missingRoutePreparation.statements.length, 0, 'a missing active PBC Audit Liaison never queues credentials');
  const missingRouteWorkflow = await readWorkflowStage('PORTAL_ACTIVE_PLANNING');
  assert.ok(missingRouteWorkflow.blockers.some((item: any) => item.code === 'PORTAL_LIAISON_ROUTE_MISSING'),
    'staff workflow names the missing liaison route while keeping the lifecycle active');
  const replacementLiaison = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.create', payload: {
      clientId, contact: { fullName: 'Replacement Audit Liaison', email: 'replacement-liaison@example.invalid',
        title: 'Chief Accountant', role: 'CHIEF_ACCOUNTANT_LIAISON', effectiveFrom: '2026-10-08' }
    } }
  }, makeRiskHeaders(preparerHeaders));
  assert.equal(replacementLiaison.response.status, 200, JSON.stringify(replacementLiaison.body));
  assert.deepEqual(replacementLiaison.body.result.routePurposes, [], 'a replacement contact does not silently take over an existing route');
  const replacementPrimaryRoute = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.route', payload: {
      clientId, contactId: replacementLiaison.body.result.contactId, purpose: 'PBC', isPrimary: true,
      rationale: 'The prior liaison is inactive; assign this active contact as the replacement portal recipient.', expectedVersion: null
    } }
  }, makeRiskHeaders(preparerHeaders));
  assert.equal(replacementPrimaryRoute.response.status, 200, JSON.stringify(replacementPrimaryRoute.body));
  const replacementRouteId = replacementPrimaryRoute.body.result.contactRouteId as string;
  const deniedCredentialReissue = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'portal.credentials.reissue', payload: {
      engagementId, contactRouteId: replacementRouteId, reason: 'A Preparer cannot reissue a client credential.'
    } }
  }, makeRiskHeaders(preparerHeaders));
  assert.equal(deniedCredentialReissue.response.status, 403);
  assert.equal(deniedCredentialReissue.body.code, 'PERSONA_ACTION_DENIED');
  const reissueCommand = () => ({ idempotencyKey: crypto.randomUUID(), command: { type: 'portal.credentials.reissue', payload: {
    engagementId, contactRouteId: replacementRouteId, reason: 'The Reviewer approved a replacement client portal credential.'
  } } });
  const reviewerReissue = await post(`/api/workspaces/${workspaceId}/commands`, reissueCommand(), makeRiskHeaders(reviewerHeaders));
  assert.equal(reviewerReissue.response.status, 200, JSON.stringify(reviewerReissue.body));
  assert.equal(reviewerReissue.body.result.status, 'QUEUED');
  const queuedReissue = db.prepare(`SELECT id,credential_token_id,outbox_job_id FROM portal_credential_issues
    WHERE workspace_id=? AND id=? AND trigger='MANUAL_REISSUE'`).bind(workspaceId, reviewerReissue.body.result.issueId).first<any>();
  assert.ok(queuedReissue);
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  assert.equal(deliveredPortalMessages.length, 2, 'a Reviewer reissue delivers a fresh credential');
  const replacementPassword = deliveredPortalMessages[1].text.match(/Temporary password: ([^\r\n]+)/)?.[1];
  assert.ok(replacementPassword);
  const replacementAccount = db.prepare(`SELECT id,status,password_hash,password_must_change FROM user_accounts
    WHERE workspace_id=? AND contact_id=? AND kind='CLIENT'`).bind(workspaceId, replacementLiaison.body.result.contactId).first<any>();
  assert.equal(replacementAccount.status, 'ACTIVE');
  assert.equal(replacementAccount.password_must_change, 1);
  assert.equal(await verifyPassword(replacementPassword, replacementAccount.password_hash), true);
  const replacementProfile = db.prepare(`SELECT id FROM actor_profiles WHERE workspace_id=? AND contact_id=? AND persona='CLIENT' AND active=1`)
    .bind(workspaceId, replacementLiaison.body.result.contactId).first<any>();
  assert.ok(replacementProfile, 'credential reissue provisions a CLIENT actor profile when the contact has none');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM user_profile_grants WHERE workspace_id=? AND user_account_id=?
    AND actor_profile_id=? AND revoked_at IS NULL`).bind(workspaceId, replacementAccount.id, replacementProfile.id).first<any>()?.count, 1,
    'credential reissue grants the account its new CLIENT actor profile');
  const secondReviewerReissue = await post(`/api/workspaces/${workspaceId}/commands`, reissueCommand(), makeRiskHeaders(reviewerHeaders));
  assert.equal(secondReviewerReissue.response.status, 200, JSON.stringify(secondReviewerReissue.body));
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  assert.equal(deliveredPortalMessages.length, 3);
  const latestReplacementPassword = deliveredPortalMessages[2].text.match(/Temporary password: ([^\r\n]+)/)?.[1];
  assert.ok(latestReplacementPassword);
  const latestReplacementAccount = db.prepare('SELECT password_hash FROM user_accounts WHERE workspace_id=? AND id=?')
    .bind(workspaceId, replacementAccount.id).first<any>();
  assert.equal(await verifyPassword(latestReplacementPassword, latestReplacementAccount.password_hash), true);
  assert.equal(await verifyPassword(replacementPassword, latestReplacementAccount.password_hash), false,
    'a new delivered credential invalidates the prior temporary password');
  const latestQueuedReissue = db.prepare(`SELECT id,credential_token_id,outbox_job_id FROM portal_credential_issues
    WHERE workspace_id=? AND id=? AND trigger='MANUAL_REISSUE'`).bind(workspaceId, secondReviewerReissue.body.result.issueId).first<any>();
  assert.ok(latestQueuedReissue);
  assert.equal(db.prepare(`SELECT id FROM credential_tokens WHERE workspace_id=? AND user_account_id=? AND purpose='CLIENT_TEMP_PASSWORD'
    ORDER BY created_at DESC,id DESC LIMIT 1`).bind(workspaceId, replacementAccount.id).first<any>()?.id, latestQueuedReissue.credential_token_id,
    'the latest issued token controls expiry and invalidates earlier password issuance');
  db.prepare(`UPDATE user_accounts SET password_must_change=0,version=version+1,updated_at=? WHERE workspace_id=? AND id=?`)
    .bind(new Date().toISOString(), workspaceId, replacementAccount.id).run();
  const accessNoticePreparation = await preparePortalCredentialProvisioning(env, {
    workspaceId, clientId, engagementId, contactRouteId: replacementRouteId, trigger: 'ADVANCE_PAYMENT',
    commandId: crypto.randomUUID(), createdByActorId: reviewerHeaders['X-Test-Session-Profile'], createdAt: new Date().toISOString()
  });
  assert.equal(accessNoticePreparation.mode, 'ACCESS_NOTICE', 'an active CLIENT account that has completed its password change receives an access notice');
  assert.equal(accessNoticePreparation.issueId, undefined, 'an access notice does not create a temporary-password issue');
  assert.ok(accessNoticePreparation.jobId);
  db.batch(accessNoticePreparation.statements);
  const accessNoticePayload = db.prepare('SELECT payload_json FROM outbox_jobs WHERE workspace_id=? AND id=?')
    .bind(workspaceId, accessNoticePreparation.jobId).first<any>()?.payload_json as string;
  assert.equal(accessNoticePayload.includes(latestReplacementPassword), false, 'the access-notice job does not contain the existing password');
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  assert.equal(deliveredPortalMessages.length, 4);
  assert.equal(deliveredPortalMessages[3].purpose, 'PORTAL_ACCESS_NOTICE');
  assert.match(deliveredPortalMessages[3].text, /portal is now open for/i);
  assert.equal(/Temporary password:/i.test(deliveredPortalMessages[3].text), false, 'an access notice never includes a new password');
  const accountAfterAccessNotice = db.prepare('SELECT password_hash,password_must_change FROM user_accounts WHERE workspace_id=? AND id=?')
    .bind(workspaceId, replacementAccount.id).first<any>();
  assert.equal(accountAfterAccessNotice.password_must_change, 0);
  assert.equal(await verifyPassword(latestReplacementPassword, accountAfterAccessNotice.password_hash), true,
    'an access notice reuses the active account without changing its password');
  const workingEmailProvider = env.EMAIL_PROVIDER;
  env.EMAIL_PROVIDER = { fetch: async () => Response.json({ error: 'EMAIL_PROVIDER_THROTTLED' }, { status: 429 }) };
  const retryableReissue = await post(`/api/workspaces/${workspaceId}/commands`, reissueCommand(), makeRiskHeaders(reviewerHeaders));
  assert.equal(retryableReissue.response.status, 200, JSON.stringify(retryableReissue.body));
  const retryableIssue = db.prepare('SELECT outbox_job_id FROM portal_credential_issues WHERE workspace_id=? AND id=?')
    .bind(workspaceId, retryableReissue.body.result.issueId).first<any>();
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const retryableJob = db.prepare('SELECT status,attempts FROM outbox_jobs WHERE workspace_id=? AND id=?')
    .bind(workspaceId, retryableIssue.outbox_job_id).first<any>();
  assert.deepEqual({ status: retryableJob.status, attempts: retryableJob.attempts }, { status: 'RETRYABLE_FAILED', attempts: 1 });
  db.prepare('UPDATE outbox_jobs SET attempts=4,next_attempt_at=? WHERE workspace_id=? AND id=?')
    .bind(new Date().toISOString(), workspaceId, retryableIssue.outbox_job_id).run();
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  assert.equal(db.prepare('SELECT status FROM outbox_jobs WHERE workspace_id=? AND id=?')
    .bind(workspaceId, retryableIssue.outbox_job_id).first<any>()?.status, 'PERMANENT_FAILED',
    'the last retry after provider throttling becomes a terminal failure');
  env.EMAIL_PROVIDER = workingEmailProvider;
  const failedEmailWorkflow = await readWorkflowStage('PORTAL_ACTIVE_PLANNING');
  assert.ok(failedEmailWorkflow.blockers.some((item: any) => item.code === 'PORTAL_CREDENTIAL_EMAIL_FAILED'),
    'staff workflow exposes the exhausted credential email failure');
  const replacementRoute = db.prepare(`SELECT id FROM contact_routes WHERE workspace_id=? AND contact_id=? AND purpose='PBC'`)
    .bind(workspaceId, replacementLiaison.body.result.contactId).first<any>();
  db.prepare(`UPDATE contact_routes SET is_primary=0,rationale='Synthetic test fixture cleanup restores its original liaison route.',version=version+1
    WHERE workspace_id=? AND id=? AND is_primary=1`).bind(workspaceId, replacementRoute.id).run();
  db.prepare(`UPDATE contacts SET active=1,version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND active=0`)
    .bind(new Date().toISOString(), workspaceId, pbcContactId).run();
  db.prepare(`UPDATE contact_routes SET is_primary=1,rationale=NULL,version=version+1 WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, portalIssue.contact_route_id).run();
  const planningWorkflow = await readWorkflowStage('PORTAL_ACTIVE_PLANNING');
  assert.equal(planningWorkflow.status, 'blocked');
  assert.ok(planningWorkflow.blockers.some((item: any) => item.code === 'ACTIVE_TB_REQUIRED'),
    'the workflow moves from the settled billing gate to authoritative planning blockers');
  const planDate = '2026-10-06';
  const availability = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.availability.set', payload: {
      staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, scheduledMinutes: 480
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(availability.response.status, 200, JSON.stringify(availability.body));
  const approvedLeave = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.leave.record', payload: {
      staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, minutes: 120,
      reason: 'Approved personal leave is documented against this scheduled working date.'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(approvedLeave.response.status, 200, JSON.stringify(approvedLeave.body));
  assert.equal(approvedLeave.body.result.availableMinutes, 360);
  const assignmentPayload = { engagementId, staffMemberId: preparerStaff.body.result.staffMemberId, persona: 'PREPARER', phase: 'FIELDWORK',
    startDate: planDate, endDate: planDate, plannedMinutes: 420, dailyMinutes: [{ date: planDate, minutes: 420 }] };
  const assignmentsBeforeCapacityAttempt = db.prepare('SELECT COUNT(*) AS count FROM engagement_assignments WHERE workspace_id=? AND engagement_id=?')
    .bind(workspaceId, engagementId).first<any>()?.count;
  const overCapacity = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.assign', payload: assignmentPayload }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(overCapacity.response.status, 409, JSON.stringify(overCapacity.body));
  assert.equal(overCapacity.body.code, 'GATE_BLOCKED');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM engagement_assignments WHERE workspace_id=? AND engagement_id=?')
    .bind(workspaceId, engagementId).first<any>()?.count, assignmentsBeforeCapacityAttempt, 'over-capacity assignment does not persist a partial row');
  const capacityException = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.capacityException.approve', payload: {
      staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, excessMinutes: 60,
      reason: 'Partner approves the documented sixty-minute peak workload exception for this day.'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(capacityException.response.status, 200, JSON.stringify(capacityException.body));
  const assignedPreparer = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.assign', payload: assignmentPayload }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(assignedPreparer.response.status, 200, JSON.stringify(assignedPreparer.body));
  assert.equal(assignedPreparer.body.result.capacityWarnings.length, 1);
  const capacityView = await call(`/api/workspaces/${workspaceId}/capacity?from=${planDate}&to=${planDate}`, { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(capacityView.response.status, 200, JSON.stringify(capacityView.body));
  assert.deepEqual({ scheduled: capacityView.body.staffDays[0].scheduledMinutes, leave: capacityView.body.staffDays[0].approvedLeaveMinutes,
    available: capacityView.body.staffDays[0].availableMinutes, assigned: capacityView.body.staffDays[0].assignedMinutes,
    exception: capacityView.body.staffDays[0].approvedExceptionMinutes, status: capacityView.body.staffDays[0].capacityStatus },
    { scheduled: 480, leave: 120, available: 360, assigned: 420, exception: 60, status: 'EXCEPTION_APPROVED' });
  const cutoffByReviewer = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'milestone.set', payload: {
      engagementId, code: 'STATUTORY_CUTOFF', targetDate: '2027-03-15', sourceReference: 'Firm-supplied statutory timetable for QA.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(cutoffByReviewer.response.status, 403);
  const cutoff = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'milestone.set', payload: {
      engagementId, code: 'STATUTORY_CUTOFF', targetDate: '2027-03-15', sourceReference: 'Firm-supplied statutory timetable for QA.'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(cutoff.response.status, 200, JSON.stringify(cutoff.body));
  const lateFinalTarget = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'milestone.set', payload: {
      engagementId, code: 'FINAL_REPORT', targetDate: '2027-03-16', sourceReference: 'Firm-approved engagement timetable.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(lateFinalTarget.response.status, 422);
  assert.equal(lateFinalTarget.body.code, 'VALIDATION_FAILED');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM milestones WHERE workspace_id=? AND engagement_id=? AND code='FINAL_REPORT'`)
    .bind(workspaceId, engagementId).first<any>()?.count, 0, 'late report milestone fails without leaving a partial row');
  const finalTarget = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'milestone.set', payload: {
      engagementId, code: 'FINAL_REPORT', targetDate: '2027-03-10', sourceReference: 'Firm-approved engagement timetable.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(finalTarget.response.status, 200, JSON.stringify(finalTarget.body));
  const suggestedSchedule = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'milestone.applyDefaults', payload: {
      engagementId, periodEnd: '2025-12-31', overwrite: false,
      suggestedDates: { FIELDWORK_START: '2026-01-04', DRAFT_REPORT: '2026-02-15', FINAL_REPORT: '2026-03-15' }
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(suggestedSchedule.response.status, 200, JSON.stringify(suggestedSchedule.body));
  assert.deepEqual(suggestedSchedule.body.result.applied.map((item: any) => [item.code, item.targetDate]), [
    ['FIELDWORK_START', '2026-01-04'], ['DRAFT_REPORT', '2026-02-15']
  ]);
  assert.deepEqual(suggestedSchedule.body.result.preserved, ['FINAL_REPORT'], 'the default schedule leaves an existing date unchanged');
  assert.equal(db.prepare(`SELECT source_reference FROM milestones WHERE workspace_id=? AND engagement_id=? AND code='DRAFT_REPORT'`)
    .bind(workspaceId, engagementId).first<any>()?.source_reference,
    'Suggested from period end 2025-12-31 (default rule v1)');
  const mismatchedPeriod = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'milestone.applyDefaults', payload: {
      engagementId, periodEnd: '2026-01-01', overwrite: false
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(mismatchedPeriod.response.status, 422);
  assert.equal(mismatchedPeriod.body.code, 'VALIDATION_FAILED');
  const activePbcPortal = await call(pbcPortalPath, { headers: clientPbcHeaders });
  assert.equal(activePbcPortal.body.mode, 'ACTIVE');
  assert.equal(activePbcPortal.body.canUpload, true);
  const finalArchiveFolderId = foldersAfterClearance.body.folders.find((folder: any) => folder.code === 'FINAL_SIGNED_ARCHIVE').id;
  const clientArchiveUpload = await post(`/api/workspaces/${workspaceId}/files`, {
    clientId, engagementId, pbcRequestId, expectedPbcRequestVersion: 1, folderId: finalArchiveFolderId, purpose: 'PBC',
    originalName: 'direct-archive-attempt.pdf', mediaType: 'application/pdf', sizeBytes: pdf.length
  }, { ...clientPbcHeaders, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(clientArchiveUpload.response.status, 403, JSON.stringify(clientArchiveUpload.body));
  assert.equal(clientArchiveUpload.body.code, 'PERSONA_ACTION_DENIED');

  const uploadPbcResponse = async (originalName: string, bytes: Uint8Array, requestVersion: number) => {
    const reservation = await post(`/api/workspaces/${workspaceId}/files`, {
      clientId, engagementId, pbcRequestId, expectedPbcRequestVersion: requestVersion, purpose: 'PBC', originalName,
      mediaType: 'application/pdf', sizeBytes: bytes.length
    }, { ...clientPbcHeaders, 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(reservation.response.status, 201, JSON.stringify(reservation.body));
    const fileId = reservation.body.fileId as string;
    const staged = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${fileId}/content`, {
      method: 'PUT', headers: { Origin: 'https://local.auditsphere.test', ...clientPbcHeaders,
        'Idempotency-Key': crypto.randomUUID(), 'X-File-Version': '1', 'Content-Type': 'application/pdf' }, body: bytes
    }), env, {} as any);
    const stagedBody = await staged.json() as any;
    assert.equal(staged.status, 200, JSON.stringify(stagedBody));
    const committed = await post(`/api/workspaces/${workspaceId}/files/${fileId}/complete`, {
      expectedVersion: 2, sizeBytes: stagedBody.sizeBytes, sha256: stagedBody.sha256
    }, { ...clientPbcHeaders, 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(committed.response.status, 200, JSON.stringify(committed.body));
    return { fileId, sha256: stagedBody.sha256 as string };
  };
  const staleReservation = await post(`/api/workspaces/${workspaceId}/files`, {
    clientId, engagementId, pbcRequestId, expectedPbcRequestVersion: 1, purpose: 'PBC', originalName: 'frozen-portal-pbc.pdf',
    mediaType: 'application/pdf', sizeBytes: pdf.length
  }, { ...clientPbcHeaders, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(staleReservation.response.status, 201, JSON.stringify(staleReservation.body));
  const staleFileId = staleReservation.body.fileId as string;
  const lateContentReservation = await post(`/api/workspaces/${workspaceId}/files`, {
    clientId, engagementId, pbcRequestId, expectedPbcRequestVersion: 1, purpose: 'PBC', originalName: 'frozen-content-upload.pdf',
    mediaType: 'application/pdf', sizeBytes: pdf.length
  }, { ...clientPbcHeaders, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(lateContentReservation.response.status, 201, JSON.stringify(lateContentReservation.body));
  const lateContentFileId = lateContentReservation.body.fileId as string;
  const staleStage = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${staleFileId}/content`, {
    method: 'PUT', headers: { Origin: 'https://local.auditsphere.test', ...clientPbcHeaders,
      'Idempotency-Key': crypto.randomUUID(), 'X-File-Version': '1', 'Content-Type': 'application/pdf' }, body: pdf
  }), env, {} as any);
  assert.equal(staleStage.status, 200, await staleStage.clone().text());
  const staleStageBody = await staleStage.clone().json() as { sha256: string };
  const frozenAt = '2026-10-07T12:00:00.000Z';
  const originalBatch = db.batch.bind(db);
  let freezeDuringCommit = true;
  (db as any).batch = (statements: unknown[]) => {
    if (freezeDuringCommit) {
      freezeDuringCommit = false;
      db.prepare('UPDATE engagements SET portal_frozen_at=? WHERE workspace_id=? AND id=?').bind(frozenAt, workspaceId, engagementId).run();
    }
    return originalBatch(statements as any);
  };
  let pbcFrozenStaleCommit: Awaited<ReturnType<typeof post>>;
  try {
    pbcFrozenStaleCommit = await post(`/api/workspaces/${workspaceId}/files/${staleFileId}/complete`, {
      expectedVersion: 2, sizeBytes: pdf.length, sha256: staleStageBody.sha256
    }, { ...clientPbcHeaders, 'Idempotency-Key': crypto.randomUUID() });
  } finally { (db as any).batch = originalBatch; }
  assert.equal(pbcFrozenStaleCommit.response.status, 423, JSON.stringify(pbcFrozenStaleCommit.body));
  assert.equal(pbcFrozenStaleCommit.body.code, 'PORTAL_FROZEN');
  assert.deepEqual(pbcFrozenStaleCommit.body.details, { engagementId, frozenAt, bundleId: null });
  assert.equal(db.prepare('SELECT state FROM file_versions WHERE workspace_id=? AND id=?').bind(workspaceId, staleFileId).first<any>()?.state, 'STAGED',
    'a reservation staged before release cannot be committed after portal freeze');
  const lateContent = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${lateContentFileId}/content`, {
    method: 'PUT', headers: { Origin: 'https://local.auditsphere.test', ...clientPbcHeaders,
      'Idempotency-Key': crypto.randomUUID(), 'X-File-Version': '1', 'Content-Type': 'application/pdf' }, body: pdf
  }), env, {} as any);
  const lateContentBody = await lateContent.json() as { code?: string; details?: unknown };
  assert.equal(lateContent.status, 423, JSON.stringify(lateContentBody));
  assert.equal(lateContentBody.code, 'PORTAL_FROZEN', 'an initialized reservation cannot accept bytes after portal freeze');
  assert.deepEqual(lateContentBody.details, { engagementId, frozenAt, bundleId: null });
  assert.equal(db.prepare('SELECT state FROM file_versions WHERE workspace_id=? AND id=?').bind(workspaceId, lateContentFileId).first<any>()?.state, 'INITIALIZED',
    'a post-release content attempt leaves its reservation unmodified');
  const frozenReservation = await post(`/api/workspaces/${workspaceId}/files`, {
    clientId, engagementId, pbcRequestId, expectedPbcRequestVersion: 1, purpose: 'PBC', originalName: 'reserved-after-release.pdf',
    mediaType: 'application/pdf', sizeBytes: pdf.length
  }, { ...clientPbcHeaders, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(frozenReservation.response.status, 423, JSON.stringify(frozenReservation.body));
  assert.equal(frozenReservation.body.code, 'PORTAL_FROZEN', 'the API rejects new client reservations after portal freeze');
  assert.deepEqual(frozenReservation.body.details, { engagementId, frozenAt, bundleId: null });
  db.prepare('UPDATE engagements SET portal_frozen_at=NULL WHERE workspace_id=? AND id=?').bind(workspaceId, engagementId).run();
  const firstPbcFile = await uploadPbcResponse('year-end-tb.pdf', pdf, 1);
  db.prepare('UPDATE engagements SET portal_frozen_at=? WHERE workspace_id=? AND id=?').bind(frozenAt, workspaceId, engagementId).run();
  const pbcFrozenSubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'pbc.submit', payload: {
      requestId: pbcRequestId, expectedRequestVersion: 1, fileVersionId: firstPbcFile.fileId
    } }
  }, clientPbcHeaders);
  assert.equal(pbcFrozenSubmission.response.status, 423, JSON.stringify(pbcFrozenSubmission.body));
  assert.equal(pbcFrozenSubmission.body.code, 'PORTAL_FROZEN');
  assert.deepEqual(pbcFrozenSubmission.body.details, { engagementId, frozenAt, bundleId: null });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM pbc_submissions WHERE workspace_id=? AND request_id=?')
    .bind(workspaceId, pbcRequestId).first<any>()?.count, 0, 'frozen client PBC submissions leave no review record');
  db.prepare('UPDATE engagements SET portal_frozen_at=NULL WHERE workspace_id=? AND id=?').bind(workspaceId, engagementId).run();
  const wrongPbcFile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'pbc.submit', payload: {
      requestId: pbcRequestId, expectedRequestVersion: 1, fileVersionId: evidenceFileId
    } }
  }, clientPbcHeaders);
  assert.equal(wrongPbcFile.response.status, 409);
  assert.equal(wrongPbcFile.body.code, 'GATE_BLOCKED');
  const firstPbcSubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'pbc.submit', payload: {
      requestId: pbcRequestId, expectedRequestVersion: 1, fileVersionId: firstPbcFile.fileId, clientComment: 'Year-end export attached.'
    } }
  }, clientPbcHeaders);
  assert.equal(firstPbcSubmission.response.status, 200, JSON.stringify(firstPbcSubmission.body));
  assert.equal(firstPbcSubmission.body.result.status, 'UNDER_REVIEW');
  const firstSubmissionId = firstPbcSubmission.body.result.submissionId as string;
  const clientUnderReview = await call(pbcPortalPath, { headers: clientPbcHeaders });
  assert.equal(clientUnderReview.body.requests[0].status, 'UNDER_REVIEW');
  assert.equal(clientUnderReview.body.requests[0].submissions[0].sha256, firstPbcFile.sha256);
  const directPbcRequest = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/pbc/${pbcRequestId}`, { headers: clientPbcHeaders });
  assert.equal(directPbcRequest.response.status, 200, JSON.stringify(directPbcRequest.body));
  assert.equal(directPbcRequest.body.request.currentSubmissionId, firstSubmissionId);
  const originalPbcDownload = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${firstPbcFile.fileId}`,
    { headers: { Origin: 'https://local.auditsphere.test', ...clientPbcHeaders } }), env, {} as any);
  assert.equal(originalPbcDownload.status, 200);
  assert.deepEqual(new Uint8Array(await originalPbcDownload.arrayBuffer()), pdf,
    'CLIENT can download the exact committed bytes submitted for review');

  const reviewerPbcHeaders = makeRiskHeaders(reviewerHeaders);
  const whitespaceRejection = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'pbc.review', payload: {
      requestId: pbcRequestId, expectedRequestVersion: 2, submissionId: firstSubmissionId, decision: 'REJECT', comments: '        '
    } }
  }, reviewerPbcHeaders);
  assert.equal(whitespaceRejection.response.status, 422);
  assert.equal(whitespaceRejection.body.code, 'VALIDATION_FAILED');
  const stillUnderReview = await call(pbcPortalPath, { headers: reviewerPbcHeaders });
  assert.equal(stillUnderReview.body.requests[0].status, 'UNDER_REVIEW');
  const rejection = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'pbc.review', payload: {
      requestId: pbcRequestId, expectedRequestVersion: 2, submissionId: firstSubmissionId, decision: 'REJECT',
      comments: 'The trial balance is missing the final credit total.'
    } }
  }, reviewerPbcHeaders);
  assert.equal(rejection.response.status, 200, JSON.stringify(rejection.body));
  assert.equal(rejection.body.result.status, 'REJECTED_REUPLOAD_REQUIRED');
  const rejectedForClient = await call(pbcPortalPath, { headers: clientPbcHeaders });
  assert.equal(rejectedForClient.body.requests[0].status, 'REJECTED_REUPLOAD_REQUIRED');
  assert.equal(rejectedForClient.body.requests[0].submissions[0].reviews[0].comments, 'The trial balance is missing the final credit total.');

  const replacementBytes = pdf.slice();
  replacementBytes[5] = '2'.charCodeAt(0);
  const replacementPbcFile = await uploadPbcResponse('year-end-tb-corrected.pdf', replacementBytes, 3);
  assert.equal(db.prepare('SELECT previous_version_id FROM file_versions WHERE workspace_id=? AND id=?')
    .bind(workspaceId, replacementPbcFile.fileId).first<any>()?.previous_version_id, firstPbcFile.fileId,
    'a corrected upload is linked to the rejected file version');
  const replacementSubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'pbc.submit', payload: {
      requestId: pbcRequestId, expectedRequestVersion: 3, fileVersionId: replacementPbcFile.fileId
    } }
  }, clientPbcHeaders);
  assert.equal(replacementSubmission.response.status, 200, JSON.stringify(replacementSubmission.body));
  assert.equal(replacementSubmission.body.result.sequence, 2);
  const secondSubmissionId = replacementSubmission.body.result.submissionId as string;
  const historyAfterReplacement = await call(pbcPortalPath, { headers: clientPbcHeaders });
  assert.equal(historyAfterReplacement.body.requests[0].submissions.length, 2);
  assert.equal(historyAfterReplacement.body.requests[0].submissions[1].supersedesSubmissionId, firstSubmissionId);
  assert.equal(historyAfterReplacement.body.requests[0].submissions[0].reviews[0].decision, 'REJECT');
  const retainedRejectedDownload = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${firstPbcFile.fileId}`,
    { headers: { Origin: 'https://local.auditsphere.test', ...clientPbcHeaders } }), env, {} as any);
  const correctedPbcDownload = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${replacementPbcFile.fileId}`,
    { headers: { Origin: 'https://local.auditsphere.test', ...clientPbcHeaders } }), env, {} as any);
  assert.equal(retainedRejectedDownload.status, 200);
  assert.equal(correctedPbcDownload.status, 200);
  assert.deepEqual(new Uint8Array(await retainedRejectedDownload.arrayBuffer()), pdf,
    'the rejected source remains downloadable after replacement');
  assert.deepEqual(new Uint8Array(await correctedPbcDownload.arrayBuffer()), replacementBytes,
    'the replacement exposes its exact submitted bytes');

  const obsoleteApproval = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'pbc.review', payload: {
      requestId: pbcRequestId, expectedRequestVersion: 4, submissionId: firstSubmissionId, decision: 'APPROVE'
    } }
  }, reviewerPbcHeaders);
  assert.equal(obsoleteApproval.response.status, 409);
  assert.equal(obsoleteApproval.body.code, 'VERSION_CONFLICT');
  const pbcApproval = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'pbc.review', payload: {
      requestId: pbcRequestId, expectedRequestVersion: 4, submissionId: secondSubmissionId, decision: 'APPROVE'
    } }
  }, reviewerPbcHeaders);
  assert.equal(pbcApproval.response.status, 200, JSON.stringify(pbcApproval.body));
  assert.equal(pbcApproval.body.result.status, 'APPROVED');
  const approvedForClient = await call(pbcPortalPath, { headers: clientPbcHeaders });
  assert.equal(approvedForClient.body.requests[0].status, 'APPROVED');
  assert.equal(approvedForClient.body.requests[0].submissions.length, 2, 'approval preserves both exact submitted files');
  assert.equal(approvedForClient.body.requests[0].submissions[1].reviews[0].fileSha256, replacementPbcFile.sha256);

  const tbFolderId = foldersAfterClearance.body.folders.find((folder: any) => folder.code === 'TB_SCHEDULES').id as string;
  const tbCsv = new TextEncoder().encode([
    'Account Code,Account Name,Current Balance,Prior Balance',
    '1000,Cash,22861400.01,0.00',
    '1100,Trade receivables,63000.00,0.00',
    '1500,Equipment,37800.00,0.00',
    '1200,Other current assets,37799.99,0.00',
    '5000,Administrative expense,3000000.00,0.00',
    '2000,Trade payables,-3000000.00,0.00',
    '2500,Borrowings,-7000000.00,0.00',
    '3000,Equity,-10000000.00,-500.00',
    '4000,Revenue,-6000000.00,0.00',
    '1299,Prior-period-only receivable,0.00,500.00'
  ].join('\n'));
  const unbalancedTbCsv = new TextEncoder().encode(new TextDecoder().decode(tbCsv).replace('Cash,22861400.01', 'Cash,22861400.02'));
  const unbalancedTbFileId = await storeCommittedFile('TB', 'unbalanced-trial-balance.csv', 'text/csv', unbalancedTbCsv,
    makeRiskHeaders(reviewerHeaders), { clientId, engagementId, folderId: tbFolderId });
  const unbalancedPreview = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/trial-balance-preview?fileId=${unbalancedTbFileId}`,
    { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(unbalancedPreview.response.status, 200, JSON.stringify(unbalancedPreview.body));
  const unbalancedImportStarted = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.import', payload: {
      engagementId, fileVersionId: unbalancedTbFileId, worksheet: unbalancedPreview.body.selectedWorksheet,
      columnMap: { headerRow: 1, accountCodeColumn: 0, accountNameColumn: 1, balanceColumn: 2, priorBalanceColumn: 3 }
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(unbalancedImportStarted.response.status, 200, JSON.stringify(unbalancedImportStarted.body));
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const unbalancedImport = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/tb-imports/${unbalancedImportStarted.body.result.importId}`,
    { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(unbalancedImport.body.status, 'INVALID');
  assert.ok(unbalancedImport.body.errors.some((item: any) => item.code === 'UNBALANCED_TB'), 'one minor-unit imbalance is rejected');
  const rejectedUnbalancedActivation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.activate', payload: { engagementId,
      importId: unbalancedImportStarted.body.result.importId, contentSha256: unbalancedImport.body.sourceSha256 } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(rejectedUnbalancedActivation.response.status, 409);
  assert.equal(rejectedUnbalancedActivation.body.code, 'GATE_BLOCKED');
  assert.equal(db.prepare(`SELECT active_tb_version_id FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId, engagementId).first<any>()?.active_tb_version_id, null,
    'an invalid replacement cannot change the active TB source');
  const tbFileId = await storeCommittedFile('TB', 'accepted-trial-balance.csv', 'text/csv', tbCsv, makeRiskHeaders(reviewerHeaders),
    { clientId, engagementId, folderId: tbFolderId });
  const tbPreview = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/trial-balance-preview?fileId=${tbFileId}`,
    { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(tbPreview.response.status, 200, JSON.stringify(tbPreview.body));
  assert.equal(tbPreview.body.preview[0][0], 'Account Code');
  const tbImportStarted = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.import', payload: {
      engagementId, fileVersionId: tbFileId, worksheet: tbPreview.body.selectedWorksheet,
      columnMap: { headerRow: 1, accountCodeColumn: 0, accountNameColumn: 1, balanceColumn: 2, priorBalanceColumn: 3 }
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(tbImportStarted.response.status, 200, JSON.stringify(tbImportStarted.body));
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const tbImportReady = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/tb-imports/${tbImportStarted.body.result.importId}`,
    { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(tbImportReady.response.status, 200, JSON.stringify(tbImportReady.body));
  assert.equal(tbImportReady.body.status, 'READY');
  assert.equal(tbImportReady.body.rowCount, 10);
  assert.equal(tbImportReady.body.currentDebitsMinor, 2600000000);
  assert.equal(tbImportReady.body.currentCreditsMinor, 2600000000);
  assert.equal(tbImportReady.body.priorDebitsMinor, 50000);
  assert.equal(tbImportReady.body.priorCreditsMinor, 50000);
  const tbActivated = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.activate', payload: {
      engagementId, importId: tbImportStarted.body.result.importId, contentSha256: tbImportReady.body.sourceSha256
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(tbActivated.response.status, 200, JSON.stringify(tbActivated.body));
  assert.equal(tbActivated.body.result.rowCount, 10);
  assert.equal(tbActivated.body.result.priorPresent, true);

  // US-FLD-001 — an import interrupted after four committed staging chunks can
  // be retried idempotently without exposing partial rows or replacing the
  // currently active trial balance.
  const largeTbRows = ['Account Code,Account Name,Current Balance'];
  for (let index = 0; index < 160; index += 1) {
    largeTbRows.push(`D${String(index).padStart(3, '0')},Debit account ${index},100.00`);
    largeTbRows.push(`C${String(index).padStart(3, '0')},Credit account ${index},-100.00`);
  }
  const largeTbBytes = new TextEncoder().encode(largeTbRows.join('\n'));
  const activeTbBeforeInterruptedImport = db.prepare(`SELECT active_tb_version_id FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, engagementId).first<any>()?.active_tb_version_id;
  const largeTbFileId = await storeCommittedFile('TB', 'large-retry-trial-balance.csv', 'text/csv', largeTbBytes,
    makeRiskHeaders(reviewerHeaders), { clientId, engagementId, folderId: tbFolderId });
  const largeTbStarted = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.import', payload: {
      engagementId, fileVersionId: largeTbFileId,
      columnMap: { headerRow: 1, accountCodeColumn: 0, accountNameColumn: 1, balanceColumn: 2 }
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(largeTbStarted.response.status, 200, JSON.stringify(largeTbStarted.body));
  const largeImportId = largeTbStarted.body.result.importId as string;
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM outbox_jobs WHERE workspace_id=? AND kind='IMPORT_TB'
      AND status IN ('PENDING','RETRYABLE_FAILED') AND next_attempt_at<=?`)
    .bind(workspaceId, new Date().toISOString()).first<any>()?.count, 1, 'the interruption test has one due TB job');
  const interruptedImportOriginalBatch = db.batch.bind(db);
  let stagingBatches = 0;
  db.batch = ((statements: unknown[]) => {
    stagingBatches += 1;
    if (stagingBatches === 5) throw new Error('Simulated transient interruption after four staging chunks.');
    return interruptedImportOriginalBatch(statements as any);
  }) as any;
  try {
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  } finally {
    db.batch = interruptedImportOriginalBatch as any;
  }
  assert.equal(stagingBatches, 6, 'the fifth chunk fails after four D1 batch commits, then the Worker records a retry');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tb_staging_lines WHERE workspace_id=? AND import_id=?')
    .bind(workspaceId, largeImportId).first<any>()?.count, 160, 'only the first four of eight 40-row chunks are staged');
  assert.equal(db.prepare(`SELECT status FROM tb_imports WHERE workspace_id=? AND id=?`).bind(workspaceId, largeImportId).first<any>()?.status, 'VALIDATING');
  assert.equal(db.prepare(`SELECT active_tb_version_id FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, engagementId).first<any>()?.active_tb_version_id, activeTbBeforeInterruptedImport,
    'a partial import leaves the existing accepted TB active');
  const failedLargeImportJob = db.prepare(`SELECT id FROM outbox_jobs WHERE workspace_id=? AND kind='IMPORT_TB' AND aggregate_id=?`)
    .bind(workspaceId, largeImportId).first<any>();
  assert.ok(failedLargeImportJob?.id);
  db.prepare(`UPDATE outbox_jobs SET next_attempt_at=? WHERE workspace_id=? AND id=? AND status='RETRYABLE_FAILED'`)
    .bind(new Date(Date.now() - 1000).toISOString(), workspaceId, failedLargeImportJob.id).run();
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const retriedLargeImport = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/tb-imports/${largeImportId}`,
    { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(retriedLargeImport.response.status, 200, JSON.stringify(retriedLargeImport.body));
  assert.equal(retriedLargeImport.body.status, 'READY');
  assert.equal(retriedLargeImport.body.rowCount, 320);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tb_staging_lines WHERE workspace_id=? AND import_id=?')
    .bind(workspaceId, largeImportId).first<any>()?.count, 320, 'retry resumes the missing rows without duplicates');
  assert.equal(db.prepare(`SELECT active_tb_version_id FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, engagementId).first<any>()?.active_tb_version_id, activeTbBeforeInterruptedImport,
    'retry validation does not replace the active TB before explicit activation');

  const tbWorkspacePath = `/api/workspaces/${workspaceId}/engagements/${engagementId}/trial-balance-workspace`;
  const tbWorkspace = await call(tbWorkspacePath, { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(tbWorkspace.response.status, 200, JSON.stringify(tbWorkspace.body));
  const mappingProposed = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.mapping.propose', payload: {
      engagementId, tbVersionId: tbActivated.body.result.tbVersionId
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(mappingProposed.response.status, 200, JSON.stringify(mappingProposed.body));
  const mappingDraft = (await call(tbWorkspacePath, { headers: makeRiskHeaders(reviewerHeaders) })).body.mappingDraft;
  const accountFsli = new Map<string, string>([
    ['1000','CASH'],['1100','RECEIVABLES'],['1500','PROPERTY_EQUIPMENT'],['1200','OTHER_CURRENT_ASSETS'],
    ['5000','ADMIN_EXPENSE'],['2000','PAYABLES'],['2500','BORROWINGS'],['3000','EQUITY'],['4000','REVENUE'],['1299','OTHER_CURRENT_ASSETS']
  ]);
  let priorOnlyDraftRow: any = null;
  for (const row of mappingDraft.lines) {
    if (row.accountCode === '1299') {
      priorOnlyDraftRow = row;
      assert.equal(row.balanceMinor, '0');
      assert.equal(row.priorBalanceMinor, '50000');
      continue;
    }
    const definition = tbWorkspace.body.fsliCatalog.find((item: any) => item.code === accountFsli.get(row.accountCode));
    assert.ok(definition, `FSLI definition exists for ${row.accountCode}`);
    const mapped = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'tb.mapping.set', payload: {
        draftId: mappingDraft.id, tbLineId: row.tbLineId, expectedVersion: row.version, fsliId: definition.id
      } }
    }, makeRiskHeaders(reviewerHeaders));
    assert.equal(mapped.response.status, 200, JSON.stringify(mapped.body));
  }
  assert.ok(priorOnlyDraftRow, 'the imported comparative balance remains individually mappable');
  const unmappedPriorApproval = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.mapping.approve', payload: {
      engagementId, draftId: mappingDraft.id, draftHash: (await call(tbWorkspacePath, { headers: makeRiskHeaders(reviewerHeaders) })).body.mappingDraft.draftHash
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(unmappedPriorApproval.response.status, 409);
  assert.equal(unmappedPriorApproval.body.code, 'GATE_BLOCKED');
  assert.deepEqual(unmappedPriorApproval.body.details.blockers.map((blocker: any) => ({ accountCode: blocker.accountCode,
    currentMinor: blocker.currentMinor, priorMinor: blocker.priorMinor })), [{ accountCode: '1299', currentMinor: '0', priorMinor: '50000' }],
  'mapping approval identifies a nonzero prior-only row even though its current balance is zero');
  assert.equal(db.prepare(`SELECT active_mapping_version_id FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId, engagementId).first<any>()?.active_mapping_version_id, null,
    'a prior-only unmapped balance cannot partially activate a mapping version');
  const priorOnlyDefinition = tbWorkspace.body.fsliCatalog.find((item: any) => item.code === accountFsli.get('1299'));
  const mappedPriorOnly = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.mapping.set', payload: {
      draftId: mappingDraft.id, tbLineId: priorOnlyDraftRow.tbLineId, expectedVersion: priorOnlyDraftRow.version, fsliId: priorOnlyDefinition.id
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(mappedPriorOnly.response.status, 200, JSON.stringify(mappedPriorOnly.body));
  const readyMappingDraft = (await call(tbWorkspacePath, { headers: makeRiskHeaders(reviewerHeaders) })).body.mappingDraft;
  const mappingApproved = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.mapping.approve', payload: {
      engagementId, draftId: readyMappingDraft.id, draftHash: readyMappingDraft.draftHash
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(mappingApproved.response.status, 200, JSON.stringify(mappingApproved.body));
  assert.equal(mappingApproved.body.result.mappedCount, 10);
  const approvedHistorySource = db.prepare(`SELECT mm.account_code,mm.reporting_framework,mm.source_mapping_version_id,mm.fsli_id
    FROM mapping_memory mm WHERE mm.workspace_id=? AND mm.client_id=? AND mm.source_mapping_version_id=?
    ORDER BY mm.account_code LIMIT 1`).bind(workspaceId,clientId,mappingApproved.body.result.mappingVersionId).first<any>();
  assert.ok(approvedHistorySource, 'the approved client mapping writes a history source');
  assert.throws(() => db.prepare(`INSERT INTO mapping_memory(id,workspace_id,client_id,account_code,reporting_framework,
      source_mapping_version_id,fsli_id,effective_period_end) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,childClientId,approvedHistorySource.account_code,approvedHistorySource.reporting_framework,
      approvedHistorySource.source_mapping_version_id,approvedHistorySource.fsli_id,'2026-12-31').run(),
  /historical mapping source scope mismatch/,
  'a subsidiary cannot inherit a parent entity history row whose source mapping belongs to the parent');
  assert.throws(() => db.prepare(`INSERT INTO mapping_memory(id,workspace_id,client_id,account_code,reporting_framework,
      source_mapping_version_id,fsli_id,effective_period_end) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,clientId,approvedHistorySource.account_code,'OTHER-FRAMEWORK',
      approvedHistorySource.source_mapping_version_id,approvedHistorySource.fsli_id,'2026-12-31').run(),
  /historical mapping source scope mismatch/,
  'historical suggestions cannot be relabeled as belonging to a different reporting framework');
  assert.throws(() => db.prepare(`INSERT INTO mapping_memory(id,workspace_id,client_id,account_code,reporting_framework,
      source_mapping_version_id,fsli_id,effective_period_end) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,clientId,approvedHistorySource.account_code,approvedHistorySource.reporting_framework,
      approvedHistorySource.source_mapping_version_id,approvedHistorySource.fsli_id,'2099-12-31').run(),
  /historical mapping source scope mismatch/,
  'historical mappings cannot claim an effective period different from the approved source engagement');
  const samePeriodMappingProposal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.mapping.propose', payload: {
      engagementId, tbVersionId: tbActivated.body.result.tbVersionId
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(samePeriodMappingProposal.response.status, 200, JSON.stringify(samePeriodMappingProposal.body));
  assert.equal(samePeriodMappingProposal.body.result.suggestedCount, 0,
    'a mapping from the same period is not misrepresented as a previous-period historical suggestion');
  const historicalDraft = (await call(tbWorkspacePath, { headers: makeRiskHeaders(reviewerHeaders) })).body.mappingDraft;
  assert.ok(historicalDraft.lines.every((row: any) => row.origin !== 'EXACT_HISTORY'
    && row.sourceHistoricalMappingId === null && row.confirmed === false),
  'same-period approved mappings are not offered as prior-period history');
  const historyClientScope = db.prepare(`SELECT COUNT(*) AS count FROM mapping_memory mm JOIN clients c
      ON c.workspace_id=mm.workspace_id AND c.id=mm.client_id WHERE mm.workspace_id=? AND mm.client_id=?
      AND mm.reporting_framework=? AND mm.source_mapping_version_id=?`)
    .bind(workspaceId, clientId, historicalDraft.reportingFramework, mappingApproved.body.result.mappingVersionId).first<any>()?.count;
  assert.equal(historyClientScope, 10, 'approved historical rows are retained under the source client and reporting framework');

  // Prove mapping history is reusable within a subsidiary while the parent’s
  // otherwise matching account/framework history remains outside its scope.
  const mappingParent = db.prepare(`SELECT e.period_start,e.period_end,e.standards_profile_id,p.reporting_framework,
      p.isa_220_edition,p.isa_570_edition,p.presentation_edition,p.early_adoption,p.approved_by_actor_id,p.approved_at,p.content_sha256
    FROM engagements e JOIN standards_profiles p ON p.workspace_id=e.workspace_id AND p.id=e.standards_profile_id
    WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId, engagementId).first<any>();
  assert.ok(mappingParent);
  const shiftCalendarYear = (value: string, years: number) => {
    const [year, month, day] = value.split('-').map(Number);
    const shiftedYear = year + years;
    const shiftedDay = Math.min(day, new Date(Date.UTC(shiftedYear, month, 0)).getUTCDate());
    return new Date(Date.UTC(shiftedYear, month - 1, shiftedDay)).toISOString().slice(0, 10);
  };
  const createMappingTestEngagement = (code: string, reportingFramework = mappingParent.reporting_framework,
    periodStart = mappingParent.period_start, periodEnd = mappingParent.period_end) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    let standardsProfileId = mappingParent.standards_profile_id as string;
    if (reportingFramework !== mappingParent.reporting_framework || periodStart !== mappingParent.period_start || periodEnd !== mappingParent.period_end) {
      standardsProfileId = crypto.randomUUID();
      db.prepare(`INSERT INTO standards_profiles(id,workspace_id,version,name,effective_period_start,effective_period_end,
        isa_220_edition,isa_570_edition,reporting_framework,presentation_edition,early_adoption,approved_by_actor_id,
        approved_at,content_sha256,created_at,updated_at)
      VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(standardsProfileId, workspaceId, `Mapping test ${reportingFramework}`,
        periodStart, periodEnd, mappingParent.isa_220_edition, mappingParent.isa_570_edition,
        reportingFramework, mappingParent.presentation_edition, mappingParent.early_adoption, mappingParent.approved_by_actor_id,
        mappingParent.approved_at, mappingParent.content_sha256, now, now).run();
    }
    db.prepare(`INSERT INTO engagements(id,workspace_id,version,client_id,code,period_start,period_end,engagement_type,
        lifecycle_state,contract_fee_minor,standards_profile_id,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
      VALUES(?,?,1,?,?,?,?,'STATUTORY_AUDIT','PORTAL_ACTIVE_PLANNING',0,?,?,?, ?,?)`)
      .bind(id, workspaceId, childClientId, code, periodStart, periodEnd,
        standardsProfileId, now, now, mappingParent.approved_by_actor_id, mappingParent.approved_by_actor_id).run();
    const fileId = crypto.randomUUID();
    db.prepare(`INSERT INTO file_versions(id,workspace_id,client_id,engagement_id,original_name,media_type,size_bytes,
        object_key,purpose,state,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
      VALUES(?,?,?,?,?,'text/csv',0,?,'TB','STAGED',?,?,?,?)`)
      .bind(fileId, workspaceId, childClientId, id, `${code}.csv`, `test/mapping/${fileId}.csv`, now, now,
        mappingParent.approved_by_actor_id, mappingParent.approved_by_actor_id).run();
    const importId = crypto.randomUUID();
    db.prepare(`INSERT INTO tb_imports(id,workspace_id,client_id,engagement_id,file_version_id,status,worksheet,column_map_json,
        row_count,source_sha256,current_debits_minor,current_credits_minor,error_count,errors_json,created_by_actor_id,created_at,updated_at)
      VALUES(?,?,?,?,?,'ACTIVATED',NULL,'{}',2,?,10000,10000,0,'[]',?,?,?)`)
      .bind(importId, workspaceId, childClientId, id, fileId, 'a'.repeat(64), mappingParent.approved_by_actor_id, now, now).run();
    const tbVersionId = crypto.randomUUID();
    db.prepare(`INSERT INTO tb_versions(id,workspace_id,client_id,engagement_id,revision,import_id,period_start,period_end,currency,
        current_debits_minor,current_credits_minor,prior_present,row_count,content_sha256,accepted_by_actor_id,accepted_at)
      VALUES(?,?,?,?,1,?,?,?,'QAR',10000,10000,0,2,?,?,?)`)
      .bind(tbVersionId, workspaceId, childClientId, id, importId, periodStart, periodEnd,
        'b'.repeat(64), mappingParent.approved_by_actor_id, now).run();
    db.prepare(`INSERT INTO tb_lines(id,workspace_id,client_id,engagement_id,tb_version_id,source_row_number,account_code,
        account_name,current_minor,source_text_json) VALUES(?,?,?,?,?,1,'1000','Cash',10000,'{}'),
        (?,?,?,?,?,2,'3000','Equity',-10000,'{}')`)
      .bind(crypto.randomUUID(), workspaceId, childClientId, id, tbVersionId,
        crypto.randomUUID(), workspaceId, childClientId, id, tbVersionId).run();
    db.prepare(`UPDATE engagements SET active_tb_version_id=?,updated_at=?,version=version+1 WHERE workspace_id=? AND id=?`)
      .bind(tbVersionId, now, workspaceId, id).run();
    const reviewerStaffMemberId = db.prepare(`SELECT staff_member_id FROM actor_profiles WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, reviewerHeaders['X-Test-Session-Profile']).first<{ staff_member_id: string }>()?.staff_member_id;
    assert.ok(reviewerStaffMemberId, 'mapping history fixture has an assigned Reviewer identity');
    db.prepare(`INSERT INTO engagement_assignments(id,workspace_id,version,client_id,engagement_id,staff_member_id,persona,phase,
      start_date,end_date,planned_minutes,created_by_actor_id,created_at)
      VALUES(?,?,1,?,?,?,'REVIEWER','REVIEW','2020-01-01','2020-01-02',240,?,?)`)
      .bind(crypto.randomUUID(), workspaceId, childClientId, id, reviewerStaffMemberId,
        approverHeaders['X-Test-Session-Profile'], now).run();
    return { id, tbVersionId, headers: { ...reviewerHeaders, 'X-Client-Id': childClientId, 'X-Engagement-Id': id } };
  };
  const proposeMapping = async (target: ReturnType<typeof createMappingTestEngagement>) => post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.mapping.propose', payload: { engagementId: target.id, tbVersionId: target.tbVersionId } }
  }, target.headers);
  const childFirstPeriod = createMappingTestEngagement('MAPPING-SUBSIDIARY-SOURCE-PERIOD');
  const childFirstProposal = await proposeMapping(childFirstPeriod);
  assert.equal(childFirstProposal.response.status, 200, JSON.stringify(childFirstProposal.body));
  assert.equal(childFirstProposal.body.result.suggestedCount, 0,
    'the subsidiary does not inherit matching account codes from its parent client');
  assert.equal(childFirstProposal.body.result.unmappedCount, 1);
  assert.equal(childFirstProposal.body.result.nameSimilaritySuggestedCount, 1,
    'a strong account-name match is offered separately from historical memory');
  const childFirstWorkspace = await call(`/api/workspaces/${workspaceId}/engagements/${childFirstPeriod.id}/trial-balance-workspace`,
    { headers: childFirstPeriod.headers });
  assert.equal(childFirstWorkspace.response.status, 200, JSON.stringify(childFirstWorkspace.body));
  const childFirstDraft = childFirstWorkspace.body.mappingDraft;
  const nameSuggestion = childFirstDraft.lines.find((row: any) => row.accountCode === '3000');
  assert.equal(nameSuggestion.suggestionKind, 'NAME_SIMILARITY');
  assert.equal(nameSuggestion.suggestionScore, 100);
  assert.equal(nameSuggestion.confirmed, false, 'similarity never confirms an FSLI automatically');
  assert.equal(nameSuggestion.sourceHistoricalMappingId, null, 'name similarity does not borrow the parent history source');
  const unconfirmedSimilarityApproval = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.mapping.approve', payload: {
      engagementId: childFirstPeriod.id, draftId: childFirstDraft.id, draftHash: childFirstDraft.draftHash
    } }
  }, childFirstPeriod.headers);
  assert.equal(unconfirmedSimilarityApproval.response.status, 409);
  assert.equal(unconfirmedSimilarityApproval.body.code, 'GATE_BLOCKED');
  assert.equal(unconfirmedSimilarityApproval.body.details.blockers.length, 2,
    'nonzero historical and name-similarity suggestions both require explicit reviewer confirmation');
  for (const row of childFirstDraft.lines) {
    const fsliCode = row.accountCode === '1000' ? 'CASH' : 'EQUITY';
    const fsli = childFirstWorkspace.body.fsliCatalog.find((item: any) => item.code === fsliCode);
    assert.ok(fsli, `the current framework includes ${fsliCode}`);
    const setMapping = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'tb.mapping.set', payload: {
        draftId: childFirstDraft.id, tbLineId: row.tbLineId, expectedVersion: row.version, fsliId: fsli.id
      } }
    }, childFirstPeriod.headers);
    assert.equal(setMapping.response.status, 200, JSON.stringify(setMapping.body));
  }
  const childReadyWorkspace = await call(`/api/workspaces/${workspaceId}/engagements/${childFirstPeriod.id}/trial-balance-workspace`,
    { headers: childFirstPeriod.headers });
  const confirmedNameSuggestion = childReadyWorkspace.body.mappingDraft.lines.find((row: any) => row.accountCode === '3000');
  assert.equal(confirmedNameSuggestion.confirmed, true);
  assert.equal(confirmedNameSuggestion.origin, 'MANUAL', 'confirming a name suggestion creates a manual mapping decision');
  assert.equal(confirmedNameSuggestion.suggestionKind, 'NAME_SIMILARITY', 'the draft retains the advisory source as review provenance');
  const childMappingApproval = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.mapping.approve', payload: {
      engagementId: childFirstPeriod.id, draftId: childReadyWorkspace.body.mappingDraft.id,
      draftHash: childReadyWorkspace.body.mappingDraft.draftHash
    } }
  }, childFirstPeriod.headers);
  assert.equal(childMappingApproval.response.status, 200, JSON.stringify(childMappingApproval.body));
  const childEarlierPeriod = createMappingTestEngagement('MAPPING-SUBSIDIARY-EARLIER-PERIOD', mappingParent.reporting_framework,
    shiftCalendarYear(mappingParent.period_start, -1), shiftCalendarYear(mappingParent.period_end, -1));
  const childEarlierProposal = await proposeMapping(childEarlierPeriod);
  assert.equal(childEarlierProposal.response.status, 200, JSON.stringify(childEarlierProposal.body));
  const childEarlierWorkspace = await call(`/api/workspaces/${workspaceId}/engagements/${childEarlierPeriod.id}/trial-balance-workspace`,
    { headers: childEarlierPeriod.headers });
  assert.equal(childEarlierWorkspace.response.status, 200, JSON.stringify(childEarlierWorkspace.body));
  assert.ok(childEarlierWorkspace.body.mappingDraft.lines.every((row: any) => row.origin !== 'EXACT_HISTORY'
    && row.sourceHistoricalMappingId === null),
  'a same-client mapping from a later accepted period cannot flow backward into an earlier engagement');

  const childHistoryProposalTarget = createMappingTestEngagement('MAPPING-SUBSIDIARY-NEXT-PERIOD', mappingParent.reporting_framework,
    shiftCalendarYear(mappingParent.period_start, 1), shiftCalendarYear(mappingParent.period_end, 1));
  const childHistoryProposal = await proposeMapping(childHistoryProposalTarget);
  assert.equal(childHistoryProposal.response.status, 200, JSON.stringify(childHistoryProposal.body));
  assert.equal(childHistoryProposal.body.result.suggestedCount, 2,
    'approved history is reusable for a later period of the same subsidiary');
  assert.equal(childHistoryProposal.body.result.unmappedCount, 0);
  const childHistoryWorkspace = await call(`/api/workspaces/${workspaceId}/engagements/${childHistoryProposalTarget.id}/trial-balance-workspace`,
    { headers: childHistoryProposalTarget.headers });
  assert.equal(childHistoryWorkspace.response.status, 200, JSON.stringify(childHistoryWorkspace.body));
  assert.ok(childHistoryWorkspace.body.mappingDraft.lines.every((row: any) => row.origin === 'EXACT_HISTORY'
    && row.confirmed === false && row.sourceHistoricalMappingId && row.historyPeriodEnd === mappingParent.period_end
    && Number.isInteger(row.historyMappingRevision) && row.historyMappingRevision > 0),
  'subsidiary suggestions retain visible source-period and mapping-revision provenance while remaining explicitly unconfirmed');
  const exactHistorySuggestion = childHistoryWorkspace.body.mappingDraft.lines[0];
  const explicitHistoryConfirmation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'tb.mapping.set', payload: {
      draftId: childHistoryWorkspace.body.mappingDraft.id, tbLineId: exactHistorySuggestion.tbLineId,
      expectedVersion: exactHistorySuggestion.version, fsliId: exactHistorySuggestion.fsliId
    } }
  }, childHistoryProposalTarget.headers);
  assert.equal(explicitHistoryConfirmation.response.status, 200, JSON.stringify(explicitHistoryConfirmation.body));
  const confirmedHistoryWorkspace = await call(`/api/workspaces/${workspaceId}/engagements/${childHistoryProposalTarget.id}/trial-balance-workspace`,
    { headers: childHistoryProposalTarget.headers });
  const confirmedHistoryRow = confirmedHistoryWorkspace.body.mappingDraft.lines.find((row: any) => row.tbLineId === exactHistorySuggestion.tbLineId);
  assert.equal(confirmedHistoryRow.confirmed, true, 'the explicit UI confirmation action accepts the unchanged exact-history suggestion');
  assert.equal(confirmedHistoryRow.origin, 'EXACT_HISTORY');
  assert.equal(confirmedHistoryRow.sourceHistoricalMappingId, exactHistorySuggestion.sourceHistoricalMappingId);
  const differentFrameworkTarget = createMappingTestEngagement('MAPPING-SUBSIDIARY-OTHER-FRAMEWORK', 'OTHER-APPROVED-FRAMEWORK');
  const differentFrameworkProposal = await proposeMapping(differentFrameworkTarget);
  assert.equal(differentFrameworkProposal.response.status, 200, JSON.stringify(differentFrameworkProposal.body));
  assert.equal(differentFrameworkProposal.body.result.suggestedCount, 0,
    'approved subsidiary history is not applied under a different reporting framework');

  const materialityCalculated = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'materiality.calculate', payload: {
      engagementId, tbVersionId: tbActivated.body.result.tbVersionId, mappingVersionId: mappingApproved.body.result.mappingVersionId,
      benchmark: 'REVENUE', benchmarkRateBps: 100, performanceRateBps: 6000, sadRateBps: 400, adjustments: []
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(materialityCalculated.response.status, 200, JSON.stringify(materialityCalculated.body));
  assert.equal(materialityCalculated.body.result.benchmarkMinor, '600000000');
  assert.equal(materialityCalculated.body.result.planningMinor, '6000000');
  assert.equal(materialityCalculated.body.result.performanceMinor, '3600000');
  assert.equal(materialityCalculated.body.result.sadMinor, '240000');
  const roundedMateriality = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'materiality.adjust', payload: {
      materialityVersionId: materialityCalculated.body.result.materialityVersionId, planningMinor: '6300000', performanceMinor: '3780000', sadMinor: '252000',
      reason: 'The partner reviewed compatible tier rounding at the inclusive five percent boundary.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(roundedMateriality.response.status, 200, JSON.stringify(roundedMateriality.body));
  const excessiveRounding = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'materiality.adjust', payload: {
      materialityVersionId: roundedMateriality.body.result.materialityVersionId, planningMinor: '6300001', performanceMinor: '3780000', sadMinor: '252000',
      reason: 'This amount is one minor unit above the inclusive five percent boundary.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(excessiveRounding.response.status, 422);
  assert.equal(excessiveRounding.body.code, 'VALIDATION_FAILED');
  const lowerBoundaryRounding = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'materiality.adjust', payload: {
      materialityVersionId: roundedMateriality.body.result.materialityVersionId, planningMinor: '5700000', performanceMinor: '3420000', sadMinor: '228000',
      reason: 'The partner reviewed all three tiers at the inclusive lower five percent boundary.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(lowerBoundaryRounding.response.status, 200, JSON.stringify(lowerBoundaryRounding.body));
  assert.equal(lowerBoundaryRounding.body.result.planningMinor, '5700000');
  assert.equal(lowerBoundaryRounding.body.result.performanceMinor, '3420000');
  assert.equal(lowerBoundaryRounding.body.result.sadMinor, '228000');
  const belowLowerBoundaryRounding = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'materiality.adjust', payload: {
      materialityVersionId: lowerBoundaryRounding.body.result.materialityVersionId, planningMinor: '5699999', performanceMinor: '3420000', sadMinor: '228000',
      reason: 'This amount is one minor unit below the inclusive lower five percent boundary.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(belowLowerBoundaryRounding.response.status, 422);
  assert.equal(belowLowerBoundaryRounding.body.code, 'VALIDATION_FAILED');
  const restoredMateriality = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'materiality.adjust', payload: {
      materialityVersionId: lowerBoundaryRounding.body.result.materialityVersionId, planningMinor: '6300000', performanceMinor: '3780000', sadMinor: '252000',
      reason: 'Restore the thresholds active before the independent lower-bound check.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(restoredMateriality.response.status, 200, JSON.stringify(restoredMateriality.body));
  const currentTbWorkspace = await call(tbWorkspacePath, { headers: makeRiskHeaders(reviewerHeaders) });
  const activeMaterialityId = currentTbWorkspace.body.engagement.activeMaterialityVersionId;
  assert.equal(activeMaterialityId, restoredMateriality.body.result.materialityVersionId);
  assert.equal(currentTbWorkspace.body.materiality.planningMinor, 6300000);
  const riskAssessments = [
    ['CASH','LOW'],['RECEIVABLES','LOW'],['PROPERTY_EQUIPMENT','LOW'],['OTHER_CURRENT_ASSETS','LOW'],['ADMIN_EXPENSE','LOW'],
    ['PAYABLES','LOW'],['BORROWINGS','LOW'],['EQUITY','LOW'],['REVENUE','HIGH']
  ] as const;
  for (const [fsliCode,inherentRisk] of riskAssessments) {
    const definition = currentTbWorkspace.body.fsliCatalog.find((item: any) => item.code === fsliCode);
    const risk = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'fsli.risk.set', payload: {
        engagementId, materialityVersionId: activeMaterialityId, fsliId: definition.id, inherentRisk, criticalEstimate: false,
        rationale: `The ${fsliCode} classification was assessed against the current audit evidence and planning threshold.`
      } }
    }, makeRiskHeaders(reviewerHeaders));
    assert.equal(risk.response.status, 200, JSON.stringify(risk.body));
  }
  const riskView = await call(tbWorkspacePath, { headers: makeRiskHeaders(reviewerHeaders) });
  const riskBands = Object.fromEntries(riskView.body.materiality.risks.map((risk: any) => [risk.code,risk.band]));
  assert.equal(riskBands.PROPERTY_EQUIPMENT, 'AMBER', 'absolute FSLI exposure exactly at TE is Amber');
  assert.equal(riskBands.RECEIVABLES, 'AMBER', 'absolute FSLI exposure exactly at PM remains Amber');
  assert.equal(riskBands.OTHER_CURRENT_ASSETS, 'GREEN', 'an absolute balance one minor unit below TE is Green for low inherent risk');
  assert.equal(riskBands.REVENUE, 'RED', 'high inherent risk remains Red regardless of the selected benchmark');

  for (const staffMemberId of [staff.body.result.staffMemberId, partnerStaffId]) {
    const savedCapacity = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.availability.set', payload: { staffMemberId, workDate: planDate, scheduledMinutes: 480 } }
    }, makeRiskHeaders(reviewerHeaders));
    assert.equal(savedCapacity.response.status, 200, JSON.stringify(savedCapacity.body));
  }
  const reviewerAssignment = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.assign', payload: { engagementId, staffMemberId: staff.body.result.staffMemberId,
      persona: 'REVIEWER', phase: 'FIELDWORK', startDate: planDate, endDate: planDate, plannedMinutes: 240, dailyMinutes: [{ date: planDate, minutes: 240 }] } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(reviewerAssignment.response.status, 200, JSON.stringify(reviewerAssignment.body));
  const partnerAssignment = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.assign', payload: { engagementId, staffMemberId: partnerStaffId,
      persona: 'APPROVER', phase: 'PLANNING', startDate: planDate, endDate: planDate, plannedMinutes: 60, dailyMinutes: [{ date: planDate, minutes: 60 }] } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(partnerAssignment.response.status, 200, JSON.stringify(partnerAssignment.body));
  const readyForPlanning = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/planning-readiness`, { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(readyForPlanning.response.status, 200, JSON.stringify(readyForPlanning.body));
  assert.equal(readyForPlanning.body.ready, true, JSON.stringify(readyForPlanning.body.blockers));
  const planningCompiled = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'planning.compile', payload: {
      engagementId, tbVersionId: tbActivated.body.result.tbVersionId, mappingVersionId: mappingApproved.body.result.mappingVersionId,
      materialityVersionId: activeMaterialityId, scopeText: 'Perform the statutory audit for the approved reporting period using the accepted source records.',
      strategyText: 'Focus fieldwork on current revenue, property and receivables while retaining independent review and evidence tracing.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(planningCompiled.response.status, 200, JSON.stringify(planningCompiled.body));
  assert.deepEqual(planningCompiled.body.result.blockers, []);
  const changedRiskAfterCompile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'fsli.risk.set', payload: { engagementId, materialityVersionId: activeMaterialityId,
      fsliId: riskView.body.materiality.risks[0].fsliId, inherentRisk: riskView.body.materiality.risks[0].inherentRisk,
      criticalEstimate: Boolean(riskView.body.materiality.risks[0].criticalEstimate), rationale: 'Reconfirmed after compiling the prior planning snapshot.' } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(changedRiskAfterCompile.response.status, 200, JSON.stringify(changedRiskAfterCompile.body));
  const stalePlanApproval = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'planning.approve', payload: {
      engagementId, planningVersionId: planningCompiled.body.result.planningVersionId, dependencyHash: planningCompiled.body.result.sourceHash,
      rationale: 'The Partner reviewed the exact current trial balance, mapping, materiality, capacity, PBC status and risk assessment.'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(stalePlanApproval.response.status, 409, 'a change after plan compilation blocks stale sign-off');
  const refreshedPlanningCompile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'planning.compile', payload: { engagementId,
      tbVersionId: tbActivated.body.result.tbVersionId, mappingVersionId: mappingApproved.body.result.mappingVersionId,
      materialityVersionId: activeMaterialityId, scopeText: 'Perform the statutory audit for the approved reporting period using the accepted source records.',
      strategyText: 'Focus fieldwork on current revenue, property and receivables while retaining independent review and evidence tracing.' } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(refreshedPlanningCompile.response.status, 200, JSON.stringify(refreshedPlanningCompile.body));
  const planningApproved = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'planning.approve', payload: {
      engagementId, planningVersionId: refreshedPlanningCompile.body.result.planningVersionId, dependencyHash: refreshedPlanningCompile.body.result.sourceHash,
      rationale: 'The Partner reviewed the exact current trial balance, mapping, materiality, capacity, PBC status and risk assessment.'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(planningApproved.response.status, 200, JSON.stringify(planningApproved.body));
  assert.equal(planningApproved.body.result.state, 'FIELDWORK_EXECUTION');
  assert.equal(db.prepare(`SELECT approved_planning_version_id,lifecycle_state FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, engagementId).first<any>()?.lifecycle_state, 'FIELDWORK_EXECUTION');
  const managerCannotHandoverEmptyFieldwork = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'fieldwork.handover-manager', payload: {
      engagementId, expectedVersion: Number(db.prepare('SELECT version FROM engagements WHERE workspace_id=? AND id=?').bind(workspaceId, engagementId).first<any>()?.version),
      reason: 'Attempt to advance before any applicable workprogram has been submitted and independently accepted.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(managerCannotHandoverEmptyFieldwork.response.status, 409);
  assert.equal(managerCannotHandoverEmptyFieldwork.body.code, 'GATE_BLOCKED', 'fieldwork cannot advance when no current workprogram has been accepted');
  const partnerCannotSkipManagerReview = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'fieldwork.handover-partner', payload: {
      engagementId, expectedVersion: Number(db.prepare('SELECT version FROM engagements WHERE workspace_id=? AND id=?').bind(workspaceId, engagementId).first<any>()?.version),
      reason: 'Attempt to skip the Manager review and clearances.'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(partnerCannotSkipManagerReview.response.status, 422);
  assert.equal(partnerCannotSkipManagerReview.body.code, 'INVALID_STATE', 'Partner approval follows a successful Manager handover');

  // Slice 4 — the current D1 statements, analytical review and mixed-mode
  // evidence stay pinned to the approved planning and source revisions.
  const technicalHeaders = makeRiskHeaders(preparerHeaders);
  const statements = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/financial-statements`, { headers: technicalHeaders });
  assert.equal(statements.response.status, 200, JSON.stringify(statements.body));
  assert.equal(statements.body.reconciliation.balanced, true, 'the live split statements reconcile without a suspense line');
  assert.deepEqual({ assets: statements.body.reconciliation.assetsMinor, liabilities: statements.body.reconciliation.liabilitiesMinor,
    currentProfit: statements.body.reconciliation.currentResultMinor, equityIncludingProfit: statements.body.reconciliation.equityIncludingCurrentResultMinor },
  { assets: '2300000000', liabilities: '1000000000', currentProfit: '300000000', equityIncludingProfit: '1300000000' },
  'the accepted ten-row trial balance presents QAR 23,000 assets, QAR 10,000 liabilities and QAR 3,000 current profit');
  assert.ok(statements.body.sourcePins.tbVersionId && statements.body.sourcePins.mappingVersionId,
    'the live statement exposes the exact active TB and mapping revisions');
  const revenueLine = statements.body.profitLoss.find((line: any) => line.category === 'REVENUE');
  assert.ok(revenueLine?.fsliId, 'the current mapped revenue source resolves to its FSLI');
  assert.deepEqual({ current: revenueLine.currentAdjustedMinor, prior: revenueLine.priorMinor, reason: revenueLine.varianceReason },
    { current: 600000000, prior: 0, reason: 'NEW_BALANCE' }, 'a new current-period revenue balance has an explicit comparison state');
  assert.ok(revenueLine.sourceRows.length > 0 && revenueLine.sourceRows.every((row: any) => row.tbLineId && row.sourceRowNumber),
    'statement values retain links to every contributing TB source row');
  const revenueSourcePage = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/fslis/${revenueLine.fsliId}/source-lines?limit=100&cursor=0`,
    { headers: technicalHeaders });
  assert.equal(revenueSourcePage.response.status, 200, JSON.stringify(revenueSourcePage.body));
  assert.equal(revenueSourcePage.body.rows[0].accountCode, '4000');
  assert.equal(revenueSourcePage.body.rows[0].currentPresentedMinor, '600000000');
  const fieldworkWorkspace = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/fieldwork-workspace`, { headers: technicalHeaders });
  assert.equal(fieldworkWorkspace.response.status, 200, JSON.stringify(fieldworkWorkspace.body));
  assert.equal(fieldworkWorkspace.body.statements.sourceHash, statements.body.sourceHash);

  const statementSnapshot = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'statement.snapshot', payload: { engagementId } }
  }, technicalHeaders);
  assert.equal(statementSnapshot.response.status, 200, JSON.stringify(statementSnapshot.body));
  assert.equal(statementSnapshot.body.result.lineCount, statements.body.profitLoss.length + statements.body.balanceSheet.length);
  const reusedSnapshot = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'statement.snapshot', payload: { engagementId } }
  }, technicalHeaders);
  assert.equal(reusedSnapshot.response.status, 200, JSON.stringify(reusedSnapshot.body));
  assert.equal(reusedSnapshot.body.result.statementSnapshotId, statementSnapshot.body.result.statementSnapshotId,
    'an identical source hash reuses the immutable statement snapshot');

  // US-FLD-004 — going-concern evidence and the assessment horizon are
  // validated, and the applicable ISA 570 edition is pinned from the
  // engagement's approved profile rather than today's date.
  const engagementStandards = db.prepare(`SELECT e.period_start,e.period_end,e.standards_profile_id,p.isa_570_edition
    FROM engagements e JOIN standards_profiles p ON p.workspace_id=e.workspace_id AND p.id=e.standards_profile_id
    WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId, engagementId).first<any>();
  const goingConcernChecklist = { managementAssessment: false, cashFlowForecasts: false, financingAndCovenants: false,
    adverseEvents: false, mitigatingPlans: false, uncertaintyEvaluation: false };
  const unsupportedGoingConcern = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'going-concern.save', payload: {
      engagementId, assessmentStart: engagementStandards.period_start, assessmentEnd: engagementStandards.period_end,
      checklist: { ...goingConcernChecklist, managementAssessment: true }, conclusion: 'UNASSESSED',
      rationale: 'The assessment source is intentionally absent in this rejected draft.'
    } }
  }, technicalHeaders);
  assert.equal(unsupportedGoingConcern.response.status, 422, JSON.stringify(unsupportedGoingConcern.body));
  assert.equal(unsupportedGoingConcern.body.code, 'VALIDATION_FAILED');
  const shortGoingConcernHorizon = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'going-concern.save', payload: {
      engagementId, assessmentStart: '2024-01-01', assessmentEnd: '2024-12-31',
      checklist: goingConcernChecklist, conclusion: 'UNASSESSED',
      rationale: 'This horizon does not cover the engagement reporting date.'
    } }
  }, technicalHeaders);
  assert.equal(shortGoingConcernHorizon.response.status, 422, JSON.stringify(shortGoingConcernHorizon.body));
  assert.equal(shortGoingConcernHorizon.body.code, 'VALIDATION_FAILED');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM going_concern_assessments WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId, engagementId).first<any>()?.count, 0, 'invalid evidence and horizon drafts leave no assessment rows');
  const savedGoingConcern = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'going-concern.save', payload: {
      engagementId, assessmentStart: engagementStandards.period_start, assessmentEnd: engagementStandards.period_end,
      checklist: goingConcernChecklist, conclusion: 'UNASSESSED',
      rationale: 'The viability assessment remains incomplete and no conclusion is asserted.'
    } }
  }, technicalHeaders);
  assert.equal(savedGoingConcern.response.status, 200, JSON.stringify(savedGoingConcern.body));
  assert.equal(savedGoingConcern.body.result.edition, engagementStandards.isa_570_edition,
    'the assessment retains the edition selected on the engagement standards profile');
  const goingConcernProjection = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/fieldwork-workspace`, { headers: technicalHeaders });
  assert.equal(goingConcernProjection.response.status, 200, JSON.stringify(goingConcernProjection.body));
  assert.equal(goingConcernProjection.body.goingConcern.id, savedGoingConcern.body.result.assessmentId);
  assert.equal(goingConcernProjection.body.goingConcern.status, 'DRAFT');
  assert.equal(goingConcernProjection.body.goingConcern.conclusion, 'UNASSESSED', 'incomplete work is not defaulted to no material uncertainty');
  assert.equal(goingConcernProjection.body.goingConcern.isa570Edition, engagementStandards.isa_570_edition);
  const unassessedGoingConcernSubmit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.submit', payload: {
      targetKind: 'GOING_CONCERN', targetId: savedGoingConcern.body.result.assessmentId, targetVersion: 1
    } }
  }, technicalHeaders);
  assert.equal(unassessedGoingConcernSubmit.response.status, 409, JSON.stringify(unassessedGoingConcernSubmit.body));
  assert.equal(unassessedGoingConcernSubmit.body.code, 'GATE_BLOCKED');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM review_submissions WHERE workspace_id=? AND going_concern_id=?`)
    .bind(workspaceId, savedGoingConcern.body.result.assessmentId).first<any>()?.count, 0,
  'an unassessed going-concern draft cannot enter independent review');
  assert.equal(db.prepare(`SELECT isa_570_edition FROM standards_profiles WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, engagementStandards.standards_profile_id).first<any>()?.isa_570_edition, engagementStandards.isa_570_edition,
  'opening and saving an older-period assessment does not silently revise its approved standards profile');

  const analyticalReview = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.save', payload: {
      engagementId, fsliId: revenueLine.fsliId, statementSnapshotId: statementSnapshot.body.result.statementSnapshotId,
      expectationText: 'Revenue should reflect the approved statutory audit period and documented service activity.',
      thresholdMinor: '250000', thresholdBps: 1000,
      explanation: 'The recorded balance was compared with the period expectation and current underlying records.',
      conclusion: 'The current revenue presentation is consistent with the retained source evidence.',
      ratios: [{ name: 'Zero denominator control', numeratorMinor: '50000', denominatorMinor: '0',
        numeratorSource: 'Current-period revenue workpaper', denominatorSource: 'No comparative value was reported.' }]
    } }
  }, technicalHeaders);
  assert.equal(analyticalReview.response.status, 200, JSON.stringify(analyticalReview.body));
  const ratio = db.prepare('SELECT result_numerator,result_denominator,undefined_reason FROM analytical_ratios WHERE workspace_id=? AND analytical_review_id=?')
    .bind(workspaceId, analyticalReview.body.result.analyticalReviewId).first<any>();
  assert.deepEqual({ ...ratio }, { result_numerator: null, result_denominator: null, undefined_reason: 'ZERO_DENOMINATOR' });
  const incompleteAnalysis = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.save', payload: {
      engagementId, fsliId: revenueLine.fsliId, statementSnapshotId: statementSnapshot.body.result.statementSnapshotId,
      expectationText: 'Revenue movement must be compared with the approved period expectation.', thresholdBps: 1000, ratios: []
    } }
  }, technicalHeaders);
  assert.equal(incompleteAnalysis.response.status, 200, JSON.stringify(incompleteAnalysis.body));
  const incompleteAnalysisSubmit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.submit', payload: {
      analyticalReviewId: incompleteAnalysis.body.result.analyticalReviewId, expectedVersion: 1
    } }
  }, technicalHeaders);
  assert.equal(incompleteAnalysisSubmit.response.status, 422, JSON.stringify(incompleteAnalysisSubmit.body));
  assert.equal(incompleteAnalysisSubmit.body.code, 'VALIDATION_FAILED');
  assert.deepEqual(incompleteAnalysisSubmit.body.details.missingFields, ['explanation', 'conclusion', 'supportingEvidence'],
    'the significant movement cannot be submitted without an explanation, conclusion and reviewed support');
  assert.equal(db.prepare(`SELECT status FROM analytical_reviews WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, incompleteAnalysis.body.result.analyticalReviewId).first<any>()?.status, 'DRAFT',
  'missing analysis components do not create an independent review submission');
  const blockedAnalysisSubmit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.submit', payload: {
      analyticalReviewId: analyticalReview.body.result.analyticalReviewId, expectedVersion: 1
    } }
  }, technicalHeaders);
  assert.equal(blockedAnalysisSubmit.response.status, 422, JSON.stringify(blockedAnalysisSubmit.body));
  assert.equal(blockedAnalysisSubmit.body.code, 'VALIDATION_FAILED', 'an analytical conclusion needs independently reviewed current evidence');
  assert.deepEqual(blockedAnalysisSubmit.body.details.missingFields, ['supportingEvidence']);

  const urlOnlyEvidence = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.create', payload: {
      engagementId, mode: 'DIGITAL', title: 'External reference without retained bytes',
      externalSourceUrl: 'https://evidence.example.invalid/register.pdf', retrievedAt: '2026-10-01T12:30:00.000Z'
    } }
  }, technicalHeaders);
  assert.equal(urlOnlyEvidence.response.status, 422, JSON.stringify(urlOnlyEvidence.body));
  assert.equal(urlOnlyEvidence.body.code, 'VALIDATION_FAILED', 'an external URL cannot stand in for committed retained evidence bytes');

  const hybridEvidence = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.create', payload: {
      engagementId, mode: 'HYBRID', title: 'Revenue source inspection record', fileVersionId: replacementPbcFile.fileId,
      physicalIndex: 'REV-01', physicalDescription: 'Original signed sales-register extract inspected at the client site.',
      binder: 'Revenue binder A', box: '3', shelf: 'B',
      externalSourceUrl: 'https://evidence.example.invalid/register.pdf', retrievedAt: '2026-10-01T12:30:00.000Z'
    } }
  }, technicalHeaders);
  assert.equal(hybridEvidence.response.status, 200, JSON.stringify(hybridEvidence.body));
  assert.equal(hybridEvidence.body.result.fileVersionId, replacementPbcFile.fileId, 'an accepted PBC submission can be pinned as retained digital bytes');
  assert.equal(hybridEvidence.body.result.fileSha256, replacementPbcFile.sha256);
  assert.equal(hybridEvidence.body.result.physicalIndex, 'REV-01');
  assert.equal(hybridEvidence.body.result.box, '3');
  assert.equal(hybridEvidence.body.result.shelf, 'B');
  const evidenceLink = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.link', payload: {
      evidenceId: hybridEvidence.body.result.evidenceId, evidenceVersion: 1, targetVersion: 1,
      analyticalReviewId: analyticalReview.body.result.analyticalReviewId
    } }
  }, technicalHeaders);
  assert.equal(evidenceLink.response.status, 200, JSON.stringify(evidenceLink.body));
  const evidenceAdequacy = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.review', payload: {
      evidenceId: hybridEvidence.body.result.evidenceId, evidenceVersion: 1, status: 'ADEQUATE',
      rationale: 'The committed PDF matches the inspected physical revenue register and supports this conclusion.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(evidenceAdequacy.response.status, 200, JSON.stringify(evidenceAdequacy.body));
  const hybridEvidenceProjection = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/fieldwork-workspace`, { headers: technicalHeaders });
  assert.equal(hybridEvidenceProjection.response.status, 200, JSON.stringify(hybridEvidenceProjection.body));
  const retainedHybridEvidence = hybridEvidenceProjection.body.evidence.find((item: any) => item.id === hybridEvidence.body.result.evidenceId);
  assert.deepEqual({
    fileVersionId: retainedHybridEvidence.fileVersionId, fileSha256: retainedHybridEvidence.fileSha256,
    physicalIndex: retainedHybridEvidence.physicalIndex, physicalDescription: retainedHybridEvidence.physicalDescription,
    binder: retainedHybridEvidence.binder, box: retainedHybridEvidence.box, shelf: retainedHybridEvidence.shelf,
    externalSourceUrl: retainedHybridEvidence.externalSourceUrl, retrievedAt: retainedHybridEvidence.retrievedAt
  }, {
    fileVersionId: replacementPbcFile.fileId, fileSha256: replacementPbcFile.sha256,
    physicalIndex: 'REV-01', physicalDescription: 'Original signed sales-register extract inspected at the client site.',
    binder: 'Revenue binder A', box: '3', shelf: 'B',
    externalSourceUrl: 'https://evidence.example.invalid/register.pdf', retrievedAt: '2026-10-01T12:30:00.000Z'
  }, 'hybrid evidence keeps byte identity, exact physical locators and retrieval provenance together');
  const submittedAnalysis = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.submit', payload: {
      analyticalReviewId: analyticalReview.body.result.analyticalReviewId, expectedVersion: 2
    } }
  }, technicalHeaders);
  assert.equal(submittedAnalysis.response.status, 200, JSON.stringify(submittedAnalysis.body));
  const acceptedAnalysis = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.decide', payload: {
      submissionId: submittedAnalysis.body.result.submissionId, decision: 'ACCEPT',
      comment: 'The submitted analytical review and its current evidence were independently inspected and accepted.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(acceptedAnalysis.response.status, 200, JSON.stringify(acceptedAnalysis.body));
  assert.equal(acceptedAnalysis.body.result.decision, 'ACCEPT');

  // US-GAP-11 — an analytical review is revised in place (identity preserved)
  // instead of being silently replaced, and the revision is version-guarded.
  const reviseDraft = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.save', payload: {
      engagementId, fsliId: revenueLine.fsliId, statementSnapshotId: statementSnapshot.body.result.statementSnapshotId,
      expectationText: 'The comparative revenue movement expectation is documented for the rework journey review.',
      thresholdMinor: '250000', thresholdBps: 1000,
      explanation: 'The recorded balance was compared with the retained period expectation before rework.',
      conclusion: 'The initial presentation matched the retained source evidence before independent review.',
      ratios: []
    } }
  }, technicalHeaders);
  assert.equal(reviseDraft.response.status, 200, JSON.stringify(reviseDraft.body));
  const reviseDraftId = reviseDraft.body.result.analyticalReviewId as string;
  const reviseInPlace = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.save', payload: {
      analyticalReviewId: reviseDraftId, expectedVersion: 1,
      engagementId, fsliId: revenueLine.fsliId, statementSnapshotId: statementSnapshot.body.result.statementSnapshotId,
      expectationText: 'The revised expectation reconciles the comparative movement to retained source records.',
      thresholdMinor: '250000', thresholdBps: 1000,
      explanation: 'The revised explanation reconciles the comparative revenue movement to retained source records.',
      conclusion: 'The revised conclusion reflects the current comparative movement with no residual variance.',
      ratios: []
    } }
  }, technicalHeaders);
  assert.equal(reviseInPlace.response.status, 200, JSON.stringify(reviseInPlace.body));
  assert.equal(reviseInPlace.body.result.analyticalReviewId, reviseDraftId, 'the original record is revised in place, not replaced');
  const revisedDraftRow = db.prepare('SELECT version,status FROM analytical_reviews WHERE workspace_id=? AND id=?').bind(workspaceId, reviseDraftId).first<any>();
  assert.equal(revisedDraftRow.status, 'DRAFT');
  assert.equal(revisedDraftRow.version, 2);
  const staleRevision = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.save', payload: {
      analyticalReviewId: reviseDraftId, expectedVersion: 1,
      engagementId, fsliId: revenueLine.fsliId, statementSnapshotId: statementSnapshot.body.result.statementSnapshotId,
      expectationText: 'A stale revision attempt must not overwrite the current revised record version.',
      explanation: 'This revision presents a stale expected version for the same analytical review.',
      conclusion: 'A stale expected version cannot revise the record.', ratios: [] } }
  }, technicalHeaders);
  assert.equal(staleRevision.response.status, 409, 'a stale revision is rejected with a version conflict');
  const acceptedRow = db.prepare('SELECT version FROM analytical_reviews WHERE workspace_id=? AND id=?').bind(workspaceId, analyticalReview.body.result.analyticalReviewId).first<any>();
  const acceptedRevision = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.save', payload: {
      analyticalReviewId: analyticalReview.body.result.analyticalReviewId, expectedVersion: acceptedRow.version,
      engagementId, fsliId: revenueLine.fsliId, statementSnapshotId: statementSnapshot.body.result.statementSnapshotId,
      expectationText: 'An already reviewed analytical review must not accept further preparer revisions.',
      explanation: 'This revision attempts to edit an independently accepted analytical review.',
      conclusion: 'An accepted review is immutable to preparer revision.', ratios: [] } }
  }, technicalHeaders);
  assert.equal(acceptedRevision.response.status, 422, 'an independently reviewed analytical review cannot be revised');

  const analyticalEvidenceV1 = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.create', payload: {
      engagementId, mode: 'DIGITAL', title: 'Analytical review source, original', fileVersionId: fileId
    } }
  }, technicalHeaders);
  assert.equal(analyticalEvidenceV1.response.status, 200, JSON.stringify(analyticalEvidenceV1.body));
  const analyticalEvidenceReviewV1 = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.review', payload: {
      evidenceId: analyticalEvidenceV1.body.result.evidenceId, evidenceVersion: 1, status: 'ADEQUATE',
      rationale: 'The original analytical source was checked against retained bytes.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(analyticalEvidenceReviewV1.response.status, 200, JSON.stringify(analyticalEvidenceReviewV1.body));
  const staleAnalyticalDraft = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.save', payload: {
      engagementId, fsliId: revenueLine.fsliId, statementSnapshotId: statementSnapshot.body.result.statementSnapshotId,
      expectationText: 'The current-period expectation is compared with a committed revenue source.',
      thresholdMinor: '250000', thresholdBps: 1000, explanation: 'The source supports an independently testable expectation.',
      conclusion: 'The source supports the current-period analytical conclusion.', ratios: []
    } }
  }, technicalHeaders);
  assert.equal(staleAnalyticalDraft.response.status, 200, JSON.stringify(staleAnalyticalDraft.body));
  const staleAnalyticalLinkV1 = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.link', payload: {
      evidenceId: analyticalEvidenceV1.body.result.evidenceId, evidenceVersion: 1, targetVersion: 1,
      analyticalReviewId: staleAnalyticalDraft.body.result.analyticalReviewId
    } }
  }, technicalHeaders);
  assert.equal(staleAnalyticalLinkV1.response.status, 200, JSON.stringify(staleAnalyticalLinkV1.body));
  const staleAnalyticalSubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.submit', payload: {
      analyticalReviewId: staleAnalyticalDraft.body.result.analyticalReviewId, expectedVersion: 2
    } }
  }, technicalHeaders);
  assert.equal(staleAnalyticalSubmission.response.status, 200, JSON.stringify(staleAnalyticalSubmission.body));
  const analyticalEvidenceV2 = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.create', payload: {
      engagementId, mode: 'DIGITAL', title: 'Analytical review source, corrected', fileVersionId: replacementPbcFile.fileId,
      supersedesEvidenceId: analyticalEvidenceV1.body.result.evidenceId
    } }
  }, technicalHeaders);
  assert.equal(analyticalEvidenceV2.response.status, 200, JSON.stringify(analyticalEvidenceV2.body));
  const analyticalEvidenceReviewV2 = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.review', payload: {
      evidenceId: analyticalEvidenceV2.body.result.evidenceId, evidenceVersion: 2, status: 'ADEQUATE',
      rationale: 'The corrected source bytes were independently reassessed.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(analyticalEvidenceReviewV2.response.status, 200, JSON.stringify(analyticalEvidenceReviewV2.body));
  const staleAnalyticalAcceptance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.decide', payload: {
      submissionId: staleAnalyticalSubmission.body.result.submissionId, decision: 'ACCEPT',
      comment: 'Attempt to accept the analytical conclusion after its evidence family was superseded.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(staleAnalyticalAcceptance.response.status, 409);
  assert.equal(staleAnalyticalAcceptance.body.code, 'STALE_DEPENDENCY');
  const returnStaleAnalyticalReview = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.decide', payload: {
      submissionId: staleAnalyticalSubmission.body.result.submissionId, decision: 'RETURN',
      comment: 'Reassess the analytical conclusion against the corrected evidence version.',
      assignedPreparerId: preparerStaff.body.result.staffMemberId
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(returnStaleAnalyticalReview.response.status, 200, JSON.stringify(returnStaleAnalyticalReview.body));
  assert.equal(returnStaleAnalyticalReview.body.result.status, 'UNDER_REWORK');

  const samplingReviewerHeaders = makeRiskHeaders(reviewerHeaders);
  const samplingApproverHeaders = makeRiskHeaders(approverHeaders);
  // US-FLD-005..006 — approved source templates, ad-hoc scope, Manager-only
  // Red-risk execution and row-level concurrency/review revision protection.
  const revenueTemplate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'workprogram.template.create', payload: {
      fsliCode: 'REVENUE', title: 'Revenue assertions and cutoff', standardsProfileId: planningApproved.body.result.standardsProfileId ?? fieldworkWorkspace.body.engagement.standardsProfileId,
      procedures: [
        { title: 'Vouch recorded revenue', instructions: 'Trace selected recorded invoices to signed evidence of delivered services and customer acceptance.', assertion: 'EXISTENCE', mandatory: true },
        { title: 'Confirm rights and obligations', instructions: 'Inspect current contracts and customer terms that establish the firm obligation to the named client.', assertion: 'RIGHTS_OBLIGATIONS', mandatory: true },
        { title: 'Trace completeness', instructions: 'Trace a sequence of source service records forward into the current revenue ledger.', assertion: 'COMPLETENESS', mandatory: true },
        { title: 'Recalculate valuation', instructions: 'Recalculate the recorded invoice amount and compare it with the underlying signed order.', assertion: 'VALUATION', mandatory: true },
        { title: 'Test cutoff', instructions: 'Inspect transactions immediately before and after period end and verify service delivery dates.', assertion: 'CUTOFF', mandatory: true }
      ]
    } }
  }, samplingApproverHeaders);
  assert.equal(revenueTemplate.response.status, 200, JSON.stringify(revenueTemplate.body));
  assert.equal(revenueTemplate.body.result.procedureCount, 5);
  const revenueTemplateId = revenueTemplate.body.result.templateId as string;
  const approveRevenueTemplate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'workprogram.template.approve', payload: { templateId: revenueTemplateId, expectedVersion: 1 } }
  }, samplingApproverHeaders);
  assert.equal(approveRevenueTemplate.response.status, 200, JSON.stringify(approveRevenueTemplate.body));
  assert.equal(approveRevenueTemplate.body.result.status, 'APPROVED');
  const redWorkprogramPayload = { engagementId, fsliId: revenueLine.fsliId, planningVersionId: planningApproved.body.result.planningVersionId,
    templateId: revenueTemplateId, assignedStaffId: preparerStaff.body.result.staffMemberId };
  const associateRedProvision = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'workprogram.provision', payload: redWorkprogramPayload }
  }, technicalHeaders);
  assert.equal(associateRedProvision.response.status, 403, 'an Associate cannot be assigned to execute Red-risk work');
  assert.equal(associateRedProvision.body.code, 'PERSONA_ACTION_DENIED');
  const managerRedProvision = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'workprogram.provision', payload: { ...redWorkprogramPayload, assignedStaffId: staff.body.result.staffMemberId } }
  }, samplingReviewerHeaders);
  assert.equal(managerRedProvision.response.status, 200, JSON.stringify(managerRedProvision.body));
  assert.equal(managerRedProvision.body.result.procedureCount, 5);
  const revenueWorkprogramId = managerRedProvision.body.result.workprogramId as string;
  const revenueProcedureIds = managerRedProvision.body.result.procedureIds as string[];
  const revenueTemplateRevision = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'workprogram.template.create', payload: {
      fsliCode: 'REVENUE', title: 'Revenue assertions and cutoff — revised', standardsProfileId: planningApproved.body.result.standardsProfileId ?? fieldworkWorkspace.body.engagement.standardsProfileId,
      procedures: [
        { title: 'Revised vouch recorded revenue', instructions: 'Trace recorded invoices to signed delivery and customer acceptance evidence.', assertion: 'EXISTENCE', mandatory: true },
        { title: 'Confirm rights and obligations', instructions: 'Inspect customer contracts and terms.', assertion: 'RIGHTS_OBLIGATIONS', mandatory: true },
        { title: 'Trace completeness', instructions: 'Trace service records into the revenue ledger.', assertion: 'COMPLETENESS', mandatory: true },
        { title: 'Recalculate valuation', instructions: 'Recalculate invoice amounts from signed orders.', assertion: 'VALUATION', mandatory: true },
        { title: 'Test cutoff', instructions: 'Inspect transactions around period end.', assertion: 'CUTOFF', mandatory: true }
      ]
    } }
  }, samplingApproverHeaders);
  assert.equal(revenueTemplateRevision.response.status, 200, JSON.stringify(revenueTemplateRevision.body));
  assert.equal(revenueTemplateRevision.body.result.revision, 2);
  const approveRevenueTemplateRevision = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'workprogram.template.approve', payload: { templateId: revenueTemplateRevision.body.result.templateId, expectedVersion: 1 } }
  }, samplingApproverHeaders);
  assert.equal(approveRevenueTemplateRevision.response.status, 200, JSON.stringify(approveRevenueTemplateRevision.body));
  const activeWorkprogramTemplate = db.prepare('SELECT template_id FROM workprograms WHERE workspace_id=? AND id=?')
    .bind(workspaceId, revenueWorkprogramId).first<any>()?.template_id;
  assert.equal(activeWorkprogramTemplate, revenueTemplateId, 'approving a later template revision does not repoint an active workprogram');
  const copiedRevenueSteps = db.prepare('SELECT template_step_id,title FROM procedures WHERE workspace_id=? AND workprogram_id=? AND origin=\'STANDARD\' ORDER BY ordinal')
    .bind(workspaceId, revenueWorkprogramId).all<any>().results;
  assert.equal(copiedRevenueSteps.length, 5);
  assert.ok(copiedRevenueSteps.every((step: any) => step.template_step_id && step.title !== 'Revised vouch recorded revenue'),
    'the active procedure copies preserve their original template-step provenance and content');
  const partnerCannotClearAreaDuringExecution = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'partner.clear-area', payload: {
      workprogramId: revenueWorkprogramId, submissionId: crypto.randomUUID(), dependencyHash: 'a'.repeat(64),
      rationale: 'Attempt to clear a Red-risk workprogram before Manager review.'
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(partnerCannotClearAreaDuringExecution.response.status, 422);
  assert.equal(partnerCannotClearAreaDuringExecution.body.code, 'INVALID_STATE', 'Partner cannot clear fieldwork before Manager review');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM partner_area_clearances WHERE workspace_id=? AND workprogram_id=?')
    .bind(workspaceId, revenueWorkprogramId).first<any>()?.count, 0, 'a rejected early clearance creates no clearance record');
  const associateRedExecution = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.update', payload: {
      procedureId: revenueProcedureIds[0], expectedVersion: 1,
      workPerformed: 'The Associate attempted the required Red-risk execution.', conclusion: 'The screen persona cannot satisfy Manager-grade execution.'
    } }
  }, technicalHeaders);
  assert.equal(associateRedExecution.response.status, 403);
  assert.equal(associateRedExecution.body.code, 'PERSONA_ACTION_DENIED');
  const addAdHocProcedure = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.insert', payload: {
      workprogramId: revenueWorkprogramId, afterProcedureId: revenueProcedureIds[0], title: 'Investigate an unusual year-end credit note',
      instructions: 'Inspect the full source record and assess whether the credit note masks revenue cutoff or an undisclosed customer concession.',
      assertion: 'CUTOFF', scopeReason: 'Current-year analytics identified an unusual year-end credit requiring an engagement-specific procedure.'
    } }
  }, technicalHeaders);
  assert.equal(addAdHocProcedure.response.status, 200, JSON.stringify(addAdHocProcedure.body));
  const revenueWorkspaceAfterInsert = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/fieldwork-workspace`, { headers: technicalHeaders });
  const revenueProcedureRows = revenueWorkspaceAfterInsert.body.procedures.filter((row: any) => row.workprogramId === revenueWorkprogramId);
  assert.equal(revenueProcedureRows.length, 6, 'five copied standard steps coexist with one persistent ad-hoc procedure');
  assert.equal(revenueProcedureRows.filter((row: any) => row.origin === 'STANDARD').length, 5);
  assert.equal(revenueProcedureRows.filter((row: any) => row.origin === 'AD_HOC').length, 1);
  const shiftedRevenueProcedures = db.prepare(`SELECT id,version,ordinal,status FROM procedures WHERE workspace_id=? AND workprogram_id=? AND origin='STANDARD' AND ordinal>1 ORDER BY ordinal`)
    .bind(workspaceId,revenueWorkprogramId).all<any>().results;
  assert.equal(shiftedRevenueProcedures.length, 4);
  assert.ok(shiftedRevenueProcedures.every((row: any,index: number) => row.ordinal === index + 3 && row.version === 2 && row.status === 'NOT_STARTED'),
    `each shifted standard step advances its row version when the scope order changes: ${JSON.stringify(shiftedRevenueProcedures)}`);
  assert.ok(shiftedRevenueProcedures.every((row: any) => db.prepare(`SELECT COUNT(*) AS count FROM procedure_revisions WHERE workspace_id=? AND procedure_id=? AND row_version=2 AND reason=?`)
    .bind(workspaceId,row.id,'Current-year analytics identified an unusual year-end credit requiring an engagement-specific procedure.').first<any>()?.count === 1),
    'each shifted row retains an append-only revision with the scope-change rationale');
  assert.ok(shiftedRevenueProcedures.every((row: any) => db.prepare(`SELECT COUNT(*) AS count FROM fieldwork_change_feed WHERE workspace_id=? AND entity_type='Procedure' AND entity_id=? AND row_version=2`)
    .bind(workspaceId,row.id).first<any>()?.count === 1), 'each changed ordinal is available to other clients through the change feed');
  const blankProcedureSubmit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.submit', payload: { procedureId: revenueProcedureIds[0], expectedVersion: 1 } }
  }, samplingReviewerHeaders);
  assert.equal(blankProcedureSubmit.response.status, 422);
  assert.equal(blankProcedureSubmit.body.code, 'VALIDATION_FAILED');
  assert.deepEqual(blankProcedureSubmit.body.details.fields, ['workPerformed', 'conclusion'], 'validation identifies both missing required records');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM procedure_submissions WHERE workspace_id=? AND procedure_id=?')
    .bind(workspaceId, revenueProcedureIds[0]).first<any>()?.count, 0, 'blank work and conclusion cannot create a review submission');
  const blankGenericReviewSubmit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.submit', payload: {
      targetKind: 'PROCEDURE', targetId: revenueProcedureIds[1], targetVersion: 2
    } }
  }, samplingReviewerHeaders);
  assert.equal(blankGenericReviewSubmit.response.status, 422);
  assert.equal(blankGenericReviewSubmit.body.code, 'VALIDATION_FAILED');
  assert.deepEqual(blankGenericReviewSubmit.body.details.fields, ['workPerformed', 'conclusion'], 'generic review submission enforces the same required fields');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM procedure_submissions WHERE workspace_id=? AND procedure_id=?')
    .bind(workspaceId, revenueProcedureIds[1]).first<any>()?.count, 0, 'generic review route cannot create a blank procedure submission');

  const updateProcedure = (procedureId: string, expectedVersion: number, suffix: string) => post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.update', payload: {
      procedureId, expectedVersion, workPerformed: `Manager-grade procedure work ${suffix} was completed against the current retained source.`,
      conclusion: `The ${suffix} review conclusion retains its independent row version and source rationale.`
    } }
  }, samplingReviewerHeaders);
  const independentProcedureUpdates = await Promise.all([
    updateProcedure(revenueProcedureIds[0], 1, 'Sales'), updateProcedure(revenueProcedureIds[1], 2, 'PPE')
  ]);
  assert.deepEqual(independentProcedureUpdates.map(item => item.response.status), [200, 200], 'different procedure rows save concurrently');
  assert.deepEqual(independentProcedureUpdates.map(item => item.body.result.version), [2, 3]);
  const concurrentSameRow = await Promise.all([
    updateProcedure(revenueProcedureIds[0], 2, 'first concurrent writer'), updateProcedure(revenueProcedureIds[0], 2, 'second concurrent writer')
  ]);
  assert.equal(concurrentSameRow.filter(item => item.response.status === 200).length, 1, 'only one same-row writer commits');
  assert.equal(concurrentSameRow.filter(item => item.response.status === 409 && item.body.code === 'VERSION_CONFLICT').length, 1,
    'the competing same-row writer receives an explicit version conflict');
  const racedProcedure = db.prepare('SELECT version,work_performed FROM procedures WHERE workspace_id=? AND id=?')
    .bind(workspaceId, revenueProcedureIds[0]).first<any>();
  assert.equal(racedProcedure?.version, 3);
  assert.ok(['first concurrent writer', 'second concurrent writer'].some(name => String(racedProcedure?.work_performed).includes(name)));
  assert.deepEqual(db.prepare('SELECT row_version FROM procedure_revisions WHERE workspace_id=? AND procedure_id=? ORDER BY row_version')
    .bind(workspaceId, revenueProcedureIds[0]).all<any>().results.map((item: any) => item.row_version), [1, 2, 3],
    'the losing write creates no revision and cannot replace the winning content');

  const managerPreparerProfile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'actor-profile.assign', payload: {
      persona: 'PREPARER', staffMemberId: staff.body.result.staffMemberId
    } }
  }, approverHeaders);
  assert.equal(managerPreparerProfile.response.status, 200, JSON.stringify(managerPreparerProfile.body));
  const managerPreparerHeaders = { 'X-Test-Session-Profile': managerPreparerProfile.body.result.actorProfileId as string, };
  const redProcedureEvidenceLink = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.link', payload: {
      evidenceId: hybridEvidence.body.result.evidenceId, evidenceVersion: 1, targetVersion: 3, procedureId: revenueProcedureIds[0]
    } }
  }, managerPreparerHeaders);
  assert.equal(redProcedureEvidenceLink.response.status, 200, JSON.stringify(redProcedureEvidenceLink.body));
  const redProcedureVersionBeforeSubmit = Number(db.prepare('SELECT version FROM procedures WHERE workspace_id=? AND id=?')
    .bind(workspaceId, revenueProcedureIds[0]).first<any>()?.version);
  const redManagerSubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.submit', payload: {
      procedureId: revenueProcedureIds[0], expectedVersion: redProcedureVersionBeforeSubmit
    } }
  }, managerPreparerHeaders);
  assert.equal(redManagerSubmission.response.status, 200, JSON.stringify(redManagerSubmission.body));
  const redManagerSelfReview = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.decide', payload: {
      submissionId: redManagerSubmission.body.result.reviewSubmissionId, decision: 'ACCEPT',
      comment: 'Attempt cross-persona self-review of the Manager-executed Red-risk procedure.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(redManagerSelfReview.body.code, 'SELF_REVIEW_BLOCKED', 'natural-person separation persists across Manager PREPARER and REVIEWER personas');
  const independentRedProcedureAcceptance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.decide', payload: {
      submissionId: redManagerSubmission.body.result.reviewSubmissionId, decision: 'ACCEPT',
      comment: 'Independently accepted the Red-risk procedure after confirming Manager-grade execution and current adequate evidence.'
    } }
  }, samplingApproverHeaders);
  assert.equal(independentRedProcedureAcceptance.response.status, 200, JSON.stringify(independentRedProcedureAcceptance.body));

  const greenFsli = currentTbWorkspace.body.fsliCatalog.find((item: any) => item.code === 'OTHER_CURRENT_ASSETS');
  const greenTemplate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'workprogram.template.create', payload: {
      fsliCode: 'OTHER_CURRENT_ASSETS', title: 'Other current assets existence and valuation', standardsProfileId: fieldworkWorkspace.body.engagement.standardsProfileId,
      procedures: [{ title: 'Inspect other current asset support', instructions: 'Inspect the retained source and recalculate the other current asset amount.', assertion: 'VALUATION', mandatory: true }]
    } }
  }, samplingApproverHeaders);
  assert.equal(greenTemplate.response.status, 200, JSON.stringify(greenTemplate.body));
  const greenTemplateApproval = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'workprogram.template.approve', payload: { templateId: greenTemplate.body.result.templateId, expectedVersion: 1 } }
  }, samplingApproverHeaders);
  assert.equal(greenTemplateApproval.response.status, 200, JSON.stringify(greenTemplateApproval.body));
  const greenProgram = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'workprogram.provision', payload: {
      engagementId, fsliId: greenFsli.id, planningVersionId: planningApproved.body.result.planningVersionId,
      templateId: greenTemplate.body.result.templateId, assignedStaffId: preparerStaff.body.result.staffMemberId
    } }
  }, technicalHeaders);
  assert.equal(greenProgram.response.status, 200, JSON.stringify(greenProgram.body));
  const greenProcedureId = greenProgram.body.result.procedureIds[0] as string;
  const conditionalAdHoc = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.insert', payload: {
      workprogramId: greenProgram.body.result.workprogramId,
      title: 'Inspect foreign-currency valuation where applicable',
      instructions: 'Determine whether this account includes foreign-currency transactions and inspect the supporting rate evidence if present.',
      assertion: 'VALUATION', scopeReason: 'This step is conditional on the account containing foreign-currency activity; reviewer approval is required if absent.'
    } }
  }, technicalHeaders);
  assert.equal(conditionalAdHoc.response.status, 200, JSON.stringify(conditionalAdHoc.body));
  const requestNotApplicable = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.mark-not-applicable', payload: {
      procedureId: conditionalAdHoc.body.result.procedureId, expectedVersion: 1,
      reason: 'The retained general-ledger detail and account policy confirm this balance contains no foreign-currency activity.'
    } }
  }, technicalHeaders);
  assert.equal(requestNotApplicable.response.status, 200, JSON.stringify(requestNotApplicable.body));
  const notApplicablePending = db.prepare(`SELECT applicable,status,not_applicable_reason,version FROM procedures WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, conditionalAdHoc.body.result.procedureId).first<any>();
  assert.deepEqual({ applicable: notApplicablePending.applicable, status: notApplicablePending.status, version: notApplicablePending.version },
    { applicable: 0, status: 'SUBMITTED', version: 2 }, 'not-applicable status is submitted for independent review, not silently cleared');
  const approveNotApplicable = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.review', payload: {
      procedureId: conditionalAdHoc.body.result.procedureId, expectedVersion: 2, decision: 'NOT_APPLICABLE_APPROVED',
      comments: 'The reviewer verified the source details and approved this evidence-based not-applicable conclusion.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(approveNotApplicable.response.status, 200, JSON.stringify(approveNotApplicable.body));
  const reviewedNotApplicable = db.prepare(`SELECT applicable,status,version,not_applicable_reason FROM procedures WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, conditionalAdHoc.body.result.procedureId).first<any>();
  assert.deepEqual({ applicable: reviewedNotApplicable.applicable, status: reviewedNotApplicable.status, version: reviewedNotApplicable.version,
    reason: reviewedNotApplicable.not_applicable_reason }, { applicable: 0, status: 'REVIEWED', version: 3,
    reason: 'The retained general-ledger detail and account policy confirm this balance contains no foreign-currency activity.' });
  assert.equal(db.prepare(`SELECT decision FROM procedure_review_decisions WHERE workspace_id=? AND submission_id=?`)
    .bind(workspaceId, requestNotApplicable.body.result.submissionId).first<any>()?.decision, 'NOT_APPLICABLE_APPROVED');
  const insertionBeforeReviewedProcedure = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.insert', payload: {
      workprogramId: greenProgram.body.result.workprogramId, afterProcedureId: greenProcedureId,
      title: 'Additional current-asset scope step', instructions: 'Inspect any remaining support for this current-asset balance.', assertion: 'EXISTENCE',
      scopeReason: 'A current-year risk review identified an additional support requirement for this balance.'
    } }
  }, technicalHeaders);
  assert.equal(insertionBeforeReviewedProcedure.body.code, 'INVALID_STATE', 'scope insertion cannot silently shift a reviewed procedure');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM procedures WHERE workspace_id=? AND workprogram_id=?')
    .bind(workspaceId,greenProgram.body.result.workprogramId).first<any>()?.count, 2, 'rejected insertion leaves reviewed scope unchanged');
  assert.equal(db.prepare('SELECT version FROM procedures WHERE workspace_id=? AND id=?').bind(workspaceId,conditionalAdHoc.body.result.procedureId).first<any>()?.version, reviewedNotApplicable.version,
    'rejected insertion preserves the reviewed procedure version');
  const greenProcedureUpdate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.update', payload: {
      procedureId: greenProcedureId, expectedVersion: 1,
      workPerformed: 'Inspected the complete retained asset support and recalculated the carrying value.',
      conclusion: 'The sampled carrying value agrees to source support and remains appropriately presented.'
    } }
  }, technicalHeaders);
  assert.equal(greenProcedureUpdate.response.status, 200, JSON.stringify(greenProcedureUpdate.body));
  const greenEvidenceLink = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.link', payload: {
      evidenceId: hybridEvidence.body.result.evidenceId, evidenceVersion: 1, targetVersion: 2, procedureId: greenProcedureId
    } }
  }, technicalHeaders);
  assert.equal(greenEvidenceLink.response.status, 200, JSON.stringify(greenEvidenceLink.body));
  const greenProcedureSubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.submit', payload: { procedureId: greenProcedureId, expectedVersion: 3 } }
  }, technicalHeaders);
  assert.equal(greenProcedureSubmission.response.status, 200, JSON.stringify(greenProcedureSubmission.body));
  const rejectedEmptyProcedureReturn = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.decide', payload: {
      submissionId: greenProcedureSubmission.body.result.reviewSubmissionId, decision: 'RETURN', comment: '   ',
      assignedPreparerId: preparerStaff.body.result.staffMemberId
    } }
  }, samplingReviewerHeaders);
  assert.equal(rejectedEmptyProcedureReturn.response.status, 422);
  assert.equal(rejectedEmptyProcedureReturn.body.code, 'VALIDATION_FAILED', 'a return requires a substantive reviewer comment');
  const returnGreenProcedure = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.decide', payload: {
      submissionId: greenProcedureSubmission.body.result.reviewSubmissionId, decision: 'RETURN',
      comment: 'Clarify the source period and the recalculation basis before final review.',
      assignedPreparerId: preparerStaff.body.result.staffMemberId
    } }
  }, samplingReviewerHeaders);
  assert.equal(returnGreenProcedure.response.status, 200, JSON.stringify(returnGreenProcedure.body));
  assert.equal(returnGreenProcedure.body.result.status, 'UNDER_REWORK');
  const firstProcedureReviewNoteId = returnGreenProcedure.body.result.noteId as string;
  const unassignedReviewerCannotRespond = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.respond', payload: {
      noteId: firstProcedureReviewNoteId, responseText: 'This is not the preparer assigned to the returned step.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(unassignedReviewerCannotRespond.response.status, 403);
  assert.equal(unassignedReviewerCannotRespond.body.code, 'PERSONA_ACTION_DENIED');
  const firstProcedureNoteResponse = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.respond', payload: {
      noteId: firstProcedureReviewNoteId, responseText: 'I clarified the source period and recalculation basis in the revised work performed.'
    } }
  }, technicalHeaders);
  assert.equal(firstProcedureNoteResponse.response.status, 200, JSON.stringify(firstProcedureNoteResponse.body));
  assert.equal(firstProcedureNoteResponse.body.result.status, 'RESPONDED');
  const prematureProcedureNoteClose = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.close-note', payload: {
      noteId: firstProcedureReviewNoteId, resubmissionId: greenProcedureSubmission.body.result.reviewSubmissionId,
      closureReason: 'The note cannot close before an accepted later procedure submission.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(prematureProcedureNoteClose.body.code, 'GATE_BLOCKED');
  const greenReworkRevision = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.update', payload: {
      procedureId: greenProcedureId, expectedVersion: 5, reworkReason: 'Reviewer requested a more explicit period and recalculation reference.',
      workPerformed: 'Rechecked the current-period asset listing and independently recalculated the recorded amount.',
      conclusion: 'The current-period source supports the recorded amount and the revised conclusion.'
    } }
  }, technicalHeaders);
  assert.equal(greenReworkRevision.response.status, 200, JSON.stringify(greenReworkRevision.body));
  const staleProcedureApproval = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.review', payload: {
      procedureId: greenProcedureId, expectedVersion: 4, decision: 'ACCEPT', comments: 'Attempt to accept the obsolete submitted revision after its rework replacement.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(staleProcedureApproval.response.status, 409);
  assert.equal(staleProcedureApproval.body.code, 'STALE_DEPENDENCY', 'an obsolete submission cannot receive a current reviewed status');
  const currentGreenProcedure = db.prepare('SELECT status,version FROM procedures WHERE workspace_id=? AND id=?').bind(workspaceId, greenProcedureId).first<any>();
  assert.equal(currentGreenProcedure?.status, 'IN_PROGRESS', 'the explicit rework edit remains an editable new revision');
  assert.equal(currentGreenProcedure?.version, 6);

  // US-FLD-007..009 — sampling policies, committed source populations,
  // reproducible selections and conservative incomplete/evaluation outcomes.
  const createSamplingPopulation = async (name: string, originalName: string, csv: string, exclusionsReason?: string, fsliId = revenueLine.fsliId) => {
    const sourceFileId = await storeCommittedFile('EVIDENCE', originalName, 'text/csv', new TextEncoder().encode(csv), technicalHeaders, { clientId, engagementId });
    const created = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.population.create', payload: {
        engagementId, name, fsliId, sourceFileId, headerRow: 1, referenceColumn: 0, amountColumn: 1, descriptionColumn: 2,
        ...(exclusionsReason ? { exclusionsReason } : {})
      } }
    }, samplingReviewerHeaders);
    return { sourceFileId, created };
  };
  const createSamplingPolicy = async (method: 'MUS_BINOMIAL_PPS' | 'SYSTEMATIC' | 'STRATIFIED_ATTRIBUTE') => {
    const created = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.policy.create', payload: {
        name: `Approved ${method} test methodology`, method,
        assumptions: 'Use the documented source ordering and method-specific calculation assumptions for this synthetic audit test.'
      } }
    }, samplingReviewerHeaders);
    assert.equal(created.response.status, 200, JSON.stringify(created.body));
    const policyId = created.body.result.policyId as string;
    const reviewerCannotApprove = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.policy.approve', payload: {
        policyId, expectedVersion: 1, rationale: 'Only Partner-grade methodology approval permits this method for operational sampling.'
      } }
    }, samplingReviewerHeaders);
    assert.equal(reviewerCannotApprove.response.status, 403, 'sampling methodology requires Partner approval');
    const approved = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.policy.approve', payload: {
        policyId, expectedVersion: 1, rationale: 'Partner-approved synthetic methodology, with its assumptions and limits retained alongside each plan.'
      } }
    }, samplingApproverHeaders);
    assert.equal(approved.response.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.result.status, 'APPROVED');
    return policyId;
  };

  const negativePopulationSource = await createSamplingPopulation('Negative balance requires alternate work', 'sampling-negative.csv',
    'reference,amount,description\nPOS-001,100.00,Positive control balance\nNEG-001,-25.00,Negative credit balance\nZERO-001,0.00,Zero balance');
  assert.equal(negativePopulationSource.created.response.status, 422, JSON.stringify(negativePopulationSource.created.body));
  assert.equal(negativePopulationSource.created.body.code, 'INVALID_POPULATION');
  const alternateProcedureReason = 'Test nonpositive balances separately through documented understatement and completeness procedures.';
  const documentedNegativePopulation = await createSamplingPopulation('Nonpositive balances have alternate procedures documented', 'sampling-negative.csv',
    'reference,amount,description\nPOS-001,100.00,Positive control balance\nNEG-001,-25.00,Negative credit balance\nZERO-001,0.00,Zero balance',
    alternateProcedureReason);
  assert.equal(documentedNegativePopulation.created.response.status, 200, JSON.stringify(documentedNegativePopulation.created.body));
  assert.equal(documentedNegativePopulation.created.body.result.rowCount, 3);
  assert.equal(documentedNegativePopulation.created.body.result.positiveTotalMinor, '10000');
  assert.equal(documentedNegativePopulation.created.body.result.excludedCount, 2);
  const documentedPopulationId = documentedNegativePopulation.created.body.result.populationId as string;
  const documentedPopulationView = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-populations/${documentedPopulationId}`, { headers: technicalHeaders });
  assert.equal(documentedPopulationView.response.status, 200, JSON.stringify(documentedPopulationView.body));
  for (const excludedReference of ['NEG-001', 'ZERO-001']) {
    const excludedRow = documentedPopulationView.body.rows.find((row: any) => row.sourceRowKey === excludedReference);
    assert.equal(excludedRow.eligible, 0, `${excludedReference} is explicitly excluded from positive MUS eligibility`);
    assert.equal(excludedRow.exclusionReason, alternateProcedureReason, `${excludedReference} retains its documented alternate procedure`);
  }

  const musPopulationSource = await createSamplingPopulation('Single positive monetary unit sampling population', 'sampling-mus.csv',
    'reference,amount,description\nMUS-INV-001,1000000.00,Single positive invoice for repeat-hit validation');
  assert.equal(musPopulationSource.created.response.status, 200, JSON.stringify(musPopulationSource.created.body));
  assert.equal(musPopulationSource.created.body.result.positiveTotalMinor, '100000000');
  const musPopulationId = musPopulationSource.created.body.result.populationId as string;
  const musPolicyId = await createSamplingPolicy('MUS_BINOMIAL_PPS');
  const musPlanCommand = { type: 'sampling.plan', payload: {
    engagementId, populationId: musPopulationId, policyId: musPolicyId, method: 'MUS_BINOMIAL_PPS', confidenceBps: 9500,
    tolerableMinor: '5000000', expectedTaintedBps: 0,
    reason: 'Apply the approved conservative MUS policy to the exact positive source total and retain every seeded monetary-unit draw.'
  } };
  const musPlanCount = () => Number(db.prepare('SELECT COUNT(*) AS count FROM sampling_plans WHERE workspace_id=? AND population_id=?')
    .bind(workspaceId, musPopulationId).first<any>()?.count ?? 0);
  const initialMusPlanCount = musPlanCount();
  const rejectMusPlan = async (overrides: Record<string, unknown>, expectedCode: string) => {
    const rejected = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(),
      command: { ...musPlanCommand, payload: { ...musPlanCommand.payload, ...overrides } }
    }, samplingReviewerHeaders);
    assert.equal(rejected.response.status, 422, JSON.stringify(rejected.body));
    assert.equal(rejected.body.code, expectedCode);
    assert.equal(musPlanCount(), initialMusPlanCount, 'a rejected parameter set creates no sampling-plan revision');
  };
  await rejectMusPlan({ tolerableMinor: '0' }, 'INVALID_SAMPLE_PARAMETERS');
  await rejectMusPlan({ tolerableMinor: '100000000' }, 'INVALID_SAMPLE_PARAMETERS');
  await rejectMusPlan({ expectedTaintedBps: 500 }, 'INVALID_SAMPLE_PARAMETERS');
  await rejectMusPlan({ expectedTaintedBps: 501 }, 'INVALID_SAMPLE_PARAMETERS');
  await rejectMusPlan({ tolerableMinor: '1000' }, 'CALCULATION_DOMAIN_EXCEEDED');

  const musSeedBase = '0123456789abcdef'.repeat(4);
  let deterministicSeedOffset = 0n;
  (env as typeof env & { __testSamplingSeedFactory?: () => string }).__testSamplingSeedFactory = () =>
    (BigInt(`0x${musSeedBase}`) + deterministicSeedOffset++).toString(16).padStart(64, '0');
  const musPlanIdempotencyKey = crypto.randomUUID();
  const musPlan = await post(`/api/workspaces/${workspaceId}/commands`, { idempotencyKey: musPlanIdempotencyKey, command: musPlanCommand }, samplingReviewerHeaders);
  assert.equal(musPlan.response.status, 200, JSON.stringify(musPlan.body));
  assert.equal(musPlan.body.result.calculatedCount, 59, 'zero expected taint uses the smallest n satisfying the 95% MUS bound');
  assert.equal(musPlan.body.result.distinctRowCount, 1);
  const musRetry = await post(`/api/workspaces/${workspaceId}/commands`, { idempotencyKey: musPlanIdempotencyKey, command: musPlanCommand }, samplingReviewerHeaders);
  assert.equal(musRetry.response.status, 200, JSON.stringify(musRetry.body));
  assert.equal(musRetry.body.replayed, true, 'retry reuses the original persisted sample instead of drawing again');
  assert.equal(musRetry.body.result.planId, musPlan.body.result.planId);
  const musPlanPath = `/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-plans/${musPlan.body.result.planId}`;
  const musPlanView = await call(musPlanPath, { headers: technicalHeaders });
  assert.equal(musPlanView.response.status, 200, JSON.stringify(musPlanView.body));
  assert.equal(musPlanView.body.hits.length, 59);
  assert.equal(musPlanView.body.plan.seedHex, musSeedBase, 'the isolated test constructor supplied the deterministic seed');
  const musUnits = musPlanView.body.hits.map((hit: any) => Number(hit.monetaryUnitMinor));
  assert.deepEqual(musUnits, referenceMusUnits(musSeedBase, 59, 100000000), 'Node HMAC-SHA256 independently reproduces every persisted monetary-unit draw');
  assert.deepEqual(musUnits.slice(0, 10), [52678214, 70747834, 52798567, 79083303, 51862293, 59051886, 71110241, 95225569, 42383621, 85700774],
    'the fixed HMAC-SHA256 vector matches its checked reference values');
  assert.equal(new Set(musPlanView.body.hits.map((hit: any) => hit.populationRowId)).size, 1,
    'all 59 monetary draws remain visible even when they hit the same invoice');
  const musFirstTest = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.record-test', payload: {
      planId: musPlan.body.result.planId, populationRowId: musPlanView.body.hits[0].populationRowId, expectedVersion: 0, tested: true,
      auditedValueMinor: '100000000', misstated: false, conclusion: 'The full positive invoice amount agrees to its retained source document.',
      evidenceId: hybridEvidence.body.result.evidenceId, evidenceVersion: 1
    } }
  }, technicalHeaders);
  assert.equal(musFirstTest.response.status, 200, JSON.stringify(musFirstTest.body));
  let musPlanAfterTest = await call(musPlanPath, { headers: technicalHeaders });
  assert.equal(musPlanAfterTest.response.status, 200, JSON.stringify(musPlanAfterTest.body));
  const musZeroTaintEvaluation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.evaluate', payload: {
      planId: musPlan.body.result.planId, testSetHash: musPlanAfterTest.body.testSetHash
    } }
  }, samplingReviewerHeaders);
  assert.equal(musZeroTaintEvaluation.response.status, 200, JSON.stringify(musZeroTaintEvaluation.body));
  assert.equal(musZeroTaintEvaluation.body.result.testedHitCount, 59);
  assert.equal(musZeroTaintEvaluation.body.result.taintedHitCount, 0);
  assert.equal(musZeroTaintEvaluation.body.result.upperBoundMinor, '4950761', 'the one-sided 95% upper bound rounds upward to QAR 49,507.61');
  assert.equal(musZeroTaintEvaluation.body.result.result, 'WITHIN_TOLERANCE');
  const musMisstatementRevision = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.record-test', payload: {
      planId: musPlan.body.result.planId, populationRowId: musPlanView.body.hits[0].populationRowId, expectedVersion: 1, tested: true,
      auditedValueMinor: '100000000', misstated: true, conclusion: 'The test identifies a misstatement in the sampled positive invoice amount.',
      evidenceId: hybridEvidence.body.result.evidenceId, evidenceVersion: 1
    } }
  }, technicalHeaders);
  assert.equal(musMisstatementRevision.response.status, 200, JSON.stringify(musMisstatementRevision.body));
  musPlanAfterTest = await call(musPlanPath, { headers: technicalHeaders });
  const musRepeatedHitEvaluation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.evaluate', payload: {
      planId: musPlan.body.result.planId, testSetHash: musPlanAfterTest.body.testSetHash
    } }
  }, samplingReviewerHeaders);
  assert.equal(musRepeatedHitEvaluation.response.status, 200, JSON.stringify(musRepeatedHitEvaluation.body));
  assert.equal(musRepeatedHitEvaluation.body.result.taintedHitCount, 59, 'one misstatement across the invoice taints each of its repeated monetary-unit hits');
  assert.equal(musRepeatedHitEvaluation.body.result.upperBoundMinor, '100000000');
  assert.equal(musRepeatedHitEvaluation.body.result.result, 'EXCEEDS_TOLERANCE');

  const nonzeroExpectedTaintPlan = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { ...musPlanCommand, payload: {
      ...musPlanCommand.payload, expectedTaintedBps: 200,
      reason: 'Use a documented 2% expected tainted-book-value proportion for an independent exact-binomial sample-size check.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(nonzeroExpectedTaintPlan.response.status, 200, JSON.stringify(nonzeroExpectedTaintPlan.body));
  const nonzeroReferenceCount = referenceMusSampleCount(0.05, 0.02, 0.05);
  assert.equal(nonzeroReferenceCount, 93, 'independent recurrence reference fixes the nonzero expected-taint vector');
  assert.equal(nonzeroExpectedTaintPlan.body.result.calculatedCount, nonzeroReferenceCount,
    'the Worker chooses the smallest n with BinomialCDF(floor(n*pE),n,pT) <= alpha');
  const nonzeroExpectedTaintView = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-plans/${nonzeroExpectedTaintPlan.body.result.planId}`, { headers: technicalHeaders });
  assert.equal(nonzeroExpectedTaintView.response.status, 200, JSON.stringify(nonzeroExpectedTaintView.body));
  assert.deepEqual(nonzeroExpectedTaintView.body.plan.parameters.pE, {
    bps: 200, meaning: 'expected tainted-book-value proportion; not expected monetary error'
  });

  const musReroll = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { ...musPlanCommand, payload: {
      ...musPlanCommand.payload,
      reason: 'Create a separately reasoned reviewer reroll while preserving the original approved sample revision.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(musReroll.response.status, 200, JSON.stringify(musReroll.body));
  assert.notEqual(musReroll.body.result.planId, musPlan.body.result.planId);
  const musRerollView = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-plans/${musReroll.body.result.planId}`, { headers: technicalHeaders });
  assert.equal(musRerollView.response.status, 200, JSON.stringify(musRerollView.body));
  assert.equal(musRerollView.body.plan.revision, 3, 'each separately reasoned plan is a new append-only population revision');
  assert.notEqual(musRerollView.body.plan.seedHex, musPlanView.body.plan.seedHex, 'a reroll gets fresh seed material');
  const preservedOriginalMusPlan = await call(musPlanPath, { headers: technicalHeaders });
  assert.equal(preservedOriginalMusPlan.body.plan.revision, 1);
  assert.equal(preservedOriginalMusPlan.body.plan.seedHex, musSeedBase);
  assert.deepEqual(preservedOriginalMusPlan.body.hits.map((hit: any) => Number(hit.monetaryUnitMinor)), musUnits,
    'rerolling never overwrites the original persisted draw sequence');

  const multiRowMusCsv = ['reference,amount,description', ...Array.from({ length: 10 }, (_, index) =>
    `MUS-MULTI-${String(index + 1).padStart(2, '0')},100000.00,Equal positive invoice ${index + 1}`)].join('\n');
  const multiRowMusPopulation = await createSamplingPopulation('Ten-row positive MUS population', 'sampling-mus-multi.csv', multiRowMusCsv);
  assert.equal(multiRowMusPopulation.created.response.status, 200, JSON.stringify(multiRowMusPopulation.created.body));
  assert.equal(multiRowMusPopulation.created.body.result.positiveTotalMinor, '100000000');
  const multiRowMusPopulationId = multiRowMusPopulation.created.body.result.populationId as string;
  const multiRowMusPlan = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.plan', payload: {
      engagementId, populationId: multiRowMusPopulationId, policyId: musPolicyId, method: 'MUS_BINOMIAL_PPS', confidenceBps: 9500,
      tolerableMinor: '5000000', expectedTaintedBps: 0,
      reason: 'Use a seeded positive ten-row source to independently verify monetary-unit mapping and a nonzero taint bound.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(multiRowMusPlan.response.status, 200, JSON.stringify(multiRowMusPlan.body));
  const multiRowMusPlanPath = `/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-plans/${multiRowMusPlan.body.result.planId}`;
  const multiRowMusPlanView = await call(multiRowMusPlanPath, { headers: technicalHeaders });
  assert.equal(multiRowMusPlanView.response.status, 200, JSON.stringify(multiRowMusPlanView.body));
  const multiRowUnits = referenceMusUnits(multiRowMusPlanView.body.plan.seedHex, 59, 100000000);
  const rowsInOrdinalOrder = [...multiRowMusPlanView.body.rows].sort((left: any, right: any) => left.ordinal - right.ordinal);
  const referenceHitRowIds = multiRowUnits.map(unit => {
    let cumulativeMinor = 0;
    const selected = rowsInOrdinalOrder.find((row: any) => {
      cumulativeMinor += Number(row.bookValueMinor);
      return unit <= cumulativeMinor;
    });
    assert.ok(selected, `monetary unit ${unit} maps to exactly one positive source row`);
    return selected.id;
  });
  assert.deepEqual(multiRowMusPlanView.body.hits.map((hit: any) => hit.populationRowId), referenceHitRowIds,
    'the HMAC monetary units select rows by the cumulative positive-book-value intervals');
  const firstTaintedRowId = multiRowMusPlanView.body.hits[0].populationRowId;
  const intermediateTaintedDraws = multiRowMusPlanView.body.hits.filter((hit: any) => hit.populationRowId === firstTaintedRowId).length;
  assert.ok(intermediateTaintedDraws > 0 && intermediateTaintedDraws < 59,
    'the fixed reference seed produces an intermediate taint count for exact upper-bound validation');
  const testedPopulationRows = [...new Set<string>(multiRowMusPlanView.body.hits.map((hit: any) => hit.populationRowId))];
  for (const populationRowId of testedPopulationRows) {
    const populationRow = multiRowMusPlanView.body.rows.find((row: any) => row.id === populationRowId);
    const recordedTest = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.record-test', payload: {
        planId: multiRowMusPlan.body.result.planId, populationRowId, expectedVersion: 0, tested: true,
        auditedValueMinor: String(populationRow.bookValueMinor), misstated: populationRowId === firstTaintedRowId,
        conclusion: populationRowId === firstTaintedRowId
          ? 'Independent test identifies a misstatement in this positive invoice.'
          : 'Independent test confirms this positive invoice agrees to its retained support.',
        evidenceId: hybridEvidence.body.result.evidenceId, evidenceVersion: 1
      } }
    }, technicalHeaders);
    assert.equal(recordedTest.response.status, 200, JSON.stringify(recordedTest.body));
  }
  const multiRowMusAfterTests = await call(multiRowMusPlanPath, { headers: technicalHeaders });
  const intermediateMusEvaluation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.evaluate', payload: {
      planId: multiRowMusPlan.body.result.planId, testSetHash: multiRowMusAfterTests.body.testSetHash
    } }
  }, samplingReviewerHeaders);
  assert.equal(intermediateMusEvaluation.response.status, 200, JSON.stringify(intermediateMusEvaluation.body));
  const independentUpperBound = referenceUpperBoundMinor(intermediateTaintedDraws, 59, 0.05, 100000000);
  assert.equal(intermediateMusEvaluation.body.result.testedHitCount, 59);
  assert.equal(intermediateMusEvaluation.body.result.taintedHitCount, intermediateTaintedDraws);
  assert.equal(intermediateMusEvaluation.body.result.upperBoundMinor, String(independentUpperBound),
    'the one-sided exact upper confidence bound and conservative minor-unit ceiling match an independent bisection');
  assert.equal(intermediateMusEvaluation.body.result.result, 'EXCEEDS_TOLERANCE');

  const systematicCsv = ['reference,amount,description', ...Array.from({ length: 200 }, (_, index) =>
    `SYS-${String(index + 1).padStart(3, '0')},5000.00,Invoice ${index + 1}`)].join('\n');
  const systematicPopulationSource = await createSamplingPopulation('Stable 200 item systematic population', 'sampling-systematic.csv', systematicCsv);
  assert.equal(systematicPopulationSource.created.response.status, 200, JSON.stringify(systematicPopulationSource.created.body));
  const systematicPopulationId = systematicPopulationSource.created.body.result.populationId as string;
  const systematicPopulation = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-populations/${systematicPopulationId}`, { headers: technicalHeaders });
  assert.equal(systematicPopulation.response.status, 200, JSON.stringify(systematicPopulation.body));
  assert.equal(systematicPopulation.body.rows.length, 200);
  const systematicPolicyId = await createSamplingPolicy('SYSTEMATIC');
  const greenSamplePopulation = await createSamplingPopulation('Green procedure retained sample population', 'green-assets-sample.csv',
    'reference,amount,description\nASSET-001,1250.00,Retained current asset support selected for testing', undefined, greenFsli.id);
  assert.equal(greenSamplePopulation.created.response.status, 200, JSON.stringify(greenSamplePopulation.created.body));
  const greenSamplePlan = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.plan', payload: {
      engagementId, populationId: greenSamplePopulation.created.body.result.populationId, policyId: systematicPolicyId, procedureId: greenProcedureId,
      method: 'SYSTEMATIC', requestedCount: 1,
      sampleSizeRationale: 'Test the single retained asset item selected for this targeted workprogram procedure.',
      reason: 'Pin the exact current asset population, selection and reviewer-approved test result to this procedure.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(greenSamplePlan.response.status, 200, JSON.stringify(greenSamplePlan.body));
  assert.equal(greenSamplePlan.body.result.procedureId, greenProcedureId);
  const greenSamplePlanPath = `/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-plans/${greenSamplePlan.body.result.planId}`;
  const overlargeSystematic = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.plan', payload: {
      engagementId, populationId: systematicPopulationId, policyId: systematicPolicyId, method: 'SYSTEMATIC', requestedCount: 201,
      sampleSizeRationale: 'Attempt a count above the eligible source population to verify there is no silent cap.',
      reason: 'The invalid request must fail without creating a plan.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(overlargeSystematic.response.status, 422);
  assert.equal(overlargeSystematic.body.code, 'INVALID_SAMPLE_PARAMETERS');
  const systematicPlan = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.plan', payload: {
      engagementId, populationId: systematicPopulationId, policyId: systematicPolicyId, method: 'SYSTEMATIC', requestedCount: 10,
      sampleSizeRationale: 'Select ten items based on reviewer-assessed coverage across the source population; this count makes no confidence claim.',
      orderingRule: 'SOURCE_ROW_ASC', reason: 'Freeze source-row order and the seeded start for reproducible systematic testing.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(systematicPlan.response.status, 200, JSON.stringify(systematicPlan.body));
  assert.equal(systematicPlan.body.result.calculatedCount, 10);
  assert.equal(systematicPlan.body.result.selectionMode, 'SYSTEMATIC');
  assert.equal(systematicPlan.body.result.confidenceClaim, null);
  const systematicPlanPath = `/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-plans/${systematicPlan.body.result.planId}`;
  const systematicPlanView = await call(systematicPlanPath, { headers: technicalHeaders });
  const systematicStart = Number(systematicPlan.body.result.start.numerator);
  const systematicOrdinals = systematicPlanView.body.hits.map((hit: any) => hit.ordinal);
  assert.equal(new Set(systematicPlanView.body.hits.map((hit: any) => hit.populationRowId)).size, 10);
  assert.deepEqual(systematicOrdinals, Array.from({ length: 10 }, (_, index) => Math.floor((systematicStart + index * 200) / 10) + 1),
    'persisted hits follow exact integer-lattice positions from the stored random start');
  const systematicCensus = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.plan', payload: {
      engagementId, populationId: systematicPopulationId, policyId: systematicPolicyId, method: 'SYSTEMATIC', requestedCount: 200,
      sampleSizeRationale: 'Cover every eligible population item as an explicit census.',
      reason: 'The requested count equals the complete 200-item population.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(systematicCensus.response.status, 200, JSON.stringify(systematicCensus.body));
  assert.equal(systematicCensus.body.result.selectionMode, 'CENSUS');
  assert.equal(systematicCensus.body.result.calculatedCount, 200);
  assert.equal(systematicCensus.body.result.distinctRowCount, 200);
  assert.equal(systematicCensus.body.result.start.numerator, '0', 'a census has a canonical zero start and is not presented as a random draw');

  const knownStartCsv = ['reference,amount,description', ...Array.from({ length: 1000 }, (_, index) =>
    `START-${String(index + 1).padStart(4, '0')},5000.00,Unique invoice ${index + 1}`)].join('\n');
  const knownStartPopulation = await createSamplingPopulation('Known start systematic population', 'sampling-start-1000.csv', knownStartCsv);
  assert.equal(knownStartPopulation.created.response.status, 200, JSON.stringify(knownStartPopulation.created.body));
  const knownStartPopulationId = knownStartPopulation.created.body.result.populationId as string;
  const knownSystematicSeed = '0'.repeat(61) + '550';
  assert.equal(referenceMusUnits(knownSystematicSeed, 1, 1000)[0] - 1, 300, 'the independent HMAC reference seed yields offset u=R/n=6');
  let systematicSeedOffset = 0n;
  (env as typeof env & { __testSamplingSeedFactory?: () => string }).__testSamplingSeedFactory = () =>
    (BigInt(`0x${knownSystematicSeed}`) + systematicSeedOffset++).toString(16).padStart(64, '0');
  const knownStartPlan = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.plan', payload: {
      engagementId, populationId: knownStartPopulationId, policyId: systematicPolicyId, method: 'SYSTEMATIC', requestedCount: 50,
      sampleSizeRationale: 'Use a reviewer-selected 50-item coverage count with no statistical confidence claim.',
      orderingRule: 'SOURCE_ROW_ASC', reason: 'Validate the fixed source-order positions against an independent seeded start.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(knownStartPlan.response.status, 200, JSON.stringify(knownStartPlan.body));
  assert.deepEqual(knownStartPlan.body.result.start, { numerator: '300', denominator: '50' });
  assert.deepEqual(knownStartPlan.body.result.interval, { numerator: 1000, denominator: 50 });
  const knownStartPlanView = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-plans/${knownStartPlan.body.result.planId}`, { headers: technicalHeaders });
  const knownStartOrdinals = knownStartPlanView.body.hits.map((hit: any) => hit.ordinal);
  assert.deepEqual(knownStartOrdinals, Array.from({ length: 50 }, (_, index) => 7 + index * 20));
  assert.equal(new Set(knownStartPlanView.body.hits.map((hit: any) => hit.populationRowId)).size, 50);
  assert.equal(knownStartPlanView.body.plan.parameters.confidenceClaim, null);

  const periodicCsv = ['reference,amount,description', 'CYCLE-PREFIX,5000.00,Unique opening item', ...Array.from({ length: 12 }, (_, index) =>
    `CYCLE-${String(index + 1).padStart(2, '0')},5000.00,Class ${index % 3 + 1}`),
  'CYCLE-SUFFIX,5000.00,Unique closing item', 'CYCLE-NEGATIVE,-10.00,Alternate-procedure balance', 'CYCLE-ZERO,0.00,Alternate-procedure balance'].join('\n');
  const periodicPopulation = await createSamplingPopulation('Repeated source-order pattern', 'sampling-periodic.csv', periodicCsv,
    'Nonpositive balances are addressed through separate understatement and completeness procedures.');
  assert.equal(periodicPopulation.created.response.status, 200, JSON.stringify(periodicPopulation.created.body));
  const periodicPopulationId = periodicPopulation.created.body.result.populationId as string;
  const periodicPopulationView = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-populations/${periodicPopulationId}`, { headers: technicalHeaders });
  assert.deepEqual(periodicPopulationView.body.sourceOrderPeriodicityFlags, [{ field: 'DESCRIPTION', periodLength: 3, repeatedCycles: 4,
    eligibleOrderStart: 2, eligibleOrderEnd: 13 }]);
  const plansBeforeUnassessedPeriodicity = Number(db.prepare('SELECT COUNT(*) AS count FROM sampling_plans WHERE workspace_id=? AND population_id=?')
    .bind(workspaceId, periodicPopulationId).first<any>()?.count ?? 0);
  const unassessedPeriodicityPlan = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.plan', payload: {
      engagementId, populationId: periodicPopulationId, policyId: systematicPolicyId, method: 'SYSTEMATIC', requestedCount: 6,
      sampleSizeRationale: 'Select six items to exercise the reviewer-sized systematic method.',
      orderingRule: 'SERVER_SEEDED_SHUFFLE', reason: 'The original order must be assessed before a new frozen sample order is created.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(unassessedPeriodicityPlan.response.status, 422);
  assert.equal(unassessedPeriodicityPlan.body.code, 'INVALID_SAMPLE_PARAMETERS');
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM sampling_plans WHERE workspace_id=? AND population_id=?')
    .bind(workspaceId, periodicPopulationId).first<any>()?.count ?? 0), plansBeforeUnassessedPeriodicity,
  'unassessed periodic ordering does not persist a partial plan');
  const shuffledPeriodicityPlan = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.plan', payload: {
      engagementId, populationId: periodicPopulationId, policyId: systematicPolicyId, method: 'SYSTEMATIC', requestedCount: 6,
      sampleSizeRationale: 'Select six items to exercise the reviewer-sized systematic method.',
      periodicityAssessment: 'The original descriptions repeat every three rows. Apply the recorded unbiased shuffle before freezing the order.',
      orderingRule: 'SERVER_SEEDED_SHUFFLE', reason: 'Break the observed three-row pattern with a seeded Fisher–Yates order before sampling.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(shuffledPeriodicityPlan.response.status, 200, JSON.stringify(shuffledPeriodicityPlan.body));
  assert.equal(shuffledPeriodicityPlan.body.result.populationCount, 14, 'systematic N counts eligible ordered rows and excludes documented alternate-procedure rows');
  const shuffledPeriodicityView = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-plans/${shuffledPeriodicityPlan.body.result.planId}`, { headers: technicalHeaders });
  assert.equal(shuffledPeriodicityView.body.plan.parameters.orderingRule, 'SERVER_SEEDED_SHUFFLE');
  assert.equal(shuffledPeriodicityView.body.plan.parameters.orderingAlgorithm, 'FISHER_YATES_HMAC_SHA256_REJECTION_V1');
  assert.equal(shuffledPeriodicityView.body.plan.parameters.sourceOrderPeriodicityFlags[0].periodLength, 3);
  assert.equal(shuffledPeriodicityView.body.plan.parameters.periodicityAssessment,
    'The original descriptions repeat every three rows. Apply the recorded unbiased shuffle before freezing the order.');
  assert.match(shuffledPeriodicityView.body.plan.parameters.orderingHash, /^[a-f0-9]{64}$/);
  assert.equal(shuffledPeriodicityView.body.hits.length, 6);
  assert.equal(new Set(shuffledPeriodicityView.body.hits.map((hit: any) => hit.populationRowId)).size, 6);

  const stratifiedPolicyId = await createSamplingPolicy('STRATIFIED_ATTRIBUTE');
  const populationRowIds = systematicPopulation.body.rows.map((row: any) => row.id as string);
  const stratumAIds = populationRowIds.slice(0, 100);
  const stratumBIds = populationRowIds.slice(100, 200);
  const invalidCoverage = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.plan', payload: {
      engagementId, populationId: systematicPopulationId, policyId: stratifiedPolicyId, method: 'STRATIFIED_ATTRIBUTE', confidenceBps: 9500,
      strata: [
        { key: 'A', description: 'First half of the source population', populationRowIds: stratumAIds, expectedDeviationBps: 0, tolerableDeviationBps: 1000,
          rationale: 'The first half is retained as its own disjoint control stratum.' },
        { key: 'B', description: 'Second half with overlap error', populationRowIds: [...stratumBIds.slice(0, 99), stratumAIds[99]], expectedDeviationBps: 0, tolerableDeviationBps: 1000,
          rationale: 'An overlapping source row and omitted source row must be rejected.' }
      ], reason: 'This intentionally invalid coverage must not persist a partial plan.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(invalidCoverage.response.status, 422);
  assert.equal(invalidCoverage.body.code, 'INVALID_POPULATION');
  assert.ok(invalidCoverage.body.details.errors.some((error: string) => error.includes('overlapping')));
  assert.ok(invalidCoverage.body.details.errors.some((error: string) => error.includes('not assigned')));
  const stratifiedPlan = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.plan', payload: {
      engagementId, populationId: systematicPopulationId, policyId: stratifiedPolicyId, method: 'STRATIFIED_ATTRIBUTE', confidenceBps: 9500,
      strata: [
        { key: 'A', description: 'First 100 eligible source rows', populationRowIds: stratumAIds, expectedDeviationBps: 0, tolerableDeviationBps: 1000,
          rationale: 'Evaluate control deviations independently in the first source stratum.' },
        { key: 'B', description: 'Last 100 eligible source rows', populationRowIds: stratumBIds, expectedDeviationBps: 0, tolerableDeviationBps: 1000,
          rationale: 'Evaluate control deviations independently in the second source stratum.' }
      ], reason: 'Use joint 95% confidence with Bonferroni allocation across the two complete strata.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(stratifiedPlan.response.status, 200, JSON.stringify(stratifiedPlan.body));
  assert.equal(stratifiedPlan.body.result.calculatedCount, 56);
  assert.deepEqual(stratifiedPlan.body.result.strata.map((item: any) => item.sampleCount), [28, 28]);
  const stratifiedPlanPath = `/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-plans/${stratifiedPlan.body.result.planId}`;
  const stratifiedPlanView = await call(stratifiedPlanPath, { headers: technicalHeaders });
  assert.equal(stratifiedPlanView.body.plan.parameters.familywiseMethod, 'BONFERRONI');
  assert.equal(stratifiedPlanView.body.plan.parameters.selectionAlgorithm, 'HMAC_SHA256_REJECTION_PARTIAL_FISHER_YATES_V1');
  assert.deepEqual(stratifiedPlanView.body.plan.parameters.strata.map((item: any) => [item.alphaNumerator, item.alphaDenominator]),
    [['500', '20000'], ['500', '20000']], 'each stratum receives alpha 0.025 for the joint 95% policy');
  assert.deepEqual(stratifiedPlanView.body.plan.parameters.strata.map((item: any) => item.rationale), [
    'Evaluate control deviations independently in the first source stratum.',
    'Evaluate control deviations independently in the second source stratum.'
  ], 'the frozen plan retains each stratum rationale separately');
  assert.equal(stratifiedPlanView.body.hits.length, 56);
  assert.equal(new Set(stratifiedPlanView.body.hits.map((hit: any) => hit.populationRowId)).size, 56,
    'attribute selections are unique across disjoint strata');
  assert.deepEqual(stratifiedPlanView.body.strata.map((stratum: any) => stratum.sampleCount), [28, 28]);
  const stratumASelectedHits = stratifiedPlanView.body.hits.filter((hit: any) => hit.stratumKey === 'A');
  const stratumBFirstHit = stratifiedPlanView.body.hits.find((hit: any) => hit.stratumKey === 'B');
  for (const hit of [...stratumASelectedHits, stratumBFirstHit]) {
    const stratumKey = hit.stratumKey as string;
    const testResult = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.record-test', payload: {
        planId: stratifiedPlan.body.result.planId, populationRowId: hit.populationRowId, expectedVersion: 0, tested: true,
        deviation: false, conclusion: `The selected control item in stratum ${stratumKey} was inspected and no deviation was identified.`,
        evidenceId: hybridEvidence.body.result.evidenceId, evidenceVersion: 1
      } }
    }, technicalHeaders);
    assert.equal(testResult.response.status, 200, JSON.stringify(testResult.body));
  }
  const stratifiedPlanAfterTest = await call(stratifiedPlanPath, { headers: technicalHeaders });
  const incompleteStratifiedEvaluation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.evaluate', payload: {
      planId: stratifiedPlan.body.result.planId, testSetHash: stratifiedPlanAfterTest.body.testSetHash
    } }
  }, samplingReviewerHeaders);
  assert.equal(incompleteStratifiedEvaluation.response.status, 200, JSON.stringify(incompleteStratifiedEvaluation.body));
  assert.equal(incompleteStratifiedEvaluation.body.result.result, 'INCOMPLETE',
    'uncompleted selected items cannot be averaged into a passing attribute-sampling result');
  const stratumKeyById = new Map(stratifiedPlanView.body.strata.map((stratum: any) => [stratum.id, stratum.key]));
  const perStratumResults = new Map(incompleteStratifiedEvaluation.body.result.details.perStratum
    .map((item: any) => [stratumKeyById.get(item.stratumId), item.result]));
  assert.equal(perStratumResults.get('A'), 'WITHIN_TOLERANCE', 'the completely tested first stratum can be evaluated independently');
  assert.equal(perStratumResults.get('B'), 'INCOMPLETE', 'an incomplete second stratum keeps the overall result incomplete');
  const incompletePerStratum = incompleteStratifiedEvaluation.body.result.details.perStratum as Array<Record<string, any>>;
  assert.deepEqual(incompletePerStratum.map(item => [item.key, item.testedCount, item.selectedCount, item.populationCount]), [['A', 28, 28, 100], ['B', 1, 28, 100]],
    'the result reports tested item counts instead of treating selected items as completed tests');

  const remainingStratumBHits = stratifiedPlanView.body.hits.filter((hit: any) => hit.stratumKey === 'B').slice(1);
  for (const hit of remainingStratumBHits) {
    const completedTest = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.record-test', payload: {
        planId: stratifiedPlan.body.result.planId, populationRowId: hit.populationRowId, expectedVersion: 0, tested: true,
        deviation: false, conclusion: 'The selected control item was inspected and no deviation was identified.',
        evidenceId: hybridEvidence.body.result.evidenceId, evidenceVersion: 1
      } }
    }, technicalHeaders);
    assert.equal(completedTest.response.status, 200, JSON.stringify(completedTest.body));
  }
  const fullyTestedStratifiedPlan = await call(stratifiedPlanPath, { headers: technicalHeaders });
  const withinToleranceEvaluation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.evaluate', payload: {
      planId: stratifiedPlan.body.result.planId, testSetHash: fullyTestedStratifiedPlan.body.testSetHash
    } }
  }, samplingReviewerHeaders);
  assert.equal(withinToleranceEvaluation.response.status, 200, JSON.stringify(withinToleranceEvaluation.body));
  assert.equal(withinToleranceEvaluation.body.result.testedHitCount, 56);
  assert.equal(withinToleranceEvaluation.body.result.result, 'WITHIN_TOLERANCE');
  const cleanStratumResults = withinToleranceEvaluation.body.result.details.perStratum as Array<Record<string, any>>;
  assert.deepEqual(cleanStratumResults.map(item => [item.key, item.testedCount, item.upperDeviationRate.denominator]), [['A', 28, '100'], ['B', 28, '100']]);
  assert.ok(cleanStratumResults.every(item => Number(item.upperDeviationRate.numerator) <= 10),
    'the one-sided finite-population upper rate for each clean 28/100 stratum remains within the 10% tolerable rate');

  const firstStratumATest = fullyTestedStratifiedPlan.body.tests.find((item: any) => item.populationRowId === stratumASelectedHits[0].populationRowId);
  const highRiskDeviation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.record-test', payload: {
      planId: stratifiedPlan.body.result.planId, populationRowId: stratumASelectedHits[0].populationRowId, expectedVersion: firstStratumATest.version, tested: true,
      deviation: true, conclusion: 'A control deviation was identified and evaluated as an exception.',
      evidenceId: hybridEvidence.body.result.evidenceId, evidenceVersion: 1
    } }
  }, technicalHeaders);
  assert.equal(highRiskDeviation.response.status, 200, JSON.stringify(highRiskDeviation.body));
  const deviationPlanView = await call(stratifiedPlanPath, { headers: technicalHeaders });
  const failingStratumEvaluation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.evaluate', payload: {
      planId: stratifiedPlan.body.result.planId, testSetHash: deviationPlanView.body.testSetHash
    } }
  }, samplingReviewerHeaders);
  assert.equal(failingStratumEvaluation.response.status, 200, JSON.stringify(failingStratumEvaluation.body));
  assert.equal(failingStratumEvaluation.body.result.result, 'EXCEEDS_TOLERANCE',
    'a failing high-risk stratum cannot be averaged with another clean stratum');
  const failingStratumResults = failingStratumEvaluation.body.result.details.perStratum as Array<Record<string, any>>;
  assert.equal(failingStratumResults.find(item => item.key === 'A')?.result, 'EXCEEDS_TOLERANCE');
  assert.equal(failingStratumResults.find(item => item.key === 'B')?.result, 'WITHIN_TOLERANCE');

  const newFinding = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'finding.create', payload: {
      engagementId, fsliId: revenueLine.fsliId, title: 'Evidence-linked receivable exception',
      description: 'The independently inspected receivable support identifies a condition requiring audit follow-up.',
      severity: 'MODERATE', qualitativeSignificance: false
    } }
  }, technicalHeaders);
  assert.equal(newFinding.response.status, 200, JSON.stringify(newFinding.body));
  const findingEvidence = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.create', payload: {
      engagementId, mode: 'DIGITAL', title: 'Finding source document', fileVersionId: fileId
    } }
  }, technicalHeaders);
  assert.equal(findingEvidence.response.status, 200, JSON.stringify(findingEvidence.body));
  const findingEvidenceReview = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.review', payload: {
      evidenceId: findingEvidence.body.result.evidenceId, evidenceVersion: 1, status: 'ADEQUATE',
      rationale: 'The committed source file was independently checked against this finding.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(findingEvidenceReview.response.status, 200, JSON.stringify(findingEvidenceReview.body));
  const findingEvidenceLink = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.link', payload: {
      evidenceId: findingEvidence.body.result.evidenceId, evidenceVersion: 1, targetVersion: 1,
      findingId: newFinding.body.result.findingId
    } }
  }, technicalHeaders);
  assert.equal(findingEvidenceLink.response.status, 200, JSON.stringify(findingEvidenceLink.body));
  const findingLinkProjection = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/fieldwork-workspace`, { headers: technicalHeaders });
  const findingLink = findingLinkProjection.body.evidenceLinks.find((item: any) => item.id === findingEvidenceLink.body.result.linkId);
  assert.equal(findingLink.targetType, 'FINDING');
  assert.equal(findingLink.targetId, newFinding.body.result.findingId);
  const findingUnlink = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.unlink', payload: {
      evidenceLinkId: findingEvidenceLink.body.result.linkId, reason: 'The finding was reassigned to a replacement source document.'
    } }
  }, technicalHeaders);
  assert.equal(findingUnlink.response.status, 200, JSON.stringify(findingUnlink.body));
  const findingHistoryProjection = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/fieldwork-workspace`, { headers: technicalHeaders });
  const retainedFindingLink = findingHistoryProjection.body.evidenceLinks.find((item: any) => item.id === findingEvidenceLink.body.result.linkId);
  assert.equal(retainedFindingLink.unlinkReason, 'The finding was reassigned to a replacement source document.');
  assert.ok(retainedFindingLink.unlinkActorId);
  assert.ok(retainedFindingLink.unlinkedAt);
  const clientEvidenceCatalog = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/fieldwork-workspace`, { headers: clientHeaders });
  assert.equal(clientEvidenceCatalog.response.status, 403, 'CLIENT persona cannot read the internal evidence catalog');

  const replacementHybridEvidence = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.create', payload: {
      engagementId, mode: 'HYBRID', title: 'Revenue source inspection record, replacement', fileVersionId: fileId,
      physicalIndex: 'REV-01', physicalDescription: 'Replacement signed sales-register extract inspected at the client site.',
      binder: 'Revenue binder A', box: '3', shelf: 'B', supersedesEvidenceId: hybridEvidence.body.result.evidenceId
    } }
  }, technicalHeaders);
  assert.equal(replacementHybridEvidence.response.status, 200, JSON.stringify(replacementHybridEvidence.body));
  assert.equal(replacementHybridEvidence.body.result.version, 2);
  assert.equal(replacementHybridEvidence.body.result.supersedesEvidenceId, hybridEvidence.body.result.evidenceId);
  const staleEvidenceSubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.submit', payload: { procedureId: greenProcedureId, expectedVersion: 6 } }
  }, technicalHeaders);
  assert.equal(staleEvidenceSubmission.response.status, 409, JSON.stringify(staleEvidenceSubmission.body));
  assert.equal(staleEvidenceSubmission.body.code, 'STALE_DEPENDENCY',
    'replacing a linked evidence family blocks procedure clearance until its pin is refreshed');
  const staleEvidenceReview = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.review', payload: {
      evidenceId: hybridEvidence.body.result.evidenceId, evidenceVersion: 1, status: 'ADEQUATE',
      rationale: 'Attempt to reuse the adequacy conclusion from the superseded evidence version.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(staleEvidenceReview.response.status, 409, JSON.stringify(staleEvidenceReview.body));
  assert.equal(staleEvidenceReview.body.code, 'STALE_DEPENDENCY');
  const replacementEvidenceReview = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.review', payload: {
      evidenceId: replacementHybridEvidence.body.result.evidenceId, evidenceVersion: 2, status: 'ADEQUATE',
      rationale: 'The replacement bytes and physical locator were independently inspected.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(replacementEvidenceReview.response.status, 200, JSON.stringify(replacementEvidenceReview.body));
  const refreshedProcedureEvidenceLink = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.link', payload: {
      evidenceId: replacementHybridEvidence.body.result.evidenceId, evidenceVersion: 2, targetVersion: 6, procedureId: greenProcedureId
    } }
  }, technicalHeaders);
  assert.equal(refreshedProcedureEvidenceLink.response.status, 200, JSON.stringify(refreshedProcedureEvidenceLink.body));
  const greenSampleEvidenceFile = await storeCommittedFile('EVIDENCE', 'green-asset-sample-support.pdf', 'application/pdf', replacementBytes, technicalHeaders, { clientId, engagementId });
  const greenSampleEvidence = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.create', payload: {
      engagementId, mode: 'HYBRID', title: 'Current asset sample retained support', fileVersionId: greenSampleEvidenceFile,
      physicalIndex: 'ASSET-001', physicalDescription: 'Retained invoice and ownership record inspected for the selected asset.',
      binder: 'Assets binder A', box: '2', shelf: 'A'
    } }
  }, technicalHeaders);
  assert.equal(greenSampleEvidence.response.status, 200, JSON.stringify(greenSampleEvidence.body));
  const greenSampleEvidenceReview = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.review', payload: {
      evidenceId: greenSampleEvidence.body.result.evidenceId, evidenceVersion: 1, status: 'ADEQUATE',
      rationale: 'The committed invoice and physical ownership record agree to the selected asset sample.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(greenSampleEvidenceReview.response.status, 200, JSON.stringify(greenSampleEvidenceReview.body));
  const incompleteGreenSamplePlan = await call(greenSamplePlanPath, { headers: technicalHeaders });
  assert.equal(incompleteGreenSamplePlan.response.status, 200, JSON.stringify(incompleteGreenSamplePlan.body));
  const greenSamplePopulationRowId = incompleteGreenSamplePlan.body.hits[0].populationRowId as string;
  const greenProcedureVersionBeforeSampleGate = Number(db.prepare('SELECT version FROM procedures WHERE workspace_id=? AND id=?')
    .bind(workspaceId, greenProcedureId).first<any>()?.version);
  const procedureSubmitWithUntestedSample = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.submit', payload: {
      procedureId: greenProcedureId, expectedVersion: greenProcedureVersionBeforeSampleGate
    } }
  }, technicalHeaders);
  assert.equal(procedureSubmitWithUntestedSample.body.code, 'GATE_BLOCKED', 'a linked plan with selected but untested work cannot be submitted');
  const completedGreenSampleTest = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.record-test', payload: {
      planId: greenSamplePlan.body.result.planId, populationRowId: greenSamplePopulationRowId, expectedVersion: 0, tested: true,
      deviation: false, conclusion: 'The selected asset amount agrees to its retained invoice and ownership record.',
      evidenceId: greenSampleEvidence.body.result.evidenceId, evidenceVersion: 1
    } }
  }, technicalHeaders);
  assert.equal(completedGreenSampleTest.response.status, 200, JSON.stringify(completedGreenSampleTest.body));
  const completedGreenSamplePlan = await call(greenSamplePlanPath, { headers: technicalHeaders });
  const greenSampleEvaluation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.evaluate', payload: {
      planId: greenSamplePlan.body.result.planId, testSetHash: completedGreenSamplePlan.body.testSetHash
    } }
  }, samplingReviewerHeaders);
  assert.equal(greenSampleEvaluation.response.status, 200, JSON.stringify(greenSampleEvaluation.body));
  const reassessedProcedureSubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.submit', payload: {
      procedureId: greenProcedureId, expectedVersion: greenProcedureVersionBeforeSampleGate
    } }
  }, technicalHeaders);
  assert.equal(reassessedProcedureSubmission.response.status, 200, JSON.stringify(reassessedProcedureSubmission.body));
  const refreshedEvidenceLinks = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/fieldwork-workspace`, { headers: technicalHeaders });
  assert.ok(refreshedEvidenceLinks.body.evidenceLinks.some((item: any) => item.evidenceId === hybridEvidence.body.result.evidenceId && item.unlinkReason));
  assert.ok(refreshedEvidenceLinks.body.evidenceLinks.some((item: any) => item.evidenceId === replacementHybridEvidence.body.result.evidenceId && !item.unlinkReason));
  const replacementEvidencePinV2 = refreshedEvidenceLinks.body.evidenceLinks.find((item: any) => item.evidenceId === replacementHybridEvidence.body.result.evidenceId && !item.unlinkReason);
  assert.ok(replacementEvidencePinV2?.id, 'the current replacement pin is available for an append-only stale-pin unlink');

  const replacementEvidenceFileV3 = await storeCommittedFile('EVIDENCE', 'replacement-invoice-evidence-v3.pdf', 'application/pdf', replacementBytes, technicalHeaders, { clientId, engagementId });
  const replacementHybridEvidenceV3 = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.create', payload: {
      engagementId, mode: 'HYBRID', title: 'Revenue source inspection record, independently reassessed replacement', fileVersionId: replacementEvidenceFileV3,
      physicalIndex: 'REV-01', physicalDescription: 'Corrected signed sales-register extract inspected at the client site.',
      binder: 'Revenue binder A', box: '3', shelf: 'B', supersedesEvidenceId: replacementHybridEvidence.body.result.evidenceId
    } }
  }, technicalHeaders);
  assert.equal(replacementHybridEvidenceV3.response.status, 200, JSON.stringify(replacementHybridEvidenceV3.body));
  assert.equal(replacementHybridEvidenceV3.body.result.version, 3);
  const replacementEvidenceReviewV3 = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.review', payload: {
      evidenceId: replacementHybridEvidenceV3.body.result.evidenceId, evidenceVersion: 3, status: 'ADEQUATE',
      rationale: 'The corrected committed bytes and physical source were independently inspected.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(replacementEvidenceReviewV3.response.status, 200, JSON.stringify(replacementEvidenceReviewV3.body));
  const staleReplacementProcedureAcceptance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.review', payload: {
      procedureId: greenProcedureId, expectedVersion: 8, decision: 'ACCEPT', comments: 'Attempt to accept the submission after its exact evidence was superseded.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(staleReplacementProcedureAcceptance.response.status, 409);
  assert.equal(staleReplacementProcedureAcceptance.body.code, 'STALE_DEPENDENCY',
    'new evidence bytes invalidate the pending procedure conclusion until the reviewer returns it for reassessment');
  const returnStaleEvidenceProcedure = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.review', payload: {
      procedureId: greenProcedureId, expectedVersion: 8, decision: 'REWORK', comments: 'Reassess the procedure against the corrected evidence version.',
      assignedPreparerId: preparerStaff.body.result.staffMemberId
    } }
  }, samplingReviewerHeaders);
  assert.equal(returnStaleEvidenceProcedure.response.status, 200, JSON.stringify(returnStaleEvidenceProcedure.body));
  assert.equal(returnStaleEvidenceProcedure.body.result.status, 'UNDER_REWORK');
  const secondProcedureReviewNoteId = returnStaleEvidenceProcedure.body.result.noteId as string;
  const secondProcedureNoteResponse = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.respond', payload: {
      noteId: secondProcedureReviewNoteId, responseText: 'I replaced the superseded source and refreshed both procedure and sample evidence pins.'
    } }
  }, technicalHeaders);
  assert.equal(secondProcedureNoteResponse.response.status, 200, JSON.stringify(secondProcedureNoteResponse.body));
  const unlinkStaleEvidencePin = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.unlink', payload: {
      evidenceLinkId: replacementEvidencePinV2.id, reason: 'The linked evidence was superseded; reassessment will use the corrected third version.'
    } }
  }, technicalHeaders);
  assert.equal(unlinkStaleEvidencePin.response.status, 200, JSON.stringify(unlinkStaleEvidencePin.body));
  const revisedProcedureForEvidenceV3 = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.update', payload: {
      procedureId: greenProcedureId, expectedVersion: 10, reworkReason: 'The evidence family advanced to its corrected third version.',
      workPerformed: 'Inspected the corrected source record and recalculated the relevant current-period amount against the ledger.',
      conclusion: 'The corrected current-period source supports the recorded amount and the revised audit conclusion.'
    } }
  }, technicalHeaders);
  assert.equal(revisedProcedureForEvidenceV3.response.status, 200, JSON.stringify(revisedProcedureForEvidenceV3.body));
  const refreshedProcedureEvidenceLinkV3 = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.link', payload: {
      evidenceId: replacementHybridEvidenceV3.body.result.evidenceId, evidenceVersion: 3, targetVersion: 11, procedureId: greenProcedureId
    } }
  }, technicalHeaders);
  assert.equal(refreshedProcedureEvidenceLinkV3.response.status, 200, JSON.stringify(refreshedProcedureEvidenceLinkV3.body));
  const greenSamplePlanAfterEvidenceSupersession = await call(greenSamplePlanPath, { headers: technicalHeaders });
  const greenSampleTestAfterEvidenceSupersession = greenSamplePlanAfterEvidenceSupersession.body.tests.find((test: any) => test.populationRowId === greenSamplePopulationRowId);
  assert.ok(greenSampleTestAfterEvidenceSupersession, 'the sample test remains visible for exact evidence reassessment');
  const reassessedGreenSampleTest = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.record-test', payload: {
      planId: greenSamplePlan.body.result.planId, populationRowId: greenSamplePopulationRowId,
      expectedVersion: greenSampleTestAfterEvidenceSupersession.version, tested: true,
      deviation: false, conclusion: 'The selected asset amount agrees to its retained invoice and ownership record after source refresh.',
      evidenceId: greenSampleEvidence.body.result.evidenceId, evidenceVersion: 1
    } }
  }, technicalHeaders);
  assert.equal(reassessedGreenSampleTest.response.status, 200, JSON.stringify(reassessedGreenSampleTest.body));
  const reassessedGreenSamplePlan = await call(greenSamplePlanPath, { headers: technicalHeaders });
  const reassessedGreenSampleEvaluation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.evaluate', payload: {
      planId: greenSamplePlan.body.result.planId, testSetHash: reassessedGreenSamplePlan.body.testSetHash
    } }
  }, samplingReviewerHeaders);
  assert.equal(reassessedGreenSampleEvaluation.response.status, 200, JSON.stringify(reassessedGreenSampleEvaluation.body));
  const reassessedProcedureSubmissionV3 = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.submit', payload: { procedureId: greenProcedureId, expectedVersion: 12 } }
  }, technicalHeaders);
  assert.equal(reassessedProcedureSubmissionV3.response.status, 200, JSON.stringify(reassessedProcedureSubmissionV3.body));
  const reassessedProcedureAcceptanceV3 = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.review', payload: {
      procedureId: greenProcedureId, expectedVersion: 13, decision: 'ACCEPT', comments: 'Accepted after independent reassessment of the corrected evidence.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(reassessedProcedureAcceptanceV3.response.status, 200, JSON.stringify(reassessedProcedureAcceptanceV3.body));
  assert.equal(reassessedProcedureAcceptanceV3.body.result.status, 'REVIEWED');

  const greenWorkprogramId = String(db.prepare('SELECT workprogram_id FROM procedures WHERE workspace_id=? AND id=?')
    .bind(workspaceId, greenProcedureId).first<any>()?.workprogram_id);
  for (const noteId of [firstProcedureReviewNoteId, secondProcedureReviewNoteId]) {
    const closedProcedureNote = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'review.close-note', payload: {
        noteId, resubmissionId: reassessedProcedureAcceptanceV3.body.result.reviewSubmissionId,
        closureReason: 'The exact later procedure revision was independently accepted after the assigned preparer response.'
      } }
    }, samplingReviewerHeaders);
    assert.equal(closedProcedureNote.response.status, 200, JSON.stringify(closedProcedureNote.body));
    assert.equal(closedProcedureNote.body.result.status, 'CLOSED');
  }

  const firstGreenWorkprogramSubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.submit', payload: {
      targetKind: 'WORKPROGRAM', targetId: greenWorkprogramId,
      targetVersion: Number(db.prepare('SELECT version FROM workprograms WHERE workspace_id=? AND id=?').bind(workspaceId, greenWorkprogramId).first<any>()?.version)
    } }
  }, technicalHeaders);
  assert.equal(firstGreenWorkprogramSubmission.response.status, 200, JSON.stringify(firstGreenWorkprogramSubmission.body));
  const firstGreenWorkprogramSnapshot = db.prepare('SELECT snapshot_json FROM review_submissions WHERE workspace_id=? AND id=?')
    .bind(workspaceId, firstGreenWorkprogramSubmission.body.result.submissionId).first<any>();
  const firstGreenWorkprogramContent = JSON.parse(firstGreenWorkprogramSnapshot.snapshot_json);
  assert.equal(firstGreenWorkprogramContent.procedures[0].instructions, 'Inspect the retained source and recalculate the other current asset amount.');
  assert.equal(firstGreenWorkprogramContent.procedures[0].workPerformed, 'Inspected the corrected source record and recalculated the relevant current-period amount against the ledger.');
  assert.equal(firstGreenWorkprogramContent.procedures[0].conclusion, 'The corrected current-period source supports the recorded amount and the revised audit conclusion.');
  assert.equal(firstGreenWorkprogramContent.procedures[0].samplingPins.length, 1, 'the immutable workprogram snapshot includes exact completed sample pins');
  const returnedGreenWorkprogram = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.decide', payload: {
      submissionId: firstGreenWorkprogramSubmission.body.result.submissionId, decision: 'RETURN',
      comment: 'Clarify the final asset reconciliation and retain the refreshed sample reference in the procedure conclusion.',
      assignedPreparerId: preparerStaff.body.result.staffMemberId, procedureIds: [greenProcedureId]
    } }
  }, samplingReviewerHeaders);
  assert.equal(returnedGreenWorkprogram.response.status, 200, JSON.stringify(returnedGreenWorkprogram.body));
  assert.equal(returnedGreenWorkprogram.body.result.status, 'UNDER_REWORK');
  const greenWorkprogramNoteId = returnedGreenWorkprogram.body.result.noteIds[0] as string;
  const returnedGreenProcedure = db.prepare('SELECT version,status FROM procedures WHERE workspace_id=? AND id=?').bind(workspaceId, greenProcedureId).first<any>();
  assert.equal(returnedGreenProcedure.status, 'UNDER_REWORK');
  const activeGreenProcedureEvidencePin = db.prepare(`SELECT el.id FROM evidence_links el LEFT JOIN evidence_unlinks eu ON eu.workspace_id=el.workspace_id AND eu.evidence_link_id=el.id
      WHERE el.workspace_id=? AND el.procedure_id=? AND el.evidence_id=? AND el.evidence_version=3 AND eu.id IS NULL LIMIT 1`)
    .bind(workspaceId, greenProcedureId, replacementHybridEvidenceV3.body.result.evidenceId).first<any>();
  assert.ok(activeGreenProcedureEvidencePin?.id, 'the returned procedure retains its exact current evidence pin until rework');
  const unlinkGreenProcedureEvidence = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.unlink', payload: {
      evidenceLinkId: activeGreenProcedureEvidencePin.id, reason: 'The assigned preparer will refresh the evidence pin to the revised procedure version.'
    } }
  }, technicalHeaders);
  assert.equal(unlinkGreenProcedureEvidence.response.status, 200, JSON.stringify(unlinkGreenProcedureEvidence.body));
  const greenProcedureAfterUnlink = Number(db.prepare('SELECT version FROM procedures WHERE workspace_id=? AND id=?').bind(workspaceId, greenProcedureId).first<any>()?.version);
  const revisedGreenProcedure = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.update', payload: {
      procedureId: greenProcedureId, expectedVersion: greenProcedureAfterUnlink,
      reworkReason: 'The Manager requested a clearer cross-reference to the retained sample and reconciliation.',
      workPerformed: 'Reconciled the corrected asset schedule, inspected the retained invoice and ownership record, and documented the selected sample.',
      conclusion: 'The corrected asset balance is supported by the source and the completed sample test.'
    } }
  }, technicalHeaders);
  assert.equal(revisedGreenProcedure.response.status, 200, JSON.stringify(revisedGreenProcedure.body));
  const greenProcedureBeforeRelink = Number(db.prepare('SELECT version FROM procedures WHERE workspace_id=? AND id=?').bind(workspaceId, greenProcedureId).first<any>()?.version);
  const relinkGreenProcedureEvidence = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.link', payload: {
      evidenceId: replacementHybridEvidenceV3.body.result.evidenceId, evidenceVersion: 3,
      targetVersion: greenProcedureBeforeRelink, procedureId: greenProcedureId
    } }
  }, technicalHeaders);
  assert.equal(relinkGreenProcedureEvidence.response.status, 200, JSON.stringify(relinkGreenProcedureEvidence.body));
  const greenProcedureBeforeResubmission = Number(db.prepare('SELECT version FROM procedures WHERE workspace_id=? AND id=?').bind(workspaceId, greenProcedureId).first<any>()?.version);
  const returnedGreenProcedureSubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.submit', payload: {
      procedureId: greenProcedureId, expectedVersion: greenProcedureBeforeResubmission
    } }
  }, technicalHeaders);
  assert.equal(returnedGreenProcedureSubmission.response.status, 200, JSON.stringify(returnedGreenProcedureSubmission.body));
  const acceptReturnedGreenProcedure = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.decide', payload: {
      submissionId: returnedGreenProcedureSubmission.body.result.reviewSubmissionId, decision: 'ACCEPT',
      comment: 'The revised asset reconciliation and current sample evidence are complete.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(acceptReturnedGreenProcedure.response.status, 200, JSON.stringify(acceptReturnedGreenProcedure.body));
  const workprogramResubmitStillBlockedByOpenNote = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.submit', payload: {
      targetKind: 'WORKPROGRAM', targetId: greenWorkprogramId,
      targetVersion: Number(db.prepare('SELECT version FROM workprograms WHERE workspace_id=? AND id=?').bind(workspaceId, greenWorkprogramId).first<any>()?.version)
    } }
  }, technicalHeaders);
  assert.equal(workprogramResubmitStillBlockedByOpenNote.body.code, 'GATE_BLOCKED', 'an OPEN return note blocks workprogram resubmission after all affected procedures are reviewed');
  const greenWorkprogramNoteResponse = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.respond', payload: {
      noteId: greenWorkprogramNoteId, responseText: 'I updated the affected procedure, re-linked the current source and confirmed the sample reference.'
    } }
  }, technicalHeaders);
  assert.equal(greenWorkprogramNoteResponse.response.status, 200, JSON.stringify(greenWorkprogramNoteResponse.body));
  const greenWorkprogramResubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.submit', payload: {
      targetKind: 'WORKPROGRAM', targetId: greenWorkprogramId,
      targetVersion: Number(db.prepare('SELECT version FROM workprograms WHERE workspace_id=? AND id=?').bind(workspaceId, greenWorkprogramId).first<any>()?.version)
    } }
  }, technicalHeaders);
  assert.equal(greenWorkprogramResubmission.response.status, 200, JSON.stringify(greenWorkprogramResubmission.body));
  const prematureWorkprogramNoteClose = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.close-note', payload: {
      noteId: greenWorkprogramNoteId, resubmissionId: greenWorkprogramResubmission.body.result.submissionId,
      closureReason: 'This submission must be accepted before the reviewer closes the note.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(prematureWorkprogramNoteClose.body.code, 'GATE_BLOCKED', 'a responded note remains open until independent acceptance of the later exact workprogram');
  const acceptGreenWorkprogramResubmission = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.decide', payload: {
      submissionId: greenWorkprogramResubmission.body.result.submissionId, decision: 'ACCEPT',
      comment: 'The revised procedure and workprogram evidence are current and independently accepted.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(acceptGreenWorkprogramResubmission.response.status, 200, JSON.stringify(acceptGreenWorkprogramResubmission.body));
  const preparerCannotCloseWorkprogramNote = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.close-note', payload: {
      noteId: greenWorkprogramNoteId, resubmissionId: greenWorkprogramResubmission.body.result.submissionId,
      closureReason: 'The assigned preparer cannot perform independent closure.'
    } }
  }, technicalHeaders);
  assert.equal(preparerCannotCloseWorkprogramNote.body.code, 'PERSONA_ACTION_DENIED');
  const closedGreenWorkprogramNote = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'review.close-note', payload: {
      noteId: greenWorkprogramNoteId, resubmissionId: greenWorkprogramResubmission.body.result.submissionId,
      closureReason: 'The exact returned step was revised by its assigned preparer and the later workprogram was independently accepted.'
    } }
  }, samplingReviewerHeaders);
  assert.equal(closedGreenWorkprogramNote.response.status, 200, JSON.stringify(closedGreenWorkprogramNote.body));

  // US-FLD-012 — an AJE is a reviewed reporting overlay, while signed and gross
  // differences and qualitative exceptions remain separately identifiable.
  const adjustmentExpenseLine = statements.body.profitLoss.find((line: any) => line.category === 'EXPENSE');
  const adjustmentAssetLine = statements.body.balanceSheet.find((line: any) => line.category === 'ASSET');
  assert.ok(adjustmentExpenseLine?.fsliId && adjustmentAssetLine?.fsliId, 'the mapped statement contains expense and asset lines for a balanced AJE');
  const tbVersionId = String(tbActivated.body.result.tbVersionId);
  const unbalancedAjeCountBefore = Number(db.prepare('SELECT COUNT(*) AS count FROM audit_adjustments WHERE workspace_id=? AND engagement_id=?')
    .bind(workspaceId, engagementId).first<any>()?.count);
  const statementsBeforeAje = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/financial-statements`, { headers: technicalHeaders });
  assert.equal(statementsBeforeAje.response.status, 200, JSON.stringify(statementsBeforeAje.body));
  const tbLinesBeforeAje = db.prepare('SELECT COUNT(*) AS count,SUM(current_minor) AS movement FROM tb_lines WHERE workspace_id=? AND tb_version_id=?')
    .bind(workspaceId, tbVersionId).first<any>();
  const unbalancedAje = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'adjustment.create', payload: {
      engagementId, tbVersionId, description: 'Proposed period-end correction with an intentionally unequal debit and credit. ',
      evidenceIds: [findingEvidence.body.result.evidenceId], lines: [
        { fsliId: adjustmentExpenseLine.fsliId, accountCode: 'EXP-TEST', debitMinor: '50000', creditMinor: '0' },
        { fsliId: adjustmentAssetLine.fsliId, accountCode: 'AST-TEST', debitMinor: '0', creditMinor: '49999' }
      ]
    } }
  }, technicalHeaders);
  assert.equal(unbalancedAje.body.code, 'UNBALANCED_ADJUSTMENT');
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS count FROM audit_adjustments WHERE workspace_id=? AND engagement_id=?')
    .bind(workspaceId, engagementId).first<any>()?.count), unbalancedAjeCountBefore, 'an unequal AJE writes no draft or lines');
  const statementsAfterRejectedAje = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/financial-statements`, { headers: technicalHeaders });
  assert.equal(statementsAfterRejectedAje.body.sourceHash, statementsBeforeAje.body.sourceHash, 'a rejected AJE leaves the statement source unchanged');

  const proposedAje = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'adjustment.create', payload: {
      engagementId, tbVersionId, description: 'Accrue the supported current-period service expense against the retained source.',
      evidenceIds: [findingEvidence.body.result.evidenceId], lines: [
        { fsliId: adjustmentExpenseLine.fsliId, accountCode: 'EXP-TEST', debitMinor: '10000', creditMinor: '0' },
        { fsliId: adjustmentAssetLine.fsliId, accountCode: 'AST-TEST', debitMinor: '0', creditMinor: '10000' }
      ]
    } }
  }, technicalHeaders);
  assert.equal(proposedAje.response.status, 200, JSON.stringify(proposedAje.body));
  assert.equal(proposedAje.body.result.status, 'DRAFT');
  const ajeId = String(proposedAje.body.result.adjustmentId);
  const proposalToClient = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'adjustment.propose', payload: { adjustmentId: ajeId, expectedVersion: 1 } }
  }, technicalHeaders);
  assert.equal(proposalToClient.response.status, 200, JSON.stringify(proposalToClient.body));
  assert.equal(proposalToClient.body.result.status, 'PROPOSED');
  const clientAjeResponse = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'adjustment.client-respond', payload: {
      adjustmentId: ajeId, expectedVersion: 2, decision: 'ACCEPTED', responseText: 'Management accepts and will record the supported current-period correction.'
    } }
  }, makeRiskHeaders(clientHeaders));
  assert.equal(clientAjeResponse.response.status, 200, JSON.stringify(clientAjeResponse.body));
  assert.equal(clientAjeResponse.body.result.status, 'CLIENT_ACCEPTED');
  const approvedAje = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'adjustment.approve', payload: {
      adjustmentId: ajeId, expectedVersion: 3, sourceHash: clientAjeResponse.body.result.sourceHash
    } }
  }, samplingReviewerHeaders);
  assert.equal(approvedAje.response.status, 200, JSON.stringify(approvedAje.body));
  assert.equal(approvedAje.body.result.status, 'REVIEW_APPROVED');
  assert.equal(approvedAje.body.result.includeInStatements, true);
  const approvedAjeStored = db.prepare('SELECT status,include_in_statements,created_by_actor_id,approved_by_actor_id FROM audit_adjustments WHERE workspace_id=? AND id=?')
    .bind(workspaceId, ajeId).first<any>();
  assert.equal(approvedAjeStored.status, 'REVIEW_APPROVED');
  assert.equal(approvedAjeStored.include_in_statements, 1);
  assert.notEqual(approvedAjeStored.created_by_actor_id, approvedAjeStored.approved_by_actor_id, 'review approval is recorded under a different actor');
  const approvedAjeHistory = db.prepare(`SELECT revision,snapshot_json FROM audit_adjustment_revisions WHERE workspace_id=? AND adjustment_id=? ORDER BY revision`)
    .bind(workspaceId, ajeId).all<any>().results.map((row: any) => ({ revision: row.revision, snapshot: JSON.parse(row.snapshot_json) }));
  assert.deepEqual(approvedAjeHistory.map((row: any) => [row.revision,row.snapshot.adjustment.status]), [
    [1,'DRAFT'],[2,'PROPOSED'],[3,'CLIENT_ACCEPTED'],[4,'REVIEW_APPROVED']
  ], 'each AJE decision remains in its append-only revision history');
  const pinnedAjeEvidence = db.prepare(`SELECT evidence_id,evidence_version,file_sha256,source_snapshot_json FROM audit_adjustment_evidence_links WHERE workspace_id=? AND adjustment_id=?`)
    .bind(workspaceId, ajeId).first<any>();
  const currentAjeEvidenceSource = db.prepare(`SELECT f.sha256 FROM evidence_records e JOIN file_versions f ON f.workspace_id=e.workspace_id AND f.id=e.file_version_id WHERE e.workspace_id=? AND e.id=?`)
    .bind(workspaceId, findingEvidence.body.result.evidenceId).first<any>();
  assert.equal(pinnedAjeEvidence.evidence_id, findingEvidence.body.result.evidenceId);
  assert.equal(pinnedAjeEvidence.evidence_version, 1);
  assert.equal(pinnedAjeEvidence.file_sha256, currentAjeEvidenceSource.sha256);
  assert.throws(() => db.prepare('UPDATE audit_adjustment_lines SET debit_minor=debit_minor+1 WHERE workspace_id=? AND adjustment_id=?')
    .bind(workspaceId, ajeId).run(), /immutable/, 'approved AJE source lines cannot be rewritten');
  const statementsAfterApprovedAje = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/financial-statements`, { headers: technicalHeaders });
  assert.equal(statementsAfterApprovedAje.response.status, 200, JSON.stringify(statementsAfterApprovedAje.body));
  assert.notEqual(statementsAfterApprovedAje.body.sourceHash, statementsBeforeAje.body.sourceHash, 'the reviewed AJE creates a new adjusted statement basis');
  assert.notEqual(statementsAfterApprovedAje.body.adjustmentSetHash, statementsBeforeAje.body.adjustmentSetHash);
  assert.equal(statementsAfterApprovedAje.body.reconciliation.balanced, true, 'the balanced AJE preserves statement reconciliation');
  const expenseAfterAje = statementsAfterApprovedAje.body.profitLoss.find((line: any) => line.fsliId === adjustmentExpenseLine.fsliId);
  assert.notEqual(expenseAfterAje.currentAdjustmentMinor, 0, 'the reporting overlay appears on its exact mapped FSLI');
  const statementsAfterApprovedAjeAgain = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/financial-statements`, { headers: technicalHeaders });
  assert.equal(statementsAfterApprovedAjeAgain.response.status, 200, JSON.stringify(statementsAfterApprovedAjeAgain.body));
  const expenseAfterAjeAgain = statementsAfterApprovedAjeAgain.body.profitLoss.find((line: any) => line.fsliId === adjustmentExpenseLine.fsliId);
  assert.deepEqual({ firstBase: expenseAfterAje.currentBaseMinor, firstAdjustment: expenseAfterAje.currentAdjustmentMinor,
    secondBase: expenseAfterAjeAgain.currentBaseMinor, secondAdjustment: expenseAfterAjeAgain.currentAdjustmentMinor },
  { firstBase: expenseAfterAje.currentBaseMinor, firstAdjustment: 10000, secondBase: expenseAfterAje.currentBaseMinor, secondAdjustment: 10000 },
  'reading adjusted statements repeatedly applies the accepted QAR 100 adjustment exactly once');
  assert.equal(statementsAfterApprovedAjeAgain.body.reconciliation.balanced, true);
  const tbLinesAfterAje = db.prepare('SELECT COUNT(*) AS count,SUM(current_minor) AS movement FROM tb_lines WHERE workspace_id=? AND tb_version_id=?')
    .bind(workspaceId, tbVersionId).first<any>();
  assert.deepEqual(tbLinesAfterAje, tbLinesBeforeAje, 'the AJE does not post into or rewrite the client trial balance');

  const declinedAjeDraft = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'adjustment.create', payload: {
      engagementId, tbVersionId, description: 'Client-declined service expense correction retained for evaluation as an unadjusted item.',
      evidenceIds: [findingEvidence.body.result.evidenceId], lines: [
        { fsliId: adjustmentExpenseLine.fsliId, accountCode: 'EXP-TEST', debitMinor: '5000', creditMinor: '0' },
        { fsliId: adjustmentAssetLine.fsliId, accountCode: 'AST-TEST', debitMinor: '0', creditMinor: '5000' }
      ]
    } }
  }, technicalHeaders);
  assert.equal(declinedAjeDraft.response.status, 200, JSON.stringify(declinedAjeDraft.body));
  const declinedAjeId = String(declinedAjeDraft.body.result.adjustmentId);
  const declinedAjeProposal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'adjustment.propose', payload: { adjustmentId: declinedAjeId, expectedVersion: 1 } }
  }, technicalHeaders);
  assert.equal(declinedAjeProposal.response.status, 200, JSON.stringify(declinedAjeProposal.body));
  const declinedAjeClientResponse = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'adjustment.client-respond', payload: {
      adjustmentId: declinedAjeId, expectedVersion: 2, decision: 'DECLINED', responseText: 'Management declines this proposed expense correction.'
    } }
  }, makeRiskHeaders(clientHeaders));
  assert.equal(declinedAjeClientResponse.response.status, 200, JSON.stringify(declinedAjeClientResponse.body));
  assert.equal(declinedAjeClientResponse.body.result.status, 'CLIENT_DECLINED');
  const approvedDeclinedAje = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'adjustment.approve', payload: {
      adjustmentId: declinedAjeId, expectedVersion: 3, sourceHash: declinedAjeClientResponse.body.result.sourceHash
    } }
  }, samplingReviewerHeaders);
  assert.equal(approvedDeclinedAje.response.status, 200, JSON.stringify(approvedDeclinedAje.body));
  assert.equal(approvedDeclinedAje.body.result.status, 'REVIEW_APPROVED');
  assert.equal(approvedDeclinedAje.body.result.includeInStatements, false, 'review approval does not silently include a client-declined correction');
  const statementsAfterDeclinedAje = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/financial-statements`, { headers: technicalHeaders });
  assert.equal(statementsAfterDeclinedAje.body.sourceHash, statementsAfterApprovedAje.body.sourceHash,
    'a declined AJE stays out of the statement overlay while its immutable review record remains available for the SRM');

  const srmDifference = async (payload: Record<string, unknown>) => post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'difference.create', payload }
  }, technicalHeaders);
  const overstatement = await srmDifference({ findingId: newFinding.body.result.findingId, fsliId: revenueLine.fsliId, amountMinor: '300000',
    nature: 'FACTUAL', qualitativeSignificance: false, disposition: 'UNADJUSTED', dispositionReason: 'The unsupported recorded balance remains uncorrected.' });
  assert.equal(overstatement.response.status, 200, JSON.stringify(overstatement.body));
  const offsettingUnderstatement = await srmDifference({ findingId: newFinding.body.result.findingId, fsliId: revenueLine.fsliId, amountMinor: '-250000',
    nature: 'PROJECTED', qualitativeSignificance: false, disposition: 'UNADJUSTED', dispositionReason: 'The projected understatement remains uncorrected.' });
  assert.equal(offsettingUnderstatement.response.status, 200, JSON.stringify(offsettingUnderstatement.body));
  const expenseFinding = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'finding.create', payload: {
      engagementId, fsliId: adjustmentExpenseLine.fsliId, title: 'Unrecorded supported expense',
      description: 'The current-period service expense was omitted from the client ledger and requires an audit adjustment.',
      severity: 'MODERATE', qualitativeSignificance: false
    } }
  }, technicalHeaders);
  assert.equal(expenseFinding.response.status, 200, JSON.stringify(expenseFinding.body));
  const declinedAjeCannotClearDifference = await srmDifference({ findingId: expenseFinding.body.result.findingId, fsliId: adjustmentExpenseLine.fsliId, amountMinor: '5000',
    nature: 'FACTUAL', qualitativeSignificance: false, disposition: 'ADJUSTED', adjustmentId: declinedAjeId, dispositionReason: 'Attempt to classify a client-declined correction as adjusted.' });
  assert.equal(declinedAjeCannotClearDifference.body.code, 'GATE_BLOCKED', 'a client-declined, excluded AJE cannot clear an unadjusted difference');
  const adjustedDifference = await srmDifference({ findingId: expenseFinding.body.result.findingId, fsliId: adjustmentExpenseLine.fsliId, amountMinor: '10000',
    nature: 'FACTUAL', qualitativeSignificance: false, disposition: 'ADJUSTED', adjustmentId: ajeId, dispositionReason: 'The independently approved AJE corrects this supported expense.' });
  assert.equal(adjustedDifference.response.status, 200, JSON.stringify(adjustedDifference.body));
  const qualitativeFinding = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'finding.create', payload: {
      engagementId, fsliId: revenueLine.fsliId, title: 'Management integrity exception',
      description: 'A management integrity concern requires qualitative evaluation regardless of its monetary amount.',
      severity: 'HIGH', qualitativeSignificance: true
    } }
  }, technicalHeaders);
  assert.equal(qualitativeFinding.response.status, 200, JSON.stringify(qualitativeFinding.body));
  const qualitativeDismissal = await srmDifference({ findingId: qualitativeFinding.body.result.findingId, fsliId: revenueLine.fsliId, amountMinor: '10000',
    nature: 'JUDGMENTAL', qualitativeSignificance: true, disposition: 'CLEARLY_TRIVIAL', dispositionReason: 'Attempt to dismiss a low-value integrity concern as clearly trivial.' });
  assert.equal(qualitativeDismissal.body.code, 'GATE_BLOCKED', 'a qualitative exception cannot be dismissed as clearly trivial below SAD');
  const retainedQualitativeDifference = await srmDifference({ findingId: qualitativeFinding.body.result.findingId, fsliId: revenueLine.fsliId, amountMinor: '10000',
    nature: 'JUDGMENTAL', qualitativeSignificance: true, disposition: 'UNADJUSTED', dispositionReason: 'Retain the low-value management integrity exception for qualitative assessment.' });
  assert.equal(retainedQualitativeDifference.response.status, 200, JSON.stringify(retainedQualitativeDifference.body));
  const currentSrmDifferences = db.prepare(`SELECT amount_minor,qualitative_significance,disposition,adjustment_id,tb_version_id,mapping_version_id,materiality_version_id
    FROM audit_differences WHERE workspace_id=? AND engagement_id=? ORDER BY created_at,id`).bind(workspaceId, engagementId).all<any>().results;
  assert.deepEqual(currentSrmDifferences.map((row: any) => [String(row.amount_minor),row.qualitative_significance,row.disposition]), [
    ['300000',0,'UNADJUSTED'],['-250000',0,'UNADJUSTED'],['10000',0,'ADJUSTED'],['10000',1,'UNADJUSTED']
  ]);
  assert.equal(currentSrmDifferences[2].adjustment_id, ajeId, 'an adjusted difference retains its exact approved AJE link');
  assert.ok(currentSrmDifferences.every((row: any) => row.tb_version_id===tbVersionId&&row.mapping_version_id===mappingApproved.body.result.mappingVersionId&&row.materiality_version_id===activeMaterialityId),
    'every difference pins the exact active TB, mapping and materiality versions');

  for (const file of [firstPbcFile, replacementPbcFile]) {
    const downloaded = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${file.fileId}`, {
      headers: clientPbcHeaders
    }), env, {} as any);
    const downloadedBytes = new Uint8Array(await downloaded.arrayBuffer());
    assert.equal(downloaded.status, 200, 'the assigned contact can download each exact response in history');
    assert.equal(downloadedBytes.length > 0, true);
  }
  assert.ok(deliveredRecipients.includes('md-new@example.invalid'));
  assert.ok(deliveredRecipients.includes('c001-finance@example.invalid'));
  const clientDelivery = await call(deliveryPath, { headers: makeRiskHeaders(clientHeaders) });
  assert.equal(clientDelivery.response.status, 200, JSON.stringify(clientDelivery.body));
  assert.equal('templates' in clientDelivery.body, false, 'the client projection excludes internal approved templates');
  assert.equal('letterDrafts' in clientDelivery.body, false, 'the client projection excludes internal letter drafts');
  const clientInvoice = clientDelivery.body.invoices.find((invoice: any) => invoice.id === issuedInvoice.id);
  assert.equal(clientInvoice.status, 'ISSUED');
  for (const fileVersionId of [issuedLetter.body.result.fileId, clientInvoice.fileVersionId]) {
    const clientDocument = await testFetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${fileVersionId}`, { headers: makeRiskHeaders(clientHeaders) }), env, {} as any);
    assert.equal(clientDocument.status, 200, 'the client can download an issued document scoped to its engagement');
    assert.equal(new TextDecoder().decode(new Uint8Array(await clientDocument.arrayBuffer()).slice(0, 5)), '%PDF-');
  }
  const clientCannotReadDeliveryElsewhere = await call(`/api/workspaces/${workspaceId}/engagements/${conversion.body.result.engagementId}/delivery-workspace`, {
    headers: { ...clientHeaders, 'X-Client-Id': childClientId }
  });
  assert.equal(clientCannotReadDeliveryElsewhere.response.status, 403);

  const priorEngagement = db.prepare(`SELECT id,period_end,standards_profile_id,created_by_actor_id FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, engagementId).first<any>();
  assert.ok(priorEngagement);
  const continuationEngagementId = crypto.randomUUID();
  const continuationCreatedAt = new Date().toISOString();
  db.prepare(`INSERT INTO engagements(id,workspace_id,version,client_id,code,period_start,period_end,engagement_type,lifecycle_state,contract_fee_minor,
      active_proposal_version_id,active_tb_version_id,approved_planning_version_id,report_signed_at,report_date,released_at,archive_due_at,locked_at,
      portal_frozen_at,standards_profile_id,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    SELECT ?,workspace_id,1,client_id,'TEST-CONTINUANCE-2026','2026-01-01','2026-12-31','STATUTORY_AUDIT','LEAD_INGESTION',0,
      NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,standards_profile_id,?,?,created_by_actor_id,created_by_actor_id
    FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(continuationEngagementId, continuationCreatedAt, continuationCreatedAt, workspaceId, priorEngagement.id).run();
  const asOfDate = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const qatarToday = `${asOfDate.find(part => part.type === 'year')?.value}-${asOfDate.find(part => part.type === 'month')?.value}-${asOfDate.find(part => part.type === 'day')?.value}`;
  const priorInvoiceId = crypto.randomUUID();
  const priorInvoiceNumber = 'TEST-PRIOR-FINAL-20000';
  const ledgerIssueDate = priorEngagement.period_end as string;
  const ledgerPaymentDate = new Date(`${qatarToday}T00:00:00Z`);
  ledgerPaymentDate.setUTCDate(ledgerPaymentDate.getUTCDate() - 1);
  const ledgerPaymentOn = ledgerPaymentDate.toISOString().slice(0, 10);
  const continuanceTimestamp = new Date().toISOString();
  db.prepare(`INSERT INTO invoices(id,workspace_id,version,client_id,engagement_id,engagement_letter_id,kind,number,fee_revision_id,tax_policy_version_id,
      subtotal_minor,tax_minor,total_minor,currency,issue_date,due_date,contact_route_id,recipient_snapshot_json,status,artifact_id,file_version_id,
      corrects_invoice_id,created_by_actor_id,issued_at,created_at,updated_at)
    SELECT ?,workspace_id,1,client_id,engagement_id,engagement_letter_id,'FINAL',?,fee_revision_id,tax_policy_version_id,
      20000,0,20000,currency,?, ?,contact_route_id,recipient_snapshot_json,'ISSUED',artifact_id,file_version_id,
      NULL,created_by_actor_id,?,?,?
    FROM invoices WHERE workspace_id=? AND id=?`)
    .bind(priorInvoiceId, priorInvoiceNumber, ledgerIssueDate, `${ledgerIssueDate.slice(0, 4)}-12-31`, continuanceTimestamp, continuanceTimestamp,
      continuanceTimestamp, workspaceId, issuedInvoice.id).run();
  const partialPriorPaymentId = crypto.randomUUID();
  db.prepare(`INSERT INTO payments(id,workspace_id,version,client_id,engagement_id,amount_minor,received_on,method,reference,evidence_file_id,
      verified_by_actor_id,reverses_payment_id,created_at) VALUES(?,?,1,?,?,15000,?,'BANK_TRANSFER','TEST-PRIOR-PARTIAL',?,?,NULL,?)`)
    .bind(partialPriorPaymentId, workspaceId, clientId, engagementId, ledgerPaymentOn, evidenceFileId, reviewerHeaders['X-Test-Session-Profile'], continuanceTimestamp).run();
  db.prepare(`INSERT INTO payment_allocations(id,workspace_id,version,client_id,engagement_id,payment_id,invoice_id,amount_minor,allocated_on)
    VALUES(?,?,1,?,?,?,?,15000,?)`).bind(crypto.randomUUID(), workspaceId, clientId, engagementId, partialPriorPaymentId, priorInvoiceId, ledgerPaymentOn).run();
  const continuanceHeaders = { ...reviewerHeaders, 'X-Client-Id': clientId, 'X-Engagement-Id': continuationEngagementId };
  const continuanceWorkspacePath = `/api/workspaces/${workspaceId}/engagements/${continuationEngagementId}/risk-workspace`;
  const bypassContinuanceStart = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.saveDraft', payload: {
      ...riskDraftPayload, engagementId: continuationEngagementId, track: 'CONTINUANCE', expectedDraftVersion: 0,
      questionnaireTemplateVersion: 'track-b-v1', assessmentDate: qatarToday
    } }
  }, continuanceHeaders);
  assert.equal(bypassContinuanceStart.response.status, 422, 'a Track B draft cannot bypass the immutable prior baseline command');
  assert.equal(bypassContinuanceStart.body.code, 'INVALID_STATE');
  const continuanceBefore = await call(continuanceWorkspacePath, { headers: continuanceHeaders });
  assert.equal(continuanceBefore.response.status, 200, JSON.stringify(continuanceBefore.body));
  assert.ok(continuanceBefore.body.continuanceCandidates.some((candidate: any) => candidate.id === engagementId),
    'the previous engagement is offered only after its current commercial key and Partner risk clearance are verified');
  const startContinuance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.startContinuance', payload: {
      engagementId: continuationEngagementId, priorEngagementId: engagementId, asOfDate: qatarToday, expectedEngagementVersion: 1
    } }
  }, continuanceHeaders);
  assert.equal(startContinuance.response.status, 200, JSON.stringify(startContinuance.body));
  assert.equal(startContinuance.body.result.priorBaseline.priorFeeOutstandingMinor, '5000',
    'the immutable baseline derives QAR 5,000 from a QAR 20,000 prior invoice and QAR 15,000 in dated allocations');
  assert.equal(startContinuance.body.result.priorBaseline.invoices.find((invoice: any) => invoice.invoiceId === priorInvoiceId).outstandingMinor, '5000');
  const duplicateContinuanceStart = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.startContinuance', payload: {
      engagementId: continuationEngagementId, priorEngagementId: engagementId, asOfDate: ledgerPaymentOn, expectedEngagementVersion: 1
    } }
  }, continuanceHeaders);
  assert.equal(duplicateContinuanceStart.response.status, 422, 'a second as-of date cannot rewrite the signed initial ledger baseline');
  const currentEvidenceId = await storeCommittedFile('EVIDENCE', 'current-continuance-review.pdf', 'application/pdf', pdf,
    continuanceHeaders, { clientId, engagementId: continuationEngagementId });
  const listedContinuanceFiles = await call(`/api/workspaces/${workspaceId}/files?limit=100`, { headers: continuanceHeaders });
  assert.equal(listedContinuanceFiles.response.status, 200, JSON.stringify(listedContinuanceFiles.body));
  assert.ok(listedContinuanceFiles.body.files.some((file: any) => file.id === fileId), 'internal reviewers can inspect linked prior evidence for current applicability');
  const deltaEvidenceCoverage = [
    { topic: 'MANAGEMENT', fileIds: [currentEvidenceId] },
    { topic: 'OWNERSHIP', fileIds: [fileId] },
    { topic: 'BORROWING', fileIds: [currentEvidenceId] },
    { topic: 'LITIGATION', fileIds: [currentEvidenceId] },
    { topic: 'FRAUD_REGULATORY', fileIds: [currentEvidenceId] }
  ];
  const recordContinuanceDelta = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.recordDelta', payload: {
      assessmentId: startContinuance.body.result.assessmentId, expectedDraftVersion: 1,
      managementChanged: false, ownershipChanged: true, newBorrowing: false, litigationChanged: false, fraudOrRegulatoryIssue: false,
      changeSummary: 'Current management and litigation searches found no change; the reviewed register documents a shareholder transfer.',
      evidenceFileIds: [currentEvidenceId, fileId], evidenceCoverage: deltaEvidenceCoverage,
      priorEvidenceApplicability: [{ fileId, confirmedApplicable: true, rationale: 'The prior identity evidence was compared with the current shareholder register and remains applicable.' }]
    } }
  }, continuanceHeaders);
  assert.equal(recordContinuanceDelta.response.status, 200, JSON.stringify(recordContinuanceDelta.body));
  assert.deepEqual(recordContinuanceDelta.body.result.requiredDetailedChecks, ['UBO']);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM continuance_delta_evidence WHERE workspace_id=? AND delta_revision_id=?`)
    .bind(workspaceId, recordContinuanceDelta.body.result.deltaRevisionId).first<any>()?.count, 5,
    'every change area receives a committed evidence reference');
  const buildContinuanceRiskChecks = (includeUbo: boolean) => [
    ...['PRIOR_FEES', 'MANAGEMENT_CHANGE', 'OWNERSHIP_CHANGE', 'NEW_BORROWING', 'LITIGATION', 'FRAUD_REGULATORY'].map(code => ({
      code, outcome: code === 'PRIOR_FEES' ? 'ISSUE' : 'CLEAR',
      findings: code === 'PRIOR_FEES' ? 'QAR 5,000 remains due as of the dated prior ledger snapshot.' : `${code} was assessed against the current-year evidence set.`,
      sourceReference: code === 'PRIOR_FEES' ? `Continuance baseline as of ${qatarToday}` : `Current continuance review ${recordContinuanceDelta.body.result.deltaRevisionId}`,
      checkMethod: 'MANUAL', checkedOn: qatarToday
    })),
    ...(includeUbo ? [{ code: 'UBO', outcome: 'CLEAR', findings: 'The current register and shareholder transfer evidence were reassessed.',
      sourceReference: 'Current shareholder register and transfer evidence', checkMethod: 'MANUAL', checkedOn: qatarToday, evidenceFileId: currentEvidenceId }] : [])
  ];
  const incompleteContinuanceDraft = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.saveDraft', payload: {
      engagementId: continuationEngagementId, track: 'CONTINUANCE', expectedDraftVersion: 2, questionnaireTemplateVersion: 'track-b-v1',
      assessmentDate: qatarToday, overallRisk: 'MODERATE', managementIntegrityConclusion: 'Management change and integrity were reviewed against current evidence.',
      viabilityConclusion: 'Current client viability was reviewed with borrowing and fee exposure considered.',
      independenceConclusion: 'Current independence and conflicts were assessed for this separate period.', checks: buildContinuanceRiskChecks(false)
    } }
  }, continuanceHeaders);
  assert.equal(incompleteContinuanceDraft.response.status, 200, JSON.stringify(incompleteContinuanceDraft.body));
  const blockedContinuanceSubmit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.submit', payload: {
      assessmentId: startContinuance.body.result.assessmentId, expectedDraftVersion: 3
    } }
  }, continuanceHeaders);
  assert.equal(blockedContinuanceSubmit.response.status, 409);
  assert.equal(blockedContinuanceSubmit.body.code, 'GATE_BLOCKED');
  assert.ok(blockedContinuanceSubmit.body.details.blockers.some((item: string) => item.startsWith('UBO:')),
    'an ownership change requires a refreshed UBO assessment before submission');
  const completeContinuanceDraft = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.saveDraft', payload: {
      engagementId: continuationEngagementId, track: 'CONTINUANCE', expectedDraftVersion: 3, questionnaireTemplateVersion: 'track-b-v1',
      assessmentDate: qatarToday, overallRisk: 'MODERATE', managementIntegrityConclusion: 'Management change and integrity were reviewed against current evidence.',
      viabilityConclusion: 'Current client viability was reviewed with borrowing and fee exposure considered.',
      independenceConclusion: 'Current independence and conflicts were assessed for this separate period.', checks: buildContinuanceRiskChecks(true)
    } }
  }, continuanceHeaders);
  assert.equal(completeContinuanceDraft.response.status, 200, JSON.stringify(completeContinuanceDraft.body));
  const submitContinuance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.submit', payload: {
      assessmentId: startContinuance.body.result.assessmentId, expectedDraftVersion: 4
    } }
  }, continuanceHeaders);
  assert.equal(submitContinuance.response.status, 200, JSON.stringify(submitContinuance.body));
  const submittedContinuanceVersion = submitContinuance.body.result.assessmentVersionId as string;
  const pinnedContinuanceBaseline = db.prepare(`SELECT prior_fee_outstanding_minor,as_of_date,ownership_changed,prior_risk_version_id
    FROM continuance_baselines WHERE workspace_id=? AND assessment_version_id=?`).bind(workspaceId, submittedContinuanceVersion).first<any>();
  assert.equal(pinnedContinuanceBaseline?.prior_fee_outstanding_minor, 5000);
  assert.equal(pinnedContinuanceBaseline?.as_of_date, qatarToday);
  assert.equal(pinnedContinuanceBaseline?.ownership_changed, 1);
  assert.equal(pinnedContinuanceBaseline?.prior_risk_version_id, renewedGate.body.riskKey.assessmentVersionId);
  assert.ok(db.prepare(`SELECT snapshot_sha256 FROM continuance_baseline_sources WHERE workspace_id=? AND baseline_id=(
    SELECT id FROM continuance_baselines WHERE workspace_id=? AND assessment_version_id=?)`).bind(workspaceId, workspaceId, submittedContinuanceVersion).first<any>()?.snapshot_sha256);
  const continuanceCheck = db.prepare(`SELECT id FROM risk_checks WHERE workspace_id=? AND assessment_version_id=? AND code='PRIOR_FEES'`)
    .bind(workspaceId, submittedContinuanceVersion).first<any>();
  const cannotSelfResolvePriorFees = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'risk.clear', payload: {
      engagementId: continuationEngagementId, riskAssessmentVersionId: submittedContinuanceVersion,
      rationale: 'The current review is complete and the fee balance was considered.'
    } }
  }, { ...approverHeaders, 'X-Client-Id': clientId, 'X-Engagement-Id': continuationEngagementId });
  assert.equal(cannotSelfResolvePriorFees.response.status, 409, 'the Partner must resolve the outstanding prior fee concern with evidence');
  assert.equal(cannotSelfResolvePriorFees.body.code, 'GATE_BLOCKED');
  const escalatePriorFees = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.escalate', payload: {
      assessmentVersionId: submittedContinuanceVersion, checkId: continuanceCheck.id,
      reason: 'QAR 5,000 is still outstanding from the prior engagement and needs Partner disposition.',
      requiredEvidence: 'Document the Partner decision and current settlement or recovery evidence.'
    } }
  }, continuanceHeaders);
  assert.equal(escalatePriorFees.response.status, 200, JSON.stringify(escalatePriorFees.body));
  const reviewerCannotResolvePriorFees = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.resolveEscalation', payload: {
      escalationId: escalatePriorFees.body.result.escalationId, expectedVersion: 1,
      resolution: 'Reviewer attempts to resolve the prior-fee escalation without Partner authority.', evidenceFileId: currentEvidenceId
    } }
  }, continuanceHeaders);
  assert.equal(reviewerCannotResolvePriorFees.response.status, 403, 'only the Partner persona may resolve a risk escalation');
  const pendingPriorFeeClearance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'risk.clear', payload: {
      engagementId: continuationEngagementId, riskAssessmentVersionId: submittedContinuanceVersion,
      rationale: 'The current review is complete and the fee balance was considered.'
    } }
  }, { ...approverHeaders, 'X-Client-Id': clientId, 'X-Engagement-Id': continuationEngagementId });
  assert.equal(pendingPriorFeeClearance.response.status, 409, 'an open prior-fee escalation blocks Partner clearance');
  assert.equal(pendingPriorFeeClearance.body.code, 'GATE_BLOCKED');
  const resolvePriorFees = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.resolveEscalation', payload: {
      escalationId: escalatePriorFees.body.result.escalationId, expectedVersion: 1,
      resolution: 'Partner reviewed the signed recovery plan and approved continuance with the prior balance monitored.', evidenceFileId: currentEvidenceId
    } }
  }, { ...approverHeaders, 'X-Client-Id': clientId, 'X-Engagement-Id': continuationEngagementId });
  assert.equal(resolvePriorFees.response.status, 200, JSON.stringify(resolvePriorFees.body));
  const clearContinuance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'risk.clear', payload: {
      engagementId: continuationEngagementId, riskAssessmentVersionId: submittedContinuanceVersion,
      rationale: 'Partner accepted the documented continuance concerns and the current refreshed checks.'
    } }
  }, { ...approverHeaders, 'X-Client-Id': clientId, 'X-Engagement-Id': continuationEngagementId });
  assert.equal(clearContinuance.response.status, 200, JSON.stringify(clearContinuance.body));
  const continuanceGate = await call(`/api/workspaces/${workspaceId}/engagements/${continuationEngagementId}/acceptance-gate`, {
    headers: { ...approverHeaders, 'X-Client-Id': clientId, 'X-Engagement-Id': continuationEngagementId }
  });
  assert.equal(continuanceGate.body.riskKey.status, 'ACTIVE');
  assert.equal(continuanceGate.body.lifecycleState, 'LEAD_INGESTION', 'continuance clearance does not automatically advance the current engagement lifecycle');

  const changedOwner = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'riskAssessment.owner.save', payload: {
      engagementId, ownerId: owner.body.result.ownerId, expectedVersion: 1, fullName: 'Test beneficial owner revised', ownershipBps: 10000,
      controlBasis: 'Reconfirmed direct ownership after a current shareholder-register review.', identityEvidenceFileId: fileId,
      effectiveFrom: '2020-01-01', active: true
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(changedOwner.response.status, 200, JSON.stringify(changedOwner.body));
  const staleGate = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/acceptance-gate`, { headers: makeRiskHeaders(approverHeaders) });
  assert.equal(staleGate.body.commercialKey.status, 'ACTIVE');
  assert.equal(staleGate.body.riskKey.status, 'STALE');
  assert.equal(staleGate.body.ready, false, 'an ownership revision makes the previous risk key stale without rewriting its history');
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM risk_clearances WHERE workspace_id=? AND engagement_id=? AND decision='CLEAR'`)
    .bind(workspaceId, engagementId).first<any>()?.count, 1, 'ownership changes preserve the prior Partner decision as immutable history');

  // --- Slice 7 — Practice and bookkeeping (US-PRC-001..007 exit evidence) ------
  const practicePath = `/api/workspaces/${workspaceId}/practice`;
  const practiceHeaders = { ...approverHeaders, 'X-Client-Id': clientId, 'X-Engagement-Id': engagementId };
  const accountId = (code: string) => db.prepare('SELECT id FROM firm_accounts WHERE workspace_id=? AND code=?')
    .bind(workspaceId, code).first<any>()?.id as string;
  const defaultRateSchedule = db.prepare(`SELECT grade,hourly_minor FROM firm_charge_out_rates WHERE workspace_id=? ORDER BY grade`)
    .bind(workspaceId).all<any>().results.map((row: any) => [row.grade, row.hourly_minor]);
  assert.deepEqual(defaultRateSchedule, [['ASSOCIATE', 20000], ['MANAGER', 75000], ['PARTNER', 100000], ['SENIOR', 50000]],
    'the defaults preserve the exact grade schedule in QAR minor units');
  const partnerActorId = created.body.actorProfileId as string;
  const createGradeReviewerTime = async (grade: 'MANAGER' | 'SENIOR') => {
    const staffMemberId = crypto.randomUUID(), assignmentId = crypto.randomUUID(), naturalPersonKey = `TEST-${grade}-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO staff_members(id,workspace_id,version,natural_person_key,display_name,email,grade,active,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
      VALUES(?,?,1,?,?,?, ?,1,?,?,?,?)`).bind(staffMemberId, workspaceId, naturalPersonKey, `${grade} Reviewer`, `${grade.toLowerCase()}.${naturalPersonKey}@example.invalid`, grade,
      now, now, partnerActorId, partnerActorId).run();
    db.prepare(`INSERT INTO engagement_assignments(id,workspace_id,version,client_id,engagement_id,staff_member_id,persona,phase,start_date,end_date,planned_minutes,created_by_actor_id,created_at)
      VALUES(?,?,1,?,?,?,'REVIEWER','FIELDWORK',?,?,60,?,?)`).bind(assignmentId, workspaceId, clientId, engagementId, staffMemberId, planDate, planDate, partnerActorId, now).run();
    const draft = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'time.create', payload: {
        engagementId, staffMemberId, workDate: planDate, phase: 'FIELDWORK', minutes: 60,
        description: `Recorded one hour of assigned ${grade.toLowerCase()} review work.`, billable: true } }
    }, reviewerHeaders);
    assert.equal(draft.response.status, 200, JSON.stringify(draft.body));
    const timeEntryId = draft.body.result.timeEntryId as string;
    const submitted = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'time.submit', payload: { timeEntryId, expectedVersion: 1 } }
    }, reviewerHeaders);
    assert.equal(submitted.response.status, 200, JSON.stringify(submitted.body));
    const approved = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'time.approve', payload: { timeEntryId, expectedVersion: 2 } }
    }, approverHeaders);
    assert.equal(approved.response.status, 200, JSON.stringify(approved.body));
    return db.prepare('SELECT hourly_minor_snapshot,charge_numerator,charge_denominator FROM firm_time_entries WHERE workspace_id=? AND id=?')
      .bind(workspaceId, timeEntryId).first<any>();
  };
  const managerReviewerTime = await createGradeReviewerTime('MANAGER');
  const seniorReviewerTime = await createGradeReviewerTime('SENIOR');
  assert.equal(managerReviewerTime?.hourly_minor_snapshot, 75000, 'a REVIEWER entry for a Manager staff member uses QAR 750/hour');
  assert.equal(managerReviewerTime?.charge_numerator, '4500000');
  assert.equal(managerReviewerTime?.charge_denominator, 60);
  assert.equal(seniorReviewerTime?.hourly_minor_snapshot, 50000, 'a REVIEWER entry for a Senior staff member uses QAR 500/hour');
  assert.equal(seniorReviewerTime?.charge_numerator, '3000000');
  assert.equal(seniorReviewerTime?.charge_denominator, 60);

  // PRC scope: CLIENT personas never reach firm practice records or bookkeeping.
  const clientPracticeDenied = await call(practicePath, { headers: clientHeaders });
  assert.equal(clientPracticeDenied.response.status, 403, JSON.stringify(clientPracticeDenied.body));
  const clientFirmTrialBalanceDenied = await call(`${practicePath}/reports/trial-balance?from=${planDate}&to=${planDate}`, { headers: clientHeaders });
  assert.equal(clientFirmTrialBalanceDenied.response.status, 403, 'client personas cannot read the internal firm trial balance');
  const clientFirmProfitLossDenied = await call(`${practicePath}/reports/profit-loss?month=${planDate.slice(0, 7)}`, { headers: clientHeaders });
  assert.equal(clientFirmProfitLossDenied.response.status, 403, 'client personas cannot read internal firm profit and loss');
  const clientTimeDenied = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.create', payload: {
      engagementId, staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, phase: 'FIELDWORK',
      minutes: 60, description: 'A client persona must never record firm audit time entries.', billable: true } }
  }, clientHeaders);
  assert.equal(clientTimeDenied.response.status, 403);

  // PRC-001: approved grade rate changes are future-effective; recorded work keeps the
  // rate that was effective on its work date.
  const rateUpdate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'practice.rate.set', payload: {
      grade: 'ASSOCIATE', hourlyMinor: '22000', effectiveFrom: '2027-01-01' } }
  }, approverHeaders);
  assert.equal(rateUpdate.response.status, 200, JSON.stringify(rateUpdate.body));
  const historicalRateEdit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'practice.rate.set', payload: {
      grade: 'ASSOCIATE', hourlyMinor: '22000', effectiveFrom: planDate } }
  }, approverHeaders);
  assert.equal(historicalRateEdit.response.status, 422, 'a new rate cannot rewrite the effective rate of recorded work');

  const mismatchedProcedureFsli = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.create', payload: {
      engagementId, staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, phase: 'FIELDWORK',
      fsliId: greenFsli.id, procedureId: revenueProcedureIds[0], minutes: 30,
      description: 'Attempt to link a procedure to a different financial statement area.', billable: true } }
  }, preparerHeaders);
  assert.equal(mismatchedProcedureFsli.response.status, 422, JSON.stringify(mismatchedProcedureFsli.body));
  assert.equal(mismatchedProcedureFsli.body.code, 'VALIDATION_FAILED', 'a time entry cannot pair a procedure with another FSLI');

  const firstTimedEntry = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.create', payload: {
      engagementId, staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, phase: 'FIELDWORK', minutes: 60,
      description: 'Recorded the first explicit timed audit work range.', billable: true,
      startAt: `${planDate}T09:00:00.000Z`, endAt: `${planDate}T10:00:00.000Z` } }
  }, preparerHeaders);
  assert.equal(firstTimedEntry.response.status, 200, JSON.stringify(firstTimedEntry.body));
  const overlappingTimedEntry = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.create', payload: {
      engagementId, staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, phase: 'FIELDWORK', minutes: 60,
      description: 'Attempted to overlap an already recorded timed range.', billable: true,
      startAt: `${planDate}T09:30:00.000Z`, endAt: `${planDate}T10:30:00.000Z` } }
  }, preparerHeaders);
  assert.equal(overlappingTimedEntry.response.status, 422, JSON.stringify(overlappingTimedEntry.body));
  assert.equal(overlappingTimedEntry.body.code, 'VALIDATION_FAILED', 'overlapping explicit timed ranges are rejected');

  const timeDraft = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.create', payload: {
      engagementId, staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, phase: 'FIELDWORK',
      fsliId: revenueLine.fsliId, procedureId: revenueProcedureIds[0], minutes: 420,
      description: 'Executed assigned fieldwork procedures for the scoped engagement.', billable: true } }
  }, preparerHeaders);
  assert.equal(timeDraft.response.status, 200, JSON.stringify(timeDraft.body));
  assert.equal(timeDraft.body.result.status, 'DRAFT');
  const timeEntryId = timeDraft.body.result.timeEntryId as string;

  const initialTimeSubmitKey = crypto.randomUUID();
  const submitTime = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: initialTimeSubmitKey, command: { type: 'time.submit', payload: { timeEntryId, expectedVersion: 1 } }
  }, preparerHeaders);
  assert.equal(submitTime.response.status, 200, JSON.stringify(submitTime.body));
  const retryTimeSubmit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: initialTimeSubmitKey, command: { type: 'time.submit', payload: { timeEntryId, expectedVersion: 1 } }
  }, preparerHeaders);
  assert.equal(retryTimeSubmit.response.status, 200, JSON.stringify(retryTimeSubmit.body));
  assert.equal(retryTimeSubmit.body.result.timeEntryId, timeEntryId, 'a retry returns the original submission result without creating another entry');
  const selfApproval = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.approve', payload: { timeEntryId, expectedVersion: 2 } }
  }, preparerHeaders);
  assert.equal(selfApproval.response.status, 403, 'a preparer can neither approve nor return their own time entry');
  const returnTime = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.return', payload: {
      timeEntryId, expectedVersion: 2, reason: 'Clarify the procedure reference and phase before independent approval.' } }
  }, reviewerHeaders);
  assert.equal(returnTime.response.status, 200, JSON.stringify(returnTime.body));
  const resubmitTime = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.submit', payload: { timeEntryId, expectedVersion: 3 } }
  }, preparerHeaders);
  assert.equal(resubmitTime.response.status, 200, JSON.stringify(resubmitTime.body));
  const approveTime = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.approve', payload: { timeEntryId, expectedVersion: 4 } }
  }, reviewerHeaders);
  assert.equal(approveTime.response.status, 200, JSON.stringify(approveTime.body));
  const mismatchedCorrectionFsli = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.correct', payload: {
      timeEntryId, expectedVersion: 5, reason: 'Correcting a misclassified FSLI requires an aligned procedure reference.',
      replacement: { fsliId: greenFsli.id, procedureId: revenueProcedureIds[0] } } }
  }, approverHeaders);
  assert.equal(mismatchedCorrectionFsli.response.status, 422, JSON.stringify(mismatchedCorrectionFsli.body));
  assert.equal(mismatchedCorrectionFsli.body.code, 'VALIDATION_FAILED');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM firm_time_corrections WHERE workspace_id=? AND original_time_entry_id=?')
    .bind(workspaceId, timeEntryId).first<any>()?.count, 0, 'a rejected replacement cannot leave a partial correction');
  const approvedTimeRow = db.prepare('SELECT status,hourly_minor_snapshot,charge_numerator,charge_denominator,approved_by_actor_id,fsli_id,procedure_id FROM firm_time_entries WHERE workspace_id=? AND id=?')
    .bind(workspaceId, timeEntryId).first<any>();
  assert.equal(approvedTimeRow?.status, 'APPROVED');
  assert.equal(approvedTimeRow?.hourly_minor_snapshot, 20000, 'approval freezes the rate effective on the work date, not a later revision');
  assert.equal(approvedTimeRow?.charge_denominator, 60, 'charge-out is stored as a rational minutes/hour fraction');
  assert.equal(approvedTimeRow?.fsli_id, revenueLine.fsliId, 'time retains its optional FSLI link');
  assert.equal(approvedTimeRow?.procedure_id, revenueProcedureIds[0], 'time retains its optional procedure link');
  const practiceTimeView = await call(`${practicePath}?engagementId=${encodeURIComponent(engagementId)}`, { headers: preparerHeaders });
  assert.equal(practiceTimeView.response.status, 200, JSON.stringify(practiceTimeView.body));
  assert.ok(practiceTimeView.body.procedureCatalog.some((item: any) => item.id === revenueProcedureIds[0]), 'the engagement practice view exposes procedures for time entry selection');
  const projectedApprovedTime = practiceTimeView.body.timeEntries.find((item: any) => item.id === timeEntryId);
  assert.equal(projectedApprovedTime?.fsli_id, revenueLine.fsliId);
  assert.equal(projectedApprovedTime?.procedure_id, revenueProcedureIds[0]);
  assert.equal(projectedApprovedTime?.chargeOutMinor, '140000', '420 Associate minutes at QAR 200/hour produce QAR 1,400');

  // PRC-001: 90 minutes at the default Associate rate is QAR 300, and submitted daily totals stop at 1,440.
  const ninetyMinuteDraft = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.create', payload: {
      engagementId, staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, phase: 'FIELDWORK',
      minutes: 90, description: 'Completed a focused substantive procedure and retained the result.', billable: true } }
  }, preparerHeaders);
  assert.equal(ninetyMinuteDraft.response.status, 200, JSON.stringify(ninetyMinuteDraft.body));
  const ninetyMinuteId = ninetyMinuteDraft.body.result.timeEntryId as string;
  const submitNinetyMinutes = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.submit', payload: { timeEntryId: ninetyMinuteId, expectedVersion: 1 } }
  }, preparerHeaders);
  assert.equal(submitNinetyMinutes.response.status, 200, JSON.stringify(submitNinetyMinutes.body));
  const approveNinetyMinutes = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.approve', payload: { timeEntryId: ninetyMinuteId, expectedVersion: 2 } }
  }, reviewerHeaders);
  assert.equal(approveNinetyMinutes.response.status, 200, JSON.stringify(approveNinetyMinutes.body));
  const afterNinetyMinutes = await call(`${practicePath}?engagementId=${encodeURIComponent(engagementId)}`, { headers: preparerHeaders });
  const approvedNinetyMinutes = afterNinetyMinutes.body.timeEntries.find((item: any) => item.id === ninetyMinuteId);
  assert.equal(approvedNinetyMinutes?.status, 'APPROVED');
  assert.equal(approvedNinetyMinutes?.chargeOutMinor, '30000', 'ninety minutes at QAR 200/hour prorate exactly to QAR 300');
  assert.equal(afterNinetyMinutes.body.profitability, null, 'preparers never receive engagement margin aggregates');
  assert.deepEqual(afterNinetyMinutes.body.profitabilitySnapshots, [], 'preparers never receive immutable partner profitability snapshots');
  assert.equal(afterNinetyMinutes.body.engagement.contractFeeMinor, null, 'accepted contract fee remains partner-only');
  const dailyLimitEntry = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.create', payload: {
      engagementId, staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, phase: 'FIELDWORK',
      minutes: 890, description: 'Completed assigned procedures through the full working day.', billable: true } }
  }, preparerHeaders);
  assert.equal(dailyLimitEntry.response.status, 200, JSON.stringify(dailyLimitEntry.body));
  const submitDailyLimit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.submit', payload: { timeEntryId: dailyLimitEntry.body.result.timeEntryId, expectedVersion: 1 } }
  }, preparerHeaders);
  assert.equal(submitDailyLimit.response.status, 200, JSON.stringify(submitDailyLimit.body), '420 + 90 + 890 minutes is exactly the daily limit');
  const overflowTime = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.create', payload: {
      engagementId, staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, phase: 'FIELDWORK',
      minutes: 100, description: 'Attempted to record time beyond the maximum daily capacity.', billable: true } }
  }, preparerHeaders);
  assert.equal(overflowTime.response.status, 200, JSON.stringify(overflowTime.body));
  const submitOverflowTime = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.submit', payload: { timeEntryId: overflowTime.body.result.timeEntryId, expectedVersion: 1 } }
  }, preparerHeaders);
  assert.equal(submitOverflowTime.response.status, 422, JSON.stringify(submitOverflowTime.body));
  assert.equal(submitOverflowTime.body.code, 'VALIDATION_FAILED');
  assert.match(submitOverflowTime.body.message, /1,440 minutes per person and work date/);

  // PRC-003: engagement budget approved against the accepted fee proposal version.
  const budgetApprove = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'budget.approve', payload: {
      engagementId, feeProposalVersionId: renewedGate.body.commercialKey.proposalVersionId,
      phases: [{ phase: 'FIELDWORK', grade: 'ASSOCIATE', plannedMinutes: 420 }] } }
  }, approverHeaders);
  assert.equal(budgetApprove.response.status, 200, JSON.stringify(budgetApprove.body));

  // PRC-005: expense draft with an approved support exception, posted independently.
  const expenseCreate = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'expense.create', payload: {
      date: planDate, payee: 'West Bay Facilities LLC', category: 'RENT', amountMinor: '50000',
      description: 'Monthly engagement-period office rent for the practice.',
      missingSupportReason: 'The landlord invoice arrives after the month-end closing cut-off.',
      debitAccountId: accountId('5000'), settlementAccountId: accountId('1000'), paymentMethod: 'BANK' } }
  }, preparerHeaders);
  assert.equal(expenseCreate.response.status, 200, JSON.stringify(expenseCreate.body));
  const preparerExpensePost = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'expense.approve-and-post', payload: { expenseId: expenseCreate.body.result.expenseId } }
  }, preparerHeaders);
  assert.equal(preparerExpensePost.response.status, 403, 'expense posting requires independent review');
  const expensePost = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'expense.approve-and-post', payload: { expenseId: expenseCreate.body.result.expenseId } }
  }, reviewerHeaders);
  assert.equal(expensePost.response.status, 200, JSON.stringify(expensePost.body));
  const exceptionExpense = db.prepare(`SELECT status,missing_support_reason FROM firm_expenses WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,expenseCreate.body.result.expenseId).first<any>();
  assert.equal(exceptionExpense.status, 'POSTED');
  assert.equal(exceptionExpense.missing_support_reason, 'The landlord invoice arrives after the month-end closing cut-off.');

  // PRC-005: a QAR 300 petty-cash voucher is the expense; replenishing that cash
  // from bank creates only an asset-to-asset transfer and never a second expense.
  const invalidPettyCashVoucher = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'expense.create', payload: {
      date: planDate, payee: 'Invalid cash-account debit', category: 'PETTY_CASH', amountMinor: '30000',
      description: 'A cash asset must not be misclassified as the expense debit.',
      missingSupportReason: 'No voucher is attached to this deliberately invalid draft.',
      debitAccountId: accountId('1010'), settlementAccountId: accountId('1010'), paymentMethod: 'CASH' } }
  }, preparerHeaders);
  assert.equal(invalidPettyCashVoucher.response.status, 422, JSON.stringify(invalidPettyCashVoucher.body));
  const pettyVoucherSupportId = await storeCommittedFile('EVIDENCE', 'petty-cash-voucher.pdf', 'application/pdf', pdf,
    preparerHeaders, { clientId, engagementId });
  const pettyVoucher = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'expense.create', payload: {
      date: planDate, payee: 'Practice supplies', category: 'PETTY_CASH', amountMinor: '30000',
      description: 'Small office supplies paid from the accountable petty cash float.',
      supportingFileId: pettyVoucherSupportId,
      debitAccountId: accountId('5300'), settlementAccountId: accountId('1010'), paymentMethod: 'CASH' } }
  }, preparerHeaders);
  assert.equal(pettyVoucher.response.status, 200, JSON.stringify(pettyVoucher.body));
  assert.equal(db.prepare('SELECT state FROM file_versions WHERE workspace_id=? AND id=?').bind(workspaceId,pettyVoucherSupportId).first<any>()?.state, 'COMMITTED');
  const pettyVoucherPost = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'expense.approve-and-post', payload: { expenseId: pettyVoucher.body.result.expenseId } }
  }, reviewerHeaders);
  assert.equal(pettyVoucherPost.response.status, 200, JSON.stringify(pettyVoucherPost.body));
  const invalidPettyCashTransfer = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'petty-cash.replenish', payload: {
      date: planDate, amountMinor: '30000', bankAccountId: accountId('5300'), pettyCashAccountId: accountId('1010'),
      reason: 'Reject an expense account as the bank source.' } }
  }, reviewerHeaders);
  assert.equal(invalidPettyCashTransfer.response.status, 422, JSON.stringify(invalidPettyCashTransfer.body));
  const replenishmentKey = crypto.randomUUID();
  const pettyCashTransfer = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: replenishmentKey, command: { type: 'petty-cash.replenish', payload: {
      date: planDate, amountMinor: '30000', bankAccountId: accountId('1000'), pettyCashAccountId: accountId('1010'),
      reason: 'Bank transfer ref UAT-PC-300 replenishes posted petty cash vouchers.' } }
  }, reviewerHeaders);
  assert.equal(pettyCashTransfer.response.status, 200, JSON.stringify(pettyCashTransfer.body));
  assert.equal(pettyCashTransfer.body.result.expenseDebitMinor, '0');
  const repeatedPettyCashTransfer = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: replenishmentKey, command: { type: 'petty-cash.replenish', payload: {
      date: planDate, amountMinor: '30000', bankAccountId: accountId('1000'), pettyCashAccountId: accountId('1010'),
      reason: 'Bank transfer ref UAT-PC-300 replenishes posted petty cash vouchers.' } }
  }, reviewerHeaders);
  assert.equal(repeatedPettyCashTransfer.response.status, 200, JSON.stringify(repeatedPettyCashTransfer.body));
  assert.equal(repeatedPettyCashTransfer.body.result.journalId, pettyCashTransfer.body.result.journalId);
  const custodianCannotReviewOwnCount = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'petty-cash.reconcile', payload: {
      accountId: accountId('1010'), asOf: planDate, countedCashMinor: '0',
      explanation: 'The custodian cannot independently approve their own cash count.', custodianStaffId: created.body.staffMemberId } }
  }, approverHeaders);
  assert.equal(custodianCannotReviewOwnCount.response.status, 403, JSON.stringify(custodianCannotReviewOwnCount.body));
  const pettyCashReconciliation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'petty-cash.reconcile', payload: {
      accountId: accountId('1010'), asOf: planDate, countedCashMinor: '0',
      explanation: 'Independent count agrees to the restored petty cash float.', custodianStaffId: preparerStaff.body.result.staffMemberId } }
  }, reviewerHeaders);
  assert.equal(pettyCashReconciliation.response.status, 200, JSON.stringify(pettyCashReconciliation.body));
  assert.equal(pettyCashReconciliation.body.result.ledgerBalanceMinor, '0');
  assert.equal(pettyCashReconciliation.body.result.differenceMinor, '0');
  assert.equal(pettyCashReconciliation.body.result.status, 'RECONCILED');
  const pettyCashVariance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'petty-cash.reconcile', payload: {
      accountId: accountId('1010'), asOf: planDate, countedCashMinor: '100',
      explanation: 'A one-riyal short count must remain visible as a variance.', custodianStaffId: preparerStaff.body.result.staffMemberId } }
  }, reviewerHeaders);
  assert.equal(pettyCashVariance.response.status, 200, JSON.stringify(pettyCashVariance.body));
  assert.equal(pettyCashVariance.body.result.differenceMinor, '100');
  assert.equal(pettyCashVariance.body.result.status, 'VARIANCE');
  assert.throws(() => db.prepare(`UPDATE petty_cash_reconciliations SET explanation='Edited count' WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,pettyCashReconciliation.body.result.reconciliationId).run(), /append only/);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM firm_journals WHERE workspace_id=? AND source_type='PETTY_CASH_REPLENISHMENT'`)
    .bind(workspaceId).first<{ count: number }>()?.count, 1, 'idempotent retry must not duplicate the replenishment journal');
  const transferLines = await db.prepare(`SELECT l.account_id,l.debit_minor,l.credit_minor,a.control_type,a.account_type
    FROM firm_journal_lines l JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id
    WHERE l.workspace_id=? AND l.journal_id=? ORDER BY a.control_type`).bind(workspaceId,pettyCashTransfer.body.result.journalId).all<any>();
  assert.deepEqual((transferLines.results??[]).map((line: any) => ({ control: line.control_type, type: line.account_type, debit: line.debit_minor, credit: line.credit_minor })), [
    { control: 'BANK', type: 'ASSET', debit: 0, credit: 30000 },
    { control: 'CASH', type: 'ASSET', debit: 30000, credit: 0 }
  ]);
  const pettyCashExpenseBalance = db.prepare(`SELECT COALESCE(SUM(l.debit_minor-l.credit_minor),0) AS balance
    FROM firm_journal_lines l JOIN firm_journals j ON j.workspace_id=l.workspace_id AND j.id=l.journal_id AND j.status='POSTED'
    JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id
    WHERE l.workspace_id=? AND a.code='5300'`).bind(workspaceId).first<{ balance: number }>()?.balance;
  assert.equal(pettyCashExpenseBalance, 30000, 'replenishment must not add another debit to the petty-cash expense account');
  const pettyCashAssetBalance = db.prepare(`SELECT COALESCE(SUM(l.debit_minor-l.credit_minor),0) AS balance
    FROM firm_journal_lines l JOIN firm_journals j ON j.workspace_id=l.workspace_id AND j.id=l.journal_id AND j.status='POSTED'
    JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id
    WHERE l.workspace_id=? AND a.control_type='CASH'`).bind(workspaceId).first<{ balance: number }>()?.balance;
  assert.equal(pettyCashAssetBalance, 0, 'the QAR 300 disbursement reduces petty cash and the transfer replenishes it exactly once');

  // PRC-004: atomic double-entry journals posted independently and reversed immutably.
  const journalDraft = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'ledger.create-draft', payload: {
      postingDate: planDate, description: 'Recorded practice salaries for the engagement period.',
      sourceType: 'MANUAL',
      lines: [
        { accountId: accountId('5100'), debitMinor: '100000', creditMinor: '0' },
        { accountId: accountId('1000'), debitMinor: '0', creditMinor: '100000' }
      ] } }
  }, reviewerHeaders);
  assert.equal(journalDraft.response.status, 200, JSON.stringify(journalDraft.body));
  const unbalancedDraft = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'ledger.create-draft', payload: {
      postingDate: planDate, description: 'An unbalanced journal must never be accepted.',
      sourceType: 'MANUAL',
      lines: [
        { accountId: accountId('5100'), debitMinor: '100000', creditMinor: '0' },
        { accountId: accountId('1000'), debitMinor: '0', creditMinor: '99999' }
      ] } }
  }, reviewerHeaders);
  assert.equal(unbalancedDraft.response.status, 422, JSON.stringify(unbalancedDraft.body));
  const creatorCannotPost = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'ledger.post', payload: { journalId: journalDraft.body.result.journalId, expectedVersion: 1 } }
  }, reviewerHeaders);
  assert.equal(creatorCannotPost.response.status, 403, 'a journal creator cannot post their own journal');
  const journalPost = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'ledger.post', payload: { journalId: journalDraft.body.result.journalId, expectedVersion: 1 } }
  }, approverHeaders);
  assert.equal(journalPost.response.status, 200, JSON.stringify(journalPost.body));
  const journalReverse = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'ledger.reverse', payload: {
      journalId: journalDraft.body.result.journalId, postingDate: planDate,
      reason: 'The recorded payroll figure was corrected; the posted original stays immutable.' } }
  }, reviewerHeaders);
  assert.equal(journalReverse.response.status, 200, JSON.stringify(journalReverse.body));

  // PRC-005: partner withdrawals are equity movements, never operating expenses. A second
  // Partner approves the withdrawal because a Partner cannot approve their own.
  const secondPartnerStaff = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staff.create', payload: {
      displayName: 'Second Engagement Partner', naturalPersonKey: `TEST-PERSON-${crypto.randomUUID()}`,
      email: 'second.partner@example.invalid', grade: 'PARTNER' } }
  }, approverHeaders);
  assert.equal(secondPartnerStaff.response.status, 200, JSON.stringify(secondPartnerStaff.body));
  const secondPartnerProfile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'actor-profile.assign', payload: {
      persona: 'APPROVER', staffMemberId: secondPartnerStaff.body.result.staffMemberId } }
  }, approverHeaders);
  assert.equal(secondPartnerProfile.response.status, 200, JSON.stringify(secondPartnerProfile.body));
  const secondPartnerHeaders = { 'X-Test-Session-Profile': secondPartnerProfile.body.result.actorProfileId as string, };
  const secondPartnerCapacity = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.availability.set', payload: {
      staffMemberId: secondPartnerStaff.body.result.staffMemberId, workDate: planDate, scheduledMinutes: 480 } }
  }, approverHeaders);
  assert.equal(secondPartnerCapacity.response.status, 200, JSON.stringify(secondPartnerCapacity.body));
  const expensesBeforeWithdrawal = db.prepare(`SELECT COALESCE(SUM(l.debit_minor-l.credit_minor),0) AS balance
    FROM firm_journal_lines l JOIN firm_journals j ON j.workspace_id=l.workspace_id AND j.id=l.journal_id AND j.status='POSTED'
    JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id AND a.account_type='EXPENSE'
    WHERE l.workspace_id=?`).bind(workspaceId).first<{ balance: number }>()?.balance;
  const selfWithdrawal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'partner-withdrawal.post', payload: {
      partnerStaffId, date: planDate, amountMinor: '10000',
      equityAccountId: accountId('3100'), bankAccountId: accountId('1000'),
      reason: 'A Partner must never approve their own profit withdrawal.' } }
  }, approverHeaders);
  assert.equal(selfWithdrawal.response.status, 403, JSON.stringify(selfWithdrawal.body));
  const withdrawal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'partner-withdrawal.post', payload: {
      partnerStaffId, date: planDate, amountMinor: '30000',
      equityAccountId: accountId('3100'), bankAccountId: accountId('1000'),
      reason: 'Approved Partner profit withdrawal recorded against partner capital.' } }
  }, secondPartnerHeaders);
  assert.equal(withdrawal.response.status, 200, JSON.stringify(withdrawal.body));
  const withdrawalLines = await db.prepare(`SELECT a.account_type,a.control_type,l.debit_minor,l.credit_minor
    FROM firm_journal_lines l JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id
    WHERE l.workspace_id=? AND l.journal_id=? ORDER BY a.control_type`).bind(workspaceId,withdrawal.body.result.journalId).all<any>();
  assert.deepEqual((withdrawalLines.results??[]).map((line: any) => ({ type: line.account_type, control: line.control_type, debit: line.debit_minor, credit: line.credit_minor })), [
    { type: 'ASSET', control: 'BANK', debit: 0, credit: 30000 },
    { type: 'EQUITY', control: 'PARTNER_DRAWINGS', debit: 30000, credit: 0 }
  ]);
  const expensesAfterWithdrawal = db.prepare(`SELECT COALESCE(SUM(l.debit_minor-l.credit_minor),0) AS balance
    FROM firm_journal_lines l JOIN firm_journals j ON j.workspace_id=l.workspace_id AND j.id=l.journal_id AND j.status='POSTED'
    JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id AND a.account_type='EXPENSE'
    WHERE l.workspace_id=?`).bind(workspaceId).first<{ balance: number }>()?.balance;
  assert.equal(expensesAfterWithdrawal, expensesBeforeWithdrawal, 'a Partner withdrawal must not change P&L expenses');

  // PRC-002/003/006: capacity, profitability and bookkeeping report snapshots.
  // Keep one pending entry across the report cutoff, then approve it after the
  // snapshot to prove historical cutoffs preserve pending versus approved time.
  const lateTimeEntryId = crypto.randomUUID(), lateCreatedAt = new Date(Date.now() - 1000).toISOString();
  const lateWorkDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  db.prepare(`INSERT INTO firm_time_entries(id,workspace_id,version,client_id,engagement_id,staff_member_id,work_date,phase,fsli_id,procedure_id,minutes,start_at,end_at,description,billable,status,rate_id,hourly_minor_snapshot,charge_numerator,charge_denominator,submitted_by_actor_id,submitted_at,approved_by_actor_id,approved_at,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?, 'DRAFT',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,?,?)`)
    .bind(lateTimeEntryId,workspaceId,clientId,engagementId,preparerStaff.body.result.staffMemberId,lateWorkDate,'REPORTING',null,null,120,null,null,
      'Prepared a reporting phase entry for a cutoff approval check.',1,preparerProfile.body.result.actorProfileId,lateCreatedAt,lateCreatedAt).run();
  const profitabilityAsOf = new Date().toISOString();
  const profitabilityPath = `/api/workspaces/${workspaceId}/practice/engagements/${engagementId}/profitability`;
  const profitabilityBefore = await call(`${profitabilityPath}?asOf=${encodeURIComponent(profitabilityAsOf)}`, { headers: practiceHeaders });
  assert.equal(profitabilityBefore.response.status, 200, JSON.stringify(profitabilityBefore.body));
  assert.equal(BigInt(profitabilityBefore.body.chargeOutValueMinor), 295000n);
  assert.equal(profitabilityBefore.body.phases.find((phase: any) => phase.phase === 'FIELDWORK')?.varianceMinutes, 210);
  assert.equal(profitabilityBefore.body.phases.find((phase: any) => phase.phase === 'FIELDWORK')?.varianceBps, 5000);
  assert.equal(profitabilityBefore.body.phases.find((phase: any) => phase.phase === 'REPORTING')?.varianceBps, null,
    'zero planned and actual minutes has no percentage');
  assert.equal(profitabilityBefore.body.pendingMinutes >= 120, true, 'unapproved reporting time is included as pending, not approved actual');
  assert.ok(profitabilityBefore.body.acceptedFeeRevisions.length > 0, 'the accepted fee revision history is explicit');
  assert.ok(profitabilityBefore.body.feeProposalRevision > 0 && profitabilityBefore.body.budgetRevision > 0);
  assert.match(profitabilityBefore.body.sourceHash, /^[a-f0-9]{64}$/);
  const profitabilityNoCutoff = await call(profitabilityPath, { headers: practiceHeaders });
  assert.equal(profitabilityNoCutoff.response.status, 422, 'the dedicated profitability endpoint requires an explicit report cutoff');
  const preparerProfitability = await call(`${profitabilityPath}?asOf=${encodeURIComponent(profitabilityAsOf)}`, { headers: preparerHeaders });
  assert.equal(preparerProfitability.response.status, 403, 'profitability details are restricted to a Partner approver');
  const utilization = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'practice.capture-utilization-report', payload: {
      from: planDate, to: planDate, staffMemberIds: [preparerStaff.body.result.staffMemberId]
    } }
  }, approverHeaders);
  assert.equal(utilization.response.status, 200, JSON.stringify(utilization.body));
  assert.equal(utilization.body.result.staffCount, 1);
  const profitability = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'practice.capture-profitability-report', payload: {
      engagementId, asOf: profitabilityAsOf } }
  }, approverHeaders);
  assert.equal(profitability.response.status, 200, JSON.stringify(profitability.body));
  const arAging = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'practice.capture-ar-aging-report', payload: { asOf: planDate, clientId } }
  }, approverHeaders);
  assert.equal(arAging.response.status, 200, JSON.stringify(arAging.body));
  const profitabilityRows = db.prepare(`SELECT id,as_of,charge_out_value_minor,profitability_minor,phase_snapshot_json,source_hash FROM profitability_snapshots WHERE workspace_id=? AND engagement_id=? ORDER BY calculated_at DESC LIMIT 1`)
    .bind(workspaceId, engagementId).first<any>();
  assert.ok(profitabilityRows, 'the profitability snapshot persists against the engagement');
  assert.equal(profitabilityRows.as_of, profitabilityAsOf);
  assert.equal(JSON.parse(profitabilityRows.phase_snapshot_json).find((phase: any) => phase.phase === 'REPORTING')?.actualMinutes, 0);
  const associateRate = db.prepare(`SELECT id,hourly_minor FROM firm_charge_out_rates WHERE workspace_id=? AND grade='ASSOCIATE' AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from DESC,revision DESC LIMIT 1`)
    .bind(workspaceId,lateWorkDate,lateWorkDate).first<any>();
  const lateApprovalAt = new Date(Date.parse(profitabilityAsOf) + 1000).toISOString();
  db.prepare(`UPDATE firm_time_entries SET version=2,status='APPROVED',rate_id=?,hourly_minor_snapshot=?,charge_numerator=?,charge_denominator=60,
      submitted_by_actor_id=?,submitted_at=?,approved_by_actor_id=?,approved_at=?,updated_at=? WHERE workspace_id=? AND id=? AND status='DRAFT'`)
    .bind(associateRate.id,associateRate.hourly_minor,String(BigInt(associateRate.hourly_minor)*120n),preparerProfile.body.result.actorProfileId,lateCreatedAt,
      partnerActorId,lateApprovalAt,lateApprovalAt,workspaceId,lateTimeEntryId).run();
  const laterAsOf = new Date(Date.parse(lateApprovalAt) + 1000).toISOString();
  const historicalProfitability = await call(`${profitabilityPath}?asOf=${encodeURIComponent(profitabilityAsOf)}`, { headers: practiceHeaders });
  const currentProfitability = await call(`${profitabilityPath}?asOf=${encodeURIComponent(laterAsOf)}`, { headers: practiceHeaders });
  assert.equal(historicalProfitability.response.status, 200, JSON.stringify(historicalProfitability.body));
  assert.equal(currentProfitability.response.status, 200, JSON.stringify(currentProfitability.body));
  assert.equal(historicalProfitability.body.pendingMinutes, profitabilityBefore.body.pendingMinutes,
    'a time entry approved after the cutoff remains pending in the historical calculation');
  assert.equal(historicalProfitability.body.phases.find((phase: any) => phase.phase === 'REPORTING')?.actualMinutes, 0);
  const reportingVariance = currentProfitability.body.phases.find((phase: any) => phase.phase === 'REPORTING');
  assert.equal(reportingVariance.actualMinutes, 120);
  assert.equal(reportingVariance.varianceMinutes, 120);
  assert.equal(reportingVariance.varianceBps, null);
  assert.equal(reportingVariance.varianceStatus, 'UNBUDGETED');
  assert.equal(currentProfitability.body.pendingMinutes, profitabilityBefore.body.pendingMinutes - 120);
  const storedSnapshotAfterApproval = db.prepare(`SELECT id,as_of,charge_out_value_minor,profitability_minor,phase_snapshot_json,source_hash FROM profitability_snapshots WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,profitabilityRows.id).first<any>();
  assert.deepEqual(storedSnapshotAfterApproval, profitabilityRows, 'later-approved time does not rewrite an immutable profitability snapshot');
  const practiceData = await call(practicePath, { headers: practiceHeaders });
  assert.equal(practiceData.response.status, 200, JSON.stringify(practiceData.body));
  assert.equal(BigInt(practiceData.body.profitability.chargeOutValueMinor), 295000n,
    'approved Associate, Senior and Manager time is aggregated from exact pinned charge numerators');
  assert.equal(practiceData.body.profitability.phases.reduce((sum: bigint, phase: any) => sum + BigInt(phase.chargeOutValueMinor), 0n), 295000n,
    'residual allocation makes displayed phase totals reconcile to the once-rounded engagement total');
  assert.equal(practiceData.body.profitabilitySnapshots.length, 1, 'partners can review saved profitability snapshots in the practice workspace');
  assert.equal(practiceData.body.profitabilitySnapshots[0].sourceHash, profitabilityRows.source_hash);

  // PRC-006: report routes calculate exact posted-journal balances and honor
  // the posting timestamp cutoff even when a later journal is backdated.
  const zeroActivityAccount = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'ledger.account.create', payload: {
      code: '5999', name: '=SUM(1,1)', accountType: 'EXPENSE', normalSide: 'DEBIT', controlType: 'NONE'
    } }
  }, approverHeaders);
  assert.equal(zeroActivityAccount.response.status, 200, JSON.stringify(zeroActivityAccount.body));
  const reportsAsOf = new Date().toISOString();
  const firmTbPath = `${practicePath}/reports/trial-balance?from=${planDate}&to=${planDate}&asOf=${encodeURIComponent(reportsAsOf)}`;
  const firmProfitLossPath = `${practicePath}/reports/profit-loss?month=${planDate.slice(0, 7)}&asOf=${encodeURIComponent(reportsAsOf)}`;
  const [firmTbBefore, firmProfitLossBefore] = await Promise.all([
    call(firmTbPath, { headers: practiceHeaders }), call(firmProfitLossPath, { headers: practiceHeaders })
  ]);
  assert.equal(firmTbBefore.response.status, 200, JSON.stringify(firmTbBefore.body));
  assert.equal(firmProfitLossBefore.response.status, 200, JSON.stringify(firmProfitLossBefore.body));
  assert.equal(firmTbBefore.body.asOf, reportsAsOf);
  assert.equal(firmTbBefore.body.balanced, true);
  assert.equal(firmTbBefore.body.closingBalanced, true, 'the report exposes exact minor-unit period and closing balance checks');
  assert.deepEqual(firmProfitLossBefore.body.accounts.find((row: any) => row.accountId === zeroActivityAccount.body.result.accountId), {
    accountId: zeroActivityAccount.body.result.accountId, code: '5999', name: '=SUM(1,1)', accountType: 'EXPENSE', amountMinor: '0'
  }, 'monthly P&L retains revenue and expense chart accounts with no posted activity');
  const draftForHistoricalCutoff = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'ledger.create-draft', payload: {
      postingDate: planDate, description: 'Posted-period trial balance and monthly profit test entry.', sourceType: 'REPORT_TEST', lines: [
        { accountId: accountId('1000'), debitMinor: '300000', creditMinor: '0' },
        { accountId: accountId('5000'), debitMinor: '100000', creditMinor: '0' },
        { accountId: accountId('5100'), debitMinor: '400000', creditMinor: '0' },
        { accountId: accountId('3100'), debitMinor: '200000', creditMinor: '0' },
        { accountId: accountId('4000'), debitMinor: '0', creditMinor: '1000000' }
      ] } }
  }, reviewerHeaders);
  assert.equal(draftForHistoricalCutoff.response.status, 200, JSON.stringify(draftForHistoricalCutoff.body));
  const reportsWithDraft = await Promise.all([
    call(firmTbPath, { headers: practiceHeaders }), call(firmProfitLossPath, { headers: practiceHeaders })
  ]);
  assert.equal(reportsWithDraft[0].body.sourceHash, firmTbBefore.body.sourceHash, 'an unposted draft cannot change the trial balance');
  assert.equal(reportsWithDraft[1].body.sourceHash, firmProfitLossBefore.body.sourceHash, 'an unposted draft cannot change monthly P&L');
  const postForHistoricalCutoff = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'ledger.post', payload: { journalId: draftForHistoricalCutoff.body.result.journalId, expectedVersion: 1 } }
  }, approverHeaders);
  assert.equal(postForHistoricalCutoff.response.status, 200, JSON.stringify(postForHistoricalCutoff.body));
  const reportsStillAtOldCutoff = await Promise.all([
    call(firmTbPath, { headers: practiceHeaders }), call(firmProfitLossPath, { headers: practiceHeaders })
  ]);
  assert.equal(reportsStillAtOldCutoff[0].body.sourceHash, firmTbBefore.body.sourceHash,
    'posting a backdated journal later does not rewrite the requested TB cutoff');
  assert.equal(reportsStillAtOldCutoff[1].body.sourceHash, firmProfitLossBefore.body.sourceHash,
    'posting a backdated journal later does not rewrite the requested monthly P&L cutoff');
  const reportsAfterPost = await Promise.all([
    call(`${practicePath}/reports/trial-balance?from=${planDate}&to=${planDate}&asOf=${encodeURIComponent(new Date(Date.now() + 10_000).toISOString())}`, { headers: practiceHeaders }),
    call(`${practicePath}/reports/profit-loss?month=${planDate.slice(0, 7)}&asOf=${encodeURIComponent(new Date(Date.now() + 10_000).toISOString())}`, { headers: practiceHeaders })
  ]);
  assert.equal(BigInt(reportsAfterPost[0].body.debitTotalMinor) - BigInt(firmTbBefore.body.debitTotalMinor), 1_000_000n);
  assert.equal(BigInt(reportsAfterPost[0].body.creditTotalMinor) - BigInt(firmTbBefore.body.creditTotalMinor), 1_000_000n);
  assert.equal(BigInt(reportsAfterPost[1].body.revenueMinor) - BigInt(firmProfitLossBefore.body.revenueMinor), 1_000_000n);
  assert.equal(BigInt(reportsAfterPost[1].body.expenseMinor) - BigInt(firmProfitLossBefore.body.expenseMinor), 500_000n);
  assert.equal(BigInt(reportsAfterPost[1].body.profitMinor) - BigInt(firmProfitLossBefore.body.profitMinor), 500_000n,
    'Partner drawings debit equity and never inflate P&L expenses');
  const reportJournalReversal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'ledger.reverse', payload: {
      journalId: postForHistoricalCutoff.body.result.journalId, postingDate: '2026-10-07',
      reason: 'Reverse this posted report fixture in the following Qatar reporting day.'
    } }
  }, reviewerHeaders);
  assert.equal(reportJournalReversal.response.status, 200, JSON.stringify(reportJournalReversal.body));
  const reportsAfterReversal = await Promise.all([
    call(`${practicePath}/reports/trial-balance?from=${planDate}&to=${planDate}&asOf=${encodeURIComponent(new Date(Date.now() + 10_000).toISOString())}`, { headers: practiceHeaders }),
    call(`${practicePath}/reports/profit-loss?month=${planDate.slice(0, 7)}&asOf=${encodeURIComponent(new Date(Date.now() + 10_000).toISOString())}`, { headers: practiceHeaders })
  ]);
  assert.deepEqual(reportsAfterReversal.map((report: any) => report.response.status), [200, 200]);
  assert.equal(reportsAfterReversal[0].body.rows.find((row: any) => row.code === '4000').periodCreditMinor, reportsAfterPost[0].body.rows.find((row: any) => row.code === '4000').periodCreditMinor,
    'the original-period TB uses the original journal posting date, not its later reversal date');
  assert.equal(reportsAfterReversal[1].body.revenueMinor, firmProfitLossBefore.body.revenueMinor,
    'monthly P&L nets a posted reversal in its actual posting month');
  assert.equal(reportsAfterReversal[1].body.expenseMinor, firmProfitLossBefore.body.expenseMinor,
    'reversed expense debits clear only after the reversal is posted');
  const invalidProfitLossMonth = await call(`${practicePath}/reports/profit-loss?month=2026-13`, { headers: practiceHeaders });
  assert.equal(invalidProfitLossMonth.response.status, 400);

  // PRC-006: collecting an advance invoice remains a balance-sheet event;
  // recognized revenue changes only after a Partner records earned service.
  assert.equal(firmProfitLossBefore.body.revenueMinor, '0',
    'issuing and collecting the advance invoice does not recognize revenue under the deferred policy');
  const advanceInvoiceJournal = db.prepare(`SELECT id,status FROM firm_journals WHERE workspace_id=? AND source_type='INVOICE_ISSUED' AND source_id=?`)
    .bind(workspaceId, issuedInvoice.id).first<any>();
  assert.ok(advanceInvoiceJournal?.id);
  assert.equal(advanceInvoiceJournal.status, 'POSTED');
  const advanceInvoiceJournalLines = db.prepare(`SELECT a.code,l.debit_minor,l.credit_minor FROM firm_journal_lines l
    JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id WHERE l.workspace_id=? AND l.journal_id=? ORDER BY a.code`)
    .bind(workspaceId, advanceInvoiceJournal.id).all<any>().results.map((row: any) => ({ ...row }));
  assert.deepEqual(advanceInvoiceJournalLines, [
    { code: '1100', debit_minor: 125001, credit_minor: 0 },
    { code: '2100', debit_minor: 0, credit_minor: 125001 }
  ], 'advance billing debits Trade Receivables and credits Contract Liability');
  const settledPaymentJournal = db.prepare(`SELECT id,status FROM firm_journals WHERE workspace_id=? AND source_type='PAYMENT' AND source_id=?`)
    .bind(workspaceId, settlement.body.result.paymentId).first<any>();
  assert.equal(settledPaymentJournal?.status, 'POSTED');
  const settledPaymentJournalLines = db.prepare(`SELECT a.code,l.debit_minor,l.credit_minor FROM firm_journal_lines l
    JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id WHERE l.workspace_id=? AND l.journal_id=? ORDER BY a.code`)
    .bind(workspaceId, settledPaymentJournal.id).all<any>().results.map((row: any) => ({ ...row }));
  assert.deepEqual(settledPaymentJournalLines, [
    { code: '1000', debit_minor: 125001, credit_minor: 0 },
    { code: '1100', debit_minor: 0, credit_minor: 125001 }
  ], 'settlement debits Bank and credits Trade Receivables without changing revenue');
  const revenuePolicyView = await call(practicePath, { headers: practiceHeaders });
  assert.equal(revenuePolicyView.response.status, 200, JSON.stringify(revenuePolicyView.body));
  const deferredPolicy = revenuePolicyView.body.revenuePolicies.find((policy: any) => policy.recognitionMethod === 'DEFER_UNTIL_EARNED');
  assert.ok(deferredPolicy?.revision && deferredPolicy?.contentSha256, 'recognition is tied to a versioned approved policy');
  const earnedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const recognizedEarnedAdvance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'revenue.recognize', payload: {
      engagementId, policyId: deferredPolicy.id, date: earnedDate, amountMinor: '125001',
      basis: 'The contracted audit fieldwork and reporting services have been completed.'
    } }
  }, approverHeaders);
  assert.equal(recognizedEarnedAdvance.response.status, 200, JSON.stringify(recognizedEarnedAdvance.body));
  const recognitionJournal = db.prepare(`SELECT status,debit_total_minor,credit_total_minor FROM firm_journals WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, recognizedEarnedAdvance.body.result.journalId).first<any>();
  assert.deepEqual({ ...recognitionJournal }, { status: 'POSTED', debit_total_minor: 125001, credit_total_minor: 125001 });
  const recognitionLines = db.prepare(`SELECT a.code,l.debit_minor,l.credit_minor FROM firm_journal_lines l
    JOIN firm_accounts a ON a.workspace_id=l.workspace_id AND a.id=l.account_id
    WHERE l.workspace_id=? AND l.journal_id=? ORDER BY a.code`).bind(workspaceId, recognizedEarnedAdvance.body.result.journalId).all<any>().results.map((row: any) => ({ ...row }));
  assert.deepEqual(recognitionLines, [
    { code: '2100', debit_minor: 125001, credit_minor: 0 },
    { code: '4000', debit_minor: 0, credit_minor: 125001 }
  ], 'earned-service recognition debits Contract Liability and credits Professional Fees');
  const profitLossAfterRecognition = await call(`${practicePath}/reports/profit-loss?month=${earnedDate.slice(0, 7)}&asOf=${encodeURIComponent(new Date(Date.now() + 10_000).toISOString())}`, { headers: practiceHeaders });
  assert.equal(profitLossAfterRecognition.response.status, 200, JSON.stringify(profitLossAfterRecognition.body));
  assert.equal(BigInt(profitLossAfterRecognition.body.revenueMinor) - BigInt(reportsAfterReversal[1].body.revenueMinor), 125001n,
    'the P&L includes the earned event only after explicit Partner recognition');

  // PRC-002: explicit inclusive Qatar-date utilization reads distinguish recorded work,
  // independently approved actuals, incomplete capacity, and over-capacity work.
  const preparerUtilizationPath = `${practicePath}/utilization?from=${planDate}&to=${planDate}&staffMemberId=${preparerStaff.body.result.staffMemberId}`;
  const preparerUtilization = await call(preparerUtilizationPath, { headers: preparerHeaders });
  assert.equal(preparerUtilization.response.status, 200, JSON.stringify(preparerUtilization.body));
  assert.deepEqual(preparerUtilization.body.period, { from: planDate, to: planDate, timezone: 'Asia/Qatar', inclusive: true });
  assert.equal(preparerUtilization.body.availableMinutes, 360, 'eight scheduled hours less two approved leave hours are available');
  assert.equal(preparerUtilization.body.approvedMinutes, 510, 'only independently approved entries count as approved actual time');
  assert.equal(preparerUtilization.body.approvedBillableMinutes, 510);
  assert.equal(preparerUtilization.body.approvedNonbillableMinutes, 0);
  assert.ok(preparerUtilization.body.recordedMinutes > preparerUtilization.body.approvedMinutes,
    'draft and submitted work is visible as recorded without inflating approved actuals');
  assert.equal(preparerUtilization.body.utilizationBps, 14167, 'approved billable work above capacity remains above 100%, rounded to basis points');
  assert.equal(preparerUtilization.body.resultReason, 'CALCULATED');
  assert.match(preparerUtilization.body.sourceHash, /^[a-f0-9]{64}$/);
  assert.ok(preparerUtilization.body.calculatedAt && preparerUtilization.body.sourceUpdatedAt,
    'the response exposes calculation and underlying-source freshness timestamps');
  const preparerCannotReadColleagueUtilization = await call(`${practicePath}/utilization?from=${planDate}&to=${planDate}&staffMemberId=${secondPartnerStaff.body.result.staffMemberId}`, { headers: preparerHeaders });
  assert.equal(preparerCannotReadColleagueUtilization.response.status, 403, 'preparer reads are restricted to their own staff record');
  const missingCapacityUtilization = await call(`${practicePath}/utilization?from=${planDate}&to=2026-10-07&staffMemberId=${preparerStaff.body.result.staffMemberId}`, { headers: preparerHeaders });
  assert.equal(missingCapacityUtilization.response.status, 200, JSON.stringify(missingCapacityUtilization.body));
  assert.equal(missingCapacityUtilization.body.resultReason, 'MISSING_CAPACITY');
  assert.equal(missingCapacityUtilization.body.utilizationBps, null, 'a partial capacity denominator never produces a misleading percentage');
  assert.deepEqual(missingCapacityUtilization.body.missingCapacityDates, ['2026-10-07']);
  const zeroCapacityStaff = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staff.create', payload: {
      displayName: 'Zero Capacity Utilization Staff', naturalPersonKey: `TEST-ZERO-CAPACITY-${crypto.randomUUID()}`,
      email: `zero.capacity.${crypto.randomUUID()}@example.invalid`, grade: 'ASSOCIATE' } }
  }, approverHeaders);
  assert.equal(zeroCapacityStaff.response.status, 200, JSON.stringify(zeroCapacityStaff.body));
  const zeroCapacitySet = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.availability.set', payload: {
      staffMemberId: zeroCapacityStaff.body.result.staffMemberId, workDate: planDate, scheduledMinutes: 0 } }
  }, approverHeaders);
  assert.equal(zeroCapacitySet.response.status, 200, JSON.stringify(zeroCapacitySet.body));
  const zeroCapacityUtilization = await call(`${practicePath}/utilization?from=${planDate}&to=${planDate}&staffMemberId=${zeroCapacityStaff.body.result.staffMemberId}`, { headers: approverHeaders });
  assert.equal(zeroCapacityUtilization.response.status, 200, JSON.stringify(zeroCapacityUtilization.body));
  assert.equal(zeroCapacityUtilization.body.availableMinutes, 0);
  assert.equal(zeroCapacityUtilization.body.utilizationBps, null);
  assert.equal(zeroCapacityUtilization.body.resultReason, 'ZERO_AVAILABILITY');

  // PRC-006: the firm trial-balance export renders from an immutable source snapshot.
  const reportExportAsOf = new Date(Date.now() - 1_000).toISOString();
  const [tbAtExportCutoff, profitLossAtExportCutoff] = await Promise.all([
    call(`${practicePath}/reports/trial-balance?from=${planDate}&to=${planDate}&asOf=${encodeURIComponent(reportExportAsOf)}`, { headers: practiceHeaders }),
    call(`${practicePath}/reports/profit-loss?month=${planDate.slice(0, 7)}&asOf=${encodeURIComponent(reportExportAsOf)}`, { headers: practiceHeaders })
  ]);
  assert.equal(tbAtExportCutoff.response.status, 200, JSON.stringify(tbAtExportCutoff.body));
  assert.equal(profitLossAtExportCutoff.response.status, 200, JSON.stringify(profitLossAtExportCutoff.body));
  const exportRequest = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'practice.export-report', payload: {
      kind: 'TRIAL_BALANCE', periodStart: planDate, periodEnd: planDate, asOf: reportExportAsOf, format: 'CSV' } }
  }, approverHeaders);
  assert.equal(exportRequest.response.status, 200, JSON.stringify(exportRequest.body));
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const exportJob = db.prepare('SELECT status,result_file_id,last_error_code FROM outbox_jobs WHERE workspace_id=? AND id=?')
    .bind(workspaceId, exportRequest.body.result.jobId).first<any>();
  assert.equal(exportJob?.status, 'SUCCEEDED', JSON.stringify(exportJob));
  assert.ok(exportJob?.result_file_id, 'the export commits a real downloadable artifact');
  const exportFile = db.prepare('SELECT object_key FROM file_versions WHERE workspace_id=? AND id=?')
    .bind(workspaceId, exportJob.result_file_id).first<any>();
  const exportObject = await env.FILES.get(exportFile.object_key);
  assert.ok(exportObject, 'the committed report bytes remain available in object storage');
  const exportCsv = new TextDecoder().decode(await exportObject!.arrayBuffer());
  assert.ok(exportCsv.includes("'=SUM(1,1)"), 'CSV escapes formula-leading account names before spreadsheet import');
  const reportSnapshot = db.prepare('SELECT rows_snapshot_json,as_of,journal_cutoff_hash FROM firm_report_snapshots WHERE workspace_id=? AND id=?')
    .bind(workspaceId, exportRequest.body.result.reportSnapshotId).first<any>();
  assert.equal(reportSnapshot.journal_cutoff_hash, tbAtExportCutoff.body.sourceHash);
  assert.equal(reportSnapshot.journal_cutoff_hash, exportRequest.body.result.sourceHash);
  assert.equal(reportSnapshot.as_of, reportExportAsOf, 'the TB export reuses the displayed report cutoff exactly');
  assert.equal(JSON.parse(reportSnapshot.rows_snapshot_json).asOf, reportSnapshot.as_of);
  assert.ok(exportCsv.includes(`\"As of (UTC)\",\"${reportSnapshot.as_of}\"`), 'CSV carries the exact immutable report cutoff');
  const tbSnapshot = JSON.parse(reportSnapshot.rows_snapshot_json);
  assert.equal(tbSnapshot.debitTotalMinor, tbAtExportCutoff.body.debitTotalMinor);
  assert.equal(tbSnapshot.creditTotalMinor, tbAtExportCutoff.body.creditTotalMinor);
  assert.ok(exportCsv.includes(`\"Period debit total (QAR minor)\",\"${tbSnapshot.debitTotalMinor}\"`));
  assert.ok(exportCsv.includes(`\"Period credit total (QAR minor)\",\"${tbSnapshot.creditTotalMinor}\"`));

  const reportMonthStart = `${planDate.slice(0, 7)}-01`;
  const reportMonthEnd = new Date(Date.UTC(Number(planDate.slice(0, 4)), Number(planDate.slice(5, 7)), 0)).toISOString().slice(0, 10);
  for (const format of ['CSV', 'XLSX', 'PDF'] as const) {
    const profitLossExport = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'practice.export-report', payload: {
        kind: 'MONTHLY_PROFIT_LOSS', periodStart: reportMonthStart, periodEnd: reportMonthEnd, asOf: reportExportAsOf, format
      } }
    }, approverHeaders);
    assert.equal(profitLossExport.response.status, 200, JSON.stringify(profitLossExport.body));
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
    const profitLossJob = db.prepare('SELECT status,result_file_id,last_error_code FROM outbox_jobs WHERE workspace_id=? AND id=?')
      .bind(workspaceId, profitLossExport.body.result.jobId).first<any>();
    assert.equal(profitLossJob?.status, 'SUCCEEDED', JSON.stringify(profitLossJob));
    const profitLossFile = db.prepare('SELECT object_key,media_type FROM file_versions WHERE workspace_id=? AND id=?')
      .bind(workspaceId, profitLossJob.result_file_id).first<any>();
    const profitLossObject = await env.FILES.get(profitLossFile.object_key);
    assert.ok(profitLossObject, `${format} P&L bytes are stored and readable`);
    const bytes = new Uint8Array(await profitLossObject!.arrayBuffer());
    const snapshot = db.prepare('SELECT rows_snapshot_json,period_start,period_end,as_of,journal_cutoff_hash FROM firm_report_snapshots WHERE workspace_id=? AND id=?')
      .bind(workspaceId, profitLossExport.body.result.reportSnapshotId).first<any>();
    const snapshotData = JSON.parse(snapshot.rows_snapshot_json);
    assert.equal(snapshotData.asOf, snapshot.as_of);
    assert.equal(snapshot.as_of, reportExportAsOf, 'the export reuses the displayed report cutoff exactly');
    assert.equal(snapshot.journal_cutoff_hash, profitLossAtExportCutoff.body.sourceHash);
    assert.equal(snapshot.journal_cutoff_hash, profitLossExport.body.result.sourceHash);
    assert.deepEqual({ revenue: snapshotData.revenueMinor, expenses: snapshotData.expenseMinor, profit: snapshotData.profitMinor }, {
    revenue: profitLossAtExportCutoff.body.revenueMinor, expenses: profitLossAtExportCutoff.body.expenseMinor, profit: profitLossAtExportCutoff.body.profitMinor
    }, 'the persisted P&L snapshot preserves the selected report projection and cutoff');
    if (format === 'CSV') {
      const csv = new TextDecoder().decode(bytes);
      assert.ok(csv.includes(`\"Revenue total (QAR minor)\",\"${snapshotData.revenueMinor}\"`));
      assert.ok(csv.includes(`\"Expense total (QAR minor)\",\"${snapshotData.expenseMinor}\"`));
      assert.ok(csv.includes(`\"Profit total (QAR minor)\",\"${snapshotData.profitMinor}\"`));
      assert.ok(csv.includes("'=SUM(1,1)"));
    } else if (format === 'XLSX') {
      const workbook = XLSX.read(bytes, { type: 'array' });
      const sheet = workbook.Sheets['Profit and Loss'];
      assert.ok(sheet, 'the XLSX contains the monthly P&L worksheet');
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });
      const zeroAccountRow = grid.find(row => row[0] === '5999');
      assert.equal(zeroAccountRow?.[3], '0', 'the XLSX retains zero-activity accounts');
      const zeroAccountRowIndex = grid.findIndex(row => row[0] === '5999');
      const accountNameCell = sheet[`B${zeroAccountRowIndex + 1}`] as XLSX.CellObject | undefined;
      assert.equal(accountNameCell?.v, '=SUM(1,1)');
      assert.equal(accountNameCell?.f, undefined, 'an account name beginning with = stays a string, not a formula');
      assert.ok(grid.some(row => row[0] === 'Profit total (QAR minor)' && row[1] === snapshotData.profitMinor));
    } else {
      const pdf = Buffer.from(bytes);
      assert.ok(pdf.subarray(0, 8).toString('latin1').startsWith('%PDF-'));
      const content = decodedPdfContent(bytes);
      assert.ok(content.includes(`Period ${snapshot.period_start} to ${snapshot.period_end}; as of UTC ${snapshot.as_of}.`));
      assert.ok(content.includes(`Revenue ${snapshotData.revenueMinor} minor units; expenses ${snapshotData.expenseMinor} minor units; profit ${snapshotData.profitMinor} minor units.`));
    }
  }

  // PRC-007: a partial allocation reversal increases invoice AR and returns the same
  // verified amount to unallocated cash without touching the issued commercial record.
  const settlementAllocation = db.prepare('SELECT id FROM payment_allocations WHERE workspace_id=? AND payment_id=? ORDER BY allocated_on DESC,id DESC LIMIT 1')
    .bind(workspaceId, settlement.body.result.paymentId).first<any>();
  assert.ok(settlementAllocation?.id, 'the settled advance payment carries an active allocation');
  const arAsOfDate = String(issuedInvoice.issueDate);
  assert.match(arAsOfDate, /^\d{4}-\d{2}-\d{2}$/, 'the issued invoice supplies its effective accounting date');
  const beforeAllocationReversal = await call(`${practicePath}?asOfDate=${arAsOfDate}`, { headers: practiceHeaders });
  assert.equal(beforeAllocationReversal.response.status, 200, JSON.stringify(beforeAllocationReversal.body));
  assert.equal(beforeAllocationReversal.body.arAging.asOf, arAsOfDate, 'AR aging uses the independently selected Qatar cutoff');
  const agedAdvance = beforeAllocationReversal.body.arAging.invoices.find((row: any) => row.invoiceId === issuedInvoice.id);
  assert.ok(agedAdvance, 'the advance invoice remains a separate aging row');
  assert.equal(agedAdvance.kind, 'ADVANCE');
  const issuedInvoiceSource = db.prepare('SELECT fee_revision_id,total_minor FROM invoices WHERE workspace_id=? AND id=?').bind(workspaceId, issuedInvoice.id).first<any>();
  assert.equal(agedAdvance.feeRevisionId, issuedInvoiceSource.fee_revision_id, 'the issued installment retains its original accepted fee revision');
  assert.equal(agedAdvance.totalMinor, String(issuedInvoiceSource.total_minor));
  assert.equal(BigInt(agedAdvance.totalMinor), BigInt(agedAdvance.paidMinor) + BigInt(agedAdvance.creditedMinor) + BigInt(agedAdvance.outstandingMinor),
    'issued amount reconciles exactly to paid, credited and outstanding minor units');
  const futurePaymentId = crypto.randomUUID();
  db.prepare(`INSERT INTO payments(id,workspace_id,version,client_id,engagement_id,amount_minor,received_on,method,reference,evidence_file_id,verified_by_actor_id,reverses_payment_id,created_at)
    VALUES(?,?,1,?,?,50000,'2099-01-01','BANK_TRANSFER',?,?,?,NULL,?)`)
    .bind(futurePaymentId,workspaceId,clientId,engagementId,`QA-FUTURE-${futurePaymentId}`,evidenceFileId,partnerActorId,new Date().toISOString()).run();
  const afterFuturePayment = await call(`${practicePath}?asOfDate=${arAsOfDate}`, { headers: practiceHeaders });
  assert.equal(afterFuturePayment.response.status, 200, JSON.stringify(afterFuturePayment.body));
  const advanceAfterFuturePayment = afterFuturePayment.body.arAging.invoices.find((row: any) => row.invoiceId === issuedInvoice.id);
  assert.deepEqual({ paid: advanceAfterFuturePayment.paidMinor, credited: advanceAfterFuturePayment.creditedMinor, outstanding: advanceAfterFuturePayment.outstandingMinor },
    { paid: agedAdvance.paidMinor, credited: agedAdvance.creditedMinor, outstanding: agedAdvance.outstandingMinor },
    'a verified receipt dated after the selected cutoff does not change historical invoice aging');
  assert.equal(afterFuturePayment.body.arAging.unallocatedMinor, beforeAllocationReversal.body.arAging.unallocatedMinor,
    'future cash is not included in historical unallocated receipts');
  const malformedAgingDate = await call(`${practicePath}?asOfDate=2026-02-31`, { headers: practiceHeaders });
  assert.equal(malformedAgingDate.response.status, 422, 'an impossible Qatar aging date is rejected instead of producing a misleading bucket');
  const partialReversal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'payment.reverse-allocation', payload: {
      allocationId: settlementAllocation.id, effectiveDate: arAsOfDate, amountMinor: '50000',
      reason: 'The client overpaid the advance; part of the receipt is re-applied after review.' } }
  }, approverHeaders);
  assert.equal(partialReversal.response.status, 200, JSON.stringify(partialReversal.body));
  const afterAllocationReversal = await call(`${practicePath}?asOfDate=${arAsOfDate}`, { headers: practiceHeaders });
  assert.equal(afterAllocationReversal.response.status, 200, JSON.stringify(afterAllocationReversal.body));
  const priorOutstanding = BigInt(beforeAllocationReversal.body.arAging.invoices.find((row: any) => row.invoiceId === issuedInvoice.id).outstandingMinor);
  const nextOutstanding = BigInt(afterAllocationReversal.body.arAging.invoices.find((row: any) => row.invoiceId === issuedInvoice.id).outstandingMinor);
  assert.equal(nextOutstanding - priorOutstanding, 50000n, 'the original invoice shows the appended allocation reversal');
  assert.equal(BigInt(afterAllocationReversal.body.arAging.unallocatedMinor) - BigInt(beforeAllocationReversal.body.arAging.unallocatedMinor), 50000n,
    'the reversed amount returns to unallocated verified cash');
  assert.equal(afterAllocationReversal.body.arAging.reconciliationStatus, 'INTEGRATION_EXCEPTION',
    'the seeded historical invoice has no opening ledger journal, so the pre-existing difference remains visible');
  assert.equal(afterAllocationReversal.body.arAging.reconciliationDifferenceMinor,
    beforeAllocationReversal.body.arAging.reconciliationDifferenceMinor,
    'the appended allocation reversal increases both subledger AR and posted AR control by the same amount');
  const futureCreditDate = new Date(Date.parse(`${arAsOfDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const futureCredit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'credit-note.issue', payload: {
      invoiceId: issuedInvoice.id, date: futureCreditDate, amountMinor: '1000',
      reason: 'Synthetic future-dated credit verifies historical AR cutoff behavior.'
    } }
  }, approverHeaders);
  assert.equal(futureCredit.response.status, 200, JSON.stringify(futureCredit.body));
  const afterFutureCredit = await call(`${practicePath}?asOfDate=${arAsOfDate}`, { headers: practiceHeaders });
  assert.equal(afterFutureCredit.response.status, 200, JSON.stringify(afterFutureCredit.body));
  const advanceAfterFutureCredit = afterFutureCredit.body.arAging.invoices.find((row: any) => row.invoiceId === issuedInvoice.id);
  const advanceAfterReversal = afterAllocationReversal.body.arAging.invoices.find((row: any) => row.invoiceId === issuedInvoice.id);
  assert.deepEqual({ paid: advanceAfterFutureCredit.paidMinor, credited: advanceAfterFutureCredit.creditedMinor, outstanding: advanceAfterFutureCredit.outstandingMinor },
    { paid: advanceAfterReversal.paidMinor, credited: advanceAfterReversal.creditedMinor, outstanding: advanceAfterReversal.outstandingMinor },
    'a future-dated credit note does not reduce historical invoice aging');

  // FLD-013: exercise the durable confirmation dispatch and response lifecycle,
  // retain an unverified return as a release blocker, and render/send one
  // idempotent Holding Letter for the unchanged outstanding set.
  const criticalConfirmation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'confirmation.create', payload: {
      engagementId, type: 'BANK', fsliId: revenueLine.fsliId,
      externalPartyName: 'Synthetic Test Bank', externalPartyAddress: '1 Example Street, Doha',
      externalPartyEmail: 'bank@example.invalid', recipientVerificationText: 'Verified against the synthetic engagement contact record.',
      critical: true, criticalityReason: 'The balance is individually material to the audit opinion.', dueDate: planDate
    } }
  }, technicalHeaders);
  assert.equal(criticalConfirmation.response.status, 200, JSON.stringify(criticalConfirmation.body));
  const confirmationId = criticalConfirmation.body.result.confirmationId as string;

  const preparerScopeReassessment = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'confirmation.scope-reassess', payload: {
      confirmationId, expectedVersion: 1, rationale: 'The preparer wants to remove a required independent confirmation.',
      replacementCritical: false, replacementCriticalityReason: null
    } }
  }, technicalHeaders);
  assert.equal(preparerScopeReassessment.response.status, 403, JSON.stringify(preparerScopeReassessment.body),
    'a preparer cannot approve a relied-upon scope change');
  assert.equal(db.prepare('SELECT critical FROM confirmations WHERE workspace_id=? AND id=?').bind(workspaceId, confirmationId).first<any>()?.critical, 1,
    'a denied reassessment leaves criticality unchanged');

  const confirmationDeliveries: Array<{ to: string; purpose: string; attachmentBytes: Uint8Array }> = [];
  env.EMAIL_PROVIDER = { fetch: async (request: Request) => {
    const form = await request.formData();
    const message = JSON.parse(String(form.get('message')));
    const attachment = form.get('attachment');
    assert.ok(attachment && typeof attachment !== 'string');
    confirmationDeliveries.push({ to: message.to, purpose: message.purpose, attachmentBytes: new Uint8Array(await attachment.arrayBuffer()) });
    assert.ok(request.headers.get('Idempotency-Key'), 'provider calls use the durable outbox idempotency key');
    return Response.json({ messageId: `local-confirmation-provider-${confirmationDeliveries.length}` }, { status: 202 });
  } };

  const queuedConfirmation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'confirmation.dispatch', payload: { confirmationId, expectedVersion: 1 } }
  }, technicalHeaders);
  assert.equal(queuedConfirmation.response.status, 202, JSON.stringify(queuedConfirmation.body));
  assert.equal(queuedConfirmation.body.result.status, 'QUEUED');
  assert.ok(queuedConfirmation.body.result.dispatchId);
  assert.throws(() => db.prepare('UPDATE confirmations SET critical=0 WHERE workspace_id=? AND id=?').bind(workspaceId, confirmationId).run(),
    /relied-upon confirmation scope is frozen/, 'the database freezes relied-upon scope after queueing');

  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const generatedConfirmation = db.prepare(`SELECT d.status AS dispatch_status,d.file_version_id,a.id AS artifact_id,f.media_type,f.sha256
    FROM confirmations c JOIN dispatches d ON d.workspace_id=c.workspace_id AND d.id=c.dispatch_id
    JOIN generated_artifacts a ON a.workspace_id=d.workspace_id AND a.file_version_id=d.file_version_id
    JOIN file_versions f ON f.workspace_id=a.workspace_id AND f.id=a.file_version_id
    WHERE c.workspace_id=? AND c.id=?`).bind(workspaceId, confirmationId).first<any>();
  assert.equal(generatedConfirmation?.dispatch_status, 'QUEUED');
  assert.equal(generatedConfirmation?.media_type, 'application/pdf');
  assert.ok(generatedConfirmation?.artifact_id, 'the queued request generated a retained PDF artifact');
  const generatedBytes = r2Objects.get(String(db.prepare('SELECT object_key FROM file_versions WHERE workspace_id=? AND id=?')
    .bind(workspaceId, generatedConfirmation.file_version_id).first<any>()?.object_key));
  assert.ok(new TextDecoder().decode(generatedBytes?.slice(0, 8)).startsWith('%PDF-'), 'the dispatched confirmation contains real generated PDF bytes');
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  assert.equal(db.prepare('SELECT status FROM confirmations WHERE workspace_id=? AND id=?').bind(workspaceId, confirmationId).first<any>()?.status, 'SENT',
    'the confirmation becomes SENT only after the email provider accepts the dispatch');
  assert.ok(confirmationDeliveries.some(message => message.to === 'bank@example.invalid' && message.purpose === 'CONFIRMATION'),
    'the real generated request is sent to the pinned third-party recipient');

  const unverifiedResponse = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'confirmation.record-response', payload: {
      confirmationId, expectedVersion: 3, responseFileId: fileId, returnedAt: new Date(Date.now() - 1000).toISOString()
    } }
  }, technicalHeaders);
  assert.equal(unverifiedResponse.response.status, 200, JSON.stringify(unverifiedResponse.body));
  assert.equal(unverifiedResponse.body.result.status, 'RETURNED_UNVERIFIED');

  const alternativeProcedure = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'confirmation.alternative-procedure', payload: {
      confirmationId, evidenceFileId: fileId,
      rationale: 'The alternate bank-statement procedure is separately documented while the direct return awaits independent verification.'
    } }
  }, technicalHeaders);
  assert.equal(alternativeProcedure.response.status, 200, JSON.stringify(alternativeProcedure.body));
  assert.equal(alternativeProcedure.body.result.criticalGateWaived, false);

  const gateEngagement = db.prepare(`SELECT id,version,client_id,active_tb_version_id,active_mapping_version_id,active_materiality_version_id
    FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId, engagementId).first<any>();
  const blockers = await criticalConfirmationBlockers(env, workspaceId, gateEngagement);
  assert.equal(blockers.length, 1, 'the outstanding critical confirmation is detected at release time');
  assert.equal(blockers[0].status, 'RETURNED_UNVERIFIED', 'uploading a response without independent verification still blocks release');

  const queuedHoldingLetter = await queueHoldingLetterForBlockers(env, workspaceId, {} as any, gateEngagement,
    crypto.randomUUID(), new Date().toISOString(), blockers, 409);
  assert.equal(queuedHoldingLetter.responseStatus, 409, 'the blocked release persists its required HTTP status');
  assert.equal(queuedHoldingLetter.result.blocked, true);
  assert.ok(queuedHoldingLetter.result.holdingLetterJobId);
  await db.batch([...queuedHoldingLetter.statements, db.prepare('DELETE FROM command_assertions WHERE workspace_id=?').bind(workspaceId)]);

  for (let retry = 1; retry <= 3; retry += 1) {
    const replayedHoldingLetter = await queueHoldingLetterForBlockers(env, workspaceId, {} as any, gateEngagement,
      crypto.randomUUID(), new Date().toISOString(), blockers, 409);
    assert.equal(replayedHoldingLetter.responseStatus, 409);
    assert.equal(replayedHoldingLetter.result.holdingLetterJobId, queuedHoldingLetter.result.holdingLetterJobId,
      `blocked release retry ${retry} reuses its Holding Letter job`);
    assert.equal(replayedHoldingLetter.result.holdingLetterReused, true);
    await db.batch([...replayedHoldingLetter.statements, db.prepare('DELETE FROM command_assertions WHERE workspace_id=?').bind(workspaceId)]);
  }
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM outbox_jobs WHERE workspace_id=? AND deduplication_key LIKE 'holding-letter:%'`)
    .bind(workspaceId).first<any>()?.count, 1);
  const httpBlockedRelease = businessCommandHttpResult({ commandId: crypto.randomUUID(), replayed: false, result: queuedHoldingLetter.result },
    'report.release', queuedHoldingLetter.responseStatus, 'test-request');
  assert.equal(httpBlockedRelease.status, 409);
  assert.deepEqual(httpBlockedRelease.body, {
    code: 'GATE_BLOCKED', message: 'Critical confirmation clearance changed after bundle preparation.',
    details: { criticalConfirmationIds: [blockers[0].id], holdingLetterJobId: queuedHoldingLetter.result.holdingLetterJobId,
      blockers: queuedHoldingLetter.result.blockers },
    requestId: 'test-request'
  });
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const holdingLetter = db.prepare(`SELECT h.id,h.artifact_id,h.dispatch_id,a.file_version_id,f.object_key,f.media_type,f.immutable,d.status AS dispatch_status
    FROM holding_letters h JOIN generated_artifacts a ON a.workspace_id=h.workspace_id AND a.id=h.artifact_id
    JOIN file_versions f ON f.workspace_id=a.workspace_id AND f.id=a.file_version_id
    JOIN dispatches d ON d.workspace_id=h.workspace_id AND d.id=h.dispatch_id
    WHERE h.workspace_id=? AND h.engagement_id=?`).bind(workspaceId, engagementId).first<any>();
  assert.ok(holdingLetter?.id, 'a Holding Letter record is created from the outstanding-set snapshot');
  assert.equal(holdingLetter.media_type, 'application/pdf');
  assert.equal(holdingLetter.immutable, 1);
  assert.equal(holdingLetter.dispatch_status, 'ACCEPTED');
  assert.ok(new TextDecoder().decode(r2Objects.get(holdingLetter.object_key)?.slice(0, 8)).startsWith('%PDF-'),
    'the Holding Letter pipeline retains verified PDF bytes');
  assert.ok(confirmationDeliveries.some(message => message.purpose === 'HOLDING_LETTER'),
    'the generated Holding Letter is delivered through the email outbox');

  const independentlyVerified = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'confirmation.verify', payload: {
      confirmationId, expectedVersion: 4,
      verificationRationale: 'The reviewer independently matched the returned bank confirmation to the verified recipient and retained evidence.'
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(independentlyVerified.response.status, 200, JSON.stringify(independentlyVerified.body));
  assert.equal(independentlyVerified.body.result.status, 'RETURNED_VERIFIED');
  assert.equal((await criticalConfirmationBlockers(env, workspaceId, gateEngagement)).length, 0,
    'independent verification satisfies the critical return gate');

  const partnerReassessment = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'confirmation.scope-reassess', payload: {
      confirmationId, expectedVersion: 5, rationale: 'Partner reassessed the confirmation scope and approved a noncritical replacement after reviewing the evidence.',
      replacementCritical: false, replacementCriticalityReason: null
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(partnerReassessment.response.status, 200, JSON.stringify(partnerReassessment.body));
  assert.equal(partnerReassessment.body.result.status, 'CANCELLED');
  const reassessedConfirmation = db.prepare('SELECT status,version,scope_approval_id FROM confirmations WHERE workspace_id=? AND id=?')
    .bind(workspaceId, confirmationId).first<any>();
  assert.equal(reassessedConfirmation.scope_approval_id, partnerReassessment.body.result.reassessmentId,
    'the relied-upon confirmation retains its immutable Partner scope approval reference');
  const scopeApproval = db.prepare(`SELECT subject_type,subject_id,subject_version,decision,rationale FROM approval_decisions WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, reassessedConfirmation.scope_approval_id).first<any>();
  assert.deepEqual({ ...scopeApproval }, {
    subject_type: 'CONFIRMATION_SCOPE', subject_id: confirmationId, subject_version: 6, decision: 'APPROVE',
    rationale: 'Partner reassessed the confirmation scope and approved a noncritical replacement after reviewing the evidence.'
  });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM approval_dependencies WHERE workspace_id=? AND approval_id=?')
    .bind(workspaceId, reassessedConfirmation.scope_approval_id).first<any>()?.count, 2,
    'the Partner decision pins both the prior and replacement confirmation scopes');
  const reassessedWorkspace = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/fieldwork-workspace`, { headers: technicalHeaders });
  assert.equal(reassessedWorkspace.response.status, 200, JSON.stringify(reassessedWorkspace.body));
  assert.equal(reassessedWorkspace.body.confirmations.find((row: any) => row.id === confirmationId)?.scopeApprovalId, reassessedConfirmation.scope_approval_id,
    'the fieldwork workspace exposes the retained Partner approval reference');
  assert.equal(reassessedWorkspace.body.confirmationReassessments.some((row: any) => row.id === reassessedConfirmation.scope_approval_id), true,
    'the fieldwork workspace exposes the reasoned reassessment record');
  assert.equal((await criticalConfirmationBlockers(env, workspaceId, gateEngagement)).length, 0,
    'the reassessed noncritical replacement is not treated as a critical-return waiver');
  assert.equal(businessCommandHttpResult({ result: {} }, 'proposal.dispatch', 200, 'test-request').status, 202,
    'a legacy 200 receipt still receives the normal asynchronous command status');

  const futureIfrsLead = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'lead.create', payload: {
      clientId, primaryContactId: financeContactId, source: 'REFERRAL', receivedAt: '2026-10-05T09:05:00Z',
      requestedService: 'STATUTORY_AUDIT', periodStart: '2027-01-01', periodEnd: '2027-12-31', estimatedFeeMinor: '100000'
    } }
  }, preparerHeaders);
  assert.equal(futureIfrsLead.response.status, 200, JSON.stringify(futureIfrsLead.body));
  const futureIfrsConversion = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'lead.convert', payload: {
      leadId: futureIfrsLead.body.result.leadId, expectedVersion: 1, engagementCode: 'E2027-IAS1-BLOCKED',
      standardsProfileId: actualStandardsProfileId, contractFeeMinor: '100000'
    } }
  }, preparerHeaders);
  assert.equal(futureIfrsConversion.response.status, 409, JSON.stringify(futureIfrsConversion.body));
  assert.equal(futureIfrsConversion.body.code, 'GATE_BLOCKED');
  assert.match(futureIfrsConversion.body.message, /select IFRS 18/);
  assert.equal(db.prepare('SELECT status FROM leads WHERE workspace_id=? AND id=?')
    .bind(workspaceId, futureIfrsLead.body.result.leadId).first<any>()?.status, 'OPEN',
    'an IAS 1 profile cannot convert a full-IFRS engagement starting in 2027 or advance its lead');

  // Simulate a legacy event that has scope metadata in an unknown shape. A
  // client-filtered reader must resynchronize rather than silently skip it.
  const legacyUnscopedEvent = db.prepare(`SELECT id,sequence FROM audit_events WHERE workspace_id=? AND entity_id=?`)
    .bind(workspaceId, scopedStaff.body.result.staffMemberId).first<any>();
  assert.ok(legacyUnscopedEvent, 'the fixture has a workspace-level audit event to model legacy metadata');
  db.prepare('DROP TRIGGER audit_events_no_update').run();
  db.prepare(`UPDATE audit_events SET details_json=? WHERE workspace_id=? AND id=?`)
    .bind(JSON.stringify({ scope: { legacyVersion: 1 } }), workspaceId, legacyUnscopedEvent.id).run();
  const legacyScopeFeed = await call(`/api/workspaces/${workspaceId}/changes?after=${legacyUnscopedEvent.sequence - 1}`, {
    headers: { ...preparerHeaders, 'X-Client-Id': clientId }
  });
  assert.equal(legacyScopeFeed.response.status, 200, JSON.stringify(legacyScopeFeed.body));
  assert.equal(legacyScopeFeed.body.resyncRequired, true,
    'unknown structured scope metadata must not be mistaken for a known workspace-only event');
  assert.deepEqual(legacyScopeFeed.body.events, []);
});
