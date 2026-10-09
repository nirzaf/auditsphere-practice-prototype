// Real BUSINESS workspace setup and directory context.
// BUSINESS records never use the legacy TEST seed/session state path.

import * as z from 'zod';
import type { Env } from './env';
import { ApiError } from './errors';
import { sha256Hex } from './http';
import { requireWorkspace } from './db';
import { businessRiskCommands, buildBusinessRiskMutation, isBusinessRiskCommand } from './businessRisk';
import { businessDeliveryCommands, buildBusinessDeliveryMutation, isBusinessDeliveryCommand } from './businessDelivery';
import { businessPlanningCommands, buildBusinessPlanningMutation, isBusinessPlanningCommand } from './businessPlanning';
import { businessTbCommands, buildBusinessTbMutation, isBusinessTbCommand } from './businessTb';
import { businessFieldworkCommands, buildBusinessFieldworkMutation, isBusinessFieldworkCommand } from './businessFieldwork';
import { businessPracticeCommands, buildBusinessPracticeMutation, businessPracticeBootstrapStatements, getBusinessPracticeWorkspace, isBusinessPracticeCommand } from './businessPractice';
import { businessReportingCommands, buildBusinessReportingMutation, isBusinessReportingCommand } from './businessReporting';
import { presentationEditionBlocker } from '../src/domain/reportingStandards';
import { projectClientDocuments, type ClientDocumentSourceRow } from './clientDocumentProjection';

export const BUSINESS_SCHEMA_VERSION = 10;

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
  const details = JSON.stringify({ provenance: 'SYSTEM/BOOTSTRAP', dataMode: 'BUSINESS', scope: { clientId: null, engagementId: null } });
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
      ...await businessPracticeBootstrapStatements(env, workspaceId, actorProfileId, timestamp),
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
  staffMemberId?: string | null;
  contactId?: string | null;
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
    clientId: row.persona === 'CLIENT' ? row.clientId : null,
    staffMemberId: row.persona === 'CLIENT' ? null : row.staffMemberId,
    ...(row.persona === 'CLIENT' ? { contactId: row.contactId } : {})
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
    env.DB.prepare(`SELECT cr.id,cr.version,cr.purpose,cr.contact_id,cr.is_primary,cr.rationale,ct.full_name,ct.email,ct.phone
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

export async function listPublicLeadSubmissions(
  env: Env,
  workspaceId: string,
  request: Request,
  url: URL
): Promise<{ items: Array<Record<string, unknown>> }> {
  const context = await resolveBusinessContext(env, workspaceId, request) as BusinessReadContext;
  if (!context.allowedActions.includes('lead.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read lead records.');
  const status = url.searchParams.get('status');
  if (status && !['RECEIVED', 'ACCEPTED_AS_LEAD', 'REJECTED_SPAM', 'DUPLICATE'].includes(status)) {
    throw new ApiError('BAD_REQUEST', 'Choose a valid web inquiry status.');
  }
  const result = await env.DB.prepare(`SELECT id,version,status,company_name,contact_name,email_normalized,phone,service_interest,
      message,lead_id,created_at,updated_at
    FROM public_lead_submissions WHERE workspace_id=? AND (? IS NULL OR status=?)
    ORDER BY created_at DESC,id DESC LIMIT 100`)
    .bind(workspaceId, status, status).all<Record<string, unknown>>();
  return { items: (result.results ?? []).map(row => ({
    id: row.id, version: row.version, status: row.status, companyName: row.company_name,
    contactName: row.contact_name, email: row.email_normalized, phone: row.phone,
    serviceInterest: row.service_interest, message: row.message, leadId: row.lead_id,
    createdAt: row.created_at, updatedAt: row.updated_at
  })) };
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

export async function getBusinessProposalWorkspace(env: Env, workspaceId: string, request: Request): Promise<Record<string, unknown>> {
  const context = await resolveBusinessContext(env, workspaceId, request);
  if (!context.allowedActions.includes('proposal.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read proposal records.');
  const clientId = context.actor.persona === 'CLIENT' ? context.actor.clientId : context.scope.clientId;
  const engagementId = context.scope.engagementId;
  const engagements = context.actor.persona === 'CLIENT' ? { results: [] } : await env.DB.prepare(`SELECT e.id,e.version,e.client_id,e.code,e.period_start,e.period_end,e.lifecycle_state,e.contract_fee_minor,c.legal_name AS client_name
    FROM engagements e JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id
    WHERE e.workspace_id=? AND (? IS NULL OR e.client_id=?) AND (? IS NULL OR e.id=?)
    ORDER BY e.updated_at DESC,e.id DESC LIMIT 100`)
    .bind(workspaceId, clientId, clientId, engagementId, engagementId).all<Record<string, unknown>>();
  const proposalClauses = ['p.workspace_id=?'];
  const proposalBindings: unknown[] = [workspaceId];
  if (clientId) { proposalClauses.push('p.client_id=?'); proposalBindings.push(clientId); }
  if (engagementId) { proposalClauses.push('p.engagement_id=?'); proposalBindings.push(engagementId); }
  if (context.actor.persona === 'CLIENT') {
    proposalClauses.push(`ga.file_version_id IS NOT NULL AND COALESCE(approval.decision,'PENDING')='APPROVE'`);
  }
  const proposals = await env.DB.prepare(`SELECT p.id AS proposal_id,p.version AS proposal_version,p.client_id,p.engagement_id,
      pv.id AS proposal_version_id,pv.revision,pv.mode,pv.scope,pv.fee_minor,pv.currency,pv.advance_bps,pv.final_bps,pv.valid_until,pv.timeline_json,
      pv.team_cv_file_ids_json,pv.methodology_version,pv.firm_profile_version,pv.created_at,
      e.lifecycle_state,e.active_proposal_version_id,c.legal_name AS client_name,ga.file_version_id AS artifact_file_id,ga.content_sha256 AS artifact_sha256,
      COALESCE(approval.decision,'PENDING') AS approval_status,
      dispatch.id AS dispatch_id,dispatch.version AS dispatch_version,dispatch.last_error_code AS dispatch_error_code,
      COALESCE(dispatch.status,'NOT_DISPATCHED') AS dispatch_status,
      document_job.id AS document_job_id,document_job.last_error_code AS document_error_code,
      COALESCE(document_job.status,'NOT_GENERATED') AS document_status
    FROM proposals p JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.id=p.current_version_id
    JOIN engagements e ON e.workspace_id=p.workspace_id AND e.client_id=p.client_id AND e.id=p.engagement_id
    JOIN clients c ON c.workspace_id=p.workspace_id AND c.id=p.client_id
    LEFT JOIN proposal_artifacts pa ON pa.workspace_id=p.workspace_id AND pa.proposal_version_id=pv.id
    LEFT JOIN generated_artifacts ga ON ga.workspace_id=pa.workspace_id AND ga.id=pa.artifact_id
    LEFT JOIN (SELECT proposal_version_id,decision,ROW_NUMBER() OVER(PARTITION BY proposal_version_id ORDER BY decided_at DESC,id DESC) AS rn
      FROM proposal_approvals WHERE workspace_id=?) approval ON approval.proposal_version_id=pv.id AND approval.rn=1
    LEFT JOIN (SELECT d.id,d.version,d.engagement_id,d.file_version_id,d.status,j.last_error_code,
        ROW_NUMBER() OVER(PARTITION BY d.engagement_id,d.file_version_id ORDER BY d.created_at DESC,d.id DESC) AS rn
      FROM dispatches d JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id
      WHERE d.workspace_id=? AND d.purpose='PROPOSAL') dispatch
      ON dispatch.engagement_id=p.engagement_id AND dispatch.file_version_id=ga.file_version_id AND dispatch.rn=1
    LEFT JOIN outbox_jobs document_job ON document_job.workspace_id=p.workspace_id AND document_job.kind='GENERATE_DOCUMENT'
      AND document_job.aggregate_id=pv.id
    WHERE ${proposalClauses.join(' AND ')}
    ORDER BY pv.created_at DESC,p.id DESC LIMIT 100`)
    .bind(workspaceId, workspaceId, ...proposalBindings).all<Record<string, unknown>>();
  const proposalVersionIds = (proposals.results ?? []).map(row => String(row.proposal_version_id));
  const manualDispatchRows = context.actor.persona === 'CLIENT' || proposalVersionIds.length === 0 ? [] : (await env.DB.prepare(`
    SELECT id,proposal_version_id,channel,contact_id,contact_name_snapshot,sent_at,evidence_file_version_id,note
    FROM (SELECT id,proposal_version_id,channel,contact_id,contact_name_snapshot,sent_at,evidence_file_version_id,note,
        ROW_NUMBER() OVER(PARTITION BY proposal_version_id ORDER BY sent_at DESC,id DESC) AS rn
      FROM manual_dispatch_records WHERE workspace_id=? AND proposal_version_id IN (${proposalVersionIds.map(() => '?').join(',')}))
    WHERE rn<=50 ORDER BY sent_at DESC,id DESC`)
    .bind(workspaceId, ...proposalVersionIds).all<Record<string, unknown>>()).results ?? [];
  const manualDispatchesByProposal = new Map<string, Array<Record<string, unknown>>>();
  for (const row of manualDispatchRows) {
    const proposalVersionId = String(row.proposal_version_id);
    const history = manualDispatchesByProposal.get(proposalVersionId) ?? [];
    history.push({ id: row.id, channel: row.channel, contactId: row.contact_id, contactName: row.contact_name_snapshot,
      sentAt: row.sent_at, evidenceFileVersionId: row.evidence_file_version_id ?? null, note: row.note ?? null });
    manualDispatchesByProposal.set(proposalVersionId, history);
  }
  const items = (proposals.results ?? []).map(row => ({
    proposalId: row.proposal_id, proposalVersion: row.proposal_version, clientId: row.client_id, engagementId: row.engagement_id,
    proposalVersionId: row.proposal_version_id, revision: row.revision, mode: row.mode, scope: row.scope,
    feeMinor: String(row.fee_minor), currency: row.currency, advanceBps: row.advance_bps, finalBps: row.final_bps,
    validUntil: row.valid_until, timeline: JSON.parse(String(row.timeline_json)), clientName: row.client_name,
    lifecycleState: row.lifecycle_state, activeProposalVersionId: row.active_proposal_version_id ?? null, approvalStatus: row.approval_status,
    dispatchStatus: row.dispatch_status, documentStatus: row.document_status,
    dispatchId: row.dispatch_id ?? null, dispatchVersion: row.dispatch_version == null ? null : Number(row.dispatch_version),
    dispatchErrorCode: row.dispatch_error_code ?? null, documentJobId: row.document_job_id ?? null,
    documentErrorCode: row.document_error_code ?? null,
    artifactFileId: row.artifact_file_id, artifactSha256: row.artifact_sha256,
    manualDispatches: manualDispatchesByProposal.get(String(row.proposal_version_id)) ?? [],
    ...(context.actor.persona === 'CLIENT' ? {} : {
      teamCvFileIds: JSON.parse(String(row.team_cv_file_ids_json)), methodologyVersion: row.methodology_version,
      firmProfileVersion: row.firm_profile_version, createdAt: row.created_at
    })
  }));
  if (context.actor.persona === 'CLIENT') return { engagements: [], firmProfile: null, staffMembers: [], teamCvs: [], contacts: [], contactRoutes: [], proposals: items };

  const proposalClientIds = [...new Set((proposals.results ?? []).map(row => String(row.client_id)))];
  const contactsPromise = proposalClientIds.length ? env.DB.prepare(`SELECT id,client_id,full_name,phone FROM contacts
      WHERE workspace_id=? AND active=1 AND client_id IN (${proposalClientIds.map(() => '?').join(',')})
      ORDER BY client_id,full_name,id LIMIT 1000`)
    .bind(workspaceId, ...proposalClientIds).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Record<string, unknown>[] });
  const [firm, staff, cvs, routes, contacts] = await Promise.all([
    env.DB.prepare(`SELECT id,version,legal_name,registration_number,address,profile_text,methodology_text,credentials_text,industry_portfolio_text,credential_file_ids_json,portfolio_file_ids_json,logo_file_id,updated_at
      FROM firm_profiles WHERE workspace_id=?`).bind(workspaceId).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,version,display_name,grade,active FROM staff_members WHERE workspace_id=? AND active=1 ORDER BY grade,display_name,id LIMIT 100`)
      .bind(workspaceId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT cv.id,cv.version,cv.staff_member_id,sm.display_name,sm.grade,cv.file_version_id,f.original_name,f.sha256,cv.approved,cv.approved_by_actor_id,cv.approved_at,cv.created_at
      FROM team_cv_documents cv JOIN staff_members sm ON sm.workspace_id=cv.workspace_id AND sm.id=cv.staff_member_id
      JOIN file_versions f ON f.workspace_id=cv.workspace_id AND f.id=cv.file_version_id
      WHERE cv.workspace_id=? ORDER BY sm.display_name,CASE WHEN cv.approved=1 THEN 0 ELSE 1 END,cv.approved_at DESC,cv.created_at DESC,cv.id DESC LIMIT 100`).bind(workspaceId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT cr.id,cr.version,cr.client_id,c.legal_name AS client_name,ct.full_name AS contact_name,ct.email
      FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
      JOIN clients c ON c.workspace_id=cr.workspace_id AND c.id=cr.client_id
      WHERE cr.workspace_id=? AND cr.purpose='PROPOSAL' AND ct.active=1 AND ct.email IS NOT NULL AND c.active=1
        AND (? IS NULL OR cr.client_id=?) ORDER BY c.legal_name,ct.full_name,cr.id LIMIT 100`)
      .bind(workspaceId, clientId, clientId).all<Record<string, unknown>>(),
    contactsPromise
  ]);
  const firmProfile = firm ? {
    id: firm.id, version: firm.version, legalName: firm.legal_name, registrationNumber: firm.registration_number,
    address: firm.address, profileText: firm.profile_text, methodologyText: firm.methodology_text,
    credentialsText: firm.credentials_text, industryPortfolioText: firm.industry_portfolio_text,
    credentialFileVersionIds: JSON.parse(String(firm.credential_file_ids_json)),
    portfolioFileVersionIds: JSON.parse(String(firm.portfolio_file_ids_json)),
    logoFileId: firm.logo_file_id, updatedAt: firm.updated_at
  } : null;
  const staffMembers = (staff.results ?? []).map(row => ({
    id: String(row.id), version: Number(row.version), displayName: String(row.display_name),
    grade: String(row.grade), active: Number(row.active) === 1
  }));
  const currentApprovedCvByStaff = new Map<string, string>();
  for (const cv of cvs.results ?? []) {
    if (cv.approved === 1 && !currentApprovedCvByStaff.has(String(cv.staff_member_id))) {
      currentApprovedCvByStaff.set(String(cv.staff_member_id), String(cv.id));
    }
  }
  const teamCvs = (cvs.results ?? []).map(cv => ({
    id: cv.id, version: cv.version, staffMemberId: cv.staff_member_id, displayName: cv.display_name, grade: cv.grade,
    fileVersionId: cv.file_version_id, originalName: cv.original_name, sha256: cv.sha256, approved: cv.approved === 1,
    isCurrent: currentApprovedCvByStaff.get(String(cv.staff_member_id)) === String(cv.id),
    approvedByActorId: cv.approved_by_actor_id, approvedAt: cv.approved_at
  }));
  return {
    engagements: (engagements.results ?? []).map(row => ({
      id: row.id, version: row.version, clientId: row.client_id, clientName: row.client_name, code: row.code,
      periodStart: row.period_start, periodEnd: row.period_end, lifecycleState: row.lifecycle_state,
      contractFeeMinor: String(row.contract_fee_minor)
    })),
    firmProfile, staffMembers, teamCvs,
    contacts: (contacts.results ?? []).map(contact => ({
      id: String(contact.id), clientId: String(contact.client_id), fullName: String(contact.full_name), phone: contact.phone == null ? null : String(contact.phone)
    })),
    contactRoutes: (routes.results ?? []).map(route => ({
      id: route.id, version: route.version, clientId: route.client_id, clientName: route.client_name,
      contactName: route.contact_name, email: route.email
    })),
    proposals: items
  };
}

export interface BusinessContext {
  actor: {
    id: string;
    persona: BusinessPersona;
    displayName: string;
    staffGrade: BusinessActorProfileSummary['staffGrade'];
    clientId: string | null;
    staffMemberId: string | null;
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
      clientId: isClient ? row.clientId : null,
      staffMemberId: isClient ? null : row.staffMemberId
    },
    scope: { clientId, engagementId: requestedEngagementId },
    allowedActions: row.persona === 'APPROVER' && row.staffGrade === 'PARTNER'
      ? ['directory.manage', 'client.read', 'client.manage', 'lead.read', 'lead.manage', 'lead.convert', 'engagement.read', 'engagement.advance', 'standards.read', 'standards.manage', 'file.read', 'file.upload', 'proposal.read', 'proposal.create', 'proposal.generate', 'proposal.approve', 'proposal.dispatch', 'firm.manage', 'risk.read', 'riskAssessment.draft', 'riskAssessment.submit', 'riskAssessment.resolveEscalation', 'risk.clear', 'commercialAcceptance.read', 'engagementLetter.manage', 'invoice.issue', 'payment.record', 'payment.reverse', 'billing.read', 'pbc.read', 'pbc.manage', 'pbc.review', 'planning.read', 'staffing.manage', 'tb.manage', 'fieldwork.read', 'fieldwork.manage', 'fieldwork.review', 'sampling.manage', 'evidence.review', 'practice.read', 'practice.manage', 'practice.approve', 'ledger.read', 'ledger.manage', 'ledger.post', 'reporting.read', 'reporting.prepare', 'reporting.approve', 'reporting.release']
      : row.persona === 'PREPARER' ? ['client.read', 'client.manage', 'lead.read', 'lead.manage', 'lead.convert', 'engagement.read', 'engagement.advance', 'standards.read', 'file.read', 'file.upload', 'proposal.read', 'proposal.create', 'proposal.generate', 'risk.read', 'riskAssessment.draft', 'riskAssessment.submit', 'commercialAcceptance.read', 'billing.read', 'pbc.read', 'pbc.manage', 'planning.read', 'tb.manage', 'fieldwork.read', 'fieldwork.manage', 'practice.read', 'practice.time', 'reporting.read']
        : row.persona === 'REVIEWER' ? ['client.read', 'lead.read', 'engagement.read', 'standards.read', 'file.read', 'file.upload', 'proposal.read', 'proposal.create', 'proposal.generate', 'risk.read', 'riskAssessment.draft', 'riskAssessment.submit', 'riskAssessment.escalate', 'commercialAcceptance.read', 'invoice.issue', 'payment.record', 'payment.reverse', 'billing.read', 'pbc.read', 'pbc.manage', 'pbc.review', 'planning.read', 'staffing.manage', 'tb.manage', 'fieldwork.read', 'fieldwork.manage', 'fieldwork.review', 'sampling.manage', 'evidence.review', 'practice.read', 'practice.approve', 'ledger.read', 'ledger.post', 'reporting.read', 'reporting.prepare', 'reporting.approve']
          : ['client.read', 'engagement.read', 'file.read', 'file.upload', 'proposal.read', 'commercialAcceptance.read', 'commercialAcceptance.record', 'commercialAcceptance.revoke', 'billing.read', 'pbc.read', 'pbc.submit', 'reporting.read'],
    readOnlyReasons: isClient ? ['CLIENT_PROJECTION_ONLY'] : []
  };
}

interface BusinessChangeEventRow {
  sequence: number;
  command_id: string | null;
  command_type: string;
  entity_type: string | null;
  entity_id: string | null;
  client_id: string | null;
  engagement_id: string | null;
  scope_metadata: string | null;
  scope_client_metadata: string | null;
  scope_engagement_metadata: string | null;
  before_version: number | null;
  after_version: number | null;
  actor_persona: BusinessPersona | null;
  source: string;
  created_at: number;
}

