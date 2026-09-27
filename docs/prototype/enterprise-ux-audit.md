# AuditSphere Visual Prototype — Enterprise UX Audit (MOD-UX-01)

Recorded 2026-09-27 · `docs/prototype/enterprise-ux-audit.md`

Audit of the browser prototype at the tree recorded in
[`verification.md`](verification.md). Each row states what was found, what was
changed, and what remains. Status vocabulary is the repository's own:
**Implemented**, **Verified**, **Demonstrated**, **Partial**, **Blocked**,
**Simulated**, **Outside Scope**.

Companion documents: [lifecycle matrix](lifecycle-matrix.md) ·
[cross-module journeys](cross-module-journeys.md) ·
[design system](design-system.md) ·
[limitations](remaining-limitations.md).

## Method

1. Read every routed view, the shell, the store command boundary and the guards.
2. Measured the UI vocabulary in the shipped source: page-header usage, status
   rendering, empty-state copy, and every `className` against the stylesheets.
3. Fixed the shared layer first, then applied it module by module, re-running
   `tsc`, the unit suites and the full Chrome suite after each batch.
4. Recorded what could **not** be verified rather than claiming it.

## Findings that affected every module

| # | Finding | Evidence | Resolution |
|---|---|---|---|
| F-1 | 28 style classes were referenced by views but defined in no stylesheet, so the markup rendered unstyled: `badge`, `grid-2`/`grid-3`/`grid4`, `modal-overlay`/`modal-card`/`modal-content`, `global-search-dialog`, `mt4`/`mb8`/`mb12`/`ml8`, `metric-val`/`metric-label`/`metric-sub`, `xs`, `warning`/`success` and others | static class inventory vs `styles.css`/`roles.css` | Implemented in `src/enterprise.css`; a unit test now fails on any undefined class |
| F-2 | Every module invented its own wording and tone for the same business state; `Draft` in one view looked like `Stale` in another | 39 views | Implemented: one tone vocabulary in `src/services/lifecycle.ts`, rendered by `StatusBadge` |
| F-3 | A page title could be an `h1`, an `h2` or a panel heading depending on the module | heading inventory | Implemented: one `h1` per page, asserted in the browser on every route |
| F-4 | Views could not say which client, engagement, period or revision the reader was looking at | header markup | Implemented: store-derived identity line through `ModuleIdentityLine` |
| F-5 | "No records exist" and "no records match these filters" were usually the same sentence | empty-copy inventory | Implemented: `ListState` distinguishes empty / no-match / out-of-scope / error |
| F-6 | Staleness was reported as a bare word next to a revision number | package and statement markup | Implemented: `StaleNotice` names the movement, the impact, the preserved history and the required action |
| F-7 | No module registered what it governs, how its journey ends, or where the work continues | — | Implemented: `src/services/routeRegistry.ts` registers all 44 routes |
| F-8 | No screen showed what was complete, what remained, or what was blocked: the Engagements view drew its "lifecycle bar" from a positional index, so a blocked, returned or stale step could only ever render as "current" | `EngagementsView` `currentStepIndex` | Implemented (MOD-UX-02): `deriveWorkflowProgress` + `WorkflowProgressTracker`, with per-module journey derivations that read named record fields |

## Module-by-module audit

`Identity` = renders the shared client/engagement/period line · `LC` = renders its
lifecycle hint · `Status` = uses the shared status badge · `Lists` = distinguishes
empty from no-match.

