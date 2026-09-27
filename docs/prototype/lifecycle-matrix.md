# AuditSphere Visual Prototype — Lifecycle Matrix

`docs/prototype/lifecycle-matrix.md` · **generated** by `npx tsx tools/lifecycle-matrix.ts` from
`src/services/lifecycles.ts` — do not edit by hand. `tests/unit/enterpriseUx.test.ts` verifies that every
named command exists on `prototypeStore` and that every status literal of each typed record is placed in its
lifecycle; `tests/unit/docsContract.test.ts` fails if this file is out of date.

Scope: browser-only synthetic prototype. Transitions are the store commands that exist today; nothing here
describes production workflow, automation or scheduling. Segregation-of-duties rules are enforced by
`src/services/guards.ts` (`requireIndependentActor`), and the reserved superuser only records
`Prototype Superuser Override` events — it is never independence evidence.

## Summary

| Lifecycle | Record | Module / route | Main path | Rework | Blocked / stale | Terminal |
|---|---|---|---|---|---|---|
| `lead` | Lead / opportunity | Leads & Opportunities · `acquisition` | Inquiry → Discovery → Evaluation → Proposal → Won | — | — | Lost, Unqualified |
| `client` | Client | CRM & Client Management · `clients` | Prospect → Active | — | Suspended | Archived |
| `proposal` | Proposal | Proposals & Terms · `proposals` | Draft → Internal review → Approved to send → Presented → Accepted | (Draft + return note) → Draft | — | Declined, Withdrawn, Superseded |
| `engagement` | Engagement | Engagements · `engagements` | Active → Closed | — | Suspended | Cancelled |
| `acceptance` | Acceptance / continuance case | Acceptance & KYC · `onboarding` | Recommendation → Decision | — | — | Declined |
| `job` | Job / task | Jobs & Tasks · `jobs` | Not started → In progress → Completed | — | Blocked | Cancelled |
| `job-template` | Job template | Job Templates · `job-templates` | Draft → Published | — | — | Retired |
| `pbc` | Client request (PBC) | Documents & PBC · `documents` | Draft → Requested → Received → Accepted | Needs clarification → Requested | — | Cancelled |
| `time` | Time entry | Time Tracking · `my-time` | Draft → Submitted → Approved | Returned → Submitted | — | Superseded |
| `budget` | Budget | Budgets & Variances · `budgets` | Draft → Approved | — | — | — |
| `invoice` | Invoice | Billing & Invoices · `billing` | Draft → In review → Approved → Issued → Paid | (Draft + return note) → Draft | — | Cancelled |
| `credit-note` | Credit note | Billing & Invoices · `billing` | Draft → Approved → Issued | — | — | — |
| `adjustment` | Adjustment journal | Accounting Workbench · `adjustments` | Draft → Technical review → Management accepted → Reporting included | — | — | Rejected |
| `reconciliation` | Reconciliation schedule | Accounting Workbench · `reconciliations` | Draft → In review → Approved | Returned, Differences noted → Draft | Stale | — |
| `mapping` | Account mapping revision | Accounting Workbench · `account-mappings` | Draft → Approved | — | — | — |
| `statement-set` | Statement set / cash-flow schedule revision | Financial Statements · `financial-statements` | Draft → Reviewed | — | Stale | — |
| `disclosure` | Disclosure | Financial Packages · `financial-packages` | Draft → Reviewed | — | — | — |
| `package` | Financial package revision | Financial Packages · `financial-packages` | Assembled → Validated → Presented to management → Management decision → Released | — | Validation blocked, Stale | Rejected |
| `consolidation-elimination` | Consolidation elimination | Group Consolidation · `consolidation` | Draft → Submitted → Approved | Returned → Draft | — | — |
| `consolidation-output` | Consolidation output package | Group Consolidation · `consolidation` | Draft → Approved | Returned → Draft | Pending, Stale | — |
| `audit-plan` | Audit plan | Audit Planning & Materiality · `audit-planning` | Draft → Under review → Approved | — | — | Superseded |
| `audit-procedure` | Audit procedure | Risks & Audit Programs · `audit-risks` | Not started → In progress → Submitted → Cleared | Exceptions noted, Exception noted → In progress | — | — |
| `audit-program-template` | Audit program template | Risks & Audit Programs · `audit-risks` | Draft → Published | — | — | Retired |
| `sample` | Sample population | Sampling & Populations · `sampling` | Population imported → Items selected → Items tested → Selection reviewed | — | Stale | — |
| `workpaper` | Workpaper | Audit Workpapers · `audit` | Planned → In progress → Submitted → Cleared | Changes required → In progress | — | Not applicable |
| `review-note` | Review point | Review Desk · `reviews` | Open → Responded → Cleared | Reopened → Open | — | — |
| `evidence` | Evidence item | Evidence Catalogue · `evidence` | Pending verification → Adequate | — | Deficient, Inadequate | — |
| `finding` | Finding / difference | Findings & Differences · `findings` | Uncorrected → Proposed for correction → Resolved | — | — | Waived as immaterial, Uncorrected waived |
| `release` | Release candidate / release | Release & Completion · `delivery` | Gates cleared → Candidate prepared → Released → Archived | — | Blocked, Stale | — |
| `approval` | Engagement approval (manager / client / partner / EQR) | Sign-offs & EQR · `approvals` | Manager → Client management → Partner → EQR (when required) | — | Stale | — |
| `archive` | Archive record | Records & Archive · `records` | Archived → Handover recorded | — | — | — |
| `invitation` | Simulated invitation | Firm Administration · `administration` | Pending → Accepted | — | — | Expired, Revoked |
| `m365` | Microsoft 365 simulation | Microsoft 365 Setup · `m365-setup` | Not configured → Simulated verified | — | Simulated error | Disconnected |

