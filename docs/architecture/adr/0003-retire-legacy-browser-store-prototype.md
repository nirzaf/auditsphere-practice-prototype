# ADR-0003 — Retire the legacy browser-store prototype and TEST snapshot API

- **Status:** Proposed — accept with E01
- **Date:** 2026-10-08

## Context
`src/App.tsx` mounts the legacy `PrototypeApp` only when `import.meta.env.DEV && VITE_TEST_HARNESS === 'true'`. The Worker keeps a parallel TEST mode (`TEST_SNAPSHOT_API_ENABLED`, `workspace_entities`, `workspace_root_documents`, `workspace_sessions`, `workspace_seeds`, `demo_*` tables, access-code resume, persona switch) that is unreachable in production. Import-graph analysis at `54ec5a3`:
- BUSINESS UI reaches 20 `src/` files (`src/components/business/*`, `StatusBadge.tsx`, `src/domain/{procedureConflict,reportingStandards}.ts`, `src/services/{businessWorkspace,practiceAccounts,statusSemantics}.ts`, `src/shared/api/{business,errors}.ts`).
- BUSINESS Worker modules reach only `src/domain/reportingStandards.ts`, `src/shared/api/errors.ts`, `src/types/{index,targetLifecycle}.ts` (types only via `worker/db.ts`/`worker/state.ts`).
- Everything else under `src/` is legacy.

## Decision
Delete the legacy UI, legacy domain/services/store, legacy Worker TEST handlers and their tests (E01-S02, E01-S03). Drop legacy D1 tables in a forward migration only after D2 is confirmed (E01-S05).

## Consequences
- ~40 legacy unit tests and `tests/e2e/targetLifecycle.test.ts` are retired, not "fixed".
- `worker/index.ts` shrinks; business tests stop transitively importing `src/domain/commands.ts`.
- Historical evidence remains available via git history and the archive tag.
