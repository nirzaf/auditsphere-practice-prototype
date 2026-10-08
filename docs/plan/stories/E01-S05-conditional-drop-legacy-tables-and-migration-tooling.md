# E01-S05 — CONDITIONAL: drop legacy tables and retire legacy-migration tooling

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E01-S05 | E01 | Migration | P2 | M | E01-S04; **decision D2 answered "no real data in TEST workspaces"** | ADR-0003 |

## Intent
Remove dead schema and the US-SYS-002 legacy-to-BUSINESS cutover tooling once it is certain no real records live in legacy `TEST` workspaces.

## Read first
- `docs/contracts/data-model-delta.md` §6
- `docs/plan/removal-guideline.md` §3 row 1
- `tools/business-migration-*.ts`, `docs/prototype/business-data-migration-audit.md` (if still present)

## Preconditions (agent must check and report; do not proceed if any fails)
1. Owner's written answer to D2 is recorded in the PR description.
2. Operator query result for **each** environment (owner runs it if the agent has no access):
   ```bash
   npx wrangler d1 execute <db> --remote --command "SELECT data_mode,status,COUNT(*) FROM workspaces GROUP BY 1,2"
   ```
   shows zero rows with `data_mode='TEST' AND status<>'deleted'`.
3. `rg` shows no remaining code referencing each table to be dropped.

## Scope
**In:** new migration `0050_drop_legacy_snapshot_tables.sql` per data-model-delta §6 (keeping `demo_seeds` with an insert-blocking trigger); delete `tools/business-migration-*.ts`, `tests/unit/businessMigration*.test.ts`, the `migration:audit` script, the `/api/workspaces/:id/migration-status` route, and their docs.
**Out:** dropping `migration_runs`/`migration_id_map` unless the owner also approves (then include them and their 0039–0041 guard triggers' dependent objects).

## Acceptance criteria
1. Migration applies on a copy of production schema (local D1 built from all migrations) without FK/trigger errors; `tests/unit/workerMigrations.test.ts` asserts schema version 50 (or the actual next number) and that dropped tables are absent.
2. `INSERT INTO demo_seeds …` aborts with the trigger message.
3. Route inventory no longer contains `migration-status`.
4. All suites green.

## Verify with
```bash
npx tsx --test tests/unit/workerMigrations.test.ts tests/unit/routeInventory.test.ts && npm run test:unit
```

## Stop and ask if
- Any precondition is unmet, or any FK/trigger in a retained migration references a table on the drop list.
