import assert from 'node:assert/strict';
import { it } from 'node:test';
import { getBusinessReleasedReportProvenance } from '../../worker/businessReportingQuery.js';
import type { Env } from '../../worker/env.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const engagementId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';
const fullHash = 'a'.repeat(64);
const signatureHash = 'b'.repeat(64);
const sealHash = 'c'.repeat(64);
const staffId = '44444444-4444-4444-8444-444444444444';
const dateTime = '2026-10-07T10:00:00.000Z';

const partner = {
  actor: { id: 'actor-partner', persona: 'APPROVER', staffGrade: 'PARTNER', staffMemberId: staffId },
  scope: { clientId, engagementId }, allowedActions: ['reporting.read'], readOnlyReasons: []
} as any;

function releasedRow(): Record<string, unknown> {
  return {
    bundle_id: 'bundle-1', bundle_revision: 1, bundle_hash: fullHash, bundle_released_at: dateTime, released_by_actor_id: 'actor-partner',
    signature_id: 'signature-1', signature_artifact_id: 'report-artifact-final', signature_sha256: signatureHash, seal_sha256: sealHash,
    signed_at: dateTime, report_date: '2026-10-07', final_file_sha256: fullHash, signing_method: 'IMAGE_WITH_AUDIT_PROVENANCE',
    consent_id: 'consent-1', consent_actor_id: 'actor-partner', consent_staff_member_id: staffId, consent_display_name: 'Self-asserted Partner',
    consent_persona: 'APPROVER', consent_attribution: 'SELF_ASSERTED_PERSONA', consented_at: '2026-10-07T09:45:00.000Z',
    consent_report_date: '2026-10-07', consent_candidate_hash: fullHash, consent_candidate_id: 'report-candidate-1',
    consent_opinion_id: 'opinion-1', consent_asset_id: 'asset-1', report_candidate_id: 'report-candidate-1', candidate_status: 'READY',
    candidate_dependency_hash: 'd'.repeat(64), candidate_artifact_id: 'candidate-artifact-1', candidate_opinion_id: 'opinion-1',
    candidate_approval_id: 'approval-1', candidate_asset_id: 'asset-1', candidate_report_date: '2026-10-07', candidate_content_sha256: fullHash,
    opinion_id: 'opinion-1', opinion_revision: 3, report_type: 'ISA_AUDIT', opinion_category: 'QUALIFIED', aup_report_type: null,
    opinion_hash: 'e'.repeat(64), opinion_srm_id: 'srm-1', srm_id: 'srm-1', srm_hash: 'f'.repeat(64),
    statement_snapshot_id: 'snapshot-1', statement_hash: '1'.repeat(64), tb_version_id: 'tb-1', mapping_version_id: 'mapping-1',
    statement_approval_id: 'approval-1', statement_draft_id: 'draft-1', statement_draft_version: 2,
    approval_snapshot_id: 'snapshot-1', statement_approval_hash: '2'.repeat(64), signature_asset_id: 'asset-1',
    asset_owner_id: staffId, asset_owner_name: 'Self-asserted Partner', asset_owner_grade: 'PARTNER',
    signature_file_id: 'signature-file-1', seal_file_id: 'seal-file-1', asset_signature_hash: signatureHash, asset_seal_hash: sealHash,
    signature_width: 400, signature_height: 120, seal_width: 300, seal_height: 300, asset_label: 'Partner reporting assets',
    asset_status: 'ACTIVE', asset_uploaded_at: '2026-10-01T08:00:00.000Z', signature_file_hash: signatureHash, signature_media_type: 'image/png',
    signature_size_bytes: 1024, seal_file_hash: sealHash, seal_media_type: 'image/png', seal_size_bytes: 2048,
    report_artifact_id: 'report-artifact-final', final_file_id: 'released-report-file-1', artifact_file_hash: fullHash, artifact_size_bytes: 15000,
    final_file_row_hash: fullHash, final_file_name: 'final-report.pdf', final_file_media_type: 'application/pdf',
    released_part_hash: fullHash, released_part_size_bytes: 15000
  };
}

function provenanceEnv(input: { row?: Record<string, unknown> | null; clientId?: string } = {}): Env {
  const db = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) { return this; },
        async first() {
          if (sql.includes('FROM engagements e JOIN clients')) return { id: engagementId, client_id: input.clientId ?? clientId,
            code: 'AUD-001', period_start: '2026-01-01', period_end: '2026-12-31', report_signed_at: dateTime,
            report_date: '2026-10-07', released_at: dateTime, client_name: 'Synthetic Client' };
          if (sql.includes('FROM deliverable_bundles b')) return input.row ?? null;
          throw new Error(`Unexpected provenance SQL: ${sql}`);
        }
      };
    }
  };
  return { DB: db } as unknown as Env;
}

it('US-REP-002 returns only the released report, with exact consent, owner and source hashes', async () => {
  const result = await getBusinessReleasedReportProvenance(provenanceEnv({ row: releasedRow() }), workspaceId, partner, engagementId);
  assert.equal((result.reportSignature as any).finalFileSha256, fullHash);
  assert.equal((result.consent as any).candidateContentSha256, fullHash);
  assert.equal((result.consent as any).attribution, 'SELF_ASSERTED_PERSONA');
  assert.equal(((result.signatureAsset as any).owner).staffMemberId, staffId);
  assert.equal((result.sourceHashes as any).statementApproval, '2'.repeat(64));
  assert.equal((result.integrity as any).hashesAndPinnedVersionsMatch, true);
});

it('US-REP-002 does not expose a staged candidate or consent before final release', async () => {
  await assert.rejects(getBusinessReleasedReportProvenance(provenanceEnv({ row: null }), workspaceId, partner, engagementId),
    (error: any) => error.code === 'NOT_FOUND');
});

it('US-REP-002 blocks non-Partner readers and engagements outside the selected scope', async () => {
  const reviewer = { ...partner, actor: { ...partner.actor, persona: 'REVIEWER', staffGrade: 'SENIOR' } };
  await assert.rejects(getBusinessReleasedReportProvenance(provenanceEnv({ row: releasedRow() }), workspaceId, reviewer, engagementId),
    (error: any) => error.code === 'PERSONA_ACTION_DENIED');
  const otherClientScope = { ...partner, scope: { clientId: 'another-client', engagementId } };
  await assert.rejects(getBusinessReleasedReportProvenance(provenanceEnv({ row: releasedRow() }), workspaceId, otherClientScope, engagementId),
    (error: any) => error.code === 'FORBIDDEN_SCOPE');
});

it('US-REP-002 reports a released-file hash mismatch instead of presenting false provenance', async () => {
  const row = releasedRow();
  row.released_part_hash = '9'.repeat(64);
  await assert.rejects(getBusinessReleasedReportProvenance(provenanceEnv({ row }), workspaceId, partner, engagementId),
    (error: any) => error.code === 'INTEGRITY_MISMATCH');
});