## Transitions by lifecycle

### Lead / opportunity (`lead`)

Module: Leads & Opportunities · route `acquisition`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Inquiry | Discovery / Evaluation / Proposal | `updateLead` | Relationship lead | — |
| Any open stage | Lost / Unqualified | `updateLead` | Relationship lead | A reason is required; excluded from open pipeline totals |
| Proposal | Won | `convertLead` | Relationship lead | Creates one Prospect client; never grants access or professional acceptance |

### Client (`client`)

Module: CRM & Client Management · route `clients`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Prospect | Active | `updateClient` | Relationship lead / manager | Stale profile revision rejected |
| Active | Archived | `updateClient` | Manager | Soft archive; history retained |

### Proposal (`proposal`)

Module: Proposals & Terms · route `proposals`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Internal review | `updateProposal` | Relationship lead | — |
| Internal review | Approved to send | `reviewProposal` | Independent reviewer | Reviewer must differ from the preparer |
| Internal review | Draft (returned) | `reviewProposal` | Independent reviewer | Return note required |
| Approved to send | Presented | `presentProposal` | Relationship lead | Presented snapshot pinned to the revision |
| Presented | Accepted / Declined / Withdrawn | `recordProposalResponse` | Client management (manual record) | Response must reference the presented revision; a manual record, never an electronic signature |
| Any unaccepted | Superseded | `createProposalRevision` | Relationship lead | Prior revision kept in history |

**Rework:** A returned proposal goes back to Draft with the review note retained.
**Amend / reopen:** createProposalRevision creates a new Draft revision; the old one becomes Superseded.

### Engagement (`engagement`)

Module: Engagements · route `engagements`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft (not activated) | Active | `activateEngagement` | Partner / manager | Separate professional acceptance with evidence |
| Active | Suspended / Cancelled / Closed | `setEngagementLifecycle` | Partner / manager | Reason required; Cancelled and Closed are terminal |

### Acceptance / continuance case (`acceptance`)

Module: Acceptance & KYC · route `onboarding`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Pending | `saveAcceptanceCase` | Manager | — |
| Pending | Accepted / Declined | `decideAcceptanceCase` | Partner | Decision maker must differ from the recommender |
| Prior year | Continuance draft | `createContinuanceDraft` | Manager | — |

### Job / task (`job`)

