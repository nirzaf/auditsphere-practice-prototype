# Cloud full-stack verification

> **Phase record (historical):** This document records verification evidence for the cloud full-stack PHASE as it was executed. Later cutover work (route model, Worker consolidation, `cloudWorkspace.ts`) supersedes operational details such as `demo:*` scripts and `tests/cloud/v2-api.test.ts` (now `tests/cloud/api.test.ts`).

Evidence recorded from a real deployment. Nothing here is a plan.

## 1. Environment

| Item | Value |
| --- | --- |
| Worker | `auditsphere-visual-prototype` |
| URL | `https://auditsphere-visual-prototype.quadrate-lk.workers.dev` |
| Versions deployed during development | `8a49687b`, `fbd14717`, `bb2dc4a3`, `9cecc32a`, `33de87de` (final) |
| D1 | `steaudit-prototype-demo` (`3562b9c7-742b-4a64-b250-64e1987f9b4b`) |
| R2 | `auditsphere-prototype-files` (created for this work) |
| Assets | 86 files uploaded from `dist/` |

## 2. Commands run

```powershell
npm.cmd run lint                       # pass
npm.cmd run demo:typecheck             # pass (legacy worker)
npm.cmd run cloud:typecheck            # pass (v2 worker + transitive src)
npm.cmd run cloud:migrate              # 0003_cloud_full_stack.sql applied
npx.cmd wrangler deploy --dry-run      # config + bindings validated
npm.cmd run cloud:deploy               # deployed
$env:CLOUD_API_URL='https://auditsphere-visual-prototype.quadrate-lk.workers.dev'
npm.cmd run test:cloud:v2              # 1 test, 1 pass, 0 fail
npm.cmd run test:unit                  # 3 failures, identical to the pre-change baseline
```

## 3. D1 migration result

`0003_cloud_full_stack.sql` applied to the remote database: **27 commands, status ✅**.
Tables created and confirmed present: `workspaces`, `workspace_sessions`,
`workspace_root_documents`, `workspace_entities`, `file_objects`, `audit_events`,
`idempotency_keys`.

## 4. Worker bundle

`wrangler deploy --dry-run` reported:

```
Total Upload: 86.08 KiB / gzip: 19.12 KiB
env.DB (steaudit-prototype-demo)         D1 Database
env.FILES (auditsphere-prototype-files)  R2 Bucket
env.ASSETS                               Assets
```

The Worker's transitive `src/` imports were listed explicitly and contain **no**
browser-only module: `types/*`, `shared/api/*`, `services/{guards, targetLifecycle,
calculations, findings, adjustmentSupport,
routeCatalog}`, `domain/*`. `prototypeStore`, `exportService`, `artifactStore` and
the retired snapshot client are never bundled — which is what makes the shared rules genuinely
runnable in `workerd`.

## 5. Live API smoke

| Check | Result |
| --- | --- |
| `GET /api/health` | `200 {"ok":true,"storage":"D1+R2","mode":"cloud-workspace","version":2}` |
| `GET /api/seeds` | `200`, two seeds (`blank`, `commercial`), `state_json` never returned |
| `GET /` | `200` HTML (SPA) |
| `GET /delivery` (deep link) | `200` (SPA fallback) |

## 6. Live integration test — `tests/cloud/v2-api.test.ts`

Result: **tests 1, pass 1, fail 0** (against real D1 + real R2).

Assertions exercised, in order:

| Area | Assertion | Result |
| --- | --- | --- |
| Health/seeds | health ok; catalog does not leak `state`/`state_json` | pass |
| Auth | no session -> 401/404; cross-origin create -> **403** | pass |
| Workspace | create -> 201, access code `<uuid>.<64hex>`, session cookie issued | pass |
| State | `GET /state` -> 200, revision >= 1 | pass |
| Command | `workspace.rename` -> 200, revision + 1 | pass |
| Cursor | stale `expectedRevision` is ignored and the command still succeeds — the revision is a change cursor, not a gate | pass |
| Conflict | stale `expectedVersions` entry -> **409 `VERSION_CONFLICT`** + `details.currentVersions`, nothing committed | pass |
| Atomicity | rows, revision bump, audit event and idempotency record commit in ONE D1 batch; a rejected command commits nothing | pass |
| Validation | empty name -> **422 `INVALID_STATE`** | pass |
| Safety | arbitrary `state.replaceEverything` -> **422**, nothing persisted | pass |
| Idempotency | replay -> `replayed: true`, revision unchanged; same key + different body -> **409 `IDEMPOTENCY_MISMATCH`** | pass |
| Audit | `/events` records `command_type` + `created_at` | pass |
| Files | init -> `INITIALIZED`; disallowed MIME -> **415** | pass |
| Files | upload -> complete, `verifiedSha256` matches, state `COMMITTED` | pass |
| **Cross-browser** | drop the cookie, resume with the access code, download the file | pass |
| **Byte integrity** | downloaded length **and SHA-256 and byte-for-byte content match** the uploaded buffer | pass |
| Files | metadata digest matches | pass |
| Integrity | declared digest mismatch -> **422 `INTEGRITY_MISMATCH`** | pass |
| Isolation | workspace A's session reading workspace B -> **403 `FORBIDDEN_SCOPE`** | pass |

The cross-browser requirement is therefore met for this slice: state **and** exact
file bytes survive a new browser/session and are verified by size and SHA-256.

## 7. Regression check

`npm run test:unit` after the change reports the **same three failures** as the
pre-change baseline, all in `tests/unit/conformityBacklog.test.ts` (lines 46, 88,
110), with the same `INVALID_STATE: The final report date cannot predate current
Partner clearance.` message. No new failures were introduced, and no test was
deleted, skipped or weakened.

