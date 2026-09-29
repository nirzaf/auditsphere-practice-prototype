import { createInitialState } from './initialState';
import { normalizeTargetState } from '../services/targetLifecycle';

/** Clean current-product scenario. Historical fixtures are never presented as completed target work. */
export function createTargetScenario() {
  const state = createInitialState();
  state.asOfDate = new Date().toISOString().slice(0, 10);
  state.currentUserId = 'relationship';
  state.currentRole = 'relationship';
  state.currentPerson = state.users.find((u) => u.id === 'relationship')!.name;
  state.selectedEngagement = '';
  state.clients = [];
  state.contacts = [];
  state.clientContactNominations = [];
  state.leads = [];
  state.proposals = [];
  state.engagements = [];
  state.jobs = [];
  state.jobTasks = [];
  state.jobTemplates = [];
  state.comments = [];
  state.documents = [];
  state.communications = [];
  state.times = [];
  state.budgets = [];
  state.invoices = [];
  state.creditNotes = [];
  state.receipts = [];
  state.glTransactions = [];
  state.adjustmentJournals = [];
  state.consolidationGroups = [];
  state.relationshipGroups = [];
  state.auditRisks = [];
  state.auditPrograms = [];
  state.samplePopulations = [];
  state.evidenceCatalogue = [];
  state.findings = [];
  state.folders = [];
  state.acceptanceCases = [];
  state.auditPlans = [];
  state.archives = [];
  state.events = [];
  state.accountMappingRevisions = [];
  state.statementSetRevisions = [];
  state.statementLayoutRevisions = [];
  state.users = state.users.filter((u) => u.role !== 'eqr');
  state.roleGrants = state.roleGrants.filter((g) => g.role !== 'eqr' && g.scopeKind === 'Global');
  state.proposalServices = state.proposalServices?.filter((s) => /audit/i.test(s.name));
  state.proposalTemplates = state.proposalTemplates?.filter((t) => /audit/i.test(t.name));
  state.m365Config = {
    ...state.m365Config,
    status: 'Not configured',
    liveConnected: false,
    verificationResults: {}
  };
  return normalizeTargetState(state);
}
