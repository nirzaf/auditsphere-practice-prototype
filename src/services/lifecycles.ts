// Lifecycle definitions for every stateful record type (enterprise UX layer).
// Authority: the store commands in prototypeStore.ts. Each transition names the command
// that performs it (tests/unit/lifecycles.test.ts verifies the command exists and that
// every status literal of the record type is placed somewhere in its definition).
// Nothing here changes behaviour: it drives lifecycle steppers, the lifecycle matrix and
// "what happens next" copy. Eligibility stays with guards and store validation.
// Definitions for retired-route record types are migration-compatibility metadata; the
// current five-module surface consumes only the lead and audit-plan lifecycles.
import type { RouteKey } from '../types';
import { statusKind } from './statusSemantics';

export interface LifecycleTransition {
  from: string;
  to: string;
  command: string;
  /** Who may perform it, in product-role language. */
  actor: string;
  /** Segregation-of-duties or precondition rule enforced by the store. */
  rule?: string;
}

export interface LifecycleDefinition {
  id: string;
  record: string;
  module: string;
  route: RouteKey;
  /** Main path; each step lists the statuses that place a record on that step. */
  path: Array<{ step: string; statuses: string[] }>;
  /** Returned/rework statuses: shown on the step they return to, flagged for rework. */
  rework?: { statuses: string[]; returnsTo: string; note: string };
  /** Non-path blocking or stale statuses (record keeps its place but cannot proceed). */
  blocked?: string[];
  stale?: string[];
  /** Step a blocked record is stuck at (default: first step). Earlier steps show done. */
  blockedAt?: string;
  /** Step invalidated by staleness (default: last step, i.e. the approval that went stale). */
  staleAt?: string;
  /** Terminal alternatives that end the lifecycle off the happy path. */
  terminal?: string[];
  transitions: LifecycleTransition[];
  staleness?: string;
  amendPath?: string;
}

