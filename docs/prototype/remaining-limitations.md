# AuditSphere Visual Prototype — Remaining Limitations

## Enterprise UX enhancement (MOD-UX-01, recorded 2026-09-27)

The shared enterprise UX layer adds one lifecycle/status vocabulary, a per-module
identity and lifecycle line, and consistent empty/no-match/out-of-scope list
states across the supported routes. What it does **not** claim:

- **Presentation only.** No shared primitive reads or writes business state, so
  nothing in this layer relaxes a guard, a revision check or a segregation-of-duties
  rule. Where a module's lifecycle is shown, it is derived from fields the store
  already owns.
- **Lifecycle models are reported, not enforced.** `LIFECYCLE_MODELS` describes how
  each module's work moves; it is not a workflow engine, and there is no scheduler,
  rules engine or background process (an explicit product exclusion).
- **Status badge accessibility is text + tone + accessible name.** The visible
  status text is not duplicated into a hidden text node, because a status inside a
  sentence must keep its exact inline text; the plain-language meaning is carried
  by the accessible name and the tooltip instead. This is a deliberate trade-off
  recorded here rather than an omission.
- **Per-module lifecycle depth varies.** The vocabulary, identity line and list
  states are applied across the routed modules; the interactive stepper is applied
  where a module derives its own step states, and several modules still present
  lifecycle detail as prose. `docs/prototype/lifecycle-matrix.md` records the
  evidence status per claim, including the rows marked Partial.
- **Two pre-existing harness limitations** were found and are recorded rather than
  changed, because neither is a product defect: the criterion ledger `check` mode
  reports 623 "mapped test moved files" findings at the 2026-09-27 baseline commit
  as well as after this work, and the VP-039 browser journey depends on the journey
  before it having restored the manager persona (it also fails under a filtered
  `--test-name-pattern` run at the same baseline). Neither affects the full
  serialized suite, which passes.

**Current (measured at `b988be1edf010f3f47c3aea646b5ad6a99f3dffe`):** 256/256 original criteria, 64/64 stories and 39/39 modules pass with executed
evidence ([ledger](criterion-evidence-ledger.md)); 0 open action rows; decision **APPROVED_FOR_DEMO** under PROTOTYPE-AGENT-ACCEPTANCE-001
(AI-agent acceptance of a browser-only demo). What remains are **intentional boundaries**, not open work:

- Microsoft 365 is simulated (`liveConnected` stays false): no OAuth, credentials, tenant provisioning, mail sending or Purview.
- Browser storage is not a security boundary; the superuser is a presenter tool; approvals are recorded decisions, not signatures.
- Library/workpaper originals are in-session only (metadata + SHA-256 persist); PBC response bytes and generated/archive artifacts persist in IndexedDB.
- Group reporting supports one parent + one 100%-owned subsidiary with closing-rate translation and manual eliminations; other methods are refused.
- No payments, tax/payroll engines, eSignature, recurrence/automation, AI features or non-Microsoft integrations.
- Not production, not professional methodology or opinion, not legal retention; no deployment was part of this acceptance.
- Review basis: separate fresh-context Claude review subagent (two rounds) and disclosed same-session AI self-review — not independent human assurance.

## Baseline (2026-09-27, before closure — historical)

Updated 2026-09-27. Selected R01–R14 defects received code and regression
coverage, but that does not constitute full acceptance. The canonical tracker
currently records 16 of 64 stories and 10 of 39 modules as Verified; 48 stories
and 29 modules remain Partial. The detailed tracker action tables contain 121 rows:
83 verification/evidence cards and 38 scope cards. The separate remaining-action
inventory has 27 open rows (25 verification and 2 scope). VP-003-E02, VP-063-E01 and VP-064-E01
are three highlighted residual actions within that broader queue, not an exhaustive
count of open rows. Human acceptance remains pending.
The detailed notes below include historical snapshots and must not override
the current tracker totals or evidence status.
Automated sources explicitly trace AT-01 through AT-55; supplemental journeys AT-56 through AT-58 are listed separately. See
`verification.md` for exact executed checks.

- **VP-003 — shared dialogs (Partial):** App-wide dialogs now restore focus to
  the clicked opener even when it was opened through a programmatic click.
  Chrome verifies Escape from the client edit dialog returns focus to its Edit
  Profile button and New Job dismissal returns focus to its trigger. Save,
  cancel, and dismissal paths for every active dialog still need direct
  evidence. The shared dirty-form registry covers M365/client contact, proposal,
  invoice, cash-flow schedule, package disclosures, planning, risk/program,
  accounting, TB staging, and consolidation perimeter/elimination/review/output/
  FX forms. A focused Chrome journey verifies Stay/Save/Discard on proposal,
  invoice, cash-flow and disclosure drafts. M365 dirty-form global search now
  exercises switching to a different client's ENG-26002, with Stay and Discard
  behavior covered. AT-57 verifies Stay/Save/Discard for a consolidation output draft across route changes; Save prepares and persists the output package before transition. Other draft combinations and context changes remain open. Chrome now verifies a restored
  out-of-scope ENG-26002 selection renders no restricted details, then selecting
  permitted ENG-26001 opens Financial Statements. The broader route and grant
  matrix remains open. The latest full suite after the current VP-033 changes
  passed 204/204 unit and 92/92 E2E (5 static + 87 Chrome). AT-53
  focus wrap, AT-37 mapping navigation and AT-45 persona-change all pass.

- **VP-005 — practice dashboard (Partial):** Focused Chrome coverage now spans
  manager, partner, billing, records, preparer and narrow/no-grant scopes. All
  six metric cards open filtered lists whose row counts reconcile to their
  displayed metrics; empty, completed, cancelled, blocked, archived and
  no-access states are covered. Criterion-level sign-off and exhaustive
  role/grant/filter combinations remain open.

