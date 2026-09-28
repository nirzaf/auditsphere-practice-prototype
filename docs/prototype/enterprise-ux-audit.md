# AuditSphere Visual Prototype — Enterprise UX Audit (39 modules)

`docs/prototype/enterprise-ux-audit.md` · recorded 2026-09-27 · companion documents:
[design-system.md](design-system.md) (vocabulary), [lifecycle-matrix.md](lifecycle-matrix.md) (generated
lifecycles plus the 39-row `Module | Steps | Current State | Completed | Pending | Blocked | Review/Rework | Role/Scope | Dependencies | Next Action` matrix), [remaining-limitations.md](remaining-limitations.md) (canonical limits — not duplicated here).

Scope and honesty: this is an enhancement of the accepted browser-only prototype, not a rewrite. No store
command, guard, calculation, migration or scenario was removed or weakened; two display-scope defects were
fixed (§3). Status words below follow the repository's evidence discipline: **Verified** = covered by an
executed automated test in this change; **Regression** = behaviour unchanged and still covered by the existing
suite; **Partial** = improved but not every item in the spec's module acceptance standard is demonstrated;
**Outside scope** = excluded by [`scope.md`](scope.md). Executed results are recorded in
[verification.md](verification.md).

## 1. Cross-cutting changes (apply to every routed module)

| Area | Before | After | Evidence |
|---|---|---|---|
| Progress & Six Questions | No screen-level progress or remaining work visible | Visible `WorkflowProgress` stepper, real-state percent complete bar, counts pill (Done · Pending · Blocked · Rework), and drawer answering: Where am I? What is complete? What is pending? What is blocked? What can I do next? Who acts next? | `workflowProgress.test.ts` unit suite; E2E `UX-ENT-05` |
| Status presentation | `.badge` used at 136 call sites was never defined in CSS — statuses rendered as plain text; each module picked its own colours | Shared `statusSemantics.ts` (every status literal in `src/types` mapped, unit-tested) + `StatusBadge` (text + glyph + tone); legacy `.badge` defined with the same tones | `enterpriseUx.test.ts` “maps every declared status…” |
| Breadcrumb / context | `Workspace / ROUTE-KEY` | `Section / Module [ROUTE CODE]`; context bar adds the last loaded scenario | E2E crumb assertions (unchanged) |
| Undefined CSS | `.tab-btn` (12 modules, 36 tabs), `.modal-overlay/.modal-card` (4 dialogs), `.modal-foot` (all dialog footers incl. “Unsaved changes”), `metric-label/val/sub` (10 modules), `.grid4`, `.text-danger`, spacing utilities | All defined; tabs expose `aria-pressed`; dialogs render as proper overlays | Visual review 1440 px; CLOSE-J12 overflow test |
| Notices | 17 hand-rolled notice blocks with inline colours; Documents and Client Portal showed **errors in green success styling** | Shared `Notice` (errors/warnings `role="alert"`, success `role="status"`, dismissible); Documents/Portal notices carry the correct tone | Regression suite |
| Empty states | Mixed ad-hoc rows | `EmptyState` / `EmptyTableRow` with none / filtered / scope variants (scope never reveals restricted counts) | UX-ENT-01; regression |
| Destructive / terminal actions | Bare “Reason?” prompts; `window.alert` errors in Engagements | Every reason prompt states impact, what is kept, and reversibility (`terminalActions.ts`); Engagements shows errors inline (page or dialog) | Regression (prompt stubs unchanged) |
| Lifecycle guidance | Separate Module Guide route only | Collapsed “How this module works” strip on every staff route from `moduleGuideContent.ts` + lifecycle paths | `enterpriseUx.test.ts` guide coverage; UX-ENT-04 |
| Dashboard work queues | Portfolio metrics only | Six role queues (My work, Waiting for my review, Returned to me, Waiting on client, Blocked or stale, Ready for release) — scoped projections, counts equal lists | `enterpriseUx.test.ts` queues; UX-ENT-01 |
| Responsive | Detail panes squeezed into the narrow column (Jobs, Workpapers); bare selects | `master-detail` layout, compact filter grid, unclassed-control styling; block-level badges wrap | CLOSE-J12 (1440/1024/390 px, every staff route) |

## 2. Module audit

Legend for the “States verified” column: **R** role/SoD, **F** failure/denial, **W** rework/return, **S** stale,
**T** terminal. “Regression” means the existing suite still exercises it after the redesign.

