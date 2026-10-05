// Real BUSINESS workspace setup and directory context.
// BUSINESS records never use the TEST seed/session/PrototypeState path.

import * as z from 'zod';
import type { Env } from './env';
import { ApiError } from './errors';
import { sha256Hex } from './http';
import { requireWorkspace } from './db';

export const BUSINESS_SCHEMA_VERSION = 8;

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const businessBootstrapSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  currency: z.literal('QAR'),
  timezone: z.literal('Asia/Qatar'),
  initialPartner: z.strictObject({
    displayName: z.string().trim().min(1).max(200),
    naturalPersonKey: z.string().trim().min(1).max(200),
    email: emailSchema
  })
});

export type BusinessBootstrapInput = z.infer<typeof businessBootstrapSchema>;
export interface BusinessBootstrapResponse {
  workspaceId: string;
  staffMemberId: string;
  actorProfileId: string;
  replayed?: boolean;
}

const invalidInput = (issues: Array<{ path: PropertyKey[]; message: string }>): ApiError =>
  new ApiError('BAD_REQUEST', 'Business workspace details are invalid.', {
    issues: issues.map(issue => ({ path: issue.path.map(String), message: issue.message }))
  });

export function parseBusinessBootstrapInput(value: unknown): BusinessBootstrapInput {
  const parsed = businessBootstrapSchema.safeParse(value);
  if (!parsed.success) throw invalidInput(parsed.error.issues);
  return parsed.data;
}

interface BootstrapReceiptRow {
  request_hash: string;
  response_json: string;
}

async function findBootstrapReceipt(env: Env, keyHash: string): Promise<BootstrapReceiptRow | null> {
  return env.DB.prepare(
    'SELECT request_hash,response_json FROM business_bootstrap_receipts WHERE idempotency_key_hash=?'
  ).bind(keyHash).first<BootstrapReceiptRow>();
}

function replayBootstrap(receipt: BootstrapReceiptRow, requestHash: string): BusinessBootstrapResponse {
  if (receipt.request_hash !== requestHash) {
    throw new ApiError('IDEMPOTENCY_MISMATCH', 'That setup request key was already used for different workspace details.');
  }
  return { ...(JSON.parse(receipt.response_json) as Omit<BusinessBootstrapResponse, 'replayed'>), replayed: true };
}

