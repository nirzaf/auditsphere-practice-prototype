# AuditSphere Visual Prototype — Lifecycle & Progress Matrix (MOD-UX-02)

Generated from the shipped code by `tools/lifecycle-progress-matrix.ts`.
Regenerate with `npx tsx tools/lifecycle-progress-matrix.ts`; the unit suite fails if this
file and the code disagree.

Reading the columns:

- **Steps** — the declared lifecycle model for the route (`src/services/lifecycle.ts`).
- **Progress source** — the record fields the module derives its completed/pending/blocked counts from. A module with no workflow says so instead of inventing one.
- **Runtime** — whether the shared derived tracker is rendered on that screen today, the module's own step indicators are shown, or the screen has no workflow to track.
- **Entry / terminal** — the first and last step of the declared model, so a reader knows where the journey starts and ends.

A step can be reported as **completed**, **current**, **pending**, **blocked**, **returned**, **stale**, or **not applicable**. Blocked, returned and stale steps always carry the reason and the required next action; a step with no explanation is a defect, not an empty state.

## Practice

| Module | Route | Steps | Progress source | Runtime | Entry → terminal | Next action |
|---|---|---|---|---|---|---|
| Practice Overview | `overview` | Open → In progress → Closed | Derived dashboard metrics; each metric opens the exact filtered record list it counts. | No workflow | Open → Closed | Open the work queue that needs your decision |
| Client Portfolio | `clients` | Open → In progress → Closed | ClientRecord.status and the open PBC requests for the client. | Module step indicators — Client 360 exposes the request loop; the shared tracker is not yet rendered here. | Open → Closed | Open a client to see its engagements |
| Client 360 | `client-detail` | Requested → Received → Under review → Accepted | PbcRequestItem.status per request and the shared documents actually published. | Module step indicators | Requested → Accepted | Respond to the open PBC request |
| Acquisition & Pipeline | `acquisition` | Open → In progress → Closed | LeadOpportunity.stage per opportunity. | Module step indicators | Open → Closed | Qualify the lead and prepare terms |
| Proposals & Terms | `proposals` | Draft → Submitted → In review → Approved → Effective | ProposalRecord.state, commercialReview and the pinned presented revision. | Module step indicators | Draft → Effective | Send the reviewed proposal to the client |
| Engagements | `engagements` | Accepted → Planned → Risks & programs → Fieldwork → Findings resolved → Review cleared → Completion → Released | professionalAcceptance, the approved audit plan, linked risks, cleared workpapers, finding dispositions, cleared review points, the four generation-bound sign-offs and the release records. | Derived tracker rendered | Accepted → Released | Confirm acceptance and open the engagement job |
| Acceptance & KYC | `onboarding` | Draft → Submitted → In review → Approved → Effective | AcceptanceCaseRecord screening evidence, decision and the linked continuance case. | Module step indicators | Draft → Effective | Complete screening evidence and obtain partner acceptance |

## Work & Collaboration

| Module | Route | Steps | Progress source | Runtime | Entry → terminal | Next action |
|---|---|---|---|---|---|---|
| Jobs & Tasks | `jobs` | Draft → Submitted → In review → Approved → Effective | JobRecord.status and the completion of its subtasks. | Module step indicators | Draft → Effective | Complete the overdue tasks on the open job |
| Job Templates | `job-templates` | Draft → Submitted → In review → Approved → Effective | JobTemplateItem.status per template version. | Module step indicators | Draft → Effective | Publish the template so it can be applied to a job |
| Documents & SharePoint | `documents` | Requested → Received → Under review → Accepted | DocumentItem.version, availability and whether a request response is outstanding. | Module step indicators | Requested → Accepted | Resolve the open client request |
| Team & Client Comms | `communications` | Open → In progress → Closed | CommunicationItem.status (simulated outcome) per message. | No workflow | Open → Closed | Log the outstanding client correspondence |

## Economics & Billing

