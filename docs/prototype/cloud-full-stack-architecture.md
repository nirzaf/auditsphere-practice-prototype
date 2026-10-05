# Cloud full-stack architecture

Status: **implemented and verified** for the foundation plus the first migrated
command slice. Read "Remaining limitations" before assuming broader coverage.

This document describes the Cloudflare-native architecture that turns the
browser-only visual prototype into a cloud-backed functional prototype while
preserving the existing React UI, routes, lifecycle rules, personas, deterministic
calculations, generated documents and the existing test suites.

## 1. Services used, and why

| Service | Used for | Why this one |
| --- | --- | --- |
| **Cloudflare Workers + Static Assets** | Serves the built React app (`dist/`) and the `/api/*` JSON API from one same-origin deployment | Same-origin removes the CORS surface entirely and lets the session cookie be `SameSite=Strict` |
| **D1** | Authoritative structured workspace state (root documents + entities + sessions + audit) | SQL, migrations, transactions/batches and indexes; the prototype already reasoned in relational-ish terms |
| **R2** | Exact uploaded/generated file bytes | Canonical cloud location for bytes; objects are private and only reachable through authorized Worker routes |
| **Workers Cron Triggers** | Expired workspace/session/idempotency cleanup, abandoned staged uploads, legacy snapshot retention | Reuses the existing `0 2 * * *` schedule |
| **Worker Rate Limiting binding** | Workspace create, resume, command, if the account provides it | Applied only when the binding is present, so it is never a hard dependency |

Deliberately **not** used: KV, Queues, Vectorize, external search, a separate API
domain, or a Node server framework.

## 2. Request flow

```
React/Vite build (dist/)
        |
        v
Cloudflare Worker "auditsphere-visual-prototype"
  |            |              |
  |            |              +--> R2  (FILES)   exact bytes, two-phase commit
  |            +-----------------> D1  (DB)      state, sessions, audit, idempotency
  +------------------------------> ASSETS        SPA + static assets
```

`assets.run_worker_first: ["/api/*"]` routes API traffic to the Worker first;
everything else falls through to the static-asset handler with
`not_found_handling: "single-page-application"` so deep links (`/delivery`,
`/records`, ...) resolve to the SPA.

## 3. D1 schema (migration `0003_cloud_full_stack.sql`)

Additive only. The v1 tables (`demo_seeds`, `demo_workspaces`,
`demo_creation_limits`) are untouched so the legacy snapshot API keeps working.

| Table | Purpose | Notes |
| --- | --- | --- |
| `workspaces` | Workspace header + **workspace revision** | `status` is `active`/`frozen`/`deleted` |
| `workspace_sessions` | Server sessions | Stores only `token_hash` (SHA-256), `mode` (`demo` enrollment vs `cloud` request session), and the server-held actor |
| `workspace_root_documents` | Singleton/object parts of `PrototypeState` | `PRIMARY KEY(workspace_id, document_key)`, own `version` |
| `workspace_entities` | Per-record rows | `PRIMARY KEY(workspace_id, entity_kind, entity_id)`, own `version`, indexed scope columns |
| `file_objects` | File metadata + lifecycle state | Never stores bytes; holds `r2_key`, size, `sha256`, `state`, `immutable` |
| `audit_events` | Append-only trail | Sequence allocated in SQL (`COALESCE(MAX(sequence),0)+1`) so it cannot race |
| `idempotency_keys` | Retry safety | `PRIMARY KEY(workspace_id, idempotency_key)` + `request_hash` |

Indexes exist on workspace expiry/status, session token hash/expiry, entity
kind/client/engagement, file state/logical record/scope, audit sequence/entity,
and idempotency expiry.

### Why a hybrid entity/document model

The prototype has a coherent in-memory `PrototypeState` with dozens of
collections. Normalising every interface into its own table would have rewritten
the domain. Instead the adapter **discovers** the layout once and records it:

* every top-level array whose items all carry a non-empty string `id` becomes an
  **entity collection**;
* every top-level plain object becomes a **root document**;
* scalars (`currentUserId`, `asOfDate`, ...) go into the `__scalars__` document.

The discovered layout is stored in the `__manifest__` root document, so an empty
collection round-trips with the exact same shape instead of vanishing. This keeps
`PrototypeState` as the UI-boundary compatibility contract (`loadWorkspaceState`,
`persistCommandChanges`, `createSeededWorkspace` in `worker/v2/state.ts` / `db.ts`).

## 4. R2 key layout

```
workspaces/{workspaceId}/clients/{clientId|_}/engagements/{engagementId|_}/{folder}/{logicalRecordId?}/{fileId}
```

`folder` comes from the category (`pbc`, `sources/tb`, `sources/gl`, `evidence`,
`workpapers`, `generated`, `releases`, `archive`, `generated/representation`). The
object name is an opaque UUID `fileId`; the original display filename is
sanitised and stored in D1 metadata only, never used as an object path. The bucket
is private and is never exposed publicly.

## 5. Two-phase file commit