/** Creates the workspace, its first actual staff/profile, audit provenance and receipt in one D1 batch. */
export async function bootstrapBusinessWorkspace(
  env: Env,
  input: BusinessBootstrapInput,
  idempotencyKey: string
): Promise<BusinessBootstrapResponse> {
  const requestHash = await sha256Hex(JSON.stringify(input));
  const keyHash = await sha256Hex(`auditsphere:business-bootstrap:${idempotencyKey}`);
  const prior = await findBootstrapReceipt(env, keyHash);
  if (prior) return replayBootstrap(prior, requestHash);

  const workspaceId = crypto.randomUUID();
  const staffMemberId = crypto.randomUUID();
  const actorProfileId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  const auditHeadId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const timestamp = new Date(now * 1000).toISOString();
  const response: Omit<BusinessBootstrapResponse, 'replayed'> = { workspaceId, staffMemberId, actorProfileId };
  const details = JSON.stringify({ provenance: 'SYSTEM/BOOTSTRAP', dataMode: 'BUSINESS' });
  const hashInput = JSON.stringify({
    id: auditEventId,
    workspaceId,
    sequence: 1,
    eventType: 'BOOTSTRAP',
    entityType: 'WORKSPACE',
    entityId: workspaceId,
    actorAssurance: 'SYSTEM',
    source: 'JOB',
    details,
    timestamp
  });
  const eventHash = await sha256Hex(hashInput);

  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO workspaces(
        id,seed_id,name,schema_version,revision,status,created_at,updated_at,data_mode,currency,timezone,
        version,business_status,created_at_utc,updated_at_utc
      ) VALUES(?,NULL,?,?,1,'active',?,?,'BUSINESS','QAR','Asia/Qatar',1,'ACTIVE',?,?)`)
        .bind(workspaceId, input.name, BUSINESS_SCHEMA_VERSION, now, now, timestamp, timestamp),
      env.DB.prepare(`INSERT INTO staff_members(
        id,workspace_id,version,natural_person_key,display_name,email,grade,active,created_at,updated_at,created_by_actor_id,updated_by_actor_id
      ) VALUES(?,?,1,?,?,?,'PARTNER',1,?,?,NULL,NULL)`)
        .bind(staffMemberId, workspaceId, input.initialPartner.naturalPersonKey, input.initialPartner.displayName, input.initialPartner.email, timestamp, timestamp),
      env.DB.prepare(`INSERT INTO actor_profiles(
        id,workspace_id,version,persona,staff_member_id,contact_id,active,created_at,updated_at
      ) VALUES(?,?,1,'APPROVER',?,NULL,1,?,?)`)
        .bind(actorProfileId, workspaceId, staffMemberId, timestamp, timestamp),
      env.DB.prepare(`INSERT INTO audit_chain_heads(
        id,workspace_id,version,scope_kind,scope_id,last_sequence,last_event_hash,created_at,updated_at
      ) VALUES(?,?,1,'WORKSPACE',?,1,?,?,?)`)
        .bind(auditHeadId, workspaceId, workspaceId, eventHash, timestamp, timestamp),
      env.DB.prepare(`INSERT INTO audit_events(
        id,workspace_id,sequence,actor_user_id,actor_role,command_type,entity_kind,entity_id,
        client_id,engagement_id,before_version,after_version,details_json,created_at,
        actor_assurance,source,chain_scope_kind,chain_scope_id,previous_hash,event_hash,actor_id,
        event_type,entity_type,command_id,actor_persona
      ) VALUES(?,?,1,NULL,NULL,'workspace.bootstrap','workspace',?,NULL,NULL,NULL,1,?,?,
        'SYSTEM','JOB','WORKSPACE',?,NULL,?,NULL,'BOOTSTRAP','WORKSPACE',NULL,NULL)`)
        .bind(auditEventId, workspaceId, workspaceId, details, now, workspaceId, eventHash),
      env.DB.prepare(`INSERT INTO business_bootstrap_receipts(
        idempotency_key_hash,request_hash,workspace_id,staff_member_id,actor_profile_id,response_json,created_at
      ) VALUES(?,?,?,?,?,?,?)`)
        .bind(keyHash, requestHash, workspaceId, staffMemberId, actorProfileId, JSON.stringify(response), now)
    ]);
    return response;
  } catch (error) {
    // A concurrent retry may have won the unique idempotency key. Replay only
    // after confirming that the winning request had identical content.
    const raced = await findBootstrapReceipt(env, keyHash);
    if (raced) return replayBootstrap(raced, requestHash);
    throw error;
  }
}

export type BusinessPersona = 'PREPARER' | 'REVIEWER' | 'APPROVER' | 'CLIENT';

export interface BusinessActorProfileSummary {
  id: string;
  persona: BusinessPersona;
  displayName: string;
  staffGrade: 'PARTNER' | 'MANAGER' | 'SENIOR' | 'ASSOCIATE' | null;
  clientId: string | null;
}

interface BusinessActorProfileRow extends BusinessActorProfileSummary {
  active: number;
  staffMemberId: string | null;
  contactId: string | null;
  staffActive: number | null;
  contactActive: number | null;
  linkedClientActive: number | null;
  naturalPersonKey: string | null;
}

const actorProfileSelect = `SELECT ap.id,ap.persona,ap.active,ap.staff_member_id AS staffMemberId,
  ap.contact_id AS contactId,COALESCE(sm.display_name,c.full_name) AS displayName,
  sm.grade AS staffGrade,c.client_id AS clientId,sm.active AS staffActive,
  c.active AS contactActive,linked_client.active AS linkedClientActive,
  sm.natural_person_key AS naturalPersonKey
  FROM actor_profiles ap
  LEFT JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
  LEFT JOIN contacts c ON c.workspace_id=ap.workspace_id AND c.id=ap.contact_id
  LEFT JOIN clients linked_client ON linked_client.workspace_id=c.workspace_id AND linked_client.id=c.client_id`;

function isUsableProfile(row: BusinessActorProfileRow): boolean {
  if (row.active !== 1 || !row.displayName) return false;
  if (row.persona === 'CLIENT') return row.contactActive === 1 && row.linkedClientActive === 1 && typeof row.clientId === 'string';
  if (row.staffActive !== 1 || !row.staffGrade) return false;
  if (row.persona === 'APPROVER') return row.staffGrade === 'PARTNER';
  if (row.persona === 'REVIEWER') return row.staffGrade === 'MANAGER' || row.staffGrade === 'SENIOR';
  return true;
}

async function requireBusinessWorkspace(env: Env, workspaceId: string): Promise<void> {
  const workspace = await requireWorkspace(env, workspaceId);
  if (workspace.data_mode !== 'BUSINESS') throw new ApiError('BAD_REQUEST', 'This operation requires a BUSINESS workspace.');
}

export async function listBusinessActorProfiles(env: Env, workspaceId: string): Promise<{ items: BusinessActorProfileSummary[]; nextCursor: null }> {
  await requireBusinessWorkspace(env, workspaceId);
  const result = await env.DB.prepare(`${actorProfileSelect} WHERE ap.workspace_id=? ORDER BY ap.persona,displayName,ap.id`)
    .bind(workspaceId).all<BusinessActorProfileRow>();
  const items = (result.results ?? []).filter(isUsableProfile).map(row => ({
    id: row.id,
    persona: row.persona,
    displayName: row.displayName,
    staffGrade: row.persona === 'CLIENT' ? null : row.staffGrade,
    clientId: row.persona === 'CLIENT' ? row.clientId : null
  }));
  return { items, nextCursor: null };
}

type BusinessReadContext = Pick<BusinessContext, 'actor' | 'scope' | 'allowedActions'>;
type BusinessCursor = { kind: 'CLIENT' | 'LEAD'; sort: string; id: string };

function parseBusinessCursor(raw: string | null, kind: BusinessCursor['kind']): BusinessCursor | null {
  if (!raw) return null;
  if (raw.length > 512) throw new ApiError('BAD_REQUEST', 'The page cursor is invalid.');
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Partial<BusinessCursor>;
    if (value.kind !== kind || typeof value.sort !== 'string' || !z.uuid().safeParse(value.id).success) {
      throw new Error('Invalid cursor shape.');
    }
    return value as BusinessCursor;
  } catch {
    throw new ApiError('BAD_REQUEST', 'The page cursor is invalid.');
  }
}

function businessPageLimit(url: URL): number {
  const raw = url.searchParams.get('limit');
  if (raw === null) return 50;
  if (!/^\d{1,3}$/.test(raw)) throw new ApiError('BAD_REQUEST', 'Page limit must be an integer from 1 to 100.');
  const value = Number(raw);
  if (value < 1 || value > 100) throw new ApiError('BAD_REQUEST', 'Page limit must be an integer from 1 to 100.');
  return value;
}

function businessNextCursor(cursor: BusinessCursor | null): string | null {
  return cursor ? encodeURIComponent(JSON.stringify(cursor)) : null;
}

export async function listBusinessClients(
  env: Env,
  workspaceId: string,
  request: Request,
  url: URL
): Promise<{ items: Array<Record<string, unknown>>; nextCursor: string | null }> {
  const context = await resolveBusinessContext(env, workspaceId, request) as BusinessReadContext;
  if (!context.allowedActions.includes('client.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read client records.');
  const cursor = parseBusinessCursor(url.searchParams.get('cursor'), 'CLIENT');
  const limit = businessPageLimit(url);
  const clauses = ['workspace_id=?', 'active=1'];
  const bindings: unknown[] = [workspaceId];
  if (context.actor.persona === 'CLIENT' && context.scope.clientId) {
    clauses.push('id=?');
    bindings.push(context.scope.clientId);
  }
  if (cursor) {
    clauses.push('(legal_name>? OR (legal_name=? AND id>?))');
    bindings.push(cursor.sort, cursor.sort, cursor.id);
  }
  const columns = context.actor.persona === 'CLIENT'
    ? 'id,version,legal_name,trading_name,industry,country_code'
    : 'id,version,code,legal_name,trading_name,entity_type,parent_client_id,industry,country_code,active';
  const result = await env.DB.prepare(`SELECT ${columns} FROM clients WHERE ${clauses.join(' AND ')}
    ORDER BY legal_name,id LIMIT ?`).bind(...bindings, limit + 1).all<Record<string, unknown> & { id: string; legal_name: string }>();
  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    items: page.map(row => ({
      id: row.id,
      version: row.version,
      legalName: row.legal_name,
      tradingName: row.trading_name,
      industry: row.industry,
      countryCode: row.country_code,
      ...('code' in row ? {
        code: row.code,
        entityType: row.entity_type,
        parentClientId: row.parent_client_id,
        active: row.active === 1
      } : {})
    })),
    nextCursor: hasMore && page.length ? businessNextCursor({ kind: 'CLIENT', sort: page[page.length - 1].legal_name, id: page[page.length - 1].id }) : null
  };
}

export async function getBusinessClient(
  env: Env,
  workspaceId: string,
  request: Request,
  clientId: string
): Promise<Record<string, unknown>> {
  const context = await resolveBusinessContext(env, workspaceId, request) as BusinessReadContext;
  if (!context.allowedActions.includes('client.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read client records.');
  if (context.scope.clientId && context.scope.clientId !== clientId) throw new ApiError('FORBIDDEN_SCOPE', 'This client record is outside the selected persona scope.');
  const row = await env.DB.prepare(`SELECT id,version,code,legal_name,trading_name,entity_type,parent_client_id,
      commercial_registration,tax_id,industry,address,country_code,active
    FROM clients WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId, clientId)
    .first<Record<string, unknown> & { id: string; version: number; legal_name: string }>();
  if (!row) throw new ApiError('NOT_FOUND', 'Active client not found.');
  if (context.actor.persona === 'CLIENT') {
    const profile = await env.DB.prepare(`SELECT contact_id FROM actor_profiles WHERE workspace_id=? AND id=? AND active=1`)
      .bind(workspaceId, context.actor.id).first<{ contact_id: string }>();
    if (!profile?.contact_id) throw new ApiError('DISABLED_IDENTITY', 'This client projection no longer has an active contact profile.');
    const contact = await env.DB.prepare(`SELECT id,version,full_name,email,phone,title,role,is_primary,is_signatory,active,effective_from,effective_to
      FROM contacts WHERE workspace_id=? AND client_id=? AND id=? AND active=1`)
      .bind(workspaceId, clientId, profile.contact_id).first<Record<string, unknown> & { is_primary: number; is_signatory: number; active: number }>();
    return {
      client: { id: row.id, legalName: row.legal_name, tradingName: row.trading_name, industry: row.industry, countryCode: row.country_code },
      contacts: contact ? [{ ...contact, isPrimary: contact.is_primary === 1, isSignatory: contact.is_signatory === 1, active: contact.active === 1 }] : [],
      routes: [],
      children: [],
      affiliations: []
    };
  }
  const [contacts, routes, children, affiliations] = await Promise.all([
    env.DB.prepare(`SELECT id,version,full_name,email,phone,title,role,is_primary,is_signatory,active,effective_from,effective_to
      FROM contacts WHERE workspace_id=? AND client_id=? AND active=1 ORDER BY is_primary DESC,full_name,id`)
      .bind(workspaceId, clientId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT cr.id,cr.version,cr.purpose,cr.contact_id,cr.is_primary,ct.full_name,ct.email,ct.phone
      FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
      WHERE cr.workspace_id=? AND cr.client_id=? AND ct.active=1 ORDER BY cr.purpose,cr.is_primary DESC,ct.full_name`)
      .bind(workspaceId, clientId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,version,code,legal_name,trading_name,entity_type,industry,country_code
      FROM clients WHERE workspace_id=? AND parent_client_id=? AND active=1 ORDER BY legal_name,id`)
      .bind(workspaceId, clientId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT ca.id,ca.version,ca.related_client_id,ca.relationship,c.legal_name
      FROM client_affiliations ca JOIN clients c ON c.workspace_id=ca.workspace_id AND c.id=ca.related_client_id
      WHERE ca.workspace_id=? AND ca.client_id=? AND c.active=1 ORDER BY c.legal_name,ca.id`)
      .bind(workspaceId, clientId).all<Record<string, unknown>>()
  ]);
  const client = {
    id: row.id, version: row.version, code: row.code, legalName: row.legal_name,
    tradingName: row.trading_name, entityType: row.entity_type, parentClientId: row.parent_client_id,
    commercialRegistration: row.commercial_registration, taxId: row.tax_id, industry: row.industry,
    address: row.address, countryCode: row.country_code, active: row.active === 1
  };
  return {
    client,
    contacts: (contacts.results ?? []).map(contact => ({ ...contact, isPrimary: contact.is_primary === 1, isSignatory: contact.is_signatory === 1, active: contact.active === 1 })),
    routes: routes.results ?? [],
    children: children.results ?? [],
    affiliations: affiliations.results ?? []
  };
}

export async function listBusinessLeads(
  env: Env,
  workspaceId: string,
  request: Request,
  url: URL
): Promise<{ items: Array<Record<string, unknown>>; nextCursor: string | null }> {
  const context = await resolveBusinessContext(env, workspaceId, request) as BusinessReadContext;
  if (!context.allowedActions.includes('lead.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read lead records.');
  const status = url.searchParams.get('status');
  if (status && !['OPEN', 'QUALIFIED', 'CONVERTED', 'LOST'].includes(status)) {
    throw new ApiError('BAD_REQUEST', 'Lead status must be OPEN, QUALIFIED, CONVERTED or LOST.');
  }
  const cursor = parseBusinessCursor(url.searchParams.get('cursor'), 'LEAD');
  const limit = businessPageLimit(url);
  const clauses = ['l.workspace_id=?'];
  const bindings: unknown[] = [workspaceId];
  if (context.scope.clientId) {
    clauses.push('l.client_id=?');
    bindings.push(context.scope.clientId);
  }
  if (status) {
    clauses.push('l.status=?');
    bindings.push(status);
  }
  if (cursor) {
    clauses.push('(l.received_at<? OR (l.received_at=? AND l.id<?))');
    bindings.push(cursor.sort, cursor.sort, cursor.id);
  }
  const result = await env.DB.prepare(`SELECT l.id,l.version,l.client_id,l.primary_contact_id,l.source,l.received_at,
      l.requested_service,l.period_start,l.period_end,l.estimated_fee_minor,l.status,l.loss_reason,l.converted_engagement_id,
      c.legal_name AS client_name,ct.full_name AS contact_name
    FROM leads l LEFT JOIN clients c ON c.workspace_id=l.workspace_id AND c.id=l.client_id
    LEFT JOIN contacts ct ON ct.workspace_id=l.workspace_id AND ct.client_id=l.client_id AND ct.id=l.primary_contact_id
    WHERE ${clauses.join(' AND ')} ORDER BY l.received_at DESC,l.id DESC LIMIT ?`)
    .bind(...bindings, limit + 1).all<Record<string, unknown> & { id: string; received_at: string; estimated_fee_minor: number | null }>();
  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    items: page.map(lead => ({
      id: lead.id, version: lead.version, clientId: lead.client_id, primaryContactId: lead.primary_contact_id,
      source: lead.source, receivedAt: lead.received_at, requestedService: lead.requested_service,
      periodStart: lead.period_start, periodEnd: lead.period_end,
      estimatedFeeMinor: lead.estimated_fee_minor === null ? null : String(lead.estimated_fee_minor),
      status: lead.status, lossReason: lead.loss_reason, convertedEngagementId: lead.converted_engagement_id,
      clientName: lead.client_name, contactName: lead.contact_name
    })),
    nextCursor: hasMore && page.length ? businessNextCursor({ kind: 'LEAD', sort: page[page.length - 1].received_at, id: page[page.length - 1].id }) : null
  };
}

export async function listBusinessStandardsProfiles(
  env: Env,
  workspaceId: string,
  request: Request
): Promise<{ items: Array<Record<string, unknown>> }> {
  const context = await resolveBusinessContext(env, workspaceId, request) as BusinessReadContext;
  if (!context.allowedActions.includes('standards.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read standards profiles.');
  const result = await env.DB.prepare(`SELECT id,version,name,effective_period_start,effective_period_end,
      isa_220_edition,isa_570_edition,reporting_framework,presentation_edition,early_adoption,approved_by_actor_id,approved_at,content_sha256
    FROM standards_profiles WHERE workspace_id=? ORDER BY effective_period_start DESC,name,id LIMIT 100`)
    .bind(workspaceId).all<Record<string, unknown>>();
  return { items: (result.results ?? []).map(profile => ({
    id: profile.id, version: profile.version, name: profile.name,
    effectivePeriodStart: profile.effective_period_start, effectivePeriodEnd: profile.effective_period_end,
    isa220Edition: profile.isa_220_edition, isa570Edition: profile.isa_570_edition,
    reportingFramework: profile.reporting_framework, presentationEdition: profile.presentation_edition,
    earlyAdoption: profile.early_adoption === 1, approvedByActorId: profile.approved_by_actor_id,
    approvedAt: profile.approved_at, contentSha256: profile.content_sha256
  })) };
}

export interface BusinessContext {
  actor: {
    id: string;
    persona: BusinessPersona;
    displayName: string;
    staffGrade: BusinessActorProfileSummary['staffGrade'];
    clientId: string | null;
  };
  scope: { clientId: string | null; engagementId: string | null };
  allowedActions: string[];
  readOnlyReasons: string[];
}

async function findBusinessActorProfile(env: Env, workspaceId: string, actorId: string): Promise<BusinessActorProfileRow | null> {
  return env.DB.prepare(`${actorProfileSelect} WHERE ap.workspace_id=? AND ap.id=?`)
    .bind(workspaceId, actorId).first<BusinessActorProfileRow>();
}

/** Resolves each request from its explicit self-selected profile; nothing is shared between browsers. */
export async function resolveBusinessContext(env: Env, workspaceId: string, request: Request): Promise<BusinessContext> {
  await requireBusinessWorkspace(env, workspaceId);
  const actorId = request.headers.get('X-Actor-Id')?.trim();
  const requestedPersona = request.headers.get('X-Active-Persona')?.trim();
  if (!actorId || !requestedPersona) {
    throw new ApiError('BAD_REQUEST', 'Select an active actor profile and persona for this request.');
  }
  const row = await findBusinessActorProfile(env, workspaceId, actorId);
  if (!row || !isUsableProfile(row)) {
    throw new ApiError('DISABLED_IDENTITY', 'That actor profile is unavailable. Select another configured profile.');
  }
  if (requestedPersona !== row.persona) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'The selected persona does not match this actor profile.');
  }

  const requestedClientId = request.headers.get('X-Client-Id')?.trim() || null;
  const requestedEngagementId = request.headers.get('X-Engagement-Id')?.trim() || null;
  const actorClientId = row.persona === 'CLIENT' ? row.clientId : null;
  if (actorClientId && requestedClientId && actorClientId !== requestedClientId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'A CLIENT profile can only select its linked client.');
  }
  const clientId = actorClientId ?? requestedClientId;
  if (requestedEngagementId) {
    if (!clientId) throw new ApiError('BAD_REQUEST', 'Select the client before selecting an engagement.');
    const engagement = await env.DB.prepare(`SELECT id FROM engagements
      WHERE workspace_id=? AND client_id=? AND id=?`).bind(workspaceId, clientId, requestedEngagementId).first<{ id: string }>();
    if (!engagement) throw new ApiError('FORBIDDEN_SCOPE', 'The selected engagement is not part of this client.');
  }

  const isClient = row.persona === 'CLIENT';
  return {
    actor: {
      id: row.id,
      persona: row.persona,
      displayName: row.displayName,
      staffGrade: isClient ? null : row.staffGrade,
      clientId: isClient ? row.clientId : null
    },
    scope: { clientId, engagementId: requestedEngagementId },
    allowedActions: row.persona === 'APPROVER' && row.staffGrade === 'PARTNER'
      ? ['directory.manage', 'client.read', 'client.manage', 'lead.read', 'lead.manage', 'lead.convert', 'engagement.read', 'engagement.advance', 'standards.read', 'standards.manage']
      : row.persona === 'PREPARER' ? ['client.read', 'client.manage', 'lead.read', 'lead.manage', 'lead.convert', 'engagement.read', 'engagement.advance', 'standards.read']
        : row.persona === 'REVIEWER' ? ['client.read', 'lead.read', 'engagement.read', 'standards.read']
          : ['client.read'],
    readOnlyReasons: isClient ? ['CLIENT_PROJECTION_ONLY'] : []
  };
}

// Only the directory commands required to configure the four real personas are
// enabled in this foundation slice. Other command families remain unavailable
// until their normalized implementation lands.
const staffGradeSchema = z.enum(['PARTNER', 'MANAGER', 'SENIOR', 'ASSOCIATE']);
const staffIdSchema = z.uuid();
const clientIdSchema = z.uuid();
const clientEntityTypeSchema = z.enum(['HOLDING', 'SUBSIDIARY', 'STANDALONE']);
const contactRoleSchema = z.enum(['MD_GM', 'CFO_FINANCE_DIRECTOR', 'CHIEF_ACCOUNTANT_LIAISON', 'OTHER']);
const contactPurposeSchema = z.enum(['PROPOSAL', 'EL', 'FINAL_REPORT', 'INVOICE', 'RECEIPT', 'PBC', 'HOLDING_LETTER']);
const leadSourceSchema = z.enum(['PHONE', 'WHATSAPP', 'EMAIL', 'WEB_FORM', 'REFERRAL']);
const serviceTypeSchema = z.enum(['STATUTORY_AUDIT', 'INTERNAL_AUDIT', 'AGREED_UPON_PROCEDURES']);
const dateSchema = z.iso.date();
const moneyMinorSchema = z.string().regex(/^(0|[1-9][0-9]{0,15})$/).refine(value => Number.isSafeInteger(Number(value)), {
  message: 'Enter a non-negative safe integer amount in QAR minor units.'
});
const contactInputSchema = z.strictObject({
  fullName: z.string().trim().min(1).max(200),
  email: emailSchema.optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  title: z.string().trim().min(1).max(200),
  role: contactRoleSchema,
  isSignatory: z.boolean().default(false),
  effectiveFrom: dateSchema
}).refine(contact => Boolean(contact.email || contact.phone), {
  message: 'Provide an email address or phone number.'
});
const staffCreateCommand = z.strictObject({
  type: z.literal('staff.create'),
  payload: z.strictObject({
    displayName: z.string().trim().min(1).max(200),
    naturalPersonKey: z.string().trim().min(1).max(200),
    email: emailSchema.optional(),
    grade: staffGradeSchema
  })
});
const staffUpdateCommand = z.strictObject({
  type: z.literal('staff.update'),
  payload: z.strictObject({
    staffMemberId: staffIdSchema,
    expectedVersion: z.number().int().positive(),
    displayName: z.string().trim().min(1).max(200).optional(),
    email: emailSchema.nullable().optional(),
    grade: staffGradeSchema.optional()
  }).refine(payload => payload.displayName !== undefined || payload.email !== undefined || payload.grade !== undefined, {
    message: 'Provide at least one editable field.'
  })
});
const staffActorAssignment = z.strictObject({
  type: z.literal('actor-profile.assign'),
  payload: z.discriminatedUnion('persona', [
    z.strictObject({ persona: z.enum(['PREPARER', 'REVIEWER', 'APPROVER']), staffMemberId: staffIdSchema }),
    z.strictObject({ persona: z.literal('CLIENT'), contactId: staffIdSchema })
  ])
});
const actorProfileDeactivate = z.strictObject({
  type: z.literal('actor-profile.deactivate'),
  payload: z.strictObject({ actorProfileId: staffIdSchema, expectedVersion: z.number().int().positive() })
});

const clientCreateCommand = z.strictObject({
  type: z.literal('client.create'),
  payload: z.strictObject({
    code: z.string().trim().min(1).max(200),
    legalName: z.string().trim().min(1).max(250),
    tradingName: z.string().trim().max(250).optional(),
    entityType: clientEntityTypeSchema,
    parentClientId: clientIdSchema.optional(),
    commercialRegistration: z.string().trim().max(200).optional(),
    taxId: z.string().trim().max(200).optional(),
    industry: z.string().trim().min(1).max(200),
    address: z.string().trim().min(1).max(1000),
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    primaryContact: contactInputSchema
  }).refine(payload => payload.entityType === 'SUBSIDIARY' ? Boolean(payload.parentClientId) : !payload.parentClientId, {
    message: 'A SUBSIDIARY requires a parent client; HOLDING and STANDALONE clients cannot have a parent.'
  })
});
const clientUpdateCommand = z.strictObject({
  type: z.literal('client.update'),
  payload: z.strictObject({
    clientId: clientIdSchema,
    expectedVersion: z.number().int().positive(),
    legalName: z.string().trim().min(1).max(250).optional(),
    tradingName: z.string().trim().max(250).nullable().optional(),
    entityType: clientEntityTypeSchema.optional(),
    parentClientId: clientIdSchema.nullable().optional(),
    commercialRegistration: z.string().trim().max(200).nullable().optional(),
    taxId: z.string().trim().max(200).nullable().optional(),
    industry: z.string().trim().min(1).max(200).optional(),
    address: z.string().trim().min(1).max(1000).optional(),
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional()
  }).refine(payload => Object.keys(payload).some(key => !['clientId', 'expectedVersion'].includes(key)), {
    message: 'Provide at least one client field to update.'
  })
});
const clientDeactivateCommand = z.strictObject({
  type: z.literal('client.deactivate'),
  payload: z.strictObject({ clientId: clientIdSchema, expectedVersion: z.number().int().positive(), reason: z.string().trim().min(10).max(10000) })
});
const contactCreateCommand = z.strictObject({
  type: z.literal('contact.create'),
  payload: z.strictObject({ clientId: clientIdSchema, contact: contactInputSchema })
});
const contactUpdateCommand = z.strictObject({
  type: z.literal('contact.update'),
  payload: z.strictObject({
    contactId: clientIdSchema,
    expectedVersion: z.number().int().positive(),
    fullName: z.string().trim().min(1).max(200).optional(),
    email: emailSchema.nullable().optional(),
    phone: z.string().trim().min(7).max(30).nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    role: contactRoleSchema.optional(),
    isPrimary: z.boolean().optional(),
    isSignatory: z.boolean().optional(),
    effectiveTo: dateSchema.nullable().optional(),
    active: z.boolean().optional()
  }).refine(payload => Object.keys(payload).some(key => !['contactId', 'expectedVersion'].includes(key)), {
    message: 'Provide at least one contact field to update.'
  })
});
const contactRouteCommand = z.strictObject({
  type: z.literal('contact.route'),
  payload: z.strictObject({
    clientId: clientIdSchema,
    contactId: clientIdSchema,
    purpose: contactPurposeSchema,
    isPrimary: z.boolean().default(true),
    expectedVersion: z.number().int().positive().nullable()
  })
});
const clientAffiliationCommand = z.strictObject({
  type: z.literal('client.affiliation.add'),
  payload: z.strictObject({ clientId: clientIdSchema, relatedClientId: clientIdSchema, relationship: z.string().trim().min(1).max(200) })
});
const leadCreateCommand = z.strictObject({
  type: z.literal('lead.create'),
  payload: z.strictObject({
    clientId: clientIdSchema.optional(),
    primaryContactId: clientIdSchema.optional(),
    newClient: z.strictObject({
      code: z.string().trim().min(1).max(200),
      legalName: z.string().trim().min(1).max(250),
      industry: z.string().trim().min(1).max(200),
      address: z.string().trim().min(1).max(1000),
      countryCode: z.string().regex(/^[A-Z]{2}$/),
      primaryContact: z.strictObject({
        fullName: z.string().trim().min(1).max(200),
        email: emailSchema.optional(),
        phone: z.string().trim().min(1).max(40).optional(),
        title: z.string().trim().min(1).max(200),
        role: contactRoleSchema
      }).refine(contact => Boolean(contact.email || contact.phone), {
        message: 'Provide an email address or phone number for the primary contact.'
      })
    }).optional(),
    source: leadSourceSchema,
    receivedAt: z.iso.datetime({ offset: true }),
    requestedService: serviceTypeSchema,
    periodStart: dateSchema,
    periodEnd: dateSchema,
    estimatedFeeMinor: moneyMinorSchema.optional()
  }).refine(payload => payload.periodStart <= payload.periodEnd, {
    message: 'The requested period end must not precede the start.'
  }).refine(payload => {
    const existingPair = Boolean(payload.clientId && payload.primaryContactId && !payload.newClient);
    const newPair = Boolean(!payload.clientId && !payload.primaryContactId && payload.newClient);
    return existingPair || newPair;
  }, { message: 'Choose an existing client and primary contact or provide a new client and primary contact.' })
});
const leadUpdateCommand = z.strictObject({
  type: z.literal('lead.update'),
  payload: z.strictObject({
    leadId: clientIdSchema,
    expectedVersion: z.number().int().positive(),
    primaryContactId: clientIdSchema.optional(),
    source: leadSourceSchema.optional(),
    receivedAt: z.iso.datetime({ offset: true }).optional(),
    requestedService: serviceTypeSchema.optional(),
    periodStart: dateSchema.optional(),
    periodEnd: dateSchema.optional(),
    estimatedFeeMinor: moneyMinorSchema.nullable().optional()
  }).refine(payload => Object.keys(payload).some(key => !['leadId', 'expectedVersion'].includes(key)), {
    message: 'Provide at least one lead field to update.'
  })
});
const leadLoseCommand = z.strictObject({
  type: z.literal('lead.lose'),
  payload: z.strictObject({ leadId: clientIdSchema, expectedVersion: z.number().int().positive(), reason: z.string().trim().min(10).max(10000) })
});
const leadConvertCommand = z.strictObject({
  type: z.literal('lead.convert'),
  payload: z.strictObject({
    leadId: clientIdSchema,
    expectedVersion: z.number().int().positive(),
    engagementCode: z.string().trim().min(1).max(200),
    standardsProfileId: clientIdSchema,
    contractFeeMinor: moneyMinorSchema.optional()
  })
});
const engagementAdvanceCommand = z.strictObject({
  type: z.literal('engagement.advance'),
  payload: z.strictObject({ engagementId: clientIdSchema, expectedVersion: z.number().int().positive(), expectedState: z.literal('LEAD_INGESTION') })
});
const standardsProfileCreateCommand = z.strictObject({
  type: z.literal('standards-profile.create'),
  payload: z.strictObject({
    name: z.string().trim().min(1).max(200),
    effectivePeriodStart: dateSchema,
    effectivePeriodEnd: dateSchema.nullable().optional(),
    isa220Edition: z.string().trim().min(1).max(200),
    isa570Edition: z.string().trim().min(1).max(200),
    reportingFramework: z.string().trim().min(1).max(200),
    presentationEdition: z.enum(['IAS1', 'IFRS18', 'OTHER_APPROVED']),
    earlyAdoption: z.boolean().default(false)
  }).refine(payload => !payload.effectivePeriodEnd || payload.effectivePeriodStart <= payload.effectivePeriodEnd, {
    message: 'The standards profile end date must not precede its start date.'
  })
});

export const businessCommandSchema = z.discriminatedUnion('type', [
  staffCreateCommand,
  staffUpdateCommand,
  staffActorAssignment,
  actorProfileDeactivate,
  clientCreateCommand,
  clientUpdateCommand,
  clientDeactivateCommand,
  contactCreateCommand,
  contactUpdateCommand,
  contactRouteCommand,
  clientAffiliationCommand,
  leadCreateCommand,
  leadUpdateCommand,
  leadLoseCommand,
  leadConvertCommand,
  engagementAdvanceCommand,
  standardsProfileCreateCommand
]);

const expectedVersionSchema = z.strictObject({
  entity: z.string().trim().min(1).max(120),
  id: z.uuid(),
  version: z.number().int().positive()
});

export const businessCommandEnvelopeSchema = z.strictObject({
  actor: z.strictObject({ persona: z.enum(['PREPARER', 'REVIEWER', 'APPROVER', 'CLIENT']), actorId: z.uuid() }),
  context: z.strictObject({ clientId: clientIdSchema.optional(), engagementId: clientIdSchema.optional() }).default({}),
  expectedVersions: z.array(expectedVersionSchema).max(20).default([]),
  command: businessCommandSchema
});

type BusinessCommandBody = z.infer<typeof businessCommandEnvelopeSchema>;
export type BusinessCommandEnvelope = BusinessCommandBody & { idempotencyKey: string };
type BusinessCommand = BusinessCommandBody['command'];
type BusinessDirectoryCommand = Extract<BusinessCommand, { type: 'staff.create' | 'staff.update' | 'actor-profile.assign' | 'actor-profile.deactivate' }>;
type BusinessCommercialCommand = Exclude<BusinessCommand, BusinessDirectoryCommand>;

function isBusinessDirectoryCommand(command: BusinessCommand): command is BusinessDirectoryCommand {
  return command.type === 'staff.create' || command.type === 'staff.update'
    || command.type === 'actor-profile.assign' || command.type === 'actor-profile.deactivate';
}

export function parseBusinessCommandEnvelope(value: unknown, idempotencyKey: string | null): BusinessCommandEnvelope {
  if (!idempotencyKey || idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 200) {
    throw new ApiError('BAD_REQUEST', 'A valid Idempotency-Key header is required for every BUSINESS command.');
  }
  const parsed = businessCommandEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw invalidInput(parsed.error.issues);
  const command = parsed.data.command;
  const versionTarget = command.type === 'staff.update' ? { entity: 'StaffMember', id: command.payload.staffMemberId, version: command.payload.expectedVersion }
    : command.type === 'actor-profile.deactivate' ? { entity: 'ActorProfile', id: command.payload.actorProfileId, version: command.payload.expectedVersion }
      : command.type === 'client.update' || command.type === 'client.deactivate' ? { entity: 'Client', id: command.payload.clientId, version: command.payload.expectedVersion }
        : command.type === 'contact.update' ? { entity: 'Contact', id: command.payload.contactId, version: command.payload.expectedVersion }
          : command.type === 'lead.update' || command.type === 'lead.lose' || command.type === 'lead.convert'
            ? { entity: 'Lead', id: command.payload.leadId, version: command.payload.expectedVersion }
            : command.type === 'engagement.advance' ? { entity: 'Engagement', id: command.payload.engagementId, version: command.payload.expectedVersion }
              : null;
  if (versionTarget && (parsed.data.expectedVersions.length !== 1
    || parsed.data.expectedVersions[0].entity !== versionTarget.entity
    || parsed.data.expectedVersions[0].id !== versionTarget.id
    || parsed.data.expectedVersions[0].version !== versionTarget.version)) {
    throw new ApiError('BAD_REQUEST', 'The expectedVersions vector must match the versioned command target.');
  }
  if (!versionTarget && parsed.data.expectedVersions.length) {
    throw new ApiError('BAD_REQUEST', 'This command does not accept an unrelated expectedVersions entry.');
  }
  return { ...parsed.data, idempotencyKey: idempotencyKey.trim() };
}

interface CommandReceiptRow {
  request_hash: string;
  response_json: string;
}

async function findCommandReceipt(env: Env, workspaceId: string, key: string): Promise<CommandReceiptRow | null> {
  return env.DB.prepare(`SELECT request_hash,response_json FROM command_receipts
    WHERE workspace_id=? AND idempotency_key=?`).bind(workspaceId, key).first<CommandReceiptRow>();
}

function replayCommand(receipt: CommandReceiptRow, requestHash: string): Record<string, unknown> {
  if (receipt.request_hash !== requestHash) {
    throw new ApiError('IDEMPOTENCY_MISMATCH', 'That command key was already used for different details.');
  }
  return { ...(JSON.parse(receipt.response_json) as Record<string, unknown>), replayed: true };
}

function requireDirectoryApprover(context: BusinessContext): void {
  if (context.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only the selected PARTNER approver profile can maintain the workspace directory.');
  }
}

interface StaffRow {
  id: string;
  version: number;
  active: number;
  natural_person_key: string;
  display_name: string;
  email: string | null;
  grade: BusinessActorProfileSummary['staffGrade'];
}

async function staffByNaturalKey(env: Env, workspaceId: string, naturalPersonKey: string): Promise<StaffRow | null> {
  return env.DB.prepare(`SELECT id,version,active,natural_person_key,display_name,email,grade FROM staff_members
    WHERE workspace_id=? AND natural_person_key=?`).bind(workspaceId, naturalPersonKey).first<StaffRow>();
}

async function activeContact(env: Env, workspaceId: string, contactId: string): Promise<boolean> {
  const contact = await env.DB.prepare(`SELECT id FROM contacts WHERE workspace_id=? AND id=? AND active=1`)
    .bind(workspaceId, contactId).first<{ id: string }>();
  return Boolean(contact);
}

async function activeStaff(env: Env, workspaceId: string, staffMemberId: string): Promise<StaffRow | null> {
  return env.DB.prepare(`SELECT id,version,active,natural_person_key,display_name,email,grade FROM staff_members
    WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId, staffMemberId).first<StaffRow>();
}

async function buildDirectoryMutation(
  env: Env,
  workspaceId: string,
  context: BusinessContext,
  command: BusinessDirectoryCommand,
  commandId: string,
  now: string
): Promise<BusinessMutation> {
  requireDirectoryApprover(context);
  const actorId = context.actor.id;

  if (command.type === 'staff.create') {
    const duplicate = await staffByNaturalKey(env, workspaceId, command.payload.naturalPersonKey);
    if (duplicate) throw new ApiError('VERSION_CONFLICT', 'A staff member already uses this natural-person key.');
    const staffMemberId = crypto.randomUUID();
    return {
      statements: [env.DB.prepare(`INSERT INTO staff_members(
        id,workspace_id,version,natural_person_key,display_name,email,grade,active,created_at,updated_at,created_by_actor_id,updated_by_actor_id
      ) VALUES(?,?,1,?,?,?, ?,1,?,?,?,?)`).bind(
        staffMemberId, workspaceId, command.payload.naturalPersonKey, command.payload.displayName,
        command.payload.email ?? null, command.payload.grade, now, now, actorId, actorId
      )],
      result: { staffMemberId }, entityType: 'STAFF_MEMBER', entityId: staffMemberId, beforeVersion: null, afterVersion: 1
    };
  }

  if (command.type === 'staff.update') {
    const payload = command.payload;
    const before = await env.DB.prepare(`SELECT id,version,active,grade FROM staff_members WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, payload.staffMemberId).first<Pick<StaffRow, 'id' | 'version' | 'active' | 'grade'>>();
    if (!before) throw new ApiError('NOT_FOUND', 'Staff member not found.');
    const nextGrade = payload.grade ?? before.grade;
    if (nextGrade !== 'PARTNER') {
      const hasApprover = await env.DB.prepare(`SELECT 1 AS found FROM actor_profiles
        WHERE workspace_id=? AND staff_member_id=? AND persona='APPROVER' AND active=1 LIMIT 1`)
        .bind(workspaceId, payload.staffMemberId).first<{ found: number }>();
      if (hasApprover) throw new ApiError('PERSONA_ACTION_DENIED', 'Deactivate the APPROVER profile before changing this staff grade.');
    }
    if (nextGrade !== 'MANAGER' && nextGrade !== 'SENIOR') {
      const hasReviewer = await env.DB.prepare(`SELECT 1 AS found FROM actor_profiles
        WHERE workspace_id=? AND staff_member_id=? AND persona='REVIEWER' AND active=1 LIMIT 1`)
        .bind(workspaceId, payload.staffMemberId).first<{ found: number }>();
      if (hasReviewer) throw new ApiError('PERSONA_ACTION_DENIED', 'Deactivate the REVIEWER profile before changing this staff grade.');
    }
    const assertionSeq = 10;
    const statement = env.DB.prepare(`UPDATE staff_members SET
      display_name=COALESCE(?,display_name), email=CASE WHEN ?=1 THEN ? ELSE email END,
      grade=?, version=version+1, updated_at=?, updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND version=? AND active=1`)
      .bind(
        payload.displayName ?? null,
        payload.email === undefined ? 0 : 1,
        payload.email ?? null,
        nextGrade,
        now,
        actorId,
        workspaceId,
        payload.staffMemberId,
        payload.expectedVersion
      );
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,?,CASE WHEN EXISTS(SELECT 1 FROM staff_members WHERE workspace_id=? AND id=? AND version=? AND active=1) THEN 1 ELSE 0 END`)
          .bind(workspaceId, assertionSeq, workspaceId, payload.staffMemberId, payload.expectedVersion),
        statement
      ],
      result: { staffMemberId: payload.staffMemberId, version: payload.expectedVersion + 1 },
      entityType: 'STAFF_MEMBER', entityId: payload.staffMemberId, beforeVersion: payload.expectedVersion, afterVersion: payload.expectedVersion + 1
    };
  }

  if (command.type === 'actor-profile.assign') {
    const actorProfileId = crypto.randomUUID();
    let staffMemberId: string | null = null;
    let contactId: string | null = null;
    if (command.payload.persona === 'CLIENT') {
      contactId = command.payload.contactId;
      if (!await activeContact(env, workspaceId, contactId)) throw new ApiError('NOT_FOUND', 'Active client contact not found.');
    } else {
      staffMemberId = command.payload.staffMemberId;
      const staff = await activeStaff(env, workspaceId, staffMemberId);
      if (!staff) throw new ApiError('NOT_FOUND', 'Active staff member not found.');
      if (command.payload.persona === 'APPROVER' && staff.grade !== 'PARTNER') {
        throw new ApiError('PERSONA_ACTION_DENIED', 'APPROVER profiles require PARTNER grade.');
      }
      if (command.payload.persona === 'REVIEWER' && staff.grade !== 'MANAGER' && staff.grade !== 'SENIOR') {
        throw new ApiError('PERSONA_ACTION_DENIED', 'REVIEWER profiles require MANAGER or SENIOR grade.');
      }
    }
    return {
      statements: [env.DB.prepare(`INSERT INTO actor_profiles(
        id,workspace_id,version,persona,staff_member_id,contact_id,active,created_at,updated_at
      ) VALUES(?,?,1,?,?,?,1,?,?)`).bind(
        actorProfileId, workspaceId, command.payload.persona, staffMemberId, contactId, now, now
      )],
      result: { actorProfileId }, entityType: 'ACTOR_PROFILE', entityId: actorProfileId, beforeVersion: null, afterVersion: 1
    };
  }

  const payload = command.payload;
  const profile = await env.DB.prepare(`SELECT id,version,persona,active FROM actor_profiles WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, payload.actorProfileId).first<{ id: string; version: number; persona: BusinessPersona; active: number }>();
  if (!profile) throw new ApiError('NOT_FOUND', 'Actor profile not found.');
  if (profile.persona === 'APPROVER') {
    const activeApprovers = await env.DB.prepare(`SELECT COUNT(*) AS count FROM actor_profiles
      WHERE workspace_id=? AND persona='APPROVER' AND active=1`).bind(workspaceId).first<{ count: number }>();
    if ((activeApprovers?.count ?? 0) <= 1) {
      throw new ApiError('PERSONA_ACTION_DENIED', 'The last active APPROVER profile cannot be deactivated. Assign another Partner approver first.');
    }
  }
  return {
    statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,?,CASE WHEN EXISTS(
          SELECT 1 FROM actor_profiles ap WHERE ap.workspace_id=? AND ap.id=? AND ap.version=? AND ap.active=1
            AND (ap.persona<>'APPROVER' OR (SELECT COUNT(*) FROM actor_profiles
              WHERE workspace_id=? AND persona='APPROVER' AND active=1)>1)
        ) THEN 1 ELSE 0 END`)
        .bind(workspaceId, 11, workspaceId, payload.actorProfileId, payload.expectedVersion, workspaceId),
      env.DB.prepare(`UPDATE actor_profiles SET active=0,version=version+1,updated_at=?
        WHERE workspace_id=? AND id=? AND version=? AND active=1`)
        .bind(now, workspaceId, payload.actorProfileId, payload.expectedVersion)
    ],
    result: { actorProfileId: payload.actorProfileId, version: payload.expectedVersion + 1 },
    entityType: 'ACTOR_PROFILE', entityId: payload.actorProfileId, beforeVersion: payload.expectedVersion, afterVersion: payload.expectedVersion + 1
  };
}

