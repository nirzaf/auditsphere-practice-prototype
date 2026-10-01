# AuditSphere Visual Prototype — Complete Gap-Closure User Stories

**Document version:** 1.0  
**Prepared:** 23 September 2026  
**Repository:** `nirzaf/auditsphere-visual-prototype`  
**Reviewed baseline:** `main@3f30d348289d6d94dd49cb1d976e23018183eec9`  
**Deliverable type:** One master epic with a dependency-ordered implementation backlog  
**Target:** All 39 agreed functional areas, including residual gaps in the stronger demonstrations  
**Status:** Proposed requirements. This document does not mean the changes have been implemented, tested, committed, or deployed.

> Build the complete **interactive product prototype**, not the production AuditSphere backend. Keep the existing browser-only React/TypeScript/Vite application, synthetic fixtures, local demonstrations, and visual language. No live Microsoft calls, email delivery, payments, professional signatures, or external retention operations belong in this work.

## Contents

1. Master user story and outcome
2. Scope decisions and exclusions
3. Verified repository baseline
4. Complete 39-module traceability matrix
5. Implementation architecture and shared contracts
6. Delivery milestones
7. Detailed implementation stories, VP-001–VP-064
8. Cross-module acceptance journeys
9. Verification, completion evidence, and handoff
10. Coding-agent execution prompt
11. Sources

## 1. Master user story and outcome

**As an accounting/audit practice stakeholder, I want the existing AuditSphere prototype to represent the entire agreed practice-management, accounting, audit, client-portal, and Microsoft 365 experience, so that I can validate navigation, forms, data relationships, human handoffs, calculations, and error states before the corresponding production features are built.**

A completed prototype must support a coherent synthetic journey:

```text
Lead → opportunity → proposal → recorded client response
  → professional acceptance → engagement → client workspace
  → manually created job/template → tasks/subtasks
  → client requests → received documents → evidence review
  → accounting preparation / audit fieldwork → human reviews
  → approved package → simulated release → logical archive

Parallel practice-finance journey:
Time → budget comparison → draft invoice → independent review
  → locally issued invoice → offline receipt record → allocation → reports
```

The arrows describe **human-initiated actions and data links**, not a workflow-automation engine. Commercial acceptance, professional acceptance, management acknowledgement, audit review, invoice issue, and report release remain separate decisions.

### What “implemented” means for this repository

A module is represented when its necessary screens, validated forms, local record changes, cross-links, role-specific views, and representative success/failure/rework journeys work. A menu label, toast, static service card, or embedded requirements paragraph alone is insufficient.

A Microsoft connection can be **simulated as configured** but never reported as actually connected. An issued invoice changes local demonstration records but never sends a demand for payment. A local approval illustrates a recorded human decision but is not an electronic signature or professional certification.

The 39 areas are functional boundaries, not 39 microservices, stores, independent apps, or mandatory sidebar entries. Consolidate related views without losing their capabilities.

## 2. Scope decisions and exclusions

### 2.1 Hard exclusions

| Excluded | Consequence for implementation |
|---|---|
| All application AI, AI agents, AI integrations, Copilot features, AI summaries and semantic/vector search | No model SDK, model endpoint, API-key setting, embedding storage, AI buttons, or AI service scaffolding. Ordinary deterministic calculations and text search remain allowed. |
| Mobile applications | No native apps, mobile packaging, app-store work, push infrastructure, or offline PWA project. Responsive browser layouts remain required. |
| Online payments | No gateways, card capture, saved payment instruments, payment links, direct debit, payment initiation, or bank-feed connector. Manual offline receipt records and allocations remain included. |
| eSignatures | No signing integration, signature capture, drawn/typed signature widget, KBA, digital certificate signing, or signature-provider callback. Keep human reviews, management acknowledgement, and evidence-backed manual acceptance. |
| Tax | No tax preparation, filing, tax organisers, tax-specific workspaces, tax service templates, or new tax-calculation engine. Existing historical/imported tax account labels or financial totals must not be destructively rewritten. |
| Payroll execution or administration | No payroll engine, payroll provider, or payroll service module. Ordinary imported salary expense accounts may remain in financial data. |
| Workflow/close automation | No rules engine, automators, conditional workflow builder, automated bookkeeping checks, scheduling engine, automatic reminders, recurring tasks/jobs/invoices, or automatic engagement renewals. |
| Advanced email | No inbox/Triage, mailbox sync, shared inbox routing, email-to-task automation, background polling, or Outlook add-in. |
| Non-M365 business integrations | No Google Drive, Gmail, Dropbox, SuiteFiles, Xero, QBO, Gusto, Slack, Zapier, generic SMTP/Resend, or other provider adapters. The prototype's existing hosting/build tools are not business integrations. |
| Microsoft Purview | Remove it from supported setup, module navigation, feature claims, gates, and acceptance prerequisites. Do not build an optional Purview adapter, no-op retention provider, or future enterprise scaffold. |
| SOC 2 certification or bespoke encryption feature work | No certification programme or encryption-management project. Do not remove existing browser/platform protections, normal HTTPS hosting, escaping, access-view checks, or content hashes. |

### 2.2 Allowed Microsoft-only product surface

**Core design:** Entra ID identity concept; Microsoft Graph transport concept; SharePoint as the canonical shared client/engagement document repository; Exchange Online/Outlook for basic outgoing email. **Optional design:** bounded OneDrive for Business selection/import, not a second canonical archive.

All interactions here use local synthetic fixtures. Do not open a real OAuth flow, ask for credentials, provision a user/site/folder, query a tenant, send a message, or change provider permissions. Do not add Microsoft products merely because they are Microsoft products: Teams, Planner, Power Automate, and Power BI integrations are not needed for this backlog.

Microsoft configuration may be skipped in the demo; a disconnected simulation must not lock users out of unrelated local modules. SharePoint, mail, and optional OneDrive have independent simulated readiness states. A failed optional mail test does not invalidate a completed SharePoint simulation.

### 2.3 Simplicity and interpretation rules

- Jobs have tasks and **one level of subtasks**. No Gantt, dependencies, recurring definitions, scheduler, or priority/rules framework is necessary. Dates, assignments, and status changes are manual.
- Applying a template is an explicit “Create job from template” operation. It copies structure once; it never creates future jobs.
- Client workspace/folder preparation may occur as the deterministic local result of an explicit acceptance/workspace command. That is not a configurable workflow engine. Repeating the command must not duplicate a workspace.
- Basic validation, arithmetic, calculated counts, safe technical error handling, and stale-version warnings are allowed. They must not perform business actions autonomously.
- Keep accounting import-first: source TB/GL, reporting adjustments, reconciliations, packages, and consolidation. Do not build a client operational ERP, purchasing, sales ledger, inventory engine, or source-ledger posting connector.
- Keep the firm's own invoices, time, receipts, and commercial figures separate from client accounting and group consolidation.
- Keep the Records module as an **application-level archive index**. Retention dates and hold flags are metadata, not SharePoint preservation guarantees. No automatic deletion.
- The previous comparison's percentages were design estimates, not acceptance targets. The checklist and executable journeys below replace percentage-based completion claims.

## 3. Verified repository baseline

The reviewed branch still resolves to `3f30d348289d6d94dd49cb1d976e23018183eec9`. Its README describes a synthetic, browser-only application without backend authentication, production authorization, live providers, or persisted uploaded file bytes. [R1]

`src/main.tsx` currently hosts a legacy imperative runtime from `app.bundle.js` within a React entrypoint. The readable legacy sources are `base-app.js` and `role-views.js`; `build.py` concatenates those files into the bundle and generates the standalone legacy artifact. New work must account for this bridge rather than assuming the application is already a collection of React feature components. [R2][R3]

The package scripts currently include `dev`, `build`, `preview`, `legacy:build`, and `legacy:check`; `build` runs TypeScript checking and Vite. New test commands specified later are **deliverables**, not commands assumed to exist today. Keep the checked-in package lock and do not combine this feature work with an unrelated dependency-upgrade campaign. [R4]

The active role layer replaces some original pages, including the overview and billing pages. Inspect active route assignments and action overrides, not just earlier function definitions or stale generated HTML. [R5]

Already valuable demonstrations include PBC threads, workpaper execution/clearance, independent review, management/partner/EQR decisions, release candidates, and archive markers. Preserve them while filling their remaining gaps. Job templates, budgets, and consolidation need new functional workspaces; many other areas need expansion rather than a second implementation. [R1][R5][R6][R7]

This document is grounded in source inspection and the preceding gap review. No new application build, browser run, or production validation was executed while authoring it.

## 4. Complete 39-module traceability matrix

The baseline categories summarize the earlier source-based assessment; they are not runtime test results. Each row has a primary implementation story. Cross-cutting stories VP-001–VP-004 and VP-063–VP-064 apply to every row.

| # | Target functional module | Baseline representation | Required stories |
|---:|---|---|---|
| 01 | Practice Dashboard | Partial | VP-005, VP-060 |
| 02 | CRM & Client Management | Partial | VP-006, VP-007, VP-008 |
| 03 | Leads & Opportunities | Partial | VP-009 |
| 04 | Proposals & Engagements | Partial | VP-010, VP-011, VP-012 |
| 05 | Jobs & Tasks | Light | VP-013, VP-014 |
| 06 | Job Templates | Missing | VP-015 |
| 07 | Team Collaboration | Light | VP-016, VP-027 |
| 08 | Client Portal | Strong; gaps remain | VP-025 |
| 09 | Client Requests / PBC | Strong; gaps remain | VP-023, VP-024 |
| 10 | Document Management | Light | VP-020, VP-021 |
| 11 | Communications | Light | VP-026, VP-027 |
| 12 | Time Tracking | Partial | VP-028 |
| 13 | Budgets | Missing | VP-029 |
| 14 | Billing & Invoicing | Partial | VP-030, VP-031 |
| 15 | Receivables | Light | VP-032, VP-033 |
| 16 | Reporting & Analytics | Light | VP-060 |
| 17 | Search & Centralized Client View | Light | VP-008, VP-061 |
| 18 | Microsoft 365 Integration | Light | VP-017, VP-020, VP-021, VP-022, VP-026 |
| 19 | Identity & Access Management | Partial | VP-018, VP-019 |
| 20 | Accounting | Light | VP-034, VP-037 |
| 21 | Trial Balance & GL | Partial | VP-035, VP-036 |
| 22 | Adjustments & Journals | Partial | VP-038 |
| 23 | Reconciliations | Light | VP-039 |
| 24 | Financial Statements | Partial | VP-040, VP-041 |
| 25 | Financial Packages | Partial | VP-042 |
| 26 | Consolidation | Missing | VP-043, VP-044, VP-045, VP-046 |
| 27 | Client Acceptance | Partial | VP-047 |
| 28 | Audit Planning | Light | VP-048 |
| 29 | Risks & Audit Programs | Light | VP-049 |
| 30 | Audit Fieldwork | Partial | VP-050 |
| 31 | Populations & Sampling | Light | VP-051 |
| 32 | Workpapers | Strong; gaps remain | VP-052 |
| 33 | Evidence | Partial | VP-053 |
| 34 | Findings & Differences | Light | VP-054 |
| 35 | Review Points | Strong; gaps remain | VP-055 |
| 36 | Reviews & Approvals | Strong; gaps remain | VP-056 |
| 37 | Completion & Release | Strong; gaps remain | VP-057, VP-058 |
| 38 | Records & Archive | Partial | VP-059 |
| 39 | Administration | Light | VP-019, VP-062 |

## 5. Implementation architecture and shared contracts

### 5.1 Stay inside the prototype repository

Do not change `nirzaf/AuditSphere`, introduce its .NET backend into this repository, or create a database/API solely for this prototype. Keep React + TypeScript + Vite and the existing visual system. Build new screens as small feature components; migrate existing screens only where needed to connect the new behaviour. No whole-application rewrite is a prerequisite.

Proposed organization, adjusted to the real checkout rather than blindly created:

```text
src/
  app/                 shell, route registry, demo scope, scenario controls
  prototype/           typed model, single store, commands, selectors, fixtures, migrations
  legacy/              explicit bridge to retained legacy views/actions
  features/
    practice/          clients, commercial pipeline, engagements, dashboard
    work/              jobs, tasks, templates, comments
    documents/         library, evidence references, PBC
    communications/    basic mail simulation, communication log
    portal/            scoped client projections
    economics/         time, budgets, invoices, receipts
    accounting/        profiles, TB/GL, mappings, journals, reconciliations, packages
    consolidation/     groups, components, translation, eliminations
    audit/             acceptance, plans, risks, procedures, workpapers, reviews
    records/           completion, released artifacts, logical archive
    administration/    users, grants, settings, simulated M365 setup
    reporting/         deterministic reports and scoped search
  shared/              form, table, dialog, money/date and download helpers
```

One store must own shared record identity and revisions. Do not create a separate client/engagement copy per page or parallel mutable React and legacy stores. Expose explicit reads, subscriptions, and commands through the compatibility bridge. If React subscribes to retained non-React state, `useSyncExternalStore` is a suitable documented mechanism; publish cached immutable snapshots and clean up subscriptions. This is an implementation recommendation, not a requirement to add a state-management library. [W1]

Only one renderer owns a route's DOM at a time. Mount new React feature routes into an exclusive host; retained imperative pages must not overwrite that host. Dispose listeners, subscriptions, and dialogs on route changes. Never fix integration by appending a new chain of global action overrides on every render.

Treat `app.bundle.js` as generated while legacy source generation remains supported. Regenerate it from its sources rather than hand-editing both copies. The Vite entrypoint is the canonical acceptance target. Keep the old standalone build honest about any transitional feature coverage; it must not be advertised as current parity when it is not.

### 5.2 Local data and persistence contract

Every durable demo record has a stable ID, applicable scope IDs, revision, creator, and timestamps. Shared references use IDs, not labels or array indices. Display names can change without breaking relationships.

