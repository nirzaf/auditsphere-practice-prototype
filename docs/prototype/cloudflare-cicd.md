# Cloudflare CI/CD

The `CI` workflow verifies the app and Worker before the deployment job can
run. A successful push to `main` deploys the exact verified commit to the
existing Wrangler target: the Worker API, Vite Static Assets, D1/R2 bindings,
and configured cron trigger. The protected production job applies pending D1
migrations, deploys the Worker, and requires `/api/health/ready` to pass.
Production deployment is disabled until the repository variable
`CLOUDFLARE_DEPLOY_ENABLED` is set to `true`.

This profile intentionally has no user authentication: persona selection is
self-asserted. The deployment workflow adds no access boundary, so use only
synthetic data unless a trusted access environment is separately provided.

## GitHub setup

1. Create the GitHub Actions environment `cloudflare-production` and restrict
   it to the `main` branch. Add the team's required production reviewer(s)
   before enabling deployment.
2. Add environment secrets `CLOUDFLARE_ACCOUNT_ID` and
   `CLOUDFLARE_API_TOKEN` to that environment. The account-owned API token needs
   Workers Editor access scoped to the existing Worker and D1 Edit access
   scoped to `steaudit-prototype-demo`, so CI can deploy and apply migrations.
3. Create the repository Actions variable `CLOUDFLARE_DEPLOY_ENABLED` with the
   value `true` after the environment and secrets are ready.

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
runs the complete verification job first. The job uses Wrangler strict mode
and serializes production deployments.

If the enable variable is unset or false, the deploy job is skipped. If it is
enabled before the environment secrets are configured, the deploy job fails
with the missing secret name and does not invoke Wrangler. If migration,
deployment, or readiness fails, the job fails and reports the failing step.