## 8. Bugs found and fixed during verification

Recorded because they are the reason the tests exist:

1. **Router param mapping.** `segmentMatch` returned the matched *value* instead of
   the param *name*, so `ctx.params` was keyed by the UUID and
   `ctx.params.workspaceId` was `undefined` -> every workspace route returned
   403. Fixed to return `pattern.slice(1)`.
2. **Download route never registered.** `GET .../files/:fileId` was mapped to the
   metadata handler, so a "download" returned 391 bytes of JSON. The download
   handler is now registered at that path, with metadata moved to
   `.../files/:fileId/metadata`.
3. **Manual `Content-Length` on a streamed R2 body** was removed so the runtime owns
   response framing.

## 9. What was NOT verified

* The React UI does not yet call the v2 API, so no browser-driven end-to-end
  journey was exercised against it. The v2 API is verified by its own integration
  test only.
* No Durable Object, multipart upload, or portal/archive API-level scope test was
  run, because those are not implemented yet (see the architecture doc, section 9).
* The three pre-existing `conformityBacklog` failures remain unresolved; they
  predate this work and were left untouched.

---

# Cutover verification (one route model, one guide model, one Worker)

Recorded from the worktree that cut the prototype to a single current route model,
a single current workflow-guide model and a single same-origin Worker.

| Check | Command | Result |
| --- | --- | --- |
| Source typecheck | `npm run lint` | pass |
| Worker typecheck | `npm run cloud:typecheck` | pass |
| Unit suite | `npm run test:unit` | 459/459 pass, 0 fail |
| Production build | `npm run build` | `vite build` exit 0 |
| Current workflow matrix | `npx tsx tools/current-workflow-matrix.ts --check` | current (30 routes, 33 record lifecycles) |
| Migration | `npm run cloud:migrate` | `0004_workspace_seeds.sql` applied |
| Deploy | `wrangler deploy --config wrangler.jsonc` | 40 asset files uploaded; Worker `auditsphere-visual-prototype` |
| Live health | `GET /api/health` | `200 {"ok":true,"storage":"D1+R2","mode":"cloud-workspace","version":2}` |
| Live seeds | `GET /api/seeds` | 200 |
| Live SPA deep link | `GET /delivery` | 200 |
| Live integration | `npm run test:cloud` with `CLOUD_API_URL` | tests 1, pass 1, fail 0 (real D1 + real R2) |
| Shipped bundle scan | `dist/**/*.js` scanned | clean: no `steaudit-prototype-demo-api`, `legacyRoutes`, `legacyRouteCatalog`, `moduleGuideContent`, `guideProjections`, `VITE_DEMO_API_URL` |

The live integration test also covers the newly server-authoritative
`contact.create` / `contact.update` / `contact.setPrimary`,
`proposal.create` / `proposal.revise` and
`client.defineCustomField` / `client.setCustomField` /
`client.createRelationshipGroup` commands, reading the committed state back from D1.

## Server-authoritative command families after the cutover

28 command types dispatch through `SYNCED_COMMAND_TYPES` and execute a single shared
browser-free `src/domain/` body on both the browser and the Worker:
`client.create`, `client.update`, `client.nominateContact`,
`client.reviewContactNomination`, `client.setCustomField`, `client.defineCustomField`,
`client.setCustomFieldEnabled`, `client.assignRelationshipGroup`,
`client.createRelationshipGroup`, `contact.create`, `contact.update`,
`contact.setPrimary`, `lead.create`, `lead.update`, `lead.convert`,
`proposal.create`, `proposal.update`, `proposal.present`, `proposal.review`,
`proposal.revise`, `proposal.respond`, `engagement.create`,
`engagement.setLifecycle`, `invoice.review`, `invoice.issue`,
`evidence.setAdequacy`, `evidence.linkProcedure` and `evidence.unlinkProcedure`.

Persisted rows are no longer declared by hand: the Worker snapshots every id-keyed
collection before the command, diffs it afterwards, persists added/changed rows,
soft-deletes removed rows and writes any changed root document. Nested records (a
procedure inside a program, a workpaper inside an engagement) therefore persist
through their parent entity automatically.

Two further union members are deliberately **not** in the sync list:

* `engagement.updateAdmin` and `invoice.create` — their browser implementations
  still enforce richer rules than the extracted shared body (audit-plan
  supersession, procedure scope reassessment, time/proposal source pinning), so
  syncing them would make a cloud workspace behave differently from a local one.
* `workspace.rename` is server-authoritative, but through the dedicated workspace
  route rather than the browser command dispatch.

See the coverage table in
[cloud-full-stack-migration.md](cloud-full-stack-migration.md).

The remaining mutation families (jobs/tasks, PBC/documents, trial balance,
planning, risks/workprograms, sampling, confirmations, findings, reviews,
delivery, records, reports, ledger, time, scheduling, portal and `artifactStore`
byte flows) still run browser-local. Adding one is mechanical but
per-family: a faithful browser-free body, a union member, a dispatcher case that
declares every changed entity, store delegation, and the `SYNCED_COMMAND_TYPES`
entry. Note that the Worker's state adapter persists any `id`-keyed top-level array
generically, but a collection must exist in the seed to be part of the workspace
manifest; `customFields`, `relationshipGroups` and `clientContactNominations` are
all present in `initialState.ts` and `worker/seed.sql`.

## Browser (Chrome) e2e status

`npm run test:e2e` was run against the cutover worktree (Chrome via CDP):

* **18 of 20 journeys pass**, including `retired route hashes fall back safely and
  never reach the legacy snapshot Worker`, `cloud workspace controls degrade
  honestly without a cloud API`, `D5 Workprograms & Evidence opens current FSLI
  fieldwork rather than the retired audit redirect`, the lifecycle-overview /
  retired-hash / mobile journey, and the full canonical command journey.
