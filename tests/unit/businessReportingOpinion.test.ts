import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildBusinessReportingMutation, businessReportingCommands } from '../../worker/businessReporting.js';
import { getBusinessOpinionPreview } from '../../worker/businessReportingQuery.js';
import type { Env } from '../../worker/env.js';

const digest = 'a'.repeat(64);
const opinionId = '11111111-1111-4111-8111-111111111111';
const engagementId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const fsliId = '44444444-4444-4444-8444-444444444444';
const opinionSchema = businessReportingCommands.find(schema => schema.shape.type.value === 'opinion.select')!;

it('US-REP-001 uses category-discriminated validation for clean, modified, and AUP opinions', () => {
  const common = { engagementId, rationale: 'Partner rationale documents the reporting conclusion.',
    materialityAssessment: 'The assessment considers the identified balances.', pervasivenessAssessment: 'The effects are assessed across the statements.' };
  assert.doesNotThrow(() => opinionSchema.parse({ type: 'opinion.select', payload: { ...common, category: 'UNMODIFIED' } }));
  for (const category of ['QUALIFIED', 'DISCLAIMER', 'ADVERSE']) {
    assert.throws(() => opinionSchema.parse({ type: 'opinion.select', payload: { ...common, category, affectedFslis: [],
      basisText: 'The supplied basis text is substantive and adequately detailed.' } }));
    assert.throws(() => opinionSchema.parse({ type: 'opinion.select', payload: { ...common, category,
      affectedFslis: [{ fsliId, explanation: 'The balance is materially misstated based on available evidence.' }] } }));
    assert.doesNotThrow(() => opinionSchema.parse({ type: 'opinion.select', payload: { ...common, category,
      affectedFslis: [{ fsliId, amountMinor: '12000', explanation: 'The balance is materially misstated based on available evidence.' }],
      basisText: 'The supplied basis text is substantive and adequately detailed.' } }));
  }
  assert.doesNotThrow(() => opinionSchema.parse({ type: 'opinion.select', payload: { ...common, category: null,
    aupReportType: 'Agreed-upon procedures report', aupProcedureSummary: 'The procedures were performed and the factual findings are listed.' } }));
  assert.throws(() => opinionSchema.parse({ type: 'opinion.select', payload: { ...common, category: null,
    affectedFslis: [{ fsliId, explanation: 'This is not an AUP finding.' }],
    aupReportType: 'Agreed-upon procedures report', aupProcedureSummary: 'The procedures were performed and the factual findings are listed.' } }));
});

function previewEnv(stale = false): Env {
  const opinion = {
    id: opinionId, revision: 3, srm_version_id: 'srm-current', standards_profile_id: 'standards-current', report_type: 'ISA_AUDIT', category: 'ADVERSE',
    aup_report_type: null, aup_procedure_summary: null,
    rationale: 'The financial statements are materially misstated by pervasive omitted liabilities.',
    materiality_assessment: 'The identified amount is material to the financial statements as a whole.',
    pervasiveness_assessment: 'The effect is pervasive across several statement captions and disclosures.',
    basis_heading: 'Basis for Adverse Opinion', basis_text: 'Liabilities and related expenses are omitted from the approved financial statements.',
    going_concern_reporting_text: null,
    additional_sections_json: JSON.stringify([{ heading: 'Other Matter', body: 'A predecessor auditor reported on the comparative period.' }]),
    dependency_hash: digest
  };
  const currentSrm = { id: stale ? 'srm-newer' : 'srm-current', dependency_hash: digest, going_concern_id: 'gc-current', clearance_hash: digest };
  const going = { id: 'gc-current', status: 'REVIEWED', conclusion: 'NO_MATERIAL_UNCERTAINTY' };
  const latestGoing = { id: stale ? 'gc-newer' : 'gc-current', status: 'REVIEWED' };
  const affected = [{ code: 'LIAB-01', name: 'Current liabilities', amountMinor: '502500', explanation: 'Supplier accruals were omitted across multiple material operating categories.' }];
  const db = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) { return this; },
        async first() {
          if (sql.includes('FROM engagements WHERE workspace_id=? AND id=?')) return { id: engagementId, client_id: 'client-current', standards_profile_id: 'standards-current' };
          if (sql.includes('FROM opinion_versions WHERE workspace_id=? AND engagement_id=? AND id=?')) return opinion;
          if (sql.includes('SELECT s.id,s.dependency_hash,s.going_concern_id')) return currentSrm;
          if (sql.includes('SELECT g.id,g.status,g.conclusion')) return going;
          if (sql.includes('SELECT id,status FROM going_concern_assessments')) return latestGoing;
          throw new Error(`Unexpected first() SQL in reporting opinion test: ${sql}`);
        },
        async all() {
          if (sql.includes('FROM opinion_affected_fslis')) return { results: affected };
          throw new Error(`Unexpected all() SQL in reporting opinion test: ${sql}`);
        }
      };
    }
  };
  return { DB: db } as unknown as Env;
}

