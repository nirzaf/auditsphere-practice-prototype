# AuditSphere Visual Prototype — Lifecycle Matrix (MOD-UX-01)

Recorded 2026-09-27 · `docs/prototype/lifecycle-matrix.md`

This is the authoritative lifecycle matrix for the browser prototype. Every entry
is derived from the **existing** store commands in
`src/store/prototypeStore.ts` (192 public commands) and the guards in
`src/services/guards.ts` — not from a proposed design. Where a module has no
multi-step journey, the matrix says so rather than inventing one.

How to read a row:

| Column | Meaning |
|---|---|
| Module / route | Sidebar label and routable key (see `src/services/routeRegistry.ts`) |
| Record | The business object the route governs |
| Entry state | State a newly created record starts in |
| Editable | States in which the record can still be edited |
| Submit | The command + gate that moves work forward |
| Review | Who must independently act, and the gate that enforces it |
| Return / rework | The recorded return path and its reason requirement |
| Approval | The approval command and the revision it pins |
| Terminal | States the journey can end in |
| Amend / reopen | How a finished record changes without losing history |
| Staleness | What upstream change invalidates the record |
| Roles / scope | Role and scope gates that apply |
| Model | The shared lifecycle model the module header reports (`LIFECYCLE_MODELS`) |

Presentation of these states is shared: the tone, wording and accessible reading
of every state value come from `src/services/lifecycle.ts`, and every module
header reports its model through `ModuleLifecycleHint`.

---

## 1. Practice, CRM and commercial

### M-01 Practice Overview — `overview`
- **Record**: none (deterministic projection).
- **Lifecycle**: not applicable. This is a read-only work queue, so the matrix
  records no journey rather than inventing one.
- **Derived states**: each metric is a projection over jobs, tasks, PBC requests
  and review points in the permitted scope; each metric opens the exact filtered
  record list it counts.
- **Model**: `matter-register`.

### M-02 Client Portfolio — `clients` · Client 360 — `client-detail`
- **Record**: `ClientRecord`; `PbcRequestItem` / `DocumentItem` in the 360 view.
- **Entry**: `Prospect`.
- **Editable**: `Prospect`, `Active`, `Suspended`. `Archived` is read-only history.
- **Submit**: `addClient` / `updateClient`; contact and custom-field authoring
  through `addContact`, `setPrimaryContact`, `setClientCustomField`.
- **Review**: contact nominations require a separate staff review —
  `nominateClientContact` then `reviewClientContactNomination`, which records the
  reviewer and note and **does not** create a contact or an access grant.
- **Return / rework**: rejection of a nomination is recorded with a note; the
  nomination stays as history.
- **Approval**: none for the client record itself; access is granted separately
  through `grantAccess` / `revokeAccess`.
- **Terminal**: `Archived`.
- **Amend / reopen**: `updateClient` from a non-archived state; prior values are
  retained in the client's own history.
- **Staleness**: contact history keeps effective windows; a superseded primary
  contact remains readable.
- **Roles / scope**: relationship, manager, partner may create; `visibleClientIds`
  filters every projection. Client personas see only the portal projection.
- **Model**: `matter-register` (register) / `request-response` (360 view).

### M-03 Acquisition & Pipeline — `acquisition`
- **Record**: `LeadOpportunity`.
- **Entry**: `Inquiry`.
- **Editable**: any stage before conversion.
- **Submit**: `addLead`, `updateLead`, `convertLead`.
- **Review**: none; conversion is a deliberate user action, and it does not create
  an engagement.
- **Return / rework**: stage may move backwards with a recorded reason
  (`updateLead`).
- **Approval**: none in this module — commercial approval happens on the proposal.
- **Terminal**: `Won`, `Lost`, `Unqualified`.
- **Amend / reopen**: a lost lead stays historical; a new inquiry is a new record.
- **Staleness**: none (the lead is not derived from another record).
- **Roles / scope**: relationship, manager, partner.
- **Model**: `matter-register`.

