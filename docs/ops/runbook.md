# Cloud full-stack runbook

## Bindings

| Binding | Resource | Source of truth |
| --- | --- | --- |
| `env.DB` | D1 `steaudit-prototype-demo` (`3562b9c7-742b-4a64-b250-64e1987f9b4b`) | `wrangler.jsonc` |
| `env.FILES` | R2 `auditsphere-prototype-files` | `wrangler.jsonc` |
| `env.ASSETS` | built `dist/` | `wrangler.jsonc` `assets` |
| `env.ALLOWED_ORIGINS` | optional | only needed for a cross-origin deployment |

Deployed at `https://auditsphere-visual-prototype.quadrate-lk.workers.dev`
(workers.dev subdomain). No custom domain, DNS record or Pages route was changed.

## Local development

```powershell
npm.cmd run dev              # build + Wrangler Worker with local D1/R2 simulation
npm.cmd run preview          # serve the current dist/ build through that Worker
npm.cmd run cloud:typecheck  # typechecks the Worker + its transitive src imports
```

## Migrating and deploying

```powershell
npm.cmd run cloud:typecheck
npm.cmd run cloud:migrate    # wrangler d1 migrations apply ... --remote --config wrangler.jsonc
npm.cmd run cloud:deploy     # npm run build && wrangler deploy --config wrangler.jsonc
```

> `npm` is blocked in some PowerShell sessions by execution policy; use
> `npm.cmd` / `npx.cmd`. `wrangler` is a devDependency, so
> `.\node_modules\.bin\wrangler.cmd <args>` also works.

## Regenerating Worker binding types

```powershell
npx.cmd wrangler types --config wrangler.jsonc worker/worker-configuration.d.ts
```

If that command fails with `CreateDirectory: Access is denied; path =
miniflare-CacheObject`, the environment blocks miniflare's cache directory. In
that case `worker/cloudflare-env.d.ts` already references the repo's generated
runtime types, and the Worker's binding contract lives in `worker/env.ts`.

## Testing

```powershell
$env:CLOUD_API_URL='https://auditsphere-visual-prototype.quadrate-lk.workers.dev'
npm.cmd run test:cloud
```

## Inspecting data

```powershell
.\node_modules\.bin\wrangler.cmd d1 execute steaudit-prototype-demo --remote --config wrangler.jsonc --json --command "SELECT id,name,revision,status FROM workspaces ORDER BY created_at DESC LIMIT 5"
.\node_modules\.bin\wrangler.cmd d1 execute steaudit-prototype-demo --remote --config wrangler.jsonc --json --command "SELECT category,state,count(*) FROM file_objects GROUP BY category,state"
.\node_modules\.bin\wrangler.cmd r2 object list auditsphere-prototype-files
```

## Operational telemetry

Every API response logs a structured `workspace.api.request` record containing
the request ID, declared route template, method, status, outcome and response
header latency in milliseconds. Dynamic path parameters are represented by
their route-template names; raw URLs and query strings are not logged. API
errors also log the stable error code and status. Unhandled exceptions log only
their error class, never the exception message. Responses carry `X-Request-Id`.
Access codes, session secrets, workspace/client identifiers, financial values
and file bytes are not included in these telemetry records.

The daily scheduled sweep emits `workspace.scheduled.metrics` with outbox counts
by job kind/status, oldest unfinished-job age, maximum attempt count, completed
jobs and archive jobs queued. An overdue or failed due archive emits a
`workspace.archive.overdue` error event containing aggregate counts only. In
Cloudflare Workers Logs, configure notifications for
`workspace.archive.overdue` and `workspace.scheduled.metrics_failed`; the
repository emits these signals but does not select an operator notification
destination. Use Cloudflare's built-in request analytics alongside these
records when measuring p95 latency.

The initial p95 targets (<500 ms for scoped reads and <1 s for commands, under
20 active users and excluding provider jobs) are not asserted by this runbook.
Record the deployed version, test environment, concurrency, request mix and
measured p50/p95/p99 before claiming those targets. Do not run a load probe
against the production Worker without an explicitly approved test window and
sandbox data.

For a network-free regression check against the actual Worker routes and
command implementation, run `npm run benchmark:local-api`. It creates an
isolated BUSINESS workspace, 20 synthetic preparer profiles and 100 persisted
clients, then runs ten waves of concurrent context reads, paginated client
list reads and client-create commands. The harness uses in-process
`Worker.fetch`, the SQLite D1 test adapter and an in-memory R2 stub; it cannot
reach a deployed Worker. A passing local result does not prove the Cloudflare
latency target. Repeat the same documented workload against approved sandbox
Cloudflare resources before closing the deployed p95 criterion.