| Module (route) | Current UX issues found | Lifecycle supported | Changes implemented | Shared components reused | Role states verified | Failure / rework verified | Responsive | Accessibility | Tests / evidence | Remaining limitation |
|---|---|---|---|---|---|---|---|---|---|---|
| Practice Overview (`overview`) | metric cards stated a count with no confirmation of which records they covered; stage badge used an undefined class | deterministic projection, no journey | metric cards gained drill-through labels; stage shown via shared badge; cards reconcile metric → filtered list (existing behaviour retained) | StatusBadge, ListState, MetricCard | VP-005 scoped-manager / preparer / partner / billing sweeps | zero-scope and out-of-scope dashboards show explicit empty lists | Verified 1440/1024/390 by the route sweep | one `h1`, metric `aria-label` includes count and detail | `app.test.ts` VP-005; harness; MOD-UX-01 sweep | none added; dashboard is still a projection, not a work queue with assignment actions |
| Client Portfolio (`clients`) | a filtered search could look like an empty practice | Prospect → Active → Suspended → Archived | shared header, status badge, and a list state that separates "no clients yet" from "no clients match these filters" with the count that exists in scope | StatusBadge, ListState, ModuleIdentityLine | relationship / manager / partner create; scope-filtered cards | suspended clients remain discoverable | Verified | labelled filter and status controls | `app.test.ts` AT-05/AT-06, VP-008-E01; harness | — |
| Client 360 (`client-detail`) | no page title in the page anatomy (record header was an `h2` inside a panel); no context line | one legal relationship register; PBC requests follow `request-response` | proper record header with a single `h1`, status badge, client id/code line and a client-scoped identity line that refuses another client's selected engagement | StatusBadge, ModuleIdentityLine, ListState | full tab sweep per client (VP-008-E01) | nomination review recorded without creating access | Verified across all 12 tabs | header focus order, labelled tabs | `app.test.ts` VP-008-E01, AT-05/AT-06; MOD-UX-01 sweep | the identity line reports client-level facts when the selected engagement belongs elsewhere (by design) |
| Acquisition & Pipeline (`acquisition`) | stage shown as raw text in the table; kanban columns had no "nothing here" state | Inquiry → … → Won / Lost / Unqualified | shared header, stage badges in list and detail, terminal stages carry the terminal tone, stage history readable | StatusBadge, ModuleIdentityLine | relationship / manager / partner | lost reason retained and displayed | Verified | kanban cards are buttons with accessible names | `app.test.ts` AT-07/AT-08; harness | — |
| Proposals & Terms (`proposals`) | commercial-review state and client response were plain text; no lifecycle explanation | Draft → Approved to send → Presented → Accepted / Declined / Withdrawn | shared header and lifecycle hint; review and response states use the shared vocabulary; revision lineage retained | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint | partner / manager review only; self-approval blocked | returned proposal records the reason and returns to Draft | Verified (1024px overflow regression found and fixed here) | labelled revision controls | `app.test.ts` AT-07/AT-08, AT-09, AT-56, AT-58; MOD-UX-01 sweep | — |
| Engagements (`engagements`) | no context line; no explicit "no engagement in scope" distinction from a filtered list | Draft → Active → Suspended → Closed / Cancelled | shared header, lifecycle hint, status badges; an explicit no-match list state with the scope explanation | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint, ListState | partner / manager / reviewer / preparer / client scope | suspension and cancellation keep history and block writes atomically | Verified | impact warnings are `role="status"` | `app.test.ts` AT-10, VP-012; MOD-UX-01 sweep | — |
| Acceptance & KYC (`onboarding`) | consensus wording for screening states; the acceptance decision was not visually distinguished | Draft → partner decision → linked next-period draft | shared header, lifecycle hint, status badges for screening outcomes | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint | onboarding / compliance / manager / partner | missing evidence and prohibited mandate refused with reasons | Verified | labelled screening fields | `app.test.ts`; harness | recommendation remains pending until a separately assigned partner decides (unchanged) |
| Jobs & Tasks (`jobs`) | blocked jobs rendered the word "Blocked" with no reason emphasis | Not started → In progress → Blocked → Completed / Cancelled | shared header, job and task status badges, time-entry status badges, blocked tone now distinct | StatusBadge, ModuleIdentityLine | manager / preparer / assignee | parent cannot complete with open subtasks; reassignment recorded | Verified | labelled task controls | `app.test.ts` AT-11/AT-12, VP-003; MOD-UX-01 sweep | — |
| Job Templates (`job-templates`) | template governance notice quoted the status inside a sentence | Draft → Published → Retired (revisioned) | shared header and status badges; governance notice reads from the shared vocabulary | StatusBadge, ModuleIdentityLine | manager / partner | retired templates cannot be applied; later edits never alter applied jobs | Verified | — | `app.test.ts` AT-13; harness | — |
| Documents & SharePoint (`documents`) | availability and version state appeared as prose | register; availability with/without a file | shared header and status badges; replaced revisions keep lineage | StatusBadge, ModuleIdentityLine | manager / partner / records / client projection | unavailable file blocks new links atomically; replacement stales dependants | Verified | labelled upload controls | `app.test.ts` AT-20, AT-21, AT-22, VP-053 | original bytes remain in-session only (declared) |
| Communications (`communications`) | simulation outcome shared the same styling as a real delivery | draft → recorded outcome | shared header and status badges; the simulation banner is now a defined style | StatusBadge, ModuleIdentityLine | relationship / manager / partner | outcomes are `Simulated accepted` / `failed` / `unknown` / `Recorded manually` | Verified | — | `app.test.ts` AT-26, AT-27, VP-026-AC04 | no live mail by design |
| Time Tracking (`my-time`) | submitted/approved/returned states were plain text; correction lineage hard to read | draft → Submitted → Approved / Returned → correction revision | shared header and status badges on every entry and on the job time table | StatusBadge, ModuleIdentityLine | preparer submits, reviewer approves independently | returned time requires a reason; corrections supersede without double counting | Verified | labelled time fields | `app.test.ts` AT-28, VP-003 | — |
| Budgets & Variances (`budgets`) | draft-context protection was explained only in a warning | versioned budget, reopened when the context changes | shared header; budget status through the shared vocabulary | StatusBadge, ModuleIdentityLine | billing / manager / partner | saving under a changed engagement context is refused | Verified | — | `app.test.ts`; harness | — |
| Billing & Invoices (`billing`) | a filtered register and an empty practice showed the same message | Draft → Approved / Returned → Issued → Paid / Cancelled | shared header and lifecycle hint; list state separates "no invoices yet" from "none match these filters"; credit-note states shared | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint, ListState | partner / manager / billing | return requires a note; issued invoices are never rewritten | Verified | labelled invoice fields | `app.test.ts` AT-30/AT-31 area, VP-003-E02, AT-51; MOD-UX-01 sweep | — |
| Receivables & Receipts (`receivables`) | aging-empty and no-invoice states were one sentence | receipt → allocation → reversal; as-of aging | shared header and lifecycle hint; list state separates empty from filtered; allocation reversal retains history | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint, ListState | billing / manager / partner | reversal is recorded, not deleted | Verified | labelled receipt fields | `app.test.ts`; harness | — |
| Accounting Workbench (`accounting-setup`, `trial-balance`, `gl-transactions`, `account-mappings`, `adjustments`, `reconciliations`) | six routes share one view; status text for period books, mappings, journals, reconciliations and GL lines was unstructured; the GL account filter could return nothing with no explanation | import → validate → map → journal → reconcile → derive, with revision staleness throughout | shared header and lifecycle hint; every sub-register uses the shared status vocabulary; the GL list now distinguishes "no lines imported" from "no lines match this account filter" | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint, ListState | manager / reviewer / preparer / billing / records by sub-route | unbalanced imports rejected atomically; replacement stales reconciliations; approved schedule revision retained | Verified by the route sweep and the reconciliation journeys | labelled account/date/amount fields | `app.test.ts` AT-35, AT-36, AT-38, VP-038, VP-039; MOD-UX-01 sweep | the view remains a single large component (see "Decomposition") |
| Financial Statements (`financial-statements`) | staleness was one word beside a revision; the reason and the preserved review were not visible | source revision → derived → reviewed → staled → re-derived | shared header; `StaleNotice` names the exact drift (source / mapping / layout / comparative), the affected outputs, the preserved review and the recalculate action; established "Latest: v… · Stale" wording retained | StatusBadge, StaleNotice, ModuleIdentityLine | preparer builds, reviewer approves independently | layout/comparative change stales reviews and blocks re-review until re-derived | Verified | — | `app.test.ts` AT-37, statement staleness journeys; MOD-UX-01 sweep | the stepper is not yet shown on this page (see Partial in the lifecycle matrix) |
| Financial Packages (`financial-packages`) | pinned-source notes were accurate but listed separately with no impact or preserved-history statement | Calculated → Validated → Management → Accounting → Partner → Released | shared header and lifecycle hint; `StaleNotice` beside the existing notes adds impact, preserved revision history and the assemble action | StatusBadge, StaleNotice, ModuleIdentityLine, ModuleLifecycleHint | manager / preparer assemble; partner approves | forced generation and second IndexedDB failure report errors without saving a revision | Verified 1440/1024/390 | — | `app.test.ts` AT-41/AT-42/AT-48, AT-38/AT-40; MOD-UX-01 sweep | — |
| Group Consolidation (`consolidation`) | perimeter, FX, elimination and output states were prose; a stale pin warning did not state what to do | perimeter → pins → FX → eliminations → run → reviewed output | shared header; elimination and output review states use the shared vocabulary | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint | manager / partner with group grant | missing role blocks output by name; minority ownership refused with no figures; stale pin keeps the old snapshot | Verified 1440/1024/390 | — | `app.test.ts` AT-43/44/45, F-SIGN-04; MOD-UX-01 sweep | — |
| Audit Planning & Materiality (`audit-planning`) | plan revision history read as raw rows | draft → reviewed → superseded | shared header; plan status through the shared vocabulary | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint | reviewer approves independently | scope/team change supersedes the plan review | Verified | labelled materiality fields | `app.test.ts`; MOD-UX-01 sweep | — |
| Risks & Audit Programs (`audit-risks`) | template and procedure-fix history used inconsistent styling | Draft → Published → Retired; procedure revisions | shared header and status badges on templates, revisions and prior states | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint | manager / reviewer / preparer | revised template keeps applied programs unchanged | Verified | — | `app.test.ts` AT-49-related coverage; harness | — |
| Sampling & Populations (`sampling`) | no "population not loaded" state distinct from "no items match" | imported population → selection → testing → review | shared header; explicit empty state for a population with no items | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint, ListState | manager / reviewer / preparer | unreconciled frame disables selection; exceptions link to findings | Verified | labelled sample controls | `app.test.ts`; MOD-UX-01 sweep | — |
| Audit Workpapers (`audit`) | workpaper status and not-applicable decisions were plain text | Draft → Submitted → Cleared / Returned; Not applicable | shared header and lifecycle hint; status badges on workpapers and their revision history | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint | reviewer clears independently; senior role for Not applicable | revision reopens dependent review notes | Verified | — | `app.test.ts` AT-46, VP-052-AC03; MOD-UX-01 sweep | — |
| Evidence Catalogue (`evidence`) | adequacy state and digest absence were prose | registered reference → adequacy determination | shared header; adequacy through the shared vocabulary | StatusBadge, ModuleIdentityLine | manager / reviewer / preparer | unavailable document blocks adequacy and links | Verified | — | `app.test.ts` AT-46, VP-053; harness | — |
| Findings & Differences (`findings`) | disposition and response states were inconsistent; the release-blocking flag was easy to miss | raised → responded → cleared → reopened; disposition | shared header; disposition and response states shared | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint | independent response review | revision reopens review notes; blocking findings named | Verified | — | `app.test.ts` VP-054, VP-055, AT-55; MOD-UX-01 sweep | — |
| Review Desk (`reviews`) | open/responded/cleared/reopened had no consistent visual weight | Open → Responded → Cleared → Reopened | shared header and lifecycle hint; review states shared | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint | reviewer / preparer separation | reopened is a visible state, not an error | Verified | response form labelled | `app.test.ts` VP-055, AT-55; MOD-UX-01 sweep | — |
| Sign-offs & EQR (`approvals`, `quality`) | four approval slots and EQR concerns read as plain lists | generation-bound approvals; EQR concerns open → responded → resolved | shared header; approval and concern states shared | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint | partner / manager / client / EQR independence | self-approval blocked; basis change clears approvals and keeps history | Verified | — | `app.test.ts` AT-47; MOD-UX-01 sweep | — |
| Release & Completion (`delivery`) | readiness gaps and dispatch simulation were described in prose | candidate → readiness → issued → amended | shared header and lifecycle hint; dispatch remains explicitly simulated | StatusBadge, ModuleIdentityLine, ModuleLifecycleHint | manager / partner issue | amendment creates a linked successor release | Verified | — | `app.test.ts` AT-48 area; MOD-UX-01 sweep | dispatch is a simulation (declared) |
| Records & Archive (`records`) | terminal-engagement answers (`No Release to Archive`, `Cancelled`, `Suspended`) were unstructured | issued release → archived → handover | shared header; status badges; terminal wording retained verbatim | StatusBadge, ModuleIdentityLine | records / manager / partner | cancelled and closed engagements are labelled, not fabricated | Verified | — | `app.test.ts` archive journeys; MOD-UX-01 sweep | — |
| Client Portal Preview (`portal`) | no page title in the page anatomy; the shared-records guarantee was implicit | mirrors shared record states only | proper `h1` page header, simulated-status badge, identity line with the shared-record count; internal state never rendered | StatusBadge, ModuleIdentityLine, ListState | client_admin / client_finance / client + superuser preview | disclosure filtering unchanged and asserted | Verified | — | `app.test.ts` AT-18, AT-25, AT-53, VP-025-AC01 | — |
| Report Centre (`reports`) | "no records match this filter" was the only empty answer, even when no records existed at all | deterministic report | shared list state distinguishing no-records from client-filtered no-match | ListState | role-scoped reports | out-of-scope records never counted or listed | Verified | — | `app.test.ts` AT-49/AT-60; MOD-UX-01 sweep | — |
| Firm Administration (`administration`) | identity status and grant lifecycle were plain text | grant → revoke; identity active → disabled | shared header and status badges on identities and grants | StatusBadge, ModuleIdentityLine | admin with a global grant only | revocation and disablement retain reasoned history | Verified | labelled controls | `app.test.ts` AT-17; harness | — |
| Microsoft 365 Setup (`m365-setup`) | simulation status could read like a live connection | Not configured → Simulated verified / error / Disconnected | shared header; every simulation state carries the simulated tone and the `liveConnected=false` disclosure | StatusBadge, ModuleIdentityLine | admin; all personas see the simulation banner | simulated failure path exercised | Verified | — | `app.test.ts` AT-15/AT-16; harness | Simulation only, by design |
| Requirements & PRD (`requirements`) | a search could return nothing with no distinction from an empty backlog | informational | shared list state with the story/module count that exists | ListState | all active personas | — | Verified | labelled search | `app.test.ts` VP-064-AC01; MOD-UX-01 sweep | historical requirements text is not indexed in global search (unchanged) |
| Module Guide & Tour (`module-guide`) | no way to see the full supported route catalogue from one place | informational | route index built on demand (route, group, primary record, lifecycle model, next step, permission-aware open button) | ListState, route registry | presenter and all personas | — | Verified | summary is keyboard operable | `app.test.ts` DEMO journeys; MOD-UX-01 sweep | — |