- **VP-011 — proposal response evidence (Partial):** Staff and client views record response type, active contact, date, Email/Meeting/Letter method, notes and correspondence reference. The store retains actor, actor role, contact identity and presented revision; rejects unsupported values, inactive or cross-client contacts, bad dates, missing evidence, duplicate responses and stale revisions; and requires a reason for commercial returns. AT-09/AT-52 cover client-portal Meeting and Letter; AT-56 covers a staff-recorded dated Letter withdrawal with no automatic engagement. Stale-dialog and full actor/resource matrices and story-level acceptance remain open.

- **VP-012 — engagement change rework (Partial):** Service/year/period changes stale statement, reconciliation and cash-flow revisions; supersede active audit plans; flag performed procedures for reassessment; and clear release approvals/candidates. Team changes supersede active plans and flag performed procedures. AT-12 now explains these effects before save and verifies stale statement, superseded plan and procedure reassessment states afterward. The accepted proposal fee/currency remain unchanged by engagement administration; AC04 does not require a fee amendment. The evidence action is closed; other VP-012 criteria and story-level acceptance remain open.

- **VP-016 — contextual internal notes/comments (Partial):** AT-14 covers scoped client/engagement/job/task notes, authorized recipient-only local mentions, edit attribution, reasoned moderation, reload persistence, empty/oversized rejection, inert unsafe markup and client-portal exclusion of note text, counts, attachment references and mention notices. A store regression confirms note edits leave separate approval/review history unchanged. Broader actor and grant combinations remain open.

- **VP-010 — proposals (Partial):** Reusable supported-service and content-template
  editors, revision histories, default copying, editable multi-line pricing and
  dated proposal periods are implemented. VP-010-E01 passed in Chrome, and unit
  checks reject reversed or invalid ranges. Pixel-level print-layout review,
  every original field/criterion, and browser return/revise/redisplay preservation
  evidence remain open. Chromium renders a real PDF and the test checks its
  signature and page object.

- **VP-029 — budgets (Partial):** AT-29 verifies the fixed 600/660-minute example, missing cost as unknown, and excludes mismatched-currency time from fee/cost totals while retaining its effort. AT-59 confirms engagement-once aggregation, approved-time rate snapshots, separate QAR/USD totals, retained budget history and billing-role cost privacy. The broader unallocated-line, review, rate-change and variance matrix remains open.
- **VP-030/031 — invoice drafting and correction (Partial):** AT-30 captures client account/contact details, reserves approved time once, supports quantity/rate ad-hoc lines, and retains cancelled draft history while releasing only its matching unissued time source. AT-31 revises a reviewed ad-hoc invoice with a reason, retains the prior snapshot and reviewer, clears stale approval, and requires fresh independent approval before issue. The staff download is a genuine invoice-number-bound PDF; issue and credit actions create no email or receipt, while reasoned credits retain exact invoice lineage without changing its face amount or moving money. Unit guards reject over-cap, cross-client and cross-currency credits. Editing source-linked invoice drafts, complete date/reference and correction matrices, and full story acceptance remain open.

- **VP-040/041 equity rollforward (Partial):** Opening total equity and evidenced
  contributions/distributions now reconcile to mapped equity and current-period
  result. Unsupported output remains unavailable; approved combined equity
  mapping does not support component balances. Versioned statement groups,
  ordering and subtotals are now editable and flow into previews and XLSX;
  AT-37 and AT-41/42/48 plus named store regressions now directly map all eight
  VP-040/041 criteria to exercised subcases. The disclosure lifecycle regression
  asserts generation advancement, retained package history and invalidated
  candidate/approval. Broad source/prior/layout combinations, component equity,
  disclosure rework matrices and human acceptance remain open (full unit
  266/266; full E2E 128/128 on 2026-09-27).

- **VP-044 — consolidation packages and translation (Partial):** AT-44 now
  warns when the component source moves past its pinned revision, preserves the
  old rows, and requires an attributable explicit re-pin. FX detail exposes each
  account's original amount, selected closing-rate revision/date, translated
  amount and rounding difference. Unit and Chrome checks exercise reporting-basis/period compatibility, pending-review output blocking, and exact revision/source matching. AT-44 now isolates a QAR 0.01 per-line translation-rounding residual from balanced component sources; generated group-package artifact lineage remains open.

- **VP-045 — manual group eliminations (Partial):** The lifecycle now enforces
  draft → submit → independent approve/return; submitted content is locked,
  returned content can be amended into a new draft revision, and approval still
  binds to current perimeter/package/rate pins. AT-45 covers the full lifecycle.
  A Chrome/unit example verifies a 100 receivable remains visible after only a
  900 matched pair is eliminated. MOD-26 now directly maps VP-043/044/045/046
  criteria to consolidation Chrome and guard tests. VP-045-E02/R01 close with
  replacement-package stale-review evidence, invalid counterparty/currency
  atomicity, duplicate inclusion and retained prior journal content. A separate
  unmatched record is not required by the original contract; the unexplained
  residual is displayed for manual resolution. Broader story matrices and
  independent sign-off remain open.

## Known acceptance gaps

- **VP-035 — trial-balance import (Verified):** AT-35 covers signed-net and
  debit/credit conventions, mapped accounting dimensions, header selection,
  CSV and genuine XLSX replacement history, exact source hashes/context, and
  non-committing errors for malformed, unbalanced, duplicate, formula,
  unknown-dimension, over-limit, unmapped-account and stale-context inputs.
  The store also rejects invalid dimension values atomically. MOD-21 remains
  Partial for the separate GL intake and opening/movement/closing work in
  VP-036; its bounded original-control comparison is complete, but broad
  story/criterion acceptance remains open.

- **VP-036 — general-ledger intake (Partial):** AT-36 imports period-bounded
  CSV/XLSX journal lines with explicit opening balances, retains immutable
  engagement-scoped revisions, and reconciles opening plus movement to the
  closing TB by account. Preparers can map unfamiliar headers; the selected
  source-column mapping is retained with each revision. Scoped filters/export
  and dependent reconciliation/release invalidation are covered. VP-036-R01's
  bounded comparison of mapping, opening coverage, source filters, visible
  journal identifiers, filtered CSV and no-posting behavior is complete (entry
  87). Partial-batch cases, the broader negative/output-review and actor
  matrices, and documented-size responsiveness remain open for acceptance; the
  eight-row fixture does not establish performance at that size.

