// AuditSphere route registry (MOD-UX-01).
//
// One machine-readable description of every supported module: what the page is,
// what record it governs, how its journey is described, and whether it is a
// first-class workspace, a legacy alias or an informational page.
//
// This is metadata only. Route authorization stays in guards.canOpenRoute and
// the navigation groups stay in the Shell; the registry exists so the shared
// lifecycle layer, the module guide and the tests agree on one list.

import type { RouteKey } from '../types';
import { ROUTE_KEYS } from '../types';
import { MODULE_LIFECYCLE_MODEL, LifecycleModelId } from './lifecycle';

export type RouteKind = 'workspace' | 'record' | 'informational' | 'alias';

export interface RouteRegistration {
  /** Sidebar label, matching the navigation the persona actually sees. */
  readonly label: string;
  /** Domain group, matching the sidebar grouping. */
  readonly group: string;
  readonly kind: RouteKind;
  /** The business record this route governs, when it governs exactly one. */
  readonly record: string | null;
  readonly lifecycle: LifecycleModelId;
  /** Route this alias resolves to, when `kind` is `alias`. */
  readonly aliasOf?: RouteKey;
  /** The module's primary next step, used by the guide and the headers. */
  readonly nextStep: string;
  /** Where this module's work continues. */
  readonly continuesTo?: readonly RouteKey[];
}

