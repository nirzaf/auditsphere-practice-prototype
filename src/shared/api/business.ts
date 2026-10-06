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
  staffMemberId?: string | null;
  contactId?: string | null;
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
    staffMemberId?: string | null;
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
  representationRequestId?: string;
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
  routes: Array<{ id: string; version: number; purpose: string; contact_id: string; is_primary: number; rationale: string | null; full_name: string; email: string | null; phone: string | null }>;
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

export interface BusinessFirmProfile {
  id: string;
  version: number;
  legalName: string;
  registrationNumber: string;
  address: string;
  profileText: string;
  methodologyText: string;
  logoFileId: string | null;
  updatedAt: string;
}

export interface BusinessTeamCv {
  id: string;
  version: number;
  staffMemberId: string;
  displayName: string;
  grade: StaffGrade;
  fileVersionId: string;
  originalName: string;
  sha256: string;
  approved: boolean;
  approvedByActorId: string | null;
  approvedAt: string | null;
}

export interface BusinessEngagementOption {
  id: string;
  version: number;
  clientId: string;
  clientName: string;
  code: string;
  periodStart: string;
  periodEnd: string;
  lifecycleState: string;
  contractFeeMinor: string;
}

export interface BusinessProposal {
  proposalId: string;
  proposalVersion: number;
  clientId: string;
  engagementId: string;
  proposalVersionId: string;
  revision: number;
  mode: 'QUOTE' | 'FULL_PROPOSAL';
  scope: string;
  feeMinor: string;
  currency: 'QAR';
  advanceBps: number;
  finalBps: number;
  validUntil: string;
  timeline: Array<{ name: string; date: string }>;
  clientName: string;
  lifecycleState: string;
  documentStatus: 'NOT_GENERATED' | 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'RETRYABLE_FAILED' | 'PERMANENT_FAILED' | 'UNKNOWN';
  documentJobId?: string | null;
  documentErrorCode?: string | null;
  approvalStatus: 'APPROVE' | 'REJECT' | 'PENDING';
  dispatchStatus: 'QUEUED' | 'ACCEPTED' | 'DELIVERED' | 'BOUNCED' | 'FAILED' | 'UNKNOWN' | 'NOT_DISPATCHED';
  dispatchId?: string | null;
  dispatchVersion?: number | null;
  dispatchErrorCode?: string | null;
  artifactFileId: string | null;
  artifactSha256: string | null;
  teamCvFileIds?: string[];
  methodologyVersion?: string;
  firmProfileVersion?: number;
  createdAt?: string;
}

export interface BusinessStaffMember {
  id: string;
  version: number;
  displayName: string;
  grade: StaffGrade;
  active: boolean;
}

export interface BusinessProposalContactRoute {
  id: string;
  version: number;
  clientId: string;
  clientName: string;
  contactName: string;
  email: string;
}

export interface BusinessProposalWorkspace {
  engagements: BusinessEngagementOption[];
  firmProfile: BusinessFirmProfile | null;
  staffMembers: BusinessStaffMember[];
  teamCvs: BusinessTeamCv[];
  contactRoutes: BusinessProposalContactRoute[];
  proposals: BusinessProposal[];
}