- **VP-038 — adjustment journals (Partial):** Bounded verification actions
  VP-038-E01/E02 are complete (2026-09-26): revision-pinned evidence/document,
  workpaper and finding links reject foreign, unavailable and stale references;
  stale support blocks decisions and reporting with a reason; amendment history
  preserves predecessor pins. Unit/Chrome coverage spans accepted/unreflected,
  reflected, rejected, partial, unknown, stale source and stale support outcomes,
  duplicate inclusion rejection, fresh review after amendment, unchanged source
  rows, and TB v1→v2 re-confirmation with no duplicate effect. The current
  verification is build PASS, unit 266/266, full E2E 128/128, focused adjustment
  Chrome 2/2. New VP-038-AC04 store guards and unit regression reject invalid
  line types and mismatched client/engagement/currency context atomically on
  create and amendment. VP-038 remains Partial: AC01/AC04 and human review are
  not signed off, and remaining ledger-boundary review is open. Real ledger
  posting is out of scope; no production ledger behavior is claimed.

- **VP-034 — accounting setup:** client legal entity, reporting basis and
  currency; versioned chart accounts with parent/posting/active state; owned
  open/closed period books; bounded dimensions; engagement profile/chart/book
  pins; and setup revision history are implemented. Trial-balance imports show
  this context and reject incomplete setup or codes absent from the active
  posting chart. AT-34 Chrome and unit checks cover save/reload, retained prior
  revision, invalid date ranges, duplicate codes, hierarchy cycles, posting
  parents, cross-client period owners, closed books, duplicate dimension values
  and invalid import accounts. The full mapping, unmapped-account, comparative statement
  lineage workflow is covered by the separately verified VP-037 story. AT-34
  now confirms an accounting-context edit stales reviewed statements and marks
  the prior package generation stale. A chart edit also downgrades an approved
  mapping and stales a reviewed statement set in a same-client sibling
  engagement, retaining the mapping as a draft. Module 20 remains Partial until
  the wider client/period/chart change and rework combinations have direct
  acceptance evidence. Migrated legacy records keep reporting basis unselected
  until an authorized person configures it.
- **VP-039 — manual reconciliation:** preparers can save source-version-pinned
  schedules with dated, typed items; reviewers must be independent, return
  decisions need a reason, and approval blocks unexplained residuals, missing
  evidence and unlinked proposed corrections. AT-39 Chrome now verifies that
  out-of-scope schedule evidence and an unlinked proposed correction each leave
  the draft unapproved. AT-39 also verifies that replacing referenced DOC-002
  stales the live schedule while the prior Approved revision remains visible.
  Unit coverage verifies TB replacement staleness; Chrome verifies draft creation, self-approval
  denial, reasoned return, manager rework as a new revision, retained return
  rationale and independent approval against scoped evidence. The current unit
  matrix binds header/item dates to the selected engagement-owned accounting
  period, accepts both period boundaries, rejects malformed/non-cent amounts,
  invalid types/IDs, cross-engagement rebinding and mismatched/blank currencies,
  and preserves a valid USD schedule without conversion. Foreign-client and
  sibling evidence remain rejected. Full unit 266/266 and full E2E 128/128 pass.
  VP-039-E01's bounded evidence action is complete: AT-36 verifies explicit opening
  plus movement to TB close and source replacement; AT-39 verifies unknown opening,
  residual/evidence gates and statement staleness. Criterion/story review and human
  sign-off remain open; external statement provenance and subsequent bank reconciliation
  remain outside the local simulation.
- **AT-22 — local document metadata:** Chrome registers a real selected local
  file, reloads the browser, and confirms the original bytes are not stored or
  presented as downloadable. Upload to a remote library is outside scope.
- **VP-061 — global search:** Chrome verifies the client persona cannot find an
  internal communication and can find a shared document; unit coverage checks
  document-name grant scoping. Shared-document results now open the client
  portal with the matching engagement selected; staff client results open the
  matching client detail; job and invoice IDs are searchable and navigate with
  their engagement context. Search now filters by record type and permitted
  client/engagement context; Chrome confirms these filters narrow results and
  client filter choices omit ungranted engagements. Task results select and
  highlight their task; workpaper and finding results select matching records;
  contact results open Contacts at the matching row; PBC results open Requests
  at the matching row. Unavailable documents remain searchable with an
  Unavailable status and open as selected, non-openable records; archived client
  results are labeled and still open their historical client record. Broader
  combinations across other person/grant classes remain uncovered. Chrome also
  confirms the two-grant client administrator sees CL-001/CL-003 and cannot
  discover CL-002 in search context choices.
- **VP-060 — reporting (Verified):** WIP now values approved time using its approval-pinned
  rate; missing rates remain unknown instead of using a later budget version.
  A fixed calculation check covers approved, unapproved and missing-rate rows.
  Chrome now maps every exported CSV field for all 16 reports to persisted source
  records; WIP, utilization and compliance values are also independently
  recomputed. Chrome verifies manager and partner full catalogues, billing's nine
  reports, records' four reports and client-filtered exports for all records views.
  Print actions are invoked for all 16 reports. Device-specific printer output and
  external BI are outside the browser prototype.
