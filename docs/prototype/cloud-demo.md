# Cloud demo workspaces

Implemented on 2026-09-30, beginning from checkout `0f6c524503fdd150f0be9a8e063e27af1b1a91e2`. The checkout advanced independently to `b25e89c474e6d8257612f4099fd2fe055a018162` during execution; the final deployment evidence records that HEAD plus the uncommitted cloud implementation. Existing concurrent changes were preserved. This implements the user's request for useful seeded D1/Workers interactivity; the attached review is context, not evidence that its remaining sign-off findings have been resolved.

## Try the demo

Open https://prototype.steaudit.com, select **Presenter / Demo Controls**, then choose **Commercial pipeline** and **Start new cloud demo**. Starting replaces the local demo after its unsaved forms are resolved. A fictional company, contacts and a draft external-audit proposal are loaded. There are no seeded professional approvals, payments or completed audit engagements.

Saved record changes autosave to an isolated D1 workspace. **Copy access code** lets you resume the same record state in another browser. Keep the code private: anyone holding it can read and edit that synthetic workspace. Use **Save / retry** after a failed network request, **Reload cloud revision** to explicitly accept a newer cloud snapshot, or **Keep local / disconnect** to continue locally.

The second starting point, **Clean audit lifecycle**, contains no client or engagement records. Existing business command guards still run in the browser. Presenter controls stay outside the normal five-module navigation.

## What is persisted

D1 holds two versioned seed snapshots and isolated workspace snapshots with an optimistic revision counter, a SHA-256 hash of the access token, creation/update timestamps, and seven-day expiry. An atomic conditional UPDATE rejects stale saves with HTTP 409. Local edits survive that conflict and are not automatically replaced. Origins are restricted, request bodies are bounded to 750 KB, responses are not cached, and all variable SQL values use prepared bindings.

Workspace creation is limited to 10 per originating-IP hash per hour, with a maximum of 500 active workspaces. A D1 trigger keeps creation counts even when a workspace is deleted. Expired workspaces cannot be accessed; a daily Worker cron removes expired snapshots and old quota rows. No raw visitor IP or plaintext access token is stored in D1.

This is a snapshot persistence API for a synthetic demo. It does **not** enforce professional role authorization or audit transitions on the server. Persona switching, payment, dispatch, signatures and provisioning remain simulations. Uploaded/generated files remain in browser IndexedDB and are not transferred by the access code. Consequently, cloud resume restores records and progress, not the file bytes from another browser. The interface states these boundaries before starting.

## Cloudflare resources

- Worker: `steaudit-prototype-demo-api`
- API: https://steaudit-prototype-demo-api.quadrate-lk.workers.dev
- D1: `steaudit-prototype-demo`, ID `3562b9c7-742b-4a64-b250-64e1987f9b4b`
- Binding/config: `worker/wrangler.jsonc`
- Schema: `worker/migrations/0001_demo_workspaces.sql` and `0002_creation_limits.sql`
- Synthetic seed generator: `tools/seed-cloud-demo.ts`; seed SQL uses idempotent upserts and never resets existing workspaces.
- Frontend configuration: `.env.production`; only the public API address is included, with an explicit CSP connect-src entry in `index.html`.

## Reproduce

```powershell
npm run demo:seed
npx wrangler d1 migrations apply steaudit-prototype-demo --remote --config worker/wrangler.jsonc
npx wrangler d1 execute steaudit-prototype-demo --remote --config worker/wrangler.jsonc --file worker/seed.sql
npm run demo:typecheck
npx wrangler deploy --config worker/wrangler.jsonc
$env:DEMO_API_URL='https://steaudit-prototype-demo-api.quadrate-lk.workers.dev'
npm run test:cloud
$env:VITE_DEMO_API_URL=$env:DEMO_API_URL
$env:TEST_CLOUD_API_URL=$env:DEMO_API_URL
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:e2e
```

For local development, set `VITE_DEMO_API_URL` from `.env.example` before starting Vite. API origins currently allow localhost:3000 and the browser test origin 127.0.0.1:3007, plus the custom domain and primary Pages domain. Changes to API bindings require regenerating `worker/worker-configuration.d.ts` with Wrangler.

## Executed verification

- 380 unit tests passed.
- Worker and frontend TypeScript validation passed; Vite production build passed.
- Five Chrome tests passed: existing five-flow/PBC journey, scope checks, 72 responsive checks, native templates, and cloud Presenter creation/autosave/resume/conflict preservation.
- Live API test passed: seed catalog, invalid payload rejection, origin rejection, token requirement, cross-workspace isolation, atomic concurrent save conflict, persisted readback and deletion of test workspaces.
- Cloud mobile evidence: `evidence/visual-parity/cloud-demo-390.png`.

These checks do not close the separate review findings about contact routing, final deliverables, archive business rules, template scope or professional audit readiness.

## Live deployment

Published frontend: https://474126da.steaudit-prototype.pages.dev, serving https://prototype.steaudit.com and https://steaudit-prototype.pages.dev. Worker version: `b2237bcc-c551-4caa-ad49-dd8ae4e75813`. All three frontend hosts matched the built HTML and JavaScript entry; live Worker health/CORS passed, the seed catalog contained two entries, and all 33 native templates matched their source bytes. Full resource and verification record: [cloud deployment evidence](evidence/cloud-demo-deployment.json).
