import { createInitialState } from '../../src/store/initialState';
import { migratePersistedState } from '../../src/services/migrations';
import { emptyAuditLifecycle } from '../../src/services/targetLifecycle';
import type { PrototypeState } from '../../src/types';
export function targetFixture(): PrototypeState {
  const state = migratePersistedState(createInitialState(), createInitialState()).state;
  const e = state.engagements[0];
  state.engagements = [e];
  state.selectedEngagement = e.id;
  state.asOfDate = '2026-09-30';
  e.auditLifecycle = emptyAuditLifecycle();
  e.workpapers = [];
  e.reviews = [];
  e.pbc = [];
  e.releases = [];
  e.archive = null;
  e.acceptance = false;
  e.planning = false;
  e.sourceAccepted = false;
  e.mappingApproved = false;
  e.sourceVersion = 0;
  e.rows = [];
  e.stage = 'Draft';
  e.lifecycleStatus = 'Active';
  e.generation = 0;
  e.candidate = null;
  state.acceptanceCases = [];
  state.auditPlans = [];
  state.auditPrograms = [];
  state.auditRisks = [];
  state.samplePopulations = [];
  state.documents = [];
  state.evidenceCatalogue = [];
  state.findings = [];
  state.archives = [];
  state.receipts = [];
  state.invoices = [];
  state.folders = [];
  state.confirmations = [];
  state.statementSetRevisions = [];
  state.accountMappingRevisions = [];
  state.times = [];
  state.firmLedger = [];
  state.proposals = state.proposals.filter((p) => p.id === e.proposalId);
  const p = state.proposals[0];
  p.presentedSnapshot = {
    revision: p.revision,
    title: p.title,
    currency: p.currency,
    totalAmount: p.totalAmount,
    items: structuredClone(p.items),
    terms: p.terms,
    presentedBy: 'Amira Qasim',
    presentedAt: '2026-09-14T00:00:00Z'
  };
  p.clientResponse!.revision = p.revision;
  return state;
}
export function act(state: PrototypeState, id: string) {
  const user = state.users.find((u) => u.id === id)!;
  state.currentUserId = user.id;
  state.currentRole = user.role;
  state.currentPerson = user.name;
}
export function acceptance(state: PrototypeState) {
  const e = state.engagements[0];
  return {
    id: 'ACC-TARGET',
    engagementId: e.id,
    clientId: e.client,
    service: e.service,
    year: e.year,
    isContinuance: false,
    amlKycCompleted: true,
    independenceConfirmed: true,
    conflictsCleared: true,
    prohibitionsChecked: true,
    competenceConfirmed: true,
    riskRating: 'Low' as const,
    conditions: [],
    recommendationNotes: 'Evidence for all five professional screening areas assessed.',
    managementIntegrityConfirmed: true,
    financialViabilityConfirmed: true,
    screeningEvidence: {
      amlKyc: 'KYC-01',
      independence: 'IND-01',
      conflicts: 'CONFLICT-01',
      prohibitions: 'PROHIB-01',
      competence: 'COMP-01',
      managementIntegrity: 'INTEG-01',
      financialViability: 'VIAB-01'
    },
    decisionStatus: 'Pending' as const
  };
}
