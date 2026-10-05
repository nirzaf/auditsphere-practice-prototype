# Current workflow and lifecycle matrix

Generated from `src/services/routeCatalog.ts`, `src/services/currentWorkflowGuides.ts`, and `src/services/lifecycles.ts`.
This matrix describes only the current five-module AuditSphere route surface; it does not enumerate retired product modules.

| Module | Current route | Workflow / view | Current lifecycle records | Roles with route access | Guidance steps |
|---|---|---|---|---|---|
| Module 1 — Commercial & CRM | `overview` | Lifecycle Overview | Consolidation elimination, Consolidation output package, Simulated invitation | preparer, reviewer, partner | Review permitted portfolio and current lifecycle status. Select a scoped client or engagement to continue. |
| Module 1 — Commercial & CRM | `clients` | Client Profiles | Client | partner | Find or create the correct legal entity and verify its contacts. Open the client profile; do not merge distinct entities by similar names. |
| Module 1 — Commercial & CRM | `client-detail` | Client Profile | Projection / reference | partner | Review the legal entity, active contacts and relationship owner. Use the current engagement links without widening client or engagement scope. |
| Module 1 — Commercial & CRM | `acquisition` | Lead Ingestion | Lead / opportunity | No product persona | Validate the legal entity and a reachable contact. Record intake, owner and next action; convert the opportunity with traceable references. |
| Module 1 — Commercial & CRM | `proposals` | Quotes & Proposals | Proposal | partner | Prepare, independently approve, present and dispatch the current proposal revision. Capture client acceptance; pin exact engagement service, period, currency and fee. |
| Module 1 — Commercial & CRM | `engagements` | Engagement Letter | Engagement | preparer, reviewer, partner | Complete both commercial and professional acceptance keys. Prepare the EL as Manager; the assigned Partner issues it with actual period and deadline. |
| Module 1 — Commercial & CRM | `billing` | 50% Advance Invoice & Receipt | Invoice, Credit note | partner | Inspect the issued unpaid advance invoice. Record effective 50% settlement once; generate or retry its receipt and simulated onboarding. |
| Module 2 — Governance & Planning | `onboarding` | Acceptance / Continuance | Acceptance / continuance case | partner | Complete acceptance/continuance and independent assigned-Partner approval. Inspect the automatic five-folder workspace and simulated liaison invitation. |
| Module 2 — Governance & Planning | `documents` | Engagement Directory / PBC Workspace | Client request (PBC), Microsoft 365 simulation | preparer, reviewer, partner | Review engagement document requests, sharing status and responses. Upload or replace a scoped client file; retain its review history. |
| Module 2 — Governance & Planning | `trial-balance` | Trial Balance Ingestion & Mapping | Reconciliation schedule, Account mapping revision | preparer, reviewer, partner | Upload CSV/XLSX and inspect signed balances and source digest. Retain source bytes, approve the current mapping and reconfirm planning after replacement. |
| Module 2 — Governance & Planning | `audit-planning` | Materiality & Planning | Audit plan | preparer, reviewer, partner | Import and approve mapping for the current balanced TB. Derive benchmark and explain normalization; assign milestones and obtain assigned-Partner plan approval. |
| Module 2 — Governance & Planning | `scheduling` | Resource Scheduling | Job / task, Budget | preparer, reviewer, partner | Allocate staff by phase with captured role rates, dates, capacity and leave. Resolve overlapping capacity before saving; assignments do not confer permissions. |
| Module 3 — Technical Fieldwork | `financial-statements` | Split P&L / Balance Sheet Dashboard | Statement set / cash-flow schedule revision | preparer, reviewer, partner | Inspect mapped P&L and Balance Sheet lines and shared FSLI risk. Open the exact substantive program or record a distinct Analytical Review and Going Concern conclusion. |
| Module 3 — Technical Fieldwork | `audit-risks` | Workprograms & Evidence | Job template, Audit procedure, Audit program template | preparer, reviewer, partner | Execute the assigned Green, Amber or Red procedures in the FSLI workpaper. Link current adequate evidence and submit; resolve returned rows before independent clearance. |
| Module 3 — Technical Fieldwork | `audit-fieldwork` | Workprograms & Evidence | Projection / reference | preparer, reviewer, partner | Open only assigned procedures for the selected engagement. Link current adequate evidence and submit the exact workpaper revision for review. |
| Module 3 — Technical Fieldwork | `sampling` | Sampling | Sample population | preparer, reviewer, partner | Reconcile the complete source population to the current TB control account. Select reproducible samples; record tests and current Digital, Physical or Hybrid evidence. |
| Module 3 — Technical Fieldwork | `confirmations` | External Confirmations | Projection / reference | preparer, reviewer, partner | Create scoped Bank, AR, AP, Inventory or Legal confirmations. Record outcomes/evidence; unresolved critical items generate a Holding Letter and block release. |
| Module 3 — Technical Fieldwork | `evidence` | Evidence | Evidence item | preparer, reviewer, partner | Inspect evidence scope, source and current revision. Link adequate current evidence to a procedure without exposing internal work to clients. |
| Module 3 — Technical Fieldwork | `findings` | Findings & Differences | Adjustment journal, Finding / difference | preparer, reviewer, partner | Quantify differences and propose balanced AJEs using current TB accounts. Obtain independent review; record evidenced management correspondence and current-source reflection without double adjustment. |
| Module 3 — Technical Fieldwork | `reviews` | Review / SRM | Workpaper, Review point, Engagement approval (manager / client / partner / EQR) | preparer, reviewer, partner | Clear applicable workpapers independently and resolve blocking findings. Record meaningful Manager clearance; inspect or retry the current SRM and obtain assigned-Partner approval. |
| Module 4 — Reporting & Archive | `delivery` | Audit Opinion & 5-Part Bundle | Disclosure, Financial package revision, Release candidate / release | partner | Choose a justified Partner opinion and compile the current exact five-part bundle. Attach management-signed LOR; release the current bundle and inspect its linked final invoice. |
| Module 4 — Reporting & Archive | `records` | 60-Day File Completion / Archive | Archive record | partner | Inspect effective report-date plus 60-day closure or assigned-Partner early lock. Download scoped records and verified archived originals; inspect missing-byte exceptions separately. |
| Module 5 — Practice Management | `my-time` | Daily Engagement / FSLI Time | Time entry | preparer, reviewer, partner | Record time against the intended engagement and assigned task. Inspect review state and historically captured rates before reporting. |
| Module 5 — Practice Management | `reports` | Profitability & Utilization | Projection / reference | partner | Compare budget and recorded time using historically captured rates. Inspect realization, cost and utilization; missing inputs remain Unknown. |
| Module 5 — Practice Management | `practice-ledger` | Internal Firm Ledger / TB / P&L / AR Aging | Projection / reference | partner | Record dated firm expenses and Partner withdrawals. Reconcile monthly TB/P&L and month-end AR using the common invoice/receipt/reversal projection. |
| Client Portal | `portal` | PBC Client Portal | Projection / reference | partner, client | Complete the simulated first-login reset and upload requested files. Review rejection reasons and replace evidence; inspect issued invoices and released files within engagement scope. |
| Reference / Specification | `requirements` | Functional Requirements | Projection / reference | preparer, reviewer, partner, client | Review documented scope, assumptions and acceptance evidence. Return to an operational route; the specification itself is not a workflow action. |
| Reference / Specification | `client-requirements` | Requirements Presentation | Projection / reference | preparer, reviewer, partner, client | Review the shared specification with the client view in mind. Return to an operational route; this presentation does not change business state. |
| Reference / Specification | `role-guide` | Role Guide | Projection / reference | No product persona | Confirm the active persona and its permitted scope. Follow the role-specific next action; restricted routes stay out of reach by design. |
| Reference / Specification | `module-guide` | Module Guide & Tour | Projection / reference | preparer, reviewer, partner, client | Open the current module tour for the active route. Follow the single workflow-guide model; no historical module content is consulted. |