function firstStringField(records: Array<Record<string, unknown> | undefined>, field: string): string | null {
  for (const record of records) {
    const value = record?.[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/** Records the server-validated scope next to a command so cursors can be filtered without reading private event details. */
async function businessCommandScope(
  env: Env,
  workspaceId: string,
  context: BusinessContext,
  command: { type?: string; payload?: Record<string, unknown> },
  mutation: BusinessMutation
): Promise<{ clientId: string | null; engagementId: string | null; known: boolean }> {
  // Workspace configuration changes stay workspace-scoped even when the UI
  // carries an active client or engagement selection in its request context.
  if (['STAFF_MEMBER', 'ACTOR_PROFILE', 'FIRM_PROFILE', 'STANDARDS_PROFILE', 'WORKPROGRAM_TEMPLATE', 'SAMPLING_POLICY'].includes(mutation.entityType)) {
    return { clientId: null, engagementId: null, known: true };
  }

  // Client creation is a workspace directory operation. Its newly assigned
  // client ID is the event scope; a prior client/engagement selection in the
  // browser must not prevent creating another client or misattribute the event.
  if (command.type === 'client.create') {
    const clientId = firstStringField([mutation.result, command.payload], 'clientId');
    return { clientId, engagementId: null, known: Boolean(clientId) };
  }

  if (mutation.entityType === 'PUBLIC_LEAD_SUBMISSION') {
    const clientId = firstStringField([mutation.result, command.payload], 'clientId');
    if (context.scope.engagementId) throw new ApiError('FORBIDDEN_SCOPE', 'Clear the engagement scope before triaging a web inquiry.');
    if (context.scope.clientId && clientId && context.scope.clientId !== clientId) {
      throw new ApiError('FORBIDDEN_SCOPE', 'The inquiry is outside the selected client scope.');
    }
    return { clientId, engagementId: null, known: true };
  }

  const candidates = [mutation.result, mutation.auditDetails, command.payload];
  const explicitEngagementId = firstStringField(candidates, 'engagementId');
  const explicitClientId = firstStringField(candidates, 'clientId');
  if (context.scope.engagementId && explicitEngagementId && context.scope.engagementId !== explicitEngagementId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The command is outside the selected engagement scope.');
  }
  if (context.scope.clientId && explicitClientId && context.scope.clientId !== explicitClientId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The command is outside the selected client scope.');
  }
  let engagementId = context.scope.engagementId ?? explicitEngagementId;
  let clientId = context.scope.clientId ?? context.actor.clientId ?? explicitClientId;
  let known = Boolean(engagementId || clientId);

  if (engagementId) {
    const engagement = await env.DB.prepare(`SELECT client_id FROM engagements WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, engagementId).first<{ client_id: string }>();
    if (engagement) {
      if (clientId && clientId !== engagement.client_id) throw new ApiError('FORBIDDEN_SCOPE', 'The command engagement is outside the selected client scope.');
      clientId = engagement.client_id;
    } else if (!clientId) {
      // Some commands create an engagement and its first audit event in the same batch.
      // The mutation result is authoritative for that not-yet-committed identifier.
      clientId = firstStringField(candidates, 'clientId');
      if (!clientId && command.type === 'lead.convert' && typeof command.payload?.leadId === 'string') {
        const lead = await env.DB.prepare(`SELECT client_id FROM leads WHERE workspace_id=? AND id=?`)
          .bind(workspaceId, command.payload.leadId).first<{ client_id: string | null }>();
        clientId = lead?.client_id ?? null;
      }
    }
  }

  if (!known) {
    // Resolve common ID-only edits from their normalized owner row. Unknown entity
    // types remain explicitly unscoped so filtered readers request a full resync.
    const ownerScopeQueryByEntity: Record<string, string> = {
      CONTACT: `SELECT client_id,NULL AS engagement_id FROM contacts WHERE workspace_id=? AND id=?`,
      CONTACT_ROUTE: `SELECT client_id,NULL AS engagement_id FROM contact_routes WHERE workspace_id=? AND id=?`,
      LEAD: `SELECT client_id,converted_engagement_id AS engagement_id FROM leads WHERE workspace_id=? AND id=?`,
      ENGAGEMENT: `SELECT client_id,id AS engagement_id FROM engagements WHERE workspace_id=? AND id=?`,
      PROCEDURE: `SELECT w.client_id,w.engagement_id FROM procedures p JOIN workprograms w ON w.workspace_id=p.workspace_id AND w.id=p.workprogram_id WHERE p.workspace_id=? AND p.id=?`,
      WORKPROGRAM: `SELECT client_id,engagement_id FROM workprograms WHERE workspace_id=? AND id=?`,
      SAMPLE_POPULATION: `SELECT client_id,engagement_id FROM sample_populations WHERE workspace_id=? AND id=?`,
      SAMPLE_TEST: `SELECT pop.client_id,pop.engagement_id FROM sample_tests t JOIN sampling_plans sp ON sp.workspace_id=t.workspace_id AND sp.id=t.plan_id JOIN sample_populations pop ON pop.workspace_id=sp.workspace_id AND pop.id=sp.population_id WHERE t.workspace_id=? AND t.id=?`,
      SAMPLING_PLAN: `SELECT pop.client_id,pop.engagement_id FROM sampling_plans sp JOIN sample_populations pop ON pop.workspace_id=sp.workspace_id AND pop.id=sp.population_id WHERE sp.workspace_id=? AND sp.id=?`,
      AUDIT_ADJUSTMENT: `SELECT client_id,engagement_id FROM audit_adjustments WHERE workspace_id=? AND id=?`,
      ANALYTICAL_REVIEW: `SELECT client_id,engagement_id FROM analytical_reviews WHERE workspace_id=? AND id=?`,
      FILE_VERSION: `SELECT client_id,engagement_id FROM file_versions WHERE workspace_id=? AND id=?`,
      PBC_REQUEST: `SELECT client_id,engagement_id FROM pbc_requests WHERE workspace_id=? AND id=?`
    };
    const ownerScopeQuery = ownerScopeQueryByEntity[mutation.entityType];
    if (ownerScopeQuery) {
      const owner = await env.DB.prepare(ownerScopeQuery)
        .bind(workspaceId, mutation.entityId).first<{ client_id: string | null; engagement_id: string | null }>();
      if (owner) {
        clientId = owner.client_id;
        engagementId = owner.engagement_id;
        known = true;
      }
    }
  }

  if (context.actor.persona === 'CLIENT' && context.actor.clientId !== clientId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'A CLIENT command cannot be recorded outside its linked client.');
  }
  if (context.scope.clientId && clientId && context.scope.clientId !== clientId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The command is outside the selected client scope.');
  }
  if (context.scope.engagementId && engagementId && context.scope.engagementId !== engagementId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The command is outside the selected engagement scope.');
  }
  return { clientId, engagementId, known };
}

/**
 * Reads the immutable workspace audit sequence as a bounded, scope-filtered feed.
 * Old events without trustworthy scope metadata trigger an explicit resync instead
 * of being silently dropped or exposed to a different client.
 */
export async function getBusinessChanges(
  env: Env,
  workspaceId: string,
  request: Request,
  url: URL
): Promise<{ events: Array<Record<string, unknown>>; nextCursor: string; hasMore: boolean; resyncRequired?: true }> {
  await requireBusinessWorkspace(env, workspaceId);
  const context = await resolveBusinessContext(env, workspaceId, request);
  const rawAfter = url.searchParams.get('after') ?? '0';
  const rawLimit = url.searchParams.get('limit') ?? '100';
  if (!/^\d+$/.test(rawAfter) || !/^\d+$/.test(rawLimit)) {
    throw new ApiError('BAD_REQUEST', 'The change cursor and page limit must be non-negative integers.');
  }
  const after = Number(rawAfter);
  const requestedLimit = Number(rawLimit);
  if (!Number.isSafeInteger(after) || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    throw new ApiError('BAD_REQUEST', 'The change cursor or page limit is outside the supported range.');
  }
  const limit = Math.min(100, requestedLimit);

  const queryEngagementId = url.searchParams.get('engagementId');
  if (queryEngagementId !== null && !queryEngagementId.trim()) {
    throw new ApiError('BAD_REQUEST', 'The engagement filter cannot be empty.');
  }
  if (context.scope.engagementId && queryEngagementId && context.scope.engagementId !== queryEngagementId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The requested engagement does not match the selected engagement.');
  }
  const engagementId = context.scope.engagementId ?? queryEngagementId;
  let clientId = context.scope.clientId ?? context.actor.clientId;
  if (engagementId) {
    const engagement = await env.DB.prepare(`SELECT client_id FROM engagements WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, engagementId).first<{ client_id: string }>();
    if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement was not found in this workspace.');
    if (clientId && clientId !== engagement.client_id) throw new ApiError('FORBIDDEN_SCOPE', 'The engagement is outside the selected client.');
    clientId = engagement.client_id;
  }
  if (context.actor.persona === 'CLIENT' && (!clientId || clientId !== context.actor.clientId)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The change feed is outside the linked client scope.');
  }

  const head = await env.DB.prepare(`SELECT last_sequence FROM audit_chain_heads
    WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`).bind(workspaceId, workspaceId)
    .first<{ last_sequence: number }>();
  if (!head) throw new ApiError('UNAVAILABLE', 'Workspace audit lineage is not initialized.');
  const snapshot = Number(head.last_sequence);
  if (after > snapshot) throw new ApiError('BAD_REQUEST', 'The change cursor is ahead of the current workspace sequence. Resynchronize the workspace.');
  if (after === snapshot) return { events: [], nextCursor: String(snapshot), hasMore: false };

  const result = await env.DB.prepare(`SELECT sequence,command_id,command_type,entity_type,entity_id,client_id,engagement_id,
      json_type(details_json,'$.scope') AS scope_metadata,
      json_type(details_json,'$.scope.clientId') AS scope_client_metadata,
      json_type(details_json,'$.scope.engagementId') AS scope_engagement_metadata,
      COALESCE(client_id,json_extract(details_json,'$.scope.clientId'),json_extract(details_json,'$.details.clientId'),json_extract(details_json,'$.result.clientId')) AS effective_client_id,
      COALESCE(engagement_id,json_extract(details_json,'$.scope.engagementId'),json_extract(details_json,'$.details.engagementId'),json_extract(details_json,'$.result.engagementId')) AS effective_engagement_id,
      before_version,after_version,actor_persona,source,created_at
    FROM audit_events WHERE workspace_id=? AND chain_scope_kind='WORKSPACE' AND sequence>? AND sequence<=?
    ORDER BY sequence LIMIT ?`).bind(workspaceId, after, snapshot, limit + 1).all<BusinessChangeEventRow & {
      effective_client_id: string | null;
      effective_engagement_id: string | null;
    }>();
  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const hasGap = page.some((row, index) => Number(row.sequence) !== after + index + 1);
  const hasUnknownScope = Boolean(clientId || engagementId) && page.some(row => {
    const explicitlyWorkspaceScoped = row.scope_metadata === 'object'
      && row.scope_client_metadata === 'null' && row.scope_engagement_metadata === 'null';
    return !row.effective_client_id && !row.effective_engagement_id && !explicitlyWorkspaceScoped;
  });
  if (hasGap || (page.length === 0 && after < snapshot) || hasUnknownScope) {
    return { events: [], nextCursor: String(snapshot), hasMore: false, resyncRequired: true };
  }

  const scopedRows = page.filter(row => {
    if (engagementId) {
      return row.effective_engagement_id === engagementId ||
        (!row.effective_engagement_id && Boolean(clientId) && row.effective_client_id === clientId);
    }
    if (clientId) return row.effective_client_id === clientId;
    return true;
  });
  const events = context.actor.persona === 'CLIENT'
    ? scopedRows.map(row => ({ sequence: Number(row.sequence), changedAt: new Date(Number(row.created_at) * 1000).toISOString() }))
    : scopedRows.map(row => ({
      sequence: Number(row.sequence), commandId: row.command_id, commandType: row.command_type,
      entityType: row.entity_type, entityId: row.entity_id, clientId: row.effective_client_id, engagementId: row.effective_engagement_id,
      beforeVersion: row.before_version, afterVersion: row.after_version,
      actorPersona: row.actor_persona, source: row.source,
      changedAt: new Date(Number(row.created_at) * 1000).toISOString()
    }));
  const nextCursor = hasMore ? String(page[page.length - 1].sequence) : String(snapshot);
  return { events, nextCursor, hasMore };
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
    rationale: z.string().trim().min(10).max(1000).nullable().optional(),
    expectedVersion: z.number().int().positive().nullable()
  }).refine(payload => payload.isPrimary || Boolean(payload.rationale), {
    message: 'An alternate recipient requires a documented rationale.'
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
const publicLeadTriageCommand = z.strictObject({
  type: z.literal('publicLead.triage'),
  payload: z.strictObject({
    submissionId: clientIdSchema,
    decision: z.enum(['ACCEPT', 'SPAM', 'DUPLICATE']),
    expectedVersion: z.number().int().positive(),
    existingLeadId: clientIdSchema.optional(),
    requestedService: serviceTypeSchema.optional(),
    periodStart: dateSchema.optional(),
    periodEnd: dateSchema.optional(),
    estimatedFeeMinor: moneyMinorSchema.optional()
  }).refine(payload => payload.decision !== 'ACCEPT'
    || Boolean(payload.requestedService && payload.periodStart && payload.periodEnd), {
    message: 'Accepting a web inquiry requires a service and audited period.'
  }).refine(payload => !payload.periodStart || !payload.periodEnd || payload.periodStart <= payload.periodEnd, {
    message: 'The audited period end must not precede its start.'
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
  }).superRefine((payload, refinement) => {
    const presentationBlocker = presentationEditionBlocker({ reportingFramework: payload.reportingFramework,
      presentationEdition: payload.presentationEdition, earlyAdoption: payload.earlyAdoption, periodStart: payload.effectivePeriodStart });
    if (presentationBlocker) refinement.addIssue({ code: 'custom', path: ['presentationEdition'], message: presentationBlocker });
  })
});

const businessFilePurposeSchema = z.enum(['PBC', 'TB', 'EVIDENCE', 'TEMPLATE', 'SIGNATURE', 'SEAL', 'GENERATED', 'RELEASE', 'ARCHIVE']);
const businessFileMediaTypeSchema = z.enum([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'application/zip'
]);
const businessFileReserveCommand = z.strictObject({
  type: z.literal('file.reserve'),
  payload: z.strictObject({
    clientId: clientIdSchema.optional(),
    engagementId: clientIdSchema.optional(),
    folderId: clientIdSchema.optional(),
    pbcRequestId: clientIdSchema.optional(),
    expectedPbcRequestVersion: z.number().int().positive().optional(),
    representationRequestId: clientIdSchema.optional(),
    paymentEvidenceReservationId: clientIdSchema.optional(),
    purpose: businessFilePurposeSchema,
    originalName: z.string().trim().min(1).max(200),
    mediaType: businessFileMediaTypeSchema,
    sizeBytes: z.number().int().positive().max(25 * 1024 * 1024)
  }).refine(payload => !payload.engagementId || Boolean(payload.clientId), {
    message: 'An engagement-scoped file must also identify its client.'
  }).refine(payload => payload.purpose !== 'PBC' || Boolean(payload.pbcRequestId && payload.expectedPbcRequestVersion), {
    message: 'A PBC upload reservation must name its current request and request version.'
  }).refine(payload => payload.purpose === 'PBC' || (!payload.pbcRequestId && !payload.expectedPbcRequestVersion), {
    message: 'Only PBC file reservations may include a PBC request binding.'
  }).refine(payload => !payload.representationRequestId || payload.purpose === 'EVIDENCE', {
    message: 'Only evidence file reservations may include a representation request binding.'
  }).refine(payload => !payload.paymentEvidenceReservationId || payload.purpose === 'EVIDENCE', {
    message: 'Only evidence file reservations may include a payment evidence binding.'
  })
});
const businessFileStageCommand = z.strictObject({
  type: z.literal('file.stage'),
  payload: z.strictObject({
    fileId: clientIdSchema,
    expectedVersion: z.number().int().positive(),
    sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  })
});
const businessFileCommitCommand = z.strictObject({
  type: z.literal('file.commit'),
  payload: z.strictObject({
    fileId: clientIdSchema,
    expectedVersion: z.number().int().positive(),
    sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  })
});
const businessFileRejectCommand = z.strictObject({
  type: z.literal('file.reject'),
  payload: z.strictObject({ fileId: clientIdSchema, expectedVersion: z.number().int().positive(), reason: z.string().trim().min(10).max(1000) })
});
const pbcCategorySchema = z.enum(['GENERAL','TRIAL_BALANCE','BANK_STATEMENT','CONTRACTS','INVOICES','PAYROLL','LEGAL','OTHER']);
const pbcRequestCreateCommand = z.strictObject({
  type: z.literal('pbc.request.create'),
  payload: z.strictObject({
    clientId: clientIdSchema, engagementId: clientIdSchema, title: z.string().trim().min(1).max(240),
    description: z.string().trim().min(1).max(5000), dueDate: dateSchema, assignedContactId: clientIdSchema,
    category: pbcCategorySchema, requiredForPlanning: z.boolean(), requiredForRelease: z.boolean()
  })
});
const pbcSubmitCommand = z.strictObject({
  type: z.literal('pbc.submit'),
  payload: z.strictObject({
    requestId: clientIdSchema, expectedRequestVersion: z.number().int().positive(), fileVersionId: clientIdSchema,
    clientComment: z.string().trim().max(2000).optional()
  })
});
const pbcReviewCommand = z.strictObject({
  type: z.literal('pbc.review'),
  payload: z.strictObject({
    requestId: clientIdSchema, expectedRequestVersion: z.number().int().positive(), submissionId: clientIdSchema,
    decision: z.enum(['APPROVE','REJECT']), comments: z.string().trim().max(10000).optional()
  }).superRefine((payload, ctx) => {
    if (payload.decision === 'REJECT' && (!payload.comments || payload.comments.length < 10)) {
      ctx.addIssue({ code: 'custom', path: ['comments'], message: 'A rejection needs a meaningful reason of at least 10 characters.' });
    }
  })
});
const timelineMilestoneSchema = z.strictObject({ name: z.string().trim().min(1).max(160), date: dateSchema });
const proposalTermsSchema = z.strictObject({
  engagementId: clientIdSchema,
  mode: z.enum(['QUOTE', 'FULL_PROPOSAL']),
  scope: z.string().trim().min(10).max(10000),
  feeMinor: moneyMinorSchema,
  validUntil: dateSchema,
  timeline: z.array(timelineMilestoneSchema).min(1).max(24),
  selectedTeamCvIds: z.array(clientIdSchema).max(20).default([]).refine(ids => new Set(ids).size === ids.length, {
    message: 'Each proposed team member must be selected only once.'
  })
});
const firmProfileSaveCommand = z.strictObject({
  type: z.literal('firm-profile.save'),
  payload: z.strictObject({
    expectedVersion: z.number().int().positive().nullable(),
    legalName: z.string().trim().min(1).max(250),
    registrationNumber: z.string().trim().min(1).max(200),
    address: z.string().trim().min(1).max(1000),
    profileText: z.string().trim().min(10).max(10000),
    methodologyText: z.string().trim().min(10).max(20000),
    credentialsText: z.string().trim().max(10000).optional().default(''),
    industryPortfolioText: z.string().trim().max(10000).optional().default(''),
    credentialFileVersionIds: z.array(clientIdSchema).max(20).default([]).refine(ids => new Set(ids).size === ids.length, {
      message: 'Each credential evidence file may be selected only once.'
    }),
    portfolioFileVersionIds: z.array(clientIdSchema).max(20).default([]).refine(ids => new Set(ids).size === ids.length, {
      message: 'Each industry portfolio file may be selected only once.'
    }),
    logoFileId: clientIdSchema.nullable().optional()
  }).refine(value => value.profileText.length + value.methodologyText.length <= 25000, {
    message: 'Firm profile and methodology together must fit within 25,000 characters.'
  })
});
const teamCvAttachCommand = z.strictObject({
  type: z.literal('team-cv.attach'),
  payload: z.strictObject({ staffMemberId: staffIdSchema, fileVersionId: clientIdSchema })
});
const teamCvApproveCommand = z.strictObject({
  type: z.literal('team-cv.approve'),
  payload: z.strictObject({ teamCvId: clientIdSchema, expectedVersion: z.number().int().positive(), rationale: z.string().trim().min(10).max(10000) })
});
const proposalCreateCommand = z.strictObject({ type: z.literal('proposal.create'), payload: proposalTermsSchema.extend({ expectedEngagementVersion: z.number().int().positive() }) });
const proposalReviseCommand = z.strictObject({
  type: z.literal('proposal.revise'),
  payload: proposalTermsSchema.extend({ proposalId: clientIdSchema, expectedVersion: z.number().int().positive() })
});
const proposalGenerateCommand = z.strictObject({
  type: z.literal('proposal.generate'),
  payload: z.strictObject({ proposalVersionId: clientIdSchema, expectedVersion: z.number().int().positive() })
});
const proposalGenerateRetryCommand = z.strictObject({
  type: z.literal('proposal.generate.retry'),
  payload: z.strictObject({ proposalVersionId: clientIdSchema, expectedVersion: z.number().int().positive(), failedJobId: clientIdSchema })
});
const proposalApproveCommand = z.strictObject({
  type: z.literal('proposal.approve'),
  payload: z.strictObject({ proposalVersionId: clientIdSchema, expectedVersion: z.number().int().positive(), note: z.string().trim().min(10).max(10000) })
});
const proposalDispatchCommand = z.strictObject({
  type: z.literal('proposal.dispatch'),
  payload: z.strictObject({ proposalVersionId: clientIdSchema, expectedVersion: z.number().int().positive(), contactRouteId: clientIdSchema })
});
const proposalManualDispatchCommand = z.strictObject({
  type: z.literal('proposal.dispatch.recordManual'),
  payload: z.strictObject({
    engagementId: clientIdSchema,
    proposalVersionId: clientIdSchema,
    channel: z.enum(['WHATSAPP', 'HAND_DELIVERY']),
    contactId: clientIdSchema,
    sentAt: z.string().datetime({ offset: true }),
    evidenceFileVersionId: clientIdSchema.optional(),
    note: z.string().trim().max(2000).optional()
  })
});
const proposalDispatchRetryCommand = z.strictObject({
  type: z.literal('proposal.dispatch.retry'),
  payload: z.strictObject({ dispatchId: clientIdSchema, expectedVersion: z.number().int().positive() })
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
  publicLeadTriageCommand,
  engagementAdvanceCommand,
  standardsProfileCreateCommand,
  businessFileReserveCommand,
  businessFileStageCommand,
  businessFileCommitCommand,
  businessFileRejectCommand,
  pbcRequestCreateCommand,
  pbcSubmitCommand,
  pbcReviewCommand,
  firmProfileSaveCommand,
  teamCvAttachCommand,
  teamCvApproveCommand,
  proposalCreateCommand,
  proposalReviseCommand,
  proposalGenerateCommand,
  proposalGenerateRetryCommand,
  proposalApproveCommand,
  proposalDispatchCommand,
  proposalManualDispatchCommand,
  proposalDispatchRetryCommand,
  ...businessRiskCommands,
  ...businessDeliveryCommands,
  ...businessPlanningCommands,
  ...businessTbCommands,
  ...businessFieldworkCommands,
  ...businessPracticeCommands,
  ...businessReportingCommands
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
type BusinessFileCommand = Extract<BusinessCommand, { type: 'file.reserve' | 'file.stage' | 'file.commit' | 'file.reject' }>;
type BusinessPbcCommand = Extract<BusinessCommand, { type: 'pbc.request.create' | 'pbc.submit' | 'pbc.review' }>;
type BusinessProposalCommand = Extract<BusinessCommand, { type: 'firm-profile.save' | 'team-cv.attach' | 'team-cv.approve' | 'proposal.create' | 'proposal.revise' | 'proposal.generate' | 'proposal.generate.retry' | 'proposal.approve' | 'proposal.dispatch' | 'proposal.dispatch.recordManual' | 'proposal.dispatch.retry' }>;
type BusinessPlanningCommandType = import('./businessPlanning').BusinessPlanningCommand;
type BusinessTbCommandType = import('./businessTb').BusinessTbCommand;
type BusinessFieldworkCommandType = import('./businessFieldwork').BusinessFieldworkCommand;
type BusinessPracticeCommandType = import('./businessPractice').BusinessPracticeCommand;
type BusinessReportingCommandType = import('./businessReporting').BusinessReportingCommand;
type BusinessCommercialCommand = Exclude<BusinessCommand, BusinessDirectoryCommand | BusinessFileCommand | BusinessPbcCommand | BusinessProposalCommand | BusinessPlanningCommandType | BusinessTbCommandType | BusinessFieldworkCommandType | BusinessPracticeCommandType | BusinessReportingCommandType | import('./businessRisk').BusinessRiskCommand | import('./businessDelivery').BusinessDeliveryCommand>;

function isBusinessDirectoryCommand(command: BusinessCommand): command is BusinessDirectoryCommand {
  return command.type === 'staff.create' || command.type === 'staff.update'
    || command.type === 'actor-profile.assign' || command.type === 'actor-profile.deactivate';
}

function isBusinessFileCommand(command: BusinessCommand): command is BusinessFileCommand {
  return command.type === 'file.reserve' || command.type === 'file.stage'
    || command.type === 'file.commit' || command.type === 'file.reject';
}

function isBusinessPbcCommand(command: BusinessCommand): command is BusinessPbcCommand {
  return command.type === 'pbc.request.create' || command.type === 'pbc.submit' || command.type === 'pbc.review';
}

function isBusinessProposalCommand(command: BusinessCommand): command is BusinessProposalCommand {
  return command.type.startsWith('proposal.') || command.type === 'firm-profile.save'
    || command.type === 'team-cv.attach' || command.type === 'team-cv.approve';
}

export function parseBusinessCommandEnvelope(value: unknown, idempotencyKey: string | null): BusinessCommandEnvelope {
  if (!idempotencyKey || idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 200) {
    throw new ApiError('BAD_REQUEST', 'A valid Idempotency-Key header is required for every BUSINESS command.');
  }
  if (value && typeof value === 'object' && 'command' in value) {
    const candidate = (value as { command?: { type?: unknown; payload?: Record<string, unknown> } }).command;
    if (candidate?.type === 'pbc.review' && candidate.payload?.decision === 'REJECT'
      && (typeof candidate.payload.comments !== 'string' || candidate.payload.comments.trim().length < 10)) {
      throw new ApiError('VALIDATION_FAILED', 'A rejection needs a meaningful reason of at least 10 characters.');
    }
  }
  const parsed = businessCommandEnvelopeSchema.safeParse(value);
  if (!parsed.success) {
    const commandType = value && typeof value === 'object' && 'command' in value
      ? (value as { command?: { type?: unknown } }).command?.type : undefined;
    if (commandType === 'opinion.select') {
      throw new ApiError('VALIDATION_FAILED', 'The opinion selection is incomplete or inconsistent with its selected category.', {
        issues: parsed.error.issues.map(issue => ({ path: issue.path.map(String), message: issue.message }))
      });
    }
    if (parsed.error.issues.some(issue => issue.code === 'unrecognized_keys')) throw invalidInput(parsed.error.issues);
    throw new ApiError('VALIDATION_FAILED', 'Business command details are invalid.', {
      issues: parsed.error.issues.map(issue => ({ path: issue.path.map(String), message: issue.message }))
    });
  }
  const command = parsed.data.command;
  const versionTarget = command.type === 'staff.update' ? { entity: 'StaffMember', id: command.payload.staffMemberId, version: command.payload.expectedVersion }
    : command.type === 'actor-profile.deactivate' ? { entity: 'ActorProfile', id: command.payload.actorProfileId, version: command.payload.expectedVersion }
      : command.type === 'client.update' || command.type === 'client.deactivate' ? { entity: 'Client', id: command.payload.clientId, version: command.payload.expectedVersion }
        : command.type === 'contact.update' ? { entity: 'Contact', id: command.payload.contactId, version: command.payload.expectedVersion }
          : command.type === 'lead.update' || command.type === 'lead.lose' || command.type === 'lead.convert'
            ? { entity: 'Lead', id: command.payload.leadId, version: command.payload.expectedVersion }
            : command.type === 'publicLead.triage'
              ? { entity: 'PublicLeadSubmission', id: command.payload.submissionId, version: command.payload.expectedVersion }
            : command.type === 'engagement.advance' ? { entity: 'Engagement', id: command.payload.engagementId, version: command.payload.expectedVersion }
        : command.type === 'file.stage' || command.type === 'file.commit' || command.type === 'file.reject'
                ? { entity: 'FileVersion', id: command.payload.fileId, version: command.payload.expectedVersion }
                 : command.type === 'pbc.submit' || command.type === 'pbc.review'
                   ? { entity: 'PbcRequest', id: command.payload.requestId, version: command.payload.expectedRequestVersion }
                   : command.type === 'team-cv.approve' ? { entity: 'TeamCv', id: command.payload.teamCvId, version: command.payload.expectedVersion }
                  : command.type === 'proposal.create' ? { entity: 'Engagement', id: command.payload.engagementId, version: command.payload.expectedEngagementVersion }
                    : command.type === 'proposal.revise' ? { entity: 'Proposal', id: command.payload.proposalId, version: command.payload.expectedVersion }
                      : command.type === 'proposal.generate' || command.type === 'proposal.generate.retry' || command.type === 'proposal.approve' || command.type === 'proposal.dispatch'
                        ? { entity: 'ProposalVersion', id: command.payload.proposalVersionId, version: command.payload.expectedVersion }
        : command.type === 'proposal.dispatch.retry'
                          ? { entity: 'Dispatch', id: command.payload.dispatchId, version: command.payload.expectedVersion }
                        : command.type === 'analytical-review.submit' ? { entity: 'AnalyticalReview', id: command.payload.analyticalReviewId, version: command.payload.expectedVersion }
                          : command.type === 'workprogram.template.approve' ? { entity: 'WorkprogramTemplate', id: command.payload.templateId, version: command.payload.expectedVersion }
                            : command.type === 'procedure.update' || command.type === 'procedure.mark-not-applicable' || command.type === 'procedure.submit' || command.type === 'procedure.review'
                              ? { entity: 'Procedure', id: command.payload.procedureId, version: command.payload.expectedVersion }
                              : command.type === 'sampling.policy.approve' ? { entity: 'SamplingPolicy', id: command.payload.policyId, version: command.payload.expectedVersion }
                                : command.type === 'sampling.record-test' && command.payload.expectedVersion > 0
                                  ? { entity: 'SampleTest', id: command.payload.populationRowId, version: command.payload.expectedVersion }
                         : command.type === 'time.submit' || command.type === 'time.approve' || command.type === 'time.return' || command.type === 'time.correct'
                           ? { entity: 'TimeEntry', id: command.payload.timeEntryId, version: command.payload.expectedVersion }
                           : command.type === 'ledger.post' ? { entity: 'FirmJournal', id: command.payload.journalId, version: command.payload.expectedVersion }
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

export function businessEnvelopeFromRequest(
  request: Request,
  command: unknown,
  expectedVersions: Array<{ entity: string; id: string; version: number }> = []
): BusinessCommandEnvelope {
  const actorId = request.headers.get('X-Actor-Id');
  const persona = request.headers.get('X-Active-Persona');
  const clientId = request.headers.get('X-Client-Id');
  const engagementId = request.headers.get('X-Engagement-Id');
  return parseBusinessCommandEnvelope({
    actor: { actorId, persona },
    context: {
      ...(clientId ? { clientId } : {}),
      ...(engagementId ? { engagementId } : {})
    },
    expectedVersions,
    command
  }, request.headers.get('Idempotency-Key'));
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

function businessRequestHash(envelope: BusinessCommandEnvelope): Promise<string> {
  return sha256Hex(JSON.stringify({
    command: envelope.command,
    actor: envelope.actor,
    context: envelope.context,
    expectedVersions: envelope.expectedVersions
  }));
}

export async function findBusinessCommandReplay(
  env: Env,
  workspaceId: string,
  envelope: BusinessCommandEnvelope
): Promise<Record<string, unknown> | null> {
  const prior = await findCommandReceipt(env, workspaceId, envelope.idempotencyKey);
  return prior ? replayCommand(prior, await businessRequestHash(envelope)) : null;
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

export interface BusinessMutation {
  statements: D1PreparedStatement[];
  result: Record<string, unknown>;
  entityType: string;
  entityId: string;
  beforeVersion: number | null;
  afterVersion: number;
  auditDetails?: Record<string, unknown>;
  responseStatus?: number;
}

const BUSINESS_FILE_MAX_BYTES = 25 * 1024 * 1024;
type BusinessFileRow = {
  id: string;
  version: number;
  client_id: string | null;
  engagement_id: string | null;
  pbc_request_id: string | null;
  pbc_request_version: number | null;
  representation_request_id: string | null;
  original_name: string;
  media_type: string;
  size_bytes: number;
  sha256: string | null;
  object_key: string;
  purpose: z.infer<typeof businessFilePurposeSchema>;
  state: 'INITIALIZED' | 'STAGED' | 'VERIFIED' | 'COMMITTED' | 'REJECTED';
  committed_at: string | null;
  immutable: number;
  created_by_actor_id: string | null;
  payment_evidence_reservation_id: string | null;
};

async function businessFileRow(env: Env, workspaceId: string, fileId: string): Promise<BusinessFileRow | null> {
  return env.DB.prepare(`SELECT f.id,f.version,f.client_id,f.engagement_id,f.pbc_request_id,f.pbc_request_version,
      (SELECT rfr.request_id FROM representation_file_reservations rfr WHERE rfr.workspace_id=f.workspace_id AND rfr.file_version_id=f.id) AS representation_request_id,
      f.original_name,f.media_type,f.size_bytes,f.sha256,f.object_key,f.purpose,f.state,f.committed_at,f.immutable,f.created_by_actor_id,
      f.payment_evidence_reservation_id
    FROM file_versions f WHERE f.workspace_id=? AND f.id=?`).bind(workspaceId, fileId).first<BusinessFileRow>();
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

function includesAscii(bytes: Uint8Array, needle: string): boolean {
  const target = new TextEncoder().encode(needle);
  if (target.length > bytes.length) return false;
  outer: for (let start = 0; start <= bytes.length - target.length; start++) {
    for (let offset = 0; offset < target.length; offset++) {
      if (bytes[start + offset] !== target[offset]) continue outer;
    }
    return true;
  }
  return false;
}

function isZipContainer(bytes: Uint8Array): boolean {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return false;
  const floor = Math.max(0, bytes.length - 65_557);
  for (let index = bytes.length - 22; index >= floor; index--) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) return true;
  }
  return false;
}

export function verifyBusinessFileBytes(mediaType: string, bytes: Uint8Array): void {
  if (bytes.byteLength < 1 || bytes.byteLength > BUSINESS_FILE_MAX_BYTES) {
    throw new ApiError('PAYLOAD_TOO_LARGE', 'The file must contain between 1 byte and 25 MiB.');
  }
  if (mediaType === 'application/pdf') {
    const tail = bytes.subarray(Math.max(0, bytes.length - 2048));
    if (bytes.length < 12 || !includesAscii(bytes.subarray(0, 8), '%PDF-') || !includesAscii(tail, '%%EOF')) {
      throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'The uploaded bytes are not a complete PDF document.');
    }
    return;
  }
  if (mediaType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value) || !includesAscii(bytes, 'IEND')) {
      throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'The uploaded bytes are not a complete PNG image.');
    }
    return;
  }
  if (mediaType === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff
      || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
      throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'The uploaded bytes are not a complete JPEG image.');
    }
    return;
  }
  if (mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mediaType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || mediaType === 'application/zip') {
    if (!isZipContainer(bytes)) throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'The uploaded bytes are not a complete ZIP-based document.');
    if (mediaType !== 'application/zip') {
      const directory = new TextDecoder().decode(bytes);
      const expectedEntry = mediaType.endsWith('wordprocessingml.document') ? 'word/document.xml' : 'xl/workbook.xml';
      if (!directory.includes('[Content_Types].xml') || !directory.includes(expectedEntry)) {
        throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'The ZIP archive does not contain the required Office document parts.');
      }
    }
    return;
  }
  if (mediaType === 'text/plain' || mediaType === 'text/csv') {
    if (bytes.includes(0)) throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'Text files cannot contain binary NUL bytes.');
    try { new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes); }
    catch { throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'The uploaded text is not valid UTF-8.'); }
    return;
  }
  throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'This file type is not supported in Business workspaces.');
}

