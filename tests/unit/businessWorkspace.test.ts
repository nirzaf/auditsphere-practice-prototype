import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const r2Objects = new Map<string, Uint8Array>();
let failNextR2Write = false;
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
  const approverContext = await call(`/api/workspaces/${workspaceId}/context`, { headers: approverHeaders });
  assert.equal(approverContext.response.status, 200, JSON.stringify(approverContext.body));
  assert.deepEqual(approverContext.body.allowedActions, [
    'directory.manage', 'client.read', 'client.manage', 'lead.read', 'lead.manage', 'lead.convert', 'engagement.read', 'engagement.advance', 'standards.read', 'standards.manage', 'file.read', 'file.upload', 'proposal.read', 'proposal.create', 'proposal.generate', 'proposal.approve', 'proposal.dispatch', 'firm.manage', 'risk.read', 'riskAssessment.draft', 'riskAssessment.submit', 'riskAssessment.resolveEscalation', 'risk.clear', 'commercialAcceptance.read', 'engagementLetter.manage', 'invoice.issue', 'payment.record', 'payment.reverse', 'billing.read', 'pbc.read', 'pbc.manage', 'pbc.review'
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

  const mdContact = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'contact.create', payload: {
      clientId,
      contact: { fullName: 'Managing Director', email: 'md@example.invalid', title: 'Managing Director', role: 'MD_GM', effectiveFrom: '2026-01-01' }
    } }
  }, preparerHeaders);
  assert.equal(mdContact.response.status, 200, JSON.stringify(mdContact.body));
  assert.deepEqual(mdContact.body.result.routePurposes, ['PROPOSAL', 'EL', 'FINAL_REPORT', 'HOLDING_LETTER']);
  const mdContactId = mdContact.body.result.contactId as string;
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
  assert.equal(blockedFullProposal.response.status, 422, JSON.stringify(blockedFullProposal.body));
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

  const engagementId = conversion.body.result.engagementId as string;
  const makeRiskHeaders = (headers: Record<string, string>) => ({ ...headers, 'X-Client-Id': clientId, 'X-Engagement-Id': engagementId });
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
  assert.equal(unresolvedIssueClear.response.status, 422);
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
  assert.equal(clearWhileEscalated.response.status, 422);
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
  assert.equal(wrongTemplateLetter.response.status, 422);
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

  const pbcRequestCreated = await post(`/api/workspaces/${workspaceId}/commands`, {
    idempotencyKey: crypto.randomUUID(), command: { type: 'pbc.request.create', payload: {
      clientId, engagementId, title: 'Year-end trial balance', description: 'Provide the complete debit and credit export for the audit period.',
      dueDate: '2026-10-15', assignedContactId: financeContactId, category: 'TRIAL_BALANCE',
      requiredForPlanning: true, requiredForRelease: true
    } }
  }, makeRiskHeaders(preparerHeaders));
  assert.equal(pbcRequestCreated.response.status, 200, JSON.stringify(pbcRequestCreated.body));
  assert.equal(pbcRequestCreated.body.result.status, 'PENDING_UPLOAD');
  const pbcRequestId = pbcRequestCreated.body.result.requestId as string;
  const clientPbcHeaders = makeRiskHeaders(clientHeaders);
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
  const activePbcPortal = await call(pbcPortalPath, { headers: clientPbcHeaders });
  assert.equal(activePbcPortal.body.mode, 'ACTIVE');
  assert.equal(activePbcPortal.body.canUpload, true);

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
  assert.equal(wrongPbcFile.response.status, 422);
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
  assert.equal(blockedContinuanceSubmit.response.status, 422);
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
  assert.equal(cannotSelfResolvePriorFees.response.status, 422, 'the Partner must resolve the outstanding prior fee concern with evidence');
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
  assert.equal(pendingPriorFeeClearance.response.status, 422, 'an open prior-fee escalation blocks Partner clearance');
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
});