| # | Module | UX issues found | Lifecycle surfaced | Changes implemented | Shared components | States verified | Responsive | A11y | Tests / evidence | Remaining |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Practice Dashboard | Marketing-sized headline, undefined badge classes, blank calendar icon, tall filter form, no role queues | Engagement stage badges | Work queues with drill-down lists, compact filter bar, persona/scope line, compact metrics, empty variants | StatusBadge, EmptyTableRow, queues | R F (scope), reconciliation | Verified (CLOSE-J12) | Partial | UX-ENT-01; VP-005 | Headline copy kept because it is an asserted contract |
| 02 | CRM & Client 360 | Unstyled tabs and status text | Client status; PBC in Client 360 | Status badges, empty variants, styled tabs, guide | StatusBadge, EmptyTableRow | Regression | Verified | Partial | VP-008-E01 | No client-level lifecycle panel |
| 03 | Leads & Opportunities | Stage as plain text | `lead` | Stage badge + stepper; terminal note for Lost/Unqualified | LifecycleStepper | Regression (AT-07) | Verified | Partial | AT-07/AT-08 | — |
| 04 | Proposals & Engagements | Every proposal state in one blue badge; returned drafts looked new; `window.alert` errors | `proposal`, `engagement` (existing lifecycle bar) | Semantic states + Returned flag; consequence-stating lifecycle prompts; inline page/dialog errors; scope empty state | StatusBadge, Notice, EmptyState | R F W T (regression) | Verified | Partial | AT-58, AT-09, AT-10, VP-012 | Native prompt for reason text (see limitations) |
| 05 | Jobs & Tasks | Cramped detail, bare filter selects, blocked reason as grey caption | `job` | Master/detail layout, compact filters, job status + overdue badges, distinct blocked lines, consequence prompts | StatusBadge | R F T (regression) | Verified | Partial | VP-014 regression, VP-003 guards | — |
| 06 | Job Templates | Retire prompt without impact | `job-template` | Consequence prompt, notices | Notice | Regression | Verified | Partial | Regression | — |
| 07 | Team Collaboration | — | Notes/mentions | Notices, guide | Notice | Regression | Verified | Partial | AT-14 | Local notices only (scope) |
| 08 | Client Portal | Errors shown in teal success style | Portal requests | Error/success tones, empty rows | Notice, EmptyTableRow | R (portal disclosure regression) | Verified | Partial | VP-025 tests | Staff preview shows presenter guide; client personas do not |
| 09 | Client Requests / PBC | Filtered vs none empty states conflated visually; no overdue marker | `pbc` | None/filtered empty states, overdue badge, consequence prompt on cancel | EmptyTableRow, StatusBadge | F W T (regression) | Verified | Partial | AT-23/AT-24 | — |
| 10 | Document Management | Errors in green; bare sharing/unavailable prompts | Document availability | Correct notice tones; consequence prompts | Notice | Regression | Verified | Partial | VP-061-E02 | Originals remain in-session (scope) |
| 11 | Communications | Simulation outcome as plain text | Mail outcome | Simulation kind (indigo, dashed) distinct from real completion | StatusBadge | Regression | Verified | Partial | AT-26 | Mail is simulated (scope) |
| 12 | Time Tracking | Return reason in raw red text; KPI classes undefined | `time` | Returned badge + reviewer, correction revision chain, SoD reason, empty row | StatusBadge, ActionReason | R W (unit + AT-28) | Verified | Partial | AT-28; queue unit test | — |
| 13 | Budgets | Authoring dialog rendered without overlay styles | `budget` | Styled dialog, tabs, KPI classes | Notice | Regression | Verified | Partial | AT-29, AT-59 | — |
| 14 | Billing & Invoicing | **Register showed invoices outside the persona's grant**; statuses plain; SoD denial only after clicking | `invoice`, `credit-note` | Scope fix (shared `scopedInvoices`), lifecycle detail + history timeline, SoD reasons, revision/returned badges, numeric cells | LifecyclePanel, ActivityTimeline, ActionReason | R F W T | Verified | Partial | UX-ENT-02; AT-30/AT-31; unit scope test | — |
| 15 | Receivables | KPI classes undefined | Aging | Notices, empty row | Notice, EmptyTableRow | Regression | Verified | Partial | AT-32/AT-33 | — |
| 16 | Reporting & Analytics | Drill-down dialog unstyled | — | Styled dialog, KPI classes | — | Regression | Verified | Partial | AT-49/AT-60 | — |
| 17 | Search & Client View | Crumb showed raw key | — | Breadcrumb; search unchanged (already scope-filtered) | — | Regression | Verified | Partial | F01, VP-061 | — |
| 18 | Microsoft 365 Setup | — | `m365` | Guide, notices | — | Regression | Verified | Partial | AT-15/AT-16 | Simulation only (scope) |
| 19 | Identity & Access | Dialogs unstyled; revoke prompt bare | `invitation` | Styled dialogs/tabs, consequence prompt | StatusBadge | Regression | Verified | Partial | AT-17/AT-18 | — |
| 20 | Accounting | Tabs unstyled | — | Styled tabs, guide | — | Regression | Verified | Partial | Regression | — |
| 21 | Trial Balance & GL | — | `mapping` | Guide, styled badges | — | Regression | Verified | Partial | AT-35, AT-36 | — |
| 22 | Adjustments & Journals | **Journals of every engagement listed (and counted) under the selected engagement** | `adjustment` | Engagement-scoped list, lifecycle stepper and history timeline (review, management decision, amendments, reflection) per journal | LifecycleStepper | F S (regression) | Verified | Partial | UX-ENT-03; AT-38; VP-038 | — |
| 23 | Reconciliations | Stale shown only as a status word | `reconciliation` | Stale banner (source vN → vM, affected, preserved, required) | StaleBanner | S W (regression) | Verified | Partial | VP-039 | — |
| 24 | Financial Statements | Stale revision only in a status line | `statement-set` | Stale banner naming the moved source/mapping/layout | StaleBanner | S (regression) | Verified | Partial | AT-37, review F-01 | — |
| 25 | Financial Packages | “TB vnot assembled” text bug; unstyled gate badges; stale as four paragraphs | `package`, `disclosure` | Lifecycle panel, stale banner, gate list with original gate wording, handoff links, assemble reason | LifecyclePanel, StaleBanner, GateList, ActionReason | F S (regression) | Verified | Partial | AT-41/AT-42/AT-48; AT-52 | — |
| 26 | Consolidation | Tabs unstyled; rework note inline-coloured | `consolidation-elimination`, `consolidation-output` | Elimination stepper, rework note, styled tabs | LifecycleStepper | W S (regression) | Verified | Partial | AT-43/44/45 | One parent + one subsidiary (scope) |
| 27 | Client Acceptance | — | `acceptance` | Notices, badges | Notice | Regression | Verified | Partial | AT-44/VP-047 | — |
| 28 | Audit Planning | Tabs unstyled; plan state only as a badge | `audit-plan` | Lifecycle panel (version, reviewer, return notes), empty state, empty rows | LifecyclePanel, EmptyState | W (regression) | Verified | Partial | VP-048/VP-049 | — |
| 29 | Risks & Audit Programs | Tabs unstyled | `audit-procedure`, `audit-program-template` | Styled tabs, consequence prompt for fieldwork return | — | W (regression) | Verified | Partial | VP-049 | — |
| 30 | Audit Fieldwork | (shares 29) | `audit-procedure` | (shares 29) | — | Regression | Verified | Partial | VP-048 | — |
| 31 | Populations & Sampling | — | `sample` | Guide, styled badges | — | Regression | Verified | Partial | VP-051 | — |
| 32 | Workpapers | Detail squeezed into the narrow column; no “what changed” view | `workpaper` | Master/detail, lifecycle panel with blockers, deterministic changes-since-review, combined history timeline (submissions, clearances, reassignments, evidence links), handoff links, consequence prompts | LifecyclePanel, reviewDiff | R W S | Verified | Partial | UX-ENT-04; reviewDiff unit tests; VP-052 | — |
| 33 | Evidence | — | `evidence` | Notices, badges | Notice | Regression | Verified | Partial | AT-46 | — |
| 34 | Findings & Differences | Blank severity pill and empty Category/Condition/Recommendation fields | `finding` | Explicit “Unclassified / Not recorded”, linked-record navigation | — | Regression | Verified | Partial | VP-054 | — |
| 35 | Review Points | **Author and Review Query columns blank for seeded notes**; subject not navigable | `review-note` | Author/query fallbacks, subject link to exact workpaper/finding, due/severity/overdue, history timeline, empty variants | ActivityTimeline, EmptyTableRow | R W | Verified | Partial | UX-ENT-04; AT-55; VP-055 | — |
| 36 | Reviews & Approvals (EQR) | Sign-off chain only as separate cards | `approval` | Sign-off lifecycle panel: who is next, stale approvals kept in history | LifecyclePanel | S (regression) | Verified | Partial | AT-47 | Approvals are recorded decisions, not signatures (scope) |
| 37 | Completion & Release | Gate state conveyed by icon colour only | `release` | Lifecycle panel; explicit Passed/Blocked per gate | LifecyclePanel, StatusBadge | F (regression) | Verified | Partial | VP-057-AC01 | Dispatch is simulated (scope) |
| 38 | Records & Archive | Dialog unstyled | `archive` | Styled dialog/tabs, notices | Notice | Regression | Verified | Partial | VP-059 regression | Logical archive only (scope) |
| 39 | Administration | Dialogs/tabs unstyled | `invitation` | (shares 19) | — | Regression | Verified | Partial | Regression | — |