* **1 failure is caused by this cutover and was repaired in the test.** The
  lifecycle-overview journey still asserted the removed redirect contract
  (retired hash `quality` → `#reviews`). Under the current no-redirect policy a
  retired hash falls back to the persona default, so the assertion now expects
  `#overview`; the journey name was updated from "retired redirects" to "retired
  hash fallbacks".
* **1 failure is pre-existing and deliberately left untouched:**
  `US-FINAL-ALIGN-001 scenarios 1–3 use visible controls from lead through
  planning and fieldwork`. Its harness (`tests/helpers/visibleAlignmentJourney.ts`)
  waits for strings the baseline product does not render:
  1. the first `state()` call waits for overview text `Next State Gate`, which does
     not exist anywhere in `src` (only in the helper); the current copy is
     `Current Gate to Advance:` / `Next State:`;
  2. once that is passed, the same call waits for a single `<p>` containing both
     `Active State:` and the state label, but `LifecycleOverviewView.tsx:147-150`
     renders them as sibling `<span>`s, so the condition can never match.

  Both conditions are properties of unmodified baseline files
  (`visibleAlignmentJourney.ts` and `LifecycleOverviewView.tsx` were last changed in
  commit `955427d`), so this journey could not pass before the cutover either. It is
  reported here rather than deleted, skipped or silently re-baselined.

## Business workspace browser acceptance update — 2026-10-06

`npm run build` passed, and `npx tsx --test tests/e2e/businessWorkspace.test.ts`
passed **3/3** isolated browser journeys against the local Worker, SQLite D1
adapter and in-memory R2 adapter. The new US-ENG-003 journey creates a client
lead, advances to proposal generation, stores firm-approved synthetic content,
renders a real quotation PDF, and approves that exact proposal revision. A
QAR 10,000,001 minor-unit fee is split into QAR 5,000,001 advance and QAR
5,000,000 final. It also exercises a missing email-provider binding: the UI
shows the committed provider failure, the dispatch remains FAILED, and the
engagement stays in PROPOSAL_GENERATION after reload. Both client-commercial
and partner-risk keys remain PENDING, and the journey verifies that no
engagement-letter draft, issued letter, or advance invoice is created.

This journey exposed and fixed a no-op dispatch button: the UI displayed its
first eligible contact route as the default while the handler only read the
uninitialized selection state. The handler now uses the same default route as
the control. Test records use `example.invalid`; no external HTTP request or
real email provider is used. This is bounded US-ENG-003 browser evidence, not
full acceptance of the 46-story epic or production email delivery.

## Technical execution integration evidence — 2026-10-06

`npx tsx --test tests/unit/businessWorkspace.test.ts` passed **1/1** against
the isolated Worker, SQLite D1 adapter and in-memory R2 adapter. After the
version-pinned planning handover, the journey reads and reconciles the current
split statements, saves and reuses the exact immutable statement snapshot,
rejects an analytical conclusion without adequate support, then links retained
digital bytes and a physical locator as HYBRID evidence. A separate reviewer
records adequacy before the preparer submits the analysis and the reviewer
accepts it. A zero-denominator ratio remains explicitly undefined. This adds
bounded API integration evidence for US-FLD-003, US-FLD-004, US-FLD-010 and
US-FLD-011. At that point, the other FLD stories and browser-level acceptance
were still open; the follow-up below records the next bounded API slice.

## Fieldwork concurrency and sampling integration evidence — 2026-10-06

`npx tsx --test tests/unit/businessWorkspace.test.ts` passed **1/1** after the
fieldwork fixes, and `npm run build` passed. The Worker/D1 integration scenario
uses the isolated in-memory test adapters and synthetic audit data. It adds
bounded API acceptance for:

* **US-FLD-005:** Partner approval of a five-step revenue workprogram template,
  Manager-only Red-risk provision and execution, persistence of a sixth
  engagement-specific ad-hoc step, and rejection of an empty procedure
  submission.
* **US-FLD-006:** Independent procedure rows save at the same time; a stale
  same-row update receives a version conflict; reviewers cannot accept an old
  submission after preparer rework.
* **US-FLD-007:** A negative population amount is blocked until documented
  alternate work; seeded MUS replay preserves all 59 monetary draws, including
  repeat hits on one row; conservative zero-taint and misstatement evaluations
  produce explicit bounds and decisions.
* **US-FLD-008:** Systematic sampling uses exact integer/rational position
  arithmetic, reproduces the specified 1,000-row / 50-item vector from the
  independently verified seed, rejects an impossible count, and records a
  zero-start CENSUS when every eligible row is selected. Repeating source-order
  segments raise a reviewer prompt; a periodicity assessment is mandatory before
  freezing that order, and the server-seeded Fisher–Yates shuffle retains its
  algorithm, seed and resulting order hash.
* **US-FLD-009:** Disjoint strata retain independent EDR/TDR assumptions and
  rationales; Bonferroni alpha is frozen per stratum; exact finite-population
  bounds report an upper deviation rate; overlap and omitted rows are rejected;
  incomplete and failing strata cannot be averaged into a pass.

The API integration uses isolated local Worker/SQLite adapters and synthetic
audit data. A separate Chromium journey covers the visible US-FLD-007/008
evidence, methodology approval, periodicity warning, required assessment and
shuffled plan details. It also covers the US-FLD-009 per-stratum assumptions,
separate rates and rationales, exact sample counts, a census result and an
incomplete second stratum. These checks do not constitute firm methodology
sign-off or completion of the 46-story epic; full requirement-by-requirement
closure remains open.