## Lifecycle transitions

### Lead / opportunity (`lead`) · Lead Ingestion

Current route: `acquisition`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Inquiry | Discovery / Evaluation / Proposal | `updateLead` | Relationship lead |  |
| Any open stage | Lost / Unqualified | `updateLead` | Relationship lead | A reason is required; excluded from open pipeline totals |
| Proposal | Won | `convertLead` | Relationship lead | Creates one Prospect client; never grants access or professional acceptance |

### Client (`client`) · Client Profiles

Current route: `clients`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Prospect | Active | `updateClient` | Relationship lead / manager | Stale profile revision rejected |
| Active | Archived | `updateClient` | Manager | Soft archive; history retained |

### Proposal (`proposal`) · Quotes & Proposals

Current route: `proposals`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Internal review | `updateProposal` | Relationship lead |  |
| Internal review | Approved to send | `reviewProposal` | Independent reviewer | Reviewer must differ from the preparer |
| Internal review | Draft (returned) | `reviewProposal` | Independent reviewer | Return note required |
| Approved to send | Presented | `presentProposal` | Relationship lead | Presented snapshot pinned to the revision |
| Presented | Accepted / Declined / Withdrawn | `recordProposalResponse` | Client management (manual record) | Response must reference the presented revision; a manual record, never an electronic signature |
| Any unaccepted | Superseded | `createProposalRevision` | Relationship lead | Prior revision kept in history |

