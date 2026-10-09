import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { routeInventory } from '../../worker/index.js';
import type { Env } from '../../worker/env.js';
import { SqliteD1 } from '../helpers/sqliteD1.js';
import { authSessionCookie, bootstrapBusinessFixture } from '../helpers/authSession.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new SqliteD1();
db.migrate(repositoryRoot);
const env = {
  DB: db,
  FILES: {},
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) }
} as unknown as Env;
const origin = 'https://assignment-scope.auditsphere.test';
after(() => db.close());

type Actor = { id: string; persona: 'APPROVER' | 'PREPARER' | 'REVIEWER'; cookie: string };
type EngagementFixture = { id: string; clientId: string };
let workspaceId: string;
let partner: Actor;
let preparer: Actor;
let reviewer: Actor;
let engagements: EngagementFixture[];
let clients: Array<{ id: string; contactId: string }>;

async function call(path: string, actor: Actor, options: { method?: string; body?: unknown; clientId?: string } = {}): Promise<Response> {
  const headers = new Headers({ Origin: origin, Cookie: actor.cookie });
  if (options.clientId) headers.set('X-Client-Id', options.clientId);
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    headers.set('Idempotency-Key', crypto.randomUUID());
  }
  return worker.fetch(new Request(`${origin}${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'), headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  }), env, {} as ExecutionContext);
}

async function command(actor: Actor, type: string, payload: Record<string, unknown>,
  expectedVersions: Array<{ entity: string; id: string; version: number }> = []): Promise<Response> {
  return call(`/api/workspaces/${workspaceId}/commands`, actor, { body: {
    context: {}, expectedVersions, command: { type, payload }
  } });
}

async function createClient(index: number): Promise<{ id: string; contactId: string }> {
  const response = await command(partner, 'client.create', {
    code: `SCOPE-${index}-${crypto.randomUUID().slice(0, 6)}`,
    legalName: `Scope Acceptance ${index} Trading WLL`, entityType: 'STANDALONE', industry: 'Trading',
    address: 'Doha, Qatar', countryCode: 'QA', primaryContact: {
      fullName: `Scope Finance ${index}`, email: `scope-${index}-${crypto.randomUUID()}@example.invalid`,
      title: 'Chief Accountant', role: 'CHIEF_ACCOUNTANT_LIAISON', effectiveFrom: '2026-01-01'
    }
  });
  assert.equal(response.status, 200, await response.clone().text());
  const result = (await response.json() as any).result;
  return { id: result.clientId, contactId: result.primaryContactId };
}

async function createEngagement(client: { id: string; contactId: string }, index: number, standardsProfileId: string): Promise<EngagementFixture> {
  const lead = await command(partner, 'lead.create', {
    clientId: client.id, primaryContactId: client.contactId, source: 'REFERRAL', receivedAt: new Date().toISOString(),
    requestedService: 'STATUTORY_AUDIT', periodStart: '2025-01-01', periodEnd: '2025-12-31'
  });
  assert.equal(lead.status, 200, await lead.clone().text());
  const leadId = ((await lead.json() as any).result.leadId as string);
  const converted = await command(partner, 'lead.convert', {
    leadId, expectedVersion: 1, engagementCode: `SCOPE-${index}-${crypto.randomUUID().slice(0, 6)}`,
    standardsProfileId, contractFeeMinor: '100000'
  }, [{ entity: 'Lead', id: leadId, version: 1 }]);
  assert.equal(converted.status, 200, await converted.clone().text());
  const engagementId = ((await converted.json() as any).result.engagementId as string);
  // Put the synthetic engagements past the commercial exception so assignment
  // scope is observable without running through unrelated payment acceptance.
  db.prepare(`UPDATE engagements SET lifecycle_state='PORTAL_ACTIVE_PLANNING',portal_activated_at=?
    WHERE workspace_id=? AND id=?`).bind(new Date().toISOString(), workspaceId, engagementId).run();
  return { id: engagementId, clientId: client.id };
}

it('creates three post-commercial engagements with disjoint, historical assignments for the access audit', async () => {
  const initial = await bootstrapBusinessFixture(db, { name: `Assignment Scope ${crypto.randomUUID()}`, currency: 'QAR', timezone: 'Asia/Qatar', initialPartner: {
      displayName: 'Scope Partner', naturalPersonKey: `SCOPE-PARTNER-${crypto.randomUUID()}`, email: `scope-partner-${crypto.randomUUID()}@example.invalid`
    } });
  workspaceId = initial.workspaceId;
  const partnerCookie = await authSessionCookie(db, workspaceId, initial.actorProfileId);
  partner = { id: initial.actorProfileId, persona: 'APPROVER', cookie: partnerCookie };

  const createStaffProfile = async (displayName: string, grade: 'SENIOR' | 'ASSOCIATE', persona: 'REVIEWER' | 'PREPARER'): Promise<Actor> => {
    const staff = await command(partner, 'staff.create', {
      displayName, naturalPersonKey: `${displayName.toUpperCase().replaceAll(' ', '-')}-${crypto.randomUUID()}`, grade
    });
    assert.equal(staff.status, 200, await staff.clone().text());
    const staffMemberId = ((await staff.json() as any).result.staffMemberId as string);
    const profile = await command(partner, 'actor-profile.assign', { staffMemberId, persona });
    assert.equal(profile.status, 200, await profile.clone().text());
    const actorId = ((await profile.json() as any).result.actorProfileId as string);
    return { id: actorId, persona, cookie: await authSessionCookie(db, workspaceId, actorId) };
  };
  reviewer = await createStaffProfile('Scope Reviewer', 'MANAGER', 'REVIEWER');
  preparer = await createStaffProfile('Scope Preparer', 'ASSOCIATE', 'PREPARER');

  const standard = await command(partner, 'standards-profile.create', {
    name: 'Assignment scope standards', effectivePeriodStart: '2020-01-01', effectivePeriodEnd: '2030-12-31',
    isa220Edition: 'ISA 220 Revised', isa570Edition: 'ISA 570 Revised 2024', reportingFramework: 'IFRS',
    presentationEdition: 'IAS1', earlyAdoption: false
  });
  assert.equal(standard.status, 200, await standard.clone().text());
  const standardsProfileId = ((await standard.json() as any).result.standardsProfileId as string);
  clients = [];
  engagements = [];
  for (let index = 0; index < 3; index += 1) {
    clients.push(await createClient(index + 1));
    engagements.push(await createEngagement(clients[index], index + 1, standardsProfileId));
  }

  for (const [engagement, actor, persona] of [
    [engagements[0], reviewer, 'REVIEWER'], [engagements[1], preparer, 'PREPARER'], [engagements[2], reviewer, 'REVIEWER']
  ] as const) {
    db.prepare(`INSERT INTO engagement_assignments(id,workspace_id,version,client_id,engagement_id,staff_member_id,persona,phase,
      start_date,end_date,planned_minutes,created_by_actor_id,created_at)
      SELECT ?,?,?,?, ?,s.id,?,'FIELDWORK','2020-01-01','2020-01-02',240,?,?
      FROM actor_profiles ap JOIN staff_members s ON s.workspace_id=ap.workspace_id AND s.id=ap.staff_member_id
      WHERE ap.workspace_id=? AND ap.id=?`)
      .bind(crypto.randomUUID(), workspaceId, 1, engagement.clientId, engagement.id, persona, partner.id,
        new Date().toISOString(), workspaceId, actor.id).run();
  }

  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM engagement_assignments WHERE workspace_id=?')
    .bind(workspaceId).first<any>()?.count, 3);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM engagement_assignments WHERE workspace_id=? AND staff_member_id=(
    SELECT staff_member_id FROM actor_profiles WHERE workspace_id=? AND id=?) AND end_date<'2026-01-01'`)
    .bind(workspaceId, workspaceId, reviewer.id).first<any>()?.count, 2);
});

