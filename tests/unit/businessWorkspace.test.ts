import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { businessCommandHttpResult } from '../../worker/index.js';
import { criticalConfirmationBlockers, queueHoldingLetterForBlockers } from '../../worker/businessFieldwork.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
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
  BUSINESS_SETUP_ENABLED: 'true'
} as any;

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
      actor: { actorId: headers.get('X-Actor-Id'), persona: headers.get('X-Active-Persona') },
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
  const request = new Request(`https://local.auditsphere.test${path}`, {
    method,
    headers,
    ...(options.payload === undefined ? {} : { body: JSON.stringify(payload) })
  });
  const response = await worker.fetch(request, env, {} as any);
  return { response, body: await response.json() };
}

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  call(path, { method: 'POST', payload, headers });

it('bootstraps a no-session BUSINESS workspace and maintains atomic directory profiles', async () => {
  const live = await call('/api/health/live');
  assert.equal(live.response.status, 200);
  assert.deepEqual(live.body, { status: 'ok' });
  const ready = await call('/api/health/ready');
  assert.equal(ready.response.status, 200, JSON.stringify(ready.body));
  assert.equal(ready.body.status, 'ready');
  assert.equal(ready.body.schemaVersion, 29);
  assert.deepEqual(ready.body.dependencyCodes, []);
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
  env.BUSINESS_SETUP_ENABLED = 'false';
  const disabled = await post('/api/workspaces', input, { 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(disabled.response.status, 503);
  env.BUSINESS_SETUP_ENABLED = 'true';

  const bootstrapKey = crypto.randomUUID();
  const created = await post('/api/workspaces', input, { 'Idempotency-Key': bootstrapKey });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.equal(created.response.headers.get('set-cookie'), null, 'BUSINESS setup must not create a session cookie');
  assert.match(created.body.workspaceId, /^[a-f0-9-]{36}$/);
  assert.match(created.body.staffMemberId, /^[a-f0-9-]{36}$/);
  assert.match(created.body.actorProfileId, /^[a-f0-9-]{36}$/);
  const workspaceId = created.body.workspaceId as string;

  const migrationStatus = await call(`/api/workspaces/${workspaceId}/migration-status`);
  assert.equal(migrationStatus.response.status, 200, JSON.stringify(migrationStatus.body));
  assert.deepEqual(migrationStatus.body, { schemaVersion: 29, lastRunId: null, status: null });
  const missingMigrationWorkspace = await call(`/api/workspaces/${crypto.randomUUID()}/migration-status`);
  assert.equal(missingMigrationWorkspace.response.status, 404);

  const replay = await post('/api/workspaces', input, { 'Idempotency-Key': bootstrapKey });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.workspaceId, workspaceId);
  assert.equal(replay.body.replayed, true);
  const keyReuse = await post('/api/workspaces', { ...input, name: 'Different request' }, { 'Idempotency-Key': bootstrapKey });
  assert.equal(keyReuse.response.status, 409);
  assert.equal(keyReuse.body.code, 'IDEMPOTENCY_MISMATCH');

  const stored = db.prepare(`SELECT w.data_mode,w.seed_id,w.business_status,
      (SELECT COUNT(*) FROM workspace_entities WHERE workspace_id=w.id) AS generic_entities,
      (SELECT COUNT(*) FROM test_workspace_expiry WHERE workspace_id=w.id) AS test_expiries,
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
  assert.equal(stored.generic_entities, 0, 'bootstrap must not materialize generic PrototypeState records');
  assert.equal(stored.test_expiries, 0);
  assert.equal(stored.event_count, 1);
  assert.equal(stored.actor_assurance, 'SYSTEM');
  assert.equal(stored.event_source, 'JOB');
  assert.equal(stored.event_type, 'BOOTSTRAP');

  const profiles = await call(`/api/workspaces/${workspaceId}/actor-profiles`);
  assert.equal(profiles.response.status, 200, JSON.stringify(profiles.body));
  assert.deepEqual(profiles.body.items.map((profile: any) => profile.persona), ['APPROVER']);
  const approverHeaders = { 'X-Actor-Id': created.body.actorProfileId, 'X-Active-Persona': 'APPROVER' };
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
    'directory.manage', 'client.read', 'client.manage', 'lead.read', 'lead.manage', 'lead.convert', 'engagement.read', 'engagement.advance', 'standards.read', 'standards.manage', 'file.read', 'file.upload', 'proposal.read', 'proposal.create', 'proposal.generate', 'proposal.approve', 'proposal.dispatch', 'firm.manage', 'risk.read', 'riskAssessment.draft', 'riskAssessment.submit', 'riskAssessment.resolveEscalation', 'risk.clear', 'commercialAcceptance.read', 'engagementLetter.manage', 'invoice.issue', 'payment.record', 'payment.reverse', 'billing.read', 'pbc.read', 'pbc.manage', 'pbc.review', 'planning.read', 'staffing.manage', 'tb.manage', 'fieldwork.read', 'fieldwork.manage', 'fieldwork.review', 'sampling.manage', 'evidence.review', 'practice.read', 'practice.manage', 'practice.approve', 'ledger.read', 'ledger.manage', 'ledger.post', 'reporting.read', 'reporting.prepare', 'reporting.approve', 'reporting.release'
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
  const reviewerHeaders = { 'X-Actor-Id': reviewerId, 'X-Active-Persona': 'REVIEWER' };

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
  const preparerHeaders = { 'X-Actor-Id': preparerProfile.body.result.actorProfileId as string, 'X-Active-Persona': 'PREPARER' };
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
  assert.equal(undocumentedAlternate.response.status, 400);
  assert.equal(undocumentedAlternate.body.code, 'BAD_REQUEST');
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
  const clientHeaders = { 'X-Actor-Id': clientProfile.body.result.actorProfileId as string, 'X-Active-Persona': 'CLIENT' };
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
  const pbcClientIdentity = { 'X-Actor-Id': pbcClientProfile.body.result.actorProfileId as string, 'X-Active-Persona': 'CLIENT' };

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
  const advance = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'engagement.advance', payload: {
      engagementId: conversion.body.result.engagementId, expectedVersion: 1, expectedState: 'LEAD_INGESTION'
    } }
  }, preparerHeaders);
  assert.equal(advance.response.status, 200, JSON.stringify(advance.body));
  assert.equal(advance.body.result.state, 'PROPOSAL_GENERATION');
  const engagementId = conversion.body.result.engagementId as string;
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
        'X-File-Version': '1', 'Content-Type': 'application/pdf'
      },
      body: bytes
    });
    const response = await worker.fetch(uploadRequest, env, {} as any);
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
  const download = await worker.fetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${fileId}`, { headers: preparerHeaders }), env, {} as any);
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

  const firmProfile = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'firm-profile.save', payload: {
      expectedVersion: null, legalName: 'Local Audit Partners WLL', registrationNumber: 'CR-LOCAL-001',
      address: 'Doha, Qatar', profileText: 'Independent assurance and advisory services for Qatar entities.',
      methodologyText: 'The firm performs a risk-based engagement using its approved methodology and documented professional review.'
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
  const cvUpload = await worker.fetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${cvReservation.body.fileId}/content`, {
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
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.create', payload: { ...proposalTerms, expectedEngagementVersion: advance.body.result.version } }
  }, reviewerHeaders);
  assert.equal(proposal.response.status, 200, JSON.stringify(proposal.body));
  assert.equal(proposal.body.result.revision, 1);
  assert.deepEqual({ advance: proposal.body.result.advanceMinor, final: proposal.body.result.finalMinor }, { advance: '125001', final: '125000' });

  const revisedProposal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.revise', payload: {
      ...proposalTerms, proposalId: proposal.body.result.proposalId, expectedVersion: 1,
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
  const downloadedProposal = await worker.fetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${generatedJob.result_file_id}`, {
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

  const thirdProposal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.revise', payload: {
      ...proposalTerms, proposalId: proposal.body.result.proposalId, expectedVersion: 2,
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

  const retryDispatch = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'proposal.dispatch.retry', payload: {
      dispatchId: queuedDispatch.body.result.dispatchId, expectedVersion: failedDispatch.version
    } }
  }, approverHeaders);
  assert.equal(retryDispatch.response.status, 202, JSON.stringify(retryDispatch.body));
  let deliveredAttachments = 0;
  const deliveredRecipients: string[] = [];
  env.EMAIL_PROVIDER = { fetch: async (request: Request) => {
    const form = await request.formData();
    const message = JSON.parse(String(form.get('message')));
    assert.match(message.to, /^[^@]+@example\.invalid$/);
    deliveredRecipients.push(message.to);
    deliveredAttachments = form.getAll('attachment').length;
    assert.ok(request.headers.get('Idempotency-Key'));
    return Response.json({ messageId: 'local-provider-message-001' }, { status: 202 });
  } };
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  assert.equal(deliveredAttachments, 2, 'dispatch contains the exact generated PDF and pinned approved Partner CV');
  assert.equal(db.prepare(`SELECT status FROM dispatches WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, retryDispatch.body.result.dispatchId).first<any>()?.status, 'ACCEPTED');
  assert.equal(db.prepare(`SELECT lifecycle_state FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, conversion.body.result.engagementId).first<any>()?.lifecycle_state, 'DUAL_KEY_PENDING',
    'the lifecycle advances only after the email provider returns a verifiable message ID');

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

  const storeCommittedFile = async (purpose: string, originalName: string, mediaType: string, bytes: Uint8Array, headers: Record<string, string>, scope: Record<string, string> = {}) => {
    const reservation = await post(`/api/workspaces/${workspaceId}/files`, { ...scope, purpose, originalName, mediaType, sizeBytes: bytes.length },
      { ...headers, 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(reservation.response.status, 201, JSON.stringify(reservation.body));
    const fileId = reservation.body.fileId as string;
    const staged = await worker.fetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${fileId}/content`, {
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
  const renderedLetterFile = await worker.fetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${renderedDraft.fileVersionId}`, { headers: makeRiskHeaders(approverHeaders) }), env, {} as any);
  const renderedLetterBytes = new Uint8Array(await renderedLetterFile.arrayBuffer());
  assert.equal(renderedLetterFile.status, 200);
  assert.equal(new TextDecoder().decode(renderedLetterBytes.slice(0, 8)), '%PDF-1.3', 'the approved clause and actual PNG assets produced a PDF');

  const issuedLetter = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'engagementLetter.issue', payload: {
      engagementId, jobId: renderedDraft.jobId, expectedProposalVersionId: renewedGate.body.commercialKey.proposalVersionId,
      expectedRiskClearanceId: renewedGate.body.riskKey.clearanceId, contactRouteId: letterRouteId
    } }
  }, makeRiskHeaders(approverHeaders));
  assert.equal(issuedLetter.response.status, 202, JSON.stringify(issuedLetter.body));
  assert.equal(issuedLetter.body.result.state, 'ADVANCE_BILLING');
  const issuedDelivery = await call(deliveryPath, { headers: makeRiskHeaders(reviewerHeaders) });
  const invoiceDraft = issuedDelivery.body.invoices.find((invoice: any) => invoice.id === issuedLetter.body.result.advanceInvoiceDraftId);
  assert.equal(invoiceDraft?.status, 'DRAFT');
  assert.equal(invoiceDraft?.subtotalMinor, '125001', 'the odd-minor-unit advance fee rounds half up');
  const invoiceIssued = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'invoice.issueAdvance', payload: {
      engagementId, engagementLetterId: issuedLetter.body.result.letterId, dueDate: '2099-12-31', contactRouteId: invoiceRouteId
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(invoiceIssued.response.status, 202, JSON.stringify(invoiceIssued.body));
  assert.equal(invoiceIssued.body.result.totalMinor, '125001');
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const issuedInvoiceView = await call(deliveryPath, { headers: makeRiskHeaders(reviewerHeaders) });
  const issuedInvoice = issuedInvoiceView.body.invoices.find((invoice: any) => invoice.id === invoiceIssued.body.result.invoiceId);
  assert.equal(issuedInvoice?.status, 'ISSUED');
  assert.ok(issuedInvoice?.fileVersionId);

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
  assert.equal(partialPaymentView.body.payments.find((payment: any) => payment.id === partialPayment.body.result.paymentId).receiptStatus, 'ISSUED');
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
  const settlement = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'payment.record', payload: {
      clientId, engagementId, amountMinor: '125001', receivedOn: '2026-10-05', method: 'BANK_TRANSFER', reference: 'BANK-LOCAL-SETTLEMENT',
      evidenceFileId, receiptContactRouteId: receiptRouteId, allocations: [{ invoiceId: issuedInvoice.id, amountMinor: '125001' }]
    } }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(settlement.response.status, 202, JSON.stringify(settlement.body));
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const settledView = await call(deliveryPath, { headers: makeRiskHeaders(reviewerHeaders) });
  assert.equal(settledView.body.engagement.lifecycleState, 'PORTAL_ACTIVE_PLANNING', 'planning unlocks only when the full advance and committed final receipt exist');
  assert.equal(settledView.body.invoices.find((invoice: any) => invoice.id === issuedInvoice.id).outstandingMinor, '0');
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
  const overCapacity = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.assign', payload: assignmentPayload }
  }, makeRiskHeaders(reviewerHeaders));
  assert.equal(overCapacity.response.status, 409, JSON.stringify(overCapacity.body));
  assert.equal(overCapacity.body.code, 'GATE_BLOCKED');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM engagement_assignments WHERE workspace_id=? AND engagement_id=?')
    .bind(workspaceId, engagementId).first<any>()?.count, 0, 'over-capacity assignment does not persist a partial row');
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
    const staged = await worker.fetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${fileId}/content`, {
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
  const firstPbcFile = await uploadPbcResponse('year-end-tb.pdf', pdf, 1);
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
  const currentTbWorkspace = await call(tbWorkspacePath, { headers: makeRiskHeaders(reviewerHeaders) });
  const activeMaterialityId = currentTbWorkspace.body.engagement.activeMaterialityVersionId;
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

  // Slice 4 — the current D1 statements, analytical review and mixed-mode
  // evidence stay pinned to the approved planning and source revisions.
  const technicalHeaders = makeRiskHeaders(preparerHeaders);
  const statements = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/financial-statements`, { headers: technicalHeaders });
  assert.equal(statements.response.status, 200, JSON.stringify(statements.body));
  assert.equal(statements.body.reconciliation.balanced, true, 'the live split statements reconcile without a suspense line');
  const revenueLine = statements.body.profitLoss.find((line: any) => line.category === 'REVENUE');
  assert.ok(revenueLine?.fsliId, 'the current mapped revenue source resolves to its FSLI');
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
  const blockedAnalysisSubmit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'analytical-review.submit', payload: {
      analyticalReviewId: analyticalReview.body.result.analyticalReviewId, expectedVersion: 1
    } }
  }, technicalHeaders);
  assert.equal(blockedAnalysisSubmit.response.status, 409, JSON.stringify(blockedAnalysisSubmit.body));
  assert.equal(blockedAnalysisSubmit.body.code, 'GATE_BLOCKED', 'an analytical conclusion needs independently reviewed current evidence');

  const hybridEvidence = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'evidence.create', payload: {
      engagementId, mode: 'HYBRID', title: 'Revenue source inspection record', fileVersionId: fileId,
      physicalIndex: 'REV-01', physicalDescription: 'Original signed sales-register extract inspected at the client site.',
      binder: 'Revenue binder A'
    } }
  }, technicalHeaders);
  assert.equal(hybridEvidence.response.status, 200, JSON.stringify(hybridEvidence.body));
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
  const blankProcedureSubmit = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.submit', payload: { procedureId: revenueProcedureIds[0], expectedVersion: 1 } }
  }, samplingReviewerHeaders);
  assert.equal(blankProcedureSubmit.response.status, 422);
  assert.equal(blankProcedureSubmit.body.code, 'VALIDATION_FAILED');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM procedure_submissions WHERE workspace_id=? AND procedure_id=?')
    .bind(workspaceId, revenueProcedureIds[0]).first<any>()?.count, 0, 'blank work and conclusion cannot create a review submission');

  const updateProcedure = (procedureId: string, expectedVersion: number, suffix: string) => post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.update', payload: {
      procedureId, expectedVersion, workPerformed: `Manager-grade procedure work ${suffix} was completed against the current retained source.`,
      conclusion: `The ${suffix} review conclusion retains its independent row version and source rationale.`
    } }
  }, samplingReviewerHeaders);
  const independentProcedureUpdates = await Promise.all([
    updateProcedure(revenueProcedureIds[0], 1, 'Sales'), updateProcedure(revenueProcedureIds[1], 1, 'PPE')
  ]);
  assert.deepEqual(independentProcedureUpdates.map(item => item.response.status), [200, 200], 'different procedure rows save concurrently');
  assert.deepEqual(independentProcedureUpdates.map(item => item.body.result.version), [2, 2]);
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
  const returnGreenProcedure = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'procedure.review', payload: {
      procedureId: greenProcedureId, expectedVersion: 4, decision: 'REWORK', comments: 'Clarify the source period and the recalculation basis before final review.',
      assignedPreparerId: preparerStaff.body.result.staffMemberId
    } }
  }, samplingReviewerHeaders);
  assert.equal(returnGreenProcedure.response.status, 200, JSON.stringify(returnGreenProcedure.body));
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
  const createSamplingPopulation = async (name: string, originalName: string, csv: string, exclusionsReason?: string) => {
    const sourceFileId = await storeCommittedFile('EVIDENCE', originalName, 'text/csv', new TextEncoder().encode(csv), technicalHeaders, { clientId, engagementId });
    const created = await post(`/api/workspaces/${workspaceId}/commands`, {
      idempotencyKey: crypto.randomUUID(), command: { type: 'sampling.population.create', payload: {
        engagementId, name, fsliId: revenueLine.fsliId, sourceFileId, headerRow: 1, referenceColumn: 0, amountColumn: 1, descriptionColumn: 2,
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
    'reference,amount,description\nPOS-001,100.00,Positive control balance\nNEG-001,-25.00,Negative credit balance');
  assert.equal(negativePopulationSource.created.response.status, 422, JSON.stringify(negativePopulationSource.created.body));
  assert.equal(negativePopulationSource.created.body.code, 'INVALID_POPULATION');
  const documentedNegativePopulation = await createSamplingPopulation('Negative balance alternate procedure documented', 'sampling-negative.csv',
    'reference,amount,description\nPOS-001,100.00,Positive control balance\nNEG-001,-25.00,Negative credit balance',
    'Test the negative credit separately through a documented understatement and completeness procedure.');
  assert.equal(documentedNegativePopulation.created.response.status, 200, JSON.stringify(documentedNegativePopulation.created.body));
  assert.equal(documentedNegativePopulation.created.body.result.rowCount, 2);
  assert.equal(documentedNegativePopulation.created.body.result.positiveTotalMinor, '10000');
  assert.equal(documentedNegativePopulation.created.body.result.excludedCount, 1);

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

  const systematicCsv = ['reference,amount,description', ...Array.from({ length: 200 }, (_, index) =>
    `SYS-${String(index + 1).padStart(3, '0')},5000.00,Invoice ${index + 1}`)].join('\n');
  const systematicPopulationSource = await createSamplingPopulation('Stable 200 item systematic population', 'sampling-systematic.csv', systematicCsv);
  assert.equal(systematicPopulationSource.created.response.status, 200, JSON.stringify(systematicPopulationSource.created.body));
  const systematicPopulationId = systematicPopulationSource.created.body.result.populationId as string;
  const systematicPopulation = await call(`/api/workspaces/${workspaceId}/engagements/${engagementId}/sampling-populations/${systematicPopulationId}`, { headers: technicalHeaders });
  assert.equal(systematicPopulation.response.status, 200, JSON.stringify(systematicPopulation.body));
  assert.equal(systematicPopulation.body.rows.length, 200);
  const systematicPolicyId = await createSamplingPolicy('SYSTEMATIC');
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
  assert.deepEqual(stratifiedPlanView.body.plan.parameters.strata.map((item: any) => [item.alphaNumerator, item.alphaDenominator]),
    [['500', '20000'], ['500', '20000']], 'each stratum receives alpha 0.025 for the joint 95% policy');
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

  for (const file of [firstPbcFile, replacementPbcFile]) {
    const downloaded = await worker.fetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${file.fileId}`, {
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
    const clientDocument = await worker.fetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${fileVersionId}`, { headers: makeRiskHeaders(clientHeaders) }), env, {} as any);
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
    .bind(partialPriorPaymentId, workspaceId, clientId, engagementId, ledgerPaymentOn, evidenceFileId, reviewerHeaders['X-Actor-Id'], continuanceTimestamp).run();
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

  // PRC scope: CLIENT personas never reach firm practice records or bookkeeping.
  const clientPracticeDenied = await call(practicePath, { headers: clientHeaders });
  assert.equal(clientPracticeDenied.response.status, 403, JSON.stringify(clientPracticeDenied.body));
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

  const timeDraft = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.create', payload: {
      engagementId, staffMemberId: preparerStaff.body.result.staffMemberId, workDate: planDate, phase: 'FIELDWORK',
      minutes: 420, description: 'Executed assigned fieldwork procedures for the scoped engagement.', billable: true } }
  }, preparerHeaders);
  assert.equal(timeDraft.response.status, 200, JSON.stringify(timeDraft.body));
  assert.equal(timeDraft.body.result.status, 'DRAFT');
  const timeEntryId = timeDraft.body.result.timeEntryId as string;

  const submitTime = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'time.submit', payload: { timeEntryId, expectedVersion: 1 } }
  }, preparerHeaders);
  assert.equal(submitTime.response.status, 200, JSON.stringify(submitTime.body));
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
  const approvedTimeRow = db.prepare('SELECT status,hourly_minor_snapshot,charge_numerator,charge_denominator,approved_by_actor_id FROM firm_time_entries WHERE workspace_id=? AND id=?')
    .bind(workspaceId, timeEntryId).first<any>();
  assert.equal(approvedTimeRow?.status, 'APPROVED');
  assert.equal(approvedTimeRow?.hourly_minor_snapshot, 20000, 'approval freezes the rate effective on the work date, not a later revision');
  assert.equal(approvedTimeRow?.charge_denominator, 60, 'charge-out is stored as a rational minutes/hour fraction');

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
  const secondPartnerHeaders = { 'X-Actor-Id': secondPartnerProfile.body.result.actorProfileId as string, 'X-Active-Persona': 'APPROVER' };
  const secondPartnerCapacity = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'staffing.availability.set', payload: {
      staffMemberId: secondPartnerStaff.body.result.staffMemberId, workDate: planDate, scheduledMinutes: 480 } }
  }, approverHeaders);
  assert.equal(secondPartnerCapacity.response.status, 200, JSON.stringify(secondPartnerCapacity.body));
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

  // PRC-002/003/006: capacity, profitability and bookkeeping report snapshots.
  const utilization = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'practice.capture-utilization-report', payload: {
      from: planDate, to: planDate, staffMemberIds: [preparerStaff.body.result.staffMemberId]
    } }
  }, approverHeaders);
  assert.equal(utilization.response.status, 200, JSON.stringify(utilization.body));
  assert.equal(utilization.body.result.staffCount, 1);
  const profitability = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'practice.capture-profitability-report', payload: {
      engagementId, asOf: `${planDate}T12:00:00.000Z` } }
  }, approverHeaders);
  assert.equal(profitability.response.status, 200, JSON.stringify(profitability.body));
  const arAging = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'practice.capture-ar-aging-report', payload: { asOf: planDate, clientId } }
  }, approverHeaders);
  assert.equal(arAging.response.status, 200, JSON.stringify(arAging.body));
  const profitabilityRows = db.prepare(`SELECT charge_out_value_minor FROM profitability_snapshots WHERE workspace_id=? AND engagement_id=? ORDER BY calculated_at DESC LIMIT 1`)
    .bind(workspaceId, engagementId).first<any>();
  assert.ok(profitabilityRows, 'the profitability snapshot persists against the engagement');
  const practiceData = await call(practicePath, { headers: practiceHeaders });
  assert.equal(practiceData.response.status, 200, JSON.stringify(practiceData.body));

  // PRC-006: the firm trial-balance export renders from an immutable source snapshot.
  const exportRequest = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'practice.export-report', payload: {
      kind: 'TRIAL_BALANCE', periodStart: planDate, periodEnd: planDate, format: 'CSV' } }
  }, approverHeaders);
  assert.equal(exportRequest.response.status, 200, JSON.stringify(exportRequest.body));
  await worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' } as any, env);
  const exportJob = db.prepare('SELECT status,result_file_id,last_error_code FROM outbox_jobs WHERE workspace_id=? AND id=?')
    .bind(workspaceId, exportRequest.body.result.jobId).first<any>();
  assert.equal(exportJob?.status, 'SUCCEEDED', JSON.stringify(exportJob));
  assert.ok(exportJob?.result_file_id, 'the export commits a real downloadable artifact');

  // PRC-007: a partial allocation reversal increases invoice AR and returns the same
  // verified amount to unallocated cash without touching the issued commercial record.
  const settlementAllocation = db.prepare('SELECT id FROM payment_allocations WHERE workspace_id=? AND payment_id=? ORDER BY allocated_on DESC,id DESC LIMIT 1')
    .bind(workspaceId, settlement.body.result.paymentId).first<any>();
  assert.ok(settlementAllocation?.id, 'the settled advance payment carries an active allocation');
  const partialReversal = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'payment.reverse-allocation', payload: {
      allocationId: settlementAllocation.id, effectiveDate: planDate, amountMinor: '50000',
      reason: 'The client overpaid the advance; part of the receipt is re-applied after review.' } }
  }, approverHeaders);
  assert.equal(partialReversal.response.status, 200, JSON.stringify(partialReversal.body));
  const afterAllocationReversal = await call(`${practicePath}?asOfDate=${planDate}`, { headers: practiceHeaders });
  assert.equal(afterAllocationReversal.response.status, 200, JSON.stringify(afterAllocationReversal.body));
  const priorOutstanding = BigInt(practiceData.body.arAging.invoices.find((row: any) => row.invoiceId === issuedInvoice.id).outstandingMinor);
  const nextOutstanding = BigInt(afterAllocationReversal.body.arAging.invoices.find((row: any) => row.invoiceId === issuedInvoice.id).outstandingMinor);
  assert.equal(nextOutstanding - priorOutstanding, 50000n, 'the original invoice shows the appended allocation reversal');
  assert.equal(BigInt(afterAllocationReversal.body.arAging.unallocatedMinor) - BigInt(practiceData.body.arAging.unallocatedMinor), 50000n,
    'the reversed amount returns to unallocated verified cash');
  assert.equal(afterAllocationReversal.body.arAging.reconciliationStatus, 'INTEGRATION_EXCEPTION',
    'the seeded historical invoice has no opening ledger journal, so the pre-existing difference remains visible');
  assert.equal(afterAllocationReversal.body.arAging.reconciliationDifferenceMinor,
    practiceData.body.arAging.reconciliationDifferenceMinor,
    'the appended allocation reversal increases both subledger AR and posted AR control by the same amount');

  // FLD-013: a critical confirmation that becomes outstanding after handover
  // blocks final release with HTTP 409 and queues one idempotent Holding Letter.
  const criticalConfirmation = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'confirmation.create', payload: {
      engagementId, type: 'BANK', fsliId: revenueLine.fsliId,
      externalPartyName: 'Synthetic Test Bank', externalPartyAddress: '1 Example Street, Doha',
      externalPartyEmail: 'bank@example.invalid', recipientVerificationText: 'Verified against the synthetic engagement contact record.',
      critical: true, criticalityReason: 'The balance is individually material to the audit opinion.', dueDate: planDate
    } }
  }, technicalHeaders);
  assert.equal(criticalConfirmation.response.status, 200, JSON.stringify(criticalConfirmation.body));
  const gateEngagement = db.prepare(`SELECT id,version,client_id,active_tb_version_id,active_mapping_version_id,active_materiality_version_id
    FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId, engagementId).first<any>();
  const blockers = await criticalConfirmationBlockers(env, workspaceId, gateEngagement);
  assert.equal(blockers.length, 1, 'the outstanding critical confirmation is detected at release time');

  const queuedHoldingLetter = await queueHoldingLetterForBlockers(env, workspaceId, {} as any, gateEngagement,
    crypto.randomUUID(), new Date().toISOString(), blockers, 409);
  assert.equal(queuedHoldingLetter.responseStatus, 409, 'the blocked release persists its required HTTP status');
  assert.equal(queuedHoldingLetter.result.blocked, true);
  assert.ok(queuedHoldingLetter.result.holdingLetterJobId);
  await db.batch([...queuedHoldingLetter.statements, db.prepare('DELETE FROM command_assertions WHERE workspace_id=?').bind(workspaceId)]);

  const replayedHoldingLetter = await queueHoldingLetterForBlockers(env, workspaceId, {} as any, gateEngagement,
    crypto.randomUUID(), new Date().toISOString(), blockers, 409);
  assert.equal(replayedHoldingLetter.responseStatus, 409);
  assert.equal(replayedHoldingLetter.result.holdingLetterJobId, queuedHoldingLetter.result.holdingLetterJobId,
    'the same outstanding set reuses its Holding Letter outbox job');
  assert.equal(replayedHoldingLetter.result.holdingLetterReused, true);
  await db.batch([...replayedHoldingLetter.statements, db.prepare('DELETE FROM command_assertions WHERE workspace_id=?').bind(workspaceId)]);
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
  assert.equal(businessCommandHttpResult({ result: {} }, 'proposal.dispatch', 200, 'test-request').status, 202,
    'a legacy 200 receipt still receives the normal asynchronous command status');

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
