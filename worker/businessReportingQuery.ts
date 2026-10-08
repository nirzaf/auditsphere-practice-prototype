import type { Env } from './env';
import { ApiError } from './errors';
import type { BusinessContext } from './business';
import { sha256Hex } from './http';
import { buildOpinionReportSections, opinionReportingBlockers, type OpinionAffectedFsli } from './reportingOpinion';
import { toHex, verifyStreamingSha256 } from './streamingArchive';

type Row = Record<string, unknown>;

/** Exact, Partner-only projection used before report preparation. */
export async function getBusinessOpinionPreview(env: Env, workspaceId: string, context: BusinessContext, engagementId: string, opinionVersionId: string): Promise<Row> {
  if (context.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER' || !context.allowedActions.includes('reporting.read')) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only a Partner approver can preview an internal reporting opinion.');
  }
  const engagement = await env.DB.prepare(`SELECT id,client_id,standards_profile_id FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, engagementId).first<{ id: string; client_id: string; standards_profile_id: string }>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement was not found.');
  if ((context.scope.clientId && context.scope.clientId !== engagement.client_id)
    || (context.scope.engagementId && context.scope.engagementId !== engagementId)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The engagement is outside the selected scope.');
  }
  const opinion = await env.DB.prepare(`SELECT id,revision,srm_version_id,standards_profile_id,report_type,category,aup_report_type,aup_procedure_summary,
      rationale,materiality_assessment,pervasiveness_assessment,basis_heading,basis_text,going_concern_reporting_text,additional_sections_json,dependency_hash
    FROM opinion_versions WHERE workspace_id=? AND engagement_id=? AND id=?`)
    .bind(workspaceId, engagementId, opinionVersionId).first<Row>();
  if (!opinion) throw new ApiError('NOT_FOUND', 'The opinion version was not found for this engagement.');
  const [affected, currentSrm, going, latestGoing] = await Promise.all([
    env.DB.prepare(`SELECT f.code,f.name,a.amount_minor AS amountMinor,a.explanation
      FROM opinion_affected_fslis a JOIN fsli_catalog f ON f.workspace_id=a.workspace_id AND f.id=a.fsli_id
      WHERE a.workspace_id=? AND a.opinion_version_id=? ORDER BY f.presentation_order,f.code`)
      .bind(workspaceId, opinionVersionId).all<OpinionAffectedFsli>(),
    env.DB.prepare(`SELECT s.id,s.dependency_hash,s.going_concern_id,c.dependency_hash AS clearance_hash
      FROM srm_versions s LEFT JOIN srm_clearances c ON c.workspace_id=s.workspace_id AND c.srm_version_id=s.id
      WHERE s.workspace_id=? AND s.engagement_id=? ORDER BY s.revision DESC,c.signed_at DESC LIMIT 1`)
      .bind(workspaceId, engagementId).first<{ id: string; dependency_hash: string; going_concern_id: string; clearance_hash: string | null }>(),
    env.DB.prepare(`SELECT g.id,g.status,g.conclusion FROM opinion_versions o
      JOIN srm_versions s ON s.workspace_id=o.workspace_id AND s.id=o.srm_version_id
      JOIN going_concern_assessments g ON g.workspace_id=s.workspace_id AND g.id=s.going_concern_id
      WHERE o.workspace_id=? AND o.id=?`).bind(workspaceId, opinionVersionId).first<{ id: string; status: string; conclusion: string }>(),
    env.DB.prepare(`SELECT id,status FROM going_concern_assessments WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC LIMIT 1`)
      .bind(workspaceId, engagementId).first<{ id: string; status: string }>()
  ]);
  const additionalSections = JSON.parse(String(opinion.additional_sections_json)) as Array<{ heading: string; body: string }>;
  const sections = buildOpinionReportSections({
    reportType: String(opinion.report_type), category: opinion.category === null ? null : String(opinion.category),
    aupReportType: opinion.aup_report_type === null ? null : String(opinion.aup_report_type),
    aupProcedureSummary: opinion.aup_procedure_summary === null ? null : String(opinion.aup_procedure_summary),
    rationale: String(opinion.rationale), materialityAssessment: String(opinion.materiality_assessment),
    pervasivenessAssessment: String(opinion.pervasiveness_assessment), basisHeading: opinion.basis_heading === null ? null : String(opinion.basis_heading),
    basisText: opinion.basis_text === null ? null : String(opinion.basis_text),
    goingConcernReportingText: opinion.going_concern_reporting_text === null ? null : String(opinion.going_concern_reporting_text), additionalSections
  }, affected.results ?? []);
  const isCurrentForSrm = Boolean(currentSrm && currentSrm.id === opinion.srm_version_id
    && currentSrm.clearance_hash === currentSrm.dependency_hash && opinion.standards_profile_id === engagement.standards_profile_id
    && going && going.status === 'REVIEWED' && latestGoing?.id === going.id);
  const reportingBlockers = opinionReportingBlockers(String(opinion.report_type), going?.conclusion ?? null,
    opinion.going_concern_reporting_text === null ? null : String(opinion.going_concern_reporting_text));
  if (!going || going.status !== 'REVIEWED' || latestGoing?.id !== going.id) {
    reportingBlockers.unshift('The going-concern assessment pinned to this SRM is no longer the current independently reviewed assessment.');
  }
  if (!isCurrentForSrm) reportingBlockers.unshift('This opinion is not pinned to the current cleared SRM and standards profile; select a new version before report preparation.');
  return {
    engagementId, opinionVersionId, revision: opinion.revision, reportType: opinion.report_type, category: opinion.category,
    aupReportType: opinion.aup_report_type, dependencyHash: opinion.dependency_hash, isCurrentForSrm, sections, reportingBlockers
  };
}
/** Released-only, Partner-scoped record of the immutable report signature and every pinned source hash. */
export async function getBusinessReleasedReportProvenance(env: Env, workspaceId: string, context: BusinessContext, engagementId: string): Promise<Row> {
  if (context.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER' || !context.allowedActions.includes('reporting.read')) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only a Partner approver can read internal released-report provenance.');
  }
  const engagement = await env.DB.prepare(`SELECT e.id,e.client_id,e.code,e.period_start,e.period_end,e.report_signed_at,e.report_date,e.released_at,c.legal_name AS client_name
    FROM engagements e JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id WHERE e.workspace_id=? AND e.id=?`)
    .bind(workspaceId, engagementId).first<Row>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement was not found.');
  if ((context.scope.clientId && context.scope.clientId !== engagement.client_id)
    || (context.scope.engagementId && context.scope.engagementId !== engagementId)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The engagement is outside the selected scope.');
  }

  const row = await env.DB.prepare(`SELECT
      b.id AS bundle_id,b.revision AS bundle_revision,b.content_hash AS bundle_hash,b.released_at AS bundle_released_at,b.released_by_actor_id AS released_by_actor_id,
      sig.id AS signature_id,sig.report_artifact_id AS signature_artifact_id,sig.signature_file_sha256 AS signature_sha256,sig.seal_file_sha256 AS seal_sha256,
      sig.signed_at AS signed_at,sig.report_date AS report_date,sig.final_file_sha256 AS final_file_sha256,sig.signing_method AS signing_method,
      consent.id AS consent_id,consent.actor_id AS consent_actor_id,consent.actor_staff_member_id AS consent_staff_member_id,
      consent.actor_display_name AS consent_display_name,consent.actor_persona AS consent_persona,consent.attribution AS consent_attribution,
      consent.consented_at AS consented_at,consent.proposed_report_date AS consent_report_date,consent.candidate_content_hash AS consent_candidate_hash,
      consent.report_candidate_id AS consent_candidate_id,consent.opinion_version_id AS consent_opinion_id,consent.signature_asset_id AS consent_asset_id,
      candidate.id AS report_candidate_id,candidate.status AS candidate_status,candidate.dependency_hash AS candidate_dependency_hash,
      candidate.report_artifact_id AS candidate_artifact_id,candidate.opinion_version_id AS candidate_opinion_id,candidate.financial_statement_approval_id AS candidate_approval_id,
      candidate.signature_asset_id AS candidate_asset_id,candidate.proposed_report_date AS candidate_report_date,
      candidate_artifact.content_sha256 AS candidate_content_sha256,
      opinion.id AS opinion_id,opinion.revision AS opinion_revision,opinion.report_type AS report_type,opinion.category AS opinion_category,
      opinion.aup_report_type AS aup_report_type,opinion.dependency_hash AS opinion_hash,opinion.srm_version_id AS opinion_srm_id,
      srm.id AS srm_id,srm.dependency_hash AS srm_hash,srm.statement_snapshot_id AS statement_snapshot_id,
      snapshot.source_hash AS statement_hash,snapshot.tb_version_id AS tb_version_id,snapshot.mapping_version_id AS mapping_version_id,
      approval.id AS statement_approval_id,approval.draft_id AS statement_draft_id,approval.draft_version AS statement_draft_version,
      approval.statement_snapshot_id AS approval_snapshot_id,approval.source_hash AS statement_approval_hash,
      asset.id AS signature_asset_id,asset.staff_member_id AS asset_owner_id,asset.owner_display_name AS asset_owner_name,asset.owner_grade AS asset_owner_grade,
      asset.signature_file_id AS signature_file_id,asset.seal_file_id AS seal_file_id,asset.signature_sha256 AS asset_signature_hash,asset.seal_sha256 AS asset_seal_hash,
      asset.signature_width AS signature_width,asset.signature_height AS signature_height,asset.seal_width AS seal_width,asset.seal_height AS seal_height,
      asset.label AS asset_label,asset.status AS asset_status,asset.uploaded_at AS asset_uploaded_at,
      signature_file.sha256 AS signature_file_hash,signature_file.media_type AS signature_media_type,signature_file.size_bytes AS signature_size_bytes,
      seal_file.sha256 AS seal_file_hash,seal_file.media_type AS seal_media_type,seal_file.size_bytes AS seal_size_bytes,
      artifact.id AS report_artifact_id,artifact.file_version_id AS final_file_id,artifact.content_sha256 AS artifact_file_hash,artifact.size_bytes AS artifact_size_bytes,
      final_file.sha256 AS final_file_row_hash,final_file.original_name AS final_file_name,final_file.media_type AS final_file_media_type,
      part.sha256 AS released_part_hash,part.size_bytes AS released_part_size_bytes
    FROM deliverable_bundles b
    JOIN engagements e ON e.workspace_id=b.workspace_id AND e.id=b.engagement_id AND e.released_at IS NOT NULL
    JOIN report_signatures sig ON sig.workspace_id=b.workspace_id AND sig.id=b.report_signature_id AND sig.engagement_id=b.engagement_id
    JOIN report_signature_consents consent ON consent.workspace_id=sig.workspace_id AND consent.id=sig.consent_id
    JOIN report_candidates candidate ON candidate.workspace_id=b.workspace_id AND candidate.id=b.report_candidate_id AND candidate.id=consent.report_candidate_id
    JOIN generated_artifacts candidate_artifact ON candidate_artifact.workspace_id=candidate.workspace_id AND candidate_artifact.id=candidate.report_artifact_id
    JOIN opinion_versions opinion ON opinion.workspace_id=b.workspace_id AND opinion.id=b.opinion_version_id
      AND opinion.id=candidate.opinion_version_id AND opinion.id=consent.opinion_version_id
    JOIN srm_versions srm ON srm.workspace_id=b.workspace_id AND srm.id=b.srm_version_id AND srm.id=opinion.srm_version_id
    JOIN statement_snapshots snapshot ON snapshot.workspace_id=srm.workspace_id AND snapshot.id=srm.statement_snapshot_id
    JOIN financial_statement_approvals approval ON approval.workspace_id=candidate.workspace_id AND approval.id=candidate.financial_statement_approval_id
    JOIN report_signature_assets asset ON asset.workspace_id=consent.workspace_id AND asset.id=consent.signature_asset_id
      AND asset.id=candidate.signature_asset_id
    JOIN file_versions signature_file ON signature_file.workspace_id=asset.workspace_id AND signature_file.id=asset.signature_file_id
    JOIN file_versions seal_file ON seal_file.workspace_id=asset.workspace_id AND seal_file.id=asset.seal_file_id
    JOIN generated_artifacts artifact ON artifact.workspace_id=sig.workspace_id AND artifact.id=sig.report_artifact_id
    JOIN file_versions final_file ON final_file.workspace_id=artifact.workspace_id AND final_file.id=artifact.file_version_id
    JOIN deliverable_parts part ON part.workspace_id=b.workspace_id AND part.bundle_id=b.id AND part.kind='REPORT_AND_FS' AND part.primary_file_id=final_file.id
    WHERE b.workspace_id=? AND b.engagement_id=? AND b.released_at IS NOT NULL
    ORDER BY b.released_at DESC,b.revision DESC LIMIT 1`).bind(workspaceId, engagementId).first<Row>();
  if (!row) throw new ApiError('NOT_FOUND', 'No released report signature provenance exists for this engagement.');

  const same = (left: unknown, right: unknown) => left !== null && left !== undefined && right !== null && right !== undefined && String(left) === String(right);
  const integrityMatches = same(row.bundle_released_at, engagement.released_at)
    && same(row.signed_at, engagement.report_signed_at) && same(row.report_date, engagement.report_date)
    && same(row.consent_report_date, row.report_date) && same(row.candidate_report_date, row.report_date)
    && same(row.final_file_sha256, row.released_part_hash) && same(row.final_file_sha256, row.final_file_row_hash)
    && same(row.final_file_sha256, row.artifact_file_hash) && same(row.final_file_sha256, row.candidate_content_sha256)
    && same(row.consent_candidate_hash, row.candidate_content_sha256)
    && same(row.asset_signature_hash, row.signature_file_hash) && same(row.asset_seal_hash, row.seal_file_hash)
    && same(row.signature_sha256, row.asset_signature_hash) && same(row.seal_sha256, row.asset_seal_hash)
    && same(row.consent_candidate_id, row.report_candidate_id) && same(row.consent_opinion_id, row.opinion_id)
    && same(row.candidate_opinion_id, row.opinion_id) && same(row.consent_asset_id, row.signature_asset_id)
    && same(row.candidate_asset_id, row.signature_asset_id) && same(row.opinion_srm_id, row.srm_id)
    && same(row.statement_snapshot_id, row.approval_snapshot_id) && row.candidate_status === 'READY'
    && row.consent_attribution === 'SELF_ASSERTED_PERSONA' && row.signing_method === 'IMAGE_WITH_AUDIT_PROVENANCE'
    && row.asset_owner_grade === 'PARTNER'
    && (row.consent_staff_member_id === null || same(row.consent_staff_member_id, row.asset_owner_id))
    && (row.consent_staff_member_id === null || row.consent_persona === 'APPROVER')
    && row.signature_media_type === 'image/png' && row.seal_media_type === 'image/png'
    && row.final_file_media_type === 'application/pdf' && row.report_artifact_id === row.signature_artifact_id;
  if (!integrityMatches) throw new ApiError('INTEGRITY_MISMATCH', 'The released report, consent, signature asset, or pinned source hashes do not reconcile.');

  return {
    engagement: { id: engagement.id, code: engagement.code, clientName: engagement.client_name, periodStart: engagement.period_start,
      periodEnd: engagement.period_end, reportDate: row.report_date, reportSignedAt: row.signed_at },
    bundle: { id: row.bundle_id, revision: row.bundle_revision, contentSha256: row.bundle_hash, releasedAt: row.bundle_released_at,
      releasedByActorId: row.released_by_actor_id },
    consent: { id: row.consent_id, actorId: row.consent_actor_id, actorStaffMemberId: row.consent_staff_member_id,
      actorDisplayName: row.consent_display_name, actorPersona: row.consent_persona, attribution: row.consent_attribution,
      consentedAt: row.consented_at, candidateContentSha256: row.consent_candidate_hash },
    opinion: { id: row.opinion_id, revision: row.opinion_revision, reportType: row.report_type, category: row.opinion_category,
      aupReportType: row.aup_report_type, dependencySha256: row.opinion_hash },
    sources: { reportCandidateId: row.report_candidate_id, reportCandidateDependencySha256: row.candidate_dependency_hash,
      statementApprovalId: row.statement_approval_id, statementDraftId: row.statement_draft_id,
      statementDraftVersion: row.statement_draft_version, statementApprovalSha256: row.statement_approval_hash,
      srmVersionId: row.srm_id, srmDependencySha256: row.srm_hash, statementSnapshotId: row.statement_snapshot_id,
      statementSnapshotSha256: row.statement_hash, trialBalanceVersionId: row.tb_version_id, mappingVersionId: row.mapping_version_id },
    signatureAsset: { id: row.signature_asset_id, label: row.asset_label, status: row.asset_status, uploadedAt: row.asset_uploaded_at,
      owner: { staffMemberId: row.asset_owner_id, displayName: row.asset_owner_name, grade: row.asset_owner_grade },
      signature: { fileId: row.signature_file_id, sha256: row.asset_signature_hash, width: row.signature_width, height: row.signature_height,
        sizeBytes: row.signature_size_bytes },
      seal: { fileId: row.seal_file_id, sha256: row.asset_seal_hash, width: row.seal_width, height: row.seal_height, sizeBytes: row.seal_size_bytes } },
    reportSignature: { id: row.signature_id, artifactId: row.report_artifact_id, fileId: row.final_file_id, fileName: row.final_file_name,
      finalFileSha256: row.final_file_sha256, sizeBytes: row.released_part_size_bytes, signedAt: row.signed_at, reportDate: row.report_date,
      signingMethod: row.signing_method, attribution: row.consent_attribution },
    sourceHashes: { consentedCandidate: row.consent_candidate_hash, reportCandidateDependency: row.candidate_dependency_hash,
      opinion: row.opinion_hash, srm: row.srm_hash, statementSnapshot: row.statement_hash, statementApproval: row.statement_approval_hash,
      signatureAsset: row.asset_signature_hash, sealAsset: row.asset_seal_hash, finalReport: row.final_file_sha256,
      releasedReportPart: row.released_part_hash, releasedBundle: row.bundle_hash },
    integrity: { hashesAndPinnedVersionsMatch: integrityMatches, signatureAttribution: 'SELF_ASSERTED_PERSONA' }
  };
}

/** Reporting projection with an intentionally narrow CLIENT shape. */
export async function getBusinessReportingWorkspace(env: Env, workspaceId: string, context: BusinessContext, engagementId: string): Promise<Row> {
  if (!context.allowedActions.includes('reporting.read')) throw new ApiError('PERSONA_ACTION_DENIED', 'Reporting read access is not available to this persona.');
  const engagement = await env.DB.prepare(`SELECT e.id,e.client_id,e.code,e.engagement_type,e.period_start,e.period_end,e.lifecycle_state,e.report_signed_at,e.report_date,
      e.released_at,e.archive_due_at,e.locked_at,e.portal_frozen_at,c.legal_name AS client_name
    FROM engagements e JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id WHERE e.workspace_id=? AND e.id=?`)
    .bind(workspaceId, engagementId).first<Row>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement was not found.');
  if ((context.scope.clientId && context.scope.clientId !== engagement.client_id)
    || (context.scope.engagementId && context.scope.engagementId !== engagementId)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The engagement is outside the selected scope.');
  }
  const summary = { id: engagement.id, clientId: engagement.client_id, clientName: engagement.client_name, code: engagement.code, engagementType: engagement.engagement_type,
    periodStart: engagement.period_start, periodEnd: engagement.period_end, lifecycleState: engagement.lifecycle_state,
    reportSignedAt: engagement.report_signed_at, reportDate: engagement.report_date, releasedAt: engagement.released_at,
    archiveDueAt: engagement.archive_due_at, lockedAt: engagement.locked_at, portalFrozenAt: engagement.portal_frozen_at };
  const bundleRows = (await env.DB.prepare(`SELECT b.id,b.revision,b.content_hash AS contentHash,b.released_at AS releasedAt,b.final_invoice_id AS finalInvoiceId,
      i.number AS finalInvoiceNumber,i.total_minor AS finalInvoiceTotal,i.due_date AS finalInvoiceDueDate,i.status AS finalInvoiceStatus
    FROM deliverable_bundles b LEFT JOIN invoices i ON i.workspace_id=b.workspace_id AND i.id=b.final_invoice_id
    WHERE b.workspace_id=? AND b.engagement_id=? ORDER BY b.revision DESC`).bind(workspaceId, engagementId).all<Row>()).results ?? [];
  const latestBundle = bundleRows[0] ?? null;
  const releasedParts = latestBundle ? (await env.DB.prepare(`SELECT p.id,p.kind,p.sha256,p.size_bytes AS sizeBytes,f.id AS fileId,
      f.original_name AS fileName,f.media_type AS mediaType,a.file_version_id AS signedReturnFileId,af.original_name AS signedReturnName,
      af.sha256 AS signedReturnSha256,af.size_bytes AS signedReturnSizeBytes
    FROM deliverable_parts p JOIN file_versions f ON f.workspace_id=p.workspace_id AND f.id=p.primary_file_id
    LEFT JOIN deliverable_attachments a ON a.workspace_id=p.workspace_id AND a.part_id=p.id AND a.purpose='SIGNED_CLIENT_REPRESENTATION'
    LEFT JOIN file_versions af ON af.workspace_id=a.workspace_id AND af.id=a.file_version_id
    WHERE p.workspace_id=? AND p.bundle_id=? ORDER BY p.kind`).bind(workspaceId, latestBundle.id).all<Row>()).results ?? [] : [];
  const [bundleDeliveryRows,bundleDispatchRows]=await Promise.all([
    env.DB.prepare(`SELECT d.id,d.bundle_id AS bundleId,d.dispatch_id AS dispatchId,d.method,d.delivered_at AS deliveredAt,
        d.evidence_file_id AS evidenceFileId,d.recorded_by_actor_id AS recordedByActorId
      FROM bundle_deliveries d JOIN deliverable_bundles b ON b.workspace_id=d.workspace_id AND b.id=d.bundle_id AND b.released_at IS NOT NULL
      WHERE d.workspace_id=? AND b.engagement_id=? ORDER BY d.delivered_at DESC,d.id`).bind(workspaceId,engagementId).all<Row>(),
    env.DB.prepare(`SELECT d.id,d.version,d.status,d.provider_message_id AS providerMessageId,d.sent_at AS acceptedAt,d.file_version_id AS fileVersionId,
        b.id AS bundleId,
        j.status AS jobStatus,j.last_error_code AS lastErrorCode
      FROM dispatches d JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id
      JOIN deliverable_parts p ON p.workspace_id=d.workspace_id AND p.primary_file_id=d.file_version_id AND p.kind='REPORT_AND_FS'
      JOIN deliverable_bundles b ON b.workspace_id=p.workspace_id AND b.id=p.bundle_id AND b.engagement_id=d.engagement_id
      WHERE d.workspace_id=? AND d.engagement_id=? AND d.purpose='BUNDLE' ORDER BY d.created_at DESC,d.id`).bind(workspaceId,engagementId).all<Row>()
  ]);
  const archive = await env.DB.prepare(`SELECT r.id AS runId,r.status AS status,r.missing_files_json AS missingFilesJson,r.error_code AS errorCode,
      s.id AS sealId,s.sealed_at AS sealedAt,s.reason,s.manifest_file_id AS manifestFileId,s.archive_file_id AS archiveFileId,
      s.manifest_sha256 AS manifestSha256,s.archive_sha256 AS archiveSha256,s.record_count AS recordCount,s.file_count AS fileCount
    FROM archive_runs r LEFT JOIN archive_seals s ON s.workspace_id=r.workspace_id AND s.engagement_id=r.engagement_id
    WHERE r.workspace_id=? AND r.engagement_id=?`).bind(workspaceId, engagementId).first<Row>();
  if (context.actor.persona === 'CLIENT') {
    const [clientRepresentations, clientRepresentationReturns] = await Promise.all([
      env.DB.prepare(`SELECT r.id,r.version,r.status,r.proposed_report_date AS proposedReportDate,
          r.required_signatories_json AS requiredSignatoriesJson,r.current_return_id AS currentReturnId
        FROM representation_requests r
        JOIN contact_routes cr ON cr.workspace_id=r.workspace_id AND cr.id=r.contact_route_id AND cr.client_id=r.client_id AND cr.purpose='FINAL_REPORT'
        JOIN actor_profiles ap ON ap.workspace_id=r.workspace_id AND ap.id=? AND ap.persona='CLIENT' AND ap.active=1 AND ap.contact_id=cr.contact_id
        WHERE r.workspace_id=? AND r.engagement_id=? AND r.status IN ('SENT','RECEIVED','REJECTED','ACCEPTED')
        ORDER BY r.created_at DESC`).bind(context.actor.id, workspaceId, engagementId).all<Row>(),
      env.DB.prepare(`SELECT rr.id,rr.request_id AS requestId,rr.revision,rr.representation_date AS representationDate,
          rr.signatory_names AS signatoryNames,rr.received_at AS receivedAt,rr.file_sha256 AS fileSha256,
          f.original_name AS fileName
        FROM representation_returns rr
        JOIN representation_requests r ON r.workspace_id=rr.workspace_id AND r.id=rr.request_id
        JOIN contact_routes cr ON cr.workspace_id=r.workspace_id AND cr.id=r.contact_route_id AND cr.client_id=r.client_id AND cr.purpose='FINAL_REPORT'
        JOIN actor_profiles ap ON ap.workspace_id=r.workspace_id AND ap.id=? AND ap.persona='CLIENT' AND ap.active=1 AND ap.contact_id=cr.contact_id
        JOIN file_versions f ON f.workspace_id=rr.workspace_id AND f.id=rr.signed_file_id
        WHERE rr.workspace_id=? AND r.engagement_id=? ORDER BY rr.received_at DESC`).bind(context.actor.id, workspaceId, engagementId).all<Row>()
    ]);
    return { engagement: summary, releasedBundle: latestBundle ? { ...latestBundle, parts: releasedParts } : null,
      archive: archive?.sealId ? { sealedAt: archive.sealedAt, status: archive.status } : null,
      portalAcknowledgements: (bundleDeliveryRows.results??[]).filter(row=>row.bundleId===latestBundle?.id&&row.method==='PORTAL_ACKNOWLEDGEMENT')
        .map(row=>({method:row.method,deliveredAt:row.deliveredAt})),
      representationRequests: clientRepresentations.results ?? [], representationReturns: clientRepresentationReturns.results ?? [], readOnly: true };
  }

  const [opinions, affectedFslis, signatureAssets, snapshot, statementDrafts, statementApprovals, reportCandidates, managementLetters,
    representationRequests, representationReturns, bundleCandidates, candidateParts, retentionPolicies, archiveNotes, findings,
    contactRoutes, staff, jobs] = await Promise.all([
    env.DB.prepare(`SELECT * FROM opinion_versions WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC`).bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT a.opinion_version_id AS opinionVersionId,a.fsli_id AS fsliId,f.code,f.name,a.amount_minor AS amountMinor,a.explanation
      FROM opinion_affected_fslis a JOIN opinion_versions o ON o.workspace_id=a.workspace_id AND o.id=a.opinion_version_id
      JOIN fsli_catalog f ON f.workspace_id=a.workspace_id AND f.id=a.fsli_id WHERE a.workspace_id=? AND o.engagement_id=? ORDER BY o.revision DESC,f.presentation_order`)
      .bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT a.id,a.staff_member_id AS staffMemberId,a.owner_display_name AS staffName,a.owner_grade AS ownerGrade,
      a.signature_sha256 AS signatureSha256,a.seal_sha256 AS sealSha256,
      a.signature_file_id AS signatureFileId,a.seal_file_id AS sealFileId,a.label,a.status,a.uploaded_at AS uploadedAt
      FROM report_signature_assets a JOIN staff_members s ON s.workspace_id=a.workspace_id AND s.id=a.staff_member_id
      WHERE a.workspace_id=? AND a.status='ACTIVE' AND a.owner_grade='PARTNER' AND a.owner_display_name IS NOT NULL
        AND s.grade='PARTNER' AND s.active=1 ORDER BY a.uploaded_at DESC`).bind(workspaceId).all<Row>(),
    env.DB.prepare(`SELECT s.id,s.source_hash AS sourceHash,s.generated_at AS generatedAt,s.standards_profile_id AS standardsProfileId,
        s.tb_version_id AS tbVersionId,s.mapping_version_id AS mappingVersionId
      FROM statement_snapshots s WHERE s.workspace_id=? AND s.engagement_id=? ORDER BY s.generated_at DESC LIMIT 1`).bind(workspaceId, engagementId).first<Row>(),
    env.DB.prepare(`SELECT d.id,d.version,d.statement_snapshot_id AS statementSnapshotId,d.standards_profile_id AS standardsProfileId,
        d.accounting_policies AS accountingPolicies,d.oci_applicable AS ociApplicable,d.completeness_checklist_json AS completenessChecklistJson,
        d.status,d.source_hash AS sourceHash,d.created_at AS createdAt,
        (SELECT json_group_array(json_object('noteNumber',n.note_number,'title',n.title,'body',n.body,'amountMinor',n.amount_minor,'supportingFileId',n.supporting_file_id,'sortOrder',n.sort_order))
          FROM disclosure_notes n WHERE n.workspace_id=d.workspace_id AND n.draft_id=d.id) AS notesJson,
        (SELECT json_group_array(json_object('section',l.section,'code',l.code,'label',l.label,'currentMinor',l.current_minor,'priorMinor',l.prior_minor,'supportingFileId',l.supporting_file_id,'rationale',l.rationale))
          FROM statement_supplement_lines l WHERE l.workspace_id=d.workspace_id AND l.draft_id=d.id) AS supplementsJson
      FROM financial_statement_drafts d WHERE d.workspace_id=? AND d.engagement_id=? ORDER BY d.version DESC`).bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT id,draft_id AS draftId,draft_version AS draftVersion,statement_snapshot_id AS statementSnapshotId,source_hash AS sourceHash,
        approved_by_actor_id AS approvedByActorId,approved_at AS approvedAt FROM financial_statement_approvals
      WHERE workspace_id=? AND engagement_id=? ORDER BY approved_at DESC`).bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT c.id,c.proposed_report_date AS proposedReportDate,c.dependency_hash AS dependencyHash,c.status,c.failure_code AS failureCode,
        c.created_at AS createdAt,c.report_artifact_id AS artifactId,g.file_version_id AS fileId,g.content_sha256 AS contentSha256,g.size_bytes AS sizeBytes,
        c.opinion_version_id AS opinionVersionId,c.financial_statement_approval_id AS approvalId,c.signature_asset_id AS signatureAssetId,
        co.id AS consentId,co.candidate_content_hash AS consentContentHash,co.proposed_report_date AS consentReportDate,co.consented_at AS consentedAt,
        sig.id AS signatureId,sig.final_file_sha256 AS signedFileSha256
      FROM report_candidates c LEFT JOIN generated_artifacts g ON g.workspace_id=c.workspace_id AND g.id=c.report_artifact_id
      LEFT JOIN report_signature_consents co ON co.workspace_id=c.workspace_id AND co.report_candidate_id=c.id
      LEFT JOIN report_signatures sig ON sig.workspace_id=co.workspace_id AND sig.consent_id=co.id
      WHERE c.workspace_id=? AND c.engagement_id=? ORDER BY c.created_at DESC`).bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT id,revision,source_hash AS sourceHash,status,failure_code AS failureCode,file_version_id AS fileId,artifact_id AS artifactId,
        approved_by_actor_id AS approvedByActorId,approved_at AS approvedAt,items_snapshot_json AS itemsJson,no_reportable_deficiencies_reason AS noDeficienciesReason
      FROM management_letter_versions WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC`).bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT r.id,r.version,r.status,r.proposed_report_date AS proposedReportDate,r.required_signatories_json AS requiredSignatoriesJson,
        r.dependency_hash AS dependencyHash,r.template_file_id AS templateFileId,r.dispatch_id AS dispatchId,r.current_return_id AS currentReturnId,
        r.contact_route_id AS contactRouteId,d.status AS dispatchStatus,d.provider_message_id AS providerMessageId
      FROM representation_requests r LEFT JOIN dispatches d ON d.workspace_id=r.workspace_id AND d.id=r.dispatch_id
      WHERE r.workspace_id=? AND r.engagement_id=? ORDER BY r.created_at DESC`).bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT r.id,r.request_id AS requestId,r.revision,r.signed_file_id AS signedFileId,r.file_sha256 AS fileSha256,r.representation_date AS representationDate,
        r.signatory_names AS signatoryNames,r.received_at AS receivedAt,v.original_name AS fileName,rv.decision AS reviewDecision,rv.review_reason AS reviewReason,
        rv.evidence_checks_json AS evidenceChecksJson,
        rv.dependency_hash AS reviewDependencyHash FROM representation_returns r JOIN representation_requests q ON q.workspace_id=r.workspace_id AND q.id=r.request_id
      JOIN file_versions v ON v.workspace_id=r.workspace_id AND v.id=r.signed_file_id
      LEFT JOIN representation_reviews rv ON rv.workspace_id=r.workspace_id AND rv.return_id=r.id
      WHERE r.workspace_id=? AND q.engagement_id=? ORDER BY r.received_at DESC`).bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT id,revision,report_candidate_id AS reportCandidateId,management_letter_version_id AS managementLetterVersionId,
        representation_request_id AS representationRequestId,final_invoice_id AS finalInvoiceId,staged_final_invoice_id AS stagedFinalInvoiceId,
        final_fee_minor AS finalFeeMinor,final_tax_minor AS finalTaxMinor,invoice_due_date AS invoiceDueDate,dependency_hash AS dependencyHash,
        content_hash AS contentHash,status,failure_code AS failureCode,created_at AS createdAt
      FROM bundle_candidates WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC`).bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT p.candidate_id AS candidateId,p.kind,p.primary_file_id AS fileId,p.sha256,p.size_bytes AS sizeBytes,f.original_name AS fileName
      FROM bundle_candidate_parts p JOIN bundle_candidates c ON c.workspace_id=p.workspace_id AND c.id=p.candidate_id
      JOIN file_versions f ON f.workspace_id=p.workspace_id AND f.id=p.primary_file_id WHERE p.workspace_id=? AND c.engagement_id=? ORDER BY p.candidate_id,p.kind`)
      .bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT id,version,name,assembly_days AS assemblyDays,retention_years AS retentionYears,retain_indefinitely AS retainIndefinitely,
        legal_basis AS legalBasis,approved_at AS approvedAt FROM retention_policies WHERE workspace_id=? ORDER BY version DESC`).bind(workspaceId).all<Row>(),
    env.DB.prepare(`SELECT id,text,related_record_type AS relatedRecordType,related_record_id AS relatedRecordId,recorded_by_actor_id AS recordedByActorId,
        recorded_at AS recordedAt FROM archive_assembly_notes WHERE workspace_id=? AND engagement_id=? ORDER BY recorded_at DESC`).bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT f.id,f.title,f.description,f.client_response AS clientResponse,f.severity,f.status,fc.code AS fsliCode,fc.name AS fsliName FROM findings f
      JOIN fsli_catalog fc ON fc.workspace_id=f.workspace_id AND fc.id=f.fsli_id WHERE f.workspace_id=? AND f.engagement_id=? ORDER BY f.created_at DESC`)
      .bind(workspaceId, engagementId).all<Row>(),
    env.DB.prepare(`SELECT cr.id,cr.version,cr.purpose,cr.contact_id AS contactId,ct.full_name AS contactName,ct.email FROM contact_routes cr
      JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
      WHERE cr.workspace_id=? AND cr.client_id=? AND cr.purpose='FINAL_REPORT' AND cr.is_primary=1 AND ct.active=1 AND ct.email IS NOT NULL ORDER BY cr.id`)
      .bind(workspaceId, engagement.client_id).all<Row>(),
    env.DB.prepare(`SELECT id,display_name AS displayName,grade FROM staff_members WHERE workspace_id=? AND active=1 ORDER BY grade,display_name`)
      .bind(workspaceId).all<Row>(),
    env.DB.prepare(`SELECT id,kind,status,attempts,last_error_code AS lastErrorCode,result_file_id AS resultFileId,result_json AS resultJson,
        created_at AS createdAt,completed_at AS completedAt FROM outbox_jobs WHERE workspace_id=? AND aggregate_id IN (
        SELECT id FROM report_candidates WHERE workspace_id=? AND engagement_id=? UNION ALL
        SELECT id FROM management_letter_versions WHERE workspace_id=? AND engagement_id=? UNION ALL
        SELECT id FROM representation_requests WHERE workspace_id=? AND engagement_id=? UNION ALL
        SELECT id FROM bundle_candidates WHERE workspace_id=? AND engagement_id=? UNION ALL
        SELECT id FROM archive_runs WHERE workspace_id=? AND engagement_id=?) ORDER BY created_at DESC LIMIT 100`)
      .bind(workspaceId,workspaceId,engagementId,workspaceId,engagementId,workspaceId,engagementId,workspaceId,engagementId,workspaceId,engagementId).all<Row>()
  ]);

  const statementLines = snapshot ? (await env.DB.prepare(`SELECT l.fsli_id AS fsliId,f.code,f.name,f.statement,f.category,
      l.current_base_minor AS currentBaseMinor,l.current_adjustment_minor AS adjustmentMinor,l.current_adjusted_minor AS currentMinor,
      l.prior_minor AS priorMinor,l.risk_band AS riskBand FROM statement_snapshot_lines l
      JOIN fsli_catalog f ON f.workspace_id=l.workspace_id AND f.id=l.fsli_id WHERE l.workspace_id=? AND l.snapshot_id=? ORDER BY f.presentation_order`)
    .bind(workspaceId,snapshot.id).all<Row>()).results ?? [] : [];
  const fsliCatalog = (await env.DB.prepare(`SELECT id,code,name,statement,category FROM fsli_catalog WHERE workspace_id=? AND active=1 ORDER BY presentation_order,code`)
    .bind(workspaceId).all<Row>()).results ?? [];
  const bundleParts = (await env.DB.prepare(`SELECT b.id AS bundleId,p.id,p.kind,p.primary_file_id AS fileId,p.sha256,p.size_bytes AS sizeBytes,
      f.original_name AS fileName,f.media_type AS mediaType,a.file_version_id AS signedReturnFileId,af.original_name AS signedReturnName,
      af.sha256 AS signedReturnSha256,af.size_bytes AS signedReturnSizeBytes FROM deliverable_bundles b
    JOIN deliverable_parts p ON p.workspace_id=b.workspace_id AND p.bundle_id=b.id JOIN file_versions f ON f.workspace_id=p.workspace_id AND f.id=p.primary_file_id
    LEFT JOIN deliverable_attachments a ON a.workspace_id=p.workspace_id AND a.part_id=p.id AND a.purpose='SIGNED_CLIENT_REPRESENTATION'
    LEFT JOIN file_versions af ON af.workspace_id=a.workspace_id AND af.id=a.file_version_id WHERE b.workspace_id=? AND b.engagement_id=? ORDER BY b.revision DESC,p.kind`)
    .bind(workspaceId,engagementId).all<Row>()).results ?? [];
  const candidatePartRows = candidateParts.results ?? [];
  const archiveNotesRows = archiveNotes.results ?? [];
  const archiveView = archive ? { ...archive, missingFiles: JSON.parse(String(archive.missingFilesJson ?? '[]')), notes: archiveNotesRows } : { notes: archiveNotesRows };
  return { engagement: summary, opinions: opinions.results ?? [], affectedFslis: affectedFslis.results ?? [], signatureAssets: signatureAssets.results ?? [], staff: staff.results ?? [],
    statementSnapshot: snapshot ? { ...snapshot, lines: statementLines, fsliCatalog } : null,
    financialStatementDrafts: statementDrafts.results ?? [], financialStatementApprovals: statementApprovals.results ?? [], reportCandidates: reportCandidates.results ?? [],
    managementLetters: managementLetters.results ?? [], representationRequests: representationRequests.results ?? [], representationReturns: representationReturns.results ?? [],
    bundleCandidates: (bundleCandidates.results ?? []).map(candidate => ({ ...candidate, parts: candidatePartRows.filter(part => part.candidateId === candidate.id) })),
    releasedBundles: bundleRows.map(bundle => ({ ...bundle, parts: bundleParts.filter(part => part.bundleId === bundle.id),
      invoice: bundle.finalInvoiceStatus === 'ISSUED' ? { id: bundle.finalInvoiceId, number: bundle.finalInvoiceNumber,totalMinor: bundle.finalInvoiceTotal,dueDate:bundle.finalInvoiceDueDate } : null })),
    retentionPolicies: retentionPolicies.results ?? [], archive: archiveView, bundleDeliveries:bundleDeliveryRows.results??[],bundleDispatches:bundleDispatchRows.results??[],
    findings: findings.results ?? [], contactRoutes: contactRoutes.results ?? [], jobs: jobs.results ?? [], readOnly: false };
}

