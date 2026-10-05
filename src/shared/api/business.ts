export type BusinessPersona = 'PREPARER' | 'REVIEWER' | 'APPROVER' | 'CLIENT';
export type StaffGrade = 'PARTNER' | 'MANAGER' | 'SENIOR' | 'ASSOCIATE';

/** Non-secret, browser-local selection only. There is no token or login session. */
export interface BusinessWorkspacePreference {
  version: 1;
  workspaceId: string;
  actorId?: string;
  persona?: BusinessPersona;
  clientId?: string;
  engagementId?: string;
}

export interface BusinessWorkspaceBootstrapRequest {
  name: string;
  currency: 'QAR';
  timezone: 'Asia/Qatar';
  initialPartner: { displayName: string; naturalPersonKey: string; email: string };
}

export interface BusinessWorkspaceBootstrapResponse {
  workspaceId: string;
  staffMemberId: string;
  actorProfileId: string;
  replayed?: boolean;
}

export interface BusinessActorProfile {
  id: string;
  persona: BusinessPersona;
  displayName: string;
  staffGrade: StaffGrade | null;
  clientId: string | null;
}

export interface BusinessWorkspaceSummary {
  id: string;
  name: string;
  currency: 'QAR';
  timezone: 'Asia/Qatar';
  version: number;
  status: 'ACTIVE' | 'READ_ONLY';
  dataMode: 'BUSINESS';
}

export interface BusinessContextResponse {
  actor: {
    id: string;
    persona: BusinessPersona;
    displayName: string;
    staffGrade: StaffGrade | null;
    clientId: string | null;
  };
  scope: { clientId: string | null; engagementId: string | null };
  allowedActions: string[];
  readOnlyReasons: string[];
}

export interface BusinessDirectoryCommandResponse<T = Record<string, unknown>> {
  commandId: string;
  result: T;
  replayed: boolean;
}

export type BusinessFilePurpose = 'PBC' | 'TB' | 'EVIDENCE' | 'TEMPLATE' | 'SIGNATURE' | 'SEAL' | 'GENERATED' | 'RELEASE' | 'ARCHIVE';
export type BusinessFileMediaType =
  | 'application/pdf'
  | 'text/plain'
  | 'text/csv'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'image/png'
  | 'image/jpeg'
  | 'application/zip';

export interface BusinessFileMetadata {
  id: string;
  version: number;
  clientId: string | null;
  engagementId: string | null;
  originalName: string;
  mediaType: BusinessFileMediaType;
  sizeBytes: number;
  sha256: string | null;
  purpose: BusinessFilePurpose;
  state: 'INITIALIZED' | 'STAGED' | 'VERIFIED' | 'COMMITTED' | 'REJECTED';
  committedAt: string | null;
  immutable: boolean;
}

export interface BusinessFileReservation {
  fileId: string;
  version: number;
  state: 'INITIALIZED';
  uploadPath: string;
}

export interface BusinessClientSummary {
  id: string;
  version: number;
  legalName: string;
  tradingName: string | null;
  industry: string;
  countryCode: string;
  code?: string;
  entityType?: 'HOLDING' | 'SUBSIDIARY' | 'STANDALONE';
  parentClientId?: string | null;
  active?: boolean;
}

export interface BusinessClientDetail {
  client: BusinessClientSummary & {
    commercialRegistration?: string | null;
    taxId?: string | null;
    address?: string;
  };
  contacts: Array<{
    id: string;
    version: number;
    full_name: string;
    email: string | null;
    phone: string | null;
    title: string;
    role: 'MD_GM' | 'CFO_FINANCE_DIRECTOR' | 'CHIEF_ACCOUNTANT_LIAISON' | 'OTHER';
    isPrimary: boolean;
    isSignatory: boolean;
    active: boolean;
    effective_from: string;
    effective_to: string | null;
  }>;
  routes: Array<{ id: string; version: number; purpose: string; contact_id: string; is_primary: number; full_name: string; email: string | null; phone: string | null }>;
  children: Array<Record<string, unknown>>;
  affiliations: Array<Record<string, unknown>>;
}

export interface BusinessLead {
  id: string;
  version: number;
  clientId: string | null;
  primaryContactId: string | null;
  source: 'PHONE' | 'WHATSAPP' | 'EMAIL' | 'WEB_FORM' | 'REFERRAL';
  receivedAt: string;
  requestedService: 'STATUTORY_AUDIT' | 'INTERNAL_AUDIT' | 'AGREED_UPON_PROCEDURES';
  periodStart: string;
  periodEnd: string;
  estimatedFeeMinor: string | null;
  status: 'OPEN' | 'QUALIFIED' | 'CONVERTED' | 'LOST';
  lossReason: string | null;
  convertedEngagementId: string | null;
  clientName: string | null;
  contactName: string | null;
}

export interface BusinessStandardsProfile {
  id: string;
  version: number;
  name: string;
  effectivePeriodStart: string;
  effectivePeriodEnd: string | null;
  isa220Edition: string;
  isa570Edition: string;
  reportingFramework: string;
  presentationEdition: 'IAS1' | 'IFRS18' | 'OTHER_APPROVED';
  earlyAdoption: boolean;
  approvedByActorId: string;
  approvedAt: string;
  contentSha256: string;
}