export interface BusinessDeliveryWorkspace {
  engagement: { id: string; clientId: string; code: string; version: number; lifecycleState: string; periodStart: string; periodEnd: string;
    serviceType: 'STATUTORY_AUDIT' | 'INTERNAL_AUDIT' | 'AGREED_UPON_PROCEDURES'; clientName: string; contractFeeMinor: string };
  letters: Array<{ id: string; revision: number; proposalVersionId?: string; commercialAcceptanceId?: string; riskClearanceId?: string;
    templateVersionId: string; artifactId: string; fileVersionId: string; contentSha256: string; feeMinor: string;
    periodStart: string; periodEnd: string; issuedAt: string }>;
  invoices: Array<{ id: string; version: number; kind: 'ADVANCE' | 'FINAL'; engagementLetterId: string; number: string; subtotalMinor: string; taxMinor: string; totalMinor: string;
    dueDate: string; status: 'DRAFT' | 'PENDING_DOCUMENT' | 'ISSUED' | 'VOID'; artifactId: string | null; fileVersionId: string | null;
    issueDate: string | null; issuedAt: string | null; documentErrorCode: string | null; outstandingMinor: string; allocations: Array<{ amountMinor: string; reversal: boolean }> }>;
  payments: Array<{ id: string; amountMinor: string; receivedOn: string; method: 'BANK_TRANSFER' | 'CHEQUE' | 'CASH'; reversal: boolean;
    receiptId: string | null; receiptNumber: string | null; receiptStatus: 'PENDING' | 'ISSUED' | null; receiptFileId: string | null; receiptErrorCode: string | null }>;
  letterDrafts?: Array<{ id: string; revision: number; proposalVersionId: string; commercialAcceptanceId: string; riskClearanceId: string;
    templateVersionId: string; signatureFileVersionId: string; sealFileVersionId: string; status: string; jobId: string;
    fileVersionId: string | null; errorCode: string | null }>;
  templates?: Array<{ id: string; serviceType: string; revision: number; name: string; clauses: string; contentSha256: string; approvedByActorId: string; approvedAt: string }>;
  contactRoutes?: Array<{ id: string; version: number; contactId: string; purpose: 'EL' | 'INVOICE' | 'RECEIPT'; name: string; email: string }>;
  signatureAssets?: Array<{ id: string; originalName: string; sha256: string; decision: string; decisionId: string | null }>;
  sealAssets?: Array<{ id: string; originalName: string; sha256: string; decision: string; approvalId: string | null }>;
  taxPolicies?: Array<{ id: string; revision: number; name: string; taxBasisPoints: number; rationale: string; approvedAt: string }>;
}

export type BusinessPbcStatus = 'PENDING_UPLOAD' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED_REUPLOAD_REQUIRED';
export interface BusinessPbcEngagement {
  id: string;
  clientId: string;
  code: string;
  periodStart: string;
  periodEnd: string;
  lifecycleState: string;
  mode: 'NOT_ACTIVE' | 'ACTIVE' | 'FROZEN';
  canUpload: boolean;
}
export interface BusinessPbcRequest {
  id: string;
  version: number;
  title: string;
  description: string;
  dueDate: string;
  assignedContact: string;
  category: 'GENERAL' | 'TRIAL_BALANCE' | 'BANK_STATEMENT' | 'CONTRACTS' | 'INVOICES' | 'PAYROLL' | 'LEGAL' | 'OTHER';
  requiredForPlanning: boolean;
  requiredForRelease: boolean;
  status: BusinessPbcStatus;
  currentSubmissionId: string | null;
  submissions: Array<{
    id: string;
    sequence: number;
    fileVersionId: string;
    originalName: string;
    sha256: string;
    submittedAt: string;
    clientComment: string | null;
    supersedesSubmissionId: string | null;
    reviews: Array<{ id: string; decision: 'APPROVE' | 'REJECT'; comments: string | null; reviewedAt: string; fileSha256: string }>;
  }>;
}
export interface BusinessPbcPortal {
  engagement: { id: string; code: string; periodStart: string; periodEnd: string; lifecycleState: string };
  mode: 'NOT_ACTIVE' | 'ACTIVE' | 'FROZEN';
  canUpload: boolean;
  uploadBlocker?: string;
  requests: BusinessPbcRequest[];
  findings: Array<{ id: string; version: number; fsliId: string; fsliCode: string; fsliName: string; title: string; description: string; severity: string;
    qualitativeSignificance: number; status: string; clientResponse: string | null; sourceHash: string; createdAt: string }>;
  adjustments: Array<Record<string, unknown> & { lines: Array<Record<string, unknown>>; evidence: Array<Record<string, unknown>> }>;
  canRespondFieldwork: boolean;
  commercialDocuments: BusinessFileMetadata[];
  releasedDeliverables: BusinessFileMetadata[];
  changeCursor: string;
}