async function accessEvent(env:Env,workspaceId:string,engagementId:string,resourceType:string,resourceId:string,action:'READ'|'EXPORT',actorId:string|null,now:string){
  await env.DB.prepare(`INSERT INTO operational_access_events(id,workspace_id,engagement_id,resource_type,resource_id,action,occurred_at,actor_id)
    VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,engagementId,resourceType,resourceId,action,now,actorId).run();
}

function assertArchiveScope(context:BusinessContext,engagement:Row,engagementId:string){
  if((context.scope.clientId&&context.scope.clientId!==engagement.client_id)||(context.scope.engagementId&&context.scope.engagementId!==engagementId)
    ||(context.actor.persona==='CLIENT'&&context.actor.clientId!==engagement.client_id))throw new ApiError('FORBIDDEN_SCOPE','The engagement is outside the selected scope.');
}

function parsedMissingFiles(value:unknown):string[]{
  try{const parsed=JSON.parse(String(value??'[]')) as unknown;return Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==='string'):[];}
  catch{return ['Archive status contains an invalid missing-file record.'];}
}

export async function getBusinessArchiveStatus(env:Env,workspaceId:string,context:BusinessContext,engagementId:string,now:string=new Date().toISOString()):Promise<Row>{
  if(!context.allowedActions.includes('reporting.read'))throw new ApiError('PERSONA_ACTION_DENIED','Archive status is not available to this persona.');
  const row=await env.DB.prepare(`SELECT e.id,e.client_id,e.lifecycle_state,e.report_signed_at,e.report_date,e.archive_due_at,e.locked_at,
      r.id AS run_id,r.status AS assembly_status,r.missing_files_json,r.error_code,s.id AS seal_id,s.sealed_at
    FROM engagements e LEFT JOIN archive_runs r ON r.workspace_id=e.workspace_id AND r.engagement_id=e.id
    LEFT JOIN archive_seals s ON s.workspace_id=e.workspace_id AND s.engagement_id=e.id
    WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId,engagementId).first<Row>();
  if(!row)throw new ApiError('NOT_FOUND','The engagement was not found.');
  assertArchiveScope(context,row,engagementId);
  const staff=context.actor.persona!=='CLIENT';
  const missingFiles=staff?parsedMissingFiles(row.missing_files_json):[];
  const status=typeof row.assembly_status==='string'?row.assembly_status:'NOT_STARTED';
  const effectiveReadOnly=Boolean(row.locked_at)||row.lifecycle_state==='ARCHIVED_READ_ONLY'||typeof row.archive_due_at==='string'&&row.archive_due_at<=now;
  await accessEvent(env,workspaceId,engagementId,'ARCHIVE_STATUS',engagementId,'READ',context.actor.id,now);
  return {engagementId,serverNow:now,reportSignedAt:row.report_signed_at??null,reportDate:row.report_date??null,archiveDueAt:row.archive_due_at??null,
    effectiveReadOnly,lockedAt:row.locked_at??null,sealedAt:row.sealed_at??null,assemblyStatus:status,missingFiles,errorCode:staff?(row.error_code??null):null,sealed:Boolean(row.seal_id)};
}