| Record group | Required relationships / fields |
|---|---|
| Firm / identity | `firmId`, demo user/person identity, role definitions, scoped grants, enabled state; separate current persona from role membership |
| Client / contact | `clientId`, contact IDs, primary contact, relationship owner, optional non-authorizing relationship-group IDs, typed custom values |
| Opportunity / proposal | lead/client link, proposal revisions, service lines, commercial review, manual response evidence, engagement link |
| Engagement / job / task | explicit client and engagement context; job IDs; `parentTaskId` supports exactly one child level; optional template revision provenance |
| Document / evidence | logical document ID, provider reference, exact version ID, class, visibility, related business records; local blob availability is separate from metadata |
| Communication / request | client/engagement IDs, channel, sender/recipients, visibility, request ID where relevant, simulation outcome, author and date |
| Time / budget | task/job/engagement IDs, integer minutes, billable class, rate revision, budget version; cost rates separate from billing rates |
| Invoice / receipt | firm-only invoice and line IDs, consumed source revisions, currency, issue/due dates; receipt records and individual allocation records |
| Accounting | client, legal entity, period, book, basis and currency; immutable source revision; GL row/journal keys; mapping version; proposed reporting adjustments |
| Consolidation | group and perimeter revision; component entity/period/package revisions; rate table revision; elimination journal; output revision |
| Audit | plan/materiality revision, risk/program/procedure IDs, population/sample IDs, workpaper/evidence references, findings, review-point threads |
| Approval / release / archive | subject type/ID/revision, decision actor and rationale; preserved release snapshot; archive manifest and application-only hold/retention metadata |

Continue browser-local metadata persistence with a versioned schema. Preserve the previous storage payload before migration. Migrate deterministically and validate references; do not silently reset old demo work or assign ambiguous scope. A malformed payload opens a recovery/reset prompt. Storage denial/quota exhaustion yields an explicit “session-only, not saved” state.

Default upload behaviour remains metadata and hash only. A selected file may be available for preview in memory for the current session; never persist its bytes in localStorage, place bytes in exported state, or upload it. After reload, the UI must explain that an original file needs to be selected again. Built-in synthetic fixtures can be downloaded repeatedly and are visibly distinguished from an original user-selected file. Parsed synthetic TB/GL rows may persist as bounded local demo records; the source file bytes do not.

Keep one active editing tab as the supported demonstration mode. Detect storage revision changes from another tab and show reload/conflict guidance instead of silently overwriting. Do not build real-time collaboration infrastructure.

### 5.3 Commands, states, and roles

All new commands validate the current **demo person, active status, role grant, client/engagement/group scope, expected record revision, state, and separation of duties**. The same checks apply to UI actions and programmatic command calls used by tests. These illustrate intended production behaviour; all browser data is still inspectable and editable by the browser owner.

Keep the existing 14 role concepts: relationship owner, onboarding coordinator, compliance officer, partner, manager, preparer, senior reviewer, EQR, client administrator, client finance contributor, management approver (existing client-signatory persona), billing officer, records administrator, and system administrator. Reuse role keys where possible. Multiple fictional people may share a role so same-function reassignment can actually be demonstrated. A person with multiple roles cannot approve their own preparation by switching role labels.

System administration is not professional approval. Billing access does not grant client TB/GL access. A client administrator is not automatically a management approver. Client views show explicitly shared records only; filter lists, counts, search, notifications, exports, and direct links as well as menus. Reset/change-scenario tools live in a clearly separate presenter mode, not client business navigation.

Use bounded state machines, not a workflow builder:

| Area | Default states / transition rule |
|---|---|
| Job / task | Not started, In progress, Blocked, Completed, Cancelled; changes manual; blocked requires reason |
| Template | Draft, Published, Retired; published revision is immutable; applying is manual |
| PBC | Draft, Requested, Received, Under review, Accepted, Needs clarification, Cancelled; a response is not acceptance |
| Time | Draft, Submitted, Approved, Returned, Superseded; approved changes use a correction revision |
| Proposal | Draft, Internal review, Approved to send, Presented, Accepted, Declined, Withdrawn, Superseded; acceptance recorded manually |
| Mail | Draft, Queued in demo, Simulated accepted, Simulated failed, Outcome unknown; no real sent/delivered claim |
| Invoice | Draft, In review, Approved, Issued in demo, Cancelled before issue; settlement is a separate derived status |
| Review point | Open, Responded, Cleared, Reopened; responder cannot clear their own response |
| Provider setup | Not configured, Draft, Simulated verified, Simulated error, Disconnected; `liveConnected` always false |
| Package | Draft, Ready for review, Reviewed, Stale, Released in demo; approval binds to exact revision |
| Archive | Not archived, Archived in demo, Superseded archive version; no real provider protection asserted |

Completing a task never approves a workpaper, accepts evidence, issues an invoice, or releases a report. Derived progress is display-only; an empty task list must not produce a misleading 100% completed label. Relevant source/evidence changes invalidate current applicability while retaining the historical decision.

### 5.4 UX and data-entry contract for every story

Every workflow needs entry/navigation, list/detail or appropriate embedded panel, labelled required/optional inputs, valid empty state, validation messages, save/cancel, local persistence feedback, and return navigation. Provide a clear success state and at least one invalid-input, forbidden-scope, stale-edit, and rework example where applicable. Avoid long walls of GUIDs: use human-readable codes with optional technical detail.

Use current spacing, type, colours, panels, dialogs, and responsive tables. Support keyboard navigation, visible focus, labelled controls, accessible status messages, focus restoration, and unsaved-change warnings. Test responsive web layouts; do not call them mobile applications. A client-facing comment is deliberately marked client-visible; internal discussion is the default.

### 5.5 Deterministic numbers and dates

Use existing QAR fixtures as the primary demonstration currency. Store QAR monetary values in integer minor units; retain currency with every monetary record. Time uses integer minutes. Apply documented rounding once at each invoice/budget line, sum rounded lines, and test the rounding boundary. FX rates are decimal strings with a documented precision and rounding rule; do not rely on unchecked floating-point equality.

New scenarios use a fixed demo `asOfDate = 2026-09-23`. Financial scenarios may use the completed period `2025-01-01`–`2025-12-31`; practice deadlines and receipt dates must be chronologically coherent. Changing the demo clock is explicit. Existing historical states must not be silently rewritten to make them look current.

Minimum report definitions:

- Actual hours = effective approved minutes / 60; expose submitted-but-unapproved time separately.
- Budget-hours variance = actual approved hours minus planned hours; positive means over budget.
- Billable value = sum of individually rounded approved billable minutes × snapshotted billing rate / 60.
- Actual delivery cost uses a separate snapshotted cost rate; unknown cost is **unknown**, not zero.
- Invoiced fees = locally issued invoice amounts less effective issued credits; label this as invoicing, not statutory revenue recognition.
- Invoice outstanding = issued amount − effective credits − net allocated receipts. Unallocated receipts remain separate.
- Aging uses the report as-of date and invoice due date, excluding not-yet-issued/draft/cancelled records. Buckets: Current, 1–30, 31–60, 61–90, over 90 days. Due today is Current. Ignore receipts/credits effective after the as-of date.
- Never sum different currencies into one unexplained total. Group by currency unless a visible, versioned conversion is explicitly part of the consolidation demonstration.

## 6. Delivery milestones

The table is a delivery sequence, not a calendar promise. All milestones are required for the requested prototype scope. Stories can be split into smaller PRs; dependencies and reviews remain explicit.

| Milestone | Stories | Exit outcome |
|---|---|---|
| M0 — Foundation | VP-001–004 | Agreed scope, active-runtime baseline, single state/route bridge, migrations and fixtures |
| M1 — Practice | VP-005–012 | Connected dashboard, CRM, commercial pipeline, proposals and engagements |
| M2 — Simple work | VP-013–016 | Jobs, tasks, one-level subtasks, manual templates and contextual collaboration |
| M3 — Microsoft & documents | VP-017–022 | Simulated M365 setup, people/scopes, SharePoint/OneDrive file experience, failure states |
| M4 — Portal & communication | VP-023–027 | Connected PBC/client portal, basic mail simulation and communication history |
| M5 — Practice finance | VP-028–033 | Time, budgets, invoices, credits, offline receipts and aging |
| M6 — Accounting | VP-034–042 | Source intake, mapping, journals, reconciliation, statements and package outputs |
| M7 — Consolidation | VP-043–046 | A bounded but complete group/component/elimination/output demonstration |
| M8 — Audit | VP-047–056 | Acceptance, planning, risks, testing, workpapers, evidence, findings and reviews |
| M9 — Delivery & records | VP-057–059 | Exact-version completion/reissue and internal archive without Purview |
| M10 — Product completeness | VP-060–064 | Reports, search, settings, automated acceptance journeys and traceable evidence |

M0 establishes the shared local permission contract using the existing role model. M3 adds editable identity/scope administration; earlier modules must not bypass role checks while waiting for it. M1 engagement handoff can preserve existing acceptance records until M8 expands the questionnaire; final acceptance of that handoff requires the M8 tests.

## 7. Detailed implementation stories

The common contracts in §5 are part of **every** story. “Save” means a validated local demonstration mutation. Each story needs its own test evidence; no story is complete just because it has a route.

### Epic A — Foundation and scope control

### VP-001 — Freeze scope and remove excluded product surfaces

**Target modules:** Cross-cutting foundation  
**Prerequisites:** Baseline verification  
**User story:** As an implementation owner, I want a single visible supported-product scope, so that the prototype does not advertise removed modules.

**Implementation scope and data**

Inventory the active Vite routes, renderer overrides, actions, service cards, fixtures and built output. Remove Purview, signing/filing providers, tax/payroll service modules, recurring-work controls and non-M365 integration choices from the supported product. Keep source-history/reference material unchanged where appropriate, but label it “Historical source — not current product scope” and provide the current-scope view as default. Keep human review and ordinary archive metadata. Record a baseline inventory in `docs/prototype/baseline.md`; do not publish old test counts as a new run.

**Acceptance criteria**

1. Given the current product navigation, when a user inspects features/settings, then no excluded module is offered as available, optional setup, or a release prerequisite.
2. Given historical requirements that mention excluded products, when opened deliberately, then the historical scope warning is visible and the text does not enable a business action.
3. Existing PBC, workpaper, review and release demonstrations remain reachable; removing signature-provider wording does not remove manual acceptance or internal approval.
4. Tests scan target-facing route/configuration data and exercise relevant screens; an explicit allowlist covers exclusion documentation and historical references only.

### VP-002 — Introduce a single typed state and legacy/React route bridge

**Target modules:** Cross-cutting foundation  
**Prerequisites:** VP-001  
**User story:** As a developer, I want new React features and retained legacy views to share one state, so that cross-module actions remain consistent without rebuilding the application.

**Implementation scope and data**

Create a typed prototype store, command boundary, selectors and explicit legacy adapter. Route descriptors specify a single renderer and required capabilities. Move shared identifiers/revisions behind the store before extending records. Existing legacy actions must pass through or commit back to the same authoritative state. Preserve original page ownership until its route is migrated. Use a bounded implementation, not a new framework, second runtime store, or microservice layer.

**Acceptance criteria**

1. Given an engagement updated in a new React page, when a retained accounting/workpaper view opens, then it reads the same ID and latest revision without a reload/reset.
2. Given a retained legacy action, when it changes shared state, then subscribed new views update once and persist the same revision.
3. Navigating repeatedly, mounting/unmounting and development hot reload do not duplicate roots, event handlers, dialogs or command execution.
4. Existing hash routes remain compatible or receive an explicit redirect; generated legacy bundles are regenerated from source, not independently patched.

### VP-003 — Unify navigation, scoped views and reusable form behaviour

**Target modules:** Cross-cutting foundation  
**Prerequisites:** VP-002  
**User story:** As a staff or client user, I want consistent navigation and validated forms, so that I can find and change only the records relevant to my demonstrated role.

**Implementation scope and data**

Create grouped navigation for Practice, Work, Client Services, Economics, Accounting, Audit, Records and Administration. Use the role grant contract from §5, including separate person identity. Add shared list/detail, dialog, validation, empty/error state, unsaved-change guard and scoped breadcrumb patterns. New modules may be tabs rather than new top-level entries. Presenter tools are separate from business navigation.

**Acceptance criteria**

1. Given a direct link or restored selection outside the current scope, when opened, then a safe unavailable view appears and no restricted record fields/counts are rendered.
2. Given unsaved form changes, when navigating or switching persona/client, then the user can save, discard or cancel; drafts cannot accidentally save into the new context.
3. Keyboard-only users can open, edit, save and cancel dialogs with focus restored to the initiating control.
4. Every active route has a label, required capability and at least one role fixture; client routes contain no staff economics, internal notes or presenter exports.

### VP-004 — Version fixtures, migrate existing demo state and provide scenario recovery

**Target modules:** Cross-cutting foundation  
**Prerequisites:** VP-002, VP-003  
**User story:** As a presenter, I want coherent synthetic scenarios and safe local-state migration, so that I can demonstrate success, failure and recovery without losing prior local work.

**Implementation scope and data**

Add schema-versioned migrations and named synthetic scenarios: full practice lifecycle; accounting-only engagement; audit with open findings; two-component consolidation; blocked/rework state; empty/new practice. Preserve legacy IDs and historical decisions. Add an explicit presenter scenario chooser, export/import of validated synthetic metadata, reset confirmation and fixed demo date. Include multiple users of the same role and distinct clients/engagements for negative tests.

**Acceptance criteria**

1. Given a valid old storage payload, when upgraded, then existing workpaper/PBC/release history is retained and unambiguous links are migrated deterministically.
2. Given malformed, future-version or ambiguous state, when loaded/imported, then recovery guidance appears without silent deletion or invented scope; the prior payload can be preserved.
3. Storage denial/quota failure shows session-only mode; a stale second tab cannot silently overwrite a newer revision.
4. Fixture integrity tests reject broken foreign references, incoherent dates, real personal data, uploaded binary payloads and inconsistent monetary control totals.

### Epic B — Connected practice management

### VP-005 — Build a real practice dashboard with scoped drill-downs

**Target modules:** 01  
**Prerequisites:** VP-003, VP-004  
**User story:** As a manager, partner or staff member, I want an actionable dashboard computed from demo records, so that I can see what needs attention and open the corresponding work.

**Implementation scope and data**

Extend rather than discard existing role homepages. Show my tasks, jobs by state, overdue items, requests awaiting client/review, engagement deadlines, recent activity and recent clients. Managers/partners receive permitted practice-level counts; billing roles receive invoice/receivable summaries. Filter by client, engagement, assignee and period where relevant. Optional financial sections require finance visibility.

**Acceptance criteria**

