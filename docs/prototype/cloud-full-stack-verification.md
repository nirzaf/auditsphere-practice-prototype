# Cloud full-stack verification

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
calculations, findings, adjustmentSupport, legacyRoutes, legacyRouteCatalog,
routeCatalog}`, `domain/*`. `prototypeStore`, `exportService`, `artifactStore` and
`cloudDemo` are never bundled — which is what makes the shared rules genuinely
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
| Conflict | stale `expectedRevision` -> **409 `STALE_REVISION`** + `details.currentRevision` | pass |
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