**Rework:** A returned proposal goes back to Draft with the review note retained.
**Amend / reopen:** createProposalRevision creates a new Draft revision; the old one becomes Superseded.

### Engagement (`engagement`) · Engagement Letter

Current route: `engagements`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft (not activated) | Active | `activateEngagement` | Partner / manager | Separate professional acceptance with evidence |
| Active | Suspended / Cancelled / Closed | `setEngagementLifecycle` | Partner / manager | Reason required; Cancelled and Closed are terminal |

### Acceptance / continuance case (`acceptance`) · Acceptance / Continuance

Current route: `onboarding`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Pending | `saveAcceptanceCase` | Manager |  |
| Pending | Accepted / Declined | `decideAcceptanceCase` | Partner | Decision maker must differ from the recommender |
| Prior year | Continuance draft | `createContinuanceDraft` | Manager |  |

### Job / task (`job`) · Resource Scheduling

Current route: `scheduling`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Not started | In progress / Blocked | `updateTask` | Assignee / manager | Blocked requires a reason |
| In progress | Completed | `updateTask` | Assignee / manager | A parent cannot complete while a required child is open |
| Any open | Cancelled | `updateJob` | Manager | Cancelled jobs cannot be reopened |
| Any open | Reassigned | `reassignTask` | Manager | Reason required; assignment never grants approval authority |

### Job template (`job-template`) · Workprograms & Evidence

Current route: `audit-risks`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Published | `publishJobTemplate` | Manager |  |
| Published | Draft revision | `createJobTemplateRevision` | Manager | Existing jobs keep their pinned revision |
| Published | Retired | `retireJobTemplate` | Manager |  |
| Published | Job created | `applyJobTemplate` | Manager | Idempotent per operation; Draft/Retired cannot instantiate |

### Client request (PBC) (`pbc`) · Engagement Directory / PBC Workspace

Current route: `documents`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Requested | `presentPbcRequest` | Preparer / manager |  |
| Requested / Needs clarification | Received | `uploadPbcResponse` | Client finance contributor | Bytes persisted in browser IndexedDB with digest |
| Received | Needs clarification | `requestPbcClarification` | Preparer / reviewer | Clarification note required |
| Received | Accepted | `acceptPbcResponse` | Preparer / reviewer |  |
| Any open | Cancelled | `cancelPbcRequest` | Preparer / manager | Reason required |

**Rework:** The client replaces the file; the replacement needs staff re-review.

