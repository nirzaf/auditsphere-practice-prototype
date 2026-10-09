import type { BusinessContext } from './business';
import type { Env } from './env';
import { ApiError } from './errors';
import { getBusinessAcceptanceGate } from './businessRisk';
import { getBusinessPlanningReadiness } from './businessTb';
import { assertProcedureEvidenceCurrent, criticalConfirmationBlockers, getBusinessSrmCurrentness, procedureSamplingPins,
  type ConfirmationGateEngagement } from './businessFieldwork';

const LIFECYCLE = [
  { id: 'LEAD_INGESTION', label: 'Lead ingestion' },
  { id: 'PROPOSAL_GENERATION', label: 'Proposal generation' },
  { id: 'DUAL_KEY_PENDING', label: 'Client acceptance and Partner clearance' },
  { id: 'ADVANCE_BILLING', label: 'Engagement letter and advance billing' },
  { id: 'PORTAL_ACTIVE_PLANNING', label: 'Client portal and audit planning' },
  { id: 'FIELDWORK_EXECUTION', label: 'Fieldwork execution' },
  { id: 'MANAGERIAL_REVIEW', label: 'Managerial review' },
  { id: 'PARTNER_APPROVAL', label: 'Partner approval' },
  { id: 'DELIVERABLE_RELEASE', label: 'Deliverable release' },
  { id: 'COMPLIANCE_COUNTDOWN', label: 'Compliance countdown' },
  { id: 'ARCHIVED_READ_ONLY', label: 'Read-only archive' }
] as const;

type LifecycleState = typeof LIFECYCLE[number]['id'];
type StageStatus = 'completed' | 'current' | 'pending' | 'blocked' | 'rework' | 'stale';

interface TransitionRow {
  from_state: string;
  to_state: string;
  transitioned_at: string;
}

interface StageBlocker {
  code: string;
  description: string;
  route?: string;
}

interface WorkflowEngagement extends ConfirmationGateEngagement {
  version: number;
  lifecycle_state: string;
  approved_planning_version_id: string | null;
}

function lifecycleIndex(state: string): number {
  return LIFECYCLE.findIndex(stage => stage.id === state);
}

function acceptanceBlockers(value: unknown): StageBlocker[] {
  if (!value || typeof value !== 'object') return [];
  const blockers = (value as { blockers?: unknown }).blockers;
  if (!Array.isArray(blockers)) return [];
  return blockers.flatMap((blocker, index) => {
    if (typeof blocker === 'string') return [{ code: `ACCEPTANCE_GATE_${index + 1}`, description: blocker }];
    if (!blocker || typeof blocker !== 'object') return [];
    const item = blocker as Record<string, unknown>;
    if (typeof item.description !== 'string') return [];
    return [{
      code: typeof item.code === 'string' ? item.code : `ACCEPTANCE_GATE_${index + 1}`,
      description: item.description,
      ...(typeof item.route === 'string' ? { route: item.route } : {})
    }];
  });
}

function planningBlockers(value: unknown): StageBlocker[] {
  if (!value || typeof value !== 'object') return [];
  const blockers = (value as { blockers?: unknown }).blockers;
  if (!Array.isArray(blockers)) return [];
  return blockers.flatMap((blocker, index) => {
    if (!blocker || typeof blocker !== 'object') return [];
    const item = blocker as Record<string, unknown>;
    if (typeof item.description !== 'string') return [];
    return [{
      code: typeof item.code === 'string' ? item.code : `PLANNING_GATE_${index + 1}`,
      description: item.description,
      ...(typeof item.route === 'string' ? { route: item.route } : {})
    }];
  });
}

function blocker(code: string, description: string, route: string): StageBlocker {
  return { code, description, route };
}

