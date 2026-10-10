# E02-S01 — Staging and production Wrangler environments

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E02-S01 | E02 Environments | Infra | P0 | M | M1 done; SP-04 result; decisions D5 (residency), D6 (domain) | NFR REL-01, CMP-04 |

## Intent
Replace the single prototype-named deployment with isolated `staging` and `production` environments so authentication, real email and real data never share resources with test traffic.

## Read first
- `wrangler.jsonc`, `worker/emailProvider/wrangler.jsonc`, `.github/workflows/ci.yml` (deploy job), `tools/apply-r2-archive-lock-rules.ts` (reads `AUDITSPHERE_R2_BUCKET`)
- `docs/architecture/nfr.md` §3, §4

## Current state (verified)
- One Worker `auditsphere-visual-prototype`, D1 `steaudit-prototype-demo`, R2 `auditsphere-prototype-files`, `workers_dev: true`, minute cron, SharePoint vars inline, email service binding `environment: "production"`.
- CI deploys `main` to production in job "Deploy Worker and Static Assets to Cloudflare" after migrations and R2 lock rules.

## Scope
**In:** `env.staging` and `env.production` blocks in `wrangler.jsonc` (and matching envs in `worker/emailProvider/wrangler.jsonc`); per-env D1/R2/service bindings, vars, routes; CI: staging deploy on every green `main`, production deploy only on `workflow_dispatch` with the existing `confirm_production_deploy` input and GitHub environment approval; `npm run cloud:migrate:staging|production`; R2 lock rules applied per env bucket.
**Out:** creating cloud resources (owner runs `wrangler d1 create` / `r2 bucket create` and pastes IDs — the agent prepares commands); deleting the old prototype resources (decommission after go-live, owner decision).

## Acceptance criteria
1. `wrangler.jsonc` top-level holds only shared settings (`main`, `compatibility_date`, `compatibility_flags`, `assets`, `observability`); `env.staging` and `env.production` each declare their own `name`, `d1_databases` (`database_name`/`database_id` placeholders `REPLACE_WITH_…`), `r2_buckets`, `services` (email provider env), `vars`, `triggers`, and (production) `routes` for the custom domain with `workers_dev: false`.
2. Names: Worker `auditsphere-staging` / `auditsphere`; D1 `auditsphere-staging` / `auditsphere-production`; R2 `auditsphere-staging-files` / `auditsphere-production-files`; email provider `auditsphere-email-provider-staging` / `auditsphere-email-provider`.
3. If SP-04 selects a location/jurisdiction, the creation commands in `docs/ops/environments.md` use it (e.g. `--location` / `--jurisdiction` flags — verify exact flag names against current Wrangler 4.147 docs).
4. A config test (`tests/unit/wranglerConfig.test.ts`) parses `wrangler.jsonc` (strip comments) and asserts: two envs exist; no binding name/resource is shared between them; production `workers_dev === false`; no secret-looking keys in `vars` (`/SECRET|TOKEN|PASSWORD|KEY$/`).
5. CI: `verify` unchanged; new job `deploy-staging` runs on push to `main` after `verify` (migrations → R2 locks with `AUDITSPHERE_R2_BUCKET=auditsphere-staging-files` → email provider → worker → readiness probe); existing production job targets `--env production` and runs only on `workflow_dispatch` with `confirm_production_deploy == true`.
6. `docs/ops/environments.md` lists: resource names, creation commands, required secrets per env (`CLOUDFLARE_*` in GitHub; `SHAREPOINT_CLIENT_SECRET`, OIDC client secret, Turnstile secret in Worker secrets), and the cutover note that the legacy `auditsphere-visual-prototype` Worker is left running until go-live then removed by the owner.
7. `npm run dev` still works locally (top-level/local config unaffected).

## Constraints
- No real IDs or secrets committed; use placeholders and document the owner step.
- Do not change `compatibility_date`.
- Keep the R2 lock-rule verification read-back in both envs.

## Verify with
```bash
npx tsx --test tests/unit/wranglerConfig.test.ts && npm run cloud:typecheck && npm run build
npx wrangler deploy --env staging --dry-run --outdir /tmp/wrangler-dry
npx wrangler deploy --env production --dry-run --outdir /tmp/wrangler-dry-prod
```

## Stop and ask if
- SP-04/D5 is unanswered (location cannot be changed after D1 creation).
- The custom domain (D6) is unknown — leave `routes` commented with a TODO and say so.

## Implementation progress

**Code-side configuration is implemented; the story is not accepted yet.** The
app Wrangler file now defines isolated staging/production Workers, D1/R2
bindings, rate-limit namespaces, Email Provider service bindings, vars, and
cron triggers, plus a local-only dev environment with local D1/R2 and no Email
Provider binding. D1 IDs remain placeholders, both app Workers have
`workers_dev: false`, and the production route is a D6 TODO. CI keeps `verify`
unchanged, gates staging deploys on completed setup, and restricts production
to approved `workflow_dispatch`; readiness checks can use a Cloudflare Access
service token. The lock-rule updater selects and validates its environment's
bucket. Local `dev`/`preview` use the local binding shape and local storage.

Cloud resources were not created or changed. D5 is still awaiting the firm's
written residency/transfer decision; D6 still lacks an approved AuditSphere
hostname and trusted perimeter. Deployment also needs owner-created resources,
Worker secrets, GitHub environment variables/secrets (including the separate
R2 lock token), and a protected readiness URL. Do not mark resource provisioning,
staging deployment/readiness, production cutover, or this story fully accepted
until those external gates have evidence.

**Verification — 2026-10-10:** `tests/unit/wranglerConfig.test.ts` passed (2/2);
`npm run cloud:typecheck`, `npm run build`, `git diff --check`, and Wrangler
4.147 dry runs for both `--env staging` and `--env production` passed. The
`npm run dev` build and local binding resolution succeeded, but the local
workerd runtime exited before listening with `CreateDirectory: #5 Access is
denied; path = miniflare-email-store`, including with `--persist-to` pointed at
a temporary directory and execution outside the sandbox. No UI smoke was
possible because port 3000 never opened. Treat the local server acceptance as
unverified pending a machine/runtime that can create Miniflare's email-store
directory; this is not recorded as a product-code pass. No remote deploy or
resource mutation was run.
