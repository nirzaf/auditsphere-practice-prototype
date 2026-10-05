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
npm.cmd run cloud:dev        # wrangler dev against local D1/R2 simulation
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
npx.cmd wrangler types --config wrangler.jsonc worker/v2/cloudflare-env.d.ts
```

If that command fails with `CreateDirectory: Access is denied; path =
miniflare-CacheObject`, the environment blocks miniflare's cache directory. In
that case `worker/v2/cloudflare-env.d.ts` already references the repo's generated
runtime types, and the Worker's binding contract lives in `worker/v2/env.ts`.

## Testing

```powershell
$env:CLOUD_API_URL='https://auditsphere-visual-prototype.quadrate-lk.workers.dev'
npm.cmd run test:cloud:v2
$env:DEMO_API_URL=$env:CLOUD_API_URL
npm.cmd run test:cloud      # legacy v1 snapshot API (unchanged)
```

## Inspecting data

```powershell
.\node_modules\.bin\wrangler.cmd d1 execute steaudit-prototype-demo --remote --config wrangler.jsonc --json --command "SELECT id,name,revision,status FROM workspaces ORDER BY created_at DESC LIMIT 5"
.\node_modules\.bin\wrangler.cmd d1 execute steaudit-prototype-demo --remote --config wrangler.jsonc --json --command "SELECT category,state,count(*) FROM file_objects GROUP BY category,state"
.\node_modules\.bin\wrangler.cmd r2 object list auditsphere-prototype-files
```

## Operational logging

Every API failure logs one structured line:
`{"event":"workspace.api.error","requestId":...,"path":...,"method":...,"code":...,"status":...}`.
Responses carry `X-Request-Id`. Access codes, session secrets and file bytes are
never logged.

## Rollback

The new Worker is fully additive, so rollback is a no-op for the existing product:

1. The Pages deployment (`steaudit-prototype`, `prototype.steaudit.com`) and the
   legacy Worker (`steaudit-prototype-demo-api`) were never modified.
2. To stop using the v2 Worker, simply stop calling it, or redeploy a previous
   version with `wrangler rollback --config wrangler.jsonc`.
3. Migration `0003` is additive. The new tables can be left in place harmlessly;
   dropping them is only necessary if you want the schema fully back to v1, and
   should be done deliberately (it destroys v2 workspace state).

## Scheduled cleanup

Cron `0 2 * * *` removes expired workspace sessions, expired idempotency keys,
soft-deletes expired workspaces, purges abandoned `INITIALIZED`/`UPLOADING`/
`STAGED` file rows and their R2 objects, and preserves the legacy snapshot
retention (`demo_workspaces`, `demo_creation_limits`).
