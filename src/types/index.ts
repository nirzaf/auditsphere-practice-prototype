// STE Audit Management Tool v2.1 prototype — shared types & domain models.
// Five required business modules plus supporting lifecycle records and migration compatibility.
import type { TargetEngagementLifecycle, ExternalConfirmation, FirmLedgerEntry, PortalPasswordSimulation, PortalDelegation, PhysicalEvidenceReference } from './targetLifecycle';

export type RoleKey =
  | 'relationship'
  | 'onboarding'
  | 'compliance'
  | 'partner'
  | 'manager'
  | 'preparer'
  | 'reviewer'
  | 'eqr'
  | 'client_admin'
  | 'client_finance'
  | 'client'
  | 'billing'
  | 'records'
  | 'admin'
  | 'superuser';

export interface UserPersona {
  credentialSummary?: string;
  cvReference?: string;
  id: string;
  /** Stable natural-person key shared by a person's role personas. */
  personId?: string;
  name: string;
  initials: string;
  role: RoleKey;
  label: string;
  group: 'Commercial' | 'Professional' | 'Client' | 'Operations' | 'System / Prototype Testing';
  email: string;
  status: 'Active' | 'Inactive' | 'Disabled';
  demoClients?: string[];
}

export interface SimulatedInvitation {
  id: string;
  email: string;
  name: string;
  role: RoleKey;
  scopeKind: 'Global' | 'Client' | 'Engagement';
  scopeId?: string;
  status: 'Pending' | 'Accepted' | 'Expired' | 'Revoked';
  invitedAt: string;
  invitedBy: string;
  expiresAt: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}

export interface IdentityStatusEvent {
  id: string;
  timestamp: string;
  action: 'Created' | 'Activated' | 'Disabled' | 'Invited' | 'InvitationAccepted' | 'InvitationExpired' | 'InvitationRevoked' | 'InvitationResent';
  userId: string;
  userName: string;
  role: RoleKey;
  actor: string;
  reason?: string;
}

/** Prototype activity feed item. Older saved payloads may omit its stable merge key. */
export interface PrototypeActivityEvent {
  id?: string;
  text: string;
  ref: string;
  time: string;
  type: string;
}


export type RouteKey =
  | 'overview'
  | 'clients'
  | 'client-detail'
  | 'acquisition'
  | 'proposals'
  | 'engagements'
  | 'billing'
  | 'onboarding'
  | 'documents'
  | 'trial-balance'
  | 'audit-planning'
  | 'scheduling'
  | 'financial-statements'
  | 'audit-risks'
  | 'audit-fieldwork'
  | 'sampling'
  | 'confirmations'
  | 'evidence'
  | 'findings'
  | 'reviews'
  | 'delivery'
  | 'records'
  | 'my-time'
  | 'reports'
  | 'practice-ledger'
  | 'portal'
  | 'requirements'
  | 'client-requirements'
  | 'role-guide'
  | 'module-guide';

// Historical schema grouping (migration compatibility): 02: Clients & CRM
export interface ClientContactSnapshot {
  name: string;
  email: string;
  phone?: string;
  title?: string;
  responsibility?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isPrimary: boolean;
  active: boolean;
}

export interface ClientContactHistoryEntry {
  revision: number;
  changedAt: string;
  changedByUserId: string;
  before: ClientContactSnapshot;
  after: ClientContactSnapshot;
}

export interface ClientContact {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  responsibility?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isPrimary: boolean;
  active: boolean;
  portalAccessRequested?: boolean;
  revision?: number;
  history?: ClientContactHistoryEntry[];
  contactRole?: 'MD/GM' | 'CFO/Finance Director' | 'Chief Accountant/Audit Liaison' | 'Other';
}

