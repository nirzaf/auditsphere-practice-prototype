# Business data migration audit

`US-SYS-002` adds an operator-run, read-only audit for a workspace before any
legacy source data is considered for normalized cutover. It reads the D1
workspace, decomposed entity rows and root documents, checks every recorded
source-to-target ID mapping and normalized table counts, verifies committed
legacy file bytes in R2, and prints stable source hashes, native money totals,
missing files, orphans and unmapped rows.

`sourceSha256` is calculated from the source workspace, entity/root payloads and
file manifest. The mutable `migration_id_map` is reconciled separately, so
recording reviewed mappings cannot change the digest of unchanged source data.

## Run

Local Wrangler D1 and R2 are the default:

```powershell
npm.cmd run migration:audit -- --workspace 00000000-0000-4000-8000-000000000000 --dry-run
```

To read the configured remote D1 and R2 explicitly, add `--remote`. The command
does not mutate business rows or source snapshots. When the source schema is
older than the target, it stores a compact `MigrationRun` audit record so
`GET /api/workspaces/{w}/migration-status` can report the most recent
validation. The source snapshot and file objects remain unchanged.

## Cutover interpretation

The registry in `tools/business-migration-audit-core.ts` links known legacy
collection names to candidate normalized tables; it is not a data transformer.
Every source row requires an explicit `migration_id_map` entry and an existing
normalized target row. The tool blocks validation for unmapped rows, unresolved
relationships, non-committed files, missing R2 objects, size/hash mismatches,
count or monetary differences, and source schema versions newer than migration
target 41 (kept aligned with `worker/versions.ts`). Explicit field-by-field comparisons cover client, contact, lead, and
committed file metadata. File metadata retains the original creator and logical
record link in dedicated legacy-provenance columns; values are represented in
the report by SHA-256 hashes. Unmapped fields and other entity kinds remain
blockers until their mappings and transformations are reviewed and implemented.
It never invents a target record, approval, ID mapping, or missing file.

`moneyTotals.sourceNativeUnits` reports values as stored by the legacy snapshot;
`moneyTotals.targetQarMinorUnits` reports normalized minor-unit totals. They
are intentionally separate because legacy prototype fields have no uniform
currency-unit contract.

Receipt-voucher amounts are read through each voucher's immutable `payment_id`
relationship to `payments.amount_minor`; vouchers do not store an amount column.
The target snapshot reports payment rows and reconciles the receipt total against
both the linked voucher population and the payment ledger.

The deployment-only apply operation migrates losslessly mapped `clients`,
`contacts`, canonical `leads`, and committed, byte-verified `file_objects` whose
target client relationship resolves when present. Lead fields are mapped only
from the exact normalized source shape (including already-minor-unit fees,
canonical enums, a real ISO timestamp, and source-preserved relationship IDs).
Unknown fields, converted leads without an engagement mapping, invalid periods,
and lost leads without their original reason block apply. The migration keeps
the source lead status and does not synthesize state transitions or approvals. A
non-null engagement relationship still requires an engagement mapping, which
this apply profile does not create. Apply also requires no existing target
clients/contacts/leads/files, no existing ID maps, no non-metadata root documents,
and no other source entity kinds. It requires schema 41 migration guards and
must be invoked explicitly against remote D1:

```powershell
npm run migration:audit -- --workspace <uuid> --apply --remote
```

The command checks source rows again in the same atomic D1 batch, preserves IDs,
records source-to-target maps, and changes the MigrationRun to `APPLIED` only
after triggers verify every entity and file has a corresponding target and
mapping. File inserts retain the exact R2 key; the object bytes are not copied
or rewritten, and their size and SHA-256 must match the source manifest before
apply. Original file creator/logical-link fields are mapped to legacy provenance
columns. A stale source, FK/uniqueness failure, or incomplete map rolls back the
entire batch. Existing source snapshots and files are never deleted. The apply
operation still refuses invoices, engagements, and all other unsupported entity
kinds; the epic's invoice cutover scenario and engagement-linked evidence-file
scenario remain open.

Apply also binds the preflight report to the exact source digest and application
schema version. The first D1 statement rechecks workspace schema/data mode and
the complete root-document set/content in the same transaction as the target
inserts and mappings. Entity/file rows are individually rechecked, and the
cutover triggers recheck complete row counts and mapping coverage. A stale
report or source snapshot aborts the batch instead of recording an APPLIED run
against different source data.
