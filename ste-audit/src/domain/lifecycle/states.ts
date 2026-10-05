/**
 * The canonical 11-stage engagement lifecycle (spec §5).
 * State names and gate wording match the approved specification verbatim so the
 * UI can present the authoritative table without a second source of truth.
 */

export const ENGAGEMENT_STATES = [
  'LEAD_INGESTION',
  'PROPOSAL_GENERATION',
  'DUAL_KEY_PENDING',
  'ADVANCE_BILLING',
  'PORTAL_ACTIVE_PLANNING',
  'FIELDWORK_EXECUTION',
  'MANAGERIAL_REVIEW',
  'PARTNER_APPROVAL',
  'DELIVERABLE_RELEASE',
  'COMPLIANCE_COUNTDOWN',
  'ARCHIVED_READ_ONLY'
] as const;

export type EngagementState = (typeof ENGAGEMENT_STATES)[number];

/** The only terminal state; every mutation is blocked once reached. */
export const TERMINAL_STATE: EngagementState = 'ARCHIVED_READ_ONLY';

export const isTerminal = (state: EngagementState): boolean => state === TERMINAL_STATE;

export function stateIndex(state: EngagementState): number {
  return ENGAGEMENT_STATES.indexOf(state);
}

export function isBefore(a: EngagementState, b: EngagementState): boolean {
  return stateIndex(a) < stateIndex(b);
}

export function isAtOrAfter(a: EngagementState, b: EngagementState): boolean {
  return stateIndex(a) >= stateIndex(b);
}

/** Events that drive transitions. Each maps to exactly one edge. */
export type EngagementEvent =
  | 'completeLeadIngestion'
  | 'dispatchProposal'
  | 'clearDualKey'
  | 'confirmAdvance'
  | 'signOffPlanning'
  | 'submitFieldwork'
  | 'completeManagerReview'
  | 'applyPartnerSignature'
  | 'releaseDeliverables'
  | 'lockArchive';

export interface EventDefinition {
  event: EngagementEvent;
  label: string;
  /** Module that owns the action, in spec-module language. */
  ownerModule: string;
}

export const ENGAGEMENT_EVENTS: EventDefinition[] = [
  { event: 'completeLeadIngestion', label: 'Complete entity & contact profiling', ownerModule: 'Module 1: Commercial & CRM' },
  { event: 'dispatchProposal', label: 'Dispatch quote / proposal', ownerModule: 'Module 1: Commercial & CRM' },
  { event: 'clearDualKey', label: 'Clear Dual-Key acceptance gate', ownerModule: 'Module 1: Commercial & CRM' },
  { event: 'confirmAdvance', label: 'Confirm 50% advance settlement', ownerModule: 'Module 1: Commercial & CRM' },
  { event: 'signOffPlanning', label: 'Partner sign-off on planning & materiality', ownerModule: 'Module 2: Governance & Planning' },
  { event: 'submitFieldwork', label: 'Submit all assigned FSLI procedures', ownerModule: 'Module 3: Fieldwork' },
  { event: 'completeManagerReview', label: 'Complete managerial review & SRM', ownerModule: 'Module 3: Fieldwork' },
  { event: 'applyPartnerSignature', label: 'Apply Partner signature & firm seal', ownerModule: 'Module 4: Reporting' },
  { event: 'releaseDeliverables', label: 'Release 5-part deliverable bundle', ownerModule: 'Module 4: Reporting' },
  { event: 'lockArchive', label: 'Lock regulatory archive (ISA 230)', ownerModule: 'Module 4: Reporting' }
];

export interface SpecStateRow {
  state: EngagementState;
  allowedActions: string;
  gateToAdvance: string;
  nextState: EngagementState | 'TERMINAL';
}

/** Spec §5 lifecycle table, preserved for the requirements/reference surface. */
export const STATE_MACHINE_SPEC: SpecStateRow[] = [
  {
    state: 'LEAD_INGESTION',
    allowedActions: 'Log inquiry, capture company and contact data',
    gateToAdvance: 'Minimum entity and primary contact data validated',
    nextState: 'PROPOSAL_GENERATION'
  },
  {
    state: 'PROPOSAL_GENERATION',
    allowedActions: 'Build Brief Quote or Comprehensive Proposal, dispatch to client',
    gateToAdvance: 'Proposal dispatched via Email / WhatsApp',
    nextState: 'DUAL_KEY_PENDING'
  },
  {
    state: 'DUAL_KEY_PENDING',
    allowedActions: 'Complete Client Acceptance Checklist (AML/KYC), record client commercial approval',
    gateToAdvance: 'Dual-Key Clearance: Both Client Acceptance AND Partner AML Approval confirmed',
    nextState: 'ADVANCE_BILLING'
  },
  {
    state: 'ADVANCE_BILLING',
    allowedActions: 'Generate Engagement Letter & 50% Advance Invoice',
    gateToAdvance: '50% advance payment confirmed and recorded',
    nextState: 'PORTAL_ACTIVE_PLANNING'
  },
  {
    state: 'PORTAL_ACTIVE_PLANNING',
    allowedActions: 'Provision Client Portal, schedule team, ingest Trial Balance, calculate materiality',
    gateToAdvance: 'Planning signed off by Partner, TB mapped to FSLIs',
    nextState: 'FIELDWORK_EXECUTION'
  },
  {
    state: 'FIELDWORK_EXECUTION',
    allowedActions: 'Execute workprograms, attach digital/physical evidence, log confirmation requests',
    gateToAdvance: 'All assigned FSLI procedures submitted by Preparers',
    nextState: 'MANAGERIAL_REVIEW'
  },
  {
    state: 'MANAGERIAL_REVIEW',
    allowedActions: 'Review workpapers, issue review notes/rework, compile SRM',
    gateToAdvance: 'Zero open review notes, SRM compiled, critical confirmations returned',
    nextState: 'PARTNER_APPROVAL'
  },
  {
    state: 'PARTNER_APPROVAL',
    allowedActions: 'Partner inspects SRM, reviews Red-risk areas, selects Audit Opinion',
    gateToAdvance: 'Partner applies digital signature and firm seal',
    nextState: 'DELIVERABLE_RELEASE'
  },
  {
    state: 'DELIVERABLE_RELEASE',
    allowedActions: 'Generate 5-part deliverables package, issue 50% balance invoice, freeze client portal uploads',
    gateToAdvance: 'Final package generated and delivered to client',
    nextState: 'COMPLIANCE_COUNTDOWN'
  },
  {
    state: 'COMPLIANCE_COUNTDOWN',
    allowedActions: 'Review final archive; Partner may trigger early lock',
    gateToAdvance: '60 calendar days elapsed since signature date OR manual lock triggered',
    nextState: 'ARCHIVED_READ_ONLY'
  },
  {
    state: 'ARCHIVED_READ_ONLY',
    allowedActions: 'Read-only viewing and regulator inspection export',
    gateToAdvance: 'File is permanently locked; modifications strictly disallowed',
    nextState: 'TERMINAL'
  }
];