const ARCHIVE_DOWNLOAD_TICKET_TTL_MS=5*60*1000;

/** Issues a hashed, short-lived one-use capability for the browser's native download manager. */
export async function createBusinessArchiveDownloadTicket(env:Env,workspaceId:string,context:BusinessContext,engagementId:string,now:string=new Date().toISOString()):Promise<{downloadUrl:string;expiresAt:string}>{
  if(!context.allowedActions.includes('reporting.read')||!(context.actor.persona==='REVIEWER'||context.actor.persona==='APPROVER'&&context.actor.staffGrade==='PARTNER'))
    throw new ApiError('PERSONA_ACTION_DENIED','Only a Reviewer or Partner may export a sealed internal audit archive.');
  if(!Number.isFinite(Date.parse(now)))throw new ApiError('BAD_REQUEST','The archive download ticket clock is invalid.');
  const status=await getBusinessArchiveStatus(env,workspaceId,context,engagementId,now);
  if(status.sealed!==true)throw new ApiError('GATE_BLOCKED','A successfully sealed archive is required before download.');
  const rawToken=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
  const ticketId=crypto.randomUUID(),expiresAt=new Date(Date.parse(now)+ARCHIVE_DOWNLOAD_TICKET_TTL_MS).toISOString();
  await env.DB.prepare(`INSERT INTO archive_download_tickets(workspace_id,id,token_sha256,engagement_id,actor_id,actor_persona,actor_staff_grade,expires_at,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(workspaceId,ticketId,await sha256Hex(rawToken),engagementId,context.actor.id,context.actor.persona,context.actor.staffGrade,expiresAt,now).run();
  return {downloadUrl:`/api/archive-download/${rawToken}`,expiresAt};
}

/** Consumes a capability atomically, rechecks the actor and seal, and streams the verified archive. */
export async function consumeBusinessArchiveDownloadTicket(env:Env,rawToken:string,now:string=new Date().toISOString()):Promise<{
  body:ReadableStream<Uint8Array>;sizeBytes:number;fileName:string;contentType:string;archiveSha256:string;manifestSha256:string
}>{
  if(!/^[a-f0-9]{64}$/.test(rawToken)||!Number.isFinite(Date.parse(now)))throw new ApiError('NOT_FOUND','The archive download link is invalid or expired.');
  const tokenHash=await sha256Hex(rawToken);
  const ticket=await env.DB.prepare(`SELECT workspace_id,id,engagement_id,actor_id,actor_persona,actor_staff_grade,expires_at
    FROM archive_download_tickets WHERE token_sha256=? AND expires_at>?`).bind(tokenHash,now).first<Row>();
  if(!ticket||!['REVIEWER','APPROVER'].includes(String(ticket.actor_persona)))throw new ApiError('NOT_FOUND','The archive download link is invalid or expired.');
  const consumed=await env.DB.prepare(`INSERT INTO archive_download_ticket_uses(workspace_id,ticket_id,used_at)
    SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM archive_download_tickets t WHERE t.workspace_id=? AND t.id=? AND t.token_sha256=? AND t.expires_at>?)
      AND NOT EXISTS(SELECT 1 FROM archive_download_ticket_uses u WHERE u.workspace_id=? AND u.ticket_id=?)
    RETURNING ticket_id`).bind(ticket.workspace_id,ticket.id,now,ticket.workspace_id,ticket.id,tokenHash,now,ticket.workspace_id,ticket.id).first<{ticket_id:string}>();
  if(!consumed)throw new ApiError('NOT_FOUND','The archive download link is invalid, expired, or already used.');
  const actor=await env.DB.prepare(`SELECT ap.persona,ap.active,sm.grade,sm.active AS staff_active
    FROM actor_profiles ap JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
    WHERE ap.workspace_id=? AND ap.id=?`).bind(ticket.workspace_id,ticket.actor_id).first<Row>();
  if(!actor||Number(actor.active)!==1||Number(actor.staff_active)!==1||actor.persona!==ticket.actor_persona||actor.grade!==ticket.actor_staff_grade
    ||!(actor.persona==='REVIEWER'||actor.persona==='APPROVER'&&actor.grade==='PARTNER'))
    throw new ApiError('DISABLED_IDENTITY','The reviewer profile that requested this download is no longer active.');
  const context:BusinessContext={actor:{id:String(ticket.actor_id),persona:actor.persona as BusinessContext['actor']['persona'],displayName:'',
      staffGrade:actor.grade as BusinessContext['actor']['staffGrade'],clientId:null,staffMemberId:null},
    scope:{clientId:null,engagementId:String(ticket.engagement_id)},allowedActions:['reporting.read'],readOnlyReasons:[]};
  const result=await getBusinessArchiveExport(env,String(ticket.workspace_id),context,String(ticket.engagement_id),'archive');
  if(!result.body)throw new ApiError('INTEGRITY_MISMATCH','The sealed archive bytes are unavailable.');
  return {body:result.body,sizeBytes:result.sizeBytes,fileName:result.fileName,contentType:result.contentType,
    archiveSha256:result.archiveSha256,manifestSha256:result.manifestSha256};
}

export async function getBusinessArchiveExport(env:Env,workspaceId:string,context:BusinessContext,engagementId:string,part:'archive'|'manifest'='archive'):
  Promise<{bytes?:Uint8Array;body?:ReadableStream<Uint8Array>;sizeBytes:number;fileName:string;contentType:string;archiveSha256:string;manifestSha256:string}>{
  if(!context.allowedActions.includes('reporting.read')||!(context.actor.persona==='REVIEWER'||context.actor.persona==='APPROVER'&&context.actor.staffGrade==='PARTNER'))
    throw new ApiError('PERSONA_ACTION_DENIED','Only a Reviewer or Partner may export a sealed internal audit archive.');
  const seal=await env.DB.prepare(`SELECT e.id,e.client_id,e.lifecycle_state,e.locked_at,e.archive_due_at,r.status AS run_status,r.error_code,
      s.id AS seal_id,s.bundle_id,s.manifest_file_id,s.archive_file_id,s.manifest_sha256,s.archive_sha256,s.audit_chain_head,s.record_count,s.file_count
    FROM engagements e LEFT JOIN archive_runs r ON r.workspace_id=e.workspace_id AND r.engagement_id=e.id
    LEFT JOIN archive_seals s ON s.workspace_id=e.workspace_id AND s.engagement_id=e.id
    WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId,engagementId).first<Row>();
  if(!seal)throw new ApiError('NOT_FOUND','The engagement was not found.');
  assertArchiveScope(context,seal,engagementId);
  if(seal.lifecycle_state!=='ARCHIVED_READ_ONLY'||!seal.locked_at||seal.run_status!=='SEALED'||!seal.seal_id||typeof seal.manifest_file_id!=='string'||typeof seal.archive_file_id!=='string')
    throw new ApiError('GATE_BLOCKED','A successfully sealed archive is required before export.');
  const records=await env.DB.prepare(`SELECT id,original_name,media_type,size_bytes,sha256,object_key,purpose,immutable,state FROM file_versions
    WHERE workspace_id=? AND engagement_id=? AND id IN (?,?)`).bind(workspaceId,engagementId,seal.manifest_file_id,seal.archive_file_id).all<Row>();
  const byId=new Map((records.results??[]).map(row=>[String(row.id),row]));
  const manifestRow=byId.get(seal.manifest_file_id),archiveRow=byId.get(seal.archive_file_id);
  if(!manifestRow||!archiveRow||manifestRow.purpose!=='ARCHIVE'||archiveRow.purpose!=='ARCHIVE'||manifestRow.state!=='COMMITTED'||archiveRow.state!=='COMMITTED'
    ||manifestRow.immutable!==1||archiveRow.immutable!==1||manifestRow.media_type!=='text/plain'||archiveRow.media_type!=='application/zip'
    ||manifestRow.sha256!==seal.manifest_sha256||archiveRow.sha256!==seal.archive_sha256)
    throw new ApiError('INTEGRITY_MISMATCH','The archive seal does not match its committed immutable manifest and ZIP metadata.');
  const manifestSize=Number(manifestRow.size_bytes),archiveSize=Number(archiveRow.size_bytes);
  if(!Number.isSafeInteger(manifestSize)||manifestSize<=0||!Number.isSafeInteger(archiveSize)||archiveSize<=0)
    throw new ApiError('INTEGRITY_MISMATCH','The sealed archive or manifest size exceeds the supported exact byte-count range.');
  const [manifestObject,archiveObject]=await Promise.all([env.FILES.get(String(manifestRow.object_key)),env.FILES.get(String(archiveRow.object_key))]);
  if(!manifestObject||!archiveObject)throw new ApiError('INTEGRITY_MISMATCH','The sealed archive or manifest bytes are missing from storage.');
  if(manifestObject.size!==manifestSize||archiveObject.size!==archiveSize)
    throw new ApiError('INTEGRITY_MISMATCH','The stored archive object sizes do not match the immutable file records.');
  const manifestBytes=await manifestObject.arrayBuffer();
  const digest=async(bytes:ArrayBuffer)=>{const value=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(value)].map(byte=>byte.toString(16).padStart(2,'0')).join('');};
  if(manifestBytes.byteLength!==manifestSize||await digest(manifestBytes)!==seal.manifest_sha256)
    throw new ApiError('INTEGRITY_MISMATCH','The stored archive manifest does not match its independently recorded seal hash.');
  let manifest:Record<string,unknown>;
  try{manifest=JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<string,unknown>;}
  catch{throw new ApiError('INTEGRITY_MISMATCH','The sealed archive manifest is not valid JSON.');}
  if(manifest.format!=='AuditSphere sealed archive manifest v1'||manifest.engagementId!==engagementId||manifest.bundleId!==seal.bundle_id
    ||manifest.auditChainHead!==seal.audit_chain_head||!Array.isArray(manifest.files)||manifest.files.length!==Number(seal.file_count)
    ||manifest.recordCount!==Number(seal.record_count))throw new ApiError('INTEGRITY_MISMATCH','The sealed manifest identity or counts do not match the archive seal.');
  for(const raw of manifest.files){
    if(!raw||typeof raw!=='object')throw new ApiError('INTEGRITY_MISMATCH','The sealed manifest contains an invalid file entry.');
    const file=raw as Record<string,unknown>;
    if(typeof file.id!=='string'||typeof file.originalName!=='string'||typeof file.purpose!=='string'||typeof file.sha256!=='string'||!Number.isSafeInteger(file.sizeBytes))
      throw new ApiError('INTEGRITY_MISMATCH','The sealed manifest contains an incomplete file entry.');
  }
  let archiveBytes:Uint8Array|undefined;
  let archiveBody:ReadableStream<Uint8Array>|undefined;
  if(part==='archive'){
    const archiveChecksum=archiveObject.checksums?.sha256;
    const hasStorageChecksum=archiveChecksum instanceof ArrayBuffer
      && toHex(new Uint8Array(archiveChecksum))===seal.archive_sha256;
    if(archiveChecksum && !hasStorageChecksum)
      throw new ApiError('INTEGRITY_MISMATCH','The stored ZIP checksum does not match its independently recorded seal hash.');
    // Object metadata only proves the upload-time digest. Rehash the bytes on
    // every export, including objects with R2 checksum metadata, while keeping
    // the body streaming so native browser downloads never require a Blob.
    archiveBody=verifyStreamingSha256(archiveObject.body as ReadableStream<Uint8Array>,archiveSize,String(seal.archive_sha256));
  }
  const now=new Date().toISOString();
  await accessEvent(env,workspaceId,engagementId,'SEALED_ARCHIVE',String(seal.archive_file_id),'EXPORT',context.actor.id,now);
  return {...(part==='manifest'?{bytes:new Uint8Array(manifestBytes)}:{body:archiveBody}),
    sizeBytes:part==='manifest'?manifestBytes.byteLength:archiveSize,fileName:part==='manifest'?'archive-manifest.json':'sealed-audit-archive.zip',
    contentType:part==='manifest'?'application/json':'application/zip',archiveSha256:String(seal.archive_sha256),manifestSha256:String(seal.manifest_sha256)};
}