export interface BusinessPlanningWorkspace {
  engagement: { id: string; clientId: string; lifecycleState: string; periodStart: string; periodEnd: string };
  staff: Array<{ id: string; displayName: string; grade: 'PARTNER' | 'MANAGER' | 'SENIOR' | 'ASSOCIATE' }>;
  assignments: Array<{ id: string; version: number; staffMemberId: string; displayName: string; grade: string; persona: string; phase: string;
    startDate: string; endDate: string; plannedMinutes: number; dailyMinutes: Array<{ date: string; minutes: number }> }>;
  milestones: Array<{ id: string; version: number; code: 'FIELDWORK_START' | 'DRAFT_REPORT' | 'FINAL_REPORT' | 'STATUTORY_CUTOFF';
    targetDate: string; actualDate: string | null; sourceReference: string; approvedByActorId: string | null }>;
  folders: Array<{ id: string; code: string; displayName: string; ordinal: number; fileCount: number; readOnly: number }>;
}
export interface BusinessPlanningReadiness {
  ready: boolean;
  blockers: Array<{ code: string; entityId?: string; description: string; route: string; details?: Record<string, unknown> }>;
  dependencyHash: string;
  dependencies: Record<string, unknown>;
}
export interface BusinessTrialBalanceWorkspace {
  engagement: { id: string; clientId: string; code: string; lifecycleState: string; periodStart: string; periodEnd: string;
    activeTbVersionId: string | null; activeMappingVersionId: string | null; activeMaterialityVersionId: string | null; approvedPlanningVersionId: string | null };
  imports: Array<{ id: string; fileVersionId: string; fileName: string; status: 'STAGED' | 'VALIDATING' | 'INVALID' | 'READY' | 'ACTIVATED';
    worksheet: string | null; columnMap: Record<string, number>; rowCount: number; sourceSha256: string; errorCount: number;
    currentDebitsMinor: number; currentCreditsMinor: number; priorDebitsMinor: number | null; priorCreditsMinor: number | null;
    errors: Array<{ row: number; code: string; message: string }>; createdAt: string }>;
  folders: Array<{ id: string; code: string; displayName: string; ordinal: number }>;
  tbVersion: null | { id: string; revision: number; periodStart: string; periodEnd: string; currency: string; currentDebitsMinor: number;
    currentCreditsMinor: number; priorDebitsMinor: number | null; priorCreditsMinor: number | null; priorPresent: number; rowCount: number; contentSha256: string };
  tbLines: Array<{ id: string; sourceRowNumber: number; accountCode: string; accountName: string; currentMinor: number; priorMinor: number | null;
    fsliId: string | null; fsliCode: string | null; fsliName: string | null; draftFsliId: string | null; mappingConfirmed: number | null; mappingRowVersion: number | null;
    mappingOrigin: string | null; mappingReason: string | null }>;
  mappingDraft: null | { id: string; revision: number; draftHash: string; lines: Array<{ id: string; version: number; tbLineId: string;
    accountCode: string; accountName: string; balanceMinor: string; priorBalanceMinor: string | null; fsliId: string | null; origin: string | null; confirmed: boolean; reason: string | null }> };
  fsliCatalog: Array<{ id: string; code: string; name: string; statement: string; category: string; normalSide: string; displaySign: number; presentationOrder: number }>;
  materiality: null | {
    id: string; revision: number; tbVersionId: string; mappingVersionId: string;
    benchmark: 'PBT' | 'REVENUE' | 'TOTAL_ASSETS' | 'EQUITY'; benchmarkMinor: number; normalizationMinor: number;
    normalizationReason: string | null; benchmarkRateBps: number; performanceRateBps: number; sadRateBps: number;
    pmRawNumerator: string; pmRawDenominator: string; teRawNumerator: string; teRawDenominator: string;
    sadRawNumerator: string; sadRawDenominator: string; planningMinor: number; performanceMinor: number; sadMinor: number;
    roundingReason: string | null; sourceHash: string; calculatedAt: string;
    risks: Array<{ id: string; revision: number; fsliId: string; code: string; name: string; balanceMinor: string;
      inherentRisk: 'LOW' | 'MODERATE' | 'HIGH'; criticalEstimate: number; band: 'GREEN' | 'AMBER' | 'RED'; rationale: string; sourceHash: string }>;
  };
  planning: null | { id: string; revision: number; tbVersionId: string; mappingVersionId: string; materialityVersionId: string;
    scopeText: string; strategyText: string; sourceHash: string; preparedAt: string; signoffId: string | null;
    approvedAt: string | null; signoffRationale: string | null; staleEventCount: number };
  readiness: BusinessPlanningReadiness;
}

