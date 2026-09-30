/**
 * STE Audit Management Tool — domain types (part 1 of 3).
 * Pure data shapes shared by the state machine, engines, services and UI.
 * Persistence mapping lives in prisma/schema.prisma; no Prisma imports here.
 */
import type { EngagementState } from './lifecycle/states';
import type {
  Assertion,
  ChargeOutRole,
  ConfirmationStatus,
  ConfirmationType,
  ContactRoutingRole,
  CurrencyCode,
  DeliverablePart,
  DocumentCategory,
  EngagementLetterTemplate,
  LeadChannel,
  MaterialityBenchmark,
  OpinionValue,
  PbcStatus,
  RiskStratum,
  SamplingMethod,
  StatementSection
} from './constants';

export type Qar = number;

/** One audit firm user. */
export type RoleKey = 'PREPARER' | 'REVIEWER' | 'APPROVER' | 'CLIENT' | 'ADMIN';
export interface Actor {
  userId: string;
  /** Stable natural-person key; two role labels for the same person share it. */
  personId: string;
  role: RoleKey;
  name: string;
}

/** Persistent, tamper-evident audit trail entry (created by every transition). */
export interface AuditEntry {
  id: string;
  at: string; // ISO-8601
  actor: Actor;
  action: string;
  entityType: 'engagement' | 'client' | 'proposal' | 'document' | 'portal' | 'ledger' | 'system';
  entityId: string;
  fromState?: string;
  toState?: string;
  detail?: string;
  /** SHA-256 over (previousHash + canonical payload); chains entries per engagement. */
  previousHash: string | null;
  hash: string;
}

// ── Module 1: Commercial & CRM ─────────────────────────────────────────────────

export interface Lead {
  id: string;
  channel: LeadChannel;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  notes?: string;
  capturedByUserId: string;
  capturedAt: string;
  stage: 'Inquiry' | 'Qualified' | 'Proposal' | 'Won' | 'Lost';
  convertedClientId?: string;
}

export interface ClientEntity {
  id: string;
  legalName: string;
  legalNameArabic?: string;
  /** Commercial Registration number (Qatar). */
  crNumber?: string;
  /** Tax Identification Number (Qatar). */
  tin?: string;
  country: string;
  /** Group relationship: Holding / Subsidiary / Affiliate / Standalone. */
  relationship: 'Holding' | 'Subsidiary' | 'Affiliate' | 'Standalone';
  parentClientId?: string;
  status: 'Prospect' | 'Active' | 'Suspended' | 'Archived';
  primaryContactId?: string;
}

export interface ClientContact {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  routingRole: ContactRoutingRole;
  isPrimary: boolean;
  active: boolean;
}

export type ProposalMode = 'Brief Quotation' | 'Comprehensive Technical Proposal';

export interface ProposalLineItem {
  description: string;
  quantity: number;
  rate: Qar;
  amount: Qar;
}

export interface Proposal {
  id: string;
  clientId: string;
  leadId?: string;
  mode: ProposalMode;
  revision: number;
  title: string;
  scope: string;
  exclusions?: string;
  reportingYear: number;
  currency: CurrencyCode;
  totalFee: Qar;
  /** Spec §4.1.2 — 50/50 payment terms. */
  paymentTerms: '50/50';
  timeline?: string;
  lineItems: ProposalLineItem[];
  state: 'Draft' | 'Internal Review' | 'Approved to Send' | 'Presented' | 'Accepted' | 'Declined' | 'Withdrawn' | 'Expired';
  dispatchedVia?: 'Email' | 'WhatsApp' | null;
  dispatchedAt?: string;
  acceptedRevision?: number;
  clientAcceptanceEvidenceRef?: string;
}

/** Spec §4.1.3 — dual-key onboarding gatekeeper. */
export interface DualKeyState {
  key1: {
    clientCommercialApproval: boolean;
    approvedProposalId: string | null;
    approvedRevision: number | null;
    evidenceRef: string | null;
    recordedByUserId: string | null;
    recordedAt: string | null;
  };
  key2: {
    partnerRiskClearance: boolean;
    acceptanceDecision: 'Pending' | 'Accepted' | 'Declined';
    decisionByUserId: string | null;
    decisionAt: string | null;
  };
}

// ── Module 2: Governance & planning ───────────────────────────────────────────