1. Given a task/date/status or PBC change, when returning to the dashboard, then its counters and drill-down rows agree with the underlying register.
2. Given a narrow engagement grant, when viewing a count or recent-activity card, then sibling engagements and other clients do not contribute.
3. Overdue calculations use the fixed demo as-of date; completed/cancelled work is excluded and empty data shows an honest zero/empty state.
4. All headline metrics open a filtered working list; no placeholder chart or hard-coded success percentage is presented as computed data.

### VP-006 — Complete client profile creation, editing and lifecycle

**Target modules:** 02  
**Prerequisites:** VP-003, VP-004  
**User story:** As a relationship owner or authorized manager, I want complete client profiles, so that commercial and professional work uses one consistent client record.

**Implementation scope and data**

Required: client code, legal name, client type, status and owner. Optional: trading name, registration number, jurisdiction, industry, address, phone, email, website, partner/manager assignments and notes. Support prospect, active, suspended and archived states. Separate commercial conversion from professional acceptance. Use soft archival; do not delete clients referenced by engagements, invoices or evidence.

**Acceptance criteria**

1. Given a valid profile, when saved/edited, then lists, selection controls and existing engagement links reflect the same client ID.
2. Duplicate normalized client code is rejected; similar name/registration presents a review warning rather than silently merging distinct legal entities.
3. An inactive/suspended client cannot receive new active professional work without an explicit permitted action; historical records remain viewable within scope.
4. A stale edit, missing legal name, invalid contact value or unauthorized owner assignment returns a field/action error without partially saving.

### VP-007 — Add contacts, relationship groups and bounded custom fields

**Target modules:** 02  
**Prerequisites:** VP-006  
**User story:** As a relationship owner, I want multiple contacts and structured client details, so that I can record responsibilities without confusing a contact with an authorized portal user.

**Implementation scope and data**

Contacts need full name and related client; email, phone, job title, primary flag and effective dates are optional unless a selected action requires them. Support client-contact relationships and explicit responsibility tags. Add non-authorizing relationship groups for related entities and a small custom-field editor supporting text, date, number and choice. Keep application user/grant IDs separate from contact IDs.

**Acceptance criteria**

1. Given several contacts, when one is made primary, then the previous primary is cleared within that client and an inactive contact cannot be chosen.
2. Linking clients into a relationship group does not grant access to their siblings or create a consolidation group.
3. Creating a contact does not create a portal login, management authority or staff role; a separate access request is required.
4. Custom values validate against type/choices; disabling a used field preserves historical values and no arbitrary script/formula field is supported.

### VP-008 — Complete the centralized client workspace

**Target modules:** 02, 17  
**Prerequisites:** VP-006, VP-007  
**User story:** As an authorized team member, I want one connected client workspace, so that I can navigate the complete client lifecycle without repeated searches.

**Implementation scope and data**

Create tabs/panels for Overview, Contacts, Engagements, Jobs, Documents, Requests, Communications, Time/Budgets, Billing, Accounting, Audit and Activity. Implement scope-filtered selectors over shared data; populate tabs as later stories land. Preserve selected client/engagement and list filters in navigation. Avoid duplicating records inside the client page.

**Acceptance criteria**

1. Given a client, when opening each authorized tab, then all records belong to that client and narrower engagement restrictions are applied.
2. Creating a job, request, note or invoice from a tab preselects valid context; saving makes it visible both here and in its module register.
3. Unauthorized tabs, totals, search snippets and recent items are omitted rather than masked after fetching/rendering a broader projection.
4. Back/forward, deep links and page reload restore context safely; an empty tab explains the next allowed manual action.

### VP-009 — Finish the leads and opportunities pipeline

**Target modules:** 03  
**Prerequisites:** VP-006, VP-007  
**User story:** As a relationship owner, I want editable inquiries and opportunities with outcomes, so that I can track commercial progress before engagement acceptance.

**Implementation scope and data**

Extend acquisition with inquiry source, owner, contact, requested services, expected fee/currency, target dates, next action and discovery notes. Support qualification, opportunity stages, won/lost with reason, and manual conversion/linking to an existing prospect/client. Add list view alongside the existing pipeline; no automated lead capture, reminders or marketing integrations.

**Acceptance criteria**

1. Given an inquiry, when qualified and converted, then a linked opportunity/client record is created once and its original history remains visible.
2. Lost/unqualified outcomes require a reason and disappear from open pipeline totals without deleting the record.
3. An opportunity can link to an existing permitted client without creating a duplicate; prospect conversion never sets professional acceptance or engagement activation.
4. Fee totals are currency-separated and based on current open records; invalid fees, dates and cross-client proposal links are rejected.

### VP-010 — Build reusable services and complete proposal drafting

**Target modules:** 04  
**Prerequisites:** VP-009  
**User story:** As a relationship owner, I want a full proposal editor and reusable service definitions, so that I can clearly describe the work and fees offered to a client.

**Implementation scope and data**

Add service catalogue editing for only supported services and reusable proposal content templates. Proposal fields include client/opportunity, service lines, scope, exclusions, deliverables, client responsibilities, dependencies, period, fee model, quantity/rate/fee, currency and terms. Provide branded on-screen/print preview. Editing presented/reviewed content creates a new proposal revision rather than overwriting it.

**Acceptance criteria**

1. Given selected services/template, when drafting, then defaults copy once and remain editable without modifying the source template.
2. Line totals and overall fee reconcile; missing scope/deliverables/currency and invalid period or negative quantities block submission.
3. Editing a submitted/approved/presented proposal invalidates applicability of prior commercial review and retains the earlier preview/revision.
4. The catalogue and previews contain no tax/payroll, AI, recurring-work, payment-gateway or signature-provider options.

### VP-011 — Record proposal review, presentation and manual client acceptance

**Target modules:** 04  
**Prerequisites:** VP-010  
**User story:** As a manager and relationship owner, I want separate proposal review and evidence-backed response recording, so that commercial agreement is traceable without eSignatures.

**Implementation scope and data**

Reuse independent commercial review. Reviewer approves or returns with reasons. A human marks presentation or invokes the basic mail simulation later. Record response type, date, contact, method, notes and document/communication evidence reference. Accepted/declined/withdrawn responses bind to the presented revision. A scan or external correspondence may be referenced; no signature is captured or verified by this application.

**Acceptance criteria**

1. Given a submitted proposal, when its preparer attempts commercial approval under another role, then the same-person action is denied.
2. Given an approved presented revision, when a response is recorded, then actor, contact, date, method and exact revision are retained and a required evidence reference can be supplied.
3. Accepted commercial terms do not automatically approve the client, activate an engagement, instantiate jobs or create an invoice.
4. A response to a superseded/unpresented revision is rejected or recorded only as historical correspondence, never as acceptance of the current revision.

### VP-012 — Complete engagement creation and lifecycle handoff

**Target modules:** 04  
**Prerequisites:** VP-008, VP-011  
**User story:** As a manager, I want engagements linked to accepted commercial scope and professional decisions, so that teams work within a clear client, service, period and responsibility boundary.

**Implementation scope and data**

Complete engagement records with client, service, period, partner/manager, team assignments, agreed fee, proposal revision and separate professional acceptance. Permit draft engagements while prerequisites are pending; explicit activation checks prerequisites. Add change/revision, suspension, cancellation and close views. Link jobs, PBC, accounting/audit work, budgets and billing without copying their data. Existing acceptance remains until VP-047 extends it.

**Acceptance criteria**

1. Creating from an accepted proposal prepopulates a draft once; repeat submission does not create duplicate engagements.
2. Activation requires the current permitted professional decision and required commercial scope, but does not fabricate missing evidence or mark Microsoft connectivity as live.
3. Suspension blocks new professional actions as defined by the demo policy while allowing historical view and permitted billing/records operations.
4. Scope/period/team edits validate grants and preserve change history; relevant professional changes show affected review applicability, not silent inherited approvals.

### Epic C — Simple jobs, tasks, templates and collaboration

### VP-013 — Add the simple job register and job detail workspace

**Target modules:** 05  
**Prerequisites:** VP-008, VP-012  
**User story:** As a manager, I want jobs within engagements, so that I can organize delivery without a complex project-management tool.

**Implementation scope and data**

Required: title, client, engagement and owner. Optional: description, start/due dates and budget reference. Add list filters for client, engagement, owner, status and overdue; detail tabs for tasks, notes, files and time. Permit manual create/edit/status change and safe cancellation. Keep jobs as containers for tasks, not a second professional engagement or workflow engine.

**Acceptance criteria**

1. Given an engagement, when a job is created, then its scope is fixed to that client/engagement and it appears in both job and client/engagement views.
2. Status changes are manual; Blocked requires a reason and changing an assignee does not automatically start or complete work.
3. Completing a job requires all required non-cancelled tasks to be complete; it does not approve audit evidence, issue an invoice or release a package.
4. Cancellation retains tasks/time/document history; referenced jobs cannot be hard-deleted and no recurrence/dependency/automation setting exists.

### VP-014 — Implement tasks and exactly one level of subtasks

**Target modules:** 05  
**Prerequisites:** VP-013  
**User story:** As a manager or assigned staff member, I want editable tasks and subtasks with clear ownership, so that I can track concrete work independently of professional sign-off.

**Implementation scope and data**

Task fields: title, job ID, optional description/assignee/due date, manual status and ordering. A subtask references a top-level task in the same job. Allow create, edit, assign, reorder, block, complete, reopen and cancel. Demonstrate reassignment between two qualified synthetic people, rather than a role selector that cannot change. Explicitly distinguish general work tasks from reviewer/partner authority.

**Acceptance criteria**

1. Given a task, when a subtask is added, then a second nesting level, cycle, cross-job parent or cross-client assignee is rejected.
2. Completing a parent with unfinished required children is blocked; completing a child does not automatically complete its parent/job.
3. Reassignment records old/new person and reason; assigning a preparer to a general task never grants reviewer authority.
4. Progress counts non-cancelled leaf tasks once; empty work is shown as not started/no tasks, and reload preserves order, ownership and statuses.

### VP-015 — Implement job-template authoring and manual instantiation

**Target modules:** 06  
**Prerequisites:** VP-014  
**User story:** As a manager, I want versioned job templates containing tasks and subtasks, so that I can reuse an agreed work structure without recurring jobs or automation.

**Implementation scope and data**

Add template list/editor/preview with name, supported service, description, default job title, ordered tasks and one-level subtasks. Optional role suggestions are not real assignees. Publish immutable revisions; revise/retire without deleting used versions. “Create job from template” asks for client/engagement, title, manually selected dates and assignees. Clear status, history, evidence, approvals and time on copied structures.

**Acceptance criteria**

1. Given a published template, when applied explicitly, then one new job tree with fresh IDs and source-template revision is created atomically.
2. Changing/retiring the template later does not change existing jobs; draft/retired versions are not offered for new use.
3. Dates and people require deliberate selection; no recurrence interval, relative-date rule engine, automatic allocation or follow-up creation is added.
4. Duplicate click protection prevents accidental duplicate job creation; templates enforce the same one-level hierarchy and required-title rules as jobs.

### VP-016 — Add contextual internal notes, comments and basic mentions

**Target modules:** 07  
**Prerequisites:** VP-008, VP-014  
**User story:** As a team member, I want comments and internal notes on clients, engagements, jobs and tasks, so that collaboration stays attached to the work it concerns.

**Implementation scope and data**

Add a reusable thread panel with author, time, text, subject reference and explicit visibility. Support simple mentions selected from already authorized people; mentions create local in-app notices only. Keep review-point threads and PBC conversations as distinct business records that can be linked. Add edit history or an explicit edited marker for ordinary notes; approved professional history is not editable here.

**Acceptance criteria**

1. Given an internal note, when switching to a client persona, then its text, count, attachments and mention notice are absent.
2. Mention suggestions include only users eligible to view the subject; mentioning someone neither grants access nor sends email.
3. Only permitted authors/moderators can amend ordinary comments and the change is attributable; historical approval/review records cannot be rewritten through the notes panel.
4. Comments survive reload and are linked from the subject activity view; empty/oversized input and unsafe markup are handled without executing content.

### Epic D — Microsoft-only setup, identities and documents

### VP-017 — Create the simplified Microsoft 365 setup wizard

**Target modules:** 18  
**Prerequisites:** VP-003, VP-004  
**User story:** As a system administrator, I want a guided Microsoft-only setup simulation, so that I can understand onboarding without Purview or unnecessary integrations.

**Implementation scope and data**

Steps: start demonstration connection; choose synthetic tenant; select permitted people; select SharePoint site/library/root; choose optional mail sender; optionally enable bounded OneDrive access; inspect permission summary; run local scenario tests; review/save. Configuration stores synthetic IDs, resource selections and revision only. Show selected-resource intent, not tenant-wide access assumptions. No client secret, certificate upload, password, token field or real consent page.

**Acceptance criteria**

1. Given a new installation scenario, when the wizard is completed, then a resumable local configuration is saved as “Simulated configuration”, with `liveConnected=false`.
2. No wizard interaction performs external fetch/XHR, navigates to Microsoft sign-in, requests credentials, or provisions a tenant resource.
3. An unavailable site, wrong-tenant library, denied permission and cancelled setup each have a clear recovery/back path without saving a successful test.
4. Mail and OneDrive are optional; Purview and all excluded providers are absent; business modules remain usable with demo fixture data when setup is skipped.

### VP-018 — Represent Microsoft sign-in and user lifecycle honestly

**Target modules:** 19  
**Prerequisites:** VP-017  
**User story:** As an administrator and demo user, I want identity and user-management screens, so that I can validate the intended access lifecycle without mistaking personas for real authentication.

**Implementation scope and data**

Add a clearly labelled sign-in simulation/landing screen and a synthetic directory picker. Support adding a local demo identity, activating/disabling it, reviewing pending invitations and recording revocation. Use immutable person/object/tenant identifiers separate from names/emails. Retain all existing role experiences and create additional fictional staff for reassignment tests. External client identities are explicit fixture identities, not inferred from email domain.

**Acceptance criteria**

1. Given a selected fixture identity, when entering the demo, then the header identifies it as a simulated identity and assigned role/scope, never a live authenticated session.
2. Adding a directory contact without a grant leaves business access unassigned; matching email/domain alone never grants a client or staff role.
3. Disabling a person prevents subsequent local business commands and direct-route access while retaining history and a recovery path for the presenter.
4. Pending/expired/revoked invitation scenarios are inspectable; no real invitation message, user account or directory mutation is created.