### M-04 Proposals & Terms — `proposals` · `ProposalRecord`
- **Entry**: `Draft`.
- **Editable**: `Draft` and `Internal review` only
  (`reviewProposal` rejects anything already presented).
- **Submit**: `presentProposal` snapshots the exact revision
  (`presentedSnapshot.revision`) and moves to `Presented`.
- **Review**: `reviewProposal(propId, approved, notes)` requires **partner or
  manager**, applies `requireIndependentActor(preparedBy, currentPerson)`,
  and rejects a return with no reason. Approved → `Approved to send`.
- **Return / rework**: `reviewProposal(..., false, reason)` → back to `Draft`
  with the reason and reviewer retained in `commercialReview`.
- **Approval**: recorded against the presented revision; `recordProposalResponse`
  refuses any response that does not name the **current** presented revision.
- **Terminal**: `Accepted` (leads to engagement), `Declined`, `Withdrawn`.
- **Amend / reopen**: `createProposalRevision` supersedes with a new revision and
  keeps the prior presented snapshot intact.
- **Staleness**: changing the proposal after presentation stales the snapshot; the
  response gate then refuses the stale revision.
- **Roles / scope**: `requireClientScope(prop.clientId)`; client response recorded
  by relationship/manager/partner or the client persona, against an active contact.
- **Model**: `record-approval`.

### M-05 Engagements — `engagements` · `EngagementRecord`
- **Entry**: `Draft` (created from accepted proposal terms).
- **Editable**: while `Active`; administrative edits require
  `updateEngagement` and invalidate release approvals.
- **Submit**: `activateEngagement` requires recorded acceptance evidence
  (`roleRequiresApprovalEvidence`).
- **Review**: scope/period/team changes clear planning, source acceptance and
  mapping approval and supersede the active audit plan; the UI states this impact
  before saving.
- **Return / rework**: not applicable to the engagement itself; work is returned in
  the modules below.
- **Approval**: none at engagement level; sign-offs live in M-37/M-38.
- **Terminal**: `Closed`, `Cancelled` (`setEngagementLifecycle`), with
  `Suspended` as a reversible pause.
- **Amend / reopen**: `Suspended → Active` resumes; `Cancelled` is terminal and
  retains invoices, evidence and historical reviews.
- **Staleness**: `requireActiveEngagementLifecycle` denies professional and
  billing writes atomically once suspended, closed or cancelled.
- **Roles / scope**: `visibleEngagementIds` + `requireEngagementScope` with action
  classes (`professional`, `activation`, `billing`, `records`, `administrative`).
- **Model**: `audit-engagement`.

### M-27 Acceptance & KYC — `onboarding` · `AcceptanceCaseRecord`
- **Entry**: `Draft` continuance or new-client case.
- **Submit**: `saveAcceptanceCase` records screening evidence references;
  `decideAcceptanceCase` records the partner decision.
- **Review**: the recommendation is pending until a **separately assigned partner**
  decides; the risk selector exposes the prohibited-mandate outcome.
- **Return / rework**: an accepted case's prior decision stays in history when a new
  period's case is drafted.
- **Approval**: partner acceptance only; missing evidence and prohibited acceptance
  are refused.
- **Terminal**: accepted / declined case; a declined case remains readable.
- **Amend / reopen**: an accepted prior case creates exactly one linked
  next-period draft with empty balances, tasks, evidence, programs, time, budgets,
  reviews, approvals, packages and releases; the retry is idempotent.
- **Staleness**: changed facts require a new case rather than editing the accepted one.
- **Roles / scope**: onboarding, compliance, manager, partner.
- **Model**: `record-approval`.

---

## 2. Work, collaboration and documents