Module: Jobs & Tasks · route `jobs`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Not started | In progress / Blocked | `updateTask` | Assignee / manager | Blocked requires a reason |
| In progress | Completed | `updateTask` | Assignee / manager | A parent cannot complete while a required child is open |
| Any open | Cancelled | `updateJob` | Manager | Cancelled jobs cannot be reopened |
| Any open | Reassigned | `reassignTask` | Manager | Reason required; assignment never grants approval authority |

### Job template (`job-template`)

Module: Job Templates · route `job-templates`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Published | `publishJobTemplate` | Manager | — |
| Published | Draft revision | `createJobTemplateRevision` | Manager | Existing jobs keep their pinned revision |
| Published | Retired | `retireJobTemplate` | Manager | — |
| Published | Job created | `applyJobTemplate` | Manager | Idempotent per operation; Draft/Retired cannot instantiate |

### Client request (PBC) (`pbc`)

Module: Documents & PBC · route `documents`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Requested | `presentPbcRequest` | Preparer / manager | — |
| Requested / Needs clarification | Received | `uploadPbcResponse` | Client finance contributor | Bytes persisted in browser IndexedDB with digest |
| Received | Needs clarification | `requestPbcClarification` | Preparer / reviewer | Clarification note required |
| Received | Accepted | `acceptPbcResponse` | Preparer / reviewer | — |
| Any open | Cancelled | `cancelPbcRequest` | Preparer / manager | Reason required |

**Rework:** The client replaces the file; the replacement needs staff re-review.

### Time entry (`time`)

Module: Time Tracking · route `my-time`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Submitted | `addTimeEntry` | Time owner | A persona records time only for itself |
| Submitted | Approved / Returned | `reviewTimeEntry` | Manager / reviewer / partner | Cannot approve own time; return reason required |
| Returned | Superseded + new Submitted revision | `resubmitReturnedTime` | Time owner | — |
| Approved | Superseded + corrected revision | `correctApprovedTime` | Manager | Reason required |

**Rework:** Only the time owner can resubmit; the returned entry becomes Superseded.

### Budget (`budget`)

Module: Budgets & Variances · route `budgets`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Approved (new version) | `updateBudget` | Manager / partner | Each change creates a new version; missing cost rate stays Unknown |

### Invoice (`invoice`)

Module: Billing & Invoices · route `billing`

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

### Credit note (`credit-note`)

Module: Billing & Invoices · route `billing`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `addCreditNote` | Billing / manager / partner | — |
| Draft | Approved / Draft (returned) | `reviewCreditNote` | Independent reviewer | — |
| Draft | Draft (revised) | `reviseCreditNote` | Billing | — |
| Approved | Issued | `issueCreditNote` | Billing / manager / partner | — |

### Adjustment journal (`adjustment`)

Module: Accounting Workbench · route `adjustments`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `addAdjustmentJournal` | Preparer | Balanced lines; support may pin evidence/workpaper/finding revisions |
| Draft | Technical review / Rejected | `reviewAdjustmentJournal` | Independent reviewer | — |
| Technical review | Management accepted / Rejected | `recordAdjustmentManagementDecision` | Client management (recorded) | — |
| Management accepted | Reporting included | `markAdjustmentJournalReportingIncluded` | Preparer / manager | — |
| Any | Draft (amended revision) | `amendAdjustmentJournal` | Preparer | Reason required; prior review retained |

**Staleness:** A pinned evidence, workpaper or finding revision that moves excludes the journal from statements and packages until re-pinned and re-reviewed.

### Reconciliation schedule (`reconciliation`)

Module: Accounting Workbench · route `reconciliations`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft / Returned | In Review | `saveReconciliationSchedule` | Preparer | — |
| In Review | Approved / Returned | `reviewReconciliationSchedule` | Independent reviewer | Return note required |

**Rework:** Returned schedules are revised and resubmitted as a new revision.
**Staleness:** A new TB source revision marks the schedule Stale; the prior review stays in history.

### Account mapping revision (`mapping`)

Module: Accounting Workbench · route `account-mappings`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `saveAccountMappings` | Preparer | — |
| Draft | Approved | `approveAccountMappings` | Independent reviewer | Every TB account must be mapped |