async function leadIngestionBlockers(env: Env, workspaceId: string, engagementId: string): Promise<StageBlocker[]> {
  const row = await env.DB.prepare(`SELECT c.active AS clientActive,ct.active AS contactActive
    FROM engagements e
    JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id
    JOIN leads l ON l.workspace_id=e.workspace_id AND l.client_id=e.client_id AND l.converted_engagement_id=e.id AND l.status='CONVERTED'
    JOIN contacts ct ON ct.workspace_id=l.workspace_id AND ct.client_id=l.client_id AND ct.id=l.primary_contact_id
    WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId, engagementId)
    .first<{ clientActive: number; contactActive: number }>();
  const blockers: StageBlocker[] = [];
  if (!row) blockers.push(blocker('LEAD_SOURCE_REQUIRED', 'The engagement must retain its converted lead and primary contact source.', 'leads'));
  else {
    if (row.clientActive !== 1) blockers.push(blocker('ACTIVE_CLIENT_REQUIRED', 'Reactivate the client before advancing lead intake.', 'clients'));
    if (row.contactActive !== 1) blockers.push(blocker('ACTIVE_PRIMARY_CONTACT_REQUIRED', 'Assign an active primary contact before advancing lead intake.', 'clients'));
  }
  return blockers;
}

async function proposalGenerationBlockers(env: Env, workspaceId: string, engagementId: string): Promise<StageBlocker[]> {
  const row = await env.DB.prepare(`SELECT p.current_version_id AS currentVersionId,pv.id AS versionId,
      COALESCE((SELECT a.decision FROM proposal_approvals a WHERE a.workspace_id=p.workspace_id AND a.proposal_version_id=pv.id
        ORDER BY a.decided_at DESC,a.id DESC LIMIT 1),'PENDING') AS approvalDecision,
      (SELECT ga.file_version_id FROM proposal_artifacts pa JOIN generated_artifacts ga ON ga.workspace_id=pa.workspace_id AND ga.id=pa.artifact_id
        JOIN file_versions f ON f.workspace_id=ga.workspace_id AND f.id=ga.file_version_id
        WHERE pa.workspace_id=p.workspace_id AND pa.proposal_version_id=pv.id AND f.state='COMMITTED' AND f.immutable=1
          AND f.sha256=ga.content_sha256 AND f.size_bytes=ga.size_bytes ORDER BY ga.generated_at DESC LIMIT 1) AS artifactFileId,
      (SELECT j.status FROM outbox_jobs j WHERE j.workspace_id=p.workspace_id AND j.kind='GENERATE_DOCUMENT' AND j.aggregate_id=pv.id
        ORDER BY j.created_at DESC,j.id DESC LIMIT 1) AS renderStatus,
      (SELECT j.last_error_code FROM outbox_jobs j WHERE j.workspace_id=p.workspace_id AND j.kind='GENERATE_DOCUMENT' AND j.aggregate_id=pv.id
        ORDER BY j.created_at DESC,j.id DESC LIMIT 1) AS renderError,
      (SELECT d.status FROM dispatches d JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id
        WHERE d.workspace_id=p.workspace_id AND d.engagement_id=p.engagement_id AND d.purpose='PROPOSAL'
          AND d.file_version_id=(SELECT ga.file_version_id FROM proposal_artifacts pa
            JOIN generated_artifacts ga ON ga.workspace_id=pa.workspace_id AND ga.id=pa.artifact_id
            WHERE pa.workspace_id=p.workspace_id AND pa.proposal_version_id=pv.id ORDER BY ga.generated_at DESC LIMIT 1)
        ORDER BY d.created_at DESC,d.id DESC LIMIT 1) AS dispatchStatus,
      (SELECT j.last_error_code FROM dispatches d JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id
        WHERE d.workspace_id=p.workspace_id AND d.engagement_id=p.engagement_id AND d.purpose='PROPOSAL'
          AND d.file_version_id=(SELECT ga.file_version_id FROM proposal_artifacts pa
            JOIN generated_artifacts ga ON ga.workspace_id=pa.workspace_id AND ga.id=pa.artifact_id
            WHERE pa.workspace_id=p.workspace_id AND pa.proposal_version_id=pv.id ORDER BY ga.generated_at DESC LIMIT 1)
        ORDER BY d.created_at DESC,d.id DESC LIMIT 1) AS dispatchError,
      EXISTS(SELECT 1 FROM manual_dispatch_records md WHERE md.workspace_id=p.workspace_id AND md.proposal_version_id=pv.id) AS manualDispatchRecorded
    FROM engagements e LEFT JOIN proposals p ON p.workspace_id=e.workspace_id AND p.engagement_id=e.id
    LEFT JOIN proposal_versions pv ON pv.workspace_id=p.workspace_id AND pv.id=p.current_version_id
    WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId, engagementId).first<{
      currentVersionId: string | null; versionId: string | null; approvalDecision: string; artifactFileId: string | null;
      renderStatus: string | null; renderError: string | null; dispatchStatus: string | null; dispatchError: string | null;
      manualDispatchRecorded: number
    }>();
  const blockers: StageBlocker[] = [];
  if (!row?.versionId || row.versionId !== row.currentVersionId) {
    blockers.push(blocker('CURRENT_PROPOSAL_REQUIRED', 'Create a current proposal revision for this engagement.', 'proposals'));
    return blockers;
  }
  if (row.approvalDecision !== 'APPROVE') {
    blockers.push(blocker('PARTNER_PROPOSAL_APPROVAL_REQUIRED', 'The current proposal revision needs Partner approval.', 'proposals'));
  }
  if (!row.artifactFileId) {
    const failed = row.renderStatus === 'FAILED' || row.renderStatus === 'RETRYABLE_FAILED';
    blockers.push(blocker(failed ? 'PROPOSAL_RENDER_FAILED' : 'PROPOSAL_RENDER_PENDING',
      failed ? `The current proposal PDF failed to render${row.renderError ? ` (${row.renderError})` : ''}; retry rendering before dispatch.`
        : 'Generate and verify the current proposal PDF before dispatch.', 'proposals'));
  }
  if (row.artifactFileId && row.manualDispatchRecorded !== 1 && !['ACCEPTED', 'DELIVERED'].includes(row.dispatchStatus ?? '')) {
    if (row.dispatchStatus === 'FAILED' || row.dispatchStatus === 'BOUNCED' || row.dispatchStatus === 'UNKNOWN') {
      blockers.push(blocker('PROPOSAL_DISPATCH_FAILED', `The proposal dispatch is ${String(row.dispatchStatus).toLowerCase()}${row.dispatchError ? ` (${row.dispatchError})` : ''}; reconcile or retry it before the acceptance stage.`, 'proposals'));
    } else {
      blockers.push(blocker('PROPOSAL_DISPATCH_PENDING', 'Dispatch the approved proposal and wait for the provider to accept the message.', 'proposals'));
    }
  }
  return blockers;
}