const partnerContext = {
  actor: { id: 'partner-actor', persona: 'APPROVER', staffGrade: 'PARTNER', staffMemberId: '55555555-5555-4555-8555-555555555555' },
  scope: { clientId: 'client-current', engagementId },
  allowedActions: ['reporting.read'], readOnlyReasons: []
} as any;

function opinionCommandEnv() {
  const prepared: string[] = [];
  const engagement = { id: engagementId, version: 1, client_id: 'client-current', code: 'QA-REPORT-1', period_start: '2026-01-01', period_end: '2026-12-31',
    engagement_type: 'STATUTORY_AUDIT', lifecycle_state: 'PARTNER_APPROVAL', contract_fee_minor: 100000, active_proposal_version_id: 'proposal-1',
    active_tb_version_id: 'tb-1', active_mapping_version_id: 'mapping-1', active_materiality_version_id: 'materiality-1', approved_planning_version_id: 'planning-1',
    standards_profile_id: 'standards-current', locked_at: null, portal_frozen_at: null, client_name: 'Synthetic Client', firm_name: 'Synthetic Firm' };
  const srm = { id: 'srm-current', revision: 1, statement_snapshot_id: 'snapshot-current', dependency_hash: digest, clearance_id: 'clearance-current', clearance_hash: digest,
    going_concern_id: 'gc-current' };
  const snapshot = { id: 'snapshot-current', source_hash: digest, tb_version_id: 'tb-1', mapping_version_id: 'mapping-1', standards_profile_id: 'standards-current' };
  const db = {
    prepare(sql: string) {
      prepared.push(sql);
      return {
        bind(..._values: unknown[]) { return this; },
        async first() {
          if (sql.includes('SELECT e.id,e.version,e.client_id,e.code')) return engagement;
          if (sql.includes('SELECT id,active_tb_version_id')) return { id: engagementId, active_tb_version_id: 'tb-1', active_mapping_version_id: 'mapping-1',
            active_materiality_version_id: 'materiality-1', approved_planning_version_id: 'planning-1', standards_profile_id: 'standards-current' };
          if (sql.includes('SELECT s.*,c.id AS clearance_id')) return srm;
          if (sql.includes('SELECT id,source_hash,tb_version_id')) return snapshot;
          if (sql.includes('SELECT id,presentation_edition')) return { id: 'standards-current', presentation_edition: 'ISA-2025', effective_period_start: '2020-01-01', effective_period_end: null, content_sha256: digest };
          if (sql.includes('SELECT id,status,conclusion FROM going_concern_assessments')) return { id: 'gc-current', status: 'REVIEWED', conclusion: 'NO_MATERIAL_UNCERTAINTY' };
          if (sql.includes('SELECT id,status FROM going_concern_assessments')) return { id: 'gc-current', status: 'REVIEWED' };
          if (sql.includes('SELECT COALESCE(MAX(revision),0)+1')) return { value: 1 };
          throw new Error(`Unexpected first() SQL in command test: ${sql}`);
        },
        async all() {
          if (sql.includes('SELECT id FROM fsli_catalog')) return { results: [{ id: fsliId }] };
          throw new Error(`Unexpected all() SQL in command test: ${sql}`);
        }
      };
    }
  };
  return { env: { DB: db } as unknown as Env, prepared };
}