## Reporting authorization and release-candidate SQL evidence — 2026-10-06

`npx tsx --test tests/unit/businessWorkspace.test.ts` passed **1/1** after
adding a direct API attempt to create an unmodified audit opinion as REVIEWER.
The Worker returns `403 PERSONA_ACTION_DENIED`, and the database retains no
opinion row. This closes only the Partner-only command-boundary subcase of
**US-REP-001**.

`npx tsx --test tests/unit/reportingBundleSql.test.ts` passed **2/2** against
the complete repository migration history. It executes the exact five-part
bundle candidate SELECT and catches the previously undefined representation
request alias. This removes a report-bundle preparation blocker in **US-REP-005**;
it does not verify the full report, atomic release, portal freeze, delivery, or
archive lifecycle. Both reporting stories remain open for their other criteria.

## Cross-module implementation and verification — 2026-10-06

On `main` at `837bfce`, the latest local gates passed: `npm run test:unit`
reported **484/484** checks across 104 suites; `npx tsc --noEmit`,
`npm run cloud:typecheck`, and `npm run build` also passed.

The current changes add bounded evidence and UI paths, while the complete
stories remain open:

* An API integration scenario revises a draft analytical review in place,
  retains its id, rejects a stale expected version, and rejects edits after
  independent acceptance (**US-FLD-004**).
* Going-concern submission rejects `UNASSESSED`; SRM input collection blocks
  when a current mapped FSLI lacks a workprogram (**US-FLD-004 / US-FLD-012**).
  The focused helper tests exercise both guards; they do not establish full SRM
  compilation, Partner clearance, or the complete release chain.
* Planning and mapping gates now require every nonzero current or prior TB
  balance to have an FSLI mapping (**US-FLD-001 / US-FLD-002**). The regression
  below imports a balanced comparative TB with a zero-current / nonzero-prior
  receivable, verifies that mapping approval returns `GATE_BLOCKED` with both
  balances, then maps it and continues the integration workflow.
* The practice time-entry UI can optionally select an active FSLI, and the
  workspace query supplies the active catalog (**US-PRC-001**). No browser
  interaction evidence for this new field is recorded yet.
* The client workspace now provides contact creation, signatory/deactivation
  changes, and purpose-specific primary/alternate recipient routing (**US-ENG-001**).
  The production build passed, but this UI flow still needs browser-level
  acceptance evidence.

These checks do not close the 46-story epic. Requirement-by-requirement
acceptance, browser evidence for the new UI paths, two-browser races, archive
restore, and the remaining story criteria are still outstanding.

## Critical-confirmation release recheck — 2026-10-06

`npx tsx --test tests/unit/businessWorkspace.test.ts` passed **1/1** after
adding a synthetic critical bank confirmation to the Worker/D1 integration
scenario. The shared release gate finds the new blocker, records HTTP 409 on
the release mutation, and queues a Holding Letter against the configured
synthetic management recipient. Repeating the same outstanding set reuses the
same outbox job; the database retains exactly one matching job. This is bounded
evidence for the `US-FLD-013` late-blocker/idempotency subcase. The test does
not execute a fully prepared `report.release` candidate through the HTTP route,
so `US-FLD-013` and the complete reporting lifecycle remain open.

The latest hosted CI run before this change (`37457806609`) passed typechecks,
unit tests, production build and browser E2E on `a0a5adb`. Its Cloudflare deploy
job was skipped because production activation remains gated on the missing
GitHub environment credentials, reviewer selection and explicit deploy switch.

### Follow-up — 2026-10-07

The Worker integration now runs the real confirmation request PDF/outbox/provider
path, records an unverified response, proves that an alternate procedure does
not waive the blocker, retries one outstanding set three times, and processes
the resulting Holding Letter through PDF generation and email acceptance. It
also verifies the response under a different actor and links Partner scope
reassessment to an immutable approval decision. Full unit and browser suites
passed (489/489 and 27/27). The test still does not submit a fully prepared
Worker `report.release` candidate or reach the Manager handover gate; this
follow-up strengthens but does not close US-FLD-013.

## Prior-period-only FSLI coverage — 2026-10-06

The `businessWorkspace.test.ts` Worker/D1 integration now imports a balanced
comparative TB containing account `1299` with current balance zero and prior
balance QAR 500.00. Mapping approval fails with `422 GATE_BLOCKED`, reports the
account and both amounts, and leaves the active mapping unchanged. After the
row is mapped to the appropriate FSLI, the mapping is approved and the existing
planning workflow continues. The mapping workspace exposes current and prior
amounts together, and its approval control remains disabled for an unmapped
material balance in either period. This closes the prior-year-only mapping
subcase; the wider **US-FLD-001 / US-FLD-002** criteria remain open.

After this change, `npm run test:unit` passed **484/484** checks across 104
suites; `npx tsc --noEmit` and `npm run cloud:typecheck` passed; and
`npm run test:e2e` passed **24/24** browser scenarios on the working tree. The
existing browser scenarios exercised the current engagement flows and
responsive surfaces; the prior-only amount and blocked mapping assertion are
covered by the Worker/D1 integration rather than a dedicated browser fixture.

## Documented alternate recipient routes — 2026-10-06

Migration `0029_contact_route_rationale.sql` adds a nullable rationale for
historical routes and requires a 10–1000 character reason for every new or
updated alternate route. Role-based contact creation now creates only purposes
without an existing primary; it does not silently add another recipient.
Changing a primary records why the former primary remains as an alternate in
the same command transaction. The client directory shows stored reasons and
labels historical alternates without a recorded reason as legacy. This closes
the explicit-documentation subcase of **US-ENG-001** only; the full story and
46-story epic remain open.