export interface BusinessStatementLine {
  fsliId: string; code: string; name: string; statement: 'PROFIT_LOSS' | 'BALANCE_SHEET'; category: string; displaySign: number;
  currentBaseMinor: number; currentAdjustmentMinor: number; currentAdjustedMinor: number; priorMinor: number | null; varianceNumerator: string | null;
  varianceDenominator: string | null; variancePercent: number | null; varianceReason: 'CALCULATED' | 'NEW_BALANCE' | 'ZERO_BOTH' | 'NO_COMPARATIVE';
  riskBand: 'GREEN' | 'AMBER' | 'RED'; sourceRows: Array<{ tbLineId: string; sourceRowNumber: number; accountCode: string; accountName: string;
    currentRawMinor: string; currentPresentedMinor: string; priorRawMinor: string | null; priorPresentedMinor: string | null; displaySign: number }>;
}
export interface BusinessFinancialStatements {
  engagementId: string; sourcePins: Record<string, string | number | null>; sourceHash: string; adjustmentSetHash: string; basis: 'ADJUSTED';
  profitLoss: BusinessStatementLine[]; balanceSheet: BusinessStatementLine[];
  reconciliation: { assetsMinor: string; liabilitiesMinor: string; equityMinor: string; currentResultMinor: string;
    equityIncludingCurrentResultMinor: string; differenceMinor: string; balanced: boolean };
  blockers: Array<{ code: string; differenceMinor: string; message: string }>;
}
export interface BusinessFieldworkWorkspace {
  engagement: { id: string; version: number; clientId: string; state: string; periodStart: string; periodEnd: string; standardsProfileId: string; activeTbVersionId: string | null; activeMappingVersionId: string | null; approvedPlanningVersionId: string | null };
  staff: Array<{ id: string; displayName: string; grade: StaffGrade }>;
  evidenceLinks: Array<{ id: string; evidenceId: string; evidenceVersion: number; targetVersion: number; targetType: string; targetId: string; unlinkReason: string | null; linkedAt: string }>;
  statements: BusinessFinancialStatements;
  templates: Array<{ id: string; version: number; fsliCode: string; revision: number; title: string; standardsProfileId: string; status: string; approvedByActorId: string | null; approvedAt: string | null }>;
  analyticalReviews: Array<Record<string, unknown>>;
  goingConcern: null | { id: string; version: number; revision: number; isa570Edition: string; assessmentStart: string; assessmentEnd: string; checklist: Record<string, boolean>;
    eventsText: string; mitigatingPlansText: string; conclusion: string; rationale: string; status: string; sourceHash: string; createdAt: string };
  workprograms: Array<{ id: string; version: number; fsliId: string; fsliCode: string; fsliName: string; templateId: string; planningVersionId: string; riskBand: string; assignedStaffId: string; status: string; sourceHash: string }>;
  procedures: Array<{ id: string; version: number; workprogramId: string; fsliId: string; ordinal: number; title: string; instructions: string; assertion: string; origin: string; mandatory: number;
    scopeReason: string | null; workPerformed: string | null; conclusion: string | null; applicable: number; notApplicableReason: string | null; status: string; executedByStaffId: string | null;
    evidenceSetHash: string; sourceHash: string; submissionId: string | null }>;
  reviewSubmissions: Array<{ id: string; targetKind: string; procedureId: string | null; workprogramId: string | null; analyticalReviewId: string | null; goingConcernId: string | null; srmVersionId: string | null;
    targetVersion: number; subjectRevision: number | null; dependencyHash: string; submittedByActorId: string; submittedAt: string; decision: 'ACCEPT' | 'RETURN' | null; decisionComment: string | null; decidedAt: string | null }>;
  reviewNotes: Array<{ id: string; version: number; submissionId: string; procedureId: string | null; text: string; assignedPreparerId: string; status: 'OPEN' | 'RESPONDED' | 'CLOSED';
    responseText: string | null; responseAt: string | null; closedByActorId: string | null; closedAt: string | null; closureReason: string | null; resubmissionId: string | null;
    createdAt: string; targetKind: string; workprogramId: string | null; analyticalReviewId: string | null; goingConcernId: string | null; srmVersionId: string | null; targetVersion: number; targetRevision: number | null }>;
  findings: Array<Record<string, unknown>>;
  adjustments: Array<Record<string, unknown> & { lines: Array<Record<string, unknown>>; evidence: Array<Record<string, unknown>> }>;
  differences: Array<Record<string, unknown>>;
  srmVersions: Array<Record<string, unknown>>;
  confirmations: Array<Record<string, unknown>>;
  confirmationFollowups: Array<Record<string, unknown>>;
  confirmationAlternatives: Array<Record<string, unknown>>;
  confirmationReassessments: Array<{ id: string; priorConfirmationId: string; replacementConfirmationId: string | null; priorCritical: number; replacementCritical: number | null; rationale: string; partnerActorId: string; approvedAt: string }>;
  materiality: null | Record<string, unknown>;
  evidence: Array<{ id: string; familyId: string; version: number; mode: 'DIGITAL' | 'PHYSICAL' | 'HYBRID'; title: string; fileVersionId: string | null; physicalIndex: string | null;
    physicalDescription: string | null; binder: string | null; box: string | null; shelf: string | null; externalSourceUrl: string | null; retrievedAt: string | null;
    fileSha256: string | null; adequacy: 'ADEQUATE' | 'DEFICIENT' | null; adequacyRationale: string | null }>;
  samplingPolicies: Array<{ id: string; version: number; name: string; method: 'MUS_BINOMIAL_PPS' | 'SYSTEMATIC' | 'STRATIFIED_ATTRIBUTE'; algorithmVersion: string; assumptions: string; status: string; approvedByActorId: string | null; approvedAt: string | null }>;
  populations: Array<{ id: string; name: string; sourceFileId: string; fsliId: string; sourceHash: string; orderHash: string; rowCount: number; positiveTotalMinor: number; excludedCount: number; exclusionsReason: string }>;
  samplingPlans: Array<{ id: string; populationId: string; policyId: string; revision: number; method: string; confidenceBps: number | null; tolerableMinor: number | null;
    expectedTaintedBps: number | null; requestedCount: number | null; calculatedCount: number; parameters: Record<string, unknown>; inputHash: string; reason: string; createdAt: string;
    latestResult: string | null; seedHex: string; policyVersion: number }>;
  changeCursor: number;
}
export interface BusinessTrialBalancePreview {
  file: { id: string; name: string; mediaType: BusinessFileMediaType; sizeBytes: number; sha256: string };
  worksheetNames: string[];
  selectedWorksheet: string;
  preview: string[][];
  previewStartsAtRow: number;
  maxColumns: number;
}
export interface BusinessTrialBalanceImport {
  id: string;
  fileVersionId: string;
  status: 'STAGED' | 'VALIDATING' | 'INVALID' | 'READY' | 'ACTIVATED';
  rowCount: number;
  errorCount: number;
  sourceSha256: string;
  worksheet: string | null;
  columnMap: Record<string, number>;
  currentDebitsMinor: number;
  currentCreditsMinor: number;
  priorDebitsMinor: number | null;
  priorCreditsMinor: number | null;
  errors: Array<{ row: number; code: string; message: string }>;
  preview: Array<{ sourceRowNumber: number; accountCode: string | null; accountName: string | null; currentMinor: string | null; priorMinor: string | null; errors: string[] }>;
}
export interface BusinessCapacity {
  from: string;
  to: string;
  staffDays: Array<{ staffMemberId: string; displayName: string; grade: string; workDate: string; availabilityId: string | null;
    availabilityVersion: number | null; scheduledMinutes: number | null; approvedLeaveMinutes: number; availableMinutes: number | null;
    assignedMinutes: number; approvedExceptionMinutes: number; overbookedMinutes: number | null; capacityStatus: 'MISSING_CAPACITY' | 'OVERBOOKED' | 'EXCEPTION_APPROVED' | 'AVAILABLE' }>;
  overbookings: BusinessCapacity['staffDays'];
}