| Module | Route | Steps | Progress source | Runtime | Entry → terminal | Next action |
|---|---|---|---|---|---|---|
| Time Tracking | `my-time` | Draft → Submitted → In review → Approved → Effective | TimeEntryItem.status per entry, excluding superseded correction revisions. | Module step indicators | Draft → Effective | Submit the week for review |
| Budgets & Variances | `budgets` | Draft → Submitted → In review → Approved → Effective | BudgetRecord version against the engagement context it was saved under. | Module step indicators | Draft → Effective | Submit the budget for approval |
| Billing & Invoices | `billing` | Draft → Submitted → In review → Approved → Effective | InvoiceRecord.status per invoice and CreditNoteRecord.status per credit note. | Module step indicators | Draft → Effective | Approve or return the draft invoice |
| Receivables & Receipts | `receivables` | Draft → Submitted → In review → Approved → Effective | ReceiptRecord allocations against each issued invoice, as of a selectable date. | Module step indicators | Draft → Effective | Allocate the unapplied receipt |

## Accounting Workbench

| Module | Route | Steps | Progress source | Runtime | Entry → terminal | Next action |
|---|---|---|---|---|---|---|
| Accounting Workbench | `accounting-setup` | Imported → Validated → Mapped → Derived → Reviewed | ClientAccountingProfile revision state. | Module step indicators | Imported → Reviewed | Import the current trial balance |
| Trial Balance | `trial-balance` | Imported → Validated → Mapped → Derived → Reviewed | Accepted source revision and whether a replacement preserved the predecessor. | Module step indicators | Imported → Reviewed | Validate and confirm the imported source revision |
| GL Transactions | `gl-transactions` | Imported → Validated → Mapped → Derived → Reviewed | GLSourceRevision state and verifyGLCompleteness results. | Module step indicators | Imported → Reviewed | Map the unfamiliar GL columns and reconcile to the trial balance |
| Account Mappings | `account-mappings` | Imported → Validated → Mapped → Derived → Reviewed | AccountMappingRevision.status per revision. | Module step indicators | Imported → Reviewed | Obtain independent mapping approval |
| Adjustment Journals | `adjustments` | Draft → Submitted → In review → Approved → Effective | AdjustmentJournalItem.status and reflectionStatus against a named source version. | Module step indicators | Draft → Effective | Route the journal through technical review |
| Reconciliations | `reconciliations` | Draft → Submitted → In review → Approved → Effective | ReconciliationSchedule.status per revision and its residual. | Module step indicators | Draft → Effective | Clear the open residual with evidence |
| Financial Statements | `financial-statements` | Imported → Validated → Mapped → Derived → Reviewed | StatementSetRevision.status with the source, mapping, layout and comparative revision it was saved against. | Module step indicators | Imported → Reviewed | Save and independently review the statement revision |
| Financial Packages | `financial-packages` | Calculated → Validated → Management approved → Accounting reviewed → Partner review → Released | The saved revision, validation.passed, its source/mapping/generation lineage, the management decision, the generation-bound sign-offs and the release records. | Derived tracker rendered | Calculated → Released | Complete the outstanding package approval |
| Group Consolidation | `consolidation` | Perimeter → Components pinned → FX applied → Eliminations → Run complete → Reviewed | Perimeter revision, pinned component snapshots, FX rate versions, elimination review states and the output review. | Module step indicators | Perimeter → Reviewed | Review the consolidation run output |

## Audit & Assurance