The Worker/D1 integration verifies automatic alternate creation is suppressed,
reasonless route commands are rejected, a documented alternate persists, and
promotion transfers the rationale to the demoted primary atomically. A visible
Chrome journey adds a second synthetic finance contact, enters the reason, and
checks both the displayed route and stored row. On this working tree,
`npm run test:unit` passed **484/484** checks across 104 suites and
`npm run test:e2e` passed **24/24** browser scenarios; app and Worker
typechecks and the production build passed.

## PBC route enforcement and fieldwork readiness regression — 2026-10-06

PBC requests now require an active contact on the same client with either the
primary Chief Accountant / Audit Liaison route or a documented alternate PBC
route. The Worker checks this before preparing the command and again in the
atomic D1 assertion; contact role changes and primary-route creation also keep
the route role-compatible. The request form lists only configured PBC routes
and labels primary versus documented alternate recipients. Worker/D1 tests
reject route-less CFO assignment without persisting a request, reject role
changes that strand primary routes, and accept the configured recipient.

The shared HTTP error map now follows epic §1.6 for `GATE_BLOCKED` and
`INVALID_TRANSITION` (409). The SRM view disables submission while its workbook
save is in flight or its workbook revision is missing/stale; the visible
fieldwork journey waits for both the saved workbook and submitted revision.

On the working tree, `npm run test:unit` passed **484/484** checks across 104
suites; `npm run test:e2e` passed **24/24** browser scenarios, including the
previously failing visible fieldwork journey; `npx tsc --noEmit` and
`npm run cloud:typecheck` passed, and the E2E command's production build passed.
These runs do not include a browser journey through the PBC route selector, so
that UI subcase still lacks browser evidence. Full acceptance of **US-ENG-001**,
**US-ENG-007**, the other story criteria, and the 46-story epic remains open.
Hosted main run `37470102310` at `52319e9` passed the verify job; its Cloudflare
deployment job was skipped while the deploy switch was unset. That run predates
the current working-tree changes, so a push is still required for hosted
verification of this diff.

## BUSINESS workspace change-feed integration — 2026-10-06

The workspace-level `/changes` route now branches to the no-session BUSINESS
actor context. It reads the immutable audit sequence with bounded cursor
pagination, filters by the validated engagement or client scope, omits audit
details, and returns only sequence/time to CLIENT profiles. New commands record
the resolved scope in both indexed audit columns and the hash-covered event
details. Existing events whose scope cannot be proven return
`resyncRequired: true` with the current cursor rather than an empty-delta claim.

`npx tsx --test tests/unit/businessWorkspace.test.ts` passed **1/1**. The API
integration assertions cover the no-session route, cursor paging, unchanged and
future cursors, absence of audit details, cross-client filtering, the
CLIENT-safe projection, and workspace-level staff events staying out of a
client-scoped feed. The `US-SYS-001/002/005` browser journey exposed two scope
cases: creating another client while a client is selected must use the new
client as the event scope, and workspace-level records must not inherit the
selected client. Both now pass their regression checks.

On the current working tree, `npm run test:unit` passed **484/484** checks,
`npm run test:e2e` passed **24/24** browser scenarios, `npx tsc --noEmit`,
`npm run cloud:typecheck`, the production build, and `git diff --check` passed.
This closes only the workspace change-feed routing and scope-projection
subcase of **US-SYS-003**. The aggregate `/engagements/{e}/workflow` projection,
server-driven progress UI, full browser conflict journey, and the remaining
US-SYS-003 criteria are still open; the 46-story epic remains open.

## Cloudflare activation preflight — 2026-10-06

GitHub environment `cloudflare-production` contains the required
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets; the token was
updated on 2026-10-06 and only secret presence/update metadata was verified.
`CLOUDFLARE_DEPLOY_ENABLED` is `true`. The environment permits deployments from
`main` but has no required reviewer. No workflow run, production migration or
Worker deployment was triggered in this verification.

Remote D1 reports migrations `0006` through `0029` pending. The migration audit
found the intentional expiry-column transfer in `0007` and `dispatches` table
copy/rebuild in `0019`, in addition to additive schema and data migrations.
Wrangler's CI migration command captures a D1 backup, but the first enabled
deployment will still apply this full backlog. No production migration or Worker
deployment has been run from this working tree.

## BUSINESS aggregate workflow projection — 2026-10-06

Added the scoped `/api/workspaces/:workspaceId/engagements/:engagementId/workflow`
projection and BUSINESS progress view for the eleven canonical lifecycle stages.
The endpoint derives stage, latest transition, source version, and supported
current blockers from persisted engagement state and the existing acceptance
and planning gates. It checks engagement-read permission and selected
engagement/client scope; CLIENT profiles receive descriptions without internal
entity identifiers. The UI refreshes its projection after the visible lead to
proposal transition and adapts to the mobile viewport.

Verification on this working tree: `npm run test:unit` passed **484/484**;
`npm run test:e2e` passed **24/24** browser scenarios, including BUSINESS
progress rendering and the 390x844 mobile layout; `npx tsc --noEmit`,
`npm run cloud:typecheck`, and the E2E production build passed. The dedicated
workflow API tests cover source version, scope rejection, status handling,
DUAL_KEY blockers, and the CLIENT-safe projection.

Blocker detail is currently projected for `DUAL_KEY_PENDING` and
`PORTAL_ACTIVE_PLANNING`; other stages direct users to the owning module and
report `module-detail` coverage. Full blocker coverage, the browser conflict
journey, the remaining **US-SYS-003** criteria, and acceptance of the full
46-story epic remain open. This change does not enable Cloudflare production
deployment; the reviewer gate and pending remote migrations described above
remain unresolved.