it('US-REP-001 returns the exact saved Partner preview with category heading, rationale and affected amount', async () => {
  const preview = await getBusinessOpinionPreview(previewEnv(), workspaceId, partnerContext, engagementId, opinionId);
  assert.equal(preview.revision, 3);
  assert.equal(preview.isCurrentForSrm, true);
  assert.deepEqual(preview.reportingBlockers, []);
  const sections = preview.sections as Array<{ heading: string; paragraphs?: string[]; rows?: Array<{ current?: string; detail?: string }> }>;
  assert.equal(sections[0].paragraphs?.[0], 'The financial statements are materially misstated by pervasive omitted liabilities.');
  assert.equal(sections[1].heading, 'Basis for Adverse Opinion');
  assert.equal(sections[2].rows?.[0].current, 'QAR 5025.00');
  assert.equal(sections[2].rows?.[0].detail, 'Supplier accruals were omitted across multiple material operating categories.');
  assert.equal(sections.at(-1)?.heading, 'Other Matter');
});

it('US-REP-001 denies opinion previews to a Reviewer even when reporting.read is present', async () => {
  const reviewer = { ...partnerContext, actor: { persona: 'REVIEWER', staffGrade: 'SENIOR' } };
  await assert.rejects(getBusinessOpinionPreview(previewEnv(), workspaceId, reviewer, engagementId, opinionId), /Only a Partner approver/);
});

it('US-REP-001 rejects a modified opinion missing its affected FSLI and basis before any insert is planned', async () => {
  const { env, prepared } = opinionCommandEnv();
  await assert.rejects(buildBusinessReportingMutation(env, workspaceId, partnerContext, { type: 'opinion.select', payload: {
    engagementId, category: 'QUALIFIED', affectedFslis: [], rationale: 'A detailed Partner rationale for this modified opinion.',
    materialityAssessment: 'The misstatement exceeds overall materiality.', pervasivenessAssessment: 'The identified issue is confined to the listed accounting area.'
  } } as any, 'command-1', new Date().toISOString()), (error: any) => error.code === 'VALIDATION_FAILED');
  assert.equal(prepared.some(sql => sql.includes('INSERT INTO opinion_versions')), false);
});

it('US-REP-001 builds an immutable Adverse version with its exact category heading and affected-line insert', async () => {
  const { env, prepared } = opinionCommandEnv();
  const result = await buildBusinessReportingMutation(env, workspaceId, partnerContext, { type: 'opinion.select', payload: {
    engagementId, category: 'ADVERSE', affectedFslis: [{ fsliId, amountMinor: '502500', explanation: 'Omitted supplier accruals affect liabilities and expenses across the statement.' }],
    rationale: 'The financial statements are materially misstated by pervasive omitted liabilities.',
    materialityAssessment: 'The identified amount is material to the financial statements as a whole.',
    pervasivenessAssessment: 'The effect is pervasive across statements and note disclosures.',
    basisText: 'Liabilities and related expenses are omitted from the approved financial statements.', additionalSections: []
  } } as any, 'command-2', new Date().toISOString());
  assert.equal(result.result.basisHeading, 'Basis for Adverse Opinion');
  assert.equal(prepared.filter(sql => sql.includes('INSERT INTO opinion_versions')).length, 1);
  assert.equal(prepared.filter(sql => sql.includes('INSERT INTO opinion_affected_fslis')).length, 1);
});

it('US-REP-001 surfaces stale SRM and going-concern source versions as reporting blockers', async () => {
  const preview = await getBusinessOpinionPreview(previewEnv(true), workspaceId, partnerContext, engagementId, opinionId);
  assert.equal(preview.isCurrentForSrm, false);
  assert.ok((preview.reportingBlockers as string[]).some(blocker => blocker.includes('current cleared SRM')));
  assert.ok((preview.reportingBlockers as string[]).some(blocker => blocker.includes('going-concern assessment')));
});