export const LIFECYCLES: LifecycleDefinition[] = [
  {
    id: 'lead', record: 'Lead / opportunity', module: 'Leads & Opportunities', route: 'acquisition',
    path: [{ step: 'Inquiry', statuses: ['Inquiry'] }, { step: 'Discovery', statuses: ['Discovery'] }, { step: 'Evaluation', statuses: ['Evaluation'] }, { step: 'Proposal', statuses: ['Proposal'] }, { step: 'Won', statuses: ['Won'] }],
    terminal: ['Lost', 'Unqualified'],
    transitions: [
      { from: 'Inquiry', to: 'Discovery / Evaluation / Proposal', command: 'updateLead', actor: 'Relationship lead' },
      { from: 'Any open stage', to: 'Lost / Unqualified', command: 'updateLead', actor: 'Relationship lead', rule: 'A reason is required; excluded from open pipeline totals' },
      { from: 'Proposal', to: 'Won', command: 'convertLead', actor: 'Relationship lead', rule: 'Creates one Prospect client; never grants access or professional acceptance' }
    ]
  },
  {
    id: 'client', record: 'Client', module: 'CRM & Client Management', route: 'clients',
    path: [{ step: 'Prospect', statuses: ['Prospect'] }, { step: 'Active', statuses: ['Active'] }],
    blocked: ['Suspended'], blockedAt: 'Active', terminal: ['Archived'],
    transitions: [
      { from: 'Prospect', to: 'Active', command: 'updateClient', actor: 'Relationship lead / manager', rule: 'Stale profile revision rejected' },
      { from: 'Active', to: 'Archived', command: 'updateClient', actor: 'Manager', rule: 'Soft archive; history retained' }
    ]
  },
  {
    id: 'proposal', record: 'Proposal', module: 'Proposals & Terms', route: 'proposals',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Internal review', statuses: ['Internal review'] }, { step: 'Approved to send', statuses: ['Approved to send'] }, { step: 'Presented', statuses: ['Presented'] }, { step: 'Accepted', statuses: ['Accepted'] }],
    rework: { statuses: [], returnsTo: 'Draft', note: 'A returned proposal goes back to Draft with the review note retained.' },
    terminal: ['Declined', 'Withdrawn', 'Superseded'],
    transitions: [
      { from: 'Draft', to: 'Internal review', command: 'updateProposal', actor: 'Relationship lead' },
      { from: 'Internal review', to: 'Approved to send', command: 'reviewProposal', actor: 'Independent reviewer', rule: 'Reviewer must differ from the preparer' },
      { from: 'Internal review', to: 'Draft (returned)', command: 'reviewProposal', actor: 'Independent reviewer', rule: 'Return note required' },
      { from: 'Approved to send', to: 'Presented', command: 'presentProposal', actor: 'Relationship lead', rule: 'Presented snapshot pinned to the revision' },
      { from: 'Presented', to: 'Accepted / Declined / Withdrawn', command: 'recordProposalResponse', actor: 'Client management (manual record)', rule: 'Response must reference the presented revision; a manual record, never an electronic signature' },
      { from: 'Any unaccepted', to: 'Superseded', command: 'createProposalRevision', actor: 'Relationship lead', rule: 'Prior revision kept in history' }
    ],
    amendPath: 'createProposalRevision creates a new Draft revision; the old one becomes Superseded.'
  },
  {
    id: 'engagement', record: 'Engagement', module: 'Engagements', route: 'engagements',
    path: [{ step: 'Active', statuses: ['Active'] }, { step: 'Closed', statuses: ['Closed'] }],
    blocked: ['Suspended'], blockedAt: 'Active', terminal: ['Cancelled'],
    transitions: [
      { from: 'Draft (not activated)', to: 'Active', command: 'activateEngagement', actor: 'Partner / manager', rule: 'Separate professional acceptance with evidence' },
      { from: 'Active', to: 'Suspended / Cancelled / Closed', command: 'setEngagementLifecycle', actor: 'Partner / manager', rule: 'Reason required; Cancelled and Closed are terminal' }
    ]
  },
  {
    id: 'acceptance', record: 'Acceptance / continuance case', module: 'Acceptance & KYC', route: 'onboarding',
    path: [{ step: 'Recommendation', statuses: ['Pending'] }, { step: 'Decision', statuses: ['Accepted'] }],
    terminal: ['Declined'],
    transitions: [
      { from: 'Draft', to: 'Pending', command: 'saveAcceptanceCase', actor: 'Manager' },
      { from: 'Pending', to: 'Accepted / Declined', command: 'decideAcceptanceCase', actor: 'Partner', rule: 'Decision maker must differ from the recommender' },
      { from: 'Prior year', to: 'Continuance draft', command: 'createContinuanceDraft', actor: 'Manager' }
    ]
  },
  {
    id: 'job', record: 'Job / task', module: 'Jobs & Tasks', route: 'jobs',
    path: [{ step: 'Not started', statuses: ['Not started'] }, { step: 'In progress', statuses: ['In progress'] }, { step: 'Completed', statuses: ['Completed'] }],
    blocked: ['Blocked'], blockedAt: 'In progress', terminal: ['Cancelled'],
    transitions: [
      { from: 'Not started', to: 'In progress / Blocked', command: 'updateTask', actor: 'Assignee / manager', rule: 'Blocked requires a reason' },
      { from: 'In progress', to: 'Completed', command: 'updateTask', actor: 'Assignee / manager', rule: 'A parent cannot complete while a required child is open' },
      { from: 'Any open', to: 'Cancelled', command: 'updateJob', actor: 'Manager', rule: 'Cancelled jobs cannot be reopened' },
      { from: 'Any open', to: 'Reassigned', command: 'reassignTask', actor: 'Manager', rule: 'Reason required; assignment never grants approval authority' }
    ]
  },
  {
    id: 'job-template', record: 'Job template', module: 'Job Templates', route: 'job-templates',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Published', statuses: ['Published'] }],
    terminal: ['Retired'],
    transitions: [
      { from: 'Draft', to: 'Published', command: 'publishJobTemplate', actor: 'Manager' },
      { from: 'Published', to: 'Draft revision', command: 'createJobTemplateRevision', actor: 'Manager', rule: 'Existing jobs keep their pinned revision' },
      { from: 'Published', to: 'Retired', command: 'retireJobTemplate', actor: 'Manager' },
      { from: 'Published', to: 'Job created', command: 'applyJobTemplate', actor: 'Manager', rule: 'Idempotent per operation; Draft/Retired cannot instantiate' }
    ]
  },
  {
    id: 'pbc', record: 'Client request (PBC)', module: 'Documents & PBC', route: 'documents',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Requested', statuses: ['Requested'] }, { step: 'Received', statuses: ['Received', 'Under review'] }, { step: 'Accepted', statuses: ['Accepted'] }],
    rework: { statuses: ['Needs clarification'], returnsTo: 'Requested', note: 'The client replaces the file; the replacement needs staff re-review.' },
    terminal: ['Cancelled'],
    transitions: [
      { from: 'Draft', to: 'Requested', command: 'presentPbcRequest', actor: 'Preparer / manager' },
      { from: 'Requested / Needs clarification', to: 'Received', command: 'uploadPbcResponse', actor: 'Client finance contributor', rule: 'Bytes persisted in browser IndexedDB with digest' },
      { from: 'Received', to: 'Needs clarification', command: 'requestPbcClarification', actor: 'Preparer / reviewer', rule: 'Clarification note required' },
      { from: 'Received', to: 'Accepted', command: 'acceptPbcResponse', actor: 'Preparer / reviewer' },
      { from: 'Any open', to: 'Cancelled', command: 'cancelPbcRequest', actor: 'Preparer / manager', rule: 'Reason required' }
    ]
  },
  {
    id: 'time', record: 'Time entry', module: 'Time Tracking', route: 'my-time',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Submitted', statuses: ['Submitted'] }, { step: 'Approved', statuses: ['Approved'] }],
    rework: { statuses: ['Returned'], returnsTo: 'Submitted', note: 'Only the time owner can resubmit; the returned entry becomes Superseded.' },
    terminal: ['Superseded'],
    transitions: [
      { from: 'New', to: 'Submitted', command: 'addTimeEntry', actor: 'Time owner', rule: 'A persona records time only for itself' },
      { from: 'Submitted', to: 'Approved / Returned', command: 'reviewTimeEntry', actor: 'Manager / reviewer / partner', rule: 'Cannot approve own time; return reason required' },
      { from: 'Returned', to: 'Superseded + new Submitted revision', command: 'resubmitReturnedTime', actor: 'Time owner' },
      { from: 'Approved', to: 'Superseded + corrected revision', command: 'correctApprovedTime', actor: 'Manager', rule: 'Reason required' }
    ]
  },
  {
    id: 'budget', record: 'Budget', module: 'Budgets & Variances', route: 'budgets',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Approved', statuses: ['Approved'] }],
    transitions: [{ from: 'Draft', to: 'Approved (new version)', command: 'updateBudget', actor: 'Manager / partner', rule: 'Each change creates a new version; missing cost rate stays Unknown' }]
  },
  {
    id: 'invoice', record: 'Invoice', module: 'Billing & Invoices', route: 'billing',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'In review', statuses: ['In review'] }, { step: 'Approved', statuses: ['Approved'] }, { step: 'Issued', statuses: ['Issued'] }, { step: 'Paid', statuses: ['Paid'] }],
    rework: { statuses: [], returnsTo: 'Draft', note: 'A returned invoice stays in Draft with the reviewer note until revised.' },
    terminal: ['Cancelled'],
    transitions: [
      { from: 'New', to: 'Draft', command: 'addInvoice', actor: 'Billing / manager / partner', rule: 'Lines must come from approved time or an accepted fixed-fee proposal' },
      { from: 'Draft', to: 'Approved', command: 'reviewInvoice', actor: 'Billing / manager / partner', rule: 'Independent of the preparer' },
      { from: 'Draft', to: 'Draft (returned)', command: 'reviewInvoice', actor: 'Billing / manager / partner', rule: 'Return note required' },
      { from: 'Draft / Approved', to: 'Draft (next revision)', command: 'reviseInvoiceDraft', actor: 'Billing / manager / partner', rule: 'Reason required; prior approval retained in history' },
      { from: 'Approved', to: 'Issued', command: 'issueInvoice', actor: 'Billing / manager / partner', rule: 'Only the current reviewed revision; issuer differs from reviewer; no payment demand is sent' },
      { from: 'Issued', to: 'Paid', command: 'allocateReceipt', actor: 'Billing', rule: 'Offline receipt allocation only' },
      { from: 'Draft', to: 'Cancelled', command: 'cancelInvoiceDraft', actor: 'Billing / manager / partner', rule: 'Releases billed time sources' }
    ],
    amendPath: 'Issued invoices are corrected with credit notes, never edited.'
  },
  {
    id: 'credit-note', record: 'Credit note', module: 'Billing & Invoices', route: 'billing',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Approved', statuses: ['Approved'] }, { step: 'Issued', statuses: ['Issued'] }],
    transitions: [
      { from: 'New', to: 'Draft', command: 'addCreditNote', actor: 'Billing / manager / partner' },
      { from: 'Draft', to: 'Approved / Draft (returned)', command: 'reviewCreditNote', actor: 'Independent reviewer' },
      { from: 'Draft', to: 'Draft (revised)', command: 'reviseCreditNote', actor: 'Billing' },
      { from: 'Approved', to: 'Issued', command: 'issueCreditNote', actor: 'Billing / manager / partner' }
    ]
  },
  {
    id: 'adjustment', record: 'Adjustment journal', module: 'Accounting Workbench', route: 'adjustments',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Technical review', statuses: ['Technical review'] }, { step: 'Management accepted', statuses: ['Management accepted'] }, { step: 'Reporting included', statuses: ['Reporting included'] }],
    terminal: ['Rejected'],
    transitions: [
      { from: 'New', to: 'Draft', command: 'addAdjustmentJournal', actor: 'Preparer', rule: 'Balanced lines; support may pin evidence/workpaper/finding revisions' },
      { from: 'Draft', to: 'Technical review / Rejected', command: 'reviewAdjustmentJournal', actor: 'Independent reviewer' },
      { from: 'Technical review', to: 'Management accepted / Rejected', command: 'recordAdjustmentManagementDecision', actor: 'Client management (recorded)' },
      { from: 'Management accepted', to: 'Reporting included', command: 'markAdjustmentJournalReportingIncluded', actor: 'Preparer / manager' },
      { from: 'Any', to: 'Draft (amended revision)', command: 'amendAdjustmentJournal', actor: 'Preparer', rule: 'Reason required; prior review retained' }
    ],
    staleness: 'A pinned evidence, workpaper or finding revision that moves excludes the journal from statements and packages until re-pinned and re-reviewed.'
  },
  {
    id: 'reconciliation', record: 'Reconciliation schedule', module: 'Accounting Workbench', route: 'reconciliations',
    path: [{ step: 'Draft', statuses: ['Draft', 'In progress'] }, { step: 'In review', statuses: ['In Review'] }, { step: 'Approved', statuses: ['Approved', 'Cleared'] }],
    rework: { statuses: ['Returned', 'Differences noted'], returnsTo: 'Draft', note: 'Returned schedules are revised and resubmitted as a new revision.' },
    stale: ['Stale'],
    transitions: [
      { from: 'Draft / Returned', to: 'In Review', command: 'saveReconciliationSchedule', actor: 'Preparer' },
      { from: 'In Review', to: 'Approved / Returned', command: 'reviewReconciliationSchedule', actor: 'Independent reviewer', rule: 'Return note required' }
    ],
    staleness: 'A new TB source revision marks the schedule Stale; the prior review stays in history.'
  },
  {
    id: 'mapping', record: 'Account mapping revision', module: 'Accounting Workbench', route: 'account-mappings',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Approved', statuses: ['Approved'] }],
    transitions: [
      { from: 'New', to: 'Draft', command: 'saveAccountMappings', actor: 'Preparer' },
      { from: 'Draft', to: 'Approved', command: 'approveAccountMappings', actor: 'Independent reviewer', rule: 'Every TB account must be mapped' }
    ],
    staleness: 'A new mapping revision stales statement sets, cash-flow schedules and packages pinned to the old one.'
  },
  {
    id: 'statement-set', record: 'Statement set / cash-flow schedule revision', module: 'Financial Statements', route: 'financial-statements',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Reviewed', statuses: ['Reviewed'] }],
    stale: ['Stale'],
    transitions: [
      { from: 'New', to: 'Draft', command: 'saveStatementSetRevision', actor: 'Preparer', rule: 'Earlier revisions become Stale' },
      { from: 'Draft', to: 'Reviewed', command: 'reviewStatementSetRevision', actor: 'Independent reviewer' },
      { from: 'New', to: 'Draft', command: 'saveCashFlowSchedule', actor: 'Preparer' },
      { from: 'Draft', to: 'Reviewed', command: 'reviewCashFlowSchedule', actor: 'Independent reviewer' }
    ],
    staleness: 'TB source, mapping, layout or comparative changes mark revisions Stale.'
  },
  {
    id: 'disclosure', record: 'Disclosure', module: 'Financial Packages', route: 'financial-packages',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Reviewed', statuses: ['Reviewed'] }],
    transitions: [
      { from: 'Draft', to: 'Draft (saved revision)', command: 'saveDisclosureReview', actor: 'Preparer / manager' },
      { from: 'Draft', to: 'Reviewed', command: 'reviewDisclosure', actor: 'Reviewer / partner / EQR', rule: 'Independent of the preparer' }
    ]
  },
  {
    id: 'package', record: 'Financial package revision', module: 'Financial Packages', route: 'financial-packages',
    path: [{ step: 'Assembled', statuses: ['Assembled'] }, { step: 'Validated', statuses: ['Validated'] }, { step: 'Presented to management', statuses: ['Presented'] }, { step: 'Management decision', statuses: ['Acknowledged'] }, { step: 'Released', statuses: ['Released'] }],
    blocked: ['Validation blocked'], blockedAt: 'Validated', stale: ['Stale'], staleAt: 'Assembled', terminal: ['Rejected'],
    transitions: [
      { from: 'Current source', to: 'Assembled (exact XLSX/DOCX/PDF)', command: 'saveFinancialPackageRevision', actor: 'Manager / preparer' },
      { from: 'Validated', to: 'Presented', command: 'presentManagementPackage', actor: 'Manager' },
      { from: 'Presented', to: 'Acknowledged / Rejected', command: 'recordManagementPackageDecision', actor: 'Client management (recorded)' },
      { from: 'Approved', to: 'Release candidate', command: 'prepareReleaseCandidate', actor: 'Manager / partner' }
    ],
    staleness: 'TB source, GL source, mapping or generation changes stale the package; earlier revisions and approvals remain in history.'
  },
  {
    id: 'consolidation-elimination', record: 'Consolidation elimination', module: 'Group Consolidation', route: 'consolidation',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Submitted', statuses: ['Submitted'] }, { step: 'Approved', statuses: ['Approved'] }],
    rework: { statuses: ['Returned'], returnsTo: 'Draft', note: 'Returned eliminations are corrected and resubmitted.' },
    transitions: [
      { from: 'New', to: 'Draft', command: 'saveConsolidationElimination', actor: 'Preparer', rule: 'Reason required' },
      { from: 'Draft', to: 'Submitted', command: 'submitConsolidationElimination', actor: 'Preparer' },
      { from: 'Submitted', to: 'Approved / Returned', command: 'reviewConsolidationElimination', actor: 'Independent reviewer', rule: 'Note and evidence required' }
    ],
    staleness: 'Perimeter or FX changes return eliminations to Draft.'
  },
  {
    id: 'consolidation-output', record: 'Consolidation output package', module: 'Group Consolidation', route: 'consolidation',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Approved', statuses: ['Approved'] }],
    rework: { statuses: ['Returned'], returnsTo: 'Draft', note: 'A returned output package is corrected and saved again.' },
    blocked: ['Pending'], stale: ['Stale'],
    transitions: [
      { from: 'New', to: 'Draft', command: 'saveConsolidationOutputPackage', actor: 'Preparer / manager' },
      { from: 'Draft', to: 'Approved / Returned', command: 'reviewConsolidationOutputPackage', actor: 'Independent reviewer' },
      { from: 'Any', to: 'Perimeter revision', command: 'revertConsolidationPerimeter', actor: 'Manager', rule: 'Reason required' }
    ]
  },
  {
    id: 'audit-plan', record: 'Audit plan', module: 'Audit Planning & Materiality', route: 'audit-planning',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Under review', statuses: ['Under review'] }, { step: 'Approved', statuses: ['Approved'] }],
    terminal: ['Superseded'],
    transitions: [
      { from: 'Draft', to: 'Under review', command: 'saveAuditPlan', actor: 'Manager / preparer', rule: 'Each save is a new version' },
      { from: 'Under review', to: 'Approved / Draft (returned)', command: 'reviewAuditPlan', actor: 'Manager / partner', rule: 'Independent of the preparer' },
      { from: 'Approved', to: 'Superseded', command: 'updateAuditRisk', actor: 'Manager', rule: 'A risk change reopens planning as a new version' }
    ]
  },
  {
    id: 'audit-procedure', record: 'Audit procedure', module: 'Risks & Audit Programs', route: 'audit-risks',
    path: [{ step: 'Not started', statuses: ['Not started'] }, { step: 'In progress', statuses: ['In progress'] }, { step: 'Submitted', statuses: ['Submitted'] }, { step: 'Cleared', statuses: ['Cleared', 'Completed'] }],
    rework: { statuses: ['Exceptions noted', 'Exception noted'], returnsTo: 'In progress', note: 'Exceptions route to findings; evidence changes reopen the procedure.' },
    transitions: [
      { from: 'Not started', to: 'In progress', command: 'updateAuditProcedureExecution', actor: 'Preparer' },
      { from: 'In progress', to: 'Submitted / Cleared / Exceptions noted', command: 'updateAuditProcedureStatus', actor: 'Preparer / reviewer', rule: 'Reason required for exceptions' }
    ],
    staleness: 'Evidence adequacy, evidence links or risk changes return Submitted/Cleared procedures to In progress.'
  },
  {
    id: 'audit-program-template', record: 'Audit program template', module: 'Risks & Audit Programs', route: 'audit-risks',
    path: [{ step: 'Draft', statuses: ['Draft'] }, { step: 'Published', statuses: ['Published'] }],
    terminal: ['Retired'],
    transitions: [
      { from: 'New', to: 'Draft', command: 'createAuditProgramTemplate', actor: 'Manager' },
      { from: 'Draft', to: 'Published', command: 'publishAuditProgramTemplate', actor: 'Manager' },
      { from: 'Published', to: 'Retired', command: 'retireAuditProgramTemplate', actor: 'Manager' }
    ]
  },
  {
    id: 'sample', record: 'Sample population', module: 'Sampling & Populations', route: 'sampling',
    path: [{ step: 'Population imported', statuses: ['Imported'] }, { step: 'Items selected', statuses: ['Selected'] }, { step: 'Items tested', statuses: ['Tested'] }, { step: 'Selection reviewed', statuses: ['Reviewed'] }],
    stale: ['Stale'],
    transitions: [
      { from: 'Population', to: 'Replaced source', command: 'replaceSamplePopulationSource', actor: 'Preparer', rule: 'Digest recorded; prior selection retained' },
      { from: 'Imported', to: 'Selected', command: 'setSampleItemSelected', actor: 'Preparer', rule: 'Rationale for manual selection' },
      { from: 'Selected', to: 'Tested', command: 'recordSampleItemTest', actor: 'Preparer' },
      { from: 'Tested', to: 'Reviewed', command: 'reviewSampleSelection', actor: 'Independent reviewer' },
      { from: 'Exception', to: 'Finding linked', command: 'linkSampleExceptionToFinding', actor: 'Preparer' }
    ]
  },
  {
    id: 'workpaper', record: 'Workpaper', module: 'Audit Workpapers', route: 'audit',
    path: [{ step: 'Planned', statuses: ['Planned'] }, { step: 'In progress', statuses: ['In progress'] }, { step: 'Submitted', statuses: ['Submitted'] }, { step: 'Cleared', statuses: ['Cleared'] }],
    rework: { statuses: ['Changes required'], returnsTo: 'In progress', note: 'Evidence or document changes require rework and a fresh submission.' },
    terminal: ['Not applicable'],
    transitions: [
      { from: 'Planned', to: 'In progress', command: 'updateWorkpaper', actor: 'Assigned preparer' },
      { from: 'In progress', to: 'Submitted', command: 'submitWorkpaper', actor: 'Assigned preparer', rule: 'Scope, work, conclusion, current workbook and adequate current evidence required' },
      { from: 'Submitted', to: 'Cleared', command: 'clearWorkpaper', actor: 'Assigned reviewer', rule: 'Reviewer differs from preparer; exact submitted revision only' },
      { from: 'Any', to: 'Changes required', command: 'replaceDocumentRevision', actor: 'System consequence', rule: 'A newer evidence revision invalidates the submission' },
      { from: 'Any', to: 'Not applicable', command: 'updateWorkpaper', actor: 'Senior role', rule: 'Rationale required; blocked by unresolved findings' }
    ],
    staleness: 'New evidence revisions or inadequate evidence set Changes required and reopen review notes.'
  },
  {
    id: 'review-note', record: 'Review point', module: 'Review Desk', route: 'reviews',
    path: [{ step: 'Open', statuses: ['Open'] }, { step: 'Responded', statuses: ['Responded'] }, { step: 'Cleared', statuses: ['Cleared'] }],
    rework: { statuses: ['Reopened'], returnsTo: 'Open', note: 'Reopened when the subject changes or the response is insufficient.' },
    transitions: [
      { from: 'New', to: 'Open', command: 'addReviewNote', actor: 'Manager / reviewer / partner / EQR' },
      { from: 'Open / Reopened', to: 'Responded', command: 'respondReviewNote', actor: 'Assignee' },
      { from: 'Responded', to: 'Cleared / Reopened', command: 'clearReviewNote', actor: 'Author / reviewer', rule: 'Responders cannot clear their own query; stale subject reopens' },
      { from: 'Open', to: 'Reassigned', command: 'reassignReviewNote', actor: 'Manager', rule: 'Reason required' }
    ]
  },
  {
    id: 'evidence', record: 'Evidence item', module: 'Evidence Catalogue', route: 'evidence',
    path: [{ step: 'Pending verification', statuses: ['Pending verification'] }, { step: 'Adequate', statuses: ['Adequate'] }],
    blocked: ['Deficient', 'Inadequate'], blockedAt: 'Adequate',
    transitions: [
      { from: 'Pending verification', to: 'Adequate / Deficient', command: 'setEvidenceAdequacy', actor: 'Reviewer', rule: 'Rationale required; linked procedures reopen' },
      { from: 'Any', to: 'Linked / Unlinked procedure', command: 'linkEvidenceProcedure', actor: 'Preparer' }
    ]
  },
  {
    id: 'finding', record: 'Finding / difference', module: 'Findings & Differences', route: 'findings',
    path: [{ step: 'Uncorrected', statuses: ['Uncorrected'] }, { step: 'Proposed for correction', statuses: ['Proposed for correction', 'Management agreed'] }, { step: 'Resolved', statuses: ['Corrected in TB', 'Corrected by client'] }],
    terminal: ['Waived as immaterial', 'Uncorrected waived'],
    transitions: [
      { from: 'New', to: 'Uncorrected', command: 'addFinding', actor: 'Preparer / reviewer' },
      { from: 'Any', to: 'Next disposition', command: 'setFindingDisposition', actor: 'Manager / partner', rule: 'Rationale required; disposition history retained' }
    ]
  },
  {
    id: 'release', record: 'Release candidate / release', module: 'Release & Completion', route: 'delivery',
    path: [{ step: 'Gates cleared', statuses: ['Ready'] }, { step: 'Candidate prepared', statuses: ['Candidate'] }, { step: 'Released', statuses: ['Released'] }, { step: 'Archived', statuses: ['Archived'] }],
    blocked: ['Blocked'], blockedAt: 'Gates cleared', stale: ['Stale'],
    transitions: [
      { from: 'Gates cleared', to: 'Candidate', command: 'prepareReleaseCandidate', actor: 'Manager / partner', rule: 'evaluateReleaseReadiness must pass' },
      { from: 'Candidate', to: 'Released', command: 'issueRelease', actor: 'Partner', rule: 'Dispatch is simulated; no email is sent' },
      { from: 'Released', to: 'Amendment draft', command: 'reopenReleaseForAmendment', actor: 'Partner', rule: 'Reason required; prior release kept as predecessor' },
      { from: 'Released', to: 'Archived', command: 'archiveEngagement', actor: 'Records', rule: 'Logical archive index only; not production retention' }
    ],
    amendPath: 'reopenReleaseForAmendment → prepareAmendedRelease produces an amended release that references its predecessor.'
  },
  {
    id: 'approval', record: 'Engagement approval (manager / client / partner / EQR)', module: 'Sign-offs & EQR', route: 'approvals',
    path: [{ step: 'Manager', statuses: ['manager'] }, { step: 'Client management', statuses: ['client'] }, { step: 'Partner', statuses: ['partner'] }, { step: 'EQR (when required)', statuses: ['eqr'] }],
    stale: ['Stale'],
    transitions: [
      { from: 'Pending', to: 'Approved (bound to generation)', command: 'recordApproval', actor: 'Manager / client / partner / EQR', rule: 'Each approver independent of the preparer; approvals bind to the current generation' },
      { from: 'Pending', to: 'EQR assigned', command: 'assignEqrReviewer', actor: 'Partner', rule: 'Reason required' },
      { from: 'Open', to: 'Concern raised / resolved', command: 'addEqrConcern', actor: 'EQR' }
    ],
    staleness: 'Any change to the engagement generation leaves prior approvals in history but no longer current.'
  },
  {
    id: 'archive', record: 'Archive record', module: 'Records & Archive', route: 'records',
    path: [{ step: 'Archived', statuses: ['Archived'] }, { step: 'Handover recorded', statuses: ['Handover'] }],
    transitions: [
      { from: 'Released', to: 'Archived', command: 'archiveEngagement', actor: 'Records', rule: 'Retention date / hold recorded as demo metadata only' },
      { from: 'Archived', to: 'Handover recorded', command: 'recordArchiveHandover', actor: 'Records', rule: 'Requester and reason required' }
    ]
  },
  {
    id: 'invitation', record: 'Simulated invitation', module: 'Firm Administration', route: 'administration',
    path: [{ step: 'Pending', statuses: ['Pending'] }, { step: 'Accepted', statuses: ['Accepted'] }],
    terminal: ['Expired', 'Revoked'],
    transitions: [
      { from: 'New', to: 'Pending', command: 'sendSimulatedInvitation', actor: 'Administrator', rule: 'Simulated — no email is sent' },
      { from: 'Pending', to: 'Accepted', command: 'acceptSimulatedInvitation', actor: 'Invitee (simulated)' },
      { from: 'Pending', to: 'Revoked', command: 'revokeSimulatedInvitation', actor: 'Administrator', rule: 'Reason required' },
      { from: 'Expired', to: 'Pending', command: 'resendSimulatedInvitation', actor: 'Administrator' }
    ]
  },
  {
    id: 'm365', record: 'Microsoft 365 simulation', module: 'Microsoft 365 Setup', route: 'm365-setup',
    path: [{ step: 'Not configured', statuses: ['Not configured'] }, { step: 'Simulated verified', statuses: ['Simulated verified'] }],
    blocked: ['Simulated error'], blockedAt: 'Simulated verified', terminal: ['Disconnected'],
    transitions: [{ from: 'Not configured', to: 'Simulated verified / Simulated error', command: 'updateFirmSettings', actor: 'Administrator', rule: 'liveConnected is always false; no OAuth or Graph calls' }]
  }
];