## Production no-auth API boundary — 2026-10-06

The retired seeded snapshot/session API is now opt-in through the Worker binding
`TEST_SNAPSHOT_API_ENABLED=true`. It is disabled by default in the canonical
`wrangler.jsonc`; the no-auth BUSINESS bootstrap, normalized command API, scoped
reads, and versioned R2 file routes remain available under their existing
trusted-deployment setup gate. Seed listing/creation, access-code resume,
snapshot state/events, session persona/logout, snapshot commands, and legacy
file handlers return not-found unless the explicit test flag is set.

The `US-SYS-001/002` business browser journey confirms those legacy routes return
404 while a real empty BUSINESS workspace can still be created and used. The
focused browser suite passed **3/3**; the complete local suite passed
**484/484** unit checks and **24/24** browser scenarios. App and Worker typechecks,
production build, and `git diff --check` also passed. This removes a production
demo/auth surface; it does not close the remaining foundation criteria or any
claim of full 46-story acceptance.

## Procedure draft conflict resolution — 2026-10-06

The BUSINESS fieldwork editor now pins a procedure draft to the row version the
user first edited. A refresh cannot silently retarget that draft to a newer
version. When the server row advances, the editor preserves unsaved text and
shows base, local and server values for both work performed and conclusion. A
user must explicitly rebase and save against the displayed server version or
discard the draft; non-editable or unauthorized revisions cannot be rebased.

The focused unit checks passed **2/2**, including original-version retention,
explicit-rebase version selection, three-value conflict rendering and escaped
user text. The full unit suite passed **486/486** and the browser suite passed
**24/24**; app and Worker typechecks, production build and `git diff --check`
passed. Existing API integration covers independent-row success and a
single-winner same-row race. This turn did not exercise the new conflict choices
in a real two-browser BUSINESS fieldwork session; full **US-FLD-006** and
**US-SYS-003** acceptance, and the 46-story epic, remain open.

## Partner opinion validation and exact preview projection — 2026-10-07

US-REP-001 now has category-discriminated Worker command schemas for the four
audit opinions plus a separate AUP shape. An incomplete modified opinion sent
to the HTTP command route returns 422 VALIDATION_FAILED and leaves no opinion
row; a Reviewer cannot write an opinion or access the Partner-only preview.
The preview and Worker PDF candidate share one structured report-section
builder, including category-specific basis headings, affected FSLI amounts and
explanations, additional sections and conditional going-concern blockers.

Verification passed: focused opinion/schema tests 11/11; focused Worker
command integration 1/1; full unit suite 500/500; production build; app and
Worker typechecks; full serialized Chromium suite 27/27; and git diff --check.
The Chromium reporting journey in this suite exercises the older prototype
store, not the new database-backed reporting form. The successful Worker
preview projection is covered by focused query tests, but this run did not
drive a complete Worker reporting UI or candidate-PDF journey. US-REP-001’s
full browser acceptance, all remaining stories, and the 46-story epic remain
open. No Cloudflare deployment or external provider was used.

## Workflow concurrency and operational telemetry — 2026-10-07

The earlier notes about incomplete lifecycle blocker coverage and missing
two-browser conflict UI evidence are superseded by current source/tests. All
eleven canonical lifecycle states are represented in
`worker/businessWorkflow.ts`; the Worker integration exercises stage readiness
and blocker projections. The focused
`US-FLD-006 preserves same-procedure drafts across a two-browser version conflict
and requires rebase or discard` browser journey passed **1/1** on this working
tree. It uses two isolated headless Chrome profiles against the same Worker/D1
fixture, observes the single-winner stale write, preserves both drafts, and
verifies explicit rebase, discard and independent-row updates.

The Worker now emits redacted `workspace.api.request` latency/outcome records
using route templates, aggregates durable outbox counts/age/attempts during the
scheduled sweep, and emits `workspace.archive.overdue` when due archives remain
unsealed or failed. Raw URLs, exception messages, client identifiers, financial
data, job payloads and file bytes are omitted. The runbook documents signal
consumption and D1/R2 recovery limits.

Verification on the current working tree: production build, app typecheck,
Worker typecheck, `git diff --check`, full `npm run test:unit` (**535/535**
across 106 suites), `tests/unit/businessWorkspace.test.ts` (**1/1**),
`tests/unit/workerObservability.test.ts` (**3/3**),
`tests/unit/workerMigrations.test.ts` (**1/1** using Wrangler's migration
splitter with an isolated in-memory SQLite database),
`tests/e2e/businessProcedureConflict.test.ts` focused conflict journey (**1/1**),
and `tests/e2e/businessBackupRestore.test.ts` (**1/1**). The migration replay
does not prove remote D1 deployment compatibility. Historical hosted run
`37505606782` failed during D1 migration on the older `ad07df6` revision; this
working tree simplifies the actor-profile triggers in migration 0008, but no
Cloudflare migration/deployment was retried.

US-SYS-005 remains incomplete: the deployed Cloudflare p95 read/command targets
have not been measured under the documented 20-active-user workload, Cloudflare
alert destinations are not configured here, and an isolated restore against
actual sandbox D1/R2 resources has not been performed. Trusted CI-to-D1
VerificationRun ingestion is also open. The 46-story epic remains open.

### SYS-005 verification record and support bundle — 2026-10-07

The additive `verification_runs` migration now stores source commit, schema
version, environment, start/completion timestamps, `PASSED`/`FAILED`/`NOT_RUN`
status and an optional same-workspace result-file reference. A run can be
finalized once, completed metadata cannot be edited, and records cannot be
deleted. Readiness expects schema version 33. CI exports and uploads a
versioned support-bundle artifact even when a verification gate fails; the
download endpoint returns allowlisted operational metadata and omits workspace
IDs, raw output, financial data, file bytes and credentials.