export interface AcceptanceScreening {
  track: 'A_New_Client' | 'B_Recurring_Client';
  uboCompleted: boolean;
  amlKycCompleted: boolean;
  kycDocsRef?: string;
  managementIntegrityAssessed: boolean;
  financialViabilityAssessed: boolean;
  independenceConfirmed: boolean;
  conflictsCleared: boolean;
  /** Track B deltas. */
  priorYearFeesSettled?: boolean;
  managementChangesNoted?: boolean;
  newCreditFacilities?: boolean;
  litigationFlags?: boolean;
  fraudOrRegulatoryFindings?: boolean;
  riskRating: 'Low' | 'Medium' | 'High' | 'Prohibited';
  conditions: string[];
  evidenceRefs: Record<string, string>;
}

export interface MaterialityRevision {
  id: string;
  engagementId: string;
  revision: number;
  benchmark: MaterialityBenchmark;
  benchmarkValue: Qar;
  materialityRate: number;
  planningMateriality: Qar;
  tolerableErrorRate: number;
  tolerableError: Qar;
  sadRate: number;
  sadThreshold: Qar;
  /** Manual practical rounding applied by the reviewer (±5% max). */
  rounding: {
    computedPm: Qar;
    appliedPm: Qar;
    computedTe: Qar;
    appliedTe: Qar;
    variancePct: number;
    partnerSignOffUserId?: string;
    partnerSignOffAt?: string;
  } | null;
  rationale: string;
  approvedByUserId?: string;
  approvedAt?: string;
}

export interface StaffAllocation {
  userId: string;
  chargeOutRole: ChargeOutRole;
  phase: 'Planning' | 'Fieldwork' | 'Review' | 'Reporting' | 'Completion';
  plannedHours: number;
  startDate: string;
  endDate: string;
}

// ── Module 3: Fieldwork ───────────────────────────────────────────────────────

export interface TrialBalanceRow {
  id?: string;
  accountCode: string;
  accountName: string;
  section: StatementSection;
  fsliId: string | null;
  mappedFsliLabel?: string;
  currentYear: Qar;
  priorYear: Qar;
  /** Source revision this row belongs to (a TB re-import bumps it). */
  sourceRevision: number;
}

export interface Fsli {
  id: string;
  engagementId: string;
  code: string;
  label: string;
  section: StatementSection;
  currentYear: Qar;
  priorYear: Qar;
}

/** Hybrid digital/physical evidence reference (§4.3.2). */
export interface EvidenceRef {
  id: string;
  kind: 'Digital' | 'Physical';
  /** Digital: document id. Physical: binder index description. */
  documentId?: string;
  physical?: { indexCode: string; box?: string; shelf?: string; note?: string };
  description: string;
  linkedByUserId: string;
  linkedAt: string;
}

export interface AuditProcedure {
  id: string;
  workProgramId: string;
  ref: string;
  title: string;
  instructions: string;
  assertions: Assertion[];
  /** Ad-hoc rows are inserted by field auditors (§4.3.2). */
  adHoc: boolean;
  adHocReason?: string;
  assignedToUserId?: string;
  status: 'Not Started' | 'In Progress' | 'Submitted' | 'Under Rework' | 'Cleared';
  workPerformed?: string;
  conclusion?: string;
  evidence: EvidenceRef[];
  submittedByUserId?: string;
  submittedAt?: string;
  clearedByUserId?: string;
  clearedAt?: string;
}

export interface WorkProgram {
  id: string;
  engagementId: string;
  fsliId: string;
  title: string;
  procedures: AuditProcedure[];
}

export interface SamplePlan {
  id: string;
  engagementId: string;
  fsliId: string;
  method: SamplingMethod;
  seed: number;
  sampleSize: number;
  populationCount: number;
  populationValue: Qar;
  selectedItemIds: string[];
  /** MUS can hit an item more than once; hit counts are retained. */
  hits: Record<string, number>;
  parameters: Record<string, number>;
  createdByUserId: string;
  createdAt: string;
}

export interface AnalyticalReview {
  id: string;
  engagementId: string;
  fsliId: string;
  currentBalance: Qar;
  priorBalance: Qar;
  varianceAmount: Qar;
  variancePct: number | null;
  commentary: string;
  /** Mandatory ISA 570 assessment for going-concern-sensitive areas. */
  goingConcern: {
    assessed: boolean;
    indicatorsPresent: boolean;
    conclusion: string;
    evidenceRefs: string[];
  } | null;
  preparedByUserId: string;
  preparedAt: string;
}

