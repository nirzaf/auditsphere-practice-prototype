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