D1 and R2 have no shared transaction, so the lifecycle is explicit:

```
INITIALIZED -> UPLOADING -> STAGED -> VERIFIED -> COMMITTED
```

| Phase | Endpoint | What is enforced |
| --- | --- | --- |
| Reserve | `POST /api/workspaces/:id/files` | category allowlist, per-workflow MIME allowlist, size ceiling, client/engagement scope |
| Store | `PUT /api/workspaces/:id/files/:fileId/content` | streams bytes straight to the R2 binding (never base64 through JSON), marks `STAGED` |
| Verify | `POST /api/workspaces/:id/files/:fileId/complete` | object exists, size matches reservation **and** declared size, SHA-256 recomputed and compared, then `COMMITTED` |
| Read | `GET /api/workspaces/:id/files/:fileId` | scope check before fetch, size reconciled, immutable objects re-verified against the recorded digest, safe `Content-Disposition`, `nosniff`, `no-store` |

Domain records may only reference `COMMITTED` files. If verification fails the
object stays `STAGED` and is removed by scheduled cleanup; if the R2 write fails no
committed record is created. A missing object surfaces as an explicit `NOT_FOUND`
and is never silently recreated.

## 6. Server-authoritative commands

`POST /api/workspaces/:workspaceId/commands` is the **only** structured-state
mutation path. No API accepts arbitrary `state_json`; the closed typed union in
`src/shared/api/commands.ts` is the entire surface.

Worker flow: authenticate session -> resolve actor from **server** state ->
validate workspace/session expiry -> load authoritative state -> fail closed on a
stale workspace revision -> execute the shared domain command (running the
existing `GuardError` guards) -> persist only the changed entities and changed
root documents -> append an audit event -> return the new revision and changed
records.

Commands implemented in this slice (bodies live in `src/domain/`, are browser-free
and are the **single** implementation shared with the browser):

| Command | Rules enforced |
| --- | --- |
| `workspace.rename` | name length |
| `client.create` | active identity, role, Global client scope, full profile validation, duplicate id/code, primary-contact materialisation |
| `client.update` | active identity, role, client scope, **profile-revision check** (`STALE_REVISION`), validation |
| `lead.create` / `lead.update` | active identity, role, money/date/stage validation, converted-lead immutability |
| `lead.convert` | role, `Won` stage requirement, client scope, client creation |

Every other mutation family is **not yet migrated** — see section 9.

## 7. Session, persona and conflict model

* A workspace **access code** is an *enrollment* secret (`<workspaceId>.<64-hex>`).
  Its SHA-256 is stored on a long-lived `demo` session row. Redeeming it issues a
  fresh short-lived `cloud` session; the `demo` row is never itself accepted as a
  request session.
* The cookie is `HttpOnly`, `Secure`, `SameSite=Strict`. Only the token hash is
  persisted, so a D1 read cannot replay a session.
* The **actor** (user id + role) lives on the session row and is written into state
  before guards run. The browser can only ask to switch to a persona that already
  exists and is active inside the workspace.
* Concurrency: a stale workspace revision returns **409 `STALE_REVISION`** with
  `details.currentRevision`. Professional decisions are never merged
  last-write-wins. `idempotencyKey` makes retries safe — a replay returns the
  original response, and reusing a key with a different body is 409
  `IDEMPOTENCY_MISMATCH`.
* `/changes?since=<revision>` returns the full entity set flagged
  `fullResync: true` when the caller is stale, rather than pretending to be a
  precise delta.

## 8. Security posture

Same-origin `Origin` validation on every mutation; no wildcard CORS; bounded JSON
bodies enforced while streaming; parameterised SQL only; `nosniff`,
`Referrer-Policy`, `Permissions-Policy` and `Cache-Control: no-store` on API and
authenticated file responses; correlated request ids on responses and in
structured logs; logs never contain access codes, session secrets or file bytes;
errors map to stable `ApiErrorCode` values so no raw D1/R2 exception reaches the UI.

## 9. Remaining limitations (real, not planned-as-done)

1. **Only the clients/leads command slice is server-authoritative.** Other
   `PrototypeState` mutations still run in the browser. The migration mechanism is
   established (extract a browser-free body into `src/domain/`, add it to the
   union, delegate from `prototypeStore`); the remaining slice work is not done.
2. `prototypeStore` does **not** yet delegate to `src/domain/` inside the browser,
   and the UI does not consume the v2 API yet (`cloudDemo.ts` still uses the legacy
   snapshot API). The v2 API is verified independently by its integration test.
3. No Durable Objects. Write serialization is `batch()` plus the conditional
   revision `UPDATE`. A narrow window exists where a revision could advance before
   entity writes fail; this fails closed (the client sees an error and must reload)
   but is not yet transactionally atomic.
4. Large uploads use the bounded single-request path only; presigned/multipart
   upload is not implemented.
5. `/changes` is a full-resync feed, not a precise delta feed.
6. Rate limiting is wired but only active if the account supplies the binding.