### Time entry (`time`) · Daily Engagement / FSLI Time

Current route: `my-time`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Submitted | `addTimeEntry` | Time owner | A persona records time only for itself |
| Submitted | Approved / Returned | `reviewTimeEntry` | Manager / reviewer / partner | Cannot approve own time; return reason required |
| Returned | Superseded + new Submitted revision | `resubmitReturnedTime` | Time owner |  |
| Approved | Superseded + corrected revision | `correctApprovedTime` | Manager | Reason required |

**Rework:** Only the time owner can resubmit; the returned entry becomes Superseded.

### Budget (`budget`) · Resource Scheduling

Current route: `scheduling`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Approved (new version) | `updateBudget` | Manager / partner | Each change creates a new version; missing cost rate stays Unknown |

### Invoice (`invoice`) · 50% Advance Invoice & Receipt

Current route: `billing`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `addInvoice` | Billing / manager / partner | Lines must come from approved time or an accepted fixed-fee proposal |
| Draft | Approved | `reviewInvoice` | Billing / manager / partner | Independent of the preparer |
| Draft | Draft (returned) | `reviewInvoice` | Billing / manager / partner | Return note required |
| Draft / Approved | Draft (next revision) | `reviseInvoiceDraft` | Billing / manager / partner | Reason required; prior approval retained in history |
| Approved | Issued | `issueInvoice` | Billing / manager / partner | Only the current reviewed revision; issuer differs from reviewer; no payment demand is sent |
| Issued | Paid | `allocateReceipt` | Billing | Offline receipt allocation only |
| Draft | Cancelled | `cancelInvoiceDraft` | Billing / manager / partner | Releases billed time sources |

**Rework:** A returned invoice stays in Draft with the reviewer note until revised.
**Amend / reopen:** Issued invoices are corrected with credit notes, never edited.

### Credit note (`credit-note`) · 50% Advance Invoice & Receipt

Current route: `billing`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `addCreditNote` | Billing / manager / partner |  |
| Draft | Approved / Draft (returned) | `reviewCreditNote` | Independent reviewer |  |
| Draft | Draft (revised) | `reviseCreditNote` | Billing |  |
| Approved | Issued | `issueCreditNote` | Billing / manager / partner |  |

### Adjustment journal (`adjustment`) · Findings & Differences

Current route: `findings`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `addAdjustmentJournal` | Preparer | Balanced lines; support may pin evidence/workpaper/finding revisions |
| Draft | Technical review / Rejected | `reviewAdjustmentJournal` | Independent reviewer |  |
| Technical review | Management accepted / Rejected | `recordAdjustmentManagementDecision` | Client management (recorded) |  |
| Management accepted | Reporting included | `markAdjustmentJournalReportingIncluded` | Preparer / manager |  |
| Any | Draft (amended revision) | `amendAdjustmentJournal` | Preparer | Reason required; prior review retained |

**Staleness:** A pinned evidence, workpaper or finding revision that moves excludes the journal from statements and packages until re-pinned and re-reviewed.

### Reconciliation schedule (`reconciliation`) · Trial Balance Ingestion & Mapping

Current route: `trial-balance`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft / Returned | In Review | `saveReconciliationSchedule` | Preparer |  |
| In Review | Approved / Returned | `reviewReconciliationSchedule` | Independent reviewer | Return note required |

**Rework:** Returned schedules are revised and resubmitted as a new revision.
**Staleness:** A new TB source revision marks the schedule Stale; the prior review stays in history.

### Account mapping revision (`mapping`) · Trial Balance Ingestion & Mapping

Current route: `trial-balance`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `saveAccountMappings` | Preparer |  |
| Draft | Approved | `approveAccountMappings` | Independent reviewer | Every TB account must be mapped |

**Staleness:** A new mapping revision stales statement sets, cash-flow schedules and packages pinned to the old one.

### Statement set / cash-flow schedule revision (`statement-set`) · Split P&L / Balance Sheet Dashboard