### VP-019 — Add editable application-role grants and scope administration

**Target modules:** 19, 39  
**Prerequisites:** VP-018  
**User story:** As a system administrator acting on an approved request, I want explicit role and scope management, so that the prototype demonstrates least-privilege access and separation of duties.

**Implementation scope and data**

Add user detail tabs for role grants, client/engagement/group assignments and access history. Grant fields include person, role, scope kind/ID, effective dates, approved-request reference and reason. Require separate approval evidence for management-approver or professional duties. Keep compatible role combinations explicit; a role change cannot change historical person identity. Group-reporting scope does not automatically expose every member client's other work.

**Acceptance criteria**

1. Given an engagement-only grant, when navigating/searching/exporting, then only that engagement is visible and sibling engagements remain excluded.
2. Grant/revoke changes take effect on the next command and refresh projections; stale dialogs must revalidate scope before saving.
3. Technical administrators cannot self-promote into professional approval through their own access request or use admin status to inspect client financial data.
4. The privilege matrix reflects grants and conditions accurately; grants/expiry/revocation preserve an attributable local change history.

### VP-020 — Build the SharePoint-first document browser and client folders

**Target modules:** 10, 18  
**Prerequisites:** VP-008, VP-017, VP-019  
**User story:** As an authorized staff member, I want a client/engagement document library backed by synthetic SharePoint references, so that I can locate and organize files separately from PBC requests.

**Implementation scope and data**

Add folder/file list, breadcrumbs, search/filter, metadata panel, related-record links and a simulated “Open in Microsoft 365” preview. Required reference: logical document ID, tenant/site/drive/item IDs, client scope and classification. Support preparing/linking a client workspace and engagement subfolders from a human command; accepted-client workspace preparation is idempotent. Folder rename changes display metadata, not stable linkage. Use only local fixtures and in-session selected files.

**Acceptance criteria**

1. Given an accepted client and approved synthetic binding, when preparing its workspace twice, then one client root and one set of required folders exist locally.
2. Client/engagement folder selection is validated against the configured tenant/root; another client cannot be linked merely by changing a URL or display name.
3. A document is viewable through the library independently of a PBC request; its related job/request/workpaper links resolve to the same logical record.
4. Upload/download/open controls state whether they use a built-in fixture, in-session bytes, metadata only or a simulated Office view; they never claim a real SharePoint transfer.

### VP-021 — Add document versions, existing-file linking and optional OneDrive selection

**Target modules:** 10, 18  
**Prerequisites:** VP-020  
**User story:** As a staff member, I want version-aware file linking and bounded OneDrive access, so that evidence can be reused without creating competing document repositories.

**Implementation scope and data**

Provide link-existing-SharePoint-file, version history, replacement, classification/visibility and broken-reference views. Evidence references pin an exact version; a current-file link is visually distinct. Optional OneDrive for Business selection lists only synthetic permitted files. “Import to engagement library” copies local metadata under a new canonical SharePoint fixture identity and preserves OneDrive provenance; do not silently grant broader file access.

**Acceptance criteria**

1. Given a linked evidence version, when a newer file version is added, then the old reference still identifies its original version and dependent review shows an explicit freshness state.
2. Renaming/moving a permitted file keeps stable IDs; a deleted/inaccessible/wrong-root version shows a broken-link state rather than displaying unrelated content.
3. OneDrive remains optional and disabled by default; linking/importing never changes the canonical archive repository away from SharePoint.
4. After reload, original user-selected bytes are unavailable unless reselected; the system cannot substitute a synthetic sample and label it as the original download.

### VP-022 — Complete Microsoft configuration failure, reconnect and disconnect journeys

**Target modules:** 18  
**Prerequisites:** VP-017, VP-020, VP-021  
**User story:** As a system administrator, I want clear connection-state and recovery simulations, so that users understand what requires attention without extra integration machinery.

**Implementation scope and data**

Add independent configuration cards for identity, SharePoint, mail and optional OneDrive. Show local configuration revision, selected resource summary, last simulated test and readable error. Offer explicit test, edit, reconnect simulation and disconnect. Test outcomes come from named local fixtures: access denied, missing resource, expired session, throttled, unavailable and success. A configuration change stales prior test results.

**Acceptance criteria**

1. Given a changed site/root/sender, when saved, then the corresponding previous verification cannot remain current for the new configuration revision.
2. Simulating disconnect preserves metadata/history and marks provider-dependent actions as simulated unavailable; it does not delete clients or archive records.
3. Failure explanations offer an explicit local retry/back action; no background polling, automatic remediation or real provider call occurs.
4. No success/error banner describes simulated state as production readiness; Purview is not a hidden blocker or optional configuration requirement.

### Epic E — Client portal, PBC and basic communications

### VP-023 — Complete PBC request creation, editing and ownership

**Target modules:** 09  
**Prerequisites:** VP-012, VP-020  
**User story:** As a preparer or manager, I want complete client information/document requests, so that the correct client contact can respond in the correct engagement context.

**Implementation scope and data**

Extend the existing request workflow with title, description, category, engagement/period, due date, recipient, client owner, optional job/task reference and required-document description. Support draft, manual presentation, controlled editing, cancellation and request filters. Recipients must be active contacts/identities explicitly assigned to the client. Link email preview and portal record without duplicating the request.

**Acceptance criteria**

1. Given a draft request, when manually presented, then the same request appears in the permitted client portal with description, due date, owner and status.
2. Reassignment or due-date changes are manual and recorded; a recipient from another client/unauthorized engagement is rejected.
3. Cancelling preserves prior submissions and communication history and removes the request from awaiting-response counts without deleting evidence.
4. No reminder schedule, recurring request, automatic task creation or implicit acceptance is added; missing title/recipient/context blocks presentation.

### VP-024 — Finish PBC submission, clarification and evidence acceptance

**Target modules:** 09  
**Prerequisites:** VP-021, VP-023  
**User story:** As a client contributor and independent reviewer, I want a complete response/replacement/review loop, so that received information becomes accepted evidence only after a separate decision.

**Implementation scope and data**

Reuse the existing shared request thread. Add multiple document references, text response, submission version, uploader/time and reviewer disposition. Support received, under-review, accepted and needs-clarification; reviewers can identify the exact missing item. A replacement creates a new submission revision and preserves the previous one. Documents link into the shared library/evidence catalogue rather than request-only copies.

**Acceptance criteria**

1. Given a permitted contributor, when submitting/replacing evidence, then staff see that exact submission as received, not accepted, and the client sees only client-visible comments.
2. An uploader/responder cannot accept their own submission by switching role labels; a different authorized person must review it.
3. Replacing previously accepted evidence preserves the old decision and marks current adequacy/dependent review as requiring a new assessment.
4. Empty/oversized/disallowed files and storage failure show accurate errors; uploaded metadata is never represented as durable original document storage.

### VP-025 — Unify the client portal across all agreed client functions

**Target modules:** 08  
**Prerequisites:** VP-019, VP-023, VP-024  
**User story:** As a client administrator, contributor or management approver, I want one coherent portal, so that I can manage requests and permitted information without seeing internal firm work.

**Implementation scope and data**

Provide client home, engagement summaries, requests, shared documents, messages, published financial packages, acknowledgement history and issued invoices. Support explicit entity/engagement selection for a client identity assigned to more than one scope. Keep role distinctions: nominate contacts versus supply evidence versus management decisions. Add visible empty, pending-review, no-access and withdrawn-sharing states.

**Acceptance criteria**

1. Given multiple authorized entities, when switching context, then every list, badge, search result and action uses the selected permitted scope.
2. Only explicitly shared documents/packages and client-visible messages appear; draft invoices, internal review points, risk registers and firm costs are absent.
3. Client nomination does not grant staff access or management-approval authority; contributor upload cannot issue or approve a report.
4. Invoices can be viewed/downloaded as demo artifacts without a Pay button or payment gateway; package acknowledgement is labelled separately from account approval and signatures.

### VP-026 — Implement basic outgoing Microsoft email and templates

**Target modules:** 11, 18  
**Prerequisites:** VP-007, VP-017, VP-023  
**User story:** As a staff member, I want a basic email composer and reusable templates, so that I can illustrate client communications without building an inbox product.

**Implementation scope and data**

Composer fields: configured synthetic sender, To, optional CC, subject, body, client/engagement context and permitted document links. Add bounded template CRUD with explicit placeholders such as client name, request title and due date. Preview resolved content before a manual “Simulate send”. Record local attempts and outcome; replies are not synchronized. Link the same message into client/request communication history.

**Acceptance criteria**

1. Given a valid message, when simulating send, then the outcome is explicitly local; no Graph call, SMTP, Resend, hidden fetch or real mailbox action occurs.
2. Invalid recipients, unresolved placeholders, cross-client file links or an unavailable sender block the action with an actionable error.
3. Known failed, simulated accepted and unknown-outcome scenarios are distinct; a repeated click does not create duplicate accepted attempts and an unknown outcome is not silently resent.
4. Templates are editable only by permitted users; no inbox, sync, Triage, auto-reminder, AI-drafting or signature/payment link feature is present.

### VP-027 — Add a complete communication register and manual incoming notes

**Target modules:** 07, 11  
**Prerequisites:** VP-008, VP-016, VP-026  
**User story:** As a team member, I want a client communication history across basic channels, so that important conversations are discoverable without syncing external services.

**Implementation scope and data**

Record incoming email, phone call, meeting or other external-conversation note manually with date/time, direction, participants, summary, author, client/engagement, optional job/request/document link and explicit visibility. Include locally composed email attempts from VP-026 in the same timeline. Channel names are labels, not integrations. Add filters and detail views; default internal notes to internal visibility.

**Acceptance criteria**

1. Given a manually recorded call/email, when opening the client timeline or register, then both show the same record and source links.
2. Incoming correspondence does not appear by itself; the UI says “Recorded manually” and never suggests mailbox synchronization.
3. Changing visibility requires permission and warns before client publication; restricted internal material cannot be exposed through linked attachments or search snippets.
4. Corrections retain attributable history; record dates and bounded text validate, and no scheduled follow-up or automatic outbound message is created.

### Epic F — Time, budgets, billing and offline receivables

### VP-028 — Complete time entry, review and correction workflows

**Target modules:** 12  
**Prerequisites:** VP-014, VP-019  
**User story:** As a staff member and independent manager, I want accurate time records linked to actual work, so that effort and billable value can be reviewed and reported.

**Implementation scope and data**

Extend existing time screens with work date, client/engagement/job/task, duration minutes, activity, narrative and billable/non-billable classification. Add drafts, edit, submit, return with reason, approve and correction revisions. Support a timesheet/list grouped by week or date with filters; no automatic time capture. A general engagement activity may use an explicit engagement-level entry without inventing a task.

**Acceptance criteria**

1. Given valid scope and positive duration, when saving/submitting, then local totals and linked work views update from the same effective entry.
2. A manager cannot approve their own entry under another role; returned entries require correction and resubmission.
3. An approved or consumed/billed entry is not overwritten; a correction retains the previous version and exposes its billing impact for a separate decision.
4. Future/out-of-scenario dates, invalid duration, scope mismatch and duplicate submission are handled explicitly; reports distinguish approved from unapproved time.

### VP-029 — Implement simple budgets with distinct billing and cost rates

**Target modules:** 13  
**Prerequisites:** VP-012, VP-028  
**User story:** As a manager, I want versioned engagement/job budgets and actual comparisons, so that I can see effort overruns without a resource-scheduling engine.

**Implementation scope and data**

Add budget editor with scope, currency, planned minutes by role/activity, optional staff allocation and rate reference. Show billing rate and internal cost rate as different fields; rates are versioned and snapshotted. Budget approval/revision is manual. Engagement totals aggregate job budgets once; unallocated engagement lines are separate to prevent double counting. Show planned/actual hours, fees and known costs.

**Acceptance criteria**

1. Given budget lines and approved time, when viewing comparison, then §5.5 formulas and line rounding yield reconciled totals and visible over/under variance.
2. Editing a used rate or approved budget creates a new version without changing historical invoice/time valuations.
3. Missing cost rates show unavailable cost/margin rather than zero; client/billing-only views cannot infer restricted staff costs.
4. Cross-currency totals are separated; job totals are not counted again as independent engagement lines; no capacity optimizer, roster, auto-scheduling or recurring budget is introduced.

### VP-030 — Complete billing accounts and invoice drafting from explicit sources

**Target modules:** 14  
**Prerequisites:** VP-011, VP-028, VP-029  
**User story:** As a billing officer, I want detailed invoice drafts linked to agreed services or approved time, so that fees are traceable and cannot be accidentally billed twice.

**Implementation scope and data**

Add billing-account/contact details, invoice dates/due date/currency/reference, service description and multiple quantity/rate lines. Support fixed-fee and manually selected approved time sources, with a separate ad-hoc line option. Link each source-based line to its exact source revision and scope. Provide preview and draft editing. No recurring invoicing, external ledger connector, online payment or new tax engine.

**Acceptance criteria**

1. Given selected approved time/service sources, when a draft is created, then every line retains its source and calculated amount and the invoice total equals its lines.
2. Duplicate source selection/consumption is prevented across active billed allocations; rework does not silently free a previously issued source for double billing.
3. Only permitted same-client/currency sources can be combined; invalid quantities, missing billing context and stale time revisions are rejected.
4. Existing historical tax totals are preserved if present; new fixture invoices use the approved no-tax demo profile rather than inventing tax calculations or rewriting prior totals.

### VP-031 — Finish invoice review, issue and credit-note workflows

**Target modules:** 14  
**Prerequisites:** VP-030  
**User story:** As a billing officer and independent commercial reviewer, I want controlled invoice issue and corrections, so that commercial records remain traceable without altering client books.

**Implementation scope and data**

Reuse independent review with return reasons and revision-bound approval. Issue an approved invoice as a local immutable demo document. Draft cancellation differs from post-issue correction. Add credit-note draft/review/issue linked to the affected invoice and line where applicable; partial credits are supported. Reuse the output component for genuine demo document downloads. Distinguish invoice issuance from email simulation and settlement.

**Acceptance criteria**