async function advanceBillingBlockers(env: Env, workspaceId: string, context: BusinessContext, engagementId: string): Promise<StageBlocker[]> {
  const acceptance = acceptanceBlockers(await getBusinessAcceptanceGate(env, workspaceId, context, engagementId));
  const row = await env.DB.prepare(`SELECT l.id AS letterId,i.id AS invoiceId,i.status AS invoiceStatus,i.total_minor AS invoiceTotal,
      COALESCE(SUM(CASE WHEN p.reverses_payment_id IS NOT NULL THEN -pa.amount_minor ELSE pa.amount_minor END),0) AS allocatedMinor,
      SUM(CASE WHEN p.id IS NOT NULL AND (rv.id IS NULL OR rv.status<>'ISSUED') THEN 1 ELSE 0 END) AS receiptsPending
    FROM engagements e
    LEFT JOIN engagement_letters l ON l.workspace_id=e.workspace_id AND l.engagement_id=e.id
      AND l.proposal_version_id=e.active_proposal_version_id
    LEFT JOIN invoices i ON i.workspace_id=l.workspace_id AND i.engagement_letter_id=l.id AND i.kind='ADVANCE'
    LEFT JOIN payment_allocations pa ON pa.workspace_id=i.workspace_id AND pa.invoice_id=i.id
    LEFT JOIN payments p ON p.workspace_id=pa.workspace_id AND p.id=pa.payment_id
    LEFT JOIN receipt_vouchers rv ON rv.workspace_id=p.workspace_id AND rv.payment_id=p.id
    WHERE e.workspace_id=? AND e.id=? GROUP BY l.id,i.id`).bind(workspaceId, engagementId).first<{
      letterId: string | null; invoiceId: string | null; invoiceStatus: string | null; invoiceTotal: number | null;
      allocatedMinor: number | null; receiptsPending: number | null
    }>();
  const blockers = [...acceptance];
  if (!row?.letterId) {
    blockers.push(blocker('ISSUED_ENGAGEMENT_LETTER_REQUIRED', 'Generate and issue the engagement letter from the current accepted proposal and risk clearance.', 'engagement-letters'));
    return blockers;
  }
  if (!row.invoiceId || row.invoiceStatus !== 'ISSUED') {
    blockers.push(blocker(row.invoiceStatus === 'PENDING_DOCUMENT' ? 'ADVANCE_INVOICE_RENDER_PENDING' : 'ISSUED_ADVANCE_INVOICE_REQUIRED',
      row.invoiceStatus === 'PENDING_DOCUMENT' ? 'The advance invoice PDF is still being generated.' : 'Issue the 50% advance invoice and commit its verified PDF.', 'billing'));
    return blockers;
  }
  if (BigInt(row.allocatedMinor ?? 0) !== BigInt(row.invoiceTotal ?? 0)) {
    blockers.push(blocker('ADVANCE_PAYMENT_UNSETTLED', 'Fully settle the issued advance invoice through verified payment allocations.', 'billing'));
  }
  if (Number(row.receiptsPending ?? 0) > 0) {
    blockers.push(blocker('ISSUED_RECEIPTS_REQUIRED', 'Wait for every allocated payment receipt voucher to be rendered and issued.', 'billing'));
  }
  return blockers;
}

async function portalCredentialBlockers(env: Env, workspaceId: string, engagement: WorkflowEngagement): Promise<StageBlocker[]> {
  const route = await env.DB.prepare(`SELECT cr.id FROM engagements e
    JOIN contact_routes cr ON cr.workspace_id=e.workspace_id AND cr.client_id=e.client_id
    JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
    JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id
    WHERE e.workspace_id=? AND e.id=? AND c.active=1 AND cr.purpose='PBC' AND cr.is_primary=1
      AND ct.role='CHIEF_ACCOUNTANT_LIAISON' AND ct.active=1 AND ct.email IS NOT NULL
    ORDER BY cr.created_at,cr.id LIMIT 1`)
    .bind(workspaceId, engagement.id).first<{ id: string }>();
  if (!route) return [blocker('PORTAL_LIAISON_ROUTE_MISSING', 'Add an active primary PBC route for an Audit Liaison with an email address before issuing portal credentials.', 'clients')];

  const latestJob = await env.DB.prepare(`SELECT status,last_error_code FROM outbox_jobs
    WHERE workspace_id=? AND kind='EMAIL' AND json_extract(payload_json,'$.documentType')='PORTAL_CREDENTIALS'
      AND json_extract(payload_json,'$.engagementId')=? AND json_extract(payload_json,'$.contactRouteId')=?
    ORDER BY created_at DESC,id DESC LIMIT 1`)
    .bind(workspaceId, engagement.id, route.id).first<{ status: string; last_error_code: string | null }>();
  if (latestJob?.status === 'PERMANENT_FAILED' || latestJob?.status === 'UNKNOWN') {
    return [blocker('PORTAL_CREDENTIAL_EMAIL_FAILED', `Portal credential email delivery needs staff reconciliation${latestJob.last_error_code ? ` (${latestJob.last_error_code})` : ''}. Reissue credentials after resolving the provider or route issue.`, 'clients')];
  }
  if (latestJob && latestJob.status !== 'SUCCEEDED') {
    return [blocker('PORTAL_CREDENTIAL_EMAIL_PENDING', 'Portal credential email delivery is queued or retrying; wait for provider acceptance.', 'clients')];
  }
  if (!latestJob) {
    return [blocker('PORTAL_CREDENTIAL_PROVISIONING_BLOCKED', 'The active Audit Liaison route has no portal credential issue. Resolve the account or contact conflict, then reissue credentials.', 'clients')];
  }
  return [];
}