| Module | Route | Steps | Progress source | Runtime | Entry → terminal | Next action |
|---|---|---|---|---|---|---|
| Audit Planning & Materiality | `audit-planning` | Draft → Submitted → In review → Approved → Effective | AuditPlanRecord.status per plan revision. | Module step indicators | Draft → Effective | Obtain independent plan review |
| Risks & Audit Programs | `audit-risks` | Draft → Submitted → In review → Approved → Effective | AuditRiskItem revisions plus linkedProcedureIds coverage; template status per version. | Module step indicators | Draft → Effective | Approve the risk revision and its programme |
| Audit Fieldwork | `audit-fieldwork` | Draft → Submitted → In review → Approved → Effective | AuditProcedureItem.status and its revision history. | Module step indicators | Draft → Effective | Complete the open procedure |
| Sampling & Populations | `sampling` | Draft → Submitted → In review → Approved → Effective | SamplePopulationItem frame reconciliation, selection count and per-item test results. | Module step indicators | Draft → Effective | Select and document the sample |
| Audit Workpapers | `audit` | Draft → Submitted → In review → Approved → Effective | WorkpaperItem.status per revision, excluding not-applicable items. | Module step indicators | Draft → Effective | Clear the workpaper with a reviewer |
| Evidence Catalogue | `evidence` | Draft → Submitted → In review → Approved → Effective | EvidenceItem.adequacyStatus and the availability of the referenced document. | Module step indicators | Draft → Effective | Determine the adequacy of the pending evidence |
| Findings & Differences | `findings` | Draft → Submitted → In review → Approved → Effective | FindingItem.disposition plus the shared release-blocking rule and any reopened review point. | Module step indicators | Draft → Effective | Obtain an independent response review |
| Review Desk | `reviews` | Draft → Submitted → In review → Approved → Effective | ReviewNoteItem.status per note. | Module step indicators | Draft → Effective | Clear or return the open review point |
| Sign-offs & EQR | `approvals` | Draft → Submitted → In review → Approved → Effective | engagement.approvals (manager, client, partner, EQR) bound to the current generation. | Module step indicators | Draft → Effective | Record the outstanding independent sign-off |
| Engagement Quality Review | `quality` | Draft → Submitted → In review → Approved → Effective | EQR assignment and the open/resolved state of each EQR concern. | Module step indicators | Draft → Effective | Record EQR concurrence |
| Release & Completion | `delivery` | Calculated → Validated → Management approved → Accounting reviewed → Partner review → Released | evaluateReleaseReadiness, the release candidate manifest and the issued release records. | Module step indicators | Calculated → Released | Confirm the release candidate and dispatch |
| Records & Archive | `records` | Open → In progress → Closed | ArchiveRecord retention state and handover history. | No workflow | Open → Closed | Open the archived record index |

## Client Services & Admin

| Module | Route | Steps | Progress source | Runtime | Entry → terminal | Next action |
|---|---|---|---|---|---|---|
| Report Centre | `reports` | Open → In progress → Closed | Deterministic report rows; each report states the scope it covers. | No workflow | Open → Closed | Generate the practice report |
| Firm Administration | `administration` | Open → In progress → Closed | Identity status, grant lifecycle and firm-settings revisions. | No workflow | Open → Closed | Review the access grants |
| Microsoft 365 Setup | `m365-setup` | Open → In progress → Closed | Per-capability simulated configuration status and invitation states. | No workflow | Open → Closed | Confirm the simulated configuration |
| Client Portal Preview | `portal` | Requested → Received → Under review → Accepted | The states of the shared requests, documents, packages and invoices actually visible to the client. | No workflow — The portal mirrors permitted records; it owns no workflow of its own. | Requested → Accepted | Review the shared records only |
| Firm Administration | `services` | Open → In progress → Closed | Alias of administration. | No workflow | Open → Closed | Use Firm Administration |
| Requirements & PRD | `role-guide` | Open → In progress → Closed | Alias of requirements. | No workflow | Open → Closed | Use Requirements & PRD |
| Module Guide & Tour | `module-guide` | Open → In progress → Closed | No workflow: presenter guidance over the shipped route registry. | No workflow | Open → Closed | Open the guided route for a module |
| Requirements & PRD | `requirements` | Open → In progress → Closed | No workflow: the original backlog and module map are fixed reference data. | No workflow | Open → Closed | Read the supported scope and exclusions |

## Coverage

- Routes registered: 44
- Declared lifecycle models: 7
- Screens rendering the shared derived tracker: 2
- Screens showing the module's own step indicators: 31
- Screens with no workflow to track: 11
- Routes with no declared progress source: 0

## Where the tracker is rendered today

The shared `WorkflowProgressTracker` is rendered where a module can derive every step from
records it already owns:

| Screen | Steps | Section each step opens |
|---|---|---|
| Engagements | 8 — Accepted → Planned → Risks & programs → Fieldwork → Findings resolved → Review cleared → Completion → Released | Accepted → `#onboarding`; Planned → `#audit-planning`; Risks & programs → `#audit-risks`; Fieldwork → `#audit`; Findings resolved → `#findings`; Review cleared → `#reviews`; Completion → `#approvals`; Released → `#delivery` |
| Financial Packages | 6 — Calculated → Validated → Management approved → Accounting reviewed → Partner review → Released | Calculated → `#financial-packages`; Validated → `#financial-packages`; Management approved → `#financial-packages`; Accounting reviewed → `#approvals`; Partner review → `#approvals`; Released → `#delivery` |

Every other stateful module already renders its own step or status indicators, which the
shared status vocabulary now tones consistently; moving those onto the shared tracker is
the remaining work recorded in `enterprise-ux-audit.md` as Partial.