function assertBusinessFileAction(context: BusinessContext, file: Pick<BusinessFileRow, 'client_id' | 'engagement_id' | 'purpose' | 'representation_request_id'>, action: 'read' | 'upload'): void {
  const required = action === 'read' ? 'file.read' : 'file.upload';
  if (!context.allowedActions.includes(required)) throw new ApiError('PERSONA_ACTION_DENIED', 'This actor profile cannot access files.');
  if (context.actor.persona === 'CLIENT') {
    if (action === 'upload' && !['PBC', 'TB'].includes(file.purpose)
      && !(file.purpose === 'EVIDENCE' && Boolean(file.representation_request_id))) {
      throw new ApiError('PERSONA_ACTION_DENIED', 'CLIENT profiles can upload only to their own PBC, trial-balance or open representation request.');
    }
    if (action === 'read' && !['PBC', 'GENERATED', 'RELEASE'].includes(file.purpose)
      && !(file.purpose === 'EVIDENCE' && Boolean(file.representation_request_id))) {
      throw new ApiError('FORBIDDEN_SCOPE', 'This file is not part of the client-facing projection.');
    }
    if (!context.actor.clientId || file.client_id !== context.actor.clientId || !file.engagement_id) {
      throw new ApiError('FORBIDDEN_SCOPE', 'The file is outside this client profile.');
    }
  } else if (file.client_id && context.scope.clientId && context.scope.clientId !== file.client_id) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The file does not match the selected client context.');
  }
  if (file.engagement_id && context.scope.engagementId && context.scope.engagementId !== file.engagement_id) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The file does not match the selected engagement context.');
  }
  if (action === 'upload' && ['TEMPLATE', 'SIGNATURE', 'SEAL'].includes(file.purpose)
    && (context.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER')) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only a PARTNER APPROVER can upload firm templates or signature assets.');
  }
  if (action === 'upload' && ['GENERATED', 'RELEASE', 'ARCHIVE'].includes(file.purpose)) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Generated, released and archived artifacts are created by the document workflow.');
  }
}

async function assertFileEngagementWritable(env: Env, workspaceId: string, clientId: string, engagementId: string, clientActor: boolean, allowPostArchivePaymentEvidence = false): Promise<void> {
  const engagement = await env.DB.prepare(`SELECT e.lifecycle_state,e.locked_at,e.archive_due_at,e.portal_activated_at,e.portal_frozen_at,
      pf.frozen_at AS portal_freeze_recorded_at,pf.bundle_id AS portal_freeze_bundle_id
    FROM engagements e LEFT JOIN portal_freezes pf ON pf.workspace_id=e.workspace_id AND pf.engagement_id=e.id
    WHERE e.workspace_id=? AND e.client_id=? AND e.id=?`).bind(workspaceId, clientId, engagementId)
    .first<{ lifecycle_state: string; locked_at: string | null; archive_due_at:string|null; portal_activated_at: string | null; portal_frozen_at: string | null;
      portal_freeze_recorded_at: string | null; portal_freeze_bundle_id: string | null }>();
  if (!engagement) throw new ApiError('FORBIDDEN_SCOPE', 'The file engagement does not belong to the selected client.');
  if (clientActor && engagement.portal_frozen_at) {
    throw new ApiError('PORTAL_FROZEN', 'Client uploads are frozen for this released engagement.', {
      engagementId,
      frozenAt: engagement.portal_freeze_recorded_at ?? engagement.portal_frozen_at,
      bundleId: engagement.portal_freeze_bundle_id
    });
  }
  if (!allowPostArchivePaymentEvidence && (engagement.locked_at || engagement.lifecycle_state === 'ARCHIVED_READ_ONLY'
    || (engagement.archive_due_at!==null&&engagement.archive_due_at<=new Date().toISOString()))) {
    throw new ApiError('WORKSPACE_FROZEN', 'This engagement is read-only.');
  }
  if (clientActor && !engagement.portal_activated_at) {
    throw new ApiError('GATE_BLOCKED', 'Client uploads open only after the commercial handover is complete and the advance is settled with its committed receipt.');
  }
}

async function portalFrozenClientMutationError(env: Env, workspaceId: string, context: BusinessContext, command: BusinessCommand): Promise<ApiError | null> {
  if (context.actor.persona !== 'CLIENT'
    || !['file.reserve', 'file.stage', 'file.commit', 'pbc.submit'].includes(command.type)) return null;
  const payload = (command as { payload?: Record<string, unknown> }).payload ?? {};
  let engagement: { client_id: string; engagement_id: string } | null = null;
  if (command.type === 'file.reserve' && typeof payload.clientId === 'string' && typeof payload.engagementId === 'string') {
    engagement = { client_id: payload.clientId, engagement_id: payload.engagementId };
  } else if ((command.type === 'file.stage' || command.type === 'file.commit') && typeof payload.fileId === 'string') {
    engagement = await env.DB.prepare(`SELECT client_id,engagement_id FROM file_versions WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, payload.fileId).first<{ client_id: string; engagement_id: string }>();
  } else if (command.type === 'pbc.submit' && typeof payload.requestId === 'string') {
    engagement = await env.DB.prepare(`SELECT client_id,engagement_id FROM pbc_requests WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, payload.requestId).first<{ client_id: string; engagement_id: string }>();
  }
  if (!engagement) return null;
  const freeze = await env.DB.prepare(`SELECT e.portal_frozen_at,pf.frozen_at AS recorded_frozen_at,pf.bundle_id
    FROM engagements e LEFT JOIN portal_freezes pf ON pf.workspace_id=e.workspace_id AND pf.engagement_id=e.id
    WHERE e.workspace_id=? AND e.client_id=? AND e.id=?`).bind(workspaceId, engagement.client_id, engagement.engagement_id)
    .first<{ portal_frozen_at: string | null; recorded_frozen_at: string | null; bundle_id: string | null }>();
  if (!freeze?.portal_frozen_at) return null;
  return new ApiError('PORTAL_FROZEN', 'Client uploads are frozen for this released engagement.', {
    engagementId: engagement.engagement_id,
    frozenAt: freeze.recorded_frozen_at ?? freeze.portal_frozen_at,
    bundleId: freeze.bundle_id
  });
}

async function assertPaymentEvidenceReservationCurrent(env: Env, workspaceId: string, context: BusinessContext, file: BusinessFileRow): Promise<void> {
  if (!file.payment_evidence_reservation_id) return;
  if (context.actor.persona === 'CLIENT' || file.purpose !== 'EVIDENCE' || !file.client_id || !file.engagement_id
    || file.created_by_actor_id !== context.actor.id) {
    throw new ApiError('FORBIDDEN_SCOPE', 'Post-archive payment evidence must remain bound to its internal uploader and engagement.');
  }
  const reservation = await env.DB.prepare(`SELECT id FROM payment_evidence_reservations
    WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=? AND reserved_by_actor_id=? AND payment_id IS NULL`)
    .bind(workspaceId, file.payment_evidence_reservation_id, file.client_id, file.engagement_id, context.actor.id).first<{ id: string }>();
  if (!reservation) throw new ApiError('VERSION_CONFLICT', 'This payment evidence reservation was already consumed or is outside this engagement.');
}

async function assertPbcFileRequestCurrent(env: Env, workspaceId: string, context: BusinessContext, file: BusinessFileRow): Promise<void> {
  if (file.purpose !== 'PBC' || context.actor.persona !== 'CLIENT') return;
  if (!file.pbc_request_id || !file.pbc_request_version || !file.client_id || !file.engagement_id) {
    throw new ApiError('GATE_BLOCKED', 'A PBC upload must be reserved against a current request in this engagement.');
  }
  const actor = await env.DB.prepare(`SELECT contact_id FROM actor_profiles WHERE workspace_id=? AND id=? AND persona='CLIENT' AND active=1`)
    .bind(workspaceId, context.actor.id).first<{ contact_id: string | null }>();
  const request = await env.DB.prepare(`SELECT version,status,client_id,engagement_id,assigned_contact_id FROM pbc_requests
    WHERE workspace_id=? AND id=?`).bind(workspaceId, file.pbc_request_id)
    .first<{ version: number; status: string; client_id: string; engagement_id: string; assigned_contact_id: string }>();
  if (!request || request.client_id !== file.client_id || request.engagement_id !== file.engagement_id
    || request.assigned_contact_id !== actor?.contact_id) {
    throw new ApiError('FORBIDDEN_SCOPE', 'This PBC request is not assigned to the selected client contact.');
  }
  if (request.version !== file.pbc_request_version || !['PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED'].includes(request.status)) {
    throw new ApiError('VERSION_CONFLICT', 'The PBC request changed after this file was reserved. Refresh the request and upload against its current version.');
  }
}

async function assertRepresentationFileRequestScope(
  env: Env,
  workspaceId: string,
  context: BusinessContext,
  file: Pick<BusinessFileRow, 'client_id' | 'engagement_id' | 'purpose' | 'representation_request_id'> & Partial<Pick<BusinessFileRow, 'created_by_actor_id'>>,
  requireOpen: boolean
): Promise<void> {
  if (context.actor.persona !== 'CLIENT' || file.purpose !== 'EVIDENCE') return;
  const requestId = file.representation_request_id;
  if (!requestId || !file.client_id || !file.engagement_id
    || (file.created_by_actor_id && file.created_by_actor_id !== context.actor.id)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'A client signed representation PDF must be reserved by the assigned contact for one engagement request.');
  }
  const statusPredicate = requireOpen ? "r.status IN ('SENT','REJECTED')" : "r.status IN ('SENT','RECEIVED','REJECTED','ACCEPTED')";
  const activePortalPredicate = requireOpen
    ? "AND e.portal_activated_at IS NOT NULL AND e.portal_frozen_at IS NULL AND e.locked_at IS NULL AND (e.archive_due_at IS NULL OR e.archive_due_at>?)"
    : '';
  const row = await env.DB.prepare(`SELECT r.id FROM representation_requests r
    JOIN contact_routes cr ON cr.workspace_id=r.workspace_id AND cr.id=r.contact_route_id AND cr.client_id=r.client_id AND cr.purpose='FINAL_REPORT'
    JOIN contacts c ON c.workspace_id=cr.workspace_id AND c.client_id=cr.client_id AND c.id=cr.contact_id AND c.active=1
    JOIN actor_profiles ap ON ap.workspace_id=r.workspace_id AND ap.id=? AND ap.persona='CLIENT' AND ap.active=1 AND ap.contact_id=c.id
    JOIN engagements e ON e.workspace_id=r.workspace_id AND e.client_id=r.client_id AND e.id=r.engagement_id
    WHERE r.workspace_id=? AND r.id=? AND r.client_id=? AND r.engagement_id=? AND ${statusPredicate} ${activePortalPredicate}`)
    .bind(context.actor.id, workspaceId, requestId, file.client_id, file.engagement_id, ...(requireOpen ? [new Date().toISOString()] : []))
    .first<{ id: string }>();
  if (!row) throw new ApiError(requireOpen ? 'WORKSPACE_FROZEN' : 'FORBIDDEN_SCOPE',
    requireOpen ? 'The assigned representation request is closed or the client portal is frozen.' : 'This signed representation file is outside the assigned client request.');
  if (requireOpen) await assertFileEngagementWritable(env, workspaceId, file.client_id, file.engagement_id, true);
}

async function assertClientPbcDownloadScope(env: Env, workspaceId: string, context: BusinessContext, file: BusinessFileRow): Promise<void> {
  if (context.actor.persona !== 'CLIENT' || file.purpose !== 'PBC') return;
  if (!file.pbc_request_id || !file.client_id || !file.engagement_id) {
    throw new ApiError('FORBIDDEN_SCOPE', 'This PBC file is not linked to a request assigned to this client contact.');
  }
  const assigned = await env.DB.prepare(`SELECT 1 AS found FROM pbc_requests r JOIN actor_profiles ap
    ON ap.workspace_id=r.workspace_id AND ap.id=? AND ap.persona='CLIENT' AND ap.active=1
    WHERE r.workspace_id=? AND r.id=? AND r.client_id=? AND r.engagement_id=? AND r.assigned_contact_id=ap.contact_id`)
    .bind(context.actor.id, workspaceId, file.pbc_request_id, file.client_id, file.engagement_id)
    .first<{ found: number }>();
  if (!assigned) throw new ApiError('FORBIDDEN_SCOPE', 'This PBC response is outside the requests assigned to this client contact.');
}

export async function getBusinessFileForUpload(
  env: Env,
  workspaceId: string,
  request: Request,
  fileId: string
): Promise<{ context: BusinessContext; file: BusinessFileRow }> {
  const context = await resolveBusinessContext(env, workspaceId, request);
  const file = await businessFileRow(env, workspaceId, fileId);
  if (!file) throw new ApiError('NOT_FOUND', 'File reservation not found.');
  assertBusinessFileAction(context, file, 'upload');
  if (file.client_id && file.engagement_id) {
    await assertFileEngagementWritable(env, workspaceId, file.client_id, file.engagement_id, context.actor.persona === 'CLIENT', Boolean(file.payment_evidence_reservation_id));
  }
  await assertPbcFileRequestCurrent(env, workspaceId, context, file);
  await assertRepresentationFileRequestScope(env, workspaceId, context, file, true);
  await assertPaymentEvidenceReservationCurrent(env, workspaceId, context, file);
  return { context, file };
}

async function buildBusinessFileMutation(
  env: Env,
  workspaceId: string,
  context: BusinessContext,
  command: BusinessFileCommand,
  now: string
): Promise<BusinessMutation> {
  if (!context.allowedActions.includes('file.upload')) throw new ApiError('PERSONA_ACTION_DENIED', 'This actor profile cannot upload files.');
  const actorId = context.actor.id;
  if (command.type === 'file.reserve') {
    const payload = command.payload;
    const descriptor = { client_id: payload.clientId ?? null, engagement_id: payload.engagementId ?? null, purpose: payload.purpose,
      representation_request_id: payload.representationRequestId ?? null, created_by_actor_id: actorId };
    assertBusinessFileAction(context, descriptor, 'upload');
    if (context.actor.persona === 'CLIENT' && payload.purpose === 'EVIDENCE'
      && (payload.mediaType !== 'application/pdf' || !payload.representationRequestId)) {
      throw new ApiError('VALIDATION_FAILED', 'A client evidence upload must be a PDF reserved against its open signed representation request.');
    }
    if (payload.representationRequestId && context.actor.persona !== 'CLIENT') {
      throw new ApiError('PERSONA_ACTION_DENIED', 'Only the assigned client contact can reserve a signed representation return.');
    }
    if (payload.paymentEvidenceReservationId && (context.actor.persona === 'CLIENT' || payload.purpose !== 'EVIDENCE'
      || payload.representationRequestId || !payload.clientId || !payload.engagementId
      || !['application/pdf', 'image/png', 'image/jpeg'].includes(payload.mediaType))) {
      throw new ApiError('VALIDATION_FAILED', 'Post-archive payment evidence must be an internal engagement-scoped PDF or image.');
    }
    const requiresEngagement = ['PBC', 'TB', 'EVIDENCE'].includes(payload.purpose);
    if (requiresEngagement && (!payload.clientId || !payload.engagementId)) {
      throw new ApiError('VALIDATION_FAILED', 'PBC, TB and evidence files must be scoped to a client engagement.');
    }
    if (payload.clientId) {
      requireClientScope(context, payload.clientId);
      const client = await env.DB.prepare(`SELECT id FROM clients WHERE workspace_id=? AND id=? AND active=1`)
        .bind(workspaceId, payload.clientId).first<{ id: string }>();
      if (!client) throw new ApiError('NOT_FOUND', 'An active client is required for this file.');
    }
    if (payload.engagementId && payload.clientId) {
      if (context.scope.engagementId && context.scope.engagementId !== payload.engagementId) {
        throw new ApiError('FORBIDDEN_SCOPE', 'The file engagement does not match the selected context.');
      }
      await assertFileEngagementWritable(env, workspaceId, payload.clientId, payload.engagementId, context.actor.persona === 'CLIENT', Boolean(payload.paymentEvidenceReservationId));
    }
    await assertRepresentationFileRequestScope(env, workspaceId, context, descriptor, true);
    if (payload.folderId) {
      if (!payload.clientId || !payload.engagementId) throw new ApiError('VALIDATION_FAILED', 'A folder-bound file must identify its client and engagement.');
      const folder = await env.DB.prepare(`SELECT code FROM engagement_folders WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=?`)
        .bind(workspaceId, payload.folderId, payload.clientId, payload.engagementId).first<{ code: string }>();
      if (!folder) throw new ApiError('FORBIDDEN_SCOPE', 'The selected filing folder is outside this client engagement.');
      if (folder.code === 'FINAL_SIGNED_ARCHIVE') {
        throw new ApiError('PERSONA_ACTION_DENIED', 'The final signed archive accepts only artifacts created by the release workflow.');
      }
    }
    let priorPbcFileId: string | null = null;
    if (payload.purpose === 'PBC') {
      if (context.actor.persona !== 'CLIENT') throw new ApiError('PERSONA_ACTION_DENIED', 'PBC responses are uploaded by the assigned CLIENT contact.');
      if (!payload.pbcRequestId || !payload.expectedPbcRequestVersion || !payload.clientId || !payload.engagementId) {
        throw new ApiError('VALIDATION_FAILED', 'Choose the current PBC request before reserving a response upload.');
      }
      const actor = await env.DB.prepare(`SELECT contact_id FROM actor_profiles WHERE workspace_id=? AND id=? AND persona='CLIENT' AND active=1`)
        .bind(workspaceId, context.actor.id).first<{ contact_id: string | null }>();
      const pbcRequest = await env.DB.prepare(`SELECT version,status,client_id,engagement_id,assigned_contact_id,current_submission_id
        FROM pbc_requests WHERE workspace_id=? AND id=?`).bind(workspaceId, payload.pbcRequestId)
        .first<{ version: number; status: string; client_id: string; engagement_id: string; assigned_contact_id: string; current_submission_id: string | null }>();
      if (!pbcRequest || pbcRequest.client_id !== payload.clientId || pbcRequest.engagement_id !== payload.engagementId
        || pbcRequest.assigned_contact_id !== actor?.contact_id) {
        throw new ApiError('FORBIDDEN_SCOPE', 'The PBC request is outside the assigned client contact and engagement.');
      }
      if (pbcRequest.version !== payload.expectedPbcRequestVersion || !['PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED'].includes(pbcRequest.status)) {
        throw new ApiError('VERSION_CONFLICT', 'This request is no longer open for an upload. Refresh its current status.');
      }
      if (pbcRequest.current_submission_id && pbcRequest.status === 'REJECTED_REUPLOAD_REQUIRED') {
        const previous = await env.DB.prepare(`SELECT file_version_id FROM pbc_submissions WHERE workspace_id=? AND id=? AND request_id=?`)
          .bind(workspaceId, pbcRequest.current_submission_id, payload.pbcRequestId).first<{ file_version_id: string }>();
        priorPbcFileId = previous?.file_version_id ?? null;
      }
    }
    const id = crypto.randomUUID();
    const key = `workspaces/${workspaceId}/files/${id}`;
    const statements: D1PreparedStatement[] = [];
    if (payload.paymentEvidenceReservationId) {
      statements.push(env.DB.prepare(`INSERT INTO payment_evidence_reservations(id,workspace_id,client_id,engagement_id,reserved_by_actor_id,payment_id,created_at)
        VALUES(?,?,?,?,?,NULL,?)`).bind(payload.paymentEvidenceReservationId, workspaceId, payload.clientId!, payload.engagementId!, actorId, now));
    }
    statements.push(
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,71,CASE WHEN (? IS NULL OR EXISTS(SELECT 1 FROM clients WHERE workspace_id=? AND id=? AND active=1))
            AND (? IS NULL OR ?=1 OR EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND client_id=? AND id=? AND locked_at IS NULL AND lifecycle_state<>'ARCHIVED_READ_ONLY'
              AND (?=0 OR (portal_activated_at IS NOT NULL AND portal_frozen_at IS NULL))))
            AND (? IS NULL OR EXISTS(SELECT 1 FROM engagement_folders f WHERE f.workspace_id=? AND f.id=? AND f.client_id=? AND f.engagement_id=? AND f.code<>'FINAL_SIGNED_ARCHIVE'))
            AND (?=0 OR EXISTS(SELECT 1 FROM pbc_requests r JOIN actor_profiles ap ON ap.workspace_id=r.workspace_id AND ap.id=?
              JOIN engagements pe ON pe.workspace_id=r.workspace_id AND pe.client_id=r.client_id AND pe.id=r.engagement_id
              WHERE r.workspace_id=? AND r.id=? AND r.client_id=? AND r.engagement_id=? AND r.version=?
                AND r.status IN ('PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED') AND r.assigned_contact_id=ap.contact_id
                AND ap.persona='CLIENT' AND ap.active=1 AND pe.portal_activated_at IS NOT NULL AND pe.portal_frozen_at IS NULL AND pe.locked_at IS NULL))
            THEN 1 ELSE 0 END`)
          .bind(workspaceId, payload.clientId ?? null, workspaceId, payload.clientId ?? null,
            payload.engagementId ?? null, payload.paymentEvidenceReservationId ? 1 : 0, workspaceId, payload.clientId ?? null, payload.engagementId ?? null,
            context.actor.persona === 'CLIENT' ? 1 : 0,
            payload.folderId ?? null, workspaceId, payload.folderId ?? null, payload.clientId ?? null, payload.engagementId ?? null,
            payload.purpose === 'PBC' ? 1 : 0, actorId,
            workspaceId, payload.pbcRequestId ?? null, payload.clientId ?? null, payload.engagementId ?? null,
            payload.expectedPbcRequestVersion ?? null),
        env.DB.prepare(`INSERT INTO file_versions(
          id,workspace_id,version,client_id,engagement_id,folder_id,original_name,media_type,size_bytes,object_key,previous_version_id,purpose,
          pbc_request_id,pbc_request_version,payment_evidence_reservation_id,state,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id
        ) VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,'INITIALIZED',0,?,?,?,?)`).bind(
          id, workspaceId, payload.clientId ?? null, payload.engagementId ?? null, payload.folderId ?? null, payload.originalName,
          payload.mediaType, payload.sizeBytes, key, priorPbcFileId, payload.purpose, payload.pbcRequestId ?? null,
          payload.expectedPbcRequestVersion ?? null, payload.paymentEvidenceReservationId ?? null, now, now, actorId, actorId
        )
      );
    if (payload.representationRequestId) {
      statements.push(env.DB.prepare(`INSERT INTO representation_file_reservations(workspace_id,file_version_id,request_id,reserved_by_actor_id,reserved_at)
        VALUES(?,?,?,?,?)`).bind(workspaceId, id, payload.representationRequestId, actorId, now));
    }
    return {
      statements,
      result: { fileId: id, version: 1, state: 'INITIALIZED', uploadPath: `/api/workspaces/${workspaceId}/files/${id}/content` },
      entityType: 'FILE_VERSION', entityId: id, beforeVersion: null, afterVersion: 1
    };
  }

  const fileId = command.payload.fileId;
  const file = await businessFileRow(env, workspaceId, fileId);
  if (!file) throw new ApiError('NOT_FOUND', 'File reservation not found.');
  assertBusinessFileAction(context, file, 'upload');
  if (file.client_id && file.engagement_id) {
    await assertFileEngagementWritable(env, workspaceId, file.client_id, file.engagement_id, context.actor.persona === 'CLIENT', Boolean(file.payment_evidence_reservation_id));
  }
  await assertPbcFileRequestCurrent(env, workspaceId, context, file);
  await assertRepresentationFileRequestScope(env, workspaceId, context, file, true);
  await assertPaymentEvidenceReservationCurrent(env, workspaceId, context, file);

  if (command.type === 'file.stage') {
    const payload = command.payload;
    if (file.state !== 'INITIALIZED' || file.version !== payload.expectedVersion) {
      throw new ApiError('VERSION_CONFLICT', 'The file reservation changed before staging. Reload it and retry.');
    }
    if (payload.sizeBytes !== file.size_bytes) throw new ApiError('INTEGRITY_MISMATCH', 'The uploaded byte count does not match the reservation.');
    const objectKey = `${file.object_key}/${payload.sha256}`;
    const stored = await env.FILES.get(objectKey);
    if (!stored) throw new ApiError('UNAVAILABLE', 'Uploaded bytes are not available in object storage. Retry the same upload key.');
    const bytes = new Uint8Array(await stored.arrayBuffer());
    const digest = await sha256Bytes(bytes);
    if (bytes.length !== payload.sizeBytes || digest !== payload.sha256) {
      throw new ApiError('INTEGRITY_MISMATCH', 'The stored bytes do not match their declared size and digest.');
    }
    verifyBusinessFileBytes(file.media_type, bytes);
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,72,CASE WHEN EXISTS(SELECT 1 FROM file_versions fv WHERE fv.workspace_id=? AND fv.id=? AND fv.version=? AND fv.state='INITIALIZED'
            AND (fv.pbc_request_id IS NULL OR EXISTS(SELECT 1 FROM pbc_requests r JOIN engagements e ON e.workspace_id=r.workspace_id AND e.client_id=r.client_id AND e.id=r.engagement_id
              WHERE r.workspace_id=fv.workspace_id AND r.id=fv.pbc_request_id AND r.version=fv.pbc_request_version
                AND r.status IN ('PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED') AND e.portal_activated_at IS NOT NULL AND e.portal_frozen_at IS NULL AND e.locked_at IS NULL))
            AND NOT EXISTS(SELECT 1 FROM representation_file_reservations rfr
              JOIN representation_requests rr ON rr.workspace_id=rfr.workspace_id AND rr.id=rfr.request_id
              JOIN engagements re ON re.workspace_id=rr.workspace_id AND re.client_id=rr.client_id AND re.id=rr.engagement_id
              WHERE rfr.workspace_id=fv.workspace_id AND rfr.file_version_id=fv.id
                AND (rr.status NOT IN ('SENT','REJECTED') OR re.portal_activated_at IS NULL OR re.portal_frozen_at IS NOT NULL OR re.locked_at IS NOT NULL
                  OR (re.archive_due_at IS NOT NULL AND re.archive_due_at<=?)))
            AND (fv.payment_evidence_reservation_id IS NULL OR EXISTS(SELECT 1 FROM payment_evidence_reservations per
              WHERE per.workspace_id=fv.workspace_id AND per.id=fv.payment_evidence_reservation_id
                AND per.client_id=fv.client_id AND per.engagement_id=fv.engagement_id
                AND per.reserved_by_actor_id=fv.created_by_actor_id AND per.payment_id IS NULL)))
            THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, file.id, payload.expectedVersion, now),
        env.DB.prepare(`UPDATE file_versions SET version=version+1,size_bytes=?,sha256=?,object_key=?,state='STAGED',updated_at=?,updated_by_actor_id=?
          WHERE workspace_id=? AND id=? AND version=? AND state='INITIALIZED'`)
          .bind(payload.sizeBytes, digest, objectKey, now, actorId, workspaceId, file.id, payload.expectedVersion)
      ],
      result: { fileId: file.id, version: payload.expectedVersion + 1, state: 'STAGED', sizeBytes: payload.sizeBytes, sha256: digest },
      entityType: 'FILE_VERSION', entityId: file.id, beforeVersion: payload.expectedVersion, afterVersion: payload.expectedVersion + 1
    };
  }

  if (command.type === 'file.commit') {
    const payload = command.payload;
    if (file.state !== 'STAGED' || file.version !== payload.expectedVersion || !file.sha256) {
      throw new ApiError('VERSION_CONFLICT', 'Only the current staged file version can be committed.');
    }
    const stored = await env.FILES.get(file.object_key);
    if (!stored) throw new ApiError('INTEGRITY_MISMATCH', 'The staged object is missing from storage.');
    const bytes = new Uint8Array(await stored.arrayBuffer());
    const digest = await sha256Bytes(bytes);
    if (bytes.length !== payload.sizeBytes || digest !== payload.sha256
      || bytes.length !== file.size_bytes || digest !== file.sha256
      || payload.sizeBytes !== file.size_bytes || payload.sha256 !== file.sha256) {
      throw new ApiError('INTEGRITY_MISMATCH', 'The file changed after staging; it cannot be committed.');
    }
    verifyBusinessFileBytes(file.media_type, bytes);
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,73,CASE WHEN EXISTS(SELECT 1 FROM file_versions fv WHERE fv.workspace_id=? AND fv.id=? AND fv.version=? AND fv.state='STAGED'
            AND fv.sha256=? AND fv.size_bytes=? AND (?=1 OR ? IS NULL OR EXISTS(SELECT 1 FROM engagements e WHERE e.workspace_id=fv.workspace_id
              AND e.client_id=fv.client_id AND e.id=fv.engagement_id AND e.locked_at IS NULL AND e.lifecycle_state<>'ARCHIVED_READ_ONLY'
              AND (?=0 OR (e.portal_activated_at IS NOT NULL AND e.portal_frozen_at IS NULL))
              AND (e.archive_due_at IS NULL OR e.archive_due_at>?)))
            AND (fv.pbc_request_id IS NULL OR EXISTS(SELECT 1 FROM pbc_requests r JOIN engagements pe ON pe.workspace_id=r.workspace_id AND pe.client_id=r.client_id AND pe.id=r.engagement_id
              WHERE r.workspace_id=fv.workspace_id AND r.id=fv.pbc_request_id AND r.version=fv.pbc_request_version
                AND r.status IN ('PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED') AND pe.portal_activated_at IS NOT NULL AND pe.portal_frozen_at IS NULL AND pe.locked_at IS NULL))
            AND NOT EXISTS(SELECT 1 FROM representation_file_reservations rfr
              JOIN representation_requests rr ON rr.workspace_id=rfr.workspace_id AND rr.id=rfr.request_id
              JOIN engagements re ON re.workspace_id=rr.workspace_id AND re.client_id=rr.client_id AND re.id=rr.engagement_id
              WHERE rfr.workspace_id=fv.workspace_id AND rfr.file_version_id=fv.id
                AND (rr.status NOT IN ('SENT','REJECTED') OR re.portal_activated_at IS NULL OR re.portal_frozen_at IS NOT NULL OR re.locked_at IS NOT NULL
                  OR (re.archive_due_at IS NOT NULL AND re.archive_due_at<=?)))
            AND (fv.payment_evidence_reservation_id IS NULL OR EXISTS(SELECT 1 FROM payment_evidence_reservations per
              WHERE per.workspace_id=fv.workspace_id AND per.id=fv.payment_evidence_reservation_id
                AND per.client_id=fv.client_id AND per.engagement_id=fv.engagement_id
                AND per.reserved_by_actor_id=fv.created_by_actor_id AND per.payment_id IS NULL)))
            THEN 1 ELSE 0 END`)
          .bind(workspaceId, workspaceId, file.id, payload.expectedVersion, digest, bytes.length,
            file.payment_evidence_reservation_id ? 1 : 0, file.engagement_id, context.actor.persona === 'CLIENT' ? 1 : 0, now, now),
        env.DB.prepare(`UPDATE file_versions SET version=version+1,state='COMMITTED',immutable=1,committed_at=?,updated_at=?,updated_by_actor_id=?
          WHERE workspace_id=? AND id=? AND version=? AND state='STAGED' AND sha256=? AND size_bytes=?`)
          .bind(now, now, actorId, workspaceId, file.id, payload.expectedVersion, digest, bytes.length)
      ],
      result: { fileId: file.id, version: payload.expectedVersion + 1, state: 'COMMITTED', sizeBytes: bytes.length, sha256: digest },
      entityType: 'FILE_VERSION', entityId: file.id, beforeVersion: payload.expectedVersion, afterVersion: payload.expectedVersion + 1
    };
  }

  const rejectPayload = command.payload;
  if (file.state === 'COMMITTED') throw new ApiError('IMMUTABLE_RECORD', 'Committed file versions cannot be rejected or changed.');
  if (file.state === 'REJECTED' || file.version !== rejectPayload.expectedVersion) {
    throw new ApiError('VERSION_CONFLICT', 'The file reservation changed before rejection.');
  }
  return {
    statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,74,CASE WHEN EXISTS(SELECT 1 FROM file_versions WHERE workspace_id=? AND id=? AND version=? AND state IN ('INITIALIZED','STAGED','VERIFIED'))
          THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, file.id, rejectPayload.expectedVersion),
      env.DB.prepare(`UPDATE file_versions SET version=version+1,state='REJECTED',updated_at=?,updated_by_actor_id=?
        WHERE workspace_id=? AND id=? AND version=? AND state IN ('INITIALIZED','STAGED','VERIFIED')`)
        .bind(now, actorId, workspaceId, file.id, rejectPayload.expectedVersion)
    ],
    result: { fileId: file.id, version: rejectPayload.expectedVersion + 1, state: 'REJECTED', reason: rejectPayload.reason },
    entityType: 'FILE_VERSION', entityId: file.id, beforeVersion: rejectPayload.expectedVersion, afterVersion: rejectPayload.expectedVersion + 1,
    auditDetails: { rejectionReason: rejectPayload.reason }
  };
}