export interface ClientContactNomination {
  id: string;
  clientId: string;
  name: string;
  email: string;
  nominatedByUserId: string;
  nominatedBy: string;
  nominatedAt: string;
  reason: string;
  status: 'Pending review' | 'Reviewed';
  reviewedByUserId?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface ClientRelationshipGroup {
  id: string;
  name: string;
  description: string;
  clientIds: string[];
}

export interface CustomFieldDefinition {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'choice';
  options?: string[];
  enabled?: boolean;
}

export interface ClientRecord {
  id: string;
  code: string;
  name: string;
  /** Added in local-state schema v24; v23 records migrate to Company. */
  clientType?: 'Company' | 'Individual' | 'Partnership' | 'Government' | 'Nonprofit' | 'Other';
  profileRevision?: number;
  tradingName?: string;
  initials: string;
  color?: string;
  industry: string;
  contact: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  jurisdiction: string;
  registrationNumber?: string;
  status: 'Prospect' | 'Active' | 'Suspended' | 'Archived';
  risk: 'Low' | 'Moderate' | 'High';
  revenue: number; // QAR
  relationshipOwner: string;
  partner?: string;
  manager?: string;
  notes?: string;
  customFields?: Record<string, string | number>;
  relationshipGroupId?: string;
  accountingProfile?: ClientAccountingProfile;
  entityRole?: 'Holding' | 'Subsidiary' | 'Affiliate' | 'Standalone';
  parentClientId?: string;
}

export interface AccountingChartAccount {
  code: string;
  name: string;
  type: TrialBalanceRow['type'];
  parentCode?: string;
  posting: boolean;
  active: boolean;
}

export interface AccountingPeriodBook {
  id: string;
  name: string;
  bookName: string;
  startDate: string;
  endDate: string;
  ownerEngagementId: string;
  status: 'Open' | 'Closed';
}

export interface AccountingDimension {
  id: string;
  name: 'Department' | 'Cost centre' | 'Project';
  values: string[];
  active: boolean;
}

export interface AccountingProfileSnapshot {
  legalEntityName: string;
  reportingBasis: 'Not selected' | 'IFRS' | 'Local GAAP' | 'Other';
  baseCurrency: string;
  accounts: AccountingChartAccount[];
  periodBooks: AccountingPeriodBook[];
  dimensions: AccountingDimension[];
}

export interface ClientAccountingProfile extends AccountingProfileSnapshot {
  revision: number;
  chartRevision: number;
  history: Array<AccountingProfileSnapshot & { revision: number; chartRevision: number; savedAt: string; savedByUserId: string }>;
}

// Historical schema grouping (migration compatibility): 03: Leads & Opportunities
export interface LeadOpportunity {
  id: string;
  name: string;
  contact: string;
  email?: string;
  service: string;
  value: number; // QAR minor units / currency
  currency: string;
  stage: 'Inquiry' | 'Discovery' | 'Evaluation' | 'Proposal' | 'Won' | 'Lost' | 'Unqualified';
  owner: string;
  source?: string;
  intakeChannel?: 'Phone' | 'WhatsApp' | 'Email' | 'Web Form' | 'Referral';
  entityStructure?: 'Holding' | 'Subsidiary' | 'Affiliate' | 'Standalone';
  parentEntity?: string;
  targetDate?: string;
  nextAction?: string;
  discoveryNotes?: string;
  notes?: string;
  lostReason?: string;
  convertedClientId?: string;
  convertedOpportunityId?: string;
  history?: Array<{ by: string; at: string; stage: LeadOpportunity['stage']; reason?: string }>;
  accepted: boolean;
  terms: boolean;
}

// Historical schema grouping (migration compatibility): 04: Proposals & Services
export interface ProposalItem {
  id: string;
  serviceName: string;
  description: string;
  scope: string;
  exclusions?: string;
  deliverables: string;
  clientResponsibilities?: string;
  feeModel: 'Fixed' | 'Time & Materials' | 'Retainer';
  amount: number;
  period?: string;
  periodStart?: string;
  periodEnd?: string;
  dependencies?: string;
  quantity?: number;
  rate?: number;
  serviceId?: string;
  serviceRevision?: number;
}

export interface ProposalServiceDefinition {
  id: string;
  name: string;
  description: string;
  scope: string;
  exclusions: string;
  deliverables: string;
  clientResponsibilities: string;
  dependencies: string;
  period: string;
  periodStart?: string;
  periodEnd?: string;
  feeModel: ProposalItem['feeModel'];
  quantity: number;
  rate: number;
  currency: string;
  active: boolean;
  revision: number;
}

export interface ProposalContentTemplate {
  id: string;
  name: string;
  description: string;
  serviceId: string;
  serviceRevision?: number;
  title: string;
  scope: string;
  exclusions: string;
  deliverables: string;
  clientResponsibilities: string;
  dependencies: string;
  period: string;
  periodStart?: string;
  periodEnd?: string;
  feeModel: ProposalItem['feeModel'];
  quantity: number;
  rate: number;
  currency: string;
  terms: string;
  revision: number;
  active: boolean;
}

export interface ProposalDispatchRecord {
  recipientContactId?: string;
  recipientName: string;
  channel: 'Email' | 'WhatsApp' | 'Letter';
  revision: number;
  dispatchedAt: string;
  simulatedOutcome: 'Delivered (simulated)' | 'Failed (simulated)';
}

export interface ProposalRecord {
  id: string;
  leadId?: string;
  clientId?: string;
  title: string;
  revision: number;
  preparedBy: string;
  preparedAt: string;
  currency: string;
  totalAmount: number;
  items: ProposalItem[];
  terms: string;
  proposalMode?: 'Brief Quotation' | 'Comprehensive Technical Proposal';
  firmProfile?: string;
  firmHistory?: string;
  deliveryTimeline?: string;
  regulatoryRegistrations?: string[];
  teamCredentials?: Array<{ name: string; role: string; qualification: string; experience: string }> | string;
  industryExperience?: string;
  auditMethodology?: string;
  period?: string;
  periodStart?: string;
  periodEnd?: string;
  templateId?: string;
  templateRevision?: number;
  predecessorId?: string;
  presentedSnapshot?: {
    revision: number;
    title: string;
    currency: string;
    totalAmount: number;
    items: ProposalItem[];
    terms: string;
    presentedBy: string;
    presentedAt: string;
    proposalMode?: 'Brief Quotation' | 'Comprehensive Technical Proposal';
    firmProfile?: string;
    firmHistory?: string;
    deliveryTimeline?: string;
    regulatoryRegistrations?: string[];
    teamCredentials?: any;
    industryExperience?: string;
    auditMethodology?: string;
    period?: string;
    periodStart?: string;
    periodEnd?: string;
  };
  dispatchHistory?: ProposalDispatchRecord[];
  state:
    | 'Draft'
    | 'Internal review'
    | 'Approved to send'
    | 'Presented'
    | 'Accepted'
    | 'Declined'
    | 'Withdrawn'
    | 'Superseded';
  commercialReview?: {
    reviewedBy: string;
    reviewedAt: string;
    approved: boolean;
    notes?: string;
  };
  clientResponse?: {
    responseType: 'Accepted' | 'Declined' | 'Withdrawn';
    contact: string;
    date: string;
    method: 'Email' | 'WhatsApp' | 'Meeting' | 'Letter';
    notes: string;
    evidenceRef?: string;
    /** Actor and proposal revision captured when the client response was recorded. */
    recordedBy?: string;
    recordedRole?: RoleKey;
    revision?: number;
    contactId?: string;
  };
}

// Historical schema grouping (migration compatibility): 04 / Engagements
export interface GeneratedArtifactRecord {
  id: string;
  name: string;
  kind: 'XLSX' | 'DOCX' | 'PDF' | 'PBC' | 'GROUP_JSON';
  mimeType: string;
  size: number;
  sha256: string;
}

export interface ArchivedArtifactRecord extends GeneratedArtifactRecord {
  sourceArtifactId: string;
}

export interface FinancialPackageRevision {
  id: string;
  engagementId: string;
  revision: number;
  generation: number;
  sourceVersion: number;
  /** Exact accepted GL source revision used to generate this package, when GL intake is configured. */
  glSourceRevision?: number;
  glSourceSha256?: string;
  mappingRevision: number;
  notes: string;
  noteApplicability?: 'Not assessed' | 'Applicable' | 'Not applicable';
  noteRevision: number;
  disclosures?: DisclosureReviewRecord[];
  cashFlowScheduleRevision?: number;
  sections: Array<{ id: string; title: string; desc: string; enabled: boolean; order: number }>;
  validation: { passed: boolean; trialBalanceNet: number; pendingWorkpapers: number; openReviews: number; materialFindings: number };
  artifacts: GeneratedArtifactRecord[];
  createdAt: string;
  createdBy: string;
  createdByUserId: string;
}

export interface DisclosureReviewRecord {
  id: string;
  title: string;
  applicability: 'Applicable' | 'Not applicable';
  text: string;
  evidenceRef?: string;
  rationale?: string;
  sharedWithClient: boolean;
  revision: number;
  status: 'Draft' | 'Reviewed';
  preparedByUserId: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
}

export interface StatementSetRevision {
  id: string;
  engagementId: string;
  revision: number;
  sourceVersion: number;
  mappingRevision: number;
  comparativeEngagementId?: string;
  comparativeSourceVersion?: number;
  comparativeMappingRevision?: number;
  scopeSnapshot?: { service: string; year: number; period: string };
  comparativeScopeSnapshot?: { service: string; year: number; period: string };
  layoutVersion: number;
  layout?: StatementLayoutRevision['lines'];
  totals: { assets: number; liabilities: number; equity: number; revenue: number; netProfit: number };
  comparativeTotals?: StatementSetRevision['totals'];
  lines: Array<{ line: string; current: number; comparative?: number; currentSources: string[]; comparativeSources: string[] }>;
  subtotals?: Array<{ id: string; label: string; statement: 'bs' | 'is'; lineNames: string[]; current: number; comparative?: number }>;
  status: 'Draft' | 'Reviewed' | 'Stale';
  preparedByUserId: string;
  preparedAt: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
}

export interface StatementLayoutRevision {
  id: string;
  engagementId: string;
  revision: number;
  sourceVersion: number;
  mappingRevision: number;
  lines: Array<{ line: string; statement: 'bs' | 'is'; group: string; order: number }>;
  subtotals: Array<{ id: string; label: string; statement: 'bs' | 'is'; lineNames: string[] }>;
  preparedByUserId: string;
  preparedAt: string;
}

export interface CashFlowScheduleRevision {
  id: string;
  engagementId: string;
  revision: number;
  sourceVersion: number;
  mappingRevision: number;
  openingCash: number;
  closingCash: number;
  openingEquity?: number;
  movements: Array<{ id: string; description: string; category: 'Operating' | 'Investing' | 'Financing' | 'Equity contribution' | 'Equity distribution' | 'Non-cash'; amount: number; evidenceRef: string }>;
  status: 'Draft' | 'Reviewed' | 'Stale';
  preparedByUserId: string;
  preparedAt: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
}

export interface GLSourceRevision {
  revision: number;
  predecessorRevision?: number;
  fileName: string;
  format: 'CSV' | 'XLSX' | 'Legacy';
  sha256?: string;
  columnMapping?: Record<string, string>;
  periodBookId?: string;
  importedAt: string;
  importedByUserId: string;
  openingBalances: Record<string, number>;
  transactions: GLTransactionItem[];
}

export interface EngagementRecord {
  id: string;
  auditLifecycle?: TargetEngagementLifecycle;
  continuanceFromEngagementId?: string;
  continuanceCaseId?: string;
  continuanceNotes?: string;
  client: string;
  accountingPeriodBookId?: string;
  accountingProfileRevision?: number;
  accountingChartRevision?: number;
  service: string;
  stage: string;
  lifecycleStatus?: 'Active' | 'Suspended' | 'Cancelled' | 'Closed';
  year: number;
  mode: string;
  period: string;
  due: string;
  manager: string;
  partner: string;
  team: string[];
  agreedFee: number;
  currency: string;
  proposalId?: string;
  engagementLetterHistory?: NonNullable<EngagementRecord['engagementLetter']>[];
  engagementLetter?: {
    revision?: number;
    template: 'ISA 210 External Statutory Audit' | 'ISRS 4400 Agreed-Upon Procedures';
    framework: string;
    generatedAt: string;
    generatedBy: string;
    partnerSignature: string;
    firmStamp: boolean;
    signedCopyReceived?: boolean;
    signedCopyRef?: string;
    content: string;
  };
  professionalAcceptance?: { by: string; at: string; evidenceRef: string; proposalRevision: number };
  acceptance: boolean;
  terms: boolean;
  planning: boolean;
  sourceAccepted: boolean;
  mappingApproved: boolean;
  generation: number;
  packageRevision: number;
  builtGeneration: number;
  sourceVersion: number;
  glSourceHistory?: GLSourceRevision[];
  sourceHistory?: Array<{
    version: number;
    rows: TrialBalanceRow[];
    importedAt: string;
    importedBy: string;
    fileName?: string;
    originalArtifact?: GeneratedArtifactRecord;
    format?: 'CSV' | 'XLSX' | 'Legacy' | 'Manual';
    sha256?: string;
    mapping?: { code: number; name: number; debit: number; credit: number; signed: number; convention: 'signed-net' | 'debit-credit'; dimension?: { id: string; index: number } };
    predecessorVersion?: number;
    accountingProfileRevision?: number;
    accountingChartRevision?: number;
    periodBookId?: string;
  }>;
  packageHistory?: FinancialPackageRevision[];
  disclosureHistory?: DisclosureReviewRecord[];
  cashFlowScheduleHistory?: CashFlowScheduleRevision[];
  eqrRequired: boolean;
  eqrReviewerUserId?: string;
  eqrAssignmentHistory?: Array<{ userId: string; assignedByUserId: string; at: string; reason: string }>;
  managementPresentation?: { generation: number; sourceVersion: number; packageRevision: number; presentedAt: string; presentedBy: string; presentedByUserId: string; preparedByUserId: string; artifacts: GeneratedArtifactRecord[] };
  managementPackageDecision?: { decision: 'Acknowledged' | 'Rejected'; by: string; byUserId: string; at: string; generation: number; sourceVersion: number; packageRevision: number; rationale: string; evidenceRef: string };
  managementPackageDecisionHistory?: NonNullable<EngagementRecord['managementPackageDecision']>[];
  opinion: string;
  candidate?: null | {
    generation: number;
    preparedAt: string;
    preparedBy: string;
    preparedByUserId?: string;
    manifest: GeneratedArtifactRecord[];
    sourceVersion: number;
    packageRevision: number;
    packageDefinitionId: string;
  };
  releases: Array<{
    id: string;
    version: number;
    generation: number;
    releasedAt: string;
    releasedBy: string;
    delivered: boolean;
    dispatchNote?: string;
    recipients?: string[];
    isAmended?: boolean;
    predecessorId?: string;
    manifest: Array<{ id: string; artifactId?: string; name: string; type: string; mimeType?: string; size?: number; sha?: string; sourceId?: string; sourceRevision?: number }>;
  }>;
  archive?: null | {
    packagingStatus?: 'Pending' | 'Verified' | 'Incomplete — originals unavailable';
    processedAt?: string;
    unavailable?: string[];
    inspection?: GeneratedArtifactRecord;
    archivedAt: string;
    archivedBy: string;
    releaseId: string;
    manifest: string[];
    artifacts?: ArchivedArtifactRecord[];
    retentionUntil?: string;
    onApplicationHold?: boolean;
    holdReason?: string;
    predecessorArchiveId?: string;
    history?: ArchiveHistoryEntry[];
  };
  approvals: {
    manager: null | { by: string; byUserId?: string; at: string; generation: number; notes?: string };
    client: null | { by: string; byUserId?: string; at: string; generation: number; notes?: string };
    partner: null | { by: string; byUserId?: string; at: string; generation: number; notes?: string };
    eqr: null | { by: string; byUserId?: string; at: string; generation: number; notes?: string };
  };
  approvalHistory?: Array<{ role: 'manager' | 'client' | 'partner' | 'eqr'; by: string; byUserId: string; at: string; generation: number; notes?: string }>;
  eqrConcerns?: Array<{
    id: string;
    text: string;
    resolved: boolean;
    raisedBy: string;
    raisedAt: string;
    response?: string;
    responseBy?: string;
    responseUserId?: string;
    responseAt?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    resolvedAt?: string;
    resolvedBy?: string;
    resolvedUserId?: string;
  }>;
  rows: TrialBalanceRow[];
  adjustment: number;
  journalState: 'Draft' | 'Submitted' | 'Applied' | 'Rejected';
  sourceReflection: boolean;
  supplements: boolean;
  reconciliations: ReconciliationSchedule[];
  workpapers: WorkpaperItem[];
  reviews: ReviewNoteItem[];
  pbc: PbcRequestItem[];
  annual: { confirmed: string[]; decision: string | null; nextId: string | null };
  questionnaire: { answers: Record<number, boolean>; status: string };
  events: PrototypeActivityEvent[];
}

// Historical schema grouping (migration compatibility): 05: Jobs & Tasks
export interface JobTaskItem {
  id: string;
  jobId: string;
  title: string;
  description?: string;
  assignee: string;
  status: 'Not started' | 'In progress' | 'Blocked' | 'Completed' | 'Cancelled';
  blockedReason?: string;
  parentTaskId?: string; // One level of nesting only
  dueDate?: string;
  order: number;
  completedAt?: string;
  reassignmentHistory?: Array<{ from: string; to: string; date: string; reason: string }>;
  statusHistory?: Array<{ from: JobTaskItem['status']; to: JobTaskItem['status']; reason: string; by: string; byUserId: string; at: string }>;
  statusChangeReason?: string;
}

export interface JobRecord {
  id: string;
  clientId: string;
  engagementId: string;
  title: string;
  description?: string;
  owner: string;
  startDate?: string;
  dueDate: string;
  budgetHours?: number;
  status: 'Not started' | 'In progress' | 'Blocked' | 'Completed' | 'Cancelled';
  blockedReason?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledByUserId?: string;
  fromTemplateId?: string;
  fromTemplateRevision?: number;
  templateOperationId?: string;
  createdAt: string;
}

// Historical schema grouping (migration compatibility): 06: Job Templates
export interface JobTemplateItem {
  id: string;
  name: string;
  service: string;
  description: string;
  defaultJobTitle: string;
  status: 'Draft' | 'Published' | 'Retired';
  revision: number;
  revisionOfId?: string;
  rootTemplateId?: string;
  tasks: Array<{
    title: string;
    description?: string;
    roleSuggestion?: string;
    subtasks?: string[];
  }>;
}

// Historical schema grouping (migration compatibility): 07: Contextual Collaboration
export interface CommentItem {
  id: string;
  subjectType: 'client' | 'engagement' | 'job' | 'task';
  subjectId: string;
  author: string;
  authorRole: string;
  createdAt: string;
  text: string;
  visibility: 'internal' | 'client';
  mentions?: string[];
  edited?: boolean;
  editedAt?: string;
  editedBy?: string;
  moderationHistory?: Array<{ action: 'Hidden' | 'Restored'; by: string; byUserId: string; at: string; reason: string }>;
}

export interface LocalNoticeItem {
  id: string;
  recipientUserId: string;
  commentId: string;
  createdAt: string;
  readAt?: string;
}

// Historical schema grouping (migration compatibility): 09: PBC
export interface PbcRequestItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: 'Draft' | 'Requested' | 'Received' | 'Under review' | 'Accepted' | 'Needs clarification' | 'Cancelled';
  due: string;
  owner: string;
  file?: string;
  responseDocId?: string;
  version: number;
  acceptedBy?: string;
  acceptedAt?: string;
  acceptedVersion?: number;
  acceptanceHistory?: Array<{ version: number; acceptedBy: string; acceptedByUserId: string; acceptedAt: string }>;
  contributor?: string;
  requestedBy?: string;
  requestedAt?: string;
  requestLink?: string;
  clarificationNote?: string;
  sharedFiles?: Array<{
    artifact?: GeneratedArtifactRecord;
    id: string;
    name: string;
    version: number;
    size: number;
    sha: string | null;
    uploadedBy: string;
    uploadedAt: string;
    source: string;
  }>;
  thread?: Array<{
    id: string;
    kind: 'request' | 'response' | 'clarification' | 'email' | 'file';
    author: string;
    role: string;
    text: string;
    time: string;
    file?: string;
    fileId?: string;
    version?: number;
    clientVisible?: boolean;
  }>;
  email?: {
    status: string;
    to: string;
    subject: string;
    link: string;
  };
}

