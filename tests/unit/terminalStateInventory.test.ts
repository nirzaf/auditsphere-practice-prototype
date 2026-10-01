// VP-012-E02: complete command inventory for engagement terminal states.
// Every public store command is classified once. Professional engagement-bound
// commands must pass through a lifecycle guard; billing/records/admin families
// stay available for historical handling. New commands fail this test until
// they are classified, so the inventory cannot silently drift.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { createInitialState } from '../../src/store/initialState.js';
import type { PrototypeState } from '../../src/types/index.js';

type Family =
  | 'internal'          // read-only helpers, persistence, derived staleness
  | 'session'           // persona / selection switches
  | 'crm'               // client, contact, custom-field records (client-level)
  | 'identity'          // identities, grants, invitations
  | 'commercial'        // leads, proposals, engagement creation (pre-activation)
  | 'lifecycle'         // engagement activation/update/lifecycle, own terminal rules
  | 'firm-library'      // firm-level templates and settings (not engagement-bound)
  | 'billing'           // invoices, credits, receipts — permitted in terminal states
  | 'records'           // document sharing/links, archive — permitted in terminal states
  | 'setup'             // simulated M365 / workspace / acceptance case (pre-engagement)
  | 'recovery'          // scenario load, reset, import/export, integrity
  | 'professional';     // engagement-bound professional preparation/review/output

