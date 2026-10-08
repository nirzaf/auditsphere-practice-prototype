import * as z from 'zod';
import type { BusinessContext } from './business';
import type { Env } from './env';
import { ApiError } from './errors';
import { newOpaqueToken, tokenHash } from './auth/tokens';

export const businessPortalCredentialCommands = [z.strictObject({
  type: z.literal('portal.credentials.reissue'),
  payload: z.strictObject({
    engagementId: z.uuid(),
    contactRouteId: z.uuid(),
    reason: z.string().trim().min(10).max(1000)
  })
})] as const;

export type PortalCredentialReissueCommand = z.infer<typeof businessPortalCredentialCommands[number]>;
export type PortalCredentialTrigger = 'ADVANCE_PAYMENT' | 'MANUAL_REISSUE';
export type PortalCredentialMode = 'TEMP_PASSWORD' | 'ACCESS_NOTICE';

interface PortalRoute {
  id: string;
  version: number;
  contact_id: string;
  contact_version: number;
  full_name: string;
  email: string;
}

interface PortalAccount {
  id: string;
  version: number;
  email_normalized: string;
  display_name: string;
  status: 'INVITED' | 'ACTIVE' | 'LOCKED' | 'DISABLED';
  password_must_change: number;
}

export interface PortalCredentialPreparation {
  statements: D1PreparedStatement[];
  route?: PortalRoute;
  mode?: PortalCredentialMode;
  jobId?: string;
  issueId?: string;
  userAccountId?: string;
  actorProfileId?: string;
  blockedCode?: string;
}

function routeQuery(where: string): string {
  return `SELECT cr.id,cr.version,cr.contact_id,ct.version AS contact_version,ct.full_name,ct.email
    FROM contact_routes cr
    JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
    JOIN clients c ON c.workspace_id=cr.workspace_id AND c.id=cr.client_id
    WHERE ${where} AND cr.purpose='PBC' AND cr.is_primary=1 AND ct.role='CHIEF_ACCOUNTANT_LIAISON'
      AND ct.active=1 AND ct.email IS NOT NULL AND c.active=1`;
}

