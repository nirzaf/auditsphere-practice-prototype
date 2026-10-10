# E02-S03 staging restore drill record

## Acceptance status

**NOT RUN — staging resources are not provisioned.** `wrangler.jsonc` still has a placeholder staging D1 database ID. No D1 Time Travel restore, staging data write, scheduled backup, or Cloudflare resource mutation was performed for this record.

## Required evidence after staging setup

| Field | Record |
|---|---|
| Drill date/time (UTC) | NOT RUN |
| Operator | NOT RUN |
| Incident/rehearsal ID | NOT RUN |
| Staging D1 backend and verified retention window | NOT VERIFIED |
| Workspace ID (synthetic workspace only) | NOT RUN |
| Baseline Time Travel bookmark | NOT CAPTURED |
| Known synthetic business change and its row/event ID | NOT CREATED |
| Change timestamp (UTC) | NOT RECORDED |
| Restore timestamp/bookmark | NOT RUN |
| Restore duration | NOT MEASURED |
| Post-restore verification duration | NOT MEASURED |
| Total recovery duration / RTO result | NOT MEASURED |
| Expected change absent | NOT VERIFIED |
| Workspace row counts match pre-change baseline | NOT VERIFIED |
| Audit event hashes, sequence and head match | NOT VERIFIED |
| Committed R2 file sample SHA-256 checks | NOT VERIFIED |
| Business owner validation and traffic-resumption decision | NOT RUN |
| Findings / corrective actions | BLOCKED pending isolated staging resources |

## Execution procedure

1. Confirm staging is a separately provisioned environment, the D1 database uses the production backend, and its current Time Travel retention is at least seven days. Record the operator, UTC start time and current bookmark. Do not use production or real client records.
2. Select a synthetic BUSINESS workspace. Run the verifier and save its complete output as the pre-change row-count and integrity baseline:

   ```powershell
   npx.cmd tsx tools/verify-restore.ts --workspace-id '<workspace UUID>' --environment staging --sample-size 100
   ```

3. Through the staging UI, make one harmless, known business change in that workspace (for example, a synthetic audit-test note). Record its event/record ID and UTC timestamp. Rerun the verifier and save output proving the expected table count changed.
4. Restore `auditsphere-staging` to the Time Travel point immediately before the change, following the incident controls and commands in [backup-restore.md](backup-restore.md). Record the restore bookmark and the start/end times for the restore and verification separately.
5. Run the verifier again. Confirm the synthetic change is absent, every workspace table count matches the pre-change baseline, the audit chain recomputes to `audit_chain_heads`, and every selected committed R2 object matches its stored SHA-256. Have the workspace owner verify synthetic business totals before the release owner permits writes again.
6. Replace every NOT RUN/NOT VERIFIED value above with measured evidence. Attach only redacted command output and synthetic IDs; do not copy SQL exports, client records, access tokens, or secrets into this document.

## Result

No live drill has run yet. E02-S03 remains partially implemented and not accepted until the dated, operator-attributed result and RPO/RTO measurements above are complete.