// Historical schema grouping (migration compatibility): 10 & 18: Documents & SharePoint
export interface DocumentItem {
  mimeType?: string;
  id: string;
  clientId: string;
  engagementId?: string;
  name: string;
  folderPath: string; // e.g. /Engagements/2026/Audit/
  version: number;
  size: number;
  sha?: string;
  classification: 'Client provided' | 'Working paper' | 'Deliverable' | 'Correspondence';
  visibility: 'Internal' | 'Client shared';
  spSiteId?: string;
  spDriveId?: string;
  spItemId?: string;
  source: 'SharePoint' | 'OneDrive Import' | 'Local In-Session';
  linkedJobId?: string;
  linkedTaskId?: string;
  taskLinkHistory?: Array<{ action: 'Linked' | 'Unlinked'; taskId: string; by: string; byUserId: string; at: string; reason?: string }>;
  linkedPbcId?: string;
  linkedWorkpaperId?: string;
  supersedesDocumentId?: string;
  uploadedBy: string;
  uploadedAt: string;
  brokenLink?: boolean;
  sharingHistory?: Array<{ from: 'Internal' | 'Client shared'; to: 'Internal' | 'Client shared'; by: string; byUserId: string; at: string; reason: string }>;
}

// Historical schema grouping (migration compatibility): 11: Communications
export interface CommunicationItem {
  id: string;
  clientId: string;
  engagementId?: string;
  /** Explicitly client-wide communications must opt in; missing engagement ownership is not a scope grant. */
  scopeKind?: 'Client' | 'Engagement';
  jobId?: string;
  direction: 'Outbound' | 'Inbound';
  channel: 'Email' | 'Phone' | 'Meeting' | 'Portal message';
  participants: string;
  summary: string;
  body?: string;
  revision?: number;
  correctionHistory?: Array<{
    revision: number;
    correctedBy: string;
    correctedByUserId: string;
    correctedAt: string;
    reason: string;
    previous: {
      channel: CommunicationItem['channel'];
      participants: string;
      summary: string;
      body?: string;
      date: string;
      visibility: CommunicationItem['visibility'];
      jobId?: string;
      linkedDocumentId?: string;
    };
  }>;
  author: string;
  date: string;
  visibility: 'Internal' | 'Client visible';
  status?: 'Simulated accepted' | 'Simulated failed' | 'Outcome unknown' | 'Recorded manually';
  relatedRequestId?: string;
  ccEmails?: string[];
  linkedDocumentId?: string;
  recipientEmail?: string;
  simulationReference?: string;
  simulationEvidence?: string;
  simulationSubmissionId?: string;
}