- **VP-032/033 — receivables:** Chrome records an offline receipt, allocates it
  across two issued invoices and reverses one allocation with a reason while
  preserving the other invoice settlement. Zero, negative, non-finite and
  over-precision receipt amounts are rejected atomically; 0.01 and recorded
  reference metadata are accepted. The receipt register offers allocation only,
  with no in-place edit/delete or payment/refund/link/bank-connection action.
  Unit coverage reconciles partial/split/full allocation and reversal balances,
  due dates before and after receipt recording, stale invoice totals, over-cap
  rejection, required reasons, retained history and duplicate-reversal safety.
  The source story requires creation metadata and allocation-reversal history,
  but does not define post-record metadata editing. It exports a client-scoped CSV
  statement with issued invoices, credits and receipts; Draft and other-client
  invoices are excluded. Client, as-of date and currency filters drive the
  balances, including historical balances before a later receipt. The printable
  statement has a native browser print action; Chrome produces a one-page PDF
  whose rendered title, account/date/currency context and table rows were
  visually verified. Physical printer and OS-driver behavior are outside the
  browser prototype scope. The integration is offline-only. All five aging
  bucket cards open invoice-level gross, credit, payment, outstanding and
  overdue-day detail; Chrome verifies every bucket drill-down sum against its
  fixed-date calculation. Unit cases cover due-today and each day-count
  boundary, plus reversal dates that preserve historical aging before reversal
  and restore invoice/unallocated receipt balances afterward. Broader
  actor/currency scope matrices remain to be accepted.
- **VP-030 — source-linked billing:** Chrome drafts an invoice from approved
  billable time at its pinned rate and accepted fixed-fee proposal balance. Time
  sources are reserved once, and fixed-fee invoices cannot exceed the accepted
  contract balance. Fixed-fee caps are proposal-level; per-service milestone
  allocation remains unmodeled.
- **AT-14 — internal collaboration:** Chrome verifies an internal job note and
  authorized staff mention stay absent from the client portal. Authors can now
  edit their notes; the edit records actor and time, and another persona is
  denied by the shared store guard. Moderation and recipient-specific
  notification browsing remain incomplete.
- **AT-27 — manual communications:** Chrome records an inbound meeting note with
  a scenario-date-bounded date, verifies the summary/participants/notes character
  limits, persists a selected historical date deterministically, and confirms the
  client portal omits an internal record. Managers/partners receive an explicit
  publication warning; declining leaves visibility internal, preparer publication
  is blocked in the store, and confirmed content appears only in the matching
  Northstar portal. Same-scope shared document links appear there, while internal
  document names remain out of portal/search output. Reasoned correction preserves
  prior content, actor and revision. Store guards reject impossible/future dates,
  over-limit text and unsafe document links atomically. Broader actor/context,
  linked-request and correction/rework combinations remain incomplete.
- **AT-26 — simulated email:** Chrome resolves the request template and records
  accepted, failed and unknown outcomes locally without external mail requests.
  Only active contacts for the client can be selected; each explicit send stores
  a unique local simulation reference and states that no provider receipt or
  external delivery confirmation exists. Repeated submission under the same
  operation token records once; reopening the composer creates a distinct
  deliberate attempt. Unknown outcomes are not automatically retried. Sender,
  unresolved-placeholder, document-link and template-permission cases remain
  open; real provider receipts remain outside the local prototype.
- **AT-21 — optional OneDrive:** Chrome verifies disabled-by-default gating,
  saved enablement, current simulated success and a selected local metadata
  import under the SharePoint canonical hierarchy. Real file transfer and
  version freshness remain outside the prototype.

- **AT-11/12 — jobs and tasks:** Chrome verifies combined client, engagement,
  owner, status and overdue job filters; manual status changes; reasoned job
  cancellation; and retained task, linked document and time records with an
  attributable cancellation event. Unit guards require a reason and prevent
  reopening a cancelled job. Chrome also verifies that open subtasks block parent
  completion and that reassignment changes the real assignee with a retained
  reason and no authority grant. Chrome now edits job and task details with
  history, changes task status with blocked-reason enforcement, reorders siblings,
  and displays linked job files and time entries while preserving assignment
  history. Task-level comments/attachments and the broader job/task return/reopen
  matrix remain incomplete.
- **AT-13 — job templates:** Chrome authors and publishes a Draft, cancels an
  instantiation without side effects, then applies the template with explicitly
  selected start/delivery dates and owner. Fresh task IDs use that owner rather
  than role suggestions. A separately edited revision leaves the existing job
  and prior template unchanged; retiring blocks new instantiations. Double
  submission with one operation ID creates one job; unit checks reject changed
  details with that ID and invalid/untitled template structures. Technical
  evidence is complete; the acceptance owner's story sign-off remains pending.

- **VP-050 — audit fieldwork:** Chrome records work performed against PRC-01,
  submits it with a linked current adequate evidence revision, denies preparer
  self-clearance, and retains independent manager clearance after reload. The
  PRC-04 exception remains visible after submission and clearance. Append-only
  procedure history records actor, time, program/template version, status,
  prior/current work and conclusion, evidence limitation and return rationale.
  Chrome verifies an eight-entry PRC-01 rework history across return,
  resubmission and re-clearance; unit checks verify separate template-v1/v2
  procedure histories. VP-050-E01 is complete; the four acceptance criteria
  and full story sign-off remain open.

- **VP-054 — findings:** the findings register now writes through guarded store
  commands, validates scoped source references, preserves promoted sample
  exceptions, accepts qualitative findings without amounts, and separates signed
  net amounts from gross absolute totals by currency. Dispositions keep actor,
  rationale and time; “Corrected in TB” requires a linked reviewed journal that
  is reflected. Significant unresolved findings block release readiness. Chrome
  verifies a sourced qualitative finding and durable disposition, plus promotion
  of a sampled monetary exception with its population/item link. Financial
  aggregation remains unit-backed. VP-054-E01 now verifies that an unresolved
  Significant finding appears consistently in Release Completion, Financial
  Packages and Report Centre, and that a reasoned immaterial waiver resolves the
  release gate. VP-054-E02 now carries the qualitative/no-amount immutable-provenance
  and release re-evaluation evidence: a unit check and the Chrome journey hold a
  sourced qualitative finding's engagement/category/severity and its linked
  procedure/evidence/workpaper references unchanged (with amount and currency still
  absent) across Uncorrected → Waived-as-immaterial dispositions and a browser
  reload, prove no monetary value is invented, and show release treatment changes
  only after a reasoned human disposition. Criterion and story sign-off remain open.

