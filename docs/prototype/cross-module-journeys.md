# AuditSphere Visual Prototype — Cross-Module Journey Matrix (MOD-UX-01)

Recorded 2026-09-27 · `docs/prototype/cross-module-journeys.md`

Which end-to-end flows the prototype actually demonstrates, how the reader moves
between the modules that own each step, and which denial or rework path is
exercised alongside the happy path. Each row cites the executed browser evidence
in `tests/e2e/app.test.ts`; the run window is recorded in
[`verification.md`](verification.md).

Status vocabulary: **Demonstrated** (walked end-to-end in Chrome),
**Partial** (the steps exist and are individually evidenced, but the journey is
not walked as one continuous browser sequence), **Outside Scope**.

## How a reader moves between modules

| Handoff | Where it is offered | Guarded by |
|---|---|---|
| Client → Client 360 → Engagements | Client Portfolio card buttons; Client 360 tab "Engagements" → "Open" | `visibleClientIds`, `visibleEngagementIds` |
| Lead → Proposal → Engagement | Pipeline "Details" → convert; proposal response → engagement draft | `requireClientScope`, `requireIndependentActor` on proposal review |
| Engagement → Acceptance | Acceptance & KYC is keyed to the selected engagement | `hasSelectedEngagementScope` (App-level context gate) |
| Engagement → Jobs → Workpapers | Jobs & Tasks; workpaper evidence links back to the document | `requireEngagementScope('professional')` |
| Request → Response → Evidence → Workpaper | Client 360 PBC tab; Documents library; Evidence Catalogue links | PBC acceptance requires an independent staff act |
| TB → Mapping → Adjustments → Statements → Packages | Accounting Workbench sub-routes; "Generate Financial Statements"; package assembly | Mapping must be independently approved before derivation |
| Package → Release → Archive | Release & Completion → Records & Archive | Generation-bound approvals; a changed basis clears them |
| Audit Planning → Risks → Programs → Sampling → Workpapers → Findings → Review | Each audit module links forward to its successor | Role and revision gates per module |
| Time → Budgets → Invoice → Receipt → Aging | Time Tracking → Billing; "Draft New Invoice"; Receivables | Invoice review is independent; issued invoices are immutable |
| Group perimeter → components → FX → eliminations → output | Group Consolidation panels; consolidation output feeds packages | `hasConsolidationGroupScope`, `requireActiveConsolidationComponents` |
| Accounting Workbench → Reconciliations → Workpapers/Evidence/Findings | Journal support pins link to the exact evidence revision | Unavailable documents block linking atomically |

Shared navigation aids added by this work: the route index in the module guide
(every route with its lifecycle model and next step, permission-aware), the
identity line on engagement-scoped pages, and the lifecycle hint strip that states
how the module's work moves forward.

## A. Client to engagement

| Step | Module | Evidence |
|---|---|---|
| Register an inquiry and qualify it | Acquisition & Pipeline | AT-07 |
| Draft the proposal, obtain independent commercial review, present it | Proposals & Terms | AT-07 |
| Record the client's response against the **current presented revision** with evidence | Proposals & Terms | AT-08, AT-09, AT-56 |
| Create the engagement draft from accepted terms only | Engagements | AT-10 |
| Record acceptance evidence and activate | Acceptance & KYC → Engagements | AT-10 |
| Open the first job | Jobs & Tasks | AT-11 |

Denial / rework paths exercised: returning a proposal for revision requires a
reason; a response naming a superseded revision is refused; activation without
acceptance evidence is refused; a self-approved proposal is refused.

**Status: Demonstrated.**

## B. Request and evidence (PBC)

| Step | Module | Evidence |
|---|---|---|
| Raise the request and present it to the client | Client 360 / Documents | AT-23 |
| Client uploads a response | Client Portal Preview → PBC | AT-23, AT-25 |
| Staff review, then request clarification | Client 360 PBC tab | AT-23 |
| Client supplies a replacement revision | Client Portal | AT-23 |
| Staff accept independently | Client 360 | AT-23, AT-24 |
| Evidence is catalogued, linked to a procedure, and adequacy determined | Evidence Catalogue | AT-46, VP-053 |

Denial / rework paths exercised: acceptance by the preparer is refused; an
unavailable document blocks new links and sharing atomically; unlink history is
retained; internal identifiers never reach the client projection.

**Status: Demonstrated.**

## C. Accounting to release

| Step | Module | Evidence |
|---|---|---|
| Import the trial balance, then a GL file with an unfamiliar header | Accounting Workbench | AT-35, AT-36 |
| Validate, map by user mapping, reconcile openings and movements | Accounting Workbench | AT-36 |
| Approve the mappings independently | Account Mappings | AT-37 |
| Post and review an adjustment, then record management's decision | Adjustments | AT-38, VP-038-E01/E02 |
| Clear reconciliations with evidence | Reconciliations | AT-39 |
| Build and independently review the statements | Financial Statements | AT-37 |
| Assemble the package, present it to management, obtain review and partner approval | Financial Packages | AT-41/AT-42/AT-48 |
| Release and archive | Release & Completion → Records & Archive | AT-48 |