export interface EmailTemplateItem {
  id: string;
  name: string;
  subject: string;
  body: string;
  placeholders: string[]; // e.g. ['{client_name}', '{request_title}', '{due_date}']
}

// Historical schema grouping (migration compatibility): 12: Time Tracking
export interface TimeEntryItem {
  id: string;
  person: string;
  clientId: string;
  engagementId: string;
  jobId?: string;
  taskId?: string;
  taskTitle: string;
  date: string;
  durationMinutes: number; // Integer minutes
  /** Rates pinned when this time entry was approved; missing means unknown. */
  budgetVersion?: number;
  billingRatePerHour?: number;
  costRatePerHour?: number;
  currency?: string;
  billable: boolean;
  activity: string;
  fsli?: string;
  auditPhase?: 'Planning' | 'Fieldwork' | 'Review' | 'Reporting';
  recordedByUserId?: string;
  recordedAt?: string;
  chargeOutRole?: 'Partner' | 'Manager' | 'Senior/Reviewer' | 'Preparer/Staff';
  narrative?: string;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Returned' | 'Superseded';
  reviewedBy?: string;
  reviewedAt?: string;
  returnReason?: string;
  correctionRevision?: number;
  supersedesId?: string;
  billedInvoiceId?: string;
}

// Historical schema grouping (migration compatibility): 13: Budgets
export interface BudgetRecord {
  id: string;
  engagementId: string;
  jobId?: string;
  version: number;
  currency: string;
  status: 'Draft' | 'Approved';
  history?: Array<{ version: number; savedAt: string; savedBy: string; lines: BudgetRecord['lines'] }>;
  lines: Array<{
    id: string;
    roleOrActivity: string;
    staffName?: string;
    plannedMinutes: number;
    billingRatePerHour: number; // QAR
    costRatePerHour?: number; // QAR (optional internal rate)
  }>;
}

// Historical schema grouping (migration compatibility): 14: Billing & Invoicing
export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number; // rounded
  sourceType: 'Fixed service' | 'Time entry' | 'Ad hoc';
  sourceId?: string;
}

export interface InvoiceRecord {
  id: string;
  /** Historical tax total carried from a legacy record; new invoices use the no-tax demo profile. */
  taxTotal?: number;
  taxLabel?: string;
  clientId: string;
  eng: string;
  engagementId?: string;
  invoiceNumber: string;
  description: string;
  amount: number; // QAR integer minor units (or cash units)
  paid: number;
  currency: string;
  /** Client billing-account/contact values captured when this invoice draft is authored. */
  billingDetails?: {
    accountName: string;
    contactName: string;
    email?: string;
    phone?: string;
    address?: string;
    registrationNumber?: string;
  };
  status: 'Draft' | 'In review' | 'Approved' | 'Issued' | 'Paid' | 'Cancelled';
  due: string;
  issueDate?: string;
  preparedBy: string;
  reviewNote?: string;
  lines: InvoiceLineItem[];
  commercialApproval?: {
    by: string;
    at?: string;
    basis?: string;
    reviewedRevision?: number;
  };
  revision?: number;
  revisionHistory?: Array<{
    revision: number;
    description: string;
    amount: number;
    due: string;
    lines: InvoiceLineItem[];
    editedBy: string;
    editedAt: string;
    reason: string;
  }>;
  commercialApprovalHistory?: Array<{ revision: number; by: string; at: string; basis?: string }>;
  creditsApplied?: number;
  /** Flag for 50% advance invoices generated alongside Engagement Letters per spec §4.1.5 */
  isAdvanceInvoice?: boolean;
}

