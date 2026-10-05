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
    allowedActions: row.persona === 'APPROVER' && row.staffGrade === 'PARTNER' ? ['directory.manage'] : [],
    readOnlyReasons: isClient ? ['CLIENT_PROJECTION_ONLY'] : []
  };
}

// Only the directory commands required to configure the four real personas are
// enabled in this foundation slice. Other command families remain unavailable
// until their normalized implementation lands.
const staffGradeSchema = z.enum(['PARTNER', 'MANAGER', 'SENIOR', 'ASSOCIATE']);
const staffIdSchema = z.uuid();
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

export const businessCommandSchema = z.discriminatedUnion('type', [
  staffCreateCommand,
  staffUpdateCommand,
  staffActorAssignment,
  actorProfileDeactivate
]);

export const businessCommandEnvelopeSchema = z.strictObject({
  command: businessCommandSchema,
  idempotencyKey: z.string().trim().min(8).max(200)
});

export type BusinessCommandEnvelope = z.infer<typeof businessCommandEnvelopeSchema>;

export function parseBusinessCommandEnvelope(value: unknown): BusinessCommandEnvelope {
  const parsed = businessCommandEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw invalidInput(parsed.error.issues);
  return parsed.data;
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
  command: BusinessCommandEnvelope['command'],
  commandId: string,
  now: string
): Promise<{ statements: D1PreparedStatement[]; result: Record<string, unknown>; entityType: string; entityId: string; beforeVersion: number | null; afterVersion: number }> {
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

/** Atomic first set of normalized directory commands for BUSINESS workspaces. */
export async function runBusinessDirectoryCommand(
  env: Env,
  workspaceId: string,
  request: Request,
  envelope: BusinessCommandEnvelope
): Promise<Record<string, unknown>> {
  await requireBusinessWorkspace(env, workspaceId);
  const context = await resolveBusinessContext(env, workspaceId, request);
  const requestHash = await sha256Hex(JSON.stringify({
    command: envelope.command,
    actorId: context.actor.id,
    persona: context.actor.persona
  }));
  const prior = await findCommandReceipt(env, workspaceId, envelope.idempotencyKey);
  if (prior) return replayCommand(prior, requestHash);

  const workspace = await env.DB.prepare(`SELECT version,business_status FROM workspaces WHERE id=?`)
    .bind(workspaceId).first<{ version: number; business_status: 'ACTIVE' | 'READ_ONLY' }>();
  if (!workspace) throw new ApiError('NOT_FOUND', 'Workspace not found.');
  if (workspace.business_status !== 'ACTIVE') throw new ApiError('WORKSPACE_FROZEN', 'This workspace is read-only.');

  const head = await env.DB.prepare(`SELECT id,last_sequence,last_event_hash FROM audit_chain_heads
    WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`).bind(workspaceId, workspaceId)
    .first<{ id: string; last_sequence: number; last_event_hash: string | null }>();
  if (!head) throw new ApiError('UNAVAILABLE', 'Workspace audit lineage is not initialized. No command was saved.');

  const commandId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const now = Math.floor(Date.now() / 1000);
  const mutation = await buildDirectoryMutation(env, workspaceId, context, envelope.command, commandId, timestamp);
  const sequence = head.last_sequence + 1;
  const eventDetails = JSON.stringify({ commandId, result: mutation.result, provenance: 'SELF_ASSERTED' });
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
      SELECT ?,902,CASE WHEN EXISTS(SELECT 1 FROM workspaces WHERE id=? AND business_status='ACTIVE' AND version=?) THEN 1 ELSE 0 END`)
      .bind(workspaceId, workspaceId, workspace.version),
    ...mutation.statements,
    env.DB.prepare(`INSERT INTO command_receipts(
      id,workspace_id,version,idempotency_key,request_hash,actor_snapshot_json,command_type,response_status,response_json,created_at
    ) VALUES(?,?,1,?,?,?,?,200,?,?)`).bind(
      commandId, workspaceId, envelope.idempotencyKey, requestHash, actorSnapshot, envelope.command.type, JSON.stringify(response), timestamp
    ),
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
      WHERE id=? AND version=? AND business_status='ACTIVE'`).bind(now, timestamp, workspaceId, workspace.version),
    env.DB.prepare('DELETE FROM command_assertions WHERE workspace_id=?').bind(workspaceId)
  ];

  try {
    await env.DB.batch(statements);
    return response;
  } catch (error) {
    const raced = await findCommandReceipt(env, workspaceId, envelope.idempotencyKey);
    if (raced) return replayCommand(raced, requestHash);
    if (error instanceof Error && /command_assertions|CHECK constraint failed: ok = 1|version|audit_chain_heads/i.test(error.message)) {
      throw new ApiError('VERSION_CONFLICT', 'The directory or audit lineage changed. Reload and retry with the current version.');
    }
    if (error instanceof Error && /actor_profiles_one_active|UNIQUE constraint/i.test(error.message)) {
      throw new ApiError('VERSION_CONFLICT', 'That active persona is already assigned. Refresh the directory and choose another profile.');
    }
    throw error;
  }
}