**Staleness:** A new mapping revision stales statement sets, cash-flow schedules and packages pinned to the old one.

### Statement set / cash-flow schedule revision (`statement-set`)

Module: Financial Statements · route `financial-statements`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `saveStatementSetRevision` | Preparer | Earlier revisions become Stale |
| Draft | Reviewed | `reviewStatementSetRevision` | Independent reviewer | — |
| New | Draft | `saveCashFlowSchedule` | Preparer | — |
| Draft | Reviewed | `reviewCashFlowSchedule` | Independent reviewer | — |

**Staleness:** TB source, mapping, layout or comparative changes mark revisions Stale.

### Disclosure (`disclosure`)

Module: Financial Packages · route `financial-packages`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Draft (saved revision) | `saveDisclosureReview` | Preparer / manager | — |
| Draft | Reviewed | `reviewDisclosure` | Reviewer / partner / EQR | Independent of the preparer |

### Financial package revision (`package`)

Module: Financial Packages · route `financial-packages`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Current source | Assembled (exact XLSX/DOCX/PDF) | `saveFinancialPackageRevision` | Manager / preparer | — |
| Validated | Presented | `presentManagementPackage` | Manager | — |
| Presented | Acknowledged / Rejected | `recordManagementPackageDecision` | Client management (recorded) | — |
| Approved | Release candidate | `prepareReleaseCandidate` | Manager / partner | — |

**Staleness:** TB source, GL source, mapping or generation changes stale the package; earlier revisions and approvals remain in history.

### Consolidation elimination (`consolidation-elimination`)

Module: Group Consolidation · route `consolidation`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `saveConsolidationElimination` | Preparer | Reason required |
| Draft | Submitted | `submitConsolidationElimination` | Preparer | — |
| Submitted | Approved / Returned | `reviewConsolidationElimination` | Independent reviewer | Note and evidence required |

**Rework:** Returned eliminations are corrected and resubmitted.
**Staleness:** Perimeter or FX changes return eliminations to Draft.

### Consolidation output package (`consolidation-output`)

Module: Group Consolidation · route `consolidation`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `saveConsolidationOutputPackage` | Preparer / manager | — |
| Draft | Approved / Returned | `reviewConsolidationOutputPackage` | Independent reviewer | — |
| Any | Perimeter revision | `revertConsolidationPerimeter` | Manager | Reason required |

**Rework:** A returned output package is corrected and saved again.

### Audit plan (`audit-plan`)

Module: Audit Planning & Materiality · route `audit-planning`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Draft | Under review | `saveAuditPlan` | Manager / preparer | Each save is a new version |
| Under review | Approved / Draft (returned) | `reviewAuditPlan` | Manager / partner | Independent of the preparer |
| Approved | Superseded | `updateAuditRisk` | Manager | A risk change reopens planning as a new version |

### Audit procedure (`audit-procedure`)

Module: Risks & Audit Programs · route `audit-risks`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Not started | In progress | `updateAuditProcedureExecution` | Preparer | — |
| In progress | Submitted / Cleared / Exceptions noted | `updateAuditProcedureStatus` | Preparer / reviewer | Reason required for exceptions |

**Rework:** Exceptions route to findings; evidence changes reopen the procedure.
**Staleness:** Evidence adequacy, evidence links or risk changes return Submitted/Cleared procedures to In progress.

### Audit program template (`audit-program-template`)

Module: Risks & Audit Programs · route `audit-risks`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Draft | `createAuditProgramTemplate` | Manager | — |
| Draft | Published | `publishAuditProgramTemplate` | Manager | — |
| Published | Retired | `retireAuditProgramTemplate` | Manager | — |

### Sample population (`sample`)

Module: Sampling & Populations · route `sampling`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Population | Replaced source | `replaceSamplePopulationSource` | Preparer | Digest recorded; prior selection retained |
| Imported | Selected | `setSampleItemSelected` | Preparer | Rationale for manual selection |
| Selected | Tested | `recordSampleItemTest` | Preparer | — |
| Tested | Reviewed | `reviewSampleSelection` | Independent reviewer | — |
| Exception | Finding linked | `linkSampleExceptionToFinding` | Preparer | — |