export interface CreditNoteRecord {
  id: string;
  invoiceId: string;
  clientId: string;
  creditNumber: string;
  amount: number;
  currency?: string;
  reason: string;
  status: 'Draft' | 'Approved' | 'Issued';
  issueDate: string;
  date?: string;
  preparedBy: string;
  revision?: number;
  returnReason?: string;
  reviewedBy?: string;
  reviewedRevision?: number;
  issuedBy?: string;
}

// Historical schema grouping (migration compatibility): 15: Receivables & Offline Receipts
export interface ReceiptRecord {
  id: string;
  clientId: string;
  receiptNumber: string;
  amount: number;
  currency: string;
  date: string;
  reference?: string;
  method: 'Bank transfer' | 'Cash' | 'Cheque' | 'Other';
  externalRef: string;
  notes?: string;
  allocatedAmount: number;
  allocations: Array<{
    invoiceId: string;
    amount: number;
    allocatedAt: string;
    date?: string;
    reversed?: boolean;
    reversalReason?: string;
    reversalDate?: string;
  }>;
}

// Historical schema grouping (migration compatibility): 20-25: Accounting
export interface TrialBalanceRow {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number; // QAR
  dimensionDept?: string;
  dimensions?: Record<string, string>;
  mappedStatementLine?: string;
  mappedNoteRef?: string;
}

export interface AccountMappingRevision {
  sourceVersion?: number;
  preparedByUserId?: string; preparedAt?: string; approvedByUserId?: string; approvedAt?: string;
  engagementId: string;
  revision: number;
  mappings: Array<{ accountCode: string; targets: Array<{ statementLine: string; percentage: number }> }>;
  status: 'Draft' | 'Approved';
  preparedBy: string;
  reviewedBy?: string;
}

export interface GLTransactionItem {
  id: string;
  engagementId?: string;
  journalId: string;
  lineId: string;
  date: string;
  serviceDate?: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  currency: string;
  description: string;
  reference?: string;
  dimensionDept?: string;
  dimensions?: Record<string, string>;
}

export interface AdjustmentJournalItem {
  managementResponses?: Array<{ journalRevision: number; accepted: boolean; respondent: string; reference: string; note: string; recordedByUserId: string; at: string }>;
  id: string;
  engagementId: string;
  revision?: number;
  amendmentHistory?: Array<{
    revision: number;
    title: string;
    lines: AdjustmentJournalItem['lines'];
    rationale?: string;
    status: AdjustmentJournalItem['status'];
    preparedBy: string;
    reviewedBy?: string;
    managementAcceptedBy?: string;
    managementDecisionNote?: string;
    reflectionStatus: AdjustmentJournalItem['reflectionStatus'];
    reflectionSourceVersion?: number;
    reflectionEvidenceRef?: string;
    supportLinks?: AdjustmentJournalSupportLinks;
    amendedAt: string;
    amendedByUserId: string;
    reason: string;
  }>;
  title: string;
  status: 'Draft' | 'Technical review' | 'Management accepted' | 'Reporting included' | 'Rejected';
  state?: string;
  preparedBy: string;
  reviewedBy?: string;
  reviewNote?: string;
  reportingIncludedBy?: string;
  reportingIncludedAt?: string;
  managementAcceptedBy?: string;
  managementDecisionNote?: string;
  reflectionStatus: 'Not reflected' | 'Reflected in TB' | 'Partially reflected' | 'Unknown';
  reflectedInClientBooks?: boolean;
  reflectionSourceVersion?: number;
  reflectionEvidenceRef?: string;
  reflectionHistory?: Array<{ status: AdjustmentJournalItem['reflectionStatus']; sourceVersion: number; evidenceRef?: string; recordedAt: string; recordedByUserId: string }>;
  rationale?: string;
  evidenceRef?: string;
  supportLinks?: AdjustmentJournalSupportLinks;
  lines: Array<{
    accountCode: string;
    accountName: string;
    type: 'debit' | 'credit';
    amount: number;
    debit?: number;
    credit?: number;
  }>;
}

/** Exact source revisions supporting a proposed journal. A journal amendment may replace these pins. */
export interface AdjustmentJournalSupportLinks {
  evidence?: { id: string; evidenceVersion: number; documentId: string; documentVersion: number };
  workpaper?: { id: string; version: number };
  finding?: { id: string; revision: number };
}

export interface ReconciliationSchedule {
  engagementId?: string;
  id?: string;
  title?: string;
  name: string;
  ref: string;
  accountCode?: string;
  sourceBalance?: number;
  supportingBalance?: number;
  glBalance?: number;
  statementBalance?: number;
  status: 'Draft' | 'In Review' | 'Returned' | 'Approved' | 'Stale' | 'Cleared' | 'In progress' | 'Differences noted';
  evidence: string;
  asOfDate?: string;
  currency?: string;
  sourceVersion?: number;
  revision?: number;
  preparedByUserId?: string;
  preparedAt?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewNote?: string;
  history?: Array<{ revision: number; sourceVersion: number; status: ReconciliationSchedule['status']; savedAt: string; savedByUserId: string; glBalance?: number; statementBalance?: number; items: NonNullable<ReconciliationSchedule['items']>; reviewedByUserId?: string; reviewedAt?: string; reviewNote?: string }>;
  items?: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    type: 'Timing item' | 'Proposed correction';
    evidenceDoc?: string;
    journalId?: string;
    currency?: string;
    clearedDate?: string;
  }>;
}

// Historical schema grouping (migration compatibility): 26: Consolidation
export interface ConsolidationPerimeterHistoryEntry {
  revision: number;
  changedBy: string;
  changedAt: string;
  reason: string;
  components: ConsolidationGroupRecord['components'];
}

export interface ConsolidationEliminationReviewEntry {
  status: 'Approved' | 'Returned';
  changedBy: string;
  changedAt: string;
  perimeterRevision: number;
  note: string;
  evidenceRef?: string;
}

export interface ConsolidationOutputPackage {
  id: string;
  revision: number;
  fingerprint: string;
  preparedByUserId: string;
  preparedAt: string;
  evidenceRef: string;
  artifact: { id: string; name: string; mimeType: string; size: number; sha256: string };
  status: 'Draft' | 'Returned' | 'Approved';
  reviewHistory: Array<{ status: 'Returned' | 'Approved'; byUserId: string; by: string; at: string; note: string; evidenceRef: string }>;
  approvedFingerprint?: string;
}

export interface ConsolidationGroupRecord {
  id: string;
  name: string;
  period: string;
  currency: string;
  reportingBasis?: 'IFRS' | 'Local GAAP' | 'Other';
  presentationCurrency?: string;
  manager: string;
  status: 'Draft' | 'In progress' | 'Reviewed' | 'Approved';
  perimeterRevision?: number;
  perimeterHistory?: ConsolidationPerimeterHistoryEntry[];
  components: Array<{
    componentId: string;
    clientId?: string;
    legalEntityName: string;
    currency: string;
    functionalCurrency?: string;
    role?: string;
    ownershipPercent: number;
    ownershipPct?: number;
    effectiveDate?: string;
    packageRevisionPinned?: number;
    pinnedPackageRev?: number;
    packageRows?: TrialBalanceRow[];
    status: 'Ready' | 'Pending' | 'Stale';
    packageReview?: { componentId: string; packageRevision: number; sourceVersion: number; reportingBasis: 'IFRS' | 'Local GAAP' | 'Other'; period: string; reviewedByUserId: string; reviewedAt: string; evidenceRef: string };
  }>;
  fxRates: Record<string, number>; // Currency -> Rate to Group currency
  fxRateHistory?: Record<string, Array<{ revision: number; rate: number; purpose: 'Closing'; effectiveDate: string; changedBy: string; changedAt: string }>>;
  eliminations: Array<{
    id: string;
    title: string;
    counterpartyA: string;
    counterpartyB: string;
    amount: number;
    currency: string;
    status: 'Draft' | 'Submitted' | 'Approved' | 'Returned';
    explanation: string;
    description?: string;
    debitAccount?: string;
    creditAccount?: string;
    preparedByUserId?: string;
    submittedByUserId?: string;
    submittedAt?: string;
    evidenceRef?: string;
    revision?: number;
    approvedPerimeterRevision?: number;
    approvedComponentPins?: Array<{ componentId: string; packageRevision: number; sourceVersion: number }>;
    approvedFxRates?: Record<string, { rate: number; revision: number }>;
    approvalEvidenceRef?: string;
    reviewHistory?: ConsolidationEliminationReviewEntry[];
    lines: Array<{ account: string; type: 'debit' | 'credit'; amount: number }>;
  }>;
  outputPackages?: ConsolidationOutputPackage[];
}

