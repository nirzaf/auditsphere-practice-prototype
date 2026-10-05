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
    const commandVersion = request.command.type === 'proposal.create' ? commandPayload.expectedEngagementVersion : commandPayload.expectedVersion;
    const versionTarget = typeof commandVersion === 'number'
      ? request.command.type === 'staff.update' ? { entity: 'StaffMember', id: commandPayload.staffMemberId }
        : request.command.type === 'actor-profile.deactivate' ? { entity: 'ActorProfile', id: commandPayload.actorProfileId }
          : request.command.type === 'client.update' || request.command.type === 'client.deactivate' ? { entity: 'Client', id: commandPayload.clientId }
            : request.command.type === 'contact.update' ? { entity: 'Contact', id: commandPayload.contactId }
              : request.command.type === 'lead.update' || request.command.type === 'lead.lose' || request.command.type === 'lead.convert' ? { entity: 'Lead', id: commandPayload.leadId }
                : request.command.type === 'engagement.advance' ? { entity: 'Engagement', id: commandPayload.engagementId }
                  : request.command.type === 'team-cv.approve' ? { entity: 'TeamCv', id: commandPayload.teamCvId }
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
    'directory.manage', 'client.read', 'client.manage', 'lead.read', 'lead.manage', 'lead.convert', 'engagement.read', 'engagement.advance', 'standards.read', 'standards.manage', 'file.read', 'file.upload', 'proposal.read', 'proposal.create', 'proposal.generate', 'proposal.approve', 'proposal.dispatch', 'firm.manage'
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
    clientId, engagementId: conversion.body.result.engagementId, purpose: 'PBC', originalName: 'audit-evidence.pdf',
    mediaType: 'application/pdf', sizeBytes: pdf.length
  }, { ...clientHeaders, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(fileReservation.response.status, 201, JSON.stringify(fileReservation.body));
  assert.equal(fileReservation.body.state, 'INITIALIZED');
  const fileId = fileReservation.body.fileId as string;

  const uploadFileBytes = async (bytes: Uint8Array, idempotencyKey: string) => {
    const uploadRequest = new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${fileId}/content`, {
      method: 'PUT',
      headers: {
        Origin: 'https://local.auditsphere.test', ...clientHeaders, 'Idempotency-Key': idempotencyKey,
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
  }, { ...clientHeaders, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal(staleCommit.response.status, 409);
  assert.equal(staleCommit.body.code, 'VERSION_CONFLICT');
  const commitKey = crypto.randomUUID();
  const committedFile = await post(`/api/workspaces/${workspaceId}/files/${fileId}/complete`, {
    expectedVersion: 2, sizeBytes: stagedFile.body.sizeBytes, sha256: stagedFile.body.sha256
  }, { ...clientHeaders, 'Idempotency-Key': commitKey });
  assert.equal(committedFile.response.status, 200, JSON.stringify(committedFile.body));
  assert.equal(committedFile.body.state, 'COMMITTED');
  const committedRow = db.prepare('SELECT version,state,immutable,sha256,object_key FROM file_versions WHERE workspace_id=? AND id=?')
    .bind(workspaceId, fileId).first<any>();
  assert.deepEqual({ version: committedRow.version, state: committedRow.state, immutable: committedRow.immutable }, { version: 3, state: 'COMMITTED', immutable: 1 });
  assert.equal(committedRow.sha256, stagedFile.body.sha256);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=? AND entity_id=?')
    .bind(workspaceId, fileId).first<any>()?.count, 3, 'reservation, staging and commitment are individually audited');
  const listedFiles = await call(`/api/workspaces/${workspaceId}/files`, { headers: clientHeaders });
  assert.equal(listedFiles.response.status, 200, JSON.stringify(listedFiles.body));
  assert.equal(listedFiles.body.files.length, 1);
  assert.equal(listedFiles.body.files[0].id, fileId);
  const download = await worker.fetch(new Request(`https://local.auditsphere.test/api/workspaces/${workspaceId}/files/${fileId}`, { headers: clientHeaders }), env, {} as any);
  assert.equal(download.status, 200);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), pdf, 'download returns the verified committed bytes');
  const otherClientFile = await call(`/api/workspaces/${workspaceId}/files/${crypto.randomUUID()}/metadata`, { headers: clientHeaders });
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
  env.EMAIL_PROVIDER = { fetch: async (request: Request) => {
    const form = await request.formData();
    const message = JSON.parse(String(form.get('message')));
    assert.equal(message.to, route.email);
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
});