Denial / rework paths exercised: an unbalanced import is rejected atomically while
the accepted revision is preserved; a replacement statement stales the approved
reconciliation (v7 returned → v8 approved, both retained); a replaced evidence
reference stales an approved schedule and requires rework; a stale package cannot
be released; a forced generation failure saves no revision.

**Status: Demonstrated.**

## D. Audit lifecycle

| Step | Module | Evidence |
|---|---|---|
| Complete acceptance and screening | Acceptance & KYC | AT-10 area, VP-047 |
| Set materiality and team allocations, then obtain independent plan review | Audit Planning & Materiality | planning journey |
| Identify risks and publish / apply an audit programme | Risks & Audit Programs | AT-49-related, VP-049 |
| Import a population, select a sample, record testing and limitations | Sampling & Populations | sampling journeys |
| Prepare, submit and clear workpapers with evidence links | Audit Workpapers → Evidence Catalogue | AT-46, VP-053 |
| Raise findings, record reasoned dispositions, respond to review points | Findings → Review Desk | VP-054, VP-055, AT-55 |
| Complete sign-offs and EQR concurrence | Sign-offs & EQR | AT-47 |
| Release and archive | Release & Completion → Records & Archive | AT-48 |

Denial / rework paths exercised: selecting a sample on an unreconciled frame is
refused; a workpaper revision reopens cleared review notes; a finding's independent
response review is required before it can clear; EQR concurrence is a separate
record from manager/client/partner approval; a self-sign-off is refused.

**Status: Demonstrated.**

## E. Billing

| Step | Module | Evidence |
|---|---|---|
| Record and approve time, then correct it as a retained revision | Time Tracking | AT-28 |
| Check the budget against actuals | Budgets | budgets journeys |
| Draft an invoice from approved billable time or an accepted fixed fee | Billing & Invoices | AT-30/AT-31 area |
| Independent review, reasoned return, revision, approval | Billing & Invoices | VP-003-E02, AT-51 |
| Issue, then raise a credit note where needed | Billing & Invoices | AT-51 |
| Record a receipt, allocate it, reverse an allocation | Receivables | receivables journeys |
| Read as-of aging that reconciles to the outstanding list | Receivables / Practice Overview | aging journeys |

Denial / rework paths exercised: a returned invoice requires a reason and can be
revised but not rewritten after issue; a self-approved invoice is refused; a new
rate version never rewrites issued invoices; reversals are retained, not deleted.

**Status: Demonstrated.**

## F. Consolidation

| Step | Module | Evidence |
|---|---|---|
| Define the perimeter (one parent, one 100%-owned subsidiary) | Group Consolidation | AT-43 |
| Pin exact component packages and detect a changed source | Group Consolidation | AT-44 |
| Apply a dated closing rate, or block output when it is missing | Group Consolidation | AT-43 (FX) |
| Match intercompany balances, save and independently review an elimination | Group Consolidation | AT-45 |
| Complete the run and review the output package | Group Consolidation | AT-43/44/45 |
| Export the fingerprint-bound, digest-verified output | Group Consolidation | VP-046 |

Denial / rework paths exercised: a missing perimeter role blocks output by name; a
minority Interest profile is refused with no consolidated figures; a changed
component source raises a stale pin, keeps the old snapshot and requires an
explicit re-pin; an unmatched intercompany amount stays visible in group detail;
debit equity reduces the group grid correctly (F-SIGN-04).

**Status: Demonstrated.**

## G. Presenter journeys

The scenario chooser and presenter itinerary are unchanged, and the module guide
now publishes the full route index. The eight demonstration beats requested —
happy path, denial, return and rework, stale dependency, independent review, final
approval, release, archive — map onto the journeys above:

| Beat | Where it is demonstrated | Status |
|---|---|---|
| Happy path | any journey above | Demonstrated |
| Failure / denial | AT-35 unbalanced import; sampling on an unreconciled frame; self-approval refusals | Demonstrated |
| Return and rework | reconciliation v7→v8; returned time; returned invoice; returned proposal; reopened review notes | Demonstrated |
| Stale dependency | replaced statement → approved schedule stale; changed component source → stale pin; source advance → stale package (now explained by `StaleNotice`) | Demonstrated |
| Independent review | mapping, journal technical review, invoice, workpaper, finding, elimination, output, EQR | Demonstrated |
| Final approval | partner approval bound to an exact generation | Demonstrated |
| Release | readiness evaluation, exact manifest, simulated dispatch | Demonstrated (dispatch is a simulation) |
| Archive | archive with retention and handover history | Demonstrated |

## Journey-level gaps (recorded, not claimed)

- **No single scripted end-to-end tour.** The journeys above are evidenced as
  module sequences that a presenter walks manually; nothing in the product scripts
  or automates them, by design (workflow automation is an explicit exclusion).
- **Some handoffs are one-way.** Journal support pins and evidence links navigate
  forward; there is no back-link from a finding to the exact journal line, so a
  presenter navigates back through the accounting module.
- **Filing and dispatch remain simulated.** Release dispatch and mail outcomes
  record local state only.