async function criticalConfirmationStageBlockers(env: Env, workspaceId: string, engagement: WorkflowEngagement): Promise<StageBlocker[]> {
  const rows = await criticalConfirmationBlockers(env, workspaceId, engagement);
  return rows.map(row => blocker(row.stalePins ? 'STALE_CRITICAL_CONFIRMATION' : 'CRITICAL_CONFIRMATION_OUTSTANDING',
    `Critical ${row.type} confirmation for ${row.externalPartyName} is ${row.status.replaceAll('_', ' ').toLowerCase()}${row.stalePins ? ' or pinned to replaced source versions' : ''}.`,
    '#audit-fieldwork'));
}

async function fieldworkExecutionBlockers(env: Env, workspaceId: string, engagement: WorkflowEngagement): Promise<StageBlocker[]> {
  const summary = await env.DB.prepare(`SELECT COUNT(*) AS programCount,
      SUM(CASE WHEN w.status<>'REVIEWED' OR w.planning_version_id IS NOT ? OR NOT EXISTS(
        SELECT 1 FROM review_submissions s JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id
        WHERE s.workspace_id=w.workspace_id AND s.workprogram_id=w.id AND s.target_kind='WORKPROGRAM' AND d.decision='ACCEPT' AND s.target_version+1=w.version
      ) THEN 1 ELSE 0 END) AS pendingPrograms,
      (SELECT COUNT(*) FROM procedures p JOIN workprograms wp ON wp.workspace_id=p.workspace_id AND wp.id=p.workprogram_id
        WHERE wp.workspace_id=? AND wp.engagement_id=?) AS procedureCount,
      (SELECT COUNT(*) FROM procedures p JOIN workprograms wp ON wp.workspace_id=p.workspace_id AND wp.id=p.workprogram_id
        WHERE wp.workspace_id=? AND wp.engagement_id=? AND (p.status<>'REVIEWED' OR NOT EXISTS(
          SELECT 1 FROM review_submissions s JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id
          WHERE s.workspace_id=p.workspace_id AND s.procedure_id=p.id AND s.target_kind='PROCEDURE' AND d.decision='ACCEPT' AND s.target_version+1=p.version
        ))) AS pendingProcedures
    FROM workprograms w WHERE w.workspace_id=? AND w.engagement_id=?`)
    .bind(engagement.approved_planning_version_id, workspaceId, engagement.id, workspaceId, engagement.id, workspaceId, engagement.id)
    .first<{ programCount: number; pendingPrograms: number | null; procedureCount: number; pendingProcedures: number }>();
  const blockers: StageBlocker[] = [];
  if (!Number(summary?.programCount)) blockers.push(blocker('CURRENT_WORKPROGRAMS_REQUIRED', 'Generate the approved-planning workprograms before handing fieldwork to Managerial Review.', '#audit-fieldwork'));
  else if (Number(summary?.pendingPrograms ?? 0) > 0) blockers.push(blocker('WORKPROGRAMS_NOT_INDEPENDENTLY_ACCEPTED',
    `${Number(summary?.pendingPrograms)} workprogram(s) are not current, Manager-reviewed and independently accepted.`, '#audit-fieldwork'));
  if (!Number(summary?.procedureCount)) blockers.push(blocker('FIELDWORK_PROCEDURES_REQUIRED', 'Create at least one applicable procedure for the current workprograms.', '#audit-fieldwork'));
  else if (Number(summary?.pendingProcedures ?? 0) > 0) blockers.push(blocker('FIELDWORK_PROCEDURES_NOT_ACCEPTED',
    `${Number(summary?.pendingProcedures)} procedure(s) still need complete results and independent Manager acceptance.`, '#audit-fieldwork'));

  const pendingReviews = await env.DB.prepare(`SELECT COUNT(*) AS count FROM review_submissions s
    LEFT JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id
    WHERE s.workspace_id=? AND s.engagement_id=? AND s.target_kind IN ('ANALYTICAL_REVIEW','GOING_CONCERN') AND d.id IS NULL`)
    .bind(workspaceId, engagement.id).first<{ count: number }>();
  if (Number(pendingReviews?.count ?? 0) > 0) blockers.push(blocker('FIELDWORK_REVIEWS_PENDING',
    `${Number(pendingReviews?.count)} analytical or going-concern review submission(s) are still awaiting an independent decision.`, '#audit-fieldwork'));
  const openNotes = await env.DB.prepare(`SELECT COUNT(*) AS count FROM review_notes n JOIN review_submissions s ON s.workspace_id=n.workspace_id AND s.id=n.submission_id
    WHERE s.workspace_id=? AND s.engagement_id=? AND n.status<>'CLOSED'`).bind(workspaceId, engagement.id).first<{ count: number }>();
  if (Number(openNotes?.count ?? 0) > 0) blockers.push(blocker('FIELDWORK_REVIEW_NOTES_OPEN',
    `${Number(openNotes?.count)} review note(s) remain open or awaiting closure.`, '#audit-fieldwork'));
  blockers.push(...await criticalConfirmationStageBlockers(env, workspaceId, engagement));

  if (!blockers.some(item => item.code === 'FIELDWORK_PROCEDURES_NOT_ACCEPTED') && engagement.active_tb_version_id) {
    const procedures = await env.DB.prepare(`SELECT p.id,p.evidence_set_hash AS evidenceSetHash FROM procedures p
      JOIN workprograms w ON w.workspace_id=p.workspace_id AND w.id=p.workprogram_id
      WHERE w.workspace_id=? AND w.engagement_id=? AND p.status='REVIEWED'`)
      .bind(workspaceId, engagement.id).all<{ id: string; evidenceSetHash: string }>();
    for (const procedure of procedures.results ?? []) {
      try {
        await assertProcedureEvidenceCurrent(env, workspaceId, procedure.id, procedure.evidenceSetHash);
        await procedureSamplingPins(env, workspaceId, procedure.id, engagement.active_tb_version_id, true);
      } catch (error) {
        blockers.push(blocker('FIELDWORK_EVIDENCE_OR_SAMPLING_STALE',
          error instanceof Error ? error.message : 'Revalidate the current procedure evidence and sampling support.', '#audit-fieldwork'));
        break;
      }
    }
  }
  return blockers;
}