export type BusinessRiskCheckCode = 'UBO' | 'KYC' | 'AML' | 'INTEGRITY' | 'VIABILITY' | 'INDEPENDENCE' | 'CONFLICTS'
  | 'PRIOR_FEES' | 'MANAGEMENT_CHANGE' | 'OWNERSHIP_CHANGE' | 'NEW_BORROWING' | 'LITIGATION' | 'FRAUD_REGULATORY';
export type BusinessRiskOutcome = 'CLEAR' | 'ISSUE' | 'NOT_APPLICABLE';
export interface BusinessRiskCheckDraft {
  code: BusinessRiskCheckCode;
  outcome: BusinessRiskOutcome | '';
  findings: string;
  sourceReference: string;
  checkMethod: 'MANUAL' | 'EXTERNAL_SERVICE';
  providerName?: string;
  externalReference?: string;
  checkedOn: string;
  evidenceFileId?: string;
  resolution?: string;
}
export interface BusinessRiskAssessmentDraft {
  engagementId: string;
  track: 'NEW_CLIENT' | 'CONTINUANCE';
  expectedDraftVersion: number;
  questionnaireTemplateVersion: string;
  assessmentDate: string;
  overallRisk: 'LOW' | 'MODERATE' | 'HIGH' | '';
  managementIntegrityConclusion: string;
  viabilityConclusion: string;
  independenceConclusion: string;
  checks: BusinessRiskCheckDraft[];
}
export interface BusinessRiskEscalation {
  id: string;
  version: number;
  assessmentVersionId: string;
  checkId: string;
  checkCode: string;
  reason: string;
  requiredEvidence: string;
  status: 'OPEN' | 'RESOLVED';
  resolution: string | null;
  evidenceFileId: string | null;
  evidenceSha256: string | null;
  createdByActorId: string;
  createdByName: string;
  createdAt: string;
  resolvedByActorId: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
}
export interface BusinessRiskWorkspace {
  engagement: { id: string; version: number; clientId: string; clientName: string; periodStart: string; periodEnd: string; lifecycleState: string };
  requiredTrackACodes: BusinessRiskCheckCode[];
  requiredTrackBCodes: BusinessRiskCheckCode[];
  assessment: null | {
    id: string; version: number; track: 'NEW_CLIENT' | 'CONTINUANCE'; currentVersionId: string | null;
    revision: number | null; overallRisk: string | null; questionnaireTemplateVersion: string | null;
    assessmentDate: string | null; managementIntegrityConclusion: string | null; viabilityConclusion: string | null;
    independenceConclusion: string | null; submittedAt: string | null; draftVersion: number; draft: BusinessRiskAssessmentDraft | null;
  };
  checks: Array<Record<string, unknown>>;
  escalations: BusinessRiskEscalation[];
  beneficialOwners: Array<{ id: string; version: number; revisionId: string; fullName: string; ownershipBps: number; controlBasis: string; identityEvidenceFileId: string | null; effectiveFrom: string; effectiveTo: string | null; evidenceSha256: string | null }>;
  continuanceCandidates: Array<{ id: string; code: string; periodStart: string; periodEnd: string; lifecycleState: string; acceptanceId: string; riskVersionId: string; clearanceId: string; feeMinor: string }>;
  continuanceReview: null | {
    id: string; priorEngagementId: string; priorEngagementCode: string; priorPeriodEnd: string; priorCommercialAcceptanceId: string;
    priorRiskVersionId: string; priorRiskClearanceId: string; asOfDate: string; priorFeeOutstandingMinor: string;
    invoices: Array<{ invoiceId: string; invoiceNumber: string; issuedMinor: string; settledMinor: string; outstandingMinor: string }>;
    delta: null | { id: string; revision: number; managementChanged: boolean; ownershipChanged: boolean; newBorrowing: boolean;
      litigationChanged: boolean; fraudOrRegulatoryIssue: boolean; changeSummary: string; evidence: Array<Record<string, unknown>> };
  };
  acceptanceGate: BusinessAcceptanceGate;
}
export interface BusinessAcceptanceGate {
  engagementId: string;
  lifecycleState: string;
  commercialKey: Record<string, unknown> & { status: 'ACTIVE' | 'PENDING' | 'REVOKED' };
  riskKey: Record<string, unknown> & { status: 'ACTIVE' | 'PENDING' | 'STALE' | 'REJECTED' | 'REVOKED' | 'HIDDEN' };
  ready: boolean;
  blockers: string[];
}