function assertPbcContext(context: BusinessContext, clientId: string, engagementId: string): void {
  if (context.actor.persona === 'CLIENT' && context.actor.clientId !== clientId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The PBC request belongs to another client.');
  }
  if (context.scope.clientId && context.scope.clientId !== clientId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The PBC request does not match the selected client context.');
  }
  if (context.scope.engagementId && context.scope.engagementId !== engagementId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The PBC request does not match the selected engagement context.');
  }
}

async function buildBusinessPbcMutation(
  env: Env, workspaceId: string, context: BusinessContext, command: BusinessPbcCommand, now: string
): Promise<BusinessMutation> {
  const actorId = context.actor.id;
  if (command.type === 'pbc.request.create') {
    if (!context.allowedActions.includes('pbc.manage') || context.actor.persona === 'CLIENT') {
      throw new ApiError('PERSONA_ACTION_DENIED', 'Only internal PREPARER, REVIEWER or Partner APPROVER profiles may create PBC requests.');
    }
    const payload = command.payload;
    assertPbcContext(context, payload.clientId, payload.engagementId);
    const engagement = await env.DB.prepare(`SELECT lifecycle_state,locked_at,portal_frozen_at FROM engagements
      WHERE workspace_id=? AND client_id=? AND id=?`).bind(workspaceId, payload.clientId, payload.engagementId)
      .first<{ lifecycle_state: string; locked_at: string | null; portal_frozen_at: string | null }>();
    if (!engagement) throw new ApiError('FORBIDDEN_SCOPE', 'The PBC engagement is not in the selected client scope.');
    if (!['ADVANCE_BILLING','PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL','DELIVERABLE_RELEASE'].includes(engagement.lifecycle_state)) {
      throw new ApiError('INVALID_TRANSITION', 'PBC requests can be created after the engagement letter and risk handover enter advance billing.');
    }
    if (engagement.locked_at || engagement.portal_frozen_at) throw new ApiError('WORKSPACE_FROZEN', 'No PBC requests can be changed after the portal is frozen.');
    const pbcRoute = await env.DB.prepare(`SELECT cr.id,cr.version FROM contact_routes cr
      JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
      WHERE cr.workspace_id=? AND cr.client_id=? AND cr.contact_id=? AND cr.purpose='PBC' AND ct.active=1
        AND ((cr.is_primary=1 AND ct.role='CHIEF_ACCOUNTANT_LIAISON') OR
          (cr.is_primary=0 AND length(trim(COALESCE(cr.rationale,''))) BETWEEN 10 AND 1000))`)
      .bind(workspaceId, payload.clientId, payload.assignedContactId).first<{ id: string; version: number }>();
    if (!pbcRoute) throw new ApiError('GATE_BLOCKED', 'Choose an active primary PBC recipient route or a documented PBC alternate.');
    const requestId = crypto.randomUUID();
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,88,CASE WHEN EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND client_id=? AND id=?
            AND locked_at IS NULL AND portal_frozen_at IS NULL AND lifecycle_state IN ('ADVANCE_BILLING','PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL','DELIVERABLE_RELEASE'))
            AND EXISTS(SELECT 1 FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
              WHERE cr.workspace_id=? AND cr.client_id=? AND cr.contact_id=? AND cr.purpose='PBC' AND ct.active=1
                AND ((cr.is_primary=1 AND ct.role='CHIEF_ACCOUNTANT_LIAISON') OR
                  (cr.is_primary=0 AND length(trim(COALESCE(cr.rationale,''))) BETWEEN 10 AND 1000))) THEN 1 ELSE 0 END`)
          .bind(workspaceId, workspaceId, payload.clientId, payload.engagementId, workspaceId, payload.clientId, payload.assignedContactId),
        env.DB.prepare(`INSERT INTO pbc_requests(id,workspace_id,version,client_id,engagement_id,title,description,due_date,requested_by_actor_id,
          assigned_contact_id,category,required_for_planning,required_for_release,status,current_submission_id,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
          VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,'PENDING_UPLOAD',NULL,?,?,?,?)`)
          .bind(requestId, workspaceId, payload.clientId, payload.engagementId, payload.title, payload.description, payload.dueDate, actorId,
            payload.assignedContactId, payload.category, payload.requiredForPlanning ? 1 : 0, payload.requiredForRelease ? 1 : 0, now, now, actorId, actorId)
      ],
      result: { requestId, version: 1, status: 'PENDING_UPLOAD' }, entityType: 'PBC_REQUEST', entityId: requestId,
      beforeVersion: null, afterVersion: 1, auditDetails: { clientId: payload.clientId, engagementId: payload.engagementId, category: payload.category }
    };
  }

  if (command.type === 'pbc.submit') {
    if (!context.allowedActions.includes('pbc.submit') || context.actor.persona !== 'CLIENT') {
      throw new ApiError('PERSONA_ACTION_DENIED', 'Only the assigned CLIENT contact may submit a PBC response.');
    }
    const payload = command.payload;
    const actor = await env.DB.prepare(`SELECT contact_id FROM actor_profiles WHERE workspace_id=? AND id=? AND persona='CLIENT' AND active=1`)
      .bind(workspaceId, actorId).first<{ contact_id: string | null }>();
    const request = await env.DB.prepare(`SELECT id,version,client_id,engagement_id,assigned_contact_id,status,current_submission_id
      FROM pbc_requests WHERE workspace_id=? AND id=?`).bind(workspaceId, payload.requestId)
      .first<{ id: string; version: number; client_id: string; engagement_id: string; assigned_contact_id: string; status: string; current_submission_id: string | null }>();
    if (!request) throw new ApiError('NOT_FOUND', 'PBC request not found.');
    assertPbcContext(context, request.client_id, request.engagement_id);
    if (request.assigned_contact_id !== actor?.contact_id) throw new ApiError('FORBIDDEN_SCOPE', 'This request is assigned to a different client contact.');
    if (request.version !== payload.expectedRequestVersion || !['PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED'].includes(request.status)) {
      throw new ApiError('VERSION_CONFLICT', 'This PBC request changed. Refresh before submitting another response.');
    }
    await assertFileEngagementWritable(env, workspaceId, request.client_id, request.engagement_id, true);
    const file = await env.DB.prepare(`SELECT id,sha256,created_by_actor_id,previous_version_id,pbc_request_id,pbc_request_version,state,immutable,client_id,engagement_id,purpose
      FROM file_versions WHERE workspace_id=? AND id=?`).bind(workspaceId, payload.fileVersionId)
      .first<{ id: string; sha256: string | null; created_by_actor_id: string | null; previous_version_id: string | null; pbc_request_id: string | null;
        pbc_request_version: number | null; state: string; immutable: number; client_id: string | null; engagement_id: string | null; purpose: string }>();
    if (!file || file.client_id !== request.client_id || file.engagement_id !== request.engagement_id || file.purpose !== 'PBC'
      || file.pbc_request_id !== request.id || file.pbc_request_version !== request.version || file.state !== 'COMMITTED' || file.immutable !== 1 || !file.sha256
      || file.created_by_actor_id !== actorId) {
      throw new ApiError('GATE_BLOCKED', 'Submit the exact verified and committed file reserved for this current PBC request.');
    }
    const supersedesSubmissionId = request.status === 'REJECTED_REUPLOAD_REQUIRED' ? request.current_submission_id : null;
    if (supersedesSubmissionId) {
      const previous = await env.DB.prepare(`SELECT file_version_id FROM pbc_submissions WHERE workspace_id=? AND id=? AND request_id=?`)
        .bind(workspaceId, supersedesSubmissionId, request.id).first<{ file_version_id: string }>();
      if (!previous || file.previous_version_id !== previous.file_version_id) {
        throw new ApiError('GATE_BLOCKED', 'A replacement must preserve the rejected response as its file predecessor.');
      }
    }
    const sequenceRow = await env.DB.prepare(`SELECT COALESCE(MAX(sequence),0)+1 AS next FROM pbc_submissions WHERE workspace_id=? AND request_id=?`)
      .bind(workspaceId, request.id).first<{ next: number }>();
    const sequence = sequenceRow?.next ?? 1;
    const submissionId = crypto.randomUUID();
    const nextStatus = 'UNDER_REVIEW';
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,88,CASE WHEN EXISTS(SELECT 1 FROM pbc_requests r JOIN actor_profiles ap ON ap.workspace_id=r.workspace_id AND ap.id=?
            JOIN engagements e ON e.workspace_id=r.workspace_id AND e.client_id=r.client_id AND e.id=r.engagement_id
            JOIN file_versions f ON f.workspace_id=r.workspace_id AND f.id=? AND f.client_id=r.client_id AND f.engagement_id=r.engagement_id
              AND f.purpose='PBC' AND f.state='COMMITTED' AND f.immutable=1 AND f.sha256 IS NOT NULL
              AND f.pbc_request_id=r.id AND f.pbc_request_version=r.version AND f.created_by_actor_id=ap.id
            WHERE r.workspace_id=? AND r.id=? AND r.version=? AND r.status IN ('PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED')
              AND r.assigned_contact_id=ap.contact_id AND ap.persona='CLIENT' AND ap.active=1
              AND e.portal_activated_at IS NOT NULL AND e.portal_frozen_at IS NULL AND e.locked_at IS NULL
              AND (? IS NULL OR f.previous_version_id=(SELECT old.file_version_id FROM pbc_submissions old WHERE old.workspace_id=r.workspace_id AND old.id=? AND old.request_id=r.id)))
            THEN 1 ELSE 0 END`)
          .bind(workspaceId, actorId, payload.fileVersionId, workspaceId, request.id, payload.expectedRequestVersion,
            supersedesSubmissionId, supersedesSubmissionId),
        env.DB.prepare(`INSERT INTO pbc_submissions(id,workspace_id,version,request_id,sequence,file_version_id,uploaded_by_contact_id,submitted_at,client_comment,supersedes_submission_id)
          VALUES(?,?,1,?,?,?,?,?,?,?)`)
          .bind(submissionId, workspaceId, request.id, sequence, file.id, actor?.contact_id, now, payload.clientComment ?? null, supersedesSubmissionId),
        env.DB.prepare(`UPDATE pbc_requests SET version=version+1,status=?,current_submission_id=?,updated_at=?,updated_by_actor_id=?
          WHERE workspace_id=? AND id=? AND version=? AND status IN ('PENDING_UPLOAD','REJECTED_REUPLOAD_REQUIRED')`)
          .bind(nextStatus, submissionId, now, actorId, workspaceId, request.id, payload.expectedRequestVersion)
      ],
      result: { requestId: request.id, submissionId, sequence, status: nextStatus, version: payload.expectedRequestVersion + 1, fileSha256: file.sha256 },
      entityType: 'PBC_SUBMISSION', entityId: submissionId, beforeVersion: payload.expectedRequestVersion, afterVersion: payload.expectedRequestVersion + 1,
      auditDetails: { requestId: request.id, submissionId, fileVersionId: file.id, fileSha256: file.sha256, supersedesSubmissionId }
    };
  }

  if (!context.allowedActions.includes('pbc.review') || context.actor.persona !== 'REVIEWER') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'PBC evidence is reviewed by a REVIEWER profile.');
  }
  const payload = command.payload;
  const request = await env.DB.prepare(`SELECT id,version,client_id,engagement_id,status,current_submission_id
    FROM pbc_requests WHERE workspace_id=? AND id=?`).bind(workspaceId, payload.requestId)
    .first<{ id: string; version: number; client_id: string; engagement_id: string; status: string; current_submission_id: string | null }>();
  if (!request) throw new ApiError('NOT_FOUND', 'PBC request not found.');
  assertPbcContext(context, request.client_id, request.engagement_id);
  if (request.version !== payload.expectedRequestVersion || request.status !== 'UNDER_REVIEW' || request.current_submission_id !== payload.submissionId) {
    throw new ApiError('VERSION_CONFLICT', 'Only the exact current PBC submission can be reviewed. Refresh the request before deciding.');
  }
  const submission = await env.DB.prepare(`SELECT s.id,s.file_version_id,f.sha256 FROM pbc_submissions s
    JOIN file_versions f ON f.workspace_id=s.workspace_id AND f.id=s.file_version_id
    WHERE s.workspace_id=? AND s.id=? AND s.request_id=? AND f.state='COMMITTED' AND f.immutable=1`)
    .bind(workspaceId, payload.submissionId, request.id).first<{ id: string; file_version_id: string; sha256: string | null }>();
  if (!submission?.sha256) throw new ApiError('GATE_BLOCKED', 'The current committed PBC bytes could not be verified for review.');
  const reviewId = crypto.randomUUID();
  const status = payload.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED_REUPLOAD_REQUIRED';
  return {
    statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,88,CASE WHEN EXISTS(SELECT 1 FROM pbc_requests r JOIN pbc_submissions s ON s.workspace_id=r.workspace_id AND s.id=r.current_submission_id
          JOIN file_versions f ON f.workspace_id=s.workspace_id AND f.id=s.file_version_id
          WHERE r.workspace_id=? AND r.id=? AND r.version=? AND r.status='UNDER_REVIEW' AND r.current_submission_id=?
            AND s.id=? AND f.state='COMMITTED' AND f.immutable=1 AND f.sha256=? AND f.sha256 IS NOT NULL) THEN 1 ELSE 0 END`)
        .bind(workspaceId, workspaceId, request.id, payload.expectedRequestVersion, payload.submissionId, payload.submissionId, submission.sha256),
      env.DB.prepare(`INSERT INTO pbc_reviews(id,workspace_id,version,submission_id,request_id,decision,comments,reviewed_by_actor_id,reviewed_at,file_sha256)
        VALUES(?,?,1,?,?,?,?,?,?,?)`)
        .bind(reviewId, workspaceId, submission.id, request.id, payload.decision, payload.comments ?? null, actorId, now, submission.sha256),
      env.DB.prepare(`UPDATE pbc_requests SET version=version+1,status=?,updated_at=?,updated_by_actor_id=?
        WHERE workspace_id=? AND id=? AND version=? AND status='UNDER_REVIEW' AND current_submission_id=?`)
        .bind(status, now, actorId, workspaceId, request.id, payload.expectedRequestVersion, payload.submissionId)
    ],
    result: { requestId: request.id, reviewId, submissionId: submission.id, status, version: payload.expectedRequestVersion + 1 },
    entityType: 'PBC_REVIEW', entityId: reviewId, beforeVersion: payload.expectedRequestVersion, afterVersion: payload.expectedRequestVersion + 1,
    auditDetails: { requestId: request.id, submissionId: submission.id, decision: payload.decision, comments: payload.comments ?? null, fileSha256: submission.sha256 }
  };
}

function businessFileMetadata(file: BusinessFileRow) {
  return {
    id: file.id,
    version: file.version,
    clientId: file.client_id,
    engagementId: file.engagement_id,
    originalName: file.original_name,
    mediaType: file.media_type,
    sizeBytes: file.size_bytes,
    sha256: file.sha256,
    purpose: file.purpose,
    ...(file.representation_request_id ? { representationRequestId: file.representation_request_id } : {}),
    state: file.state,
    committedAt: file.committed_at,
    immutable: file.immutable === 1
  };
}

export async function runBusinessFileContent(
  env: Env,
  workspaceId: string,
  request: Request,
  fileId: string
): Promise<Record<string, unknown>> {
  const { context, file } = await getBusinessFileForUpload(env, workspaceId, request, fileId);
  const expectedVersion = Number(request.headers.get('X-File-Version'));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new ApiError('BAD_REQUEST', 'X-File-Version must identify the current reservation version.');
  }
  const declaredType = request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (declaredType !== file.media_type) throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must match the reserved file type.');
  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) !== file.size_bytes)) {
    throw new ApiError('INTEGRITY_MISMATCH', 'Content-Length does not match the reserved file size.');
  }
  if (!request.body) throw new ApiError('BAD_REQUEST', 'Upload a non-empty raw file body.');
  const bytes = new Uint8Array(await request.clone().arrayBuffer());
  if (bytes.length !== file.size_bytes) throw new ApiError('INTEGRITY_MISMATCH', 'Uploaded bytes do not match the reserved file size.');
  verifyBusinessFileBytes(file.media_type, bytes);
  const digest = await sha256Bytes(bytes);
  const envelope = businessEnvelopeFromRequest(request, {
    type: 'file.stage',
    payload: { fileId, expectedVersion, sizeBytes: bytes.length, sha256: digest }
  }, [{ entity: 'FileVersion', id: fileId, version: expectedVersion }]);
  const replay = await findBusinessCommandReplay(env, workspaceId, envelope);
  if (replay) return replay;
  if (file.version !== expectedVersion || file.state !== 'INITIALIZED') {
    throw new ApiError(file.state === 'COMMITTED' ? 'IMMUTABLE_RECORD' : 'VERSION_CONFLICT', 'The file is not an open reservation at that version.');
  }

  const objectKey = `${file.object_key}/${digest}`;
  try {
    await env.FILES.put(objectKey, request.body, {
      httpMetadata: { contentType: file.media_type },
      customMetadata: { sha256: digest, fileVersionId: file.id }
    });
  } catch {
    throw new ApiError('UNAVAILABLE', 'The object store could not accept this upload. Retry with the same Idempotency-Key.');
  }
  return runBusinessDirectoryCommand(env, workspaceId, request, envelope);
}

export async function listBusinessFiles(
  env: Env,
  workspaceId: string,
  request: Request,
  limit = 100
): Promise<{ items: Array<ReturnType<typeof businessFileMetadata>> }> {
  const context = await resolveBusinessContext(env, workspaceId, request);
  if (!context.allowedActions.includes('file.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'This actor profile cannot read files.');
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 100, 1), 100);
  const clauses = ['workspace_id=?', "state='COMMITTED'"];
  const bindings: unknown[] = [workspaceId];
  const clientId = context.actor.persona === 'CLIENT' ? context.actor.clientId : context.scope.clientId;
  if (clientId) {
    if (context.actor.persona === 'CLIENT') { clauses.push('client_id=?'); bindings.push(clientId); }
    else { clauses.push('(client_id=? OR client_id IS NULL)'); bindings.push(clientId); }
  }
  if (context.scope.engagementId) {
    if (context.actor.persona === 'CLIENT') { clauses.push('engagement_id=?'); bindings.push(context.scope.engagementId); }
    else {
      clauses.push(`(engagement_id=? OR engagement_id IS NULL OR engagement_id=(SELECT cr.prior_engagement_id FROM continuance_reviews cr
        WHERE cr.workspace_id=file_versions.workspace_id AND cr.engagement_id=?))`);
      bindings.push(context.scope.engagementId, context.scope.engagementId);
    }
  }
  if (context.actor.persona === 'CLIENT') clauses.push(`(
    (purpose='PBC' AND pbc_request_id IS NOT NULL AND EXISTS(SELECT 1 FROM pbc_requests pr JOIN actor_profiles ap
      ON ap.workspace_id=pr.workspace_id AND ap.id=? WHERE pr.workspace_id=file_versions.workspace_id AND pr.id=file_versions.pbc_request_id
        AND pr.client_id=file_versions.client_id AND pr.engagement_id=file_versions.engagement_id AND pr.assigned_contact_id=ap.contact_id))
    OR (purpose='RELEASE' AND (
      EXISTS(SELECT 1 FROM deliverable_bundles b JOIN deliverable_parts dp ON dp.workspace_id=b.workspace_id AND dp.bundle_id=b.id
        WHERE b.workspace_id=file_versions.workspace_id AND b.client_id=file_versions.client_id AND b.engagement_id=file_versions.engagement_id
          AND dp.primary_file_id=file_versions.id)
      OR EXISTS(SELECT 1 FROM deliverable_bundles b JOIN deliverable_parts dp ON dp.workspace_id=b.workspace_id AND dp.bundle_id=b.id
        JOIN deliverable_attachments da ON da.workspace_id=dp.workspace_id AND da.part_id=dp.id
        WHERE b.workspace_id=file_versions.workspace_id AND b.client_id=file_versions.client_id AND b.engagement_id=file_versions.engagement_id
          AND da.file_version_id=file_versions.id)
    ))
    OR (purpose='GENERATED' AND (
    EXISTS(SELECT 1 FROM generated_artifacts ga JOIN proposal_artifacts pa ON pa.workspace_id=ga.workspace_id AND pa.artifact_id=ga.id
      JOIN proposals p ON p.workspace_id=pa.workspace_id AND p.current_version_id=pa.proposal_version_id
      JOIN proposal_approvals a ON a.workspace_id=pa.workspace_id AND a.proposal_version_id=pa.proposal_version_id AND a.decision='APPROVE'
      WHERE ga.workspace_id=file_versions.workspace_id AND ga.file_version_id=file_versions.id AND p.client_id=?
        AND NOT EXISTS(SELECT 1 FROM proposal_approvals later WHERE later.workspace_id=a.workspace_id
          AND later.proposal_version_id=a.proposal_version_id AND (later.decided_at>a.decided_at OR (later.decided_at=a.decided_at AND later.id>a.id))))
    OR EXISTS(SELECT 1 FROM engagement_letters l WHERE l.workspace_id=file_versions.workspace_id AND l.client_id=? AND l.file_version_id=file_versions.id)
    OR EXISTS(SELECT 1 FROM invoices i WHERE i.workspace_id=file_versions.workspace_id AND i.client_id=? AND i.file_version_id=file_versions.id AND i.status='ISSUED')
    OR EXISTS(SELECT 1 FROM receipt_vouchers rv WHERE rv.workspace_id=file_versions.workspace_id AND rv.client_id=? AND rv.file_version_id=file_versions.id AND rv.status='ISSUED')
    OR EXISTS(SELECT 1 FROM holding_letters h JOIN dispatches d ON d.workspace_id=h.workspace_id AND d.id=h.dispatch_id AND d.status IN ('ACCEPTED','DELIVERED')
      JOIN generated_artifacts ga ON ga.workspace_id=h.workspace_id AND ga.id=h.artifact_id
      WHERE h.workspace_id=file_versions.workspace_id AND h.client_id=? AND h.engagement_id=file_versions.engagement_id
        AND ga.source_entity_type='HOLDING_LETTER' AND ga.source_entity_id=h.id AND ga.file_version_id=file_versions.id)
   ))
    OR (purpose='EVIDENCE' AND media_type='application/pdf' AND EXISTS(SELECT 1 FROM representation_file_reservations rfr
      JOIN representation_requests rr ON rr.workspace_id=rfr.workspace_id AND rr.id=rfr.request_id
      JOIN contact_routes cr ON cr.workspace_id=rr.workspace_id AND cr.id=rr.contact_route_id AND cr.client_id=rr.client_id AND cr.purpose='FINAL_REPORT'
      JOIN actor_profiles ap ON ap.workspace_id=rr.workspace_id AND ap.id=? AND ap.persona='CLIENT' AND ap.active=1 AND ap.contact_id=cr.contact_id
      WHERE rfr.workspace_id=file_versions.workspace_id AND rfr.file_version_id=file_versions.id AND rr.client_id=?
        AND rr.engagement_id=file_versions.engagement_id AND rr.status IN ('SENT','RECEIVED','REJECTED','ACCEPTED')))
   )`), bindings.push(context.actor.id, clientId, clientId, clientId, clientId, clientId, context.actor.id, clientId);
  const result = await env.DB.prepare(`SELECT id,version,client_id,engagement_id,original_name,media_type,size_bytes,
      pbc_request_id,pbc_request_version,
      (SELECT rfr.request_id FROM representation_file_reservations rfr WHERE rfr.workspace_id=file_versions.workspace_id AND rfr.file_version_id=file_versions.id) AS representation_request_id,
      sha256,object_key,purpose,state,committed_at,immutable,created_by_actor_id FROM file_versions
    WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT ?`)
    .bind(...bindings, safeLimit).all<BusinessFileRow>();
  return { items: (result.results ?? []).map(businessFileMetadata) };
}

function portalMode(row: { portal_activated_at: string | null; portal_frozen_at: string | null; locked_at: string | null }): 'NOT_ACTIVE' | 'ACTIVE' | 'FROZEN' {
  if (row.portal_frozen_at || row.locked_at) return 'FROZEN';
  return row.portal_activated_at ? 'ACTIVE' : 'NOT_ACTIVE';
}

async function listClientDocuments(env: Env, workspaceId: string, clientId: string, engagementId: string) {
  const result = await env.DB.prepare(`
    SELECT l.id AS id,l.file_version_id,'ENGAGEMENT_LETTER' AS category,f.original_name,l.issued_at AS issue_date,l.engagement_id,e.code AS engagement_code,NULL AS blockers_json
      FROM engagement_letters l JOIN file_versions f ON f.workspace_id=l.workspace_id AND f.id=l.file_version_id
      JOIN engagements e ON e.workspace_id=l.workspace_id AND e.id=l.engagement_id
      WHERE l.workspace_id=? AND l.client_id=? AND l.engagement_id=? AND f.state='COMMITTED' AND f.immutable=1
    UNION ALL
    SELECT i.id,i.file_version_id,'INVOICE',f.original_name,COALESCE(i.issue_date,i.issued_at),i.engagement_id,e.code,NULL
      FROM invoices i JOIN file_versions f ON f.workspace_id=i.workspace_id AND f.id=i.file_version_id
      JOIN engagements e ON e.workspace_id=i.workspace_id AND e.id=i.engagement_id
      WHERE i.workspace_id=? AND i.client_id=? AND i.engagement_id=? AND i.status='ISSUED' AND f.state='COMMITTED' AND f.immutable=1
    UNION ALL
    SELECT rv.id,rv.file_version_id,'RECEIPT',f.original_name,rv.issued_at,rv.engagement_id,e.code,NULL
      FROM receipt_vouchers rv JOIN file_versions f ON f.workspace_id=rv.workspace_id AND f.id=rv.file_version_id
      JOIN engagements e ON e.workspace_id=rv.workspace_id AND e.id=rv.engagement_id
      WHERE rv.workspace_id=? AND rv.client_id=? AND rv.engagement_id=? AND rv.status='ISSUED' AND f.state='COMMITTED' AND f.immutable=1
    UNION ALL
    SELECT h.id,ga.file_version_id,'HOLDING_LETTER',f.original_name,h.created_at,h.engagement_id,e.code,h.confirmation_ids_snapshot_json
      FROM holding_letters h JOIN dispatches d ON d.workspace_id=h.workspace_id AND d.id=h.dispatch_id AND d.status IN ('ACCEPTED','DELIVERED')
      JOIN generated_artifacts ga ON ga.workspace_id=h.workspace_id AND ga.id=h.artifact_id
        AND ga.source_entity_type='HOLDING_LETTER' AND ga.source_entity_id=h.id
      JOIN file_versions f ON f.workspace_id=ga.workspace_id AND f.id=ga.file_version_id
      JOIN engagements e ON e.workspace_id=h.workspace_id AND e.id=h.engagement_id
      WHERE h.workspace_id=? AND h.client_id=? AND h.engagement_id=? AND f.state='COMMITTED' AND f.immutable=1
    UNION ALL
    SELECT dp.id,dp.primary_file_id,'FINAL_DELIVERABLE',f.original_name,b.released_at,b.engagement_id,e.code,NULL
      FROM deliverable_bundles b JOIN deliverable_parts dp ON dp.workspace_id=b.workspace_id AND dp.bundle_id=b.id
      JOIN file_versions f ON f.workspace_id=b.workspace_id AND f.id=dp.primary_file_id
      JOIN engagements e ON e.workspace_id=b.workspace_id AND e.id=b.engagement_id
      WHERE b.workspace_id=? AND b.client_id=? AND b.engagement_id=? AND f.state='COMMITTED' AND f.immutable=1
    UNION ALL
    SELECT 'attachment:'||da.id,da.file_version_id,'FINAL_DELIVERABLE',f.original_name,b.released_at,b.engagement_id,e.code,NULL
      FROM deliverable_bundles b JOIN deliverable_parts dp ON dp.workspace_id=b.workspace_id AND dp.bundle_id=b.id
      JOIN deliverable_attachments da ON da.workspace_id=dp.workspace_id AND da.part_id=dp.id
      JOIN file_versions f ON f.workspace_id=b.workspace_id AND f.id=da.file_version_id
      JOIN engagements e ON e.workspace_id=b.workspace_id AND e.id=b.engagement_id
      WHERE b.workspace_id=? AND b.client_id=? AND b.engagement_id=? AND f.state='COMMITTED' AND f.immutable=1
    ORDER BY 5 DESC,1`)
    .bind(workspaceId,clientId,engagementId, workspaceId,clientId,engagementId, workspaceId,clientId,engagementId,
      workspaceId,clientId,engagementId, workspaceId,clientId,engagementId, workspaceId,clientId,engagementId)
    .all<ClientDocumentSourceRow>();
  return projectClientDocuments(result.results ?? []);
}

export async function listBusinessPbcEngagements(env: Env, workspaceId: string, request: Request): Promise<{ engagements: Array<Record<string, unknown>> }> {
  const context = await resolveBusinessContext(env, workspaceId, request);
  if (!context.allowedActions.includes('pbc.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read the client PBC workspace.');
  const clientId = context.actor.persona === 'CLIENT' ? context.actor.clientId : context.scope.clientId;
  const clauses = ['e.workspace_id=?'];
  const bindings: unknown[] = [workspaceId];
  if (clientId) { clauses.push('e.client_id=?'); bindings.push(clientId); }
  if (context.scope.engagementId) { clauses.push('e.id=?'); bindings.push(context.scope.engagementId); }
  const result = await env.DB.prepare(`SELECT e.id,e.client_id,e.code,e.period_start,e.period_end,e.lifecycle_state,e.portal_activated_at,e.portal_frozen_at,e.locked_at
    FROM engagements e WHERE ${clauses.join(' AND ')} ORDER BY e.period_end DESC,e.code,e.id LIMIT 100`)
    .bind(...bindings).all<{ id: string; code: string; period_start: string; period_end: string; lifecycle_state: string;
      client_id: string; portal_activated_at: string | null; portal_frozen_at: string | null; locked_at: string | null }>();
  return { engagements: (result.results ?? []).map(row => {
    const mode = portalMode(row);
    return { id: row.id, clientId: row.client_id, code: row.code, periodStart: row.period_start, periodEnd: row.period_end,
      lifecycleState: row.lifecycle_state, mode, canUpload: context.actor.persona === 'CLIENT' && mode === 'ACTIVE' };
  }) };
}

export async function getBusinessPbcPortal(env: Env, workspaceId: string, request: Request, engagementId: string): Promise<Record<string, unknown>> {
  const context = await resolveBusinessContext(env, workspaceId, request);
  if (!context.allowedActions.includes('pbc.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read the client PBC workspace.');
  const engagement = await env.DB.prepare(`SELECT e.id,e.client_id,e.code,e.period_start,e.period_end,e.lifecycle_state,e.portal_activated_at,e.portal_frozen_at,e.locked_at
    FROM engagements e WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId, engagementId)
    .first<{ id: string; client_id: string; code: string; period_start: string; period_end: string; lifecycle_state: string;
      portal_activated_at: string | null; portal_frozen_at: string | null; locked_at: string | null }>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement portal was not found.');
  assertPbcContext(context, engagement.client_id, engagement.id);
  const actorContact = context.actor.persona === 'CLIENT'
    ? await env.DB.prepare(`SELECT contact_id FROM actor_profiles WHERE workspace_id=? AND id=? AND persona='CLIENT' AND active=1`)
      .bind(workspaceId, context.actor.id).first<{ contact_id: string | null }>()
    : null;
  if (context.actor.persona === 'CLIENT' && !actorContact?.contact_id) throw new ApiError('FORBIDDEN_SCOPE', 'The client profile has no active contact assignment.');
  const contactFilter = context.actor.persona === 'CLIENT' ? 'AND r.assigned_contact_id=?' : '';
  const requestBindings: unknown[] = [workspaceId, engagement.client_id, engagement.id];
  if (context.actor.persona === 'CLIENT') requestBindings.push(actorContact?.contact_id);
  const requestRows = await env.DB.prepare(`SELECT r.id,r.version,r.title,r.description,r.due_date,r.assigned_contact_id,c.full_name AS contact_name,
      r.category,r.required_for_planning,r.required_for_release,r.status,r.current_submission_id
    FROM pbc_requests r JOIN contacts c ON c.workspace_id=r.workspace_id AND c.id=r.assigned_contact_id
    WHERE r.workspace_id=? AND r.client_id=? AND r.engagement_id=? ${contactFilter}
    ORDER BY r.due_date,r.title,r.id LIMIT 100`).bind(...requestBindings)
    .all<{ id: string; version: number; title: string; description: string; due_date: string; assigned_contact_id: string; contact_name: string;
      category: string; required_for_planning: number; required_for_release: number; status: string; current_submission_id: string | null }>();
  const requestList = requestRows.results ?? [];
  const requestIds = requestList.map(row => row.id);
  const requestPlaceholders = requestIds.map(() => '?').join(',');
  const submissionQuery = requestIds.length ? await env.DB.prepare(`SELECT s.id,s.request_id,s.sequence,s.file_version_id,s.submitted_at,s.client_comment,s.supersedes_submission_id,
      f.original_name,f.sha256
    FROM pbc_submissions s JOIN file_versions f ON f.workspace_id=s.workspace_id AND f.id=s.file_version_id
    WHERE s.workspace_id=? AND s.request_id IN (${requestPlaceholders}) ORDER BY s.request_id,s.sequence`)
    .bind(workspaceId, ...requestIds).all<{ id: string; request_id: string; sequence: number; file_version_id: string; submitted_at: string;
      client_comment: string | null; supersedes_submission_id: string | null; original_name: string; sha256: string }>() : null;
  const reviewQuery = requestIds.length ? await env.DB.prepare(`SELECT id,request_id,submission_id,decision,comments,reviewed_at,file_sha256 FROM pbc_reviews
    WHERE workspace_id=? AND request_id IN (${requestPlaceholders}) ORDER BY request_id,reviewed_at,id`)
    .bind(workspaceId, ...requestIds).all<{ id: string; request_id: string; submission_id: string; decision: string; comments: string | null;
      reviewed_at: string; file_sha256: string }>() : null;
  const submissionRows = submissionQuery?.results ?? [];
  const reviewRows = reviewQuery?.results ?? [];
  const submissionsByRequest = new Map<string, typeof submissionRows>();
  for (const item of submissionRows) {
    const items = submissionsByRequest.get(item.request_id) ?? [];
    items.push(item);
    submissionsByRequest.set(item.request_id, items);
  }
  const reviewsBySubmission = new Map<string, typeof reviewRows>();
  for (const review of reviewRows) {
    const items = reviewsBySubmission.get(review.submission_id) ?? [];
    items.push(review);
    reviewsBySubmission.set(review.submission_id, items);
  }
  const requests = requestList.map(row => ({
      id: row.id, version: row.version, title: row.title, description: row.description, dueDate: row.due_date,
      assignedContact: row.contact_name, category: row.category, requiredForPlanning: row.required_for_planning === 1,
      requiredForRelease: row.required_for_release === 1, status: row.status, currentSubmissionId: row.current_submission_id,
      submissions: (submissionsByRequest.get(row.id) ?? []).map(item => ({ id: item.id, sequence: item.sequence, fileVersionId: item.file_version_id,
        originalName: item.original_name, sha256: item.sha256, submittedAt: item.submitted_at, clientComment: item.client_comment,
        supersedesSubmissionId: item.supersedes_submission_id,
        reviews: (reviewsBySubmission.get(item.id) ?? []).map(review => ({ id: review.id, decision: review.decision,
          ...(context.actor.persona !== 'CLIENT' || review.decision === 'REJECT' ? { comments: review.comments } : {}),
          reviewedAt: review.reviewed_at, fileSha256: review.file_sha256 }))
      }))
    }));
  const scopedFiles = context.actor.persona === 'CLIENT' ? [] : (await listBusinessFiles(env, workspaceId, request, 100)).items
    .filter(file => file.engagementId === engagement.id);
  const clientDocuments = context.actor.persona === 'CLIENT'
    ? await listClientDocuments(env, workspaceId, engagement.client_id, engagement.id)
    : [];
  const changeCursor = await sha256Hex(JSON.stringify({ requests: requests.map(item => [item.id,item.version]) }));
  const mode = portalMode(engagement);
  return {
    engagement: { id: engagement.id, code: engagement.code, periodStart: engagement.period_start, periodEnd: engagement.period_end,
      lifecycleState: engagement.lifecycle_state },
    mode, canUpload: context.actor.persona === 'CLIENT' && mode === 'ACTIVE',
    ...(mode === 'NOT_ACTIVE' ? { uploadBlocker: 'Uploads open after the commercial handover is complete and the advance is fully settled with its committed receipt.' } : {}),
    requests,
    ...(context.actor.persona !== 'CLIENT' ? {
      commercialDocuments: scopedFiles.filter(file => file.purpose === 'GENERATED'),
      releasedDeliverables: scopedFiles.filter(file => file.purpose === 'RELEASE')
    } : {}),
    clientDocuments,
    changeCursor
  };
}