The local migration replay now exercises schema version 33, run finalization,
status validation and immutability. The current full unit suite passed **538/538**
across 106 suites; app typecheck, Worker typecheck, production build, focused
business-workspace API test (**1/1**) and `git diff --check` passed. The support
bundle tests cover redaction, malformed metadata and the distinction between
CI verification and runtime readiness. A local writer check produced one
`PASSED` run with runtime readiness `not_checked`. The complete local Chrome
suite passed **30/30** browser journeys, including the full visible lifecycle,
Partner release, two-browser row conflict, portal, mobile layout and archive
journeys. The Worker API integration test inserts a scoped D1 verification row,
downloads it through the support-bundle route and verifies the owning workspace
identifier is redacted.

The CI workflow exports its VerificationRun-shaped metadata as a GitHub
artifact; it does not ingest the result into application D1. The migration and
schema are ready for trusted CI/staging ingestion, but durable D1 run recording
is still open. These checks do not establish remote migration compatibility,
that a hosted CI run produced the artifact, or that the remaining SYS-005
deployed-load, alert-destination, sandbox-restore and trusted-ingestion
criteria pass.

### Local 20-user API workload and audit-chain contention — 2026-10-07

The initial in-process workload exposed a real contention failure: when 20
client-create commands raced to append to one workspace audit chain, the
three-attempt compare-and-swap loop returned `VERSION_CONFLICT` for some valid
independent commands. The Worker now retains the database compare-and-swap as
the authority and retries a moved audit head up to 24 times with capped jittered
backoff. A focused integration regression test verifies that 20 simultaneous
commands each persist a distinct client and audit event.

On commit `867dddefa87e65c0b95f463c53deeb057853be45`,
`npm run benchmark:local-api` passed with a clean worktree and no external
network requests. The isolated run created 20 synthetic preparer profiles and
100 initial clients, then issued ten waves of 20 context reads, 20 paginated
client-list reads and 20 client-create commands. All 744 Worker requests
returned HTTP 200 or 201. Across 400 scoped reads, p50/p95/p99 were
7.708/15.386/16.339 ms; across 200 commands, p50/p95/p99 were
112.846/257.563/288.049 ms. Both local p95 values were below 500 ms and 1 s.

The full unit suite passed **539/539** across 106 suites; `npm run build`,
`npm run cloud:typecheck`, and `git diff --cached --check` passed. This uses the
in-memory SQLite D1 adapter and does not measure Cloudflare runtime, network,
production-sized persistence, or remote D1 contention. It is regression
evidence only; the deployed 20-active-user p95 criterion remains open alongside
the alert destination, sandbox restore and trusted CI-to-D1 ingestion items.

The complete serialized Chromium suite passed **30/30** on rerun. Its first
full run had one transient sampling-source dropdown assertion; the specific
journey and all four tests in its E2E file passed in isolation, and the full
suite rerun then passed. The source-option wait now requires three consecutive
observations before interacting with the control; the containing E2E file
passed **4/4** after that stabilization.

### PRC-001 grade-based time entry and browser approval — 2026-10-07

The time-entry form now offers engagement-scoped procedure choices alongside
optional FSLI selection, fills the related FSLI when a procedure is selected,
and displays both references on saved rows. The Worker rejects an FSLI/procedure
mismatch in both new entries and corrections. A browser journey exposed that the
shared UI command wrapper omitted the `TimeEntry` `expectedVersions` entry for
submit/approve/return/correct; the wrapper now supplies the entity ID and
expected version required by the Worker.

The Worker integration scenario verifies the exact default QAR schedule,
QAR 300 for 90 approved Associate minutes, QAR 750 and QAR 500 for Manager and
Senior records created under a REVIEWER persona, historical-rate pinning,
idempotent submit retry, explicit time-range overlap rejection, and the 1,440
minute daily limit. It also verifies that once-rounded engagement value and
displayed phase totals reconcile using the rational residual allocation.

Verification on this working tree: `npm run lint`, `npm run build`,
`git diff --check`, the full unit suite (**539/539**, 106 suites), and the full
serialized Chromium suite (**31/31**) all passed. The PRC journey used an
isolated local Worker/SQLite workspace and two synthetic browser actors. These
results do not validate remote D1, Cloudflare performance, or production
deployment. The complete 46-story epic and the open US-SYS-005 Cloudflare
load, alert, sandbox-restore, and trusted-ingestion criteria remain incomplete.

### PRC-002 capacity-adjusted utilization API and dashboard — 2026-10-07

The Worker now exposes the explicit inclusive Qatar-date read contract at
`GET /api/workspaces/{workspaceId}/practice/utilization`. It returns recorded
and approved minutes separately, splits approved billable/nonbillable actuals,
subtracts approved leave once from scheduled capacity, lists missing daily
capacity dates, and includes calculation time, last source update and a source
hash. Preparers can read only their own staff record; internal reviewers can
read workspace staff. Zero availability returns a null percentage and
`ZERO_AVAILABILITY`; missing dates return a null percentage and
`MISSING_CAPACITY`; over-capacity percentages remain above 100%.

The dashboard displays recorded, approved, billable, nonbillable and available
minutes, the approved-leave calculation, source freshness, missing dates and an
explicit over-capacity status. A two-browser Chromium journey drove the visible
Qatar one-day period with 90 approved billable minutes and 60 available minutes;
it displayed 150.00% and a 30-minute over-capacity badge. The Worker integration
also exercised 480 scheduled less 120 approved leave, pending time excluded
from approved actuals, missing-capacity dates, zero availability, source hash
and preparer-to-colleague denial.

