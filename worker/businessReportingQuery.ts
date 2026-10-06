import type { Env } from './env';
import { ApiError } from './errors';
import type { BusinessContext } from './business';

type Row = Record<string, unknown>;

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
      archive: archive?.sealId ? { sealId: archive.sealId, sealedAt: archive.sealedAt, reason: archive.reason,
        manifestFileId: archive.manifestFileId, archiveFileId: archive.archiveFileId, manifestSha256: archive.manifestSha256,
        archiveSha256: archive.archiveSha256, status: archive.status } : null,
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
    env.DB.prepare(`SELECT a.id,a.staff_member_id AS staffMemberId,s.display_name AS staffName,a.signature_sha256 AS signatureSha256,a.seal_sha256 AS sealSha256,
      a.signature_file_id AS signatureFileId,a.seal_file_id AS sealFileId,a.label,a.status,a.uploaded_at AS uploadedAt
      FROM report_signature_assets a JOIN staff_members s ON s.workspace_id=a.workspace_id AND s.id=a.staff_member_id
      WHERE a.workspace_id=? AND a.status='ACTIVE' ORDER BY a.uploaded_at DESC`).bind(workspaceId).all<Row>(),
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
    retentionPolicies: retentionPolicies.results ?? [], archive: archiveView, findings: findings.results ?? [], contactRoutes: contactRoutes.results ?? [], jobs: jobs.results ?? [], readOnly: false };
}