### M-06 Jobs & Tasks — `jobs` · `JobRecord` / `JobTaskItem`
- **Entry**: `Not started`.
- **Editable**: `Not started`, `In progress`, `Blocked`.
- **Submit**: `addJob`, `updateJob`, `addTask`, `updateTask`, `reassignTask`.
- **Review**: none inside the module; job work feeds workpapers and review points.
- **Return / rework**: `Blocked` requires a reason (`blockedReason`), which the
  module now renders through the shared blocked tone instead of bare text.
- **Approval**: none.
- **Terminal**: `Completed`, `Cancelled`. A parent job cannot complete while
  subtasks are open.
- **Amend / reopen**: `In progress` may be re-entered from `Blocked` with history.
- **Staleness**: task reassignment is recorded as an actual reassignment event.
- **Roles / scope**: manager/preparer write; `visibleEngagementIds` filters.
- **Model**: `record-approval`.

### M-07 Job Templates — `job-templates` · `JobTemplateItem`
- **Entry**: `Draft`.
- **Editable**: `Draft` only.
- **Submit**: `publishJobTemplate`; `createJobTemplateRevision` for a new version.
- **Review**: `retireJobTemplate` is the deliberate end action.
- **Return / rework**: revision creates a new version rather than editing published.
- **Approval**: publishing is the recorded gate.
- **Terminal**: `Retired`.
- **Amend / reopen**: revisions are separate versions; applied jobs keep their
  original copied tasks.
- **Staleness**: later template edits never alter already-applied jobs.
- **Model**: `record-approval`.

### M-08 Documents & SharePoint — `documents` · `DocumentItem`
- **Entry**: registered reference (metadata + hash).
- **Editable**: reference metadata until replaced.
- **Submit**: `addDocument`, `replaceDocumentRevision`, `updateDocumentReference`.
- **Review**: a registered replacement **does not** silently change a pinned
  evidence reference.
- **Return / rework**: `setDocumentAvailability` marks a file unavailable, which
  blocks new links and sharing atomically; restore re-enables use.
- **Approval**: client sharing is explicit (`setDocumentClientSharing`).
- **Terminal**: unavailable/withdrawn reference (retained as history).
- **Amend / reopen**: `replaceDocumentRevision` preserves lineage.
- **Staleness**: replacing a referenced document stales dependent approved
  reconciliations and requires rework.
- **Simulation honesty**: original bytes stay in-session; metadata + hash persist.
- **Model**: `request-response`.

### M-09 Client Requests / PBC — `client-detail`, `documents`, `portal`
- **Entry**: `Draft` → `Requested` (`presentPbcRequest`).
- **Submit**: `replyToPbcRequest`, `uploadPbcResponse`, `acceptPbcResponse`.
- **Review**: `requestPbcClarification` then `updatePbcRequest`;
  acceptance is an independent staff act.
- **Return / rework**: `Needs clarification` → replacement response → re-acceptance;
  the thread keeps every earlier response.
- **Approval**: `acceptPbcResponse` (client response accepted by staff).
- **Terminal**: `Accepted`, `Cancelled` (reason required).
- **Amend / reopen**: replacement responses supersede without deleting the prior one.
- **Staleness**: accepted bytes persist in IndexedDB across reload; a replaced
  document stales dependants.
- **Model**: `request-response`.

### M-10 Communications — `communications` · `CommunicationItem`
- **Entry**: draft.
- **Submit**: `addCommunication`, `correctCommunication`, `saveEmailTemplate`.
- **Review**: `correctCommunication` retains the correction revision.
- **Simulation honesty**: outcomes are `Simulated accepted` / `Simulated failed` /
  `Outcome unknown` / `Recorded manually`; nothing leaves the browser.
- **Terminal**: recorded outcome.
- **Model**: `matter-register`.

### M-11 Client Portal — `portal`
- **Record**: projection over explicitly shared records only.
- **Lifecycle**: none of its own. It mirrors the states of shared documents,
  requests, packages and invoices and never exposes internal state.