it('US-REP-002 prevents a Partner from registering another Partner’s signature asset', async () => {
  const env = { DB: { prepare() { throw new Error('The owner mismatch must be rejected before querying or writing.'); } } } as unknown as Env;
  await assert.rejects(buildBusinessReportingMutation(env, workspaceId, partnerContext, { type: 'signature-asset.register', payload: {
    staffMemberId: '66666666-6666-4666-8666-666666666666', signatureFileId: '77777777-7777-4777-8777-777777777777',
    sealFileId: '88888888-8888-4888-8888-888888888888', label: 'Another Partner assets'
  } } as any, 'command-owner', new Date().toISOString()), (error: any) => error.code === 'PERSONA_ACTION_DENIED');
});

it('US-REP-002 prevents a Partner from consenting with another Partner’s asset', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const engagement = { id: engagementId, version: 1, client_id: 'client-current', code: 'QA-REPORT-1', period_start: '2026-01-01', period_end: '2026-12-31',
    engagement_type: 'STATUTORY_AUDIT', lifecycle_state: 'PARTNER_APPROVAL', contract_fee_minor: 100000, active_proposal_version_id: 'proposal-1',
    active_tb_version_id: 'tb-1', active_mapping_version_id: 'mapping-1', active_materiality_version_id: 'materiality-1', approved_planning_version_id: 'planning-1',
    standards_profile_id: 'standards-current', locked_at: null, portal_frozen_at: null, client_name: 'Synthetic Client', firm_name: 'Synthetic Firm' };
  const candidate = { id: 'report-candidate', opinion_version_id: opinionId, report_artifact_id: 'report-artifact', dependency_hash: digest,
    proposed_report_date: today, status: 'READY', signature_asset_id: 'signature-asset', content_sha256: digest, file_version_id: 'candidate-file' };
  const staffId = '55555555-5555-4555-8555-555555555555';
  const db = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) { return this; },
        async first() {
          if (sql.includes('FROM engagements e JOIN clients')) return engagement;
          if (sql.includes('FROM report_candidates c JOIN generated_artifacts')) return candidate;
          if (sql.includes('SELECT id,active_tb_version_id')) return { id: engagementId, active_tb_version_id: 'tb-1', active_mapping_version_id: 'mapping-1',
            active_materiality_version_id: 'materiality-1', approved_planning_version_id: 'planning-1', standards_profile_id: 'standards-current' };
          if (sql.includes('SELECT s.*,c.id AS clearance_id')) return { id: 'srm-current', revision: 1, statement_snapshot_id: 'snapshot-current',
            dependency_hash: digest, clearance_id: 'clearance-current', clearance_hash: digest };
          if (sql.includes('SELECT id,source_hash,tb_version_id')) return { id: 'snapshot-current', source_hash: digest, tb_version_id: 'tb-1',
            mapping_version_id: 'mapping-1', standards_profile_id: 'standards-current' };
          if (sql.includes('SELECT id,presentation_edition')) return { id: 'standards-current', presentation_edition: 'ISA-2025',
            effective_period_start: '2020-01-01', effective_period_end: null, content_sha256: digest };
          if (sql.includes('SELECT srm_version_id,dependency_hash FROM opinion_versions')) return { srm_version_id: 'srm-current', dependency_hash: digest };
          if (sql.includes('FROM report_signature_assets a JOIN staff_members s')) return { id: 'signature-asset', staff_member_id: '66666666-6666-4666-8666-666666666666',
            signature_sha256: digest, seal_sha256: digest, display_name: 'Other Partner', grade: 'PARTNER', active: 1 };
          throw new Error(`Unexpected consent SQL in owner test: ${sql}`);
        }
      };
    }
  };
  const env = { DB: db } as unknown as Env;
  await assert.rejects(buildBusinessReportingMutation(env, workspaceId, { ...partnerContext, actor: { ...partnerContext.actor, staffMemberId: staffId } }, {
    type: 'report.consent', payload: { engagementId, reportCandidateId: candidate.id, signatureAssetId: candidate.signature_asset_id,
      candidateContentHash: digest, proposedReportDate: today, consentText: 'I reviewed the complete exact report preview and approve this image application.' }
  } as any, 'command-consent-owner', new Date().toISOString()), (error: any) => error.code === 'PERSONA_ACTION_DENIED');
});