1. Given a submitted invoice, when reviewed by a different authorized person, then current approval permits one local issue event; later draft edits stale approval.
2. An issued invoice cannot be directly edited/deleted; a correction uses an attributable credit or replacement document with lineage.
3. Credits cannot exceed the remaining creditable amount and do not move money; same-person review and cross-client/currency credits are rejected.
4. Issuing an invoice does not send it, alter client TB/GL or approve an audit report; issued and email-simulation statuses are displayed separately.

### VP-032 — Implement offline receipt records, allocation and correction

**Target modules:** 15  
**Prerequisites:** VP-031  
**User story:** As a billing officer, I want separate offline receipts and invoice allocations, so that I can record externally received money without online payment processing.

**Implementation scope and data**

Add receipt register/detail with client billing account, amount, currency, received date, method (bank transfer/cash/cheque/other), external reference and notes. A receipt may allocate to several permitted same-client/currency issued invoices; unallocated balance remains explicit. Allocation reversal/correction creates history rather than editing settled facts invisibly. Bank verification is a recorded human note, not a connected bank action.

**Acceptance criteria**

1. Given a receipt, when allocated partially/across invoices, then receipt total = net allocations + unallocated balance and each invoice outstanding reconciles.
2. Negative/zero receipts, over-allocation, cross-client/currency allocation, draft-invoice allocation and stale balances are rejected atomically.
3. Undoing an allocation records a reversal reason and restores both balances without deleting the original allocation.
4. No money is initiated, refunded or moved; there are no card details, banking credentials, payment links or gateway statuses.

### VP-033 — Add receivables aging and client account statements

**Target modules:** 15  
**Prerequisites:** VP-032  
**User story:** As a billing officer or permitted manager, I want as-of receivables views and statements, so that I can identify outstanding invoices and explain their balances.

**Implementation scope and data**

Build invoice aging, client statement and receipt/unallocated registers with date, client and currency filters. Drill into invoice/credit/receipt allocations from every amount. Use §5.5 aging definitions. Provide bounded CSV and printable demo statements; the client portal exposes only its permitted issued financial documents, not other clients or internal cost metrics.

**Acceptance criteria**

1. Given invoices with different due dates, when an as-of date is selected, then Current/1–30/31–60/61–90/90+ buckets are correct at boundaries and sum to outstanding.
2. Future-effective receipts/credits do not reduce past as-of balances; drafts and pre-issue cancellations are excluded.
3. Unallocated receipts remain visible separately; different currencies are never combined into a misleading single balance.
4. Exported rows/totals reconcile with the filtered on-screen report and contain only the current role scope; no automated debt-chasing email is sent.

### Epic G — Complete import-first accounting demonstrations

### VP-034 — Add accounting profiles, periods, books, charts and dimensions

**Target modules:** 20  
**Prerequisites:** VP-012, VP-019  
**User story:** As a preparer and manager, I want an accounting setup workspace, so that every import and calculation has an explicit reporting context.

**Implementation scope and data**

Create client accounting profile, legal entity, reporting periods/books, basis and currency selectors. Add a chart editor with account code/name/type, parent, posting flag and active state. Provide bounded dimensions such as department/cost centre/project without an ERP module. Periods need start/end dates, owner engagement and status. Keep client and firm accounting separate; settings changes after approved output create revisions.

**Acceptance criteria**

1. Given a client/engagement, when setting up a period/book, then subsequent imports inherit a visible explicit context and cannot attach to a sibling client by accident.
2. Duplicate account codes, invalid date ranges, hierarchy cycles and posting accounts used as parents are rejected.
3. Used/approved charts and period settings are revised rather than destructively overwritten; affected packages show staleness.
4. New screens create neither client operational transactions nor tax/payroll configurations; empty setup provides a clear manual starting action.

### VP-035 — Complete bounded CSV and genuine XLSX trial-balance intake

**Target modules:** 21  
**Prerequisites:** VP-034  
**User story:** As a preparer, I want a full TB import wizard, so that I can map, validate, preview and retain a traceable source revision.

**Implementation scope and data**

Extend CSV intake with genuine XLSX parsing using a small reviewed browser-compatible dependency where needed. Steps: choose synthetic fixture/file, select period/book, map headers, choose signed-net or debit/credit convention, preview, validate and commit a new source revision. Required row data: account code/name and amount(s); optional dimension values must be defined. State explicit row/file limits and show row-level errors. Never execute macros/formulas.

**Acceptance criteria**

1. Given valid balanced CSV/XLSX data, when committed, then source rows, normalized totals, file metadata/hash and reporting context are retained as one revision.
2. Unbalanced totals, duplicate ambiguous accounts, missing headers, unknown dimensions, formula-dependent numeric cells and exceeded limits produce a non-committed error preview.
3. A rejected import leaves the previous accepted source untouched; a successful replacement preserves it and stales dependent calculations/approvals.
4. XLSX means an actual workbook format, not CSV renamed to .xlsx; source bytes remain in-session only and exported/imported formats are verified.

### VP-036 — Add GL intake, transaction browsing and TB completeness

**Target modules:** 21  
**Prerequisites:** VP-034, VP-035  
**User story:** As a preparer and reviewer, I want a general-ledger intake and completeness workspace, so that I can explain how source movements reconcile to the selected trial balance.

**Implementation scope and data**

Provide bounded GL file mapping/preview for journal ID, line ID, account, date, debit/credit or signed amount, currency, description and optional dimensions/service date. Add source-bound transaction filters, journal drill-down and opening + movement = closing comparison by account. Allow an explicit prior opening source; show unknown opening coverage when absent. This is file intake, not a live accounting integration or posting engine.

**Acceptance criteria**

1. Given coherent opening balances, GL movements and closing TB, when completeness is calculated, then per-account residuals and source references reconcile.
2. Missing opening data, partial journal batches, duplicate line keys, unmatched accounts, unbalanced journals and wrong periods/currencies are exposed rather than marked complete.
3. Importing/replacing GL creates a new source revision and invalidates affected reconciliations/packages without changing the original source rows.
4. Filters, source counts, drill-down and CSV export agree; the module never posts to client or firm books and handles the documented fixture size without freezing navigation.

### VP-037 — Extend account mappings and reporting validation

**Target modules:** 20  
**Prerequisites:** VP-034, VP-035  
**User story:** As a preparer and independent reviewer, I want editable versioned account-to-statement mappings, so that reported amounts can be traced and unmapped balances cannot disappear.

**Implementation scope and data**

Replace the five-class-only demonstration with explicit source-account to statement-line/note mapping tied to a chart/reporting-template version. Include a clear unmapped queue, current classification, optional approved split allocations and mapping review. Splits are deliberately manual with visible percentages/amounts; no AI suggestions. Drill from a statement line to mapped source rows.

**Acceptance criteria**

1. Given a source with unmapped material balances, when preparing a package, then validation flags the rows and blocks a misleading complete result.
2. A mapping revision requires independent review; editing an approved mapping preserves prior version and stales its dependent output.
3. Where splits are used, allocations reconcile exactly to each source balance and cannot double count; invalid/mismatched chart or note targets are rejected.
4. Every generated line exposes its mapping/source references; no unrecognized account is silently assigned a zero balance or miscellaneous category.

### VP-038 — Generalize adjustment journals and source-reflection decisions

**Target modules:** 22  
**Prerequisites:** VP-035, VP-036, VP-037  
**User story:** As a preparer, reviewer and management approver, I want a general journal register rather than one hard-coded depreciation example, so that reporting adjustments have traceable review and inclusion decisions.

**Implementation scope and data**

Create journal header/context and arbitrary debit/credit lines; support draft, submit, technical review, manual management decision, reporting inclusion, rejection and amendment. Link evidence/workpaper/finding. Record source reflection as not reflected, reflected, partially reflected or unknown against an exact replacement-source revision. Keep rejected differences visible. Reporting inclusion never implies external ledger posting.

**Acceptance criteria**

1. Given a balanced journal, when independently reviewed and management-accepted, then its effect is included once in the selected reporting layer.
2. Given a replacement TB already containing that journal, when marked reflected with evidence, then additional effect is zero and no double counting occurs.
3. Unknown/partial reflection blocks final reporting inclusion until resolved; changed source or journal revision stales the relevant decision.
4. Unbalanced/mixed-context lines, same-person approval and duplicate inclusion are rejected; amendments preserve prior versions and do not alter source or firm ledgers.

### VP-039 — Implement editable manual reconciliation schedules

**Target modules:** 23  
**Prerequisites:** VP-021, VP-036, VP-038  
**User story:** As a preparer and reviewer, I want manual bank/account reconciliation workspaces, so that differences can be explained and independently reviewed without matching automation.

**Implementation scope and data**

Add schedule header with account, period/as-of date, source TB/GL balance and statement/supporting balance; editable items with date, amount, type, explanation and evidence. Types distinguish timing items from proposed corrections. Compute reconciliation residual using a documented sign convention. Link proposed corrections to reporting journals rather than silently applying them. Support review, return, approve and source-stale states.

**Acceptance criteria**

1. Given valid schedule items, when recalculated, then opening/source/supporting totals and unexplained residual are reproducible from displayed inputs.
2. An unexplained nonzero residual or missing required evidence blocks approval; proposed corrections cannot masquerade as already cleared timing items.
3. An accepted source/evidence replacement makes current reconciliation review stale; the previous approved snapshot remains viewable.
4. Item currency/date/scope validation and independent reviewer checks work; no bank feed, automated matching, payment initiation or tax integration is introduced.

### VP-040 — Build configurable financial statements and comparatives

**Target modules:** 24  
**Prerequisites:** VP-037, VP-038, VP-039  
**User story:** As a preparer and reviewer, I want a fuller statement-preparation workspace, so that the prototype shows how reviewed source information becomes a financial statement set.

**Implementation scope and data**

Support statement of financial position, profit/loss, changes in equity and cash flows as explicit pages within a versioned layout. Add current/prior-period selection, line ordering/grouping, subtotal definitions and source drill-down. Restrict the calculation model to documented deterministic fixtures and supported line operations. Labels and previews state that professional methodology/framework approval is outside the demo.

**Acceptance criteria**

1. Given valid mapped current/prior periods, when statements are built, then each column and subtotal reconciles to its selected source; a missing prior period shows unavailable, not zero.
2. Assets, liabilities/equity and period-result movements reconcile in the supported fixture; invalid totals display blocking validation.
3. Changing source, mapping, layout or comparative selection creates a new output revision and stales the previous current review.
4. The preview provides complete visible structure, editing and drill-down for the supported demonstration; unsupported calculations never render invented balanced figures.

### VP-041 — Complete notes, cash-flow support and disclosure review

**Target modules:** 24  
**Prerequisites:** VP-040  
**User story:** As a preparer and reviewer, I want editable notes and movement schedules, so that statement completion is not reduced to a generic confirmation checkbox.

**Implementation scope and data**

Add notes/disclosure list with reference, applicability, text/data table, evidence, preparer/reviewer and status. Provide explicit opening cash, cash/noncash movement inputs and reconciliation to closing cash for the demo. Add equity movement input for contributions/distributions rather than assuming none. Related-party, going-concern and subsequent-event examples remain human-entered, non-AI and non-tax-specific.

**Acceptance criteria**

1. Given closing TB data alone, when cash flows lack required movement support, then the screen reports incomplete support instead of inventing movements.
2. Not-applicable notes need a reason and reviewer decision; a blank note is not an approved exemption.
3. Approved note/support edits preserve prior revision and invalidate current package review; totals tie to current statement context.
4. Client previews expose only deliberately shared note content; internal reviewer comments remain internal and no professional conclusion is autogenerated.

### VP-042 — Complete financial-package assembly and genuine exports

**Target modules:** 25  
**Prerequisites:** VP-040, VP-041  
**User story:** As a preparer and reviewer, I want a versioned package builder with useful downloadable sample outputs, so that I can inspect exactly what is presented, reviewed and released.

**Implementation scope and data**

Add package contents selection/order, output preview, validation summary, version list and source/mapping/notes lineage. Generate genuine browser-local XLSX, DOCX and PDF demo artifacts for supported fixtures using reviewed minimal dependencies; retain HTML/CSV where useful. An artifact records kind, exact package revision, generation and content identity. Treat file generation as local technical work, not a live Office integration or professional signing action.

**Acceptance criteria**

1. Given a valid supported package, when exported, then XLSX/DOCX/PDF files open as their actual formats and contain the displayed totals, entity, period and demo watermark.
2. Export generation failure or unsupported content blocks that output and reports the reason; no renamed CSV, empty PDF or fake success is accepted.
3. When package content changes, prior artifacts and decisions remain historical and a new artifact revision must be reviewed.
4. External sharing remains explicit and scope-bound; internal workpapers/comments are excluded from management/client outputs by default.

### Epic H — Bounded, complete consolidation user journey

### VP-043 — Create consolidation groups and effective perimeters

**Target modules:** 26  
**Prerequisites:** VP-019, VP-034  
**User story:** As a group accountant or manager, I want a separate group workspace, so that component financial information is combined without changing client source books.

**Implementation scope and data**

Add group identity, reporting period/basis/currency, manager and revisioned component perimeter. Components reference existing permitted legal entities with ownership/control information and effective dates. The first complete deterministic scenario uses a documented simple parent/wholly-owned-subsidiary profile. Other ownership/method selections may be shown with explicit unsupported limits, but cannot produce asserted results. Relationship/contact groups remain separate from consolidation groups.

**Acceptance criteria**

1. Given a valid group/perimeter, when saved, then the group has its own scope, revision and component links and no source client balances are changed.
2. Duplicate components, cycles, invalid ownership percentages and incompatible period/entity assignments are rejected.
3. Adding a component does not expand the operator’s access to its unrelated engagements; narrow group access exposes only approved component projections.
4. The selected calculation profile and limitations are visible; unsupported ownership/accounting methods cannot silently fall back to full consolidation.

### VP-044 — Select component packages and demonstrate currency translation

**Target modules:** 26  
**Prerequisites:** VP-042, VP-043  
**User story:** As a group accountant, I want version-pinned component packages and explicit rates, so that group figures have transparent sources and translation assumptions.

**Implementation scope and data**

Create component intake grid with readiness, period, basis, currency, package revision and review status. Pin one eligible package per component and expose drill-down. Add a manual versioned exchange-rate table with purpose/date/rate and mapping of applicable line-rate rules for a documented synthetic profile. Show original currency, rate, translated amount and any balancing translation difference explicitly. No online rate feed.

