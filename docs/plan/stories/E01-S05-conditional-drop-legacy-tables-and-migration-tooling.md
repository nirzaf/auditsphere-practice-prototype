# E01-S05 — CONDITIONAL: drop legacy tables and retire legacy-migration tooling

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E01-S05 | E01 | Migration | P2 | M | E01-S04; owner authorized retirement; remote data inventory outstanding | ADR-0003 |

## Current implementation status (2026-10-09)
- Owner directly authorized deletion of the TEST workspace data and application of migration `0045` after seeing the live inventory and its row counts. This treats that TEST data as disposable for the developer/testing environment; it is not a claim that the records were empty.
- Implemented locally in migration `0045_drop_legacy_snapshot_tables.sql`; retained migration rows are not dropped.
- A fresh inventory of remote D1 database `steaudit-prototype-demo` found **21 active, unexpired TEST workspaces**, containing **998** `workspace_entities`, **84** `workspace_root_documents`, and **21** `workspace_sessions`. Before cleanup, table-wide totals were 1,412 entities, 120 root documents, 30 sessions, 30 expiry rows, and 2 retained seed rows.
- After the action-time confirmation, the 21 matching active/unexpired TEST rows were soft-deleted with the existing `status='deleted'` lifecycle field; a follow-up query returned **0 active TEST workspaces**. Workspace rows are retained because relational business/audit tables use `ON DELETE RESTRICT`. The exact legacy tables remain until migration `0045` applies.
- The GitHub Actions deploy for main commit `98c6c8b` had previously reached migration `0045`, where its preflight aborted before any DDL. A new push is required to retry; do not report E01-S05 or the deployment complete until the migration and post-deploy checks pass.
- The deployment workflow applies D1 migrations from `main` after verification. Migration 0045 runs a D1 preflight first and aborts before table removal if any active TEST workspace remains.

## Intent
Remove dead schema and the US-SYS-002 legacy-to-BUSINESS cutover tooling once it is certain no real records live in legacy `TEST` workspaces.

## Read first
- `docs/contracts/data-model-delta.md` §6
- `docs/plan/removal-guideline.md` §3 row 1
- `tools/business-migration-*.ts`, `docs/prototype/business-data-migration-audit.md` (if still present)

## Data-loss control
1. The owner explicitly authorized removal of the TEST data after reviewing the live inventory. The active workspaces were retired using the schema's soft-delete status so FK-restricted business/audit records are not orphaned.
2. The earlier main deployment run stopped at the migration preflight. The exact preflight that must pass before migration is:
   ```bash
   npx wrangler d1 execute <db> --remote --command "SELECT data_mode,status,COUNT(*) FROM workspaces GROUP BY 1,2"
   ```
   The verified result for the configured main environment is now zero active TEST rows. Re-inventory any additional environment before applying migration `0045` there.
3. Migration `0045` drops entire legacy tables, so its removal includes inactive/history rows as well as rows associated with the 21 active workspaces. Pre-migration table totals were 1,412 entities, 120 root documents, 30 sessions, and 30 expiry rows. Runtime code, tools, and tests no longer reference the legacy tables. Historical SQL files retain their original references and are never rewritten.

## Scope
**In:** new migration `0045_drop_legacy_snapshot_tables.sql` per data-model-delta §6 (keeping `demo_seeds` with an insert-blocking trigger); delete `tools/business-migration-*.ts`, `tests/unit/businessMigration*.test.ts`, the `migration:audit` script, the `/api/workspaces/:id/migration-status` route, and their docs.
**Out:** dropping `migration_runs`/`migration_id_map` unless the owner also approves (then include them and their 0039–0041 guard triggers' dependent objects).

## Acceptance criteria
1. Migration applies on a copy of the current schema (local D1 built from all migrations) without FK/trigger errors; `tests/unit/workerMigrations.test.ts` asserts schema version 45 and that dropped tables are absent.
2. `INSERT INTO demo_seeds …` aborts with the trigger message.
3. Route inventory no longer contains `migration-status`.
4. All suites green.

## Verify with
```bash
npx tsx --test tests/unit/workerMigrations.test.ts tests/unit/routeInventory.test.ts && npm run test:unit
```

## Additional environments
Before applying migration 0045 manually to any other environment, obtain a fresh remote D1 inventory and inspect its TEST rows. Migration 0045 drops the approved legacy tables; the main deployment is already authorized by the owner.
