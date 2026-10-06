# Business data migration audit

`US-SYS-002` adds an operator-run, read-only audit for a workspace before any
legacy source data is considered for normalized cutover. It reads the D1
workspace, decomposed entity rows and root documents, checks every recorded
source-to-target ID mapping and normalized table counts, verifies committed
legacy file bytes in R2, and prints stable source hashes, native money totals,
missing files, orphans and unmapped rows.

## Run

Local Wrangler D1 and R2 are the default:

```powershell
npm.cmd run migration:audit -- --workspace 00000000-0000-4000-8000-000000000000 --dry-run
```

To read the configured remote D1 and R2 explicitly, add `--remote`. The command
does not mutate business rows. It stores a compact `MigrationRun` audit record
so `GET /api/workspaces/{w}/migration-status` can report the most recent
validation. The source snapshot and file objects remain unchanged.

## Cutover interpretation

The registry in `tools/business-migration-audit-core.ts` links known legacy
collection names to candidate normalized tables; it is not a data transformer.
Every source row requires an explicit `migration_id_map` entry and an existing
normalized target row. The tool blocks validation for unmapped rows, unresolved
relationships, non-committed files, missing R2 objects, size/hash mismatches,
count or monetary differences, and source schema versions newer than migration
target 31. Even when IDs, counts and totals match, each non-empty source row is
reported with `TARGET_FIELD_RECONCILIATION_NOT_VERIFIED`: field-by-field source
to target comparison and the apply migrator remain unimplemented. Therefore this
tool cannot authorize cutover for non-empty legacy data. It never invents a
target record, approval, ID mapping, or missing file.

`moneyTotals.sourceNativeUnits` reports values as stored by the legacy snapshot;
`moneyTotals.targetQarMinorUnits` reports normalized minor-unit totals. They
are intentionally separate because legacy prototype fields have no uniform
currency-unit contract.

This command is a validation gate, not an apply migrator. A blocked report must
be reconciled and the target records/mappings must be created through a reviewed
deployment operation before the workspace can pass cutover validation. No
source snapshot or historical table is deleted by this tool.
