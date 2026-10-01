/**
 * STE Audit Management Tool — domain constants.
 * Authority: Functional Requirements & Workflow Specification v2.1 (ISA/IFRS, Qatar/QAR).
 * This module is framework-free: it is imported by server services, UI and tests.
 */

export const PRIMARY_CURRENCY = 'QAR' as const;
export type CurrencyCode = 'QAR' | 'USD' | 'EUR' | 'GBP';

/** Spec §3.5 / §4.5.1 — tiered charge-out rates (QAR per hour). */
export const CHARGE_OUT_RATES_QAR = {
  PARTNER: 1_000,
  MANAGER: 750,
  SENIOR: 500,
  JUNIOR: 200
} as const;

export type ChargeOutRole = keyof typeof CHARGE_OUT_RATES_QAR;

export const CHARGE_OUT_ROLE_LABELS: Record<ChargeOutRole, string> = {
  PARTNER: 'Engagement Partner',
  MANAGER: 'Audit Manager',
  SENIOR: 'Audit Supervisor / Senior',
  JUNIOR: 'Audit Associate / Junior'
};

/** Spec §4.2.4 — benchmark bands as percentages of the chosen base. */
export const MATERIALITY_BENCHMARKS = {
  PROFIT_BEFORE_TAX: { label: 'Normalized Profit Before Tax', min: 5, max: 10 },
  REVENUE: { label: 'Total Revenue', min: 0.5, max: 2 },
  TOTAL_ASSETS: { label: 'Total Assets', min: 0.5, max: 1 },
  EQUITY: { label: 'Equity / Net Assets', min: 1, max: 2 }
} as const;

export type MaterialityBenchmark = keyof typeof MATERIALITY_BENCHMARKS;

/** Tolerable Error (performance materiality) band, % of PM. */
export const TOLERABLE_ERROR_BAND = { min: 50, max: 75 } as const;

/** Summary of Audit Differences (clearly trivial) band, % of PM. */
export const SAD_THRESHOLD_BAND = { min: 3, max: 5 } as const;

/** Spec §4.2.4 — practical rounding is permitted strictly within ±5.0%. */
export const ROUNDING_TOLERANCE_PCT = 5 as const;

/** Spec §4.2.3 / Flow 2 — mandatory five-folder engagement taxonomy. */
export const ENGAGEMENT_FOLDER_TAXONOMY = [
  '01_Administration & Planning',
  '02_Trial Balance & Schedules',
  '03_Fieldwork & Testing',
  '04_Drafts & Deliverables',
  '05_Final Signed Archive'
] as const;
export type EngagementFolder = (typeof ENGAGEMENT_FOLDER_TAXONOMY)[number];

/** Spec §4.4.3 / ISA 230 — regulatory file completion countdown. */
export const ARCHIVE_COUNTDOWN_DAYS = 60 as const;

/** Spec §4.3.4 — external confirmation families. */
export const CONFIRMATION_TYPES = [
  'Bank',
  'Accounts Receivable',
  'Accounts Payable',
  'Inventory',
  'Legal'
] as const;
export type ConfirmationType = (typeof CONFIRMATION_TYPES)[number];

export const CONFIRMATION_STATUSES = [
  'Draft',
  'Requested',
  'Awaiting',
  'Received',
  'Reviewed',
  'Cleared',
  'No Response',
  'Exception',
  'Cancelled'
] as const;
export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number];

/** Spec §4.1.5 — client-portal request badges. */
export const PBC_STATUSES = [
  'Pending Upload',
  'Under Review',
  'Approved',
  'Rejected / Re-upload Required'
] as const;
export type PbcStatus = (typeof PBC_STATUSES)[number];

/** Spec §4.1.1 — lead ingestion channels. */
export const LEAD_CHANNELS = ['Phone', 'WhatsApp', 'Email', 'Web Form', 'Referral', 'In-Person'] as const;
export type LeadChannel = (typeof LEAD_CHANNELS)[number];