// Historical schema grouping (migration compatibility): 27-36: Audit
export interface AuditRiskRevision {
  revision: number;
  title: string;
  rating: 'Low' | 'Medium' | 'Significant';
  response: string;
  changedBy: string;
  changedAt: string;
  rationale?: string;
  area?: string;
  assertions?: string[];
  description?: string;
  owner?: string;
  linkedProcedureIds?: string[];
  reviewImpact?: string;
}

export interface AuditRiskItem {
  id: string;
  engagementId?: string;
  title: string;
  area: string;
  assertions: string[];
  description: string;
  rationale: string;
  response: string;
  owner: string;
  rating: 'Low' | 'Medium' | 'Significant';
  linkedProcedureIds: string[];
  revisions?: AuditRiskRevision[];
}

export interface AuditProgramTemplate {
  id: string;
  name: string;
  area: string;
  description: string;
  version: number;
  status: 'Draft' | 'Published' | 'Retired';
  procedures: Array<{
    title: string;
    objective: string;
    instructions: string;
    defaultAssertions: string[];
    requiredEvidenceType: string;
  }>;
}


export interface AuditProcedureItem {
  id: string;
  engagementId?: string;
  linkedRiskIds?: string[];
  history?: AuditProcedureHistoryEntry[];
  scopeReassessmentRequired?: boolean;
  scopeReassessmentReason?: string;
  scopeReassessmentHistory?: Array<{ reason: string; previousStatus: AuditProcedureItem['status']; reviewedByUserId?: string; reviewedAt?: string; invalidatedAt: string }>;
  ref?: string;
  title?: string;
  instructions?: string;
  assignee?: string;
  requiredEvidence?: string;
  evidenceLimitation?: string;
  status: 'Not started' | 'In progress' | 'Submitted' | 'Cleared' | 'Exceptions noted' | 'Completed' | 'Exception noted';
  stepNumber?: number;
  text?: string;
  sampleSize?: number;
  assertion?: string;
  method?: string;
  workPerformed?: string;
  conclusion?: string;
  hasExceptions?: boolean;
  linkedWorkpaperId?: string;
  linkedFindingId?: string;
  workpaperRef?: string;
  preparedByUserId?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  returnReason?: string;
  returnedByUserId?: string;
  returnedAt?: string;
  evidenceReassessmentRequired?: boolean;
  evidenceReassessmentHistory?: Array<{ documentId: string; version: number; previousStatus: AuditProcedureItem['status']; reviewedByUserId?: string; reviewedAt?: string; invalidatedAt: string }>;
}

export interface AuditProcedureHistoryEntry {
  id: string;
  revision: number;
  action: 'Fieldwork saved' | 'Submitted' | 'Returned' | 'Cleared' | 'Status changed';
  actorUserId: string;
  occurredAt: string;
  programId: string;
  sourceTemplateId?: string;
  sourceTemplateVersion?: number;
  status: AuditProcedureItem['status'];
  workPerformed?: string;
  conclusion?: string;
  evidenceLimitation?: string;
  reason?: string;
  previous?: {
    status: AuditProcedureItem['status'];
    workPerformed?: string;
    conclusion?: string;
    evidenceLimitation?: string;
  };
}

export interface AuditProgramItem {
  financialStatementLines?: string[];
  id: string;
  engagementId?: string;
  sourceTemplateId?: string;
  sourceTemplateVersion?: number;
  area: string;
  objective?: string;
  title?: string;
  leadWorkpaperRef?: string;
  procedures: AuditProcedureItem[];
}

export interface SamplePopulationRow {
  evidenceMode?: 'Digital' | 'Physical' | 'Hybrid';
  id: string;
  physicalReference?: PhysicalEvidenceReference;
  itemRef: string;
  identifier?: string;
  date: string;
  period?: number;
  currency?: string;
  counterparty: string;
  amount: number;
  recordedAmount?: number;
  auditedAmount?: number;
  difference?: number;
  description?: string;
  findingId?: string;
  tested: boolean;
  result: 'Satisfactory' | 'Exception noted' | 'Untested' | 'Exception' | 'Limited';
  notes?: string;
  limitation?: string;
  selectionRationale?: string;
  evidenceDoc?: string;
  selected?: boolean;
}

export interface SamplePopulationItem {
  id: string;
  tbSourceVersion?: number;
  planVersion?: number;
  engagementId?: string;
  sourceRevision?: number;
  sourceFileName?: string;
  sourceSha256?: string;
  sourceArtifact?: GeneratedArtifactRecord;
  sourceComplete?: boolean;
  sourceHistory?: Array<{ revision: number; fileName: string; sha256: string; importedAt: string; importedBy: string; totalPopulationCount: number; totalPopulationValue: number; items: SamplePopulationRow[] }>;
  area: string;
  name?: string;
  accountCode?: string;
  period?: number;
  currency?: string;
  methodology?: string;
  description: string;
  totalPopulationCount: number;
  totalPopulationValue: number;
  selectedCount: number;
  selectedValue: number;
  selectionVersion?: number;
  selectionPreparedBy?: string;
  /** Reviewer-recorded sampling basis: why this population and method are appropriate. */
  samplingBasis?: string;
  /** How the sample size was determined (firm method or documented professional override). */
  sizeDetermination?: string;
  /** Reviewer-defined applicable attributes/strata for attribute sampling. */
  attributeDefinition?: string;
  selectionReviews?: Array<{ version: number; sourceRevision: number; reviewedBy: string; reviewedAt: string; selectedCount: number; testedCount: number; untestedCount: number; limitedCount: number; exceptionCount: number; evaluation: string }>;
  items: SamplePopulationRow[];
}

export type SamplePopulationRecord = SamplePopulationItem;

export interface EvidenceItem {
  id: string;
  name?: string;
  title?: string;
  documentId: string;
  provider?: string;
  sha?: string;
  version: number;
  adequacyStatus: 'Adequate' | 'Pending verification' | 'Deficient' | 'Inadequate';
  receivedDate: string;
  owner?: string;
  linkedProcedures: string[];
}