async function managerialReviewBlockers(env: Env, workspaceId: string, context: BusinessContext, engagement: WorkflowEngagement): Promise<StageBlocker[]> {
  const summary = await env.DB.prepare(`SELECT COUNT(*) AS programCount,
      SUM(CASE WHEN w.status<>'PARTNER_CLEARED' OR w.planning_version_id IS NOT ? THEN 1 ELSE 0 END) AS unclearedPrograms,
      (SELECT COUNT(*) FROM procedures p JOIN workprograms wp ON wp.workspace_id=p.workspace_id AND wp.id=p.workprogram_id
        WHERE wp.workspace_id=? AND wp.engagement_id=?) AS procedureCount,
      (SELECT COUNT(*) FROM procedures p JOIN workprograms wp ON wp.workspace_id=p.workspace_id AND wp.id=p.workprogram_id
        WHERE wp.workspace_id=? AND wp.engagement_id=? AND p.status<>'REVIEWED') AS unreviewedProcedures
    FROM workprograms w WHERE w.workspace_id=? AND w.engagement_id=?`)
    .bind(engagement.approved_planning_version_id, workspaceId, engagement.id, workspaceId, engagement.id, workspaceId, engagement.id)
    .first<{ programCount: number; unclearedPrograms: number | null; procedureCount: number; unreviewedProcedures: number }>();
  const blockers: StageBlocker[] = [];
  if (!Number(summary?.programCount)) blockers.push(blocker('CURRENT_WORKPROGRAMS_REQUIRED', 'Create current workprograms and complete the Manager handover.', '#audit-fieldwork'));
  else if (Number(summary?.unclearedPrograms ?? 0) > 0) blockers.push(blocker('PARTNER_AREA_CLEARANCE_REQUIRED',
    `${Number(summary?.unclearedPrograms)} workprogram area(s) still need current Partner clearance against the approved planning version.`, '#audit-fieldwork'));
  if (!Number(summary?.procedureCount) || Number(summary?.unreviewedProcedures ?? 0) > 0) blockers.push(blocker('FIELDWORK_REVIEW_INCOMPLETE',
    Number(summary?.procedureCount) ? `${Number(summary?.unreviewedProcedures)} procedure(s) still need accepted Manager review.` : 'The current workprograms do not contain procedures.', '#audit-fieldwork'));
  const pendingReviews = await env.DB.prepare(`SELECT COUNT(*) AS count FROM review_submissions s
    LEFT JOIN review_decisions d ON d.workspace_id=s.workspace_id AND d.submission_id=s.id
    WHERE s.workspace_id=? AND s.engagement_id=? AND s.target_kind IN ('ANALYTICAL_REVIEW','GOING_CONCERN') AND d.id IS NULL`)
    .bind(workspaceId, engagement.id).first<{ count: number }>();
  if (Number(pendingReviews?.count ?? 0) > 0) blockers.push(blocker('MANAGERIAL_REVIEWS_PENDING',
    `${Number(pendingReviews?.count)} analytical or going-concern submission(s) still await an independent decision.`, '#audit-fieldwork'));
  const openNotes = await env.DB.prepare(`SELECT COUNT(*) AS count FROM review_notes n JOIN review_submissions s ON s.workspace_id=n.workspace_id AND s.id=n.submission_id
    WHERE s.workspace_id=? AND s.engagement_id=? AND n.status<>'CLOSED'`).bind(workspaceId, engagement.id).first<{ count: number }>();
  if (Number(openNotes?.count ?? 0) > 0) blockers.push(blocker('MANAGERIAL_REVIEW_NOTES_OPEN',
    `${Number(openNotes?.count)} review note(s) remain open or awaiting closure.`, '#audit-fieldwork'));
  blockers.push(...await criticalConfirmationStageBlockers(env, workspaceId, engagement));
  if (context.allowedActions.includes('fieldwork.read')) {
    const srm = await getBusinessSrmCurrentness(env, workspaceId, context, engagement.id);
    if (!srm.srmVersionId || !srm.current) blockers.push(blocker(srm.srmVersionId ? 'MANAGER_SRM_STALE' : 'MANAGER_SRM_REQUIRED',
      srm.reason ?? 'Compile a current Manager SRM recommendation against the approved evidence.', '#audit-fieldwork'));
  }
  return blockers;
}