## Deliberate non-changes

- **No business rule was relaxed.** Every guard, revision check and
  segregation-of-duties gate is untouched; the shared layer renders state and
  never writes it.
- **Simulation honesty wording is unchanged.** Email, M365, payments, release
  dispatch and client sharing keep their existing disclosures.
- **Financial calculations are untouched.** The only calculation change in this
  work is the previously recorded engagement-currency formatter default.
- **The superuser contract is unchanged.** The banner, the labelled
  `Prototype Superuser Override` events and its exclusion from independence
  evidence all remain.
- **`prototypeStore.ts` was not restructured.** No command, migration or
  validation was moved or rewritten.

## Decomposition assessment

The task suggested splitting very large views where it clearly helps. Assessment
after this work:

| View | Size | Assessment |
|---|---|---|
| `AccountingWorkbenchView` | ~90 kB | Six routes in one component. Splitting it would move business wiring, not just presentation, so it is **not** done here: a behaviour-preserving split needs its own reviewed task. Recorded as a limitation rather than attempted. |
| `ClientDetailView` | ~65 kB | Left intact. The tab structure already gives it visual locality. |
| `ConsolidationView`, `JobsTasksView`, `ProposalsView`, `ClientPortalView` | 50–62 kB | Left intact; no maintainability problem was demonstrated by this work. |
| `FinancialStatementsView`, `FinancialPackagesView` | 35–47 kB | Received the staleness notice without restructuring. |