it('keeps assigned staff and firm Partners able to read assigned engagement workflow', async () => {
  for (const [actor, engagement] of [[reviewer, engagements[0]], [preparer, engagements[1]], [partner, engagements[0]], [partner, engagements[1]]] as const) {
    const response = await call(`/api/workspaces/${workspaceId}/engagements/${engagement.id}/workflow`, actor, { clientId: engagement.clientId });
    assert.equal(response.status, 200, await response.clone().text());
  }
});

it('blocks unassigned staff with FORBIDDEN_SCOPE on every engagement read route', async () => {
  const routes = routeInventory.filter(route => route.method === 'GET' && route.pattern.includes(':engagementId'));
  const matrix: Record<string, Array<{ route: string; status: number; code?: string }>> = {};
  for (const [name, actor, engagement] of [['Reviewer', reviewer, engagements[1]], ['Preparer', preparer, engagements[0]]] as const) {
    matrix[name] = [];
    for (const route of routes) {
      const path = route.pattern.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_match, key: string) => {
        if (key === 'workspaceId') return workspaceId;
        if (key === 'engagementId') return engagement.id;
        return crypto.randomUUID();
      });
      const response = await call(path, actor, { clientId: engagement.clientId });
      const body = await response.json().catch(() => ({})) as { code?: string };
      matrix[name].push({ route: route.pattern, status: response.status, ...(body.code ? { code: body.code } : {}) });
    }
  }
  console.log(`ASSIGNMENT_SCOPE_READ_MATRIX ${JSON.stringify(matrix)}`);
  const outcomes = Object.entries(matrix).flatMap(([persona, entries]) => entries.map(entry => ({ persona, ...entry })));
  assert.ok(outcomes.length > 0, 'the router inventory contains engagement-scoped read routes');
  assert.deepEqual(outcomes.filter(item => item.status !== 403), [], 'every unassigned staff read is blocked with HTTP 403');
  assert.ok(outcomes.every(item => item.code === 'FORBIDDEN_SCOPE'), 'every blocked read reports FORBIDDEN_SCOPE');
});

