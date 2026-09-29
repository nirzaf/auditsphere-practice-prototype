import type { GeneratedArtifactRecord, RoleKey } from './index';

export interface LifecycleHistory {
  at: string;
  actorUserId: string;
  action: string;
  reason: string;
}
export interface SourcePin {
  proposalId: string;
  revision: number;
}
export interface PhysicalEvidenceReference {
  indexCode: string;
  box?: string;
  description: string;
  locationNote?: string;
}
export type AuditOpinion = 'Clean' | 'Qualified' | 'Disclaimer' | 'Adverse';
export type ConfirmationStatus =
  | 'Draft'
  | 'Requested'
  | 'Awaiting'
  | 'Received'
  | 'Reviewed'
  | 'Cleared'
  | 'No Response'
  | 'Exception'
  | 'Cancelled';
export interface ExternalConfirmation {
  id: string;
  clientId: string;
  engagementId: string;
  type: 'Bank' | 'Debtor' | 'Inventory' | 'Other';
  counterparty: string;
  relatedFsli: string;
  ownerUserId: string;
  status: ConfirmationStatus;
  critical: boolean;
  requestedAt?: string;
  dueAt: string;
  receivedAt?: string;
  workpaperIds: string[];
  evidenceRefs: string[];
  notes: string;
  revision: number;
  history: LifecycleHistory[];
}
export interface StaffAllocation {
  userId: string;
  role: 'Partner' | 'Manager' | 'Senior/Reviewer' | 'Preparer/Staff';
  phase: 'Planning' | 'Fieldwork' | 'Review' | 'Reporting';
  plannedHours: number;
  chargeRate: number | null;
  costRate: number | null;
  startDate: string;
  endDate: string;
}
export interface ReviewBasisRecord {
  revision: number;
  basis: string;
  actorUserId: string;
  at: string;
  notes: string;
}
export interface SRMRecord extends ReviewBasisRecord {
  artifact: GeneratedArtifactRecord;
  summary: string[];
}
export interface OpinionRecord {
  revision: number;
  value: AuditOpinion;
  focusArea: string;
  basis: string;
  selectedByUserId: string;
  selectedAt: string;
}
export interface DeliverableSet {
  id: string;
  revision: number;
  basis: string;
  opinionRevision: number;
  generatedAt: string;
  generatedByUserId: string;
  reportDate: string;
  artifacts: Array<
    GeneratedArtifactRecord & {
      deliverable: 'Management Letter' | 'Letter of Representation' | 'Audit Report';
    }
  >;
  deliveredAt?: string;
  deliveredByUserId?: string;
  deliveryNote?: string;
}
export interface TargetEngagementLifecycle {
  commercialBasis?: SourcePin;
  advancePayments: Array<{
    receiptId: string;
    proposalId: string;
    revision: number;
    recordedByUserId: string;
    reversed?: boolean;
    reversalReason?: string;
  }>;
  receiptDocuments: Array<{
    receiptIds: string[];
    basis: string;
    generatedAt: string;
    artifact: GeneratedArtifactRecord;
  }>;
  workspace?: {
    path: string;
    preparedAt: string;
    preparedByUserId: string;
    accessVerifiedAt?: string;
    accessVerifiedByUserId?: string;
  };
  staffing: Array<{
    revision: number;
    allocations: StaffAllocation[];
    byUserId: string;
    at: string;
    reason: string;
  }>;
  managerReviews: ReviewBasisRecord[];
  srms: SRMRecord[];
  partnerClearances: ReviewBasisRecord[];
  opinions: OpinionRecord[];
  deliverables: DeliverableSet[];
  balanceInvoices: Array<{
    invoiceId: string;
    deliverableId: string;
    acceptedFee: number;
    recognizedAdvance: number;
    artifact: GeneratedArtifactRecord;
  }>;
  archiveControl: {
    finalReportDate?: string;
    freezeDueDate?: string;
    freezeStatus: 'Not Started' | 'Counting Down' | 'Frozen';
    frozenAt?: string;
    frozenByUserId?: string;
    asOfDate?: string;
    reportSetId?: string;
    history: LifecycleHistory[];
  };
  history: LifecycleHistory[];
}
export interface FirmLedgerEntry {
  id: string;
  date: string;
  description: string;
  reference: string;
  currency: string;
  actorUserId: string;
  createdAt: string;
  lines: Array<{
    account:
      'Cash' | 'Office rent' | 'Staff salaries' | 'Petty cash' | 'Other expenses' | 'Capital';
    debit: number;
    credit: number;
  }>;
  reversalOf?: string;
}
export interface PortalPasswordSimulation {
  userId: string;
  changedAt: string;
  history: LifecycleHistory[];
}
export interface PortalDelegation {
  clientId: string;
  engagementId: string;
  userId: string;
  delegatedByUserId: string;
  at: string;
  revokedAt?: string;
}
export interface TargetStageDefinition {
  id: string;
  label: string;
  route: import('./index').RouteKey;
  owner: string;
  roles: RoleKey[];
}