/** Prepare only reference IDs and hashes for durable storage; no password is persisted here. */
export async function preparePortalCredentialProvisioning(env: Env, input: {
  workspaceId: string;
  clientId: string;
  engagementId: string;
  contactRouteId?: string;
  trigger: PortalCredentialTrigger;
  commandId: string;
  createdByActorId: string;
  createdAt: string;
  requireRoute?: boolean;
}): Promise<PortalCredentialPreparation> {
  const route = input.contactRouteId
    ? await env.DB.prepare(routeQuery('cr.workspace_id=? AND cr.client_id=? AND cr.id=?'))
      .bind(input.workspaceId, input.clientId, input.contactRouteId).first<PortalRoute>()
    : await env.DB.prepare(`${routeQuery('cr.workspace_id=? AND cr.client_id=?')} ORDER BY cr.created_at,cr.id LIMIT 1`)
      .bind(input.workspaceId, input.clientId).first<PortalRoute>();
  if (!route) {
    if (input.requireRoute) throw new ApiError('GATE_BLOCKED', 'Choose an active primary PBC Audit Liaison route with an email address.');
    return { statements: [], blockedCode: 'PORTAL_LIAISON_ROUTE_MISSING' };
  }

  if (input.trigger === 'ADVANCE_PAYMENT') {
    const existingIssue = await env.DB.prepare(`SELECT id FROM portal_credential_issues
      WHERE workspace_id=? AND engagement_id=? AND contact_route_id=? AND trigger='ADVANCE_PAYMENT' LIMIT 1`)
      .bind(input.workspaceId, input.engagementId, route.id).first<{ id: string }>();
    if (existingIssue) return { statements: [], route, blockedCode: 'PORTAL_CREDENTIAL_ALREADY_ISSUED' };
  }

  const accountByContact = await env.DB.prepare(`SELECT id,version,email_normalized,display_name,status,password_must_change
    FROM user_accounts WHERE workspace_id=? AND kind='CLIENT' AND contact_id=?`)
    .bind(input.workspaceId, route.contact_id).first<PortalAccount>();
  if (accountByContact && ['LOCKED', 'DISABLED'].includes(accountByContact.status)) {
    if (input.requireRoute) throw new ApiError('GATE_BLOCKED', 'The client portal account is locked or disabled. Resolve its account status before issuing credentials.');
    return { statements: [], route, blockedCode: 'PORTAL_CLIENT_ACCOUNT_UNAVAILABLE' };
  }
  const normalizedEmail = route.email.trim().toLowerCase();
  if (accountByContact && accountByContact.email_normalized !== normalizedEmail) {
    if (input.requireRoute) throw new ApiError('GATE_BLOCKED', 'The Audit Liaison email differs from the existing client login. Resolve the account email before reissuing credentials.');
    return { statements: [], route, blockedCode: 'PORTAL_CLIENT_ACCOUNT_EMAIL_MISMATCH' };
  }
  if (!accountByContact) {
    const conflictingAccount = await env.DB.prepare(`SELECT id FROM user_accounts
      WHERE workspace_id=? AND email_normalized=? AND kind='CLIENT' AND contact_id<>? LIMIT 1`)
      .bind(input.workspaceId, normalizedEmail, route.contact_id).first<{ id: string }>();
    if (conflictingAccount) {
      if (input.requireRoute) throw new ApiError('GATE_BLOCKED', 'This email already belongs to a different client portal contact. Resolve the account ownership before reissuing credentials.');
      return { statements: [], route, blockedCode: 'PORTAL_CLIENT_ACCOUNT_EMAIL_CONFLICT' };
    }
  }

  const existingProfile = await env.DB.prepare(`SELECT id FROM actor_profiles
    WHERE workspace_id=? AND persona='CLIENT' AND contact_id=? AND active=1 ORDER BY created_at,id LIMIT 1`)
    .bind(input.workspaceId, route.contact_id).first<{ id: string }>();
  const userAccountId = accountByContact?.id ?? crypto.randomUUID();
  const actorProfileId = existingProfile?.id ?? crypto.randomUUID();
  const accountOwner = await env.DB.prepare(`SELECT user_account_id FROM user_profile_grants
    WHERE workspace_id=? AND actor_profile_id=? AND revoked_at IS NULL LIMIT 1`)
    .bind(input.workspaceId, actorProfileId).first<{ user_account_id: string }>();
  if (accountOwner && accountOwner.user_account_id !== userAccountId) {
    if (input.requireRoute) throw new ApiError('GATE_BLOCKED', 'The Audit Liaison profile is already assigned to another account. Resolve its grant before reissuing credentials.');
    return { statements: [], route, blockedCode: 'PORTAL_CLIENT_PROFILE_ALREADY_ASSIGNED' };
  }

  const mode: PortalCredentialMode = input.trigger === 'ADVANCE_PAYMENT'
    && accountByContact?.status === 'ACTIVE' && accountByContact.password_must_change === 0
    ? 'ACCESS_NOTICE' : 'TEMP_PASSWORD';
  const jobId = crypto.randomUUID();
  const issueId = mode === 'TEMP_PASSWORD' ? crypto.randomUUID() : undefined;
  const credentialTokenId = mode === 'TEMP_PASSWORD' ? crypto.randomUUID() : undefined;
  const tokenSha256 = mode === 'TEMP_PASSWORD' ? await tokenHash(newOpaqueToken()) : undefined;
  const expiresAt = mode === 'TEMP_PASSWORD'
    ? new Date(Date.parse(input.createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString()
    : undefined;
  let accountVersion = accountByContact?.version ?? 1;
  const deduplicationKey = input.trigger === 'ADVANCE_PAYMENT'
    ? `portal-credentials:advance:${input.engagementId}:${route.id}`
    : `portal-credentials:manual:${input.commandId}`;
  const payload = JSON.stringify({
    documentType: 'PORTAL_CREDENTIALS',
    mode,
    trigger: input.trigger,
    commandId: input.commandId,
    clientId: input.clientId,
    engagementId: input.engagementId,
    contactRouteId: route.id,
    contactRouteVersion: route.version,
    contactId: route.contact_id,
    contactVersion: route.contact_version,
    userAccountId,
    ...(issueId ? { portalCredentialIssueId: issueId } : {}),
    ...(credentialTokenId ? { credentialTokenId } : {})
  });

  const statements: D1PreparedStatement[] = [];
  if (accountByContact && mode === 'TEMP_PASSWORD') {
    statements.push(
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,977,CASE WHEN EXISTS(SELECT 1 FROM user_accounts WHERE workspace_id=? AND id=? AND version=?
          AND kind='CLIENT' AND email_normalized=? AND status IN ('INVITED','ACTIVE')) THEN 1 ELSE 0 END`)
        .bind(input.workspaceId, input.workspaceId, accountByContact.id, accountByContact.version, normalizedEmail),
      env.DB.prepare(`UPDATE user_accounts SET password_hash=NULL,password_must_change=1,failed_login_count=0,
        locked_until=NULL,version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status IN ('INVITED','ACTIVE')`)
        .bind(input.createdAt, input.workspaceId, accountByContact.id, accountByContact.version)
    );
    accountVersion += 1;
  }
  if (!accountByContact) {
    statements.push(env.DB.prepare(`INSERT INTO user_accounts(
      id,workspace_id,version,kind,email_normalized,display_name,staff_member_id,contact_id,status,
      external_issuer,external_subject,password_hash,password_must_change,password_changed_at,failed_login_count,
      locked_until,is_firm_admin,last_login_at,created_by_actor_id,created_at,updated_at
    ) VALUES(?,?,1,'CLIENT',?,?,NULL,?,'INVITED',NULL,NULL,NULL,0,NULL,0,NULL,0,NULL,?,?,?)`)
      .bind(userAccountId, input.workspaceId, normalizedEmail, route.full_name, route.contact_id,
        input.createdByActorId, input.createdAt, input.createdAt));
  }
  if (!existingProfile) {
    statements.push(env.DB.prepare(`INSERT INTO actor_profiles(
      id,workspace_id,version,persona,staff_member_id,contact_id,active,created_at,updated_at
    ) VALUES(?,?,1,'CLIENT',NULL,?,1,?,?)`)
      .bind(actorProfileId, input.workspaceId, route.contact_id, input.createdAt, input.createdAt));
  }
  if (!accountOwner) {
    statements.push(env.DB.prepare(`INSERT INTO user_profile_grants(
      id,workspace_id,user_account_id,actor_profile_id,granted_by_actor_id,granted_at
    ) VALUES(?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), input.workspaceId, userAccountId, actorProfileId, input.createdByActorId, input.createdAt));
  }
  statements.push(env.DB.prepare(`INSERT INTO outbox_jobs(
    id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,
    next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at
  ) VALUES(?,?,1,'EMAIL',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
    .bind(jobId, input.workspaceId, userAccountId, accountVersion, payload, deduplicationKey,
      input.createdAt, input.createdAt, input.createdAt));

  if (mode === 'TEMP_PASSWORD' && issueId && credentialTokenId && tokenSha256 && expiresAt) {
    statements.push(
      env.DB.prepare(`INSERT INTO credential_tokens(
        id,workspace_id,user_account_id,purpose,token_sha256,expires_at,consumed_at,created_by_actor_id,created_at
      ) VALUES(?,?,?,'CLIENT_TEMP_PASSWORD',?,?,NULL,?,?)`)
        .bind(credentialTokenId, input.workspaceId, userAccountId, tokenSha256, expiresAt, input.createdByActorId, input.createdAt),
      env.DB.prepare(`INSERT INTO portal_credential_issues(
        id,workspace_id,client_id,engagement_id,contact_route_id,user_account_id,credential_token_id,outbox_job_id,
        trigger,created_by_actor_id,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(issueId, input.workspaceId, input.clientId, input.engagementId, route.id, userAccountId,
          credentialTokenId, jobId, input.trigger, input.trigger === 'MANUAL_REISSUE' ? input.createdByActorId : null, input.createdAt)
    );
  }

  return { statements, route, mode, jobId, issueId, userAccountId, actorProfileId };
}

export async function buildPortalCredentialReissueMutation(env: Env, workspaceId: string, context: BusinessContext,
  command: PortalCredentialReissueCommand, commandId: string, now: string): Promise<{
    statements: D1PreparedStatement[];
    result: Record<string, unknown>;
    entityType: string;
    entityId: string;
    beforeVersion: number;
    afterVersion: number;
    auditDetails: Record<string, unknown>;
  }> {
  const isPartner = context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER';
  if (!(context.actor.persona === 'REVIEWER' || isPartner) || !context.allowedActions.includes('pbc.manage')) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only a Reviewer or Partner can reissue client portal credentials.');
  }
  const engagement = await env.DB.prepare(`SELECT version,client_id,lifecycle_state,portal_frozen_at,locked_at
    FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, command.payload.engagementId)
    .first<{ version: number; client_id: string; lifecycle_state: string; portal_frozen_at: string | null; locked_at: string | null }>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement was not found.');
  if (context.scope.clientId && context.scope.clientId !== engagement.client_id) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The portal credentials are outside the selected client scope.');
  }
  if (context.scope.engagementId && context.scope.engagementId !== command.payload.engagementId) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The portal credentials are outside the selected engagement scope.');
  }
  if (engagement.locked_at || engagement.portal_frozen_at
    || !['PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION','MANAGERIAL_REVIEW','PARTNER_APPROVAL','DELIVERABLE_RELEASE','COMPLIANCE_COUNTDOWN'].includes(engagement.lifecycle_state)) {
    throw new ApiError('INVALID_STATE', 'Client portal credentials can be reissued only while the engagement portal is active.');
  }

  const prepared = await preparePortalCredentialProvisioning(env, {
    workspaceId,
    clientId: engagement.client_id,
    engagementId: command.payload.engagementId,
    contactRouteId: command.payload.contactRouteId,
    trigger: 'MANUAL_REISSUE',
    commandId,
    createdByActorId: context.actor.id,
    createdAt: now,
    requireRoute: true
  });
  if (prepared.blockedCode || !prepared.route || !prepared.jobId || !prepared.issueId || !prepared.userAccountId || !prepared.actorProfileId) {
    throw new ApiError('GATE_BLOCKED', 'The Audit Liaison account cannot receive portal credentials until its client identity and active grant are resolved.');
  }
  const assertionSeq = 976;
  return {
    statements: [
      env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
        SELECT ?,?,CASE WHEN EXISTS(SELECT 1 FROM engagements e
          JOIN contact_routes cr ON cr.workspace_id=e.workspace_id AND cr.client_id=e.client_id
          JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
          WHERE e.workspace_id=? AND e.id=? AND e.version=? AND e.lifecycle_state=? AND e.portal_frozen_at IS NULL AND e.locked_at IS NULL
            AND cr.id=? AND cr.version=? AND cr.purpose='PBC' AND cr.is_primary=1 AND ct.version=? AND ct.active=1
            AND ct.role='CHIEF_ACCOUNTANT_LIAISON' AND ct.email IS NOT NULL)
          AND NOT EXISTS(SELECT 1 FROM user_accounts WHERE workspace_id=? AND contact_id=? AND status IN ('LOCKED','DISABLED'))
        THEN 1 ELSE 0 END`)
        .bind(workspaceId, assertionSeq, workspaceId, command.payload.engagementId, engagement.version,
          engagement.lifecycle_state, prepared.route.id, prepared.route.version, prepared.route.contact_version,
          workspaceId, prepared.route.contact_id),
      ...prepared.statements
    ],
    result: { issueId: prepared.issueId, jobId: prepared.jobId, userAccountId: prepared.userAccountId, status: 'QUEUED' },
    entityType: 'PORTAL_CREDENTIAL_ISSUE', entityId: prepared.issueId,
    beforeVersion: engagement.version, afterVersion: engagement.version,
    auditDetails: { clientId: engagement.client_id, engagementId: command.payload.engagementId,
      contactRouteId: prepared.route.id, issueId: prepared.issueId, jobId: prepared.jobId, trigger: 'MANUAL_REISSUE', reason: command.payload.reason }
  };
}