export async function getBusinessPbcRequestPortal(
  env: Env, workspaceId: string, request: Request, engagementId: string, requestId: string
): Promise<Record<string, unknown>> {
  const portal = await getBusinessPbcPortal(env, workspaceId, request, engagementId);
  const requestRecord = (portal.requests as Array<Record<string, unknown>>).find(item => item.id === requestId);
  if (!requestRecord) throw new ApiError('NOT_FOUND', 'The PBC request was not found in this engagement scope.');
  return {
    engagement: portal.engagement,
    mode: portal.mode,
    canUpload: portal.canUpload,
    ...(portal.uploadBlocker ? { uploadBlocker: portal.uploadBlocker } : {}),
    request: requestRecord,
    changeCursor: portal.changeCursor
  };
}

async function readableBusinessFile(env: Env, workspaceId: string, request: Request, fileId: string, knownContext?: BusinessContext): Promise<BusinessFileRow> {
  const context = knownContext ?? await resolveBusinessContext(env, workspaceId, request);
  const file = await businessFileRow(env, workspaceId, fileId);
  if (!file) throw new ApiError('NOT_FOUND', 'File not found.');
  let fileContext = context;
  if (context.actor.persona !== 'CLIENT' && context.scope.clientId && context.scope.engagementId && file.client_id === context.scope.clientId && file.engagement_id) {
    const linkedPrior = await env.DB.prepare(`SELECT 1 AS found FROM continuance_reviews cr
      WHERE cr.workspace_id=? AND cr.client_id=? AND cr.engagement_id=? AND cr.prior_engagement_id=?`)
      .bind(workspaceId, context.scope.clientId, context.scope.engagementId, file.engagement_id).first<{ found: number }>();
    if (linkedPrior) fileContext = { ...context, scope: { ...context.scope, engagementId: null } };
  }
  assertBusinessFileAction(fileContext, file, 'read');
  await assertClientPbcDownloadScope(env, workspaceId, context, file);
  if (context.actor.persona === 'CLIENT' && file.purpose === 'GENERATED') {
    const issued = await env.DB.prepare(`SELECT 1 AS found WHERE EXISTS(SELECT 1 FROM generated_artifacts ga
      JOIN proposal_artifacts pa ON pa.workspace_id=ga.workspace_id AND pa.artifact_id=ga.id
      JOIN proposals p ON p.workspace_id=pa.workspace_id AND p.current_version_id=pa.proposal_version_id
      JOIN proposal_approvals a ON a.workspace_id=pa.workspace_id AND a.proposal_version_id=pa.proposal_version_id AND a.decision='APPROVE'
      WHERE ga.workspace_id=? AND ga.file_version_id=? AND p.client_id=?
        AND NOT EXISTS(SELECT 1 FROM proposal_approvals later WHERE later.workspace_id=a.workspace_id
          AND later.proposal_version_id=a.proposal_version_id AND (later.decided_at>a.decided_at OR (later.decided_at=a.decided_at AND later.id>a.id))))
      OR EXISTS(SELECT 1 FROM engagement_letters l WHERE l.workspace_id=? AND l.client_id=? AND l.file_version_id=?)
      OR EXISTS(SELECT 1 FROM invoices i WHERE i.workspace_id=? AND i.client_id=? AND i.file_version_id=? AND i.status='ISSUED')
      OR EXISTS(SELECT 1 FROM receipt_vouchers rv WHERE rv.workspace_id=? AND rv.client_id=? AND rv.file_version_id=? AND rv.status='ISSUED')
      OR EXISTS(SELECT 1 FROM holding_letters h JOIN dispatches d ON d.workspace_id=h.workspace_id AND d.id=h.dispatch_id AND d.status IN ('ACCEPTED','DELIVERED')
        JOIN generated_artifacts ga ON ga.workspace_id=h.workspace_id AND ga.id=h.artifact_id
        WHERE h.workspace_id=? AND h.client_id=? AND h.engagement_id=? AND ga.source_entity_type='HOLDING_LETTER'
          AND ga.source_entity_id=h.id AND ga.file_version_id=?)`)
      .bind(workspaceId, fileId, context.actor.clientId,
        workspaceId, context.actor.clientId, fileId,
        workspaceId, context.actor.clientId, fileId,
        workspaceId, context.actor.clientId, fileId,
        workspaceId, context.actor.clientId, file.engagement_id, fileId).first<{ found: number }>();
    if (!issued) throw new ApiError('FORBIDDEN_SCOPE', 'This generated file is not an issued client document for the selected client.');
  }
  if (context.actor.persona === 'CLIENT' && file.purpose === 'RELEASE') {
    const released = await env.DB.prepare(`SELECT 1 AS found WHERE
      EXISTS(SELECT 1 FROM deliverable_bundles b JOIN deliverable_parts dp ON dp.workspace_id=b.workspace_id AND dp.bundle_id=b.id
        WHERE b.workspace_id=? AND b.client_id=? AND b.engagement_id=? AND dp.primary_file_id=?)
      OR EXISTS(SELECT 1 FROM deliverable_bundles b JOIN deliverable_parts dp ON dp.workspace_id=b.workspace_id AND dp.bundle_id=b.id
        JOIN deliverable_attachments da ON da.workspace_id=dp.workspace_id AND da.part_id=dp.id
        WHERE b.workspace_id=? AND b.client_id=? AND b.engagement_id=? AND da.file_version_id=?)`)
      .bind(workspaceId,file.client_id,file.engagement_id,file.id,workspaceId,file.client_id,file.engagement_id,file.id).first<{ found: number }>();
    if (!released) throw new ApiError('FORBIDDEN_SCOPE', 'This release file is not a part of the client’s Partner-released bundle.');
  }
  if (file.state !== 'COMMITTED' || !file.sha256 || !file.committed_at) {
    throw new ApiError('NOT_FOUND', 'A committed file was not found in this scope.');
  }
  return file;
}

export async function getBusinessFileMetadata(
  env: Env,
  workspaceId: string,
  request: Request,
  fileId: string
): Promise<Record<string, unknown>> {
  return { file: businessFileMetadata(await readableBusinessFile(env, workspaceId, request, fileId)) };
}