/** Spec §4.1.1 — role-based communication routing. */
export const CONTACT_ROUTING = {
  MANAGING_DIRECTOR: {
    label: 'Managing Director / General Manager',
    receives: ['Proposal', 'Engagement Letter', 'Final Report'] as const
  },
  CFO: {
    label: 'Chief Financial Officer / Finance Director',
    receives: ['Invoice', 'Receipt'] as const
  },
  AUDIT_LIAISON: {
    label: 'Chief Accountant / Audit Liaison',
    receives: ['PBC Request'] as const
  },
  OTHER: { label: 'Other', receives: [] as const }
} as const;
export type ContactRoutingRole = keyof typeof CONTACT_ROUTING;

export type RoutableDocument = 'Proposal' | 'Engagement Letter' | 'Final Report' | 'Invoice' | 'Receipt' | 'PBC Request';

/** Spec §4.3.1 — substantive assertions tested per FSLI. */
export const ASSERTIONS = ['Existence', 'Rights & Obligations', 'Completeness', 'Valuation', 'Cut-off'] as const;
export type Assertion = (typeof ASSERTIONS)[number];

/** Spec §4.3.2 — sampling methods. */
export const SAMPLING_METHODS = ['Monetary Unit Sampling', 'Systematic Random', 'Stratified Attribute'] as const;
export type SamplingMethod = (typeof SAMPLING_METHODS)[number];

/** Spec §4.3.3 — the three-tier review matrix. */
export const REVIEW_TIERS = ['Preparer', 'Reviewer', 'Approver'] as const;
export type ReviewTier = (typeof REVIEW_TIERS)[number];

/** Spec §4.4.1 / ISA 700 & 705 — permitted opinion categories. */
export const OPINIONS = ['Clean', 'Qualified', 'Disclaimer', 'Adverse'] as const;
export type OpinionValue = (typeof OPINIONS)[number];

/** ISA 700/705 report headings for each opinion category. */
export const OPINION_REPORT_LABEL: Record<OpinionValue, string> = {
  Clean: 'Unmodified Opinion',
  Qualified: 'Qualified Opinion',
  Disclaimer: 'Disclaimer of Opinion',
  Adverse: 'Adverse Opinion'
};

/** Spec §4.4.2 — the mandatory five-part commercial deliverables bundle. */
export const DELIVERABLE_PARTS = [
  "Independent Auditor's Report & Certified Financial Statements",
  'Management Letter',
  'Letter of Representation',
  'Management Correspondences Audit Trail',
  'Final Balance Fee Note'
] as const;
export type DeliverablePart = (typeof DELIVERABLE_PARTS)[number];

/** Spec §4.1.4 — engagement-letter templates. */
export const ENGAGEMENT_LETTER_TEMPLATES = [
  'ISA 210 External Statutory Audit',
  'ISRS 4400 Agreed-Upon Procedures'
] as const;
export type EngagementLetterTemplate = (typeof ENGAGEMENT_LETTER_TEMPLATES)[number];

/** Split dashboard panes. */
export const STATEMENT_SECTIONS = ['Profit & Loss', 'Balance Sheet'] as const;
export type StatementSection = (typeof STATEMENT_SECTIONS)[number];

/** Risk stratification colouring (§4.2.4). */
export const RISK_STRATUM = { GREEN: 'GREEN', AMBER: 'AMBER', RED: 'RED' } as const;
export type RiskStratum = (typeof RISK_STRATUM)[keyof typeof RISK_STRATUM];

/** Document categories attached to any part of the lifecycle. */
export const DOCUMENT_CATEGORIES = [
  'Proposal',
  'Engagement Letter',
  'Advance Invoice',
  'Official Receipt',
  'Final Balance Invoice',
  'Trial Balance',
  'Working Paper',
  'Confirmation',
  'Holding Letter',
  'Management Letter',
  'Letter of Representation',
  'Audit Report',
  'Correspondence',
  'PBC Evidence'
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Minimum length of a modified-opinion basis rationale (ISA 705). */
export const MIN_MODIFIED_OPINION_RATIONALE = 30 as const;

/** Minimum length of a mandatory review-note / rejection reason. */
export const MIN_REVIEW_NOTE_LENGTH = 15 as const;
