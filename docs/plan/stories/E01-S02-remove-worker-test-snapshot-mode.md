# E01-S02 — Remove the Worker TEST snapshot mode

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E01-S02 | E01 | Cleanup | P0 | M | E01-S01 | §1.1; ADR-0003 |

## Intent
Delete the legacy seed/snapshot/session API so `worker/` contains only the BUSINESS path. After this story, `worker/index.ts` no longer imports anything from `src/domain/commands.ts`, `src/store/**` or `worker/state.ts`.

## Implementation progress — 2026-10-08
- Removed the seed catalog, seeded workspace creation, resume/state/event/delete/persona/logout handlers and routes. `POST /api/workspaces` rejects a `seedId` with `400 BAD_REQUEST`; BUSINESS bootstrap is unchanged.
- Removed every TEST fallback from workspace, change-feed, command and file handlers. TEST-mode workspaces now return `404 NOT_FOUND` on the remaining BUSINESS routes.
- Replaced the generic `PrototypeState` D1 adapter with BUSINESS workspace lookups, removed the session/state/file modules, deleted the isolated cloud API suite and TEST expiry unit suite, removed its npm script and binding contract, and removed legacy scheduled sweeps including the obsolete `idempotency_keys` purge.
- Added a static full-route inventory test. `npm run cloud:typecheck`, `npm run lint`, and `npx tsx --test tests/unit/routeInventory.test.ts` pass. Browser verification remains blocked by the local Chrome E2E timeout/profile cleanup issue previously recorded in E01-S01; the retained BUSINESS E2E test now asserts the removed routes and seeded-create rejection.
- Deleted tests: `tests/cloud/api.test.ts`, `tests/unit/workspaceExpiry.test.ts`.
- Status: **implementation complete; acceptance verification partial** pending a working E2E browser harness and the milestone suite rerun.

## Read first
- `docs/plan/removal-guideline.md` §2.2, §2.3
- `worker/index.ts` (router ~L1035–1098, `handleCommand` L755+, `scheduled()` L1162+)
- `docs/architecture/adr/0003-retire-legacy-browser-store-prototype.md`

## Current state (verified at `54ec5a3`)
- `requireTestSnapshotApi` gates legacy handlers on `TEST_SNAPSHOT_API_ENABLED === 'true'`.
- TEST-only handlers: `handleSeeds`, `handleResumeWorkspace`, `handleState`, `handleEvents`, `handleDeleteWorkspace`, `handlePersonaSwitch`, `handleLogout`, the seeded branch of `handleCreateWorkspace`.
- Mixed handlers with a `data_mode === 'BUSINESS'` branch followed by a TEST branch: `handleCommand`, `handleChanges`, `handleGetWorkspace`, `handleFileInit/List/Download/Metadata/Content/Complete/Delete`.
- `worker/index.ts` imports `./sessions`, `./files`, `./state`, and `runWorkspaceCommand` (legacy domain).

## Scope
**In:** remove TEST handlers/branches/routes, `worker/sessions.ts`, `worker/state.ts`, `worker/files.ts`, legacy-only helpers in `worker/db.ts`, legacy keys in `worker/env.ts`, legacy sweeps in `scheduled()`, legacy tests that only exercise these.
**Out:** BUSINESS bootstrap (`POST /api/workspaces` without `seedId`) — stays until E03-S08. D1 table drops (E01-S05). UI deletions (E01-S03).

## Acceptance criteria
1. Routes removed: `GET /api/seeds`, `POST /api/workspaces/resume`, `GET /api/workspaces/:id/state`, `GET /api/workspaces/:id/events`, `DELETE /api/workspaces/:id`, `POST /api/session/persona`, `POST /api/session/logout`. A request to each returns `404 NOT_FOUND` (router default) — asserted by a new test `tests/unit/routeInventory.test.ts` that also snapshots the full remaining route list.
2. `POST /api/workspaces` with a `seedId` body returns `400 BAD_REQUEST` (seed creation no longer exists); without `seedId` behaves exactly as before.
3. Mixed handlers keep their BUSINESS branch byte-for-byte in behaviour; for a `TEST`-mode workspace row they return `404 NOT_FOUND`.
4. Files deleted: `worker/sessions.ts`, `worker/state.ts`, `worker/files.ts`. `worker/db.ts` retains only functions referenced by remaining code.
5. `rg -n "TEST_SNAPSHOT_API_ENABLED|requireTestSnapshotApi|resolveSession\b|runWorkspaceCommand|snapshotEntityCollections|workspace_entities|workspace_root_documents|workspace_sessions|demo_workspaces|demo_creation_limits" worker src/shared tests` → matches only in `worker/migrations/*.sql` and in tests being deleted by this story.
6. `scheduled()` no longer touches `demo_workspaces`, `demo_creation_limits`, `test_workspace_expiry` or `workspace_sessions`; outbox, archive sweep and metrics behaviour unchanged (existing `workerObservability` and archive tests green).
7. `tests/cloud/api.test.ts` and the `test:cloud` npm script are removed; `wrangler.jsonc`/CI contain no `TEST_SNAPSHOT_API_ENABLED`.
8. All retained suites green; report lists every deleted test file.

## Implementation notes
- Work handler by handler: delete the TEST branch, then delete now-unused imports; let `tsc` find dead code (`npm run cloud:typecheck`).
- `handleChanges`: the BUSINESS branch calls the business change feed; keep it.
- `idempotency_keys` purge in `scheduled()`: keep only if a remaining code path writes `idempotency_keys` (`rg -n idempotency_keys worker`); otherwise remove the purge (table drop happens in E01-S05).
- `cleanupStagedFiles` (from `worker/files.ts`) only sweeps legacy `file_objects`; delete its call. The BUSINESS equivalent is E06-S07.

## Constraints
- No change to any BUSINESS response shape or status code.
- Do not modify `worker/migrations/`.
- Do not rename `worker/index.ts` exports used by tests (`default`, `businessCommandHttpResult`).

## Verify with
```bash
npm run cloud:typecheck && npm run lint
npx tsx --test tests/unit/routeInventory.test.ts tests/unit/businessWorkspace.test.ts
npm run test:unit && npm run build && npm run test:e2e
```

## Stop and ask if
- A BUSINESS code path is found to depend on `worker/state.ts`, `worker/sessions.ts` or `file_objects`.
- Any retained test fails for a reason other than importing deleted code.