export async function getBusinessFileDownload(
  env: Env,
  workspaceId: string,
  request: Request,
  fileId: string
): Promise<Response> {
  const context = await resolveBusinessContext(env, workspaceId, request);
  const file = await readableBusinessFile(env, workspaceId, request, fileId, context);
  if (file.purpose === 'ARCHIVE') {
    throw new ApiError('GATE_BLOCKED', 'Sealed archive objects can be retrieved only through the verified archive export endpoint.');
  }
  const stored = await env.FILES.get(file.object_key);
  if (!stored) throw new ApiError('INTEGRITY_MISMATCH', 'The committed file is missing from object storage.');
  const bytes = new Uint8Array(await stored.arrayBuffer());
  if (bytes.length !== file.size_bytes || await sha256Bytes(bytes) !== file.sha256) {
    throw new ApiError('INTEGRITY_MISMATCH', 'The committed file bytes failed their stored integrity check.');
  }
  verifyBusinessFileBytes(file.media_type, bytes);
  if (file.engagement_id) {
    await env.DB.prepare(`INSERT INTO operational_access_events(id,workspace_id,engagement_id,resource_type,resource_id,action,occurred_at,actor_id)
      VALUES(?,?,?,'FILE_VERSION',?,'DOWNLOAD',?,?)`)
      .bind(crypto.randomUUID(),workspaceId,file.engagement_id,file.id,new Date().toISOString(),context.actor.id).run();
  }
  const headers = new Headers({
    'Content-Type': file.media_type,
    'Content-Length': String(file.size_bytes),
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox"
  });
  return new Response(bytes, { status: 200, headers });
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
        : command.startsWith('lead.') || command === 'publicLead.triage' ? 'lead.manage'
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

function primaryContactRoleForPurpose(purpose: z.infer<typeof contactPurposeSchema>): z.infer<typeof contactRoleSchema> {
  if (['PROPOSAL', 'EL', 'FINAL_REPORT', 'HOLDING_LETTER'].includes(purpose)) return 'MD_GM';
  if (purpose === 'INVOICE' || purpose === 'RECEIPT') return 'CFO_FINANCE_DIRECTOR';
  return 'CHIEF_ACCOUNTANT_LIAISON';
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

  if (command.type === 'publicLead.triage') {
    const payload = command.payload;
    const submission = await env.DB.prepare(`SELECT id,version,status,company_name,contact_name,email_normalized,phone,
        service_interest,created_at,lead_id
      FROM public_lead_submissions WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, payload.submissionId)
      .first<{ id: string; version: number; status: string; company_name: string; contact_name: string; email_normalized: string;
        phone: string | null; service_interest: string | null; created_at: string; lead_id: string | null }>();
    if (!submission) throw new ApiError('NOT_FOUND', 'The web inquiry was not found.');
    if (submission.version !== payload.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The web inquiry changed. Reload it before triage.');
    if (!['RECEIVED', 'DUPLICATE'].includes(submission.status)) {
      throw new ApiError('INVALID_TRANSITION', 'Only an untriaged web inquiry can be accepted, marked spam, or closed as a duplicate.');
    }

    const status = payload.decision === 'ACCEPT' ? 'ACCEPTED_AS_LEAD'
      : payload.decision === 'SPAM' ? 'REJECTED_SPAM' : 'DUPLICATE';
    let leadId = payload.decision === 'DUPLICATE' ? (payload.existingLeadId ?? submission.lead_id) : null;
    let clientId: string | null = null;
    let primaryContactId: string | null = null;
    const statements: D1PreparedStatement[] = [env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,9900,CASE WHEN EXISTS(SELECT 1 FROM public_lead_submissions WHERE workspace_id=? AND id=?
        AND version=? AND status IN ('RECEIVED','DUPLICATE')) THEN 1 ELSE 0 END`)
      .bind(workspaceId, workspaceId, submission.id, payload.expectedVersion)];

    if (payload.decision === 'DUPLICATE' && leadId) {
      const linked = await env.DB.prepare(`SELECT l.id FROM leads l JOIN contacts c ON c.workspace_id=l.workspace_id
          AND c.client_id=l.client_id AND c.id=l.primary_contact_id
        WHERE l.workspace_id=? AND l.id=? AND lower(trim(c.email))=?`)
        .bind(workspaceId, leadId, submission.email_normalized).first<{ id: string }>();
      if (!linked) throw new ApiError('VALIDATION_FAILED', 'Choose an existing lead with the same contact email, or leave the link empty.');
      leadId = linked.id;
    }

    if (payload.decision === 'ACCEPT') {
      const countryCode = env.PUBLIC_LEAD_DEFAULT_COUNTRY_CODE?.trim().toUpperCase();
      if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) {
        throw new ApiError('UNAVAILABLE', 'The firm default country code is not configured for prospect creation.');
      }
      const legalNameMatches = await env.DB.prepare(`SELECT id FROM clients WHERE workspace_id=? AND active=1
        AND lower(trim(legal_name))=lower(trim(?)) ORDER BY id LIMIT 2`)
        .bind(workspaceId, submission.company_name).all<{ id: string }>();
      if ((legalNameMatches.results ?? []).length > 1) throw new ApiError('VERSION_CONFLICT', 'The company name matches more than one active client; resolve the directory duplicates first.');
      const existingClientId = legalNameMatches.results?.[0]?.id;
      if (existingClientId && context.scope.clientId && context.scope.clientId !== existingClientId) {
        throw new ApiError('FORBIDDEN_SCOPE', 'The matching client is outside the selected request scope.');
      }
      clientId = existingClientId ?? crypto.randomUUID();
      const currentContact = existingClientId ? await env.DB.prepare(`SELECT id FROM contacts WHERE workspace_id=?
        AND client_id=? AND active=1 AND lower(trim(email))=? ORDER BY is_primary DESC,id LIMIT 1`)
        .bind(workspaceId, existingClientId, submission.email_normalized).first<{ id: string }>() : null;
      primaryContactId = currentContact?.id ?? crypto.randomUUID();

      if (!existingClientId) {
        const clientCode = `WEB-${submission.id.replaceAll('-', '').slice(0, 16).toUpperCase()}`;
        statements.push(env.DB.prepare(`INSERT INTO clients(
          id,workspace_id,version,code,legal_name,trading_name,entity_type,parent_client_id,
          commercial_registration,tax_id,industry,address,country_code,active,created_at,updated_at,
          created_by_actor_id,updated_by_actor_id
        ) VALUES(?,?,1,?,?,NULL,'STANDALONE',NULL,NULL,NULL,'Not provided','Not provided',?,1,?,?,?,?)`)
          .bind(clientId, workspaceId, clientCode, submission.company_name, countryCode, now, now, actorId, actorId));
      }
      if (!currentContact) {
        const primary = !existingClientId || !(await env.DB.prepare(`SELECT id FROM contacts WHERE workspace_id=?
          AND client_id=? AND active=1 AND is_primary=1 LIMIT 1`)
          .bind(workspaceId, clientId).first<{ id: string }>());
        statements.push(env.DB.prepare(`INSERT INTO contacts(
          id,workspace_id,version,client_id,full_name,email,phone,title,role,is_primary,is_signatory,active,
          effective_from,effective_to,created_at,updated_at,created_by_actor_id,updated_by_actor_id
        ) VALUES(?,?,1,?,?,?,?, 'Prospective contact','OTHER',?,0,1,?,NULL,?,?,?,?)`)
          .bind(primaryContactId, workspaceId, clientId, submission.contact_name, submission.email_normalized,
            submission.phone, primary ? 1 : 0, now.slice(0, 10), now, now, actorId, actorId));
      }

      if (!payload.requestedService || !payload.periodStart || !payload.periodEnd) {
        throw new ApiError('VALIDATION_FAILED', 'Select the requested service and audited period before accepting this inquiry.');
      }
      leadId = crypto.randomUUID();
      statements.push(env.DB.prepare(`INSERT INTO leads(
        id,workspace_id,version,client_id,primary_contact_id,source,received_at,requested_service,period_start,period_end,
        estimated_fee_minor,status,loss_reason,converted_engagement_id,created_at,updated_at,created_by_actor_id,updated_by_actor_id
      ) VALUES(?,?,1,?,?,'WEB_FORM',?,?,?,?,?,'OPEN',NULL,NULL,?,?,?,?)`)
        .bind(leadId, workspaceId, clientId, primaryContactId, submission.created_at, payload.requestedService,
          payload.periodStart, payload.periodEnd, payload.estimatedFeeMinor === undefined ? null : Number(payload.estimatedFeeMinor),
          now, now, actorId, actorId));
    }

    statements.push(env.DB.prepare(`UPDATE public_lead_submissions SET status=?,lead_id=?,triaged_by_actor_id=?,
        version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status IN ('RECEIVED','DUPLICATE')`)
      .bind(status, leadId, actorId, now, workspaceId, submission.id, payload.expectedVersion));
    return {
      statements,
      result: { submissionId: submission.id, status, leadId, clientId },
      entityType: 'PUBLIC_LEAD_SUBMISSION', entityId: submission.id,
      beforeVersion: submission.version, afterVersion: submission.version + 1,
      auditDetails: { decision: payload.decision, leadId, clientId }
    };
  }

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
    const roleRoutes = contactRoutePurposes(payload.contact.role);
    const currentPrimaryRoutes = await env.DB.prepare(`SELECT purpose FROM contact_routes
      WHERE workspace_id=? AND client_id=? AND is_primary=1`).bind(workspaceId, payload.clientId).all<{ purpose: string }>();
    const currentPrimaryPurposes = new Set((currentPrimaryRoutes.results ?? []).map(route => route.purpose));
    // A new contact must not become an undocumented alternate by default. Purpose
    // routes already owned by another contact require an explicit contact.route command.
    const defaultRoutes = roleRoutes.filter(purpose => !currentPrimaryPurposes.has(purpose));
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
        ) SELECT ?,?,1,?,?,?,1,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM contact_routes WHERE workspace_id=? AND client_id=? AND purpose=? AND is_primary=1)`)
          .bind(routeIds[index], workspaceId, payload.clientId, purpose, contactId,
            now, now, actorId, actorId, workspaceId, payload.clientId, purpose))
      ],
      result: { contactId, clientId: payload.clientId, version: 1, routePurposes: defaultRoutes },
      entityType: 'CONTACT', entityId: contactId, beforeVersion: null, afterVersion: 1
    };
  }

  if (command.type === 'contact.update') {
    const payload = command.payload;
    const before = await env.DB.prepare(`SELECT version,client_id,email,phone,is_primary,active,role FROM contacts
      WHERE workspace_id=? AND id=? AND active=1`).bind(workspaceId, payload.contactId)
      .first<{ version: number; client_id: string; email: string | null; phone: string | null; is_primary: number; active: number; role: z.infer<typeof contactRoleSchema> }>();
    if (!before) throw new ApiError('NOT_FOUND', 'Active client contact not found.');
    requireClientScope(context, before.client_id);
    if (before.version !== payload.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The contact changed. Reload it before editing.');
    const nextEmail = payload.email === undefined ? before.email : payload.email;
    const nextPhone = payload.phone === undefined ? before.phone : payload.phone;
    const nextActive = payload.active ?? Boolean(before.active);
    const nextPrimary = payload.active === false ? false : payload.isPrimary ?? Boolean(before.is_primary);
    const changePrimary = Object.hasOwn(payload, 'isPrimary') || payload.active === false;
    const nextRole = payload.role ?? before.role;
    if (nextActive && !nextEmail && !nextPhone) throw new ApiError('VALIDATION_FAILED', 'An active contact must keep an email address or phone number.');
    if (nextPrimary && !nextActive) throw new ApiError('VALIDATION_FAILED', 'An inactive contact cannot be the primary contact.');
    const primaryRoutes = await env.DB.prepare(`SELECT purpose FROM contact_routes
      WHERE workspace_id=? AND client_id=? AND contact_id=? AND is_primary=1`)
      .bind(workspaceId, before.client_id, payload.contactId).all<{ purpose: z.infer<typeof contactPurposeSchema> }>();
    const allowedPrimaryPurposes = contactRoutePurposes(nextRole);
    const incompatiblePrimaryRoutes = (primaryRoutes.results ?? []).filter(route => !allowedPrimaryPurposes.includes(route.purpose));
    if (incompatiblePrimaryRoutes.length) {
      throw new ApiError('GATE_BLOCKED', `Move these primary routes to role-matched contacts before changing this contact's role: ${incompatiblePrimaryRoutes.map(route => route.purpose).join(', ')}.`);
    }
    const routeRoleGuard = allowedPrimaryPurposes.length
      ? `AND NOT EXISTS(SELECT 1 FROM contact_routes WHERE workspace_id=? AND client_id=? AND contact_id=? AND is_primary=1 AND purpose NOT IN (${allowedPrimaryPurposes.map(() => '?').join(',')}))`
      : `AND NOT EXISTS(SELECT 1 FROM contact_routes WHERE workspace_id=? AND client_id=? AND contact_id=? AND is_primary=1)`;
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,24,CASE WHEN EXISTS(SELECT 1 FROM contacts WHERE workspace_id=? AND id=? AND version=? AND active=1)
          ${routeRoleGuard}
        THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.contactId, payload.expectedVersion,
          workspaceId, before.client_id, payload.contactId, ...allowedPrimaryPurposes),
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
    const contact = await env.DB.prepare(`SELECT id,role FROM contacts WHERE workspace_id=? AND client_id=? AND id=? AND active=1`)
      .bind(workspaceId, payload.clientId, payload.contactId).first<{ id: string; role: z.infer<typeof contactRoleSchema> }>();
    if (!contact) throw new ApiError('VALIDATION_FAILED', 'Routing requires an active contact on the same client.');
    const expectedPrimaryRole = primaryContactRoleForPurpose(payload.purpose);
    if (payload.isPrimary && contact.role !== expectedPrimaryRole) {
      throw new ApiError('GATE_BLOCKED', `The primary ${payload.purpose} route must use a contact recorded as ${expectedPrimaryRole.replaceAll('_', ' ')}. Add this contact as a documented alternate if the business combines roles.`);
    }
    const existing = await env.DB.prepare(`SELECT id,version FROM contact_routes
      WHERE workspace_id=? AND client_id=? AND purpose=? AND contact_id=?`)
      .bind(workspaceId, payload.clientId, payload.purpose, payload.contactId).first<{ id: string; version: number }>();
    if ((existing?.version ?? null) !== payload.expectedVersion) {
      throw new ApiError('VERSION_CONFLICT', 'The contact route changed. Refresh routing and retry.');
    }
    const replacedPrimary = payload.isPrimary
      ? await env.DB.prepare(`SELECT id,version,contact_id FROM contact_routes WHERE workspace_id=? AND client_id=? AND purpose=? AND is_primary=1 AND contact_id<>?`)
        .bind(workspaceId, payload.clientId, payload.purpose, payload.contactId).first<{ id: string; version: number; contact_id: string }>()
      : null;
    if (payload.isPrimary && replacedPrimary && !payload.rationale) {
      throw new ApiError('VALIDATION_FAILED', 'Document why the current primary recipient will remain as an alternate.');
    }
    if (payload.isPrimary && !replacedPrimary && payload.rationale) {
      throw new ApiError('VALIDATION_FAILED', 'A rationale is only needed when another primary recipient will become an alternate.');
    }
    const routeId = existing?.id ?? crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,25,CASE WHEN EXISTS(SELECT 1 FROM contacts WHERE workspace_id=? AND client_id=? AND id=? AND active=1)
          AND ((? IS NULL AND NOT EXISTS(SELECT 1 FROM contact_routes WHERE workspace_id=? AND client_id=? AND purpose=? AND contact_id=?))
            OR (? IS NOT NULL AND EXISTS(SELECT 1 FROM contact_routes WHERE workspace_id=? AND client_id=? AND purpose=? AND contact_id=? AND version=?)))
          AND (?=0 OR ((? IS NOT NULL AND EXISTS(SELECT 1 FROM contact_routes WHERE workspace_id=? AND id=? AND version=? AND is_primary=1 AND client_id=? AND purpose=?))
            OR (? IS NULL AND NOT EXISTS(SELECT 1 FROM contact_routes WHERE workspace_id=? AND client_id=? AND purpose=? AND is_primary=1 AND contact_id<>?))))
          AND (?=0 OR (SELECT COUNT(*) FROM contact_routes WHERE workspace_id=? AND client_id=? AND purpose=? AND is_primary=1 AND contact_id<>?)=?)
          AND (?=0 OR EXISTS(SELECT 1 FROM contacts WHERE workspace_id=? AND client_id=? AND id=? AND active=1 AND role=?))
        THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, payload.clientId, payload.contactId,
        payload.expectedVersion, workspaceId, payload.clientId, payload.purpose, payload.contactId,
        payload.expectedVersion, workspaceId, payload.clientId, payload.purpose, payload.contactId, payload.expectedVersion ?? 0,
        payload.isPrimary ? 1 : 0, replacedPrimary?.id ?? null, workspaceId, replacedPrimary?.id ?? '', replacedPrimary?.version ?? 0, payload.clientId, payload.purpose,
        replacedPrimary?.id ?? null, workspaceId, payload.clientId, payload.purpose, payload.contactId,
        payload.isPrimary ? 1 : 0, workspaceId, payload.clientId, payload.purpose, payload.contactId, replacedPrimary ? 1 : 0,
        payload.isPrimary ? 1 : 0, workspaceId, payload.clientId, payload.contactId, expectedPrimaryRole),
      ...(replacedPrimary ? [env.DB.prepare(`UPDATE contact_routes SET is_primary=0,rationale=?,version=version+1,updated_at=?,updated_by_actor_id=?
        WHERE workspace_id=? AND id=? AND version=? AND is_primary=1`)
        .bind(payload.rationale, now, actorId, workspaceId, replacedPrimary.id, replacedPrimary.version)] : []),
      payload.expectedVersion === null
        ? env.DB.prepare(`INSERT INTO contact_routes(
            id,workspace_id,version,client_id,purpose,contact_id,is_primary,rationale,created_at,updated_at,created_by_actor_id,updated_by_actor_id
          ) VALUES(?,?,1,?,?,?,?,?,?,?,?,?)`).bind(routeId, workspaceId, payload.clientId, payload.purpose,
            payload.contactId, payload.isPrimary ? 1 : 0, payload.isPrimary ? null : payload.rationale ?? null, now, now, actorId, actorId)
        : env.DB.prepare(`UPDATE contact_routes SET is_primary=?,rationale=?,version=version+1,updated_at=?,updated_by_actor_id=?
            WHERE workspace_id=? AND id=? AND version=?`).bind(payload.isPrimary ? 1 : 0, payload.isPrimary ? null : payload.rationale ?? null, now, actorId,
            workspaceId, routeId, payload.expectedVersion)
    ];
    return {
      statements,
      result: { contactRouteId: routeId, clientId: payload.clientId, contactId: payload.contactId, purpose: payload.purpose, isPrimary: payload.isPrimary, rationale: payload.isPrimary ? null : payload.rationale ?? null, version: (payload.expectedVersion ?? 0) + 1 },
      entityType: 'CONTACT_ROUTE', entityId: routeId, beforeVersion: payload.expectedVersion, afterVersion: (payload.expectedVersion ?? 0) + 1,
      auditDetails: { purpose: payload.purpose, isPrimary: payload.isPrimary, rationale: payload.isPrimary ? null : payload.rationale ?? null, alternateRouteId: payload.isPrimary ? replacedPrimary?.id ?? null : routeId }
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
        sp.effective_period_start,sp.effective_period_end,sp.presentation_edition,sp.reporting_framework,sp.early_adoption
      FROM leads l JOIN clients c ON c.workspace_id=l.workspace_id AND c.id=l.client_id
      JOIN contacts ct ON ct.workspace_id=l.workspace_id AND ct.client_id=l.client_id AND ct.id=l.primary_contact_id
      JOIN standards_profiles sp ON sp.workspace_id=l.workspace_id AND sp.id=?
      WHERE l.workspace_id=? AND l.id=?`).bind(payload.standardsProfileId, workspaceId, payload.leadId)
      .first<{ version: number; client_id: string; primary_contact_id: string; requested_service: string; period_start: string; period_end: string; estimated_fee_minor: number | null; status: string; client_active: number; contact_active: number; effective_period_start: string; effective_period_end: string | null; presentation_edition: 'IAS1' | 'IFRS18' | 'OTHER_APPROVED'; reporting_framework: string; early_adoption: number }>();
    if (!lead) throw new ApiError('NOT_FOUND', 'Lead, active client/contact or standards profile not found.');
    requireClientScope(context, lead.client_id);
    if (lead.version !== payload.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The lead changed. Reload it before conversion.');
    if (!['OPEN', 'QUALIFIED'].includes(lead.status)) throw new ApiError('INVALID_TRANSITION', 'Only an open or qualified lead can be converted.');
    if (lead.client_active !== 1 || lead.contact_active !== 1) throw new ApiError('GATE_BLOCKED', 'Conversion requires an active client and primary contact.');
    if (lead.period_start < lead.effective_period_start || (lead.effective_period_end && lead.period_end > lead.effective_period_end)) {
      throw new ApiError('VALIDATION_FAILED', 'The selected standards profile does not cover the requested reporting period.');
    }
    const presentationBlocker = presentationEditionBlocker({ reportingFramework: lead.reporting_framework,
      presentationEdition: lead.presentation_edition, earlyAdoption: lead.early_adoption === 1, periodStart: lead.period_start });
    if (presentationBlocker) throw new ApiError('GATE_BLOCKED', presentationBlocker);
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

/** Versioned firm content, proposal revisions and approval/dispatch commands. */
async function buildBusinessProposalMutation(
  env: Env,
  workspaceId: string,
  context: BusinessContext,
  command: BusinessProposalCommand,
  commandId: string,
  now: string
): Promise<BusinessMutation> {
  const actorId = context.actor.id;
  const isPartnerApprover = context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER';
  const requirePartner = () => {
    if (!isPartnerApprover) throw new ApiError('PERSONA_ACTION_DENIED', 'Only an APPROVER with PARTNER grade can maintain firm content, approve CVs, approve or dispatch proposals.');
  };
  const requireProposalAction = (action: 'proposal.create' | 'proposal.generate' | 'proposal.approve' | 'proposal.dispatch') => {
    if (!context.allowedActions.includes(action)) throw new ApiError('PERSONA_ACTION_DENIED', 'This actor profile cannot perform the requested proposal action.');
  };

  if (command.type === 'firm-profile.save') {
    requirePartner();
    const input = command.payload;
    const current = await env.DB.prepare(`SELECT id,version FROM firm_profiles WHERE workspace_id=?`).bind(workspaceId)
      .first<{ id: string; version: number }>();
    if (input.expectedVersion === null ? Boolean(current) : !current || current.version !== input.expectedVersion) {
      throw new ApiError('VERSION_CONFLICT', 'The firm profile changed. Reload it before saving.');
    }
    if (input.logoFileId) {
      const logo = await env.DB.prepare(`SELECT id FROM file_versions WHERE workspace_id=? AND id=? AND state='COMMITTED'
          AND immutable=1 AND purpose='TEMPLATE' AND media_type IN ('image/png','image/jpeg')`)
        .bind(workspaceId, input.logoFileId).first<{ id: string }>();
      if (!logo) throw new ApiError('GATE_BLOCKED', 'Choose a committed PNG or JPEG firm logo from Stored files.');
    }
    const allEvidenceIds = [...input.credentialFileVersionIds, ...input.portfolioFileVersionIds];
    if (new Set(allEvidenceIds).size !== allEvidenceIds.length) throw new ApiError('VALIDATION_FAILED', 'Use separate files for credential and portfolio evidence.');
    if (allEvidenceIds.length) {
      const placeholders = allEvidenceIds.map(() => '?').join(',');
      const evidence = await env.DB.prepare(`SELECT id FROM file_versions WHERE workspace_id=? AND id IN (${placeholders})
          AND state='COMMITTED' AND immutable=1 AND purpose='TEMPLATE'
          AND media_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')`)
        .bind(workspaceId, ...allEvidenceIds).all<{ id: string }>();
      if ((evidence.results ?? []).length !== allEvidenceIds.length) {
        throw new ApiError('GATE_BLOCKED', 'Credential and portfolio evidence must use distinct committed, immutable PDF or DOCX firm files.');
      }
    }
    const profileId = current?.id ?? crypto.randomUUID();
    const nextVersion = current ? current.version + 1 : 1;
    const statements = [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,73,CASE WHEN (((? IS NULL AND NOT EXISTS(SELECT 1 FROM firm_profiles WHERE workspace_id=?))
          OR EXISTS(SELECT 1 FROM firm_profiles WHERE workspace_id=? AND version=?))
          AND NOT EXISTS(SELECT 1 FROM (SELECT value AS file_id FROM json_each(?) UNION SELECT value FROM json_each(?)) selected
            LEFT JOIN file_versions f ON f.workspace_id=? AND f.id=selected.file_id
            WHERE f.id IS NULL OR f.state<>'COMMITTED' OR f.immutable<>1 OR f.purpose<>'TEMPLATE'
              OR f.media_type NOT IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'))) THEN 1 ELSE 0 END`)
        .bind(workspaceId, input.expectedVersion, workspaceId, workspaceId, input.expectedVersion,
          JSON.stringify(input.credentialFileVersionIds), JSON.stringify(input.portfolioFileVersionIds), workspaceId),
      current
      ? env.DB.prepare(`UPDATE firm_profiles SET version=version+1,legal_name=?,registration_number=?,address=?,profile_text=?,methodology_text=?,credentials_text=?,industry_portfolio_text=?,credential_file_ids_json=?,portfolio_file_ids_json=?,logo_file_id=?,updated_at=?,updated_by_actor_id=?
            WHERE workspace_id=? AND id=? AND version=?`).bind(input.legalName, input.registrationNumber, input.address,
          input.profileText, input.methodologyText, input.credentialsText, input.industryPortfolioText,
          JSON.stringify(input.credentialFileVersionIds), JSON.stringify(input.portfolioFileVersionIds), input.logoFileId ?? null, now, actorId, workspaceId, profileId, current.version)
        : env.DB.prepare(`INSERT INTO firm_profiles(id,workspace_id,version,legal_name,registration_number,address,profile_text,methodology_text,credentials_text,industry_portfolio_text,credential_file_ids_json,portfolio_file_ids_json,logo_file_id,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
            VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(profileId, workspaceId, input.legalName, input.registrationNumber,
          input.address, input.profileText, input.methodologyText, input.credentialsText, input.industryPortfolioText,
          JSON.stringify(input.credentialFileVersionIds), JSON.stringify(input.portfolioFileVersionIds), input.logoFileId ?? null, now, now, actorId, actorId)
    ];
    return {
      statements, result: { firmProfileId: profileId, version: nextVersion },
      entityType: 'FIRM_PROFILE', entityId: profileId, beforeVersion: current?.version ?? null, afterVersion: nextVersion
    };
  }

  if (command.type === 'team-cv.attach') {
    requirePartner();
    const { staffMemberId, fileVersionId } = command.payload;
    const file = await env.DB.prepare(`SELECT id FROM file_versions WHERE workspace_id=? AND id=? AND state='COMMITTED'
        AND immutable=1 AND purpose='TEMPLATE' AND media_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')`)
      .bind(workspaceId, fileVersionId).first<{ id: string }>();
    if (!file) throw new ApiError('GATE_BLOCKED', 'Attach a committed PDF or DOCX stored as a firm template.');
    const staff = await env.DB.prepare(`SELECT id FROM staff_members WHERE workspace_id=? AND id=? AND active=1`)
      .bind(workspaceId, staffMemberId).first<{ id: string }>();
    if (!staff) throw new ApiError('NOT_FOUND', 'The active staff member was not found in this workspace.');
    const duplicate = await env.DB.prepare(`SELECT id FROM team_cv_documents WHERE workspace_id=? AND staff_member_id=? AND file_version_id=?`)
      .bind(workspaceId, staffMemberId, fileVersionId).first<{ id: string }>();
    if (duplicate) throw new ApiError('VERSION_CONFLICT', 'This CV file is already attached to that staff member.');
    const teamCvId = crypto.randomUUID();
    return {
      statements: [env.DB.prepare(`INSERT INTO team_cv_documents(
        id,workspace_id,version,staff_member_id,file_version_id,approved,approved_by_actor_id,approved_at,created_at,updated_at,created_by_actor_id
      ) VALUES(?,?,1,?,?,0,NULL,NULL,?,?,?)`).bind(teamCvId, workspaceId, staffMemberId, fileVersionId, now, now, actorId)],
      result: { teamCvId, version: 1, status: 'PENDING_APPROVAL' }, entityType: 'TEAM_CV', entityId: teamCvId, beforeVersion: null, afterVersion: 1
    };
  }

  if (command.type === 'team-cv.approve') {
    requirePartner();
    const { teamCvId, expectedVersion, rationale } = command.payload;
    const cv = await env.DB.prepare(`SELECT cv.version,cv.staff_member_id,cv.file_version_id,cv.approved,f.sha256
        FROM team_cv_documents cv JOIN file_versions f ON f.workspace_id=cv.workspace_id AND f.id=cv.file_version_id
        WHERE cv.workspace_id=? AND cv.id=?`).bind(workspaceId, teamCvId)
      .first<{ version: number; staff_member_id: string; file_version_id: string; approved: number; sha256: string | null }>();
    if (!cv) throw new ApiError('NOT_FOUND', 'The team CV record was not found.');
    if (cv.version !== expectedVersion || cv.approved === 1) throw new ApiError('VERSION_CONFLICT', 'The CV changed or is already approved.');
    const approvalId = crypto.randomUUID();
    const linkId = crypto.randomUUID();
    const actorSnapshot = JSON.stringify({ actorId, persona: context.actor.persona, displayName: context.actor.displayName, staffGrade: context.actor.staffGrade });
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,74,CASE WHEN EXISTS(SELECT 1 FROM team_cv_documents cv JOIN file_versions f ON f.workspace_id=cv.workspace_id AND f.id=cv.file_version_id
            WHERE cv.workspace_id=? AND cv.id=? AND cv.version=? AND cv.approved=0 AND f.state='COMMITTED' AND f.immutable=1)
          THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, teamCvId, expectedVersion),
        env.DB.prepare(`INSERT INTO approval_decisions(id,workspace_id,client_id,engagement_id,version,subject_type,subject_id,subject_version,decision,rationale,actor_snapshot_json,decided_at,supersedes_decision_id)
          VALUES(?,?,NULL,NULL,1,'TEAM_CV',?,?, 'APPROVE',?,?,?,NULL)`)
          .bind(approvalId, workspaceId, teamCvId, expectedVersion, rationale, actorSnapshot, now),
        env.DB.prepare(`UPDATE team_cv_documents SET version=version+1,approved=1,approved_by_actor_id=?,approved_at=?,updated_at=?
          WHERE workspace_id=? AND id=? AND version=? AND approved=0`).bind(actorId, now, now, workspaceId, teamCvId, expectedVersion)
      ],
      result: { teamCvId, approvalId, version: expectedVersion + 1, status: 'APPROVED' },
      entityType: 'TEAM_CV', entityId: teamCvId, beforeVersion: expectedVersion, afterVersion: expectedVersion + 1,
      auditDetails: { fileVersionId: cv.file_version_id, contentSha256: cv.sha256, approvalId }
    };
  }

  if (command.type === 'proposal.create' || command.type === 'proposal.revise') {
    requireProposalAction('proposal.create');
    const input = command.payload;
    const engagement = await env.DB.prepare(`SELECT e.id,e.version,e.client_id,e.lifecycle_state,e.period_start,e.period_end,e.contract_fee_minor,
        c.legal_name,c.trading_name,c.commercial_registration,c.address,c.active AS client_active
      FROM engagements e JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id
      WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId, input.engagementId)
      .first<{ id: string; version: number; client_id: string; lifecycle_state: string; period_start: string; period_end: string; contract_fee_minor: number; legal_name: string; trading_name: string | null; commercial_registration: string | null; address: string; client_active: number }>();
    if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement was not found.');
    requireClientScope(context, engagement.client_id);
    if (context.scope.engagementId && context.scope.engagementId !== engagement.id) throw new ApiError('FORBIDDEN_SCOPE', 'The engagement does not match the selected request context.');
    if (engagement.lifecycle_state !== 'PROPOSAL_GENERATION' || engagement.client_active !== 1) throw new ApiError('GATE_BLOCKED', 'Proposals can be drafted only for an active engagement in PROPOSAL_GENERATION.');
    const firm = await env.DB.prepare(`SELECT id,version,legal_name,registration_number,address,profile_text,methodology_text,credentials_text,industry_portfolio_text,credential_file_ids_json,portfolio_file_ids_json,logo_file_id
      FROM firm_profiles WHERE workspace_id=?`).bind(workspaceId)
      .first<{ id: string; version: number; legal_name: string; registration_number: string; address: string; profile_text: string; methodology_text: string; credentials_text: string; industry_portfolio_text: string; credential_file_ids_json: string; portfolio_file_ids_json: string; logo_file_id: string | null }>();
    if (!firm) throw new ApiError('GATE_BLOCKED', 'Complete the Partner-approved legal firm profile, registration and methodology before drafting a proposal.');
    const currentPartner = await env.DB.prepare(`SELECT ap.staff_member_id FROM actor_profiles ap
      JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
      WHERE ap.workspace_id=? AND ap.persona='APPROVER' AND ap.active=1 AND sm.active=1 AND sm.grade='PARTNER'
      ORDER BY ap.created_at,ap.id LIMIT 1`).bind(workspaceId).first<{ staff_member_id: string }>();
    const teamCvs = await env.DB.prepare(`SELECT cv.id,cv.staff_member_id,cv.file_version_id,cv.approved_at,cv.created_at,sm.display_name,sm.grade,f.original_name,f.sha256
      FROM team_cv_documents cv JOIN staff_members sm ON sm.workspace_id=cv.workspace_id AND sm.id=cv.staff_member_id
      JOIN file_versions f ON f.workspace_id=cv.workspace_id AND f.id=cv.file_version_id
      WHERE cv.workspace_id=? AND cv.approved=1 AND sm.active=1 AND f.state='COMMITTED' AND f.immutable=1
      ORDER BY CASE WHEN sm.grade='PARTNER' THEN 0 ELSE 1 END,sm.id,cv.approved_at DESC,cv.created_at DESC,cv.id DESC`).bind(workspaceId)
      .all<{ id: string; staff_member_id: string; file_version_id: string; approved_at: string; created_at: string; display_name: string; grade: string; original_name: string; sha256: string }>();
    const approvedCvs: NonNullable<typeof teamCvs.results> = [];
    for (const cv of teamCvs.results ?? []) if (!approvedCvs.some(current => current.staff_member_id === cv.staff_member_id)) approvedCvs.push(cv);
    const selectedCvs = input.selectedTeamCvIds.map(id => approvedCvs.find(cv => cv.id === id)).filter((cv): cv is NonNullable<typeof cv> => Boolean(cv));
    if (input.mode === 'FULL_PROPOSAL' && (selectedCvs.length !== input.selectedTeamCvIds.length || !currentPartner
      || !selectedCvs.some(cv => cv.staff_member_id === currentPartner.staff_member_id && cv.grade === 'PARTNER'))) {
      throw new ApiError('GATE_BLOCKED', 'A full proposal must explicitly select current, approved CVs for its proposed team, including the active assigned Partner. No biography will be invented.');
    }
    const parseFirmEvidenceIds = (json: string, label: string): string[] => {
      let parsed: unknown;
      try { parsed = JSON.parse(json); } catch { throw new ApiError('GATE_BLOCKED', `The selected ${label} evidence snapshot is invalid. Update Partner firm content before drafting.`); }
      if (!Array.isArray(parsed) || parsed.length > 20 || parsed.some(id => typeof id !== 'string' || !clientIdSchema.safeParse(id).success)
        || new Set(parsed).size !== parsed.length) throw new ApiError('GATE_BLOCKED', `The selected ${label} evidence snapshot is invalid. Update Partner firm content before drafting.`);
      return parsed as string[];
    };
    const credentialEvidenceIds = parseFirmEvidenceIds(firm.credential_file_ids_json, 'credential');
    const portfolioEvidenceIds = parseFirmEvidenceIds(firm.portfolio_file_ids_json, 'industry portfolio');
    if (input.mode === 'FULL_PROPOSAL' && (firm.credentials_text.trim().length < 10 || firm.industry_portfolio_text.trim().length < 10)) {
      throw new ApiError('GATE_BLOCKED', 'A comprehensive proposal requires Partner-maintained firm credentials and relevant industry portfolio content. Add only verified firm information; no credentials or client history will be invented.');
    }
    if (input.mode === 'FULL_PROPOSAL' && (!credentialEvidenceIds.length || !portfolioEvidenceIds.length)) {
      throw new ApiError('GATE_BLOCKED', 'A comprehensive proposal requires at least one selected firm credential evidence file and one relevant portfolio evidence file.');
    }
    const selectedEvidenceIds = input.mode === 'FULL_PROPOSAL' ? [...credentialEvidenceIds, ...portfolioEvidenceIds] : [];
    if (new Set(selectedEvidenceIds).size !== selectedEvidenceIds.length) throw new ApiError('GATE_BLOCKED', 'Credential and portfolio selections must use separate evidence files.');
    if (selectedEvidenceIds.some(id => selectedCvs.some(cv => cv.file_version_id === id))) {
      throw new ApiError('GATE_BLOCKED', 'A team CV cannot also serve as credential or industry portfolio evidence. Select a separate supporting file.');
    }
    if (selectedEvidenceIds.length) {
      const placeholders = selectedEvidenceIds.map(() => '?').join(',');
      const evidence = await env.DB.prepare(`SELECT id FROM file_versions WHERE workspace_id=? AND id IN (${placeholders})
          AND state='COMMITTED' AND immutable=1 AND purpose='TEMPLATE'
          AND media_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')`)
        .bind(workspaceId, ...selectedEvidenceIds).all<{ id: string }>();
      if ((evidence.results ?? []).length !== selectedEvidenceIds.length) throw new ApiError('GATE_BLOCKED', 'A selected firm credential or portfolio evidence file is no longer a committed, immutable PDF or DOCX.');
    }

    let proposalId: string;
    let previousProposalVersion: number | null = null;
    let revision = 1;
    if (command.type === 'proposal.create') {
      if (engagement.version !== command.payload.expectedEngagementVersion) throw new ApiError('VERSION_CONFLICT', 'The engagement changed. Reload it before drafting.');
      const existing = await env.DB.prepare(`SELECT id FROM proposals WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId, engagement.id).first<{ id: string }>();
      if (existing) throw new ApiError('VERSION_CONFLICT', 'This engagement already has a proposal. Create a new revision of that proposal.');
      proposalId = crypto.randomUUID();
    } else {
      const existing = await env.DB.prepare(`SELECT id,version,current_version_id FROM proposals WHERE workspace_id=? AND id=? AND engagement_id=?`)
        .bind(workspaceId, command.payload.proposalId, engagement.id).first<{ id: string; version: number; current_version_id: string | null }>();
      if (!existing) throw new ApiError('NOT_FOUND', 'The proposal was not found for this engagement.');
      if (existing.version !== command.payload.expectedVersion) throw new ApiError('VERSION_CONFLICT', 'The proposal changed. Reload it before revising.');
      proposalId = existing.id;
      previousProposalVersion = existing.version;
      const latest = await env.DB.prepare(`SELECT COALESCE(MAX(revision),0) AS revision FROM proposal_versions WHERE workspace_id=? AND proposal_id=?`)
        .bind(workspaceId, proposalId).first<{ revision: number }>();
      revision = (latest?.revision ?? 0) + 1;
    }

    const proposalVersionId = crypto.randomUUID();
    const methodologyVersion = await sha256Hex(firm.methodology_text);
    const firmSnapshot = JSON.stringify({
      legalName: firm.legal_name, registrationNumber: firm.registration_number, address: firm.address,
      profileText: firm.profile_text, methodologyText: firm.methodology_text,
      credentialsText: firm.credentials_text, industryPortfolioText: firm.industry_portfolio_text, logoFileId: firm.logo_file_id,
      version: firm.version, methodologyVersion
    });
    if (firmSnapshot.length > 30000) throw new ApiError('VALIDATION_FAILED', 'The approved firm profile is too large to pin safely. Shorten the firm profile, credentials, portfolio or methodology and retry.');
    const cvSnapshot = (input.mode === 'FULL_PROPOSAL' ? selectedCvs : []).map(cv => ({
      teamCvId: cv.id, staffMemberId: cv.staff_member_id, displayName: cv.display_name, grade: cv.grade,
      fileVersionId: cv.file_version_id, originalName: cv.original_name, sha256: cv.sha256
    }));
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,75,CASE WHEN EXISTS(SELECT 1 FROM engagements e JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id
          JOIN firm_profiles fp ON fp.workspace_id=e.workspace_id AND fp.version=?
          WHERE e.workspace_id=? AND e.id=? AND e.lifecycle_state='PROPOSAL_GENERATION' AND c.active=1
            AND (? IS NULL OR e.version=?))
          AND ((? IS NULL AND NOT EXISTS(SELECT 1 FROM proposals WHERE workspace_id=? AND engagement_id=?))
            OR EXISTS(SELECT 1 FROM proposals WHERE workspace_id=? AND id=? AND version=?))
        THEN 1 ELSE 0 END`).bind(workspaceId, firm.version, workspaceId, engagement.id,
        command.type === 'proposal.create' ? command.payload.expectedEngagementVersion : null,
        command.type === 'proposal.create' ? command.payload.expectedEngagementVersion : null,
        command.type === 'proposal.create' ? null : command.payload.proposalId,
        workspaceId, engagement.id, workspaceId,
        command.type === 'proposal.revise' ? command.payload.proposalId : '',
        command.type === 'proposal.revise' ? command.payload.expectedVersion : -1),
      ...(command.type === 'proposal.create' ? [env.DB.prepare(`INSERT INTO proposals(
        id,workspace_id,version,client_id,engagement_id,current_version_id,created_at,updated_at,created_by_actor_id,updated_by_actor_id
      ) VALUES(?,?,1,?,?,NULL,?,?,?,?)`).bind(proposalId, workspaceId, engagement.client_id, engagement.id, now, now, actorId, actorId)] : []),
      env.DB.prepare(`INSERT INTO proposal_versions(
      id,workspace_id,version,client_id,engagement_id,proposal_id,revision,mode,scope,fee_minor,currency,advance_bps,final_bps,
        valid_until,timeline_json,firm_profile_snapshot_json,team_cv_file_ids_json,firm_credential_file_ids_json,firm_portfolio_file_ids_json,methodology_version,firm_profile_version,created_at,created_by_actor_id
      ) VALUES(?,?,1,?,?,?,?,?,?,?,'QAR',5000,5000,?,?,?,?,?,?,?,?,?,?)`).bind(
        proposalVersionId, workspaceId, engagement.client_id, engagement.id, proposalId, revision, input.mode,
        input.scope, Number(input.feeMinor), input.validUntil, JSON.stringify(input.timeline), firmSnapshot,
        JSON.stringify(cvSnapshot.map(cv => cv.fileVersionId)), JSON.stringify(selectedEvidenceIds.length ? credentialEvidenceIds : []),
        JSON.stringify(selectedEvidenceIds.length ? portfolioEvidenceIds : []), methodologyVersion, firm.version, now, actorId
      ),
      command.type === 'proposal.create'
        ? env.DB.prepare(`UPDATE proposals SET current_version_id=?,updated_at=?,updated_by_actor_id=? WHERE workspace_id=? AND id=? AND version=1`)
          .bind(proposalVersionId, now, actorId, workspaceId, proposalId)
        : env.DB.prepare(`UPDATE proposals SET current_version_id=?,version=version+1,updated_at=?,updated_by_actor_id=?
            WHERE workspace_id=? AND id=? AND version=?`)
          .bind(proposalVersionId, now, actorId, workspaceId, proposalId, previousProposalVersion)
    ];
    return {
      statements,
      result: { proposalId, proposalVersionId, revision, mode: input.mode, feeMinor: input.feeMinor, currency: 'QAR', advanceMinor: String(Math.floor(Number(input.feeMinor) / 2) + (Number(input.feeMinor) % 2)), finalMinor: String(Math.floor(Number(input.feeMinor) / 2)) },
      entityType: 'PROPOSAL_VERSION', entityId: proposalVersionId, beforeVersion: null, afterVersion: 1,
      auditDetails: { proposalId, proposalVersionId, revision, firmProfileVersion: firm.version, methodologyVersion, teamCvFileVersionIds: cvSnapshot.map(cv => cv.fileVersionId) }
    };
  }

  if (command.type === 'proposal.generate') {
    requireProposalAction('proposal.generate');
    const { proposalVersionId, expectedVersion } = command.payload;
    const version = await env.DB.prepare(`SELECT pv.id,pv.version,pv.proposal_id,pv.client_id,pv.engagement_id,pv.revision,pv.mode,p.current_version_id,e.lifecycle_state
      FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
      JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.client_id=pv.client_id AND e.id=pv.engagement_id
      WHERE pv.workspace_id=? AND pv.id=?`).bind(workspaceId, proposalVersionId)
      .first<{ id: string; version: number; proposal_id: string; client_id: string; engagement_id: string; revision: number; mode: string; current_version_id: string; lifecycle_state: string }>();
    if (!version) throw new ApiError('NOT_FOUND', 'The proposal revision was not found.');
    requireClientScope(context, version.client_id);
    if (context.scope.engagementId && context.scope.engagementId !== version.engagement_id) throw new ApiError('FORBIDDEN_SCOPE', 'The proposal is outside the selected engagement.');
    if (version.version !== expectedVersion || version.current_version_id !== version.id) throw new ApiError('STALE_APPROVAL', 'Only the current proposal revision can be generated.');
    if (version.lifecycle_state !== 'PROPOSAL_GENERATION') throw new ApiError('INVALID_TRANSITION', 'The engagement is no longer accepting proposal documents.');
    const jobId = crypto.randomUUID();
    const deduplicationKey = `proposal-document:${proposalVersionId}`;
    const prior = await env.DB.prepare(`SELECT id,status,result_json FROM outbox_jobs WHERE workspace_id=? AND deduplication_key=?`)
      .bind(workspaceId, deduplicationKey).first<{ id: string; status: string; result_json: string | null }>();
    if (prior) return {
      statements: [], result: { jobId: prior.id, status: prior.status, ...(prior.result_json ? { result: JSON.parse(prior.result_json) } : {}) },
      entityType: 'PROPOSAL_VERSION', entityId: version.id, beforeVersion: null, afterVersion: 1
    };
    return {
      statements: [env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
        VALUES(?,?,1,'GENERATE_DOCUMENT',?,?,? ,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
        .bind(jobId, workspaceId, version.id, version.revision,
          JSON.stringify({ proposalVersionId: version.id, proposalId: version.proposal_id, engagementId: version.engagement_id, clientId: version.client_id, mode: version.mode, commandId }),
          deduplicationKey, now, now, now)],
      result: { jobId, status: 'PENDING' }, entityType: 'PROPOSAL_VERSION', entityId: version.id, beforeVersion: null, afterVersion: 1,
      auditDetails: { jobId, proposalVersionId: version.id }
    };
  }

  if (command.type === 'proposal.generate.retry') {
    requireProposalAction('proposal.generate');
    const { proposalVersionId, expectedVersion, failedJobId } = command.payload;
    const version = await env.DB.prepare(`SELECT pv.version,pv.client_id,pv.engagement_id,p.current_version_id,e.lifecycle_state
      FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
      JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.client_id=pv.client_id AND e.id=pv.engagement_id
      WHERE pv.workspace_id=? AND pv.id=?`).bind(workspaceId, proposalVersionId)
      .first<{ version: number; client_id: string; engagement_id: string; current_version_id: string; lifecycle_state: string }>();
    if (!version) throw new ApiError('NOT_FOUND', 'The proposal revision was not found.');
    requireClientScope(context, version.client_id);
    if (version.version !== expectedVersion || version.current_version_id !== proposalVersionId) throw new ApiError('STALE_APPROVAL', 'Only the current proposal revision can be regenerated.');
    if (version.lifecycle_state !== 'PROPOSAL_GENERATION') throw new ApiError('INVALID_TRANSITION', 'The engagement is no longer accepting proposal documents.');
    const job = await env.DB.prepare(`SELECT status,aggregate_id,kind FROM outbox_jobs WHERE workspace_id=? AND id=? AND deduplication_key=?`)
      .bind(workspaceId, failedJobId, `proposal-document:${proposalVersionId}`)
      .first<{ status: string; aggregate_id: string; kind: string }>();
    if (!job || job.aggregate_id !== proposalVersionId || job.kind !== 'GENERATE_DOCUMENT'
      || !['RETRYABLE_FAILED','PERMANENT_FAILED'].includes(job.status)) {
      throw new ApiError('INVALID_STATE', 'Only a failed proposal generation job can be retried.');
    }
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,78,CASE WHEN EXISTS(SELECT 1 FROM proposals p JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.id=p.current_version_id
            JOIN outbox_jobs j ON j.workspace_id=p.workspace_id AND j.aggregate_id=pv.id
            WHERE p.workspace_id=? AND pv.id=? AND pv.version=? AND j.id=? AND j.kind='GENERATE_DOCUMENT'
              AND j.status IN ('RETRYABLE_FAILED','PERMANENT_FAILED')) THEN 1 ELSE 0 END`)
          .bind(workspaceId, workspaceId, proposalVersionId, expectedVersion, failedJobId),
        env.DB.prepare(`UPDATE outbox_jobs SET status='PENDING',next_attempt_at=?,lease_until=NULL,last_error_code=NULL,result_json=NULL,completed_at=NULL,updated_at=?,version=version+1
          WHERE workspace_id=? AND id=? AND status IN ('RETRYABLE_FAILED','PERMANENT_FAILED')`)
          .bind(now, now, workspaceId, failedJobId)
      ],
      result: { jobId: failedJobId, status: 'PENDING', retry: true }, entityType: 'PROPOSAL_VERSION', entityId: proposalVersionId,
      beforeVersion: expectedVersion, afterVersion: expectedVersion,
      auditDetails: { jobId: failedJobId, proposalVersionId, retry: true }
    };
  }

  if (command.type === 'proposal.approve') {
    requirePartner();
    const { proposalVersionId, expectedVersion, note } = command.payload;
    const row = await env.DB.prepare(`SELECT pv.version,pv.proposal_id,pv.client_id,pv.engagement_id,pv.revision,p.current_version_id,pv.created_by_actor_id,e.lifecycle_state,
        creatorStaff.natural_person_key AS preparer_key,approverStaff.natural_person_key AS approver_key
      FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
      JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.client_id=pv.client_id AND e.id=pv.engagement_id
      LEFT JOIN actor_profiles creator ON creator.workspace_id=pv.workspace_id AND creator.id=pv.created_by_actor_id
      LEFT JOIN staff_members creatorStaff ON creatorStaff.workspace_id=creator.workspace_id AND creatorStaff.id=creator.staff_member_id
      JOIN actor_profiles approver ON approver.workspace_id=pv.workspace_id AND approver.id=?
      JOIN staff_members approverStaff ON approverStaff.workspace_id=approver.workspace_id AND approverStaff.id=approver.staff_member_id
      WHERE pv.workspace_id=? AND pv.id=?`).bind(actorId, workspaceId, proposalVersionId)
      .first<{ version: number; proposal_id: string; client_id: string; engagement_id: string; revision: number; current_version_id: string; created_by_actor_id: string; lifecycle_state: string; preparer_key: string | null; approver_key: string }>();
    if (!row) throw new ApiError('NOT_FOUND', 'The proposal revision was not found.');
    requireClientScope(context, row.client_id);
    if (context.scope.engagementId && context.scope.engagementId !== row.engagement_id) throw new ApiError('FORBIDDEN_SCOPE', 'The proposal is outside the selected engagement.');
    if (row.version !== expectedVersion || row.current_version_id !== proposalVersionId) throw new ApiError('STALE_APPROVAL', 'The proposal changed. Approval applies only to the current revision.');
    if (row.preparer_key && row.preparer_key === row.approver_key) throw new ApiError('PERSONA_ACTION_DENIED', 'The proposal preparer and approving Partner must be different natural persons.');
    const generated = await env.DB.prepare(`SELECT 1 AS found FROM proposal_artifacts pa
      JOIN generated_artifacts ga ON ga.workspace_id=pa.workspace_id AND ga.id=pa.artifact_id
      JOIN outbox_jobs j ON j.workspace_id=ga.workspace_id AND j.id=ga.generated_by_job_id AND j.status='SUCCEEDED'
      WHERE pa.workspace_id=? AND pa.proposal_version_id=? AND ga.artifact_kind IN ('QUOTE','FULL_PROPOSAL') LIMIT 1`)
      .bind(workspaceId, proposalVersionId).first<{ found: number }>();
    if (!generated) throw new ApiError('GATE_BLOCKED', 'Generate and verify the exact proposal PDF before Partner approval.');
    if (row.lifecycle_state !== 'PROPOSAL_GENERATION') throw new ApiError('INVALID_TRANSITION', 'This engagement is no longer accepting proposal approval.');
    const approvalId = crypto.randomUUID();
    const proposalApprovalId = crypto.randomUUID();
    const actorSnapshot = JSON.stringify({ actorId, persona: context.actor.persona, displayName: context.actor.displayName, staffGrade: context.actor.staffGrade });
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,76,CASE WHEN EXISTS(SELECT 1 FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
              JOIN proposal_artifacts pa ON pa.workspace_id=pv.workspace_id AND pa.proposal_version_id=pv.id
              JOIN generated_artifacts ga ON ga.workspace_id=pa.workspace_id AND ga.id=pa.artifact_id
              JOIN outbox_jobs j ON j.workspace_id=ga.workspace_id AND j.id=ga.generated_by_job_id AND j.status='SUCCEEDED'
            WHERE pv.workspace_id=? AND pv.id=? AND pv.version=? AND p.current_version_id=pv.id)
          THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, proposalVersionId, expectedVersion),
        env.DB.prepare(`INSERT INTO approval_decisions(id,workspace_id,client_id,engagement_id,version,subject_type,subject_id,subject_version,decision,rationale,actor_snapshot_json,decided_at,supersedes_decision_id)
          VALUES(?,?,?, ?,1,'PROPOSAL_VERSION',?,?,'APPROVE',?,?,?,NULL)`)
          .bind(approvalId, workspaceId, row.client_id, row.engagement_id, proposalVersionId, row.revision, note, actorSnapshot, now),
        env.DB.prepare(`INSERT INTO proposal_approvals(id,workspace_id,client_id,engagement_id,proposal_version_id,approval_decision_id,decision,rationale,decided_by_actor_id,decided_at)
          VALUES(?,?,?,?,?,?,'APPROVE',?,?,?)`).bind(proposalApprovalId, workspaceId, row.client_id, row.engagement_id,
          proposalVersionId, approvalId, note, actorId, now)
      ],
      result: { approvalId, proposalApprovalId, proposalVersionId, status: 'APPROVED' }, entityType: 'PROPOSAL_VERSION', entityId: proposalVersionId,
      beforeVersion: expectedVersion, afterVersion: expectedVersion,
      auditDetails: { approvalId, proposalVersionId, revision: row.revision }
    };
  }

  if (command.type === 'proposal.dispatch') {
    requirePartner();
    requireProposalAction('proposal.dispatch');
    const { proposalVersionId, expectedVersion, contactRouteId } = command.payload;
    const proposal = await env.DB.prepare(`SELECT pv.version,pv.proposal_id,pv.client_id,pv.engagement_id,pv.revision,pv.team_cv_file_ids_json,p.current_version_id,e.lifecycle_state,e.active_proposal_version_id
      FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
      JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.client_id=pv.client_id AND e.id=pv.engagement_id
      WHERE pv.workspace_id=? AND pv.id=?`).bind(workspaceId, proposalVersionId)
      .first<{ version: number; proposal_id: string; client_id: string; engagement_id: string; revision: number; team_cv_file_ids_json: string; current_version_id: string; lifecycle_state: string; active_proposal_version_id: string | null }>();
    if (!proposal) throw new ApiError('NOT_FOUND', 'The proposal revision was not found.');
    requireClientScope(context, proposal.client_id);
    if (context.scope.engagementId && context.scope.engagementId !== proposal.engagement_id) throw new ApiError('FORBIDDEN_SCOPE', 'The proposal is outside the selected engagement.');
    if (proposal.version !== expectedVersion || proposal.current_version_id !== proposalVersionId) throw new ApiError('STALE_APPROVAL', 'Only the current proposal revision can be dispatched.');
    const lifecycleAlreadyAdvanced = proposal.lifecycle_state !== 'PROPOSAL_GENERATION';
    if (lifecycleAlreadyAdvanced && (proposal.lifecycle_state !== 'DUAL_KEY_PENDING' || proposal.active_proposal_version_id !== proposalVersionId)) {
      throw new ApiError('INVALID_TRANSITION', 'Email dispatch requires proposal generation or the same proposal version already recorded in dual-key pending.');
    }
    const approved = await env.DB.prepare(`SELECT 1 AS found FROM proposal_approvals WHERE workspace_id=? AND proposal_version_id=? AND decision='APPROVE' LIMIT 1`)
      .bind(workspaceId, proposalVersionId).first<{ found: number }>();
    if (!approved) throw new ApiError('GATE_BLOCKED', 'A Partner must approve this exact proposal revision before dispatch.');
    const artifact = await env.DB.prepare(`SELECT ga.file_version_id,ga.content_sha256 FROM proposal_artifacts pa
      JOIN generated_artifacts ga ON ga.workspace_id=pa.workspace_id AND ga.id=pa.artifact_id
      JOIN outbox_jobs j ON j.workspace_id=ga.workspace_id AND j.id=ga.generated_by_job_id AND j.status='SUCCEEDED'
      WHERE pa.workspace_id=? AND pa.proposal_version_id=? AND ga.artifact_kind IN ('QUOTE','FULL_PROPOSAL') LIMIT 1`)
      .bind(workspaceId, proposalVersionId).first<{ file_version_id: string; content_sha256: string }>();
    if (!artifact) throw new ApiError('GATE_BLOCKED', 'The verified proposal PDF is not available for dispatch.');
    const route = await env.DB.prepare(`SELECT cr.id,cr.version,ct.full_name,ct.email,ct.phone,cr.purpose
      FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
      WHERE cr.workspace_id=? AND cr.id=? AND cr.client_id=? AND cr.purpose='PROPOSAL' AND ct.active=1 AND ct.email IS NOT NULL`)
      .bind(workspaceId, contactRouteId, proposal.client_id)
      .first<{ id: string; version: number; full_name: string; email: string; phone: string | null; purpose: string }>();
    if (!route) throw new ApiError('GATE_BLOCKED', 'Choose an active PROPOSAL contact route with a verified email address. WhatsApp source labels are not dispatch providers.');
    const dispatchId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const deduplicationKey = `proposal-email:${proposalVersionId}:${route.id}`;
    const recipients = JSON.stringify({ contactRouteId: route.id, contactRouteVersion: route.version, name: route.full_name, email: route.email });
    const attachmentFileVersionIds = JSON.parse(proposal.team_cv_file_ids_json) as unknown;
    if (!Array.isArray(attachmentFileVersionIds) || attachmentFileVersionIds.some(id => typeof id !== 'string')) {
      throw new ApiError('GATE_BLOCKED', 'The CV attachment manifest for this proposal revision is invalid.');
    }
    const jobPayload = JSON.stringify({ dispatchId, proposalVersionId, proposalId: proposal.proposal_id,
      clientId: proposal.client_id, engagementId: proposal.engagement_id, fileVersionId: artifact.file_version_id,
      attachmentFileVersionIds, recipient: JSON.parse(recipients), commandId });
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,77,CASE WHEN EXISTS(SELECT 1 FROM proposals p JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.id=p.current_version_id
              JOIN proposal_approvals pa ON pa.workspace_id=pv.workspace_id AND pa.proposal_version_id=pv.id AND pa.decision='APPROVE'
              JOIN proposal_artifacts pra ON pra.workspace_id=pv.workspace_id AND pra.proposal_version_id=pv.id
              JOIN generated_artifacts ga ON ga.workspace_id=pra.workspace_id AND ga.id=pra.artifact_id
              JOIN outbox_jobs gj ON gj.workspace_id=ga.workspace_id AND gj.id=ga.generated_by_job_id AND gj.status='SUCCEEDED'
            WHERE p.workspace_id=? AND pv.id=? AND pv.version=?
              AND EXISTS(SELECT 1 FROM engagements e WHERE e.workspace_id=p.workspace_id AND e.id=p.engagement_id
                AND (e.lifecycle_state='PROPOSAL_GENERATION' OR (e.lifecycle_state='DUAL_KEY_PENDING' AND e.active_proposal_version_id=pv.id)))
              AND EXISTS(SELECT 1 FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.id=cr.contact_id
              WHERE cr.workspace_id=p.workspace_id AND cr.id=? AND cr.client_id=p.client_id AND cr.purpose='PROPOSAL' AND ct.active=1 AND ct.email IS NOT NULL))
          THEN 1 ELSE 0 END`).bind(workspaceId, workspaceId, proposalVersionId, expectedVersion, route.id),
        env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
          VALUES(?,?,1,'EMAIL',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
          .bind(jobId, workspaceId, dispatchId, 1, jobPayload, deduplicationKey, now, now, now),
        env.DB.prepare(`INSERT INTO dispatches(id,workspace_id,version,client_id,engagement_id,purpose,file_version_id,recipient_snapshot_json,status,provider_message_id,sent_at,deduplication_key,job_id,created_at,updated_at)
          VALUES(?,?,1,?,?,'PROPOSAL',?,?,'QUEUED',NULL,NULL,?,?,?,?)`)
          .bind(dispatchId, workspaceId, proposal.client_id, proposal.engagement_id, artifact.file_version_id, recipients, deduplicationKey, jobId, now, now)
      ],
      result: { dispatchId, jobId, status: 'QUEUED', lifecycleAlreadyAdvanced, recipient: { name: route.full_name, email: route.email }, artifactSha256: artifact.content_sha256 },
      entityType: 'DISPATCH', entityId: dispatchId, beforeVersion: null, afterVersion: 1,
      auditDetails: { dispatchId, jobId, proposalVersionId, artifactSha256: artifact.content_sha256, recipient: JSON.parse(recipients) }
    };
  }

  if (command.type === 'proposal.dispatch.recordManual') {
    requirePartner();
    requireProposalAction('proposal.dispatch');
    const { engagementId, proposalVersionId, channel, contactId, evidenceFileVersionId } = command.payload;
    const sentAt = new Date(Date.parse(command.payload.sentAt)).toISOString();
    const note = command.payload.note?.trim() || null;
    const proposal = await env.DB.prepare(`SELECT pv.version,pv.client_id,pv.engagement_id,pv.revision,p.current_version_id,
        e.version AS engagement_version,e.lifecycle_state,e.active_proposal_version_id
      FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
      JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.client_id=pv.client_id AND e.id=pv.engagement_id
      WHERE pv.workspace_id=? AND pv.id=?`).bind(workspaceId, proposalVersionId)
      .first<{ version: number; client_id: string; engagement_id: string; revision: number; current_version_id: string;
        engagement_version: number; lifecycle_state: string; active_proposal_version_id: string | null }>();
    if (!proposal) throw new ApiError('NOT_FOUND', 'The proposal revision was not found.');
    requireClientScope(context, proposal.client_id);
    if (proposal.engagement_id !== engagementId) throw new ApiError('FORBIDDEN_SCOPE', 'The proposal version does not belong to the supplied engagement.');
    if (context.scope.engagementId && context.scope.engagementId !== engagementId) throw new ApiError('FORBIDDEN_SCOPE', 'The proposal is outside the selected engagement.');
    if (proposal.current_version_id !== proposalVersionId) throw new ApiError('STALE_APPROVAL', 'Manual dispatch can only be recorded for the current proposal revision.');
    const canStartTransition = proposal.lifecycle_state === 'PROPOSAL_GENERATION' && proposal.active_proposal_version_id === null;
    const canRecordFollowup = proposal.active_proposal_version_id === proposalVersionId
      && ['DUAL_KEY_PENDING', 'ADVANCE_BILLING', 'PORTAL_ACTIVE_PLANNING', 'FIELDWORK_EXECUTION',
        'MANAGERIAL_REVIEW', 'PARTNER_APPROVAL', 'DELIVERABLE_RELEASE', 'COMPLIANCE_COUNTDOWN'].includes(proposal.lifecycle_state);
    if (!canStartTransition && !canRecordFollowup) {
      throw new ApiError('INVALID_TRANSITION', 'Manual dispatch requires proposal generation or a lifecycle already advanced by this exact approved proposal.');
    }
    const approval = await env.DB.prepare(`SELECT id,decision,decided_at FROM proposal_approvals
      WHERE workspace_id=? AND proposal_version_id=? ORDER BY decided_at DESC,id DESC LIMIT 1`)
      .bind(workspaceId, proposalVersionId).first<{ id: string; decision: string; decided_at: string }>();
    if (!approval || approval.decision !== 'APPROVE') throw new ApiError('GATE_BLOCKED', 'A Partner must approve this exact proposal revision before it can be recorded as sent.');
    const sentAtMs = Date.parse(sentAt);
    const approvedAtMs = Date.parse(approval.decided_at);
    const nowMs = Date.parse(now);
    if (!Number.isFinite(sentAtMs) || sentAtMs > nowMs || !Number.isFinite(approvedAtMs) || sentAtMs < approvedAtMs) {
      throw new ApiError('VALIDATION_FAILED', 'The sent time must be on or after the latest Partner approval and cannot be in the future.');
    }
    const artifact = await env.DB.prepare(`SELECT ga.file_version_id,ga.content_sha256,f.media_type
      FROM proposal_artifacts pa JOIN generated_artifacts ga ON ga.workspace_id=pa.workspace_id AND ga.id=pa.artifact_id
      JOIN file_versions f ON f.workspace_id=ga.workspace_id AND f.id=ga.file_version_id
      JOIN outbox_jobs j ON j.workspace_id=ga.workspace_id AND j.id=ga.generated_by_job_id AND j.status='SUCCEEDED'
      WHERE pa.workspace_id=? AND pa.proposal_version_id=? AND ga.artifact_kind IN ('QUOTE','FULL_PROPOSAL')
        AND f.state='COMMITTED' AND f.immutable=1 AND f.purpose='GENERATED' AND f.media_type='application/pdf' LIMIT 1`)
      .bind(workspaceId, proposalVersionId).first<{ file_version_id: string; content_sha256: string; media_type: string }>();
    if (!artifact) throw new ApiError('GATE_BLOCKED', 'The exact generated proposal PDF is not committed and verifiable.');
    const contact = await env.DB.prepare(`SELECT full_name,phone FROM contacts WHERE workspace_id=? AND client_id=? AND id=?`)
      .bind(workspaceId, proposal.client_id, contactId).first<{ full_name: string; phone: string | null }>();
    if (!contact) throw new ApiError('GATE_BLOCKED', 'Choose a contact belonging to the proposal client.');
    if (evidenceFileVersionId) {
      const evidence = await env.DB.prepare(`SELECT id FROM file_versions WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=?
          AND purpose='EVIDENCE' AND state='COMMITTED' AND immutable=1`)
        .bind(workspaceId, evidenceFileVersionId, proposal.client_id, proposal.engagement_id).first<{ id: string }>();
      if (!evidence) throw new ApiError('GATE_BLOCKED', 'Dispatch evidence must be a committed immutable EVIDENCE file from this engagement.');
    }
    const manualDispatchId = crypto.randomUUID();
    const transitionId = crypto.randomUUID();
    const reason = `The Partner recorded the approved proposal sent by ${channel === 'WHATSAPP' ? 'WhatsApp' : 'hand delivery'}.`;
    const dependencyHash = await sha256Hex(JSON.stringify({ proposalVersionId, approvalId: approval.id,
      fileVersionId: artifact.file_version_id, fileSha256: artifact.content_sha256, contactId, channel, sentAt }));
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,78,CASE WHEN EXISTS(SELECT 1 FROM proposals p
            JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.proposal_id=p.id
            JOIN engagements e ON e.workspace_id=p.workspace_id AND e.client_id=p.client_id AND e.id=p.engagement_id
            JOIN proposal_approvals pa ON pa.workspace_id=pv.workspace_id AND pa.proposal_version_id=pv.id
              AND pa.id=(SELECT latest.id FROM proposal_approvals latest WHERE latest.workspace_id=pv.workspace_id
                AND latest.proposal_version_id=pv.id ORDER BY latest.decided_at DESC,latest.id DESC LIMIT 1)
            JOIN proposal_artifacts pra ON pra.workspace_id=pv.workspace_id AND pra.proposal_version_id=pv.id
            JOIN generated_artifacts ga ON ga.workspace_id=pra.workspace_id AND ga.id=pra.artifact_id
            JOIN file_versions f ON f.workspace_id=ga.workspace_id AND f.id=ga.file_version_id
            JOIN outbox_jobs gj ON gj.workspace_id=ga.workspace_id AND gj.id=ga.generated_by_job_id AND gj.status='SUCCEEDED'
            JOIN contacts ct ON ct.workspace_id=p.workspace_id AND ct.client_id=p.client_id AND ct.id=?
            WHERE p.workspace_id=? AND pv.id=? AND p.current_version_id=pv.id AND pv.id=? AND pv.client_id=? AND pv.engagement_id=?
              AND pa.decision='APPROVE' AND pa.id=? AND pa.decided_at<=? AND ?<=?
              AND ga.artifact_kind IN ('QUOTE','FULL_PROPOSAL') AND f.state='COMMITTED' AND f.immutable=1
              AND f.purpose='GENERATED' AND f.media_type='application/pdf'
              AND ((e.lifecycle_state='PROPOSAL_GENERATION' AND e.version=? AND e.active_proposal_version_id IS NULL)
                OR (e.active_proposal_version_id=pv.id AND e.lifecycle_state IN
                  ('DUAL_KEY_PENDING','ADVANCE_BILLING','PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL','DELIVERABLE_RELEASE','COMPLIANCE_COUNTDOWN')))
              AND (? IS NULL OR EXISTS(SELECT 1 FROM file_versions ef WHERE ef.workspace_id=p.workspace_id AND ef.id=?
                AND ef.client_id=p.client_id AND ef.engagement_id=p.engagement_id AND ef.purpose='EVIDENCE' AND ef.state='COMMITTED' AND ef.immutable=1)))
          THEN 1 ELSE 0 END`)
          .bind(workspaceId, contactId, workspaceId, proposalVersionId, proposalVersionId, proposal.client_id, engagementId,
            approval.id, approval.decided_at, sentAt, now, proposal.engagement_version, evidenceFileVersionId ?? null, evidenceFileVersionId ?? null),
        env.DB.prepare(`INSERT INTO manual_dispatch_records(id,workspace_id,client_id,engagement_id,purpose,channel,proposal_version_id,
            contact_id,contact_name_snapshot,recipient_phone_snapshot,file_version_id,evidence_file_version_id,sent_at,note,recorded_by_actor_id,created_at)
          VALUES(?,?,?,?,'PROPOSAL',?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(manualDispatchId, workspaceId, proposal.client_id, engagementId, channel, proposalVersionId, contactId,
            contact.full_name, contact.phone, artifact.file_version_id, evidenceFileVersionId ?? null, sentAt, note, actorId, now),
        env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at)
          SELECT ?,?,?,?,1,'PROPOSAL_GENERATION','DUAL_KEY_PENDING',?,?,?,? FROM engagements e
          WHERE e.workspace_id=? AND e.client_id=? AND e.id=? AND e.version=? AND e.lifecycle_state='PROPOSAL_GENERATION'
            AND e.active_proposal_version_id IS NULL`)
          .bind(transitionId, workspaceId, proposal.client_id, engagementId, commandId, reason, dependencyHash, now,
            workspaceId, proposal.client_id, engagementId, proposal.engagement_version),
        env.DB.prepare(`UPDATE engagements SET lifecycle_state='DUAL_KEY_PENDING',active_proposal_version_id=?,version=version+1,
            updated_at=?,updated_by_actor_id=? WHERE workspace_id=? AND client_id=? AND id=? AND version=?
            AND lifecycle_state='PROPOSAL_GENERATION' AND active_proposal_version_id IS NULL`)
          .bind(proposalVersionId, now, actorId, workspaceId, proposal.client_id, engagementId, proposal.engagement_version)
      ],
      result: { manualDispatchId, engagementId, proposalVersionId, channel, status: 'RECORDED',
        lifecycleState: canStartTransition ? 'DUAL_KEY_PENDING' : proposal.lifecycle_state },
      entityType: 'MANUAL_DISPATCH_RECORD', entityId: manualDispatchId, beforeVersion: null, afterVersion: 1,
      auditDetails: { manualDispatchId, engagementId, proposalVersionId, channel, contactId, fileVersionId: artifact.file_version_id,
        evidenceFileVersionId: evidenceFileVersionId ?? null, sentAt, recipientName: contact.full_name }
    };
  }

  if (command.type === 'proposal.dispatch.retry') {
    requirePartner();
    const prior = await env.DB.prepare(`SELECT d.id,d.version,d.client_id,d.engagement_id,d.purpose,d.file_version_id,d.recipient_snapshot_json,d.job_id,d.status,
        j.status AS job_status,j.payload_json,j.aggregate_id,j.kind
      FROM dispatches d JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id
      WHERE d.workspace_id=? AND d.id=?`).bind(workspaceId, command.payload.dispatchId)
      .first<{ id: string; version: number; client_id: string; engagement_id: string; purpose: string; file_version_id: string; recipient_snapshot_json: string; job_id: string; status: string; job_status: string; payload_json: string; aggregate_id: string; kind: string }>();
    if (!prior) throw new ApiError('NOT_FOUND', 'The failed proposal dispatch was not found.');
    requireClientScope(context, prior.client_id);
    if (context.scope.engagementId && context.scope.engagementId !== prior.engagement_id) throw new ApiError('FORBIDDEN_SCOPE', 'The dispatch is outside the selected engagement.');
    if (prior.version !== command.payload.expectedVersion || prior.status !== 'FAILED' || prior.job_status !== 'PERMANENT_FAILED'
      || prior.purpose !== 'PROPOSAL' || prior.kind !== 'EMAIL' || prior.aggregate_id !== prior.id) {
      throw new ApiError('INVALID_STATE', 'Only a definitively failed proposal dispatch can be retried. Unknown provider outcomes must be reconciled first.');
    }
    let priorPayload: { proposalVersionId?: unknown; proposalId?: unknown; recipient?: unknown; attachmentFileVersionIds?: unknown };
    let recipient: { contactRouteId: string; contactRouteVersion: number; name: string; email: string };
    try {
      priorPayload = JSON.parse(prior.payload_json) as typeof priorPayload;
      recipient = JSON.parse(prior.recipient_snapshot_json) as typeof recipient;
      if (typeof priorPayload.proposalVersionId !== 'string' || typeof priorPayload.proposalId !== 'string' || !recipient
        || typeof recipient.contactRouteId !== 'string' || typeof recipient.contactRouteVersion !== 'number'
        || typeof recipient.name !== 'string' || typeof recipient.email !== 'string') throw new Error('shape');
    } catch {
      throw new ApiError('INVALID_STATE', 'The stored recipient or attachment snapshot cannot be verified, so this dispatch cannot be retried.');
    }
    const version = await env.DB.prepare(`SELECT pv.version,pv.revision,p.current_version_id,pv.team_cv_file_ids_json,e.lifecycle_state,e.active_proposal_version_id
      FROM proposal_versions pv JOIN proposals p ON p.workspace_id=pv.workspace_id AND p.id=pv.proposal_id
      JOIN engagements e ON e.workspace_id=pv.workspace_id AND e.client_id=pv.client_id AND e.id=pv.engagement_id
      JOIN proposal_approvals a ON a.workspace_id=pv.workspace_id AND a.proposal_version_id=pv.id AND a.decision='APPROVE'
      WHERE pv.workspace_id=? AND pv.id=? AND (e.lifecycle_state='PROPOSAL_GENERATION'
        OR (e.lifecycle_state='DUAL_KEY_PENDING' AND e.active_proposal_version_id=pv.id))
      ORDER BY a.decided_at DESC,a.id DESC LIMIT 1`).bind(workspaceId, priorPayload.proposalVersionId)
      .first<{ version: number; revision: number; current_version_id: string; team_cv_file_ids_json: string; lifecycle_state: string; active_proposal_version_id: string | null }>();
    if (!version || version.current_version_id !== priorPayload.proposalVersionId) throw new ApiError('STALE_APPROVAL', 'Retry requires the currently approved proposal revision.');
    const currentCvIds = JSON.parse(version.team_cv_file_ids_json) as unknown;
    if (!Array.isArray(currentCvIds) || JSON.stringify(currentCvIds) !== JSON.stringify(priorPayload.attachmentFileVersionIds)) {
      throw new ApiError('STALE_APPROVAL', 'The dispatch CV manifest no longer matches the approved proposal revision.');
    }
    const route = await env.DB.prepare(`SELECT cr.version,ct.full_name,ct.email FROM contact_routes cr
      JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
      WHERE cr.workspace_id=? AND cr.id=? AND cr.client_id=? AND cr.purpose='PROPOSAL' AND ct.active=1 AND ct.email IS NOT NULL`)
      .bind(workspaceId, recipient.contactRouteId, prior.client_id)
      .first<{ version: number; full_name: string; email: string }>();
    if (!route || route.version !== recipient.contactRouteVersion || route.email !== recipient.email || route.full_name !== recipient.name) {
      throw new ApiError('GATE_BLOCKED', 'The proposal recipient route changed or is inactive. Review the route and create a fresh dispatch.');
    }
    const attemptCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM dispatches d
      JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id
      WHERE d.workspace_id=? AND d.engagement_id=? AND d.file_version_id=? AND d.purpose='PROPOSAL'
        AND json_extract(j.payload_json,'$.proposalVersionId')=? AND json_extract(j.payload_json,'$.recipient.contactRouteId')=?`)
      .bind(workspaceId, prior.engagement_id, prior.file_version_id, priorPayload.proposalVersionId, recipient.contactRouteId)
      .first<{ count: number }>();
    const attempt = (attemptCount?.count ?? 1) + 1;
    const dispatchId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const deduplicationKey = `proposal-email:${String(priorPayload.proposalVersionId)}:${recipient.contactRouteId}:retry:${attempt}`;
    const jobPayload = JSON.stringify({
      dispatchId, proposalVersionId: priorPayload.proposalVersionId, proposalId: priorPayload.proposalId,
      clientId: prior.client_id, engagementId: prior.engagement_id, fileVersionId: prior.file_version_id,
      attachmentFileVersionIds: currentCvIds, recipient, commandId
    });
    return {
      statements: [
        env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
          SELECT ?,79,CASE WHEN EXISTS(SELECT 1 FROM dispatches d JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id
              JOIN proposals p ON p.workspace_id=d.workspace_id
              JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.id=p.current_version_id
              JOIN proposal_approvals a ON a.workspace_id=pv.workspace_id AND a.proposal_version_id=pv.id AND a.decision='APPROVE'
            WHERE d.workspace_id=? AND d.id=? AND d.version=? AND d.status='FAILED' AND j.status='PERMANENT_FAILED'
              AND json_extract(j.payload_json,'$.proposalVersionId')=? AND p.current_version_id=?
              AND EXISTS(SELECT 1 FROM engagements e WHERE e.workspace_id=p.workspace_id AND e.id=p.engagement_id
                AND (e.lifecycle_state='PROPOSAL_GENERATION' OR (e.lifecycle_state='DUAL_KEY_PENDING' AND e.active_proposal_version_id=pv.id)))) THEN 1 ELSE 0 END`)
          .bind(workspaceId, workspaceId, command.payload.dispatchId, command.payload.expectedVersion, priorPayload.proposalVersionId, priorPayload.proposalVersionId),
        env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
          VALUES(?,?,1,'EMAIL',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
          .bind(jobId, workspaceId, dispatchId, 1, jobPayload, deduplicationKey, now, now, now),
        env.DB.prepare(`INSERT INTO dispatches(id,workspace_id,version,client_id,engagement_id,purpose,file_version_id,recipient_snapshot_json,status,provider_message_id,sent_at,deduplication_key,job_id,created_at,updated_at)
          VALUES(?,?,1,?,?,'PROPOSAL',?,?,'QUEUED',NULL,NULL,?,?,?,?)`)
          .bind(dispatchId, workspaceId, prior.client_id, prior.engagement_id, prior.file_version_id, prior.recipient_snapshot_json,
            deduplicationKey, jobId, now, now)
      ],
      result: { dispatchId, jobId, status: 'QUEUED', recipient, retryOfDispatchId: prior.id }, entityType: 'DISPATCH', entityId: dispatchId,
      beforeVersion: null, afterVersion: 1,
      auditDetails: { dispatchId, retryOfDispatchId: prior.id, jobId, proposalVersionId: priorPayload.proposalVersionId, recipient }
    };
  }

  throw new ApiError('BAD_REQUEST', 'Unsupported proposal command.');
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

  const commandPayload=(envelope.command as {payload?:Record<string,unknown>}).payload;
  const targetEngagementId=typeof commandPayload?.engagementId==='string'?commandPayload.engagementId:null;
  const postArchiveBookkeeping=new Set(['payment.record','payment.reverse','payment.allocate','payment.reverse-allocation','credit-note.issue','revenue.recognize']);
  const postArchivePaymentEvidenceReservation=envelope.command.type==='file.reserve'
    &&typeof commandPayload?.paymentEvidenceReservationId==='string'
    &&commandPayload.purpose==='EVIDENCE'
    &&context.actor.persona!=='CLIENT'
    &&commandPayload.clientId===envelope.context.clientId
    &&commandPayload.engagementId===envelope.context.engagementId
    &&['application/pdf','image/png','image/jpeg'].includes(String(commandPayload.mediaType));
  if(targetEngagementId&&!postArchiveBookkeeping.has(envelope.command.type)&&envelope.command.type!=='archive.lock'&&!postArchivePaymentEvidenceReservation){
    const engagement=await env.DB.prepare(`SELECT lifecycle_state,locked_at,archive_due_at FROM engagements WHERE workspace_id=? AND id=?`)
      .bind(workspaceId,targetEngagementId).first<{lifecycle_state:string;locked_at:string|null;archive_due_at:string|null}>();
    if(!engagement)throw new ApiError('NOT_FOUND','The engagement was not found.');
    if(engagement.locked_at||engagement.lifecycle_state==='ARCHIVED_READ_ONLY'||(engagement.archive_due_at!==null&&engagement.archive_due_at<=new Date().toISOString())){
      throw new ApiError('WORKSPACE_FROZEN','The engagement is read-only because its archive deadline has passed or its archive is locked.');
    }
  }

  const workspace = await env.DB.prepare(`SELECT version,business_status FROM workspaces WHERE id=?`)
    .bind(workspaceId).first<{ version: number; business_status: 'ACTIVE' | 'READ_ONLY' }>();
  if (!workspace) throw new ApiError('NOT_FOUND', 'Workspace not found.');
  if (workspace.business_status !== 'ACTIVE') throw new ApiError('WORKSPACE_FROZEN', 'This workspace is read-only.');

  // A workspace audit chain is intentionally linear, so independent commands can
  // race to append at the same sequence. Keep the database compare-and-swap as the
  // authority, but give a realistic burst of active users time to take turns.
  const maxAuditHeadAttempts = 24;
  for (let attempt = 0; attempt < maxAuditHeadAttempts; attempt++) {
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
      : isBusinessFileCommand(envelope.command)
        ? await buildBusinessFileMutation(env, workspaceId, context, envelope.command, timestamp)
        : isBusinessPbcCommand(envelope.command)
          ? await buildBusinessPbcMutation(env, workspaceId, context, envelope.command, timestamp)
          : isBusinessProposalCommand(envelope.command)
            ? await buildBusinessProposalMutation(env, workspaceId, context, envelope.command, commandId, timestamp)
            : isBusinessRiskCommand(envelope.command)
              ? await buildBusinessRiskMutation(env, workspaceId, context, envelope.command, commandId, timestamp)
              : isBusinessDeliveryCommand(envelope.command)
                ? await buildBusinessDeliveryMutation(env, workspaceId, context, envelope.command, commandId, timestamp)
              : isBusinessPlanningCommand(envelope.command)
                ? await buildBusinessPlanningMutation(env, workspaceId, context, envelope.command, commandId, timestamp)
                : isBusinessTbCommand(envelope.command)
                  ? await buildBusinessTbMutation(env, workspaceId, context, envelope.command, commandId, timestamp)
                : isBusinessFieldworkCommand(envelope.command)
                     ? await buildBusinessFieldworkMutation(env, workspaceId, context, envelope.command, commandId, timestamp)
                     : isBusinessReportingCommand(envelope.command)
                       ? await buildBusinessReportingMutation(env, workspaceId, context, envelope.command, commandId, timestamp)
                       : isBusinessPracticeCommand(envelope.command)
                         ? await buildBusinessPracticeMutation(env, workspaceId, context, envelope.command, commandId, timestamp)
                    : await buildCommercialMutation(env, workspaceId, context, envelope.command, commandId, timestamp);
    const sequence = head.last_sequence + 1;
    const scope = await businessCommandScope(env, workspaceId, context,
      envelope.command as { type?: string; payload?: Record<string, unknown> }, mutation);
    const eventDetails = JSON.stringify({
      commandId,
      result: mutation.result,
      ...(mutation.auditDetails ? { details: mutation.auditDetails } : {}),
      scope: scope.known ? { clientId: scope.clientId, engagementId: scope.engagementId } : null,
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
    const responseStatus = 'responseStatus' in mutation && typeof mutation.responseStatus === 'number' ? mutation.responseStatus : 200;
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
      ) VALUES(?,?,1,?,?,?,?,?,?,?)`).bind(
        commandId, workspaceId, envelope.idempotencyKey, requestHash, actorSnapshot, envelope.command.type, responseStatus, JSON.stringify(response), timestamp
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
      ) VALUES(?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,'SELF_ASSERTED','USER','WORKSPACE',?,?,?,?,?,?,?,?)`)
        .bind(
          auditEventId, workspaceId, sequence, context.actor.persona, envelope.command.type,
          mutation.entityType.toLowerCase(), mutation.entityId, scope.clientId, scope.engagementId,
          mutation.beforeVersion, mutation.afterVersion, eventDetails, now, workspaceId, head.last_event_hash,
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
      if (error instanceof Error && /command_assertions|CHECK constraint failed: ok = 1/i.test(error.message)) {
        const portalFrozen = await portalFrozenClientMutationError(env, workspaceId, context, envelope.command);
        if (portalFrozen) throw portalFrozen;
      }
      const currentHead = await env.DB.prepare(`SELECT last_sequence,last_event_hash FROM audit_chain_heads
        WHERE id=? AND workspace_id=?`).bind(head.id, workspaceId)
        .first<{ last_sequence: number; last_event_hash: string | null }>();
      const headAdvanced = Boolean(currentHead && (currentHead.last_sequence !== head.last_sequence || currentHead.last_event_hash !== head.last_event_hash));
      if (headAdvanced && attempt + 1 < maxAuditHeadAttempts) {
        const backoffMs = Math.min(10, 2 * (attempt + 1)) + Math.floor(Math.random() * 3);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
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