- **VP-049 — risks and programs:** the risk register now edits persisted
  engagement-scoped risks; Chrome verifies a response edit and reciprocal
  RSK-01↔PRC-03 link after reload, and schema v9 repairs legacy unscoped links.
  Reusable program templates use supported audit areas, can be drafted, independently
  published, applied with fresh procedure IDs and empty work state, revised with prior
  versions retained, and retired without changing applied engagement work. Chrome
  verifies v1 and v2 remain pinned to separate applications after revision and retirement. Program
  views display reciprocal risk links and unresolved coverage gaps. Risk revisions
  are logged and visible. An approved plan now creates a superseding under-review
  revision when a risk changes, linked procedures require reassessment, and an
  independent reviewer can approve the new plan. Chrome also returns a plan with
  reviewer rationale, creates a separate manager rework revision, and independently
  approves it to restore planning. Risk owners now come from active in-scope
  professional staff; client, inactive and out-of-scope owners are rejected
  atomically at the store boundary and excluded from the UI selector. Cross-
  engagement procedure links are rejected, template-v1/v2 applications retain
  separate snapshots through retirement, and unresolved coverage gaps are visible.
  The focused VP-049 lifecycle regression now covers multiple risks on one
  procedure, repeated risk-driven plan revisions and procedure reassessment,
  reviewer return/rework/re-clearance, and unchanged plan, procedure and template
  snapshots. The two VP-049 evidence actions are complete; criterion-level and
  overall story acceptance remain open.

- **VP-018/019 — identity and access:** Chrome grants and revokes an engagement
  scope and verifies durable actor/time/scope/reason history after both actions.
  Grants now record approved-request references and effective/expiry dates;
  scheduled authority is excluded until its effective date, and the original
  window remains in grant history after revocation.
  When another tab saves a grant change, the stale tab now removes its open
  dialogs, search/navigation controls and all business projections until the
  conflict is explicitly resolved; a shared command guard rejects stale writes.
  Chrome verifies a grant revocation while an unsaved client form is open and
  confirms no stale client is persisted. Relationship-group membership is
  covered as non-authorizing; an administrator cannot self-grant, sees no
  receivables summary, and is denied a direct financial-statement route.
  Grant authoring now requires a distinct approval-evidence reference for
  professional and management-approver roles, retaining it through revocation.
  A named consolidation Group grant exposes that reporting workspace without
  widening client or engagement lists; Chrome covers the group report and keeps
  sibling client/engagement details hidden. VP-019-R03 is reconciled, while
  compatible-role changes and the wider approval, expiry and group/component
  combination matrices remain incomplete, so VP-019 and Module 19 stay Partial.
  The M365 wizard also saves permitted-person and initial role mappings without
  creating access grants. Local identity creation, disable/reactivate history, disabled-route restriction,
  and simulated invite/expiry/revoke/accept actions are covered; external invitations
  and actual authentication remain out of scope.

- **AT-07/08 — acquisition and proposals:** Chrome now exercises inquiry
  registration, stage history, separate-currency totals, required lost reason,
  scoped proposal drafting, independent review and presentation.
  Chrome now also converts a qualified Won opportunity to a Prospect, verifies
  that acceptance remains false, and checks the resulting stage history. Store
  checks enforce non-Won/lost conversion blocks, idempotent Prospect creation,
  converted-record immutability, required loss reasons, line-item totals,
  stale-review reset on revision, and preservation of the exact presented
  revision. The client portal records accept/decline/withdraw responses with an
  authorized contact and explicit evidence reference without auto-creating an
  engagement. AT-10 creates one draft from the accepted revision and separately
  requires partner acceptance evidence before activation. VP-012 now supports
  reasoned suspension, resumption, cancellation and closure; suspended or
  terminal engagements block scoped professional commands, while billing and
  archive operations remain permitted. Unit and Chrome checks cover the
  lifecycle and retained history. The administration editor records service, reporting year/period, due date and
  team changes; validates active grants; and clears release approvals. Scope edits
  reset planning/source/mapping acceptance, stale saved statement revisions, and
  require fresh work and review for executed procedures. The full affected-review
  applicability matrix remains incomplete.

- **R05 — release evidence:** package revisions create and persist real XLSX,
  DOCX and PDF bytes with verified SHA-256 manifests, and the issue guard binds to
  those artifacts. Chrome verifies exact-manifest release and amendment reset;
  altered bytes block candidate freeze until the exact saved blob is restored.
  Unit checks cover stale candidates, missing approvals, duplicate same-generation
  issue, recipient deduplication and amendment reapproval. VP-057/058 are Verified.
  Release remains an explicitly local record; no external delivery is performed.
- **R08 — accounting history:** imported trial-balance snapshots and mapping/source
  metadata are retained by revision. Financial statements and package artifacts
  now include accepted, unreflected adjustments exactly once; reflected or
  reflection-uncertain entries are excluded, missing account codes block output,
  and source rows remain unchanged. Unit and Chrome checks cover AJ-01 through
  statements and current-period equity; Chrome parses the generated package XLSX
  and checks both accepted adjustment lines in the exact account rows. A separate
  Chrome journey covers draft creation, independent technical review and scoped
  client management acceptance. Reflected decisions now require a saved evidence
  reference; partial/unknown status is blocked from reporting with an explanation,
  and history retains prior status, source revision and evidence through reload.
  Reasoned amendment now preserves the previous journal/approval/reflection revision,
  clears current approvals, and requires fresh technical and management review.
  Replacement-source correction/re-review is now browser verified; rejection and
  evidence/workpaper/finding linkage matrices, general-ledger and remaining downstream
  lineage workflows are still incomplete. Chrome also
  opens all 16 reports and checks CSV structure/client scoping; TB import retains
  predecessor rows and source hashes for balanced CSV and actual XLSX. AT-35
  also exercises UI-level rejection of duplicate codes, formula amounts, CSV
  bytes mislabeled XLSX, unbalanced totals, files above 2 MB, 2,001-row input,
  unmapped chart accounts and stale chart context; each rejected input leaves
  the accepted source rows/version unchanged. Broader import mapping,
  malformed-workbook and recovery combinations remain unverified.