**Acceptance criteria**

1. Given eligible component packages, when selected, then exact revisions are pinned and a subsequent replacement produces a stale-component warning rather than silent refresh.
2. Missing rates, incompatible basis/period or unreviewed component packages block group output; missing amounts never default to zero.
3. The fixture’s translated values and rounding reconcile to published test expectations; every rate and translation difference is traceable.
4. An unapproved/unsupported translation rule shows a limitation and no fabricated consolidation result; component client packages remain unchanged.

### VP-045 — Implement manual eliminations and group adjustment review

**Target modules:** 26  
**Prerequisites:** VP-044  
**User story:** As a group accountant and independent reviewer, I want balanced elimination journals, so that intercompany and group-only adjustments are separately explained.

**Implementation scope and data**

Add elimination register with component counterparties, account/line references, amount/currency, reason, evidence and journal lines. Support draft, submit, approve/return and amendment. Show intercompany pairs and unmatched differences for manual inspection; no automated matching engine. The bounded example includes a supported intercompany receivable/payable elimination and an explained unmatched-item case.

**Acceptance criteria**

1. Given a balanced supported elimination, when independently approved, then it affects group output once and neither component book/package is modified.
2. Unbalanced lines, unsupported counterparties, mixed contexts and duplicate source inclusion are rejected.
3. Unmatched intercompany amounts remain visible for human resolution; approval does not hide the difference by netting an unexplained plug.
4. A component/rate/perimeter change stales dependent elimination approval and preserves the previous decision and journal revision.

### VP-046 — Produce, review and export consolidated output

**Target modules:** 26  
**Prerequisites:** VP-044, VP-045  
**User story:** As a group manager, I want a consolidated statement and reconciliation view, so that I can follow the complete group-reporting demonstration from source to reviewed output.

**Implementation scope and data**

Display component columns, translated totals, eliminations, group adjustments and consolidated totals; include source drill-down, scope summary and validation. Build a separate group package/review flow using the shared artifact and approval components. Include a complete end-to-end same-currency scenario and a documented simple translation scenario; describe unsupported accounting methods rather than claiming a production consolidation engine.

**Acceptance criteria**

1. Given compatible reviewed components and approved adjustments, when the supported fixture is consolidated, then consolidated = translated components + approved group adjustments/eliminations.
2. Statement equations and reconciliation columns agree with fixed expected fixture values; unresolved required inputs prevent a ready-for-review state.
3. Group output review binds to the exact perimeter/component/rate/elimination revisions; edits require fresh review.
4. Exported group demo artifacts preserve these references and exclude unrelated client information; no group action posts into component or firm ledgers.

### Epic I — Audit and assurance gap closure

### VP-047 — Complete client evaluation, conditions and manual continuance

**Target modules:** 27  
**Prerequisites:** VP-011, VP-012, VP-024  
**User story:** As an onboarding coordinator, compliance reviewer and partner, I want editable evaluation cases and separate decisions, so that client acceptance is supported by recorded facts rather than four receipt checkboxes.

**Implementation scope and data**

Extend the existing cases with typed question definitions, answers, evidence references, missing-item requests, conditions and decision history. Use the existing source question banks where applicable to the agreed scope; historical tax/payroll/provider requirements do not become new active modules or mandatory questions. Keep collection, recommendation and partner decision separate. Add manual continuance with prior/current differences and a new-period draft action that does not copy evidence or approvals.

**Acceptance criteria**

1. Given an incomplete case, when submitted, then required in-scope answers/evidence are identified and missing items can be requested without declaring them verified.
2. An independent compliance recommendation and partner decision require rationale; no risk score automatically accepts the client and unresolved prohibitions/conditions are visible.
3. Acceptance updates the linked engagement eligibility and permits idempotent local workspace preparation, but does not imply real identity screening or live SharePoint provisioning.
4. Manual continuance creates fresh decision context; a new-period draft has no copied source balances, samples, approvals, completed tasks or automatic recurrence schedule.

### VP-048 — Build a complete audit planning workspace

**Target modules:** 28  
**Prerequisites:** VP-012, VP-047  
**User story:** As a preparer, manager and partner, I want a versioned plan with materiality and responsibilities, so that the audit approach can be reviewed before fieldwork.

**Implementation scope and data**

Add plan tabs for entity/service scope, team, timing, materiality, significant areas and planning documents. Materiality captures benchmark/source, selected percentage, calculated amount, rationale and separately entered performance/clearly-trivial thresholds for the fixture. Dates and staff are assigned manually. Preserve the current planning illustration but replace single-checkbox readiness with identifiable review records. Calculations remain illustrative, never recommended professional thresholds.

**Acceptance criteria**

1. Given a draft plan, when submitted, then scope, required rationale and valid assignments are checked before independent review.
2. Calculated fixture amounts match deterministic expected values; missing benchmark/source or invalid thresholds produce clear errors rather than recommended defaults.
3. Editing an approved plan/materiality creates a new revision and shows affected fieldwork/conclusion review as stale where applicable.
4. A plan status does not grant professional authority or release a report; the screen clearly distinguishes entered assumptions, calculations and human judgments.

### VP-049 — Add editable risks, audit programs and procedure linkage

**Target modules:** 29  
**Prerequisites:** VP-048  
**User story:** As a preparer and reviewer, I want risk and audit-program registers, so that planned procedures visibly respond to the identified risks and assertions.

**Implementation scope and data**

Create risk records with title, area/assertions, description, rationale, response and owner; link procedures/programs by ID. Add reusable program templates for supported audit areas and manual copy into an engagement plan. Procedures have objective, instructions, assignee, required evidence and review status. Keep risk labels/rating manually selected; no AI scoring, automatic program generation or tax program.

**Acceptance criteria**

1. Given a risk, when linked to procedures, then risk detail and program detail show reciprocal links and unresolved coverage gaps.
2. Manual template application copies current instructions with fresh procedure IDs, but no prior results, evidence or approvals.
3. A changed approved risk/program creates a new plan revision and explicit review impact; retired templates do not change existing engagements.
4. Cross-engagement links, invalid assignments and unsupported service templates are rejected; a static risk card alone cannot count as an implemented risk workflow.

### VP-050 — Implement procedure-level fieldwork execution

**Target modules:** 30  
**Prerequisites:** VP-049  
**User story:** As an assigned preparer and reviewer, I want individual procedure results and exceptions, so that fieldwork progress reflects performed and reviewed work rather than just attached files.

**Implementation scope and data**

Add a procedure execution grid/detail with work performed, result, evidence links, conclusion, exception flag, preparer and reviewer. Allow draft/save, submit, return and independent clearance. Link a procedure to relevant workpaper, sample or finding without merging those records. Show required evidence and unresolved exceptions before submission; use the shared view-local error/stale revision contracts.

**Acceptance criteria**

1. Given an assigned procedure, when results are submitted, then required work description/evidence or a justified documented limitation is present.
2. An exception can be linked to a finding and remains visible after procedure completion; completion does not silently clear it.
3. Preparer cannot independently clear the same work; source/result/evidence changes require renewed review for the affected procedure.
4. Fieldwork counts agree with individual states; no upload automatically completes an entire audit area and no task-completion shortcut grants clearance.

### VP-051 — Complete populations, manual sample selection and test results

**Target modules:** 31  
**Prerequisites:** VP-036, VP-050  
**User story:** As a preparer and reviewer, I want source-bound populations and item-level testing, so that the sampling workflow can be demonstrated beyond three hard-coded rows.

**Implementation scope and data**

Support bounded population import or explicit selection from a permitted source dataset, with item ID/value/date/counterparty, objective, period and source reconciliation. Add manual/specific-item selection, selection rationale, selected/remainder values and per-item test results/evidence/exceptions. Version the selection and review its evaluation. No statistical confidence or sampling assurance is inferred; a full statistical engine is not required for this prototype.

**Acceptance criteria**

1. Given a population, when selecting items manually, then selected totals/counts and untested remainder reconcile without duplicates.
2. Wrong-period/currency sources, duplicate item IDs and incomplete population tie-out are displayed and prevent a misleading completed evaluation.
3. Each selected item has a recorded result or explicit limitation; exceptions link to findings and a human evaluation distinguishes tested from untested items.
4. Replacing the population preserves prior selections as historical and requires explicit reselection/review; no results or assurance conclusions carry forward automatically.

### VP-052 — Complete workpaper creation, template administration and reassignment

**Target modules:** 32  
**Prerequisites:** VP-021, VP-049, VP-050  
**User story:** As a preparer and manager, I want configurable workpapers using the existing execution workspace, so that new audit areas can use the demonstrated guidance/evidence/review lifecycle.

**Implementation scope and data**

Retain the six-tab workpaper workspace. Add create/copy from published workpaper template, edit draft scope, assign distinct preparer/reviewer people, applicability with rationale, completed workbook reference, conclusion and version history. Workpaper templates have guidance, procedure references and genuine sample files; they remain separate from job templates. Add reviewer reassignment with reason and eligibility checks, not a frozen role selector.

**Acceptance criteria**

1. Given a published workpaper template, when manually instantiated, then a fresh draft with template provenance is created without old evidence, conclusions or clearance.
2. Work performed, workbook/evidence references and required conclusion support submission; a reviewer can return/clear only the exact submitted revision.
3. Not-applicable changes require rationale and appropriate human review, cannot conceal unresolved findings, and update the progress denominator transparently.
4. Template/file extensions are genuine, reassignment preserves history, and an evidence/source replacement keeps previous clearance historical while requiring current reassessment.

### VP-053 — Add a reusable, version-aware evidence catalogue

**Target modules:** 33  
**Prerequisites:** VP-021, VP-024  
**User story:** As a preparer and reviewer, I want a shared evidence register, so that one source can support multiple permitted procedures without inconsistent copies.

**Implementation scope and data**

Create evidence records with title, source type, exact document/source revision, received date, classification, adequacy status, owner and related procedures/workpapers/reconciliations/findings. Distinguish an evidence reference from original file bytes and from a professional conclusion. Permit linking/unlinking with history, source-version comparison and explicit replacement impact. Use metadata search, not AI/OCR or a separate provider repository.

**Acceptance criteria**

1. Given accepted request evidence, when linked elsewhere, then each reference resolves to the same scoped evidence/document version and preserves provenance.
2. Linking an inaccessible, wrong-client/period or replaced version is rejected or clearly flagged; no filename-only matching silently selects a document.
3. Changing evidence adequacy/replacing a version identifies affected review subjects while retaining their previous historical evidence.
4. Client-facing projections never reveal internal evidence tags, restricted source details or unrelated linked subjects; removal does not erase issued-package provenance.

### VP-054 — Implement findings and differences as separate professional records

**Target modules:** 34  
**Prerequisites:** VP-038, VP-050, VP-051, VP-053  
**User story:** As a preparer, manager and reviewer, I want a proper finding and misstatement register, so that issues are evaluated rather than being confused with review queries.

**Implementation scope and data**

Add finding type, title, description, affected account/assertion, source/procedure/evidence, amount/currency where applicable, qualitative concern, management response, proposed correction, owner and disposition. Link to adjustment journals and review points without treating them as the same object. Show corrected/uncorrected status and both signed/net and gross absolute monetary totals by currency. Materiality comparison is contextual information, not an automatic conclusion.

**Acceptance criteria**

1. Given an exception, when promoted to a finding, then source/procedure/sample/evidence references remain traceable and the originating exception remains visible.
2. Qualitative findings can exist without amounts; monetary findings require valid currency and preserve gross amounts even when positive/negative differences offset.
3. Accepting a proposed correction is not evidence of external posting; reporting inclusion/reflection states come from the linked reviewed journal decision.
4. Closing/reopening a finding requires permitted human rationale; unresolved significant matters remain visible in completion and are not hidden by clearing a review point.

### VP-055 — Extend review-point assignment, filtering and response evidence

**Target modules:** 35  
**Prerequisites:** VP-016, VP-052, VP-053  
**User story:** As a reviewer and preparer, I want a cross-engagement review desk with traceable responses, so that review questions can be owned, answered and cleared independently.

**Implementation scope and data**

Retain raise/respond/clear/reopen. Add subject types beyond workpapers where appropriate, authorized assignee/reviewer changes, severity, due date, filters and linked response evidence. Keep thread history and exact subject revision. A point may relate to a finding but clearing it does not close that finding. Provide a personal review queue and links back to source subjects.

**Acceptance criteria**

1. Given a review point, when assigned/reassigned, then eligible people, reason and history are recorded and personal queues update without widening scope.
2. A response can link revised evidence but cannot self-clear; issuer/authorized substitute must independently assess the current revision.
3. Relevant subject changes after clearance produce a stale/reopened state while retaining the original response and clearance.
4. Filters/counts and exports respect exact engagement scope; internal review text never appears in client PBC/message views without a separately composed client-safe message.

### VP-056 — Complete reusable human approvals and independent EQR

**Target modules:** 36  
**Prerequisites:** VP-019, VP-042, VP-048, VP-055  
**User story:** As a manager, management approver, partner or EQR, I want consistent revision-bound approval queues, so that separate professional and management responsibilities remain clear.

**Implementation scope and data**

Extend the existing package approval flow into reusable queues for relevant subjects without a general workflow-builder UI. Record subject/revision, actor/person, role/scope, decision, time, rationale and evidence. Preserve management responsibilities and professional authorization as different decision types. Add reviewer assignment/substitution with reason, no-self-approval and EQR eligibility/concern handling; EQR state must belong to the engagement, not one global shared object.

**Acceptance criteria**

1. Given two engagements, when an EQR concern/decision changes in one, then the other engagement’s eligibility, concerns and approval state are unaffected.
2. A person cannot approve their own prepared subject by switching roles; a partner cannot also complete EQR for the same engagement.
3. Management sees only the deliberately presented package and records a human decision/acknowledgement without eSignature capture or provider calls.
4. Changed artifacts, source context or resolved concerns require a current decision as applicable; historical approvals are retained and never relabelled as approvals of a new revision.

### Epic J — Completion, reissue and internal archive

### VP-057 — Complete the human-controlled completion and release workspace

**Target modules:** 37  
**Prerequisites:** VP-042, VP-054, VP-056  
**User story:** As a manager and partner, I want an explicit completion checklist and exact-artifact release, so that the demonstration cannot release incomplete or unreviewed work.

