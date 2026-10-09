import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';

type ApiResult = { response: Response; body: any };

/**
 * Registers the E05-S02 acceptance matrix against the shared businessWorkspace
 * Worker fixture. The caller supplies results from the fixture's real
 * `worker.fetch` commands and projections so the matrix assertions stay
 * independent and readable without repeating the expensive business setup.
 */
export async function runFieldworkAcceptanceMatrix(t: TestContext, evidence: {
  getFieldworkWorkspace: () => Promise<ApiResult>;
  revenueWorkprogramId: string;
  insertedAdHocProcedureId: string;
  activeProgramAdHocProcedureId: string;
  provisionedRevenueProcedures: Array<Record<string, any>>;
  persistedRevenueProcedures: Array<Record<string, any>>;
  missingAdHocInputs: ApiResult[];
  insertedAdHocRevision: Record<string, any>;
  insertedAdHocAudit: Record<string, any>;
  insertedAdHocChangeFeedCount: number;
  linkedEvidence: ApiResult;
  unlinkedEvidence: ApiResult;
  staleEvidenceSubmit: ApiResult;
  incompleteSubmit: ApiResult;
  completedSubmit: ApiResult;
  adHocWorkprogramRow: Record<string, any>;
  submittedProcedureEdit: ApiResult;
  preparerReviewAttempt: ApiResult;
  emptyReturn: ApiResult;
  returnedForRework: ApiResult;
  preparerReworkUpdate: ApiResult;
  resubmission: ApiResult;
  resubmissionTargetVersion: number;
  preparerSelfReview: ApiResult;
  associateRedProvision: ApiResult;
  managerRedProvision: ApiResult;
  redProgramAssignedStaffId: string;
  managerStaffId: string;
  prematurePartnerClearance: ApiResult;
}): Promise<void> {
  await t.test('M3-004.1 — provisioned FSLI workprogram exposes required assertions', async () => {
    const projection = await evidence.getFieldworkWorkspace();
    assert.equal(projection.response.status, 200, JSON.stringify(projection.body));
    const program = projection.body.procedures.filter((row: any) => row.workprogramId === evidence.revenueWorkprogramId);
    assert.deepEqual(new Set(program.map((row: any) => row.assertion)),
      new Set(['RIGHTS_OBLIGATIONS', 'VALUATION', 'COMPLETENESS', 'EXISTENCE', 'CUTOFF']));
  });

  await t.test('M3-004.2 — procedure state persists in a later Worker GET', async () => {
    const projection = await evidence.getFieldworkWorkspace();
    assert.equal(projection.response.status, 200, JSON.stringify(projection.body));
    const programRows = projection.body.procedures.filter((row: any) => row.workprogramId === evidence.revenueWorkprogramId);
    assert.equal(programRows.length, 6);
    assert.ok(programRows.some((row: any) => row.id === evidence.insertedAdHocProcedureId && row.origin === 'AD_HOC'));
    assert.ok(evidence.persistedRevenueProcedures.some(row => row.id === evidence.insertedAdHocProcedureId));
  });

  await t.test('M3-004.3 — evidence links are versioned and stale evidence blocks submission', async () => {
    assert.equal(evidence.linkedEvidence.response.status, 200, JSON.stringify(evidence.linkedEvidence.body));
    assert.equal(evidence.unlinkedEvidence.response.status, 200, JSON.stringify(evidence.unlinkedEvidence.body));
    assert.equal(evidence.staleEvidenceSubmit.response.status, 409);
    assert.equal(evidence.staleEvidenceSubmit.body.code, 'STALE_DEPENDENCY');
  });

  await t.test('M3-004.4 — incomplete procedures identify fields and complete work submits', async () => {
    assert.equal(evidence.incompleteSubmit.response.status, 422);
    assert.equal(evidence.incompleteSubmit.body.code, 'VALIDATION_FAILED');
    assert.deepEqual(evidence.incompleteSubmit.body.details.fields, ['workPerformed', 'conclusion']);
    assert.equal(evidence.completedSubmit.response.status, 200, JSON.stringify(evidence.completedSubmit.body));
    assert.equal(evidence.completedSubmit.body.result.status, 'SUBMITTED');
  });

  await t.test('M3-005.1 — ad-hoc insert requires title, instructions and reason independently', () => {
    assert.equal(evidence.missingAdHocInputs.length, 3);
    for (const result of evidence.missingAdHocInputs) {
      assert.equal(result.response.status, 422);
      assert.equal(result.body.code, 'VALIDATION_FAILED');
    }
  });

  await t.test('M3-005.2 — inserted mandatory step remains in the active program submission', () => {
    assert.equal(evidence.adHocWorkprogramRow.id, evidence.activeProgramAdHocProcedureId);
    assert.equal(evidence.adHocWorkprogramRow.origin, 'AD_HOC');
    assert.equal(evidence.adHocWorkprogramRow.mandatory, 1);
    assert.equal(evidence.adHocWorkprogramRow.status, 'REVIEWED');
    assert.ok(evidence.adHocWorkprogramRow.scopeReason);
  });

  await t.test('M3-005.3 — insertion records actor and reason in revision, audit and change feed', () => {
    assert.equal(evidence.insertedAdHocRevision.changed_by_actor_id, evidence.insertedAdHocAudit.actor_id);
    assert.ok(evidence.insertedAdHocRevision.reason);
    assert.equal(JSON.parse(evidence.insertedAdHocAudit.details_json).details.scopeReason, evidence.insertedAdHocRevision.reason);
    assert.equal(evidence.insertedAdHocChangeFeedCount, 1);
  });

  await t.test('M3-009 — preparer edits are locked after submission', () => {
    assert.equal(evidence.submittedProcedureEdit.response.status, 422);
    assert.equal(evidence.submittedProcedureEdit.body.code, 'INVALID_STATE');
  });

  await t.test('M3-010 — reviewer return, assigned rework and new revision resubmission are enforced', () => {
    assert.equal(evidence.emptyReturn.response.status, 422);
    assert.equal(evidence.emptyReturn.body.code, 'VALIDATION_FAILED');
    assert.equal(evidence.returnedForRework.response.status, 200);
    assert.equal(evidence.returnedForRework.body.result.status, 'UNDER_REWORK');
    assert.equal(evidence.preparerReworkUpdate.response.status, 200);
    assert.equal(evidence.resubmission.response.status, 200);
    assert.equal(evidence.resubmission.body.result.version, evidence.resubmissionTargetVersion);
    assert.ok(evidence.resubmission.body.result.reviewSubmissionId);
    assert.equal(evidence.preparerSelfReview.body.code, 'SELF_REVIEW_BLOCKED');
  });

  await t.test('Persona gates — preparer review, RED execution and premature Partner clearance are denied', () => {
    assert.equal(evidence.preparerReviewAttempt.response.status, 403);
    assert.equal(evidence.preparerReviewAttempt.body.code, 'PERSONA_ACTION_DENIED');
    assert.equal(evidence.associateRedProvision.response.status, 403);
    assert.equal(evidence.managerRedProvision.response.status, 200);
    assert.equal(evidence.redProgramAssignedStaffId, evidence.managerStaffId);
    assert.equal(evidence.prematurePartnerClearance.body.code, 'INVALID_STATE');
  });
}