## 3. Defects fixed during the audit (not presentation-only)

1. **Billing register scope** — the register listed every invoice regardless of grant (e.g. the ENG-26001-only
   persona saw an ENG-26002 invoice). Fixed with the shared `scopedInvoices` guard helper used by both the
   register and the navigation count. Unit + E2E (UX-ENT-02) tests.
2. **Adjustment journal context** — the workbench listed and counted journals from every engagement under the
   selected engagement. Now scoped to the selected engagement. E2E UX-ENT-03.
3. **Display defects** — “TB vnot assembled”, blank Review Desk author/query columns, blank finding fields,
   error notices styled as success in Documents and Client Portal.

### Priority Workflow & Progress Defect Classifications (FIX-01 to FIX-07)

Following the audit and analysis of operational workflows, seven priority defects were identified and resolved, selectively adapting progress-tracking concepts while preserving the pure browser-only prototype architecture and prototypeStore authority:

- **FIX-01: Section 5 Aggregator Math & Non-Linear Workflows (`src/services/workflowProgress.ts`)**
  - *Defect:* Ad-hoc percentages across modules were fabricated or failed to reconcile to actual state counts; 0/0 calculations displayed 100% complete for reference views.
  - *Fix:* Replaced fabricated percentages with pure `aggregateWorkflowSteps` adhering strictly to Section 5 progress calculation math: `applicable = completed + current + pending + blocked + returned + stale + skipped`, `percent = 100 * completed / applicable`. Not-applicable items are separated from completed work; 0/0 returns `null` ("Reference view" / "No linear workflow applies"). Displayed integer is capped below 100% whenever unresolved items exist, displaying 100% only when all applicable required units are complete. Covered by unit tests T01, T03, T18, T19.