export interface WorkpaperItem {
  evidenceMode?: 'Digital' | 'Physical' | 'Hybrid';
  id: string;
  physicalReference?: PhysicalEvidenceReference;
  /** Recorded risk tier at preparation: RED files are manager-executed and partner-reviewed. */
  executionRiskLevel?: 'RED' | 'AMBER' | 'GREEN';
  generatedArtifact?: GeneratedArtifactRecord;
  generatedArtifactHistory?: GeneratedArtifactRecord[];
  title: string;
  objective: string;
  assertion: string;
  risk: string;
  version: number;
  status: 'Planned' | 'In progress' | 'Submitted' | 'Changes required' | 'Cleared' | 'Not applicable';
  applicable: boolean;
  section?: string;
  scope?: string;
  documentName?: string;
  sourceTemplateId?: string;
  sourceTemplateVersion?: number;
  sourceProcedureRefs?: string[];
  workPerformed?: string;
  submittedBy?: string;
  submittedVersion?: number;
  submissionHistory?: Array<{ version: number; submittedBy: string; submittedAt: string }>;
  assignmentHistory?: Array<{ role: 'preparer' | 'reviewer'; from?: string; to: string; assignedBy: string; reason: string; assignedAt: string }>;
  evidenceRefs?: string[];
  evidenceRevisions?: Record<string, number>;
  evidenceLinkHistory?: Array<{ documentId: string; version: number; action: 'Linked' | 'Unlinked'; actorId: string; reason: string; at: string }>;
  preparer: string;
  reviewer: string;
  conclusion: string;
  notApplicableRationale?: string;
  guidelines: Array<{ title: string; desc: string; mandatory?: boolean }>;
  template: { name: string; ref: string; version: string; format: string; instructions: string; csv: string };
  workingPaper: null | {
    file: string;
    name: string;
    size: number;
    sha?: string;
    version: number;
    uploadedAt: string;
    uploadedBy: string;
    local: boolean;
  };
  supportingEvidence: Array<{
    id: string;
    pbcId?: string;
    title: string;
    file: string;
    sha?: string;
    source: string;
    status: string;
    linkedAt: string;
  }>;
  clearance: null | {
    clearedBy: string;
    clearedAt: string;
    sourceVersion: number;
    generation: number;
    version: number;
    notes: string;
  };
  clearanceHistory: Array<{
    clearedBy: string;
    clearedAt: string;
    sourceVersion: number;
    generation: number;
    version: number;
    notes: string;
  }>;
}

export interface WorkpaperTemplateItem {
  id: string;
  name: string;
  version: number;
  status: 'Draft' | 'Published';
  publishedBy?: string;
  objective: string;
  assertion: string;
  risk: string;
  scope: string;
  guidelines: WorkpaperItem['guidelines'];
  template: WorkpaperItem['template'];
  procedureRefs: string[];
  sampleFileName?: string;
}

export interface FindingItem {
  managementLetterVisible?: boolean;
  managementLetterHistory?: Array<{ at: string; actorUserId: string; included: boolean; reason: string }>;
  id: string;
  engagementId: string;
  type?: 'Monetary misstatement' | 'Internal control deficiency' | 'Disclosure omission';
  category?: 'Monetary misstatement' | 'Internal control deficiency' | 'Disclosure omission';
  title: string;
  description?: string;
  severity?: 'Material' | 'Significant' | 'Minor' | 'Trivial';
  financialStatementLine?: string;
  affectedAccount?: string;
  assertion?: string;
  amount?: number; // QAR
  grossMisstatement?: number;
  netMisstatement?: number;
  condition?: string;
  /** Substantive consequence of the deficiency; required for management-letter inclusion. */
  impact?: string;
  recommendation?: string;
  currency?: string;
  disposition: 'Uncorrected' | 'Management agreed' | 'Corrected in TB' | 'Waived as immaterial' | 'Proposed for correction' | 'Corrected by client' | 'Uncorrected waived';
  revision?: number;
  proposedCorrection?: string;
  managementResponse?: string;
  owner?: string;
  linkedProcedureId?: string;
  linkedWorkpaperId?: string;
  linkedEvidenceId?: string;
  linkedSamplePopulationId?: string;
  linkedSampleItemId?: string;
  linkedJournalId?: string;
  linkedReviewNoteId?: string;
  dispositionHistory?: Array<{ disposition: FindingItem['disposition']; from: FindingItem['disposition']; actorId: string; rationale: string; at: string }>;
}

export type AuditFindingItem = FindingItem;

export interface ReviewNoteItem {
  id: string;
  wp: string;
  subjectType?: 'workpaper' | 'finding';
  title: string;
  body: string;
  author?: string;
  text?: string;
  severity: 'High' | 'Medium' | 'Low';
  status: 'Open' | 'Responded' | 'Cleared' | 'Reopened';
  raisedBy: string;
  assigned: string;
  assignee?: string;
  assignedUserId?: string;
  assignmentHistory?: Array<{ assignedUserId: string; assignedTo: string; actorUserId: string; at: string; reason: string }>;
  due: string;
  response: string;
  responseEvidence?: string;
  version: number;
  subjectVersion?: number;
  /** Client-bundle scope: review notes stay internal unless explicitly designated as formal client correspondence. */
  externalVisibility?: 'Internal only' | 'Formal client correspondence';
  correspondenceHistory?: Array<{ at: string; actorUserId: string; visibility: 'Internal only' | 'Formal client correspondence'; reason: string }>;
  history: Array<{ actor: string; action: string; time: string; text?: string }>;
}

// Legacy Microsoft 365 simulation configuration retained for saved-state migration compatibility; not a current product module.
export interface M365SimulationConfig {
  tenantName: string;
  tenantId: string;
  permittedUserGroups: string[];
  permittedUsers: Array<{ userId: string; role: RoleKey }>;
  sharePointSite: string;
  sharePointLibrary: string;
  folderRoot: string;
  mailSenderAccount: string;
  oneDriveEnabled: boolean;
  lastSimulatedVerification?: string;
  configRevision?: number;
  verificationResults?: Partial<Record<'identity' | 'sharepoint' | 'mail' | 'onedrive', {
    outcome: string;
    testedAt: string;
    configRevision: number;
    resourceId: string;
  }>>;
  status: 'Not configured' | 'Simulated verified' | 'Simulated error' | 'Disconnected';
  simulatedErrorMessage?: string;
  liveConnected: false; // Must strictly always be false!
}

// Historical schema grouping (migration compatibility): 39: Firm Administration
export interface FirmSettings {
  firmName: string;
  firmLegalName: string;
  jurisdiction: string;
  currency: string;
  /** Display timezone label for the firm profile (browser-local prototype; display only). */
  timezone: string;
  /** Optional logo reference label. The prototype stores no binary logo payload. */
  logoRef?: string;
  invoiceNumberPrefix: string;
  invoiceNextNumber: number;
  creditNumberPrefix: string;
  creditNextNumber: number;
  paymentTermsDays: number;
  locale: string;
}

export interface AcceptanceCaseRecord {
  id: string;
  engagementId?: string;
  changedFacts?: string;
  continuedToEngagementId?: string;
  priorPeriodEngagementId?: string;
  assessmentType?: 'Track A (Initial)' | 'Track B (Continuance)' | 'Continuance';
  clientId: string;
  year: number;
  service: string;
  riskRating: 'Low' | 'Medium' | 'High' | 'Prohibited';
  independenceConfirmed: boolean;
  amlKycCompleted: boolean;
  conflictsCleared: boolean;
  prohibitionsChecked: boolean;
  competenceConfirmed: boolean;
  managementIntegrityConfirmed?: boolean;
  financialViabilityConfirmed?: boolean;
  continuanceDeltaChecklist?: {
    priorFeesSettled?: boolean | null;
    /** @deprecated Use priorFeesSettled */
    priorYearFeesSettled?: boolean | null;
    managementShareholdingUnchanged?: boolean | null;
    /** @deprecated Use managementShareholdingUnchanged */
    managementChanges?: boolean;
    noNewLoansCovenants?: boolean | null;
    /** @deprecated Use noNewLoansCovenants */
    newLoanCovenants?: boolean;
    noPendingLitigation?: boolean | null;
    /** @deprecated Use noPendingLitigation */
    pendingLitigation?: boolean;
    noFraudInvestigations?: boolean | null;
    /** @deprecated Use noFraudInvestigations */
    fraudOrInvestigations?: boolean;
    noRegulatoryInquiries?: boolean | null;
    /** @deprecated Use noRegulatoryInquiries */
    regulatoryInquiries?: boolean;
    deltaExplanations?: string;
    notes?: string;
  };
  screeningEvidence?: Partial<Record<'amlKyc' | 'independence' | 'conflicts' | 'prohibitions' | 'competence' | 'managementIntegrity' | 'financialViability', string>>;
  conditions: string[];
  recommendationBy: string;
  recommendationDate: string;
  recommendationNotes: string;
  decisionBy?: string;
  decisionDate?: string;
  decisionStatus: 'Pending' | 'Accepted' | 'Declined';
  decisionNotes?: string;
  recommendationByUserId?: string;
  decisionByUserId?: string;
  history?: Array<{ action: 'recommendation' | 'decision'; by: string; byUserId: string; at: string; notes: string; status: 'Pending' | 'Accepted' | 'Declined'; screeningEvidence?: AcceptanceCaseRecord['screeningEvidence'] }>;
}