**Implementation scope and data**

Extend the current release gates with a readable checklist of acceptance/terms, applicable workpapers, findings/differences, reviews, management presentation, required partner/EQR decisions and selected output artifacts. Add permitted recipient selection and preview of what each receives. A manual command prepares a frozen local candidate; a separate command records demo release/dispatch. Do not gate release on Purview or eSignature integrations.

**Acceptance criteria**

1. Given an unresolved mandatory gate, when preparing/releasing, then the action is blocked with links to the specific missing record and no release event is created.
2. Given current approvals and selected artifacts/recipients, when released, then the exact package manifest and artifact references are preserved once.
3. Duplicate clicks do not create duplicate release identities; a source/artifact change after preparation invalidates the candidate.
4. Client delivery contains only selected permitted artifacts, excludes private workpapers by default, and is labelled a local dispatch simulation, not actual email or legal issue.

### VP-058 — Demonstrate corrections, amendments and reissue lineage

**Target modules:** 37  
**Prerequisites:** VP-057  
**User story:** As a manager and partner, I want an explicit amendment/reissue workflow, so that corrections do not overwrite the originally released package.

**Implementation scope and data**

Add “Prepare amended version” from a released package with reason, changed inputs, impact summary, new revision and predecessor link. Repeat affected reviews and recipient checks; do not copy approval currentness. Record a replacement/superseding demo release linked to the earlier release. Show original and amended artifacts side by side and preserve their separate acknowledgements.

**Acceptance criteria**

1. Given a released package, when an amendment starts, then the original artifact/manifest remains readable and unchanged.
2. New source/notes/journals produce a new package identity and require current affected reviews before reissue.
3. An amended release cannot reuse old approval or acknowledgement as evidence for the new content; lineage is visible in staff and permitted client views.
4. Cancelling an amendment leaves the original release intact; no silent replacement, external recall or live email is implied.

### VP-059 — Finish Records & Archive without Microsoft Purview

**Target modules:** 38  
**Prerequisites:** VP-057, VP-058  
**User story:** As a records administrator, I want a searchable logical archive and application-only record metadata, so that I can track completed engagements without an external retention integration.

**Implementation scope and data**

Add archive register/detail with engagement, release version, archive date/by, manifest, exact document references, optional retention-until metadata, application hold flag/instruction and handover request. Archive is a manual action over a released snapshot; metadata corrections and successor archives retain history. Distinguish ordinary client-owned documents from restricted internal workpapers. No physical deletion, retention-provider interface or no-op success adapter.

**Acceptance criteria**

1. Given a released package, when archived, then its exact release/artifact/document identities appear in a stable local manifest and duplicate archival is avoided.
2. An application hold blocks a simulated disposition/handover action where policy requires; the UI explicitly states it does not prevent direct SharePoint modification/deletion.
3. Retention date entry never schedules deletion or asserts a legal requirement; missing dates and restricted handover requests remain explicit metadata/review states.
4. Purview, provider-lock verification, external retention success and mandatory compliance configuration are absent from the active module and its release prerequisites.

### Epic K — Reports, search, configuration and acceptance

### VP-060 — Create a practical report centre with reconciled metrics

**Target modules:** 01, 16  
**Prerequisites:** VP-005, VP-029, VP-033, VP-046, VP-054  
**User story:** As a manager, partner or billing officer, I want filtered operational and practice-finance reports, so that I can understand work and economics without AI or external BI.

**Implementation scope and data**

Provide report pages for active clients/engagements, jobs/tasks by status and overdue, PBC outstanding, work by person, approved time, billable/non-billable time, budget variance, invoice/credit/receipt registers and AR aging. Add permitted audit findings/review and package-readiness reports. Use §5.5 definitions, show as-of/source context, and provide CSV/print. Optional profitability shows unknown when cost input is missing; do not call invoicing statutory revenue.

**Acceptance criteria**

1. Given a report filter, when totals are calculated, then drill-down rows and exports reconcile to the same scoped dataset.
2. Changing a source time/invoice/receipt/task record updates relevant reports without independent manually maintained counters.
3. Different currencies and unknown cost information are shown honestly; budget, billing-rate value and actual delivery cost are not conflated.
4. Client/persona restrictions apply to filters, totals and downloads; reports contain no AI narrative, semantic analysis or Power BI integration.

### VP-061 — Implement ordinary global search and safe cross-links

**Target modules:** 17  
**Prerequisites:** VP-008, VP-020, VP-027, VP-033, VP-053, VP-054  
**User story:** As a permitted user, I want one deterministic search across business records, so that I can find context without searching embedded requirements or unrelated client data.

**Implementation scope and data**

Index bounded local text/metadata for clients, contacts, engagements, jobs/tasks, documents, communications, invoices, requests, workpapers and findings. Support text, record type and context filters, concise snippets and exact navigation. Search metadata/text already in the prototype; no vector store, model, external search provider or document OCR. Keep historical requirements search separate from product-record search.

**Acceptance criteria**

1. Given a term matching several record types, when searched, then grouped results use actual record IDs and open the right context/revision.
2. An unauthorized record never contributes title, snippet, count, autocomplete or result ordering visible to a narrower user.
3. Editing/archiving a record updates search availability consistently; deleted/unavailable targets lead to a safe unavailable view, not a different record.
4. Typing ordinary markup/text does not execute code; bounded search is responsive at the agreed fixture size and no external request is made.

### VP-062 — Complete firm and application administration

**Target modules:** 39  
**Prerequisites:** VP-015, VP-019, VP-026, VP-029, VP-034  
**User story:** As a system administrator and relevant business owner, I want one bounded settings area, so that configuration is usable without granting administrators professional authority.

**Implementation scope and data**

Provide firm name/logo placeholder, locale/timezone/display settings, synthetic contact defaults, supported services, job/email/workpaper templates, billing numbering/due terms, and accounting display/profile options. Route role-specific business settings to their proper owners; technical administration cannot approve methodology, journals or reports. Reuse dedicated editors rather than a second settings-only data store. Excluded product toggles must not be present.

**Acceptance criteria**

1. Given a valid setting change, when saved, then forms/previews use it where appropriate and the local configuration history records actor/reason.
2. Numbering avoids collisions and applies prospectively; changed defaults do not rewrite issued invoices, released packages or existing template-based jobs.
3. Business-role restrictions apply to cost rates, professional templates and accounting review; system-admin identity alone is insufficient.
4. Invalid settings, stale revisions and unavailable logos/files show clear validation; no actual tenant/hosting secrets, Purview, tax, AI or payment configuration is offered.

### VP-063 — Add executable cross-module browser acceptance and regression tests

**Target modules:** Cross-cutting foundation  
**Prerequisites:** VP-001, VP-002, VP-003, VP-004  
**User story:** As a reviewer, I want automated tests for the actual Vite runtime and complete journeys, so that visible prototype coverage is backed by repeatable evidence.

**Implementation scope and data**

Add/extend the repository’s tests after inventorying them; preserve useful existing regression cases. Use browser tests against a local server and the built Vite artifact, not only stale standalone HTML. Add unit tests for state migration, scope, commands, money/date calculations and source revision rules. Add explicit `test:unit` and `test:e2e` scripts and the acceptance scenarios in §8. A Playwright local `webServer` setup is a documented option. [W2]

**Acceptance criteria**

1. Every required module/story has at least one working positive journey and the relevant validation/scope/stale/rework negative checks; no excluded-module absence test is replaced by a static screenshot alone.
2. Tests run with isolated deterministic fixture state and verify the compiled Vite app; dependency/bootstrap failures are reported, not converted to skipped success.
3. Runtime egress tests block/assert absence of external Microsoft/email/payment/AI requests; route actions still work as local simulations.
4. Existing review/PBC/release tests remain passing or receive documented justified changes; actual run counts, commit, fixture and artifact identities are recorded only after execution.

### VP-064 — Publish module coverage, demonstration guide and implementation evidence

**Target modules:** Cross-cutting foundation  
**Prerequisites:** VP-063  
**User story:** As a product owner, I want a traceable completion report and walkthrough guide, so that I can verify the prototype represents the agreed product without production claims.

**Implementation scope and data**

Deliver a 39-row coverage checklist, story-to-route/command/test map, synthetic scenario guide, supported/unsupported calculation profile notes and a release summary. Update README/role guide to match the current prototype and clearly label historical source/standalone artifacts. The verification report distinguishes local UI coverage from production implementation. Documentation is part of each milestone, not deferred until the end.

**Acceptance criteria**

1. Every module in §4 has implemented route(s), local command(s), fixture(s), test(s) and current observed status; no row is marked complete based only on a source paragraph.
2. All 64 stories are accounted for as verified, failed or blocked with a precise reason; acceptance is incomplete while any required story remains blocked.
3. The guide provides end-to-end presenter steps, role switches and expected results, including a fresh empty-state journey and a failure/rework scenario.
4. The final report lists only actually executed checks and repository changes; it never claims live M365, real authorization, professional assurance, tax compliance, external retention or successful deployment.

## 8. Cross-module acceptance journeys

These are required browser scenarios, not tests claimed to have been executed. Implement them against the active Vite runtime with isolated synthetic fixtures. Detailed story criteria remain binding even where several are grouped into one journey. Use real local mutations and assertions, not success toasts alone.

### 8.1 Fixed calculation examples

**Accounting example:** the existing eight-account demonstration may be used as a controlled fixture. Expressed in QAR rather than stored cents: cash 10,000; receivables 5,000; equipment 8,000; expenses 3,000; payables −3,000; loan −7,000; opening equity −10,000; revenue −6,000. Signed TB total = 0, assets = 23,000, liabilities = 10,000, profit = 3,000. A 500 depreciation adjustment gives assets 22,500 and profit 2,500. A replacement source already containing the adjustment must leave those results unchanged, not charge depreciation twice. These are synthetic arithmetic checks, not financial advice. The baseline source contains the corresponding integer-minor-unit example. [R6]

**Budget example:** planned 600 minutes at a billing rate of QAR 200/hour gives planned billable value 2,000. Approved actual time of 660 minutes gives 2,200 billable value and +60 minutes variance. At a separately entered cost rate of 80/hour, actual delivery cost = 880. Without that cost rate, cost/margin is unavailable; it is not zero.

**Receivables example:** at `2026-09-23`, an issued QAR 1,000 invoice due `2026-08-15`, an effective QAR 100 credit and an allocated QAR 300 receipt leave QAR 600 in the 31–60-day bucket. A receipt dated after the as-of date does not reduce that historical balance. A separate QAR 500 receipt allocated 300 leaves 200 unallocated; it must not reduce another invoice until explicitly allocated.

**Consolidation example:** two reviewed same-currency components include a QAR 1,000 intercompany receivable/payable pair. The elimination debits the payable and credits the receivable by 1,000, reducing both consolidated assets and liabilities without changing component packages. An unmatched 100 difference remains visible; it must not be removed with an unexplained balancing line.

### 8.2 Required journeys