- **Submit**: portal-side replies and uploads go through the same PBC commands.
- **Review**: staff acceptance is required before a portal upload counts.
- **Staleness**: `visibleClientIds` + `visibility === 'Client shared'` gate every row.
- **Model**: `request-response`.

---

## 3. Economics and billing

### M-12 Time Tracking — `my-time` · `TimeEntryItem`
- **Entry**: draft (unsubmitted).
- **Editable**: draft and `Returned`.
- **Submit**: `addTimeEntry` → `Submitted`.
- **Review**: `reviewTimeEntry(id, approved, note)`; approval requires an
  independent reviewer.
- **Return / rework**: `Returned` → `resubmitReturnedTime` requires a reason and
  retains the returned revision.
- **Approval**: `Approved`.
- **Terminal**: `Approved` (corrected through a superseding revision).
- **Amend / reopen**: `correctApprovedTime` creates a correction revision; the
  original stays historical and `getEffectiveTimeEntries` keeps superseded
  revisions out of totals.
- **Staleness**: superseded revisions never count twice.
- **Model**: `record-approval`.

### M-13 Budgets & Variances — `budgets` · `BudgetRecord`
- **Entry**: draft.
- **Editable**: draft only.
- **Submit**: `updateBudget` saves the versioned budget.
- **Review**: the saved budget must match the engagement's permitted context;
  a budget whose engagement is no longer the active permitted context must be
  reopened before saving.
- **Terminal**: saved version.
- **Amend / reopen**: a new version supersedes; prior versions remain.
- **Staleness**: saving under a changed engagement context is refused.
- **Model**: `record-approval`.

### M-14 Billing & Invoices — `billing` · `InvoiceRecord`
- **Entry**: `Draft` (`addInvoice`).
- **Editable**: `Draft` (`reviseInvoiceDraft`).
- **Submit**: `reviewInvoice(id, approved, note)`.
- **Review**: independent approval required; a return requires a note.
- **Return / rework**: `Returned` → `reviseInvoiceDraft` → resubmit.
- **Approval**: `Approved` → `issueInvoice` → `Issued`.
- **Terminal**: `Paid`, `Cancelled` (`cancelInvoiceDraft` applies to drafts).
- **Amend / reopen**: a **new rate version never rewrites issued invoices**;
  corrections use a credit note.
- **Staleness**: the invoice pins its source lines; a revision clears approval.
- **Model**: `record-approval`.

### M-15 Credit Notes — `billing`
- **Entry**: `Draft` (`addCreditNote`).
- **Submit**: `reviewCreditNote(id, approved, returnReason)` → `issueCreditNote`.
- **Return / rework**: return requires a reason.
- **Terminal**: `Issued`.
- **Model**: `record-approval`.

### M-16 Receivables & Receipts — `receivables` · `ReceiptRecord`
- **Entry**: recorded receipt.
- **Submit**: `addReceipt`, `allocateReceipt`, `reverseAllocation`.
- **Review**: allocation reversal is retained as history rather than deleted.
- **Terminal**: fully allocated / reversed.
- **Staleness**: aging is computed as-of a selectable date; the boundary date is
  inclusive and reconciles to the outstanding list.
- **Model**: `record-approval`.

---

## 4. Accounting workbench

### M-17 Accounting Setup — `accounting-setup` · `ClientAccountingProfile`
- **Entry**: `Not configured`.
- **Submit**: `saveAccountingProfile` records chart, period books and dimensions;
  `updateTrialBalanceRows` accepts a manual chart start without inventing
  transactions.
- **Review**: profile/chart revision is pinned onto each imported source.
- **Terminal**: saved profile revision.
- **Staleness**: a later profile revision supersedes; imported sources keep the
  revision they were imported under.
- **Model**: `source-revision`.

### M-18 Trial Balance & Intake — `trial-balance`
- **Entry**: imported source revision v*n*.
- **Submit**: `updateTrialBalanceRows`; replacement preserves the prior revision.
- **Review**: an unbalanced import is rejected atomically and the accepted source
  revision is preserved.
