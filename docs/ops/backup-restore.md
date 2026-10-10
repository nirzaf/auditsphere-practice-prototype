# D1 backup and restore runbook

**Owner:** Platform owner (operator); release owner (incident lead); workspace owner (business-data validation).
**Recovery objectives:** RPO ≤ 24 hours; target RTO ≤ 8 hours. These are operating targets, not yet measured against a staging drill.
**Scope:** the isolated `auditsphere-staging` and `auditsphere-production` D1 databases and their matching private R2 file buckets. Never use a production database for a recovery drill.

## Recovery options and prerequisites

1. Prefer Cloudflare D1 Time Travel for a live point-in-time recovery. Time Travel is always on for supported production-backend D1 databases. Before declaring it available, the platform owner checks `wrangler d1 info` for `version: production` and confirms the plan window is at least seven days. Current Cloudflare documentation states up to 7 days on Workers Free and 30 days on Workers Paid; account eligibility and any plan changes must be checked at incident time. Stop and escalate if the configured plan is shorter than seven days.
2. Use a nightly full SQL export as a separately held recovery copy. It is written to an approved, encrypted offline destination, outside this repository. The export contains confidential workspace and client data. Do not put it in GitHub artifacts, a public R2 bucket, build logs, or an unapproved personal device.
3. D1 restore only rewinds D1. R2 remains in place. The verification tool checks the restored workspace audit chain and deterministically samples committed file versions against their existing R2 bytes and D1 SHA-256 values. This is a sample check, not a complete R2 inventory.

Cloudflare states that a Time Travel restore overwrites the selected database in place and cancels in-flight queries. Treat it as a destructive incident operation: the incident lead records the target, incident timestamp, current bookmark, affected writes, recovery point, and decision before the platform owner runs it. Suspend application writes, confirm the database/environment twice, and have the workspace owner validate the recovered records before resuming traffic.

## Nightly SQL export

The selected schedule is an **owner-managed Windows Task Scheduler job**, not a GitHub Actions workflow. This avoids copying workspace data into CI artifacts and avoids using the deployment token. The platform owner creates one daily 02:00 UTC task per environment, under a dedicated account, after provisioning is complete. Use a token scoped only to the selected account with `D1 Read`; do not reuse the deployment token. The runner also needs the repository's Wrangler installation and a secret provider that exposes `CLOUDFLARE_API_TOKEN` only to that process. No token belongs in the task command, script, manifest, or logs.

In Task Scheduler, create a daily task for each environment. Set the schedule to the host-local time equivalent of 02:00 UTC, review daylight-saving behavior, run as the dedicated backup account, and select **Run whether user is logged on or not**. The action starts `powershell.exe` with `-NoProfile -File <repo>\tools\export-d1-backup.ps1 -Environment staging -DestinationPath <approved absolute directory>`; create a separate production task with its production destination after that environment is approved. Configure the host's approved secret provider to inject `CLOUDFLARE_API_TOKEN` for the process. Enable task history and alert on a nonzero result or a missing SQL/manifest pair.

Create the destination first as a private, encrypted offline directory with access limited to the backup operator and restore operator. Retain each SQL export and its SHA-256 manifest for **at least 35 days** (and longer if the approved firm retention policy requires it). The script does not prune old backups. Monitor the task's last result and alert the platform owner on any nonzero exit; a missing nightly file or manifest is a failed backup.

Run a one-time smoke export manually before scheduling it:

```powershell
powershell.exe -NoProfile -File tools/export-d1-backup.ps1 `
  -Environment staging `
  -DestinationPath 'E:\AuditSphere-private-backups\staging'
```

Repeat for `production` only after that environment is provisioned and production backup access has been approved. The resulting `.manifest.json` records environment, database name, UTC creation time, file size, and SHA-256; it contains no exported rows. Verify the file against the manifest before relying on it:

```powershell
$manifest = Get-Content -Raw 'E:\AuditSphere-private-backups\staging\<backup>.manifest.json' | ConvertFrom-Json
$actual = (Get-FileHash -Algorithm SHA256 "E:\AuditSphere-private-backups\staging\$($manifest.exportFile)").Hash.ToLowerInvariant()
if ($actual -ne $manifest.exportSha256) { throw 'D1 export SHA-256 mismatch' }
```

The offline SQL export is a recovery copy; a staging restore drill should use Time Travel. Do not import an export over a database unless the incident lead has explicitly selected that recovery path and reviewed the migration/overwrite implications.

## Time Travel recovery procedure

**Incident lead:** release owner. **Executor:** platform owner. **Data validation:** workspace owner. Use the right database name for the environment and never substitute production in a staging procedure.

