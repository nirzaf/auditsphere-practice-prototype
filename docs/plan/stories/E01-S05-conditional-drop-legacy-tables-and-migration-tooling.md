# E01-S05 — CONDITIONAL: drop legacy tables and retire legacy-migration tooling

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E01-S05 | E01 | Migration | P2 | M | E01-S04; owner authorized retirement; remote data inventory outstanding | ADR-0003 |

## Current implementation status (2026-10-08)
- Owner instruction: “drop it” — authorizes retiring the legacy TEST schema and migration tooling. This is not evidence that remote TEST workspaces contain no live records.
- Implemented locally in migration `0045_drop_legacy_snapshot_tables.sql`; retained migration rows are not dropped.
- Live D1 inventory is **pending**: Wrangler authentication expired and the auth server could not be reached. Do not report the remote data precondition as verified.
- The deployment workflow applies D1 migrations from `main` after verification. A push will therefore execute this destructive migration if the Cloudflare deploy switch and secrets are active.

## Intent
Remove dead schema and the US-SYS-002 legacy-to-BUSINESS cutover tooling once it is certain no real records live in legacy `TEST` workspaces.

## Read first
- `docs/contracts/data-model-delta.md` §6
- `docs/plan/removal-guideline.md` §3 row 1
- `tools/business-migration-*.ts`, `docs/prototype/business-data-migration-audit.md` (if still present)

## Data-loss control
1. The owner authorized retirement with “drop it”. This direct authorization is recorded here; it does not establish that TEST rows are absent.
2. The operator query result for **each** environment is still outstanding because Wrangler credentials have expired:
   ```bash
   npx wrangler d1 execute <db> --remote --command "SELECT data_mode,status,COUNT(*) FROM workspaces GROUP BY 1,2"
   ```
   The result must be reviewed for rows with `data_mode='TEST' AND status<>'deleted'` before manually applying this migration to any additional environment.
3. Runtime code, tools, and tests no longer reference the legacy tables. Historical SQL files retain their original references and are never rewritten.

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