const INVENTORY: Record<Family, string[]> = {
  internal: ['packageExpiredArchives', 'hasStorageConflict', 'resolveStorageConflict', 'isSessionOnlyMode', 'getLoadError', 'assertCurrentAdjustmentSupport', 'getAdjustmentSupportIssue', 'getAdjustmentSupportIssues', 'loadInitialState', 'persist', 'notify', 'getPreservedStateJSON', 'invalidateReleaseBasis', 'reopenWorkpaperReviewNotes', 'reopenFindingReviewNotes', 'reviewSubjectRevision', 'assignAccountingPeriod', 'hasNewerDocumentRevision', 'staleReconciliation', 'staleStatementSetRevisions', 'staleCashFlowSchedules', 'logEvent', 'validateClientProfile', 'getClientProfileWarnings', 'assertTaskHierarchy', 'assertTaskAssignee', 'assertScopedJobStaff', 'assertJobTemplateStructure', 'recordAuditProcedureHistory', 'markLocalNoticeRead', 'evaluateReleaseReadiness'],
  session: ['setRole', 'setPerson', 'setPersona', 'setSelectedEngagement'],
  crm: ['addClient', 'updateClient', 'updateClientContact', 'addContact', 'nominateClientContact', 'reviewClientContactNomination', 'setClientCustomField', 'addCustomFieldDefinition', 'setCustomFieldDefinitionEnabled', 'assignClientRelationshipGroup', 'createClientRelationshipGroup', 'setPrimaryContact'],
  identity: ['grantAccess', 'revokeAccess', 'createDemoIdentity', 'setUserStatus', 'sendSimulatedInvitation', 'recordInvitationExpiry', 'revokeSimulatedInvitation', 'acceptSimulatedInvitation', 'resendSimulatedInvitation'],
  commercial: ['addLead', 'updateLead', 'convertLead', 'saveProposalService', 'saveProposalTemplate', 'addProposal', 'updateProposal', 'presentProposal', 'createProposalRevision', 'reviewProposal', 'recordProposalResponse', 'addEngagement', 'generateEngagementLetter', 'recordSignedEngagementLetter'],
  lifecycle: ['activateEngagement', 'updateEngagement', 'setEngagementLifecycle', 'createContinuanceDraft'],
  'firm-library': ['addJobTemplate', 'createJobTemplateRevision', 'publishJobTemplate', 'retireJobTemplate', 'saveEmailTemplate', 'createAuditProgramTemplate', 'reviseAuditProgramTemplate', 'publishAuditProgramTemplate', 'retireAuditProgramTemplate', 'updateFirmSettings'],
  billing: ['addInvoice', 'cancelInvoiceDraft', 'reviseInvoiceDraft', 'reviewInvoice', 'issueInvoice', 'addCreditNote', 'reviewCreditNote', 'reviseCreditNote', 'issueCreditNote', 'addReceipt', 'allocateReceipt', 'reverseAllocation'],
  records: ['linkDocumentToTask', 'unlinkDocumentFromTask', 'setDocumentClientSharing', 'archiveEngagement', 'recordArchiveHandover'],
  setup: ['updateM365Config', 'simulateM365Verification', 'simulateM365Disconnect', 'prepareClientWorkspace', 'saveAcceptanceCase', 'decideAcceptanceCase'],
  recovery: ['beginWorkspaceReplacement', 'loadScenario', 'resetState', 'exportStateJSON', 'importStateJSON', 'checkIntegrity'],
  professional: ['signOffAnalyticalReview',
    'addJob', 'updateJob', 'addTask', 'updateTask', 'reassignTask', 'applyJobTemplate',
    'addComment', 'moderateComment', 'editComment',
    'addDocument', 'replaceDocumentRevision', 'updateDocumentReference', 'setDocumentAvailability', 'renameClientWorkspaceFolder',
    'addCommunication', 'correctCommunication',
    'addTimeEntry', 'reviewTimeEntry', 'resubmitReturnedTime', 'correctApprovedTime', 'updateBudget',
    'saveAccountingProfile', 'updateTrialBalanceRows', 'importGeneralLedgerSource', 'saveReconciliationSchedule', 'reviewReconciliationSchedule',
    'saveAccountMappings', 'approveAccountMappings', 'saveStatementLayoutRevision', 'saveStatementSetRevision', 'staleStatementRevisionsForComparativeChange',
    'reviewStatementSetRevision', 'saveCashFlowSchedule', 'reviewCashFlowSchedule',
    'addAdjustmentJournal', 'amendAdjustmentJournal', 'reviewAdjustmentJournal', 'markAdjustmentJournalReportingIncluded', 'recordAdjustmentManagementDecision', 'recordAdjustmentManagementResponse', 'updateAdjustmentJournal',
    'updateConsolidationGroup', 'revertConsolidationPerimeter', 'saveConsolidationElimination', 'submitConsolidationElimination', 'reviewConsolidationElimination',
    'saveConsolidationOutputPackage', 'reviewConsolidationOutputPackage', 'updateConsolidationFxRate',
    'createWorkpaperFromTemplate', 'reassignWorkpaper', 'updateWorkpaper', 'linkWorkpaperEvidence', 'unlinkWorkpaperEvidence', 'submitWorkpaper', 'clearWorkpaper', 'replaceWorkpaperRevision',
    'addReviewNote', 'reassignReviewNote', 'respondReviewNote', 'clearReviewNote', 'designateReviewCorrespondence',
    'recordApproval', 'assignEqrReviewer', 'presentManagementPackage', 'recordManagementPackageDecision', 'addEqrConcern', 'toggleEqrConcern', 'respondEqrConcern',
    'uploadPbcResponse', 'replyToPbcRequest', 'addPbcRequest', 'requestPbcClarification', 'presentPbcRequest', 'acceptPbcResponse', 'updatePbcRequest', 'cancelPbcRequest',
    'setEvidenceAdequacy', 'linkEvidenceProcedure', 'unlinkEvidenceProcedure',
    'updateAuditProcedureExecution', 'updateAuditProcedureStatus', 'updateAuditRisk', 'createAuditRisk', 'applyAuditProgramTemplate', 'setAuditRiskProcedureLink',
    'setSampleItemSelected', 'reviewSampleSelection', 'linkSampleExceptionToFinding', 'recordSampleItemLimitation', 'recordSampleItemTest', 'replaceSamplePopulationSource',
    'addFinding', 'setFindingDisposition',
    'prepareReleaseCandidate', 'prepareAmendedRelease', 'issueRelease', 'reopenReleaseForAmendment',
    'saveDisclosureReview', 'reviewDisclosure', 'saveFinancialPackageRevision',
 'saveAuditPlan', 'reviewAuditPlan'
  ]
};

// Professional commands that reach the lifecycle guard through another command.
const DELEGATES: Record<string, string> = {
  prepareAmendedRelease: 'reopenReleaseForAmendment',
  revertConsolidationPerimeter: 'updateConsolidationGroup'
};

const store = prototypeStore as any;
const proto = Object.getPrototypeOf(prototypeStore);
const publicCommands = Object.getOwnPropertyNames(proto).filter(name => name !== 'constructor' && typeof proto[name] === 'function');
const source = (name: string) => String(proto[name]).replace(/\s+/g, '');