1. Declare the incident and suspend writes through the approved operational controls. Record the incident ID, affected environment, recovery timestamp in UTC, operator, and the start time.
2. Check backend and retention, and capture the current bookmark for undo:

   ```powershell
   npx.cmd wrangler d1 info auditsphere-staging --config wrangler.jsonc --env staging --json
   npx.cmd wrangler d1 time-travel info auditsphere-staging --config wrangler.jsonc --env staging
   ```

   Confirm `version: production`, a recovery window of at least seven days, and that the incident timestamp is within it. Save the current bookmark in the incident record. Ask the incident lead to confirm the environment, database, timestamp, and destructive restore decision before execution.

3. Resolve and record the bookmark for the approved recovery timestamp, then restore to that bookmark:

   ```powershell
   npx.cmd wrangler d1 time-travel info auditsphere-staging --timestamp='<approved RFC3339 UTC timestamp>' --config wrangler.jsonc --env staging
   npx.cmd wrangler d1 time-travel restore auditsphere-staging --timestamp='<approved RFC3339 UTC timestamp>' --config wrangler.jsonc --env staging
   ```

   Wrangler prompts before overwriting the database. The operator must review the named database and confirm interactively. Record the returned bookmark; it provides the point needed to undo the restore if the chosen point proves incorrect. To restore production, replace both the database name and environment with `auditsphere-production` and `production` only under the production incident procedure.

   If the restored point is incorrect, use the previous bookmark Wrangler returned:

   ```powershell
   npx.cmd wrangler d1 time-travel restore auditsphere-staging --bookmark='<previous bookmark>' --config wrangler.jsonc --env staging
   ```

4. Verify D1 schema/migration state and workspace table counts, chain head continuity, and R2 sample bytes. Save the command output with the incident record. The tool queries every workspace-scoped table described by the checked-in migrations and reports its row count.

   ```powershell
   npx.cmd tsx tools/verify-restore.ts --workspace-id '<workspace UUID>' --environment staging --sample-size 100
   ```

   Compare each row count with the approved pre-incident checkpoint. Confirm the expected records after the recovery timestamp are absent and all expected records before it remain. Review `auditEventsVerified`, `latestAuditSequence`, `latestAuditHash`, and `workspaceTableCounts`; every committed-file sample must match its D1 SHA-256. Any nonzero exit or mismatch blocks resuming writes.

5. The workspace owner validates key business totals and application behavior. The release owner authorizes traffic resumption and records the total elapsed recovery time. If any validation fails, keep writes suspended and use the recorded bookmark or documented forward-repair plan under incident control.

## Staging drill

Run the controlled staging exercise in [restore-drill.md](restore-drill.md) before production acceptance. Capture a verified baseline, make one synthetic business change, record the event timestamp and row-count delta, restore staging to the prior point, and prove that the change is absent while the chain and R2 samples verify. The drill record includes operator, date, action durations, verification output, and corrective actions. Do not use live client data.

## Verification tooling

The read-only verifier accepts `--workspace-id`, `--environment staging|production`, and optional `--sample-size` (default 10; range 1–1000). It checks a contiguous, re-hashed workspace audit chain against its chain head, counts workspace-scoped tables, and downloads an even deterministic sample of committed objects with Wrangler to verify exact SHA-256 bytes. It exits nonzero for missing/malformed events, hash/head/sequence mismatch, missing objects, invalid stored hashes, or byte mismatch. New chain writes store their exact hashed timestamp; for pre-upgrade job events where only a whole-second timestamp exists, the verifier tests the bounded millisecond interval represented by that second and the possible write-boundary rollover.

```powershell
npx.cmd tsx --test tests/unit/verifyRestore.test.ts
npx.cmd tsx tools/verify-restore.ts --workspace-id '<workspace UUID>' --environment staging
```

The verifier requires Wrangler authentication with account-scoped `D1 Read` and `Workers R2 Storage Read` permissions. It performs only D1 reads and R2 gets. The existing isolated SQLite bundle test remains useful for local file-level recovery but does not substitute for the Cloudflare staging drill.

## Current status

The export script, verifier, tests, and procedures are implemented. As of 2026-10-10, the staging and production database IDs in `wrangler.jsonc` are placeholders and no isolated Cloudflare restore drill or scheduled owner task has been run. Therefore the seven-day retention eligibility, RPO/RTO, backup schedule, and staging recovery acceptance remain **unverified**. Do not describe E02-S03 as accepted until the live drill and schedule evidence are recorded.

## Cloudflare references

- [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Wrangler D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Cloudflare API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [D1 data export best practices](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
