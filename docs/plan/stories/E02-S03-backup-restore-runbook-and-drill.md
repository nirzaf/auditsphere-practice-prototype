# E02-S03 — Backup/restore runbook and staging drill

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E02-S03 | E02 | Ops | P0 | M | E02-S01 | NFR REL-02 |

## Intent
Prove the firm can recover D1 to a point in time and that R2 bytes remain verifiable after a restore.

## Read first
- `tests/e2e/businessBackupRestore.test.ts`, `tests/helpers/businessBackupRestore.ts` (existing local backup/restore exercise)
- Cloudflare D1 Time Travel and export documentation (fetch current docs; do not rely on memory for retention windows or command flags)

## Scope
**In:** `docs/ops/backup-restore.md` (procedures for D1 Time Travel restore to a bookmark/timestamp, nightly `wrangler d1 export` to a private R2 bucket or offline storage, R2 integrity re-verification using stored SHA-256), a scheduled export mechanism (GitHub Actions nightly job **or** documented owner cron — pick one and justify), and a recorded drill on staging.
**Out:** cross-account replication.

## Acceptance criteria
1. Runbook states RPO ≤ 24 h, RTO ≤ 8 h, the exact commands, who runs them, and how to verify success (row counts per table, `audit_chain_heads` hash continuity, sample file SHA-256 re-check).
2. Drill on staging: create a known business change, record its timestamp, restore D1 to before it, confirm the change is absent and the chain verifies; results logged in `docs/ops/restore-drill.md` with date, operator, durations.
3. Nightly export job (if GitHub Actions): uses a least-privilege API token secret, writes to a non-public destination, retains ≥ 35 days, fails loudly.
4. A tool `tools/verify-restore.ts` that, given a workspace ID and an environment, recomputes the audit chain and samples N file versions' SHA-256 from R2, exiting non-zero on mismatch. Unit-tested against `SqliteD1`.

## Verify with
```bash
npx tsx --test tests/unit/verifyRestore.test.ts
```

## Stop and ask if
- Time Travel retention on the firm's plan is shorter than 7 days.

## Implementation progress

**Code and operational procedures are implemented; the story is not fully
accepted.** [backup-restore.md](../../ops/backup-restore.md) defines the RPO/RTO,
roles, account-scoped read-only permissions, destructive restore procedure,
private offline export, retention, validation and escalation steps. The owner
schedule is documented as a nightly Task Scheduler job rather than a GitHub
Actions upload so database contents do not enter CI artifacts. Its executable
is [export-d1-backup.ps1](../../../tools/export-d1-backup.ps1), which refuses a
repository destination, writes a D1 SQL export and SHA-256 manifest, and fails
on missing/empty output or integrity mismatch. It does not prune exports.

The read-only [verify-restore.ts](../../../tools/verify-restore.ts) recomputes
the sequential audit chain against its workspace head, returns per-table
workspace row counts, and fetches a deterministic sample of committed R2 files
to compare their bytes to stored SHA-256. New audit writes preserve the exact
hashed timestamp in migration `0057`; pre-existing outbox events with only
whole-second timestamps are checked against their bounded millisecond window.
The staging drill record is in [restore-drill.md](../../ops/restore-drill.md).

**External acceptance is blocked:** both Cloudflare D1 IDs remain placeholders,
no nightly task has been created, and neither the staging Time Travel backend
nor plan retention window has been verified. No remote restore, backup,
resource creation, or live drill was run. RPO/RTO and the drill remain
unmeasured. Do not mark this story complete until an isolated staging drill is
dated and signed by its operator and owner.

**Verification — 2026-10-10:** `tests/unit/verifyRestore.test.ts` passed
(5/5); `tests/unit/workerMigrations.test.ts` passed (1/1);
`tests/unit/businessWorkspacePersistence.test.ts` and
`tests/unit/businessWorkspace.test.ts` passed (12/12).
`npm run cloud:typecheck`, `npm run build`, the PowerShell parser, and
`git diff --check` passed. Vite reports the existing 500 KB+ bundle warning.
The Cloudflare staging restore and scheduled owner task remain unrun due to
the unprovisioned isolated resources.