- **FIX-02: Accounting Domain Selectors & Route Aliases (`src/services/workflowProgress.ts`)**
  - *Defect:* Accounting sub-routes lacked distinct state-reading selectors and defaulted to generic metrics; legacy and nested route aliases produced disconnected progress.
  - *Fix:* Implemented 9 distinct state selectors for `accounting-setup`, `trial-balance`, `gl-transactions`, `account-mappings`, `adjustments`, `reconciliations`, `financial-statements`, `financial-packages`, and `consolidation`. Mapped canonical route aliases (`client-portal`, `crm`, `audit-acceptance`, `reporting-centre`) to their target selectors. Added terminal state handling for cancelled and suspended engagements. Covered by unit tests T04, T13, T14.
- **FIX-03: Security & Non-Disclosure Bounds (`src/services/workflowProgress.ts`)**
  - *Defect:* Consolidation progress leaked confidential component names or figures when a user lacked full group-level grants.
  - *Fix:* Enforced narrow consolidation grant boundaries via `hasConsolidationGroupScope`. When `!fullyGranted`, renders a blocked perimeter state with `percentComplete: null` and generic labels, preventing disclosure of restricted subsidiary entities or figures while satisfying AT-43 assertions. Covered by unit tests T02, T08, T09 and E2E AT-43.
- **FIX-04: Lineage & Stale Approval Invalidation (`src/services/workflowProgress.ts`)**
  - *Defect:* Prior-generation approvals or released v1 packages were counted as completing unreviewed v2 revisions; rework states did not isolate affected steps.
  - *Fix:* Enforced package and statement lineage tracking so approvals on historical generations never complete current generations. Isolated return -> revision -> resubmit transitions so only affected steps reflect rework. Covered by unit tests T05, T06, T12.