export type StepState = 'done' | 'current' | 'returned' | 'blocked' | 'stale' | 'todo' | 'skipped';

export interface LifecycleStepView { step: string; state: StepState }

export interface LifecycleView {
  steps: LifecycleStepView[];
  /** Where the record sits relative to the main path. */
  position: 'path' | 'rework' | 'blocked' | 'stale' | 'terminal' | 'unknown';
  reworkNote?: string;
}

export function lifecycleById(id: string): LifecycleDefinition {
  const found = LIFECYCLES.find(item => item.id === id);
  if (!found) throw new Error(`Unknown lifecycle "${id}"`);
  return found;
}

/**
 * Projects a status onto a lifecycle definition. `returned` forces rework presentation for
 * records whose store keeps the Draft status after a return (invoice, proposal).
 */
export function projectLifecycle(def: LifecycleDefinition, status: string, options: { returned?: boolean } = {}): LifecycleView {
  const index = def.path.findIndex(step => step.statuses.includes(status));
  const mark = (current: number, currentState: StepState): LifecycleStepView[] =>
    def.path.map((step, i) => ({ step: step.step, state: i < current ? 'done' : i === current ? currentState : 'todo' }));
  if (def.rework && (def.rework.statuses.includes(status) || options.returned)) {
    const target = def.path.findIndex(step => step.step === def.rework!.returnsTo);
    return { steps: mark(target < 0 ? 0 : target, 'returned'), position: 'rework', reworkNote: def.rework.note };
  }
  if (index >= 0) return { steps: mark(index, def.path.length - 1 === index && statusKind(status) !== 'progress' ? 'done' : 'current'), position: 'path' };
  const stepIndex = (name: string | undefined, fallback: number) => { const found = def.path.findIndex(step => step.step === name); return found >= 0 ? found : fallback; };
  if (def.stale?.includes(status)) return { steps: mark(stepIndex(def.staleAt, def.path.length - 1), 'stale'), position: 'stale' };
  if (def.blocked?.includes(status)) return { steps: mark(stepIndex(def.blockedAt, 0), 'blocked'), position: 'blocked' };
  if (def.terminal?.includes(status)) return { steps: def.path.map(step => ({ step: step.step, state: 'skipped' })), position: 'terminal' };
  return { steps: def.path.map(step => ({ step: step.step, state: 'todo' })), position: 'unknown' };
}