function setPersona(state: PrototypeState, name: string) {
  const user = state.users.find(u => u.name === name)!;
  state.currentUserId = user.id;
  state.currentPerson = name;
  state.currentRole = user.role;
}

describe('VP-012-E02 terminal-state command inventory', () => {
  it('classifies every public store command exactly once', () => {
    const classified = Object.values(INVENTORY).flat();
    const duplicates = classified.filter((name, index) => classified.indexOf(name) !== index);
    assert.deepEqual(duplicates, [], 'no command appears in two families');
    assert.deepEqual(publicCommands.filter(name => !classified.includes(name)).sort(), [], 'every store command is classified');
    assert.deepEqual(classified.filter(name => !publicCommands.includes(name)).sort(), [], 'no stale inventory entries');
  });

  it('routes every professional command through a lifecycle guard', () => {
    const unguarded = INVENTORY.professional.filter(name => {
      const body = source(DELEGATES[name] || name);
      const scopedProfessional = /requireEngagementScope\(this\.state,[^,()]+(\.[a-zA-Z]+)*\)/.test(body) || /requireEngagementScope\(this\.state,[^()]*,"professional"\)/.test(body);
      return !scopedProfessional && !body.includes('requireActiveEngagementLifecycle(') && !body.includes('requireActiveConsolidationComponents(');
    });
    assert.deepEqual(unguarded, [], 'professional commands without a lifecycle guard');
  });

  it('keeps billing and records families on their non-professional scope', () => {
    for (const name of [...INVENTORY.billing, ...INVENTORY.records]) {
      const body = source(name);
      assert.ok(!/requireEngagementScope\(this\.state,[^,()]+(\.[a-zA-Z]+)*\)/.test(body), `${name} must not apply professional lifecycle blocking`);
      assert.ok(!body.includes('requireActiveEngagementLifecycle(') && !body.includes('requireActiveConsolidationComponents('), `${name} must stay available in terminal states`);
    }
  });

  for (const lifecycleStatus of ['Suspended', 'Closed', 'Cancelled'] as const) {
    it(`denies accounting setup and group professional writes atomically when ${lifecycleStatus}`, () => {
      store.state = createInitialState();
      setPersona(store.state, 'Layla Rahman');
      const engagement = store.state.engagements.find((item: any) => item.id === 'ENG-26001');
      store.setEngagementLifecycle(engagement.id, lifecycleStatus, `VP-012-E02 inventory: ${lifecycleStatus}`);
      const client = store.state.clients.find((item: any) => item.id === engagement.client);
      const profile = structuredClone(client.accountingProfile);
      const denied: Array<[string, () => unknown]> = [
        ['accounting setup', () => store.saveAccountingProfile(client.id, profile, engagement.id, engagement.accountingPeriodBookId)],
        ['group FX rate', () => store.updateConsolidationFxRate('GRP-01', 'USD', 3.64, '2026-09-23')],
        ['group elimination draft', () => store.saveConsolidationElimination('GRP-01', { id: 'ELIM-TERMINAL', title: 'Blocked', counterpartyA: 'ENG-26001', counterpartyB: 'ENG-26002', amount: 100, currency: 'QAR', status: 'Draft', explanation: 'Blocked', evidenceRef: 'EV', lines: [] } as any, 'Blocked by lifecycle')],
        ['group perimeter change', () => store.updateConsolidationGroup(structuredClone(store.state.consolidationGroups[0]), { reason: 'Blocked by lifecycle' })]
      ];
      for (const [label, run] of denied) {
        const before = JSON.stringify(store.state);
        assert.throws(run, /professional work is blocked/, `${lifecycleStatus} must reject ${label}`);
        assert.equal(JSON.stringify(store.state), before, `${label} rejection leaves state unchanged`);
      }
      store.state = createInitialState();
    });
  }

  it('still allows the same group writes while every component engagement is Active', () => {
    store.state = createInitialState();
    setPersona(store.state, 'Layla Rahman');
    // USD is not a component currency, so validation (not lifecycle) is what rejects it.
    assert.throws(() => store.updateConsolidationFxRate('GRP-01', 'USD', 3.64, '2026-09-23'), (error: Error) => !/professional work is blocked/.test(error.message) && /foreign currency/.test(error.message));
    store.state = createInitialState();
  });
});