Verification on this local working tree: `npm run lint`, `npm run build`,
`npm run cloud:typecheck`, `git diff --check`, full unit suite (**539/539**
across 106 suites), the focused Worker integration (**1/1**), the focused PRC
Chromium journey (**1/1**), and the full serialized Chromium suite (**31/31**).
The browser/Worker runs use synthetic records, an in-memory SQLite D1 adapter,
and local Chromium; they do not establish remote D1 compatibility, Cloudflare
runtime performance, or production deployment. US-PRC-002 and the full
46-story epic remain open for remaining acceptance and operational evidence.

### PRC-003 engagement profitability and phase budget variances — 2026-10-07

The Worker now exposes the Partner-only cutoff read at
`GET /api/workspaces/{workspaceId}/practice/engagements/{engagementId}/profitability?asOf=...`.
It selects the accepted engagement-letter fee and matching approved budget that
existed at the cutoff, aggregates only time approved by then, and treats entries
approved later as pending for that historical view. Corrections, credit notes,
payment reversals, billings and collections are calculated as of the same cutoff.
The response includes accepted fee revisions, pinned budget and proposal
revisions, signed phase variance minutes and basis points, pending time, billing,
collection, formula, and source hash. The dashboard shows per-phase percentages,
`UNBUDGETED` activity, accepted fee history and saved snapshot history. Migration
0034 adds pending minutes, billed value and collected value to append-only
profitability snapshots so later approvals cannot rewrite previously captured
reports.

The integration journey verified QAR 2,950 charge-out value from the pinned
grade rates, a 210-minute / +50.00% fieldwork overrun against 420 planned
minutes, no percentage for a zero/zero phase, and 120 minutes of unbudgeted
reporting activity. It approved the reporting entry after capturing a snapshot,
then confirmed the earlier cutoff still showed it as pending and the stored
snapshot fields and source hash remained unchanged. Preparers received no
profitability totals, accepted contract fee or saved snapshots; the dedicated
endpoint returned 403 and requires an explicit ISO cutoff.

Verification on this local working tree: `npm run lint`, `npm run build`,
`npm run cloud:typecheck`, `git diff --check`, the full unit suite (**539/539**,
106 suites), the focused Worker integration (**1/1**), and the full serialized
Chromium suite (**31/31**) passed. The app tab at port 3005 is a static preview
whose `/api/*` paths fall back to the SPA; the local Wrangler Worker preview
could not start on this Windows host because workerd was denied creation of
`miniflare-email-store`. The Chromium suite used its isolated local Worker and
SQLite harness. No remote D1 or production deployment was exercised. The full
46-story epic remains open.

### US-SYS-005 trusted CI verification metadata ingestion — 2026-10-07

The Worker now accepts a strict, redacted verification record at
`POST /api/internal/verification-runs` only when `ENVIRONMENT` is exactly
`verification-sandbox` and the Worker has a dedicated ingest token and a fixed
`VERIFICATION_INGEST_WORKSPACE_ID`. The request cannot choose its workspace,
include files or test output, or start arbitrary commands. CI run IDs are
idempotent; replaying identical metadata succeeds, while binding an existing
run ID to different metadata returns `IDEMPOTENCY_MISMATCH`. Production and
ordinary local Worker configurations return 404 for the route.

The CI workflow has a separate sandbox recording job. It is restricted to
trusted `main` pushes or an explicitly selected `record_sandbox_verification`
workflow dispatch and remains disabled until the repository variable
`AUDITSPHERE_VERIFICATION_INGEST_ENABLED=true` is set. The GitHub environment
`cloudflare-verification-sandbox` supplies the HTTPS sandbox Worker origin and
`AUDITSPHERE_VERIFICATION_INGEST_TOKEN`; the Worker-side token and fixed
workspace ID must be configured on that isolated sandbox Worker. The job posts
only the allowlisted metadata from the existing redacted support bundle.

Local SQLite integration evidence covers disabled production/local routing,
missing and invalid bearer tokens, strict input validation, fixed-workspace
scope, PASSED and NOT_RUN records, idempotent replay, and conflicting retries.
Migration 0035 aligns the application schema marker with version 35, including
the snapshot columns added in migration 0034.

**Boundary:** The sandbox Worker, CI environment, secrets, repository variable,
and sandbox workspace are not configured or invoked from this checkout. The
job cannot run until those isolated resources exist. This code-level
implementation does not close US-SYS-005: Cloudflare 20-user p95 measurements,
alert destination, and a Cloudflare D1/R2 restore remain unverified, and the
full epic remains open.

### PBC recipient route browser acceptance attempt — 2026-10-07

Extended the visible BUSINESS browser journey to add an active Chief Accountant /
Audit Liaison, configure its primary PBC route, select it in the PBC request form,
and verify the Worker rejects a premature request while the engagement is still
in `PROPOSAL_GENERATION`. The expected UI result is the actionable lifecycle
message and no persisted PBC row. The test targets the route selector and the
server-side stage gate without manufacturing an engagement-letter transition.

`npm run build` passed and `npx tsx --test tests/unit/businessWorkspace.test.ts`
passed **1/1**, including the Worker/D1 PBC route and lifecycle checks. The browser
journey could not start in this Windows execution sandbox: installed Chrome did
not expose its DevTools endpoint on the isolated loopback port, and the installed
Edge binary exited with code `3221225477` before exposing CDP. The headless-browser
cleanup now bounds `taskkill` waiting, so these setup failures return instead of
hanging. This is not browser acceptance; run the scenario in a host with working
headless Chromium before closing the UI subcase. US-ENG-001, US-ENG-007, and the
46-story epic remain open.