`GET /api/health/support-bundle` downloads a redacted operational JSON bundle.
It contains the application and installed schema versions, readiness status,
allowlisted dependency codes, and at most 20 verification-run summaries. It
does not include workspace IDs, verification output, business records, file
bytes, exception text, or credentials. CI also uploads the same versioned
verification metadata as the `auditsphere-verification-*` artifact; verification
commands remain in CI/staging and are not exposed as an application endpoint.
The CI artifact marks runtime readiness as `not_checked`; a green test job does
not imply that a deployed runtime was inspected.
The D1 `verification_runs` table can retain workspace-scoped run metadata and
an optional same-workspace result-file reference; completed rows are immutable.
Trusted CI metadata can be recorded in a separately deployed verification
sandbox. The `record-sandbox-verification` job requires the repository variable
`AUDITSPHERE_VERIFICATION_INGEST_ENABLED=true`, the GitHub environment
`cloudflare-verification-sandbox`, and its HTTPS Worker origin and ingest-token
secret. The Worker must set `ENVIRONMENT=verification-sandbox`, a secret
`VERIFICATION_INGEST_TOKEN`, and a fixed
`VERIFICATION_INGEST_WORKSPACE_ID`; its D1 and R2 bindings must point to
separately provisioned sandbox resources. The write endpoint accepts only
allowlisted CI metadata and uses the configured workspace, not a caller-chosen
workspace. Do not reuse production D1/R2 or the production Cloudflare API token
for this setup. Until those sandbox resources and GitHub settings are
provisioned, CI only uploads the GitHub verification artifact and the support
bundle reports records already present in D1.

## Backup, restore and file integrity

D1 Time Travel is the database point-in-time recovery mechanism. To inspect the
available bookmark for an incident timestamp:

```powershell
npx.cmd wrangler d1 time-travel info steaudit-prototype-demo --timestamp="2026-10-07T00:00:00Z" --json
```

Restoring a D1 bookmark overwrites the database in place. Treat this as a
disaster-recovery action: first record the incident, selected bookmark and
current state; obtain the required operational approval; coordinate application
write suspension; then run the command for the approved point:

```powershell
npx.cmd wrangler d1 time-travel restore steaudit-prototype-demo --timestamp="<approved RFC3339 timestamp>"
```

Do not use the production database as the restore-verification target.
Cloudflare Time Travel retention depends on the database plan; confirm the
available window before relying on a recovery point.

For an isolated SQL export used for analysis or test recovery:

```powershell
npx.cmd wrangler d1 export steaudit-prototype-demo --remote --output="$env:TEMP\auditsphere-d1-export.sql"
```

Treat that export as confidential client data: store it only in an approved
encrypted location, restrict access and securely dispose of it under the firm's
approved retention policy. Never commit it or attach it to routine CI logs.

The application-level recovery acceptance test is local and isolated:

```powershell
npx.cmd tsx --test tests/e2e/businessBackupRestore.test.ts
```

It verifies isolated D1 records/totals, foreign keys, the committed-file
manifest and exact object bytes/digests; a missing or corrupt object fails the
restore. This test does not claim to restore the configured Cloudflare D1/R2
resources. Any Cloudflare restore rehearsal must target separately provisioned
sandbox resources and verify every manifest file digest before traffic is
allowed.

R2 bucket-lock rules are account-level configuration, not runtime settings.
The organization must supply the approved retention duration, covered object
prefixes, legal basis and operations-only credential before those rules can be
configured. Do not lock a broad prefix without checking upload staging and
cleanup behavior. Review the configured rules in the Cloudflare dashboard or
with `wrangler r2 bucket lock list`; application status is not proof that an
R2 bucket lock is configured. See [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/),
[D1 export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
and [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/).

## Rollback

The Worker serves both the app and the API, so rollback is per deployment:

1. Redeploy a previous Worker version with `wrangler rollback --config wrangler.jsonc`.
2. The retired snapshot Worker (`steaudit-prototype-demo-api`) still exists remotely but
   receives no browser traffic; decommissioning it is a separately authorized action.
3. Migrations are additive. The current tables can be left in place harmlessly;
   dropping them is a destructive operation that would destroy cloud workspace state.

## Scheduled cleanup

The minute cron removes expired idempotency keys, soft-deletes expired workspaces,
purges abandoned `INITIALIZED`/`UPLOADING`/
`STAGED` file rows and their R2 objects. The legacy snapshot tables are removed
by forward migration 0045 after owner authorization; `demo_seeds` remains with
inserts blocked because `workspaces.seed_id` retains its foreign key.