- **Return / rework**: re-import a corrected file as a new revision.
- **Staleness**: a new source revision stales statements, reconciliations,
  mappings and packages derived from the old one.
- **Simulation honesty**: CSV/XLSX only; no ledger posting.
- **Model**: `source-revision`.

### M-19 GL Transactions & Completeness — `gl-transactions`
- **Entry**: `GLSourceRevision`.
- **Submit**: `importGeneralLedgerSource` maps unfamiliar headers by user mapping
  and reconciles explicit openings and movements to the TB.
- **Review**: `verifyGLCompleteness` marks GL-only and missing-opening accounts as
  incomplete rather than balanced.
- **Return / rework**: unknown/inactive/non-posting codes, duplicate line keys and
  invalid dates/currency reject atomically.
- **Staleness**: replacing the GL source stales current reconciliations; the release
  generation advances.
- **Model**: `source-revision`.

### M-20 Account Mappings — `account-mappings` · `AccountMappingRevision`
- **Entry**: `Draft`.
- **Submit**: `saveAccountMappings`.
- **Review**: `approveAccountMappings` — independent approval required.
- **Return / rework**: an unapproved revision can be replaced by a new draft.
- **Staleness**: a source or profile revision change clears mapping approval.
- **Model**: `source-revision`.

### M-21 Adjustment Journals — `adjustments` · `AdjustmentJournalItem`
- **Entry**: `Draft` (`addAdjustmentJournal`).
- **Editable**: `Draft` and `Returned` (`updateAdjustmentJournal`).
- **Submit**: `reviewAdjustmentJournal` (independent technical review) →
  `recordAdjustmentManagementDecision` →
  `markAdjustmentJournalReportingIncluded`.
- **Review**: states are `Draft`, `Technical review`, `Management accepted`,
  `Reporting included`, `Rejected`; the live "Corrected in TB" finding action is
  reachable from the journal.
- **Return / rework**: technical-review rejection requires a bounded rationale;
  `amendAdjustmentJournal` preserves the predecessor and requires fresh decisions.
- **Approval**: reflection in the current source requires evidence; stale-source
  inclusion is blocked.
- **Staleness**: `reflectionStatus` reports `Not reflected` / `Reflected in TB` /
  `Partially reflected` / `Unknown` against a named source version.
- **Model**: `record-approval`.

### M-22 Reconciliations — `reconciliations` · `ReconciliationSchedule`
- **Entry**: `Draft` (`saveReconciliationSchedule`).
- **Submit**: `reviewReconciliationSchedule`.
- **Review**: independent review; `Cleared` / `Differences noted`.
- **Return / rework**: `Returned` with a review note, then rework and resubmit —
  the seeded journey keeps v1…v8 with v7 returned and v8 approved.
- **Approval**: pinning the reviewed revision.
- **Staleness**: a source replacement (for example the referenced bank statement)
  stales the approved schedule and requires explicit rework; the approved snapshot
  stays in history with its revision number.
- **Model**: `record-approval`.

### M-23 Financial Statements — `financial-statements`
- **Entry**: not created.
- **Submit**: `saveStatementSetRevision`, `saveStatementLayoutRevision`,
  `saveCashFlowSchedule`.
- **Review**: `reviewStatementSetRevision`, `reviewDisclosure`,
  `reviewCashFlowSchedule`.
- **Return / rework**: a comparative or layout change stales reviewed statements
  and prevents re-review until re-derived.
- **Staleness**: `staleStatementRevisionsForComparativeChange`; the UI reports the
  latest revision as `Stale` while keeping it readable.
- **Model**: `source-revision`.

### M-24 Financial Packages — `financial-packages` · `FinancialPackageRevision`
- **Entry**: `Calculated` from an exact TB/GL lineage.
- **Submit**: `saveFinancialPackageRevision`; `presentManagementPackage` →
  `recordManagementPackageDecision`; `prepareReleaseCandidate`.
