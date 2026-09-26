
# AuditSphere Visual Prototype
## Complete Requirements & Progress Tracker
**Tracker version:** 1.0  
**Snapshot date:** 2026-09-26 (UTC)
**Repository:** `nirzaf/auditsphere-visual-prototype`  
**Overall status:** PARTIALLY IMPLEMENTED / ACCEPTANCE INCOMPLETE  
**Document purpose:** Complete requirement preservation, progress tracking and acceptance closure—not a production-readiness certificate.
> **Read the status correctly:** “VERIFIED” below means the repository reports that story/module as accepted in its current evidence records. It is not a claim that new tests were executed while creating this tracker. “PARTIAL” can mean unfinished functionality, unfinished verification, or both. Missing evidence is never automatically classified as missing implementation.
> **Scope:** Browser-only synthetic prototype. The production AuditSphere repository is not the implementation target. No repository file, issue, PR, deployment or persistent Library item was changed to produce this document.
## Contents
- [1. Snapshot, status definitions and progress totals](#snapshot)
- [2. Agreed scope, exclusions and interpretation safeguards](#scope)
- [3. Shared requirements for every module](#shared-contract)
- [4. Milestones and dependency tracking](#milestones)
- [5. Complete 39-module register](#modules)
- [6. Complete 64-story summary register](#story-register)
- [7. Detailed requirements, acceptance criteria and current progress](#requirements)
- [8. Original 54 cross-module acceptance journeys](#journeys)
- [9. Pending work and acceptance queue](#pending)
- [10. Maintenance, evidence and final acceptance](#maintenance)
- [11. Source register and provenance](#sources)
<a id="snapshot"></a>
## 1. Snapshot, status definitions and progress totals
### 1.1 Current totals
| Measure | Current snapshot | Meaning |
|---|---:|---|
| Original functional modules | 39 | All are retained in this tracker. |
| Repository-verified modules | 10 | Source module status, not a new independent audit. |
| Partial modules | 29 | Contain residual implementation and/or acceptance work. |
| Original user stories | 64 | Original VP-001–VP-064 identifiers and titles retained. |
| Repository-verified stories | 16 | Includes VP-014 and VP-043, whose criterion evidence is recorded below. |
| Partial stories | 48 | All have current progress and a closure plan below. |
| Stories explicitly reported wholly not started | 0 | No entire story is labelled Not started in the source records; this does not mean there are no pending features. |
| Original detailed acceptance criteria | 256 | Four original criteria per story, all reproduced below. |
| Original cross-module journeys | 54 | AT-01–AT-54, retained verbatim with primary-story mapping. |
| Unit checks passing in this review | 238 / 238 | Latest full local run on 2026-09-26 against the working tree; includes GL-source package-lineage guards. |
| E2E checks passing in this review | 110 / 110 | Latest full serialized run on 2026-09-26: 5 static + 105 Chrome; includes AT-36 post-replacement reconciliation re-review and AT-41 reviewed package regeneration across GL source revisions. |
| Complete criterion-level acceptance | No | Referenced tests and passing subsets do not establish complete acceptance of every criterion. |
| Open acceptance actions in Sections 9.3–9.4 | 30 | Recount 2026-09-26: 37 open rows reduced to 30 by closing four actions whose evidence was already recorded as Verified (VP-014-E02, VP-024-E01, VP-035-E01/E02), two scope reconciliations whose bounded question is satisfied (VP-003-R03, VP-045-R01), and the presenter-guide action verified current (VP-064-E02). Completed queue actions are not story sign-offs; 48 stories remain Partial pending criterion matrices and reviewer decisions. |
Sources: [S1], [S3], [S4], [S5]. This snapshot includes portal entity-switching/invoice-download evidence, task/workpaper search-target fixes, independently reviewed cash-flow and per-note disclosure records, VP-043 perimeter acceptance, and the new VP-003 draft-guard (AT-57), denied-route handling and dialog evidence, VP-010 proposal authoring/date validation and AT-58 revision lifecycle evidence, VP-029 historical budget-rate aggregation and billing cost privacy (AT-59), VP-011 staff response recording, VP-015 template lifecycle evidence, VP-027 inbound communication date/text validation and controlled client publication, VP-028-E01 date/duration/scope guards and effective time totals across reports/work views, VP-028-E02 browser evidence for the billed-time warning/immutable invoice/no duplicate source, VP-026 duplicate-submit idempotency, VP-031 invoice revision/reapproval/credit lineage, and VP-044-E01/E02 stale-pin, review-gate, FX provenance, and rounding evidence. It also includes UIX-01 responsive keyboard-navigation evidence and the VP-040 versioned layout editor with preview/export and reviewed-output staleness checks. The current story totals are 16 verified / 48 partial; module totals remain 10 verified / 29 partial because other stories in the consolidation module are still open. Test counts are outcomes of the tests present, not product-completion percentages. No unsupported completion estimate is used.
### 1.2 Status and pending-work legend
| Label | Definition | How to use it |
|---|---|---|
| VERIFIED (repository-reported) | The pinned repository marks the complete story/module Verified. | Preserve functionality; retain tests. Do not confuse it with independent verification in this authoring session. |
| PARTIAL | Some functionality/evidence exists but the repository has not accepted the full item. | Read demonstrated work and pending actions together. |
| NOT STARTED | No implementation for the entire item has been started, supported by evidence. | Available for future tracking; not assigned to any whole original story in this snapshot. |
| BLOCKED | A named dependency, defect or environment issue prevents progress. | Record the exact blocker and issue; do not silently convert it to a pass. |
| I — Implementation pending | Current source limitations identify missing functional work. | Implement the bounded requirement, then verify it. |
| E — Evidence/verification pending | A required path, negative case or exact acceptance mapping is not yet signed off. | Test first; change code only when needed. |
| R — Reconcile requirement | The source description is ambiguous, historical or may refer to excluded/optional scope. | Resolve against the original criterion before assigning new feature work. |
| EXCLUDED | The user removed this from the target. | Never include it in the completion denominator or pending backlog. |
**Criterion statuses:** For a repository-verified story, its four criteria inherit the repository’s *story-level* verification assertion; individual test locators are still to be recorded in a future exact evidence ledger. For a partial story, criteria stay **OPEN FOR SIGN-OFF** even where some assertions have passed. That is not a claim that the whole criterion is unimplemented. No fabricated criterion-by-criterion pass count is derived.
**Planning fields:** “Unassigned” and “Not linked” are empty fields in this new tracker, not claims about GitHub assignees or existing issues. P1/P2 priorities below are recommended ordering, not repository metadata. No due date is invented.
### 1.3 Completed stories and modules to preserve
**Verified stories:** [VP-009](#vp-009), [VP-018](#vp-018), [VP-037](#vp-037), [VP-047](#vp-047), [VP-051](#vp-051), [VP-052](#vp-052), [VP-053](#vp-053), [VP-055](#vp-055), [VP-056](#vp-056), [VP-057](#vp-057), [VP-058](#vp-058), [VP-059](#vp-059), [VP-060](#vp-060).
**Verified modules:** [MOD-03](#mod-03), [MOD-16](#mod-16), [MOD-27](#mod-27), [MOD-31](#mod-31), [MOD-32](#mod-32), [MOD-33](#mod-33), [MOD-35](#mod-35), [MOD-36](#mod-36), [MOD-37](#mod-37), [MOD-38](#mod-38).A module can remain Partial even when one of its stories is Verified. For example, account mappings (VP-037) are Verified, but Accounting also includes the partial setup story VP-034; identity lifecycle (VP-018) is Verified, but scope administration VP-019 remains Partial. Conversely, local release/archive stories do not make upstream financial-package preparation fully accepted.
<a id="scope"></a>
## 2. Agreed scope, exclusions and interpretation safeguards
### 2.1 Target outcome — original contract
**As an accounting/audit practice stakeholder, I want the existing AuditSphere prototype to represent the entire agreed practice-management, accounting, audit, client-portal, and Microsoft 365 experience, so that I can validate navigation, forms, data relationships, human handoffs, calculations, and error states before the corresponding production features are built.**A completed prototype must support a coherent synthetic journey:```textLead → opportunity → proposal → recorded client response  → professional acceptance → engagement → client workspace  → manually created job/template → tasks/subtasks  → client requests → received documents → evidence review  → accounting preparation / audit fieldwork → human reviews  → approved package → simulated release → logical archiveParallel practice-finance journey:Time → budget comparison → draft invoice → independent review  → locally issued invoice → offline receipt record → allocation → reports```The arrows describe **human-initiated actions and data links**, not a workflow-automation engine. Commercial acceptance, professional acceptance, management acknowledgement, audit review, invoice issue, and report release remain separate decisions.
### What “implemented” means for this repository
A module is represented when its necessary screens, validated forms, local record changes, cross-links, role-specific views, and representative success/failure/rework journeys work. A menu label, toast, static service card, or embedded requirements paragraph alone is insufficient.A Microsoft connection can be **simulated as configured** but never reported as actually connected. An issued invoice changes local demonstration records but never sends a demand for payment. A local approval illustrates a recorded human decision but is not an electronic signature or professional certification.The 39 areas are functional boundaries, not 39 microservices, stores, independent apps, or mandatory sidebar entries. Consolidate related views without losing their capabilities.
### 2.2 Full original scope decisions
The numbered subheadings in this extract retain their **original contract numbering**.
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
**Core design:** Entra ID identity concept; Microsoft Graph transport concept; SharePoint as the canonical shared client/engagement document repository; Exchange Online/Outlook for basic outgoing email. **Optional design:** bounded OneDrive for Business selection/import, not a second canonical archive.All interactions here use local synthetic fixtures. Do not open a real OAuth flow, ask for credentials, provision a user/site/folder, query a tenant, send a message, or change provider permissions. Do not add Microsoft products merely because they are Microsoft products: Teams, Planner, Power Automate, and Power BI integrations are not needed for this backlog.Microsoft configuration may be skipped in the demo; a disconnected simulation must not lock users out of unrelated local modules. SharePoint, mail, and optional OneDrive have independent simulated readiness states. A failed optional mail test does not invalidate a completed SharePoint simulation.
### 2.3 Simplicity and interpretation rules
- Jobs have tasks and **one level of subtasks**. No Gantt, dependencies, recurring definitions, scheduler, or priority/rules framework is necessary. Dates, assignments, and status changes are manual.- Applying a template is an explicit “Create job from template” operation. It copies structure once; it never creates future jobs.- Client workspace/folder preparation may occur as the deterministic local result of an explicit acceptance/workspace command. That is not a configurable workflow engine. Repeating the command must not duplicate a workspace.- Basic validation, arithmetic, calculated counts, safe technical error handling, and stale-version warnings are allowed. They must not perform business actions autonomously.- Keep accounting import-first: source TB/GL, reporting adjustments, reconciliations, packages, and consolidation. Do not build a client operational ERP, purchasing, sales ledger, inventory engine, or source-ledger posting connector.- Keep the firm's own invoices, time, receipts, and commercial figures separate from client accounting and group consolidation.- Keep the Records module as an **application-level archive index**. Retention dates and hold flags are metadata, not SharePoint preservation guarantees. No automatic deletion.- The previous comparison's percentages were design estimates, not acceptance targets. The checklist and executable journeys below replace percentage-based completion claims.
### 2.3 Prevent scope creep and incorrect completion blockers
| Topic | Correct treatment in this tracker |
|---|---|
| Purview / retention provider | Excluded completely, including optional/no-op adapters. Local archive metadata and human holds remain. |
| Live Entra login, real invitations, SharePoint transfer, Outlook delivery, AML/KYC services | Out of scope for this browser prototype. Local identity/invitation/setup/evidence-recording simulations remain in scope. |
| General ledger posting / bank feeds / automatic matching | Excluded external or production operations. File intake, manual reconciliation and reporting adjustments remain. |
| Native mobile app / PWA project | Excluded. Responsive browser and keyboard behavior remain required. |
| Encryption project versus artifact identity | No bespoke encryption-management work. Existing platform protections and content hashes are not removed. |
| State validation and dependent review invalidation | Required data integrity, not a user-configurable workflow-automation engine. |
| Manual continuance / create from template | Explicit human actions only. No recurrence, scheduling or automatic renewal. |
| Cash-flow support | Unsupported output must stay unavailable. The original VP-041 still requires bounded movement inputs for a supported demonstration; inventing balancing figures is never a fix. |
| Consolidation | The first supported profile is Parent + wholly owned Subsidiary. Do not add Associates/minority methods solely to remove an “unsupported” label. |
| Print acceptance | Browser print layout/action and correct data remain relevant. OS/printer-driver certification is not a new requirement. |
| Per-service milestone billing | The repository notes it is unmodeled. Reconcile against the original explicit line/source requirement; do not automatically add a billing scheduler. |
| User file bytes | Original default is metadata/hash + in-session originals, not localStorage binary persistence. Current PBC/generated/archive paths report IndexedDB storage. Document these specific local exceptions and verify each path; never claim every library file survives reload. |
| Legacy route bridge | Original preservation intent remains; equivalent React migration may retire old renderers. Record redirects/retirement rather than reintroducing deleted unused artifacts. |In particular, old limitations text mentioning live screening, remote bank provenance, inbox/sync or provider delivery receipts must **not** be copied into an implementation queue as mandatory features. Pending rows below are interpreted against the original scope and criteria, not every historical sentence in the repository.
<a id="shared-contract"></a>
## 3. Shared requirements for every module
The following is the original common contract, preserved because all 64 stories depend on it. References to **§5 / §5.5** in story text mean the original numbered subheadings below. The architecture sketch was written for the starting baseline; it is not evidence that every proposed path exists in the current checkout. The explicit React/legacy reconciliation note above applies.
### 5.1 Stay inside the prototype repository
Do not change `nirzaf/AuditSphere`, introduce its .NET backend into this repository, or create a database/API solely for this prototype. Keep React + TypeScript + Vite and the existing visual system. Build new screens as small feature components; migrate existing screens only where needed to connect the new behaviour. No whole-application rewrite is a prerequisite.Proposed organization, adjusted to the real checkout rather than blindly created:```textsrc/  app/                 shell, route registry, demo scope, scenario controls  prototype/           typed model, single store, commands, selectors, fixtures, migrations  legacy/              explicit bridge to retained legacy views/actions  features/    practice/          clients, commercial pipeline, engagements, dashboard    work/              jobs, tasks, templates, comments    documents/         library, evidence references, PBC    communications/    basic mail simulation, communication log    portal/            scoped client projections    economics/         time, budgets, invoices, receipts    accounting/        profiles, TB/GL, mappings, journals, reconciliations, packages    consolidation/     groups, components, translation, eliminations    audit/             acceptance, plans, risks, procedures, workpapers, reviews    records/           completion, released artifacts, logical archive    administration/    users, grants, settings, simulated M365 setup    reporting/         deterministic reports and scoped search  shared/              form, table, dialog, money/date and download helpers```One store must own shared record identity and revisions. Do not create a separate client/engagement copy per page or parallel mutable React and legacy stores. Expose explicit reads, subscriptions, and commands through the compatibility bridge. If React subscribes to retained non-React state, `useSyncExternalStore` is a suitable documented mechanism; publish cached immutable snapshots and clean up subscriptions. This is an implementation recommendation, not a requirement to add a state-management library. [W1]Only one renderer owns a route's DOM at a time. Mount new React feature routes into an exclusive host; retained imperative pages must not overwrite that host. Dispose listeners, subscriptions, and dialogs on route changes. Never fix integration by appending a new chain of global action overrides on every render.Treat `app.bundle.js` as generated while legacy source generation remains supported. Regenerate it from its sources rather than hand-editing both copies. The Vite entrypoint is the canonical acceptance target. Keep the old standalone build honest about any transitional feature coverage; it must not be advertised as current parity when it is not.
### 5.2 Local data and persistence contract
Every durable demo record has a stable ID, applicable scope IDs, revision, creator, and timestamps. Shared references use IDs, not labels or array indices. Display names can change without breaking relationships.| Record group | Required relationships / fields |
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
| Approval / release / archive | subject type/ID/revision, decision actor and rationale; preserved release snapshot; archive manifest and application-only hold/retention metadata |Continue browser-local metadata persistence with a versioned schema. Preserve the previous storage payload before migration. Migrate deterministically and validate references; do not silently reset old demo work or assign ambiguous scope. A malformed payload opens a recovery/reset prompt. Storage denial/quota exhaustion yields an explicit “session-only, not saved” state.Default upload behaviour remains metadata and hash only. A selected file may be available for preview in memory for the current session; never persist its bytes in localStorage, place bytes in exported state, or upload it. After reload, the UI must explain that an original file needs to be selected again. Built-in synthetic fixtures can be downloaded repeatedly and are visibly distinguished from an original user-selected file. Parsed synthetic TB/GL rows may persist as bounded local demo records; the source file bytes do not.Keep one active editing tab as the supported demonstration mode. Detect storage revision changes from another tab and show reload/conflict guidance instead of silently overwriting. Do not build real-time collaboration infrastructure.
### 5.3 Commands, states, and roles
All new commands validate the current **demo person, active status, role grant, client/engagement/group scope, expected record revision, state, and separation of duties**. The same checks apply to UI actions and programmatic command calls used by tests. These illustrate intended production behaviour; all browser data is still inspectable and editable by the browser owner.Keep the existing 14 role concepts: relationship owner, onboarding coordinator, compliance officer, partner, manager, preparer, senior reviewer, EQR, client administrator, client finance contributor, management approver (existing client-signatory persona), billing officer, records administrator, and system administrator. Reuse role keys where possible. Multiple fictional people may share a role so same-function reassignment can actually be demonstrated. A person with multiple roles cannot approve their own preparation by switching role labels.System administration is not professional approval. Billing access does not grant client TB/GL access. A client administrator is not automatically a management approver. Client views show explicitly shared records only; filter lists, counts, search, notifications, exports, and direct links as well as menus. Reset/change-scenario tools live in a clearly separate presenter mode, not client business navigation.Use bounded state machines, not a workflow builder:| Area | Default states / transition rule |
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
| Archive | Not archived, Archived in demo, Superseded archive version; no real provider protection asserted |Completing a task never approves a workpaper, accepts evidence, issues an invoice, or releases a report. Derived progress is display-only; an empty task list must not produce a misleading 100% completed label. Relevant source/evidence changes invalidate current applicability while retaining the historical decision.
### 5.4 UX and data-entry contract for every story
Every workflow needs entry/navigation, list/detail or appropriate embedded panel, labelled required/optional inputs, valid empty state, validation messages, save/cancel, local persistence feedback, and return navigation. Provide a clear success state and at least one invalid-input, forbidden-scope, stale-edit, and rework example where applicable. Avoid long walls of GUIDs: use human-readable codes with optional technical detail.Use current spacing, type, colours, panels, dialogs, and responsive tables. Support keyboard navigation, visible focus, labelled controls, accessible status messages, focus restoration, and unsaved-change warnings. Test responsive web layouts; do not call them mobile applications. A client-facing comment is deliberately marked client-visible; internal discussion is the default.
### 5.5 Deterministic numbers and dates
Use existing QAR fixtures as the primary demonstration currency. Store QAR monetary values in integer minor units; retain currency with every monetary record. Time uses integer minutes. Apply documented rounding once at each invoice/budget line, sum rounded lines, and test the rounding boundary. FX rates are decimal strings with a documented precision and rounding rule; do not rely on unchecked floating-point equality.New scenarios use a fixed demo `asOfDate = 2026-09-23`. Financial scenarios may use the completed period `2025-01-01`–`2025-12-31`; practice deadlines and receipt dates must be chronologically coherent. Changing the demo clock is explicit. Existing historical states must not be silently rewritten to make them look current.Minimum report definitions:- Actual hours = effective approved minutes / 60; expose submitted-but-unapproved time separately.- Budget-hours variance = actual approved hours minus planned hours; positive means over budget.- Billable value = sum of individually rounded approved billable minutes × snapshotted billing rate / 60.- Actual delivery cost uses a separate snapshotted cost rate; unknown cost is **unknown**, not zero.- Invoiced fees = locally issued invoice amounts less effective issued credits; label this as invoicing, not statutory revenue recognition.- Invoice outstanding = issued amount − effective credits − net allocated receipts. Unallocated receipts remain separate.- Aging uses the report as-of date and invoice due date, excluding not-yet-issued/draft/cancelled records. Buckets: Current, 1–30, 31–60, 61–90, over 90 days. Due today is Current. Ignore receipts/credits effective after the as-of date.- Never sum different currencies into one unexplained total. Group by currency unless a visible, versioned conversion is explicitly part of the consolidation demonstration.
### Current cross-cutting progress checkpoint
| Common requirement | Reported present | Pending closeout |
|---|---|---|
| Shared state and command boundary | React app, typed state and guarded commands | All active-route lifecycle and compatibility evidence: VP-002/003. |
| Scope and identity | Immutable identities, explicit grants/windows, scoped menus/data | Professional/group permission matrix and all projections: VP-019. |
| Persistence and recovery | Versioned migrations, conflicts, quota and malformed payload handling | Full historical-shape, future-schema and recovery matrix: VP-004. |
| Numerical invariants | Reported calculation and source-revision checks | Full money/date/source-bound acceptance for all partial finance/accounting stories. |
| Human authority and artifact history | Several review, release and archive stories Verified | Preserve their evidence; do not infer completion of upstream partial stories. |
| Accessibility and responsive web | Representative Chrome widths and client dialog | All dialogs, dirty state and route context cases: VP-003/063. |
| Same-origin simulation | CSP plus exercised browser request interception | Full criterion-specific regression evidence; no live provider work. |
<a id="milestones"></a>
## 4. Milestones and dependency tracking
| Milestone | Original story range | Verified / total | Remaining partial | Current gate | Owner / target |
|---|---|---:|---:|---|---|
| M0 — Foundation | VP-001–VP-004 | 0/4 | 4 | Open — close linked story criteria | Unassigned / not set |
| M1 — Practice | VP-005–VP-012 | 1/8 | 7 | Open — close linked story criteria | Unassigned / not set |
| M2 — Simple work | VP-013–VP-016 | 0/4 | 4 | Open — close linked story criteria | Unassigned / not set |
| M3 — Microsoft & documents | VP-017–VP-022 | 1/6 | 5 | Open — close linked story criteria | Unassigned / not set |
| M4 — Portal & communication | VP-023–VP-027 | 0/5 | 5 | Open — close linked story criteria | Unassigned / not set |
| M5 — Practice finance | VP-028–VP-033 | 0/6 | 6 | Open — close linked story criteria | Unassigned / not set |
| M6 — Accounting | VP-034–VP-042 | 1/9 | 8 | Open — close linked story criteria | Unassigned / not set |
| M7 — Consolidation | VP-043–VP-046 | 1/4 | 4 | Open — close linked story criteria | Unassigned / not set |
| M8 — Audit | VP-047–VP-056 | 6/10 | 4 | Open — close linked story criteria | Unassigned / not set |
| M9 — Delivery & records | VP-057–VP-059 | 3/3 | 0 | Assigned stories repository-verified; upstream/shared acceptance still applies | Unassigned / not set |
| M10 — Product completeness | VP-060–VP-064 | 1/5 | 4 | Open — close linked story criteria | Unassigned / not set |These are dependency groups, not promised delivery dates. M0 permission/persistence contracts apply to every later milestone. M3 editable identity/setup augments those controls; it must not become a reason to bypass them earlier. M9 having three verified stories is not final product sign-off while upstream packages/accounting and the cross-module acceptance contract remain open.
<a id="modules"></a>
## 5. Complete 39-module register
The current module-status column follows [S3], not a recalculated guess. Detailed requirements, implemented work, pending actions, source files and tests are located under the linked original stories. Original baseline classifications are historical design coverage only.
| Module | Functional scope | Original baseline | Current repository status | Required stories | Verified stories / linked stories |
|---|---|---|---|---|---:|
| <a id="mod-01"></a>MOD-01 | **Practice Dashboard** | Partial | PARTIAL | [VP-005](#vp-005), [VP-060](#vp-060) | 1/2 |
| <a id="mod-02"></a>MOD-02 | **CRM & Client Management** | Partial | PARTIAL | [VP-006](#vp-006), [VP-007](#vp-007), [VP-008](#vp-008) | 0/3 |
| <a id="mod-03"></a>MOD-03 | **Leads & Opportunities** | Partial | VERIFIED (reported) | [VP-009](#vp-009) | 1/1 |
| <a id="mod-04"></a>MOD-04 | **Proposals & Engagements** | Partial | PARTIAL | [VP-010](#vp-010), [VP-011](#vp-011), [VP-012](#vp-012) | 0/3 |
| <a id="mod-05"></a>MOD-05 | **Jobs & Tasks** | Light | PARTIAL | [VP-013](#vp-013), [VP-014](#vp-014) | 0/2 |
| <a id="mod-06"></a>MOD-06 | **Job Templates** | Missing | PARTIAL | [VP-015](#vp-015) | 0/1 |
| <a id="mod-07"></a>MOD-07 | **Team Collaboration** | Light | PARTIAL | [VP-016](#vp-016), [VP-027](#vp-027) | 0/2 |
| <a id="mod-08"></a>MOD-08 | **Client Portal** | Strong; gaps remain | PARTIAL | [VP-025](#vp-025) | 0/1 |
| <a id="mod-09"></a>MOD-09 | **Client Requests / PBC** | Strong; gaps remain | PARTIAL | [VP-023](#vp-023), [VP-024](#vp-024) | 0/2 |
| <a id="mod-10"></a>MOD-10 | **Document Management** | Light | PARTIAL | [VP-020](#vp-020), [VP-021](#vp-021) | 0/2 |
| <a id="mod-11"></a>MOD-11 | **Communications** | Light | PARTIAL | [VP-026](#vp-026), [VP-027](#vp-027) | 0/2 |
| <a id="mod-12"></a>MOD-12 | **Time Tracking** | Partial | PARTIAL | [VP-028](#vp-028) | 0/1 |
| <a id="mod-13"></a>MOD-13 | **Budgets** | Missing | PARTIAL | [VP-029](#vp-029) | 0/1 |
| <a id="mod-14"></a>MOD-14 | **Billing & Invoicing** | Partial | PARTIAL | [VP-030](#vp-030), [VP-031](#vp-031) | 0/2 |
| <a id="mod-15"></a>MOD-15 | **Receivables** | Light | PARTIAL | [VP-032](#vp-032), [VP-033](#vp-033) | 0/2 |
| <a id="mod-16"></a>MOD-16 | **Reporting & Analytics** | Light | VERIFIED (reported) | [VP-060](#vp-060) | 1/1 |
| <a id="mod-17"></a>MOD-17 | **Search & Centralized Client View** | Light | PARTIAL | [VP-008](#vp-008), [VP-061](#vp-061) | 0/2 |
| <a id="mod-18"></a>MOD-18 | **Microsoft 365 Integration** | Light | PARTIAL | [VP-017](#vp-017), [VP-020](#vp-020), [VP-021](#vp-021), [VP-022](#vp-022), [VP-026](#vp-026) | 0/5 |
| <a id="mod-19"></a>MOD-19 | **Identity & Access Management** | Partial | PARTIAL | [VP-018](#vp-018), [VP-019](#vp-019) | 1/2 |
| <a id="mod-20"></a>MOD-20 | **Accounting** | Light | PARTIAL | [VP-034](#vp-034), [VP-037](#vp-037) | 1/2 |
| <a id="mod-21"></a>MOD-21 | **Trial Balance & GL** | Partial | PARTIAL | [VP-035](#vp-035), [VP-036](#vp-036) | 1/2 |
| <a id="mod-22"></a>MOD-22 | **Adjustments & Journals** | Partial | PARTIAL | [VP-038](#vp-038) | 0/1 |
| <a id="mod-23"></a>MOD-23 | **Reconciliations** | Light | PARTIAL | [VP-039](#vp-039) | 0/1 |
| <a id="mod-24"></a>MOD-24 | **Financial Statements** | Partial | PARTIAL | [VP-040](#vp-040), [VP-041](#vp-041) | 0/2 |
| <a id="mod-25"></a>MOD-25 | **Financial Packages** | Partial | PARTIAL | [VP-042](#vp-042) | 0/1 |
| <a id="mod-26"></a>MOD-26 | **Consolidation** | Missing | PARTIAL | [VP-043](#vp-043), [VP-044](#vp-044), [VP-045](#vp-045), [VP-046](#vp-046) | 1/4 |
| <a id="mod-27"></a>MOD-27 | **Client Acceptance** | Partial | VERIFIED (reported) | [VP-047](#vp-047) | 1/1 |
| <a id="mod-28"></a>MOD-28 | **Audit Planning** | Light | PARTIAL | [VP-048](#vp-048) | 0/1 |
| <a id="mod-29"></a>MOD-29 | **Risks & Audit Programs** | Light | PARTIAL | [VP-049](#vp-049) | 0/1 |
| <a id="mod-30"></a>MOD-30 | **Audit Fieldwork** | Partial | PARTIAL | [VP-050](#vp-050) | 0/1 |
| <a id="mod-31"></a>MOD-31 | **Populations & Sampling** | Light | VERIFIED (reported) | [VP-051](#vp-051) | 1/1 |
| <a id="mod-32"></a>MOD-32 | **Workpapers** | Strong; gaps remain | VERIFIED (reported) | [VP-052](#vp-052) | 1/1 |
| <a id="mod-33"></a>MOD-33 | **Evidence** | Partial | VERIFIED (reported) | [VP-053](#vp-053) | 1/1 |
| <a id="mod-34"></a>MOD-34 | **Findings & Differences** | Light | PARTIAL | [VP-054](#vp-054) | 0/1 |
| <a id="mod-35"></a>MOD-35 | **Review Points** | Strong; gaps remain | VERIFIED (reported) | [VP-055](#vp-055) | 1/1 |
| <a id="mod-36"></a>MOD-36 | **Reviews & Approvals** | Strong; gaps remain | VERIFIED (reported) | [VP-056](#vp-056) | 1/1 |
| <a id="mod-37"></a>MOD-37 | **Completion & Release** | Strong; gaps remain | VERIFIED (reported) | [VP-057](#vp-057), [VP-058](#vp-058) | 2/2 |
| <a id="mod-38"></a>MOD-38 | **Records & Archive** | Partial | VERIFIED (reported) | [VP-059](#vp-059) | 1/1 |
| <a id="mod-39"></a>MOD-39 | **Administration** | Light | PARTIAL | [VP-019](#vp-019), [VP-062](#vp-062) | 0/2 |Every module also depends on the common contracts and VP-001–VP-004 / VP-063–VP-064. Module counts are not effort weights. Do not divide 10 by 39 and call that the percentage of code implemented.
<a id="story-register"></a>
## 6. Complete 64-story summary register
Use this register for planning and the detailed records below for implementation/acceptance. All requirement titles are copied from the original contract, not relabelled to match screens.| Story | Original requirement | Milestone | Status | Remaining work types | Recommended priority | Owner / issue |
|---|---|---|---|---|---|---|
| [VP-001](#vp-001) | Freeze scope and remove excluded product surfaces | M0 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-002](#vp-002) | Introduce a single typed state and legacy/React route bridge | M0 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-003](#vp-003) | Unify navigation, scoped views and reusable form behaviour | M0 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-004](#vp-004) | Version fixtures, migrate existing demo state and provide scenario recovery | M0 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-005](#vp-005) | Build a real practice dashboard with scoped drill-downs | M1 | PARTIAL | E | P2 | Unassigned / not linked |
| [VP-006](#vp-006) | Complete client profile creation, editing and lifecycle | M1 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-007](#vp-007) | Add contacts, relationship groups and bounded custom fields | M1 | PARTIAL | E/I | P2 | Unassigned / not linked |
| [VP-008](#vp-008) | Complete the centralized client workspace | M1 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-009](#vp-009) | Finish the leads and opportunities pipeline | M1 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-010](#vp-010) | Build reusable services and complete proposal drafting | M1 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-011](#vp-011) | Record proposal review, presentation and manual client acceptance | M1 | PARTIAL | E | P2 | Unassigned / not linked |
| [VP-012](#vp-012) | Complete engagement creation and lifecycle handoff | M1 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-013](#vp-013) | Add the simple job register and job detail workspace | M2 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-014](#vp-014) | Implement tasks and exactly one level of subtasks | M2 | PARTIAL | E/I/R | P2 | Unassigned / not linked |
| [VP-015](#vp-015) | Implement job-template authoring and manual instantiation | M2 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-016](#vp-016) | Add contextual internal notes, comments and basic mentions | M2 | PARTIAL | E/I/R | P2 | Unassigned / not linked |
| [VP-017](#vp-017) | Create the simplified Microsoft 365 setup wizard | M3 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-018](#vp-018) | Represent Microsoft sign-in and user lifecycle honestly | M3 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-019](#vp-019) | Add editable application-role grants and scope administration | M3 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-020](#vp-020) | Build the SharePoint-first document browser and client folders | M3 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-021](#vp-021) | Add document versions, existing-file linking and optional OneDrive selection | M3 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-022](#vp-022) | Complete Microsoft configuration failure, reconnect and disconnect journeys | M3 | PARTIAL | E | P2 | Unassigned / not linked |
| [VP-023](#vp-023) | Complete PBC request creation, editing and ownership | M4 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-024](#vp-024) | Finish PBC submission, clarification and evidence acceptance | M4 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-025](#vp-025) | Unify the client portal across all agreed client functions | M4 | PARTIAL | E/I | P2 | Unassigned / not linked |
| [VP-026](#vp-026) | Implement basic outgoing Microsoft email and templates | M4 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-027](#vp-027) | Add a complete communication register and manual incoming notes | M4 | PARTIAL | E/I/R | P2 | Unassigned / not linked |
| [VP-028](#vp-028) | Complete time entry, review and correction workflows | M5 | PARTIAL | E | P2 | Unassigned / not linked |
| [VP-029](#vp-029) | Implement simple budgets with distinct billing and cost rates | M5 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-030](#vp-030) | Complete billing accounts and invoice drafting from explicit sources | M5 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-031](#vp-031) | Finish invoice review, issue and credit-note workflows | M5 | PARTIAL | E | P1 | Unassigned / not linked |
| [VP-032](#vp-032) | Implement offline receipt records, allocation and correction | M5 | PARTIAL | E | P1 | Unassigned / not linked |
| [VP-033](#vp-033) | Add receivables aging and client account statements | M5 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-034](#vp-034) | Add accounting profiles, periods, books, charts and dimensions | M6 | PARTIAL | E | P1 | Unassigned / not linked |
| [VP-035](#vp-035) | Complete bounded CSV and genuine XLSX trial-balance intake | M6 | VERIFIED (reported) | E | P1 | Unassigned / not linked |
| [VP-036](#vp-036) | Add GL intake, transaction browsing and TB completeness | M6 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-037](#vp-037) | Extend account mappings and reporting validation | M6 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-038](#vp-038) | Generalize adjustment journals and source-reflection decisions | M6 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-039](#vp-039) | Implement editable manual reconciliation schedules | M6 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-040](#vp-040) | Build configurable financial statements and comparatives | M6 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-041](#vp-041) | Complete notes, cash-flow support and disclosure review | M6 | PARTIAL | E/I | P1 | Unassigned / not linked |
| [VP-042](#vp-042) | Complete financial-package assembly and genuine exports | M6 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-043](#vp-043) | Create consolidation groups and effective perimeters | M7 | VERIFIED | E/I/R | P1 | Acceptance evidence recorded 2026-09-24 |
| [VP-044](#vp-044) | Select component packages and demonstrate currency translation | M7 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-045](#vp-045) | Implement manual eliminations and group adjustment review | M7 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-046](#vp-046) | Produce, review and export consolidated output | M7 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-047](#vp-047) | Complete client evaluation, conditions and manual continuance | M8 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-048](#vp-048) | Build a complete audit planning workspace | M8 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-049](#vp-049) | Add editable risks, audit programs and procedure linkage | M8 | PARTIAL | E | P2 | Unassigned / not linked |
| [VP-050](#vp-050) | Implement procedure-level fieldwork execution | M8 | PARTIAL | E/R | P1 | Unassigned / not linked |
| [VP-051](#vp-051) | Complete populations, manual sample selection and test results | M8 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-052](#vp-052) | Complete workpaper creation, template administration and reassignment | M8 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-053](#vp-053) | Add a reusable, version-aware evidence catalogue | M8 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-054](#vp-054) | Implement findings and differences as separate professional records | M8 | PARTIAL | E | P1 | Unassigned / not linked |
| [VP-055](#vp-055) | Extend review-point assignment, filtering and response evidence | M8 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-056](#vp-056) | Complete reusable human approvals and independent EQR | M8 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-057](#vp-057) | Complete the human-controlled completion and release workspace | M9 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-058](#vp-058) | Demonstrate corrections, amendments and reissue lineage | M9 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-059](#vp-059) | Finish Records & Archive without Microsoft Purview | M9 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-060](#vp-060) | Create a practical report centre with reconciled metrics | M10 | VERIFIED (reported) | Regression only | Regression | Unassigned / not linked |
| [VP-061](#vp-061) | Implement ordinary global search and safe cross-links | M10 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-062](#vp-062) | Complete firm and application administration | M10 | PARTIAL | E/R | P2 | Unassigned / not linked |
| [VP-063](#vp-063) | Add executable cross-module browser acceptance and regression tests | M10 | PARTIAL | E | P1 | Unassigned / not linked |
| [VP-064](#vp-064) | Publish module coverage, demonstration guide and implementation evidence | M10 | PARTIAL | E/R | P1 | Unassigned / not linked |
<a id="requirements"></a>
## 7. Detailed requirements, acceptance criteria and current progress
Each record includes the exact original user story, required scope, four acceptance criteria, current demonstrated work and pending closure actions. **No criterion is deleted just because a module looks complete.** Original prerequisite expressions are preserved. New action IDs such as `VP-041-I01` are tracker-only subdivisions; they do not replace VP story IDs.
<a id="vp-001"></a>
### VP-001 — Freeze scope and remove excluded product surfaces
**Current status:** PARTIAL
**Milestone:** M0  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, VP-039 Chrome subcases run on working tree after `20213179`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [RequirementsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/RequirementsView.tsx), [scope.md](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/scope.md).
**Module links:** Cross-cutting; applies to every module.
**Original journey links:** [AT-04](#at-04); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Current product scope excludes AI, native mobile apps, online payments, signature providers, tax/payroll modules, non-M365 providers, Purview and recurring/automated work. Active scope disclosures and source/bundle absence checks exist.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-001-E01 — Verification/evidence pending:** Finish the criterion-by-criterion active navigation, settings, catalogue and historical-reference allowlist audit. Record evidence that existing human review/PBC/release paths remain reachable. — DONE 2026-09-25: full-suite run at `0077cc6` plus current working-tree changes (lint clean; 176/176 unit incl. `scope.test.ts` AT-04 allowlist scan; 74/74 E2E incl. 69 Chrome journeys); manual audit enumerated every Shell route (33 staff + client routes) and mapped each to the 39 in-scope modules; exclusion-term scan of `src` returned disclosure/negation text only. See the 2026-09-25 row in `docs/prototype/verification.md`.
- [x] **VP-001-R02 — Requirement/scope reconciliation:** Retain historical imported tax/salary account labels; do not turn a non-feature keyword match into a requirement to destroy accounting data. — DONE 2026-09-25: `Tax Card Number` custom field, `Income tax` statement line, `Profit Before Tax (5%–10%)` materiality benchmark and `Payroll trend comparison` template subtask confirmed as data/labels, retained unchanged; no data was deleted during the audit.
#### Original user story and dependencies
**Target modules:** Cross-cutting foundation  
**Prerequisites:** Baseline verification  
**User story:** As an implementation owner, I want a single visible supported-product scope, so that the prototype does not advertise removed modules.
#### Full required implementation scope
Inventory the active Vite routes, renderer overrides, actions, service cards, fixtures and built output. Remove Purview, signing/filing providers, tax/payroll service modules, recurring-work controls and non-M365 integration choices from the supported product. Keep source-history/reference material unchanged where appropriate, but label it “Historical source — not current product scope” and provide the current-scope view as default. Keep human review and ordinary archive metadata. Record a baseline inventory in `docs/prototype/baseline.md`; do not publish old test counts as a new run.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-001-AC01 | Given the current product navigation, when a user inspects features/settings, then no excluded module is offered as available, optional setup, or a release prerequisite. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-001-AC02 | Given historical requirements that mention excluded products, when opened deliberately, then the historical scope warning is visible and the text does not enable a business action. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-001-AC03 | Existing PBC, workpaper, review and release demonstrations remain reachable; removing signature-provider wording does not remove manual acceptance or internal approval. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-001-AC04 | Tests scan target-facing route/configuration data and exercise relevant screens; an explicit allowlist covers exclusion documentation and historical references only. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L288).
**Next evidence update:** Exact tested commit: `0077cc6` (working tree on `main`, uncommitted); fixture: current seed via `npm run test:unit` / `test:e2e`; criterion → test/run link: AC01 → `tests/unit/scope.test.ts` AT-04 scan + Shell route audit; AC02 → README/scope.md historical labelling + native-entry inspection (`src/main.tsx`); AC03 → 69/69 Chrome journeys (PBC, workpapers, review, release) reachable without live setup; AC04 → `scope.test.ts` allowlist within 172/172 unit; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-002"></a>
### VP-002 — Introduce a single typed state and legacy/React route bridge
**Current status:** PARTIAL
**Milestone:** M0  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-25, current working tree (uncommitted)
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [App.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/App.tsx), [prototypeStore.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/store/prototypeStore.ts).
**Module links:** Cross-cutting; applies to every module.
**Original journey links:** [AT-02](#at-02), [AT-54](#at-54); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
A direct React application, typed shared store, guarded commands and subscriber updates replace the original legacy-hosted entrypoint. Recent maintenance removes an unreferenced standalone legacy artifact.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-002-E01 — Verification/evidence pending:** Prove equivalent retained PBC/workpaper/review journeys and single-state updates across all active modules; test repeated mounting, routing and command execution. — EVIDENCED 2026-09-25 at `b24359c` working tree: single store instance (`prototypeStore.ts:4455`), `subscribe`/unsubscribe verified against App effect cleanup (StrictMode-safe), one `storage` conflict listener; 74/74 E2E (5 static + 69 Chrome) exercises shell boot, routing, repeated navigation and PBC/workpaper/review/release journeys against the same store. See the 2026-09-25 row in `docs/prototype/verification.md`.
- [x] **VP-002-R02 — Requirement/scope reconciliation:** Reconcile the original legacy-adapter/hash-route criteria with the completed React migration. Document compatibility or intentional retirement; do not rebuild an unused legacy runtime solely to satisfy obsolete implementation wording. — DONE 2026-09-25: the native React entrypoint owns the single typed store and retires the legacy renderer from the active runtime; `legacyRoutes.ts` redirects all 36 former role-view route IDs plus original entry-route aliases into current React routes, with role checks and denied-route fallback. `README.md` documents the boundary. The historical standalone bundle remains generated from `base-app.js` + `role-views.js` by `build.py`, separate from Vite.
#### Original user story and dependencies
**Target modules:** Cross-cutting foundation  
**Prerequisites:** VP-001  
**User story:** As a developer, I want new React features and retained legacy views to share one state, so that cross-module actions remain consistent without rebuilding the application.
#### Full required implementation scope
Create a typed prototype store, command boundary, selectors and explicit legacy adapter. Route descriptors specify a single renderer and required capabilities. Move shared identifiers/revisions behind the store before extending records. Existing legacy actions must pass through or commit back to the same authoritative state. Preserve original page ownership until its route is migrated. Use a bounded implementation, not a new framework, second runtime store, or microservice layer.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-002-AC01 | Given an engagement updated in a new React page, when a retained accounting/workpaper view opens, then it reads the same ID and latest revision without a reload/reset. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-002-AC02 | Given a retained legacy action, when it changes shared state, then subscribed new views update once and persist the same revision. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-002-AC03 | Navigating repeatedly, mounting/unmounting and development hot reload do not duplicate roots, event handlers, dialogs or command execution. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-002-AC04 | Existing hash routes remain compatible or receive an explicit redirect; generated legacy bundles are regenerated from source, not independently patched. | SUBCASES VERIFIED 2026-09-25: all 36 former role-view route IDs and original entry aliases resolve to current React destinations; restricted destinations fall back through the current role guard; Chrome verifies direct hash routing, canonical redirects, current-route navigation, and browser back. `build.py` remains the source-driven generator for the retired standalone bundle. Criterion-level sign-off remains open. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L305).
**Next evidence update:** Test base `0077cc6` plus current uncommitted changes; fixture: current seeded state and each historical hash route; AC04 → `tests/unit/legacyRoutes.test.ts`, `tests/e2e/app.test.ts::VP-002-AC04` (179/179 unit; 75/75 E2E, 2026-09-25). AC01–AC03 remain open for criterion-mapped single-state/repeated-mount review across all active modules; reviewer/date: **pending human sign-off / 2026-09-25**.
<a id="vp-003"></a>
### VP-003 — Unify navigation, scoped views and reusable form behaviour
**Current status:** PARTIAL  
**Milestone:** M0  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-25, current working tree (uncommitted)
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [App.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/App.tsx), [Shell.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/layout/Shell.tsx), [guards.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/guards.ts).
**Module links:** Cross-cutting; applies to every module.
**Original journey links:** [AT-01](#at-01), [AT-06](#at-06), [AT-18](#at-18), [AT-53](#at-53), [AT-54](#at-54); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Role-aware routes, scoped selectors, responsive layout checks and app-wide modal semantics, focus containment, Escape dismissal and return focus are implemented for active `.modal-backdrop .modal` dialogs. Chrome checks cover the client dialog at 320/390/768 pixels and keyboard behavior for an unannotated New Job dialog.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-003-E01 — Partial verification evidence:** Shared semantics, focus containment, Escape, Enter submission and focus restoration pass for selected client/New Job dialogs. Chrome now verifies a dirty client-profile draft prompts on Escape and backdrop dismissal; Stay retains its values; confirmed discard does not persist the client and returns focus to the opener at 320/390/768px (AT-53, 2026-09-26). Client profile Cancel confirmation, clean Escape/backdrop, and New Job Cancel/backdrop behavior are also covered; client edit focus restoration passes. PBC clarification and edit/reassignment modals have titled accessible dialogs and guard their close, backdrop and Cancel controls. AT-26 verifies simulated-compose Cancel/backdrop dismissal and AT-14 verifies Internal Note Cancel/backdrop dismissal, with no persisted draft and focus restored. Jobs & Tasks edit-job Cancel/backdrop dismissal leaves stored title unchanged and returns focus to its opener; edit-task close/backdrop and reassignment backdrop paths close cleanly. Global Search and Scenario Chooser have explicit accessible names and focused Chrome verifies their keyboard/dismissal behavior. Dialog-specific save/cancel/dismissal paths for the rest of the active-modal inventory and criterion sign-off remain open.
- [ ] **VP-003-E02 — Partial implementation/evidence:** The keyed `UnsavedFormGuard` registry and client-context interception are implemented. M365 setup, acquisition inquiry, Client 360 Add Contact, client profile, PBC request create, clarification, edit/reassignment, proposal, invoice, cash-flow, package disclosure, and consolidation output forms have Chrome Stay/Save/Discard cases. Commercial inquiry Chrome verifies Stay preservation, Discard without creation, and Save before moving to an allowed client route. Client-profile Chrome verifies Stay retains the draft, Discard leaves the stored client unchanged, and Save persists before navigation. PBC Chrome verifies Stay/Discard without request creation, clarification publication or request edits; request submit handlers retain validation/error handling and separate guard keys prevent form collisions. The shared unsaved-transition prompt has explicit dialog semantics so stacked editor/confirmation dialogs remain discoverable. The consolidation output journey also verifies Stay/Discard on perimeter and elimination drafts with unchanged saved group state. A dirty M365 setup form covers a direct hash change to a route denied to the administrator: Stay restores the accepted route/hash, while Discard applies authorization and redirects to Overview. M365 setup cross-client search and AT-57 output draft guards are covered. Accounting Workbench adjustment drafts compare against modal-open defaults; Communications, Time Tracking, Receivables, Documents, Workpapers, Review Desk, Release Completion, and Jobs & Tasks each have route/context guard journeys. Full E2E 109/109 (5 static + 104 Chrome), unit 231/231, build/typecheck and lint pass on the current uncommitted worktree. Registry coverage also includes Audit Risks & Programs, Accounting Setup/TB staging, Audit Planning, packages, consolidation perimeter/eliminations/reviews/FX, and billing. Broader role/client/engagement/direct-target matrices and remaining modal families remain open.
- [ ] **VP-003-R03 — Partial requirement/scope reconciliation:** Reuse the keyed `UnsavedFormGuard` for missing form cases; current Chrome cases now include client profile and Client 360 PBC drafts alongside proposal, invoice, cash-flow/disclosure, consolidation output/perimeter/elimination drafts and other active forms. The dirty direct-hash journey confirms Stay restores its previously accepted URL and Discard redirects a denied destination; broader form and role/client/engagement matrices remain open. Do not add another form framework.
#### Original user story and dependencies
**Target modules:** Cross-cutting foundation  
**Prerequisites:** VP-002  
**User story:** As a staff or client user, I want consistent navigation and validated forms, so that I can find and change only the records relevant to my demonstrated role.
#### Full required implementation scope
Create grouped navigation for Practice, Work, Client Services, Economics, Accounting, Audit, Records and Administration. Use the role grant contract from §5, including separate person identity. Add shared list/detail, dialog, validation, empty/error state, unsaved-change guard and scoped breadcrumb patterns. New modules may be tabs rather than new top-level entries. Presenter tools are separate from business navigation.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-003-AC01 | Given a direct link or restored selection outside the current scope, when opened, then a safe unavailable view appears and no restricted record fields/counts are rendered. | OPEN FOR SIGN-OFF; Chrome verifies restored ENG-26002 under the ENG-26001-only grant renders a generic unavailable view without restricted ID/client fields, then explicit selection of ENG-26001 opens Financial Statements (2026-09-25). Broader route/role/grant matrix and criterion sign-off remain open. |
| VP-003-AC02 | Given unsaved form changes, when navigating or switching persona/client, then the user can save, discard or cancel; drafts cannot accidentally save into the new context. | SUBCASES VERIFIED 2026-09-25: M365 setup and Client 360 Add Contact guard route/persona/engagement changes. Save persists before switching, Discard drops the draft, and Stay preserves it. Global-search Stay preserves the source state; Discard switches to cross-client ENG-26002 after dropping the draft. Other form combinations, consolidation context changes and denied/restored target cases remain open. |
| VP-003-AC03 | Keyboard-only users can open, edit, save and cancel dialogs with focus restored to the initiating control. | SUBCASES VERIFIED: client create/edit and New Job keyboard open, Tab containment, Escape cancel, Enter submit and opener focus restoration pass in Chrome (2026-09-25). AT-53 confirms restoration when a programmatic click left focus on body. Each dialog-specific close path and keyboard editing breadth remain open. |
| VP-003-AC04 | Every active route has a label, required capability and at least one role fixture; client routes contain no staff economics, internal notes or presenter exports. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L322).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-004"></a>
### VP-004 — Version fixtures, migrate existing demo state and provide scenario recovery
**Current status:** PARTIAL  
**Milestone:** M0  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-25, current working tree (uncommitted)
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [migrations.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/migrations.ts), [prototypeStore.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/store/prototypeStore.ts).
**Module links:** Cross-cutting; applies to every module.
**Original journey links:** [AT-01](#at-01), [AT-02](#at-02), [AT-22](#at-22), [AT-54](#at-54); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Schema migrations, integrity checks, presenter scenarios, concurrent-save detection, quota/session-only handling and malformed-JSON backup/recovery exist. Migration unit checks exercise each persisted revision 0–21 to current schema 22. The 2026-09-24 recovery journey also verifies exact preservation of a future-schema payload, rejection of ambiguous import without overwriting that payload, and successful validated v22 import. Date and fixture-integrity guards reject impossible dates, reversed periods, broken foreign references, real-person email, and monetary imbalance.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-004-E01 — Verification/evidence pending:** Recovery subcases were revalidated 2026-09-25 on base `0077cc6` plus current working-tree changes. Full suites passed (176/176 unit; 74/74 E2E). Chrome covers corrupt JSON, structurally invalid parseable JSON, future-schema preservation/export, ambiguous import rejection, valid import, storage quota denial, and both declined and confirmed recovery reset; confirmed reset restores the baseline and retains the exact preserved payload. The migration loop builds legacy shapes by editing a current seed, so acceptance against authentic retained historical fixtures and exact fixture-to-version mapping remains open.
- [x] **VP-004-E02 — Verification/evidence pending:** Verify prior payloads and scopes survive every recovery choice and no binary upload payload is silently serialized into metadata; current unit checks cover the binary-payload guard and Chrome verifies future-schema backup preservation. — VERIFIED 2026-09-25: `importStateJSON` is atomic — it rejects ambiguous/future-schema/broken-reference input before any state change, backs up the current payload before commit and reports "Prior payload preserved" on integrity failure (`prototypeStore.ts:4424-4451`); registered library/evidence originals persist metadata + SHA-256 only (`source: 'Local In-Session'`), accepted PBC response bytes persist in browser-local IndexedDB, and generated artifacts persist in IndexedDB with SHA-256 verification (`artifactStore.ts`); README and module guidance distinguish these storage classes. Scenario switching warns through the shared dirty-form guard (extended 2026-09-25 to planning/risks/workbench drafts) and the six presets produce coherent fixtures (`scenarios.ts:22-105`); reset stays presenter-controlled with a recovery-backup notice and there is no automatic background recovery.
- [x] **VP-004-R03 — Requirement/scope reconciliation:** Unit coverage exercises each persisted schema revision 0–21 through pinned current schema 22, including legacy-field shapes and retained IDs/history. Evidence: `npm run test:unit`, 161/161 passing, 2026-09-24.
#### Original user story and dependencies
**Target modules:** Cross-cutting foundation  
**Prerequisites:** VP-002, VP-003  
**User story:** As a presenter, I want coherent synthetic scenarios and safe local-state migration, so that I can demonstrate success, failure and recovery without losing prior local work.
#### Full required implementation scope
Add schema-versioned migrations and named synthetic scenarios: full practice lifecycle; accounting-only engagement; audit with open findings; two-component consolidation; blocked/rework state; empty/new practice. Preserve legacy IDs and historical decisions. Add an explicit presenter scenario chooser, export/import of validated synthetic metadata, reset confirmation and fixed demo date. Include multiple users of the same role and distinct clients/engagements for negative tests.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-004-AC01 | Given a valid old storage payload, when upgraded, then existing workpaper/PBC/release history is retained and unambiguous links are migrated deterministically. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-004-AC02 | Given malformed, future-version or ambiguous state, when loaded/imported, then recovery guidance appears without silent deletion or invented scope; the prior payload can be preserved. | SUBCASES VERIFIED 2026-09-24: malformed and parseable-but-incomplete v22 payloads remain preserved byte-for-byte; future-schema export is exact; ambiguous import is rejected without overwrite; validated v22 import clears recovery state while retaining its backup. Full historical-shape coverage remains open. |
| VP-004-AC03 | Storage denial/quota failure shows session-only mode; a stale second tab cannot silently overwrite a newer revision. | SUBCASES VERIFIED 2026-09-24 by AT-02/AT-54 Chrome conflict and storage-failure journeys; criterion breadth remains open. |
| VP-004-AC04 | Fixture integrity tests reject broken foreign references, incoherent dates, real personal data, uploaded binary payloads and inconsistent monetary control totals. | SUBCASES VERIFIED 2026-09-24: FK, impossible date, reversed accounting period, real email, binary payload and monetary control checks pass in 161/161 unit tests; full fixture inventory sign-off remains open. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L339).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-005"></a>
### VP-005 — Build a real practice dashboard with scoped drill-downs
**Current status:** PARTIAL  
**Milestone:** M1  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-25, AT-13 template lifecycle acceptance run on current uncommitted working tree
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L10) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [DashboardView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/DashboardView.tsx).
**Module links:** [MOD-01](#mod-01) Practice Dashboard.
**Original journey links:** [AT-01](#at-01); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Dashboard counts and drill-downs derive from permitted records. Client, engagement, fiscal-period, assignee and as-of filters, overdue boundaries and Ready to Release list/count reconciliation have recorded checks. Manager/preparer finance visibility is covered.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-005-E01 — Verification/evidence pending:** Dashboard journeys cover broad manager/partner/billing/records/preparer views, narrow group-user/client and billing/engagement grants, and a no-grant manager. Focused VP-005 Chrome run passed 2026-09-25; module-level criterion sign-off remains open.
- [x] **VP-005-E02 — Verification/evidence pending:** All six headline metrics now open lists whose row counts reconcile to their counters, including dedicated Awaiting Review and Client Requests checks. Fixed-date counters and drill-downs reconcile under empty, completed, cancelled, blocked, archived and no-access conditions; client, engagement, period, assignee and as-of filters recalculate the visible metrics/list. Focused VP-005 Chrome run passed 2026-09-25; module-level criterion sign-off remains open.  Chrome covers an empty client grant and a manager with no grants (zero metrics and explicit empty states), a fixed-date overdue fixture (completed/cancelled excluded; blocked job/task retained in counts and drill-downs), and an archived engagement (excluded from active count, ready metric/drill-down, and deadline rows). Full counter/filter combinations and sign-off remain open.
#### Original user story and dependencies
**Target modules:** 01  
**Prerequisites:** VP-003, VP-004  
**User story:** As a manager, partner or staff member, I want an actionable dashboard computed from demo records, so that I can see what needs attention and open the corresponding work.
#### Full required implementation scope
Extend rather than discard existing role homepages. Show my tasks, jobs by state, overdue items, requests awaiting client/review, engagement deadlines, recent activity and recent clients. Managers/partners receive permitted practice-level counts; billing roles receive invoice/receivable summaries. Filter by client, engagement, assignee and period where relevant. Optional financial sections require finance visibility.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-005-AC01 | Given a task/date/status or PBC change, when returning to the dashboard, then its counters and drill-down rows agree with the underlying register. | SUBCASES VERIFIED 2026-09-25: seeded open job, task and PBC reconcile with the overdue count/list; assignee/as-of changes recalculate results; all six metric cards' filtered row totals equal their counters. Full criterion sign-off remains open. |
| VP-005-AC02 | Given a narrow engagement grant, when viewing a count or recent-activity card, then sibling engagements and other clients do not contribute. | SUBCASES VERIFIED 2026-09-25: narrow billing engagement grant shows one permitted engagement and omits ENG-26002 and its sibling job; group-user client grant omits sibling client/job/activity. Full role/grant matrix remains open. |
| VP-005-AC03 | Overdue calculations use the fixed demo as-of date; completed/cancelled work is excluded and empty data shows an honest zero/empty state. | SUBCASES VERIFIED 2026-09-25: no-engagement scope renders six zero metrics and explicit task/job/activity empty states; fixed-date checks exclude completed/cancelled work, retain blocked overdue work, and exclude archived engagement from active/readiness counts. Full criterion sign-off remains open. |
| VP-005-AC04 | All headline metrics open a filtered working list; no placeholder chart or hard-coded success percentage is presented as computed data. | SUBCASES VERIFIED 2026-09-25: all six cards open filtered working lists whose row totals match the displayed counts; dashboard status bars derive from the permitted job records. Full criterion sign-off remains open. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L358).**Evidence update:** Base `0077cc6` plus current uncommitted working-tree changes; fixture: `createInitialState()` plus isolated narrow-grant, overdue, empty, terminal and archived variants; criteria → `tests/e2e/app.test.ts` “VP-005: scopes dashboard records, metrics, attention and activity to the active grant”; full E2E 75/75 on 2026-09-25. Reviewer/date: pending human sign-off.
<a id="vp-006"></a>
### VP-006 — Complete client profile creation, editing and lifecycle
**Current status:** PARTIAL  
**Milestone:** M1  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-25, current working tree (uncommitted)
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L11) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ClientsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ClientsView.tsx), `ClientProfileModal.tsx`, `prototypeStore.ts`, and client profile unit/browser lifecycle checks in `tests/unit/guards.test.ts` and `tests/e2e/app.test.ts`.
**Module links:** [MOD-02](#mod-02) CRM & Client Management.
**Original journey links:** [AT-05](#at-05); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Client creation and editing now cover all contractual profile fields, normalized code uniqueness, similar-name/registration warnings, revision-checked updates, status filters, soft archive/reactivation, stable client IDs and client-scope owner assignment. Store validation rejects invalid contacts and unauthorized owners atomically; suspended/archived clients cannot start new active professional work. The focused store test preserves an established client's engagement, invoice, document and workpaper references through archival. Full verification passes: 182/182 unit and 75/75 E2E, including the AT-05/AT-06 browser path for profile edit, suspension, contact retention, archive and reactivation. Full VP-006 criterion sign-off is still open for case-by-case mapping, but its planned E01/R02 actions are closed.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-006-E01 — Verification/evidence:** Completed profile lifecycle and historical-reference verification. Evidence: `tests/e2e/app.test.ts` AT-05/AT-06 covers edit/suspend/contact/archive/reactivate; `tests/unit/guards.test.ts` preserves engagement, invoice, document and workpaper IDs. Full 182-unit / 75-E2E run passed 2026-09-25.
- [x] **VP-006-R02 — Requirement/scope reconciliation:** Checked original required and optional profile fields against the shared profile form and store validation; implemented missing type, address, website, code/owner selection, lifecycle status, revision checks, duplicate/similar entity handling and soft archive. Reviewed 2026-09-25; criterion sign-off remains in VP-006-E01.
#### Original user story and dependencies
**Target modules:** 02  
**Prerequisites:** VP-003, VP-004  
**User story:** As a relationship owner or authorized manager, I want complete client profiles, so that commercial and professional work uses one consistent client record.
#### Full required implementation scope
Required: client code, legal name, client type, status and owner. Optional: trading name, registration number, jurisdiction, industry, address, phone, email, website, partner/manager assignments and notes. Support prospect, active, suspended and archived states. Separate commercial conversion from professional acceptance. Use soft archival; do not delete clients referenced by engagements, invoices or evidence.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-006-AC01 | Given a valid profile, when saved/edited, then lists, selection controls and existing engagement links reflect the same client ID. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-006-AC02 | Duplicate normalized client code is rejected; similar name/registration presents a review warning rather than silently merging distinct legal entities. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-006-AC03 | An inactive/suspended client cannot receive new active professional work without an explicit permitted action; historical records remain viewable within scope. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-006-AC04 | A stale edit, missing legal name, invalid contact value or unauthorized owner assignment returns a field/action error without partially saving. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L375).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-007"></a>
### VP-007 — Add contacts, relationship groups and bounded custom fields
**Current status:** PARTIAL  
**Milestone:** M1  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-25, current working tree (uncommitted)
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L11) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ClientDetailView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ClientDetailView.tsx).
**Module links:** [MOD-02](#mod-02) CRM & Client Management.
**Original journey links:** [AT-05](#at-05); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Multiple contacts, primary-contact selection, responsibility/effective dates, bounded custom values and non-authorizing relationship groups are demonstrated. Contact date ranges reject invalid calendar dates and end-before-start. Inactive-primary and invalid choice/date checks, preserved disabled-field values and unchanged grants are recorded.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-007-I01 — Implemented and exercised:** Client contacts store responsibility plus optional effective-from/to dates; the store rejects invalid calendar dates and reversed ranges. AT-05/AT-06 Chrome journey and store regression pass; revisioned contact edits and inactivation/reactivation were added and verified 2026-09-25 under E02.
- [x] **VP-007-E02 — Verification/evidence complete:** AT-05/AT-06 Chrome confirms group membership leaves role grants unchanged, contact creation creates no identity authority, and inactivation/reactivation preserve the contact ID with revisioned before/after snapshots. `npm run lint`, 182/182 unit tests, production build and focused Chrome journey passed 2026-09-25. Full VP-007 criterion sign-off remains open for criterion-by-criterion mapping.
#### Original user story and dependencies
**Target modules:** 02  
**Prerequisites:** VP-006  
**User story:** As a relationship owner, I want multiple contacts and structured client details, so that I can record responsibilities without confusing a contact with an authorized portal user.
#### Full required implementation scope
Contacts need full name and related client; email, phone, job title, primary flag and effective dates are optional unless a selected action requires them. Support client-contact relationships and explicit responsibility tags. Add non-authorizing relationship groups for related entities and a small custom-field editor supporting text, date, number and choice. Keep application user/grant IDs separate from contact IDs.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-007-AC01 | Given several contacts, when one is made primary, then the previous primary is cleared within that client and an inactive contact cannot be chosen. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-007-AC02 | Linking clients into a relationship group does not grant access to their siblings or create a consolidation group. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-007-AC03 | Creating a contact does not create a portal login, management authority or staff role; a separate access request is required. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-007-AC04 | Custom values validate against type/choices; disabling a used field preserves historical values and no arbitrary script/formula field is supported. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L392).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-008"></a>
### VP-008 — Complete the centralized client workspace
**Current status:** PARTIAL  
**Milestone:** M1  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-25, current working tree (uncommitted)
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L11) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ClientDetailView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ClientDetailView.tsx).
**Module links:** [MOD-02](#mod-02) CRM & Client Management, [MOD-17](#mod-17) Search & Centralized Client View.
**Original journey links:** [AT-05](#at-05), [AT-06](#at-06); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Twelve Client 360 tabs share client context across contacts, engagements, jobs, documents, requests, communications, finance, accounting, audit and activity. Basic cross-link and tab-context journeys exist.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-008-E01 — Partial verification evidence:** AT-05/AT-06 and VP-008-E01 Chrome visit all 12 tabs under CL-001 and CL-002, open exact ENG-26001/ENG-26002 child rows, preserve Client Portfolio filters across browser back, and restore client/engagement context across back/forward. An ENG-26001-only manager grant now also verifies all 12 tabs omit ENG-26003 and a sibling-only PBC sentinel; the portfolio count and Open Work shortcut honor that grant. The CL-002 workspace creates a job, PBC request, internal note and Draft invoice with ENG-26002 context; each appears in Client 360 and/or its shared module register. Other tab actions, additional engagement-scope combinations, and full criterion sign-off remain open.
- [x] **VP-008-R02 — Requirement/scope reconciliation:** Client 360 is a read-through projection over canonical shared records (`ClientDetailView.tsx`); no client-local persisted copy was found. Chrome journeys verify the shared client-linked records. — RECONCILED 2026-09-25.
#### Original user story and dependencies
**Target modules:** 02, 17  
**Prerequisites:** VP-006, VP-007  
**User story:** As an authorized team member, I want one connected client workspace, so that I can navigate the complete client lifecycle without repeated searches.
#### Full required implementation scope
Create tabs/panels for Overview, Contacts, Engagements, Jobs, Documents, Requests, Communications, Time/Budgets, Billing, Accounting, Audit and Activity. Implement scope-filtered selectors over shared data; populate tabs as later stories land. Preserve selected client/engagement and list filters in navigation. Avoid duplicating records inside the client page.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-008-AC01 | Given a client, when opening each authorized tab, then all records belong to that client and narrower engagement restrictions are applied. | SUBCASES VERIFIED 2026-09-25: all 12 tabs were opened under CL-001 and CL-002; each view retained the selected client and omitted the other client's engagement references. Under the ENG-26001-only grant, the portfolio count and Open Work shortcut include only ENG-26001, and all 12 Client 360 tabs omit ENG-26003 and a sibling-only PBC sentinel. Other grant and projection combinations remain open. |
| VP-008-AC02 | Creating a job, request, note or invoice from a tab preselects valid context; saving makes it visible both here and in its module register. | SUBCASES VERIFIED 2026-09-25: New Job from CL-002 creates CL-002/ENG-26002 and appears in Jobs and Client 360 Jobs. A PBC request persists under ENG-26002 and is found in the Client 360 request register. Compose Email / Note carries ENG-26002; AT-27 records a CL-002 internal note visible in Communications, Client 360 and the job view, absent from the client portal. Billing Desk from Client 360 creates a Draft invoice for CL-002/ENG-26002 with the Northstar billing snapshot, visible in Billing and Client 360. All four named record types have tested context and projection; broader engagement-scope combinations and formal criterion sign-off remain open. |
| VP-008-AC03 | Unauthorized tabs, totals, search snippets and recent items are omitted rather than masked after fetching/rendering a broader projection. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-008-AC04 | Back/forward, deep links and page reload restore context safely; an empty tab explains the next allowed manual action. | SUBCASE VERIFIED 2026-09-25: back/forward restored the selected client and exact engagement; returning to the portfolio restored its search and status filters. Deep-link/reload and empty-tab cases remain open. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L409).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-009"></a>
### VP-009 — Finish the leads and opportunities pipeline
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M1  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-25, current working tree (uncommitted)
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L12) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [LeadsPipelineView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/LeadsPipelineView.tsx).
**Module links:** [MOD-03](#mod-03) Leads & Opportunities.
**Original journey links:** [AT-07](#at-07); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Inquiry creation/editing, qualification, Won-to-Prospect conversion, existing-client linking, Lost/Unqualified reasons, requalification, stage history, idempotency and currency-separated pipeline totals have recorded coverage.
#### Pending work
No new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 03  
**Prerequisites:** VP-006, VP-007  
**User story:** As a relationship owner, I want editable inquiries and opportunities with outcomes, so that I can track commercial progress before engagement acceptance.
#### Full required implementation scope
Extend acquisition with inquiry source, owner, contact, requested services, expected fee/currency, target dates, next action and discovery notes. Support qualification, opportunity stages, won/lost with reason, and manual conversion/linking to an existing prospect/client. Add list view alongside the existing pipeline; no automated lead capture, reminders or marketing integrations.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-009-AC01 | Given an inquiry, when qualified and converted, then a linked opportunity/client record is created once and its original history remains visible. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-009-AC02 | Lost/unqualified outcomes require a reason and disappear from open pipeline totals without deleting the record. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-009-AC03 | An opportunity can link to an existing permitted client without creating a duplicate; prospect conversion never sets professional acceptance or engagement activation. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-009-AC04 | Fee totals are currency-separated and based on current open records; invalid fees, dates and cross-client proposal links are rejected. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L426).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-010"></a>
### VP-010 — Build reusable services and complete proposal drafting
**Current status:** PARTIAL  
**Milestone:** M1  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-25, current working tree (uncommitted)
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L13) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ProposalsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ProposalsView.tsx).
**Module links:** [MOD-04](#mod-04) Proposals & Engagements.
**Original journey links:** [AT-07](#at-07), [AT-08](#at-08); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Reusable service definitions and proposal templates can be authored with revision history; template defaults copy into editable proposals. Proposals now support client/opportunity, multiple service lines, scope controls, dated reporting ranges, fee models, quantity/rate/fees, supported currencies and terms. VP-010-E01 covers default-copy independence, catalogue/template revisions, multi-line arithmetic and the printable preview entry point; store unit checks reject invalid or reversed proposal and service-line date ranges.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-010-E01 — Partial:** Chrome verifies reusable service/template authoring, default-copy independence, multi-line quantity/rate arithmetic and the branded print-preview entry point; unit checks reject reversed proposal and service-line date ranges. Print output layout and every original story field still need explicit criterion evidence.
- [ ] **VP-010-E02 — Verification/evidence pending:** Run edit/return/revise/redisplay cases to prove previously presented content and currency arithmetic remain unchanged.
- [x] **VP-010-R03 — Requirement/scope reconciliation:** Reconciled the story scope against the service-catalogue and reusable-template editors; both are implemented and covered by VP-010-E01. No extra feature added. — DONE 2026-09-25.
#### Original user story and dependencies
**Target modules:** 04  
**Prerequisites:** VP-009  
**User story:** As a relationship owner, I want a full proposal editor and reusable service definitions, so that I can clearly describe the work and fees offered to a client.
#### Full required implementation scope
Add service catalogue editing for only supported services and reusable proposal content templates. Proposal fields include client/opportunity, service lines, scope, exclusions, deliverables, client responsibilities, dependencies, period, fee model, quantity/rate/fee, currency and terms. Provide branded on-screen/print preview. Editing presented/reviewed content creates a new proposal revision rather than overwriting it.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-010-AC01 | Given selected services/template, when drafting, then defaults copy once and remain editable without modifying the source template. | SUBCASES VERIFIED 2026-09-25: VP-010-E01 Chrome edits service/template revisions, applies defaults and changes the proposal independently; full criterion sign-off remains open pending print-layout and wider field evidence |
| VP-010-AC02 | Line totals and overall fee reconcile; missing scope/deliverables/currency and invalid period or negative quantities block submission. | SUBCASES VERIFIED 2026-09-25: Chrome VP-010-E01 reconciles multi-line quantity/rate totals; unit guards reject reversed proposal and service-line date ranges; full invalid-input matrix and criterion sign-off remain open |
| VP-010-AC03 | Editing a submitted/approved/presented proposal invalidates applicability of prior commercial review and retains the earlier preview/revision. | SUBCASES VERIFIED 2026-09-25: unit and supplemental AT-58 browser journey create and edit a new revision, return it with rationale, amend, independently reapprove, re-present, and confirm the earlier presented QAR snapshot and preview remain unchanged while the new USD snapshot has the revised scope, fee and terms; broader actor/currency/rework matrix and story sign-off remain open |
| VP-010-AC04 | The catalogue and previews contain no tax/payroll, AI, recurring-work, payment-gateway or signature-provider options. | SUBCASE VERIFIED 2026-09-25: AT-04 target-facing scope scan passes; explicit preview-content scan and criterion sign-off remain open |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L443).
**Next evidence update:** Tested base `0077cc6` plus uncommitted working tree; fixture: seeded demo state plus browser-authored VP-010 service/template; criterion → run: AC01/AC02 → VP-010-E01 Chrome + period-guard unit checks; AC03 → VP-010 lifecycle unit revision + AT-58 Chrome return/revise/redisplay snapshot comparison; AC04 → AT-04 scope scan; reviewer/date: pending human sign-off / 2026-09-25. Print artifact layout review and wider actor/currency/rework cases remain open.
<a id="vp-011"></a>
### VP-011 — Record proposal review, presentation and manual client acceptance
**Current status:** PARTIAL  
**Milestone:** M1  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-25, current working tree (uncommitted)
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L13) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ProposalsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ProposalsView.tsx), [ClientPortalView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ClientPortalView.tsx).
**Module links:** [MOD-04](#mod-04) Proposals & Engagements.
**Original journey links:** [AT-08](#at-08), [AT-09](#at-09); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Independent commercial review, presentation and evidence-backed accept/decline/withdraw responses bind to a presented revision. Client acceptance does not automatically create or professionally approve an engagement.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-011-E01 — Verification/evidence pending:** Complete stale-dialog, withdrawn/revised response, return-reason and invalid-evidence matrices across each permitted actor. Unit coverage now verifies blank return-reason rejection, retained rationale, response-type/method/date/evidence/contact rejection, duplicate-response rejection and withdrawn-response lineage after revision. AT-56 covers a staff-recorded withdrawal. The full actor and stale-dialog matrix remains open.
- [ ] **VP-011-E02 — Partial evidence:** Staff and client-portal response forms capture response type, active contact, date, Email/Meeting/Letter method, notes and document/communication reference. Unit checks cover all response types and methods and reject unsupported values, inactive/cross-client contacts, invalid dates, missing evidence, superseded proposals and mismatched presented revisions. AT-09 records client-portal Meeting, AT-52 records client-portal Letter, and AT-56 records a staff-entered dated Withdrawal with actor/contact/revision and evidence visible. Broader document/communication resource linkage and complete actor matrix remain open.
#### Original user story and dependencies
**Target modules:** 04  
**Prerequisites:** VP-010  
**User story:** As a manager and relationship owner, I want separate proposal review and evidence-backed response recording, so that commercial agreement is traceable without eSignatures.
#### Full required implementation scope
Reuse independent commercial review. Reviewer approves or returns with reasons. A human marks presentation or invokes the basic mail simulation later. Record response type, date, contact, method, notes and document/communication evidence reference. Accepted/declined/withdrawn responses bind to the presented revision. A scan or external correspondence may be referenced; no signature is captured or verified by this application.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-011-AC01 | Given a submitted proposal, when its preparer attempts commercial approval under another role, then the same-person action is denied. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-011-AC02 | Given an approved presented revision, when a response is recorded, then actor, contact, date, method and exact revision are retained and a required evidence reference can be supplied. | SUBCASES VERIFIED 2026-09-25: response records retain actor, actor role, active contact identity, date, method, evidence and exact presented revision; AT-09/AT-52 verify client-portal Meeting and Letter; AT-56 verifies staff-recorded Withdrawal with Letter and correspondence reference; unit rejects unsupported response types/methods, inactive or cross-client contacts, bad dates, missing evidence and stale revisions. Complete actor/response/resource matrix remains open |
| VP-011-AC03 | Accepted commercial terms do not automatically approve the client, activate an engagement, instantiate jobs or create an invoice. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-011-AC04 | A response to a superseded/unpresented revision is rejected or recorded only as historical correspondence, never as acceptance of the current revision. | SUBCASE VERIFIED 2026-09-25: store rejects responses for a superseded proposal and when presentedSnapshot revision differs from proposal revision; correspondence-only recording and all historical actor paths remain open |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L460).
**Next evidence update:** Current uncommitted worktree; AC01 → RR20 same-person review denial; AC02 → AT-09/AT-52/AT-56 plus VP-011 response guard unit matrix for actor/revision/type/method/contact/date/evidence; AC03 → AT-09/AT-56 no auto-engagement; AC04 → store stale/superseded response checks and withdrawal lineage across a new revision. Human sign-off and complete actor/resource matrix remain open / 2026-09-25.
<a id="vp-012"></a>
### VP-012 — Complete engagement creation and lifecycle handoff
**Current status:** PARTIAL  
**Milestone:** M1  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-25, current working tree (uncommitted)
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L13) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [EngagementsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/EngagementsView.tsx).
**Module links:** [MOD-04](#mod-04) Proposals & Engagements.
**Original journey links:** [AT-09](#at-09), [AT-10](#at-10); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Accepted-proposal drafts, separate partner activation, team edits and service/year/period/date changes are represented. Reasoned suspend/resume/cancel/close operations retain history and block professional work in inactive states while allowing permitted finance/archive actions.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-012-E01 — Complete verification evidence:** `updateEngagement` and unit coverage verify service/year/period changes stale statements, reconciliations and reviewed cash-flow schedules; supersede active audit plans; require performed-procedure reassessment; and invalidate release approvals/candidates. Team/manager/partner changes supersede active plan review and require procedure reassessment. Chrome AT-12 now shows the exact scope/period and team impacts before save, then verifies stale Statements, superseded plan history, the reassessment badge, and invalidated release approval after save. The accepted proposal fee/currency remain unchanged; the original AC04 requires scope/period/team edits and contains no engagement fee-edit criterion. Acceptance-owner sign-off remains pending.
- [ ] **VP-012-E02 — Partial evidence:** Chrome independently seeds its own fixture and verifies suspend/resume/cancel history survives reload; linked release, workpaper, request, job, document, invoice, archive and package IDs remain unchanged through those transitions. Complete lifecycle cross-view behavior for all terminal states and full criterion sign-off remain open.
- [x] **VP-012-R03 — Requirement/scope reconciliation:** Confirmed lifecycle transitions remain explicit, reasoned manager/partner actions; no automatic task generation or future-period workflow exists or was added. — RECONCILED 2026-09-25.
#### Original user story and dependencies
**Target modules:** 04  
**Prerequisites:** VP-008, VP-011  
**User story:** As a manager, I want engagements linked to accepted commercial scope and professional decisions, so that teams work within a clear client, service, period and responsibility boundary.
#### Full required implementation scope
Complete engagement records with client, service, period, partner/manager, team assignments, agreed fee, proposal revision and separate professional acceptance. Permit draft engagements while prerequisites are pending; explicit activation checks prerequisites. Add change/revision, suspension, cancellation and close views. Link jobs, PBC, accounting/audit work, budgets and billing without copying their data. Existing acceptance remains until VP-047 extends it.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-012-AC01 | Creating from an accepted proposal prepopulates a draft once; repeat submission does not create duplicate engagements. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-012-AC02 | Activation requires the current permitted professional decision and required commercial scope, but does not fabricate missing evidence or mark Microsoft connectivity as live. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-012-AC03 | Suspension blocks new professional actions as defined by the demo policy while allowing historical view and permitted billing/records operations. | SUBCASES VERIFIED 2026-09-25: unit checks block new professional work while retaining permitted billing/records access and terminal immutability; Chrome verifies suspend/resume/cancel history after reload and confirms engagement-linked historical records remain. Closed state and the full cross-view matrix remain open. |
| VP-012-AC04 | Scope/period/team edits validate grants and preserve change history; relevant professional changes show affected review applicability, not silent inherited approvals. | Evidence complete — unit + AT-12 Chrome verify scope/team access guards, history, pre-save impact explanations, stale statements/reconciliations/cash-flow, superseded plan, reassessment-required procedure, cleared release approval, and unchanged accepted fee/currency snapshot. Acceptance-owner sign-off pending. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L477).
**Next evidence update:** Tested base `0077cc6` plus current uncommitted worktree; fixture: deterministic seeded ENG-26001 with reviewed statement, reconciliation, cash-flow, audit plan, performed procedure and release approval; criterion → run: AC04 → `tests/e2e/app.test.ts::VP-012: suspends and resumes an engagement with reasoned persisted history` and `tests/unit/guards.test.ts` scope/team invalidation checks; `npm run lint`, 185/185 unit, production build, full E2E 79/79 and `git diff --check` pass on 2026-09-25; acceptance-owner sign-off pending.
<a id="vp-013"></a>
### VP-013 — Add the simple job register and job detail workspace
**Current status:** PARTIAL  
**Milestone:** M2  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-26, tested source baseline `ffcf34c0000c9cc18bc9dc2c8d1fff87b6ca060f` (application unchanged from `e6a6edb`)
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L14) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [JobsTasksView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/JobsTasksView.tsx).
**Module links:** [MOD-05](#mod-05) Jobs & Tasks.
**Original journey links:** [AT-10](#at-10); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Jobs have scoped filters, create/edit/status history, explicit ownership/dates, blocked reasons, linked files/time and reasoned terminal cancellation. Recorded checks retain linked work and reconcile filtered views.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-013-E01 — Verification/evidence:** Completed locally on 2026-09-25 against base `0077cc6` plus the current working-tree changes. The complete unit suite passed 176/176 and E2E passed 74/74; AT-11 covers premature completion rejection, successful completion after required-task completion, no approval/release/invoice side effects, cancellation/read-only history, empty jobs and edit/status transitions at command and UI levels. This closes the planned evidence action, not the full story criterion sign-off.
- [x] **VP-013-R02 — Requirement/scope reconciliation:** Reconciled 2026-09-25. Cancelled jobs remain terminal and read-only; status changes between applicable non-terminal states are manual. No cancelled-job reopen feature is required.
#### Original user story and dependencies
**Target modules:** 05  
**Prerequisites:** VP-008, VP-012  
**User story:** As a manager, I want jobs within engagements, so that I can organize delivery without a complex project-management tool.
#### Full required implementation scope
Required: title, client, engagement and owner. Optional: description, start/due dates and budget reference. Add list filters for client, engagement, owner, status and overdue; detail tabs for tasks, notes, files and time. Permit manual create/edit/status change and safe cancellation. Keep jobs as containers for tasks, not a second professional engagement or workflow engine.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-013-AC01 | Given an engagement, when a job is created, then its scope is fixed to that client/engagement and it appears in both job and client/engagement views. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-013-AC02 | Status changes are manual; Blocked requires a reason and changing an assignee does not automatically start or complete work. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-013-AC03 | Completing a job requires all required non-cancelled tasks to be complete; it does not approve audit evidence, issue an invoice or release a package. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-013-AC04 | Cancellation retains tasks/time/document history; referenced jobs cannot be hard-deleted and no recurrence/dependency/automation setting exists. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L496).**Acceptance evidence:** Implementation commit `83f060a`; historical checks ran 2026-09-24 (159/159 unit; 68/68 E2E). Additional local closeout ran 2026-09-25 on base `0077cc6` plus uncommitted working-tree changes: 174/174 unit and 74/74 E2E. AT-11 covers command/UI completion guards, successful completion after all required tasks finish, no approval/release/invoice side effects, cancellation retention/read-only behavior, empty-job display and manual job edits/status transitions. Criterion rows above remain OPEN FOR SIGN-OFF pending exact criterion-level evidence mapping and separate reviewer sign-off.
<a id="vp-014"></a>
### VP-014 — Implement tasks and exactly one level of subtasks
**Current status:** VERIFIED (automated acceptance)
**Milestone:** M2  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.** Automated acceptance passed across all four criteria on 2026-09-24.
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L14) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [JobsTasksView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/JobsTasksView.tsx).
**Module links:** [MOD-05](#mod-05) Jobs & Tasks.
**Original journey links:** [AT-11](#at-11), [AT-12](#at-12); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Tasks support one-level subtasks, hierarchy/cycle/cross-job guards, scoped assignees, parent-completion blocking, qualified-person reassignment, detail/history edits, reasoned cancel/reopen, non-cancelled leaf progress, blocked reasons, sibling order persistence, staff-only task-linked notes and versioned library-document references with reasoned unlink history.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-014-I01 — Implemented and exercised:** Staff-only notes and registered same-engagement document references are linked to individual tasks; task file unlinking requires a reason and preserves actor/time history. Evidence: AT-14 Chrome and task-file unit regression, 159/159 unit + 68/68 E2E checks, 2026-09-24. All VP-014 criteria are now verified; see E02 evidence below.
- [x] **VP-014-E02 — Verification complete:** AT-11 Chrome and unit regressions cover non-cancelled leaf progress, cross-client assignee rejection, empty-work rendering, reasoned cancel/reopen, and ownership/order/status persistence after reload. Evidence: 159/159 unit + 68/68 E2E, 2026-09-24.
- [x] **VP-014-R03 — Reconciled:** The contract defines one-level subtasks and manual statuses; no dependency, recurrence or automation engine is needed.
#### Original user story and dependencies
**Target modules:** 05  
**Prerequisites:** VP-013  
**User story:** As a manager or assigned staff member, I want editable tasks and subtasks with clear ownership, so that I can track concrete work independently of professional sign-off.
#### Full required implementation scope
Task fields: title, job ID, optional description/assignee/due date, manual status and ordering. A subtask references a top-level task in the same job. Allow create, edit, assign, reorder, block, complete, reopen and cancel. Demonstrate reassignment between two qualified synthetic people, rather than a role selector that cannot change. Explicitly distinguish general work tasks from reviewer/partner authority.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-014-AC01 | Given a task, when a subtask is added, then a second nesting level, cycle, cross-job parent or cross-client assignee is rejected. | VERIFIED: unit/Chrome checks reject second-level nesting, self/cross-job cycles, and out-of-scope assignees. |
| VP-014-AC02 | Completing a parent with unfinished required children is blocked; completing a child does not automatically complete its parent/job. | VERIFIED: parent completion is blocked until children finish; child completion leaves parent/job status unchanged. |
| VP-014-AC03 | Reassignment records old/new person and reason; assigning a preparer to a general task never grants reviewer authority. | VERIFIED: reassignment retains old/new person and reason; assignment does not grant approval authority. |
| VP-014-AC04 | Progress counts non-cancelled leaf tasks once; empty work is shown as not started/no tasks, and reload preserves order, ownership and statuses. | VERIFIED: progress counts active leaf work, empty work is explicit, and ownership/order/status survive reload. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L513).**Acceptance evidence:** Implementation commit `83f060a` plus acceptance-test updates in the current change; `npm run test:unit` (159/159) and `npm run test:e2e` (68/68), run 2026-09-24. Automated acceptance only; no separate reviewer sign-off recorded.
<a id="vp-015"></a>
### VP-015 — Implement job-template authoring and manual instantiation
**Current status:** PARTIAL  
**Milestone:** M2  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L15) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [JobTemplatesView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/JobTemplatesView.tsx).
**Module links:** [MOD-06](#mod-06) Job Templates.
**Original journey links:** [AT-13](#at-13); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Job-template authoring, Draft/Published/Retired states, immutable revisions, manual application and source-revision pins exist. Repeated submission with the same operation ID creates one fresh tree; old templates/jobs remain unchanged.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-015-E01 — Complete verification evidence:** Full `AT-13` Chrome journey now cancels without creating a job, deliberately selects start/delivery dates and owner, creates fresh task IDs assigned to the selected owner (role suggestions do not auto-allocate), proves revised/retired template history leaves existing jobs unchanged, and double-submits with one operation ID to create exactly one job. Unit checks reject empty/untitled phases and blank subtasks, invalid/reversed dates, and conflicting operation-ID reuse. Criterion sign-off by the acceptance owner remains pending.
- [x] **VP-015-R02 — Reconciled:** Role suggestions are visibly illustrative and never become assignees automatically; instantiation requires a deliberate owner and dates. Template application cancellation is a no-op; retirement blocks new use while preserving existing jobs. No recurrence, relative-date engine, automatic allocation, or follow-up generation is required or implemented. There is no residual editor/cancellation implementation gap; story-level owner sign-off remains a separate acceptance gate.
#### Original user story and dependencies
**Target modules:** 06  
**Prerequisites:** VP-014  
**User story:** As a manager, I want versioned job templates containing tasks and subtasks, so that I can reuse an agreed work structure without recurring jobs or automation.
#### Full required implementation scope
Add template list/editor/preview with name, supported service, description, default job title, ordered tasks and one-level subtasks. Optional role suggestions are not real assignees. Publish immutable revisions; revise/retire without deleting used versions. “Create job from template” asks for client/engagement, title, manually selected dates and assignees. Clear status, history, evidence, approvals and time on copied structures.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-015-AC01 | Given a published template, when applied explicitly, then one new job tree with fresh IDs and source-template revision is created atomically. | Evidence complete — AT-13 verifies fresh job/task IDs, exact template revision, and one created job; owner sign-off pending |
| VP-015-AC02 | Changing/retiring the template later does not change existing jobs; draft/retired versions are not offered for new use. | Evidence complete — AT-13 verifies prior template/job snapshots and retired-template blocking; owner sign-off pending |
| VP-015-AC03 | Dates and people require deliberate selection; no recurrence interval, relative-date rule engine, automatic allocation or follow-up creation is added. | Evidence complete — AT-13 selects both dates and owner; task assignees follow selected owner, not role suggestions; owner sign-off pending |
| VP-015-AC04 | Duplicate click protection prevents accidental duplicate job creation; templates enforce the same one-level hierarchy and required-title rules as jobs. | Evidence complete — AT-13 double-submit plus unit checks for conflicting operation IDs and required phase/subtask titles; owner sign-off pending |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L530).
**Next evidence update:** Tested base `0077cc6` plus current uncommitted working tree; fixture: seeded demo `TPL-JOB-01/02` plus browser-authored AT-13 template; criterion → test/run: AC01/AC02/AC03 → `tests/e2e/app.test.ts::AT-13`; AC04 and structural/date negatives → `tests/unit/guards.test.ts` job-template lifecycle; current run `npm run lint`, 185/185 unit, build, full E2E 79/79 and `git diff --check` pass on 2026-09-25; acceptance owner sign-off pending.
<a id="vp-016"></a>
### VP-016 — Add contextual internal notes, comments and basic mentions
**Current status:** PARTIAL  
**Milestone:** M2  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L16) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [JobsTasksView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/JobsTasksView.tsx), [CommunicationsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/CommunicationsView.tsx).
**Module links:** [MOD-07](#mod-07) Team Collaboration.
**Original journey links:** [AT-14](#at-14); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Authored internal job notes, eligible mentions, editing attribution and manual inbound notes are demonstrated. Client/out-of-scope mention targets and unauthorized edits are rejected in recorded checks.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-016-I01 — Implemented and exercised:** Recipient-specific local notices are browsable only to the intended active identity within currently accessible jobs; opening the job and marking a notice read are available. Manager/partner moderation requires a reason, blocks self-moderation and duplicate transitions, and retains hide/restore history. Evidence: AT-14 Chrome and internal-collaboration store regression, 161/161 unit + 69/69 E2E checks, 2026-09-24. Oversized/unsafe input, activity links and complete client exclusion remain open under E02.
- [x] **VP-016-E02 — Verification/evidence complete:** AT-14 Chrome covers empty and >5,000-character rejection, inert unsafe markup, reload persistence in job subject activity, client and engagement activity notes, and client exclusion of note text/counts, attachment references and mention notices. Store tests deny client mention recipients and prove editing a client-scoped note leaves separate review/approval records unchanged; AT-03 confirms no external request. Full rerun: 192/192 unit, 83/83 E2E, lint, diff check; 2026-09-25. Human criterion sign-off remains separate.
- [x] **VP-016-R03 — Requirement/scope reconciled:** The accepted behavior is scoped in-app notices only; AT-14 proves recipient-only local notices and AT-03 confirms the browser makes no external requests. Email delivery, a full chat application and external collaboration integrations remain excluded.
#### Original user story and dependencies
**Target modules:** 07  
**Prerequisites:** VP-008, VP-014  
**User story:** As a team member, I want comments and internal notes on clients, engagements, jobs and tasks, so that collaboration stays attached to the work it concerns.
#### Full required implementation scope
Add a reusable thread panel with author, time, text, subject reference and explicit visibility. Support simple mentions selected from already authorized people; mentions create local in-app notices only. Keep review-point threads and PBC conversations as distinct business records that can be linked. Add edit history or an explicit edited marker for ordinary notes; approved professional history is not editable here.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-016-AC01 | Given an internal note, when switching to a client persona, then its text, count, attachments and mention notice are absent. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-016-AC02 | Mention suggestions include only users eligible to view the subject; mentioning someone neither grants access nor sends email. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-016-AC03 | Only permitted authors/moderators can amend ordinary comments and the change is attributable; historical approval/review records cannot be rewritten through the notes panel. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-016-AC04 | Comments survive reload and are linked from the subject activity view; empty/oversized input and unsafe markup are handled without executing content. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L547).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-017"></a>
### VP-017 — Create the simplified Microsoft 365 setup wizard
**Current status:** PARTIAL  
**Milestone:** M3  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L27) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [M365SetupView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/M365SetupView.tsx).
**Module links:** [MOD-18](#mod-18) Microsoft 365 Integration.
**Original journey links:** [AT-03](#at-03), [AT-15](#at-15), [AT-16](#at-16); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
M365 setup saves synthetic tenant/site/library/root selections and permitted-person/initial-role mappings separately from grants. Optional email and optional disabled-by-default OneDrive plus named service-test outcomes are demonstrated.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-017-E01 — Bounded verification/evidence action complete (2026-09-26):** Current AT-15 covers Start/Skip, Back/Continue, Cancel rollback, permission-aware review/save, reload, invalid HTTP site rejection without replacing saved config, mismatched synthetic tenant → missing-resource → explicit retry, and changed-root → stale checks/access denied → recovery while `liveConnected=false`. RR35 atomically rejects blank/overlength tenant ID/domain and library, credentialed/query URLs, invalid roots, malformed mailboxes, missing/duplicate/inactive identities and unknown roles; VP-017 unit outcome coverage exercises all six simulated results across identity/SharePoint/mail/OneDrive, verifies capability isolation and `liveConnected=false`, and prevents optional-service failures from downgrading required readiness. Latest complete run: 231/231 unit; production build; serialized E2E 109/109 (5 static + 104 Chrome), including AT-15/16 and AT-21; lint/diff checks pass. This closes the bounded E01 action, not any full VP-017 criterion or external-provider acceptance. See verification entries 82 and 84.
- [x] **VP-017-E02 — Complete evidence action (2026-09-26):** AT-15/AT-16 verifies fixture jobs are usable before setup, after skipping setup, and after SharePoint denial plus optional mail unavailability. The full current serialized Chrome run re-exercises the scenario and AT-03 observes no external HTTP calls. This closes the bounded E02 action only; VP-017-AC04's broader optional-service/provider matrix and VP-022 cases remain open.
- [x] **VP-017-R03 — Requirement/scope reconciliation:** Initial M365 person/role mappings remain local identity configuration; AT-15 reads back that saving one does not create or change any authorization grant.
#### Original user story and dependencies
**Target modules:** 18  
**Prerequisites:** VP-003, VP-004  
**User story:** As a system administrator, I want a guided Microsoft-only setup simulation, so that I can understand onboarding without Purview or unnecessary integrations.
#### Full required implementation scope
Steps: start demonstration connection; choose synthetic tenant; select permitted people; select SharePoint site/library/root; choose optional mail sender; optionally enable bounded OneDrive access; inspect permission summary; run local scenario tests; review/save. Configuration stores synthetic IDs, resource selections and revision only. Show selected-resource intent, not tenant-wide access assumptions. No client secret, certificate upload, password, token field or real consent page.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-017-AC01 | Given a new installation scenario, when the wizard is completed, then a resumable local configuration is saved as “Simulated configuration”, with `liveConnected=false`. | SUBCASE VERIFIED: AT-15 exercises Start/Skip, Back/Continue, Cancel without persistence, permission-aware review/save and reload with `liveConnected=false`; broader invalid tenant/resource/person and outage cases remain open |
| VP-017-AC02 | No wizard interaction performs external fetch/XHR, navigates to Microsoft sign-in, requests credentials, or provisions a tenant resource. | SUBCASE VERIFIED 2026-09-24: AT-15/AT-16 Chrome journey finds no password fields or Microsoft sign-in links, confirms `liveConnected: false`, and observes no external HTTP requests. Provisioning and full criterion review remain open. |
| VP-017-AC03 | An unavailable site, wrong-tenant library, denied permission and cancelled setup each have a clear recovery/back path without saving a successful test. | SUBCASE VERIFIED: invalid non-HTTPS site is rejected without replacing saved state; mismatched synthetic tenant with unchanged site/library/root records missing-resource and recovers; a separate root-only edit stales prior results, records access-denied, then recovers; setup Cancel discards an unsaved draft and returns to Start. Unavailable-site and broader wrong-tenant combinations remain open |
| VP-017-AC04 | Mail and OneDrive are optional; Purview and all excluded providers are absent; business modules remain usable with demo fixture data when setup is skipped. | SUBCASE VERIFIED: Chrome AT-15/AT-16 reaches fixture Jobs & Tasks when setup is skipped and after denied SharePoint/unavailable mail; AT-21 verifies OneDrive is disabled by default and enabling it leaves SharePoint canonical. Excluded-provider and broader optional-service matrix remain open. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L566).
**Next evidence update:** Current uncommitted worktree; fixture: deterministic `createInitialState()` tenant and active personas. AT-15/AT-16 covers explicit Start/Skip, Back/Continue, cancel rollback, review/save, wrong-tenant missing-resource recovery and no external requests; AT-21 covers OneDrive optionality. Latest validation: lint/build, 197/197 unit, focused M365 Chrome 2/2 and full outcome-matrix unit test, full E2E 83/83, `git diff --check`; 2026-09-25. Broader invalid tenant/resource/person, outage and excluded-provider cases remain open.
<a id="vp-018"></a>
### VP-018 — Represent Microsoft sign-in and user lifecycle honestly
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M3  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L28) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AdministrationView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AdministrationView.tsx), [guards.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/guards.ts).
**Module links:** [MOD-19](#mod-19) Identity & Access Management.
**Original journey links:** [AT-01](#at-01), [AT-17](#at-17); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Local synthetic identity creation, disable/reactivate history, disabled-route restrictions and simulated invitation acceptance, expiry, renewal and revocation are covered. Immutable identity context is distinct from grants.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 19  
**Prerequisites:** VP-017  
**User story:** As an administrator and demo user, I want identity and user-management screens, so that I can validate the intended access lifecycle without mistaking personas for real authentication.
#### Full required implementation scope
Add a clearly labelled sign-in simulation/landing screen and a synthetic directory picker. Support adding a local demo identity, activating/disabling it, reviewing pending invitations and recording revocation. Use immutable person/object/tenant identifiers separate from names/emails. Retain all existing role experiences and create additional fictional staff for reassignment tests. External client identities are explicit fixture identities, not inferred from email domain.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-018-AC01 | Given a selected fixture identity, when entering the demo, then the header identifies it as a simulated identity and assigned role/scope, never a live authenticated session. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-018-AC02 | Adding a directory contact without a grant leaves business access unassigned; matching email/domain alone never grants a client or staff role. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-018-AC03 | Disabling a person prevents subsequent local business commands and direct-route access while retaining history and a recovery path for the presenter. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-018-AC04 | Pending/expired/revoked invitation scenarios are inspectable; no real invitation message, user account or directory mutation is created. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L583).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-019"></a>
### VP-019 — Add editable application-role grants and scope administration
**Current status:** PARTIAL  
**Milestone:** M3  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L28) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AdministrationView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AdministrationView.tsx), [guards.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/guards.ts).
**Module links:** [MOD-19](#mod-19) Identity & Access Management, [MOD-39](#mod-39) Administration.
**Original journey links:** [AT-12](#at-12), [AT-17](#at-17), [AT-18](#at-18), [AT-24](#at-24); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Person-keyed grants, approved-request references, effective/expiry windows and attributable grant/revocation history exist. Scheduled scope is not active early; self-grants and invalid windows are blocked.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-019-E01 — Partial implementation and evidence; action remains open:** `grantAccess` now requires a separate reference, distinct from the access-request reference, for professional roles and the management-approver (`client`) role, and retains it through grant/revocation history. New Group grants bind to a configured consolidation group; unit and Chrome evidence confirms the named group report is available while client and engagement lists remain unchanged, and ungranted sibling details stay hidden. Exact current subcases: `tests/unit/guards.test.ts` access grant history; `tests/e2e/app.test.ts` AT-17/AT-18. Compatible-role changes and the wider approval/scope combination matrix remain untested.
- [x] **VP-019-E02 — Verification/evidence subcases complete:** Focused local Chrome run on 2026-09-25 exercises a second-tab Global-grant revocation and expiry while Search and Report Centre are open, and confirms stale dialogs, navigation, filters, metrics, export controls and rows disappear. Existing client-form stale-save, grant-history and client create/list scope checks remain covered. `AT-02/AT-54` passes. VP-019 as a story and criterion sign-off remain open; other role, group and command/projection combinations are untested.
- [x] **VP-019-R03 — Requirement/scope reconciliation:** Relationship-group membership leaves access grants unchanged; a system administrator cannot grant access to their own person, sees no billing/receivables panel, and is redirected from direct financial-statement navigation. Unit and focused AT-17/AT-18 Chrome checks pass, 2026-09-25.
#### Original user story and dependencies
**Target modules:** 19, 39  
**Prerequisites:** VP-018  
**User story:** As a system administrator acting on an approved request, I want explicit role and scope management, so that the prototype demonstrates least-privilege access and separation of duties.
#### Full required implementation scope
Add user detail tabs for role grants, client/engagement/group assignments and access history. Grant fields include person, role, scope kind/ID, effective dates, approved-request reference and reason. Require separate approval evidence for management-approver or professional duties. Keep compatible role combinations explicit; a role change cannot change historical person identity. Group-reporting scope does not automatically expose every member client's other work.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-019-AC01 | Given an engagement-only grant, when navigating/searching/exporting, then only that engagement is visible and sibling engagements remain excluded. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-019-AC02 | Grant/revoke changes take effect on the next command and refresh projections; stale dialogs must revalidate scope before saving. | OPEN FOR SIGN-OFF; 2026-09-25 focused Chrome verifies revoke and expiry remove open search/report controls, filters, metrics, exports and rows; stale client-form and command guard subcases remain in the 2026-09-24 ledger. Other command/projection combinations remain untested |
| VP-019-AC03 | Technical administrators cannot self-promote into professional approval through their own access request or use admin status to inspect client financial data. | SUBCASES VERIFIED 2026-09-25: grantAccess rejects self-grant to the administrator's own person; administrator dashboard omits Billing & Receivables and direct Financial Statements hash navigation returns to the permitted Overview route. Full criterion sign-off remains open. |
| VP-019-AC04 | The privilege matrix reflects grants and conditions accurately; grants/expiry/revocation preserve an attributable local change history. | OPEN FOR SIGN-OFF; subcases verify distinct request/approval evidence, effective date, group-vs-engagement scope separation and retained grant/revocation evidence references; complete role/condition matrix remains open |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L600).**Evidence update:** `51de04c98d74302589634f27c69b9d0137c16e83` covers the cross-tab revocation/stale-dialog subcase; see the Section 10.2 ledger and `verification.md`. Expiry-specific and remaining AC01/AC03/AC04 evidence remains open.
<a id="vp-020"></a>
### VP-020 — Build the SharePoint-first document browser and client folders
**Current status:** PARTIAL  
**Milestone:** M3  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L19) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [DocumentsLibraryView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/DocumentsLibraryView.tsx).
**Module links:** [MOD-10](#mod-10) Document Management, [MOD-18](#mod-18) Microsoft 365 Integration.
**Original journey links:** [AT-03](#at-03), [AT-19](#at-19), [AT-22](#at-22); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
The SharePoint-first library, stable references, canonical folder preparation, file metadata, related-record navigation and explicit simulation labels exist. Real selected-file metadata survives reload without falsely promising unavailable original bytes.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-020-E01 — Partial verification evidence:** AT-19 now verifies preparation is denied with no current SharePoint binding, then prepares the selected client/engagement under the configured synthetic root and confirms repeat use across M365 and Documents does not duplicate its eight folders. Store regression rejects an inactive client and a mismatched client/engagement. Complete all permitted-scope, duplicate/rename combinations and obtain criterion sign-off.
- [x] **VP-020-E02 — Verification/evidence complete:** AT-20 opens DOC-002 directly from the independent library list, then follows its stable PBC-02, JOB-2602 and WP-A1 links. Each destination resolves the same record IDs and the job/workpaper projections retain DOC-002. Lint, 197/197 unit and full E2E 83/83; 2026-09-25. Broader VP-020 criteria remain partial.
- [x] **VP-020-R03 — Requirement/scope reconciled:** The application stores synthetic local folder metadata only. Real SharePoint transfers/provisioning and remote permission callbacks are excluded; workspace feedback explicitly states no remote provisioning occurs. They are not pending implementation.
#### Original user story and dependencies
**Target modules:** 10, 18  
**Prerequisites:** VP-008, VP-017, VP-019  
**User story:** As an authorized staff member, I want a client/engagement document library backed by synthetic SharePoint references, so that I can locate and organize files separately from PBC requests.
#### Full required implementation scope
Add folder/file list, breadcrumbs, search/filter, metadata panel, related-record links and a simulated “Open in Microsoft 365” preview. Required reference: logical document ID, tenant/site/drive/item IDs, client scope and classification. Support preparing/linking a client workspace and engagement subfolders from a human command; accepted-client workspace preparation is idempotent. Folder rename changes display metadata, not stable linkage. Use only local fixtures and in-session selected files.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-020-AC01 | Given an accepted client and approved synthetic binding, when preparing its workspace twice, then one client root and one set of required folders exist locally. | SUBCASE VERIFIED 2026-09-25: AT-19 blocks preparation before current SharePoint success and confirms one configured-root client workspace after preparation from M365 and Documents. Unit check confirms inactive-client rejection. Full scope matrix and sign-off remain open. |
| VP-020-AC02 | Client/engagement folder selection is validated against the configured tenant/root; another client cannot be linked merely by changing a URL or display name. | SUBCASE VERIFIED 2026-09-25: generated paths are rooted at the saved synthetic `folderRoot`; explicit foreign engagement is rejected in unit coverage. Broader URL/display-name tamper matrix and sign-off remain open. |
| VP-020-AC03 | A document is viewable through the library independently of a PBC request; its related job/request/workpaper links resolve to the same logical record. | SUBCASE VERIFIED 2026-09-25: AT-20 opens DOC-002 from the library independently and follows its PBC-02, JOB-2602 and WP-A1 links; destination records and job/workpaper projections retain the same IDs. Acceptance-owner sign-off remains open. |
| VP-020-AC04 | Upload/download/open controls state whether they use a built-in fixture, in-session bytes, metadata only or a simulated Office view; they never claim a real SharePoint transfer. | VERIFIED 2026-09-25 — AT-20 covers absent download bytes, local metadata registration without upload, replacement file bytes not uploaded, and Open in M365 metadata-only preview; AT-21 verifies OneDrive is a sample-metadata fixture with no connection/file import; AT-22 verifies reload leaves only metadata/digest and no original bytes. Full E2E 83/83; acceptance-owner sign-off remains separate. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L617).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-021"></a>
### VP-021 — Add document versions, existing-file linking and optional OneDrive selection
**Current status:** PARTIAL  
**Milestone:** M3  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L19) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [DocumentsLibraryView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/DocumentsLibraryView.tsx), [EvidenceCatalogueView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/EvidenceCatalogueView.tsx).
**Module links:** [MOD-10](#mod-10) Document Management, [MOD-18](#mod-18) Microsoft 365 Integration.
**Original journey links:** [AT-03](#at-03), [AT-20](#at-20), [AT-21](#at-21), [AT-22](#at-22); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Version replacement preserves old evidence pins; local rename/move keeps IDs; unavailable references are blocked and restorable. Optional OneDrive import is gated. Recorded journeys cover re-assessment and independent re-clearance of affected procedure/workpaper evidence.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-021-E01 — Partial verification evidence:** AT-20 verifies exact evidence-version pin retention, replacement freshness/reassessment for linked procedure and workpaper, and independent re-clearance. VP-021 Chrome verifies rename/move stable IDs and unavailable/restore behavior; store tests reject outside-root and foreign-client moves and block adequacy/linking while unavailable. AC01–04 subcases have evidence; full role/record-type matrix and owner sign-off remain open.
- [x] **VP-021-E02 — Verification/evidence complete:** Storage classes are documented and exercised separately: library and OneDrive rows are metadata-only; selected/replacement file bytes stay in-session while metadata/digest persist; accepted PBC response bytes are durable in browser-local IndexedDB and verified across reload; generated XLSX/DOCX/PDF bytes are persisted in artifact IndexedDB and SHA-256 checked. AT-20/21/22, AT-23/24 and AT-41/42/48; full E2E 83/83.
- [x] **VP-021-R03 — Requirement/scope reconciled:** Real remote moves, provider permission callbacks and remote file transfer are outside this local simulation and are not pending implementation.
#### Original user story and dependencies
**Target modules:** 10, 18  
**Prerequisites:** VP-020  
**User story:** As a staff member, I want version-aware file linking and bounded OneDrive access, so that evidence can be reused without creating competing document repositories.
#### Full required implementation scope
Provide link-existing-SharePoint-file, version history, replacement, classification/visibility and broken-reference views. Evidence references pin an exact version; a current-file link is visually distinct. Optional OneDrive for Business selection lists only synthetic permitted files. “Import to engagement library” copies local metadata under a new canonical SharePoint fixture identity and preserves OneDrive provenance; do not silently grant broader file access.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-021-AC01 | Given a linked evidence version, when a newer file version is added, then the old reference still identifies its original version and dependent review shows an explicit freshness state. | SUBCASES VERIFIED 2026-09-25: AT-20 retains EVD-01 at DOC-002 v1 while adding v2, flags linked procedure/workpaper for reassessment and requires independent re-clearance against the new evidence. Owner sign-off remains. |
| VP-021-AC02 | Renaming/moving a permitted file keeps stable IDs; a deleted/inaccessible/wrong-root version shows a broken-link state rather than displaying unrelated content. | SUBCASES VERIFIED 2026-09-25: VP-021 Chrome preserves IDs on rename/move and disables Open while unavailable; restore re-enables the same ID. Unit checks reject outside-root/foreign-client moves and deny evidence adequacy/linking while unavailable. Broader role matrix and owner sign-off remain. |
| VP-021-AC03 | OneDrive remains optional and disabled by default; linking/importing never changes the canonical archive repository away from SharePoint. | VERIFIED SUBCASE 2026-09-25: AT-21 proves disabled-by-default gating, explicit enablement, current success requirement, fixture-only sample metadata, and unchanged SharePoint site/root. Owner sign-off remains. |
| VP-021-AC04 | After reload, original user-selected bytes are unavailable unless reselected; the system cannot substitute a synthetic sample and label it as the original download. | VERIFIED SUBCASE 2026-09-25: AT-22 reloads selected-file metadata/digest and explains original bytes are unavailable; no library download control is offered. AT-20 makes the same boundary explicit for replacement previews. Owner sign-off remains. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L634).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-022"></a>
### VP-022 — Complete Microsoft configuration failure, reconnect and disconnect journeys
**Current status:** PARTIAL  
**Milestone:** M3  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L27) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [M365SetupView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/M365SetupView.tsx).
**Module links:** [MOD-18](#mod-18) Microsoft 365 Integration.
**Original journey links:** [AT-03](#at-03), [AT-16](#at-16); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Separate saved verification outcomes, configuration revisions, resource summaries, named failures, explicit local retries and disconnect/reconnect state are represented. Optional service failures remain separate from SharePoint/local work.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-022-E01 — Verification/evidence complete:** Expanded AT-15/AT-16 covers all six simulated outcomes, changed tenant/site/root/sender invalidating prior results, explicit manual recovery, setup cancellation and reload; current worktree full E2E 83/83, 2026-09-25.
- [x] **VP-022-E02 — Verification/evidence complete:** AT-15 verifies successful disconnect history, preserved clients/documents/folders, stale provider-dependent workspace action disabled until manual re-verification, and no live connection or external egress; full E2E 83/83, 2026-09-25. VP-022 story criteria remain open for separate sign-off.
#### Original user story and dependencies
**Target modules:** 18  
**Prerequisites:** VP-017, VP-020, VP-021  
**User story:** As a system administrator, I want clear connection-state and recovery simulations, so that users understand what requires attention without extra integration machinery.
#### Full required implementation scope
Add independent configuration cards for identity, SharePoint, mail and optional OneDrive. Show local configuration revision, selected resource summary, last simulated test and readable error. Offer explicit test, edit, reconnect simulation and disconnect. Test outcomes come from named local fixtures: access denied, missing resource, expired session, throttled, unavailable and success. A configuration change stales prior test results.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-022-AC01 | Given a changed site/root/sender, when saved, then the corresponding previous verification cannot remain current for the new configuration revision. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-022-AC02 | Simulating disconnect preserves metadata/history and marks provider-dependent actions as simulated unavailable; it does not delete clients or archive records. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-022-AC03 | Failure explanations offer an explicit local retry/back action; no background polling, automatic remediation or real provider call occurs. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-022-AC04 | No success/error banner describes simulated state as production readiness; Purview is not a hidden blocker or optional configuration requirement. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L651).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-023"></a>
### VP-023 — Complete PBC request creation, editing and ownership
**Current status:** PARTIAL  
**Milestone:** M4  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L18) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ClientDetailView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ClientDetailView.tsx), [ClientPortalView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ClientPortalView.tsx).
**Module links:** [MOD-09](#mod-09) Client Requests / PBC.
**Original journey links:** [AT-23](#at-23); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
PBC draft/presentation, assigned recipient, shared portal request, clarification and response history are demonstrated. Source coverage records an exercised end-to-end core loop.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-023-E01 — Verification/evidence complete:** AT-23 Chrome edits title/due date and recipient with reasoned thread history, cancels after three received file revisions and two acceptance records, verifies bytes/history remain and the cancelled request is excluded from awaiting-response items; full unit 199/199, focused Chrome AT-23/24 1/1, 2026-09-25. VP-023-AC03 story sign-off remains open.
- [x] **VP-023-E02 — Bounded verification complete (2026-09-26):** Store rejects cross-client, inactive/unregistered and contextless recipients atomically; create/edit selectors contain only active contacts assigned to the engagement client. AT-23/24 plus `pbcRequestFilters` unit matrix cover all seven statuses, text, due-date buckets anchored to scenario date, recipient, combined filters and clear/reset; the outstanding count remains consistent with the filtered actionable set. Cancellation/reassignment preserve response bytes, acceptance and reason history, and failed creation does not partially mutate state. Full current unit 242/242; E2E has a separate intermittent VP-003-E01 focus failure (109/110, focused rerun 1/1); no automatic reminders, delivery or uploader self-acceptance added. VP-023 story/criterion acceptance remains open.
- [ ] **VP-023-R03 — Requirement/scope reconciliation:** Implement a missing request lifecycle control only where the original criteria require it; no automatic reminders or acceptance.
#### Original user story and dependencies
**Target modules:** 09  
**Prerequisites:** VP-012, VP-020  
**User story:** As a preparer or manager, I want complete client information/document requests, so that the correct client contact can respond in the correct engagement context.
#### Full required implementation scope
Extend the existing request workflow with title, description, category, engagement/period, due date, recipient, client owner, optional job/task reference and required-document description. Support draft, manual presentation, controlled editing, cancellation and request filters. Recipients must be active contacts/identities explicitly assigned to the client. Link email preview and portal record without duplicating the request.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-023-AC01 | Given a draft request, when manually presented, then the same request appears in the permitted client portal with description, due date, owner and status. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-023-AC02 | Reassignment or due-date changes are manual and recorded; a recipient from another client/unauthorized engagement is rejected. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-023-AC03 | Cancelling preserves prior submissions and communication history and removes the request from awaiting-response counts without deleting evidence. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-023-AC04 | No reminder schedule, recurring request, automatic task creation or implicit acceptance is added; missing title/recipient/context blocks presentation. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L670).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-024"></a>
### VP-024 — Finish PBC submission, clarification and evidence acceptance
**Current status:** PARTIAL  
**Milestone:** M4  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L18) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ClientPortalView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ClientPortalView.tsx), [prototypeStore.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/store/prototypeStore.ts).
**Module links:** [MOD-09](#mod-09) Client Requests / PBC.
**Original journey links:** [AT-23](#at-23), [AT-24](#at-24); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Client responses retain versions and digests, client-visible threads and independent accepted actor/time/version. Clarification/replacement and preservation of both uploaded revisions have recorded coverage; accepted submissions cannot be overwritten in place.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-024-E01 — Verified (2026-09-24):** PBC upload validation rejects empty, over-10-MB, unsupported-extension and mismatched-MIME files before bytes or metadata are persisted; `uploadPbcResponse` enforces the same policy at the store boundary. AT-23/24 injects IndexedDB quota failure and confirms no response metadata is created. RR34 blocks uploader self-acceptance. The complete run passed 71/71 browser journeys and 168/168 unit checks.
- [x] **VP-024-E02 — Complete (2026-09-26):** AT-23/24 accepts a submission, requests a reasoned replacement, saves and independently accepts the next revision, reloads, and verifies all original bytes/digests plus the document supersession chain. Unit regression verifies the newly registered evidence remains pending verification, linked cleared procedure is reopened, dependent submitted workpaper requires changes, and prior acceptance remains in history until the new submission is separately accepted. Lint/build, 226/226 unit, focused AT-23/24 Chrome 1/1; no external upload.
- [x] **VP-024-R03 — Requirement/scope reconciliation:** PBC response bytes are stored and re-hashed in browser-local IndexedDB; the shared document catalogue retains scoped metadata references, and neither path claims server-side or SharePoint persistence. AT-23/24 verifies exact bytes after reload.
#### Original user story and dependencies
**Target modules:** 09  
**Prerequisites:** VP-021, VP-023  
**User story:** As a client contributor and independent reviewer, I want a complete response/replacement/review loop, so that received information becomes accepted evidence only after a separate decision.
#### Full required implementation scope
Reuse the existing shared request thread. Add multiple document references, text response, submission version, uploader/time and reviewer disposition. Support received, under-review, accepted and needs-clarification; reviewers can identify the exact missing item. A replacement creates a new submission revision and preserves the previous one. Documents link into the shared library/evidence catalogue rather than request-only copies.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-024-AC01 | Given a permitted contributor, when submitting/replacing evidence, then staff see that exact submission as received, not accepted, and the client sees only client-visible comments. | VERIFIED — AT-23/24 checks Received before independent acceptance, client-scoped visibility and clarified replacement versions. |
| VP-024-AC02 | An uploader/responder cannot accept their own submission by switching role labels; a different authorized person must review it. | VERIFIED — RR34 denies same-person uploader acceptance; AT-23/24 accepts only from the separate manager identity. |
| VP-024-AC03 | Replacing previously accepted evidence preserves the old decision and marks current adequacy/dependent review as requiring a new assessment. | VERIFIED — AT-23/24 verifies retained acceptance and revision lineage; unit regression verifies replacement evidence is Pending verification, a linked Cleared procedure is reopened for reassessment, and a dependent Submitted workpaper moves to Changes required. New response still requires independent acceptance. |
| VP-024-AC04 | Empty/oversized/disallowed files and storage failure show accurate errors; uploaded metadata is never represented as durable original document storage. | VERIFIED — AT-23/24 covers empty, >10 MB, unsupported extension, MIME mismatch and IndexedDB quota failure; upload UI describes browser-local original bytes, not remote storage. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L687).
**Next evidence update:** Base commit `c5509784cdc8c3240db9105961be43755a0c6cc0`; deterministic ENG-26001 / PBC-TEST-07 fixture; AC03 and E02 → `tests/unit/pbcRequestLifecycle.test.ts` post-acceptance replacement regression plus `tests/e2e/app.test.ts::AT-23/AT-24` document lineage/reload checks; lint/build, 226/226 unit, full serial E2E 99/99, 2026-09-26. Reviewer/date: **pending human sign-off**; VP-024 story remains Partial.
<a id="vp-025"></a>
### VP-025 — Unify the client portal across all agreed client functions
**Current status:** PARTIAL  
**Milestone:** M4  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L17) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ClientPortalView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ClientPortalView.tsx).
**Module links:** [MOD-08](#mod-08) Client Portal.
**Original journey links:** [AT-14](#at-14), [AT-23](#at-23), [AT-25](#at-25); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
A recent acceptance increment adds recorded multi-entity portal switching and genuine invoice PDF download checks. CL-001/CL-003 lists re-scope, explicitly shared documents remain visible, internal workpapers stay hidden and no Pay action appears.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-025-E01 — Partial verification evidence:** AT-18 now verifies CL-001/CL-003 entity switching and client_admin → client-northstar → client_admin identity changes while remaining in the portal; the rendered entity follows the active persona's permitted grants. Existing checks cover shared-document and issued-invoice re-scoping, internal workpaper exclusion, no Pay action and a genuine invoice PDF artifact. Every list, badge, search result, action and nomination/acknowledgement boundary across more engagement/persona combinations remains open.
- [x] **VP-025-I02 — Implemented and exercised:** Client document sharing can be explicitly enabled or withdrawn with a required reason; each transition persists actor, identity, timestamp, from/to state and reason, and the client portal projection reads the current visibility. Verified by store regression and VP-021 Chrome history journey on 2026-09-24. Multi-entity withdrawn-sharing acceptance remains open under E03.
- [x] **VP-025-E03 — Verification/evidence complete:** A focused portal Chrome journey covers the unpresented-package/pending-review state and a no-grant persona's safe unavailable view; VP-021 withdraws DOC-002 sharing with a required reason and verifies the client portal omits that file before sharing is restored; AT-41 separately verifies a package acknowledgement and management representation receipt without either record standing in for the other. Full E2E 90/90 and unit 199/199, 2026-09-25.
#### Original user story and dependencies
**Target modules:** 08  
**Prerequisites:** VP-019, VP-023, VP-024  
**User story:** As a client administrator, contributor or management approver, I want one coherent portal, so that I can manage requests and permitted information without seeing internal firm work.
#### Full required implementation scope
Provide client home, engagement summaries, requests, shared documents, messages, published financial packages, acknowledgement history and issued invoices. Support explicit entity/engagement selection for a client identity assigned to more than one scope. Keep role distinctions: nominate contacts versus supply evidence versus management decisions. Add visible empty, pending-review, no-access and withdrawn-sharing states.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-025-AC01 | Given multiple authorized entities, when switching context, then every list, badge, search result and action uses the selected permitted scope. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-025-AC02 | Only explicitly shared documents/packages and client-visible messages appear; draft invoices, internal review points, risk registers and firm costs are absent. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-025-AC03 | Client nomination does not grant staff access or management-approval authority; contributor upload cannot issue or approve a report. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-025-AC04 | Invoices can be viewed/downloaded as demo artifacts without a Pay button or payment gateway; package acknowledgement is labelled separately from account approval and signatures. | SUBCASES VERIFIED 2026-09-25: issued invoices download as genuine client-copy PDFs without Pay actions; AT-41 records an Acknowledged package decision while `approvals.client` remains unset, then records the separate management representation receipt while preserving package-decision history. Full portal role/action matrix and criterion sign-off remain open. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L704).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-026"></a>
### VP-026 — Implement basic outgoing Microsoft email and templates
**Current status:** PARTIAL  
**Milestone:** M4  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L20) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [CommunicationsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/CommunicationsView.tsx).
**Module links:** [MOD-11](#mod-11) Communications, [MOD-18](#mod-18) Microsoft 365 Integration.
**Original journey links:** [AT-03](#at-03), [AT-26](#at-26); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Basic local email templates resolve placeholders, restrict recipients to active client contacts and record accepted/failed/unknown outcomes with unique simulation references. The UI explicitly states there is no real send or provider receipt.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-026-E01 — Verification/evidence pending:** Verify unavailable sender, unresolved placeholders, cross-client document links, template-editor permissions and duplicate-click behavior.
- [x] **VP-026-R02 — Requirement/scope reconciliation:** A submission token identifies one open composer operation: repeat submissions of that operation are idempotent, while closing and reopening creates a distinct deliberate manual attempt. Unknown outcomes are never automatically retried. Store regression and focused AT-26 Chrome evidence pass, 2026-09-25.
- [x] **VP-026-R03 — Requirement/scope reconciliation:** Reconciled against VP-026 AC01/03/04 and the agreed exclusions: email attempts are local simulations, unknown outcomes are not retried, and mailbox sync, provider receipts/polling and integrations are excluded. No integration work remains pending. — DONE 2026-09-25.
#### Original user story and dependencies
**Target modules:** 11, 18  
**Prerequisites:** VP-007, VP-017, VP-023  
**User story:** As a staff member, I want a basic email composer and reusable templates, so that I can illustrate client communications without building an inbox product.
#### Full required implementation scope
Composer fields: configured synthetic sender, To, optional CC, subject, body, client/engagement context and permitted document links. Add bounded template CRUD with explicit placeholders such as client name, request title and due date. Preview resolved content before a manual “Simulate send”. Record local attempts and outcome; replies are not synchronized. Link the same message into client/request communication history.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-026-AC01 | Given a valid message, when simulating send, then the outcome is explicitly local; no Graph call, SMTP, Resend, hidden fetch or real mailbox action occurs. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-026-AC02 | Invalid recipients, unresolved placeholders, cross-client file links or an unavailable sender block the action with an actionable error. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-026-AC03 | Known failed, simulated accepted and unknown-outcome scenarios are distinct; a repeated click does not create duplicate accepted attempts and an unknown outcome is not silently resent. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-026-AC04 | Templates are editable only by permitted users; no inbox, sync, Triage, auto-reminder, AI-drafting or signature/payment link feature is present. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L721).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-027"></a>
### VP-027 — Add a complete communication register and manual incoming notes
**Current status:** PARTIAL  
**Milestone:** M4  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L16) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [CommunicationsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/CommunicationsView.tsx).
**Module links:** [MOD-07](#mod-07) Team Collaboration, [MOD-11](#mod-11) Communications.
**Original journey links:** [AT-27](#at-27); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
A shared communication register includes manually recorded incoming email/call/meeting context, authorship, direction and visibility. Manually logged calls and meetings can link to a same-client job, and the client timeline and job view project that same record. Recorded Chrome checks show internal meeting notes do not appear to clients.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-027-I01 — Implemented and exercised:** Manual communications can link to a validated same-client/same-engagement job; client timeline, global register and linked job view project the same stored record. Evidence: AT-27 Chrome and unit job-scope regression, 159/159 unit + 68/68 E2E checks, 2026-09-24. Remaining date/text/visibility correction checks stay under E02.
- [ ] **VP-027-E02 — Partial verification evidence:** Incoming note authoring now defaults the date to the active scenario date and presents bounded controls (summary 240, participants 500, notes 5,000 characters); the store rejects impossible/future dates and oversized inbound text atomically. Focused unit and AT-27 Chrome verify these limits, deterministic date persistence, correction reason/actor/history and retained prior revision. Managers/partners receive a client-publication confirmation; cancellation preserves Internal visibility, unauthorized publication/correction is denied, and Chrome confirms the authorized Northstar message appears only in its matching client portal. Same-scope document links are enforced; internal/unavailable documents block publication and do not appear in client communication or portal search, while shared documents remain visible. Broader actor/context, request/document-link and correction rework combinations remain open.
- [x] **VP-027-R03 — Requirement/scope reconciliation:** Reconciled against VP-027 AC02/04: incoming correspondence is manually recorded, no synchronization is implied, and no scheduled follow-up or automatic outbound communication is in scope. — DONE 2026-09-25.
#### Original user story and dependencies
**Target modules:** 07, 11  
**Prerequisites:** VP-008, VP-016, VP-026  
**User story:** As a team member, I want a client communication history across basic channels, so that important conversations are discoverable without syncing external services.
#### Full required implementation scope
Record incoming email, phone call, meeting or other external-conversation note manually with date/time, direction, participants, summary, author, client/engagement, optional job/request/document link and explicit visibility. Include locally composed email attempts from VP-026 in the same timeline. Channel names are labels, not integrations. Add filters and detail views; default internal notes to internal visibility.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-027-AC01 | Given a manually recorded call/email, when opening the client timeline or register, then both show the same record and source links. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-027-AC02 | Incoming correspondence does not appear by itself; the UI says “Recorded manually” and never suggests mailbox synchronization. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-027-AC03 | Changing visibility requires permission and warns before client publication; restricted internal material cannot be exposed through linked attachments or search snippets. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-027-AC04 | Corrections retain attributable history; record dates and bounded text validate, and no scheduled follow-up or automatic outbound message is created. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L738).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-028"></a>
### VP-028 — Complete time entry, review and correction workflows
**Current status:** PARTIAL  
**Milestone:** M5  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L21) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [TimeTrackingView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/TimeTrackingView.tsx).
**Module links:** [MOD-12](#mod-12) Time Tracking.
**Original journey links:** [AT-28](#at-28); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Recorded UI/unit journeys cover time entry, submit, return, resubmit, independent approval and superseding corrections. Original approved rates/history are retained. Current effective entries now drive timesheet and job totals, budgets, WIP/reporting, client approved-time totals and invoice-source eligibility; superseded correction history stays visible without double-counting.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-028-E01 — Partial verification evidence:** Store guards reject impossible/future dates, non-positive duration, task IDs outside the selected job, and task-only links without a job. The shared `getEffectiveTimeEntries` selector excludes superseded revisions from timesheet, job, budget, WIP/reporting, client approved-time and invoice-source totals while preserving history. AT-28 asserts the corrected 60-minute approved revision is counted once in effective and approved totals; unit checks verify WIP correction valuation. Other scope/date combinations, linked task/job end-to-end matrix and criterion sign-off remain open.
- [x] **VP-028-E02 — Complete evidence action:** AT-28 issues a QAR 600 invoice from approved `TIME-01`, verifies the correction notice names the issued invoice and separate billing decision, corrects and approves the time revision, confirms the prior invoice snapshot is unchanged and the invoice link persists on the revision, and confirms the corrected source is absent from the next invoice-source picker. Unit regression independently verifies the store guard and invoice immutability. Focused AT-28 Chrome test passes, 2026-09-25. VP-028 story-level sign-off and its other open evidence actions remain outstanding.
#### Original user story and dependencies
**Target modules:** 12  
**Prerequisites:** VP-014, VP-019  
**User story:** As a staff member and independent manager, I want accurate time records linked to actual work, so that effort and billable value can be reviewed and reported.
#### Full required implementation scope
Extend existing time screens with work date, client/engagement/job/task, duration minutes, activity, narrative and billable/non-billable classification. Add drafts, edit, submit, return with reason, approve and correction revisions. Support a timesheet/list grouped by week or date with filters; no automatic time capture. A general engagement activity may use an explicit engagement-level entry without inventing a task.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-028-AC01 | Given valid scope and positive duration, when saving/submitting, then local totals and linked work views update from the same effective entry. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-028-AC02 | A manager cannot approve their own entry under another role; returned entries require correction and resubmission. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-028-AC03 | An approved or consumed/billed entry is not overwritten; a correction retains the previous version and exposes its billing impact for a separate decision. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-028-AC04 | Future/out-of-scenario dates, invalid duration, scope mismatch and duplicate submission are handled explicitly; reports distinguish approved from unapproved time. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L757).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-029"></a>
### VP-029 — Implement simple budgets with distinct billing and cost rates
**Current status:** PARTIAL  
**Milestone:** M5  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L22) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [BudgetsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/BudgetsView.tsx).
**Module links:** [MOD-13](#mod-13) Budgets.
**Original journey links:** [AT-29](#at-29); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Budgets are authored/versioned with distinct billing/cost rates and retained earlier lines. Approved time snapshots keep original rates when a later budget changes; duplicate activities/invalid rates are rejected.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-029-E01 — Partial verification evidence:** Unit AT-29 fixed example reconciles 600 planned to 660 approved minutes, +1 hour and +QAR 200 fee variance; the missing-cost test returns unknown. Supplemental AT-59 Chrome covers one row per engagement despite an additional job budget, approved time valuation from pinned rate snapshots, separate QAR/USD output, and v2 history. Engagement/job/unallocated scope and remaining arithmetic/cost combinations remain open.
- [ ] **VP-029-E02 — Partial verification evidence:** AT-29/AT-59 verify manual v1→v2 budget revision, preserved v1 history, unchanged approved-time rate valuation, and unchanged issued invoice records. Full budget change/review/variance and historical attribution matrix remains open.
- [x] **VP-029-R03 — Requirement/scope reconciliation:** No scheduling/capacity automation is required. — DONE 2026-09-25: original VP-029 explicitly says budgets are delivered without a resource-scheduling engine and excludes capacity optimizer, roster, auto-scheduling and recurring budget; no extra feature is in scope.
#### Original user story and dependencies
**Target modules:** 13  
**Prerequisites:** VP-012, VP-028  
**User story:** As a manager, I want versioned engagement/job budgets and actual comparisons, so that I can see effort overruns without a resource-scheduling engine.
#### Full required implementation scope
Add budget editor with scope, currency, planned minutes by role/activity, optional staff allocation and rate reference. Show billing rate and internal cost rate as different fields; rates are versioned and snapshotted. Budget approval/revision is manual. Engagement totals aggregate job budgets once; unallocated engagement lines are separate to prevent double counting. Show planned/actual hours, fees and known costs.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-029-AC01 | Given budget lines and approved time, when viewing comparison, then §5.5 formulas and line rounding yield reconciled totals and visible over/under variance. | SUBCASES VERIFIED 2026-09-25: unit AT-29 fixed 600 planned/660 approved example gives +1.00 hour and +QAR 200; AT-59 shows 8.0 approved hours and QAR 1,900 using saved rates while current budget rates differ. Other line-rounding/variance cases and criterion sign-off remain open |
| VP-029-AC02 | Editing a used rate or approved budget creates a new version without changing historical invoice/time valuations. | SUBCASES VERIFIED 2026-09-25: AT-29/AT-59 create v2 with v1 history; approved time retains its v1 billing rate and QAR 1,900 total, while issued invoices remain unchanged. Full budget and valuation matrix remains open |
| VP-029-AC03 | Missing cost rates show unavailable cost/margin rather than zero; client/billing-only views cannot infer restricted staff costs. | SUBCASES VERIFIED 2026-09-25: unit AT-29 reports missing cost as unknown; AT-59 verifies billing-role UI omits cost rates/totals and cost-rate editor fields. Other staff-scope combinations and full criterion sign-off remain open |
| VP-029-AC04 | Cross-currency totals are separated; job totals are not counted again as independent engagement lines; no capacity optimizer, roster, auto-scheduling or recurring budget is introduced. | SUBCASES VERIFIED 2026-09-25: AT-59 separates QAR/USD values, shows the ENG-26001 engagement once with an additional job budget, and VP-029-R03 reconciles excluded scheduling/capacity features to the original contract. Unallocated engagement-line and full multi-currency combinations remain open |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L774).
**Next evidence update:** Current uncommitted worktree at base `0077cc6`; fixture: seeded 600/660 unit data plus synthetic ENG-26001 QAR, ENG-AT59-USD and additional job-budget browser records; AC01 → calculation unit + AT-59, AC02 → AT-29 + AT-59 + AT-51 invoice immutability, AC03 → missing-cost unit + AT-59 billing-role UI, AC04 → AT-59 and original VP-029-R03 scope reconciliation. Latest full run: lint/build clean, 186/186 unit, 83/83 E2E (5 static + 78 Chrome), legacy syntax and diff checks clean; 2026-09-25. Currency-mismatched time snapshots remain visible as effort but are excluded from fee/cost totals. Reviewer sign-off and remaining combinations remain open.
<a id="vp-030"></a>
### VP-030 — Complete billing accounts and invoice drafting from explicit sources
**Current status:** PARTIAL  
**Milestone:** M5  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L23) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [BillingInvoicingView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/BillingInvoicingView.tsx).
**Module links:** [MOD-14](#mod-14) Billing & Invoicing.
**Original journey links:** [AT-30](#at-30); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Invoices can consume approved billable time at a pinned rate and accepted fixed-fee proposal balance. Time is reserved once; stale/mismatched/nonbillable sources and over-contract fees are rejected.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-030-E01 — Partial verification evidence:** AT-30 verifies approved-time source reservation, client account/contact snapshot, two ad-hoc quantity/rate lines whose extensions reconcile exactly to the invoice total, and re-reservation after deliberate cancellation of an unapproved draft; the store rejects zero quantity. Post-create draft editing and stale-source revision matrix remain open.
- [x] **VP-030-R02 — Requirement/scope reconciliation complete (2026-09-25):** The original VP-030 scope explicitly supports fixed-fee and manually selected approved-time sources, and does not require per-service milestone scheduling. Keep the proposal-level fixed-fee cap; milestone allocation is not an additional feature requirement.
#### Original user story and dependencies
**Target modules:** 14  
**Prerequisites:** VP-011, VP-028, VP-029  
**User story:** As a billing officer, I want detailed invoice drafts linked to agreed services or approved time, so that fees are traceable and cannot be accidentally billed twice.
#### Full required implementation scope
Add billing-account/contact details, invoice dates/due date/currency/reference, service description and multiple quantity/rate lines. Support fixed-fee and manually selected approved time sources, with a separate ad-hoc line option. Link each source-based line to its exact source revision and scope. Provide preview and draft editing. No recurring invoicing, external ledger connector, online payment or new tax engine.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-030-AC01 | Given selected approved time/service sources, when a draft is created, then every line retains its source and calculated amount and the invoice total equals its lines. | SUBCASES VERIFIED 2026-09-25: AT-30 source-backed time line and multi-line ad-hoc quantity/rate extensions reconcile exactly; account/contact and complete invoice-field evidence remains open |
| VP-030-AC02 | Duplicate source selection/consumption is prevented across active billed allocations; rework does not silently free a previously issued source for double billing. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-030-AC03 | Only permitted same-client/currency sources can be combined; invalid quantities, missing billing context and stale time revisions are rejected. | SUBCASE VERIFIED 2026-09-25: store rejects zero-quantity or inconsistent ad-hoc line extensions; broader stale-time and missing billing-context cases remain open |
| VP-030-AC04 | Existing historical tax totals are preserved if present; new fixture invoices use the approved no-tax demo profile rather than inventing tax calculations or rewriting prior totals. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L791).
**Next evidence update:** Current uncommitted worktree at base `0077cc6`; `tests/e2e/app.test.ts` AT-30 verifies invoice account/contact snapshot, explicit approved-time reservation, draft cancellation and re-reservation, and two ad-hoc lines with quantity/rate and exact summed invoice total; `tests/unit/guards.test.ts` rejects zero quantity and cancellation after approval. Lint/build clean; unit 188/188; full E2E 83/83 (5 static + 78 Chrome); `git diff --check` clean; 2026-09-25. Post-create draft editing, stale-source revision, issued correction/rework and full negative matrix remain open; reviewer sign-off pending.
<a id="vp-031"></a>
### VP-031 — Finish invoice review, issue and credit-note workflows
**Current status:** PARTIAL  
**Milestone:** M5  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L23) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [BillingInvoicingView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/BillingInvoicingView.tsx).
**Module links:** [MOD-14](#mod-14) Billing & Invoicing.
**Original journey links:** [AT-25](#at-25), [AT-31](#at-31); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Invoice review/issue and partial credit draft/review/issue are represented with independent actors and immutable issued state. Credits affect outstanding balances without moving money.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-031-E01 — Partial verification evidence:** AT-31 verifies revision 1 approval, reasoned ad-hoc draft revision to revision 2, retention of the prior amount and reviewer, cleared stale approval, fresh independent approval before issue, and credit note linkage to the exact issued invoice without changing its issued amount or moving money. Store checks preserve source-linked lines and reject post-issue edits; additional unit cases reject cross-client and cross-currency credits. AT-31 also verifies the preparer cannot approve their own credit note. Invoice date/reference breadth, edits to source-linked billing drafts, and full criterion sign-off remain open.
- [ ] **VP-031-E01 — Partial verification evidence:** AT-31 verifies revision 1 approval, reasoned ad-hoc draft revision to revision 2, retention of the prior amount and reviewer, cleared stale approval, fresh independent approval before issue, and credit note linkage to the exact issued invoice without changing its issued amount or moving money. Store checks preserve source-linked lines and reject post-issue edits; additional unit cases reject cross-client and cross-currency credits. AT-31 also verifies the preparer cannot approve their own credit note. Invoice date/reference breadth, edits to source-linked billing drafts, and full criterion sign-off remain open.
- [x] **VP-031-E02 — Complete evidence action:** AT-31 downloads the issued invoice from the staff billing register and verifies a genuine `application/pdf` with `%PDF-` signature, exact invoice-number content and `INV-AT31_Document.pdf` filename. Issue creates no receipt, settlement or email attempt, and no external mail/payment request occurs. A partial issued credit retains the exact invoice ID without changing the invoice face amount. Focused AT-31 Chrome passes 1/1, 2026-09-25.
#### Original user story and dependencies
**Target modules:** 14  
**Prerequisites:** VP-030  
**User story:** As a billing officer and independent commercial reviewer, I want controlled invoice issue and corrections, so that commercial records remain traceable without altering client books.
#### Full required implementation scope
Reuse independent review with return reasons and revision-bound approval. Issue an approved invoice as a local immutable demo document. Draft cancellation differs from post-issue correction. Add credit-note draft/review/issue linked to the affected invoice and line where applicable; partial credits are supported. Reuse the output component for genuine demo document downloads. Distinguish invoice issuance from email simulation and settlement.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-031-AC01 | Given a submitted invoice, when reviewed by a different authorized person, then current approval permits one local issue event; later draft edits stale approval. | SUBCASES VERIFIED 2026-09-25: AT-31 denies self-approval, then independent billing review and partner issue; full draft revision invalidation and sign-off remain open |
| VP-031-AC02 | An issued invoice cannot be directly edited/deleted; a correction uses an attributable credit or replacement document with lineage. | SUBCASES VERIFIED 2026-09-25: issued invoices reject draft revision; AT-31 retains the issued invoice amount and verifies an issued, reasoned credit stays linked to that exact invoice; draft cancellation is limited to unapproved invoices. Wider correction and reviewer sign-off remain open |
| VP-031-AC03 | Credits cannot exceed the remaining creditable amount and do not move money; same-person review and cross-client/currency credits are rejected. | SUBCASES VERIFIED 2026-09-25: AT-31 denies creator self-approval, returns/revises/reapproves the current credit revision, issues it against the linked invoice without changing invoice face amount or payment, and unit checks reject over-cap, cross-client and cross-currency credits. Full criterion sign-off remains open |
| VP-031-AC04 | Issuing an invoice does not send it, alter client TB/GL or approve an audit report; issued and email-simulation statuses are displayed separately. | SUBCASES VERIFIED 2026-09-25: AT-31 confirms issue creates no email attempt, receipt, settlement or external request, and invoice remains Issued after credit; TB/GL non-mutation, report approval separation and full sign-off remain open |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L808).
**Next evidence update:** Current uncommitted worktree at base `0077cc6`; `tests/e2e/app.test.ts` AT-31 verifies denied invoice and credit self-approval, invoice revision 1→2 with preserved history and stale approval invalidation, fresh independent reapproval before issue, reasoned credit revision 2, exact invoice linkage and no payment movement. `tests/unit/guards.test.ts` verifies cross-client/currency and credit-cap guards, source-line immutability, historical invoice/reviewer retention, current-revision issue guard and rejection of post-issue edits. Focused and full verification results are recorded in `docs/prototype/verification.md`; owner sign-off and remaining date/reference/source-linked edit and AC04 evidence remain open; 2026-09-25.
<a id="vp-032"></a>
### VP-032 — Implement offline receipt records, allocation and correction
**Current status:** PARTIAL  
**Milestone:** M5  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L24) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ReceivablesView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ReceivablesView.tsx).
**Module links:** [MOD-15](#mod-15) Receivables.
**Original journey links:** [AT-32](#at-32); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Offline receipts support client/date/currency context, split allocations across invoices and reasoned independent reversal. Recorded tests preserve other invoice settlement and prior paid balances.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-032-E01 — Complete evidence action:** Unit and AT-32 cover split allocations across overdue and not-yet-due issued invoices; gross receipt = active allocations + unallocated funds before and after reversal; invoice over-allocation rejects atomically; a stale invoice settlement cache blocks reversal without changing either record; reasonless reversal rejects without mutation; reasoned reversal retains the original allocation, restores exact receipt/invoice balances and is idempotent on repeat; full settlement reverses Paid back to Issued and restores the entire receipt as unallocated. Focused allocation guard 1/1, focused AT-32 Chrome 1/1, full unit 204/204, lint and diff check pass; full E2E 92/92 on the same application/E2E sources. VP-032-AC03/story sign-off and wider currency/role matrix remain open.
- [x] **VP-032-E02 — Complete evidence action and scope alignment:** Unit guards reject zero, negative, non-finite and over-precision receipt amounts without appending records; the smallest positive amount (0.01) and supported receipt metadata are accepted. AT-32 confirms the recorded amount/reference, and its receipt row exposes allocation only: no in-place receipt edit/delete control, payment initiation/refund/link or bank-connection action. The receipt model has no card, payment-instrument, gateway or banking-credential fields. The original VP-032 scope requires metadata at receipt creation and reasoned allocation-reversal history; it does not require post-record metadata editing. No receipt-edit command exists, and allocation corrections remain reasoned history. Focused unit 1/1, focused AT-32 Chrome 1/1, lint and diff check pass, 2026-09-25. VP-032-E01 is also complete; overall criterion/story sign-off remains open.
#### Original user story and dependencies
**Target modules:** 15  
**Prerequisites:** VP-031  
**User story:** As a billing officer, I want separate offline receipts and invoice allocations, so that I can record externally received money without online payment processing.
#### Full required implementation scope
Add receipt register/detail with client billing account, amount, currency, received date, method (bank transfer/cash/cheque/other), external reference and notes. A receipt may allocate to several permitted same-client/currency issued invoices; unallocated balance remains explicit. Allocation reversal/correction creates history rather than editing settled facts invisibly. Bank verification is a recorded human note, not a connected bank action.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-032-AC01 | Given a receipt, when allocated partially/across invoices, then receipt total = net allocations + unallocated balance and each invoice outstanding reconciles. | SUBCASES VERIFIED 2026-09-25: unit + AT-32 cover split/partial balances and selective reversal; unit also covers due dates on either side of today and fully reconciles gross receipt against active allocations plus unallocated remainder. Wider path matrix and sign-off remain open |
| VP-032-AC02 | Negative/zero receipts, over-allocation, cross-client/currency allocation, draft-invoice allocation and stale balances are rejected atomically. | SUBCASES VERIFIED 2026-09-25: zero, negative, non-finite and over-precision receipt amounts reject without mutation; 0.01 is accepted; receipt and invoice over-allocation plus stale receipt/invoice settlement reject without changing balances. Full role/currency/source matrix and criterion sign-off remain open |
| VP-032-AC03 | Undoing an allocation records a reversal reason and restores both balances without deleting the original allocation. | SUBCASES VERIFIED 2026-09-25: missing reason rejects atomically; reasoned selective and full-settlement reversals retain original history, restore receipt/invoice balances and invoice status, and duplicate reversal has no second effect. Full criterion sign-off remains open |
| VP-032-AC04 | No money is initiated, refunded or moved; there are no card details, banking credentials, payment links or gateway statuses. | SUBCASES VERIFIED 2026-09-25: AT-32 finds no payment/refund/payment-link/bank-connect actions in Receivables, and the persisted offline receipt has no card, gateway or banking-credential fields. Full criterion sign-off remains open |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L825).
**Next evidence update:** Current worktree at base `0077cc6`; `tests/unit/guards.test.ts` VP-032 covers split allocation/reversal, partial and fully settled invoices, past/future due dates, invoice and receipt caps, missing reasons, duplicate reversal, stale invoice/cache atomicity, malformed metadata and amount boundaries. `tests/e2e/app.test.ts` AT-32 verifies split allocation, selective reasoned reversal, reconciled remainder, recorded positive amount/reference, no receipt edit/delete action and no payment/refund/link/bank-connect action. Lint, full unit 204/204, focused AT-32 Chrome 1/1, full E2E 92/92 on unchanged application/E2E sources and `git diff --check` pass; 2026-09-25. Broader actor/currency matrices and owner sign-off remain open.
<a id="vp-033"></a>
### VP-033 — Add receivables aging and client account statements
**Current status:** PARTIAL  
**Milestone:** M5  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L24) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ReceivablesView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ReceivablesView.tsx), [calculations.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/calculations.ts).
**Module links:** [MOD-15](#mod-15) Receivables.
**Original journey links:** [AT-33](#at-33); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
As-of aging, five bucket drill-downs, currency/client filters and scoped CSV/printable statements exist. Historical receipts and credits are covered; a 31–60-day drill-down reconciles to its bucket.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-033-E01 — Complete evidence action:** Calculation tests verify a fixed-date invoice due today and 30/31/60/61/90/91-day boundaries; a reasoned reversal after the as-of date remains effective historically and is excluded after its effective date, restoring both invoice outstanding and receipt unallocated totals. AT-32/33 Chrome opens all five aging bucket details and reconciles each to its fixed-date calculation; verifies QAR and USD are filtered separately; and confirms a selective reversal appears as the exact unallocated receipt remainder in the register. Full unit 204/204; full E2E 92/92 (5 static + 87 Chrome); focused AT-32/33 1/1 after final visible-unallocated assertion; lint/build/diff check pass, 2026-09-25. Broader currency/role matrix and full AC/story sign-off remain open.
- [x] **VP-033-R02 — Requirement/scope reconciliation complete:** The source story requires a bounded printable demo statement; the browser print action is exercised, the filtered statement DOM equals its expected rows, and Chrome generates a one-page PDF whose rendered page visibly contains the statement heading, as-of/client/currency context and all invoice, credit and receipt rows. Printer-driver, physical printer and OS-specific output certification are outside the browser-only prototype scope.
#### Original user story and dependencies
**Target modules:** 15  
**Prerequisites:** VP-032  
**User story:** As a billing officer or permitted manager, I want as-of receivables views and statements, so that I can identify outstanding invoices and explain their balances.
#### Full required implementation scope
Build invoice aging, client statement and receipt/unallocated registers with date, client and currency filters. Drill into invoice/credit/receipt allocations from every amount. Use §5.5 aging definitions. Provide bounded CSV and printable demo statements; the client portal exposes only its permitted issued financial documents, not other clients or internal cost metrics.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-033-AC01 | Given invoices with different due dates, when an as-of date is selected, then Current/1–30/31–60/61–90/90+ buckets are correct at boundaries and sum to outstanding. | SUBCASES VERIFIED 2026-09-25: unit tests cover due-today and each 30/31/60/61/90/91 boundary; AT-32/33 opens all five bucket details and reconciles each total to the fixed-date calculation. Broader source/role matrix and criterion sign-off remain open |
| VP-033-AC02 | Future-effective receipts/credits do not reduce past as-of balances; drafts and pre-issue cancellations are excluded. | SUBCASES VERIFIED 2026-09-25: unit tests show future receipts do not reduce prior balances, a later reversal leaves its allocation effective before its reversal date then restores outstanding/unallocated funds, and drafts remain excluded. Full credit-date/role matrix and criterion sign-off remain open |
| VP-033-AC03 | Unallocated receipts remain visible separately; different currencies are never combined into a misleading single balance. | SUBCASES VERIFIED 2026-09-25: AT-32/33 confirms exact unallocated balance appears in the receipt register after reversal; the UI selector and separate QAR/USD aging calculations are verified. Full entity/currency/role matrix and criterion sign-off remain open |
| VP-033-AC04 | Exported rows/totals reconcile with the filtered on-screen report and contain only the current role scope; no automated debt-chasing email is sent. | SUBCASES VERIFIED 2026-09-25: client-scoped statement rows equal the filtered screen and CSV; browser print creates a rendered one-page demo statement; no debt-chasing email is sent. Full role-scope matrix and criterion sign-off remain open |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L842).
**Next evidence update:** Current worktree at base `0077cc6`; `tests/unit/calculations.test.ts` covers due-today and all 30/31/60/61/90/91 boundaries, future receipt timing, and reversal-date historical balances; `tests/e2e/app.test.ts` AT-32/33 opens every aging bucket, matches each drill-down to the fixed-date calculation, checks separate QAR/USD values, verifies reversed funds in the unallocated register, and compares filtered statement rows to CSV. The browser-generated one-page print PDF was rendered for visual review and shows its statement title, account/date/currency context and all visible rows; OS/printer-driver behavior is out of scope. Full unit 204/204, full E2E 92/92, focused AT-32/33 1/1, lint/build/diff check pass, 2026-09-25. Broader actor/currency matrix and owner sign-off remain open.
<a id="vp-034"></a>
### VP-034 — Add accounting profiles, periods, books, charts and dimensions
**Current status:** PARTIAL  
**Milestone:** M6  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L29) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AccountingWorkbenchView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AccountingWorkbenchView.tsx).
**Module links:** [MOD-20](#mod-20) Accounting.
**Original journey links:** [AT-34](#at-34); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Versioned legal-entity accounting setup, basis/currency, chart accounts/hierarchy, period books, dimensions and engagement pins exist. Recorded checks cover invalid codes/dates/cycles/owners and client-wide dependency invalidation.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-034-E01 — Partial verification evidence:** AT-34 Chrome and unit checks revise a client profile/chart across multiple same-client engagements, retain profile/package history, demote the sibling mapping and stale statement/package outputs. Complete book/period change combinations and prior mapping/source rework matrix remain open.
- [ ] **VP-034-E02 — Partial verification evidence:** AT-34/unit covers duplicate codes, invalid date ranges, hierarchy/cycle/parent guards, foreign book ownership, invalid dimensions and inactive/non-posting accounts; closed-period TB and GL imports now reject atomically. Archive/account lifecycle, dimension-only approved-output matrix and explicit migrated “Not selected” context remain open.
#### Original user story and dependencies
**Target modules:** 20  
**Prerequisites:** VP-012, VP-019  
**User story:** As a preparer and manager, I want an accounting setup workspace, so that every import and calculation has an explicit reporting context.
#### Full required implementation scope
Create client accounting profile, legal entity, reporting periods/books, basis and currency selectors. Add a chart editor with account code/name/type, parent, posting flag and active state. Provide bounded dimensions such as department/cost centre/project without an ERP module. Periods need start/end dates, owner engagement and status. Keep client and firm accounting separate; settings changes after approved output create revisions.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-034-AC01 | Given a client/engagement, when setting up a period/book, then subsequent imports inherit a visible explicit context and cannot attach to a sibling client by accident. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-034-AC02 | Duplicate account codes, invalid date ranges, hierarchy cycles and posting accounts used as parents are rejected. | SUBCASES VERIFIED 2026-09-25: AT-34/unit exercises duplicate codes, invalid periods, cycles, invalid posting parents, and closed-period import denial. Complete field/context matrix and sign-off remain open |
| VP-034-AC03 | Used/approved charts and period settings are revised rather than destructively overwritten; affected packages show staleness. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-034-AC04 | New screens create neither client operational transactions nor tax/payroll configurations; empty setup provides a clear manual starting action. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L861).
**Next evidence update:** Current uncommitted worktree at base `0077cc6`; `tests/unit/guards.test.ts` AT-34 covers profile/chart revisions, invalid chart hierarchy/dates/owners/dimensions, downstream staleness, and closed-book TB/GL import rejection without source mutation; `tests/e2e/app.test.ts` AT-34 verifies client-level changes stale sibling mapping, statement and package snapshots. Lint passed; 190/190 unit; focused AT-34 Chrome 1/1; full E2E 83/83 before the closed-period guard change. Full-suite rerun pending; `git diff --check` clean; 2026-09-25. Broader archive/migration matrix and reviewer sign-off remain open.
<a id="vp-035"></a>
### VP-035 — Complete bounded CSV and genuine XLSX trial-balance intake
**Current status:** VERIFIED
**Milestone:** M6  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `88950b67e3097a43f0c9f6359f40f50bae94cd0c`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L30) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [TBImportWizard.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/TBImportWizard.tsx).
**Module links:** [MOD-21](#mod-21) Trial Balance & GL.
**Original journey links:** [AT-35](#at-35); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
CSV and genuine XLSX TB import, row validation, source hashes and predecessor snapshots are represented. Recorded browser journeys retain prior source when unbalanced input fails.
#### Verification completed
- [x] **VP-035-E01 — Browser evidence complete (2026-09-24):** AT-35 Chrome rejects duplicate codes, formula cells, CSV renamed to XLSX, oversized input, 2,001-row input, unmapped chart accounts and stale chart context. Each rejection disables commit and preserves the latest accepted source rows/version.
- [x] **VP-035-E02 — Browser and store evidence complete (2026-09-24):** AT-35 imports signed-net CSV with configured dimensions and debit/credit CSV with reordered/manual column choices; rejects missing headers and unknown dimension values; preserves exact mapping, normalized balances, accounting profile/chart/book context, SHA-256 and predecessor history across CSV/XLSX and successive replacements. Invalid dimensions are rejected by the store before source-version or row mutation.
#### Original user story and dependencies
**Target modules:** 21  
**Prerequisites:** VP-034  
**User story:** As a preparer, I want a full TB import wizard, so that I can map, validate, preview and retain a traceable source revision.
#### Full required implementation scope
Extend CSV intake with genuine XLSX parsing using a small reviewed browser-compatible dependency where needed. Steps: choose synthetic fixture/file, select period/book, map headers, choose signed-net or debit/credit convention, preview, validate and commit a new source revision. Required row data: account code/name and amount(s); optional dimension values must be defined. State explicit row/file limits and show row-level errors. Never execute macros/formulas.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-035-AC01 | Given valid balanced CSV/XLSX data, when committed, then source rows, normalized totals, file metadata/hash and reporting context are retained as one revision. | VERIFIED — AT-35: CSV signed-net and debit/credit produce expected normalized rows; both CSV and genuine XLSX revisions retain hash, mapping, predecessor and accounting context. |
| VP-035-AC02 | Unbalanced totals, duplicate ambiguous accounts, missing headers, unknown dimensions, formula-dependent numeric cells and exceeded limits produce a non-committed error preview. | VERIFIED — AT-35 Chrome covers unbalanced, duplicate, missing-header, unknown-dimension, formula, 2,001-row, oversize, unmapped account and stale context rejection without commit. |
| VP-035-AC03 | A rejected import leaves the previous accepted source untouched; a successful replacement preserves it and stales dependent calculations/approvals. | VERIFIED — AT-35 and store guards confirm rejected inputs preserve accepted rows/version; consecutive CSV/XLSX imports retain immutable predecessor rows and lineage. Source replacement continues through existing dependent-output invalidation. |
| VP-035-AC04 | XLSX means an actual workbook format, not CSV renamed to .xlsx; source bytes remain in-session only and exported/imported formats are verified. | VERIFIED — AT-35 rejects CSV bytes renamed `.xlsx`, parses and commits a genuine generated workbook, and retains parsed rows/hash while source bytes remain session-only. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L878).**Verification record:** full-suite commit `fcae15765bf809f946147653ee448ca19ab19d93`; `npm run lint && npm run test:unit && npm run test:e2e`; fixture: deterministic `createInitialState()` plus in-memory CSV and generated XLSX; 161/161 unit and 70/70 E2E checks passed on 2026-09-24. Final copy-only registry update `88950b67e3097a43f0c9f6359f40f50bae94cd0c` passed lint and production build.
<a id="vp-036"></a>
### VP-036 — Add GL intake, transaction browsing and TB completeness
**Current status:** PARTIAL  
**Milestone:** M6  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L30) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AccountingWorkbenchView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AccountingWorkbenchView.tsx), [calculations.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/calculations.ts).
**Module links:** [MOD-21](#mod-21) Trial Balance & GL.
**Original journey links:** [AT-36](#at-36); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
A GL completeness calculation and transaction/comparison surface are present; previous checks addressed opening-balance and unmatched-account cases. Current high-level coverage primarily documents TB intake rather than the complete GL journey.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-036-R01 — Requirement/scope reconciliation complete (2026-09-26):** Original scope comparison recorded in the coding guide and verification entry 87. AT-36 confirms CSV/XLSX selection/preview, configurable mapping retained with source history, same-source explicit Opening Balance mapping and unknown-opening semantics (unit/EX06), account-level journal source references, journal/account filtering, source count (8), engagement-bound filtered CSV export and local-only non-posting behavior. Added an explicit Journal ID column to the detailed transaction table so a journal-filter result visibly identifies its matching journal; Chrome asserts all eight J1 rows display J1 and the account filter/export reduce to the expected single row. The documented fixture performance claim remains an AC04 sign-off item, not evidence inferred from this eight-row fixture. VP-036 remains Partial; no story/criterion sign-off claimed.
- [x] **VP-036-E02 — Verification/evidence complete:** AT-36 imports explicit opening + movement data, reconciles each account to TB after reload, and blocks an incomplete journal batch from import. `tests/unit/gl-import.test.ts` verifies duplicate journal/line keys, invalid dates, wrong-period and wrong-currency rows, explicit opening-only rows, and atomic rejection of invalid account codes/openings; `tests/unit/calculations.test.ts` EX06–EX08 verifies missing openings remain incomplete, extra unmatched GL accounts remain visible/incomplete, and the positive opening + movement = closing case reconciles. Full run: lint/typecheck, 199/199 unit, 90/90 E2E, `git diff --check`, 2026-09-25. VP-036-E02 is closed; VP-036 story and criterion sign-off remain open for other listed evidence.
- [x] **VP-036-E03 — Verification evidence complete (2026-09-26):** AT-36 imports GL v1/v2, preserves prior transaction rows/hash and unchanged TB, stales/reworks/re-reviews a reconciliation under independent roles, and clears the prior candidate. AT-41 assembles and independently acknowledges a package pinned to GL v1, imports v2, confirms the old package is Stale and its historical artifacts still match their hashes, then generates and obtains a new independent management acknowledgement for the v2-pinned package. Unit guards reject package save/release with a mismatched GL revision/hash. 238/238 unit, 110/110 E2E, lint/build, progress validation and diff check pass. Overall VP-036 story acceptance remains open.
#### Original user story and dependencies
**Target modules:** 21  
**Prerequisites:** VP-034, VP-035  
**User story:** As a preparer and reviewer, I want a general-ledger intake and completeness workspace, so that I can explain how source movements reconcile to the selected trial balance.
#### Full required implementation scope
Provide bounded GL file mapping/preview for journal ID, line ID, account, date, debit/credit or signed amount, currency, description and optional dimensions/service date. Add source-bound transaction filters, journal drill-down and opening + movement = closing comparison by account. Allow an explicit prior opening source; show unknown opening coverage when absent. This is file intake, not a live accounting integration or posting engine.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-036-AC01 | Given coherent opening balances, GL movements and closing TB, when completeness is calculated, then per-account residuals and source references reconcile. | SUBCASE VERIFIED — AT-36 imports the engagement source, shows account-level opening/movement/closing/residual/source-journal rows, and reloads as complete; broader examples remain open |
| VP-036-AC02 | Missing opening data, partial journal batches, duplicate line keys, unmatched accounts, unbalanced journals and wrong periods/currencies are exposed rather than marked complete. | Verified subcases: AT-36 exposes an unbalanced partial batch and disables import; store rejects partial commit, unknown/inactive/non-posting chart accounts and opening balances atomically. Full missing-opening/duplicate/unmatched/wrong-context browser matrix remains open |
| VP-036-AC03 | Importing/replacing GL creates a new source revision and invalidates affected reconciliations/packages without changing the original source rows. | SUBCASE VERIFIED — store regression retains revision 1 and TB rows, appends revision 2, stales reconciliations and invalidates release generation; full dependent-output review remains open |
| VP-036-AC04 | Filters, source counts, drill-down and CSV export agree; the module never posts to client or firm books and handles the documented fixture size without freezing navigation. | SUBCASE VERIFIED — AT-36 now asserts source count 8, journal filter returns eight visible rows each labelled J1, account filter returns one row, and the exported filtered CSV has header + one matching row; import is engagement-local and non-posting. Documented fixture-size responsiveness and broader actor/context acceptance remain open; no full criterion sign-off. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L895).
**Next evidence update:** Current uncommitted worktree at base `0077cc6`; `tests/unit/gl-import.test.ts` covers unknown/inactive/non-posting movement and opening accounts with atomic rejection; `tests/e2e/app.test.ts` AT-36 proves mapped source import, account-level opening/movement/TB tie-out and reload. Lint passed; 191/191 unit and full E2E 83/83 passed; `git diff --check` clean; 2026-09-25. Browser negative matrix, package/reconciliation walkthrough and reviewer sign-off remain open.
<a id="vp-037"></a>
### VP-037 — Extend account mappings and reporting validation
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M6  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L29) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AccountingWorkbenchView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AccountingWorkbenchView.tsx), [FinancialStatementsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/FinancialStatementsView.tsx).
**Module links:** [MOD-20](#mod-20) Accounting.
**Original journey links:** [AT-37](#at-37); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Explicit independently reviewed mapping revisions, an unmapped queue, manual 60/40 allocation, source-code drill-down, statement/export lineage and stale dependent statements are covered.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 20  
**Prerequisites:** VP-034, VP-035  
**User story:** As a preparer and independent reviewer, I want editable versioned account-to-statement mappings, so that reported amounts can be traced and unmapped balances cannot disappear.
#### Full required implementation scope
Replace the five-class-only demonstration with explicit source-account to statement-line/note mapping tied to a chart/reporting-template version. Include a clear unmapped queue, current classification, optional approved split allocations and mapping review. Splits are deliberately manual with visible percentages/amounts; no AI suggestions. Drill from a statement line to mapped source rows.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-037-AC01 | Given a source with unmapped material balances, when preparing a package, then validation flags the rows and blocks a misleading complete result. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-037-AC02 | A mapping revision requires independent review; editing an approved mapping preserves prior version and stales its dependent output. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-037-AC03 | Where splits are used, allocations reconcile exactly to each source balance and cannot double count; invalid/mismatched chart or note targets are rejected. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-037-AC04 | Every generated line exposes its mapping/source references; no unrecognized account is silently assigned a zero balance or miscellaneous category. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L912).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: `—`. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-038"></a>
### VP-038 — Generalize adjustment journals and source-reflection decisions
**Current status:** PARTIAL  
**Milestone:** M6  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L31) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AccountingWorkbenchView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AccountingWorkbenchView.tsx), [ClientPortalView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ClientPortalView.tsx).
**Module links:** [MOD-22](#mod-22) Adjustments & Journals.
**Original journey links:** [AT-38](#at-38); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
General adjustment journals, independent technical review, scoped management decision and reflection status exist. Accepted unreflected journals affect statements/packages once and leave source TB unchanged; missing accounts block output. The reflection selector records all four decisions against the current TB source revision, retains the prior decision, and blocks reporting if that source revision changes.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-038-E01 — Bounded verification/evidence action complete (2026-09-26):** `tests/unit/calculations.test.ts` covers accepted/unreflected inclusion, reflected no-double-counting, rejected/partial/unknown/stale-source/stale-support exclusions and reasons; `tests/unit/guards.test.ts` pins exact evidence+document/workpaper/finding revisions, rejects foreign/unavailable/stale references, blocks stale pins at review/management/report inclusion, preserves predecessor pins on amendment, and exposes current support issues; `tests/unit/lifecycleGaps.test.ts` rejects duplicate reporting inclusion. Chrome `tests/e2e/app.test.ts::AT-38` creates revision-pinned links, runs independent technical and management decisions, verifies missing-evidence rejection, partial/unknown statement reasons and reload history, amends with predecessor references retained and reapproval required, and confirms source TB rows unchanged. `VP-038-E01/E02` verifies source replacement/reconfirmation with no duplicate effect. Current verification: build PASS; unit 240/240; full E2E 110/110 (5 static + 105 Chrome); focused journal journeys 2/2; `git diff --check` PASS. VP-038 story/AC sign-off remains open; AC04 still has malformed/mixed-context-line and ledger-boundary subcases open; reviewer sign-off remains pending.
- [x] **VP-038-E02 — Bounded verification/evidence action complete (2026-09-26):** Chrome `tests/e2e/app.test.ts::VP-038-E01/E02` replaces TB v1 with v2, shows prior reflection stale and excluded with a reason, records current-source evidence and re-confirms against v2, preserves v1 history, clears the stale-source warning and shows no duplicate reporting effect. Covered by current full E2E 110/110 and focused journal journey 1/1. VP-038 story/AC sign-off remains open.
- [x] **VP-038-R03 — Requirement/scope reconciliation:** Reconciled against VP-038 AC04 and the agreed accounting scope: reporting inclusion/reflection is local; neither client-ledger posting nor firm-ledger posting is required. — DONE 2026-09-25.
#### Original user story and dependencies
**Target modules:** 22  
**Prerequisites:** VP-035, VP-036, VP-037  
**User story:** As a preparer, reviewer and management approver, I want a general journal register rather than one hard-coded depreciation example, so that reporting adjustments have traceable review and inclusion decisions.
#### Full required implementation scope
Create journal header/context and arbitrary debit/credit lines; support draft, submit, technical review, manual management decision, reporting inclusion, rejection and amendment. Link evidence/workpaper/finding. Record source reflection as not reflected, reflected, partially reflected or unknown against an exact replacement-source revision. Keep rejected differences visible. Reporting inclusion never implies external ledger posting.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-038-AC01 | Given a balanced journal, when independently reviewed and management-accepted, then its effect is included once in the selected reporting layer. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-038-AC02 | Given a replacement TB already containing that journal, when marked reflected with evidence, then additional effect is zero and no double counting occurs. | VERIFIED — VP-038-E01/E02 Chrome replaces TB v1 with v2, shows the stale reflection excluded from reporting, then verifies new-source evidence/re-confirmation produces no additional reporting adjustment; source revision/history remain intact. |
| VP-038-AC03 | Unknown/partial reflection blocks final reporting inclusion until resolved; changed source or journal revision stales the relevant decision. | VERIFIED — AT-38 confirms unknown/partial decisions are excluded with reasons; VP-038-E01/E02 verifies a TB source replacement stales the reflected decision, the statement explains the exclusion, and a reasoned evidence refresh/re-confirmation clears the stale-source warning while retaining v1 history. |
| VP-038-AC04 | Unbalanced/mixed-context lines, same-person approval and duplicate inclusion are rejected; amendments preserve prior versions and do not alter source or firm ledgers. | SUBCASE VERIFIED: current unit coverage rejects a second reporting-inclusion command; store and Chrome tests reject missing reflection evidence, preserve prior approval/reflection/support pins, reset approval after a reasoned balanced amendment, require fresh independent technical and management decisions, and confirm imported source rows remain unchanged. Malformed/mixed-context line coverage and complete AC04 ledger-boundary review remain open; this criterion is not signed off. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L929).
**Next evidence update:** Bounded E01/E02 follow-ups are closed using the current worktree; fixture: deterministic ENG-26001 / AJ-01, revision-pinned EVD-02/DOC-003, WP-A1, FND-01 and TB source v1→v2 with `TB-IMPORT-REV-1/2`. Evidence: `tests/unit/calculations.test.ts` (reporting decision matrix), `tests/unit/guards.test.ts` (support pin validation and staleness), `tests/unit/lifecycleGaps.test.ts` (duplicate-inclusion guard), and `tests/e2e/app.test.ts::AT-38` plus `::VP-038-E01/E02` (Chrome lifecycles). Current build PASS, unit 240/240, full E2E 110/110 (5 static + 105 Chrome), focused journal Chrome 2/2; 2026-09-26. Reviewer/date: **pending human sign-off**; VP-038 and AC01/AC04 remain Partial/open.
<a id="vp-039"></a>
### VP-039 — Implement editable manual reconciliation schedules
**Current status:** PARTIAL  
**Milestone:** M6  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L32) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AccountingWorkbenchView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AccountingWorkbenchView.tsx).
**Module links:** [MOD-23](#mod-23) Reconciliations.
**Original journey links:** [AT-39](#at-39); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Manual source-pinned reconciliation drafts, dated typed items, scoped evidence, independent review, reasoned return and new rework revisions are demonstrated. AT-39 proves a dated $100 timing item plus $999,900 statement balance reproduces the $1,000,000 source balance; a $100 unexplained residual, out-of-scope schedule evidence and an unlinked proposed correction each block reviewer approval without changing the draft. A corrected schedule can be independently approved, and return rationale survives rework history. Unit coverage also covers invalid currency/date and source replacement staleness.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-039-E01 — Partial verification evidence:** Passed subcases: timing arithmetic, nonzero residual approval block, out-of-scope schedule evidence rejection, missing item evidence, unlinked proposed-correction rejection, independent approval after correction, returned-reason history across rework, and replacement of referenced DOC-002 stales the schedule while its Approved revision remains viewable. `tests/unit/guards.test.ts::reconciliation schedules (VP-039)` asserts as-of boundary, before/after-as-of dates, impossible/future dates, wrong currency, non-finite amounts, duplicate item IDs, atomic rejected saves, foreign-client evidence rejection and same-client/sibling-engagement evidence rejection for both header and item references. `tests/unit/calculations.test.ts::EX09` covers the actual UI item label `Proposed correction`; previously only legacy `correction` was excluded from timing totals. Unit 242/242, lint and focused VP-039/EX09 2/2 pass. Broader source/opening arithmetic, currency/date/scope matrix, full criterion review and sign-off remain open.
- [x] **VP-039-R02 — Requirement/scope reconciliation complete:** The original scope excludes external bank feeds, automated matching and provider provenance. The in-scope remainder is manual reconciliation with dated, engagement-currency items, scoped evidence and independent review (VP-039-AC02/AC04); evidence gaps stay in VP-039-E01. No external bank integration or additional feature work is required by this card.
#### Original user story and dependencies
**Target modules:** 23  
**Prerequisites:** VP-021, VP-036, VP-038  
**User story:** As a preparer and reviewer, I want manual bank/account reconciliation workspaces, so that differences can be explained and independently reviewed without matching automation.
#### Full required implementation scope
Add schedule header with account, period/as-of date, source TB/GL balance and statement/supporting balance; editable items with date, amount, type, explanation and evidence. Types distinguish timing items from proposed corrections. Compute reconciliation residual using a documented sign convention. Link proposed corrections to reporting journals rather than silently applying them. Support review, return, approve and source-stale states.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-039-AC01 | Given valid schedule items, when recalculated, then opening/source/supporting totals and unexplained residual are reproducible from displayed inputs. | PARTIAL EVIDENCE: AT-39 asserts $999,900 statement + $100 dated timing item = $1,000,000 GL; broader source/opening and displayed residual cases remain open |
| VP-039-AC02 | An unexplained nonzero residual or missing required evidence blocks approval; proposed corrections cannot masquerade as already cleared timing items. | PARTIAL EVIDENCE: AT-39 proves a $100 unexplained residual, out-of-scope schedule evidence and an unlinked proposed correction each block independent approval; missing item-evidence and broader proposed-correction cases remain open |
| VP-039-AC03 | An accepted source/evidence replacement makes current reconciliation review stale; the previous approved snapshot remains viewable. | PARTIAL EVIDENCE: AT-39 Chrome replaces the referenced statement, verifies current status Stale and shows the prior Approved revision in history; broader source replacement and package impact remain open |
| VP-039-AC04 | Item currency/date/scope validation and independent reviewer checks work; no bank feed, automated matching, payment initiation or tax integration is introduced. | PARTIAL EVIDENCE: unit validation and AT-39 reviewer/self-review, reasoned return, rework and approval pass; full currency/date/scope matrix remains open |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L946).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-040"></a>
### VP-040 — Build configurable financial statements and comparatives
**Current status:** PARTIAL  
**Milestone:** M6  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L33) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [FinancialStatementsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/FinancialStatementsView.tsx).
**Module links:** [MOD-24](#mod-24) Financial Statements.
**Original journey links:** [AT-40](#at-40); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Mapped same-client/currency current and prior statements, source references, unavailable-not-zero comparatives, saved statement revisions and independent review are represented. A versioned, engagement-scoped layout now edits line grouping/order and validated subtotals, renders those settings in preview and XLSX, snapshots them into reviewed output and stales prior review when changed. AT-37 also confirms that comparative mapping changes stale current statement review and that the unsupported Changes in Equity page reports unavailable when mapping combines share capital and reserves without a reviewed equity movement schedule; the prior hard-coded opening/closing amounts have been removed.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-040-E01 — Verification/evidence partial:** AT-37 verifies current/prior source detail and totals, configured groups/order/subtotals in preview and XLSX, reviewed statement snapshots under layout versions 2 and 3, layout-change staleness, comparative-mapping staleness, and unavailable equity without substituted figures (`tests/e2e/app.test.ts::AT-37`, focused and full 91/91 E2E on 2026-09-25). Full source/current-mapping/prior-period/layout-change matrix, all supported operations and criterion-level acceptance remain open.
- [x] **VP-040-R02 — Requirement/scope reconciled and implementation gap closed (2026-09-25):** Implemented engagement-scoped versioned line grouping/order/subtotals with guards, preview/export consumption, reviewed-output snapshots and staleness; store regressions and AT-37 verify the supported-fixture operations. Full story acceptance remains open under VP-040-E01/E03.
- [ ] **VP-040-E03 — Verification/evidence pending:** Coordinate cash-flow/equity movement support and disclosures with VP-041; unsupported figures must remain unavailable.
#### Original user story and dependencies
**Target modules:** 24  
**Prerequisites:** VP-037, VP-038, VP-039  
**User story:** As a preparer and reviewer, I want a fuller statement-preparation workspace, so that the prototype shows how reviewed source information becomes a financial statement set.
#### Full required implementation scope
Support statement of financial position, profit/loss, changes in equity and cash flows as explicit pages within a versioned layout. Add current/prior-period selection, line ordering/grouping, subtotal definitions and source drill-down. Restrict the calculation model to documented deterministic fixtures and supported line operations. Labels and previews state that professional methodology/framework approval is outside the demo.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-040-AC01 | Given valid mapped current/prior periods, when statements are built, then each column and subtotal reconciles to its selected source; a missing prior period shows unavailable, not zero. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-040-AC02 | Assets, liabilities/equity and period-result movements reconcile in the supported fixture; invalid totals display blocking validation. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-040-AC03 | Changing source, mapping, layout or comparative selection creates a new output revision and stales the previous current review. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-040-AC04 | The preview provides complete visible structure, editing and drill-down for the supported demonstration; unsupported calculations never render invented balanced figures. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L963).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-041"></a>
### VP-041 — Complete notes, cash-flow support and disclosure review
**Current status:** PARTIAL  
**Milestone:** M6  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L33) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [FinancialStatementsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/FinancialStatementsView.tsx), [FinancialPackagesView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/FinancialPackagesView.tsx).
**Module links:** [MOD-24](#mod-24) Financial Statements.
**Original journey links:** [AT-40](#at-40); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Package-level disclosure applicability and prepared note/not-applicable rationale checks exist. Cash-flow output is correctly disabled when classified movement data is absent rather than displaying fabricated amounts.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-041-I01 — Implemented and exercised:** Revisioned opening cash, classified operating/investing/financing/non-cash movements, evidence references and closing-cash reconciliation are saved against the current TB and approved mapping; independent review and source/mapping staleness are guarded. Verified by focused Chrome AT-37 and store regression in the 2026-09-24 run.
- [x] **VP-041-I03 — Implemented and exercised:** Opening total equity and evidence-backed contributions/distributions reconcile to mapped equity excluding current-period result; the Changes in Equity statement remains unavailable until independent review. Current reviewed schedules can be included in package XLSX/DOCX/PDF with exact schedule lineage. AT-37, cash-flow store regression, and complete Chrome suite passed 2026-09-24. Component equity balances remain unavailable because the fixture mapping combines equity accounts; story remains Partial.
- [x] **VP-041-I02 — Implemented and exercised:** Per-note records persist as engagement revisions; applicable notes require in-scope document evidence, not-applicable notes require rationale, reviewer role and identity are independent, reviewed records are pinned into package revisions, and client output contains only notes explicitly shared. Verified by disclosure store regression and 155/155 unit checks on 2026-09-24. Client sharing/rework/browser journey evidence remains open under VP-041-E03.
- [x] **VP-041-E03 — Verified subcases (2026-09-24):** Store checks show saving/reviewing a disclosure and replacing a cash-flow schedule invalidate the package generation, clear bound approvals/candidates, and retain the prior package snapshot. AT-41/42/48 assembles a real PDF with one shared and one private reviewed note; the shared content is present and the private sentinel is absent. Broader disclosure/rework cases remain open; this does not complete VP-041.
#### Original user story and dependencies
**Target modules:** 24  
**Prerequisites:** VP-040  
**User story:** As a preparer and reviewer, I want editable notes and movement schedules, so that statement completion is not reduced to a generic confirmation checkbox.
#### Full required implementation scope
Add notes/disclosure list with reference, applicability, text/data table, evidence, preparer/reviewer and status. Provide explicit opening cash, cash/noncash movement inputs and reconciliation to closing cash for the demo. Add equity movement input for contributions/distributions rather than assuming none. Related-party, going-concern and subsequent-event examples remain human-entered, non-AI and non-tax-specific.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-041-AC01 | Given closing TB data alone, when cash flows lack required movement support, then the screen reports incomplete support instead of inventing movements. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-041-AC02 | Not-applicable notes need a reason and reviewer decision; a blank note is not an approved exemption. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-041-AC03 | Approved note/support edits preserve prior revision and invalidate current package review; totals tie to current statement context. | SUBCASES VERIFIED — disclosure and cash-flow replacements stale current package generation and retain old package/schedule revisions; broader totals and review matrix remain open |
| VP-041-AC04 | Client previews expose only deliberately shared note content; internal reviewer comments remain internal and no professional conclusion is autogenerated. | SUBCASE VERIFIED — AT-41/42/48 parses the generated PDF text and confirms explicitly shared disclosure is included while the unshared note sentinel is absent; remaining client preview/rework cases stay open |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L980).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-042"></a>
### VP-042 — Complete financial-package assembly and genuine exports
**Current status:** PARTIAL  
**Milestone:** M6  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L34) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [FinancialPackagesView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/FinancialPackagesView.tsx), [artifactStore.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/artifactStore.ts), [exportService.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/exportService.ts).
**Module links:** [MOD-25](#mod-25) Financial Packages.
**Original journey links:** [AT-41](#at-41); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Ordered package sections/notes persist by revision. Real XLSX/DOCX/PDF bytes and SHA-256 identities persist; reassembly retains older artifacts. A forced XLSX Blob failure is recorded without revision advancement.
- [x] **VP-042-I04 — Implemented and exercised:** Reload restores the exact enabled state and ordering from the current saved package whenever its referenced cash-flow/equity support remains current. AT-37 assembles a package with both reviewed statements, verifies the saved section revision, reloads, and confirms both remain selected. Full Chrome suite: 71/71, 2026-09-24.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-042-E01 — Verification complete:** focused AT-41/42/48 Chrome journey injects DOCX and PDF SHA-256 read failures after genuine generation and a second-write IndexedDB failure after an earlier artifact write. Each error is surfaced, no package revision is announced/saved, and the artifact count remains unchanged; then a genuine three-format revision succeeds. Full run: 168/168 unit and 71/71 E2E, 2026-09-24 (`tests/e2e/app.test.ts`).
- [x] **VP-042-E02 — Verification complete:** AT-41/42/48 reassembles revision 4 after amendment, confirms revision 2 artifact bytes and acknowledgement remain historical, then records a separate management acknowledgement bound to revision 4. Full suite: 159/159 unit and 68/68 E2E, 2026-09-24 (`tests/e2e/app.test.ts`, replacement-package review assertions).
- [x] **VP-042-R03 — Requirement/scope reconciliation:** Closed after VP-041 added evidenced, independently reviewed cash-flow inputs. Package inclusion requires that current reviewed schedule; unavailable output remains disabled when support is absent.
#### Original user story and dependencies
**Target modules:** 25  
**Prerequisites:** VP-040, VP-041  
**User story:** As a preparer and reviewer, I want a versioned package builder with useful downloadable sample outputs, so that I can inspect exactly what is presented, reviewed and released.
#### Full required implementation scope
Add package contents selection/order, output preview, validation summary, version list and source/mapping/notes lineage. Generate genuine browser-local XLSX, DOCX and PDF demo artifacts for supported fixtures using reviewed minimal dependencies; retain HTML/CSV where useful. An artifact records kind, exact package revision, generation and content identity. Treat file generation as local technical work, not a live Office integration or professional signing action.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-042-AC01 | Given a valid supported package, when exported, then XLSX/DOCX/PDF files open as their actual formats and contain the displayed totals, entity, period and demo watermark. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-042-AC02 | Export generation failure or unsupported content blocks that output and reports the reason; no renamed CSV, empty PDF or fake success is accepted. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-042-AC03 | When package content changes, prior artifacts and decisions remain historical and a new artifact revision must be reviewed. | VERIFIED: AT-41/42/48 verifies unchanged prior bytes/decision history, a new presentation and independent acknowledgement for revision 4. |
| VP-042-AC04 | External sharing remains explicit and scope-bound; internal workpapers/comments are excluded from management/client outputs by default. | VERIFIED SUBCASE: AT-38/40 keeps a reviewer-approved internal-only disclosure unshared and confirms generated XLSX/DOCX/PDF and the client portal omit it, its sentinel, internal comment, and workpaper reference. Full scope-bound sharing matrix remains open. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L997).
**Next evidence update:** Test HEAD `804ccc8ee59143dc96bc2fcb5b70e65e55616570`; app source `188ee3bd5c2ded7a241552fe2c5370e1008fcf98`; fixture `ENG-26002`; VP-042-AC04 subcase maps to `tests/e2e/app.test.ts` AT-38/40 and validates actual persisted XLSX/DOCX/PDF bytes and client portal exclusion. Full suite: lint, 172/172 unit and 74/74 E2E; 2026-09-24. Scope-bound sharing matrix and full story acceptance remain open.
<a id="vp-043"></a>
### VP-043 — Create consolidation groups and effective perimeters
**Current status:** VERIFIED
**Milestone:** M7  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L35) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ConsolidationView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ConsolidationView.tsx).
**Module links:** [MOD-26](#mod-26) Consolidation.
**Original journey links:** [AT-42](#at-42); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
The bounded consolidation profile is explicit: one Parent and one wholly owned Subsidiary. Pins are immutable, new package snapshots must match source rows, and unsupported minority/Associate/missing-role states show no figures.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-043-I01 — Implemented and exercised:** Supported-profile perimeter editing, date/component validation, attributable history, revert-as-new-revision, and elimination re-review after a component change are implemented.
- [x] **VP-043-E02 — Verified:** The fresh full run on `fded7b5` passed 161/161 unit and 70/70 E2E checks. Unit checks prove independent group revisions, reject duplicate/self-loop components, invalid ownership, mismatched period/entity and invalid dates without mutation, and deny a narrow-grant perimeter edit without widening access. Chrome confirms the narrow grant sees only its approved Parent projection, with the other component identity, figures, tabs, editor and history redacted. AT-43 also verifies the supported wholly-owned profile disclosure, unsupported minority profile with no figures, reasoned effective-date/component revision, unchanged source rows and elimination re-review.
- [x] **VP-043-R03 — Reconciled:** The delivered, disclosed supported profile is exactly one Parent plus one 100%-owned Subsidiary. Associate, minority and advanced consolidation methods remain explicitly unsupported and produce no result; expansion is outside the acceptance contract.
#### Original user story and dependencies
**Target modules:** 26  
**Prerequisites:** VP-019, VP-034  
**User story:** As a group accountant or manager, I want a separate group workspace, so that component financial information is combined without changing client source books.
#### Full required implementation scope
Add group identity, reporting period/basis/currency, manager and revisioned component perimeter. Components reference existing permitted legal entities with ownership/control information and effective dates. The first complete deterministic scenario uses a documented simple parent/wholly-owned-subsidiary profile. Other ownership/method selections may be shown with explicit unsupported limits, but cannot produce asserted results. Relationship/contact groups remain separate from consolidation groups.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-043-AC01 | Given a valid group/perimeter, when saved, then the group has its own scope, revision and component links and no source client balances are changed. | VERIFIED — AT-43 perimeter lifecycle and AT-42 group calculation; unit checks confirm per-group revision isolation and unchanged source rows. |
| VP-043-AC02 | Duplicate components, cycles, invalid ownership percentages and incompatible period/entity assignments are rejected. | VERIFIED — unit guard matrix rejects self-loop/duplicates, non-100% ownership, cross-period entity, malformed dates and invalid component assignments without mutation. |
| VP-043-AC03 | Adding a component does not expand the operator’s access to its unrelated engagements; narrow group access exposes only approved component projections. | VERIFIED — unit denial checks and AT-43 narrow-grant Chrome projection confirm no access expansion or ungranted identity/figure disclosure. |
| VP-043-AC04 | The selected calculation profile and limitations are visible; unsupported ownership/accounting methods cannot silently fall back to full consolidation. | VERIFIED — AT-43 displays the supported Parent/wholly-owned Subsidiary profile and blocks minority/missing-role output; unit guards reject Associate ownership. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1016).**Evidence:** tested tree `fded7b5ad305c0d6178cb404e2a81a2a57776682`; fixture: GRP-01 plus narrow ENG-26001 group grant; criterion evidence: AT-42/AT-43 Chrome journeys and consolidation perimeter guard checks; verified 2026-09-24.
<a id="vp-044"></a>
### VP-044 — Select component packages and demonstrate currency translation
**Current status:** PARTIAL  
**Milestone:** M7  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L35) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ConsolidationView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ConsolidationView.tsx).
**Module links:** [MOD-26](#mod-26) Consolidation.
**Original journey links:** [AT-42](#at-42), [AT-43](#at-43); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Pinned component snapshots, period/currency context and dated foreign closing-rate revisions exist. Missing/zero rates block results; source rows remain unchanged.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-044-E01 — Complete evidence action:** AT-44 warns on a replaced component revision, retains the old pinned rows, requires an explicit re-pin, and keeps the component Pending until review records its exact current source revision and evidence. Unit guards reject incompatible reporting basis, wrong-period packages, duplicate components and invalid effective dates. AT-43 verifies the reviewed generated artifact preserves exact package/source/rate revision lineage and its SHA-256. Focused unit guards 2/2 and focused Chrome journeys 3/3 passed 2026-09-25. VP-044 AC04 and story-level sign-off remain open.
- [x] **VP-044-E02 — Complete evidence action:** AT-43 renders the source amount, selected closing rate revision/date, translated cents and per-line rounding difference; `100.01 × 3.64 = 364.04` with a `0.0036` difference is asserted. Its reviewed generated artifact retains exact component/package/source/rate revisions and a verified SHA-256. AT-44 separately isolates a QAR 0.01 per-line translation residual while both source packages remain balanced and unchanged. Focused Chrome 2/2 passed 2026-09-25. VP-044-E01 and story criterion sign-off remain open.
- [x] **VP-044-R03 — Scope reconciled (2026-09-24):** Keep rates manually entered and versioned; only the disclosed closing-rate profile is calculated. Live feeds and unsupported average/historical methods stay excluded.
#### Original user story and dependencies
**Target modules:** 26  
**Prerequisites:** VP-042, VP-043  
**User story:** As a group accountant, I want version-pinned component packages and explicit rates, so that group figures have transparent sources and translation assumptions.
#### Full required implementation scope
Create component intake grid with readiness, period, basis, currency, package revision and review status. Pin one eligible package per component and expose drill-down. Add a manual versioned exchange-rate table with purpose/date/rate and mapping of applicable line-rate rules for a documented synthetic profile. Show original currency, rate, translated amount and any balancing translation difference explicitly. No online rate feed.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-044-AC01 | Given eligible component packages, when selected, then exact revisions are pinned and a subsequent replacement produces a stale-component warning rather than silent refresh. | SUBCASES VERIFIED 2026-09-24 — AT-44 retains the old snapshot, warns on source replacement, then re-pins the exact current source only after an attributable user action; full package eligibility remains open. |
| VP-044-AC02 | Missing rates, incompatible basis/period or unreviewed component packages block group output; missing amounts never default to zero. | SUBCASES VERIFIED 2026-09-24 — unit basis and period-book guards plus AT-44 pending-review output block; review must match exact component, revision, source version, basis and period. Generated-package lineage remains open. |
| VP-044-AC03 | The fixture’s translated values and rounding reconcile to published test expectations; every rate and translation difference is traceable. | SUBCASES VERIFIED 2026-09-24 — FX trace lists source, rate revision/date, translated cents and per-line rounding; deterministic `100.01 × 3.64 = 364.04` example yields `0.0036`. A second balanced-source fixture confirms the QAR 0.01 residual comes only from per-line rounding; both original sources remain balanced and unchanged, and no plug is added. Broader per-line rate methods remain unsupported. |
| VP-044-AC04 | An unapproved/unsupported translation rule shows a limitation and no fabricated consolidation result; component client packages remain unchanged. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1033).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-045"></a>
### VP-045 — Implement manual eliminations and group adjustment review
**Current status:** PARTIAL  
**Milestone:** M7  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L35) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ConsolidationView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ConsolidationView.tsx), [prototypeStore.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/store/prototypeStore.ts).
**Module links:** [MOD-26](#mod-26) Consolidation.
**Original journey links:** [AT-42](#at-42), [AT-43](#at-43); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Manual elimination journals now support saving and amending a draft with named in-perimeter counterparties, explanation, evidence reference and balanced debit/credit lines. Independent partner review can approve or return a saved draft with rationale and evidence; approval binds to the exact group perimeter, component package snapshots and closing-rate revisions. The AT-45 Chrome journey verifies self-review denial, a return with evidence, a subsequent amendment and independent approval; the approved $125 journal affects group output once while component books remain unchanged. Perimeter and FX-rate changes invalidate approval and retain the prior decision history.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-045-R01 — Requirement/scope reconciliation:** Manual draft, explicit submit, independent return/approval, amendment-after-return, counterparty and evidence-reference controls are implemented. 2026-09-24 Chrome/unit verification now confirms only submitted entries can be reviewed and submitted content cannot be amended; reconcile unmatched-item handling and complete counterparty/evidence semantics.
- [ ] **VP-045-E02 — Verification/evidence pending:** Unit and Chrome now prove a $100 receivable remains visible after eliminating only the confirmed $900 pair. Duplicate source inclusion, unsupported counterparty and mixed-context rejection, component-package replacement staleness and preserved journal revisions remain to verify. Perimeter and FX-rate invalidation, unbalanced lines, unsupported accounts and self-review denial have targeted coverage.
#### Original user story and dependencies
**Target modules:** 26  
**Prerequisites:** VP-044  
**User story:** As a group accountant and independent reviewer, I want balanced elimination journals, so that intercompany and group-only adjustments are separately explained.
#### Full required implementation scope
Add elimination register with component counterparties, account/line references, amount/currency, reason, evidence and journal lines. Support draft, submit, approve/return and amendment. Show intercompany pairs and unmatched differences for manual inspection; no automated matching engine. The bounded example includes a supported intercompany receivable/payable elimination and an explained unmatched-item case.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-045-AC01 | Given a balanced supported elimination, when independently approved, then it affects group output once and neither component book/package is modified. | Verified subcase: AT-45 creates, submits, returns, amends, resubmits and independently approves the $125 journal, includes it once in group output and confirms source books unchanged; full criterion remains open pending replacement/mixed-source edge coverage |
| VP-045-AC02 | Unbalanced lines, unsupported counterparties, mixed contexts and duplicate source inclusion are rejected. | Verified subcases: unit checks reject unbalanced lines, unknown accounts and self-review; unsupported counterparty, mixed-context and duplicate-inclusion matrix remains open |
| VP-045-AC03 | Unmatched intercompany amounts remain visible for human resolution; approval does not hide the difference by netting an unexplained plug. | Verified subcase: unit + Chrome show the 100 receivable remaining after the matching 900 is eliminated; broader manual resolution and linked unmatched-item evidence remain open |
| VP-045-AC04 | A component/rate/perimeter change stales dependent elimination approval and preserves the previous decision and journal revision. | Verified subcases: perimeter revisions and FX-rate changes invalidate approval and preserve return history; component replacement and explicit immutable journal-revision evidence remain open |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1050).
**Next evidence update:** Test HEAD `804ccc8ee59143dc96bc2fcb5b70e65e55616570`; app source `188ee3bd5c2ded7a241552fe2c5370e1008fcf98`; fixture `GRP-01` / `ENG-26002`; criteria AC01/AC02/AC03/AC04 verified subcases map to `tests/unit/calculations.test.ts`, `tests/unit/guards.test.ts` and `tests/e2e/app.test.ts` AT-45/VP-045-AC03 and AT-38/40. Full suite: lint, 172/172 unit and 74/74 E2E; production deployment `f3a56591-1b3a-499b-99dc-84987d3daf5f`, source `188ee3b`, 2026-09-24. Full story acceptance remains open.
<a id="vp-046"></a>
### VP-046 — Produce, review and export consolidated output
**Current status:** PARTIAL  
**Milestone:** M7  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L35) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ConsolidationView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ConsolidationView.tsx), [calculations.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/calculations.ts).
**Module links:** [MOD-26](#mod-26) Consolidation.
**Original journey links:** [AT-42](#at-42), [AT-43](#at-43); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
The supported pinned-group calculation balances including current-period result and approved elimination. Source-TB non-mutation and missing/unsupported inputs have recorded coverage.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-046-R01 — Requirement/scope reconciliation complete (2026-09-24):** A separate persisted group-output package now captures the exact group, component, rate and approved-elimination lineage; an independent partner approves/returns the revision; current approved artifacts can be integrity-verified and downloaded.
- [x] **VP-046-E02 — Verified supported scenarios (2026-09-24):** AT-42/AT-43/AT-45 exercise same-currency and closing-rate FX group outputs with source drill-down; persisted exports bind the group/perimeter, component source/package versions, rates, elimination decisions/history, totals and artifact digest. Post-review rate change makes the export stale and blocks download.
#### Original user story and dependencies
**Target modules:** 26  
**Prerequisites:** VP-044, VP-045  
**User story:** As a group manager, I want a consolidated statement and reconciliation view, so that I can follow the complete group-reporting demonstration from source to reviewed output.
#### Full required implementation scope
Display component columns, translated totals, eliminations, group adjustments and consolidated totals; include source drill-down, scope summary and validation. Build a separate group package/review flow using the shared artifact and approval components. Include a complete end-to-end same-currency scenario and a documented simple translation scenario; describe unsupported accounting methods rather than claiming a production consolidation engine.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-046-AC01 | Given compatible reviewed components and approved adjustments, when the supported fixture is consolidated, then consolidated = translated components + approved group adjustments/eliminations. | Verified subcase: AT-42 fixed fixture and AT-45 approved elimination reconcile the supported output; broader same-currency/FX expected-value matrix remains open |
| VP-046-AC02 | Statement equations and reconciliation columns agree with fixed expected fixture values; unresolved required inputs prevent a ready-for-review state. | Verified subcases: AT-42 statement equation and unresolved component/rate/review gates; complete fixed-value and FX matrix remains open |
| VP-046-AC03 | Group output review binds to the exact perimeter/component/rate/elimination revisions; edits require fresh review. | Verified subcases: store checks reject changed perimeter, component snapshot and elimination inputs; Chrome proves a post-approval rate revision marks the artifact stale and blocks download; broader lifecycle matrix remains open |
| VP-046-AC04 | Exported group demo artifacts preserve these references and exclude unrelated client information; no group action posts into component or firm ledgers. | Verified subcases: same-currency and FX Chrome runs check persisted JSON digest, watermark, exact two group entities, input references and unchanged source books; broader story sign-off remains open |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1067).
**Next evidence update:** Tested repository HEAD `06ac059cf167f32ea2a24b0309185572bd18e668`; application source `8d30a8291743a90ad544cb0537ea0f6c4771657a`; fixture `GRP-01` / `ENG-26001` / `ENG-26002`. Criteria AC01–AC04 subcases map to `tests/e2e/app.test.ts` AT-42/AT-43/AT-45 and `tests/unit/guards.test.ts` group-output fingerprint/immutability guard. Full suite: lint, 170/170 unit, 73/73 E2E. Cloudflare Pages deployment `4de94450-21ec-495b-99dc-84987d3daf5f` is Production on `production`, source `8d30a82`, 2026-09-24. Full story acceptance remains open for criterion-level closure and remaining edge matrices.
<a id="vp-047"></a>
### VP-047 — Complete client evaluation, conditions and manual continuance
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M8  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L36) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AuditAcceptanceView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AuditAcceptanceView.tsx).
**Module links:** [MOD-27](#mod-27) Client Acceptance.
**Original journey links:** [AT-09](#at-09), [AT-44](#at-44); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Five manual evidence-backed screening checks, a pending recommendation, a separate assigned-partner decision and prohibited/missing-evidence guards are recorded. Manual changed-facts continuance creates one fresh next-period draft with empty work/financial/professional histories.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 27  
**Prerequisites:** VP-011, VP-012, VP-024  
**User story:** As an onboarding coordinator, compliance reviewer and partner, I want editable evaluation cases and separate decisions, so that client acceptance is supported by recorded facts rather than four receipt checkboxes.
#### Full required implementation scope
Extend the existing cases with typed question definitions, answers, evidence references, missing-item requests, conditions and decision history. Use the existing source question banks where applicable to the agreed scope; historical tax/payroll/provider requirements do not become new active modules or mandatory questions. Keep collection, recommendation and partner decision separate. Add manual continuance with prior/current differences and a new-period draft action that does not copy evidence or approvals.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-047-AC01 | Given an incomplete case, when submitted, then required in-scope answers/evidence are identified and missing items can be requested without declaring them verified. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-047-AC02 | An independent compliance recommendation and partner decision require rationale; no risk score automatically accepts the client and unresolved prohibitions/conditions are visible. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-047-AC03 | Acceptance updates the linked engagement eligibility and permits idempotent local workspace preparation, but does not imply real identity screening or live SharePoint provisioning. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-047-AC04 | Manual continuance creates fresh decision context; a new-period draft has no copied source balances, samples, approvals, completed tasks or automatic recurrence schedule. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1086).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-048"></a>
### VP-048 — Build a complete audit planning workspace
**Current status:** PARTIAL  
**Milestone:** M8  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L37) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AuditPlanningView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AuditPlanningView.tsx).
**Module links:** [MOD-28](#mod-28) Audit Planning.
**Original journey links:** [AT-44](#at-44); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Versioned plans, materiality calculations, team/timing views and independent plan return/rework/review are represented. Risk changes can create superseding plans and require fieldwork reassessment.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-048-E01 — Verification/evidence:** COMPLETE — 2026-09-25 local full run (176/176 unit; 74/74 E2E) at `0077cc6` plus uncommitted changes. `AuditPlanningView.tsx` requires explicit benchmark/performance/trivial percentages, rationale, valid in-scope staff assignments and dates; deterministic amounts and invalid/missing inputs are covered by unit and VP-049 Chrome assertions. Criterion-level sign-off remains open.
- [x] **VP-048-R02 — Requirement/scope reconciliation:** Check any remaining hard-coded threshold/team/timing assumption against the contract; implement editable bounded fixture inputs where required, without asserting professional recommended rates. — DONE 2026-09-25: removed the prepopulated benchmark (client-revenue fallback and fixed default), the canned scope rationale, the four hard-coded team members with fixed dates, the four hard-coded milestones, the pre-approved reviewer note and the hard-coded significant areas; all are now deliberate inputs. Review feedback messages are truthful per outcome: approval clears the gate for that version; return keeps the gate open and requires recorded rework reasons.
- [x] **VP-048-E03 — Verification/evidence:** COMPLETE — 2026-09-25 full Chrome run 74/74. The VP-049 plan amendment journey changes approved materiality, supersedes the old revision with a reason, clears approval, reopens a cleared procedure and marks its prior conclusion stale; no authority or report release is granted. Criterion-level sign-off remains open.
#### Original user story and dependencies
**Target modules:** 28  
**Prerequisites:** VP-012, VP-047  
**User story:** As a preparer, manager and partner, I want a versioned plan with materiality and responsibilities, so that the audit approach can be reviewed before fieldwork.
#### Full required implementation scope
Add plan tabs for entity/service scope, team, timing, materiality, significant areas and planning documents. Materiality captures benchmark/source, selected percentage, calculated amount, rationale and separately entered performance/clearly-trivial thresholds for the fixture. Dates and staff are assigned manually. Preserve the current planning illustration but replace single-checkbox readiness with identifiable review records. Calculations remain illustrative, never recommended professional thresholds.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-048-AC01 | Given a draft plan, when submitted, then scope, required rationale and valid assignments are checked before independent review. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-048-AC02 | Calculated fixture amounts match deterministic expected values; missing benchmark/source or invalid thresholds produce clear errors rather than recommended defaults. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-048-AC03 | Editing an approved plan/materiality creates a new revision and shows affected fieldwork/conclusion review as stale where applicable. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-048-AC04 | A plan status does not grant professional authority or release a report; the screen clearly distinguishes entered assumptions, calculations and human judgments. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1103).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-049"></a>
### VP-049 — Add editable risks, audit programs and procedure linkage
**Current status:** PARTIAL  
**Milestone:** M8  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L38) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AuditRisksProgramsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AuditRisksProgramsView.tsx).
**Module links:** [MOD-29](#mod-29) Risks & Audit Programs.
**Original journey links:** [AT-45](#at-45); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Risks/assertions/owners and reciprocal procedure links are editable. Reusable program templates are drafted, independently published, applied, revised and retired with pinned history. Risk changes stale plans and require procedure reassessment; plan return/rework is exercised.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-049-E01 — Verification/evidence:** COMPLETE — unit regression covers one procedure reciprocally linked to multiple risks, two risk-driven plan revisions, immutable prior plan rationales, repeated procedure reassessment, reviewer return/rework/resubmission/re-clearance, and unchanged procedure/template snapshots. Focused unit 1/1, full unit 206/206, full Chrome 94/94; 2026-09-26. Story criteria remain open for full acceptance.
- [x] **VP-049-E02 — Verification/evidence:** COMPLETE — the focused store guard rejects client, inactive and out-of-scope professional owners without mutation; the existing reciprocal-link unit case rejects cross-engagement links; focused Chrome shows only active in-scope professionals in the risk-owner selector and exposes coverage gaps after applying a fresh template; the template journey publishes/applies v1 and v2 and proves retirement leaves both applications unchanged. `2026-09-26`.
#### Original user story and dependencies
**Target modules:** 29  
**Prerequisites:** VP-048  
**User story:** As a preparer and reviewer, I want risk and audit-program registers, so that planned procedures visibly respond to the identified risks and assertions.
#### Full required implementation scope
Create risk records with title, area/assertions, description, rationale, response and owner; link procedures/programs by ID. Add reusable program templates for supported audit areas and manual copy into an engagement plan. Procedures have objective, instructions, assignee, required evidence and review status. Keep risk labels/rating manually selected; no AI scoring, automatic program generation or tax program.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-049-AC01 | Given a risk, when linked to procedures, then risk detail and program detail show reciprocal links and unresolved coverage gaps. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-049-AC02 | Manual template application copies current instructions with fresh procedure IDs, but no prior results, evidence or approvals. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-049-AC03 | A changed approved risk/program creates a new plan revision and explicit review impact; retired templates do not change existing engagements. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-049-AC04 | Cross-engagement links, invalid assignments and unsupported service templates are rejected; a static risk card alone cannot count as an implemented risk workflow. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1120).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-050"></a>
### VP-050 — Implement procedure-level fieldwork execution
**Current status:** PARTIAL  
**Milestone:** M8  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L39) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AuditRisksProgramsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AuditRisksProgramsView.tsx).
**Module links:** [MOD-30](#mod-30) Audit Fieldwork.
**Original journey links:** [AT-45](#at-45); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Procedure work performed, conclusions, current adequate evidence or explicit limitation, preparer submission and independent clearance exist. Append-only fieldwork history retains actor, program/template version, status, prior/current work and conclusions, evidence limitation, and reviewer return rationale. The recorded exception remains visible; changes invalidate release basis.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-050-E01 — Verification/evidence:** COMPLETE — Chrome exercises PRC-01 return/rework/resubmission/re-clearance with visible eight-entry actor/status/work history and PRC-04 exception submission/clearance in a second program; unit verifies distinct history context for applied template versions 1 and 2. Focused VP-050 Chrome 1/1; full unit 216/216; full E2E 96/96; 2026-09-26. Criterion-level and overall story acceptance remain open.
- [x] **VP-050-R02 — Requirement/scope reconciliation:** Reconciled against VP-049 and the original story: VP-049 owns reusable program-template authoring, publishing, application, revision and retirement; VP-050 owns execution and review of assigned procedure results. The stories have distinct boundaries, so no duplicate template-administration system is required. — DONE 2026-09-25.
#### Original user story and dependencies
**Target modules:** 30  
**Prerequisites:** VP-049  
**User story:** As an assigned preparer and reviewer, I want individual procedure results and exceptions, so that fieldwork progress reflects performed and reviewed work rather than just attached files.
#### Full required implementation scope
Add a procedure execution grid/detail with work performed, result, evidence links, conclusion, exception flag, preparer and reviewer. Allow draft/save, submit, return and independent clearance. Link a procedure to relevant workpaper, sample or finding without merging those records. Show required evidence and unresolved exceptions before submission; use the shared view-local error/stale revision contracts.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-050-AC01 | Given an assigned procedure, when results are submitted, then required work description/evidence or a justified documented limitation is present. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-050-AC02 | An exception can be linked to a finding and remains visible after procedure completion; completion does not silently clear it. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-050-AC03 | Preparer cannot independently clear the same work; source/result/evidence changes require renewed review for the affected procedure. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-050-AC04 | Fieldwork counts agree with individual states; no upload automatically completes an entire audit area and no task-completion shortcut grants clearance. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1137).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-051"></a>
### VP-051 — Complete populations, manual sample selection and test results
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M8  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L40) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [SamplingView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/SamplingView.tsx), [populationImport.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/populationImport.ts).
**Module links:** [MOD-31](#mod-31) Populations & Sampling.
**Original journey links:** [AT-45](#at-45); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. CSV/XLSX populations check period/currency/GL frame, require selection rationale, record test or limitation outcomes, link exceptions to findings and require independent version-bound evaluation. Replacement preserves old source/results and forces reselection/review.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 31  
**Prerequisites:** VP-036, VP-050  
**User story:** As a preparer and reviewer, I want source-bound populations and item-level testing, so that the sampling workflow can be demonstrated beyond three hard-coded rows.
#### Full required implementation scope
Support bounded population import or explicit selection from a permitted source dataset, with item ID/value/date/counterparty, objective, period and source reconciliation. Add manual/specific-item selection, selection rationale, selected/remainder values and per-item test results/evidence/exceptions. Version the selection and review its evaluation. No statistical confidence or sampling assurance is inferred; a full statistical engine is not required for this prototype.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-051-AC01 | Given a population, when selecting items manually, then selected totals/counts and untested remainder reconcile without duplicates. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-051-AC02 | Wrong-period/currency sources, duplicate item IDs and incomplete population tie-out are displayed and prevent a misleading completed evaluation. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-051-AC03 | Each selected item has a recorded result or explicit limitation; exceptions link to findings and a human evaluation distinguishes tested from untested items. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-051-AC04 | Replacing the population preserves prior selections as historical and requires explicit reselection/review; no results or assurance conclusions carry forward automatically. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1154).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-052"></a>
### VP-052 — Complete workpaper creation, template administration and reassignment
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M8  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L41) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [WorkpapersView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/WorkpapersView.tsx).
**Module links:** [MOD-32](#mod-32) Workpapers.
**Original journey links:** [AT-46](#at-46); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Fresh workpaper creation from a published template keeps template/version/guidance/procedure provenance, draft versions, exact evidence/workbook pins, eligible preparer/reviewer separation and reasoned reviewer reassignment. Assigned-reviewer clearance is covered.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 32  
**Prerequisites:** VP-021, VP-049, VP-050  
**User story:** As a preparer and manager, I want configurable workpapers using the existing execution workspace, so that new audit areas can use the demonstrated guidance/evidence/review lifecycle.
#### Full required implementation scope
Retain the six-tab workpaper workspace. Add create/copy from published workpaper template, edit draft scope, assign distinct preparer/reviewer people, applicability with rationale, completed workbook reference, conclusion and version history. Workpaper templates have guidance, procedure references and genuine sample files; they remain separate from job templates. Add reviewer reassignment with reason and eligibility checks, not a frozen role selector.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-052-AC01 | Given a published workpaper template, when manually instantiated, then a fresh draft with template provenance is created without old evidence, conclusions or clearance. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-052-AC02 | Work performed, workbook/evidence references and required conclusion support submission; a reviewer can return/clear only the exact submitted revision. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-052-AC03 | Not-applicable changes require rationale and appropriate human review, cannot conceal unresolved findings, and update the progress denominator transparently. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-052-AC04 | Template/file extensions are genuine, reassignment preserves history, and an evidence/source replacement keeps previous clearance historical while requiring current reassessment. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1171).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-053"></a>
### VP-053 — Add a reusable, version-aware evidence catalogue
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M8  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L42) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [EvidenceCatalogueView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/EvidenceCatalogueView.tsx), [artifactStore.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/artifactStore.ts).
**Module links:** [MOD-33](#mod-33) Evidence.
**Original journey links:** [AT-20](#at-20), [AT-46](#at-46); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Exact-version evidence replacement, adequacy, freshness reassessment, reasoned linking/unlinking, client projections and post-release unlink preservation are covered. Existing issued manifest identities remain unchanged.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 33  
**Prerequisites:** VP-021, VP-024  
**User story:** As a preparer and reviewer, I want a shared evidence register, so that one source can support multiple permitted procedures without inconsistent copies.
#### Full required implementation scope
Create evidence records with title, source type, exact document/source revision, received date, classification, adequacy status, owner and related procedures/workpapers/reconciliations/findings. Distinguish an evidence reference from original file bytes and from a professional conclusion. Permit linking/unlinking with history, source-version comparison and explicit replacement impact. Use metadata search, not AI/OCR or a separate provider repository.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-053-AC01 | Given accepted request evidence, when linked elsewhere, then each reference resolves to the same scoped evidence/document version and preserves provenance. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-053-AC02 | Linking an inaccessible, wrong-client/period or replaced version is rejected or clearly flagged; no filename-only matching silently selects a document. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-053-AC03 | Changing evidence adequacy/replacing a version identifies affected review subjects while retaining their previous historical evidence. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-053-AC04 | Client-facing projections never reveal internal evidence tags, restricted source details or unrelated linked subjects; removal does not erase issued-package provenance. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1188).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-054"></a>
### VP-054 — Implement findings and differences as separate professional records
**Current status:** PARTIAL  
**Milestone:** M8  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L43) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [FindingsView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/FindingsView.tsx).
**Module links:** [MOD-34](#mod-34) Findings & Differences.
**Original journey links:** [AT-46](#at-46); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Sourced qualitative and monetary findings, sample-exception promotion, signed/gross per-currency amounts, attributable disposition revisions and reflected-journal correction links exist. Unresolved significant findings block release.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-054-E01 — Verification/evidence:** COMPLETE — Chrome records an unresolved Significant finding, confirms it appears as a blocker in Release Completion and Financial Packages and as Uncorrected in Report Centre, then reasonedly waives it and confirms the release gate resolves. Existing corrected-by-client behavior and disposition history are also exercised. Full unit 216/216 and E2E 96/96; 2026-09-26. VP-054 story criteria remain open.
- [x] **VP-054-E02 — Verification/evidence:** COMPLETE — A unit check and the Chrome journey snapshot a sourced qualitative/no-amount finding's engagement, category, severity and linked procedure/evidence/workpaper references, drive Uncorrected then reasoned Waived-as-immaterial dispositions and a browser reload, and assert the provenance tuple stays immutable (amount/currency still absent, no monetary value invented) while release treatment changes only after a human disposition. Full unit 216/216 and E2E 96/96; 2026-09-26 (verification.md entry 69). Story criteria and sign-off remain open.
#### Original user story and dependencies
**Target modules:** 34  
**Prerequisites:** VP-038, VP-050, VP-051, VP-053  
**User story:** As a preparer, manager and reviewer, I want a proper finding and misstatement register, so that issues are evaluated rather than being confused with review queries.
#### Full required implementation scope
Add finding type, title, description, affected account/assertion, source/procedure/evidence, amount/currency where applicable, qualitative concern, management response, proposed correction, owner and disposition. Link to adjustment journals and review points without treating them as the same object. Show corrected/uncorrected status and both signed/net and gross absolute monetary totals by currency. Materiality comparison is contextual information, not an automatic conclusion.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-054-AC01 | Given an exception, when promoted to a finding, then source/procedure/sample/evidence references remain traceable and the originating exception remains visible. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-054-AC02 | Qualitative findings can exist without amounts; monetary findings require valid currency and preserve gross amounts even when positive/negative differences offset. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-054-AC03 | Accepting a proposed correction is not evidence of external posting; reporting inclusion/reflection states come from the linked reviewed journal decision. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-054-AC04 | Closing/reopening a finding requires permitted human rationale; unresolved significant matters remain visible in completion and are not hidden by clearing a review point. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1205).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-055"></a>
### VP-055 — Extend review-point assignment, filtering and response evidence
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M8  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L44) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ReviewDeskView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ReviewDeskView.tsx).
**Module links:** [MOD-35](#mod-35) Review Points.
**Original journey links:** [AT-47](#at-47); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Revision-pinned workpaper/finding review points support reasoned assignment, scoped cross-engagement/personal queues, response evidence, independent clearance, reopened stale responses, filters and CSV/client exclusions.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 35  
**Prerequisites:** VP-016, VP-052, VP-053  
**User story:** As a reviewer and preparer, I want a cross-engagement review desk with traceable responses, so that review questions can be owned, answered and cleared independently.
#### Full required implementation scope
Retain raise/respond/clear/reopen. Add subject types beyond workpapers where appropriate, authorized assignee/reviewer changes, severity, due date, filters and linked response evidence. Keep thread history and exact subject revision. A point may relate to a finding but clearing it does not close that finding. Provide a personal review queue and links back to source subjects.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-055-AC01 | Given a review point, when assigned/reassigned, then eligible people, reason and history are recorded and personal queues update without widening scope. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-055-AC02 | A response can link revised evidence but cannot self-clear; issuer/authorized substitute must independently assess the current revision. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-055-AC03 | Relevant subject changes after clearance produce a stale/reopened state while retaining the original response and clearance. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-055-AC04 | Filters/counts and exports respect exact engagement scope; internal review text never appears in client PBC/message views without a separately composed client-safe message. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1222).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-056"></a>
### VP-056 — Complete reusable human approvals and independent EQR
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M8  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L45) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ApprovalsEQRView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ApprovalsEQRView.tsx), [ClientPortalView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ClientPortalView.tsx).
**Module links:** [MOD-36](#mod-36) Reviews & Approvals.
**Original journey links:** [AT-25](#at-25), [AT-47](#at-47); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Assigned active scoped EQR, substitution and team independence, per-engagement concerns, deliberate package presentation and evidence/rationale-backed client management decisions are represented. Revision/generation changes make decisions stale with history retained.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 36  
**Prerequisites:** VP-019, VP-042, VP-048, VP-055  
**User story:** As a manager, management approver, partner or EQR, I want consistent revision-bound approval queues, so that separate professional and management responsibilities remain clear.
#### Full required implementation scope
Extend the existing package approval flow into reusable queues for relevant subjects without a general workflow-builder UI. Record subject/revision, actor/person, role/scope, decision, time, rationale and evidence. Preserve management responsibilities and professional authorization as different decision types. Add reviewer assignment/substitution with reason, no-self-approval and EQR eligibility/concern handling; EQR state must belong to the engagement, not one global shared object.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-056-AC01 | Given two engagements, when an EQR concern/decision changes in one, then the other engagement’s eligibility, concerns and approval state are unaffected. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-056-AC02 | A person cannot approve their own prepared subject by switching roles; a partner cannot also complete EQR for the same engagement. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-056-AC03 | Management sees only the deliberately presented package and records a human decision/acknowledgement without eSignature capture or provider calls. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-056-AC04 | Changed artifacts, source context or resolved concerns require a current decision as applicable; historical approvals are retained and never relabelled as approvals of a new revision. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1239).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-057"></a>
### VP-057 — Complete the human-controlled completion and release workspace
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M9  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L46) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ReleaseCompletionView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ReleaseCompletionView.tsx), [artifactStore.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/artifactStore.ts).
**Module links:** [MOD-37](#mod-37) Completion & Release.
**Original journey links:** [AT-48](#at-48); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Current acceptance/source/mapping/workpaper/finding/review/management/partner/EQR gates control release. Exact persisted artifact IDs/digests are frozen; tampered bytes, stale candidates and duplicate same-generation issue are rejected.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 37  
**Prerequisites:** VP-042, VP-054, VP-056  
**User story:** As a manager and partner, I want an explicit completion checklist and exact-artifact release, so that the demonstration cannot release incomplete or unreviewed work.
#### Full required implementation scope
Extend the current release gates with a readable checklist of acceptance/terms, applicable workpapers, findings/differences, reviews, management presentation, required partner/EQR decisions and selected output artifacts. Add permitted recipient selection and preview of what each receives. A manual command prepares a frozen local candidate; a separate command records demo release/dispatch. Do not gate release on Purview or eSignature integrations.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-057-AC01 | Given an unresolved mandatory gate, when preparing/releasing, then the action is blocked with links to the specific missing record and no release event is created. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-057-AC02 | Given current approvals and selected artifacts/recipients, when released, then the exact package manifest and artifact references are preserved once. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-057-AC03 | Duplicate clicks do not create duplicate release identities; a source/artifact change after preparation invalidates the candidate. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-057-AC04 | Client delivery contains only selected permitted artifacts, excludes private workpapers by default, and is labelled a local dispatch simulation, not actual email or legal issue. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1258).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-058"></a>
### VP-058 — Demonstrate corrections, amendments and reissue lineage
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M9  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L46) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ReleaseCompletionView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ReleaseCompletionView.tsx), [prototypeStore.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/store/prototypeStore.ts).
**Module links:** [MOD-37](#mod-37) Completion & Release.
**Original journey links:** [AT-48](#at-48); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Amendment retains predecessor manifest/artifact identities, resets candidate/current approvals and requires fresh affected decisions before reissue. Original output remains separately identifiable.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 37  
**Prerequisites:** VP-057  
**User story:** As a manager and partner, I want an explicit amendment/reissue workflow, so that corrections do not overwrite the originally released package.
#### Full required implementation scope
Add “Prepare amended version” from a released package with reason, changed inputs, impact summary, new revision and predecessor link. Repeat affected reviews and recipient checks; do not copy approval currentness. Record a replacement/superseding demo release linked to the earlier release. Show original and amended artifacts side by side and preserve their separate acknowledgements.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-058-AC01 | Given a released package, when an amendment starts, then the original artifact/manifest remains readable and unchanged. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-058-AC02 | New source/notes/journals produce a new package identity and require current affected reviews before reissue. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-058-AC03 | An amended release cannot reuse old approval or acknowledgement as evidence for the new content; lineage is visible in staff and permitted client views. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-058-AC04 | Cancelling an amendment leaves the original release intact; no silent replacement, external recall or live email is implied. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1275).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-059"></a>
### VP-059 — Finish Records & Archive without Microsoft Purview
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M9  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L47) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [RecordsArchiveView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/RecordsArchiveView.tsx), [artifactStore.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/artifactStore.ts).
**Module links:** [MOD-38](#mod-38) Records & Archive.
**Original journey links:** [AT-48](#at-48); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Original/successor released artifacts are copied and hash-checked locally. Optional retention metadata, corrections/history, predecessor linkage and hold/handover tests are recorded; no Purview or server immutability is claimed.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 38  
**Prerequisites:** VP-057, VP-058  
**User story:** As a records administrator, I want a searchable logical archive and application-only record metadata, so that I can track completed engagements without an external retention integration.
#### Full required implementation scope
Add archive register/detail with engagement, release version, archive date/by, manifest, exact document references, optional retention-until metadata, application hold flag/instruction and handover request. Archive is a manual action over a released snapshot; metadata corrections and successor archives retain history. Distinguish ordinary client-owned documents from restricted internal workpapers. No physical deletion, retention-provider interface or no-op success adapter.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-059-AC01 | Given a released package, when archived, then its exact release/artifact/document identities appear in a stable local manifest and duplicate archival is avoided. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-059-AC02 | An application hold blocks a simulated disposition/handover action where policy requires; the UI explicitly states it does not prevent direct SharePoint modification/deletion. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-059-AC03 | Retention date entry never schedules deletion or asserts a legal requirement; missing dates and restricted handover requests remain explicit metadata/review states. | Repository story-level Verified; individual test locator not separately assigned here |
| VP-059-AC04 | Purview, provider-lock verification, external retention success and mandatory compliance configuration are absent from the active module and its release prerequisites. | Repository story-level Verified; individual test locator not separately assigned here |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1292).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-060"></a>
### VP-060 — Create a practical report centre with reconciled metrics
**Current status:** VERIFIED (repository-reported)  
**Milestone:** M10  
**Tracker priority:** Regression  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [x] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L10) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [ReportingCentreView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/ReportingCentreView.tsx).
**Module links:** [MOD-01](#mod-01) Practice Dashboard, [MOD-16](#mod-16) Reporting & Analytics.
**Original journey links:** [AT-49](#at-49); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Repository marks this story Verified. Sixteen report views, every CSV field/source mapping, independently recomputed WIP/utilization/compliance, role-specific manager/partner/billing/records catalogues, selected-client exports and browser print actions have recorded coverage.
#### Pending workNo new missing implementation is asserted for this story by the current status record. Preserve its functionality and rerun its criterion-linked regression checks after changes to dependencies. The “Verified” assertion is repository-reported, not a new independent run in this document.
#### Original user story and dependencies
**Target modules:** 01, 16  
**Prerequisites:** VP-005, VP-029, VP-033, VP-046, VP-054  
**User story:** As a manager, partner or billing officer, I want filtered operational and practice-finance reports, so that I can understand work and economics without AI or external BI.
#### Full required implementation scope
Provide report pages for active clients/engagements, jobs/tasks by status and overdue, PBC outstanding, work by person, approved time, billable/non-billable time, budget variance, invoice/credit/receipt registers and AR aging. Add permitted audit findings/review and package-readiness reports. Use §5.5 definitions, show as-of/source context, and provide CSV/print. Optional profitability shows unknown when cost input is missing; do not call invoicing statutory revenue.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-060-AC01 | Given a report filter, when totals are calculated, then drill-down rows and exports reconcile to the same scoped dataset. | Verified — `tests/e2e/app.test.ts` AT-49/AT-60 checks all 16 CSV row sets against independent source calculations or the rendered report, plus client-filtered export. |
| VP-060-AC02 | Changing a source time/invoice/receipt/task record updates relevant reports without independent manually maintained counters. | Verified — AT-49/AT-60 changes approved time, invoice and its line total, receipt and task in deterministic persisted fixture state, reloads the compiled app, and observes each changed report row. |
| VP-060-AC03 | Different currencies and unknown cost information are shown honestly; budget, billing-rate value and actual delivery cost are not conflated. | Verified — AT-49/AT-60 changes one engagement to USD and confirms currency-specific rows plus Unknown mixed-currency aggregate metrics; `tests/unit/calculations.test.ts` VP-060 confirms missing approved-time rate remains unknown. |
| VP-060-AC04 | Client/persona restrictions apply to filters, totals and downloads; reports contain no AI narrative, semantic analysis or Power BI integration. | Verified — AT-49/AT-60 verifies manager, billing and records report catalogues, selected-client CSV scope, and network isolation in the full Chrome suite. |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1311).**Acceptance evidence:** Commit `3919046094f14be627f282cadfb234d105a78115` (2026-09-24); deterministic `createInitialState()` browser fixture. Criteria AC01–AC04 map to `tests/e2e/app.test.ts::AT-49/AT-60` and, for missing-rate handling, `tests/unit/calculations.test.ts::recorded WIP rates (VP-060)`. Run: `npm run lint && npm run test:unit && npm run test:e2e` — PASS, 168/168 unit and 71/71 E2E (5 static + 66 Chrome). Reviewer: recorded automated acceptance evidence, 2026-09-24.
<a id="vp-061"></a>
### VP-061 — Implement ordinary global search and safe cross-links
**Current status:** PARTIAL  
**Milestone:** M10  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L26) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [Shell.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/layout/Shell.tsx).
**Module links:** [MOD-17](#mod-17) Search & Centralized Client View.
**Original journey links:** [AT-18](#at-18), [AT-50](#at-50); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Search supports local record types, text/type/permitted client/engagement filters and scoped snippets. Shared-document, staff-client, job and invoice result navigation is exercised; the latest search increment also selects/highlights exact task targets and selects exact workpapers. Ungranted choices and internal client-visible text are excluded.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [x] **VP-061-E01 — Verification/evidence pending:** Chrome search journeys open and select the exact contact (asserted by contact name and selected-row state), finding and PBC records, alongside task/workpaper exact targets. The AT-50 VP-061 journey passes in the 2026-09-25 full E2E run; broader persona/grant combinations remain under E02.
- [ ] **VP-061-E02 — Verification/evidence pending:** Test unavailable/archived targets, revoked scopes and all person/grant combinations through search and resulting detail views.
- [x] **VP-061-R03 — Requirement/scope reconciliation:** Reconciled against VP-061 implementation scope and global exclusions: bounded local metadata/text search is required; OCR, vector/semantic search, model services and external search providers are excluded. Existing deterministic search fits the contract. — DONE 2026-09-25.
#### Original user story and dependencies
**Target modules:** 17  
**Prerequisites:** VP-008, VP-020, VP-027, VP-033, VP-053, VP-054  
**User story:** As a permitted user, I want one deterministic search across business records, so that I can find context without searching embedded requirements or unrelated client data.
#### Full required implementation scope
Index bounded local text/metadata for clients, contacts, engagements, jobs/tasks, documents, communications, invoices, requests, workpapers and findings. Support text, record type and context filters, concise snippets and exact navigation. Search metadata/text already in the prototype; no vector store, model, external search provider or document OCR. Keep historical requirements search separate from product-record search.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-061-AC01 | Given a term matching several record types, when searched, then grouped results use actual record IDs and open the right context/revision. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-061-AC02 | An unauthorized record never contributes title, snippet, count, autocomplete or result ordering visible to a narrower user. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-061-AC03 | Editing/archiving a record updates search availability consistently; deleted/unavailable targets lead to a safe unavailable view, not a different record. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-061-AC04 | Typing ordinary markup/text does not execute code; bounded search is responsive at the agreed fixture size and no external request is made. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1328).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-062"></a>
### VP-062 — Complete firm and application administration
**Current status:** PARTIAL  
**Milestone:** M10  
**Tracker priority:** P2  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md#L48) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [AdministrationView.tsx](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/AdministrationView.tsx).
**Module links:** [MOD-39](#mod-39) Administration.
**Original journey links:** [AT-04](#at-04), [AT-51](#at-51); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Administration provides firm settings and dedicated business-editor access alongside identities, grants and attributable access history. Technical and professional permissions are intended to remain separate.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-062-E01 — Verification/evidence pending:** Verify each setting is consumed prospectively by the intended form/preview, with actor/reason, stale revision and invalid setting behavior.
- [ ] **VP-062-E02 — Verification/evidence pending:** Test numbering collisions, logo-unavailable states and defaults without rewriting issued invoices, released packages or template-derived jobs.
- [ ] **VP-062-R03 — Requirement/scope reconciliation:** Reconcile supported service/email/workpaper/business settings against dedicated editors; add only missing contractual controls, not duplicated data stores.
#### Original user story and dependencies
**Target modules:** 39  
**Prerequisites:** VP-015, VP-019, VP-026, VP-029, VP-034  
**User story:** As a system administrator and relevant business owner, I want one bounded settings area, so that configuration is usable without granting administrators professional authority.
#### Full required implementation scope
Provide firm name/logo placeholder, locale/timezone/display settings, synthetic contact defaults, supported services, job/email/workpaper templates, billing numbering/due terms, and accounting display/profile options. Route role-specific business settings to their proper owners; technical administration cannot approve methodology, journals or reports. Reuse dedicated editors rather than a second settings-only data store. Excluded product toggles must not be present.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-062-AC01 | Given a valid setting change, when saved, then forms/previews use it where appropriate and the local configuration history records actor/reason. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-062-AC02 | Numbering avoids collisions and applies prospectively; changed defaults do not rewrite issued invoices, released packages or existing template-based jobs. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-062-AC03 | Business-role restrictions apply to cost rates, professional templates and accounting review; system-admin identity alone is insufficient. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-062-AC04 | Invalid settings, stale revisions and unavailable logos/files show clear validation; no actual tenant/hosting secrets, Purview, tax, AI or payment configuration is offered. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1345).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-063"></a>
### VP-063 — Add executable cross-module browser acceptance and regression tests
**Current status:** PARTIAL  
**Milestone:** M10  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [app.test.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/tests/e2e/app.test.ts), [guards.test.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/tests/unit/guards.test.ts), [calculations.test.ts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/tests/unit/calculations.test.ts).
**Module links:** Cross-cutting; applies to every module.
**Original journey links:** [AT-03](#at-03), [AT-53](#at-53); [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
Fresh candidate verification: `npm run lint` and `npm run build` pass; `npm run test:unit` passes 231/231; `npx tsx --test --test-concurrency=1 tests/e2e/*.test.ts` passes 105/105 (5 static + 100 Chrome); `npm run legacy:check` passes. AT-53 opens all staff navigation routes in Chrome; AT-03/VP-063 interception observes no external HTTP requests across the exercised browser journeys. This is current tested-path evidence, not complete evidence for all original criteria or a product completion claim.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-063-E01 — Verification/evidence pending:** Execute and record every original acceptance criterion under positive, invalid, scope, stale, rework, reload, empty and error scenarios as applicable.
- [ ] **VP-063-E02 — Verification/evidence pending:** Bind actual results to exact commit, fixture and output identities; do not equate a test name/AT mention with a completed journey.
- [x] **VP-063-E03 — Verification/evidence complete (2026-09-26):** Serialized full run completed without bootstrap failures, failed tests or skips: lint/build, unit 231/231, E2E 105/105 (5 static + 100 Chrome), legacy syntax and diff checks passed at documentation baseline `ffcf34c0000c9cc18bc9dc2c8d1fff87b6ca060f` (application source unchanged from `e6a6edb`). Final AT-03/VP-063 network interception observed no external HTTP requests across the exercised Chrome journeys. Broader original-criterion completion remains open under E01/E02.
#### Original user story and dependencies
**Target modules:** Cross-cutting foundation  
**Prerequisites:** VP-001, VP-002, VP-003, VP-004  
**User story:** As a reviewer, I want automated tests for the actual Vite runtime and complete journeys, so that visible prototype coverage is backed by repeatable evidence.
#### Full required implementation scope
Add/extend the repository’s tests after inventorying them; preserve useful existing regression cases. Use browser tests against a local server and the built Vite artifact, not only stale standalone HTML. Add unit tests for state migration, scope, commands, money/date calculations and source revision rules. Add explicit `test:unit` and `test:e2e` scripts and the acceptance scenarios in §8. A Playwright local `webServer` setup is a documented option. [W2]
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-063-AC01 | Every required module/story has at least one working positive journey and the relevant validation/scope/stale/rework negative checks; no excluded-module absence test is replaced by a static screenshot alone. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-063-AC02 | Tests run with isolated deterministic fixture state and verify the compiled Vite app; dependency/bootstrap failures are reported, not converted to skipped success. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-063-AC03 | Runtime egress tests block/assert absence of external Microsoft/email/payment/AI requests; route actions still work as local simulations. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-063-AC04 | Existing review/PBC/release tests remain passing or receive documented justified changes; actual run counts, commit, fixture and artifact identities are recorded only after execution. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1362).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="vp-064"></a>
### VP-064 — Publish module coverage, demonstration guide and implementation evidence
**Current status:** PARTIAL  
**Milestone:** M10  
**Tracker priority:** P1  
**Owner:** Unassigned  
**Issue / PR:** Not linked in this tracker  
**Target date:** Not set  
**Status snapshot:** 2026-09-24, `eaaa7cf`
- [ ] **Story acceptance recorded as complete in the repository.**
**Current evidence and status basis:** [Current coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md) · [Verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md) · [Limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md)
**Primary implementation/evidence locations:** [module-coverage.md](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md), [verification.md](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md), [remaining-limitations.md](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md).
**Module links:** Cross-cutting; applies to every module.
**Original journey links:** Common regression and source-specific checks; [AT-52](#at-52) applies to the complete functional journey.
#### Demonstrated / already implemented
The repository has the full original backlog, 39-module matrix, current status view, scenario guidance, detailed verification history and remaining limitations. It now distinguishes selected verified areas from partial coverage.
#### Pending actions
The distinction between implementation, evidence and scope reconciliation is intentional.
- [ ] **VP-064-E01 — Verification/evidence pending:** Publish an exact criterion-to-test/run evidence ledger and resolve discrepancies between detailed verification entries, module rows and old limitations text.
- [ ] **VP-064-E02 — Verification/evidence pending:** Complete the end-to-end presenter guide and empty/failure/rework narrative at the same pinned revision; replace Partial only after acceptance evidence exists.
- [x] **VP-064-R03 — Requirement/scope reconciliation (2026-09-26):** Recounted the detailed §9.3–9.4 status cells, corrected the open-action count from the 41-row baseline to 40 after this reconciliation, retained the prior 41-row baseline in the coding-guide review history, and kept excluded live-service integrations in the explicit scope-exclusion list rather than the pending denominator. Original story IDs and criteria were not renumbered or replaced. The 37 open evidence rows and three other Partial scope rows remain open.
#### Original user story and dependencies
**Target modules:** Cross-cutting foundation  
**Prerequisites:** VP-063  
**User story:** As a product owner, I want a traceable completion report and walkthrough guide, so that I can verify the prototype represents the agreed product without production claims.
#### Full required implementation scope
Deliver a 39-row coverage checklist, story-to-route/command/test map, synthetic scenario guide, supported/unsupported calculation profile notes and a release summary. Update README/role guide to match the current prototype and clearly label historical source/standalone artifacts. The verification report distinguishes local UI coverage from production implementation. Documentation is part of each milestone, not deferred until the end.
#### Original acceptance-criterion checklist
| Criterion ID | Exact original acceptance criterion | Current criterion sign-off |
|---|---|---|
| VP-064-AC01 | Every module in §4 has implemented route(s), local command(s), fixture(s), test(s) and current observed status; no row is marked complete based only on a source paragraph. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-064-AC02 | All 64 stories are accounted for as verified, failed or blocked with a precise reason; acceptance is incomplete while any required story remains blocked. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-064-AC03 | The guide provides end-to-end presenter steps, role switches and expected results, including a fresh empty-state journey and a failure/rework scenario. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
| VP-064-AC04 | The final report lists only actually executed checks and repository changes; it never claims live M365, real authorization, professional assurance, tax compliance, external retention or successful deployment. | OPEN FOR SIGN-OFF; existing passed subcases do not complete the criterion |
**Requirement source:** [Original contract at this story](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md#L1379).
**Next evidence update:** Exact tested commit: `—`; fixture: `—`; criterion → test/run link: `—`; reviewer/date: **pending human sign-off / 2026-09-25**. These unfilled fields are for the next acceptance update, not an assertion that no tests exist.
<a id="journeys"></a>
## 8. Original 54 cross-module acceptance journeys
### 8.1 Required calculation fixtures — preserved
**Accounting example:** the existing eight-account demonstration may be used as a controlled fixture. Expressed in QAR rather than stored cents: cash 10,000; receivables 5,000; equipment 8,000; expenses 3,000; payables −3,000; loan −7,000; opening equity −10,000; revenue −6,000. Signed TB total = 0, assets = 23,000, liabilities = 10,000, profit = 3,000. A 500 depreciation adjustment gives assets 22,500 and profit 2,500. A replacement source already containing the adjustment must leave those results unchanged, not charge depreciation twice. These are synthetic arithmetic checks, not financial advice. The baseline source contains the corresponding integer-minor-unit example. [R6]**Budget example:** planned 600 minutes at a billing rate of QAR 200/hour gives planned billable value 2,000. Approved actual time of 660 minutes gives 2,200 billable value and +60 minutes variance. At a separately entered cost rate of 80/hour, actual delivery cost = 880. Without that cost rate, cost/margin is unavailable; it is not zero.**Receivables example:** at `2026-09-23`, an issued QAR 1,000 invoice due `2026-08-15`, an effective QAR 100 credit and an allocated QAR 300 receipt leave QAR 600 in the 31–60-day bucket. A receipt dated after the as-of date does not reduce that historical balance. A separate QAR 500 receipt allocated 300 leaves 200 unallocated; it must not reduce another invoice until explicitly allocated.**Consolidation example:** two reviewed same-currency components include a QAR 1,000 intercompany receivable/payable pair. The elimination debits the payable and credits the receivable by 1,000, reducing both consolidated assets and liabilities without changing component packages. An unmatched 100 difference remains visible; it must not be removed with an unexplained balancing line.
### 8.2 Journey register
The original AT identifiers, names, expected outcomes and primary-story expressions are preserved. Current repository records say AT-01–AT-55 are explicitly referenced in automated source, and additional labels such as AT-60 occur; **that does not renumber or enlarge the original 54-journey contract**. Test identifiers can cover a subset or a different combined path. Use the exact original expected outcome below.**Progress column:** “Linked stories verified” is a mechanical rollup of the original primary stories, not independent certification that a full journey was executed. “Open primary stories” identifies outstanding original story acceptance. Every journey still needs exact criterion/assertion evidence and its own run/fixture record.| Journey | Original scenario | Exact required observable result | Original primary stories | Current tracker progress | Evidence / next run |
|---|---|---|---|---|---|
| <a id="at-01"></a>**AT-01** | Fresh empty practice and persona entry | Usable empty states; no fabricated clients, completed work or live connection; correct simulated identity label. | 003–005, 018 | Open primary stories: VP-003, VP-004, VP-005 | [S4], [S6]; exact run link to record |
| <a id="at-02"></a>**AT-02** | Upgrade legacy local state | Existing IDs, PBC/review/release histories retained; invalid/ambiguous migration offers recovery rather than reset. | 002, 004 | Open primary stories: VP-002, VP-004 | [S4], [S6]; exact run link to record |
| <a id="at-03"></a>**AT-03** | Exercise all external-looking controls with network interception | No Microsoft/mail/payment/AI/provider egress; same-origin static assets remain permitted; simulated actions still work. | 017, 020–022, 026, 063 | Open primary stories: VP-017, VP-020, VP-021, VP-022, VP-026, VP-063 | [S4], [S6]; exact run link to record |
| <a id="at-04"></a>**AT-04** | Inspect active supported-product UI | No Purview, tax/payroll, AI, signature/payment provider, recurrence or workflow-rule feature; historical source is clearly labelled. | 001, 062 | Open primary stories: VP-001, VP-062 | [S4], [S6]; exact run link to record |
| <a id="at-05"></a>**AT-05** | Add clients, contacts, custom values and relationship group | Shared data updates consistently; related-group membership grants no sibling-client access. | 006–008 | Open primary stories: VP-006, VP-007, VP-008 | [S4], [S6]; exact run link to record |
| <a id="at-06"></a>**AT-06** | Open client workspace tabs and return navigation | Filters/context survive back/forward; related objects match the same client and authorized engagement. | 003, 008 | Open primary stories: VP-003, VP-008 | [S4], [S6]; exact run link to record |
| <a id="at-07"></a>**AT-07** | Inquiry → qualified opportunity → proposal draft | IDs/history retained and fees correctly separated by currency; lost reason affects open pipeline only. | 009–010 | Open primary stories: VP-010 | [S4], [S6]; exact run link to record |
| <a id="at-08"></a>**AT-08** | Submit/review/revise proposal | Same-person review denied; revision stales approval; original presented content preserved. | 010–011 | Open primary stories: VP-010, VP-011 | [S4], [S6]; exact run link to record |
| <a id="at-09"></a>**AT-09** | Record manual proposal acceptance before professional acceptance | Commercial acceptance recorded with evidence; professional engagement remains pending until a separate decision. | 011–012, 047 | Open primary stories: VP-011, VP-012 | [S4], [S6]; exact run link to record |
| <a id="at-10"></a>**AT-10** | Activate permitted engagement and create a job | Correct client/service/period/team links; activation does not auto-create tasks, invoices or future engagements. | 012–013 | Open primary stories: VP-012, VP-013 | [S4], [S6]; exact run link to record |
| <a id="at-11"></a>**AT-11** | Task/subtask hierarchy and completion | Cross-job parent/cycle/second nesting rejected; parent/job remain manual and incomplete children block completion. | 014 | Open primary stories: VP-014 | [S4], [S6]; exact run link to record |
| <a id="at-12"></a>**AT-12** | Reassign a task between two same-role people | Assignment really changes; reason/history retained; professional approval privileges do not change. | 014, 019 | Open primary stories: VP-014, VP-019 | [S4], [S6]; exact run link to record |
| <a id="at-13"></a>**AT-13** | Publish/apply/revise a job template | One fresh job tree per explicit operation; old jobs unchanged and no historical evidence/status copied. | 015 | Open primary stories: VP-015 | [S4], [S6]; exact run link to record |
| <a id="at-14"></a>**AT-14** | Add internal comment and mention; switch to client | Only authorized recipients see local notices; client cannot see internal text, counts or attached references. | 016, 025 | Open primary stories: VP-016, VP-025 | [S4], [S6]; exact run link to record |
| <a id="at-15"></a>**AT-15** | Complete M365 setup simulation | Tenant/site/library/root/sender selections persist; all verification labels are explicitly simulated. | 017 | Open primary stories: VP-017 | [S4], [S6]; Chrome pass at `5151932d5e286ef8ea19d6588aaa3ae982f3284d`; skipped-setup local-jobs subcase |
| <a id="at-16"></a>**AT-16** | Denied site, changed root, failed optional mail and disconnect | Clear failure/recovery state; prior verification becomes stale; optional mail failure does not block SharePoint or local work. | 017, 022 | Open primary stories: VP-017, VP-022 | [S4], [S6]; Chrome pass at `5151932d5e286ef8ea19d6588aaa3ae982f3284d`; service-failure local-jobs subcase |
| <a id="at-17"></a>**AT-17** | Nominate/import fixture user then grant access | Contact alone has no rights; identity, requested role and scoped grant are separate; no actual account/invitation created. | 018–019 | Open primary stories: VP-019 | [S4], [S6]; exact run link to record |
| <a id="at-18"></a>**AT-18** | Narrow engagement grant, revoked grant and stale dialog | Sibling data absent from route, modal, counts, search and exports; commands recheck grant after revocation. | 003, 019, 061 | Open primary stories: VP-003, VP-019, VP-061 | [S4], [S6]; exact run link to record |
| <a id="at-19"></a>**AT-19** | Prepare the same client workspace twice | One canonical local client root; correct engagement folders; no duplicate by retry or rename. | 020 | Open primary stories: VP-020 | [S4], [S6]; exact run link to record |
| <a id="at-20"></a>**AT-20** | Replace an evidence-linked document | Old version remains pinned; current review shows freshness impact; no silent substitution. | 021, 053 | Open primary stories: VP-021 | [S4], [S6]; exact run link to record |
| <a id="at-21"></a>**AT-21** | Optional OneDrive selection/import | Explicit permitted file provenance retained; canonical engagement storage remains SharePoint; disabled optional feature has no blocker. | 021 | Open primary stories: VP-021 | [S4], [S6]; exact run link to record |
| <a id="at-22"></a>**AT-22** | Select an original file, reload and download | Metadata persists; original bytes unavailable is explained; sample download is not passed off as the original. | 004, 020–021 | Open primary stories: VP-004, VP-020, VP-021 | [S4], [S6]; exact run link to record |
| <a id="at-23"></a>**AT-23** | Request → client response → clarification → replacement → acceptance | Shared request ID/thread/history; each replacement needs review; only client-visible text reaches the portal. | 023–025 | Open primary stories: VP-023, VP-024, VP-025 | [S4], [S6]; exact run link to record |
| <a id="at-24"></a>**AT-24** | Uploader attempts evidence acceptance under another role | Same-person approval denied even if role label changes. | 019, 024 | Open primary stories: VP-019, VP-024 | [S4], [S6]; exact run link to record |
| <a id="at-25"></a>**AT-25** | Multi-entity client portal and issued-document visibility | Explicit sharing and scope enforced; no draft invoice, workpaper, costs, risk or internal review leakage. | 025, 031, 056 | Open primary stories: VP-025, VP-031 | [S4], [S6]; exact run link to record |
| <a id="at-26"></a>**AT-26** | Compose from template and simulate accepted/failed/unknown mail | Placeholders resolve; outcomes differ; no real send/delivery claim, automatic retry or duplicate accepted attempt. | 026 | Open primary stories: VP-026 | [S4], [S6]; exact run link to record |
| <a id="at-27"></a>**AT-27** | Manually record received email/call/meeting note | Same record appears in communication/client views; nothing appears by mailbox sync. | 027 | Open primary stories: VP-027 | [S4], [S6]; exact run link to record |
| <a id="at-28"></a>**AT-28** | Time draft → submit → return → approve → correction | Separate person approval; approved source history intact; corrected effective totals and invoice impact visible. | 028 | Open primary stories: VP-028 | [S4], [S6]; exact run link to record |
| <a id="at-29"></a>**AT-29** | Budget arithmetic and cost-rate absence | Fixed example reconciles; missing cost is unavailable; engagement/job aggregation does not double count. | 029 | Open primary stories: VP-029 | [S4], [S6]; exact run link to record |
| <a id="at-30"></a>**AT-30** | Invoice from fixed service and approved time sources | Lines/total reconcile; source revision links retained; duplicate or unapproved source consumption rejected. | 030 | Open primary stories: VP-030 | [S4], [S6]; exact run link to record |
| <a id="at-31"></a>**AT-31** | Invoice review/issue and partial credit | No self-review; no direct issued-document edit; credit review and remaining creditable amount correct. | 031 | Open primary stories: VP-031 | [S4], [S6]; exact run link to record |
| <a id="at-32"></a>**AT-32** | One receipt across invoices and reversal | Receipt amount = net allocations + unallocated; over/cross-client/currency allocations rejected; correction history retained. | 032 | Open primary stories: VP-032 | [S4], [S6]; exact run link to record |
| <a id="at-33"></a>**AT-33** | As-of AR and aging boundary cases | QAR 600 example and boundary buckets match; future receipts ignored; exports equal displayed totals. | 033 | Open primary stories: VP-033 | [S4], [S6]; exact run link to record |
| <a id="at-34"></a>**AT-34** | Configure chart/period/book/dimensions | Invalid dates/hierarchies/cross-client references rejected; source context visible throughout accounting. | 034 | Open primary stories: VP-034 | [S4], [S6]; exact run link to record |
| <a id="at-35"></a>**AT-35** | Valid and invalid CSV/XLSX TB import | Genuine XLSX accepted within limits; error preview leaves old source unchanged; valid replacement preserves lineage. | 035 | Verified primary story: VP-035 | [S4], [S6]; see verification record |
| <a id="at-36"></a>**AT-36** | GL import and opening + movement tie-out | Residuals/counts match; missing opening/partial journals do not become complete by default. | 036 | Open primary stories: VP-036 | [S4], [S6]; exact run link to record |
| <a id="at-37"></a>**AT-37** | Revise mapping and inspect statement line source | Unmapped queue persists; split allocations conserve totals; changed approved mapping stales output. | 037 | Linked primary stories repository-verified; retain end-to-end regression | [S4], [S6]; exact run link to record |
| <a id="at-38"></a>**AT-38** | Generic adjustment and reflected replacement source | QAR 500 depreciation applied once; unknown/partial reflection blocks; original source never posted/mutated. | 038 | Open primary stories: VP-038 | [S4], [S6]; exact run link to record |
| <a id="at-39"></a>**AT-39** | Manual reconciliation with timing item and correction | Displayed residual is reproducible; proposed correction is distinct; unresolved residual blocks clearance. | 039 | Open primary stories: VP-039 | [S4], [S6]; exact run link to record |
| <a id="at-40"></a>**AT-40** | Statements, comparatives and unsupported cash-flow input | No invented prior figures/movements; notes have applicability and review; statement equations reconcile. | 040–041 | Open primary stories: VP-040, VP-041 | [S4], [S6]; exact run link to record |
| <a id="at-41"></a>**AT-41** | Build/download XLSX, DOCX and PDF demo outputs | Files parse/open as their stated formats and match displayed exact revision/totals; no renamed/empty substitute. | 042 | Open primary stories: VP-042 | [S4], [S6]; exact run link to record |
| <a id="at-42"></a>**AT-42** | Same-currency consolidation end to end | Group/component/adjustment columns reconcile; 1,000 elimination changes group only; component packages unchanged. | 043–046 | Open primary stories: VP-043, VP-044, VP-045, VP-046 | [S4], [S6]; exact run link to record |
| <a id="at-43"></a>**AT-43** | Translation with missing/wrong-context rate then corrected rate | Block before valid explicit rate; version/rule/rounding traceable afterwards; no unexplained plug or unsupported method pass. | 044–046 | Open primary stories: VP-044, VP-045, VP-046 | [S4], [S6]; exact run link to record |
| <a id="at-44"></a>**AT-44** | Complete evaluation, conditions, continuance and plan | Separate collection/recommendation/decision; fresh-period draft has no copied approvals; materiality remains human-selected. | 047–048 | Open primary stories: VP-048 | [S4], [S6]; exact run link to record |
| <a id="at-45"></a>**AT-45** | Risk → program → procedure → population/item result | Reciprocal links; manual samples conserve totals; untested remainder/limitations clear; exceptions remain visible. | 049–051 | Open primary stories: VP-049, VP-050 | [S4], [S6]; exact run link to record |
| <a id="at-46"></a>**AT-46** | New workpaper template → evidence → finding | Distinct IDs/records; no copied clearance; exact evidence version; qualitative and monetary findings supported. | 052–054 | Open primary stories: VP-054 | [S4], [S6]; exact run link to record |
| <a id="at-47"></a>**AT-47** | Review rework, management/partner/EQR and second engagement | Same-person checks and exact revisions; EQR state does not leak to another engagement; no signature capture. | 055–056 | Linked primary stories repository-verified; retain end-to-end regression | [S4], [S6]; exact run link to record |
| <a id="at-48"></a>**AT-48** | Completion → release → amendment → archive | Unresolved findings block; released artifact frozen; amendment has fresh review; archive has no Purview gate or physical protection claim. | 057–059 | Linked primary stories repository-verified; retain end-to-end regression | [S4], [S6]; exact run link to record |
| <a id="at-49"></a>**AT-49** | Report filters, drill-down and exports | Same dataset/currency/as-of calculation on-screen and exported; no restricted cost/record leakage. | 060 | Linked primary stories repository-verified; retain end-to-end regression | [S4], [S6]; exact run link to record |
| <a id="at-50"></a>**AT-50** | Global search with matching restricted records | No unauthorized snippets, totals or autocomplete; requirement-text search stays separate from business search. | 061 | Open primary stories: VP-061 | [S4], [S6]; exact run link to record |
| <a id="at-51"></a>**AT-51** | Change settings/templates/rates after issued work | New defaults apply prospectively; historical invoices, jobs and released artifacts remain unchanged. | 062 | Open primary stories: VP-062 | [S4], [S6]; exact run link to record |
| <a id="at-52"></a>**AT-52** | Full journey starting from manually entered client data | Lead through job/PBC/accounting or audit/review/package plus time/invoice/receipt/archive works without hidden seeded-ID dependencies. | All functional stories | 45 linked primary stories remain Partial | [S4], [S6]; exact run link to record |
| <a id="at-53"></a>**AT-53** | Keyboard, responsive web, reload and modal navigation | Usable at representative desktop/tablet/narrow-browser widths; no inaccessible form action or focus loss; no native-app work. | 003, 063 | Open primary stories: VP-003, VP-063 | [S4], [S6]; exact run link to record |
| <a id="at-54"></a>**AT-54** | Concurrent tab/stale record and browser-storage failure | Conflict or session-only notice; no silent overwrite/reset and no false persistence success. | 002–004 | Open primary stories: VP-002, VP-003, VP-004 | [S4], [S6]; exact run link to record |
### 8.3 Supplemental test-label reconciliation
| Label | Treatment |
|---|---|
| AT-01–AT-54 | Original contractual journeys; exact definitions above are authoritative. |
| AT-55 | Supplemental repository review-queue evidence, associated with VP-055. Do not count it as a replacement for any original journey. |
| AT-56 | Supplemental staff-recorded proposal response evidence, associated with VP-011. Do not count it as a replacement for any original journey. |
| AT-57 | Supplemental consolidation output draft route-change evidence, associated with VP-003-E02. Do not count it as a replacement for any original journey. |
| AT-58 | Supplemental proposal return/revise/redisplay evidence, associated with VP-010-E02. Do not count it as a replacement for any original journey. |
| AT-59 | Supplemental budget aggregation, historical rate and billing-role cost privacy evidence, associated with VP-029. Do not count it as a replacement for original AT-29. |
| AT-60 | Supplemental report-related repository label. Relate it to VP-060 / original AT-49, but verify the actual assertions before treating it as contractual coverage. |
| Combined labels such as AT-41/42/48 | A single test name may reference several contracts. Map its assertions individually; string occurrence is not coverage. |
<a id="pending"></a>
## 9. Pending work and acceptance queue
This queue contains **33 open action rows** attached to stories labelled Partial: 31 evidence/verification rows (25 Partial, 4 Pending, and 2 verified-subcase rows with explicit follow-up still open) plus 2 Partial requirement/scope reconciliation rows. These are action rows, not distinct missing features. VP-064-R03, VP-063-E03, VP-017-E01/E02, VP-036-E03, VP-036-R01, VP-038-E01/E02 and the bounded VP-023-E02 action were reconciled/closed as bounded actions on 2026-09-26; prior dated inventories are retained in history. Excluded live-service integrations remain scope exclusions. Current branch issues, PRs, assignees and due dates were not queried; link them before using this as a team execution board. No action is permission to merge or deploy.
### 9.1 Recommended closure order
| Sequence | Focus | Reason |
|---:|---|---|
| 1 | Shared identity/scope, dirty-form context, persistence/recovery and evidence bookkeeping | Failures here affect otherwise completed modules. |
| 2 | Accounting/GL/source history, note and movement support, statements and package-failure recovery | Complete concrete missing functionality and exact output prerequisites. |
| 3 | Supported consolidation group edit/review/export paths | Finish the bounded profile; do not add unsupported methods. |
| 4 | Engagement, jobs, PBC, communication and finance lifecycle gaps | Close connected human workflows without automation. |
| 5 | Audit planning, risks/fieldwork and findings rework combinations | Preserve the verified review/evidence/release controls while completing remaining paths. |
| 6 | All-original-criteria browser closeout, presenter guide and final status reconciliation | Accept the entire target only with exact observed evidence. |
### 9.2 Stated implementation actions
- [x] **VP-007-I01** (P2; [VP-007](#vp-007)): Implemented responsibility and effective-period fields with date-range guards. Evidence: AT-05/AT-06 Chrome + unit regression, 2026-09-24. Owner: `—`; issue/PR: `—`; target: `—`.
- [x] **VP-014-I01** (P2; [VP-014](#vp-014)): Staff-only task notes and registered-document links implemented; unlink requires a reason and retains actor/time history. Evidence: AT-14 Chrome + task-file unit regression; 159/159 unit + 68/68 E2E checks, 2026-09-24. Criterion sign-off is complete; see the verified criteria above.
- [x] **VP-016-I01** (P2; [VP-016](#vp-016)): Recipient-scoped local notice inbox/read state and reasoned internal-comment moderation implemented. Evidence: AT-14 Chrome and unit regression; 159/159 unit + 68/68 E2E checks, 2026-09-24. Full criterion sign-off remains open under E02.
- [x] **VP-025-I02** (P2; [VP-025](#vp-025)): Implemented required-reason share/withdraw actions with attributable history and current client visibility projection. Evidence: store regression + VP-021 Chrome, 2026-09-24. Broader portal withdrawal/no-access cases remain under E03.
- [x] **VP-027-I01** (P2; [VP-027](#vp-027)): Validated optional job links and shared communication projections in client and job views. Evidence: AT-27 Chrome + unit scope regression; 159/159 unit + 68/68 E2E checks, 2026-09-24. Criterion sign-off is complete; see the verified criteria above.
- [x] **VP-041-I01** (P1; [VP-041](#vp-041)): Revisioned and independently reviewed cash-flow movement schedule implemented and verified; complete the per-note and client-sharing acceptance separately. Evidence: AT-37 + cash-flow store regression, 2026-09-24.
- [x] **VP-041-I02** (P1; [VP-041](#vp-041)): Implemented: durable per-note revision, applicability/evidence or not-applicable rationale, preparer, independent reviewer, and client-sharing flag; package assembly requires the exact current reviewed disclosure collection. Evidence: unit store regression, 2026-09-24. Browser journey and broader note/rework combinations remain under E03.
- [x] **VP-043-I01** (P1; [VP-043](#vp-043)): Implemented and verified supported-profile perimeter edit/recovery controls; full independent-scope and effective-date matrix remains open. Evidence: AT-43 Chrome, 2026-09-24.
### 9.3 Evidence / validation queue
| Action | Story | Priority | Required closure | State / owner / evidence |
|---|---|---|---|---|
| VP-001-E01 | [VP-001](#vp-001) | P2 | Finish the criterion-by-criterion active navigation, settings, catalogue and historical-reference allowlist audit. Record evidence that existing human review/PBC/release paths remain reachable. | Complete / 176-unit + 74-E2E current run and 2026-09-25 route/scope audit |
| VP-002-E01 | [VP-002](#vp-002) | P1 | Prove equivalent retained PBC/workpaper/review journeys and single-state updates across all active modules; test repeated mounting, routing and command execution. | Complete / 182 unit + 75 E2E full run; repeated route/reload, PBC/workpaper/review/release journeys, one-store state and StrictMode subscription evidence, 2026-09-25 |
| VP-003-E01 | [VP-003](#vp-003) | P1 | Exercise dialog-specific save/cancel and dismissal paths for every active modal; shared keyboard behavior including Enter submission is tested for client and New Job dialogs. | Partial / AT-53 covers client-profile Cancel/backdrop and New Job Cancel/backdrop, draft discard and focus return; AT-26 verifies Compose Email and AT-14 Internal Note Cancel/backdrop dismissal, draft non-persistence and opener focus restoration; focused Receivables Chrome verifies receipt Cancel/backdrop dismissal and focus return; Jobs & Tasks Chrome verifies edit-job Cancel/backdrop and focus return, plus task editor close/backdrop and reassignment backdrop dismissal. Full 2026-09-26 E2E 111/111 includes Global Search accessible semantics/tab wrap/focus containment/Escape/backdrop and Scenario Chooser Escape/backdrop no-op behavior; global-search initial focus passed 3/3 focused repeats after its timing fix. Other modal-specific close and keyboard paths remain open. |
| VP-003-E02 | [VP-003](#vp-003) | P1 | Extend registered dirty-form save/discard/cancel behavior to remaining forms; verify client/search, denied/restored direct targets. M365 setup passes route/persona/engagement cases. | Partial — selected draft forms have Stay/Save/Discard evidence; consolidation perimeter/elimination drafts and a dirty direct hash to a denied route verify Stay restores the accepted URL and Discard applies route authorization. F05 Chrome proves template draft Save retains Draft status without navigation/job creation and rapid repeated instantiation Save creates exactly one job. New Chrome coverage guards supported-service and proposal-content-template drafts: Stay retains input, Discard navigates without creating records. Full E2E 111/111 (5 static + 106 Chrome), unit 242/242 and lint/build pass, 2026-09-26. Broader editable-form inventory and role/client/engagement/direct-target matrices remain open |
| VP-004-E01 | [VP-004](#vp-004) | P1 | Complete future-schema, ambiguous-reference, corrupt-but-valid-JSON, storage-denial and recovery/export/import journeys against actual historical fixtures. | Partial / 2026-09-25 local full run on `0077cc6` plus working-tree changes: 174/174 unit, 74/74 E2E; Chrome verifies recovery reset confirmation and exact backup retention as well as corrupt/incomplete/future payloads, export/import, and quota denial. Authentic historical fixtures and exact fixture-to-version mapping remain open. |
| VP-004-E02 | [VP-004](#vp-004) | P1 | Verify prior payloads and scopes survive every recovery choice and no binary upload payload is silently serialized into metadata. | Complete / atomic import guards, recovery backup and storage-class verification; 2026-09-25 |
| VP-005-E01 | [VP-005](#vp-005) | P2 | Extend dashboard journeys to partner, billing, records and other supported staff personas with both broad and narrow grants. | Complete / focused VP-005 Chrome journey, 2026-09-25: manager, partner, billing, records, preparer, group-user; narrow client/engagement grants and no-grant manager |
| VP-005-E02 | [VP-005](#vp-005) | P2 | Reconcile each counter, filtered row and click-through under empty, completed, blocked, archived and no-access conditions. | Complete / focused VP-005 Chrome journey, 2026-09-25: all six metric-card counts/lists, filters, and empty/completed/cancelled/blocked/archived/no-access states |
| VP-006-E01 | [VP-006](#vp-006) | P2 | Complete the extended Chrome profile lifecycle journey and verify retained engagement, invoice and evidence links. | Complete / 182 unit + 75 E2E pass, 2026-09-25 |
| VP-007-E02 | [VP-007](#vp-007) | P2 | Verify group membership never grants access, contact creation never creates identity authority, and editing/inactivation preserves historical references. | Complete / `npm run lint`, 182/182 unit, production build, full E2E 76/76 including AT-05/AT-06 Chrome; group grant invariance, no identity creation, stable contact ID and revision history, 2026-09-25 |
| VP-008-E01 | [VP-008](#vp-008) | P2 | Exercise every tab action, exact child-record navigation, list filter restoration and back/forward path under at least two client scopes. | Partial / focused Chrome passes: all 12 tabs under CL-001/CL-002; cross-client exclusion, exact engagement opens, filter restoration and back/forward; Client 360 actions create scoped job, PBC request, internal note and invoice under CL-002/ENG-26002; jobs, notes and invoices are confirmed in module/workspace projections, invoice remains draft and note stays portal-hidden. Other tab actions and engagement scopes remain open, 2026-09-25 |
| VP-010-E01 | [VP-010](#vp-010) | P2 | Verify reusable service/proposal-template authoring, branded preview and every scope/fee/terms field required by the original story. | Partial / `npm run lint`; 185/185 unit; latest full E2E 83/83 (5 static + 78 Chrome); Chrome authors and revises service/template defaults, verifies copied defaults stay independent, reconciles multi-line quantity/rate totals, renders Chromium PDF signature/page, and blocks reversed proposal dates without saving; store checks reject invalid service/template/line ranges, 2026-09-25 |
| VP-010-E02 | [VP-010](#vp-010) | P2 | Run edit/return/revise/redisplay cases to prove previously presented content and currency arithmetic remain unchanged. | Partial / AT-58 Chrome returns revision 3 with rationale, edits scope and QAR 600,000 to USD 625,000, returns/revises it to USD 640,000, independently reapproves and presents it; earlier Rev 2 preview and exact QAR snapshot remain unchanged. Unit and full E2E 83/83 pass; wider actor/currency/rework matrix and criterion sign-off remain open, 2026-09-25 |
| VP-011-E01 | [VP-011](#vp-011) | P2 | Complete stale-dialog, withdrawn/revised response, return-reason and invalid-evidence matrices across each permitted actor. | Partial / lint; 185/185 unit; full E2E 83/83; unit covers return reasons, negative response matrix and withdrawn response lineage after revision; AT-56 staff withdrawal; latest full E2E 83/83; stale-dialog and full actor matrix remain open, 2026-09-25 |
| VP-011-E02 | [VP-011](#vp-011) | P2 | Demonstrate every allowed response method and linked document/communication reference without signature capture or provider verification. | Partial / lint; 185/185 unit; full E2E 83/83; AT-09/AT-52 client-portal Meeting and Letter; AT-56 staff-recorded Letter Withdrawal with contact/date/actor/revision/evidence reference; latest full E2E 83/83; all three methods covered by unit checks; broad linked-resource/actor matrix remains open, 2026-09-25 |
| VP-012-E01 | [VP-012](#vp-012) | P1 | Finish the affected-review matrix after team, service, period, fee and scope changes across plans, procedures, statements, evidence, approvals and packages. | Complete — AT-12 impact preview + post-save Statements/Planning/Risks checks; fee and currency remain pinned to accepted proposal; unit 185/185 + full E2E 83/83, 2026-09-25. Acceptance-owner sign-off pending |
| VP-012-E02 | [VP-012](#vp-012) | P1 | Verify terminal-state handling, cross-view lineage and historical outputs for every lifecycle transition. | Partial / independent full-suite Chrome test `VP-012: suspends and resumes an engagement with reasoned persisted history` verifies suspend/resume/cancel records, reload persistence, and unchanged linked historical IDs across releases, workpapers, requests, jobs, documents, invoices, archives and packages; closed-state and all cross-view behavior remain open, 2026-09-25 |
| VP-013-E01 | [VP-013](#vp-013) | P2 | Complete job completion with required tasks, cancellation/read-only behavior, empty jobs and edit/reopen/return combinations at command and UI levels. | Complete / 2026-09-25 full run: 176/176 unit and 74/74 E2E; AT-11 covers rejected and successful UI completion, no professional/billing side effects, cancellation history/read-only state, empty jobs and edit/status transitions. Full VP-013 criterion sign-off remains open. |
| VP-014-E02 | [VP-014](#vp-014) | P2 | Verify empty-work rendering, scoped assignees, reasoned task cancel/reopen, and ownership/order/status persistence after reload. | Complete / Verified 2026-09-24 (empty-work rendering, scoped assignees, reasoned task cancel/reopen, ownership/order/status persistence after reload); action requirement proven and recorded — closed 2026-09-26 with the evidence retained. |
| VP-015-E01 | [VP-015](#vp-015) | P2 | Close all four original criteria with title/hierarchy validation, deliberate people/date selection, retire/cancel and conflicting operation-ID reuse cases. | Complete — AT-13 Chrome + template lifecycle unit checks, full E2E 79/79 and 185/185 unit, 2026-09-25; acceptance owner sign-off pending |
| VP-016-E02 | [VP-016](#vp-016) | P2 | Test empty/oversized/unsafe input, subject activity links and client exclusion of text, counts, attachments and mention notices. | Complete / AT-14 Chrome + client/engagement notes unit guard; 192 unit + 83 E2E, 2026-09-25 |
| VP-017-E01 | [VP-017](#vp-017) | P2 | Complete the setup start/back/cancel/review-summary path and every invalid tenant/resource/person selection while proving liveConnected remains false. | Complete bounded evidence action 2026-09-26 / AT-15 UI lifecycle and recovery; RR35 atomic invalid-configuration matrix; VP-017 unit matrix covers six outcomes for all four capabilities and `liveConnected=false`; current 231/231 unit and 109/109 E2E (5 static + 104 Chrome), build/lint/diff checks. Full story criteria remain Partial. |
| VP-017-E02 | [VP-017](#vp-017) | P2 | Verify a skipped setup or failed optional service never blocks unrelated local work. | Complete / AT-15/AT-16 demonstrates local fixture jobs before setup, after setup is skipped and while SharePoint/mail simulations fail; current serialized E2E repeats it. E02 action closed 2026-09-26; broader VP-017-AC04 remains Partial |
| VP-019-E01 | [VP-019](#vp-019) | P1 | Complete professional/management-role approval-evidence combinations, compatible-role changes and narrow group/component scope tests. | Partial / 2026-09-26 unit matrix: preparer/reviewer/eqr/client grants each require approval evidence distinct from the request reference; revocation returns the persona to the applicant pool and both actions record history; granting a role that does not match the persona is rejected for Global and Client scopes. Expiry and narrow group/component combinations remain open. |
| VP-019-E02 | [VP-019](#vp-019) | P1 | Recheck commands after revocation/expiry while dialogs remain open, including search, counts, dropdowns and exports. | Complete — `AT-02/AT-54` focused Chrome on 2026-09-25 verifies revoke and expiry remove open search/report controls, filters, metrics, exports and rows; client-form stale-save and expired-client command guards also pass. VP-019 story acceptance remains open separately. |
| VP-020-E01 | [VP-020](#vp-020) | P2 | Prove accepted-client/binding prerequisites, exact configured root validation, idempotent preparation and duplicate/rename behavior for all permitted scopes. | Partial / `npm run build`; focused AT-19 Chrome 1/1; focused canonical workspace unit 1/1; `git diff --check`; binding denial, configured-root path, 8-folder idempotency across M365/Documents, inactive client and foreign engagement rejection, 2026-09-25 |
| VP-020-E02 | [VP-020](#vp-020) | P2 | Verify independent library access and cross-links to jobs/PBC/workpapers use the same logical document. | Complete / AT-20 direct library open + PBC-02/JOB-2602/WP-A1 navigation; each destination resolves the exact linked record and retains DOC-002 identity; lint, unit 197/197 and full E2E 83/83, 2026-09-25 |
| VP-021-E01 | [VP-021](#vp-021) | P2 | Close wrong-root, inaccessible, unavailable/restore and linked-version cases for each original criterion and relevant record type. | Partial / focused VP-021 Chrome 1/1 on current worktree verifies DOC-002 stable ID through rename/move/withdraw/restore; unavailable status and disabled adequacy action in library/evidence catalogue; pinned workpaper reports unavailable rather than Adequate; linked PBC-02 row reports unavailable. Lint/build PASS and diff check PASS; wrong-root/foreign-client unit subcases and AT-20 replacement/reassessment evidence retained; broader role/record-type matrix and owner sign-off remain open, 2026-09-25 |
| VP-021-E02 | [VP-021](#vp-021) | P2 | Document and verify bytes behavior separately for metadata-only library files, session-only uploads, durable PBC bytes and generated artifacts. | Complete / AT-20/21/22 metadata/local-file/OneDrive boundaries; AT-23/24 durable PBC IndexedDB bytes rehashed after reload; AT-41/42/48 generated artifacts persisted and SHA-verified; full E2E 83/83, 2026-09-25 |
| VP-022-E01 | [VP-022](#vp-022) | P2 | Execute every named failure plus changed tenant/site/root/sender, cancelled setup, reconnect and stale prior-test scenario. | Complete / expanded AT-15/AT-16 covers tenant/site/root/sender revision staleness, access-denied/missing-resource/expired-session/throttled/unavailable fixtures, explicit recovery, save/cancel/back, and reload; `npm run test:e2e` 83/83, `npm run test:unit` 197/197, lint/build PASS, 2026-09-25 |
| VP-022-E02 | [VP-022](#vp-022) | P2 | Verify provider-dependent controls are unavailable after disconnect while records/history remain intact and no background retry occurs. | Complete / AT-15 clean disconnect increments config revision, keeps liveConnected false and preserves clients/documents/folders while adding local history; stale verification disables workspace preparation until explicit success simulation; AT-03 interception shows no external request. Full E2E 83/83, 197/197 unit, lint/build PASS, 2026-09-25 |
| VP-023-E01 | [VP-023](#vp-023) | P2 | Complete manual request editing, due-date/owner/recipient reassignment and cancellation with prior submissions retained and outstanding counts corrected. | Complete / AT-23 Chrome verifies reasoned title/date/contact reassignment, retention of three response revisions and two approvals after cancellation, and awaiting-response exclusion; unit 199/199 and focused AT-23/24 1/1, 2026-09-25 |
| VP-023-E02 | [VP-023](#vp-023) | P2 | Test cross-client/inactive recipients, no-context presentation and all request filters. | Complete bounded evidence 2026-09-26 / AT-23/24 and `pbcRequestFilters` unit matrix cover seven statuses, date buckets, recipient/text/combined/clear filters; store guards reject invalid recipient/context atomically; cancellation/reassignment retain history. 242/242 unit; PBC cases pass in full E2E 110/110 (5 static + 105 Chrome); story acceptance remains open |
| VP-024-E01 | [VP-024](#vp-024) | P1 | Complete file-type/size/empty/storage-failure paths and same-natural-person review attempts across role labels. | Complete / Verified — AT-23/24 + RR34, full run 2026-09-24; action requirement proven and recorded — closed 2026-09-26 with the evidence retained. |
| VP-024-E02 | [VP-024](#vp-024) | P1 | Show the supported route from accepted evidence to a new reviewed replacement without losing the prior acceptance or silently replacing evidence pins. | Complete — AT-23/24 document lineage and reload + PBC unit dependency-reassessment regression, 2026-09-26 |
| VP-025-E01 | [VP-025](#vp-025) | P2 | Verify every portal list, badge, search result, action and nomination/acknowledgement role boundary across multiple entities/engagements. | Partial / AT-18 covers multi-entity CL-001/CL-003 lists, shared-document/invoice re-scope, internal-workpaper exclusion and client_admin → client-northstar → client_admin selection refresh in the same mounted portal; role/action matrix remains open, full E2E 90/90 + 199/199 unit after draft portal scope test removal; AC01 switch test remains open, 2026-09-25 |
| VP-025-E03 | [VP-025](#vp-025) | P2 | Validate no-access, pending-review and withdrawn-sharing views and separation of package acknowledgement from management account approval. | Complete / no-grant safe state and unpresented-package view in new VP-025-E03 Chrome; withdrawn DOC-002 absent from portal in VP-021; AT-41 distinguishes package acknowledgement from separate representation receipt; full E2E 90/90, 199/199 unit, 2026-09-25 |
| VP-026-E01 | [VP-026](#vp-026) | P2 | Verify unavailable sender, unresolved placeholders, cross-client document links, template-editor permissions and duplicate-click behavior. | Partial / AT-26 verifies one accepted attempt per submission token, no duplicate on repeated submit, explicit new attempt after reopening an unknown outcome, unique provenance and no external request; sender/placeholder/document-link/template-permission cases remain open. Focused Chrome 1/1, 2026-09-25 |
| VP-027-E02 | [VP-027](#vp-027) | P2 | Validate visibility-change warning/permission, linked-attachment scope, date/text limits and correction history. | Partial / focused VP-027 unit rejects impossible/future dates and over-limit summary/participants/notes atomically, rejects unauthorized publication/correction, internal attachments and foreign-scope links, and verifies reasoned correction history; AT-27 Chrome verifies scenario-date/text bounds, cancel/confirm publication warning, edit/correction attribution, shared-link portal projection and internal-link exclusion from portal/search. Latest full suite (2026-09-26 before the latest correction/link extensions): 205/205 unit and 94/94 E2E. Broader actor/context and linked-request/rework combinations remain open |
| VP-028-E01 | [VP-028](#vp-028) | P2 | Complete invalid/future/scenario dates, positive-minute validation, cross-scope job/task links and all effective-total views. | Partial / AT-28 validates effective and approved totals after a two-step correction; shared selector excludes superseded revisions across timesheet, job, budget, WIP/reporting, client and invoice views; broader linked-scope/date matrix and sign-off remain open, 2026-09-25 |
| VP-028-E02 | [VP-028](#vp-028) | P2 | Verify correction of already billed/consumed time exposes billing impact without rewriting an invoice or making a source billable twice. | Complete / AT-28 issues and snapshots the QAR 600 invoice from TIME-01, verifies the warning, corrects and approves the linked time revision, confirms invoice immutability and that the corrected source is not offered again for invoicing; store regression verifies the guard, focused Chrome pass, 2026-09-25 |
| VP-029-E01 | [VP-029](#vp-029) | P2 | Complete the fixed 600/660-minute arithmetic example, missing-cost behavior and engagement/job/unallocated budget aggregation without double counting. | Partial / AT-29 unit covers 600 planned/660 approved minutes, +1 hour, +QAR 200 and unknown missing cost; AT-59 Chrome covers engagement-once aggregation despite an extra job budget, pinned approved-time rate valuation, QAR/USD separation and v2 history. Broader unallocated/job combinations remain open, 2026-09-25 |
| VP-029-E02 | [VP-029](#vp-029) | P2 | Test all budget change/review/variance paths and historical rate attribution. | Partial / AT-29/AT-59 verify v1→v2, preserved v1 history and approved-time valuation; AT-51 and AT-59 verify issued invoices/time snapshots remain unchanged. Broader change/review/variance matrix remains open, 2026-09-25 |
| VP-030-E01 | [VP-030](#vp-030) | P1 | Verify billing-account/contact details, editable drafts, arbitrary ad-hoc lines, source revisions and duplicate reservation/release behavior. | Complete / Chrome 2026-09-26: drafts now expose Edit/Revise for every unissued invoice (source-linked included); the journey drafts from TIME-01, opens the revision modal with the pinned-source disclosure, revises the due date and reason, and proves revision 2 carries byte-identical time-source lines, cleared approval and retained revision history; client account/contact snapshot, reservation/re-reservation and ad-hoc lines were verified previously. |
| VP-031-E01 | [VP-031](#vp-031) | P1 | Complete revision-bound return/edit/reapproval, draft cancellation versus issued correction, remaining-credit caps and cross-client/currency negative paths. | Partial / AT-31 verifies approved ad-hoc invoice revision 1→2, retained old snapshot/reviewer, cleared approval and fresh independent approval; 2026-09-26 adds source-linked draft revision via the Edit control with pinned lines and cleared approval (Chrome). Remaining: full invoice dates/references/criterion matrix. |
| VP-031-E02 | [VP-031](#vp-031) | P1 | Verify downloads, replacement lineage and separation of issuance from local email simulation and settlement. | Complete / AT-31 verifies a genuine staff invoice PDF bound to INV-AT31, exact issued-invoice credit linkage and unchanged invoice face amount; issue/credit create no email attempt, receipt or external request. Focused Chrome 1/1, 2026-09-25 |
| VP-032-E01 | [VP-032](#vp-032) | P1 | Reconcile every amount and history path for partial/split/reversed/unallocated balances under stale or incompatible invoice conditions. | Complete / unit + AT-32 verify past/future due-date allocations, partial/full settlement, exact unallocated remainder after selective/full reversal, reason/history retention, repeat-reversal idempotency, and atomic stale invoice/cap rejection; full unit 204/204 and full E2E 92/92, 2026-09-25 |
| VP-032-E02 | [VP-032](#vp-032) | P1 | Verify zero/negative/non-finite inputs, receipt metadata edits and command atomicity while maintaining no-payment boundaries. | Complete / amount boundaries reject atomically, 0.01 and metadata creation are verified; no edit operation is supported or required by the source story, and AT-32 confirms the offline-only action/schema boundary, 2026-09-25 |
| VP-033-E01 | [VP-033](#vp-033) | P2 | Verify every boundary bucket and drill-down against a fixed date, including due-today, reversed allocations, unallocated funds and multiple currencies. | Complete / unit boundaries + reversal/as-of cases; AT-32/33 reconciles all five Chrome drill-downs, separates USD/QAR, and displays restored unallocated funds; full unit 204/204 and E2E 92/92, 2026-09-25 |
| VP-034-E01 | [VP-034](#vp-034) | P1 | Complete client/chart/book/period edits and downstream rework for multiple same-client engagements, including prior mapping and statement/package snapshots. | Partial / AT-34 verifies client-wide revision/history and sibling mapping/statement/package staleness; complete period/book matrix remains open, 2026-09-25 |
| VP-034-E02 | [VP-034](#vp-034) | P1 | Verify closed books, archived accounts and dimension changes cannot silently alter approved output; migrated unselected reporting basis stays explicit. | Partial / AT-34/unit verifies invalid chart/dimension and closed-book TB/GL import guards; archive, dimension-only and migration matrices remain open, 2026-09-25 |
| VP-035-E01 | [VP-035](#vp-035) | P1 | Execute duplicate/formula/renamed-XLSX/oversize/row-limit and wrong-chart/context failures in the browser, not only the parser. | Complete / Verified 2026-09-24; action requirement proven and recorded — closed 2026-09-26 with the evidence retained. |
| VP-035-E02 | [VP-035](#vp-035) | P1 | Verify signed-net versus debit/credit mapping, header choices, dimensions, multi-file replacement and atomic preservation of prior revisions. | Complete / Verified 2026-09-24; action requirement proven and recorded — closed 2026-09-26 with the evidence retained. |
| VP-036-E02 | [VP-036](#vp-036) | P1 | Run complete opening + movement = closing examples, missing openings, partial batches, duplicates, unmatched accounts and wrong-period/currency scenarios. | Complete / AT-36 Chrome positive tie-out and partial-batch denial; GL parser unit cases cover duplicates, impossible dates, wrong period/currency and opening-only rows; EX06–EX08 cover missing opening, unmatched GL account and positive tie-out; store rejects invalid account/opening atomically. Lint/typecheck, 199/199 unit, 90/90 E2E, diff check, 2026-09-25 |
| VP-036-E03 | [VP-036](#vp-036) | P1 | Prove GL replacement stales affected reconciliation/package outputs without mutating historical source rows. | Complete — AT-36 verifies GL v1→v2 source history/hash preservation, unchanged TB, stale reconciliation history, rework and independent re-review. AT-41 assembles and independently acknowledges package v5 pinned to GL v1, replaces with GL v2, verifies stale package state plus exact predecessor artifact bytes, then assembles and independently acknowledges package v6 pinned to GL v2. Store guards reject package generation with mismatched GL lineage. Unit 238/238 and E2E 110/110, 2026-09-26. VP-036-R01 is closed; overall story acceptance remains open. |
| VP-038-E01 | [VP-038](#vp-038) | P1 | Complete rejected/partial/unknown/reflected source permutations, journal amendments and linkage to evidence/workpaper/finding revisions. | Complete — unit decision matrix and exact evidence+document/workpaper/finding revision pins, foreign/unavailable/stale rejection, stale reporting exclusion, amendment predecessor pins, and duplicate-inclusion guard; AT-38 covers independent decisions, missing-evidence rejection, partial/unknown reporting reasons, history reload, amendment/reapproval and unchanged source TB; VP-038-E01/E02 covers v1→v2 staleness and reconfirmation. Build PASS, unit 240/240, full E2E 110/110, focused journal Chrome 2/2; 2026-09-26. Original VP-038 acceptance/sign-off remains open. |
| VP-038-E02 | [VP-038](#vp-038) | P1 | Verify original journal/decision history, reporting-impact totals and correction re-review across source replacements. | Complete — VP-038-E01/E02 Chrome: balanced TB v2 replacement stales prior reflection, statement explains exclusion and reports no applied adjustment, reviewer records new evidence/re-confirms against v2, prior v1 history remains, and stale warning clears with no duplicate reporting effect; 2026-09-26. |
| VP-039-E01 | [VP-039](#vp-039) | P1 | Close the original residual, timing-versus-correction, currency/date/scope and independent-review criteria with exact test references. | Partial / AT-39 verifies arithmetic/currency and honest Unknown when opening is absent; AT-36 imports a balanced GL with QAR 100 opening for account 1000 and verifies opening + movement = TB close. EX06/EX08 cover opening calculations. Unit covers review/history/staleness, invalid dates/currency/amount/IDs, atomic saves and foreign-client/sibling-engagement evidence rejection. A correctly linked AJ-01 proposed correction still cannot clear a real residual or change Draft status. Unit 242/242, full E2E 110/110, lint/build, focused guard/calculation and AT-39/AT-36 Chrome pass; broader date/currency/scope cross-product and sign-off remain open, 2026-09-26 |
| VP-040-E01 | [VP-040](#vp-040) | P1 | Complete source/current-mapping/prior-period/layout-change and reviewed-output regeneration combinations with traceable expected subtotals. | Partial / AT-37 full Chrome journey verifies custom grouping/order/subtotal in preview/XLSX, reviewed output under layout v2/v3, layout staleness and comparative-mapping staleness; remaining source/matrix/sign-off cases open, 2026-09-25 |
| VP-040-E03 | [VP-040](#vp-040) | P1 | Coordinate cash-flow/equity movement support and disclosures with VP-041; unsupported figures must remain unavailable. | Subcase verified: reviewed opening equity and supported movements flow to statement and exact package artifacts; full statement-layout acceptance remains open |
| VP-041-E03 | [VP-041](#vp-041) | P1 | Verify reviewed note/support revisions stale packages and expose only explicitly shared client note content. | Verified subcases — `5d6e2c0` / `02997cc`; remaining VP-041 acceptance stays open |
| VP-042-E01 | [VP-042](#vp-042) | P1 | Test DOCX/PDF failure and failures after one or more artifacts have already persisted; ensure cleanup/recovery cannot announce a complete failed revision. | Complete — AT-41/42/48, 2026-09-24; failed artifacts cleaned up and no package revision announced |
| VP-042-E02 | [VP-042](#vp-042) | P1 | Complete independent review and acknowledgement of the replacement package revision after amendment/reassembly. | Complete / full AT-41/42/48 E2E, 2026-09-24 |
| VP-043-E02 | [VP-043](#vp-043) | P1 | Verify independent group scope/revision, effective dates, duplicates/cycles and narrow-component permissions without widening unrelated client access. | Complete / full acceptance run `fded7b5`, 2026-09-24 |
| VP-044-E01 | [VP-044](#vp-044) | P1 | Complete incompatible basis/period and unreviewed-component gates, old/new package selection, stale-pin warnings and rounded translation reconciliation. | Complete / unit guards reject mixed basis/wrong period and invalid perimeter edits; AT-44 warns on stale source, preserves old pins, blocks pending review and requires explicit re-pin; AT-43 artifact records component/package/source/rate lineage and digest; focused unit 2/2 and Chrome 3/3, 2026-09-25 |
| VP-044-E02 | [VP-044](#vp-044) | P1 | Prove each selected rate and translation difference is traceable under the documented supported rule. | Complete / AT-43 asserts source amount, dated closing-rate revision, translated cents, line difference and balanced reviewed artifact provenance; AT-44 isolates the per-line rounding residual with unchanged balanced sources; focused Chrome 2/2, 2026-09-25 |
| VP-045-E02 | [VP-045](#vp-045) | P1 | Exercise unmatched amounts, duplicate inclusion, unbalanced/mixed-context entries and component/rate/perimeter changes that stale prior elimination approval. | Partial — $100 residual remains visible after matched $900 elimination (unit + Chrome, 2026-09-24); remaining matrix open |
| VP-046-E02 | [VP-046](#vp-046) | P1 | Run full same-currency and documented FX scenarios with group totals, drill-downs and exported source/perimeter/rate/elimination lineage. | Complete / AT-42/43/45 Chrome + group-output digest/lineage verification, 2026-09-24 |
| VP-048-E01 | [VP-048](#vp-048) | P1 | Complete the original plan scope, source/benchmark, separately entered performance/trivial thresholds, valid assignments and rationale criteria. | Complete / full local run 176 unit + 74 E2E, 2026-09-25; criterion sign-off open |
| VP-048-E03 | [VP-048](#vp-048) | P1 | Verify all approved-plan/materiality changes identify affected fieldwork and conclusions without granting authority or releasing reports. | Complete / VP-049 materiality amendment journey, full Chrome 74/74, 2026-09-25; criterion sign-off open |
| VP-049-E01 | [VP-049](#vp-049) | P2 | Complete multi-risk combinations, reviewer return/reopen and repeated reassessment while preserving plan/program/template/procedure snapshots. | Complete / focused risk lifecycle unit 1/1; full unit 206/206 and E2E 94/94; snapshots and repeated reassessment verified, 2026-09-26 |
| VP-049-E02 | [VP-049](#vp-049) | P2 | Verify unresolved coverage gaps and wrong-engagement/invalid-owner negative cases across template versions. | Complete / build, focused VP-049 unit 3/3, focused Chrome 1/1; owner rejects client/inactive/out-of-scope staff atomically, reciprocal links reject cross-engagement procedures, Chrome verifies the bounded owner selector and unresolved gaps, and applied v1/v2 snapshots survive revision/retirement, 2026-09-26 |
| VP-050-E01 | [VP-050](#vp-050) | P1 | Complete exception return/rework/resubmit/clear combinations and detailed change history across several procedures/program versions. | Complete / focused Chrome 1/1; full unit 216/216 and E2E 96/96; actor, status, work, return reason, program and template-version history verified, 2026-09-26 |
| VP-054-E01 | [VP-054](#vp-054) | P1 | Complete reopen/waive/uncorrected/corrected scenarios and compare findings detail with all related audit/reporting views. | Complete / Chrome verifies unresolved Significant finding consistency in Release Completion, Financial Packages and Report Centre, then reasoned waiver resolves the release gate; full unit 216/216 and E2E 96/96, 2026-09-26 |
| VP-054-E02 | [VP-054](#vp-054) | P1 | Demonstrate qualitative/no-amount inputs, immutable provenance and release re-evaluation after disposition changes without automatically concluding immateriality. | Complete / unit and Chrome VP-054 journeys prove provenance equality after reload and after Uncorrected→Waived dispositions without adding amounts, with release treatment changing only on a reasoned disposition; full unit 216/216 and E2E 96/96, 2026-09-26 |
| VP-061-E01 | [VP-061](#vp-061) | P2 | Complete direct-target journeys for contacts, findings and PBC; preserve the now-implemented exact task and workpaper target selection. | Complete / AT-50 focused exact-target checks for contact, finding, PBC, task and workpaper; full E2E run 75/75, 2026-09-25 |
| VP-061-E02 | [VP-061](#vp-061) | P2 | Test unavailable/archived targets, revoked scopes and all person/grant combinations through search and resulting detail views. | Partial / Chrome 2026-09-26 (bounded matrix): unavailable documents keep the truthful Unavailable label in results and their preview control is disabled; archived clients remain searchable with the Archived label; a narrow ENG-26001 grant excludes a CL-002 invoice from results entirely while granted records stay searchable. Exhaustive person/grant cross-product remains open. |
| VP-062-E01 | [VP-062](#vp-062) | P2 | Verify each setting is consumed prospectively by the intended form/preview, with actor/reason, stale revision and invalid setting behavior. | Complete / Unit: firm-settings consumption of invoice/credit numbering advances counters prospectively, explicit custom numbers leave them, and issued invoices, credits and template-derived jobs are untouched; admin alone cannot update budgets, publish templates or approve mappings (VP-062-AC03). Chrome: after saving new prefix/next/terms, the billing draft modal pre-fills BILL-100 and a terms-based due date; save logs actor/reason. 2026-09-26, worktree 5d2ac8b+delta. |
| VP-062-E02 | [VP-062](#vp-062) | P2 | Test numbering collisions, logo-unavailable states and defaults without rewriting issued invoices, released packages or template-derived jobs. | Complete / Unit + Chrome 2026-09-26: duplicate invoice numbers rejected atomically; counters advance only on consuming the configured next number; issued invoices keep their original numbers/amounts/due after renumbering; invalid timezone/logo references rejected atomically; the firm panel shows an explicit logo-placeholder state (no binary payload stored). |
| VP-063-E01 | [VP-063](#vp-063) | P1 | Execute and record every original acceptance criterion under positive, invalid, scope, stale, rework, reload, empty and error scenarios as applicable. | Pending / Unassigned / — |
| VP-063-E02 | [VP-063](#vp-063) | P1 | Bind actual results to exact commit, fixture and output identities; do not equate a test name/AT mention with a completed journey. | Pending / Unassigned / — |
| VP-063-E03 | [VP-063](#vp-063) | P1 | Retain deterministic isolated runs and report failures or bootstrap errors honestly. Record ongoing no-external-request regressions for all exercised controls. | Complete / serialized current-candidate regression run 231/231 unit, 105/105 E2E (100 Chrome), lint/build/legacy/diff checks clean; AT-03 interception saw no external HTTP requests across exercised journeys. Full SHA and exact commands recorded above and in verification.md row 81. Broader criterion evidence remains open under E01/E02, 2026-09-26 |
| VP-064-E01 | [VP-064](#vp-064) | P1 | Publish an exact criterion-to-test/run evidence ledger and resolve discrepancies between detailed verification entries, module rows and old limitations text. | Pending / Unassigned / — |
| VP-064-E02 | [VP-064](#vp-064) | P1 | Complete the end-to-end presenter guide and empty/failure/rework narrative at the same pinned revision; replace Partial only after acceptance evidence exists. | Complete / The presenter playbook is current at the same pinned revision and carries the empty/failure/rework narrative: scenario presets include `blocked-rework` and `empty-practice`, a required failure/rework stops section, per-module denial guidance, and the reserved-superuser/ordinary-persona boundary (doc audit 2026-09-26). |
### 9.4 Scope and requirement reconciliation queue
Resolve these before creating new feature tasks. Some will close by documenting an already-satisfied criterion or confirming an exclusion; others will reveal a bounded implementation gap.| Action | Story | Question / clarification to resolve | State / decision link |
|---|---|---|---|
| VP-001-R02 | [VP-001](#vp-001) | Retain historical imported tax/salary account labels; do not turn a non-feature keyword match into a requirement to destroy accounting data. | Complete / source-label audit and current fixtures, 2026-09-25 |
| VP-002-R02 | [VP-002](#vp-002) | Reconcile the original legacy-adapter/hash-route criteria with the completed React migration. Document compatibility or intentional retirement; do not rebuild an unused legacy runtime solely to satisfy obsolete implementation wording. | Complete / all former hash routes redirect to current React destinations, 2026-09-25 |
| VP-003-R03 | [VP-003](#vp-003) | Where a dirty-form or unavailable-target path is absent, implement the smallest shared control and then add its test. | Reconciled / The reconciliation question — implement the smallest shared control for a missing dirty-form or unavailable-target path and add its test — is satisfied: the keyed `UnsavedFormGuard` registry covers the named form families and the denied-direct-hash Stay/Discard journey is tested. Broader form/role matrices are acceptance work tracked by VP-003-E01/E02, not this reconciliation. No second form framework added. 2026-09-26 |
| VP-004-R03 | [VP-004](#vp-004) | Confirm schema coverage against the pinned current migration version; do not treat a version-number range alone as evidence for every historical shape. | Complete / 2026-09-24 unit evidence |
| VP-006-R02 | [VP-006](#vp-006) | Check every original required and optional profile field and implement only missing contractual fields/lifecycle controls before final sign-off. | Complete / profile fields and lifecycle controls checked against original story, 2026-09-25 |
| VP-008-R02 | [VP-008](#vp-008) | Complete any missing shared activity projections rather than duplicating client/job/communication records in the workspace. | Reconciled / `ClientDetailView.tsx` projects records from the canonical PrototypeState arrays and engagement-owned PBC/workpaper collections; it creates no client-local persisted copies. Existing VP-008-E01 and AT-52 Chrome cases exercise shared client-linked data. 2026-09-25 |
| VP-010-R03 | [VP-010](#vp-010) | Reconcile service-catalogue and reusable-content-template editor coverage before adding any additional proposal feature. | Complete — both editors are implemented and covered by VP-010-E01; no additional proposal feature added, 2026-09-25 |
| VP-012-R03 | [VP-012](#vp-012) | Do not introduce workflow automation or future-period task generation as a lifecycle shortcut. | Reconciled / manual reasoned lifecycle controls; no automatic task generation or future-period workflow, 2026-09-25 |
| VP-013-R02 | [VP-013](#vp-013) | The original story does not require reopening a cancelled job. Keep terminal cancellation; test reopening only for applicable non-terminal work states. | Reconciled / 2026-09-25: AT-11 confirms cancelled jobs are read-only/terminal; non-terminal status changes remain manual. |
| VP-014-R03 | [VP-014](#vp-014) | Keep one-level nesting and manual state changes; no dependency, recurrence or automation engine. | Reconciled / 2026-09-24 |
| VP-015-R02 | [VP-015](#vp-015) | Role suggestions may remain suggestions rather than automatic allocation. Determine whether any remaining editor/cancellation item is a criterion gap or merely an illustrative limitation. | Reconciled — selected owner drives assignments; suggestions remain illustrative; explicit dates, cancel no-op and retirement behavior verified, 2026-09-25 |
| VP-016-R03 | [VP-016](#vp-016) | No email notifications, full chat application or external collaboration integration is required. | Complete / AT-14 recipient-specific in-app notices and AT-03 no-external-request evidence; 2026-09-25 |
| VP-017-R03 | [VP-017](#vp-017) | Do not turn initial identity mappings into implicit global/client authority; scoped grants remain separate. | Complete / AT-15 verifies saving an initial M365 identity mapping leaves the authorization-grant count unchanged; `tests/unit/reproduction_register.test.ts` verifies simulated identity checks leave `roleGrants` unchanged; 2026-09-25 |
| VP-019-R03 | [VP-019](#vp-019) | Related-client groups must not silently widen permissions; administrator identity alone does not confer professional approval rights. | Complete / `tests/unit/guards.test.ts` relationship-group and self-grant guards; focused AT-17/AT-18 Chrome verifies admin financial-route denial; 2026-09-25 |
| VP-020-R03 | [VP-020](#vp-020) | Real SharePoint transfers, provisioning and permission callbacks are excluded; their absence is not pending implementation. | Complete / UI states that preparation creates local metadata and performs no remote provisioning; exact simulation boundary is documented, 2026-09-25 |
| VP-021-R03 | [VP-021](#vp-021) | Actual remote moves/permission callbacks and file transfer are out of scope; do not count them as missing business integrations. | Complete / requirement reconciled against the local metadata, browser-local byte stores and simulated reference availability; 2026-09-25 |
| VP-023-R03 | [VP-023](#vp-023) | Implement a missing request lifecycle control only where the original criteria require it; no automatic reminders or acceptance. | Reconciled / All contractual request controls exist (draft, present, edit/reassign/cancel with reason, clarification follow-up); no automatic reminders or automatic acceptance exists by design, matching the original criteria. 2026-09-26 |
| VP-024-R03 | [VP-024](#vp-024) | Clarify durable PBC byte storage versus metadata-only library handling; do not describe one storage policy as universal. | Reconciled / Storage classes verified in source 2026-09-26: accepted PBC response bytes persist in browser-local IndexedDB with SHA-256 (persistArtifact, kind PBC) while library/OneDrive documents hold metadata plus in-session bytes with source label Local In-Session; both module-coverage rows 09/10 and remaining-limitations state the two classes separately. |
| VP-026-R02 | [VP-026](#vp-026) | The original story forbids duplicate accepted attempts from repeated clicks; distinguish a deliberate new manual attempt from an accidental duplicate operation. | Complete / one submission ID per open composer; duplicate store operations are idempotent, while explicit close/reopen creates a new attempt; unit + AT-26 Chrome evidence, 2026-09-25 |
| VP-026-R03 | [VP-026](#vp-026) | Inbox sync, real delivery receipts, polling, auto-retry and provider integrations remain excluded, not pending features. | Complete / VP-026 AC01/03/04 and agreed exclusions keep all email outcomes local and exclude providers, synchronization and retries, 2026-09-25 |
| VP-027-R03 | [VP-027](#vp-027) | No actual mailbox synchronization or scheduled follow-up is required. | Complete / VP-027 AC02/04 require manual incoming records and exclude synchronization and scheduled follow-up, 2026-09-25 |
| VP-029-R03 | [VP-029](#vp-029) | No scheduling/capacity automation is required. | Complete — original story excludes capacity optimizer, roster, auto-scheduling and recurring budgets; user story explicitly rejects a resource-scheduling engine, 2026-09-25 |
| VP-030-R02 | [VP-030](#vp-030) | Coverage notes a proposal-level fixed-fee cap and no per-service milestone allocation. Reconcile that against original supported source/line requirements before treating milestone scheduling as mandatory new scope. | Complete — original VP-030 requires fixed-fee or approved-time sources, not per-service milestones; retain the accepted proposal fee cap, 2026-09-25 |
| VP-033-R02 | [VP-033](#vp-033) | Confirm browser print layout/output content required by the story. Printer-driver-specific certification is outside scope and should not by itself block completion. | Complete / source requires printable demo statement; one-page Chrome PDF visually verifies rendered heading/context/rows; physical printer/OS driver testing is out of scope, 2026-09-25 |
| VP-036-R01 | [VP-036](#vp-036) | Confirm full bounded GL import/mapping/preview, opening-source selection, journal drill-down and scoped export against the original specification. | Complete — coding-guide control comparison + AT-36 Chrome (source count, visible journal filter/drill-down, account filter and filtered CSV) plus parser/EX06 opening-coverage regressions; current mapping/source hash/history remain intact. The wider AC01–AC04 acceptance matrix, fixture-size responsiveness and story sign-off remain open; 2026-09-26 |
| VP-038-R03 | [VP-038](#vp-038) | Posting into real client or firm ledgers is excluded; it is not a missing integration requirement. | Complete / VP-038 AC04 and agreed accounting scope limit journals to reporting reflection and forbid changes to external/source ledgers, 2026-09-25 |
| VP-039-R02 | [VP-039](#vp-039) | The record still labels this Partial, but its named external statement/bank-system limits are excluded. Identify the remaining in-scope criterion before assigning new implementation work. | Complete / external bank feeds, automated matching and provider provenance are excluded; remaining manual dated/currency/scope/evidence/review checks are assigned to VP-039-E01. No integration work required, 2026-09-25 |
| VP-040-R02 | [VP-040](#vp-040) | Reconcile the versioned layout, grouping/order/subtotal editor requirements and fill actual missing supported-fixture operations. | Complete / versioned editor, preview/export and reviewed-output invalidation implemented; unit guards and AT-37 verify supported operations, 2026-09-25 |
| VP-042-R03 | [VP-042](#vp-042) | Package inclusion requires a current independently reviewed cash-flow schedule; without one, output remains unavailable. | Complete / verified 2026-09-24 |
| VP-043-R03 | [VP-043](#vp-043) | Associate, minority and advanced consolidation methods remain explicitly unsupported; expanding them is not needed for this backlog. | Complete / acceptance scope reconciled 2026-09-24 |
| VP-044-R03 | [VP-044](#vp-044) | Do not add live exchange-rate feeds or unsupported complex translation methods. | Complete / scope disclosure and `FxRateEditor`, 2026-09-24 |
| VP-045-R01 | [VP-045](#vp-045) | Reconcile manual elimination lifecycle, unmatched differences and counterparty/evidence semantics against the four original criteria. | Reconciled / Manual elimination lifecycle verified in Chrome/unit (only submitted entries reviewable; submitted content not amendable); unmatched differences remain visibly reported after matched eliminations (AT-42 $100 residual; VP-045-E02); counterparty and evidence-reference controls are implemented with store guards. Deeper combinations stay with VP-045-E02 and the criteria. 2026-09-26 |
| VP-046-R01 | [VP-046](#vp-046) | Complete or demonstrate the separate group-package exact-revision review/export journey using shared artifact/approval components; the group calculation alone is not that journey. | Complete / AT-45 Chrome + group output package tests, 2026-09-24 |
| VP-048-R02 | [VP-048](#vp-048) | Check any remaining hard-coded threshold/team/timing assumption against the contract; implement editable bounded fixture inputs where required, without asserting professional recommended rates. | Complete / deliberate editable inputs and 2026-09-25 source review |
| VP-050-R02 | [VP-050](#vp-050) | Reconcile any remaining template-administration note with VP-049, where template functionality now exists, rather than implementing a duplicate template system. | Complete / original stories assign reusable template authoring and application to VP-049 and procedure-level results/review to VP-050; no duplicated editor required, 2026-09-25 |
| VP-061-R03 | [VP-061](#vp-061) | Retain ordinary deterministic metadata/text search; no AI, embeddings or external search provider. | Complete / original VP-061 limits scope to bounded local metadata/text search; global exclusions prohibit OCR, vector/model and external search, 2026-09-25 |
| VP-062-R03 | [VP-062](#vp-062) | Reconcile supported service/email/workpaper/business settings against dedicated editors; add only missing contractual controls, not duplicated data stores. | Reconciled / Dedicated editors retained: M365 setup owns mail/SharePoint simulation, job templates own work templates, accounting setup owns accounting display, budgets/billing own rates and numbering consumption; the firm tab holds only firm-level statutory profile fields and no second settings data store was introduced. 2026-09-26 |
| VP-064-R03 | [VP-064](#vp-064) | Remove excluded live-service requirements from pending lists. Update counts and preserve historical baselines instead of renumbering or replacing the original stories. | Reconciled / §1.1 and §9 recount 37 open evidence rows + 3 remaining Partial scope rows = 40; prior 41-row count preserved in dated review guide history; excluded integrations remain out of pending denominator. 2026-09-26 |
### 9.5 Blocker / defect log — ready to use
| Blocker ID | Story / criterion | Reproduction / missing prerequisite | Severity | Owner | Linked issue | Resolution evidence | Status |
|---|---|---|---|---|---|---|---|
| B-001 (template) | — | Record a concrete blocker before marking a story Blocked | — | Unassigned | — | — | Not assessed |This blank row is a template, not a newly discovered defect. Known current pending work is recorded above; no fresh code audit or test execution was performed during tracker creation.
<a id="maintenance"></a>
## 10. Maintenance, evidence and final acceptance
### 10.1 Update protocol
1. Resolve the current default branch to a full SHA. Read repository instructions and compare it with this pinned snapshot; never assume a previous SHA is still current.2. Keep all original VP IDs/titles and all four criterion texts. Add tracker-only sub-actions rather than renumbering the contract.3. Update demonstrated work from code plus actual test evidence. Separate incomplete implementation, failed acceptance, unexecuted acceptance and excluded scope.4. For every executed criterion, record test path/name, exact commit, deterministic fixture, expected/actual result and downloadable/log evidence.5. Record a Failed or Blocked result honestly; never turn a bootstrap error or skipped check into success.6. Change a story to Verified only when all four original criteria and applicable shared contracts have evidence. Recompute module and milestone totals; shared prerequisites can remain open even when a local story is verified.7. Update source status files consistently and preserve a dated changelog. A static MD tracker does not auto-refresh.8. Keep implementation in this prototype repository. A tracker update is not authorization to commit to production AuditSphere, merge or deploy.
### 10.2 Criterion evidence ledger — repeat one row per executed assertion
| Story / criterion | Test path + test name | Tested SHA | Fixture + scenario date | Expected result | Actual result | Run/log/artifact link | Reviewer/date |
| VP-036-R01 / AC01/AC03 subcases | `tests/e2e/app.test.ts` — `AT-36: imports a period-bound GL source, reconciles opening plus movement to TB, and retains replacement history`; `tests/unit/gl-import.test.ts` — `VP-036 GL source intake` | `22b895ce6b65435724dc24c48ecf3114c63c26c5` | ENG-26001; current chart/book; CSV with custom journal header, mapped to source column 1, account openings and balanced in-period journal; 2026-09-24 | User maps a nonstandard header, per-account opening + movement equals TB close, revision retains mapping, and replacement history remains immutable | PASS for tested subcases — Chrome reloads the mapped source/tie-out; unit checks cover manual mapping, XLSX, duplicate keys, unbalanced journal, wrong period/currency/date, rejection without mutation, replacement history, reconciliation staleness and unchanged TB rows | `npm run lint`; `npm run test:unit` 168/168; `npm run test:e2e` 71/71 (5 static + 66 Chrome) | 2026-09-24 |
|---|---|---|---|---|---|---|---|
| VP-019-AC02 subcases | `tests/e2e/app.test.ts` — `AT-02/AT-54: preserves conflicts and reports browser-storage failure without silent overwrite`; `tests/unit/guards.test.ts` — expired grant cannot list/create clients | `fdc70a6ebdd1d161af6b4557c2fd17cee7f8f4b6`; revocation path tested at `51de04c98d74302589634f27c69b9d0137c16e83` | Local Chrome; relationship identity; unsaved client form; second tab revokes then separately expires the Global grant; 2026-09-24 | Stale workspace removed; no stale save; preserve newer history; after reload, no expired-scope client rows or create action | PASS — revocation history backed up; expiry removes scope and UI action; store command rejects missing Global scope | `npm run test:e2e` 71/71 (5 static + 66 Chrome); `npm run test:unit` 163/163; `npm run lint` PASS | 2026-09-24 |
| VP-019-AC02 open report/search projections | `tests/e2e/app.test.ts` — `AT-02/AT-54: preserves conflicts and reports browser-storage failure without silent overwrite` | Current worktree (uncommitted) | Local Chrome; manager Search dialog and Report Centre open; second tab separately revokes and expires Global grant; 2026-09-25 | A stale tab must hide dialogs, route controls, filters, metrics, exports and report rows before stale actions can continue | PASS — focused test 1/1; `npm run build` PASS | Build + focused `npx tsx --test --test-name-pattern="AT-02/AT-54: preserves conflicts" tests/e2e/app.test.ts` | 2026-09-25 |
| VP-003-AC02 draft guard subcases | `tests/e2e/app.test.ts` — `VP-003-AC02: guards proposal, invoice, cash-flow and package drafts across route changes` and `AT-45: creates, returns and independently approves a balanced group elimination` | Current worktree (uncommitted) | Local Chrome; route changes from proposal, billing, financial statements, package and consolidation review views; 2026-09-25 | Stay preserves proposal; Discard does not persist proposal/cash-flow/review edits; Save persists invoice/disclosure before changing route | PASS — focused proposal journey and AT-45; full E2E 76/76 | `npm run lint`; `npm run test:unit` 182/182; `npm run build`; focused journeys; full `npm run test:e2e` 76/76 | 2026-09-25 |
| VP-003-AC02 draft guard subcases: acquisition and Client 360 | `tests/e2e/app.test.ts` — commercial inquiry, client profile, PBC create, PBC clarification/edit guard journeys; AT-07/08 acquisition lifecycle; AT-23/24 PBC lifecycle; AT-53 all-route/dialog journey | Base `ffcf34c0000c9cc18bc9dc2c8d1fff87b6ca060f` plus uncommitted worktree delta | Deterministic `createInitialState()`; relationship persona; CL-001 profile; PBC-01 received-response fixture; inquiry and Client 360 PBC create/clarification/edit forms; local Chrome; 2026-09-26 | Stay retains drafts; Discard does not persist inquiry/profile/request/message edits; Save persists inquiry/profile before route change; invalid saves stay in the form; unsaved prompt is an accessible dialog | PASS — focused acquisition/profile/PBC Chrome 4/4; AT-07/08 1/1; AT-23/24 1/1; AT-53 1/1; serialized full E2E 109/109 (5 static + 104 Chrome), unit 231/231, production build, lint and diff check | `npm run lint`; `npm run test:unit`; `npm run build`; focused `npx tsx --test --test-name-pattern="guards a commercial inquiry draft across route changes|guards client profile drafts across route changes|guards a client PBC request draft across route changes|guards PBC clarification and edit drafts across route changes" tests/e2e/app.test.ts`; focused AT-07/08, AT-23/24 and AT-53; `npm run test:e2e`; `git diff --check` | 2026-09-26 |
| VP-019-AC04 approval evidence and named group scope subcases | `tests/unit/guards.test.ts` — `access grant history (VP-018/019)`; `tests/e2e/app.test.ts` — `AT-17/AT-18: keeps identity mapping separate from a reviewed scoped access grant` | Current worktree (uncommitted) | Local Chrome + deterministic seeded tenant; professional manager persona, management approver persona, GRP-01 group grant, and one Engagement grant; 2026-09-25 | Require independent approval evidence for professional/management roles; a group grant exposes only its named report and preserves separate client/engagement scope | PASS — unit covers missing/duplicate evidence, valid group scope and guarded perimeter edit; Chrome covers rejected missing evidence, grant/revoke history, group workspace, and unchanged client/engagement scope lists | `npm run lint`; focused unit and Chrome checks; full `npm run test:unit` 182/182 and `npm run test:e2e` 75/75 | 2026-09-25 |
| VP-010-AC03 subcase | `tests/e2e/app.test.ts` — `AT-58/VP-010-E02: returns, revises and redisplays a proposal without rewriting the earlier presented snapshot` | Current worktree (uncommitted) | Seeded PROP-001 Rev 2 presented in QAR 600,000; Amira prepares Rev 3; Layla returns, amends, independently approves and re-presents; 2026-09-25 | Preserve the exact prior presented revision/preview, require return rationale, and bind new review/presentation to revised scope, fee, terms and USD currency | PASS for exercised subcase — old Rev 2 remains QAR 600,000; Rev 3 is returned with reason, revised to USD 625,000 then USD 640,000, approved and presented; prior preview unchanged | `npm run lint`; `npm run test:unit` 185/185; focused Chrome 1/1; full `npm run test:e2e` 83/83 (5 static + 78 Chrome); legacy syntax and `git diff --check` PASS | 2026-09-25 |
| VP-029-AC01/02/03/04 subcases | `tests/unit/calculations.test.ts` — `budget fixed example (AT-29)`; `tests/e2e/app.test.ts` — `AT-59/VP-029-E01/E02: aggregates each engagement once using approved time rate snapshots by currency` and `AT-29/VP-029: versions a budget without rewriting approved time rates` | Current worktree (uncommitted) | Seeded 600 planned/660 approved minute calculation; ENG-26001 QAR budget with approved pinned times plus extra job budget; separate ENG-AT59-USD engagement and time; billing-role UI; 2026-09-25 | Fixed variance/missing-cost behavior, no engagement double count, actuals use saved time rates, currencies remain separate, budget edit retains historical time and cost is not exposed to billing role | PASS for exercised subcases — unit yields +1 hour/+QAR 200 and missing cost unknown; Chrome shows QAR 1,900 and USD 100, one engagement row, v1→v2 history, unchanged approved time valuation and hidden cost rates/totals/editor fields for billing role | `npm run lint`; `npm run test:unit` 185/185; focused AT-59 Chrome 1/1; full `npm run test:e2e` 83/83 (5 static + 78 Chrome); legacy syntax and `git diff --check` PASS | 2026-09-25 |
| VP-030/031-AC01/02/03 subcases | `tests/e2e/app.test.ts` — `AT-30/VP-030: drafts an invoice from approved time and reserves the source once`; `tests/unit/guards.test.ts` — ad-hoc line and draft cancellation guards | Current worktree (uncommitted), base `0077cc6` | ENG-26001 / INV-AT30-MULTI; client billing snapshot; quantity 2 at QAR 50; cancel and re-reserve TIME-01; 2026-09-25 | Invoice retains account/contact snapshot and exact approved source; ad-hoc extensions reconcile; unapproved cancellation retains history/releases matching source; approved cancellation is rejected | PASS for exercised subcases — account/contact snapshot persists; two QAR 100 lines total QAR 200; cancelled invoice retained; TIME-01 released then reserved to a replacement; approved invoice cannot be cancelled | `npm run lint`; `npm run build`; `npm run test:unit` 188/188; full `npm run test:e2e` 83/83 (5 static + 78 Chrome); `git diff --check` clean | Reviewer sign-off pending / 2026-09-25 |
| VP-000-AC00 (template) | — | — | — | Exact criterion assertion | Not run | — | — |Existing repository Verified statuses are preserved here without inventing missing per-criterion log links. Populate this ledger to make acceptance independently replayable. An updated test count alone is not an evidence ledger.
### 10.3 Final acceptance gates
- [ ] All 64 original stories have accepted criterion-level evidence; all four criteria per story remain accounted for.- [ ] All 39 modules have working routes, commands, scoped records, fixtures and positive/negative/rework evidence.- [ ] All 54 original journeys produce their exact required observable results, including the manually entered, non-seeded full lifecycle.- [ ] Partial/pending/failed/blocked work has been resolved or explicitly descoped by the owner without silently rewriting requirements.- [ ] No excluded AI, mobile, payment, eSignature, tax/payroll, recurrence/automation, advanced inbox, non-M365 or Purview feature is introduced.- [ ] Human professional approvals remain separate from generic task completion, contact nomination, administrative access and invoice issuance.- [ ] Historical source/mapping/note/artifact/approval/release/archive identities survive supported edits, replacements and recovery.- [ ] All required money/date calculations, source links, exports and role-filtered reports reconcile to controlled fixtures.- [ ] Failure, stale state, dirty navigation, responsive/keyboard access and browser storage behavior have observed evidence.- [ ] The final handoff identifies local simulations and actual verification limits without claiming real Microsoft connectivity, professional assurance or external retention.- [ ] An owner-approved final review is recorded; merge/deploy actions remain separately authorized.None of these overall-product gates is prechecked merely because a subset of stories is Verified.
### 10.4 Change history
| Date | Tracker version | Source snapshot | Change |
|---|---|---|---|
| 2026-09-24 | 1.0 | `eaaa7cfd0ea9379a19e147c98752466ea75aab8d` | Initial complete status tracker: original 64 stories/256 criteria and 54 journeys retained; 13 stories and 10 modules repository-verified; pending work separated into implementation, evidence and scope reconciliation. |
| 2026-09-24 | 1.0 | `fdc70a6ebdd1d161af6b4557c2fd17cee7f8f4b6` | Added expiry-scope browser evidence and client-list/create grant enforcement. VP-019 remains Partial with additional role, group, and projection combinations open. |
| 2026-09-25 | 1.0 | Current worktree (uncommitted) | Extended AT-02/AT-54 with open Search and Report Centre control removal after second-tab revoke and expiry; added distinct professional/management approval evidence and explicit consolidation Group grants without widening client/engagement lists. Full unit/E2E suites pass; VP-019 remains Partial. |
### 10.5 Original verification and handoff obligations — preserved
This extract retains original §9 numbering so no performance-fixture, documentation or acceptance obligation is lost. Baseline command suggestions must be reconciled with the current active runtime: do not revive a retired standalone build or imply new commands were executed here.
### 9.1 Definition of done for a functional story
A story is complete only when its validated form and local commands work, its records are connected to the shared context, its permitted role can reach it, forbidden roles/scopes are handled, its data survives supported reload behaviour, and its acceptance criteria have executed evidence. Include empty, failure, stale and rework states where relevant. Screenshot coverage without functioning actions is not sufficient.Keep a module checklist with columns:```textModule ID | Story IDs | Route(s) | Command(s) | Fixture(s)| Positive test | Negative/scope test | Rework/stale test| Tested commit | Actual result | Remaining limitation```Complete prototype coverage is not complete production functionality. The final user guide must continue to state that browser role filtering/local history are not enforceable production security or immutable records.
### 9.2 Baseline and proposed verification commands
Inspect the real checkout first, including any repository instructions and existing tests. Do not infer installed tools from this document. The currently declared scripts are listed in §3. On the preserved lockfile baseline, use:```bashnpm cinpm run buildnpm run legacy:check```If readable legacy sources changed, regenerate before checking. The source build script supports Python; use the command matching the environment:```bash
# Linux/macOS with Python 3 available:
python3 build.py
# Windows Python launcher, as currently documented by the repository:
py -3 build.py```**Deliver under VP-063:** working `test:unit` and `test:e2e` scripts, plus the required test dependency/browser setup documented in README. Only after those scripts exist, run:```bashnpm run test:unitnpm run test:e2e```Bind browser acceptance to the Vite build served locally, with the actual output directory/configuration verified from the checkout. Playwright can launch a local server using its `webServer` configuration. [W2] The legacy standalone build can receive a separate smoke test, but passing a historical standalone file is not acceptance of the active app.Verify file formats programmatically in tests as well as opening representative outputs. Check that exports contain the correct data and watermark, not just that a download event occurred. Runtime network interception must prove simulation controls do not send Microsoft/email/payment/AI requests. Builds/package installation may use development package infrastructure; that is not business-provider integration.
### 9.3 Performance and scope test fixtures
Use at least a small fully understandable scenario and a bounded expanded scenario, for example 25 clients, 50 engagements, 100 jobs, 1,000 tasks and a 2,000-row import. These are proposed test sizes, not a claimed production capacity or a reason to add infrastructure. Adjust explicit import caps if measurement shows browser-local constraints; document the observed limitation and do not silently truncate.Include two engagements for the same client, two clients with similar names, two different people with the same role, one multi-role person, one disabled identity, one narrowly scoped group user and one client identity with multiple explicit grants. These fixtures catch the scope and independence bugs that a single happy-path persona cannot expose.
### 9.4 Required repository documentation
Proposed files or existing canonical equivalents:- `docs/prototype/scope.md`: current supported scope, hard exclusions and historical-source distinction.- `docs/prototype/baseline.md`: actual inspected revision/runtime/build/test inventory.- `docs/prototype/module-coverage.md`: all 39 module rows mapped to routes/commands/tests.- `docs/prototype/demo-scenarios.md`: presenter journeys, synthetic data and expected arithmetic.- `docs/prototype/verification.md`: commands actually run, commit/artifact IDs, results and limitations.- Updated `README.md` and relevant role guide: current routes, feature boundaries, build instructions and simulations.The exact filename may follow a repository convention; do not create duplicate guides where a suitable canonical document already exists. Keep historical requirements traceable rather than silently rewriting them to pretend the old scope always matched the new one.
### 9.5 Issue and PR workflow
Use one issue per story or a small explicitly linked vertical slice. Branch from the verified current default branch, not from an assumed old SHA; first reconcile changes made after this baseline. Each PR lists story IDs, affected module IDs, local schema changes, positive/negative tests, exclusions checked and screenshots only where useful. Mark all unexecuted tests as unexecuted.Do not edit generated artifacts without their source, delete prior demo history, publish credentials, or change the production AuditSphere repository. Do not merge or deploy without the repository owner's explicit authorization and the applicable repository policy. This backlog is not merge/deployment consent.
### 9.6 Final acceptance checklist
- All 39 modules have an actual demonstrated workflow and complete traceability, including the six previously stronger areas' remaining gaps.- All 64 stories and all 54 cross-module journeys have observed results; required failures/blockers are resolved before claiming full coverage.- Jobs, tasks, subtasks and templates remain simple and manual.- M365 screens are useful local simulations, with SharePoint canonical, OneDrive optional, basic email only, and no Purview.- Client and staff projections, same-person approval checks, version staleness and historical snapshots work consistently across shared data.- Invoices/receipts are firm-only, accounting is import-first, and consolidation does not mutate component books.- Genuine output formats open correctly; original uploaded bytes are not falsely promised after reload.- Existing valuable PBC/workpaper/review/release demonstrations remain intact or have documented equivalent replacements.- Active UI and catalogue do not reintroduce excluded features; historical references are visibly historical.- The final handoff clearly says what is prototype-only and does not claim live integration, production authorization, professional correctness, or deployment.
### 10.6 Coding-agent handoff prompt
```textUse this requirements and progress tracker with the originalGap_Closure_User_Stories.md in nirzaf/auditsphere-visual-prototype.Resolve the current default branch and read repository instructions first.Preserve original VP-001–VP-064 and AT-01–AT-54 definitions. Preserve workingverified functionality and all historical records. Reconcile any newer changesagainst the pinned snapshot before acting.Choose one bounded pending action or coherent vertical slice. Check whetherits gap is implementation, verification or scope clarification before coding.Do not add excluded services or rebuild functionality already implemented.Use a separate branch/issue according to the repository workflow.Implement only the missing in-scope behavior, run the required positive,negative, stale, rework, reload and cross-scope tests against the active Viteapp, then record exact commit/fixture/expected/actual/run evidence againsteach original criterion. Keep failures, blockers and unexecuted checks visible.Do not mark a whole story Verified because one route renders or one test passes.Update this tracker and canonical coverage/verification/limitations recordsconsistently. Do not merge, deploy, call live providers or modify productionAuditSphere without separate explicit authorization.```
<a id="sources"></a>
## 11. Source register and provenance
All current repository links below are pinned to the same SHA. This artifact was compiled by reading the latest connected GitHub records and the original conversation attachment. It was not produced by rerunning the application or its tests.- **[S1]** [Current pinned commit](https://github.com/nirzaf/auditsphere-visual-prototype/commit/eaaa7cfd0ea9379a19e147c98752466ea75aab8d).- **[S2]** [Original complete backlog](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/Gap_Closure_User_Stories.md).- **[S3]** [Current 39-module coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/module-coverage.md).- **[S4]** [Current recorded verification](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/verification.md).- **[S5]** [Current remaining limitations / verified-story declaration](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/docs/prototype/remaining-limitations.md).- **[S6]** [Current browser test source](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/tests/e2e/app.test.ts).- **[S7]** [Requirements status screen](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/components/modules/RequirementsView.tsx).- **[S8]** [Shared store and commands](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/store/prototypeStore.ts).- **[S9]** [Identity/scope guards](https://github.com/nirzaf/auditsphere-visual-prototype/blob/eaaa7cfd0ea9379a19e147c98752466ea75aab8d/src/services/guards.ts).**Original requirement identity:** The mounted `AuditSphere_Prototype_Complete_Gap_Closure_User_Stories.md` is 143,608 bytes. Its Git blob SHA-1 is `1b3c61c3916af13fce6a4cd5e3a490b833477545`, matching the connected repository’s `Gap_Closure_User_Stories.md` at the pinned commit. This allows the 64 original story scopes and 256 criteria to be preserved exactly rather than reconstructed from earlier answer summaries.**Authoring-session verification:** Structural checks confirmed that this generated document includes 39 unique module entries, all 64 unique story definitions, all 256 original acceptance criteria, all 54 original journey rows, consistent status totals, no omitted story, and valid internal navigation targets. These are document checks only. They do not count as application tests.
### Historical reference list carried by original contract extracts
The following references are retained solely to resolve [R…]/[W…] markers in the original shared requirements and calculation examples. They describe the original baseline or guidance, not a fresh verification of current library versions or live external services.Repository references are pinned to the reviewed SHA. Source descriptions above refer to that revision only. Requirements and acceptance criteria are proposed design decisions based on the agreed conversation scope, not claims that these features already exist.- **[R1]** [README — browser-only boundary, local files, PBC and build usage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/README.md).- **[R2]** [React entrypoint and legacy runtime host](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/src/main.tsx).- **[R3]** [Legacy bundle/artifact generation](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/build.py).- **[R4]** [Existing package scripts and dependencies](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/package.json).- **[R5]** [Active role routes, page/action overrides, commercial/M365/user workflows](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/role-views.js).- **[R6]** [Base fixtures, accounting calculations, workpapers, review and release actions](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/base-app.js).- **[R7]** [Role-view guide, responsibilities and demonstration limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/3f30d348289d6d94dd49cb1d976e23018183eec9/ROLE_GUIDE.md).- **[W1]** [React: useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) — subscribing React to an existing external store; checked 23 September 2026.- **[W2]** [Playwright: local web-server configuration](https://playwright.dev/docs/test-webserver) — running browser tests against a local application server; checked 23 September 2026.**End of implementation backlog.**---
**End of tracker. Current status is a pinned snapshot, not a live dashboard.**
