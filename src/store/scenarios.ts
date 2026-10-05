// AuditSphere Named Scenarios & Preset Generators
// VP-004: Coherent synthetic scenarios & recovery

import { PrototypeState } from '../types';
import { createInitialState } from './initialState';
import { createTargetScenario } from './targetScenario';

export type ScenarioName =
  | 'target-lifecycle'
  | 'full-practice'
  | 'accounting-only'
  | 'audit-findings'
  | 'two-component-consolidation'
  | 'blocked-rework'
  | 'empty-practice';

export interface ScenarioDefinition {
  id: ScenarioName;
  title: string;
  description: string;
  createState: () => PrototypeState;
}

export const SCENARIO_DEFINITIONS: ScenarioDefinition[] = [
  {
    id: 'full-practice',
    title: 'Full Practice Lifecycle',
    description: 'Complete cross-module state with active audit engagement, jobs, PBC requests, review notes, and receivables.',
    createState: () => createInitialState()
  },
  {
    id: 'accounting-only',
    title: 'Accounting-Only Engagement',
    description: 'Annual compilation engagement focused on trial balance intake, GL tie-out, adjustments, and financial statements.',
    createState: () => {
      const state = createInitialState();
      state.selectedEngagement = 'ENG-26002';
      return state;
    }
  },
  {
    id: 'audit-findings',
    title: 'Audit with Open Findings & Exceptions',
    description: 'Fieldwork phase with open review points, substantive exceptions, and proposed depreciation finding FND-01.',
    createState: () => {
      const state = createInitialState();
      const eng = state.engagements[0];
      eng.stage = 'Fieldwork';
      eng.workpapers[2].status = 'Changes required';
      return state;
    }
  },
  {
    id: 'two-component-consolidation',
    title: 'Two-Component Group Dataset',
    description: 'Consolidation group GRP-01 linking Example Trading Entity (Parent) and Northstar Services with QAR 50,000 elimination.',
    createState: () => {
      const state = createInitialState();
      state.selectedEngagement = 'ENG-26001';
      return state;
    }
  },
  {
    id: 'blocked-rework',
    title: 'Blocked / Rework State',
    description: 'Demonstrates release gates blocking candidate release due to open review points and unrecorded partner decision.',
    createState: () => {
      const state = createInitialState();
      const eng = state.engagements[0];
      eng.approvals.manager = null;
      eng.approvals.partner = null;
      eng.candidate = null;
      return state;
    }
  },
  {
    id: 'empty-practice',
    title: 'Empty Practice',
    description: 'Completely fresh installation for verifying zero/empty states, onboarding, and first setup without seeded records.',
    createState: () => {
      const state = createInitialState();
      state.clients = [];
      state.contacts = [];
      state.engagements = [];
      state.leads = [];
      state.proposals = [];
      state.jobs = [];
      state.jobTasks = [];
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
      state.samplePopulations = [];
      state.evidenceCatalogue = [];
      state.findings = [];
      state.m365Config.status = 'Not configured';
      return state;
    }
  },
  { id: 'target-lifecycle', title: 'Canonical Audit Lifecycle', description: 'Start with a new lead and demonstrate the full controlled audit lifecycle with synthetic records.', createState: createTargetScenario },
];

export function loadScenarioState(name: ScenarioName): PrototypeState {
  const def = SCENARIO_DEFINITIONS.find(s => s.id === name);
  return def ? def.createState() : createInitialState();
}