Current route: `financial-statements`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `saveStatementSetRevision` | Preparer | Earlier revisions become Stale |
| Draft | Reviewed | `reviewStatementSetRevision` | Independent reviewer |  |
| New | Draft | `saveCashFlowSchedule` | Preparer |  |
| Draft | Reviewed | `reviewCashFlowSchedule` | Independent reviewer |  |

**Staleness:** TB source, mapping, layout or comparative changes mark revisions Stale.

### Disclosure (`disclosure`) · Audit Opinion & 5-Part Bundle

Current route: `delivery`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Draft (saved revision) | `saveDisclosureReview` | Preparer / manager |  |
| Draft | Reviewed | `reviewDisclosure` | Reviewer / partner / EQR | Independent of the preparer |

### Financial package revision (`package`) · Audit Opinion & 5-Part Bundle

Current route: `delivery`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Current source | Assembled (exact XLSX/DOCX/PDF) | `saveFinancialPackageRevision` | Manager / preparer |  |
| Validated | Presented | `presentManagementPackage` | Manager |  |
| Presented | Acknowledged / Rejected | `recordManagementPackageDecision` | Client management (recorded) |  |
| Approved | Release candidate | `prepareReleaseCandidate` | Manager / partner |  |

**Staleness:** TB source, GL source, mapping or generation changes stale the package; earlier revisions and approvals remain in history.

### Consolidation elimination (`consolidation-elimination`) · Lifecycle Overview

Current route: `overview`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `saveConsolidationElimination` | Preparer | Reason required |
| Draft | Submitted | `submitConsolidationElimination` | Preparer |  |
| Submitted | Approved / Returned | `reviewConsolidationElimination` | Independent reviewer | Note and evidence required |

**Rework:** Returned eliminations are corrected and resubmitted.
**Staleness:** Perimeter or FX changes return eliminations to Draft.

### Consolidation output package (`consolidation-output`) · Lifecycle Overview

Current route: `overview`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `saveConsolidationOutputPackage` | Preparer / manager |  |
| Draft | Approved / Returned | `reviewConsolidationOutputPackage` | Independent reviewer |  |
| Any | Perimeter revision | `revertConsolidationPerimeter` | Manager | Reason required |

**Rework:** A returned output package is corrected and saved again.

### Audit plan (`audit-plan`) · Materiality & Planning

Current route: `audit-planning`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Under review | `saveAuditPlan` | Manager / preparer | Each save is a new version |
| Under review | Approved / Draft (returned) | `reviewAuditPlan` | Manager / partner | Independent of the preparer |
| Approved | Superseded | `updateAuditRisk` | Manager | A risk change reopens planning as a new version |

### Audit procedure (`audit-procedure`) · Workprograms & Evidence

Current route: `audit-risks`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Not started | In progress | `updateAuditProcedureExecution` | Preparer |  |
| In progress | Submitted / Cleared / Exceptions noted | `updateAuditProcedureStatus` | Preparer / reviewer | Reason required for exceptions |

**Rework:** Exceptions route to findings; evidence changes reopen the procedure.
**Staleness:** Evidence adequacy, evidence links or risk changes return Submitted/Cleared procedures to In progress.

### Audit program template (`audit-program-template`) · Workprograms & Evidence

Current route: `audit-risks`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `createAuditProgramTemplate` | Manager |  |
| Draft | Published | `publishAuditProgramTemplate` | Manager |  |
| Published | Retired | `retireAuditProgramTemplate` | Manager |  |

### Sample population (`sample`) · Sampling

Current route: `sampling`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Population | Replaced source | `replaceSamplePopulationSource` | Preparer | Digest recorded; prior selection retained |
| Imported | Selected | `setSampleItemSelected` | Preparer | Rationale for manual selection |
| Selected | Tested | `recordSampleItemTest` | Preparer |  |
| Tested | Reviewed | `reviewSampleSelection` | Independent reviewer |  |
| Exception | Finding linked | `linkSampleExceptionToFinding` | Preparer |  |