export interface AuditPlanRecord {
  benchmarkProvenance?: { sourceVersion: number; accounts: Array<{ code: string; balance: number }>; rawValue: number; normalizations: Array<{ amount: number; rationale: string; accountCode: string }> };
  id: string;
  sourceVersion?: number;
  benchmarkSource?: 'TB' | 'Manual';
  engagementId: string;
  version: number;
  status: 'Draft' | 'Under review' | 'Approved' | 'Superseded';
  benchmark: string;
  benchmarkValue: number;
  materialityRate: number;
  /** Omitted only on historical revisions that predate explicit rate capture. */
  performanceMaterialityRate?: number;
  /** Omitted only on historical revisions that predate explicit rate capture. */
  clearlyTrivialRate?: number;
  overallMateriality: number;
  rawOverallMateriality?: number;
  managerRoundedPM?: number;
  normalizedPbtAdjustments?: string;
  performanceMateriality: number;
  clearlyTrivialThreshold: number;
  rationales: string[];
  teamAllocations: Array<{ person: string; role: string; scheduledStart: string; scheduledEnd: string }>;
  timingMilestones: Array<{ phase: string; targetDate: string; status: 'Planned' | 'In progress' | 'Completed' }>;
  significantAreas: string[];
  preparedBy?: string;
  preparedByUserId?: string;
  preparedAt?: string;
  reviewedBy?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  supersededReason?: string;
}

export interface ArchiveRecord {
  id: string;
  engagementId: string;
  releaseId: string;
  clientName: string;
  service: string;
  year: number;
  archivedAt: string;
  archivedBy: string;
  retentionUntil?: string;
  onHold: boolean;
  onApplicationHold?: boolean;
  holdReason?: string;
  handoverRequested?: boolean;
  handoverRequester?: string;
  handoverNotes?: string;
  manifestCount: number;
  manifest?: string[];
  artifacts?: ArchivedArtifactRecord[];
  predecessorArchiveId?: string;
  history?: ArchiveHistoryEntry[];
}

export interface ArchiveHistoryEntry {
  action: 'Existing archive state' | 'Archived' | 'Successor release archived' | 'Application hold placed' | 'Application hold lifted' | 'Metadata corrected';
  actorId: string;
  at: string;
  before?: { releaseId: string; retentionUntil?: string; onHold: boolean; holdReason?: string };
  after: { releaseId: string; retentionUntil?: string; onHold: boolean; holdReason?: string };
}

// Whole Prototype State
export interface PrototypeState {
  schema: number;
  confirmations?: ExternalConfirmation[];
  firmLedger?: FirmLedgerEntry[];
  portalPasswordChanges?: PortalPasswordSimulation[];
  portalDelegations?: PortalDelegation[];
  asOfDate: string;
  selectedEngagement: string;
  currentRole: RoleKey;
  currentUserId: string;
  currentPerson: string;
  users: UserPersona[];
  clients: ClientRecord[];
  contacts: ClientContact[];
  clientContactNominations?: ClientContactNomination[];
  relationshipGroups: ClientRelationshipGroup[];
  customFields: CustomFieldDefinition[];
  leads: LeadOpportunity[];
  proposals: ProposalRecord[];
  proposalServices?: ProposalServiceDefinition[];
  proposalServiceHistory?: ProposalServiceDefinition[];
  proposalTemplates?: ProposalContentTemplate[];
  proposalTemplateHistory?: ProposalContentTemplate[];
  engagements: EngagementRecord[];
  jobs: JobRecord[];
  jobTasks: JobTaskItem[];
  jobTemplates: JobTemplateItem[];
  workpaperTemplates?: WorkpaperTemplateItem[];
  comments: CommentItem[];
  localNotices?: LocalNoticeItem[];
  documents: DocumentItem[];
  communications: CommunicationItem[];
  emailTemplates: EmailTemplateItem[];
  times: TimeEntryItem[];
  budgets: BudgetRecord[];
  invoices: InvoiceRecord[];
  creditNotes: CreditNoteRecord[];
  receipts: ReceiptRecord[];
  glTransactions: GLTransactionItem[];
  accountMappingRevisions?: AccountMappingRevision[];
  statementSetRevisions?: StatementSetRevision[];
  statementLayoutRevisions?: StatementLayoutRevision[];
  simulatedInvitations?: SimulatedInvitation[];
  identityStatusHistory?: IdentityStatusEvent[];
  auditProgramTemplates?: AuditProgramTemplate[];
  auditProgramTemplateHistory?: AuditProgramTemplate[];
  adjustmentJournals: AdjustmentJournalItem[];
  consolidationGroups: ConsolidationGroupRecord[];
  auditRisks: AuditRiskItem[];
  auditPrograms: AuditProgramItem[];
  samplePopulations: SamplePopulationItem[];
  evidenceCatalogue: Array<{
    id: string;
    title: string;
    documentId: string;
    version: number;
    adequacyStatus: 'Adequate' | 'Pending verification' | 'Deficient';
    receivedDate: string;
    owner: string;
    linkedProcedures: string[];
    linkedProcedureHistory?: Array<{ procedureId: string; action: 'Linked' | 'Unlinked'; actorId: string; reason: string; at: string }>;
    adequacyHistory?: Array<{ status: 'Adequate' | 'Pending verification' | 'Deficient'; actorId: string; rationale: string; at: string }>;
  }>;
  findings: FindingItem[];
  m365Config: M365SimulationConfig;
  firmSettings: FirmSettings;
  events: PrototypeActivityEvent[];
  roleGrants: Array<{
    userId: string;
    role: RoleKey;
    scopeKind: 'Global' | 'Client' | 'Engagement' | 'Group';
    scopeId?: string;
    effectiveFrom?: string;
    expiresAt?: string;
    requestRef?: string;
    approvalEvidenceRef?: string;
    grantedAt?: string;
    grantedBy?: string;
    reason?: string;
  }>;
  roleGrantHistory: Array<{
    id: string;
    action: 'Granted' | 'Revoked';
    userId: string;
    role: RoleKey;
    scopeKind: 'Global' | 'Client' | 'Engagement' | 'Group';
    scopeId?: string;
    actorUserId: string;
    at: string;
    reason?: string;
    effectiveFrom?: string;
    expiresAt?: string;
    requestRef?: string;
    approvalEvidenceRef?: string;
  }>;
  folders?: Array<{
    path: string;
    label: string;
    clientId?: string;
    engagementId?: string;
  }>;
  acceptanceCases?: AcceptanceCaseRecord[];
  auditPlans?: AuditPlanRecord[];
  archives?: ArchiveRecord[];
}