### Workpaper (`workpaper`)

Module: Audit Workpapers · route `audit`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Planned | In progress | `updateWorkpaper` | Assigned preparer | — |
| In progress | Submitted | `submitWorkpaper` | Assigned preparer | Scope, work, conclusion, current workbook and adequate current evidence required |
| Submitted | Cleared | `clearWorkpaper` | Assigned reviewer | Reviewer differs from preparer; exact submitted revision only |
| Any | Changes required | `replaceDocumentRevision` | System consequence | A newer evidence revision invalidates the submission |
| Any | Not applicable | `updateWorkpaper` | Senior role | Rationale required; blocked by unresolved findings |

**Rework:** Evidence or document changes require rework and a fresh submission.
**Staleness:** New evidence revisions or inadequate evidence set Changes required and reopen review notes.

### Review point (`review-note`)

Module: Review Desk · route `reviews`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Open | `addReviewNote` | Manager / reviewer / partner / EQR | — |
| Open / Reopened | Responded | `respondReviewNote` | Assignee | — |
| Responded | Cleared / Reopened | `clearReviewNote` | Author / reviewer | Responders cannot clear their own query; stale subject reopens |
| Open | Reassigned | `reassignReviewNote` | Manager | Reason required |

**Rework:** Reopened when the subject changes or the response is insufficient.

### Evidence item (`evidence`)

Module: Evidence Catalogue · route `evidence`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Pending verification | Adequate / Deficient | `setEvidenceAdequacy` | Reviewer | Rationale required; linked procedures reopen |
| Any | Linked / Unlinked procedure | `linkEvidenceProcedure` | Preparer | — |

### Finding / difference (`finding`)

Module: Findings & Differences · route `findings`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Uncorrected | `addFinding` | Preparer / reviewer | — |
| Any | Next disposition | `setFindingDisposition` | Manager / partner | Rationale required; disposition history retained |

### Release candidate / release (`release`)

Module: Release & Completion · route `delivery`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Gates cleared | Candidate | `prepareReleaseCandidate` | Manager / partner | evaluateReleaseReadiness must pass |
| Candidate | Released | `issueRelease` | Partner | Dispatch is simulated; no email is sent |
| Released | Amendment draft | `reopenReleaseForAmendment` | Partner | Reason required; prior release kept as predecessor |
| Released | Archived | `archiveEngagement` | Records | Logical archive index only; not production retention |

**Amend / reopen:** reopenReleaseForAmendment → prepareAmendedRelease produces an amended release that references its predecessor.

### Engagement approval (manager / client / partner / EQR) (`approval`)

Module: Sign-offs & EQR · route `approvals`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Pending | Approved (bound to generation) | `recordApproval` | Manager / client / partner / EQR | Each approver independent of the preparer; approvals bind to the current generation |
| Pending | EQR assigned | `assignEqrReviewer` | Partner | Reason required |
| Open | Concern raised / resolved | `addEqrConcern` | EQR | — |

**Staleness:** Any change to the engagement generation leaves prior approvals in history but no longer current.

### Archive record (`archive`)

Module: Records & Archive · route `records`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Released | Archived | `archiveEngagement` | Records | Retention date / hold recorded as demo metadata only |
| Archived | Handover recorded | `recordArchiveHandover` | Records | Requester and reason required |

### Simulated invitation (`invitation`)

Module: Firm Administration · route `administration`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| New | Pending | `sendSimulatedInvitation` | Administrator | Simulated — no email is sent |
| Pending | Accepted | `acceptSimulatedInvitation` | Invitee (simulated) | — |
| Pending | Revoked | `revokeSimulatedInvitation` | Administrator | Reason required |
| Expired | Pending | `resendSimulatedInvitation` | Administrator | — |

### Microsoft 365 simulation (`m365`)

Module: Microsoft 365 Setup · route `m365-setup`

| From | To | Store command | Actor | Rule enforced |
|---|---|---|---|---|
| Not configured | Simulated verified / Simulated error | `updateFirmSettings` | Administrator | liveConnected is always false; no OAuth or Graph calls |