- **FIX-05: False Positive Save Detection (`src/components/modules/BillingInvoicingView.tsx`)**
  - *Defect:* In draft save workflows, save detection relied on array length or global record count changes rather than verifying that the exact created record was persisted.
  - *Fix:* Updated `saveInvoiceDraft` and `saveCreditDraft` to record initial record IDs in a `Set` before action (`previousIds = new Set(...)`) and verify the newly created record ID (`!previousIds.has(item.id)`). Covered by unit tests T10, T11.
- **FIX-06: Context Guards & Route Switching (`src/App.tsx`)**
  - *Defect:* Accessing an engagement-specific route when `selectedEngagement` was expired or unauthorized displayed an engagement-unavailable placeholder, but the progress bar and guide strip still attempted to read engagement context, risking restricted data leakage.
  - *Fix:* Guarded `WorkflowProgress` and `ModuleGuideStrip` with `!isEngagementContextUnavailable` when `ENGAGEMENT_CONTEXT_ROUTES.has(effectiveRoute) && !hasSelectedEngagementScope(state)`. Covered by unit tests T02, T07, T15 and E2E VP-003-AC01.
- **FIX-07: Presentation Semantics & Keyboard Accessibility (`src/components/common/WorkflowProgress.tsx`)**
  - *Defect:* Stepper used `<button>` tags within `<nav>` tags, colliding with E2E harness selectors for sidebar navigation (`document.querySelectorAll('nav button')`) and page tabs (`clickButton(...)`); compact view required opening a drawer to see next actions.
  - *Fix:* Replaced stepper `<nav>` with `<div role="region" aria-label="Workflow progress stepper" className="wp-stepper-nav">`. Step items render as `<li className="wp-step ..." role={isClickable ? 'button' : undefined} tabIndex={isClickable ? 0 : undefined}>` with Enter and Space key handling, eliminating DOM query collisions while retaining full keyboard accessibility. Added a compact callout strip displaying `nextAction`, `whoActsNext`, and immediate blocker directly in compact mode. Standardized Module 37 naming to 'Release & Completion'. Handled `percentComplete: null` gracefully. Covered by unit tests T16, T17, T20 and E2E UIX-06, UX-ENT-05.

## 4. Cross-module journey matrix

| Journey | Path | Demonstrated by (executed) | Handoffs added | Status |
|---|---|---|---|---|
| A. Client → Engagement | Lead → Client → Proposal → Review → Client response → Engagement → Activation → Job | AT-07/AT-08, AT-58, AT-09, AT-10, AT-52 | Lead stage stepper; proposal Returned flag; engagement consequence prompts | Demonstrated in segments (existing tests); denial/rework: AT-58 return + revise |
| B. PBC / Evidence | Request → Present → Upload → Review → Clarification → Replacement → Acceptance → Evidence | AT-23/AT-24, VP-061-E02, AT-46 | Overdue flag; none/filtered empty states | Demonstrated (AT-23/AT-24 end to end) |
| C. Accounting | TB import → Validation → Mapping → Adjustments → Statements → Package → Review → Release | AT-35, AT-36, AT-37, AT-38, VP-039, AT-41/42/48, AT-52, VP-057 | Package → TB / mappings / statements / review / sign-offs / release links; stale banners | Demonstrated in segments; rework: AT-38, VP-038, stale package (AT-41) |
| D. Audit | Acceptance → Planning → Risk → Program → Population → Sampling → Workpaper → Finding → Review → Completion | AT-44/VP-047, VP-048/049, VP-051, VP-052, VP-054, VP-055, AT-55, AT-47, VP-057 | Review point → exact workpaper; finding → workpaper/journal/evidence/procedure/sample; workpaper → reviews/evidence/findings/program | Demonstrated in segments; rework: VP-055 reopen, UX-ENT-04 |
| E. Billing | Approved time → Draft invoice → Review → Return → Revision → Approval → Issue → Receipt → Allocation → Aging | AT-28, AT-30, AT-31, lifecycle closure (reasoned return), AT-32/AT-33 | Invoice detail → receivables / source time / proposal; SoD reasons | Demonstrated in segments; denial: AT-31 self-approval |
| F. Consolidation | Perimeter → Components → FX → Intercompany → Eliminations → Run → Review → Output | AT-43 (4 tests), AT-44, AT-45, VP-045-AC03, VP-003-E02 | Elimination stepper + rework note | Demonstrated in segments; rework: AT-45 return + approve |

No single automated test walks an entire journey A–F from first to last step; each is covered by the listed
executed segments. This is recorded as a limitation, not claimed as full end-to-end automation.