async function partnerApprovalBlockers(env: Env, workspaceId: string, context: BusinessContext, engagement: WorkflowEngagement): Promise<StageBlocker[]> {
  if (!context.allowedActions.includes('fieldwork.read')) return [blocker('PARTNER_RELEASE_PENDING',
    'The engagement is awaiting authorized Partner completion of review and final reporting.', '#client-portal')];
  const blockers: StageBlocker[] = [];
  const srm = await getBusinessSrmCurrentness(env, workspaceId, context, engagement.id);
  if (!srm.srmVersionId || !srm.current) blockers.push(blocker(srm.srmVersionId ? 'MANAGER_SRM_STALE' : 'MANAGER_SRM_REQUIRED',
    srm.reason ?? 'Compile a current Manager SRM recommendation.', '#audit-fieldwork'));
  if (srm.srmVersionId && srm.current) {
    const clearance = await env.DB.prepare(`SELECT 1 AS present FROM srm_clearances WHERE workspace_id=? AND srm_version_id=? AND dependency_hash=? LIMIT 1`)
      .bind(workspaceId, srm.srmVersionId, srm.dependencyHash).first<{ present: number }>();
    if (!clearance) blockers.push(blocker('PARTNER_SRM_CLEARANCE_REQUIRED', 'The current Manager SRM recommendation needs a reasoned Partner clearance.', '#audit-fieldwork'));
    const opinion = await env.DB.prepare(`SELECT 1 AS present FROM opinion_versions WHERE workspace_id=? AND engagement_id=? AND srm_version_id=? ORDER BY revision DESC LIMIT 1`)
      .bind(workspaceId, engagement.id, srm.srmVersionId).first<{ present: number }>();
    if (!opinion) blockers.push(blocker('PARTNER_OPINION_REQUIRED', 'Select and review an opinion against the current cleared SRM; AUP engagements use their approved AUP report type.', '#reporting'));
  }
  blockers.push(...await criticalConfirmationStageBlockers(env, workspaceId, engagement));
  const candidate = await env.DB.prepare(`SELECT b.id,b.status,b.failure_code AS failureCode,
      (SELECT COUNT(*) FROM bundle_candidate_parts p WHERE p.workspace_id=b.workspace_id AND p.candidate_id=b.id) AS partCount
    FROM bundle_candidates b WHERE b.workspace_id=? AND b.engagement_id=? ORDER BY b.revision DESC LIMIT 1`)
    .bind(workspaceId, engagement.id).first<{ id: string; status: string; failureCode: string | null; partCount: number }>();
  if (!candidate) blockers.push(blocker('FIVE_PART_BUNDLE_CANDIDATE_REQUIRED',
    'Complete statement approval, signature consent, the reviewed management letter and accepted representation, then prepare the private five-part bundle.', '#reporting'));
  else if (candidate.status !== 'READY') blockers.push(blocker(candidate.status === 'FAILED' ? 'FIVE_PART_BUNDLE_PREPARATION_FAILED' : 'FIVE_PART_BUNDLE_PREPARATION_PENDING',
    candidate.status === 'FAILED' ? `The latest five-part bundle candidate failed${candidate.failureCode ? ` (${candidate.failureCode})` : ''}; resolve the listed source issue and prepare a new candidate.`
      : `The latest five-part bundle candidate is ${candidate.status.toLowerCase().replaceAll('_', ' ')}.`, '#reporting'));
  else if (Number(candidate.partCount) !== 5) blockers.push(blocker('FIVE_PART_BUNDLE_INCOMPLETE',
    `The ready candidate has ${Number(candidate.partCount)} of five verified parts; reprepare it before release.`, '#reporting'));
  else blockers.push(blocker('PARTNER_FINAL_RELEASE_REQUIRED',
    'Review and atomically release the current five-part candidate to sign the report, issue the final invoice, publish the client downloads and freeze portal uploads.', '#reporting'));
  return blockers;
}

