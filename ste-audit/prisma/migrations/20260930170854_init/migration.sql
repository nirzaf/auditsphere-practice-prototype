-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('PREPARER', 'REVIEWER', 'APPROVER', 'CLIENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "EngagementState" AS ENUM ('LEAD_INGESTION', 'PROPOSAL_GENERATION', 'DUAL_KEY_PENDING', 'ADVANCE_BILLING', 'PORTAL_ACTIVE_PLANNING', 'FIELDWORK_EXECUTION', 'MANAGERIAL_REVIEW', 'PARTNER_APPROVAL', 'DELIVERABLE_RELEASE', 'COMPLIANCE_COUNTDOWN', 'ARCHIVED_READ_ONLY');

-- CreateEnum
CREATE TYPE "LifecycleStatus" AS ENUM ('Active', 'Suspended', 'Cancelled');

-- CreateEnum
CREATE TYPE "LeadChannel" AS ENUM ('PHONE', 'WHATSAPP', 'EMAIL', 'WEB_FORM', 'REFERRAL', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('INQUIRY', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ClientRelationship" AS ENUM ('HOLDING', 'SUBSIDIARY', 'AFFILIATE', 'STANDALONE');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContactRoutingRole" AS ENUM ('MANAGING_DIRECTOR', 'CFO', 'AUDIT_LIAISON', 'OTHER');

-- CreateEnum
CREATE TYPE "ProposalMode" AS ENUM ('BRIEF_QUOTATION', 'COMPREHENSIVE_TECHNICAL');

-- CreateEnum
CREATE TYPE "ProposalState" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'APPROVED_TO_SEND', 'PRESENTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AcceptanceTrack" AS ENUM ('TRACK_A_NEW_CLIENT', 'TRACK_B_RECURRING_CLIENT');

-- CreateEnum
CREATE TYPE "RiskRating" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'PROHIBITED');

-- CreateEnum
CREATE TYPE "MaterialityBenchmark" AS ENUM ('PROFIT_BEFORE_TAX', 'REVENUE', 'TOTAL_ASSETS', 'EQUITY');

-- CreateEnum
CREATE TYPE "StatementSection" AS ENUM ('PROFIT_AND_LOSS', 'BALANCE_SHEET');

-- CreateEnum
CREATE TYPE "ChargeOutRole" AS ENUM ('PARTNER', 'MANAGER', 'SENIOR', 'JUNIOR');

-- CreateEnum
CREATE TYPE "EngagementPhase" AS ENUM ('PLANNING', 'FIELDWORK', 'REVIEW', 'REPORTING', 'COMPLETION');

-- CreateEnum
CREATE TYPE "ProcedureStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REWORK', 'CLEARED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('DIGITAL', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "SamplingMethod" AS ENUM ('MONETARY_UNIT', 'SYSTEMATIC_RANDOM', 'STRATIFIED_ATTRIBUTE');

-- CreateEnum
CREATE TYPE "ConfirmationType" AS ENUM ('BANK', 'ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE', 'INVENTORY', 'LEGAL');

-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('DRAFT', 'REQUESTED', 'AWAITING', 'RECEIVED', 'REVIEWED', 'CLEARED', 'NO_RESPONSE', 'EXCEPTION', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewNoteStatus" AS ENUM ('OPEN', 'RESPONDED', 'CLEARED', 'REOPENED');

-- CreateEnum
CREATE TYPE "PbcStatus" AS ENUM ('PENDING_UPLOAD', 'UNDER_REVIEW', 'APPROVED', 'REJECTED_REUPLOAD');

-- CreateEnum
CREATE TYPE "OpinionValue" AS ENUM ('CLEAN', 'QUALIFIED', 'DISCLAIMER', 'ADVERSE');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('PROPOSAL', 'ENGAGEMENT_LETTER', 'ADVANCE_INVOICE', 'OFFICIAL_RECEIPT', 'FINAL_BALANCE_INVOICE', 'TRIAL_BALANCE', 'WORKING_PAPER', 'CONFIRMATION', 'HOLDING_LETTER', 'MANAGEMENT_LETTER', 'LETTER_OF_REPRESENTATION', 'AUDIT_REPORT', 'CORRESPONDENCE', 'PBC_EVIDENCE');

-- CreateEnum
CREATE TYPE "DeliverablePart" AS ENUM ('AUDIT_REPORT_AND_FINANCIALS', 'MANAGEMENT_LETTER', 'LETTER_OF_REPRESENTATION', 'MANAGEMENT_CORRESPONDENCE_TRAIL', 'FINAL_BALANCE_FEE_NOTE');

-- CreateEnum
CREATE TYPE "FirmAccount" AS ENUM ('CASH', 'OFFICE_RENT', 'STAFF_SALARIES', 'STAFF_BENEFITS', 'PARTNER_WITHDRAWALS', 'PETTY_CASH', 'OTHER_EXPENSES');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "RoleKey" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAccessGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "engagementId" TEXT,
    "accessKind" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ClientAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "channel" "LeadChannel" NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "notes" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'INQUIRY',
    "capturedByUserId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedClientId" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "legalNameArabic" TEXT,
    "crNumber" TEXT,
    "tin" TEXT,
    "country" TEXT NOT NULL DEFAULT 'QA',
    "relationship" "ClientRelationship" NOT NULL DEFAULT 'STANDALONE',
    "parentClientId" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'PROSPECT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "title" TEXT,
    "routingRole" "ContactRoutingRole" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "leadId" TEXT,
    "mode" "ProposalMode" NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "exclusions" TEXT,
    "reportingYear" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "totalFee" DECIMAL(18,2) NOT NULL,
    "paymentTerms" TEXT NOT NULL DEFAULT '50/50',
    "timeline" TEXT,
    "state" "ProposalState" NOT NULL DEFAULT 'DRAFT',
    "dispatchedVia" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "acceptedRevision" INTEGER,
    "clientAcceptanceEvidenceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalLineItem" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProposalLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DualKeyGate" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "proposalId" TEXT,
    "key1Approved" BOOLEAN NOT NULL DEFAULT false,
    "key1ProposalRevision" INTEGER,
    "key1EvidenceRef" TEXT,
    "key1RecordedByUserId" TEXT,
    "key1RecordedAt" TIMESTAMP(3),
    "key2Approved" BOOLEAN NOT NULL DEFAULT false,
    "key2Decision" TEXT NOT NULL DEFAULT 'Pending',
    "key2DecisionByUserId" TEXT,
    "key2DecisionAt" TIMESTAMP(3),
    "key2DecisionNotes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DualKeyGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "proposalId" TEXT,
    "service" TEXT NOT NULL,
    "reportingYear" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "agreedFee" DECIMAL(18,2) NOT NULL,
    "letterTemplate" TEXT NOT NULL,
    "state" "EngagementState" NOT NULL DEFAULT 'LEAD_INGESTION',
    "lifecycleStatus" "LifecycleStatus" NOT NULL DEFAULT 'Active',
    "partnerUserId" TEXT NOT NULL,
    "managerUserId" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "preparerUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetFieldworkStart" TIMESTAMP(3),
    "targetDraftReport" TIMESTAMP(3),
    "targetFinalReport" TIMESTAMP(3),
    "advanceRequiredQar" DECIMAL(18,2),
    "advanceRecordedQar" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "advanceReceiptDocumentId" TEXT,
    "signatureDate" TIMESTAMP(3),
    "freezeDueDate" TIMESTAMP(3),
    "freezeStatus" TEXT NOT NULL DEFAULT 'Not Started',
    "frozenAt" TIMESTAMP(3),
    "frozenByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementStateTransition" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "fromState" "EngagementState" NOT NULL,
    "toState" "EngagementState" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" "RoleKey" NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementStateTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditTrailEntry" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "detail" TEXT,
    "previousHash" TEXT,
    "hash" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditTrailEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcceptanceScreening" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "track" "AcceptanceTrack" NOT NULL,
    "uboCompleted" BOOLEAN NOT NULL DEFAULT false,
    "amlKycCompleted" BOOLEAN NOT NULL DEFAULT false,
    "kycDocsRef" TEXT,
    "managementIntegrityAssessed" BOOLEAN NOT NULL DEFAULT false,
    "financialViabilityAssessed" BOOLEAN NOT NULL DEFAULT false,
    "independenceConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "conflictsCleared" BOOLEAN NOT NULL DEFAULT false,
    "priorYearFeesSettled" BOOLEAN,
    "managementChangesNoted" BOOLEAN,
    "newCreditFacilities" BOOLEAN,
    "litigationFlags" BOOLEAN,
    "fraudOrRegulatoryFindings" BOOLEAN,
    "riskRating" "RiskRating" NOT NULL,
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendedByUserId" TEXT NOT NULL,
    "recommendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recommendationNotes" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'Pending',
    "decisionByUserId" TEXT,
    "decisionAt" TIMESTAMP(3),
    "decisionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcceptanceScreening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialityRevision" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "benchmark" "MaterialityBenchmark" NOT NULL,
    "benchmarkValue" DECIMAL(18,2) NOT NULL,
    "materialityRate" DECIMAL(5,2) NOT NULL,
    "planningMateriality" DECIMAL(18,2) NOT NULL,
    "tolerableErrorRate" DECIMAL(5,2) NOT NULL,
    "tolerableError" DECIMAL(18,2) NOT NULL,
    "sadRate" DECIMAL(5,2) NOT NULL,
    "sadThreshold" DECIMAL(18,2) NOT NULL,
    "roundingApplied" BOOLEAN NOT NULL DEFAULT false,
    "computedPm" DECIMAL(18,2),
    "computedTe" DECIMAL(18,2),
    "roundingVariancePct" DECIMAL(5,2),
    "roundingSignOffUserId" TEXT,
    "roundingSignOffAt" TIMESTAMP(3),
    "rationale" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "supersededByRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialityRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAllocation" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chargeOutRole" "ChargeOutRole" NOT NULL,
    "phase" "EngagementPhase" NOT NULL,
    "plannedHours" DECIMAL(8,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "assignedByUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementFolder" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "folderKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "provisionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialBalanceRow" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "section" "StatementSection" NOT NULL,
    "fsliId" TEXT,
    "currentYear" DECIMAL(18,2) NOT NULL,
    "priorYear" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "mappingSource" TEXT,

    CONSTRAINT "TrialBalanceRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fsli" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "section" "StatementSection" NOT NULL,
    "currentYear" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "priorYear" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "riskStratum" TEXT,
    "riskReason" TEXT,
    "lockedByUserId" TEXT,
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "Fsli_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkProgram" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "fsliId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditProcedure" (
    "id" TEXT NOT NULL,
    "workProgramId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "assertions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adHoc" BOOLEAN NOT NULL DEFAULT false,
    "adHocReason" TEXT,
    "assignedToUserId" TEXT,
    "status" "ProcedureStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "workPerformed" TEXT,
    "conclusion" TEXT,
    "submittedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "clearedByUserId" TEXT,
    "clearedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AuditProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRef" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "documentId" TEXT,
    "physicalIndex" TEXT,
    "physicalBox" TEXT,
    "physicalShelf" TEXT,
    "description" TEXT NOT NULL,
    "linkedByUserId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SamplePlan" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "fsliId" TEXT NOT NULL,
    "method" "SamplingMethod" NOT NULL,
    "seed" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "populationCount" INTEGER NOT NULL,
    "populationValue" DECIMAL(18,2) NOT NULL,
    "selectedItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hits" JSONB NOT NULL DEFAULT '{}',
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SamplePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticalReview" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "fsliId" TEXT NOT NULL,
    "currentBalance" DECIMAL(18,2) NOT NULL,
    "priorBalance" DECIMAL(18,2) NOT NULL,
    "varianceAmount" DECIMAL(18,2) NOT NULL,
    "variancePct" DECIMAL(9,2),
    "commentary" TEXT NOT NULL,
    "goingConcernAssessed" BOOLEAN NOT NULL DEFAULT false,
    "goingConcernIndicators" BOOLEAN NOT NULL DEFAULT false,
    "goingConcernConclusion" TEXT,
    "goingConcernEvidenceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preparedByUserId" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticalReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewNote" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "raisedAgainstUserId" TEXT NOT NULL,
    "raisedByUserId" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "text" TEXT NOT NULL,
    "status" "ReviewNoteStatus" NOT NULL DEFAULT 'OPEN',
    "responseText" TEXT,
    "respondedAt" TIMESTAMP(3),
    "clearedByUserId" TEXT,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Confirmation" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "type" "ConfirmationType" NOT NULL,
    "counterparty" TEXT NOT NULL,
    "relatedFsliId" TEXT,
    "status" "ConfirmationStatus" NOT NULL DEFAULT 'DRAFT',
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "requestedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "responseDocumentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldingLetter" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedByUserId" TEXT NOT NULL,
    "blockingConfirmationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipientContactId" TEXT,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "HoldingLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SrmRecord" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "compiledByUserId" TEXT NOT NULL,
    "compiledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unadjustedDifferences" JSONB NOT NULL DEFAULT '[]',
    "totalUnadjusted" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ajes" JSONB NOT NULL DEFAULT '[]',
    "openRedRisks" JSONB NOT NULL DEFAULT '[]',
    "significantEstimates" JSONB NOT NULL DEFAULT '[]',
    "recommendation" TEXT NOT NULL,
    "partnerClearedByUserId" TEXT,
    "partnerClearedAt" TIMESTAMP(3),
    "partnerClearanceNotes" TEXT,

    CONSTRAINT "SrmRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpinionSelection" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "opinion" "OpinionValue" NOT NULL,
    "affectedFsliIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "basisRationale" TEXT NOT NULL,
    "selectedByUserId" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "signatureApplied" BOOLEAN NOT NULL DEFAULT false,
    "signatureAppliedAt" TIMESTAMP(3),
    "sealAssetKey" TEXT,
    "signatureAssetKey" TEXT,

    CONSTRAINT "OpinionSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableSet" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "opinionSelectionId" TEXT NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "deliveredToContactId" TEXT,
    "deliveryNotes" TEXT,

    CONSTRAINT "DeliverableSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableArtifact" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "part" "DeliverablePart" NOT NULL,
    "documentId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,

    CONSTRAINT "DeliverableArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveRecord" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "signatureDate" TIMESTAMP(3) NOT NULL,
    "freezeDueDate" TIMESTAMP(3) NOT NULL,
    "frozenAt" TIMESTAMP(3),
    "frozenByUserId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'Automatic',
    "manifestHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chargeOutRole" "ChargeOutRole" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "phase" "EngagementPhase" NOT NULL,
    "fsliId" TEXT,
    "narrative" TEXT NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmLedgerEntry" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirmLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmLedgerLineItem" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "account" "FirmAccount" NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "FirmLedgerLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "clientId" TEXT,
    "engagementId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesDocumentId" TEXT,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalInvitation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "firstLoginResetRequired" BOOLEAN NOT NULL DEFAULT true,
    "passwordResetAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PbcRequest" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedContactId" TEXT NOT NULL,
    "status" "PbcStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "rejectionReason" TEXT,
    "rejectedByUserId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,

    CONSTRAINT "PbcRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PbcUpload" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "uploadedByContactId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PbcUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_personId_idx" ON "User"("personId");

-- CreateIndex
CREATE INDEX "ClientAccessGrant_userId_clientId_idx" ON "ClientAccessGrant"("userId", "clientId");

-- CreateIndex
CREATE INDEX "ClientAccessGrant_userId_engagementId_idx" ON "ClientAccessGrant"("userId", "engagementId");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_parentClientId_idx" ON "Client"("parentClientId");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_active_idx" ON "ClientContact"("clientId", "active");

-- CreateIndex
CREATE INDEX "Proposal_clientId_state_idx" ON "Proposal"("clientId", "state");

-- CreateIndex
CREATE INDEX "ProposalLineItem_proposalId_idx" ON "ProposalLineItem"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "DualKeyGate_engagementId_key" ON "DualKeyGate"("engagementId");

-- CreateIndex
CREATE INDEX "Engagement_clientId_state_idx" ON "Engagement"("clientId", "state");

-- CreateIndex
CREATE INDEX "Engagement_state_idx" ON "Engagement"("state");

-- CreateIndex
CREATE INDEX "Engagement_partnerUserId_idx" ON "Engagement"("partnerUserId");

-- CreateIndex
CREATE INDEX "Engagement_managerUserId_idx" ON "Engagement"("managerUserId");

-- CreateIndex
CREATE INDEX "EngagementStateTransition_engagementId_at_idx" ON "EngagementStateTransition"("engagementId", "at");

-- CreateIndex
CREATE INDEX "AuditTrailEntry_engagementId_at_idx" ON "AuditTrailEntry"("engagementId", "at");

-- CreateIndex
CREATE INDEX "AuditTrailEntry_entityType_entityId_idx" ON "AuditTrailEntry"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AcceptanceScreening_engagementId_key" ON "AcceptanceScreening"("engagementId");

-- CreateIndex
CREATE INDEX "MaterialityRevision_engagementId_idx" ON "MaterialityRevision"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialityRevision_engagementId_revision_key" ON "MaterialityRevision"("engagementId", "revision");

-- CreateIndex
CREATE INDEX "StaffAllocation_engagementId_phase_idx" ON "StaffAllocation"("engagementId", "phase");

-- CreateIndex
CREATE INDEX "StaffAllocation_userId_idx" ON "StaffAllocation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementFolder_engagementId_folderKey_key" ON "EngagementFolder"("engagementId", "folderKey");

-- CreateIndex
CREATE INDEX "TrialBalanceRow_engagementId_sourceRevision_idx" ON "TrialBalanceRow"("engagementId", "sourceRevision");

-- CreateIndex
CREATE INDEX "TrialBalanceRow_accountCode_idx" ON "TrialBalanceRow"("accountCode");

-- CreateIndex
CREATE INDEX "Fsli_engagementId_idx" ON "Fsli"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "Fsli_engagementId_code_key" ON "Fsli"("engagementId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkProgram_engagementId_fsliId_key" ON "WorkProgram"("engagementId", "fsliId");

-- CreateIndex
CREATE INDEX "AuditProcedure_workProgramId_sortOrder_idx" ON "AuditProcedure"("workProgramId", "sortOrder");

-- CreateIndex
CREATE INDEX "EvidenceRef_procedureId_idx" ON "EvidenceRef"("procedureId");

-- CreateIndex
CREATE INDEX "SamplePlan_engagementId_fsliId_idx" ON "SamplePlan"("engagementId", "fsliId");

-- CreateIndex
CREATE INDEX "AnalyticalReview_engagementId_fsliId_idx" ON "AnalyticalReview"("engagementId", "fsliId");

-- CreateIndex
CREATE INDEX "ReviewNote_engagementId_status_idx" ON "ReviewNote"("engagementId", "status");

-- CreateIndex
CREATE INDEX "ReviewNote_procedureId_idx" ON "ReviewNote"("procedureId");

-- CreateIndex
CREATE INDEX "Confirmation_engagementId_status_idx" ON "Confirmation"("engagementId", "status");

-- CreateIndex
CREATE INDEX "HoldingLetter_engagementId_idx" ON "HoldingLetter"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "SrmRecord_engagementId_revision_key" ON "SrmRecord"("engagementId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "OpinionSelection_engagementId_revision_key" ON "OpinionSelection"("engagementId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableSet_engagementId_revision_key" ON "DeliverableSet"("engagementId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableArtifact_deliverableId_part_key" ON "DeliverableArtifact"("deliverableId", "part");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveRecord_engagementId_key" ON "ArchiveRecord"("engagementId");

-- CreateIndex
CREATE INDEX "TimeEntry_engagementId_date_idx" ON "TimeEntry"("engagementId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_date_idx" ON "TimeEntry"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FirmLedgerEntry_reference_key" ON "FirmLedgerEntry"("reference");

-- CreateIndex
CREATE INDEX "FirmLedgerLineItem_entryId_idx" ON "FirmLedgerLineItem"("entryId");

-- CreateIndex
CREATE INDEX "Document_engagementId_category_idx" ON "Document"("engagementId", "category");

-- CreateIndex
CREATE INDEX "Document_clientId_category_idx" ON "Document"("clientId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "PortalInvitation_tokenHash_key" ON "PortalInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalInvitation_clientId_contactId_idx" ON "PortalInvitation"("clientId", "contactId");

-- CreateIndex
CREATE INDEX "PbcRequest_engagementId_status_idx" ON "PbcRequest"("engagementId", "status");

-- CreateIndex
CREATE INDEX "PbcRequest_assignedContactId_idx" ON "PbcRequest"("assignedContactId");

-- CreateIndex
CREATE INDEX "PbcUpload_requestId_idx" ON "PbcUpload"("requestId");

-- AddForeignKey
ALTER TABLE "ClientAccessGrant" ADD CONSTRAINT "ClientAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAccessGrant" ADD CONSTRAINT "ClientAccessGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAccessGrant" ADD CONSTRAINT "ClientAccessGrant_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedClientId_fkey" FOREIGN KEY ("convertedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_parentClientId_fkey" FOREIGN KEY ("parentClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalLineItem" ADD CONSTRAINT "ProposalLineItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DualKeyGate" ADD CONSTRAINT "DualKeyGate_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DualKeyGate" ADD CONSTRAINT "DualKeyGate_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementStateTransition" ADD CONSTRAINT "EngagementStateTransition_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditTrailEntry" ADD CONSTRAINT "AuditTrailEntry_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditTrailEntry" ADD CONSTRAINT "AuditTrailEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcceptanceScreening" ADD CONSTRAINT "AcceptanceScreening_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialityRevision" ADD CONSTRAINT "MaterialityRevision_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAllocation" ADD CONSTRAINT "StaffAllocation_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementFolder" ADD CONSTRAINT "EngagementFolder_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialBalanceRow" ADD CONSTRAINT "TrialBalanceRow_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialBalanceRow" ADD CONSTRAINT "TrialBalanceRow_fsliId_fkey" FOREIGN KEY ("fsliId") REFERENCES "Fsli"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fsli" ADD CONSTRAINT "Fsli_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProgram" ADD CONSTRAINT "WorkProgram_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProgram" ADD CONSTRAINT "WorkProgram_fsliId_fkey" FOREIGN KEY ("fsliId") REFERENCES "Fsli"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditProcedure" ADD CONSTRAINT "AuditProcedure_workProgramId_fkey" FOREIGN KEY ("workProgramId") REFERENCES "WorkProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditProcedure" ADD CONSTRAINT "AuditProcedure_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRef" ADD CONSTRAINT "EvidenceRef_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "AuditProcedure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRef" ADD CONSTRAINT "EvidenceRef_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplePlan" ADD CONSTRAINT "SamplePlan_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplePlan" ADD CONSTRAINT "SamplePlan_fsliId_fkey" FOREIGN KEY ("fsliId") REFERENCES "Fsli"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticalReview" ADD CONSTRAINT "AnalyticalReview_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticalReview" ADD CONSTRAINT "AnalyticalReview_fsliId_fkey" FOREIGN KEY ("fsliId") REFERENCES "Fsli"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "AuditProcedure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_clearedByUserId_fkey" FOREIGN KEY ("clearedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Confirmation" ADD CONSTRAINT "Confirmation_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Confirmation" ADD CONSTRAINT "Confirmation_responseDocumentId_fkey" FOREIGN KEY ("responseDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingLetter" ADD CONSTRAINT "HoldingLetter_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingLetter" ADD CONSTRAINT "HoldingLetter_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SrmRecord" ADD CONSTRAINT "SrmRecord_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpinionSelection" ADD CONSTRAINT "OpinionSelection_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableSet" ADD CONSTRAINT "DeliverableSet_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableSet" ADD CONSTRAINT "DeliverableSet_opinionSelectionId_fkey" FOREIGN KEY ("opinionSelectionId") REFERENCES "OpinionSelection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableArtifact" ADD CONSTRAINT "DeliverableArtifact_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "DeliverableSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableArtifact" ADD CONSTRAINT "DeliverableArtifact_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveRecord" ADD CONSTRAINT "ArchiveRecord_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmLedgerLineItem" ADD CONSTRAINT "FirmLedgerLineItem_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FirmLedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalInvitation" ADD CONSTRAINT "PortalInvitation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalInvitation" ADD CONSTRAINT "PortalInvitation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PbcRequest" ADD CONSTRAINT "PbcRequest_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PbcRequest" ADD CONSTRAINT "PbcRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PbcRequest" ADD CONSTRAINT "PbcRequest_assignedContactId_fkey" FOREIGN KEY ("assignedContactId") REFERENCES "ClientContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PbcUpload" ADD CONSTRAINT "PbcUpload_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PbcRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PbcUpload" ADD CONSTRAINT "PbcUpload_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