interface BusinessMutation {
  statements: D1PreparedStatement[];
  result: Record<string, unknown>;
  entityType: string;
  entityId: string;
  beforeVersion: number | null;
  afterVersion: number;
  auditDetails?: Record<string, unknown>;
}

function requireCommercialStaff(context: BusinessContext, command: string): void {
  if (context.actor.persona === 'CLIENT') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'A CLIENT profile cannot maintain internal commercial records.');
  }
  if (!['PREPARER', 'APPROVER'].includes(context.actor.persona)) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'This commercial action is limited to PREPARER or APPROVER profiles.');
  }
  const requiredAction = command.startsWith('client.') || command.startsWith('contact.')
      ? 'client.manage'
      : command === 'lead.convert' ? 'lead.convert'
        : command.startsWith('lead.') ? 'lead.manage'
          : command === 'engagement.advance' ? 'engagement.advance'
            : command === 'standards-profile.create' ? 'standards.manage' : null;
  if (!requiredAction || !context.allowedActions.includes(requiredAction)) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'This actor profile cannot perform the requested commercial action.');
  }
  if (command === 'client.deactivate' && context.actor.persona !== 'APPROVER') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only an APPROVER can deactivate a client.');
  }
}

function requireClientScope(context: BusinessContext, clientId: string): void {
  if (context.scope.clientId && context.scope.clientId !== clientId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The command client does not match the selected request context.');
  }
}