- **Review**: management acknowledgement, accounting review and partner approval
  are separate records.
- **Return / rework**: after amendment, management must separately acknowledge the
  re-presented replacement revision while the prior decision stays historical.
- **Staleness**: a later content revision gets new artifact IDs without replacing
  historical files; forced XLSX failure and a second IndexedDB write failure report
  errors without saving a revision or leaving partial blobs.
- **Model**: `financial-package`.

### M-25 Group Consolidation — `consolidation` · `ConsolidationGroupRecord`
- **Entry**: pinned perimeter revision.
- **Submit**: `updateConsolidationGroup`, `updateConsolidationFxRate`,
  `saveConsolidationElimination` → `submitConsolidationElimination` →
  `reviewConsolidationElimination`, then `saveConsolidationOutputPackage` →
  `reviewConsolidationOutputPackage`.
- **Review**: elimination and output review are separate independent acts;
  `revertConsolidationPerimeter` restores a prior perimeter with history.
- **Return / rework**: unsupported Associate/minority profiles are rejected and
  produce no figures; a missing perimeter role blocks output by name.
- **Staleness**: a changed component source raises a stale-pin warning, keeps the
  old snapshot and requires an explicit re-pin.
- **Terminal**: reviewed output package (fingerprint-bound, digest-verified).
- **Model**: `consolidation-run`.

---

## 5. Audit and assurance

### M-28 Audit Planning & Materiality — `audit-planning` · `AuditPlanRecord`
- **Entry**: draft plan.
- **Submit**: `saveAuditPlan` (requires valid team allocations per engagement).
- **Review**: `reviewAuditPlan` — supersedes the prior plan revision.
- **Return / rework**: a scope/period/team change supersedes the active plan review
  and requires reassessment of performed procedures.
- **Staleness**: materiality is computed from the engagement's own currency and
  benchmark; a benchmark saved on one engagement never carries into another.
- **Model**: `record-approval`.

### M-29 Risks & Audit Programs — `audit-risks`
- **Entry**: `Draft` risk or template.
- **Submit**: `createAuditRisk`, `updateAuditRisk`,
  `publishAuditProgramTemplate`, `applyAuditProgramTemplate`.
- **Review**: `reviseAuditProgramTemplate` and `retireAuditProgramTemplate`;
  applied programs are already-published versions copied in with fresh state.
- **Return / rework**: template revisions are new versions; applied engagement
  programs are unaffected by later template edits.
- **Staleness**: `setAuditRiskProcedureLink` pins procedure links; fieldwork history
  records `status`, reason and prior state per revision.
- **Model**: `record-approval`.

### M-30 Sampling & Populations — `sampling` · `SamplePopulationItem`
- **Entry**: imported population.
- **Submit**: `setSampleItemSelected`, `recordSampleItemTest`,
  `recordSampleItemLimitation`, `reviewSampleSelection`.
- **Review**: selection review is independent; the frame must reconcile to the GL
  row before selection is enabled.
- **Return / rework**: `replaceSamplePopulationSource` creates a new source;
  `linkSampleExceptionToFinding` raises a finding from an exception.
- **Staleness**: an unreconciled frame disables selection; the `Result` column shows
  `Not started` → `In progress` → `Cleared` / `Exception noted`.
- **Model**: `record-approval`.

### M-31 Audit Workpapers — `audit` · `WorkpaperItem`
- **Entry**: `Draft`.
- **Editable**: `Draft`, `Returned`.
- **Submit**: `submitWorkpaper`.
- **Review**: `clearWorkpaper` — an independent reviewer clears it.
- **Return / rework**: `replaceWorkpaperRevision` reopens previously responded or
  cleared review notes, keeping their history.
- **Approval**: `Cleared`; `Not applicable` requires a senior role and a rationale
  and respects unresolved findings.
- **Staleness**: a revision change reopens dependent review notes.
- **Model**: `record-approval`.