| ID | Journey / test | Required observable result | Primary stories |
|---|---|---|---|
| AT-01 | Fresh empty practice and persona entry | Usable empty states; no fabricated clients, completed work or live connection; correct simulated identity label. | 003–005, 018 |
| AT-02 | Upgrade legacy local state | Existing IDs, PBC/review/release histories retained; invalid/ambiguous migration offers recovery rather than reset. | 002, 004 |
| AT-03 | Exercise all external-looking controls with network interception | No Microsoft/mail/payment/AI/provider egress; same-origin static assets remain permitted; simulated actions still work. | 017, 020–022, 026, 063 |
| AT-04 | Inspect active supported-product UI | No Purview, tax/payroll, AI, signature/payment provider, recurrence or workflow-rule feature; historical source is clearly labelled. | 001, 062 |
| AT-05 | Add clients, contacts, custom values and relationship group | Shared data updates consistently; related-group membership grants no sibling-client access. | 006–008 |
| AT-06 | Open client workspace tabs and return navigation | Filters/context survive back/forward; related objects match the same client and authorized engagement. | 003, 008 |
| AT-07 | Inquiry → qualified opportunity → proposal draft | IDs/history retained and fees correctly separated by currency; lost reason affects open pipeline only. | 009–010 |
| AT-08 | Submit/review/revise proposal | Same-person review denied; revision stales approval; original presented content preserved. | 010–011 |
| AT-09 | Record manual proposal acceptance before professional acceptance | Commercial acceptance recorded with evidence; professional engagement remains pending until a separate decision. | 011–012, 047 |
| AT-10 | Activate permitted engagement and create a job | Correct client/service/period/team links; activation does not auto-create tasks, invoices or future engagements. | 012–013 |
| AT-11 | Task/subtask hierarchy and completion | Cross-job parent/cycle/second nesting rejected; parent/job remain manual and incomplete children block completion. | 014 |
| AT-12 | Reassign a task between two same-role people | Assignment really changes; reason/history retained; professional approval privileges do not change. | 014, 019 |
| AT-13 | Publish/apply/revise a job template | One fresh job tree per explicit operation; old jobs unchanged and no historical evidence/status copied. | 015 |
| AT-14 | Add internal comment and mention; switch to client | Only authorized recipients see local notices; client cannot see internal text, counts or attached references. | 016, 025 |
| AT-15 | Complete M365 setup simulation | Tenant/site/library/root/sender selections persist; all verification labels are explicitly simulated. | 017 |
| AT-16 | Denied site, changed root, failed optional mail and disconnect | Clear failure/recovery state; prior verification becomes stale; optional mail failure does not block SharePoint or local work. | 017, 022 |
| AT-17 | Nominate/import fixture user then grant access | Contact alone has no rights; identity, requested role and scoped grant are separate; no actual account/invitation created. | 018–019 |
| AT-18 | Narrow engagement grant, revoked grant and stale dialog | Sibling data absent from route, modal, counts, search and exports; commands recheck grant after revocation. | 003, 019, 061 |
| AT-19 | Prepare the same client workspace twice | One canonical local client root; correct engagement folders; no duplicate by retry or rename. | 020 |
| AT-20 | Replace an evidence-linked document | Old version remains pinned; current review shows freshness impact; no silent substitution. | 021, 053 |
| AT-21 | Optional OneDrive selection/import | Explicit permitted file provenance retained; canonical engagement storage remains SharePoint; disabled optional feature has no blocker. | 021 |
| AT-22 | Select an original file, reload and download | Metadata persists; original bytes unavailable is explained; sample download is not passed off as the original. | 004, 020–021 |
| AT-23 | Request → client response → clarification → replacement → acceptance | Shared request ID/thread/history; each replacement needs review; only client-visible text reaches the portal. | 023–025 |
| AT-24 | Uploader attempts evidence acceptance under another role | Same-person approval denied even if role label changes. | 019, 024 |
| AT-25 | Multi-entity client portal and issued-document visibility | Explicit sharing and scope enforced; no draft invoice, workpaper, costs, risk or internal review leakage. | 025, 031, 056 |
| AT-26 | Compose from template and simulate accepted/failed/unknown mail | Placeholders resolve; outcomes differ; no real send/delivery claim, automatic retry or duplicate accepted attempt. | 026 |
| AT-27 | Manually record received email/call/meeting note | Same record appears in communication/client views; nothing appears by mailbox sync. | 027 |
| AT-28 | Time draft → submit → return → approve → correction | Separate person approval; approved source history intact; corrected effective totals and invoice impact visible. | 028 |
| AT-29 | Budget arithmetic and cost-rate absence | Fixed example reconciles; missing cost is unavailable; engagement/job aggregation does not double count. | 029 |
| AT-30 | Invoice from fixed service and approved time sources | Lines/total reconcile; source revision links retained; duplicate or unapproved source consumption rejected. | 030 |
| AT-31 | Invoice review/issue and partial credit | No self-review; no direct issued-document edit; credit review and remaining creditable amount correct. | 031 |
| AT-32 | One receipt across invoices and reversal | Receipt amount = net allocations + unallocated; over/cross-client/currency allocations rejected; correction history retained. | 032 |
| AT-33 | As-of AR and aging boundary cases | QAR 600 example and boundary buckets match; future receipts ignored; exports equal displayed totals. | 033 |
| AT-34 | Configure chart/period/book/dimensions | Invalid dates/hierarchies/cross-client references rejected; source context visible throughout accounting. | 034 |
| AT-35 | Valid and invalid CSV/XLSX TB import | Genuine XLSX accepted within limits; error preview leaves old source unchanged; valid replacement preserves lineage. | 035 |
| AT-36 | GL import and opening + movement tie-out | Residuals/counts match; missing opening/partial journals do not become complete by default. | 036 |
| AT-37 | Revise mapping and inspect statement line source | Unmapped queue persists; split allocations conserve totals; changed approved mapping stales output. | 037 |
| AT-38 | Generic adjustment and reflected replacement source | QAR 500 depreciation applied once; unknown/partial reflection blocks; original source never posted/mutated. | 038 |
| AT-39 | Manual reconciliation with timing item and correction | Displayed residual is reproducible; proposed correction is distinct; unresolved residual blocks clearance. | 039 |
| AT-40 | Statements, comparatives and unsupported cash-flow input | No invented prior figures/movements; notes have applicability and review; statement equations reconcile. | 040–041 |
| AT-41 | Build/download XLSX, DOCX and PDF demo outputs | Files parse/open as their stated formats and match displayed exact revision/totals; no renamed/empty substitute. | 042 |
| AT-42 | Same-currency consolidation end to end | Group/component/adjustment columns reconcile; 1,000 elimination changes group only; component packages unchanged. | 043–046 |
| AT-43 | Translation with missing/wrong-context rate then corrected rate | Block before valid explicit rate; version/rule/rounding traceable afterwards; no unexplained plug or unsupported method pass. | 044–046 |
| AT-44 | Complete evaluation, conditions, continuance and plan | Separate collection/recommendation/decision; fresh-period draft has no copied approvals; materiality remains human-selected. | 047–048 |
| AT-45 | Risk → program → procedure → population/item result | Reciprocal links; manual samples conserve totals; untested remainder/limitations clear; exceptions remain visible. | 049–051 |
| AT-46 | New workpaper template → evidence → finding | Distinct IDs/records; no copied clearance; exact evidence version; qualitative and monetary findings supported. | 052–054 |
| AT-47 | Review rework, management/partner/EQR and second engagement | Same-person checks and exact revisions; EQR state does not leak to another engagement; no signature capture. | 055–056 |
| AT-48 | Completion → release → amendment → archive | Unresolved findings block; released artifact frozen; amendment has fresh review; archive has no Purview gate or physical protection claim. | 057–059 |
| AT-49 | Report filters, drill-down and exports | Same dataset/currency/as-of calculation on-screen and exported; no restricted cost/record leakage. | 060 |
| AT-50 | Global search with matching restricted records | No unauthorized snippets, totals or autocomplete; requirement-text search stays separate from business search. | 061 |
| AT-51 | Change settings/templates/rates after issued work | New defaults apply prospectively; historical invoices, jobs and released artifacts remain unchanged. | 062 |
| AT-52 | Full journey starting from manually entered client data | Lead through job/PBC/accounting or audit/review/package plus time/invoice/receipt/archive works without hidden seeded-ID dependencies. | All functional stories |
| AT-53 | Keyboard, responsive web, reload and modal navigation | Usable at representative desktop/tablet/narrow-browser widths; no inaccessible form action or focus loss; no native-app work. | 003, 063 |
| AT-54 | Concurrent tab/stale record and browser-storage failure | Conflict or session-only notice; no silent overwrite/reset and no false persistence success. | 002–004 |

## 9. Verification, completion evidence, and handoff

### 9.1 Definition of done for a functional story

A story is complete only when its validated form and local commands work, its records are connected to the shared context, its permitted role can reach it, forbidden roles/scopes are handled, its data survives supported reload behaviour, and its acceptance criteria have executed evidence. Include empty, failure, stale and rework states where relevant. Screenshot coverage without functioning actions is not sufficient.

Keep a module checklist with columns:

```text
Module ID | Story IDs | Route(s) | Command(s) | Fixture(s)
| Positive test | Negative/scope test | Rework/stale test
| Tested commit | Actual result | Remaining limitation
```

Complete prototype coverage is not complete production functionality. The final user guide must continue to state that browser role filtering/local history are not enforceable production security or immutable records.

### 9.2 Baseline and proposed verification commands

Inspect the real checkout first, including any repository instructions and existing tests. Do not infer installed tools from this document. The currently declared scripts are listed in §3. On the preserved lockfile baseline, use:

```bash
npm ci
npm run build
npm run legacy:check
```

If readable legacy sources changed, regenerate before checking. The source build script supports Python; use the command matching the environment:

```bash
# Linux/macOS with Python 3 available:
python3 build.py

# Windows Python launcher, as currently documented by the repository:
py -3 build.py
```

**Deliver under VP-063:** working `test:unit` and `test:e2e` scripts, plus the required test dependency/browser setup documented in README. Only after those scripts exist, run:

```bash
npm run test:unit
npm run test:e2e
```

Bind browser acceptance to the Vite build served locally, with the actual output directory/configuration verified from the checkout. Playwright can launch a local server using its `webServer` configuration. [W2] The legacy standalone build can receive a separate smoke test, but passing a historical standalone file is not acceptance of the active app.

Verify file formats programmatically in tests as well as opening representative outputs. Check that exports contain the correct data and watermark, not just that a download event occurred. Runtime network interception must prove simulation controls do not send Microsoft/email/payment/AI requests. Builds/package installation may use development package infrastructure; that is not business-provider integration.

### 9.3 Performance and scope test fixtures

Use at least a small fully understandable scenario and a bounded expanded scenario, for example 25 clients, 50 engagements, 100 jobs, 1,000 tasks and a 2,000-row import. These are proposed test sizes, not a claimed production capacity or a reason to add infrastructure. Adjust explicit import caps if measurement shows browser-local constraints; document the observed limitation and do not silently truncate.

Include two engagements for the same client, two clients with similar names, two different people with the same role, one multi-role person, one disabled identity, one narrowly scoped group user and one client identity with multiple explicit grants. These fixtures catch the scope and independence bugs that a single happy-path persona cannot expose.

### 9.4 Required repository documentation

Proposed files or existing canonical equivalents:

- `docs/prototype/scope.md`: current supported scope, hard exclusions and historical-source distinction.
- `docs/prototype/baseline.md`: actual inspected revision/runtime/build/test inventory.
- `docs/prototype/module-coverage.md`: all 39 module rows mapped to routes/commands/tests.
- `docs/prototype/demo-scenarios.md`: presenter journeys, synthetic data and expected arithmetic.
- `docs/prototype/verification.md`: commands actually run, commit/artifact IDs, results and limitations.
- Updated `README.md` and relevant role guide: current routes, feature boundaries, build instructions and simulations.

The exact filename may follow a repository convention; do not create duplicate guides where a suitable canonical document already exists. Keep historical requirements traceable rather than silently rewriting them to pretend the old scope always matched the new one.

### 9.5 Issue and PR workflow

Use one issue per story or a small explicitly linked vertical slice. Branch from the verified current default branch, not from an assumed old SHA; first reconcile changes made after this baseline. Each PR lists story IDs, affected module IDs, local schema changes, positive/negative tests, exclusions checked and screenshots only where useful. Mark all unexecuted tests as unexecuted.

Do not edit generated artifacts without their source, delete prior demo history, publish credentials, or change the production AuditSphere repository. Do not merge or deploy without the repository owner's explicit authorization and the applicable repository policy. This backlog is not merge/deployment consent.

### 9.6 Final acceptance checklist

- All 39 modules have an actual demonstrated workflow and complete traceability, including the six previously stronger areas' remaining gaps.
- All 64 stories and all 54 cross-module journeys have observed results; required failures/blockers are resolved before claiming full coverage.
- Jobs, tasks, subtasks and templates remain simple and manual.
- M365 screens are useful local simulations, with SharePoint canonical, OneDrive optional, basic email only, and no Purview.
- Client and staff projections, same-person approval checks, version staleness and historical snapshots work consistently across shared data.
- Invoices/receipts are firm-only, accounting is import-first, and consolidation does not mutate component books.
- Genuine output formats open correctly; original uploaded bytes are not falsely promised after reload.
- Existing valuable PBC/workpaper/review/release demonstrations remain intact or have documented equivalent replacements.
- Active UI and catalogue do not reintroduce excluded features; historical references are visibly historical.
- The final handoff clearly says what is prototype-only and does not claim live integration, production authorization, professional correctness, or deployment.

## 10. Coding-agent execution prompt

Use the following with this entire Markdown document available in the repository/workspace:

```text
Implement the AuditSphere visual-prototype gap-closure backlog in
nirzaf/auditsphere-visual-prototype. Treat
AuditSphere_Prototype_Complete_Gap_Closure_User_Stories.md as the current product
scope, master epic, module map, user-story backlog and acceptance contract.

First inspect the current default branch, repository instructions, active Vite
entrypoint, package lock, readable legacy sources, route/action overrides, local
state, role model and tests. The reviewed baseline was
3f30d348289d6d94dd49cb1d976e23018183eec9; reconcile subsequent changes rather than
resetting the repository or repeating work already completed.

Deliver all 39 functional areas using VP-001 through VP-064 in dependency order.
Preserve useful existing PBC, workpaper, review, management/partner/EQR and release
demonstrations. Add working forms, typed local records, guarded commands,
cross-links, meaningful empty/error/rework states and executable tests—not just
menu entries, static requirement cards or success toasts.

Stay inside the existing React/TypeScript/Vite browser-only prototype. Maintain
one authoritative local state and an explicit bridge for retained legacy views;
do not build a .NET backend, server/database, new production API, or duplicate
mutable store. Preserve the existing visual system. Use fresh synthetic records
and real local state transitions. Migrate existing demo history safely.

Keep project management to jobs, tasks, one-level subtasks and manually applied
templates. No recurring work, scheduler, workflow engine, automators or reminders.
Keep Microsoft surfaces to simulated Entra identity, Graph/SharePoint, optional
OneDrive for Business and basic Outlook/Exchange email. Remove Purview completely
from the supported product. Do not perform real OAuth, request secrets, call
Microsoft, send email or change external resources.

Do not add AI anywhere, mobile apps, online payments, eSignatures, tax, payroll,
non-M365 business integrations, advanced inbox/Triage, SOC 2 work or bespoke
encryption features. Keep human approvals, manual acceptance evidence, ordinary
application safety, content hashes, offline receipts and logical archive metadata.

Use explicit scopes and person identity. A role switch must not allow self-review;
client views must not leak internal notes, draft invoices or firm costs. Preserve
exact-version review/release histories. Keep firm economics, client source
accounting and group consolidation separate. Never claim that browser controls
are production security or that metadata-only uploads retain original file bytes.

Follow the milestone and PR workflow. Deliver the unit/browser tests and all
AT-01 through AT-54 journeys, including actual-format XLSX/DOCX/PDF exports and
network assertions that simulation controls make no provider calls. Record only
commands/tests actually executed against the active build. If a check is blocked,
report its exact cause without fake passing or weakening an assertion.

Update the current-scope guide, 39-module coverage matrix, demo walkthrough and
verification record as each slice lands. Do not modify nirzaf/AuditSphere, merge,
or deploy without explicit repository-owner authorization. Finish with a factual
summary of implemented stories, changed files, executed tests and remaining
blockers. Production readiness is not a deliverable of this prototype backlog.
```

## 11. Sources

Repository references are pinned to the reviewed SHA. Source descriptions above refer to that revision only. Requirements and acceptance criteria are proposed design decisions based on the agreed conversation scope, not claims that these features already exist.

- **[R1]** [README — browser-only boundary, local files, PBC and build usage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/README.md).
- **[R2]** [React entrypoint and legacy runtime host](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/src/main.tsx).
- **[R3]** [Legacy bundle/artifact generation](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/build.py).
- **[R4]** [Existing package scripts and dependencies](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/package.json).
- **[R5]** [Active role routes, page/action overrides, commercial/M365/user workflows](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/role-views.js).
- **[R6]** [Base fixtures, accounting calculations, workpapers, review and release actions](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/base-app.js).
- **[R7]** [Role-view guide, responsibilities and demonstration limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/ROLE_GUIDE.md).

- **[W1]** [React: useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) — subscribing React to an existing external store; checked 23 September 2026.
- **[W2]** [Playwright: local web-server configuration](https://playwright.dev/docs/test-webserver) — running browser tests against a local application server; checked 23 September 2026.

**End of implementation backlog.**