function contactRoutePurposes(role: z.infer<typeof contactRoleSchema>): Array<z.infer<typeof contactPurposeSchema>> {
  if (role === 'MD_GM') return ['PROPOSAL', 'EL', 'FINAL_REPORT', 'HOLDING_LETTER'];
  if (role === 'CFO_FINANCE_DIRECTOR') return ['INVOICE', 'RECEIPT'];
  if (role === 'CHIEF_ACCOUNTANT_LIAISON') return ['PBC'];
  return [];
}

async function buildCommercialMutation(
  env: Env,
  workspaceId: string,
  context: BusinessContext,
  command: BusinessCommercialCommand,
  commandId: string,
  now: string
): Promise<BusinessMutation> {
  requireCommercialStaff(context, command.type);
  const actorId = context.actor.id;

  if (command.type === 'client.create') {
    const payload = command.payload;
    const duplicateCode = await env.DB.prepare(`SELECT id FROM clients WHERE workspace_id=? AND code=?`)
      .bind(workspaceId, payload.code).first<{ id: string }>();
    if (duplicateCode) throw new ApiError('VERSION_CONFLICT', 'A client already uses this code. Choose a unique client code.');
    if (payload.parentClientId) {
      const parent = await env.DB.prepare(`SELECT id FROM clients WHERE workspace_id=? AND id=? AND active=1`)
        .bind(workspaceId, payload.parentClientId).first<{ id: string }>();
      if (!parent) throw new ApiError('VALIDATION_FAILED', 'The subsidiary parent must be an active client in this workspace.');
    }
    const clientId = crypto.randomUUID();
    const contactId = crypto.randomUUID();
    const routes = contactRoutePurposes(payload.primaryContact.role);
    const routeIds = routes.map(() => crypto.randomUUID());
    const statements = [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,20,CASE WHEN NOT EXISTS(SELECT 1 FROM clients WHERE workspace_id=? AND code=?)
          AND (? IS NULL OR EXISTS(SELECT 1 FROM clients WHERE workspace_id=? AND id=? AND active=1))
        THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.code, payload.parentClientId ?? null, workspaceId, payload.parentClientId ?? null),
      env.DB.prepare(`INSERT INTO clients(
        id,workspace_id,version,code,legal_name,trading_name,entity_type,parent_client_id,
        commercial_registration,tax_id,industry,address,country_code,active,created_at,updated_at,
        created_by_actor_id,updated_by_actor_id
      ) VALUES(?,?,1,?,?,?,?,?,?, ?,?,?,?,1,?,?,?,?)`).bind(
        clientId, workspaceId, payload.code, payload.legalName, payload.tradingName ?? null,
        payload.entityType, payload.parentClientId ?? null, payload.commercialRegistration ?? null,
        payload.taxId ?? null, payload.industry, payload.address, payload.countryCode,
        now, now, actorId, actorId
      ),
      env.DB.prepare(`INSERT INTO contacts(
        id,workspace_id,version,client_id,full_name,email,phone,title,role,is_primary,is_signatory,active,
        effective_from,effective_to,created_at,updated_at,created_by_actor_id,updated_by_actor_id
      ) VALUES(?,?,1,?,?,?,?,?, ?,1,?,1,?,NULL,?,?,?,?)`).bind(
        contactId, workspaceId, clientId, payload.primaryContact.fullName, payload.primaryContact.email ?? null,
        payload.primaryContact.phone ?? null, payload.primaryContact.title, payload.primaryContact.role,
        payload.primaryContact.isSignatory ? 1 : 0, payload.primaryContact.effectiveFrom, now, now, actorId, actorId
      ),
      ...routes.map((purpose, index) => env.DB.prepare(`INSERT INTO contact_routes(
        id,workspace_id,version,client_id,purpose,contact_id,is_primary,created_at,updated_at,created_by_actor_id,updated_by_actor_id
      ) VALUES(?,?,1,?,?,?,1,?,?,?,?)`).bind(
        routeIds[index], workspaceId, clientId, purpose, contactId, now, now, actorId, actorId
      ))
    ];
    return {
      statements,
      result: { clientId, primaryContactId: contactId, version: 1, routePurposes: routes },
      entityType: 'CLIENT', entityId: clientId, beforeVersion: null, afterVersion: 1
    };
  }

  if (command.type === 'client.update') {
    const payload = command.payload;
    requireClientScope(context, payload.clientId);
    const before = await env.DB.prepare(`SELECT version,entity_type,parent_client_id FROM clients
      WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId, payload.clientId)
      .first<{ version: number; entity_type: 'HOLDING' | 'SUBSIDIARY' | 'STANDALONE'; parent_client_id: string | null }>();
    if (!before) throw new ApiError('NOT_FOUND', 'Active client not found.');
    if (before.version !== payload.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The client changed. Reload it before editing.');
    const nextParent = payload.parentClientId === undefined ? before.parent_client_id : payload.parentClientId;
    const nextType = payload.entityType ?? before.entity_type;
    if ((nextType === 'SUBSIDIARY') !== Boolean(nextParent)) {
      throw new ApiError('VALIDATION_FAILED', 'SUBSIDIARY records require a parent; other entity types cannot have one. Update entity type and parent together.');
    }
    const hasParentChange = Object.hasOwn(payload, 'parentClientId');
    if (nextParent) {
      const parent = await env.DB.prepare(`SELECT id FROM clients WHERE workspace_id=? AND id=? AND active=1`)
        .bind(workspaceId, nextParent).first<{ id: string }>();
      if (!parent) throw new ApiError('VALIDATION_FAILED', 'The parent must be an active client in this workspace.');
      const cycle = await env.DB.prepare(`WITH RECURSIVE descendants(id) AS (
        SELECT id FROM clients WHERE workspace_id=? AND id=?
        UNION ALL SELECT c.id FROM clients c JOIN descendants d ON c.parent_client_id=d.id WHERE c.workspace_id=?
      ) SELECT id FROM descendants WHERE id=? LIMIT 1`).bind(workspaceId, payload.clientId, workspaceId, nextParent)
        .first<{ id: string }>();
      if (cycle) throw new ApiError('VALIDATION_FAILED', 'The parent change would create a client hierarchy cycle.');
    }
    return {
      statements: [
        env.DB.prepare(`WITH RECURSIVE descendants(id) AS (
          SELECT id FROM clients WHERE workspace_id=? AND id=?
          UNION ALL SELECT c.id FROM clients c JOIN descendants d ON c.parent_client_id=d.id WHERE c.workspace_id=?
        ) INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,21,CASE WHEN EXISTS(SELECT 1 FROM clients WHERE workspace_id=? AND id=? AND version=? AND active=1)
            AND (? IS NULL OR EXISTS(SELECT 1 FROM clients WHERE workspace_id=? AND id=? AND active=1))
            AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM descendants WHERE id=?))
            AND ((?='SUBSIDIARY' AND ? IS NOT NULL) OR (?<>'SUBSIDIARY' AND ? IS NULL))
          THEN 1 ELSE 0 END`)
          .bind(workspaceId, payload.clientId, workspaceId, workspaceId, workspaceId, payload.clientId, payload.expectedVersion,
            nextParent, workspaceId, nextParent, nextParent, nextParent, nextType, nextParent, nextType, nextParent),
        env.DB.prepare(`UPDATE clients SET
          legal_name=COALESCE(?,legal_name),
          trading_name=CASE WHEN ?=1 THEN ? ELSE trading_name END,
          entity_type=?,
          parent_client_id=CASE WHEN ?=1 THEN ? ELSE parent_client_id END,
          commercial_registration=CASE WHEN ?=1 THEN ? ELSE commercial_registration END,
          tax_id=CASE WHEN ?=1 THEN ? ELSE tax_id END,
          industry=COALESCE(?,industry),address=COALESCE(?,address),country_code=COALESCE(?,country_code),
          version=version+1,updated_at=?,updated_by_actor_id=?
          WHERE workspace_id=? AND id=? AND version=? AND active=1`).bind(
          payload.legalName ?? null,
          Object.hasOwn(payload, 'tradingName') ? 1 : 0, payload.tradingName ?? null,
          nextType,
          hasParentChange ? 1 : 0, nextParent,
          Object.hasOwn(payload, 'commercialRegistration') ? 1 : 0, payload.commercialRegistration ?? null,
          Object.hasOwn(payload, 'taxId') ? 1 : 0, payload.taxId ?? null,
          payload.industry ?? null, payload.address ?? null, payload.countryCode ?? null,
          now, actorId, workspaceId, payload.clientId, payload.expectedVersion
        )
      ],
      result: { clientId: payload.clientId, version: payload.expectedVersion + 1 },
      entityType: 'CLIENT', entityId: payload.clientId, beforeVersion: payload.expectedVersion, afterVersion: payload.expectedVersion + 1
    };
  }

  if (command.type === 'client.deactivate') {
    const payload = command.payload;
    requireClientScope(context, payload.clientId);
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,22,CASE WHEN EXISTS(SELECT 1 FROM clients c WHERE c.workspace_id=? AND c.id=? AND c.version=? AND c.active=1)
            AND NOT EXISTS(SELECT 1 FROM clients child WHERE child.workspace_id=? AND child.parent_client_id=? AND child.active=1)
            AND NOT EXISTS(SELECT 1 FROM engagements e WHERE e.workspace_id=? AND e.client_id=? AND e.lifecycle_state<>'ARCHIVED_READ_ONLY')
            AND NOT EXISTS(SELECT 1 FROM actor_profiles ap JOIN contacts c ON c.workspace_id=ap.workspace_id AND c.id=ap.contact_id
              WHERE ap.workspace_id=? AND ap.persona='CLIENT' AND ap.active=1 AND c.client_id=? )
          THEN 1 ELSE 0 END`)
          .bind(workspaceId, workspaceId, payload.clientId, payload.expectedVersion, workspaceId, payload.clientId,
            workspaceId, payload.clientId, workspaceId, payload.clientId),
        env.DB.prepare(`UPDATE clients SET active=0,version=version+1,updated_at=?,updated_by_actor_id=?
          WHERE workspace_id=? AND id=? AND version=? AND active=1`).bind(now, actorId, workspaceId, payload.clientId, payload.expectedVersion)
      ],
      result: { clientId: payload.clientId, version: payload.expectedVersion + 1, active: false },
      entityType: 'CLIENT', entityId: payload.clientId, beforeVersion: payload.expectedVersion, afterVersion: payload.expectedVersion + 1,
      auditDetails: { reason: payload.reason }
    };
  }

  if (command.type === 'contact.create') {
    const payload = command.payload;
    requireClientScope(context, payload.clientId);
    const client = await env.DB.prepare(`SELECT id FROM clients WHERE workspace_id=? AND id=? AND active=1`)
      .bind(workspaceId, payload.clientId).first<{ id: string }>();
    if (!client) throw new ApiError('NOT_FOUND', 'Active client not found.');
    const contactId = crypto.randomUUID();
    const defaultRoutes = contactRoutePurposes(payload.contact.role);
    const routeIds = defaultRoutes.map(() => crypto.randomUUID());
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,23,CASE WHEN EXISTS(SELECT 1 FROM clients WHERE workspace_id=? AND id=? AND active=1)
          THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.clientId),
        env.DB.prepare(`INSERT INTO contacts(
          id,workspace_id,version,client_id,full_name,email,phone,title,role,is_primary,is_signatory,active,
          effective_from,effective_to,created_at,updated_at,created_by_actor_id,updated_by_actor_id
        ) VALUES(?,?,1,?,?,?,?,?, ?,0,?,1,?,NULL,?,?,?,?)`).bind(
          contactId, workspaceId, payload.clientId, payload.contact.fullName, payload.contact.email ?? null,
          payload.contact.phone ?? null, payload.contact.title, payload.contact.role,
          payload.contact.isSignatory ? 1 : 0, payload.contact.effectiveFrom, now, now, actorId, actorId
        ),
        ...defaultRoutes.map((purpose, index) => env.DB.prepare(`INSERT INTO contact_routes(
          id,workspace_id,version,client_id,purpose,contact_id,is_primary,created_at,updated_at,created_by_actor_id,updated_by_actor_id
        ) VALUES(?,?,1,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM contact_routes WHERE workspace_id=? AND client_id=? AND purpose=? AND is_primary=1) THEN 0 ELSE 1 END,?,?,?,?)`)
          .bind(routeIds[index], workspaceId, payload.clientId, purpose, contactId,
            workspaceId, payload.clientId, purpose, now, now, actorId, actorId))
      ],
      result: { contactId, clientId: payload.clientId, version: 1, routePurposes: defaultRoutes },
      entityType: 'CONTACT', entityId: contactId, beforeVersion: null, afterVersion: 1
    };
  }

  if (command.type === 'contact.update') {
    const payload = command.payload;
    const before = await env.DB.prepare(`SELECT version,client_id,email,phone,is_primary,active FROM contacts
      WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId, payload.contactId)
      .first<{ version: number; client_id: string; email: string | null; phone: string | null; is_primary: number; active: number }>();
    if (!before) throw new ApiError('NOT_FOUND', 'Active client contact not found.');
    requireClientScope(context, before.client_id);
    if (before.version !== payload.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The contact changed. Reload it before editing.');
    const nextEmail = payload.email === undefined ? before.email : payload.email;
    const nextPhone = payload.phone === undefined ? before.phone : payload.phone;
    const nextActive = payload.active ?? Boolean(before.active);
    const nextPrimary = payload.active === false ? false : payload.isPrimary ?? Boolean(before.is_primary);
    const changePrimary = Object.hasOwn(payload, 'isPrimary') || payload.active === false;
    if (nextActive && !nextEmail && !nextPhone) throw new ApiError('VALIDATION_FAILED', 'An active contact must keep an email address or phone number.');
    if (nextPrimary && !nextActive) throw new ApiError('VALIDATION_FAILED', 'An inactive contact cannot be the primary contact.');
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,24,CASE WHEN EXISTS(SELECT 1 FROM contacts WHERE workspace_id=? AND id=? AND version=? AND active=1)
        THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.contactId, payload.expectedVersion),
      ...(nextPrimary ? [env.DB.prepare(`UPDATE contacts SET is_primary=0,version=version+1,updated_at=?,updated_by_actor_id=?
        WHERE workspace_id=? AND client_id=? AND is_primary=1 AND active=1 AND id<>?`)
        .bind(now, actorId, workspaceId, before.client_id, payload.contactId)] : []),
      env.DB.prepare(`UPDATE contacts SET
        full_name=COALESCE(?,full_name),
        email=CASE WHEN ?=1 THEN ? ELSE email END,
        phone=CASE WHEN ?=1 THEN ? ELSE phone END,
        title=COALESCE(?,title),role=COALESCE(?,role),
        is_primary=CASE WHEN ?=1 THEN ? ELSE is_primary END,
        is_signatory=COALESCE(?,is_signatory),active=?,
        effective_to=CASE WHEN ?=1 THEN ? ELSE effective_to END,
        version=version+1,updated_at=?,updated_by_actor_id=?
        WHERE workspace_id=? AND id=? AND version=? AND active=1`).bind(
        payload.fullName ?? null, Object.hasOwn(payload, 'email') ? 1 : 0, payload.email ?? null,
        Object.hasOwn(payload, 'phone') ? 1 : 0, payload.phone ?? null,
        payload.title ?? null, payload.role ?? null,
        changePrimary ? 1 : 0, nextPrimary ? 1 : 0,
        payload.isSignatory === undefined ? null : payload.isSignatory ? 1 : 0, nextActive ? 1 : 0,
        Object.hasOwn(payload, 'effectiveTo') ? 1 : 0, payload.effectiveTo ?? null,
        now, actorId, workspaceId, payload.contactId, payload.expectedVersion
      )
    ];
    return {
      statements,
      result: { contactId: payload.contactId, version: payload.expectedVersion + 1 },
      entityType: 'CONTACT', entityId: payload.contactId, beforeVersion: payload.expectedVersion, afterVersion: payload.expectedVersion + 1
    };
  }

  if (command.type === 'contact.route') {
    const payload = command.payload;
    requireClientScope(context, payload.clientId);
    const contact = await env.DB.prepare(`SELECT id FROM contacts WHERE workspace_id=? AND client_id=? AND id=? AND active=1`)
      .bind(workspaceId, payload.clientId, payload.contactId).first<{ id: string }>();
    if (!contact) throw new ApiError('VALIDATION_FAILED', 'Routing requires an active contact on the same client.');
    const existing = await env.DB.prepare(`SELECT id,version FROM contact_routes
      WHERE workspace_id=? AND client_id=? AND purpose=? AND contact_id=?`)
      .bind(workspaceId, payload.clientId, payload.purpose, payload.contactId).first<{ id: string; version: number }>();
    if ((existing?.version ?? null) !== payload.expectedVersion) {
      throw new ApiError('VERSION_CONFLICT', 'The contact route changed. Refresh routing and retry.');
    }
    const routeId = existing?.id ?? crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,25,CASE WHEN EXISTS(SELECT 1 FROM contacts WHERE workspace_id=? AND client_id=? AND id=? AND active=1)
          AND ((? IS NULL AND NOT EXISTS(SELECT 1 FROM contact_routes WHERE workspace_id=? AND client_id=? AND purpose=? AND contact_id=?))
            OR (? IS NOT NULL AND EXISTS(SELECT 1 FROM contact_routes WHERE workspace_id=? AND client_id=? AND purpose=? AND contact_id=? AND version=?)))
        THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.clientId, payload.contactId,
        payload.expectedVersion, workspaceId, payload.clientId, payload.purpose, payload.contactId,
        payload.expectedVersion, workspaceId, payload.clientId, payload.purpose, payload.contactId, payload.expectedVersion ?? 0),
      ...(payload.isPrimary ? [env.DB.prepare(`UPDATE contact_routes SET is_primary=0,version=version+1,updated_at=?,updated_by_actor_id=?
        WHERE workspace_id=? AND client_id=? AND purpose=? AND is_primary=1 AND contact_id<>?`)
        .bind(now, actorId, workspaceId, payload.clientId, payload.purpose, payload.contactId)] : []),
      payload.expectedVersion === null
        ? env.DB.prepare(`INSERT INTO contact_routes(
            id,workspace_id,version,client_id,purpose,contact_id,is_primary,created_at,updated_at,created_by_actor_id,updated_by_actor_id
          ) VALUES(?,?,1,?,?,?,?,?,?,?,?)`).bind(routeId, workspaceId, payload.clientId, payload.purpose,
            payload.contactId, payload.isPrimary ? 1 : 0, now, now, actorId, actorId)
        : env.DB.prepare(`UPDATE contact_routes SET is_primary=?,version=version+1,updated_at=?,updated_by_actor_id=?
            WHERE workspace_id=? AND id=? AND version=?`).bind(payload.isPrimary ? 1 : 0, now, actorId,
            workspaceId, routeId, payload.expectedVersion)
    ];
    return {
      statements,
      result: { contactRouteId: routeId, clientId: payload.clientId, contactId: payload.contactId, purpose: payload.purpose, isPrimary: payload.isPrimary, version: (payload.expectedVersion ?? 0) + 1 },
      entityType: 'CONTACT_ROUTE', entityId: routeId, beforeVersion: payload.expectedVersion, afterVersion: (payload.expectedVersion ?? 0) + 1
    };
  }

  if (command.type === 'client.affiliation.add') {
    const payload = command.payload;
    requireClientScope(context, payload.clientId);
    const clients = await env.DB.prepare(`SELECT COUNT(*) AS count FROM clients WHERE workspace_id=? AND active=1 AND id IN (?,?)`)
      .bind(workspaceId, payload.clientId, payload.relatedClientId).first<{ count: number }>();
    if ((clients?.count ?? 0) !== 2) throw new ApiError('VALIDATION_FAILED', 'Both related clients must be active records in this workspace.');
    if (payload.clientId === payload.relatedClientId) throw new ApiError('VALIDATION_FAILED', 'A client cannot be affiliated with itself.');
    const affiliationId = crypto.randomUUID();
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,26,CASE WHEN EXISTS(SELECT 1 FROM clients WHERE workspace_id=? AND id=? AND active=1)
            AND EXISTS(SELECT 1 FROM clients WHERE workspace_id=? AND id=? AND active=1) AND ?<>?
          THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.clientId, workspaceId, payload.relatedClientId, payload.clientId, payload.relatedClientId),
        env.DB.prepare(`INSERT INTO client_affiliations(id,workspace_id,version,client_id,related_client_id,relationship,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
          VALUES(?,?,1,?,?,?,?,?,?,?)`).bind(affiliationId, workspaceId, payload.clientId, payload.relatedClientId,
          payload.relationship, now, now, actorId, actorId)
      ],
      result: { affiliationId, clientId: payload.clientId, relatedClientId: payload.relatedClientId },
      entityType: 'CLIENT_AFFILIATION', entityId: affiliationId, beforeVersion: null, afterVersion: 1
    };
  }

  if (command.type === 'lead.create') {
    const payload = command.payload;
    let clientId = payload.clientId;
    let primaryContactId = payload.primaryContactId;
    const statements: D1PreparedStatement[] = [];
    let routePurposes: ReturnType<typeof contactRoutePurposes> = [];
    if (payload.newClient) {
      if (context.scope.clientId) throw new ApiError('FORBIDDEN_SCOPE', 'Clear the selected client scope before registering a new prospect.');
      const duplicate = await env.DB.prepare(`SELECT id,legal_name FROM clients WHERE workspace_id=?
        AND (code=? OR lower(trim(legal_name))=lower(trim(?))) LIMIT 1`)
        .bind(workspaceId, payload.newClient.code, payload.newClient.legalName)
        .first<{ id: string; legal_name: string }>();
      if (duplicate) {
        const sameName = duplicate.legal_name.trim().toLocaleLowerCase() === payload.newClient.legalName.trim().toLocaleLowerCase();
        throw new ApiError('VERSION_CONFLICT', sameName
          ? 'A client with this exact legal name already exists. Link the lead to that client to avoid a duplicate.'
          : 'A client already uses this code. Choose a unique client code.');
      }
      clientId = crypto.randomUUID();
      primaryContactId = crypto.randomUUID();
      routePurposes = contactRoutePurposes(payload.newClient.primaryContact.role);
      statements.push(
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,27,CASE WHEN NOT EXISTS(SELECT 1 FROM clients WHERE workspace_id=? AND (code=? OR lower(trim(legal_name))=lower(trim(?))))
          THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.newClient.code, payload.newClient.legalName),
        env.DB.prepare(`INSERT INTO clients(
          id,workspace_id,version,code,legal_name,trading_name,entity_type,parent_client_id,
          commercial_registration,tax_id,industry,address,country_code,active,created_at,updated_at,
          created_by_actor_id,updated_by_actor_id
        ) VALUES(?,?,1,?,?,NULL,'STANDALONE',NULL,NULL,NULL,?,?,?,1,?,?,?,?)`).bind(
          clientId, workspaceId, payload.newClient.code, payload.newClient.legalName,
          payload.newClient.industry, payload.newClient.address, payload.newClient.countryCode, now, now, actorId, actorId
        ),
        env.DB.prepare(`INSERT INTO contacts(
          id,workspace_id,version,client_id,full_name,email,phone,title,role,is_primary,is_signatory,active,
          effective_from,effective_to,created_at,updated_at,created_by_actor_id,updated_by_actor_id
        ) VALUES(?,?,1,?,?,?,?,?,?,1,0,1,?,NULL,?,?,?,?)`).bind(
          primaryContactId, workspaceId, clientId, payload.newClient.primaryContact.fullName,
          payload.newClient.primaryContact.email ?? null, payload.newClient.primaryContact.phone ?? null,
          payload.newClient.primaryContact.title, payload.newClient.primaryContact.role, now, now, now, actorId, actorId
        ),
        ...routePurposes.map(purpose => env.DB.prepare(`INSERT INTO contact_routes(
          id,workspace_id,version,client_id,purpose,contact_id,is_primary,created_at,updated_at,created_by_actor_id,updated_by_actor_id
        ) VALUES(?,?,1,?,?,?,1,?,?,?,?)`).bind(
          crypto.randomUUID(), workspaceId, clientId, purpose, primaryContactId, now, now, actorId, actorId
        ))
      );
    } else {
      requireClientScope(context, clientId!);
      const intake = await env.DB.prepare(`SELECT c.id,ct.id AS contact_id FROM clients c
        JOIN contacts ct ON ct.workspace_id=c.workspace_id AND ct.client_id=c.id
        WHERE c.workspace_id=? AND c.id=? AND c.active=1 AND ct.id=? AND ct.active=1`)
        .bind(workspaceId, clientId, primaryContactId).first<{ id: string; contact_id: string }>();
      if (!intake) throw new ApiError('GATE_BLOCKED', 'Lead intake requires an active client and an active contact belonging to that client.');
    }
    statements.push(env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,28,CASE WHEN EXISTS(SELECT 1 FROM clients WHERE workspace_id=? AND id=? AND active=1)
        AND EXISTS(SELECT 1 FROM contacts WHERE workspace_id=? AND client_id=? AND id=? AND active=1)
      THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, clientId, workspaceId, clientId, primaryContactId));
    const leadId = crypto.randomUUID();
    statements.push(env.DB.prepare(`INSERT INTO leads(
      id,workspace_id,version,client_id,primary_contact_id,source,received_at,requested_service,period_start,period_end,
      estimated_fee_minor,status,loss_reason,converted_engagement_id,created_at,updated_at,created_by_actor_id,updated_by_actor_id
    ) VALUES(?,?,1,?,?,?,?,?,?,?,?,'OPEN',NULL,NULL,?,?,?,?)`).bind(
      leadId, workspaceId, clientId, primaryContactId, payload.source,
      new Date(payload.receivedAt).toISOString(), payload.requestedService, payload.periodStart, payload.periodEnd,
      payload.estimatedFeeMinor === undefined ? null : Number(payload.estimatedFeeMinor), now, now, actorId, actorId
    ));
    return {
      statements,
      result: { leadId, clientId, primaryContactId, createdClient: Boolean(payload.newClient), routePurposes, status: 'OPEN', version: 1 },
      entityType: 'LEAD', entityId: leadId, beforeVersion: null, afterVersion: 1
    };
  }

  if (command.type === 'lead.update') {
    const payload = command.payload;
    const before = await env.DB.prepare(`SELECT version,client_id,primary_contact_id,status,period_start,period_end
      FROM leads WHERE workspace_id=? AND id=?`).bind(workspaceId, payload.leadId)
      .first<{ version: number; client_id: string; primary_contact_id: string | null; status: 'OPEN' | 'QUALIFIED' | 'CONVERTED' | 'LOST'; period_start: string; period_end: string }>();
    if (!before) throw new ApiError('NOT_FOUND', 'Lead not found.');
    requireClientScope(context, before.client_id ?? '');
    if (before.version !== payload.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The lead changed. Reload it before editing.');
    if (!['OPEN', 'QUALIFIED'].includes(before.status)) throw new ApiError('INVALID_TRANSITION', 'Only an open or qualified lead can be edited.');
    const primaryContactId = payload.primaryContactId ?? before.primary_contact_id;
    if (primaryContactId) {
      const contact = await env.DB.prepare(`SELECT id FROM contacts WHERE workspace_id=? AND client_id=? AND id=? AND active=1`)
        .bind(workspaceId, before.client_id, primaryContactId).first<{ id: string }>();
      if (!contact) throw new ApiError('VALIDATION_FAILED', 'The lead contact must be active and belong to the lead client.');
    }
    const start = payload.periodStart ?? before.period_start;
    const end = payload.periodEnd ?? before.period_end;
    if (start > end) throw new ApiError('VALIDATION_FAILED', 'The requested period end must not precede the start.');
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,28,CASE WHEN EXISTS(SELECT 1 FROM leads WHERE workspace_id=? AND id=? AND version=? AND status IN ('OPEN','QUALIFIED'))
            AND (? IS NULL OR EXISTS(SELECT 1 FROM contacts WHERE workspace_id=? AND client_id=? AND id=? AND active=1))
          THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.leadId, payload.expectedVersion,
          primaryContactId, workspaceId, before.client_id, primaryContactId),
        env.DB.prepare(`UPDATE leads SET primary_contact_id=?,source=COALESCE(?,source),received_at=COALESCE(?,received_at),
          requested_service=COALESCE(?,requested_service),period_start=?,period_end=?,
          estimated_fee_minor=CASE WHEN ?=1 THEN ? ELSE estimated_fee_minor END,
          version=version+1,updated_at=?,updated_by_actor_id=?
          WHERE workspace_id=? AND id=? AND version=? AND status IN ('OPEN','QUALIFIED')`).bind(
          primaryContactId, payload.source ?? null, payload.receivedAt ? new Date(payload.receivedAt).toISOString() : null,
          payload.requestedService ?? null, start, end, Object.hasOwn(payload, 'estimatedFeeMinor') ? 1 : 0,
          payload.estimatedFeeMinor === undefined || payload.estimatedFeeMinor === null ? null : Number(payload.estimatedFeeMinor),
          now, actorId, workspaceId, payload.leadId, payload.expectedVersion
        )
      ],
      result: { leadId: payload.leadId, version: payload.expectedVersion + 1 },
      entityType: 'LEAD', entityId: payload.leadId, beforeVersion: payload.expectedVersion, afterVersion: payload.expectedVersion + 1
    };
  }

  if (command.type === 'lead.lose') {
    const payload = command.payload;
    const lead = await env.DB.prepare(`SELECT version,client_id,status FROM leads WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, payload.leadId).first<{ version: number; client_id: string | null; status: string }>();
    if (!lead) throw new ApiError('NOT_FOUND', 'Lead not found.');
    requireClientScope(context, lead.client_id ?? '');
    if (lead.version !== payload.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The lead changed. Reload it before closing.');
    if (!['OPEN', 'QUALIFIED'].includes(lead.status)) throw new ApiError('INVALID_TRANSITION', 'Only an open or qualified lead can be marked lost.');
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,29,CASE WHEN EXISTS(SELECT 1 FROM leads WHERE workspace_id=? AND id=? AND version=? AND status IN ('OPEN','QUALIFIED'))
          THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.leadId, payload.expectedVersion),
        env.DB.prepare(`UPDATE leads SET status='LOST',loss_reason=?,version=version+1,updated_at=?,updated_by_actor_id=?
          WHERE workspace_id=? AND id=? AND version=? AND status IN ('OPEN','QUALIFIED')`)
          .bind(payload.reason, now, actorId, workspaceId, payload.leadId, payload.expectedVersion)
      ],
      result: { leadId: payload.leadId, status: 'LOST', version: payload.expectedVersion + 1 },
      entityType: 'LEAD', entityId: payload.leadId, beforeVersion: payload.expectedVersion, afterVersion: payload.expectedVersion + 1,
      auditDetails: { lossReason: payload.reason }
    };
  }

  if (command.type === 'lead.convert') {
    const payload = command.payload;
    const lead = await env.DB.prepare(`SELECT l.version,l.client_id,l.primary_contact_id,l.requested_service,l.period_start,l.period_end,
        l.estimated_fee_minor,l.status,c.active AS client_active,ct.active AS contact_active,
        sp.effective_period_start,sp.effective_period_end
      FROM leads l JOIN clients c ON c.workspace_id=l.workspace_id AND c.id=l.client_id
      JOIN contacts ct ON ct.workspace_id=l.workspace_id AND ct.client_id=l.client_id AND ct.id=l.primary_contact_id
      JOIN standards_profiles sp ON sp.workspace_id=l.workspace_id AND sp.id=?
      WHERE l.workspace_id=? AND l.id=?`).bind(payload.standardsProfileId, workspaceId, payload.leadId)
      .first<{ version: number; client_id: string; primary_contact_id: string; requested_service: string; period_start: string; period_end: string; estimated_fee_minor: number | null; status: string; client_active: number; contact_active: number; effective_period_start: string; effective_period_end: string | null }>();
    if (!lead) throw new ApiError('NOT_FOUND', 'Lead, active client/contact or standards profile not found.');
    requireClientScope(context, lead.client_id);
    if (lead.version !== payload.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The lead changed. Reload it before conversion.');
    if (!['OPEN', 'QUALIFIED'].includes(lead.status)) throw new ApiError('INVALID_TRANSITION', 'Only an open or qualified lead can be converted.');
    if (lead.client_active !== 1 || lead.contact_active !== 1) throw new ApiError('GATE_BLOCKED', 'Conversion requires an active client and primary contact.');
    if (lead.period_start < lead.effective_period_start || (lead.effective_period_end && lead.period_end > lead.effective_period_end)) {
      throw new ApiError('VALIDATION_FAILED', 'The selected standards profile does not cover the requested reporting period.');
    }
    const fee = payload.contractFeeMinor ?? (lead.estimated_fee_minor === null ? undefined : String(lead.estimated_fee_minor));
    if (fee === undefined) throw new ApiError('VALIDATION_FAILED', 'Set an engagement fee in QAR minor units before converting this lead.');
    const engagementId = crypto.randomUUID();
    const timestamp = now;
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,30,CASE WHEN EXISTS(SELECT 1 FROM leads l JOIN clients c ON c.workspace_id=l.workspace_id AND c.id=l.client_id
            JOIN contacts ct ON ct.workspace_id=l.workspace_id AND ct.client_id=l.client_id AND ct.id=l.primary_contact_id
            WHERE l.workspace_id=? AND l.id=? AND l.version=? AND l.status IN ('OPEN','QUALIFIED') AND c.active=1 AND ct.active=1)
            AND EXISTS(SELECT 1 FROM standards_profiles WHERE workspace_id=? AND id=? AND effective_period_start<=? AND (effective_period_end IS NULL OR effective_period_end>=?))
            AND NOT EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND code=?)
          THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.leadId, payload.expectedVersion,
          workspaceId, payload.standardsProfileId, lead.period_start, lead.period_end, workspaceId, payload.engagementCode),
        env.DB.prepare(`INSERT INTO engagements(
          id,workspace_id,version,client_id,code,period_start,period_end,engagement_type,lifecycle_state,
          contract_fee_minor,active_proposal_version_id,active_tb_version_id,approved_planning_version_id,
          report_signed_at,report_date,released_at,archive_due_at,locked_at,portal_frozen_at,standards_profile_id,
          created_at,updated_at,created_by_actor_id,updated_by_actor_id
        ) VALUES(?,?,1,?,?,?,?,?,'LEAD_INGESTION',?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,?,?,?,?)`).bind(
          engagementId, workspaceId, lead.client_id, payload.engagementCode, lead.period_start, lead.period_end,
          lead.requested_service, Number(fee), payload.standardsProfileId, timestamp, timestamp, actorId, actorId
        ),
        env.DB.prepare(`UPDATE leads SET status='CONVERTED',converted_engagement_id=?,version=version+1,updated_at=?,updated_by_actor_id=?
          WHERE workspace_id=? AND id=? AND version=? AND status IN ('OPEN','QUALIFIED')`)
          .bind(engagementId, timestamp, actorId, workspaceId, payload.leadId, payload.expectedVersion)
      ],
      result: { engagementId, leadId: payload.leadId, leadStatus: 'CONVERTED', state: 'LEAD_INGESTION', version: 1 },
      entityType: 'ENGAGEMENT', entityId: engagementId, beforeVersion: null, afterVersion: 1
    };
  }

  if (command.type === 'standards-profile.create') {
    if (context.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER') {
      throw new ApiError('PERSONA_ACTION_DENIED', 'Only an APPROVER with PARTNER grade can approve a standards profile.');
    }
    const payload = command.payload;
    const standardsProfileId = crypto.randomUUID();
    const canonicalProfile = {
      name: payload.name,
      effectivePeriodStart: payload.effectivePeriodStart,
      effectivePeriodEnd: payload.effectivePeriodEnd ?? null,
      isa220Edition: payload.isa220Edition,
      isa570Edition: payload.isa570Edition,
      reportingFramework: payload.reportingFramework,
      presentationEdition: payload.presentationEdition,
      earlyAdoption: payload.earlyAdoption
    };
    const contentSha256 = await sha256Hex(JSON.stringify(canonicalProfile));
    return {
      statements: [env.DB.prepare(`INSERT INTO standards_profiles(
        id,workspace_id,version,name,effective_period_start,effective_period_end,isa_220_edition,isa_570_edition,
        reporting_framework,presentation_edition,early_adoption,approved_by_actor_id,approved_at,content_sha256,created_at,updated_at
      ) VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        standardsProfileId, workspaceId, canonicalProfile.name, canonicalProfile.effectivePeriodStart,
        canonicalProfile.effectivePeriodEnd, canonicalProfile.isa220Edition, canonicalProfile.isa570Edition,
        canonicalProfile.reportingFramework, canonicalProfile.presentationEdition, canonicalProfile.earlyAdoption ? 1 : 0,
        actorId, now, contentSha256, now, now
      )],
      result: { standardsProfileId, version: 1, contentSha256 },
      entityType: 'STANDARDS_PROFILE', entityId: standardsProfileId, beforeVersion: null, afterVersion: 1,
      auditDetails: { standardsProfileId, contentSha256 }
    };
  }

  const payload = command.payload;
  const engagement = await env.DB.prepare(`SELECT e.version,e.client_id,e.lifecycle_state,e.period_start,e.period_end,c.active AS client_active,
      l.id AS lead_id,l.primary_contact_id,ct.active AS contact_active
    FROM engagements e JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id
    JOIN leads l ON l.workspace_id=e.workspace_id AND l.client_id=e.client_id AND l.converted_engagement_id=e.id AND l.status='CONVERTED'
    JOIN contacts ct ON ct.workspace_id=l.workspace_id AND ct.client_id=l.client_id AND ct.id=l.primary_contact_id
    WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId, payload.engagementId)
    .first<{ version: number; client_id: string; lifecycle_state: string; period_start: string; period_end: string; client_active: number; lead_id: string; primary_contact_id: string; contact_active: number }>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'Engagement or converted lead source not found.');
  requireClientScope(context, engagement.client_id);
  if (context.scope.engagementId && context.scope.engagementId !== payload.engagementId) throw new ApiError('FORBIDDEN_SCOPE', 'The engagement does not match the selected request context.');
  if (engagement.version !== payload.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The engagement changed. Reload it before advancing.');
  if (engagement.lifecycle_state !== payload.expectedState) throw new ApiError('INVALID_TRANSITION', 'The engagement is not in the expected lifecycle state.');
  if (engagement.client_active !== 1 || engagement.contact_active !== 1) throw new ApiError('GATE_BLOCKED', 'Lead intake requires an active client and active primary contact.');
  const transitionId = crypto.randomUUID();
  const reason = 'Client profile, primary contact, service and reporting period are validated.';
  const dependencyHash = await sha256Hex(JSON.stringify({
    engagementId: payload.engagementId, engagementVersion: engagement.version, clientId: engagement.client_id,
    leadId: engagement.lead_id, contactId: engagement.primary_contact_id
  }));
  return {
    statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,31,CASE WHEN EXISTS(SELECT 1 FROM engagements e JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id
          JOIN leads l ON l.workspace_id=e.workspace_id AND l.converted_engagement_id=e.id AND l.status='CONVERTED'
          JOIN contacts ct ON ct.workspace_id=l.workspace_id AND ct.client_id=l.client_id AND ct.id=l.primary_contact_id
          WHERE e.workspace_id=? AND e.id=? AND e.version=? AND e.lifecycle_state='LEAD_INGESTION' AND c.active=1 AND ct.active=1)
        THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.engagementId, engagement.version),
      env.DB.prepare(`UPDATE engagements SET lifecycle_state='PROPOSAL_GENERATION',version=version+1,updated_at=?,updated_by_actor_id=?
        WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state='LEAD_INGESTION'`)
        .bind(now, actorId, workspaceId, payload.engagementId, engagement.version),
      env.DB.prepare(`INSERT INTO state_transitions(
        id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at
      ) VALUES(?,?,?, ?,1,'LEAD_INGESTION','PROPOSAL_GENERATION',?,?,?,?)`)
        .bind(transitionId, workspaceId, engagement.client_id, payload.engagementId, commandId, reason, dependencyHash, now)
    ],
    result: { engagementId: payload.engagementId, state: 'PROPOSAL_GENERATION', transitionId, version: engagement.version + 1 },
    entityType: 'ENGAGEMENT', entityId: payload.engagementId, beforeVersion: engagement.version, afterVersion: engagement.version + 1
  };
}