- **VP-037 — account mapping:** every account now requires an explicit mapping in
  a current independently approved revision before statements can be exported or
  a package can validate. Unmapped accounts are listed rather than silently
  treated as legacy classifications. AT-37 now maps all accounts, saves a 60/40
  split from property/equipment into other current assets, obtains independent
  approval, traces both output lines to account 1500 in screen and XLSX, and
  verifies source codes on export. The remaining chart/period/dimension and
  downstream rework matrix remains open.
- **VP-040 — comparative statements:** the statement workspace now selects an
  earlier engagement for the same client/currency and shows current/prior asset,
  liability, equity, revenue and profit totals only when both mappings are
  independently approved. Missing or unmapped prior data is labeled unavailable,
  not zero. Chrome maps and approves both periods and reconciles the comparative
  asset totals. XLSX/PDF exports carry paired mapped statement lines, values
  and source-account references. Saved statement-set revisions now pin source,
  current/prior mapping revisions, totals and line sources; independent review
  is required. Chrome now changes the prior period's mapping after review and
  verifies that the saved current-period statement becomes durably stale and
  cannot be reviewed again; the guard also has a unit check. Comparative source
  and current mapping changes are covered by the shared stale-revision path.
  The Changes in Equity page no longer presents fixed sample opening/closing
  balances as if they were source-backed: it reports unavailable while the chart
  combines capital/reserves and no reviewed equity movement schedule exists.
  Building and reconciling that schedule remains open.
  Cash-flow schedules now persist revisioned opening cash, signed operating,
  investing, financing and non-cash movements, closing cash and evidence
  references. Independent review checks evidence scope, cent accuracy, cash
  movement reconciliation and agreement with the current approved mapped TB
  cash balance. Source or mapping changes stale reviewed schedules. A current
  reviewed schedule can be selected into the exact saved financial package
  artifacts. Chrome confirms a shared reviewed note is included in the generated
  PDF and an unshared reviewed note is omitted; store checks confirm disclosure
  and cash-flow revisions stale package generation while retaining historical
  snapshots. Broader disclosure rework, full statement source/layout acceptance
  and cash-flow edge coverage remain open.
  Package preparation still has one overall disclosure applicability and note
  rationale; this does not replace a per-note accounting-standard checklist.
- **VP-042 — financial packages:** package sections and their order persist
  across reload and revisions; Chrome verifies changed section ordering and
  confirms older artifact IDs and bytes remain intact after reassembly. A
  cash-flow section is selectable only from a current independently reviewed
  schedule and is added to package content with source evidence references. A
  forced XLSX-generation failure reports the exception and leaves
  the current revision unchanged. Package artifacts now persist together in one
  IndexedDB transaction; Chrome forces the second write to fail and confirms no
  partial blobs or package revision remain. After amendment, Chrome verifies the
  current package is re-presented and independently acknowledged by management;
  the previous decision remains in history. Chrome injects DOCX/PDF digest-read
  failures after genuine format generation and a second IndexedDB write failure;
  it confirms the error is visible, no package revision is saved, and no partial
  blobs remain. Direct failures inside the DOCX/PDF library generation routines
  and broader sharing/edge combinations remain unverified.
- **R09 — consolidation:** component resolution and pinned snapshots are improved;
  Chrome now verifies the configured group, approved elimination, balanced output
  and source-TB immutability. A separate Chrome journey blocks a missing foreign-
  currency closing rate, rejects zero, saves a dated rate revision and verifies
  source rows remain unchanged. The calculation profile is now explicitly limited
  to one Parent and one 100%-owned Subsidiary; store guards reject Associates and
  minority ownership, and Chrome verifies these unsupported profiles show no
  figures. Group updates now preserve existing immutable package pins or require
  a new pin to match the engagement's exact current revision and rows; altered
  balances cannot be submitted as a package snapshot. Schema v22 corrects only
  the known seeded label from Associate to Subsidiary. Chrome also removes the
  Subsidiary and verifies no output or source mutation. Perimeter edits now reject
  invalid dates and duplicate components, retain prior revisions, revert through
  a new revision, return an approved elimination to draft after component changes,
  and leave source trial balances unchanged. Manual elimination draft/amend and
  independent return/approval are now exercised in AT-45, including evidence and
  rationale capture, self-review denial, $125 single inclusion and unchanged source
  books. Perimeter and FX changes invalidate approvals while retaining decision
  history. A narrow ENG-26001 grant sees a redacted perimeter with no figures,
  editor or history; self-loop and cross-group revision changes are rejected.
  Unmatched amounts, duplicate inclusion, mixed-context/counterparty cases and
  component-replacement staleness remain incomplete. Group output can be saved as
  a digest-verified, watermarked JSON artifact with exact component/source/package,
  rate, elimination decision/history and total lineage. A separate Partner decision
  binds it to the current input fingerprint; post-review changes stale the artifact
  and block download. Full story and remaining edge-matrix acceptance are open.
- **R10 — migration/recovery:** migrations from schema versions 0–21 pass unit
  integrity checks. Chrome verifies concurrent-save and quota failures,
  malformed-payload preservation, exact future-schema backup preservation,
  ambiguous-import rejection without overwriting the backup, and validated v22
  import recovery. Recovery UI now offers validated import, current-state and
  preserved-payload export, and confirmed reset. Fixture guards cover impossible
  dates, reversed periods, broken references, personal email, binary payloads
  and monetary control totals. Historical recovery choices and downloaded-byte
  verification remain unverified.
  **Current-worktree update (2026-09-27):** schema v29 now repairs a missing client
  link and invoice-line collection only for the unchanged synthetic INV-26001,
  provided its unique engagement and remaining invoice identity match the fresh
  seed. The damaged-v28 browser journey confirms the workspace opens and the exact
  original payload remains stored/backup-exportable; customized invoices are not
  guessed. Authenticated schema-5 history, migration revisions 0–28, future-schema
  export, ambiguous import, quota/conflict and recovery journeys have passing
  evidence. VP-004-E01 bounded evidence is Complete; VP-004 criterion/story review
  and human sign-off remain open.