async function countdownBlockers(env: Env, workspaceId: string, engagementId: string, now: string): Promise<StageBlocker[]> {
  const row = await env.DB.prepare(`SELECT e.report_signed_at AS signedAt,e.archive_due_at AS dueAt,e.locked_at AS lockedAt,
      r.status AS runStatus,r.error_code AS errorCode,s.id AS sealId
    FROM engagements e LEFT JOIN archive_runs r ON r.workspace_id=e.workspace_id AND r.engagement_id=e.id
    LEFT JOIN archive_seals s ON s.workspace_id=e.workspace_id AND s.engagement_id=e.id
    WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId, engagementId)
    .first<{ signedAt: string | null; dueAt: string | null; lockedAt: string | null; runStatus: string | null; errorCode: string | null; sealId: string | null }>();
  if (!row?.signedAt || !row.dueAt) return [blocker('RELEASE_DEADLINE_MISSING', 'The signed release timestamp and server-derived 60-day archive deadline are required.', '#reporting')];
  if (row.sealId) return [];
  const due = row.dueAt <= now;
  if (row.runStatus === 'FAILED') return [blocker('ARCHIVE_ASSEMBLY_FAILED',
    `The archive sealing attempt failed${row.errorCode ? ` (${row.errorCode})` : ''}; resolve the operational error and retry sealing.`, '#reporting')];
  if ((due || row.lockedAt) && !row.runStatus) return [blocker('ARCHIVE_SEAL_JOB_REQUIRED',
    'The archive deadline or early lock is active, but no sealing run is recorded. Queue the archive seal and verify its manifest and original bytes.', '#reporting')];
  if (row.runStatus === 'SEALED' && !row.sealId) return [blocker('ARCHIVE_SEAL_RECORD_MISSING',
    'The archive run reports sealed without a matching archive seal record; reconcile the archive before marking it read-only.', '#reporting')];
  return [];
}

async function archivedReadOnlyBlockers(env: Env, workspaceId: string, engagementId: string): Promise<StageBlocker[]> {
  const seal = await env.DB.prepare(`SELECT s.manifest_sha256 AS manifestHash,s.archive_sha256 AS archiveHash,
      mf.sha256 AS storedManifestHash,mf.state AS manifestState,mf.immutable AS manifestImmutable,
      af.sha256 AS storedArchiveHash,af.state AS archiveState,af.immutable AS archiveImmutable
    FROM archive_seals s LEFT JOIN file_versions mf ON mf.workspace_id=s.workspace_id AND mf.id=s.manifest_file_id
    LEFT JOIN file_versions af ON af.workspace_id=s.workspace_id AND af.id=s.archive_file_id
    WHERE s.workspace_id=? AND s.engagement_id=?`).bind(workspaceId, engagementId)
    .first<{ manifestHash: string; archiveHash: string; storedManifestHash: string | null; manifestState: string | null; manifestImmutable: number | null;
      storedArchiveHash: string | null; archiveState: string | null; archiveImmutable: number | null }>();
  if (!seal) return [blocker('ARCHIVE_SEAL_REQUIRED', 'The engagement is marked read-only without a sealed archive manifest and archive file.', '#reporting')];
  if (seal.manifestHash !== seal.storedManifestHash || seal.archiveHash !== seal.storedArchiveHash
    || seal.manifestState !== 'COMMITTED' || seal.archiveState !== 'COMMITTED' || seal.manifestImmutable !== 1 || seal.archiveImmutable !== 1) {
    return [blocker('ARCHIVE_SEAL_INTEGRITY_MISMATCH', 'The sealed archive manifest or archive file is missing, mutable or inconsistent with its recorded hash.', '#reporting')];
  }
  return [];
}

/** Projects lifecycle position and current, server-derived blockers from persisted business records. */
export async function getBusinessWorkflow(
  env: Env,
  workspaceId: string,
  context: BusinessContext,
  engagementId: string
): Promise<{
  state: LifecycleState;
  sourceVersion: number;
  stages: Array<{
    id: LifecycleState;
    label: string;
    status: StageStatus;
    completedCount: number;
    requiredCount: number;
    blockers: StageBlocker[];
    blockerCoverage: 'evaluated' | 'module-detail';
  }>;
}> {
  if (!context.allowedActions.includes('engagement.read')) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'This persona cannot read engagement workflow progress.');
  }
  const engagement = await env.DB.prepare(`SELECT id,version,client_id,lifecycle_state,active_tb_version_id,active_mapping_version_id,
      active_materiality_version_id,approved_planning_version_id FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, engagementId)
    .first<WorkflowEngagement>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement was not found in this workspace.');
  const currentIndex = lifecycleIndex(engagement.lifecycle_state);
  if (currentIndex < 0) throw new ApiError('UNAVAILABLE', 'The engagement lifecycle state is not recognized.');
  if ((context.scope.engagementId && context.scope.engagementId !== engagementId)
    || (context.scope.clientId && context.scope.clientId !== engagement.client_id)
    || (context.actor.persona === 'CLIENT' && context.actor.clientId !== engagement.client_id)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The engagement is outside the selected request scope.');
  }
  const source = await env.DB.prepare(`SELECT last_sequence FROM audit_chain_heads
    WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`).bind(workspaceId, workspaceId)
    .first<{ last_sequence: number }>();
  if (!source) throw new ApiError('UNAVAILABLE', 'Workspace workflow lineage is not initialized.');

  const transitions = await env.DB.prepare(`SELECT from_state,to_state,transitioned_at FROM state_transitions
    WHERE workspace_id=? AND engagement_id=? ORDER BY transitioned_at DESC,id DESC LIMIT 1`)
    .bind(workspaceId, engagementId).first<TransitionRow>();
  const fromIndex = transitions?.to_state === engagement.lifecycle_state ? lifecycleIndex(transitions.from_state) : -1;
  const returnedFromIndex = fromIndex > currentIndex ? fromIndex : -1;

  let blockers: StageBlocker[] = [];
  let blockerCoverage: 'evaluated' | 'module-detail' = 'module-detail';
  if (engagement.lifecycle_state === 'LEAD_INGESTION' && context.allowedActions.includes('engagement.advance')) {
    blockers = await leadIngestionBlockers(env, workspaceId, engagementId);
    blockerCoverage = 'evaluated';
  } else if (engagement.lifecycle_state === 'PROPOSAL_GENERATION' && context.allowedActions.includes('proposal.read')) {
    blockers = await proposalGenerationBlockers(env, workspaceId, engagementId);
    blockerCoverage = 'evaluated';
  } else if (engagement.lifecycle_state === 'DUAL_KEY_PENDING' && context.allowedActions.includes('commercialAcceptance.read')) {
    blockers = acceptanceBlockers(await getBusinessAcceptanceGate(env, workspaceId, context, engagementId));
    blockerCoverage = 'evaluated';
  } else if (engagement.lifecycle_state === 'ADVANCE_BILLING'
    && context.allowedActions.includes('commercialAcceptance.read') && context.allowedActions.includes('billing.read')) {
    blockers = await advanceBillingBlockers(env, workspaceId, context, engagementId);
    blockerCoverage = 'evaluated';
  } else if (engagement.lifecycle_state === 'PORTAL_ACTIVE_PLANNING' && context.allowedActions.includes('planning.read')) {
    blockers = planningBlockers(await getBusinessPlanningReadiness(env, workspaceId, context, engagementId));
    if (context.actor.persona !== 'CLIENT') blockers.push(...await portalCredentialBlockers(env, workspaceId, engagement));
    blockerCoverage = 'evaluated';
  } else if (engagement.lifecycle_state === 'FIELDWORK_EXECUTION') {
    if (context.allowedActions.includes('fieldwork.read')) blockers = await fieldworkExecutionBlockers(env, workspaceId, engagement);
    else blockers = [blocker('INTERNAL_FIELDWORK_REVIEW_PENDING', 'The engagement is awaiting internal fieldwork review; internal review details are not shown in the client workflow.', '#client-portal')];
    blockerCoverage = 'evaluated';
  } else if (engagement.lifecycle_state === 'MANAGERIAL_REVIEW') {
    if (context.allowedActions.includes('fieldwork.read')) blockers = await managerialReviewBlockers(env, workspaceId, context, engagement);
    else blockers = [blocker('INTERNAL_MANAGER_REVIEW_PENDING', 'The engagement is awaiting internal Manager review; internal review details are not shown in the client workflow.', '#client-portal')];
    blockerCoverage = 'evaluated';
  } else if (engagement.lifecycle_state === 'PARTNER_APPROVAL' && context.allowedActions.includes('reporting.read')) {
    blockers = await partnerApprovalBlockers(env, workspaceId, context, engagement);
    blockerCoverage = 'evaluated';
  } else if (engagement.lifecycle_state === 'DELIVERABLE_RELEASE' && context.allowedActions.includes('reporting.read')) {
    blockers = [blocker('ATOMIC_REPORT_RELEASE_PENDING', 'The five-part package is being validated for atomic publication; no report or portal download is available until all release checks commit.', '#reporting')];
    blockerCoverage = 'evaluated';
  } else if (engagement.lifecycle_state === 'COMPLIANCE_COUNTDOWN' && context.allowedActions.includes('reporting.read')) {
    blockers = await countdownBlockers(env, workspaceId, engagementId, new Date().toISOString());
    blockerCoverage = 'evaluated';
  } else if (engagement.lifecycle_state === 'ARCHIVED_READ_ONLY' && context.allowedActions.includes('reporting.read')) {
    blockers = await archivedReadOnlyBlockers(env, workspaceId, engagementId);
    blockerCoverage = 'evaluated';
  }

  const [currentEngagement, currentSource] = await Promise.all([
    env.DB.prepare(`SELECT version,lifecycle_state FROM engagements WHERE workspace_id=? AND id=?`)
      .bind(workspaceId, engagementId).first<{ version: number; lifecycle_state: string }>(),
    env.DB.prepare(`SELECT last_sequence FROM audit_chain_heads
      WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`).bind(workspaceId, workspaceId)
      .first<{ last_sequence: number }>()
  ]);
  if (!currentEngagement || !currentSource || currentEngagement.version !== engagement.version
    || currentEngagement.lifecycle_state !== engagement.lifecycle_state || currentSource.last_sequence !== source.last_sequence) {
    throw new ApiError('VERSION_CONFLICT', 'The workspace changed while workflow progress was calculated. Refresh and retry.');
  }

  const stages = LIFECYCLE.map((stage, index) => {
    let status: StageStatus;
    if (index < currentIndex) status = 'completed';
    else if (index === currentIndex) {
      status = engagement.lifecycle_state === 'ARCHIVED_READ_ONLY' && !blockers.length ? 'completed' : blockers.length ? 'blocked' : 'current';
    } else if (returnedFromIndex > currentIndex && index === returnedFromIndex) status = 'rework';
    else if (returnedFromIndex > currentIndex && index < returnedFromIndex) status = 'stale';
    else status = 'pending';

    const appliesToCurrentStage = index === currentIndex;
    return {
      ...stage,
      status,
      completedCount: status === 'completed' ? 1 : 0,
      requiredCount: 1,
      blockers: appliesToCurrentStage ? blockers : [],
      blockerCoverage: appliesToCurrentStage ? blockerCoverage : 'module-detail' as const
    };
  });

  return { state: engagement.lifecycle_state as LifecycleState, sourceVersion: Number(source.last_sequence), stages };
}