### M-32 Evidence Catalogue — `evidence` · `EvidenceItem`
- **Entry**: registered reference with a SHA digest.
- **Submit**: `linkWorkpaperEvidence`, `linkEvidenceProcedure`,
  `linkDocumentToTask`, `unlink*`.
- **Review**: `setEvidenceAdequacy` records `Adequate` / `Pending verification` /
  `Deficient` / `Inadequate`.
- **Return / rework**: an unavailable document blocks adequacy and new links
  atomically.
- **Staleness**: withdrawal of a referenced document blocks every consuming type.
- **Model**: `record-approval`.

### M-33 Findings & Differences — `findings` · `FindingItem`
- **Entry**: raised finding with a revision.
- **Submit**: `addFinding`, `setFindingDisposition`.
- **Review**: `addReviewNote` → `respondReviewNote` → `clearReviewNote`; a response
  requires an independent review and reopens after workpaper revision.
- **Return / rework**: a disposition requires a rationale; release-blocking findings
  are identified by `isReleaseBlockingFinding`.
- **Staleness**: a finding revision reopens its review notes.
- **Model**: `record-approval`.

### M-34 Review Desk — `reviews` · `ReviewNoteItem`
- **Entry**: `Open`.
- **Submit**: `addReviewNote`, `reassignReviewNote`, `respondReviewNote`.
- **Review**: `clearReviewNote`; `reopenWorkpaperReviewNotes` /
  `reopenFindingReviewNotes` reopen on revision.
- **Return / rework**: `Reopened` is a distinct visible state, not an error.
- **Staleness**: the note records each history entry with actor, action, time and text.
- **Model**: `record-approval`.

### M-35 Sign-offs & EQR — `approvals` / `quality`
- **Entry**: generation-bound approval slots (manager, client, partner, eqr).
- **Submit**: `recordApproval`, `assignEqrReviewer`, `addEqrConcern`,
  `respondEqrConcern`, `toggleEqrConcern`.
- **Review**: EQR concurrence is a separate record from manager/client/partner
  approval; `requireIndependentActor` blocks self-approval even under another role.
- **Return / rework**: an EQR concern is open until responded and toggled resolved.
- **Staleness**: `invalidateReleaseBasis` clears all four approvals and the release
  candidate when the basis changes; `approvalHistory` keeps every generation.
- **Model**: `record-approval`.

### M-36 Release & Completion — `delivery`
- **Entry**: release candidate prepared from an approved generation.
- **Submit**: `prepareReleaseCandidate`, `evaluateReleaseReadiness`,
  `issueRelease`, `prepareAmendedRelease`, `reopenReleaseForAmendment`.
- **Review**: readiness evaluation lists what is still outstanding; issue records
  the exact manifest.
- **Return / rework**: amendment creates a new release linked to its predecessor.
- **Terminal**: issued release; delivery is a **simulated dispatch** and says so.
- **Model**: `financial-package`.

### M-37 Records & Archive — `records` · `ArchiveRecord`
- **Entry**: archive candidate from an issued release.
- **Submit**: `archiveEngagement`, `recordArchiveHandover`.
- **Review**: handover records the receiving actor and time; retention and
  application hold are displayed.
- **Terminal**: archived; a cancelled engagement shows `No Release to Archive`
  rather than a fabricated record.
- **Amend / reopen**: amendment lineage is kept; nothing is deleted.
- **Model**: `matter-register`.

---

## 6. Administration, reporting and specifications

### M-38 Firm Administration — `administration`
- **Record**: users, grants, firm settings, custom fields.
- **Submit**: `grantAccess`, `revokeAccess`, `setUserStatus`,
  `updateFirmSettings`, `createDemoIdentity`.
- **Review**: identity status changes record an `IdentityStatusEvent` with reason.
- **Terminal**: `Revoked` grant, `Disabled` identity (both retained as history).
- **Staleness**: settings changes are prospective; existing issued documents are
  not rewritten.
