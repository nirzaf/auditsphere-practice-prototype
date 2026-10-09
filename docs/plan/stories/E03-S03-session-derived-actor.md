# E03-S03 — Session-derived actor in `resolveBusinessContext`; migrate test helpers

> **Retired scope:** the current user-provided real-implementation epic explicitly excludes application authentication, accounts, passwords, sessions, and RBAC. This historical E03 story is not an active requirement. Do not implement it unless the user authorizes a new scope.

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E03-S03 | E03 | Refactor | P0 | M | E03-S02 | NFR SEC-01, SEC-02, SEC-08 |

## Intent
Make every business route require an authenticated session and take the actor from it. This is the change that turns the existing persona permissions and segregation-of-duties checks into real controls.

## Read first
- `worker/business.ts` `resolveBusinessContext` (L554+) and `runBusinessDirectoryCommand` (L3781+) — the two identity choke points; `resolveBusinessContext` has 43 call sites across `worker/*.ts`
- `GET /api/workspaces/:id/actor-profiles` handler (`worker/index.ts:329`) — public today
- `docs/contracts/api-delta.md` §2 (compat phase)
- `docs/quality/testing.md` §2.2 (`tests/helpers/authSession.ts`)

## Current state (verified)
Actor = `X-Actor-Id` + `X-Active-Persona` headers (reads) and `envelope.actor` (commands); headers and envelope must agree with each other but nothing proves who the caller is.

## Scope
**In:**
- `resolveBusinessContext(env, workspaceId, request)` → first calls `validateAuthSession` using the cookie; resolves the actor profile from `active_actor_profile_id`; enforces `session.workspace_id === workspaceId` (else `404 NOT_FOUND`); if `X-Actor-Id`/`X-Active-Persona` present and ≠ session actor → `403 PERSONA_ACTION_DENIED`; if no active profile → `403 PERSONA_ACTION_DENIED` with `code: 'PROFILE_SELECTION_REQUIRED'` detail.
- `runBusinessDirectoryCommand`: `envelope.actor` must equal the session actor (else `403`), so existing clients keep working.
- File byte routes (`PUT …/files/:id/content`, `POST …/complete`, downloads) go through the same resolution.
- `GET …/actor-profiles` → requires a session; non-admins see only their own profiles (full list for `is_firm_admin`).
- `tests/helpers/authSession.ts` and migration of every test that sets `X-Actor-Id` (counts at `54ec5a3`: `businessWorkspace` 9, `businessReporting` e2e 9, `businessProcedureConflict` e2e 4, `businessCommandConcurrency` 1, `businessDirectoryPagination` 1, `businessWorkspacePersistence` 1).
- SPA (`src/services/businessWorkspace.ts`): send `credentials: 'same-origin'` (cookie) on all API calls; keep headers for now.
**Out:** removing headers/envelope actor (E03-S08); assignment scoping (E03-S07); client login (E03-S05).

## Acceptance criteria
1. Route inventory: every `/api/workspaces/**` route returns `401 UNAUTHENTICATED` with no cookie (parametrised test over the router table).
2. Forged-header test: Preparer session + `X-Actor-Id` of a Partner profile → `403`, and **no** row written to any table (assert `command_receipts`, `audit_events` counts unchanged).
3. Forged-envelope test: Preparer session + `envelope.actor` = Partner → `403`, no writes.
4. Cross-workspace test: session for workspace A calling `/api/workspaces/B/...` → `404`.
5. Segregation tests re-run under real sessions: same natural person cannot review own procedure (`SELF_REVIEW_BLOCKED`), cannot approve own item (`SELF_APPROVAL`), Reviewer cannot select opinion (`PERSONA_ACTION_DENIED`), Preparer cannot clear SRM.
6. All pre-existing business unit and e2e suites pass after helper migration with **no assertion changes** other than auth plumbing (list any exception with justification).
7. Revoking a grant mid-session makes the next request `401` (`GRANT_REVOKED`).

## Implementation notes
- Implement session lookup once per request: memoise on the `Request` object (WeakMap) because some handlers call `resolveBusinessContext` more than once.
- `touchSession` write must not be part of a command's atomic batch (keep it a separate best-effort write).
- E2E harness: log in by inserting a session via `authSession.ts` and setting the cookie through CDP `Network.setCookie` (do not drive Entra in E2E).

## Constraints
- Do not change any business response shape.
- Do not weaken any existing guard.
- Keep `BUSINESS_SETUP_ENABLED` bootstrap working for tests until E03-S06 provides the CLI/test bootstrap.

## Verify with
```bash
npm run cloud:typecheck && npm run lint && npm run test:unit && npm run build && npm run test:e2e
```

## Stop and ask if
- Any handler resolves identity without going through `resolveBusinessContext` (e.g. archive download tickets) — list them and propose the treatment before changing.