New code was placed in small, single-purpose files
(`src/services/lifecycle.ts`, `src/services/routeRegistry.ts`,
`src/components/common/Enterprise.tsx`, `src/enterprise.css`) rather than growing
the existing large views.

## Evidence summary

| Check | Command | Result |
|---|---|---|
| Typecheck / lint | `npm run lint` | PASS |
| Production build | `npm run build` | PASS |
| Legacy bundle syntax | `npm run legacy:check` | PASS |
| Unit suites | `npm run test:unit` | 321/321 PASS (14 new MOD-UX-01 tests) |
| Browser acceptance | `npm run test:e2e` | 146/146 PASS (5 static + 141 Chrome, including the new MOD-UX-01 route sweep) |
| Tracker validation | `py -3 tools/progress.py validate` | valid — 0 errors |
| Diff hygiene | `git diff --check` | clean |

The exact run window and outcome are recorded in [`verification.md`](verification.md).

## Honest status of the whole objective

**Implemented and Verified**: the shared status/lifecycle vocabulary, the route
registry, the page anatomy with identity line, the status badges across the
routed modules, the list-state distinction, the route index, the stale notices on
the two accounting modules that carry source drift, and the derived workflow
progress tracker on the two flagship journeys (Engagements and Financial
Packages) with its counting rules, blocked explanations and step navigation.

**Partial**: the derived tracker is rendered on two screens today; the remaining
stateful modules show their own step or status indicators, which the shared
vocabulary now tones consistently but which have not yet been moved onto the
shared tracker. [`lifecycle-progress-matrix.md`](lifecycle-progress-matrix.md) —
generated from the code — lists, per route, whether a screen renders the derived
tracker, shows its own indicators, or has no workflow to track. Identical
lifecycle depth in every module and record-level history panels rendering through
the shared timeline are likewise Partial, listed per row in the
[lifecycle matrix](lifecycle-matrix.md).

**Outside scope, unchanged**: everything in [`scope.md`](scope.md) — no live
integrations, no workflow automation, no production claim. This audit does not
assert functional parity with the separate AuditSphere product, and it is not a
statement that the prototype is "perfect": it is enterprise-grade, coherent and
demo-ready in the respects listed above, and Partial where stated.
