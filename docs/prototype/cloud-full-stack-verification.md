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
* **US-FLD-008:** Systematic sampling uses a persisted stable ordering and exact
  rational start/interval, rejects an impossible requested count, and records an
  explicit census when the full population is requested.
* **US-FLD-009:** Disjoint strata retain separate confidence assumptions and
  results; overlapping or omitted source rows are rejected, and a partial test
  reports each stratum while keeping the overall plan INCOMPLETE.

The evidence is an API integration pass, not browser-level acceptance of these
stories and not completion of the 46-story epic. Full requirement-by-requirement
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
* Planning approval now requires every nonzero current or prior TB balance to
  have an FSLI mapping (**US-FLD-001 / US-FLD-002**). This change still needs a
  direct regression case for a prior-year-only unmapped row.
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