it('blocks engagement filters supplied in collection query parameters', async () => {
  for (const [actor, engagement] of [[reviewer, engagements[1]], [preparer, engagements[0]]] as const) {
    for (const path of [
      `/api/workspaces/${workspaceId}/changes?after=0&engagementId=${engagement.id}`,
      `/api/workspaces/${workspaceId}/practice?engagementId=${engagement.id}`
    ]) {
      const response = await call(path, actor, { clientId: engagement.clientId });
      assert.equal(response.status, 403, `${path}: ${await response.clone().text()}`);
      assert.equal((await response.json() as any).code, 'FORBIDDEN_SCOPE');
    }
  }
});

it('filters staff client pages to their assigned clients while preserving cursors', async () => {
  const assignedClientIds = new Set([engagements[0].clientId, engagements[2].clientId]);
  const first = await call(`/api/workspaces/${workspaceId}/clients?limit=1`, reviewer);
  assert.equal(first.status, 200, await first.clone().text());
  const firstPage = await first.json() as { items: Array<{ id: string }>; nextCursor: string | null };
  assert.equal(firstPage.items.length, 1);
  assert.ok(firstPage.nextCursor, 'two assigned clients span more than one page');
  assert.ok(assignedClientIds.has(firstPage.items[0].id));
  const second = await call(`/api/workspaces/${workspaceId}/clients?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`, reviewer);
  assert.equal(second.status, 200, await second.clone().text());
  const secondPage = await second.json() as { items: Array<{ id: string }>; nextCursor: string | null };
  assert.equal(secondPage.items.length, 1);
  assert.ok(assignedClientIds.has(secondPage.items[0].id));
  assert.notEqual(secondPage.items[0].id, firstPage.items[0].id);
  const preparerPage = await call(`/api/workspaces/${workspaceId}/clients?limit=100`, preparer);
  assert.deepEqual((await preparerPage.json() as any).items.map((item: any) => item.id), [engagements[1].clientId]);
  const partnerPage = await call(`/api/workspaces/${workspaceId}/clients?limit=100`, partner);
  assert.equal((await partnerPage.json() as any).items.length, 3, 'firm-wide Partner list remains unchanged');
  const hiddenClient = await call(`/api/workspaces/${workspaceId}/clients/${engagements[1].clientId}`, reviewer);
  assert.equal(hiddenClient.status, 403);
  assert.equal((await hiddenClient.json() as any).code, 'FORBIDDEN_SCOPE');
});

it('shows commercial engagements before assignment and filters PBC engagement lists by D3', async () => {
  db.prepare(`UPDATE engagements SET lifecycle_state='ADVANCE_BILLING',portal_activated_at=NULL
    WHERE workspace_id=? AND id=?`).bind(workspaceId, engagements[2].id).run();
  try {
    const workflow = await call(`/api/workspaces/${workspaceId}/engagements/${engagements[2].id}/workflow`, preparer,
      { clientId: engagements[2].clientId });
    assert.equal(workflow.status, 200, await workflow.clone().text());
    const clientsPage = await call(`/api/workspaces/${workspaceId}/clients?limit=100`, preparer);
    assert.deepEqual(new Set((await clientsPage.json() as any).items.map((item: any) => item.id)),
      new Set([engagements[1].clientId, engagements[2].clientId]));
    const pbc = await call(`/api/workspaces/${workspaceId}/pbc-engagements`, preparer);
    assert.equal(pbc.status, 200, await pbc.clone().text());
    assert.deepEqual(new Set(((await pbc.json() as any).engagements as Array<{ id: string }>).map(item => item.id)),
      new Set([engagements[1].id, engagements[2].id]));
  } finally {
    db.prepare(`UPDATE engagements SET lifecycle_state='PORTAL_ACTIVE_PLANNING',portal_activated_at=?
      WHERE workspace_id=? AND id=?`).bind(new Date().toISOString(), workspaceId, engagements[2].id).run();
  }
});

