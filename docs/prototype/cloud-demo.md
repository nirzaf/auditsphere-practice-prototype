# Cloud workspaces

Current model: **one same-origin Cloudflare Worker** serves the built app and the JSON API under `/api/*`, with D1 for structured workspace state and R2 for exact file bytes. See [cloud-full-stack-architecture.md](cloud-full-stack-architecture.md) for the design.

## Try the demo

Open https://prototype.steaudit.com, select **Presenter / Demo Controls**, then choose **Commercial pipeline** and **Create cloud workspace**. Creating replaces the local projection after its unsaved forms are resolved. A fictional company, contacts and a draft external-audit proposal are loaded. There are no seeded professional approvals, payments or completed audit engagements.

Client/lead changes execute through the shared typed command union and are committed server-authoritatively; the browser then adopts the committed state. Edits outside the currently synced command families stay local to the browser until their commands are migrated (see the migration doc). **Resume with workspace access code** enrolls another browser: the running session uses a same-origin HttpOnly cookie — the code itself is only needed to enroll, and it is not stored in browser JavaScript storage. **Reload cloud revision** explicitly adopts the current server snapshot; **Keep local / disconnect** stops syncing while preserving local work.

The second starting point, **Clean audit lifecycle**, contains no client or engagement records. Business command guards run in the shared domain layer on both the store and the Worker. Presenter controls stay outside the normal five-module navigation.

## What is persisted

D1 holds versioned seed snapshots (`workspace_seeds`) and isolated workspaces with an optimistic revision counter, SHA-256-hashed session tokens, structured entity rows, two-phase-commit file objects referencing R2 keys, an append-only audit event log and idempotency records. A stale revision is rejected with HTTP 409; the browser never overwrites server state with a whole snapshot. Expired workspaces are inaccessible; a daily Worker cron removes expired rows and abandoned staged uploads.

Persona switching, payment, dispatch, signatures and provisioning remain simulations. Cloud file uploads store exact bytes in R2 with server-computed SHA-256 verification, so uploaded and generated files follow the workspace across browsers within the retention window. The interface states these boundaries before starting.

## Cloudflare resources

- Worker: `auditsphere-visual-prototype` (app + `/api/*` in one deployment)
- Config: root `wrangler.jsonc`; Worker source: `worker/`
- D1: `steaudit-prototype-demo`, ID `3562b9c7-742b-4a64-b250-64e1987f9b4b`
- R2: `auditsphere-prototype-files`
- Schema: `worker/migrations/0001_demo_workspaces.sql` … `0004_workspace_seeds.sql`
- Synthetic seed generator: `npm run cloud:seed` → `tools/seed-cloud-workspace.ts`; seed SQL uses idempotent upserts and never resets existing workspaces.

## Reproduce

```powershell
npm run cloud:seed
npm run cloud:migrate      # apply worker/migrations to remote D1
npx wrangler d1 execute steaudit-prototype-demo --remote --config wrangler.jsonc --file worker/seed.sql
npm run cloud:typecheck
npm run cloud:deploy       # build + wrangler deploy (root config)
$env:CLOUD_API_URL='<deployed worker url>'
npm run test:cloud         # API integration suite (skips when CLOUD_API_URL unset)
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:e2e
```

The browser needs no API URL configuration: the client (`src/services/cloudWorkspace.ts`) always calls same-origin `/api/*` with `credentials: 'same-origin'`. Changes to Cloudflare bindings require regenerating `worker/worker-configuration.d.ts` with Wrangler.

## Historical note

The earlier demo snapshot Worker (`steaudit-prototype-demo-api`, whole-state autosave via a browser-held Bearer token and a configurable API URL) was retired in the cloud cutover; its source, config and browser client were removed from the tree. Git history and the [full-stack migration record](cloud-full-stack-migration.md) preserve the details of that phase. The remote legacy Worker was not deleted; decommissioning it is a separately authorized destructive action.