### Workpaper (`workpaper`) · Review / SRM

Current route: `reviews`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Planned | In progress | `updateWorkpaper` | Assigned preparer |  |
| In progress | Submitted | `submitWorkpaper` | Assigned preparer | Scope, work, conclusion, current workbook and adequate current evidence required |
| Submitted | Cleared | `clearWorkpaper` | Assigned reviewer | Reviewer differs from preparer; exact submitted revision only |
| Any | Changes required | `replaceDocumentRevision` | System consequence | A newer evidence revision invalidates the submission |
| Any | Not applicable | `updateWorkpaper` | Senior role | Rationale required; blocked by unresolved findings |

**Rework:** Evidence or document changes require rework and a fresh submission.
**Staleness:** New evidence revisions or inadequate evidence set Changes required and reopen review notes.

### Review point (`review-note`) · Review / SRM

Current route: `reviews`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Open | `addReviewNote` | Manager / reviewer / partner / EQR |  |
| Open / Reopened | Responded | `respondReviewNote` | Assignee |  |
| Responded | Cleared / Reopened | `clearReviewNote` | Author / reviewer | Responders cannot clear their own query; stale subject reopens |
| Open | Reassigned | `reassignReviewNote` | Manager | Reason required |

**Rework:** Reopened when the subject changes or the response is insufficient.

### Evidence item (`evidence`) · Evidence

Current route: `evidence`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Pending verification | Adequate / Deficient | `setEvidenceAdequacy` | Reviewer | Rationale required; linked procedures reopen |
| Any | Linked / Unlinked procedure | `linkEvidenceProcedure` | Preparer |  |

### Finding / difference (`finding`) · Findings & Differences

Current route: `findings`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Uncorrected | `addFinding` | Preparer / reviewer |  |
| Any | Next disposition | `setFindingDisposition` | Manager / partner | Rationale required; disposition history retained |

### Release candidate / release (`release`) · Audit Opinion & 5-Part Bundle

Current route: `delivery`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Gates cleared | Candidate | `prepareReleaseCandidate` | Manager / partner | evaluateReleaseReadiness must pass |
| Candidate | Released | `issueRelease` | Partner | Dispatch is simulated; no email is sent |
| Released | Amendment draft | `reopenReleaseForAmendment` | Partner | Reason required; prior release kept as predecessor |
| Released | Archived | `archiveEngagement` | Records | Logical archive index only; not production retention |

**Amend / reopen:** reopenReleaseForAmendment → prepareAmendedRelease produces an amended release that references its predecessor.

### Engagement approval (manager / client / partner / EQR) (`approval`) · Review / SRM

Current route: `reviews`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Pending | Approved (bound to generation) | `recordApproval` | Manager / client / partner / EQR | Each approver independent of the preparer; approvals bind to the current generation |
| Pending | EQR assigned | `assignEqrReviewer` | Partner | Reason required |
| Open | Concern raised / resolved | `addEqrConcern` | EQR |  |

**Staleness:** Any change to the engagement generation leaves prior approvals in history but no longer current.

### Archive record (`archive`) · 60-Day File Completion / Archive

Current route: `records`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Released | Archived | `archiveEngagement` | Records | Retention date / hold recorded as demo metadata only |
| Archived | Handover recorded | `recordArchiveHandover` | Records | Requester and reason required |

### Simulated invitation (`invitation`) · Lifecycle Overview

Current route: `overview`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Pending | `sendSimulatedInvitation` | Administrator | Simulated — no email is sent |
| Pending | Accepted | `acceptSimulatedInvitation` | Invitee (simulated) |  |
| Pending | Revoked | `revokeSimulatedInvitation` | Administrator | Reason required |
| Expired | Pending | `resendSimulatedInvitation` | Administrator |  |

### Microsoft 365 simulation (`m365`) · Engagement Directory / PBC Workspace

Current route: `documents`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Not configured | Simulated verified / Simulated error | `updateFirmSettings` | Administrator | liveConnected is always false; no OAuth or Graph calls |