export interface ReviewNote {
  id: string;
  engagementId: string;
  procedureId: string;
  /** Preparer who must rework; used for segregation-of-duties checks. */
  raisedAgainstUserId: string;
  raisedByUserId: string;
  raisedAt: string;
  /** Mandatory textual rejection reason (§4.3.3). */
  text: string;
  status: 'Open' | 'Responded' | 'Cleared' | 'Reopened';
  responseText?: string;
  respondedAt?: string;
  clearedByUserId?: string;
  clearedAt?: string;
}

export interface Confirmation {
  id: string;
  engagementId: string;
  type: ConfirmationType;
  counterparty: string;
  relatedFsliId?: string;
  status: ConfirmationStatus;
  critical: boolean;
  requestedAt?: string;
  dueAt: string;
  receivedAt?: string;
  responseDocumentId?: string;
  notes?: string;
}

export interface HoldingLetter {
  id: string;
  engagementId: string;
  generatedAt: string;
  generatedByUserId: string;
  blockingConfirmationIds: string[];
  recipientContactId?: string;
  documentId: string;
}

export interface SrmRecord {
  id: string;
  engagementId: string;
  revision: number;
  compiledByUserId: string;
  compiledAt: string;
  unadjustedDifferences: Array<{ reference: string; amount: Qar; fsliLabel: string }>;
  totalUnadjusted: Qar;
  /** Postings proposed but not recorded in the financial statements. */
  ajes: Array<{ reference: string; description: string; debit: Qar; credit: Qar }>;
  openRedRisks: Array<{ reference: string; description: string }>;
  significantEstimates: Array<{ reference: string; description: string }>;
  recommendation: string;
}

// ── Module 4: Reporting ───────────────────────────────────────────────────────

export interface OpinionSelection {
  opinion: OpinionValue;
  /** Affected FSLIs for Qualified/Disclaimer/Adverse (§4.4.1). */
  affectedFsliIds: string[];
  basisRationale: string;
  selectedByUserId: string;
  selectedAt: string;
  reportDate: string;
}

export interface DeliverableArtifact {
  id: string;
  deliverableId: string;
  part: DeliverablePart;
  documentId: string;
  sha256: string;
}

export interface DeliverableSet {
  id: string;
  engagementId: string;
  revision: number;
  opinionSelectionId: string;
  generatedByUserId: string;
  generatedAt: string;
  artifacts: DeliverableArtifact[];
  deliveredAt?: string;
  deliveredToContactId?: string;
}

// ── Module 5: Practice management ─────────────────────────────────────────────

export type EngagementPhase = 'Planning' | 'Fieldwork' | 'Review' | 'Reporting' | 'Completion';

export interface TimeEntry {
  id: string;
  engagementId: string;
  userId: string;
  chargeOutRole: ChargeOutRole;
  date: string;
  hours: number;
  phase: EngagementPhase;
  /** Optional FSLI the hours were logged against (§1.2 Preparer duty). */
  fsliId?: string;
  narrative: string;
  billable: boolean;
  approved: boolean;
}

export interface FirmLedgerLine {
  account:
    | 'Cash'
    | 'Office Rent'
    | 'Staff Salaries'
    | 'Staff Benefits'
    | 'Partner Withdrawals'
    | 'Petty Cash'
    | 'Other Expenses';
  debit: Qar;
  credit: Qar;
}

export interface FirmLedgerEntry {
  id: string;
  date: string;
  description: string;
  reference: string;
  lines: FirmLedgerLine[];
}

// ── Engagement aggregate view (read model for guards/UI) ──────────────────────

export interface EngagementSummary {
  id: string;
  clientId: string;
  state: EngagementState;
  lifecycleStatus: 'Active' | 'Suspended' | 'Cancelled';
  service: string;
  reportingYear: number;
  currency: CurrencyCode;
  agreedFee: Qar;
  letterTemplate: EngagementLetterTemplate;
  managerUserId: string;
  partnerUserId: string;
  preparerUserIds: string[];
  reviewerUserId: string;
}

export interface FsliRiskStratum {
  fsliId: string;
  label: string;
  currentYear: Qar;
  stratum: RiskStratum;
  reason: string;
}

export interface DocumentRecord {
  id: string;
  category: DocumentCategory;
  engagementId?: string;
  clientId?: string;
  fileName: string;
  sha256: string;
  storageKey: string;
  sizeBytes: number;
  createdAt: string;
  createdByUserId: string;
  supersedesDocumentId?: string;
}

export interface PbcRequestItem {
  id: string;
  engagementId: string;
  title: string;
  description: string;
  assignedContactId: string;
  status: PbcStatus;
  rejectionReason?: string;
  dueAt: string;
  documentIds: string[];
  updatedAt: string;
}
