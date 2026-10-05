import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/index.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const env = {
  DB: db,
  FILES: {} as any,
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
    const versionTarget = typeof commandPayload.expectedVersion === 'number'
      ? request.command.type === 'staff.update' ? { entity: 'StaffMember', id: commandPayload.staffMemberId }
        : request.command.type === 'actor-profile.deactivate' ? { entity: 'ActorProfile', id: commandPayload.actorProfileId }
          : request.command.type === 'client.update' || request.command.type === 'client.deactivate' ? { entity: 'Client', id: commandPayload.clientId }
            : request.command.type === 'contact.update' ? { entity: 'Contact', id: commandPayload.contactId }
              : request.command.type === 'lead.update' || request.command.type === 'lead.lose' || request.command.type === 'lead.convert' ? { entity: 'Lead', id: commandPayload.leadId }
                : request.command.type === 'engagement.advance' ? { entity: 'Engagement', id: commandPayload.engagementId }
                  : null
      : null;
    payload = {
      actor: { actorId: headers.get('X-Actor-Id'), persona: headers.get('X-Active-Persona') },
      context: {
        ...(headers.get('X-Client-Id') ? { clientId: headers.get('X-Client-Id') } : {}),
        ...(headers.get('X-Engagement-Id') ? { engagementId: headers.get('X-Engagement-Id') } : {})
      },
      expectedVersions: versionTarget && typeof versionTarget.id === 'string'
        ? [{ ...versionTarget, version: commandPayload.expectedVersion }]
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
    'directory.manage', 'client.read', 'client.manage', 'lead.read', 'lead.manage', 'lead.convert', 'engagement.read', 'engagement.advance', 'standards.read', 'standards.manage'
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
});