- **R12 — acceptance breadth:** Chrome now executes annual continuance, generated
  package persistence/release/amendment/archive, the full report catalogue and
  storage recovery journeys, CSV/XLSX TB replacement, and the complete PBC
  request/response/clarification/replacement/acceptance cycle, plus client
  creation/contact/custom-field/relationship-group and Client 360 navigation
  journeys (AT-05/AT-06). Every AT-01 through AT-55 identifier now appears
  explicitly in automated test source, but every acceptance criterion has not been
  executed end to end. VP-018 now covers local identity creation/disable, invitation
  expiry block, renewal, revocation and history; external onboarding remains simulated.
  Live AML/KYC screening (evidence references are manual), value-level report data
  reconciliation and other full acceptance paths still need direct evidence.
  Package sections, ordering and notes now persist by revision.
- **R06 — PBC submission limits:** responses are versioned with a required SHA-256;
  only the named contributor can upload, acceptance records actor/time/version,
  and accepted submissions can be reopened only through a reasoned replacement
  request. Prior acceptance decisions remain in history. Chrome verifies all
  replacement bytes/digests after reload and the superseding document chain, plus empty,
  >10 MB, unsupported type, MIME mismatch and IndexedDB quota failures. A store regression
  verifies replacement evidence returns to Pending verification, linked cleared procedures
  require reassessment, and submitted workpapers reopen as Changes required. No external
  upload occurs; broader reviewer, source and evidence-type matrices remain open.
- **R14 — archive integrity:** archive creation now copies every released package
  artifact into a separate IndexedDB record and verifies size, MIME type and
  SHA-256 before recording the archive. The copies remain browser-local and can
  be cleared or altered outside the app. This remains within logical local archive
  scope; Purview locks, physical deletion controls and external retention services
  are excluded. Retention dates are optional firm-selected metadata and do not
  assert legal requirements or schedule deletion. Chrome now verifies an active
  application hold blocks handover without recording a request, then permits a
  local successor-auditor request after the hold is lifted. A retention-date
  correction preserves before/after metadata in attributed history; v21 migration
  retains a baseline for existing archives. Chrome now indexes a successor
  release, verifies its copied artifact digests and predecessor link, and exercises
  hold/handover against the latest archive record. Server-side immutability remains
  outside this browser-local prototype.
- **Cross-cutting:** The shipped Content Security Policy limits runtime connections and default
  resources to the same origin; Chrome also blocks non-local HTTP(S) requests
  during all exercised journeys. Top-level external navigation after a user
  follows a link is outside this resource-egress policy. This is a browser-local,
  synthetic prototype with no live M365, email, payments, e-signatures, tax/payroll,
  AI, or other external services. Purview is excluded from the supported product
  scope, not an outstanding acceptance requirement.
- **Build size (Resolved):** The former 2,455.98 kB monolithic entry is code-split into 47 cacheable chunks and the Vite >500 kB chunk-size warning no longer fires (largest emitted chunk is vendor-xlsx at 419.25 kB; the entry chunk is ~36 kB). React, the document libraries (xlsx/docx/jspdf), the demo seed, the module-guide content and each module view are now separate chunks, so editing one view invalidates a small chunk instead of the whole bundle. Caveat: imports remain static (views are eagerly referenced), so total initial JavaScript (~2.98 MB minified) is broadly unchanged — true on-demand (React.lazy) view loading was implemented, verified to split the entry, then reverted because dynamic chunk fetches are incompatible with the prototype's strict same-origin CSP and headless acceptance harness (63/96 Chrome checks failed on unloaded views). Further initial-byte reduction via lazy loading is therefore out of reach for this browser-local, CSP-locked prototype.

## Lifecycle-closure delta (2026-09-26)

A module-by-module lifecycle audit closed the following genuine gaps (unit + Chrome evidence in `verification.md` entries 65–66):

- **MOD-22/MOD-34 dead-end:** no action could previously set an adjustment journal to 'Reporting included', so a finding's Corrected-in-TB disposition was unreachable from a live session. A guarded `markAdjustmentJournalReportingIncluded` action now requires management acceptance plus current reflected-TB evidence; the Chrome journey raises a linked finding and completes the disposition. Technical-review rejection also records a bounded rationale.
- **MOD-39 firm settings:** the statutory profile tab was an unwired stub (uncontrolled inputs, no save, fixture text contradicting the store). It is now a validated, role-gated, prospective-apply form with a logged reason, a recent-changes list, and downstream flow into invoice PDF identity.
- **MOD-14 invoice returns:** the store's review-rejection leg was unreachable from the UI; invoices now return with a mandatory reviewer note shown to the preparer, cleared on rework or approval, alongside rendered revision/approval history.
- **MOD-30 fieldwork returns:** reverting submitted/cleared fieldwork silently cleared the reviewer; it now requires and records a bounded reason, actor and time, cleared on re-clearance.
- **MOD-15 receipt methods:** the picker offered Direct debit and Credit card options the store always rejected (and which would falsely imply payment processing); it now offers exactly the supported offline methods.
- **Role-gating drift:** time review, job creation/reassignment, budget authoring, finding dispositions, document rename/move/availability and portal uploads now hide or disable controls the store would reject, with explanatory text instead of guaranteed-failure buttons.
- **Rendered history and empty states:** invoice revision/approval history, contact revision history, reassignment history, PBC submitted-file versions and acceptance history, and scope-reassessment history now render; empty states were added for templates, leads, proposals, invoices, time, adjustments, reconciliations, documents, communications, PBC and findings; the '/' shortcut now actually opens Global Search; MOD-29 gained a create-risk affordance (`createAuditRisk`) with reciprocal links.

