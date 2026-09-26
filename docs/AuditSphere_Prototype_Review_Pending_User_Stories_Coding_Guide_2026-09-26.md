# AuditSphere Visual Prototype — Updated Code Review, Pending User Stories and Coding Guide


> **Verdict: bounded repair and evidence actions are complete; the whole simulation is not.** The five source-code findings from the original review have been fixed and regression-tested. The listed cross-cutting and story-level bounded actions, including VP-023-E02, have been reconciled without promoting whole-story acceptance. The canonical tracker now has 33 open action rows (the original review baseline was 41). The original acceptance contract remains open. “A module exists,” “a bounded demo worked,” and “every required lifecycle is accepted” are different claims.

## Contents

1. [Verdict, evidence and review limitations](#1-verdict-evidence-and-review-limitations)
2. [Source-confirmed findings](#2-source-confirmed-findings)
3. [All 39 modules: what remains](#3-all-39-modules-what-remains)
4. [Cross-cutting completion user stories](#4-cross-cutting-completion-user-stories)
5. [Detailed user stories for the 29 Partial modules](#5-detailed-user-stories-for-the-29-partial-modules)
6. [Preserve the 10 Verified modules](#6-preserve-the-10-verified-modules)
7. [Coding and implementation guide](#7-coding-and-implementation-guide)
8. [Exact remaining action inventory](#8-exact-remaining-action-inventory)
9. [Cross-module acceptance journeys and completion gates](#9-cross-module-acceptance-journeys-and-completion-gates)
10. [Reproducible checks and source references](#10-reproducible-checks-and-source-references)

## 1. Verdict, evidence and review limitations

### 1.1 What is established

| Question | Result | Interpretation |
|---|---:|---|
| Functional areas in the current product/module map | 39 | All are represented; related modules deliberately share screens. |
| Modules labelled Verified by the repository | 10 | Repository acceptance labels, not fresh independent certification. |
| Modules labelled Partial by the repository | 29 | Some require code changes; others mainly require acceptance reconciliation. |
| Original user stories / criteria | 64 / 256 | Preserve the original IDs and wording. |
| Stories labelled Verified / Partial | 16 / 48 | Do not convert this ratio into a software-completion percentage. |
| Open actions claimed by the original queue summary | 47 | Historical stale count; current tracker reports 33 after bounded action closures. |
| Open verification rows found in §9.3 | **31** | 25 Partial, 4 Pending, 2 explicitly verified subcases with wider acceptance open. |
| Open scope/reconciliation rows at original review baseline | **4** | 3 Partial and 1 Open; VP-064-R03 has since been reconciled. |
| Open action-row inventory at original review baseline | **41** | 37 + 4; these are action rows, not distinct missing features. |
| **Current open action-row inventory** | **33** | 31 verification + 2 scope actions after the bounded closures listed above and VP-023-E02. |
| Source-code finding groups identified by the review | **5** | Search visibility, destructive reset, misleading context, duplicate IDs, unguarded drafts; all five are now fixed and tested. |

The current 84 enumerated verification rows comprise 49 Complete (including bounded evidence-action closures), 4 Verified, 25 Partial, 4 Pending and 2 verified-subcase rows with follow-up still open. This is the live row-level recount; older dated verification entries preserve their then-current denominators. At the original review baseline, 38 scope rows comprised 34 Complete/Reconciled and 4 open rows, for 41 total actions. The current scope table has 36 Complete/Reconciled rows and 2 Partial rows. Together, 31 verification and 2 scope actions leave 33 open action rows. Verified subcases with wider criterion follow-up remain open rather than being hidden in the Verified category. Exact open row IDs are retained in Section 8; bounded actions are noted separately. VP-017 acceptance criteria remain subcase-verified rather than fully signed off, including its broader optional-service/provider matrix. [S1] [S2]

All five code findings overlap existing scope, navigation or acceptance obligations. **Do not add them arithmetically to the 33 current open actions** or invent MOD-40 and later modules.

The current `App.tsx` imports the feature views and maps the application routes; `01_MODULE_INDEX.md` identifies all 39 functional areas. That establishes representation, not full lifecycle acceptance. A later deployed-browser sweep exercised all 34 staff navigation routes; shared routes and that sweep do not establish criterion-level acceptance of all 39 functional areas (see verification entry 88). [S3] [S10]

### 1.2 What was actually checked

The original review pinned its source findings to `975502a1f0fb31db3814da6d6bf6854cf9c8879e`, read the tracker and remaining action rows, inspected the route/guard architecture and relevant Shell, Budget and Job Template source, and compared recent completed actions with older missing-feature claims. The follow-up implementation landed in `e6a6edb`; the current documentation baseline was `ffcf34c0000c9cc18bc9dc2c8d1fff87b6ca060f`.

Five **isolated JavaScript source-expression probes** were run locally. They reproduced three search-policy mismatches and two misleading context outputs. These probes use transcribed source expressions and small synthetic fixtures; they are **not** the repository's unit suite, React rendering tests or Chrome journeys. Their exact scope and output are in Section 10.

At the original review snapshot, a fresh checkout and full test run were unavailable, so the source probes were not repository regressions. The first follow-up ran checks at documentation baseline `ffcf34c0000c9cc18bc9dc2c8d1fff87b6ca060f` (application source then unchanged from `e6a6edb`): lint, 231/231 unit tests, 105/105 E2E (5 static + 100 Chrome), build and legacy syntax passed. A subsequent uncommitted UI-guard change extends that tested state: lint, 231/231 unit tests, build and 109/109 serialized E2E (5 static + 104 Chrome) now pass, including acquisition, profile and PBC draft-guard journeys. The current tracker records the code delta and exact commands. The focused regressions cover the five original findings and the added draft guards. `npm ci` was not rerun; the installed dependencies were used.

The 216/216 unit and 96/96 E2E results in older tracker entries remain historical snapshots. The latest observed 231/231 unit and 109/109 E2E results include the uncommitted draft-guard delta and verify tested paths, not the complete original 256-criterion contract. Earlier “current worktree” entries remain historical unless their own source/build attribution is stated. [S1] [S12]

### 1.3 Correct earlier missing-feature claims

Do not recreate the following capabilities. The **current** action table already records them as complete or verified:

| Capability | Current evidence/action record |
|---|---|
| Task notes and registered-document links | VP-014-I01; original VP-014 criteria are recorded verified. |
| Recipient-specific notices and comment moderation | VP-016-I01 and VP-016-E02. |
| Request editing, reassignment and cancellation | VP-023-E01 and VP-023-R03. |
| Accepted PBC evidence replacement and retained lineage | VP-024-E02, completed 26 September. |
| Editing source-linked invoice drafts while retaining source lines | VP-030-E01, completed 26 September. |
| GL basic negative cases and opening/movement tie-out | VP-036-E02. |
| Journal source replacement, reconfirmation and no duplicate reporting effect | VP-038-E02, completed 26 September. |
| Package generation failure cleanup and replacement acknowledgement | VP-042-E01/E02. |
| Group output and FX/source lineage demonstration | VP-044-E01/E02 and VP-046-E02. |
| Multi-risk/program version and reassessment cases | VP-049-E01/E02. |
| Fieldwork return, rework, resubmission and history | VP-050-E01. |
| Finding disposition and qualitative provenance cases | VP-054-E01/E02. |
| Prospective firm settings, numbering and invalid settings | VP-062-E01/E02. |

“Complete action” still does not automatically close the entire original story or its shared requirements. Conversely, old prose saying a capability is missing is not permission to rebuild working code. Reconcile against the pinned action rows, current source and actual assertions. [S2]

## 2. Source-confirmed findings

These were concrete implementation findings at the pinned original-review source, not deductions from a Partial label. All five are fixed in the current source and have dedicated unit/browser regressions; retain the descriptions below as defect rationale and acceptance targets, not as claims that the current tree still contains those defects.

### F01 — Global search exposes records outside engagement or role scope

**Priority:** P1. **Affected areas:** MOD-17 directly; MOD-11, MOD-14 and MOD-19 through shared visibility.  
**Existing backlog:** VP-061-E02, VP-019 and shared VP-003 scope requirements.

`Shell.tsx` applies `clientAllowed(...)` to invoice and communication searches, but omits the engagement predicate used by documents, jobs and findings. `visibleClientIds()` intentionally exposes a client summary when a person has an engagement grant; it does not grant access to that client's other engagements. Therefore a manager granted only ENG-A can discover an invoice or communication belonging to ENG-B under the same client. The result itself contains protected metadata even when navigation later rejects the destination. [S4] [S5]

The same search branches run for every non-client role without checking that the role may read that record category. The route policy denies Billing to a preparer, yet the search branch still emits invoice identifiers and amounts. This is a **simulation access-policy defect**, not a claim of a production breach.

**Reproduction target:** create two engagements under the same synthetic client; grant the manager only the first; search for a unique second-engagement invoice number and communication sentinel. Both must be absent from results, type choices, result counts and ordering. Repeat with a preparer whose allowed client scope is broad but whose role cannot read billing records.

**Minimal correction:** reuse current identity/role and engagement visibility helpers before constructing result rows. Normalize legacy invoice ownership through the existing `engagementId || eng` rule. Check that the engagement belongs to the claimed client. Handle truly client-wide communications explicitly; a missing engagement ID must not become an accidental permission bypass. Recheck authorization when opening a result.

**Acceptance:** scoped records appear only for the correct actor; same-client sibling records contribute no content or counts; role denial applies before projection; revocation/expiry removes existing results; authorized exact-target navigation still works.

### F02 — Sidebar reset bypasses unsaved-form protection

**Priority:** P1. **Affected areas:** shared Shell and every editable module.  
**Existing backlog:** VP-003-E02/R03 and VP-004.

The sidebar's **Reset Demo State** handler calls `prototypeStore.resetState()` directly and displays a success toast. It does not use `onBeforeContextChange` or a reset confirmation. By contrast, scenario changes call the context-change guard, and the recovery banner has a separate confirmation path. An ordinary sidebar reset can therefore replace demo state without applying the shared draft/confirmation lifecycle. [S6]

**Reproduction target:** edit a registered planning or invoice draft, then exercise the sidebar reset through the normal UI where reachable and through a direct handler test. Assert that no reset occurs before the user makes an explicit discard/reset decision. Also test reset from a clean workspace.

**Minimal correction:** use one shared reset request path with an explicit destructive-action confirmation and draft handling. Do not “Save and continue” into an immediate reset that silently destroys the just-saved work; make reset semantics explicit, offer the supported recovery/export choice, and preserve the existing backup policy. The same function should serve sidebar and recovery controls.

**Acceptance:** Cancel/Stay makes no state change; confirmed reset is deliberate and does not masquerade as a normal save; in-session and persisted backup behavior are tested; no success toast is shown after a failed reset.

### F03 — The context bar can misrepresent currency and package freshness

**Priority:** P2. **Affected areas:** all modules, especially MOD-20–26 and financial demonstrations.  
**Existing backlog:** shared VP-003, VP-034, VP-040 and VP-064.

The context bar renders the literal `QAR`, regardless of the selected engagement currency. It also uses default values such as FY 2026 and package revision 3 when there is no selected record, and always renders a green **Current** label. A USD engagement can therefore be presented as QAR; an absent package can appear as current v3; stale output is not distinguished. [S7]

**Minimal correction:** derive display values from the selected, authorized reporting context and existing package readiness/currentness data. Render **No engagement**, **Not created**, **Stale** or **Unavailable** when appropriate. Do not introduce a second manually maintained status flag or guess a valid context from decorative defaults.

**Acceptance:** QAR and USD fixtures display their actual currency; missing context creates no invented service/year/revision; mapping or source changes visibly stale the dependent context; returning to a valid context restores correct labels without mutating business records.

### F04 — Navigation contains duplicate HTML IDs

**Priority:** P2. **Affected areas:** shared navigation and responsive/accessibility behavior.  
**Existing backlog:** VP-003-E01 and final UI acceptance.

Both the outer `<aside>` and inner `<nav>` use `id="primary-navigation"`, while the mobile menu button references that ID through `aria-controls`. This creates an ambiguous relationship and makes ID-based selection unreliable. [S6]

**Minimal correction:** give each element a unique ID, then point `aria-controls` to the actual controlled drawer. Preserve existing drawer focus handling; do not replace the navigation framework.

**Acceptance:** IDs are unique; the controlled element resolves exactly once; opening, Escape, Tab/Shift+Tab, overlay dismissal, route selection and focus return still work at desktop and 390px width.

### F05 — Budget and job-template drafts are not registered with the shared guard

**Priority:** P1. **Affected areas:** MOD-06 and MOD-13; inventory other forms before assuming they are covered.  
**Existing backlog:** VP-003-E02/R03, with VP-015 and VP-029 integration.

`App.tsx` passes the unsaved-form registration callback to many feature views, but passes only `onNavigate` to `BudgetsView` and `JobTemplatesView`. Those views retain authoring/instantiation inputs in local `useState` without access to the App's private guard registry. A hash/back navigation can consequently unmount a populated draft without the normal Save/Discard/Stay flow. [S3] [S8] [S9]

Budget save also derives its target engagement and next revision from the current selection, rather than an explicitly captured draft context. Bind the draft to its original context so a context change cannot cause old draft values to be saved into a different engagement.

**Minimal correction:** pass the existing guard callback; register each actual draft with a stable key and cleanup; capture owner/context/base revision when opening it; revalidate these before saving. Distinguish saving a template draft from applying a template: guard-driven Save must not unexpectedly publish or create a job.

**Acceptance:** Budget and Template authoring/instantiation preserve draft values on Stay; Discard creates no records; permitted Save executes exactly its advertised operation once; validation failure keeps the user and draft; direct hash/back, persona and engagement changes cannot lose or misapply data.

### D01 — Reconcile acceptance and documentation without fabricating closure

At the original review snapshot, the queue prose claimed 47 open actions while its rows yielded 41, and older descriptions called completed features missing. The current tracker reports 33 open actions after the bounded closures listed above and VP-023-E02; it retains 31 verification follow-ups (including two verified-subcase follow-ups) and two Partial scope rows. The README and storage guidance distinguish durable PBC IndexedDB bytes from metadata/session-only library originals, consistent with VP-024-R03; no storage implementation change was needed. Preserve historical run entries and keep closure-card status separate from product acceptance. [S1] [S2] [S11]

Preserve historical run entries, but clearly distinguish historical snapshots from current status. Do not bulk change every story to Verified because closure cards are Complete.

## 3. All 39 modules: what remains

**Reading the table:** “Verified” is the repository's existing label. “Partial” is not a claim that the whole module is missing. “Acceptance-only” means this review found no new module-local feature gap in the cited action rows; shared findings and exact original-criterion sign-off still apply. All rows remain subject to the review limitations in Section 1.

| Module | Repository label | Current review disposition | Completion story |
|---|---|---|---|
| MOD-01 — Practice Dashboard | Partial | Local dashboard action rows are complete; F03 shared-context display is fixed; close original criteria, not a rebuild. | RV-M01 |
| MOD-02 — CRM & Client Management | Partial | Remaining tab-action/scope evidence; preserve implemented contacts, custom fields and shared projections. | RV-M02 |
| MOD-03 — Leads & Opportunities | Verified | Preserve the accepted baseline; run the relevant shared-change and cross-module regressions. | Section 6 |
| MOD-04 — Proposals & Engagements | Partial | Proposal field/print and stale-response matrices; engagement Closed-state/history cases. | RV-M04 |
| MOD-05 — Jobs & Tasks | Partial | Local job actions complete. Task notes/document links already exist; criterion sign-off and shared regressions remain. | RV-M05 |
| MOD-06 — Job Templates | Partial | Lifecycle action complete; F05 authoring/instantiation draft guards are fixed and tested; original acceptance remains. | RV-M06 |
| MOD-07 — Team Collaboration | Partial | Moderation/notices exist. Remaining communication publication/correction and actor/context cases. | RV-M07 |
| MOD-08 — Client Portal | Partial | Remaining portal persona/entity/engagement/action matrix; do not rebuild entity scoping. | RV-M08 |
| MOD-09 — Client Requests / PBC | Partial | Request-filter and recipient/context verification; accepted-evidence replacement is now complete. | RV-M09 |
| MOD-10 — Document Management | Partial | Workspace retry/root/scope and availability matrices remain; PBC and library storage classes are now documented separately. | RV-M10 |
| MOD-11 — Communications | Partial | Sender/placeholder/template/link cases remain; the F01 search projection leak is fixed and tested. | RV-M11 |
| MOD-12 — Time Tracking | Partial | Date/duration/link-scope matrix; billed-time correction is already implemented. | RV-M12 |
| MOD-13 — Budgets | Partial | Unallocated aggregation and variance cases remain; F05 budget draft guards are fixed and tested. | RV-M13 |
| MOD-14 — Billing & Invoicing | Partial | Date/reference/correction acceptance remains; source-linked invoice editing is complete and F01 invoice search is scoped. | RV-M14 |
| MOD-15 — Receivables | Partial | Local allocation/aging actions complete; close full criteria and shared regressions. | RV-M15 |
| MOD-16 — Reporting & Analytics | Verified | Preserve the accepted baseline; run the relevant shared-change and cross-module regressions. | Section 6 |
| MOD-17 — Search & Centralized Client View | Partial | F01 role and sibling-engagement search leaks are fixed and tested; remaining target/scope acceptance stays open. | RV-M17 |
| MOD-18 — Microsoft 365 Integration Simulation | Partial | Remaining invalid setup selections and full skipped-service criterion; provider failure matrix already covered. | RV-M18 |
| MOD-19 — Identity & Access Management | Partial | Remaining expiry/professional-role/group matrix; enforce the same boundaries in search. | RV-M19 |
| MOD-20 — Accounting Setup | Partial | Period/book/archive/dimension rework matrix remains; F03 shared context labels are fixed and tested. | RV-M20 |
| MOD-21 — Trial Balance & GL | Partial | GL replacement → reviewed-package rework and original-control comparison; core intake negatives already covered. | RV-M21 |
| MOD-22 — Adjustments & Journals | Partial | Residual evidence/workpaper/finding linkage; source replacement/reconfirmation action is now complete. | RV-M22 |
| MOD-23 — Reconciliations | Partial | Remaining bounded date/currency/scope acceptance, not new bank integrations. | RV-M23 |
| MOD-24 — Financial Statements | Partial | Supported source/layout/comparative/disclosure matrix; do not invent component equity from combined totals. | RV-M24 |
| MOD-25 — Financial Packages | Partial | Package failure and replacement actions complete; original criteria and dependent-note rework evidence remain. | RV-M25 |
| MOD-26 — Consolidation | Partial | Remaining elimination duplicate/mixed-context/staleness matrix and contractual unmatched semantics. | RV-M26 |
| MOD-27 — Client Acceptance | Verified | Preserve the accepted baseline; run the relevant shared-change and cross-module regressions. | Section 6 |
| MOD-28 — Audit Planning | Partial | Local planning actions complete; finish criterion-level evidence rather than rebuilding thresholds. | RV-M28 |
| MOD-29 — Risks & Audit Programs | Partial | Both local risk/program closure actions complete; preserve multi-risk and template-version history. | RV-M29 |
| MOD-30 — Audit Fieldwork | Partial | Local fieldwork rework action complete; finish original criterion evidence. | RV-M30 |
| MOD-31 — Populations & Sampling | Verified | Preserve the accepted baseline; run the relevant shared-change and cross-module regressions. | Section 6 |
| MOD-32 — Workpapers | Verified | Preserve the accepted baseline; run the relevant shared-change and cross-module regressions. | Section 6 |
| MOD-33 — Evidence | Verified | Preserve the accepted baseline; run the relevant shared-change and cross-module regressions. | Section 6 |
| MOD-34 — Findings & Differences | Partial | Both local findings actions complete; preserve corrected/waived/qualitative behavior. | RV-M34 |
| MOD-35 — Review Points | Verified | Preserve the accepted baseline; run the relevant shared-change and cross-module regressions. | Section 6 |
| MOD-36 — Reviews & Approvals | Verified | Preserve the accepted baseline; run the relevant shared-change and cross-module regressions. | Section 6 |
| MOD-37 — Completion & Release | Verified | Preserve the accepted baseline; run the relevant shared-change and cross-module regressions. | Section 6 |
| MOD-38 — Records & Archive | Verified | Preserve the accepted baseline; run the relevant shared-change and cross-module regressions. | Section 6 |
| MOD-39 — Administration | Partial | Settings actions and storage/count documentation are reconciled; the remaining IAM matrix is open. No second settings system. | RV-M39 |

Source: the current module index and route wiring, cross-checked against the current action table. [S2] [S3] [S10]

The next section owns shared fixes once. The module stories consume those fixes; they must not each build another search, permissions, persistence, modal or workflow system.

## 4. Cross-cutting completion user stories

The `RV-*` identifiers below identify sections of **this review**. They do not replace the original VP/MOD/AT identifiers or create a competing repository tracker. Link the work to the existing cards and canonical criterion/action rows.

### RV-X01 — Make search respect record scope before projection

**As a scoped staff member, I want search to expose only record categories and engagements I may read, so that navigation, snippets and counts never reveal another engagement's data.**

**Priority:** P1. **Finding:** F01. **Canonical links:** VP-061-E02; relevant VP-019 and VP-003 criteria.  
**Lifecycle:** enter query → authorize category and record → filter → show permitted metadata → open exact authorized target → revalidate after grant change.

**Implementation status:** Fixed in the current source. The unit selector tests and F01 Chrome regression pass, including same-client sibling invoice/communication sentinels, preparer billing denial and filtering before the type selector is built. The broader original VP-019/VP-061 acceptance matrix remains open.

**Acceptance criteria**
- [ ] Two engagements share one client. An ENG-A-only manager cannot find ENG-B's invoice number, amount, communication summary or participant sentinel.
- [ ] A preparer who cannot read Billing sees no invoice result or invoice-derived type/count, even with a broad client grant.
- [ ] Legitimate client-wide records remain available under an explicit client-wide rule; missing ownership cannot silently widen access.
- [ ] Revocation/expiry removes existing results and blocks stale result clicks. Exact authorized targets and normal client search remain usable.
- [ ] Unit selector tests and an existing-harness Chrome journey demonstrate the same policy.

**Coding guide:** start in `Shell.tsx` and `guards.ts`; normalize invoice owner references, reuse `activePersona`, `canOpenRoute` and `visibleEngagementIds`, and apply filtering before constructing display rows. Prefer a small existing-selector extension over a new access abstraction. See Section 7 for a typed integration example.

### RV-X02 — Make every destructive/context transition draft-safe

**As a preparer, I want drafts to remain associated with their original context until I deliberately save or discard them, so that navigation and reset cannot lose work or apply it to the wrong engagement.**

**Priority:** P1. **Findings:** F02/F05. **Canonical links:** VP-003-E01/E02/R03 and VP-004.  
**Lifecycle:** open editor → capture identity/context/revision → edit → request transition → Stay / Save / Discard → revalidate → continue.

**Implementation status (2026-09-26):** Sidebar reset now runs through the shared unsaved-form decision and a separate destructive confirmation with recovery backup. Budget, template-authoring, template-instantiation, supported-service and proposal-content-template drafts register with the shared guard. F05 Chrome proves template draft Save keeps the route unchanged, leaves the template Draft, and creates no job; rapidly activating instantiation Save twice creates exactly one job. New Chrome coverage proves Stay/Discard for the proposal catalogue drafts. These journeys pass in full E2E 111/111 with unit 242/242 and lint/build. The editable-form inventory and full VP-003 route/persona/context matrix remain open; see `docs/prototype/verification.md` entries 99–100.

**Acceptance criteria**
- [ ] Inventory every actual editable form, including Budget and Job Template authoring/instantiation. Record guard key, scope, save behavior and cleanup.
- [ ] Exercise hash/back navigation as well as normal navigation; Stay preserves values and the accepted URL, Discard does not mutate persisted business records, and failed Save does not navigate.
- [ ] A draft opened under one engagement/person cannot save into a different context or newer base revision without explicit revalidation.
- [x] Sidebar and recovery reset share a deliberate confirmation/backup path. No automatic save-then-destroy behavior is labelled as successful preservation.
- [x] Template draft save does not publish or instantiate a job as a navigation side effect. Double activation does not create duplicate operations (F05; verification entry 99).
- [x] Cover the new guards with focused tests, then rerun existing guard/modal and relevant lifecycle journeys (F05 plus full E2E 110/110; unit 242/242, 2026-09-26).

**Coding guide:** extend the existing `UnsavedFormGuard` callback in `App.tsx`; use stable registration keys and effect cleanup. Do not introduce a modal library or another draft store. Preserve current scenario and recovery behavior.

### RV-X03 — Show truthful context and readiness

**As a presenter, I want the header to describe the actual selected record and its readiness, so that a client never sees a fabricated currency, package version or approval status.**

**Priority:** P2. **Finding:** F03. **Canonical links:** shared VP-003, VP-034/040 and VP-064.  
**Implementation status:** The header now derives currency from the authorized selected engagement and package readiness from the owning calculation. Unit and F03 Chrome regressions pass for USD, Not created and unavailable context; full downstream rework acceptance remains open.
**Acceptance criteria**
- [ ] QAR and USD engagements show the selected reporting currency; absent or inconsistent context shows an explicit unavailable state.
- [ ] A package not yet created has no invented revision. A stale package is not labelled Current.
- [ ] Source/mapping/disclosure replacement changes the displayed readiness through the same existing calculation used by the owning module.
- [ ] Narrow/no-scope and restored invalid selections reveal no protected context details.
- [ ] Context changes update display only; no financial record is changed just to make the header consistent.

**Coding guide:** replace presentation literals in `Shell.tsx` with an authorized context projection. Reuse existing currentness/readiness logic and treat display-only fallbacks separately from business defaults. Do not duplicate package-status persistence.

### RV-X04 — Close navigation and dialog accessibility without redesign

**As a keyboard or assistive-technology user, I want each menu and dialog to have one clear control relationship and predictable focus behavior, so that every lifecycle is usable without pointer-only actions.**

**Priority:** P2. **Finding:** F04. **Canonical links:** VP-003-E01 and approved UI acceptance.  
**Implementation status:** `primary-navigation` is unique and `aria-controls` targets the sidebar. The UIX-02 Chrome regression verifies the unique target and desktop collapse behavior; broad mobile drawer and active-modal accessibility acceptance remains open.
**Acceptance criteria**
- [ ] `primary-navigation` resolves to exactly one element; `aria-controls` points to the element actually expanded/collapsed.
- [ ] Keyboard opening, focus containment, Escape/overlay dismissal and focus restoration work for the mobile drawer and each remaining active modal family.
- [ ] Enter submits only the intended form, preserves validation errors, and does not trigger duplicate state changes.
- [ ] Desktop and 390px checks retain labels, readable status, reachable actions and normal table scrolling.
- [ ] A DOM duplicate-ID regression and the existing Chrome focus/navigation journeys pass.

**Coding guide:** change the minimum IDs/attributes and existing focus handlers. Do not treat a fixed contrast or duplicate-ID case as blanket accessibility certification.

### RV-X05 — Prove recoverability with authentic persisted history

**As a returning demo user, I want upgrades and recovery to retain my recorded identities, revisions and evidence references, so that an update does not silently replace my work with seed data.**

**Priority:** P1. **Canonical link:** VP-004-E01.  
**Lifecycle:** read prior state → recognize version/shape → migrate or quarantine → offer recovery → import/export/reset deliberately → reopen supported records.

**Acceptance criteria**
- [ ] Obtain sanitized authentic fixtures from actual earlier repository revisions or retained demo exports. Record provenance and schema version; changing a current fixture's version number is not historical coverage.
- [ ] Preserve stable IDs, approvals, PBC links, prior source revisions and supported artifact references, or explicitly flag unsupported/ambiguous references.
- [ ] Invalid/future JSON, denied storage and quota failure do not overwrite the last recoverable payload.
- [ ] Export/import/reset choices preserve their promised backup, and each storage class explains whether bytes survive reload.
- [ ] When authentic historical input is unavailable, record that precise evidence blocker rather than inventing a fixture or pass.

**Coding guide:** inspect the existing migrations, import validation, artifact services and recovery UI. Add only the missing fixture/regression. Do not create a server, upload binary data to localStorage, or universally change PBC/library storage semantics.

### RV-X06 — Establish finite, repeatable lifecycle acceptance

**As a product owner, I want every original criterion mapped to executable evidence on one candidate build, so that “complete simulation” has a stable and testable meaning.**

**Priority:** P1. **Canonical links:** VP-063-E01/E02/E03.  
**Acceptance criteria**
- [ ] Freeze a finite acceptance matrix from the 256 original criteria and the 54 original journeys; add the confirmed review regressions without renumbering the original contract.
- [ ] For each lifecycle identify permitted transitions, actors, required fields, immutable snapshots, downstream invalidation, failure outcome and supported reload behavior.
- [ ] Use representative equivalence classes and every explicitly required negative case. Do not move the goalpost to an unlimited “all possible combinations” cross-product.
- [ ] At least one connected fresh-record journey uses ordinary UI/store commands after initialization rather than inserting a finished business state directly into storage.
- [ ] Run isolated deterministic cases with a controlled scenario clock, honest failure/skip reporting and no business-provider requests.
- [ ] Record source SHA plus dirty diff/tree identity, build/configuration, fixture, test name, observed result and relevant artifact hashes. Passing a smaller suite is not a whole-contract pass.

**Coding guide:** reuse `tests/unit` and the existing `tests/e2e` Chrome harness. Test changed deterministic rules at unit level and meaningful role handoffs/rework at browser level. Add no new test framework or giant parallel test hierarchy.

### RV-X07 — Reconcile counts, criteria, storage guidance and handoff

**As the next developer or reviewer, I want a single current acceptance record with traceable historical evidence, so that I can continue the work without rebuilding completed features or mistaking old results for current acceptance.**

**Priority:** P1. **Finding:** D01. **Canonical links:** VP-064-E01/E02/R03.  
**Acceptance criteria**
- [x] Recompute the detailed action inventory; the current result is 32 verification + 2 scope = 34 after VP-064-R03, VP-063-E03, VP-017-E01/E02, VP-036-E03, VP-036-R01 and VP-038-E01 action closure. Preserve prior 41-, 40-, 39-, 38-, 37-, 36- and 35-row totals as dated history.
- [ ] Preserve each original criterion and historical result; distinguish passed subcases, unrun checks, failed behavior, scope decisions and actual reviewer approval.
- [x] Reconcile README/PBC storage guidance using current source and observed reload behavior; feature-specific storage classes are documented separately.
- [x] Update the module guide, demo playbook, recovery/document task cards, verification record and canonical tracker together. Keep closure-card execution status separate from product acceptance and demo outcomes.
- [ ] Promote a story only after all four original criteria and applicable shared obligations are evidenced; promote a module from its real constituent stories.
- [ ] Never invent reviewer acceptance, a commit SHA, a run log or a live provider result. Missing human approval remains explicitly open while other authorized work proceeds.

**Coding guide:** use existing tracker/helper conventions and `tools/progress.py` where applicable. Add a small read-only reconciliation check only if existing tooling cannot perform it. Section 10 includes a standard-library diagnostic; it is not a second status authority.

## 5. Detailed user stories for the 29 Partial modules

**Execution rule for every story:** inspect the current source and its original VP criteria first. Verify already implemented behavior before editing. A remaining test/evidence row does not authorize a new module, a replacement architecture or additional product scope.

The lifecycle sequences below are human-driven. “Review” and “approval” apply only where the existing contract requires them; do not force read-only dashboards, search, every setting or every budget into an invented approval workflow. Use `N/A — reason` for inapplicable lifecycle stages.

An empty “local open action” list means the module's named action rows are complete, **not** that original story/shared acceptance is already complete.

### RV-M01 — MOD-01: Practice Dashboard

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-005.  
**Local open action rows:** None in the current §9.3/§9.4 rows; finish original-criterion and shared acceptance.  
**Route/workspace:** `overview`.  
**Implementation touchpoints:** [DashboardView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/DashboardView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a practice manager, I want to complete a scoped dashboard-to-record journey, so that every counter and link tells the same story as the underlying records.

**Preserve / current evidence:** VP-005-E01/E02 already record persona, counter and empty/archived coverage. The remaining work is exact criterion acceptance plus shared Shell corrections. [S2]

**Required supported lifecycle:** select persona/context → view scoped metrics → open filtered list → open exact record → return → change source/status → reconcile refreshed totals.

**Acceptance criteria**
- [ ] Given broad, narrow and no-grant fixtures, each displayed metric and its drill-down contain exactly the permitted records.
- [ ] Given empty, cancelled, completed, blocked and archived records, counts follow the documented inclusion rules and never imply completed work that was not performed.
- [ ] Changing a related record updates the dashboard through existing selectors; returning from the target retains the expected context.
- [ ] After F03 is fixed, the header shows the correct currency and real package readiness; preserve the recorded VP-005 scenarios.

**Coding guide:** Keep DashboardView projections derived from the shared state; do not persist independent counters. Reuse the existing route targets and shared context projection.

**Verification:** Reuse VP-005/AT-01 coverage and add only the missing assertion-to-criterion links and shared-header regression. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M02 — MOD-02: CRM & Client Management

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-006, VP-007, VP-008.  
**Local open action rows:** `VP-008-E01`  
**Route/workspace:** `clients / client-detail`.  
**Implementation touchpoints:** [ClientsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/ClientsView.tsx), [ClientDetailView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/ClientDetailView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a relationship manager, I want to navigate and maintain a client's full workspace with exact scoped links, so that profile edits and tab actions never duplicate records or expose a sibling engagement.

**Preserve / current evidence:** Client/contact fields, responsibility periods and group-authority separation are recorded complete. VP-008-E01 still has remaining tab-action and scope coverage. [S2]

**Required supported lifecycle:** create/edit profile → maintain contact → inspect Client 360 tabs → create/open linked record → return with filters → archive/inactivate where supported → inspect retained history.

**Acceptance criteria**
- [ ] Run the remaining contractual tab actions under two clients and under two same-client engagements with only one engagement granted.
- [ ] New jobs, requests, communications and draft invoices are created once in their owning collections and immediately appear in the correct workspace.
- [ ] Inactive contacts and archived clients retain historical document, proposal and invoice references; changing a contact does not create a user grant.
- [ ] Back/forward, search targets and return navigation preserve the correct filters and selection without revealing sibling records.
- [ ] Apply the shared guard to any verified missing editor path and recheck stale revision rejection.

**Coding guide:** Extend ClientsView/ClientDetailView only for reproduced gaps. Reuse canonical arrays and engagement-owned PBC/workpapers; never persist a second Client 360 copy.

**Verification:** Extend the existing AT-05/06 and VP-008-E01 journeys; use a unique same-client sibling sentinel rather than testing only different clients. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M04 — MOD-04: Proposals & Engagements

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-010, VP-011, VP-012.  
**Local open action rows:** `VP-010-E01`, `VP-010-E02`, `VP-011-E01`, `VP-011-E02`, `VP-012-E02`  
**Route/workspace:** `proposals / engagements`.  
**Implementation touchpoints:** [ProposalsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/ProposalsView.tsx), [EngagementsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/EngagementsView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a proposal author and independent reviewer, I want to complete proposal revision and engagement amendment/closure with exact historical snapshots, so that commercial decisions and professional acceptance remain separate and reproducible.

**Preserve / current evidence:** Service/template editors and proposal revision flows exist. Source rows retain partial field/print, stale-response and Closed-state acceptance. [S2]

**Required supported lifecycle:** draft → validate/submit → independent review/return → revise → present → record evidenced response → professional acceptance → activate → amend/suspend/resume/close or cancel.

**Acceptance criteria**
- [ ] Every original scope, date, fee, currency, terms and response field is validated; preview/print content matches the presented revision rather than the current draft.
- [ ] Returning and revising a proposal retains the old presentation and currency arithmetic; stale open response dialogs cannot accept a superseded revision.
- [ ] Email, Meeting and Letter responses require an active permitted contact and valid evidence reference without signatures or provider verification.
- [ ] Changing engagement team/service/period triggers the documented downstream rework, while the accepted proposal's fee/currency remain unchanged.
- [ ] Closed and cancelled engagement behaviors follow the existing transition contract; history, released artifacts and linked records remain accessible only in permitted read-only views.

**Coding guide:** Reuse ProposalsView, EngagementsView and existing version/response commands. Capture the draft's expected revision before submission; do not build a second proposal editor or auto-create future work.

**Verification:** Extend VP-010-E01/E02, AT-56/58 and VP-012 cases. Assert exact prior snapshots, refused stale saves and rendered output content. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M05 — MOD-05: Jobs & Tasks

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-013, VP-014.  
**Local open action rows:** None in the current §9.3/§9.4 rows; finish original-criterion and shared acceptance.  
**Route/workspace:** `jobs`.  
**Implementation touchpoints:** [JobsTasksView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/JobsTasksView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a job manager, I want to finish and revisit manually managed jobs without corrupting their child records, so that job completion, cancellation and task history remain coherent.

**Preserve / current evidence:** VP-013-E01 is Complete and VP-014 is a verified baseline. Task notes and document links are implemented; do not recreate them. [S2]

**Required supported lifecycle:** create job → assign tasks/subtasks → work/comment/link documents → complete required children → complete job → permitted nonterminal rework → terminal cancellation/read-only history.

**Acceptance criteria**
- [ ] Parent/job completion is blocked while required children remain incomplete; empty-job behavior follows the original requirement.
- [ ] Task reassignment records real assignee, reason and order without granting reviewer or financial authority.
- [ ] Existing task notes, document links and reasoned unlink history remain available to authorized staff and absent from the client portal.
- [ ] Cancelled jobs remain terminal/read-only; preserve linked time, documents and tasks rather than inventing a cancelled-job reopen command.
- [ ] Map the observed existing lifecycle to all original VP-013/014 criteria and rerun it after shared guard/navigation changes.

**Coding guide:** Use JobsTasksView and existing job/task commands. Keep one subtask level, manual transitions and current linkage. No dependency scheduler or new comments subsystem.

**Verification:** Reuse AT-11/12/14 and current job guard cases. Add no duplicate test merely to raise a test count. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M06 — MOD-06: Job Templates

**Work type:** Confirmed code correction plus verification.  
**Original stories:** VP-015.  
**Local open action rows:** None in the current §9.3/§9.4 rows; finish original-criterion and shared acceptance.  
**Route/workspace:** `job-templates`.  
**Implementation touchpoints:** [JobTemplatesView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/JobTemplatesView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a template author, I want to save or discard template and instantiation drafts safely, so that navigation cannot lose work or accidentally publish a template or create a job.

**Preserve / current evidence:** The publish/apply/revise/retire lifecycle is recorded complete, but this review confirmed missing shared draft registration in JobTemplatesView (F05). [S2]

**Required supported lifecycle:** author draft → save → publish → open instantiation → deliberately choose scope/people/dates → create once → revise template → retire while old jobs retain their source revision.

**Acceptance criteria**
- [ ] Template authoring and instantiation each register a scoped dirty guard; hash/back/persona changes invoke the same decision flow as other forms.
- [ ] Stay retains entered fields; Discard leaves templates/jobs unchanged; Save's label accurately distinguishes saving a template from executing an instantiation.
- [ ] Capture selected template revision and target engagement when opening the draft; reject incompatible changes instead of silently rebinding.
- [ ] Retirement is reasoned and blocks only future instantiation; existing jobs remain pinned and unchanged.
- [ ] Repeated activation under one operation ID creates at most one job and does not copy historical evidence or approvals.

**Coding guide:** Pass onRegisterUnsavedForm from App into JobTemplatesView. Reuse applyJobTemplate, publishJobTemplate, retireJobTemplate and the existing revision commands; do not change their identity semantics.

**Verification:** Extend AT-13 with populated-draft hash/back transitions and stale template/target cases; retain existing idempotency and retirement tests. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M07 — MOD-07: Team Collaboration

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-016, VP-027.  
**Local open action rows:** `VP-027-E02`  
**Route/workspace:** `communications / jobs`.  
**Implementation touchpoints:** [CommunicationsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/CommunicationsView.tsx), [JobsTasksView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/JobsTasksView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a staff collaborator, I want to publish, correct and moderate internal notes through a consistent scoped lifecycle, so that only the intended people see the note, mention or attached reference.

**Preserve / current evidence:** Recipient notices, read state, note editing and moderation already exist. Remaining work overlaps VP-027-E02 actor/context/correction acceptance. [S2]

**Required supported lifecycle:** create scoped internal note → validate attachments/mentions → notify eligible staff locally → read/respond/correct → moderate/restore with reason → retain history.

**Acceptance criteria**
- [ ] Internal text, counts, attachment names and mention notices remain absent from all client projections and search.
- [ ] Only eligible actors can edit or moderate; moderation keeps the original attribution and recorded reason rather than deleting history.
- [ ] Empty/oversized/unsafe text is rejected or rendered inert using the current policy; failures leave saved state unchanged.
- [ ] Correction and publication across the remaining linked-request/context cases use the same canonical communication record.
- [ ] Run the shared search visibility regression so a client grant does not expose another engagement's note.

**Coding guide:** Reuse CommunicationsView, JobsTasksView and existing note/notice commands. Keep notifications browser-local and preserve approval history as a separate domain.

**Verification:** Retain AT-14 and extend the existing AT-27 correction/publication cases. Do not build chat, mailbox sync or external notifications. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M08 — MOD-08: Client Portal

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-025.  
**Local open action rows:** `VP-025-E01`  
**Route/workspace:** `portal`.  
**Implementation touchpoints:** [ClientPortalView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/ClientPortalView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a client administrator, finance contributor or authorized signatory, I want to complete each permitted portal action within the selected entity and engagement, so that role handoffs remain understandable without exposing internal work.

**Preserve / current evidence:** Multi-entity portal and sharing-withdrawal/no-access paths exist. VP-025-E01 still requires a bounded list/badge/action and role matrix. [S2]

**Required supported lifecycle:** choose permitted entity/engagement → inspect requests/files/messages → respond or acknowledge where authorized → switch role/scope → revisit exact historical response.

**Acceptance criteria**
- [ ] For each of the three client personas, specify which request, upload, nomination and acknowledgement actions are permitted and test the denied alternatives.
- [ ] Every list, badge, search result and action uses the same selected engagement; include same-client sibling engagements and a grant change while mounted.
- [ ] Internal workpapers, staff cost, risks and review text contribute no visible content or aggregate counts.
- [ ] Withdrawn sharing and unpresented packages remain unavailable; acknowledgement never creates management representation or staff review automatically.
- [ ] Retain the supported durable PBC reload behavior and version-specific acceptance rather than replacing it with sample-only downloads.

**Coding guide:** Extend existing ClientPortalView projections and command guards; do not create separate portal copies of requests, invoices or documents. Keep simulated identity labels.

**Verification:** Extend the existing AT-18/25 and VP-025-E01/E03 cases with a finite persona/action matrix and sentinel records. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M09 — MOD-09: Client Requests / PBC

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-023, VP-024.  
**Local open action rows:** None in §9.3; VP-023 story acceptance remains open.
**Route/workspace:** `client-detail / portal`.  
**Implementation touchpoints:** [ClientDetailView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/ClientDetailView.tsx), [ClientPortalView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/ClientPortalView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a engagement preparer and client contributor, I want to complete request filtering and recipient/context validation around the existing PBC lifecycle, so that requests reach the right contributor and evidence replacements remain independently reviewed.

**Preserve / current evidence:** Request edit/reassign/cancel and accepted-evidence replacement are implemented. The bounded VP-023-E02 filter/contact/context action is complete: all seven statuses, text, due buckets, recipient and combined filters are covered, with recipient/context atomicity and preserved history regressions. The prototype still does not send real email or persist through a server; story/criterion acceptance remains open. [S2]

**Required supported lifecycle:** draft → present → client respond → clarification/replacement → independent acceptance → follow-up or cancel → inspect prior versions and evidence impact.

**Acceptance criteria**
- [ ] Every supported status/text/due/recipient filter agrees with the displayed outstanding count and underlying request set.
- [ ] Inactive, foreign-client and unauthorized recipients cannot receive a presentation; absent context causes no partial request state.
- [ ] Cancellation and reassignment preserve prior response bytes/metadata, acceptance decisions and attributable reason history.
- [ ] After accepted-response replacement, old evidence pins remain historical, dependent work requires reassessment, and only the new reviewed version becomes current.
- [ ] No automatic reminders, delivery claims or uploader self-acceptance are introduced.

**Coding guide:** Reuse ClientDetailView/ClientPortalView, current PBC commands, artifact storage and request IDs. Limit code edits to reproduced filter or validation gaps.

**Verification:** Retain AT-23/24 and pbcRequestLifecycle regressions; explicitly reference the 26 September VP-024-E02 result during reconciliation. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M10 — MOD-10: Document Management

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-020, VP-021.  
**Local open action rows:** `VP-020-E01`, `VP-021-E01`  
**Route/workspace:** `documents`.  
**Implementation touchpoints:** [DocumentsLibraryView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/DocumentsLibraryView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a document user, I want to prepare and revisit a scoped workspace and its document versions with truthful availability, so that all linked modules resolve the same document without falsely promising persistent original bytes.

**Preserve / current evidence:** Workspace/library links and storage-class acceptance have substantial evidence; remaining rows concern root/retry/rename/scope and availability across record types. [S2]

**Required supported lifecycle:** verify simulated binding → explicitly prepare workspace → register/preview document → link to request/job/workpaper → rename/move/replace → unavailable/restore → revisit history.

**Acceptance criteria**
- [ ] Repeated preparation under the configured root does not duplicate folders; inactive clients, mismatched engagements and invalid roots are rejected atomically.
- [ ] Rename/move preserves logical identity and links; replacement creates a new version and does not rewrite prior evidence pins.
- [ ] Unavailable references are explained consistently in the library, PBC, workpaper and evidence views and cannot be accepted as current adequate evidence.
- [ ] Distinguish library metadata/session-only originals, durable PBC bytes and generated artifacts on both UI and reload behavior.
- [ ] Align README/module guidance with verified storage behavior without changing the supported storage model.

**Coding guide:** Use DocumentsLibraryView and the existing workspace/document/artifact services. Trace each linked record by exact scope and version; never add another document master or remote transfer.

**Verification:** Extend AT-19/20/21/22 and VP-021 evidence using the missing role/record-type combinations; preserve historical hashes. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M11 — MOD-11: Communications

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-026, VP-027.  
**Local open action rows:** `VP-026-E01`, `VP-027-E02`  
**Route/workspace:** `communications`.  
**Implementation touchpoints:** [CommunicationsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/CommunicationsView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a communication author, I want to compose, record and correct messages with explicit simulated outcomes, so that a failed or unknown attempt is never confused with delivery or silently retried.

**Preserve / current evidence:** Basic compose, manual incoming records, duplicate-submit protection and correction histories exist. VP-026-E01 and VP-027-E02 remain Partial; F01 also affects search. [S2]

**Required supported lifecycle:** draft/template → resolve fields and links → validate sender/recipient/scope → explicit simulated attempt → accepted/failed/unknown local result → deliberate new attempt or correction.

**Acceptance criteria**
- [ ] Unavailable sender, unresolved template placeholders and forbidden template editing block the action with an actionable message and no communication mutation.
- [ ] Cross-client/engagement or internal-only attachment links cannot be published to a client-facing message.
- [ ] One operation token records one attempt; closing and reopening for a deliberate retry creates a new attributable attempt, including after Unknown.
- [ ] Incoming-record publication requires the existing warning and authority; reasoned correction retains prior content and scope.
- [ ] Search applies the same role and engagement boundaries before exposing summaries, participants or type counts.

**Coding guide:** Reuse CommunicationsView and existing template/attempt/correction commands. Validate the saved configuration and current actor at execution; do not add mailbox polling, SMTP or an email provider.

**Verification:** Extend AT-26/27 with sender/placeholder/template/link negatives and the F01 same-client sibling sentinel. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M12 — MOD-12: Time Tracking

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-028.  
**Local open action rows:** `VP-028-E01`  
**Route/workspace:** `my-time`.  
**Implementation touchpoints:** [TimeTrackingView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/TimeTrackingView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a time preparer and reviewer, I want to complete time-entry validation and downstream effective-total checks, so that corrections retain history without double billing or changing issued invoices.

**Preserve / current evidence:** Billed-time correction and its warning are Complete. VP-028-E01 still has remaining date/duration/link-scope and consuming-view acceptance. [S2]

**Required supported lifecycle:** draft time → validate → submit → independent return/revise/approve → bill approved source → reasoned correction → reapprove → inspect effective totals and billing impact.

**Acceptance criteria**
- [ ] Impossible/future/scenario-incompatible dates, nonpositive duration and foreign job/task links fail without partial state.
- [ ] An approved revision superseded by a correction is counted once in time, job, budget, client, WIP/report and invoice-source views.
- [ ] Correction of consumed time leaves the issued invoice unchanged and does not make the corrected source billable again.
- [ ] Role/context changes preserve or deliberately discard the draft; the same natural person cannot review by switching a role label.
- [ ] Record the exact remaining original criteria after reusing the existing correction proof.

**Coding guide:** Use TimeTrackingView and getEffectiveTimeEntries-based projections; do not independently recalculate revision selection in each view. Keep rate snapshots and source-consumption linkage.

**Verification:** Extend AT-28 and current date/link guards. Retain the already-proven billed-time/invoice immutability scenario. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M13 — MOD-13: Budgets

**Work type:** Confirmed code correction plus verification.  
**Original stories:** VP-029.  
**Local open action rows:** `VP-029-E01`, `VP-029-E02`  
**Route/workspace:** `budgets`.  
**Implementation touchpoints:** [BudgetsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/BudgetsView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a budget author, I want to revise a context-bound budget and reconcile allocated/unallocated actuals, so that a draft cannot be lost or saved to another engagement and variances remain explainable.

**Preserve / current evidence:** Versioned budgets, pinned time rates and currency/privacy checks exist. F05 confirms missing draft registration; VP-029-E01/E02 retain unallocated/variance cases. [S2]

**Required supported lifecycle:** open exact engagement/base version → edit bounded lines → validate/save new version → compare approved time → inspect unmatched/unallocated effort → revise while historical rates remain pinned.

**Acceptance criteria**
- [ ] Budget authoring registers a dirty guard; direct hash/back and engagement changes cannot silently discard or rebind the draft.
- [ ] Capture the draft engagement and base version; reject a stale/context-mismatched save with no mutation.
- [ ] The 600 planned/660 approved minutes fixture produces +60 minutes and QAR 200 billable-value variance at QAR 200/hour; missing cost is Unknown.
- [ ] Engagement, job and unallocated views conserve approved effort without double counting; different currencies are never silently added.
- [ ] Billing-role views omit internal cost fields and amounts; new versions preserve prior budgets and approved-time/invoice snapshots.

**Coding guide:** Extend BudgetsView's existing authoring state and updateBudget use; pass the current guard callback from App. Compute actuals with the shared effective-time/rate selectors. Do not introduce a review engine unless the original criterion requires it.

**Verification:** Extend AT-29/59 and add populated-budget draft navigation/context regressions plus unmatched-activity aggregation checks. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M14 — MOD-14: Billing & Invoicing

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-030, VP-031.  
**Local open action rows:** `VP-031-E01`  
**Route/workspace:** `billing`.  
**Implementation touchpoints:** [BillingInvoicingView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/BillingInvoicingView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a billing preparer and independent reviewer, I want to finish invoice date/reference and correction acceptance using the existing source-linked revision flow, so that invoice edits preserve source reservations and issued records remain immutable.

**Preserve / current evidence:** VP-030-E01 now records source-linked Edit/Revise as implemented and tested. Do not recreate it. Remaining work is VP-031-E01 plus shared search visibility. [S2]

**Required supported lifecycle:** select eligible source → draft/edit → submit → independent return/revise/reapprove → issue locally → permitted credit → independent review → inspect settlement separately.

**Acceptance criteria**
- [ ] Validate the remaining original dates, numbers, references and required account/contact fields at both form and command boundaries.
- [ ] Source-linked revision retains exact source lines/reservations and clears stale review; current displayed totals equal the retained line data.
- [ ] Cancelled unissued drafts release only their own eligible reservation; issued invoices are corrected through the supported credit/revision process, not in-place edits.
- [ ] Credits reject wrong-client/currency, over-cap, invalid precision and stale invoice conditions atomically.
- [ ] Invoice issue/credit never creates a real payment or email delivery; forbidden roles cannot discover the invoice through search.

**Coding guide:** Use BillingInvoicingView and existing invoice/revision/credit commands; preserve legacy engagement ownership normalization and source-consumption IDs. Do not add milestone scheduling or a second ledger.

**Verification:** Extend AT-30/31/51 with the missing date/reference cases and retain the new source-linked draft regression. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M15 — MOD-15: Receivables

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-032, VP-033.  
**Local open action rows:** None in the current §9.3/§9.4 rows; finish original-criterion and shared acceptance.  
**Route/workspace:** `receivables`.  
**Implementation touchpoints:** [ReceivablesView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/ReceivablesView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a receivables user, I want to complete the original receipt/aging acceptance record around the working offline lifecycle, so that settlement, reversals and historical balances are demonstrably correct.

**Preserve / current evidence:** VP-032-E01/E02 and VP-033-E01 are Complete. A post-record receipt-metadata editor is not required by the source story. [S2]

**Required supported lifecycle:** issued invoice → record offline receipt → allocate/split → inspect unallocated balance → reasoned reversal → as-of aging → statement/export/print → revisit history.

**Acceptance criteria**
- [ ] Receipt amount equals effective allocations plus unallocated funds after partial/full allocation and selective reversal.
- [ ] Wrong-client/currency, stale invoice, over-cap and duplicate reversal cases retain atomicity and the recorded reason/history.
- [ ] The QAR 1,000 invoice less QAR 100 credit and QAR 300 allocation gives QAR 600 at the fixed as-of date; later receipts do not alter earlier aging.
- [ ] All five aging drill-downs, statements and exports reconcile to the displayed scoped values.
- [ ] Close the original criteria using existing proof and shared regressions; do not add payments, refunds, bank feeds or unsupported receipt editing.

**Coding guide:** Preserve ReceivablesView, shared aging calculations and receipt/allocation history. Apply shared guard fixes only where a real gap is demonstrated.

**Verification:** Reuse AT-32/33, boundary and reversal tests; record current exact evidence rather than writing another allocation implementation. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M17 — MOD-17: Search & Centralized Client View

**Work type:** Confirmed code correction plus verification.  
**Original stories:** VP-008, VP-061.  
**Local open action rows:** `VP-008-E01`, `VP-061-E02`  
**Route/workspace:** `Shell search / client-detail`.  
**Implementation touchpoints:** [Shell.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/layout/Shell.tsx), [ClientDetailView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/ClientDetailView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a scoped user, I want to search and return to exact authorized records, so that a convenient shortcut never widens my permissions or loses my client/engagement context.

**Preserve / current evidence:** Exact contact/task/workpaper/finding/PBC targets already have evidence. F01 is a confirmed search projection defect; VP-061-E02 remains Partial. [S2]

**Required supported lifecycle:** enter search → choose permitted filters → authorize category/owner → select exact record → recheck scope → open/highlight → return → revoke/expire grant.

**Acceptance criteria**
- [ ] Complete RV-X01: deny same-client sibling invoices/communications and role-forbidden financial results before any metadata is projected.
- [ ] Keep unavailable/archived labels truthful and open only the permitted historical target.
- [ ] All record-type/filter options and counts are computed from authorized results, not the unfiltered source collections.
- [ ] A result clicked after revoke/expiry is denied safely without retaining old content.
- [ ] Client 360 and search agree on the same underlying record identity, scope and return context.

**Coding guide:** Own F01 in Shell/guards once. Reuse existing target IDs and navigation callbacks; do not add semantic search, another router or client-local record copies.

**Verification:** Add focused selector probes and an AT-50/VP-061 browser regression covering same-client sibling scope and the preparer financial-role case. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M18 — MOD-18: Microsoft 365 Integration Simulation

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-017, VP-020, VP-021, VP-022, VP-026.  
**Local open action rows:** `VP-020-E01`, `VP-021-E01`, `VP-026-E01`
**Route/workspace:** `m365-setup`.  
**Implementation touchpoints:** [M365SetupView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/M365SetupView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a setup administrator, I want to finish configuration validation while keeping disconnected local workflows usable, so that the simulation explains failure and recovery without implying a live provider.

**Preserve / current evidence:** Changed-resource, outage, disconnect and recovery evidence covers the bounded VP-017-E01 action; broader VP-017 criterion acceptance remains open. VP-020-E01, VP-021-E01 and VP-026-E01, plus dependent document/mail cases, remain. [S2]

**Required supported lifecycle:** start/skip → choose synthetic resources → validate → simulate per-capability outcomes → review/save → resource change/stale result → explicit recovery/disconnect.

**Acceptance criteria**
- [ ] Complete remaining invalid tenant/site/library/root/sender/person combinations with atomic rollback and precise messages.
- [ ] Skipped setup or optional mail failure does not block unrelated local work; SharePoint and optional-service readiness stay independent.
- [ ] Initial identity mappings do not grant authorization and liveConnected remains false.
- [ ] Cancel/back/reload preserve exactly the intended draft or saved configuration; old successful results become stale when their resource identity changes.
- [ ] Keep optional OneDrive disabled by default and prove no provider request is sent by these controls.

**Coding guide:** Extend M365SetupView and existing configuration/outcome validators. Coordinate document-root checks with MOD-10 and sender/template checks with MOD-11; no real OAuth/provider wiring.

**Verification:** Reuse AT-15/16/19/21/26 and existing no-egress coverage; add only the missing configuration equivalence classes. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M19 — MOD-19: Identity & Access Management

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-018, VP-019.  
**Local open action rows:** `VP-019-E01`  
**Route/workspace:** `administration`.  
**Implementation touchpoints:** [AdministrationView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/AdministrationView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a access administrator, I want to complete reviewed role, expiry and group-scope decisions, so that an identity or relationship never silently grants professional authority.

**Preserve / current evidence:** Revocation/expiry open-dialog removal is recorded Complete. VP-019-E01 still has the professional-role/expiry/group matrix, and F01 shows a consumer that does not fully apply scope. [S2]

**Required supported lifecycle:** nominate/create synthetic identity → review request/evidence → grant exact compatible role/scope → test access → expire/revoke → inspect retained history.

**Acceptance criteria**
- [ ] Professional/management grants require the recorded independent evidence and must match the supported persona-role model.
- [ ] Global, Client, Engagement and Group grants each expose only their contractually permitted records; a group grant alone does not expose component-client workpapers.
- [ ] Test effective/expiry boundary dates with the controlled clock, then recheck commands and already-open projections.
- [ ] Same-person role switching never permits self-review; contact creation and relationship grouping create no authority.
- [ ] Fix scope omissions in consumers such as search rather than weakening the central scope helpers.

**Coding guide:** Reuse AdministrationView and guards.ts, including visibleClientIds/visibleEngagementIds and natural-person checks. Keep compatible role transitions within the current model and preserve grant evidence history.

**Verification:** Extend existing guards and AT-17/18/54 cases with finite named grant/expiry combinations and F01 regression. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M20 — MOD-20: Accounting Setup

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-034.  
**Local open action rows:** `VP-034-E01`, `VP-034-E02`  
**Route/workspace:** `accounting-setup`.  
**Implementation touchpoints:** [AccountingWorkbenchView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/AccountingWorkbenchView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a accounting preparer, I want to revise client, chart, period, book and dimensions with explicit downstream impact, so that reviewed outputs never remain current after a relevant setup change.

**Preserve / current evidence:** Invalid setup and sibling mapping/statement staleness have evidence. VP-034-E01/E02 retain period/book/archive/dimension/migration combinations. [S2]

**Required supported lifecycle:** configure context → activate valid setup → import/use → edit bounded setting → preview impact → save new revision → mark dependent work stale → rebuild/review.

**Acceptance criteria**
- [ ] Period/book edits target the correct client and do not overwrite sibling engagement history or a prior approved mapping.
- [ ] Closed books, archived/nonposting accounts, hierarchy cycles and invalid dimensions cannot authorize a new incompatible source.
- [ ] A dimension-only or chart change marks all affected current mappings/statements/packages for rework while preserving prior snapshots.
- [ ] Migrated records with unknown reporting basis stay unselected/unavailable until configured; no guessed basis is silently adopted.
- [ ] Header context matches the authorized selected record after RV-X03.

**Coding guide:** Use AccountingWorkbenchView and existing setup/change invalidation commands. Extend existing validators and source pins rather than introducing a second accounting context.

**Verification:** Extend AT-34 with period/book, account-archive, dimension-only and migrated-basis cases, including two same-client engagements. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M21 — MOD-21: Trial Balance & GL

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.

**Original stories:** VP-035, VP-036, VP-037.

**Local open action rows:** None — bounded control-comparison action VP-036-R01 is closed; broader original acceptance remains open.

**Route/workspace:** `accounting-setup / trial-balance / gl-transactions`.

**Implementation touchpoints:** [AccountingWorkbenchView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/AccountingWorkbenchView.tsx), [TBImportWizard.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/TBImportWizard.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a GL preparer and reviewer, I want to complete the replacement-to-reviewed-output lifecycle, so that new GL input invalidates dependent current work without rewriting accepted history.

**Preserve / current evidence:** TB import is Verified; VP-036-E02 core GL negatives, VP-036-E03 replacement-to-reviewed-output lifecycle and VP-036-R01's bounded original-control comparison are Complete. VP-036 story acceptance remains Partial. [S2]

**Required supported lifecycle:** choose context → map/import/validate → accept source → reconcile opening/movement/closing → review dependent work → replace source → preserve predecessor → regenerate/review.

**Acceptance criteria**
- [x] Compare the bounded original GL controls with current mapping, opening coverage, account/journal filters, visible journal drill-down, filtered export and no-posting behavior (VP-036-R01; bounded comparison only).
- [ ] Replace a reviewed GL source and retain exact prior rows, mapping choices, source hash and unchanged TB data.
- [ ] Dependent reconciliation and reviewed package readiness become stale immediately; an old candidate cannot authorize release.
- [ ] Complete the post-replacement correction/regeneration/re-review journey, and confirm the prior package history remains reproducible.
- [ ] Reuse core duplicate/partial-batch/wrong-context tests; do not mark them missing merely because older prose says so.

**Coding guide:** Extend AccountingWorkbenchView and existing GL parser/source/invalidation services. Preserve approved size limits and immutable revisions; no ledger posting or external accounting API.

**Verification:** AT-36 exercises the bounded mapped-source, opening/movement/TB tie-out, visible journal drill-down, account filter and CSV export. AT-36/AT-41 also cover replacement, preserved history and independent re-review. Broader fixture-size responsiveness, actor/criterion matrix and story sign-off remain open; do not manufacture reviewer approval.

**VP-036-R01 original-control comparison (bounded evidence; not full AC04 sign-off):**

| Original control | Current UI/evidence | Boundary still open |
|---|---|---|
| Map journal/line/account/date/debit-credit or signed amount/currency/description and optional dimensions; preview before import. | Accounting Workbench maps a nonstandard journal header and retains mapping/context; parser tests cover CSV/XLSX and invalid period/currency/date, duplicate and unbalanced rows. | Broader format/column/size/actor matrix remains open. |
| Opening source is explicit; missing opening coverage is unknown, not zero. | Optional `Opening Balance` mapping is visible; AT-36 reconciles per-account opening + movement to TB close; EX06/RR10 prove omitted/unmapped opening cannot report complete. | Multiple opening-source and mismatch combinations remain in the wider criterion matrix. |
| Source-bound filtering and journal drill-down preserve source references. | AT-36 applies journal J1 filter and asserts each displayed detail row visibly identifies J1; account 1000 filtering is independently checked. | Broader multi-journal, account and dimension combinations remain open. |
| Source counts and filtered CSV export agree with the active filters. | AT-36 checks the eight-row source count, account-filtered result and one-row CSV plus header. | The eight-row deterministic test fixture does not establish responsiveness at the documented fixture size. |
| Intake is not a posting engine; failed input does not mutate accepted sources. | Story scope and guards retain imported source rows; parser/guard regressions reject invalid input atomically and no-posting is explicitly disclosed. | No client/firm ledger posting or external accounting provider is in scope. |

### RV-M22 — MOD-22: Adjustments & Journals

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-038.  
**Local open action rows:** None — VP-038-E01/E02 bounded verification follow-ups are closed; original VP-038 acceptance and human sign-off remain open.  
**Route/workspace:** `adjustments / accounting-setup`.  
**Implementation touchpoints:** [AccountingWorkbenchView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/AccountingWorkbenchView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a adjustment preparer and independent reviewer, I want to finish evidence-linked journal decision and amendment cases, so that reporting uses each accepted adjustment exactly once against the correct source.

**Preserve / current evidence:** VP-038-E01/E02 bounded follow-ups are Complete. Revision-pinned evidence/document, workpaper and finding links reject foreign, unavailable and stale references; stale pins block decisions/reporting and remain visible with reasons. Amendment history preserves predecessor support pins; decision matrix covers accepted/unreflected, reflected, partial, unknown, rejected, stale-source and stale-support cases. Chrome records independent review/management acceptance, partial/unknown reporting explanations, reload history, amendment reapproval, unchanged source TB and source replacement/reconfirmation. The VP-038 story remains Partial: AC01/AC04 criterion sign-off and human review are not claimed. [S2]

**Required supported lifecycle:** draft balanced journal → submit → technical decision → management decision → evidenced reflection → reporting inclusion → link finding → source replacement/amendment → fresh decisions.

**Acceptance criteria**
- [x] Link journal support to the correct engagement and exact evidence/workpaper/finding revisions; reject foreign, stale or unavailable references (bounded implementation/evidence verified).
- [x] Rejected, Unknown and Partially reflected states cannot masquerade as approved included corrections (bounded implementation/evidence verified; original story sign-off remains open).
- [x] Amending an eligible journal preserves the predecessor and clears/requires exactly the decisions made stale by the change (bounded implementation/evidence verified).
- [x] Source replacement and reconfirmation retain the already-proven prior reflection history and never double apply an amount (bounded implementation/evidence verified).
- [x] Corrected-in-TB finding disposition is reachable only through the existing valid current journal/reporting conditions (bounded implementation/evidence verified).

**Coding guide:** Reuse the existing journal commands, reflection records and reporting-inclusion command in the accounting store/view. Do not mutate imported source rows, introduce a ledger or create a second approval chain.

**Verification:** `tests/unit/calculations.test.ts`, `tests/unit/guards.test.ts`, `tests/unit/lifecycleGaps.test.ts`; Chrome `tests/e2e/app.test.ts::AT-38` and `::VP-038-E01/E02`. Current build PASS, unit 240/240, full E2E 110/110 (5 static + 105 Chrome), focused journal Chrome 2/2, 2026-09-26. No reviewer approval is manufactured. Original AC01/AC04 sign-off remains open.

### RV-M23 — MOD-23: Reconciliations

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-039.  
**Local open action rows:** `VP-039-E01`  
**Route/workspace:** `reconciliations / accounting-setup`.  
**Implementation touchpoints:** [AccountingWorkbenchView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/AccountingWorkbenchView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a reconciliation preparer and reviewer, I want to finish the date, currency and scope cases around the working reconciliation lifecycle, so that a mathematically balanced schedule is accepted only with valid scoped evidence.

**Preserve / current evidence:** Draft/review/return/rework and stale-source history exist. AT-39 asserts visible arithmetic ($1,000,000 GL = $999,900 statement + $100 timing, $0 unexplained residual), and displays `Unknown` rather than inventing an opening when the source has none. AT-36 imports a balanced GL with an explicit QAR 100 opening for account 1000 and verifies the reconciliation card's opening + movement = calculated close. Cards use the existing account-level GL roll-forward; EX06/EX08 cover opening calculations. The variance function resolves legacy `sourceBalance`/`supportingBalance` aliases and signed negative timing items. Header and item evidence reject foreign-client and same-client/sibling-engagement records. A correctly linked proposed correction also cannot hide an unexplained residual or approve its schedule. EX09 verifies the UI's `Proposed correction` and legacy `correction` types cannot offset timing residuals. Reconciliation amounts, residuals and headers use schedule/engagement currency instead of hard-coded QAR. VP-039-E01 remains Partial pending the broader currency/date/scope matrix and criterion review; external bank provenance is explicitly not a missing feature. [S2]

**Required supported lifecycle:** select source/as-of date → enter typed items → compute residual → link evidence/correction → submit → independent review/return → revise → approve → replace source/reassess.

**Acceptance criteria**
- [ ] Exercise the remaining documented date/currency/scope equivalence classes without summing unrelated currencies.
- [ ] Timing differences require appropriate evidence; proposed accounting corrections require the correct journal linkage rather than an unexplained balancing item.
- [ ] Self-review, missing evidence, nonzero unexplained residual or stale source blocks approval atomically.
- [ ] Return reasons and approved predecessors remain readable after a new revision and a source replacement.
- [ ] Map each original criterion to the actual existing assertion and any newly added case.

**Coding guide:** Keep reconciliation logic within AccountingWorkbenchView and its current commands/calculations. No bank feed, matching engine or new provider-verification mechanism.

**Verification:** Extend AT-39 and existing reconciliation guards; test fixed expected residuals and historical snapshot equality. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M24 — MOD-24: Financial Statements

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-040, VP-041.  
**Local open action rows:** `VP-040-E01`, `VP-040-E03`, `VP-041-E03`  
**Route/workspace:** `financial-statements`.  
**Implementation touchpoints:** [FinancialStatementsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/FinancialStatementsView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a statement preparer and reviewer, I want to complete the supported statement set across source, comparative, layout and disclosure changes, so that each displayed or exported amount is traceable to reviewed current inputs.

**Preserve / current evidence:** Layout editing and bounded cash-flow/equity support exist. VP-040-E01/E03 and VP-041-E03 retain full supported-set and disclosure/rework acceptance. [S2]

**Required supported lifecycle:** select current/prior sources → approved mapping → layout/group/subtotal → movement schedules/notes → independent review → package → input change → stale → regenerate/review.

**Acceptance criteria**
- [ ] Each supported layout group/subtotal, current figure and comparative reconciles to the selected source and mapping revision.
- [ ] A changed current/prior source, mapping or layout invalidates the correct reviewed output; regeneration creates a fresh revision and leaves historical output intact.
- [ ] Cash-flow/equity inputs produce only amounts supported by the approved fixture; absent component equity mapping remains unavailable, not invented from a combined total.
- [ ] Note applicability, evidence, sharing and independent review are revision-bound; note/schedule changes stale package composition.
- [ ] Client-visible artifacts contain only explicitly shared note content and exclude internal work/review material.

**Coding guide:** Reuse FinancialStatementsView, existing builders, schedule/notes commands and package lineage. Separate supported fixture completion from new accounting-method scope; do not add a generic layout/rules engine.

**Verification:** Extend AT-37 and existing statement/package cases with a finite source × mapping × layout × note-revision matrix and exact expected subtotals. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M25 — MOD-25: Financial Packages

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-042.  
**Local open action rows:** None in the current §9.3/§9.4 rows; finish original-criterion and shared acceptance.  
**Route/workspace:** `financial-packages`.  
**Implementation touchpoints:** [FinancialPackagesView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/FinancialPackagesView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a package preparer and management reviewer, I want to close the original package acceptance contract using the already implemented artifact lifecycle, so that a package is complete only when its exact bytes and current reviewed inputs are consistent.

**Preserve / current evidence:** VP-042-E01/E02 failure cleanup and replacement acknowledgement are Complete. No new export or artifact subsystem is justified by the Partial module label. [S2]

**Required supported lifecycle:** choose exact reviewed inputs → compose/order → generate real artifacts → validate → review/acknowledge → downstream release → amend/reassemble → fresh review.

**Acceptance criteria**
- [ ] Map all original package criteria to the existing XLSX/DOCX/PDF, cleanup and replacement-revision assertions.
- [ ] A changed disclosure/schedule/source invalidates current readiness without deleting historical package bytes or decisions.
- [ ] Partial persistence/generation failure leaves no falsely complete revision or orphaned current artifact set.
- [ ] Every supported download rechecks current authorization and exact artifact identity; client output excludes internal material.
- [ ] Management acknowledgement remains distinct from professional review, representation receipt and report release.

**Coding guide:** Preserve FinancialPackagesView and shared artifact services. Only extend missing assertions or a reproduced defect; avoid new file libraries, storage systems or generic renderers.

**Verification:** Reuse AT-41/42/48 and relevant MOD-24 input-change tests; reopen a closed action only when its stated acceptance is actually disproved. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M26 — MOD-26: Consolidation

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-043, VP-044, VP-045, VP-046.  
**Local open action rows:** `VP-045-E02`, `VP-045-R01`  
**Route/workspace:** `consolidation`.  
**Implementation touchpoints:** [ConsolidationView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/ConsolidationView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a group-reporting preparer and reviewer, I want to finish manual elimination edge cases in the supported two-component profile, so that group totals stay reproducible when sources, rates or decisions change.

**Preserve / current evidence:** Perimeter, translation and separate group-output lineage have evidence. VP-045-E02/R01 retain duplicate/mixed-context/staleness and contractual unmatched semantics. [S2]

**Required supported lifecycle:** pin supported components → choose approved rates → identify pair/residual → draft elimination → submit → independent return/amend/approve → group output → upstream change → re-review.

**Acceptance criteria**
- [ ] Reject duplicate inclusion, unbalanced journals and mixed component/period/currency/source pairs without altering either component.
- [ ] After eliminating a matched QAR 900 pair from a QAR 1,000 receivable, the QAR 100 residual remains visible and traceable, not plugged away.
- [ ] Component replacement or rate/perimeter change invalidates the affected elimination/output approvals while preserving the predecessor.
- [ ] Determine from the original criteria whether a separately linked unmatched record is necessary; reuse the current residual representation when it already satisfies the requirement.
- [ ] Same-currency and supported FX output retain exact source/rate/decision lineage and independent group-only access.

**Coding guide:** Use ConsolidationView and current group/elimination/output commands. Keep Parent plus wholly owned Subsidiary scope; do not add associate/minority methods or a workflow engine to close a scope note.

**Verification:** Extend AT-43/44/45 and elimination guards with duplicate/mixed-source and replacement cases, then reuse existing digest-bound group output verification. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M28 — MOD-28: Audit Planning

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-048.  
**Local open action rows:** None in the current §9.3/§9.4 rows; finish original-criterion and shared acceptance.  
**Route/workspace:** `audit-planning`.  
**Implementation touchpoints:** [AuditPlanningView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/AuditPlanningView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a audit planning manager, I want to finish formal planning acceptance around the implemented deliberate-input lifecycle, so that materiality and scope decisions remain attributable human decisions.

**Preserve / current evidence:** VP-048-E01/E03 and its assumption reconciliation are Complete. Do not rebuild threshold/team/milestone inputs. [S2]

**Required supported lifecycle:** enter scope/benchmark/rationale → calculate chosen thresholds → assign team/timing → submit → independent return/revise/approve → material change → reassessment.

**Acceptance criteria**
- [ ] All original planning fields and deliberate assumptions map to current form/command/test evidence.
- [ ] No default threshold, missing benchmark or empty rationale is presented as an approved professional conclusion.
- [ ] A changed approved plan identifies affected fieldwork/conclusions without granting authority or releasing a report.
- [ ] Stay/Discard/Save and same-person denial remain correct after the shared fixes.
- [ ] Retain prior plan/materiality revisions and obtain the actual required story acceptance.

**Coding guide:** Preserve AuditPlanningView and existing plan/materiality guards. Reuse the current bounded calculations and scenario clock; add no methodology automation.

**Verification:** Reuse the existing planning/materiality and VP-049 journeys; add only missing original-criterion assertions. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M29 — MOD-29: Risks & Audit Programs

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-049.  
**Local open action rows:** None in the current §9.3/§9.4 rows; finish original-criterion and shared acceptance.  
**Route/workspace:** `audit-risks`.  
**Implementation touchpoints:** [AuditRisksProgramsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/AuditRisksProgramsView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a audit manager, I want to sign off the existing risk/program lifecycle with exact version and authority evidence, so that risk changes remain connected to procedures without rewriting adopted programs.

**Preserve / current evidence:** Both VP-049-E01/E02 are Complete, including multi-risk and template-version cases. Remaining work is original-criterion/shared acceptance. [S2]

**Required supported lifecycle:** create risk → map assertions/procedures → draft/publish template → adopt exact revision → review plan → change risk → reassess procedures → re-review.

**Acceptance criteria**
- [ ] Each original criterion maps to evidence for real reciprocal risk/procedure links and permitted owners.
- [ ] Cross-engagement links and inactive/client/out-of-scope owners fail without partial changes.
- [ ] Applied v1/v2 template snapshots remain unchanged after a later revision or retirement.
- [ ] Unresolved coverage gaps remain visible and block the relevant submission; reassessment preserves prior histories.
- [ ] Shared context/draft fixes do not regress existing completed cases.

**Coding guide:** Keep AuditRisksProgramsView and current risk/template/plan commands. Do not add another program library, generic form builder or reassessment engine.

**Verification:** Reuse the focused risk lifecycle and template-version tests already cited in VP-049-E01/E02, with exact current run attribution. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M30 — MOD-30: Audit Fieldwork

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-050.  
**Local open action rows:** None in the current §9.3/§9.4 rows; finish original-criterion and shared acceptance.  
**Route/workspace:** `audit-fieldwork / audit-risks`.  
**Implementation touchpoints:** [AuditRisksProgramsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/AuditRisksProgramsView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a fieldwork preparer and independent reviewer, I want to complete criterion sign-off for the existing evidence-backed procedure lifecycle, so that work performed, exceptions and review decisions remain tied to their exact revisions.

**Preserve / current evidence:** VP-050-E01 is Complete, including return/resubmit/re-clear history. Do not rebuild fieldwork merely because module status is Partial. [S2]

**Required supported lifecycle:** perform procedure → link current adequate evidence or record limitation → submit → reviewer return → revise/resubmit → independent clear → evidence change → reassess.

**Acceptance criteria**
- [ ] Map all four original fieldwork criteria to actual assertions, including the existing multi-step return/rework history.
- [ ] Exceptions and evidence limitations stay visible after review; a cleared workflow is not an automatic successful audit conclusion.
- [ ] The same person cannot clear their own preparation under another role label.
- [ ] History retains actor, work, result, status, template/program version and return reason after reload.
- [ ] Replacing evidence or changing planning makes current applicability stale without erasing historical clearance.

**Coding guide:** Preserve procedure commands and history in AuditRisksProgramsView/store. Reuse the program owner in MOD-29 and evidence owner in MOD-33; no parallel execution model.

**Verification:** Reuse VP-050 and evidence-replacement browser cases; connect their actual assertions to original acceptance rather than duplicating an eight-step journey. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M34 — MOD-34: Findings & Differences

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-054.  
**Local open action rows:** None in the current §9.3/§9.4 rows; finish original-criterion and shared acceptance.  
**Route/workspace:** `findings`.  
**Implementation touchpoints:** [FindingsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/FindingsView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a audit senior and reviewer, I want to finish acceptance of evidence-backed finding dispositions and completion impact, so that a waiver or correction is reasoned and traceable rather than automatically inferred.

**Preserve / current evidence:** VP-054-E01/E02 are Complete, including cross-view release impact and qualitative provenance. Remaining work is exact story/shared acceptance. [S2]

**Required supported lifecycle:** record sourced matter → classify monetary/qualitative → link evidence/journal → record permitted disposition → review impact → reopen/reassess when needed → retain provenance.

**Acceptance criteria**
- [ ] Qualitative findings retain no invented amount; monetary findings distinguish signed net and gross absolute values by currency.
- [ ] Uncorrected, waived and corrected dispositions follow existing authority/evidence rules and retain actor, time and reason.
- [ ] Corrected-in-TB requires the linked current reviewed journal/reporting condition, not a free status toggle.
- [ ] Detail, reporting, package and release-readiness views agree on the same significant-matter state.
- [ ] Provenance remains unchanged across disposition/reload, and professional immateriality is not concluded automatically.

**Coding guide:** Reuse FindingsView and the existing finding/journal linkage commands. Do not create a new issue system or repeat the already-completed source-replacement fix.

**Verification:** Reuse existing VP-054 qualitative/correction and release-impact tests; close the exact four-criterion record after relevant shared regressions. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

### RV-M39 — MOD-39: Administration

**Work type:** Targeted verification / acceptance; implement only a reproduced gap.  
**Original stories:** VP-019, VP-062.  
**Local open action rows:** `VP-019-E01`  
**Route/workspace:** `administration / services`.  
**Implementation touchpoints:** [AdministrationView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/AdministrationView.tsx); existing `prototypeStore` commands, selectors and services.

**User story:** As a firm administrator, I want to complete settings and access acceptance without acquiring professional authority, so that defaults affect future records while historic invoices and approvals remain unchanged.

**Preserve / current evidence:** VP-062-E01/E02 and settings ownership reconciliation are Complete. Remaining module concerns overlap VP-019-E01 and shared context/documentation. [S2]

**Required supported lifecycle:** edit permitted firm defaults → validate/save with reason → create future draft → inspect consumed numbering/terms → reject collision → review historical records → manage scoped access.

**Acceptance criteria**
- [ ] Each supported setting is consumed by its owning form/service prospectively; no second copy of accounting, mail or template settings is introduced.
- [ ] Invalid numbering, timezone or logo references fail atomically and collisions do not consume counters.
- [ ] Issued invoices, released packages and template-derived jobs retain their historical values.
- [ ] Administrator status alone grants no budget, mapping or professional approval authority; complete the remaining grant/expiry/group cases.
- [ ] Capture actual original-criterion acceptance and update the guide without relabelling all settings as a new feature.

**Coding guide:** Preserve AdministrationView, existing firm-settings commands and dedicated module editors. Integrate RV-X02 only for an actually uncovered editor; do not add a universal settings framework.

**Verification:** Reuse VP-062 settings-consumption/collision tests and the targeted MOD-19 access matrix. Record the actual source/build, fixture and assertion; use the existing unit/Chrome harness and do not manufacture reviewer approval.

## 6. Preserve the 10 Verified modules

Do not rebuild these modules. Their current label is repository-reported Verified; this review has not independently rerun their complete acceptance. Shared changes still require appropriate regressions. A concrete regression can reopen its precise criterion without erasing earlier evidence. [S10]

| Module | Lifecycle to preserve | Relevant regression after shared fixes |
|---|---|---|
| MOD-03 — Leads & Opportunities | Inquiry → qualification/stages → reasoned Won/Lost/Unqualified → explicit permitted conversion | Currency-separated pipeline; duplicate conversion; exact scoped proposal handoff. |
| MOD-16 — Reporting & Analytics | Select/filter → derive scoped result → drill down → CSV/print → revisit | Search/role changes do not expose restricted financial data; reports and exports reconcile. |
| MOD-27 — Client Acceptance | Screening evidence → recommendation → independent decision → fresh engagement/continuance | No same-person bypass, missing-evidence approval or automatic copying of prior-year completed work. |
| MOD-31 — Populations & Sampling | Import/reconcile → manual selection → item tests/limitations → findings → independent evaluation → source replacement | Exact population version and item IDs survive history; no unearned statistical-assurance claim. Inventory draft navigation. |
| MOD-32 — Workpapers | Template-pinned draft → exact evidence links → submit → independent return/clear → revision | Guard changes preserve draft and workbook identity; evidence replacement invalidates current review only. |
| MOD-33 — Evidence | Register/verify → assess adequacy → link exact version → replace/unlink → reassess | Missing/unavailable/stale evidence cannot appear current; issued manifests remain unchanged. |
| MOD-35 — Review Points | Raise/assign → respond with exact revision → independent clear → source change/reopen | No self-clear; reassignment retains scope and history; stale response cannot clear. |
| MOD-36 — Reviews & Approvals | Assign eligible reviewer → inspect exact package/revision → accept/reject → invalidate on change | Natural-person separation, group/engagement scope, EQR and management decisions remain distinct. |
| MOD-37 — Completion & Release | Evaluate blockers → prepare exact candidate → issue locally → amendment → fresh review/reissue | No stale/tampered artifact or missing gate can authorize issue; old release identity survives. |
| MOD-38 — Records & Archive | Released bytes → local archive manifest/copy → verify digest → hold/handover metadata → successor history | Correct storage-class disclosure; preserved predecessor bytes/history; no external retention or automatic deletion claim. |

A visible path in one of these modules is not permission to disable its guards for an easier demonstration. Fix fixtures and intended handoffs instead.

## 7. Coding and implementation guide

### 7.1 Work in the correct repository and preserve concurrent work

Read root/nested `AGENTS.md` files if present, then inspect the current branch, HEAD, status and diffs. This report is pinned evidence, not an instruction to reset the checkout to the reviewed SHA.

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline -n 15
git diff
git diff --cached
git worktree list
```

Keep unknown/in-progress edits intact. Do not reset, clean, overwrite whole files or “fix” another agent's changes without understanding them. Serialize edits to `prototypeStore.ts`, shared types, `App.tsx`, `Shell.tsx`, migrations, artifact services and the canonical acceptance records. Use the smallest coherent slice; do not launch a parallel architectural rewrite.

This document authorizes no remote action. Commits, pushes, merges, deployments, tenant operations and destructive changes require the repository's actual authorization process. Do not invent or copy an approval from a different project.

### 7.2 Preserve the active architecture

Use the current React/TypeScript/Vite application, one `prototypeStore`, current module views, shared services/types, scenario factories, styling, guard system and local persistence. New functional work belongs in `src/`, not the historical `app.js`/`base-app.js` compatibility runtime.

Do not add Redux/Zustand, a backend, database, .NET layering, generic form/rules/workflow engines, another router, another artifact store or a new test framework. Extract a small helper only when the fix actually needs shared behavior.

Preserve existing code-splitting/CSP-compatible loading. Do not change module loading, lockfiles or dependency versions merely to tidy the project.

### 7.3 Authorize before building visible data

For F01, the smallest valid change is usually to add the missing role and exact engagement predicates to the existing search projection, not rewrite search. A small typed selector can make the policy testable when no equivalent helper already exists.

The following is an **integration example**, not a patch claimed to have been compiled in this repository. It intentionally handles engagement-owned records only:

```typescript
// Example placement: the existing search-selector service in src/services.
// Reuse an existing equivalent helper instead of creating a duplicate.
import type { PrototypeState, RouteKey } from '../types';
import {
  activePersona,
  canOpenRoute,
  visibleEngagementIds,
} from './guards';

export function canSearchEngagementRecord(
  state: PrototypeState,
  route: RouteKey,
  clientId: string | undefined,
  engagementId: string | undefined,
): boolean {
  const actor = activePersona(state);

  if (!actor.active || !canOpenRoute(actor.role, route, actor.active)) {
    return false;
  }

  // Engagement-owned records require explicit, consistent ownership.
  if (!clientId || !engagementId) return false;

  const engagement = state.engagements.find(
    item => item.id === engagementId && item.client === clientId,
  );
  if (!engagement) return false;

  const allowed = visibleEngagementIds(state);
  return allowed === 'ALL' || allowed.includes(engagementId);
}
```

For existing invoices, resolve `invoice.engagementId || invoice.eng` before calling the predicate. For communications that legitimately belong to a client rather than an engagement, use an **explicit separate client-wide rule** from the original contract. Do not treat missing IDs as an implicit global/client grant, and do not accidentally hide valid client-wide records.

Apply policy before snippets, type options, counts and sorting. A destination refusing navigation does not undo metadata already leaked in search. Keep a second current-scope check at execution/open time.

### 7.4 Make drafts context-bound and saves truthful

For each actual editable form, capture the draft's owner/engagement, base revision and meaningful initial values when the editor opens. Register with the existing `UnsavedFormGuard`; unregister on close/unmount and do not let a previous screen's guard remain active.

The guard must call a save function with an honest success result. A current click handler that catches an exception and returns `void` must not be wrapped as “always successful.” Refactor only that handler to return `true` after the intended update succeeds and `false` after validation/persistence failure, while preserving its visible error.

Immediately before saving, re-resolve the current actor and exact record. Refuse stale or context-mismatched writes. Stay retains the draft; Discard changes no business records; Save performs the labelled operation once. Applying a template, publishing, approving, issuing or resetting is not interchangeable with saving an ordinary draft.

Confirm destructive reset separately. Do not persist a draft and immediately reset it while claiming the work was saved safely. Keep existing recoverable payload handling and fail visibly when storage is unavailable.

### 7.5 Extend commands without bypassing invariants

Use existing store commands, validation, update/persistence helpers and error conventions. Validate required fields, ownership, role, expected revision, transition eligibility and natural-person separation before publishing a change. Rejected commands must leave observable business state unchanged.

Use stable record IDs and existing revision/operation identity mechanisms. Do not generate duplicate entities when an existing record already owns the behavior. Keep source snapshots, submissions, approvals, release manifests and archive lineage historical; changes create the supported new revision or invalidate current applicability, not rewrite an accepted past.

Currentness checks belong to the existing source/dependency logic. Do not fix a stale-output display by manually toggling a separate UI “Current” flag.

### 7.6 Preserve calculation and storage semantics

Respect the actual amount units in each type. Some UI calculations use decimal major units while lineage/artifact paths can use integer minor units; inspect the type and existing helper rather than inserting blanket `* 100` conversions. Keep rounding, signed/gross amounts and currency grouping consistent.

Use `state.asOfDate` or the existing scenario clock for deterministic historical calculations. Invalid dates remain invalid; missing inputs stay Unknown/Unavailable rather than becoming zero.

Preserve separate storage classes:
- Metadata/session-only library originals must not be advertised as durable original downloads.
- Supported PBC response bytes already use their documented browser-local artifact path.
- Generated package/archive artifacts retain exact byte identity and digest checks.

Confirm each path in source and a reload test before editing documentation. Do not turn one path's persistence rule into a universal rule for every file.

### 7.7 Fix a reproduced gap, not every historical limitation

Use this loop for each original action:

```text
Read original criterion and current action
→ inspect current code and concurrent changes
→ reproduce or locate exact existing proof
→ classify FIX / VERIFY / RECONCILE / REAL BLOCKER
→ implement the smallest compatible change only when needed
→ run relevant tests
→ verify downstream/currentness impact
→ update the canonical record with actual evidence
```

Stop expanding a slice when it accumulates a new framework, generic abstraction, unrelated cleanup or an unrequested accounting method. Simplify back to the accepted prototype contract.

Application AI features, payments, eSignatures, tax/payroll execution, recurring workflow/close automation, advanced inbox sync, non-M365 business integrations and Purview remain excluded. Using a coding agent to develop the app does not add an application-AI feature. Imported historical account labels must not be deleted merely because they contain “tax” or “salary.”

### 7.8 Tests and acceptance evidence

Inspect current `package.json` and the existing test harness before running commands. In an authorized local checkout with the existing lockfile/dependencies, the established command family is:

```bash
npm ci
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```

Use `npm run legacy:check` when required by existing checks or when legacy output is affected; a legacy syntax check is not React lifecycle acceptance. Use the existing Python progress helper to validate/refresh task-pack records when they change. The original pinned review could not rerun these checks; the follow-up results and exact commands are recorded in §1.2 and verification entry 81.

Start with relevant existing tests; add minimal regressions for changed behavior. Then run the applicable complete suite on a stable candidate tree. Do not add tests merely to increase totals, skip a failing assertion, weaken scope checks, or change expected financial figures to the implementation's own output.

Tests that seed a deterministic initial fixture are legitimate. Tests that insert a completed approval/package/release directly into state do not prove the user can reach that outcome through the UI. Include the required fresh-record connected journey.

Record: original criterion/action; exact source SHA and dirty diff/tree hash; package/build configuration; scenario/persona/scope/date; command and test name; independent expected value; observed value; output identity/hash; result; actual reviewer decision. An absent browser or missing dependency is Not run/Blocked, never a successful skip.

## 8. Exact remaining action inventory

This inventory preserves the original IDs. It was transcribed from the pinned detailed rows and counted programmatically. `Partial`, `Pending` and explicitly subcase-only verification remain open; ordinary `Complete`, `Reconciled` and `Verified` rows are not counted as new implementation work. Source: tracker §9.3–9.4. [S2]

### 8.1 Open verification/action rows — 33

| Original action | Current row class | Specific remaining closure |
|---|---|---|
| [VP-003-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2601) | Partial | Dirty client-profile Escape/backdrop decisions now have Stay/Discard and focus-return proof at 320/390/768px (AT-53); finish dialog-specific save/cancel/close/Escape/Enter/focus-return coverage across the remaining active-modal families. See `docs/prototype/verification.md`, entry 83. |
| [VP-003-E02](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2602) | Partial | Complete dirty-form protection across remaining forms and route, hash, client, engagement and persona transitions. |
| [VP-004-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2603) | Partial | Exercise recovery using authentic historical persisted shapes, not only current fixtures with old version numbers. |
| [VP-008-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2609) | Partial | Close remaining Client 360 tab actions, exact targets and multiple engagement-scope combinations. |
| [VP-010-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2610) | Partial | Verify all contractual proposal/service/template fields, fee arithmetic and rendered preview/print content. |
| [VP-010-E02](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2611) | Partial | Complete bounded proposal return/revise/redisplay cases without rewriting earlier presentations. |
| [VP-011-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2612) | Partial | Complete stale-dialog, withdrawn/revised-response, return-reason and invalid-evidence cases. |
| [VP-011-E02](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2613) | Partial | Verify response methods and linked correspondence/document references for the permitted actors. |
| [VP-012-E02](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2615) | Partial | Close Closed-state and cross-view historical-output behavior across engagement transitions. |
| [VP-019-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2622) | Partial | Complete professional-role approval evidence, expiry and narrow group/component grant combinations. |
| [VP-020-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2624) | Partial | Complete workspace prerequisite, exact-root, retry, rename and permitted-scope combinations. |
| [VP-021-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2626) | Partial | Complete document availability/restore, wrong-root and linked-version cases across relevant roles and record types. |
| VP-023-E02 | Complete bounded evidence action | AT-23/24 and `pbcRequestFilters` matrix; full story acceptance remains open. |
| [VP-025-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2634) | Partial | Complete portal list, badge, search, action, nomination and acknowledgement role/resource matrix. |
| [VP-026-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2636) | Partial | Verify unavailable sender, unresolved placeholders, document-link scope and template permissions. |
| [VP-027-E02](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2637) | Partial | Complete publication/correction, linked-request and attachment cases across permitted actors and contexts. |
| [VP-028-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2638) | Partial | Complete time-entry date/duration/link-scope cases and effective totals in every consuming view. |
| [VP-029-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2640) | Partial | Close unallocated/job budget aggregation against the fixed arithmetic fixture. |
| [VP-029-E02](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2641) | Partial | Complete bounded budget change, historical-rate and variance cases; require review only where the contract does. |
| [VP-031-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2643) | Partial | Complete invoice date/reference and revision/correction cases; source-linked editing now exists. |
| [VP-034-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2648) | Partial | Finish accounting period/book/client/chart edits and downstream rework across sibling engagements. |
| [VP-034-E02](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2649) | Partial | Close archived-account, dimension-only and migration cases without changing reviewed historical outputs. |
| [VP-039-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2656) | Partial | Complete the bounded reconciliation currency/date/scope matrix and criterion-level evidence. |
| [VP-040-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2657) | Partial | Finish current/prior source, mapping and layout regeneration cases with exact expected subtotals. |
| [VP-040-E03](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2658) | Verified subcase only | Close full supported statement coverage around the verified cash-flow/equity subcase. |
| [VP-041-E03](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2659) | Verified subcase only | Close the remaining disclosure/schedule rework and client-sharing acceptance beyond verified subcases. |
| [VP-045-E02](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2665) | Partial | Complete duplicate/mixed-context elimination and source/rate/perimeter invalidation cases. |
| [VP-061-E02](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2675) | Partial | Finish search scope/role/target coverage; the F01 sibling-engagement and role leaks are fixed and tested. |
| [VP-063-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2678) | Pending | Execute the approved criterion-level positive, invalid, scope, stale, rework, reload and failure matrix. |
| [VP-063-E02](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2679) | Pending | Bind each result to the exact source/build, fixture, assertion and artifact. |
| [VP-064-E01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2681) | Pending | Publish one consistent criterion-to-evidence map and reconcile conflicting status documents. |
| [VP-064-E02](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2682) | Pending | Rehearse the presenter guide on the same pinned build, including fresh/empty and failure/rework paths. |

### 8.2 Open scope/reconciliation rows — 2

**Closed since the original review inventory:** VP-064-R03 (excluded live-service scope and action-count reconciliation), VP-063-E03 (serialized current-candidate test run and no-external-request evidence; see `docs/prototype/verification.md`, entry 81), VP-017-E02 (AT-15/16 confirms setup skip and failed SharePoint/mail simulations leave local fixture jobs usable), VP-017-E01 (AT-15 + RR35 invalid-selection atomicity + VP-017 outcome matrix; see entry 84), VP-036-E03 (AT-36/AT-41 GL replacement-to-reviewed-output lifecycle; see entry 86), and VP-036-R01 (original bounded control comparison; see entry 87). VP-017 criterion sign-off and broader optional-service/provider acceptance remain Partial; VP-036 AC04's documented-size responsiveness and wider acceptance matrix remain open.

| Original action | Current row class | Required decision or closure |
|---|---|---|
| [VP-003-R03](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2688) | Partial | Identify and close genuinely unguarded forms without replacing the existing guard architecture. |
| [VP-045-R01](https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2717) | Partial | Resolve elimination counterparty/evidence/unmatched semantics against the original four criteria. |

**VP-064-R03 was reconciled on 2026-09-26** by removing excluded live-service integrations from the pending denominator and updating counts without renumbering original stories; it is no longer an open action row.

**Important:** the current 35 rows overlap capabilities and acceptance obligations. A scope row and a verification row can refer to the same feature. Ten Partial modules have no open module-local action in this inventory; that does not erase their original story/shared acceptance, and it does not justify inventing new work.

The following Partial modules have complete local action rows apart from shared obligations: MOD-01, MOD-05, MOD-06, MOD-15, MOD-21, MOD-25, MOD-28, MOD-29, MOD-30 and MOD-34. MOD-06's shared-draft defect F05 is fixed and regression-tested; original story acceptance remains open. MOD-21's bounded control comparison is complete, but broader VP-036 story acceptance remains open. MOD-39's settings actions are complete, but its shared IAM responsibility still links to VP-019-E01.

## 9. Cross-module acceptance journeys and completion gates

### 9.1 Execute connected paths, not isolated screenshots

Use the original AT requirements as the authority and retain their IDs. The following are completion paths, not extra product modules.

| Journey | Required ordinary user actions | Critical negative/rework proof |
|---|---|---|
| Fresh practice → client → engagement | Begin with a permitted empty scenario; manually create inquiry/client/proposal; record commercial response and separate professional acceptance; activate engagement. | No fabricated completed work; rejected/withdrawn proposal preserves history; activation does not create future tasks or invoices. |
| Engagement → job → PBC → evidence | Create job/tasks; create and present a scoped request; client responds; staff clarifies/reviews; replace accepted evidence. | Wrong recipient and same-person acceptance denied; old response and evidence pins survive replacement; affected fieldwork is reassessed. |
| Time → budget → invoice → receivables | Enter/approve time; reconcile budget/unallocated effort; draft source-linked invoice; independently review/issue; record offline receipt and allocations. | Budget draft protection; issued invoice unchanged by later time correction; no duplicate time consumption; historical aging remains correct. |
| Setup → TB/GL → statements → package | Configure context; import controlled real-format inputs; map/reconcile; review statements/notes; generate a complete artifact set. | Failed replacement leaves old accepted input intact; later GL/source/layout/note change stales current reviewed output; exact re-review restores readiness. |
| Journal → finding → completion | Prepare/review journal; record management/reflection evidence; link finding; confirm correct reporting inclusion and disposition. | Partial/Unknown/rejected/stale decisions do not falsely clear output; source replacement needs reconfirmation; no duplicate adjustment effect. |
| Planning → fieldwork → review | Deliberately enter assumptions; map risks/programs; select/test population; prepare workpaper and evidence; submit, return, revise and clear. | Natural-person separation; limits/exceptions stay visible; changed evidence/plan invalidates current review without deleting history. |
| Components → elimination → group output | Pin the supported components/rates; record matched elimination; submit/return/amend/approve; produce reviewed group output. | Duplicate/mixed-source cases denied; unmatched amount stays visible; rate/perimeter/component replacement invalidates current approval. |
| Package → release → archive | Independently review the exact artifact set; prepare candidate; issue locally; archive exact bytes; amend/re-review/reissue. | Stale/tampered/missing artifact blocks issue; old manifest and archive remain immutable within the supported local model. |
| Scope, navigation and recovery | Repeat representative paths with narrow same-client engagement grants, a disallowed role, dirty hash/back navigation and recovery choices. | No search metadata leak; no unconfirmed reset; truthful header; unique navigation IDs; no wrong-context save or silent recovery overwrite. |

At least one complete primary journey must start with manually entered business records rather than a pre-completed fixture. Fixture seeding is appropriate for controlled negative states and pure calculations, but does not prove lifecycle reachability.

### 9.2 Recommended order

1. F01, F02 and F05 repair slice is implemented and regression-tested; retain those regressions while closing the remaining scope/draft-guard acceptance.
2. F03/F04 and the action-count/storage-guidance reconciliation (41-row review baseline to 33 current open actions) are implemented; continue the broader shared UI and original-story acceptance.
3. Close the remaining source/review/financial handoffs: MOD-20–26 and connected invoice/communication cases.
4. Close the remaining portal, Client 360, role and proposal matrices; obtain authentic migration evidence.
5. Reuse complete local-action evidence for the acceptance-only modules rather than rebuilding them.
6. Run the approved full candidate acceptance, update the guide, then obtain actual reviewer/owner sign-off.

These are dependency priorities, not permission to edit shared files concurrently or bypass the existing task graph.

### 9.3 A defensible completion definition

A module can be accepted only when its original criteria, applicable shared obligations and supported lifecycle are evidenced on the intended candidate build. Record `N/A — explicit reason` for genuinely inapplicable transitions. An excluded real provider is not an unfinished simulated provider; an untested required local action is still unfinished acceptance.

- [ ] All 39 modules map to implemented routes/views, commands or read-only selectors, fixtures and exact criterion evidence.
- [ ] All 64 original stories and 256 criteria are accounted for without changing their meaning or silently removing difficult cases.
- [ ] The five confirmed code findings have appropriate repository regressions and fixes, or an evidence-backed disposition that addresses the actual reproduced behavior.
- [ ] Every row in the remaining inventory is closed through observed evidence or a legitimate approved scope decision, not by changing labels alone.
- [ ] Required positive, denial, stale, rework, history, reload, empty and failure states are demonstrated with a finite agreed matrix.
- [ ] Cross-module results reconcile; current decisions use current inputs; historical source/approval/artifact identities remain intact.
- [ ] Full relevant build/unit/browser checks have actual results on the candidate tree; environment failures and skipped checks are explicit.
- [ ] Demo playbook, module sign-off, canonical tracker and README agree on supported behavior, current status and storage limits.
- [ ] Real human acceptance is recorded where required. A coding agent has not signed on another person's behalf.
- [ ] No unrequested backend, external provider, payment, signature, autonomous professional decision or architecture rewrite was introduced.

Even after these conditions are met, state the bounded claim accurately: **all agreed prototype criteria accepted at the recorded build**, not “all possible bugs eliminated” or “production-grade authorization certified.”

### 9.4 Required implementation handoff

Provide a 39-row result matrix with: module; original stories; state at start; reproduced gap; changed files; create/edit/review/rework applicability; source/currentness behavior; test/assertion; exact build; result; remaining limitation; real reviewer decision.

Also report the final action counts, changed requirement/evidence records, commands actually run, unrun checks, concrete blockers and the reason each excluded item is outside the prototype. Do not treat all Complete closure cards as an automatic 39/39 product sign-off.

## 10. Reproducible checks and source references

### 10.1 Fresh isolated checks performed during this review

The local Node checks below execute transcribed current search/context expressions against synthetic data. They **do not load React, run the repository's command guards end to end, or simulate a browser**.

| Check | Required result | Observed source-expression result |
|---|---|---|
| SRC-SEARCH-01: ENG-A-only manager searches ENG-B invoice under the same client | No invoice result | `INV-PRIVATE` is returned. |
| SRC-SEARCH-02: same scope searches ENG-B communication | No communication result | `COMM-PRIVATE` is returned. |
| SRC-SEARCH-03: preparer searches invoice metadata | No Billing-category result under the current role policy | `INV-PRIVATE` is returned by the non-client search branch. |
| SRC-CONTEXT-01: selected engagement is USD | `External books · USD` | `External books · QAR`. |
| SRC-CONTEXT-02: no engagement/package | Unavailable/not-created context | `v3 Current`. |

**Result:** five requirement mismatches across the search/context finding groups. F02, F04 and F05 were identified by source-path inspection and still need repository/browser reproduction tests. No full-application test pass is claimed here.

### 10.2 Read-only tracker reconciliation diagnostic

Run this from a checkout of the reviewed snapshot, or rerun against a newer checkout and use its new results. It uses the Python standard library, does not edit files and distinguishes action closure from story acceptance. Prefer an equivalent existing repository helper when available.

```python
from collections import Counter
from pathlib import Path
import json
import re

path = Path("docs/Progress_Tracker.md")
text = path.read_text(encoding="utf-8")
section = None
rows = []

def classify_status(value: str) -> tuple[str, bool]:
    value = value.strip().replace("**", "").casefold()
    if value.startswith(("verified subcase", "verified subcases", "subcase verified")):
        return "SUBCASE_ONLY", True
    if value.startswith("partial"):
        return "PARTIAL", True
    if value.startswith("pending"):
        return "PENDING", True
    if value.startswith("open"):
        return "OPEN", True
    if value.startswith(("complete", "reconciled")):
        return "CLOSED_ACTION", False
    if value.startswith("verified"):
        return "VERIFIED_ACTION", False
    raise ValueError(f"Unrecognized status; inspect rather than guessing: {value}")

for line_number, line in enumerate(text.splitlines(), 1):
    if line.startswith("### 9.3 "):
        section = "verification"
        continue
    if line.startswith("### 9.4 "):
        section = "scope"
        continue
    if section and line.startswith("### 9.5 "):
        break
    if section is None:
        continue

    match = re.match(r"^\|\s*(VP-\d{3}-[ER]\d{2})\s*\|", line)
    if not match:
        continue
    # Current action tables use a final state/evidence cell.
    cells = re.split(r"(?<!\\)\|", line.strip())
    if not line.rstrip().endswith("|") or len(cells) < 4:
        raise ValueError(f"Malformed action row at line {line_number}")

    kind, is_open = classify_status(cells[-2])
    rows.append({
        "id": match.group(1), "section": section,
        "line": line_number, "class": kind, "open": is_open,
    })

ids = [row["id"] for row in rows]
if len(ids) != len(set(ids)):
    raise ValueError("Duplicate action IDs: reconcile before reporting totals.")

summary = {}
for name in ("verification", "scope"):
    selected = [row for row in rows if row["section"] == name]
    summary[name] = {
        "rows": len(selected),
        "open": sum(row["open"] for row in selected),
        "classes": dict(Counter(row["class"] for row in selected)),
        "open_ids": [row["id"] for row in selected if row["open"]],
    }
summary["total_open_action_rows"] = sum(row["open"] for row in rows)
print(json.dumps(summary, indent=2))
```

Expected current inventory: **84 enumerated verification rows / 31 open** (49 Complete, 4 Verified, 25 Partial, 4 Pending, 2 verified-subcase follow-ups), **38 scope rows / 2 open** (2 Partial), **33 total open action rows**. The diagnostic treats explicit verified-subcase follow-up as open and prints the exact current open IDs; rerun it against the tracker before changing these counts.

### 10.3 Standalone source-expression probe

Save the following as `source_excerpt_checks.mjs` and run `node source_excerpt_checks.mjs`. It is review evidence, not a replacement for adding real repository regressions.

```javascript
// Isolated source-excerpt probes. This is NOT the repository test suite or a browser run.
// Source: nirzaf/auditsphere-visual-prototype @ 975502a1f0fb31db3814da6d6bf6854cf9c8879e
// guards.ts: activePersona, visibleClientIds, visibleEngagementIds (TypeScript annotations removed).
// Shell.tsx: invoice/communication search predicates and context display expressions.
function activePersona(state) {
  const user = state.users.find(u => u.id === state.currentUserId);
  return user
    ? { id: user.id, personId: user.personId || user.id, name: user.name, role: user.role, active: user.status === 'Active' && state.currentPerson === user.name && state.currentRole === user.role }
    : { id: '', personId: '', name: state.currentPerson, role: state.currentRole, active: false };
}
function visibleClientIds(state, userId = state.currentUserId) {
  const user = state.users.find(u => u.id === userId && u.status === 'Active');
  if (!user || (userId === state.currentUserId && !activePersona(state).active)) return [];
  const today = state.asOfDate || new Date().toISOString().slice(0, 10);
  const grants = state.roleGrants.filter(g => g.userId === userId && g.role === user.role && (!g.effectiveFrom || g.effectiveFrom <= today) && (!g.expiresAt || g.expiresAt >= today));
  if (grants.length === 0) return [];
  if (grants.some(g => g.scopeKind === 'Global')) return 'ALL';
  const clients = new Set();
  for (const g of grants) {
    if (g.scopeKind === 'Client' && g.scopeId) clients.add(g.scopeId);
    if (g.scopeKind === 'Engagement' && g.scopeId) {
      const eng = state.engagements.find(e => e.id === g.scopeId);
      if (eng) clients.add(eng.client);
    }
  }
  return [...clients];
}
function visibleEngagementIds(state, userId = state.currentUserId) {
  const user = state.users.find(u => u.id === userId && u.status === 'Active');
  if (!user || (userId === state.currentUserId && !activePersona(state).active)) return [];
  const today = state.asOfDate || new Date().toISOString().slice(0, 10);
  const grants = state.roleGrants.filter(g => g.userId === userId && g.role === user.role && (!g.effectiveFrom || g.effectiveFrom <= today) && (!g.expiresAt || g.expiresAt >= today));
  if (grants.length === 0) return [];
  if (grants.some(g => g.scopeKind === 'Global')) return 'ALL';
  const engs = new Set();
  for (const g of grants) {
    if (g.scopeKind === 'Engagement' && g.scopeId) engs.add(g.scopeId);
    if (g.scopeKind === 'Client' && g.scopeId) state.engagements.filter(e => e.client === g.scopeId).forEach(e => engs.add(e.id));
  }
  return [...engs];
}
function observedSearchPredicates(state, q) {
  const allowedClients = visibleClientIds(state);
  const clientAllowed = id => allowedClients === 'ALL' || (!!id && allowedClients.includes(id));
  const matches = (...values) => values.some(value => value?.toLowerCase().includes(q));
  return {
    invoices: state.invoices.filter(i => clientAllowed(i.clientId) && matches(i.invoiceNumber, i.id)).map(i => i.id),
    communications: state.communications.filter(c => clientAllowed(c.clientId) && matches(c.summary, c.participants, c.id)).map(c => c.id)
  };
}
const state = {
  asOfDate: '2026-09-23', currentUserId: 'U-1', currentRole: 'manager', currentPerson: 'Demo Manager',
  users: [{ id:'U-1', name:'Demo Manager', role:'manager', status:'Active' }],
  roleGrants:[{ userId:'U-1', role:'manager', scopeKind:'Engagement', scopeId:'ENG-A' }],
  engagements:[{id:'ENG-A',client:'CL-A'}, {id:'ENG-B',client:'CL-A'}],
  invoices:[{id:'INV-PRIVATE',invoiceNumber:'PRIVATE-INVOICE',clientId:'CL-A',engagementId:'ENG-B',amount:700,currency:'QAR'}],
  communications:[{id:'COMM-PRIVATE',summary:'private sibling note',participants:'Synthetic user',clientId:'CL-A',engagementId:'ENG-B'}]
};
const results = [];
const check = (id, expected, observed, description) => results.push({id, description, expected, observed, requirementSatisfied:JSON.stringify(expected)===JSON.stringify(observed)});
const actual = observedSearchPredicates(state, 'private');
check('SRC-SEARCH-01', [], actual.invoices, 'An ENG-A-only manager must not discover ENG-B invoice identifiers/amounts.');
check('SRC-SEARCH-02', [], actual.communications, 'An ENG-A-only manager must not discover ENG-B communication summaries.');
const preparer = structuredClone(state);
preparer.currentRole = preparer.users[0].role = preparer.roleGrants[0].role = 'preparer';
preparer.roleGrants[0].scopeKind = 'Global';
check('SRC-SEARCH-03', [], observedSearchPredicates(preparer, 'private').invoices, 'Preparer cannot open billing according to canOpenRoute; Shell search nonetheless emits invoice results.');
const selectedEng = {currency:'USD', mode:'External books', packageRevision:7};
check('SRC-CONTEXT-01', 'External books · USD', `${selectedEng?.mode || 'External books'} · QAR`, 'Header must report the selected engagement currency.');
const absentEng = undefined;
check('SRC-CONTEXT-02', 'Unavailable', `v${absentEng?.packageRevision || 3} Current`, 'Missing engagement/package must not display a fabricated current v3.');
console.log(JSON.stringify({
  scope:'Isolated transcribed source expressions only; not React, the store command suite, or a browser test.',
  snapshot:'975502a1f0fb31db3814da6d6bf6854cf9c8879e',
  visibleClients:visibleClientIds(state), visibleEngagements:visibleEngagementIds(state),
  checks:results, requirementMismatches:results.filter(r=>!r.requirementSatisfied).length
},null,2));
```

### 10.4 Pinned source register

All links below point to the reviewed SHA, so later repository changes cannot silently alter the evidence behind this report. Module component links in Section 5 are implementation touchpoints; they are not a claim that every line of every component was independently audited.

| Reference | Source | Use in this review |
|---|---|---|
| S1 | Tracker summary and definitions | Reported module/story/test totals; historical 47/41 action counts and current reconciled 40-row count. |
| S2 | Tracker implementation, verification and scope queues | Original 41-row review inventory, interim 40- and 39-row inventories, current 38-row open inventory, completed capabilities and reconciliation obligations. |
| S3 | App imports, shared guard and route wiring | Module representation, context-change mechanism and missing Budget/Template guard callback wiring. |
| S4 | Shell search projection | Missing engagement/category checks for invoice and communication results. |
| S5 | Shared guards | Client/engagement grant distinction, active persona and role-route policy. |
| S6 | Shell navigation/reset markup | Direct reset handler and duplicate navigation IDs. |
| S7 | Shell context bar | Literal QAR, fallback year/revision and unconditional Current label. |
| S8 | Budget view authoring code | Local draft state, current-context save target and missing registration interface. |
| S9 | Job template authoring code | Local authoring/instantiation drafts and existing lifecycle commands. |
| S10 | Current 39-module index | The 10 Verified / 29 Partial repository labels and module boundaries. |
| S11 | README | Active React architecture and conflicting client-upload persistence prose. |
| S12 | Verification ledger | Existing evidence, historical/current-worktree attribution and storage/fixture notes. |
| S13 | Execution rules | Separate task/acceptance/demo authorities, safe shared-file sequencing and established checks. |

[S1]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L25-L64
[S2]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/Progress_Tracker.md#L2587-L2723
[S3]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/App.tsx#L1-L400
[S4]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/layout/Shell.tsx#L283-L344
[S5]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/services/guards.ts#L39-L205
[S6]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/layout/Shell.tsx#L360-L480
[S7]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/layout/Shell.tsx#L552-L571
[S8]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/BudgetsView.tsx#L1-L94
[S9]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/src/components/modules/JobTemplatesView.tsx#L1-L142
[S10]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/01_MODULE_INDEX.md#L1-L50
[S11]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/README.md#L1-L95
[S12]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/docs/prototype/verification.md#L1-L75
[S13]: https://github.com/nirzaf/auditsphere-visual-prototype/blob/975502a1f0fb31db3814da6d6bf6854cf9c8879e/03_EXECUTION_RULES.md#L1-L90

---

**Progress update — 2026-09-26:** commercial inquiry, client-profile and Client 360 PBC create, clarification and edit/reassignment forms now use separate keyed unsaved-form guards; dirty close/backdrop actions require a decision, and the shared transition prompt has explicit accessible dialog semantics. Focused Chrome verifies inquiry/profile/PBC Stay and Discard, inquiry/profile Save, and no persisted discarded request/thread edits. Current regression: 231/231 unit and 109/109 serialized E2E (5 static + 104 Chrome), production build/typecheck, lint and diff checks pass; no deployment performed. These changes add evidence to VP-003 but close no complete VP-003 acceptance row; the broad remaining guard matrix and other pending actions remain.

**Final decision:** the five source-confirmed findings and the bounded VP-003 acquisition/client-profile/PBC draft-guard slice are fixed and regression-tested; tracker counts and storage guidance remain reconciled. Do not claim 100% completion: 36 action rows, 48 Partial stories and 29 Partial modules remain, alongside original-criterion evidence and human acceptance. Continue closing bounded acceptance work against the original contract, preserving what already works.
