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

## Module matrix (all 39 modules)

Role/Scope lists the product roles that can open the module route (`canOpenRoute`; the superuser is excluded because it is not a product role). Every record is additionally filtered by the persona's client/engagement/group grants. Happy and negative paths come from the module rehearsal guides (`src/services/moduleGuideContent.ts`).

| Module | Steps | Current State | Completed | Pending | Blocked | Review/Rework | Role/Scope | Dependencies | Next Action |
|---|---|---|---|---|---|---|---|---|---|
| MOD-01 Practice Dashboard | Context & Queue Monitoring | Active portfolio projection | Every visible counter equals its scoped detail; a zero-work engagement does not imply complete readiness. | Open queue tasks and unreviewed items | Scope or grant boundary | — | relationship, onboarding, compliance, partner, manager, preparer, reviewer, eqr, billing, records, admin + grant scope | Engagements, jobs, tasks, PBC, reviews, invoices (scoped projections) | Inspect scoped records, drill down or filter |
| MOD-02 CRM & Client Management | Prospect → Active | Prospect, Active, Suspended | One shared client/contact identity appears across related screens; historical references survive inactivation/archive. | Prospect | Suspended | updateClient: Active | relationship, onboarding, compliance, partner, manager, billing, records + grant scope | Contacts, relationship groups, custom fields | `updateClient` |
| MOD-03 Leads & Opportunities | Inquiry → Discovery → Evaluation → Proposal → Won | Inquiry, Discovery, Evaluation, Proposal, Won | One Prospect per conversion operation; no duplicate engagement, authority grant or professional approval is created. | Inquiry, Discovery, Evaluation, Proposal | Downstream holds / restrictions | — | relationship + grant scope | Client (on Won conversion) | `updateLead`, `convertLead` |
| MOD-04 Proposals & Engagements | Draft → Internal review → Approved to send → Presented → Accepted; Active → Closed | Draft, Internal review, Approved to send, Presented, Accepted, Active, Closed, Suspended | Commercial acceptance, professional acceptance and engagement activation remain separate attributable decisions. | Draft, Internal review, Approved to send, Presented, Active | Suspended | A returned proposal goes back to Draft with the review note retained. | relationship, partner, manager + grant scope | Lead, client, service catalogue; accepted proposal → engagement | `updateProposal`, `reviewProposal`, `presentProposal` |
| MOD-05 Jobs & Tasks | Not started → In progress → Completed | Not started, In progress, Completed, Blocked | Assignment, ordering, notes and status persist; assignment never grants professional approval authority. | Not started, In progress | Blocked | updateJob: Cancelled | — + grant scope | Engagement, job templates, staff grants | `updateTask`, `updateJob`, `reassignTask` |
| MOD-06 Job Templates | Draft → Published | Draft, Published | Templates copy structure only, never prior evidence, approvals, completed work or recurring schedules. | Draft | Downstream holds / restrictions | — | — + grant scope | Engagement (on apply) | `publishJobTemplate`, `createJobTemplateRevision`, `retireJobTemplate` |
| MOD-07 Team Collaboration | Context & Queue Monitoring | Active portfolio projection | A local notice is not an email or chat service; edits and moderation retain attribution. | Open queue tasks and unreviewed items | Scope or grant boundary | — | — + grant scope | Jobs, comments, staff grants | Inspect scoped records, drill down or filter |
| MOD-08 Client Portal | Context & Queue Monitoring | Active portfolio projection | Contributing a file, administering client contacts and approving management content are different permissions. | Open queue tasks and unreviewed items | Scope or grant boundary | — | onboarding, partner, manager, client_admin, client_finance, client + grant scope | Explicitly shared documents, issued invoices, presented proposals/packages | Inspect scoped records, drill down or filter |
| MOD-09 Client Requests / PBC | Draft → Requested → Received → Accepted | Draft, Requested, Received, Under review, Accepted, Needs clarification | PBC receipt is separate from adequacy and professional workpaper review; revisions are never silently substituted. | Draft, Requested, Received, Under review | Downstream holds / restrictions | The client replaces the file; the replacement needs staff re-review. | relationship, onboarding, compliance, partner, manager + grant scope | Engagement, client contacts, portal uploads (IndexedDB) | `presentPbcRequest`, `uploadPbcResponse`, `requestPbcClarification` |
| MOD-10 Document Management | Context & Queue Monitoring | Active portfolio projection | SharePoint is a simulated canonical hierarchy, not a live transfer; each storage class states whether bytes survive reload. | Open queue tasks and unreviewed items | Scope or grant boundary | — | onboarding, compliance, partner, manager, preparer, reviewer, eqr, records + grant scope | Engagement folders, PBC, evidence links | Inspect scoped records, drill down or filter |
| MOD-11 Communications | Context & Queue Monitoring | Active portfolio projection | No provider receipt, real mail send, inbox sync, polling or automatic retry is implied. | Open queue tasks and unreviewed items | Scope or grant boundary | — | — + grant scope | Client, engagement, email templates | Inspect scoped records, drill down or filter |
| MOD-12 Time Tracking | Draft → Submitted → Approved | Draft, Submitted, Approved, Returned | Effective approved time drives totals; correction preserves the original approved rate and invoice history. | Draft, Submitted | Downstream holds / restrictions | Only the time owner can resubmit; the returned entry becomes Superseded. | — + grant scope | Jobs/tasks, budget rates | `addTimeEntry`, `reviewTimeEntry`, `resubmitReturnedTime` |
| MOD-13 Budgets | Draft → Approved | Draft, Approved | Planned billing value is QAR 2,000; actual value/cost are separate, and no scheduling automation is introduced. | Draft | Downstream holds / restrictions | — | — + grant scope | Approved time | `updateBudget` |
| MOD-14 Billing & Invoicing | Draft → In review → Approved → Issued → Paid; Draft → Approved → Issued | Draft, In review, Approved, Issued, Paid | Firm billing never changes the client TB or group books; invoicing stays a local demo record and no real payment request is used. | Draft, In review, Approved, Issued | Downstream holds / restrictions | A returned invoice stays in Draft with the reviewer note until revised. reviewCreditNote: Approved / Draft (returned) | partner, manager, billing + grant scope | Approved billable time or accepted fixed-fee proposal | `addInvoice`, `reviewInvoice`, `reviseInvoiceDraft` |
| MOD-15 Receivables | Context & Queue Monitoring | Active portfolio projection | The dedicated QAR 1,000 invoice less 100 credit and 300 receipt gives QAR 600 in 31–60 days at 2026-09-23. | Open queue tasks and unreviewed items | Scope or grant boundary | — | — + grant scope | Issued invoices, credit notes, receipts | Inspect scoped records, drill down or filter |
| MOD-16 Reporting & Analytics | Context & Queue Monitoring | Active portfolio projection | Reports explain persisted synthetic records; they are not AI analytics, statutory accounts or a live BI connection. | Open queue tasks and unreviewed items | Scope or grant boundary | — | partner, manager, billing, records + grant scope | All scoped registers | Inspect scoped records, drill down or filter |
| MOD-17 Search & Centralized Client View | Context & Queue Monitoring | Active portfolio projection | Search selects the actual record rather than merely landing on a module home page; no semantic-search service is used. | Open queue tasks and unreviewed items | Scope or grant boundary | — | relationship, onboarding, compliance, partner, manager, preparer, reviewer, eqr, billing, records, admin, client_admin, client_finance, client + grant scope | All scoped registers | Inspect scoped records, drill down or filter |
| MOD-18 Microsoft 365 Integration | Not configured → Simulated verified | Not configured, Simulated verified, Simulated error | Every success says Simulated; liveConnected remains false and scoped access grants are still separate. | Not configured | Simulated error | — | partner, manager, admin + grant scope | Firm settings | `updateFirmSettings` |
| MOD-19 Identity & Access Management | Pending → Accepted | Pending, Accepted | The browser illustrates intended authorization behavior; it is not a production authentication/security boundary. | Pending | Downstream holds / restrictions | — | admin + grant scope | Users, role grants, invitations | `sendSimulatedInvitation`, `acceptSimulatedInvitation`, `revokeSimulatedInvitation` |
| MOD-20 Accounting | Draft → Approved | Draft, Approved | One client reporting context is preserved across imports and outputs; no operational ERP or new ledger is created. | Draft | Downstream holds / restrictions | — | — + grant scope | Accounting profile, period book | `saveAccountMappings`, `approveAccountMappings` |
| MOD-21 Trial Balance & GL | Draft → Approved | Draft, Approved | Imported client sources are immutable; a successful preview is not a committed or professionally reviewed source. | Draft | Downstream holds / restrictions | — | — + grant scope | TB/GL source revisions, chart of accounts | `saveAccountMappings`, `approveAccountMappings` |
| MOD-22 Adjustments & Journals | Draft → Technical review → Management accepted → Reporting included | Draft, Technical review, Management accepted, Reporting included | For the dedicated depreciation fixture assets move 23,000→22,500 and profit 3,000→2,500 once; no real ledger posting occurs. | Draft, Technical review, Management accepted | Downstream holds / restrictions | reviewAdjustmentJournal: Technical review / Rejected; recordAdjustmentManagementDecision: Management accepted / Rejected | — + grant scope | TB source, evidence/workpaper/finding revisions | `addAdjustmentJournal`, `reviewAdjustmentJournal`, `recordAdjustmentManagementDecision` |
| MOD-23 Reconciliations | Draft → In review → Approved | Draft, In progress, In Review, Approved, Cleared, Returned, Differences noted, Stale | The source fixture $999,900 plus $100 timing reconciles to $1,000,000; keep currency labels explicit and do not mix it with QAR fixtures. | Draft, In progress, In Review | Downstream holds / restrictions | Returned schedules are revised and resubmitted as a new revision. | — + grant scope | TB source, GL, evidence | `saveReconciliationSchedule`, `reviewReconciliationSchedule` |
| MOD-24 Financial Statements | Draft → Reviewed | Draft, Reviewed, Stale | Statements reconcile to accepted sources and adjustments; synthetic methods/rates do not imply professional certification. | Draft | Downstream holds / restrictions | — | partner, manager, preparer, reviewer, eqr + grant scope | TB source, approved mapping, layout, accepted adjustments | `saveStatementSetRevision`, `reviewStatementSetRevision`, `saveCashFlowSchedule` |
| MOD-25 Financial Packages | Assembled → Validated → Presented to management → Management decision → Released; Draft → Reviewed | Assembled, Validated, Presented, Acknowledged, Released, Validation blocked, Stale, Draft, Reviewed | The artifact bytes and hashes are browser-local persisted demo evidence, not externally delivered reports. | Assembled, Validated, Presented, Acknowledged, Draft | Validation blocked | recordManagementPackageDecision: Acknowledged / Rejected | — + grant scope | Statements, mapping, GL, workpapers, reviews, findings, disclosures | `saveFinancialPackageRevision`, `presentManagementPackage`, `recordManagementPackageDecision` |
| MOD-26 Consolidation | Draft → Submitted → Approved; Draft → Approved | Draft, Submitted, Approved, Returned, Pending, Stale | Group totals equal supported component values plus approved eliminations; component TBs are unchanged. JSON is not advertised as a group XLSX/PDF. | Draft, Submitted | Pending | Returned eliminations are corrected and resubmitted. A returned output package is corrected and saved again. | — + grant scope | Pinned component packages, FX rates, perimeter | `saveConsolidationElimination`, `submitConsolidationElimination`, `reviewConsolidationElimination` |
| MOD-27 Client Acceptance | Recommendation → Decision | Pending, Accepted | This is synthetic evidence recording, not a live KYC/AML screening service or professional certification. | Pending | Downstream holds / restrictions | — | onboarding, compliance, partner, manager + grant scope | Client, prior-year engagement | `saveAcceptanceCase`, `decideAcceptanceCase`, `createContinuanceDraft` |
| MOD-28 Audit Planning | Draft → Under review → Approved | Draft, Under review, Approved | Calculations illustrate chosen assumptions. Any yet-unimplemented input control is a pending step, not a currently clickable feature. | Draft, Under review | Downstream holds / restrictions | reviewAuditPlan: Approved / Draft (returned); updateAuditRisk: Superseded | partner, manager, preparer, reviewer, eqr + grant scope | Engagement, TB benchmark, risks | `saveAuditPlan`, `reviewAuditPlan`, `updateAuditRisk` |
| MOD-29 Risks & Audit Programs | Not started → In progress → Submitted → Cleared; Draft → Published | Not started, In progress, Submitted, Cleared, Completed, Exceptions noted, Exception noted, Draft, Published | Reusable audit programs are manual bounded templates, not a methodology/rules engine. | Not started, In progress, Submitted, Draft | Downstream holds / restrictions | Exceptions route to findings; evidence changes reopen the procedure. | partner, manager, preparer, reviewer, eqr + grant scope | Audit plan, program templates | `updateAuditProcedureExecution`, `updateAuditProcedureStatus`, `createAuditProgramTemplate` |
| MOD-30 Audit Fieldwork | Not started → In progress → Submitted → Cleared | Not started, In progress, Submitted, Cleared, Completed, Exceptions noted, Exception noted | Submitting is not clearance; every applicable procedure retains its own work/result/reviewer state. | Not started, In progress, Submitted | Downstream holds / restrictions | Exceptions route to findings; evidence changes reopen the procedure. | partner, manager, preparer, reviewer, eqr + grant scope | Procedures, evidence | `updateAuditProcedureExecution`, `updateAuditProcedureStatus` |
| MOD-31 Populations & Sampling | Population imported → Items selected → Items tested → Selection reviewed | Imported, Selected, Tested, Reviewed, Stale | Counts and exceptions reconcile; the prototype does not infer statistical assurance or an audit conclusion. | Imported, Selected, Tested | Downstream holds / restrictions | — | partner, manager, preparer, reviewer + grant scope | Population source, GL account, materiality | `replaceSamplePopulationSource`, `setSampleItemSelected`, `recordSampleItemTest` |
| MOD-32 Workpapers | Planned → In progress → Submitted → Cleared | Planned, In progress, Submitted, Cleared, Changes required | Template provenance, preparation, submission and clearance are visibly separate and persist as documented for that storage class. | Planned, In progress, Submitted | Downstream holds / restrictions | Evidence or document changes require rework and a fresh submission. | — + grant scope | Templates, evidence, documents | `updateWorkpaper`, `submitWorkpaper`, `clearWorkpaper` |
| MOD-33 Evidence | Pending verification → Adequate | Pending verification, Adequate, Deficient, Inadequate | An evidence version is different from a document, PBC response, workpaper or review note; historical release evidence is preserved. | Pending verification | Deficient, Inadequate | setEvidenceAdequacy: Adequate / Deficient | partner, manager, preparer, reviewer, eqr + grant scope | Documents, procedures | `setEvidenceAdequacy`, `linkEvidenceProcedure` |
| MOD-34 Findings & Differences | Uncorrected → Proposed for correction → Resolved | Uncorrected, Proposed for correction, Management agreed, Corrected in TB, Corrected by client | A finding disposition is not review-note clearance or an automatic immateriality/opinion decision. | Uncorrected, Proposed for correction, Management agreed | Downstream holds / restrictions | — | partner, manager, preparer, reviewer, eqr + grant scope | Procedures, workpapers, samples, journals | `addFinding`, `setFindingDisposition` |
| MOD-35 Review Points | Open → Responded → Cleared | Open, Responded, Cleared, Reopened | Open, Responded, Cleared and Reopened states and all assignment reasons remain attributable. | Open, Responded | Downstream holds / restrictions | Reopened when the subject changes or the response is insufficient. | partner, manager, preparer, reviewer, eqr + grant scope | Workpapers, findings | `addReviewNote`, `respondReviewNote`, `clearReviewNote` |
| MOD-36 Reviews & Approvals | Manager → Client management → Partner → EQR (when required) | manager, client, partner, eqr, Stale | Approvals illustrate recorded human decisions only; the demo claims no legally binding signature and no professional certification. | manager, client, partner | Downstream holds / restrictions | — | — + grant scope | Package, workpapers, reviews, EQR assignment | `recordApproval`, `assignEqrReviewer`, `addEqrConcern` |
| MOD-37 Completion & Release | Gates cleared → Candidate prepared → Released → Archived | Ready, Candidate, Released, Archived, Blocked, Stale | A local release record is not an email, provider delivery, signature or live client report issuance. | Ready, Candidate, Released | Blocked | — | partner, manager, eqr + grant scope | Workpapers, reviews, findings, current sign-offs, package | `prepareReleaseCandidate`, `issueRelease`, `reopenReleaseForAmendment` |
| MOD-38 Records & Archive | Archived → Handover recorded | Archived, Handover | IndexedDB copies and app metadata can be cleared by the browser owner; no Purview, server immutability or automatic disposal is promised. | Archived | Downstream holds / restrictions | — | partner, manager, eqr, records + grant scope | Released artifacts | `archiveEngagement`, `recordArchiveHandover` |
| MOD-39 Administration | Pending → Accepted | Pending, Accepted | Settings have one owner and visible future effect, with no AI, tax/payroll, payment, Purview or automation controls. | Pending | Downstream holds / restrictions | — | admin + grant scope | Users, grants, firm settings | `sendSimulatedInvitation`, `acceptSimulatedInvitation`, `revokeSimulatedInvitation` |

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