export const ROUTE_REGISTRY: Readonly<Record<RouteKey, RouteRegistration>> = {
  overview: {
    label: 'Practice Overview', group: 'Practice', kind: 'workspace', record: null, lifecycle: MODULE_LIFECYCLE_MODEL.overview,
    nextStep: 'Open the work queue that needs your decision', continuesTo: ['engagements', 'reviews', 'approvals']
  },
  clients: {
    label: 'Client Portfolio', group: 'Practice', kind: 'workspace', record: 'ClientRecord', lifecycle: MODULE_LIFECYCLE_MODEL.clients,
    nextStep: 'Open a client to see its engagements', continuesTo: ['client-detail', 'proposals']
  },
  'client-detail': {
    label: 'Client 360', group: 'Practice', kind: 'record', record: 'ClientRecord', lifecycle: MODULE_LIFECYCLE_MODEL['client-detail'],
    nextStep: 'Respond to the open PBC request', continuesTo: ['documents', 'engagements', 'portal']
  },
  acquisition: {
    label: 'Acquisition & Pipeline', group: 'Practice', kind: 'workspace', record: 'LeadOpportunity', lifecycle: MODULE_LIFECYCLE_MODEL.acquisition,
    nextStep: 'Qualify the lead and prepare terms', continuesTo: ['proposals']
  },
  proposals: {
    label: 'Proposals & Terms', group: 'Practice', kind: 'record', record: 'ProposalRecord', lifecycle: MODULE_LIFECYCLE_MODEL.proposals,
    nextStep: 'Send the reviewed proposal to the client', continuesTo: ['engagements']
  },
  engagements: {
    label: 'Engagements', group: 'Practice', kind: 'workspace', record: 'EngagementRecord', lifecycle: MODULE_LIFECYCLE_MODEL.engagements,
    nextStep: 'Confirm acceptance and open the engagement job', continuesTo: ['onboarding', 'jobs']
  },
  onboarding: {
    label: 'Acceptance & KYC', group: 'Practice', kind: 'record', record: 'AcceptanceCaseRecord', lifecycle: MODULE_LIFECYCLE_MODEL.onboarding,
    nextStep: 'Complete screening evidence and obtain partner acceptance', continuesTo: ['audit-planning', 'engagements']
  },
  jobs: {
    label: 'Jobs & Tasks', group: 'Work & Collaboration', kind: 'workspace', record: 'JobRecord', lifecycle: MODULE_LIFECYCLE_MODEL.jobs,
    nextStep: 'Complete the overdue tasks on the open job', continuesTo: ['audit', 'documents']
  },
  'job-templates': {
    label: 'Job Templates', group: 'Work & Collaboration', kind: 'record', record: 'JobTemplateItem', lifecycle: MODULE_LIFECYCLE_MODEL['job-templates'],
    nextStep: 'Publish the template so it can be applied to a job', continuesTo: ['jobs']
  },
  documents: {
    label: 'Documents & SharePoint', group: 'Work & Collaboration', kind: 'workspace', record: 'DocumentItem', lifecycle: MODULE_LIFECYCLE_MODEL.documents,
    nextStep: 'Resolve the open client request', continuesTo: ['evidence', 'client-detail']
  },
  communications: {
    label: 'Team & Client Comms', group: 'Work & Collaboration', kind: 'workspace', record: 'CommunicationItem', lifecycle: MODULE_LIFECYCLE_MODEL.communications,
    nextStep: 'Log the outstanding client correspondence', continuesTo: ['client-detail']
  },
  'my-time': {
    label: 'Time Tracking', group: 'Economics & Billing', kind: 'workspace', record: 'TimeEntryItem', lifecycle: MODULE_LIFECYCLE_MODEL['my-time'],
    nextStep: 'Submit the week for review', continuesTo: ['billing', 'budgets']
  },
  budgets: {
    label: 'Budgets & Variances', group: 'Economics & Billing', kind: 'record', record: 'BudgetRecord', lifecycle: MODULE_LIFECYCLE_MODEL.budgets,
    nextStep: 'Submit the budget for approval', continuesTo: ['billing']
  },
  billing: {
    label: 'Billing & Invoices', group: 'Economics & Billing', kind: 'workspace', record: 'InvoiceRecord', lifecycle: MODULE_LIFECYCLE_MODEL.billing,
    nextStep: 'Approve or return the draft invoice', continuesTo: ['receivables']
  },
  receivables: {
    label: 'Receivables & Receipts', group: 'Economics & Billing', kind: 'workspace', record: 'ReceiptRecord', lifecycle: MODULE_LIFECYCLE_MODEL.receivables,
    nextStep: 'Allocate the unapplied receipt', continuesTo: ['reports']
  },
  'accounting-setup': {
    label: 'Accounting Workbench', group: 'Accounting Workbench', kind: 'workspace', record: 'ClientAccountingProfile', lifecycle: MODULE_LIFECYCLE_MODEL['accounting-setup'],
    nextStep: 'Import the current trial balance', continuesTo: ['trial-balance', 'gl-transactions']
  },
  'trial-balance': {
    label: 'Trial Balance', group: 'Accounting Workbench', kind: 'record', record: 'TrialBalanceRow', lifecycle: MODULE_LIFECYCLE_MODEL['trial-balance'],
    nextStep: 'Validate and confirm the imported source revision', continuesTo: ['account-mappings', 'adjustments']
  },
  'gl-transactions': {
    label: 'GL Transactions', group: 'Accounting Workbench', kind: 'record', record: 'GLTransactionItem', lifecycle: MODULE_LIFECYCLE_MODEL['gl-transactions'],
    nextStep: 'Map the unfamiliar GL columns and reconcile to the trial balance', continuesTo: ['reconciliations']
  },
  'account-mappings': {
    label: 'Account Mappings', group: 'Accounting Workbench', kind: 'record', record: 'AccountMappingRevision', lifecycle: MODULE_LIFECYCLE_MODEL['account-mappings'],
    nextStep: 'Obtain independent mapping approval', continuesTo: ['financial-statements']
  },
  adjustments: {
    label: 'Adjustment Journals', group: 'Accounting Workbench', kind: 'record', record: 'AdjustmentJournalItem', lifecycle: MODULE_LIFECYCLE_MODEL.adjustments,
    nextStep: 'Route the journal through technical review', continuesTo: ['financial-statements']
  },
  reconciliations: {
    label: 'Reconciliations', group: 'Accounting Workbench', kind: 'record', record: 'ReconciliationSchedule', lifecycle: MODULE_LIFECYCLE_MODEL.reconciliations,
    nextStep: 'Clear the open residual with evidence', continuesTo: ['financial-statements']
  },
  'financial-statements': {
    label: 'Financial Statements', group: 'Accounting Workbench', kind: 'record', record: 'StatementSetRevision', lifecycle: MODULE_LIFECYCLE_MODEL['financial-statements'],
    nextStep: 'Save and independently review the statement revision', continuesTo: ['financial-packages']
  },
  'financial-packages': {
    label: 'Financial Packages', group: 'Accounting Workbench', kind: 'record', record: 'FinancialPackageRevision', lifecycle: MODULE_LIFECYCLE_MODEL['financial-packages'],
    nextStep: 'Complete the outstanding package approval', continuesTo: ['delivery']
  },
  consolidation: {
    label: 'Group Consolidation', group: 'Accounting Workbench', kind: 'record', record: 'ConsolidationGroupRecord', lifecycle: MODULE_LIFECYCLE_MODEL.consolidation,
    nextStep: 'Review the consolidation run output', continuesTo: ['financial-packages']
  },
  'audit-planning': {
    label: 'Audit Planning & Materiality', group: 'Audit & Assurance', kind: 'record', record: 'AuditPlanRecord', lifecycle: MODULE_LIFECYCLE_MODEL['audit-planning'],
    nextStep: 'Obtain independent plan review', continuesTo: ['audit-risks']
  },
  'audit-risks': {
    label: 'Risks & Audit Programs', group: 'Audit & Assurance', kind: 'record', record: 'AuditRiskItem', lifecycle: MODULE_LIFECYCLE_MODEL['audit-risks'],
    nextStep: 'Approve the risk revision and its programme', continuesTo: ['sampling', 'audit-fieldwork']
  },
  'audit-fieldwork': {
    label: 'Audit Fieldwork', group: 'Audit & Assurance', kind: 'workspace', record: 'AuditProcedureItem', lifecycle: MODULE_LIFECYCLE_MODEL['audit-fieldwork'],
    nextStep: 'Complete the open procedure', continuesTo: ['audit', 'findings']
  },
  sampling: {
    label: 'Sampling & Populations', group: 'Audit & Assurance', kind: 'record', record: 'SamplePopulationItem', lifecycle: MODULE_LIFECYCLE_MODEL.sampling,
    nextStep: 'Select and document the sample', continuesTo: ['audit']
  },
  audit: {
    label: 'Audit Workpapers', group: 'Audit & Assurance', kind: 'workspace', record: 'WorkpaperItem', lifecycle: MODULE_LIFECYCLE_MODEL.audit,
    nextStep: 'Clear the workpaper with a reviewer', continuesTo: ['findings', 'reviews']
  },
  evidence: {
    label: 'Evidence Catalogue', group: 'Audit & Assurance', kind: 'workspace', record: 'EvidenceItem', lifecycle: MODULE_LIFECYCLE_MODEL.evidence,
    nextStep: 'Determine the adequacy of the pending evidence', continuesTo: ['audit', 'findings']
  },
  findings: {
    label: 'Findings & Differences', group: 'Audit & Assurance', kind: 'record', record: 'FindingItem', lifecycle: MODULE_LIFECYCLE_MODEL.findings,
    nextStep: 'Obtain an independent response review', continuesTo: ['reviews', 'delivery']
  },
  reviews: {
    label: 'Review Desk', group: 'Audit & Assurance', kind: 'workspace', record: 'ReviewNoteItem', lifecycle: MODULE_LIFECYCLE_MODEL.reviews,
    nextStep: 'Clear or return the open review point', continuesTo: ['approvals']
  },
  approvals: {
    label: 'Sign-offs & EQR', group: 'Audit & Assurance', kind: 'record', record: 'EngagementRecord.approvals', lifecycle: MODULE_LIFECYCLE_MODEL.approvals,
    nextStep: 'Record the outstanding independent sign-off', continuesTo: ['delivery']
  },
  quality: {
    label: 'Engagement Quality Review', group: 'Audit & Assurance', kind: 'record', record: 'EngagementRecord.eqrConcerns', lifecycle: MODULE_LIFECYCLE_MODEL.quality,
    nextStep: 'Record EQR concurrence', continuesTo: ['delivery']
  },
  delivery: {
    label: 'Release & Completion', group: 'Audit & Assurance', kind: 'record', record: 'ArchiveRecord', lifecycle: MODULE_LIFECYCLE_MODEL.delivery,
    nextStep: 'Confirm the release candidate and dispatch', continuesTo: ['records']
  },
  records: {
    label: 'Records & Archive', group: 'Audit & Assurance', kind: 'workspace', record: 'ArchiveRecord', lifecycle: MODULE_LIFECYCLE_MODEL.records,
    nextStep: 'Open the archived record index', continuesTo: ['reports']
  },
  portal: {
    label: 'Client Portal Preview', group: 'Client Services & Admin', kind: 'workspace', record: 'DocumentItem', lifecycle: MODULE_LIFECYCLE_MODEL.portal,
    nextStep: 'Review the shared records only', continuesTo: ['documents']
  },
  reports: {
    label: 'Report Centre', group: 'Client Services & Admin', kind: 'workspace', record: null, lifecycle: MODULE_LIFECYCLE_MODEL.reports,
    nextStep: 'Generate the practice report', continuesTo: []
  },
  administration: {
    label: 'Firm Administration', group: 'Client Services & Admin', kind: 'workspace', record: 'FirmSettings', lifecycle: MODULE_LIFECYCLE_MODEL.administration,
    nextStep: 'Review the access grants', continuesTo: ['m365-setup']
  },
  'm365-setup': {
    label: 'Microsoft 365 Setup', group: 'Client Services & Admin', kind: 'workspace', record: 'M365SimulationConfig', lifecycle: MODULE_LIFECYCLE_MODEL['m365-setup'],
    nextStep: 'Confirm the simulated configuration', continuesTo: ['communications', 'documents']
  },
  requirements: {
    label: 'Requirements & PRD', group: 'Client Services & Admin', kind: 'informational', record: null, lifecycle: MODULE_LIFECYCLE_MODEL.requirements,
    nextStep: 'Read the supported scope and exclusions', continuesTo: []
  },
  'module-guide': {
    label: 'Module Guide & Tour', group: 'Client Services & Admin', kind: 'informational', record: null, lifecycle: MODULE_LIFECYCLE_MODEL['module-guide'],
    nextStep: 'Open the guided route for a module', continuesTo: []
  },
  services: {
    label: 'Firm Administration', group: 'Client Services & Admin', kind: 'alias', record: null, lifecycle: MODULE_LIFECYCLE_MODEL.administration,
    aliasOf: 'administration', nextStep: 'Use Firm Administration', continuesTo: ['administration']
  },
  'role-guide': {
    label: 'Requirements & PRD', group: 'Client Services & Admin', kind: 'alias', record: null, lifecycle: MODULE_LIFECYCLE_MODEL.requirements,
    aliasOf: 'requirements', nextStep: 'Use Requirements & PRD', continuesTo: ['requirements']
  }
};

/** Routes that render a first-class workspace or record page. */
export const WORKSPACE_ROUTES: readonly RouteKey[] = ROUTE_KEYS.filter(route => ROUTE_REGISTRY[route].kind !== 'alias');

/** Route groups in the order the sidebar presents them. */
export const ROUTE_GROUP_ORDER: readonly string[] = [
  'Practice', 'Work & Collaboration', 'Economics & Billing', 'Accounting Workbench',
  'Audit & Assurance', 'Client Services & Admin'
];

export function routeLabel(route: RouteKey): string {
  return ROUTE_REGISTRY[route]?.label ?? route;
}

export function routesInGroup(group: string): readonly RouteKey[] {
  return ROUTE_KEYS.filter(route => ROUTE_REGISTRY[route].group === group);
}