/** Atomic first set of normalized directory commands for BUSINESS workspaces. */
export async function runBusinessDirectoryCommand(
  env: Env,
  workspaceId: string,
  request: Request,
  envelope: BusinessCommandEnvelope
): Promise<Record<string, unknown>> {
  await requireBusinessWorkspace(env, workspaceId);
  const suppliedActorId = request.headers.get('X-Actor-Id');
  const suppliedPersona = request.headers.get('X-Active-Persona');
  if ((suppliedActorId && suppliedActorId !== envelope.actor.actorId)
    || (suppliedPersona && suppliedPersona !== envelope.actor.persona)) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'The request actor context does not match the command envelope.');
  }
  const suppliedClient = request.headers.get('X-Client-Id');
  const suppliedEngagement = request.headers.get('X-Engagement-Id');
  if ((suppliedClient && suppliedClient !== envelope.context.clientId)
    || (suppliedEngagement && suppliedEngagement !== envelope.context.engagementId)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The request scope does not match the command envelope.');
  }
  const contextHeaders = new Headers(request.headers);
  contextHeaders.set('X-Actor-Id', envelope.actor.actorId);
  contextHeaders.set('X-Active-Persona', envelope.actor.persona);
  if (envelope.context.clientId) contextHeaders.set('X-Client-Id', envelope.context.clientId);
  else contextHeaders.delete('X-Client-Id');
  if (envelope.context.engagementId) contextHeaders.set('X-Engagement-Id', envelope.context.engagementId);
  else contextHeaders.delete('X-Engagement-Id');
  const context = await resolveBusinessContext(env, workspaceId, new Request(request.url, { headers: contextHeaders }));
  if (context.actor.id !== envelope.actor.actorId || context.actor.persona !== envelope.actor.persona) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'The command actor does not match the active workspace profile.');
  }
  const requestHash = await sha256Hex(JSON.stringify({
    command: envelope.command,
    actor: envelope.actor,
    context: envelope.context,
    expectedVersions: envelope.expectedVersions
  }));
  const prior = await findCommandReceipt(env, workspaceId, envelope.idempotencyKey);
  if (prior) return replayCommand(prior, requestHash);

  const workspace = await env.DB.prepare(`SELECT version,business_status FROM workspaces WHERE id=?`)
    .bind(workspaceId).first<{ version: number; business_status: 'ACTIVE' | 'READ_ONLY' }>();
  if (!workspace) throw new ApiError('NOT_FOUND', 'Workspace not found.');
  if (workspace.business_status !== 'ACTIVE') throw new ApiError('WORKSPACE_FROZEN', 'This workspace is read-only.');

  for (let attempt = 0; attempt < 3; attempt++) {
    const head = await env.DB.prepare(`SELECT id,last_sequence,last_event_hash FROM audit_chain_heads
      WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`).bind(workspaceId, workspaceId)
      .first<{ id: string; last_sequence: number; last_event_hash: string | null }>();
    if (!head) throw new ApiError('UNAVAILABLE', 'Workspace audit lineage is not initialized. No command was saved.');

    const commandId = crypto.randomUUID();
    const auditEventId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const now = Math.floor(Date.now() / 1000);
    const mutation = isBusinessDirectoryCommand(envelope.command)
      ? await buildDirectoryMutation(env, workspaceId, context, envelope.command, commandId, timestamp)
      : await buildCommercialMutation(env, workspaceId, context, envelope.command, commandId, timestamp);
    const sequence = head.last_sequence + 1;
    const eventDetails = JSON.stringify({
      commandId,
      result: mutation.result,
      ...(mutation.auditDetails ? { details: mutation.auditDetails } : {}),
      provenance: 'SELF_ASSERTED'
    });
    const eventHash = await sha256Hex(JSON.stringify({
      id: auditEventId,
      workspaceId,
      sequence,
      previousHash: head.last_event_hash,
      actorId: context.actor.id,
      actorPersona: context.actor.persona,
      commandType: envelope.command.type,
      entityType: mutation.entityType,
      entityId: mutation.entityId,
      details: eventDetails,
      timestamp
    }));
    const response = { commandId, result: mutation.result, replayed: false };
    const actorSnapshot = JSON.stringify({
      actorId: context.actor.id,
      persona: context.actor.persona,
      displayName: context.actor.displayName,
      staffGrade: context.actor.staffGrade,
      assurance: 'SELF_ASSERTED'
    });

    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,902,CASE WHEN EXISTS(SELECT 1 FROM workspaces WHERE id=? AND business_status='ACTIVE') THEN 1 ELSE 0 END`)
        .bind(workspaceId, workspaceId),
      env.DB.prepare(`INSERT INTO command_receipts(
        id,workspace_id,version,idempotency_key,request_hash,actor_snapshot_json,command_type,response_status,response_json,created_at
      ) VALUES(?,?,1,?,?,?,?,200,?,?)`).bind(
        commandId, workspaceId, envelope.idempotencyKey, requestHash, actorSnapshot, envelope.command.type, JSON.stringify(response), timestamp
      ),
      ...mutation.statements,
      env.DB.prepare(`UPDATE audit_chain_heads SET last_sequence=?,last_event_hash=?,updated_at=?
        WHERE id=? AND workspace_id=? AND last_sequence=? AND last_event_hash IS ?`)
        .bind(sequence, eventHash, timestamp, head.id, workspaceId, head.last_sequence, head.last_event_hash),
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,901,CASE WHEN EXISTS(SELECT 1 FROM audit_chain_heads WHERE id=? AND last_sequence=? AND last_event_hash=?) THEN 1 ELSE 0 END`)
        .bind(workspaceId, head.id, sequence, eventHash),
      env.DB.prepare(`INSERT INTO audit_events(
        id,workspace_id,sequence,actor_user_id,actor_role,command_type,entity_kind,entity_id,
        client_id,engagement_id,before_version,after_version,details_json,created_at,
        actor_assurance,source,chain_scope_kind,chain_scope_id,previous_hash,event_hash,actor_id,
        event_type,entity_type,command_id,actor_persona
      ) VALUES(?,?,?,NULL,?,?,?, ?,NULL,NULL,?,?,?,?, 'SELF_ASSERTED','USER','WORKSPACE',?,?,?,?,?,?,?,?)`)
        .bind(
          auditEventId, workspaceId, sequence, context.actor.persona, envelope.command.type,
          mutation.entityType.toLowerCase(), mutation.entityId, mutation.beforeVersion,
          mutation.afterVersion, eventDetails, now, workspaceId, head.last_event_hash,
          eventHash, context.actor.id, envelope.command.type, mutation.entityType,
          commandId, context.actor.persona
        ),
      env.DB.prepare(`UPDATE workspaces SET revision=revision+1,version=version+1,updated_at=?,updated_at_utc=?
        WHERE id=? AND business_status='ACTIVE'`).bind(now, timestamp, workspaceId),
      env.DB.prepare('DELETE FROM command_assertions WHERE workspace_id=?').bind(workspaceId)
    ];

    try {
      await env.DB.batch(statements);
      return response;
    } catch (error) {
      const raced = await findCommandReceipt(env, workspaceId, envelope.idempotencyKey);
      if (raced) return replayCommand(raced, requestHash);
      const currentHead = await env.DB.prepare(`SELECT last_sequence,last_event_hash FROM audit_chain_heads
        WHERE id=? AND workspace_id=?`).bind(head.id, workspaceId)
        .first<{ last_sequence: number; last_event_hash: string | null }>();
      const headAdvanced = Boolean(currentHead && (currentHead.last_sequence !== head.last_sequence || currentHead.last_event_hash !== head.last_event_hash));
      if (headAdvanced && attempt < 2) continue;
      if (headAdvanced) throw new ApiError('VERSION_CONFLICT', 'The audit lineage is busy. Retry this command with the same idempotency key.');
      if (error instanceof Error && /command_assertions|CHECK constraint failed: ok = 1|version|audit_chain_heads/i.test(error.message)) {
        throw new ApiError('VERSION_CONFLICT', 'The record or audit lineage changed. Reload and retry with the current version.');
      }
      if (error instanceof Error && /actor_profiles_one_active|UNIQUE constraint/i.test(error.message)) {
        throw new ApiError('VERSION_CONFLICT', 'That active persona is already assigned. Refresh the directory and choose another profile.');
      }
      throw error;
    }
  }
  throw new ApiError('VERSION_CONFLICT', 'The audit lineage is busy. Retry this command with the same idempotency key.');
}
