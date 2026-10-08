# Cloudflare CI/CD

The `CI` workflow verifies the app and Worker before the deployment job can
run. When `CLOUDFLARE_DEPLOY_ENABLED=true`, a successful push to `main` deploys
the exact verified commit to the existing Wrangler target: the Worker API,
Vite Static Assets, D1/R2 bindings,
and configured cron trigger. The protected production job applies pending D1
migrations, deploys the Worker, and requires `/api/health/ready` to pass.
The production switch is currently enabled; therefore a push to `main` can
apply migrations and deploy to Cloudflare production. The GitHub production
environment currently has no required reviewer protection rule.

This profile intentionally has no user authentication: persona selection is
self-asserted. The deployment workflow adds no access boundary, so use only
synthetic data unless a trusted access environment is separately provided.

## GitHub setup

The `cloudflare-production` environment is configured with a deployment branch
policy that allows only `main`. It must contain the `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` secrets. Verify that the required production reviewer
protection is in place before enabling or using production deployment.

1. Confirm the existing `cloudflare-production` environment remains restricted
   to the `main` branch and has the team's required production reviewer(s).
2. Confirm the environment secrets `CLOUDFLARE_ACCOUNT_ID` and
   `CLOUDFLARE_API_TOKEN` are present. The account-owned API token needs Workers
   Editor access scoped to the existing Worker and D1 Edit access scoped to
   `steaudit-prototype-demo`, so CI can deploy and apply migrations.
3. Add the team's required production reviewer(s) to the environment.
4. The current `CLOUDFLARE_DEPLOY_ENABLED` value is `true`. Before a main push,
   confirm production reviewers and inspect the full pending migration set.

Do not grant Workers Routes Write unless a later deployment adds or changes a
zone route or custom domain. Do not put the token in source control or print it
in workflow logs.

After activation, verified pushes to `main` wait for the configured environment
reviewer, then apply every pending migration from `worker/migrations`, deploy,
and check the readiness endpoint. Wrangler captures a D1 backup before
applying migrations in CI. Reviewers should inspect the pending migration files
in the verified commit before approving because the first enabled deployment
may apply the full outstanding migration backlog. A maintainer can also run the
workflow manually on `main` and select `confirm_production_deploy`; it still
runs the complete verification job first. Production deployments are serialized.
The restricted email-provider Worker deploy keeps Wrangler strict mode. The main
Worker deploy uses the checked-in `wrangler.jsonc` as the source of truth because
the existing dashboard-created Worker snapshot omits local-only D1 fields
(`database_name`, `migrations_dir`); strict mode treated those additions as a
deployment conflict even though the runtime D1/R2/service bindings match. Do not
make dashboard-only binding changes; add intended configuration to source control
and verify the next CI deployment.

If the enable variable is unset or false, the deploy job is skipped. If it is
enabled before the environment secrets are configured, the deploy job fails
with the missing secret name and does not invoke Wrangler. If migration,
deployment, or readiness fails, the job fails and reports the failing step.

## Verification sandbox ingestion

The workflow can record the redacted CI verification summary in a dedicated
Cloudflare sandbox. This path never invokes Wrangler or a deployment API and is
independent of the production deploy job. Configure a separate Worker, D1
database, R2 bucket and BUSINESS workspace for the sandbox; do not point it at
the production bindings. Set its Worker variables/secrets as described in the
Cloud full-stack runbook, then add the GitHub environment
`cloudflare-verification-sandbox` with:

* Variable `AUDITSPHERE_VERIFICATION_INGEST_URL`, set to the sandbox Worker
  `workers.dev` origin.
* Secret `AUDITSPHERE_VERIFICATION_INGEST_TOKEN`, matching the sandbox Worker
  secret `VERIFICATION_INGEST_TOKEN`.
* Repository variable `AUDITSPHERE_VERIFICATION_INGEST_ENABLED=true` only after
  the sandbox Worker and workspace have been verified.

Main-branch pushes then write only the commit, schema version, CI timestamps,
status and workflow run identity. The job is disabled until the repository
variable is enabled; manual runs additionally require selecting
`record_sandbox_verification`. The endpoint rejects production/local Worker
configurations, non-CI metadata, caller-selected workspaces and conflicting
run-ID replays.