it('denies unassigned Reviewer and Preparer engagement commands before any write', async () => {
  const reviewerStaffMemberId = db.prepare('SELECT staff_member_id FROM actor_profiles WHERE workspace_id=? AND id=?')
    .bind(workspaceId, reviewer.id).first<any>()!.staff_member_id as string;
  const available = await command(reviewer, 'staffing.availability.set', {
    staffMemberId: reviewerStaffMemberId, workDate: '2026-10-11', scheduledMinutes: 480
  });
  assert.equal(available.status, 200, await available.clone().text());
  const before = {
    audit: db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?').bind(workspaceId).first<any>()?.count,
    assignments: db.prepare('SELECT COUNT(*) AS count FROM engagement_assignments WHERE workspace_id=?').bind(workspaceId).first<any>()?.count,
    pbc: db.prepare('SELECT COUNT(*) AS count FROM pbc_requests WHERE workspace_id=?').bind(workspaceId).first<any>()?.count
  };
  const submittedByPreparerId = crypto.randomUUID();
  const submittedByPreparer = db.prepare(`SELECT id FROM firm_charge_out_rates WHERE workspace_id=? AND grade='ASSOCIATE' ORDER BY revision DESC LIMIT 1`)
    .bind(workspaceId).first<{ id: string }>();
  assert.ok(submittedByPreparer, 'the workspace has the synthetic Preparer rate needed for a submitted time record');
  const submittedAt = new Date().toISOString();
  db.prepare(`INSERT INTO firm_time_entries(id,workspace_id,version,client_id,engagement_id,staff_member_id,work_date,phase,
      fsli_id,procedure_id,minutes,start_at,end_at,description,billable,status,rate_id,hourly_minor_snapshot,charge_numerator,
      charge_denominator,submitted_by_actor_id,submitted_at,approved_by_actor_id,approved_at,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,1,?,?,?,?,?,NULL,NULL,60,NULL,NULL,?,1,'SUBMITTED',?,20000,'1200000',60,?,?,NULL,NULL,?,?,?)`)
    .bind(submittedByPreparerId, workspaceId, engagements[1].clientId, engagements[1].id,
      db.prepare('SELECT staff_member_id FROM actor_profiles WHERE workspace_id=? AND id=?').bind(workspaceId, preparer.id)
        .first<{ staff_member_id: string }>()!.staff_member_id,
      '2026-10-11', 'FIELDWORK', 'Synthetic submitted time reserved for assignment-scope verification.', submittedByPreparer.id,
      preparer.id, submittedAt, preparer.id, submittedAt, submittedAt).run();
  const reviewerAttempt = await command(reviewer, 'staffing.assign', {
    engagementId: engagements[1].id, staffMemberId: reviewerStaffMemberId, persona: 'REVIEWER', phase: 'FIELDWORK',
    startDate: '2026-10-11', endDate: '2026-10-11', plannedMinutes: 240, dailyMinutes: [{ date: '2026-10-11', minutes: 240 }]
  });
  const preparerAttempt = await command(preparer, 'pbc.request.create', {
    clientId: engagements[0].clientId, engagementId: engagements[0].id, title: 'Unassigned scope audit request',
    description: 'The unassigned synthetic preparer must not create a PBC request for this engagement.', dueDate: '2026-11-15',
    assignedContactId: clients[0].contactId, category: 'GENERAL', requiredForPlanning: true, requiredForRelease: false
  });
  const reviewerTimeApproval = await command(reviewer, 'time.approve', { timeEntryId: submittedByPreparerId, expectedVersion: 1 }, [
    { entity: 'TimeEntry', id: submittedByPreparerId, version: 1 }
  ]);
  const after = db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id=?').bind(workspaceId).first<any>()?.count;
  const outcomes = await Promise.all([reviewerAttempt, preparerAttempt, reviewerTimeApproval].map(async response => ({
    status: response.status, body: await response.json().catch(() => ({}))
  })));
  console.log(`ASSIGNMENT_SCOPE_COMMAND_MATRIX ${JSON.stringify(outcomes)}`);
  assert.deepEqual(outcomes.map(item => [item.status, (item.body as any).code]), [
    [403, 'FORBIDDEN_SCOPE'], [403, 'FORBIDDEN_SCOPE'], [403, 'FORBIDDEN_SCOPE']
  ]);
  const afterAssignments = db.prepare('SELECT COUNT(*) AS count FROM engagement_assignments WHERE workspace_id=?').bind(workspaceId).first<any>()?.count;
  const afterPbc = db.prepare('SELECT COUNT(*) AS count FROM pbc_requests WHERE workspace_id=?').bind(workspaceId).first<any>()?.count;
  assert.equal(after, before.audit, 'denied out-of-scope commands create no audit events');
  assert.equal(afterAssignments, before.assignments, 'an unassigned Reviewer cannot add themselves to the engagement');
  assert.equal(afterPbc, before.pbc, 'an unassigned Preparer cannot add engagement PBC requests');
  assert.equal(db.prepare('SELECT status FROM firm_time_entries WHERE workspace_id=? AND id=?')
    .bind(workspaceId, submittedByPreparerId).first<any>()?.status, 'SUBMITTED', 'an unassigned Reviewer cannot approve a colleague’s engagement time');
});