## Verification snapshot

Latest local verification: 242/242 unit checks and full E2E 111/111 (5 static + 106 Chrome) passed. The earlier intermittent VP-003-E01 global-search focus assertion is fixed by focusing the input synchronously after modal mount; the focused case passed 3/3 and is also green in the full suite. VP-003 proposal-catalogue draft guards, F05 template lifecycle, and AT-35 route restoration are also green. VP-039 AT-36 known-opening and AT-39 missing-opening/display journeys, and PBC scenarios, are included in the full pass. On 2026-09-26 the then-current app bundle was deployed as Pages release `aa39d257` and verified at `https://prototype.steaudit.com`; this verification is against the current local worktree and is not evidence that these later changes are deployed. The built-in browser exercised PBC filters and submitted the synthetic fixture `synthetic_trial_balance.csv` to the seeded PBC-03 request; the request displayed Received/v1 and the timeline attributed the upload to Amal Nasser. This was a browser-local IndexedDB smoke, not external storage; demo state was reset afterward. MOD-17's Shell-search workspace now maps to `clients`; client-visible PBC conversation entries and replies display in a shared request timeline while staff-only entries remain hidden in the client projection. The review-guide findings F01–F05 (search authorization
before projection, draft-safe destructive reset, truthful context header, unique
navigation ID, budget/template draft guards) are implemented and carry dedicated
browser regressions that pass in the full suite. The prior 224/224 + 98/98 run at
`5d2ac8b` plus the criterion-closure delta
(firm-settings prospective consumption, source-linked invoice revision,
search target-state matrix, TB-replacement journal staleness, grant
evidence/role-combination matrix) is retained as historical detail below. AT-30 covers invoice account/contact snapshots, multiple ad-hoc lines, approved-time source reservation, explicit draft cancellation and re-reservation; approved invoice cancellation is rejected. AT-31 also covers return with reason, credit revision 2, independent reapproval of that exact revision, local issue and no payment movement. AT-32 covers receipt split, selective allocation reversal and balances; store guards reject malformed metadata, seeded allocations and stale receipt caches atomically. AT-34 verifies client-wide profile revision, sibling mapping/statement/package invalidation, retained prior package state, and closed-period TB/GL import denial. AT-36 verifies mapped GL tie-out and store guards reject unrecognized or inactive posting chart accounts before committing a GL revision. VP-006 supports full profile fields, revision-checked editing, soft archive/reactivation, duplicate and similar-entity checks, scoped profile editing and blocks new active work for suspended/archived clients. AT-05/AT-06 browser lifecycle covers edit, suspension, retained contacts, archive and reactivation; a store test confirms established engagement, invoice, document and workpaper links remain. VP-007 contact revision history and non-authorizing group behavior pass. VP-008 opens all 12 tabs under CL-001/CL-002 and, under an ENG-26001-only manager grant, filters the portfolio engagement count/Open Work shortcut and every Client 360 tab to ENG-26001 while excluding an ENG-26003-only PBC sentinel; it also preserves portfolio filters and context on back/forward. CL-002 creation journeys cover a job, PBC request, internal note and Draft invoice. VP-025 AT-18 verifies mounted portal entity refresh across client identities; VP-025-E03 covers no-access and unpresented-package states, withdrawn DOC-002 exclusion and separate package acknowledgement/management representation records; wider portal list and actor matrices remain open. AT-02/AT-54 cross-tab conflict, expiry and storage-denial checks now pass with the new profile form. VP-048 requires deliberate benchmark and percentage inputs, validates assigned staff and dates, and invalidates cleared fieldwork after approved materiality changes. VP-002 redirects every former role-view hash route into the React application and preserves browser history with current role guards. VP-017 AT-15 now exercises Start/Skip and four-step tenant/resource/optional/review navigation, backtracking, cancellation without persistence, reviewed configuration save and reload. Its wrong-tenant case holds site/library/root fixed and proves explicit recovery while stale identity still blocks overall readiness; a separate root-only change stales prior results, produces access-denied, then recovers. RR35 rejects invalid tenant/domain lengths, credentialed or queried URLs, invalid library/root/mailbox values and missing/duplicate/inactive/unknown-role identity mappings atomically; unit tests now cover all six simulated outcomes on each capability while broad browser invalid-resource and outage matrices remain outstanding.

The canonical tracker currently has **27 detailed open action rows**; the action tables contain 121 rows total (83 verification/evidence cards + 38 scope cards): 25 verification follow-ups (20 Partial, 3 Pending and 2 verified-subcase follow-ups) plus 2 Partial scope rows. VP-003-E02, VP-063-E01 and VP-064-E01 are three highlighted residual actions within this queue, not its exhaustive count. VP-004-E01, VP-029-E01/E02, VP-034-E01/E02 and VP-039-E01 bounded evidence actions are complete, while those stories' criterion acceptance and human sign-off remain open. Earlier counts in the historical notes below are not current. The 41-row original review baseline and older interim counts remain historical; closure of an evidence action is not whole-story acceptance. VP-017 criteria remain partially evidenced rather than fully accepted.
The VP-042 AT-38/40 package subcase confirms internal-only disclosure/comment/workpaper references do not
appear in generated XLSX, DOCX, PDF bytes, or the client portal. The Chrome suite blocks
non-local HTTP(S) requests with CDP Fetch and asserts no external request was
attempted by the exercised flows. The built HTML also enforces same-origin
resource loading and runtime connections through CSP. The canonical tracker
records 16 of 64 stories and 10 of 39 modules Verified; 48 stories and 29 modules
remain Partial because full
criterion-by-criterion acceptance evidence is not complete. See
`verification.md`; earlier counts in this repository are historical.