- **Model**: `matter-register`.

### M-39 Microsoft 365 Setup — `m365-setup` · `M365SimulationConfig`
- **Entry**: `Not configured`.
- **Submit**: `updateM365Config`, `simulateM365Verification`,
  `simulateM365Disconnect`, `sendSimulatedInvitation`,
  `acceptSimulatedInvitation`, `resendSimulatedInvitation`,
  `revokeSimulatedInvitation`.
- **Review**: invitation states are `Pending`, `Accepted`, `Expired`, `Revoked`.
- **Simulation honesty**: `liveConnected` is always false; no OAuth, tokens or
  external calls. Verification outcomes are labelled `Simulated …`.
- **Model**: `matter-register`.

### Report Centre — `reports`
- **Lifecycle**: not applicable; deterministic report over permitted records. Each
  report states its scope and exports exactly its visible rows.
- **Model**: `matter-register`.

### Requirements & PRD — `requirements`; Module Guide — `module-guide`
- **Lifecycle**: not applicable (informational). The guide now also publishes the
  complete route index with each route's lifecycle model and next step.
- **Model**: `matter-register`.

---

## Lifecycle models used by the shared layer

| Model id | Steps | Modules reporting it |
|---|---|---|
| `matter-register` | Open → In progress → Closed | overview, clients, acquisition, communications, records, reports, administration, m365-setup, requirements, module-guide, aliases |
| `record-approval` | Draft → Submitted → In review → Approved → Effective | proposals, onboarding, jobs, job-templates, my-time, budgets, billing, receivables, adjustments, reconciliations, audit-planning, audit-risks, audit-fieldwork, sampling, audit, evidence, findings, reviews, approvals, quality |
| `request-response` | Requested → Received → Under review → Accepted | client-detail, documents, portal |
| `source-revision` | Imported → Validated → Mapped → Derived → Reviewed | accounting-setup, trial-balance, gl-transactions, account-mappings, financial-statements |
| `financial-package` | Calculated → Validated → Management approved → Accounting reviewed → Partner review → Released | financial-packages, delivery |
| `consolidation-run` | Perimeter → Components pinned → FX applied → Eliminations → Run complete → Reviewed | consolidation |
| `audit-engagement` | Accepted → Planned → Risks & programs → Fieldwork → Findings resolved → Review cleared → Completion → Released | engagements |

The model is **reported**, not enforced: no module is forced into a state machine
its domain does not have, and the shared layer never writes business state.

## Evidence status

| Claim | Status | Evidence |
|---|---|---|
| Every supported route declares a lifecycle model with meaningful steps | Verified | `tests/unit/enterpriseLifecycle.test.ts` — "gives every routed module a lifecycle model without inventing steps" |
| Every stored status value maps to a tone with a plain-language meaning | Verified | same suite — "maps every status vocabulary stored in the product onto a known tone" |
| Terminal states are never advertised as actionable | Verified | same suite — "separates needs a human from journey is over" |
| Stale/returned/terminal blockers name the exact cause and required action | Verified | same suite — "explains stale, returned and terminal blockers precisely" |
| Per-module lifecycle behaviour (gates, returns, staleness) | Documented from the store commands and guards, and exercised by the existing AT/VP browser journeys listed in `docs/prototype/verification.md` | `tests/e2e/app.test.ts` |
| Steps shown as complete by a module stepper | Partial | `LifecycleStepper` is implemented and unit-guarded; it is applied where a module derives its own step states, not yet on every stateful page |

## Remaining limitations

- The matrix documents the **prototype's** lifecycle. It is not a statement about
  the separate AuditSphere product, and it does not claim production-grade
  workflow enforcement (no scheduler, no rules engine, no background process).
- Several modules still render some lifecycle detail in prose rather than through
  the shared stepper; those are listed as Partial above rather than claimed.
- Where a module has no review step (for example Budgets), no review state is
  shown — the matrix records the absence instead of inventing a gate.
